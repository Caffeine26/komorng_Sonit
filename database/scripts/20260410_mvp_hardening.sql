-- ============================================================================
-- XFOS · Schema Hardening Migration (REWRITTEN 2026-04-26)
-- ============================================================================
-- Date:    2026-04-26 (replaces the original 2026-04-10 migration)
-- Scope:   Everything Prisma DSL can't express — CHECKs, partial indexes,
--          generated columns, helper functions, Postgres extensions.
-- Owner:   Platform team
--
-- WHY THIS WAS REWRITTEN
--   The original 2026-04-10 migration carried a backfill script that added
--   `tenant_id` columns and parity triggers to denormalized child tables.
--   Since 2026-04-25, the entire schema uses composite PKs (tenant_id, id) +
--   composite FKs, which makes cross-tenant linking impossible by construction.
--   ALL parity triggers retired; ALL backfill steps obsolete (Prisma now
--   creates tables with the correct shape on first migration).
--
-- WHAT THIS FILE DOES
--   1. Postgres extensions (citext)
--   2. Helper functions:
--        allocate_order_number(tenant_id) → returns 'LB-042'  (daily-reset)
--        allocate_bill_number(tenant_id)  → returns 'LB-B-000125' (running)
--        cleanup_expired_idempotency_keys()
--   3. Auto-creation trigger: insert into tenant_sequences on tenant insert.
--   4. Generated column: setup_progress.go_live_ready
--   5. CHECK constraints (60+ across the schema)
--   6. Partial indexes (one-active-per-X, cleanup, alert-feed, etc.)
--   7. NULLS NOT DISTINCT unique on user_roles
--
-- WHAT THIS FILE DOES NOT DO
--   · Backfill data — Prisma migrate creates tables with the right shape on day 1.
--   · Drop legacy triggers — there are no production schemas yet; nothing to drop.
--   · Application-code changes (use-cases calling allocate_*_number, etc.)
--
-- APPLY ORDER
--   1. Ensure the base Prisma schema has been migrated first:
--        pnpm --filter @xfos/database exec prisma migrate deploy
--   2. Apply this file:
--        psql "$DATABASE_URL" -f database/scripts/20260410_mvp_hardening.sql
--
-- SAFETY
--   · Entire file runs in ONE transaction (BEGIN ... COMMIT). On any failure,
--     the whole batch rolls back.
--   · Uses IF [NOT] EXISTS and CREATE OR REPLACE where possible — safe to re-run.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. EXTENSIONS + DEPENDENT COLUMN TYPES
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- users.email → CITEXT (case-insensitive). 'alice@x.com' = 'Alice@X.com'.
-- Prevents the "email already registered" duplicate-account class of bugs.
-- The @unique index rebuilds implicitly on type change.
ALTER TABLE users
  ALTER COLUMN email TYPE CITEXT;


-- ============================================================================
-- 2. HELPER FUNCTIONS
-- ============================================================================

-- ---------- allocate_order_number ----------
-- Returns e.g. 'LB-042'. Resets counter at tenant-local midnight.
-- 2026-04-26 refactor: split lock+decide and apply into two statements for
-- inspection clarity. Same atomicity (FOR UPDATE row lock held until COMMIT),
-- same single-trip-to-DB transaction, behavior unchanged.
CREATE OR REPLACE FUNCTION allocate_order_number(p_tenant_id TEXT)
RETURNS TABLE(order_date DATE, order_number TEXT) AS $$
DECLARE
  v_prefix        TEXT;
  v_tz            TEXT;
  v_local_today   DATE;
  v_stored_date   DATE;
  v_stored_next   INTEGER;
  v_allocated     INTEGER;
  v_is_reset_day  BOOLEAN;
BEGIN
  -- Read prefix and timezone (fall back to 'Asia/Phnom_Penh' if settings row not yet populated)
  SELECT t.code_prefix,
         COALESCE(ts.timezone, 'Asia/Phnom_Penh')
    INTO v_prefix, v_tz
    FROM tenants t
    LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id
   WHERE t.id = p_tenant_id;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'tenant_sequences: tenant % not found or missing code_prefix', p_tenant_id;
  END IF;

  -- Compute today in the tenant's timezone
  v_local_today := (NOW() AT TIME ZONE v_tz)::date;

  -- Lock the row and read current state
  SELECT counters_reset_on, next_order_counter
    INTO v_stored_date, v_stored_next
    FROM tenant_sequences
   WHERE tenant_id = p_tenant_id
     FOR UPDATE;

  IF v_stored_date IS NULL THEN
    RAISE EXCEPTION 'tenant_sequences: row missing for tenant %', p_tenant_id;
  END IF;

  -- Decide which number to allocate
  v_is_reset_day := (v_stored_date <> v_local_today);
  v_allocated    := CASE WHEN v_is_reset_day THEN 1 ELSE v_stored_next END;

  -- Apply (lock from SELECT FOR UPDATE still held until COMMIT)
  UPDATE tenant_sequences
     SET next_order_counter  = v_allocated + 1,
         counters_reset_on   = v_local_today,
         updated_at          = NOW()
   WHERE tenant_id = p_tenant_id;

  order_date   := v_local_today;
  order_number := v_prefix || '-' || LPAD(v_allocated::text, 3, '0');
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION allocate_order_number(TEXT) IS
  'Returns (order_date, order_number) atomically with row-lock. Resets counter at tenant-local midnight. See docs/discussions/order-numbering-strategy.md.';


-- ---------- allocate_bill_number ----------
-- Returns e.g. 'LB-B-000125'. Never resets — financial/audit context.
CREATE OR REPLACE FUNCTION allocate_bill_number(p_tenant_id TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_number BIGINT;
BEGIN
  SELECT code_prefix INTO v_prefix FROM tenants WHERE id = p_tenant_id;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'tenant_sequences: tenant % not found or missing code_prefix', p_tenant_id;
  END IF;

  UPDATE tenant_sequences
     SET next_bill_number = next_bill_number + 1,
         updated_at       = NOW()
   WHERE tenant_id = p_tenant_id
  RETURNING next_bill_number - 1 INTO v_number;

  IF v_number IS NULL THEN
    RAISE EXCEPTION 'tenant_sequences: row missing for tenant %', p_tenant_id;
  END IF;

  RETURN v_prefix || '-B-' || LPAD(v_number::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION allocate_bill_number(TEXT) IS
  'Returns running-sequential bill number (never resets). See docs/discussions/order-numbering-strategy.md.';


-- ---------- cleanup_expired_idempotency_keys ----------
-- Called hourly by a BullMQ job. Returns the count of deleted rows.
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM idempotency_keys WHERE expires_at < NOW();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 3. AUTO-CREATION TRIGGER: tenants → tenant_sequences
-- ============================================================================

CREATE OR REPLACE FUNCTION tenants_create_sequences() RETURNS trigger AS $$
BEGIN
  INSERT INTO tenant_sequences (tenant_id) VALUES (NEW.id)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenants_create_sequences_trg ON tenants;
CREATE TRIGGER tenants_create_sequences_trg
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION tenants_create_sequences();


-- ============================================================================
-- 4. GENERATED COLUMN: setup_progress.go_live_ready
-- ============================================================================
-- Cannot drift from inputs; if any milestone resets to NULL, gate flips off.

ALTER TABLE setup_progress
  ADD COLUMN IF NOT EXISTS go_live_ready BOOLEAN
  GENERATED ALWAYS AS (
        profile_completed_at      IS NOT NULL
    AND menu_completed_at         IS NOT NULL
    AND translations_completed_at IS NOT NULL
    AND payments_configured_at    IS NOT NULL
    AND qr_created_at             IS NOT NULL
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_setup_progress_stuck
  ON setup_progress (created_at)
  WHERE go_live_ready = FALSE;


-- ============================================================================
-- 5. CHECK CONSTRAINTS
-- ============================================================================
-- One DO $$ block per table to keep failures localized and re-runs safe.
-- Use ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS via DO blocks (PG 15+ alt).

-- ---------- tenants ----------
ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_code_prefix_format,
  ADD  CONSTRAINT tenants_code_prefix_format
       CHECK (code_prefix ~ '^[A-Z]{2,4}$');

-- ---------- tenant_sequences ----------
ALTER TABLE tenant_sequences
  DROP CONSTRAINT IF EXISTS tenant_sequences_order_counter_positive,
  ADD  CONSTRAINT tenant_sequences_order_counter_positive
       CHECK (next_order_counter >= 1);
ALTER TABLE tenant_sequences
  DROP CONSTRAINT IF EXISTS tenant_sequences_bill_number_positive,
  ADD  CONSTRAINT tenant_sequences_bill_number_positive
       CHECK (next_bill_number >= 1);
ALTER TABLE tenant_sequences
  DROP CONSTRAINT IF EXISTS tenant_sequences_reset_date_sane,
  ADD  CONSTRAINT tenant_sequences_reset_date_sane
       CHECK (counters_reset_on >= DATE '2025-01-01');

-- ---------- users ----------
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_phone_e164,
  ADD  CONSTRAINT users_phone_e164
       CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$');

-- ---------- phone_otp_attempts ----------
ALTER TABLE phone_otp_attempts
  DROP CONSTRAINT IF EXISTS phone_otp_attempts_phone_e164,
  ADD  CONSTRAINT phone_otp_attempts_phone_e164
       CHECK (phone ~ '^\+[1-9][0-9]{6,14}$');

-- ---------- invitations ----------
ALTER TABLE invitations
  DROP CONSTRAINT IF EXISTS invitations_role_tenant_scoped,
  ADD  CONSTRAINT invitations_role_tenant_scoped
       CHECK (role IN ('TENANT_OWNER', 'TENANT_MANAGER', 'SERVICE_STAFF', 'KITCHEN_STAFF'));

-- ---------- menu_items ----------
ALTER TABLE menu_items
  DROP CONSTRAINT IF EXISTS menu_items_base_price_nonneg,
  ADD  CONSTRAINT menu_items_base_price_nonneg
       CHECK (base_price_cents IS NULL OR base_price_cents >= 0);

-- ---------- menu_item_variants ----------
ALTER TABLE menu_item_variants
  DROP CONSTRAINT IF EXISTS menu_item_variants_price_nonneg,
  ADD  CONSTRAINT menu_item_variants_price_nonneg
       CHECK (price_cents >= 0);

-- ---------- menu_item_option_groups ----------
ALTER TABLE menu_item_option_groups
  DROP CONSTRAINT IF EXISTS menu_item_option_groups_min_select_nonneg,
  ADD  CONSTRAINT menu_item_option_groups_min_select_nonneg
       CHECK (min_select >= 0);
ALTER TABLE menu_item_option_groups
  DROP CONSTRAINT IF EXISTS menu_item_option_groups_max_select_positive,
  ADD  CONSTRAINT menu_item_option_groups_max_select_positive
       CHECK (max_select >= 1);
ALTER TABLE menu_item_option_groups
  DROP CONSTRAINT IF EXISTS menu_item_option_groups_min_le_max,
  ADD  CONSTRAINT menu_item_option_groups_min_le_max
       CHECK (max_select >= min_select);

-- ---------- menu_item_options ----------
ALTER TABLE menu_item_options
  DROP CONSTRAINT IF EXISTS menu_item_options_price_delta_nonneg,
  ADD  CONSTRAINT menu_item_options_price_delta_nonneg
       CHECK (price_delta_cents >= 0);

-- ---------- floor_plans ----------
ALTER TABLE floor_plans
  DROP CONSTRAINT IF EXISTS floor_plans_width_range,
  ADD  CONSTRAINT floor_plans_width_range
       CHECK (width  > 0 AND width  <= 10000);
ALTER TABLE floor_plans
  DROP CONSTRAINT IF EXISTS floor_plans_height_range,
  ADD  CONSTRAINT floor_plans_height_range
       CHECK (height > 0 AND height <= 10000);

-- ---------- tables ----------
ALTER TABLE tables
  DROP CONSTRAINT IF EXISTS tables_shape_circle_is_square,
  ADD  CONSTRAINT tables_shape_circle_is_square
       CHECK (shape != 'CIRCLE' OR width = height);
ALTER TABLE tables
  DROP CONSTRAINT IF EXISTS tables_width_range,
  ADD  CONSTRAINT tables_width_range
       CHECK (width    > 0 AND width    <= 10000);
ALTER TABLE tables
  DROP CONSTRAINT IF EXISTS tables_height_range,
  ADD  CONSTRAINT tables_height_range
       CHECK (height   > 0 AND height   <= 10000);
ALTER TABLE tables
  DROP CONSTRAINT IF EXISTS tables_position_x_range,
  ADD  CONSTRAINT tables_position_x_range
       CHECK (position_x >= 0 AND position_x <= 10000);
ALTER TABLE tables
  DROP CONSTRAINT IF EXISTS tables_position_y_range,
  ADD  CONSTRAINT tables_position_y_range
       CHECK (position_y >= 0 AND position_y <= 10000);
ALTER TABLE tables
  DROP CONSTRAINT IF EXISTS tables_rotation_range,
  ADD  CONSTRAINT tables_rotation_range
       CHECK (rotation >= 0 AND rotation < 360);
ALTER TABLE tables
  DROP CONSTRAINT IF EXISTS tables_capacity_positive,
  ADD  CONSTRAINT tables_capacity_positive
       CHECK (capacity IS NULL OR capacity > 0);

-- ---------- qr_contexts ----------
ALTER TABLE qr_contexts
  DROP CONSTRAINT IF EXISTS qr_contexts_table_kind_requires_table_id,
  ADD  CONSTRAINT qr_contexts_table_kind_requires_table_id
       CHECK ((context_type != 'TABLE') OR (table_id IS NOT NULL));
ALTER TABLE qr_contexts
  DROP CONSTRAINT IF EXISTS qr_contexts_storefront_kind_has_no_table_id,
  ADD  CONSTRAINT qr_contexts_storefront_kind_has_no_table_id
       CHECK ((context_type != 'STOREFRONT') OR (table_id IS NULL));
ALTER TABLE qr_contexts
  DROP CONSTRAINT IF EXISTS qr_contexts_expires_after_created,
  ADD  CONSTRAINT qr_contexts_expires_after_created
       CHECK (expires_at IS NULL OR expires_at > created_at);
ALTER TABLE qr_contexts
  DROP CONSTRAINT IF EXISTS qr_contexts_replaces_not_self,
  ADD  CONSTRAINT qr_contexts_replaces_not_self
       CHECK (replaces_id IS NULL OR replaces_id != id);
ALTER TABLE qr_contexts
  DROP CONSTRAINT IF EXISTS qr_contexts_scan_count_nonneg,
  ADD  CONSTRAINT qr_contexts_scan_count_nonneg     CHECK (scan_count  >= 0);
ALTER TABLE qr_contexts
  DROP CONSTRAINT IF EXISTS qr_contexts_print_count_nonneg,
  ADD  CONSTRAINT qr_contexts_print_count_nonneg    CHECK (print_count >= 0);
ALTER TABLE qr_contexts
  DROP CONSTRAINT IF EXISTS qr_contexts_active_no_deactivation,
  ADD  CONSTRAINT qr_contexts_active_no_deactivation
       CHECK ((is_active = FALSE)
              OR (deactivated_at IS NULL AND deactivated_by_id IS NULL AND deactivation_reason IS NULL));
ALTER TABLE qr_contexts
  DROP CONSTRAINT IF EXISTS qr_contexts_inactive_has_reason,
  ADD  CONSTRAINT qr_contexts_inactive_has_reason
       CHECK ((is_active = TRUE)
              OR (deactivated_at IS NOT NULL AND deactivation_reason IS NOT NULL));
ALTER TABLE qr_contexts
  DROP CONSTRAINT IF EXISTS qr_contexts_human_reasons_have_actor,
  ADD  CONSTRAINT qr_contexts_human_reasons_have_actor
       CHECK ((deactivation_reason IS NULL)
              OR (deactivation_reason IN ('EXPIRED_AUTO', 'TENANT_DEACTIVATED'))
              OR (deactivated_by_id IS NOT NULL));

-- ---------- order_sessions ----------
ALTER TABLE order_sessions
  DROP CONSTRAINT IF EXISTS order_sessions_closed_at_matches_status,
  ADD  CONSTRAINT order_sessions_closed_at_matches_status
       CHECK ((closed_at IS NULL) = (status = 'ACTIVE'));
ALTER TABLE order_sessions
  DROP CONSTRAINT IF EXISTS order_sessions_closed_at_after_opened,
  ADD  CONSTRAINT order_sessions_closed_at_after_opened
       CHECK (closed_at IS NULL OR closed_at >= opened_at);
ALTER TABLE order_sessions
  DROP CONSTRAINT IF EXISTS order_sessions_closed_reason_only_when_closed,
  ADD  CONSTRAINT order_sessions_closed_reason_only_when_closed
       CHECK ((status = 'CLOSED') = (closed_reason IS NOT NULL));
ALTER TABLE order_sessions
  DROP CONSTRAINT IF EXISTS order_sessions_party_size_positive,
  ADD  CONSTRAINT order_sessions_party_size_positive
       CHECK (party_size IS NULL OR party_size > 0);
ALTER TABLE order_sessions
  DROP CONSTRAINT IF EXISTS order_sessions_subtotal_nonneg,
  ADD  CONSTRAINT order_sessions_subtotal_nonneg     CHECK (subtotal_cents >= 0);
ALTER TABLE order_sessions
  DROP CONSTRAINT IF EXISTS order_sessions_total_nonneg,
  ADD  CONSTRAINT order_sessions_total_nonneg        CHECK (total_cents    >= 0);
ALTER TABLE order_sessions
  DROP CONSTRAINT IF EXISTS order_sessions_order_count_nonneg,
  ADD  CONSTRAINT order_sessions_order_count_nonneg  CHECK (order_count    >= 0);
ALTER TABLE order_sessions
  DROP CONSTRAINT IF EXISTS order_sessions_last_activity_after_opened,
  ADD  CONSTRAINT order_sessions_last_activity_after_opened
       CHECK (last_activity_at >= opened_at);

-- ---------- carts ----------
ALTER TABLE carts
  DROP CONSTRAINT IF EXISTS carts_abandoned_reason_only_when_abandoned,
  ADD  CONSTRAINT carts_abandoned_reason_only_when_abandoned
       CHECK ((status = 'ABANDONED') OR (abandoned_reason IS NULL));
ALTER TABLE carts
  DROP CONSTRAINT IF EXISTS carts_closed_by_only_for_staff_reset,
  ADD  CONSTRAINT carts_closed_by_only_for_staff_reset
       CHECK ((closed_by_id IS NULL) OR (abandoned_reason = 'STAFF_RESET'));

-- ---------- cart_items ----------
ALTER TABLE cart_items
  DROP CONSTRAINT IF EXISTS cart_items_quantity_positive,
  ADD  CONSTRAINT cart_items_quantity_positive
       CHECK (quantity > 0);
ALTER TABLE cart_items
  DROP CONSTRAINT IF EXISTS cart_items_unit_price_nonneg,
  ADD  CONSTRAINT cart_items_unit_price_nonneg
       CHECK (unit_price_cents >= 0);

-- ---------- orders ----------
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_subtotal_nonneg,
  ADD  CONSTRAINT orders_subtotal_nonneg         CHECK (subtotal_cents       >= 0);
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_discount_nonneg,
  ADD  CONSTRAINT orders_discount_nonneg         CHECK (discount_cents       >= 0);
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_tax_nonneg,
  ADD  CONSTRAINT orders_tax_nonneg              CHECK (tax_cents            >= 0);
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_service_charge_nonneg,
  ADD  CONSTRAINT orders_service_charge_nonneg   CHECK (service_charge_cents >= 0);
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_total_nonneg,
  ADD  CONSTRAINT orders_total_nonneg            CHECK (total_cents          >= 0);
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_discount_le_subtotal,
  ADD  CONSTRAINT orders_discount_le_subtotal    CHECK (discount_cents <= subtotal_cents);
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_total_formula,
  ADD  CONSTRAINT orders_total_formula
       CHECK (total_cents = subtotal_cents - discount_cents + tax_cents + service_charge_cents);
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_cancellation_reason_only_when_cancelled,
  ADD  CONSTRAINT orders_cancellation_reason_only_when_cancelled
       CHECK ((status = 'CANCELLED') OR (cancellation_reason IS NULL));
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_cancelled_by_only_when_cancelled,
  ADD  CONSTRAINT orders_cancelled_by_only_when_cancelled
       CHECK ((cancelled_by_id IS NULL) OR (status = 'CANCELLED'));
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_storefront_has_no_creator,
  ADD  CONSTRAINT orders_storefront_has_no_creator
       CHECK ((source != 'STOREFRONT_QR') OR (created_by_id IS NULL));
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_manual_has_creator,
  ADD  CONSTRAINT orders_manual_has_creator
       CHECK ((source != 'MERCHANT_MANUAL') OR (created_by_id IS NOT NULL));
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_storefront_requires_qr,
  ADD  CONSTRAINT orders_storefront_requires_qr
       CHECK ((source != 'STOREFRONT_QR') OR (qr_context_id IS NOT NULL));
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_lifecycle_monotonic,
  ADD  CONSTRAINT orders_lifecycle_monotonic
       CHECK ((preparing_at IS NULL OR submitted_at IS NOT NULL)
              AND (ready_at  IS NULL OR preparing_at IS NOT NULL)
              AND (completed_at IS NULL OR ready_at  IS NOT NULL));

-- ---------- order_items ----------
ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_quantity_positive,
  ADD  CONSTRAINT order_items_quantity_positive    CHECK (quantity > 0);
ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_unit_price_nonneg,
  ADD  CONSTRAINT order_items_unit_price_nonneg    CHECK (unit_price_cents >= 0);
ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_line_subtotal_nonneg,
  ADD  CONSTRAINT order_items_line_subtotal_nonneg CHECK (line_subtotal_cents >= 0);
ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_line_total_nonneg,
  ADD  CONSTRAINT order_items_line_total_nonneg    CHECK (line_total_cents    >= 0);
ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_line_subtotal_formula,
  ADD  CONSTRAINT order_items_line_subtotal_formula
       CHECK (line_subtotal_cents = unit_price_cents * quantity);
ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_cancellation_reason_only_when_cancelled,
  ADD  CONSTRAINT order_items_cancellation_reason_only_when_cancelled
       CHECK ((is_cancelled = TRUE) OR (cancellation_reason IS NULL));
ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_cancelled_by_only_when_cancelled,
  ADD  CONSTRAINT order_items_cancelled_by_only_when_cancelled
       CHECK ((cancelled_by_id IS NULL) OR (is_cancelled = TRUE));
ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_kitchen_lifecycle_monotonic,
  ADD  CONSTRAINT order_items_kitchen_lifecycle_monotonic
       CHECK ((ready_at IS NULL OR prepared_at IS NOT NULL));

-- ---------- bills ----------
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_subtotal_nonneg,
  ADD  CONSTRAINT bills_subtotal_nonneg          CHECK (subtotal_cents       >= 0);
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_discount_nonneg,
  ADD  CONSTRAINT bills_discount_nonneg          CHECK (discount_cents       >= 0);
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_tax_nonneg,
  ADD  CONSTRAINT bills_tax_nonneg               CHECK (tax_cents            >= 0);
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_service_charge_nonneg,
  ADD  CONSTRAINT bills_service_charge_nonneg    CHECK (service_charge_cents >= 0);
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_tip_nonneg,
  ADD  CONSTRAINT bills_tip_nonneg               CHECK (tip_cents            >= 0);
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_total_nonneg,
  ADD  CONSTRAINT bills_total_nonneg             CHECK (total_cents          >= 0);
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_amount_paid_nonneg,
  ADD  CONSTRAINT bills_amount_paid_nonneg       CHECK (amount_paid_cents    >= 0);
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_discount_le_subtotal,
  ADD  CONSTRAINT bills_discount_le_subtotal     CHECK (discount_cents <= subtotal_cents);
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_total_formula,
  ADD  CONSTRAINT bills_total_formula
       CHECK (total_cents = subtotal_cents - discount_cents + tax_cents + service_charge_cents + tip_cents);
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_amount_paid_le_total,
  ADD  CONSTRAINT bills_amount_paid_le_total
       CHECK (amount_paid_cents <= total_cents);
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_paid_status_matches_amount,
  ADD  CONSTRAINT bills_paid_status_matches_amount
       CHECK ((status != 'PAID') OR (amount_paid_cents = total_cents));
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_voided_only_when_voided,
  ADD  CONSTRAINT bills_voided_only_when_voided
       CHECK ((status = 'VOIDED') OR (voided_at IS NULL AND voided_by_id IS NULL AND void_reason IS NULL));
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_paid_at_when_paid,
  ADD  CONSTRAINT bills_paid_at_when_paid
       CHECK ((status != 'PAID') OR (paid_at IS NOT NULL));

-- ---------- payments ----------
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_amount_positive,
  ADD  CONSTRAINT payments_amount_positive
       CHECK (amount_cents > 0);
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_refund_nonneg,
  ADD  CONSTRAINT payments_refund_nonneg
       CHECK (refunded_amount_cents >= 0);
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_refund_le_amount,
  ADD  CONSTRAINT payments_refund_le_amount
       CHECK (refunded_amount_cents <= amount_cents);
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_refund_status_matches,
  ADD  CONSTRAINT payments_refund_status_matches
       CHECK ((status != 'REFUNDED') OR (refunded_amount_cents > 0 AND refunded_at IS NOT NULL));
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_succeeded_at_when_succeeded,
  ADD  CONSTRAINT payments_succeeded_at_when_succeeded
       CHECK ((status != 'SUCCEEDED') OR (succeeded_at IS NOT NULL));
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_cash_no_provider_required,
  ADD  CONSTRAINT payments_cash_no_provider_required
       CHECK ((method != 'CASH') OR (provider IS NULL OR provider = 'cash'));

-- ---------- kitchen_tickets ----------
ALTER TABLE kitchen_tickets
  DROP CONSTRAINT IF EXISTS kitchen_tickets_priority_range,
  ADD  CONSTRAINT kitchen_tickets_priority_range
       CHECK (priority >= 0 AND priority <= 2);
ALTER TABLE kitchen_tickets
  DROP CONSTRAINT IF EXISTS kitchen_tickets_lifecycle_monotonic,
  ADD  CONSTRAINT kitchen_tickets_lifecycle_monotonic
       CHECK ((ready_at IS NULL OR started_at IS NOT NULL)
              AND (completed_at IS NULL OR ready_at IS NOT NULL));
ALTER TABLE kitchen_tickets
  DROP CONSTRAINT IF EXISTS kitchen_tickets_cancellation_only_when_cancelled,
  ADD  CONSTRAINT kitchen_tickets_cancellation_only_when_cancelled
       CHECK ((status = 'CANCELLED') OR (cancellation_reason IS NULL AND cancelled_at IS NULL AND cancelled_by_id IS NULL));

-- ---------- kitchen_ticket_events ----------
ALTER TABLE kitchen_ticket_events
  DROP CONSTRAINT IF EXISTS kitchen_ticket_events_status_change_has_to_status,
  ADD  CONSTRAINT kitchen_ticket_events_status_change_has_to_status
       CHECK ((event_type != 'STATUS_CHANGE') OR (to_status IS NOT NULL));
ALTER TABLE kitchen_ticket_events
  DROP CONSTRAINT IF EXISTS kitchen_ticket_events_user_actor_has_user_id,
  ADD  CONSTRAINT kitchen_ticket_events_user_actor_has_user_id
       CHECK ((actor_type = 'USER') = (changed_by_id IS NOT NULL));
ALTER TABLE kitchen_ticket_events
  DROP CONSTRAINT IF EXISTS kitchen_ticket_events_system_actors_have_label,
  ADD  CONSTRAINT kitchen_ticket_events_system_actors_have_label
       CHECK ((actor_type = 'USER') OR (actor_label IS NOT NULL));
ALTER TABLE kitchen_ticket_events
  DROP CONSTRAINT IF EXISTS kitchen_ticket_events_no_op_status_change,
  ADD  CONSTRAINT kitchen_ticket_events_no_op_status_change
       CHECK ((event_type != 'STATUS_CHANGE') OR (from_status IS NULL OR from_status != to_status));

-- ---------- order_status_history ----------
ALTER TABLE order_status_history
  DROP CONSTRAINT IF EXISTS order_status_history_user_actor_has_user_id,
  ADD  CONSTRAINT order_status_history_user_actor_has_user_id
       CHECK ((actor_type = 'USER') = (changed_by_id IS NOT NULL));
ALTER TABLE order_status_history
  DROP CONSTRAINT IF EXISTS order_status_history_system_actors_have_label,
  ADD  CONSTRAINT order_status_history_system_actors_have_label
       CHECK ((actor_type = 'USER') OR (actor_label IS NOT NULL));
ALTER TABLE order_status_history
  DROP CONSTRAINT IF EXISTS order_status_history_no_op_transition,
  ADD  CONSTRAINT order_status_history_no_op_transition
       CHECK (from_status IS NULL OR from_status != to_status);

-- ---------- idempotency_keys ----------
ALTER TABLE idempotency_keys
  DROP CONSTRAINT IF EXISTS idempotency_keys_user_actor_has_user_id,
  ADD  CONSTRAINT idempotency_keys_user_actor_has_user_id
       CHECK ((actor_type = 'USER') = (user_id IS NOT NULL));
ALTER TABLE idempotency_keys
  DROP CONSTRAINT IF EXISTS idempotency_keys_system_actors_have_label,
  ADD  CONSTRAINT idempotency_keys_system_actors_have_label
       CHECK ((actor_type = 'USER') OR (actor_label IS NOT NULL));
ALTER TABLE idempotency_keys
  DROP CONSTRAINT IF EXISTS idempotency_keys_expires_after_created,
  ADD  CONSTRAINT idempotency_keys_expires_after_created
       CHECK (expires_at > created_at);
ALTER TABLE idempotency_keys
  DROP CONSTRAINT IF EXISTS idempotency_keys_response_code_valid,
  ADD  CONSTRAINT idempotency_keys_response_code_valid
       CHECK (response_code BETWEEN 100 AND 599);

-- ---------- audit_logs ----------
ALTER TABLE audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_user_actor_has_user_id,
  ADD  CONSTRAINT audit_logs_user_actor_has_user_id
       CHECK ((actor_type = 'USER') = (user_id IS NOT NULL));
ALTER TABLE audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_system_actors_have_label,
  ADD  CONSTRAINT audit_logs_system_actors_have_label
       CHECK ((actor_type = 'USER') OR (actor_label IS NOT NULL));
ALTER TABLE audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_entity_id_requires_type,
  ADD  CONSTRAINT audit_logs_entity_id_requires_type
       CHECK (entity_id IS NULL OR entity_type IS NOT NULL);


-- ============================================================================
-- 6. PARTIAL INDEXES (Prisma DSL doesn't express WHERE clauses)
-- ============================================================================

-- ---------- subscriptions ----------
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_active_per_tenant
  ON subscriptions (tenant_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS subscriptions_past_due_idx
  ON subscriptions (current_period_end) WHERE status = 'PAST_DUE';

-- ---------- plans ----------
CREATE INDEX IF NOT EXISTS idx_plans_public
  ON plans (display_order)
  WHERE is_public = TRUE AND is_active = TRUE;

-- ---------- phone_otp_attempts ----------
CREATE INDEX IF NOT EXISTS phone_otp_attempts_phone_active_idx
  ON phone_otp_attempts (phone, created_at DESC)
  WHERE used_at IS NULL AND expires_at > CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS phone_otp_attempts_expires_idx
  ON phone_otp_attempts (expires_at)
  WHERE used_at IS NULL;

-- ---------- menu_categories ----------
CREATE INDEX IF NOT EXISTS menu_categories_active_sort_idx
  ON menu_categories (tenant_id, sort_order) WHERE is_active = TRUE;

-- ---------- menu_items ----------
CREATE INDEX IF NOT EXISTS menu_items_visible_sort_idx
  ON menu_items (tenant_id, sort_order)
  WHERE deleted_at IS NULL AND is_visible = TRUE;

-- ---------- menu_item_images ----------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_menu_item_primary_image
  ON menu_item_images (tenant_id, menu_item_id) WHERE is_primary = TRUE;

-- ---------- menu_item_variants ----------
CREATE INDEX IF NOT EXISTS idx_variants_item_active
  ON menu_item_variants (tenant_id, menu_item_id, sort_order) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_default_variant_per_item
  ON menu_item_variants (tenant_id, menu_item_id) WHERE is_default = TRUE AND deleted_at IS NULL;

-- ---------- floor_plans ----------
CREATE UNIQUE INDEX IF NOT EXISTS floor_plans_active_name_unique
  ON floor_plans (tenant_id, name) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS floor_plans_active_sort_idx
  ON floor_plans (tenant_id, sort_order) WHERE is_active = TRUE;

-- ---------- tables ----------
CREATE UNIQUE INDEX IF NOT EXISTS tables_active_label_unique
  ON tables (tenant_id, label) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS tables_active_floor_idx
  ON tables (tenant_id, floor_plan_id)  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS tables_active_status_idx
  ON tables (tenant_id, current_status) WHERE is_active = TRUE;

-- ---------- qr_contexts ----------
CREATE INDEX IF NOT EXISTS qr_contexts_active_idx
  ON qr_contexts (tenant_id) WHERE is_active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS qr_contexts_one_active_per_table
  ON qr_contexts (tenant_id, table_id) WHERE is_active = TRUE AND table_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS qr_contexts_stale_cleanup_idx
  ON qr_contexts (tenant_id, last_scanned_at) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS qr_contexts_chain_idx
  ON qr_contexts (tenant_id, replaces_id) WHERE replaces_id IS NOT NULL;

-- ---------- order_sessions ----------
CREATE UNIQUE INDEX IF NOT EXISTS order_sessions_one_active_per_table
  ON order_sessions (tenant_id, table_id) WHERE status = 'ACTIVE' AND table_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_sessions_cleanup_idx
  ON order_sessions (tenant_id, last_activity_at) WHERE status = 'ACTIVE';

-- ---------- carts ----------
CREATE UNIQUE INDEX IF NOT EXISTS carts_one_active_per_session
  ON carts (tenant_id, session_id) WHERE status = 'ACTIVE';

-- ---------- order_items ----------
CREATE INDEX IF NOT EXISTS order_items_kitchen_status_idx
  ON order_items (tenant_id, kitchen_status) WHERE kitchen_status IS NOT NULL;

-- ---------- orders ----------
-- (composite UNIQUE (tenant_id, order_date, order_number) is in schema.prisma)

-- ---------- order_status_history ----------
CREATE INDEX IF NOT EXISTS order_status_history_request_id_idx
  ON order_status_history (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_status_history_cancellation_idx
  ON order_status_history (tenant_id, created_at DESC) WHERE to_status = 'CANCELLED';

-- ---------- kitchen_tickets ----------
CREATE INDEX IF NOT EXISTS kitchen_tickets_queue_idx
  ON kitchen_tickets (tenant_id, priority DESC, created_at)
  WHERE status IN ('NEW', 'PREPARING');

-- ---------- kitchen_ticket_events ----------
CREATE INDEX IF NOT EXISTS kitchen_ticket_events_request_id_idx
  ON kitchen_ticket_events (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS kitchen_ticket_events_cancellation_idx
  ON kitchen_ticket_events (tenant_id, created_at DESC) WHERE to_status = 'CANCELLED';

-- ---------- payments ----------
CREATE INDEX IF NOT EXISTS payments_reference_idx
  ON payments (reference) WHERE reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_gateway_event_unique
  ON payments (tenant_id, gateway_event_id) WHERE gateway_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_expires_idx
  ON payments (expires_at) WHERE status IN ('INITIATED', 'PENDING');

-- ---------- idempotency_keys ----------
CREATE INDEX IF NOT EXISTS idempotency_keys_request_id_idx
  ON idempotency_keys (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idempotency_keys_user_id_idx
  ON idempotency_keys (user_id) WHERE user_id IS NOT NULL;

-- ---------- audit_logs ----------
CREATE INDEX IF NOT EXISTS audit_logs_user_id_created_at_idx
  ON audit_logs (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_logs_severity_alert_idx
  ON audit_logs (severity, created_at DESC) WHERE severity IN ('WARNING', 'ALERT');
CREATE INDEX IF NOT EXISTS audit_logs_request_id_idx
  ON audit_logs (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_logs_retention_idx
  ON audit_logs (retention_until) WHERE retention_until IS NOT NULL;

-- ---------- tenant_health ----------
CREATE INDEX IF NOT EXISTS idx_tenant_health_unhealthy
  ON tenant_health (tenant_id)
  WHERE translations_healthy = FALSE
     OR payments_healthy     = FALSE
     OR menu_has_visible_items = FALSE;


-- ============================================================================
-- 7. NULLS NOT DISTINCT — user_roles uniqueness across (user_id, tenant_id, role)
-- ============================================================================
-- PG 15+ feature. Without this, two PLATFORM_ADMIN rows for the same user
-- (both with tenant_id = NULL) would be permitted by the default UNIQUE.

ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_tenant_role_unique;
ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_user_tenant_role_unique
  UNIQUE NULLS NOT DISTINCT (user_id, tenant_id, role);


COMMIT;

-- ============================================================================
-- DONE
-- ============================================================================
-- After running this file:
--   pnpm --filter @xfos/database exec prisma generate
-- The Prisma client doesn't need re-generation for CHECKs/partial indexes/
-- helpers (they're DB-only), but generated columns and the NULLS NOT DISTINCT
-- unique should be visible to Prisma's query planner. If anything looks off,
-- run `prisma db pull` to reconcile and inspect the diff.
-- ============================================================================
