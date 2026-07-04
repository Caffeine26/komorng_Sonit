# XFOS — Key Decisions Reference (Junior Engineer Onboarding Guide)

> **Purpose:** A single reference covering every significant design decision in
> XFOS — what we chose, why, and how it works. Use this to ramp up new
> engineers without making them read 60+ design docs first.
>
> **How to read this:** scan the table of contents, jump to topics relevant
> to what you're building. Each entry follows the same shape:
>
> - **Scenario / Requirement** — the real-world problem
> - **Technical decision** — the choice we made
> - **Description** — the why and how, plus links to deeper docs
>
> **Last updated:** 2026-04-26 (after Prisma schema sync and migration script cleanup)

---

## Table of contents

- [Part 1 — Product & Architecture](#part-1--product--architecture) (12 decisions)
- [Part 2 — Schema-wide conventions](#part-2--schema-wide-conventions) (15 decisions)
- [Part 3 — Tables (by domain)](#part-3--tables-by-domain) (38 tables)
- [Part 4 — Enums](#part-4--enums) (27 enums)
- [Part 5 — Authentication & Authorization](#part-5--authentication--authorization) (8 decisions)
- [Part 6 — Folder structure & monorepo](#part-6--folder-structure--monorepo) (6 decisions)
- [Part 7 — Tech stack](#part-7--tech-stack) (12 choices)
- [Part 8 — Operational](#part-8--operational) (5 decisions)

---

# Part 1 — Product & Architecture

### 1.1 Multi-tenant SaaS for Cambodian food businesses

- **Scenario/Requirement:** Build one platform that serves many restaurants, food stalls, and dine-in venues across Cambodia. Tenants must never see each other's data.
- **Technical decision:** Shared database, every tenant-scoped row carries `tenant_id`, application-layer enforcement via `TenantGuard` reading from JWT.
- **Description:** Separate-DB-per-tenant was rejected — too operationally heavy at MVP. Postgres RLS was rejected — adds session-context dependency that's awkward for SaaS. The chosen pattern is industry-standard for B2B SaaS at MVP scale; a tenant demanding physical isolation can be migrated later.

### 1.2 Hexagonal architecture with DDD bounded contexts

- **Scenario/Requirement:** Keep business logic isolated from frameworks so the codebase stays maintainable as it grows. Allow future microservices split without rewriting domain rules.
- **Technical decision:** Hexagonal (Ports & Adapters) layout per backend module. Eight bounded contexts: Auth, Tenant, Catalog, Order, Billing, Kitchen, Onboarding, Admin.
- **Description:** Dependency arrow points **inward**: `api → application → core ← infra`. The `core/` layer is pure TypeScript (only Zod allowed). Forbidden in `core/`: Prisma, NestJS, BullMQ, Socket.io, React. This means business rules can be unit-tested without spinning up infrastructure. Each bounded context maps to one NestJS module under `xfos/services/api/src/modules/`.

### 1.3 BFF-per-frontend pattern (ADR-008 — the linchpin)

- **Scenario/Requirement:** XFOS has 4 frontends (storefront, kitchen, merchant portal, platform portal). Each needs different data shapes, but they all share the same domain.
- **Technical decision:** One NestJS process exposes 4 separate URL prefixes — `/api/v1/storefront/*`, `/api/v1/kitchen/*`, `/api/v1/admin/*`, `/api/v1/platform-admin/*`. Each is a Backend-For-Frontend (BFF) module. Internal domain APIs are not exposed to browsers.
- **Description:** The BFF translates between frontend-shaped DTOs and domain entities. UI iteration doesn't break domain contracts and vice versa. Three walls enforce this: (1) BFF prefix routing, (2) `InternalOnlyGuard` on domain endpoints, (3) frontend ESLint Rule 4 (frontends import only their own BFF client). Why not 4 separate microservices? Latency, infra cost, and duplicated business logic — the BFF lives as a NestJS module in the same process.

### 1.4 Modular monolith, not microservices (yet)

- **Scenario/Requirement:** Ship MVP fast without future-shape lock-in.
- **Technical decision:** One NestJS process for the entire backend. Modules are bounded contexts. Microservices split is deferred to Phase 3.
- **Description:** Hexagonal architecture makes the future split mechanical — when a domain grows enough to need its own service, copy the module out, re-wire dependencies via gRPC/HTTP, done. Premature microservices add operational complexity without product benefit at MVP scale.

### 1.5 Three UI tiers, strictly isolated

- **Scenario/Requirement:** Storefront and Kitchen are customer/staff-facing — fast, simple, friendly. Merchant Portal is a desktop admin tool — table-heavy, dense. Platform Portal is internal ops — even denser.
- **Technical decision:** Three separate UI packages: `@platform/ui-customer` (storefront, kitchen), `@platform/ui-admin` (merchant portal), and `internal/platform-admin` (no shared UI; uses shadcn/ui directly).
- **Description:** Cross-tier imports forbidden by ESLint. `@platform/ui-customer` cannot import from `@platform/ui-admin`; `platform-admin` imports from neither. Without this, customer-facing components would gradually leak admin patterns (info-dense tables in a kiosk UI is a UX disaster).

### 1.6 Real-time via Socket.io with `tenant_{id}` rooms

- **Scenario/Requirement:** Kitchen tablets must see new tickets within 2 seconds of order submission. Customer status pages must reflect kitchen progress without polling delays.
- **Technical decision:** Socket.io NestJS gateway. Every emit goes to room `tenant_{tenant_id}`. Room name itself prevents cross-tenant event bleed.
- **Description:** Filtering events by tenant in application code is bug-prone — a missed filter leaks. Naming the room after the tenant means the framework itself enforces isolation. Why not Supabase Realtime / SSE? Less mature for fan-in/fan-out, harder to debug, harder to scale horizontally.

### 1.7 BullMQ for non-fire-and-forget jobs

- **Scenario/Requirement:** A payment confirmation handler crashing mid-execution must NOT lose the confirmation. A Telegram notification dropped because the API restarted is a customer-trust failure.
- **Technical decision:** BullMQ (Redis-backed) for: payment processing, kitchen ticket creation, Telegram/email notifications, scheduled cleanup jobs.
- **Description:** Jobs survive API restarts, retry on failure, and have a single observability surface. Fire-and-forget is allowed only for truly idempotent operations (cache writes, etc.). Why BullMQ over pg_cron? BullMQ is already in the stack for the queueing use cases; centralizing all background work in one tool means one monitoring dashboard.

### 1.8 Khmer-first internationalization

- **Scenario/Requirement:** XFOS serves Cambodia. Customers expect to see menus in Khmer; English is fallback for tourists and English-speaking staff.
- **Technical decision:** `next-intl` for i18n. Two locales: `km` (Khmer, default) + `en` (English, fallback). Khmer required on every customer-facing string; English optional.
- **Description:** Schema reflects this: `menu_items.name_km TEXT NOT NULL` + `name_en TEXT` (nullable). Storefront default locale comes from `tenant_settings.default_locale = 'km'`. Khmer typography on real Android is a known pre-launch blocker that needs validation before MVP launch. No third-language migration path planned for MVP — adding Burmese, Vietnamese, etc. is a major product decision.

### 1.9 Tenant isolation: composite-PK FK construction

- **Scenario/Requirement:** Cross-tenant data bleed is the worst possible bug class. Even one query that forgets `WHERE tenant_id = ?` is a security incident.
- **Technical decision:** Every tenant-scoped table uses `PRIMARY KEY (tenant_id, id)`. Every cross-tenant FK is composite: `FOREIGN KEY (tenant_id, parent_id) REFERENCES parent(tenant_id, id)`.
- **Description:** Cross-tenant linking becomes **impossible by FK construction** — Postgres rejects the insert because no row exists under that composite key. **Zero parity triggers anywhere in the schema.** The application still enforces `WHERE tenant_id = ?` via Prisma middleware, but the database is the last line of defense. See [`enums-tables-design/tables/HOW_TABLES_ARE_CREATED.md`](./enums-tables-design/tables/HOW_TABLES_ARE_CREATED.md).

### 1.10 The four invariants (PRD §6.3)

- **Scenario/Requirement:** Even with hexagonal architecture, drift happens over time. We need clear rules that ESLint and code review can enforce.
- **Technical decision:** Four architectural invariants, all enforceable.
- **Description:**
  1. **Hexagonal flow:** Dependency arrow points inward. `api → application → core ← infra`. `core` never imports a framework.
  2. **`core/` is sacred.** Pure TypeScript. Allowed: Zod (for validation). Forbidden: Prisma, NestJS, BullMQ, Socket.io, React.
  3. **`backend/shared/` is infrastructure-only.** ~15 files max. Forbidden: anything mentioning a domain noun (`order`, `bill`, `menu`, `kitchen`, `payment`, `customer`).
  4. **Handlers translate, use cases decide.** Event handlers receive events and call use cases. Zero business logic in handlers, zero `if` statements.

### 1.11 Prisma is the single source of truth for the DB

- **Scenario/Requirement:** Schema drift between code, migrations, and reality is a chronic SaaS problem.
- **Technical decision:** `xfos/database/prisma/schema.prisma` is canonical for table structure. `prisma migrate dev/deploy` produces the migration SQL. The hardening migration (`scripts/20260410_mvp_hardening.sql`) adds CHECK constraints, partial indexes, generated columns, and helper functions Prisma DSL doesn't express.
- **Description:** No hand-written ALTER TABLE statements. No RLS policies (rejected in ADR-002). No direct `psql` schema edits in any environment beyond local debugging. Cross-reference: `enums-tables-design/tables/postgresql-schema.md` is the human-readable mirror; the per-table docs in `enums-tables-design/tables/` carry the design rationale.

### 1.12 Definition of Done = the seven E2E flows

- **Scenario/Requirement:** "Done" needs an objective definition. "Tests pass" isn't enough — the wrong tests can pass.
- **Technical decision:** Seven Playwright E2E scenarios that all must pass before any release.
- **Description:** (1) Kiosk order: submit → kitchen → complete. (2) Dine-in multi-round: multiple orders → one bill → paid. (3) Kitchen ticket lifecycle: NEW → PREPARING → READY → COMPLETED. (4) Merchant onboarding: setup checklist → go-live. (5) Khmer i18n on every screen. (6) Order status page polling, 15–20s. (7) Same-visit order banner via localStorage. **Never mock the database** — E2E tests run against a real test Postgres.

---

# Part 2 — Schema-wide conventions

These conventions apply to every relevant table. If you see code that violates one, treat it as a bug.

### 2.1 Composite PK for tenant-scoped tables

- **Scenario/Requirement:** Make cross-tenant FK linking impossible at the database level.
- **Technical decision:** Every tenant-scoped table uses `PRIMARY KEY (tenant_id, id)`. Cross-tenant FKs use `FOREIGN KEY (tenant_id, x_id) REFERENCES x(tenant_id, id)`.
- **Description:** Postgres rejects any insert that tries to link a child row in tenant A to a parent in tenant B because no row exists under that composite key. Eliminates the entire class of "I forgot to filter by tenant" bugs at the FK boundary. Eight tables intentionally keep single-column `id` PKs because they're not tenant-scoped: `tenants`, `users`, `user_auth_providers`, `refresh_tokens`, `phone_otp_attempts`, `plans`, `plan_features`, `subscriptions`. Two more (`user_roles`, `audit_logs`) are junctions with NULLABLE `tenant_id`. `tenant_sequences` uses `tenant_id` AS the PK (one row per tenant).

### 2.2 Money is INTEGER cents, never floats

- **Scenario/Requirement:** Floating-point arithmetic loses pennies. Tax-audit-grade accuracy is required.
- **Technical decision:** Every monetary column is `INTEGER` (or `BIGINT` for running counters). Naming convention: `*_cents` suffix.
- **Description:** $6.50 stored as `650`. CHECK constraints enforce non-negativity. Total formulas are CHECK-enforced: `bills.total_cents = subtotal - discount + tax + service + tip`. Same for orders, order_items. If application code has a rounding bug, the INSERT fails rather than silently storing wrong data.

### 2.3 Optimistic concurrency with `version`

- **Scenario/Requirement:** Multiple actors can race the same row — payment webhook + manual confirmation, two cashiers editing the same bill, multiple kitchen tablets marking the same ticket ready. Last-write-wins corrupts state.
- **Technical decision:** `version INTEGER NOT NULL DEFAULT 1` on every user-writable mutable row. UPDATE includes `WHERE version = $expected`; mismatch → 0 rows updated → application returns 409.
- **Description:** Tables with version: `orders`, `bills`, `payments`, `carts`, `kitchen_tickets`, `qr_contexts`, `order_sessions`, `tables`. Pessimistic locking (FOR UPDATE) is used only on `tenant_sequences` because the helper functions are short-lived and serialize cleanly.

### 2.4 Lifecycle status enums + sibling reason enums

- **Scenario/Requirement:** When a row hits a terminal state (CANCELLED, ABANDONED, etc.), the *why* matters for analytics and support. But baking reasons into the lifecycle enum bloats every consumer.
- **Technical decision:** Lifecycle enums stay minimal. The *why* lives in a sibling enum + nullable column, gated by CHECK.
- **Description:** Examples:
  - `OrderStatus = SUBMITTED | PREPARING | READY | COMPLETED | CANCELLED` paired with `OrderCancellationReason` (`CUSTOMER_REQUEST`, `OUT_OF_STOCK`, `KITCHEN_OVERLOADED`, etc.)
  - `CartStatus = ACTIVE | CONVERTED | ABANDONED` paired with `CartAbandonedReason`
  - `OrderSessionStatus = ACTIVE | CLOSED` paired with `OrderSessionCloseReason`
  - `is_active BOOLEAN` on `qr_contexts` paired with `QrDeactivationReason`
  CHECK enforces "reason set iff terminal status." Adding new reasons later is a pure additive enum change. **System-actor exception:** for system-driven values like `EXPIRED_AUTO`, the corresponding `*_by_id` FK is allowed to be NULL.

### 2.5 Snapshot + live FK pair (durability for downstream rows)

- **Scenario/Requirement:** A receipt printed yesterday must still say "Table 5" even if the table was renamed "VIP Booth" today. An order confirmation must show "Beef Lok Lak — $6.00" even if the merchant later renamed it "Lok Lak Special" or raised the price.
- **Technical decision:** Pair a **live FK** (e.g. `orders.table_id`) with a **snapshot column** (e.g. `orders.table_ref TEXT`).
- **Description:** Snapshot is set at order/session-create time and never updates. Examples across the schema:
  - `orders.table_id` (live) + `orders.table_ref` (snapshot)
  - `cart_items.menu_item_id` (live) + `cart_items.variant_snapshot JSONB` + `options_snapshot JSONB`
  - `order_items.menu_item_id` (live, nullable) + `order_items.item_name` + variant/options snapshots
  - `orders.service_model` (snapshot) vs `tenant_settings.service_model` (live)
  - `kitchen_tickets.service_model` (snapshot) + `kitchen_tickets.table_ref` (snapshot)

### 2.6 Bilingual content inline (no translation tables)

- **Scenario/Requirement:** Customer-facing menu text needs to render in Khmer (default) or English (fallback) without JOINs on the storefront hot path.
- **Technical decision:** Two columns per translatable string: `name_km TEXT NOT NULL` (Khmer required) + `name_en TEXT` (English optional). No separate `*_translations` tables.
- **Description:** Applied to: `menu_categories`, `menu_items`, `menu_item_variants`, `menu_item_option_groups`, `menu_item_options`. Storefront query selects both columns once; client picks based on user locale. Adding a third locale is a schema migration (new columns), but XFOS supports exactly Khmer + English at MVP and a third would be a major product decision either way. Tenant-level metadata (`tenant_settings.address`, `tenant_settings.description`) uses JSONB structure (`{"en": "...", "km": "..."}`) because it's rendered as-is, never searched.

### 2.7 Daily-reset numbering for orders

- **Scenario/Requirement:** Customers say "I'm order LB-042" — short and memorable. Resetting daily keeps numbers small. But uniqueness must be tenant-aware AND day-aware.
- **Technical decision:** `orders.order_date DATE NOT NULL` (tenant-local date) + `order_number TEXT` + `UNIQUE (tenant_id, order_date, order_number)`. Allocator function `allocate_order_number(tenant_id)` returns `(order_date, order_number)` atomically via row-level locking.
- **Description:** Tenant-local timezone comes from `tenant_settings.timezone` (default `Asia/Phnom_Penh`). Format: `{code_prefix}-{daily_counter}` like `LB-042`. The full second-precision timestamp is on `created_at` — `order_date` is solely for daily-reset uniqueness. See [`design-discussions/order-numbering-strategy.md`](./design-discussions/order-numbering-strategy.md).

### 2.8 Running sequential numbering for bills

- **Scenario/Requirement:** Tax audits expect non-resetting invoice numbers. Cross-day lookups by bill number must work.
- **Technical decision:** `bills.bill_number TEXT` running sequential per tenant, never resets. Format: `{code_prefix}-B-{6-digit-counter}` like `LB-B-000125`. Allocator `allocate_bill_number(tenant_id)`.
- **Description:** The `-B-` infix prevents visual confusion with order numbers. `next_bill_number BIGINT` on `tenant_sequences` — accommodates 50 years of 500 bills/day without hitting INTEGER ceiling. Different counter strategies for different artifact types is the standard POS-industry pattern.

### 2.9 Soft delete via `is_active BOOLEAN` (preferred)

- **Scenario/Requirement:** Merchants accidentally delete things. Hard delete wipes history.
- **Technical decision:** Use `is_active BOOLEAN NOT NULL DEFAULT TRUE`. `deleted_at TIMESTAMP` only when the *moment* of deactivation matters as much as the fact.
- **Description:** Tables using `is_active`: `tables`, `qr_contexts`, `floor_plans`, `tenant_payment_methods`, `plans`, `menu_categories`, `menu_items`. Tables using `deleted_at`: `menu_categories`, `menu_items`, `menu_item_variants` (catalog deletion is a notable event). Tenants are soft-archived via `TenantStatus.ARCHIVED` (status-based, no separate flag).

### 2.10 Partial unique indexes for "at most one X" rules

- **Scenario/Requirement:** Express "at most one ACTIVE Y per parent" without nullable hacks.
- **Technical decision:** Postgres partial unique indexes — `UNIQUE (...) WHERE condition`.
- **Description:** Examples across the schema:
  - One ACTIVE cart per session: `UNIQUE (tenant_id, session_id) WHERE status = 'ACTIVE'`
  - One ACTIVE QR per table: `UNIQUE (tenant_id, table_id) WHERE is_active = TRUE AND table_id IS NOT NULL`
  - One ACTIVE session per table
  - One ACTIVE subscription per tenant
  - One default variant per menu item: `UNIQUE (tenant_id, menu_item_id) WHERE is_default = TRUE AND deleted_at IS NULL`
  - At most one primary image per menu item

  These live in `xfos/database/scripts/20260410_mvp_hardening.sql` because Prisma DSL doesn't express partial indexes.

### 2.11 CHECK constraints over app-only validation

- **Scenario/Requirement:** During incidents, ops might run raw SQL. Application-only validation can be bypassed.
- **Technical decision:** ~60 CHECK constraints across the schema for hot-path tables (orders, bills, payments) — money formulas, lifecycle monotonicity, status-vs-fields parity, range bounds.
- **Description:** Examples: `orders_total_formula CHECK (total = subtotal - discount + tax + service)`, `orders_lifecycle_monotonic CHECK (preparing_at IS NULL OR submitted_at IS NOT NULL ...)`, `payments_refund_le_amount CHECK (refunded <= amount)`. The application *also* validates via Zod at the API boundary, but the DB is the last line of defense. Listed in the hardening migration §5.

### 2.12 Actor-triad mirror across all append-only logs

- **Scenario/Requirement:** When investigating an incident, "who did this?" must be answerable for every event — and "user_id IS NULL" is not specific enough (was it a webhook? a cron? a system daemon?).
- **Technical decision:** Every table that records request-level events shares an identical 3-column shape. The `AuditActorType` enum has 5 values: `USER`, `SYSTEM`, `WEBHOOK`, `CRON`, `API_KEY`.
- **Description:** Tables: `audit_logs`, `order_status_history`, `kitchen_ticket_events`, `idempotency_keys`. Each carries:
  - `actor_type "AuditActorType" NOT NULL`
  - `actor_label TEXT` (required when not USER, e.g. `'BullMQ:idempotency-cleanup'`, `'ABA-webhook'`)
  - User FK (`user_id` or `changed_by_id`) (required when actor_type=USER)
  - `request_id TEXT` (correlation across all four tables)

  CHECK constraints: `(actor_type = 'USER') = (user_fk IS NOT NULL)`, `(actor_type = 'USER') OR (actor_label IS NOT NULL)`. Investigation: `WHERE request_id = X` against all four tables reconstructs an entire request lifecycle.

### 2.13 Idempotency keys verify request body via SHA-256

- **Scenario/Requirement:** Idempotency keys are not secrets. A stolen key replayed with a malicious payload must NOT silently hit the cache and return the original response.
- **Technical decision:** `idempotency_keys.request_body_hash TEXT NOT NULL` (SHA-256 hex of canonicalized request body).
- **Description:** On retry: same key + same hash → return cached response (correct idempotent retry). Same key + different hash → return `409 Conflict`, do NOT process, do NOT leak the cached response. Mismatches log a `WARNING`-severity audit event; repeated mismatches escalate to `ALERT` for security investigation.

### 2.14 Webhook integrity via gateway_event_id + signature

- **Scenario/Requirement:** Payment webhooks (e.g., ABA PayWay) get retried by the upstream. Must dedupe replays. Must verify authenticity.
- **Technical decision:** `payments.gateway_event_id TEXT` UNIQUE per tenant (partial index where NOT NULL). `payments.gateway_signature TEXT` stores the HMAC of the webhook payload.
- **Description:** Replay-safe webhooks via `INSERT … ON CONFLICT (tenant_id, gateway_event_id) DO NOTHING`. If a dispute arises, `gateway_signature` is proof of authenticity (verified against shared secret at receive time).

### 2.15 Postgres native enums (not VARCHAR + CHECK)

- **Scenario/Requirement:** Type-safe enum values at the database boundary.
- **Technical decision:** `CREATE TYPE "OrderStatus" AS ENUM (...)` Postgres native enums. 27 enums in the schema.
- **Description:** Names match Prisma enum names (`OrderStatus`, `BillStatus`, etc.). Mirrored in `xfos/contracts/enums/index.ts` as Zod enums for runtime validation. Three sources stay in sync: Prisma schema, contracts/enums, design docs (`enums-tables-design/enums/`). **Exception:** `from_status`/`to_status` columns on `order_status_history` and `kitchen_ticket_events` are TEXT (not enum) so historical rows survive enum evolution — the enum has already changed once on 2026-04-23.

---

# Part 3 — Tables (by domain)

38 tables organized by domain. For each, what it is, why it exists, and key design points.

## TENANT (10 tables)

### `tenants`
- **Scenario/Requirement:** Identify each business on the platform with stable, minimal data.
- **Technical decision:** Identity-only table. No contact info, no address, no branding — those live on `tenant_settings`.
- **Description:** Columns: `id`, `slug` (URL key, e.g. `acme-burger`), `code_prefix` (2–4 uppercase letters used in order/bill numbers like `LB-042`), `name_en` (required, primary system language), `name_km` (optional), `status`. Owners come and go; the tenant outlives them. Single-column `id` PK because tenants are the root.

### `tenant_settings`
- **Scenario/Requirement:** Each tenant has operational configuration that changes over time — service model, pay timing, tax, branding, contacts.
- **Technical decision:** One row per tenant (composite PK + UNIQUE constraint). Most fields have sensible defaults so onboarding is fast.
- **Description:** Service model (STALL_KIOSK | DINE_IN_TABLE) drives whether dine-in features are enabled. Pay timing (PAY_BEFORE | PAY_AFTER) drives the order flow. Tax expressed as `tax_rate_bps` (basis points — `1000` = 10%) + `tax_inclusive BOOLEAN` (Cambodia norm is inclusive). JSONB columns for flexible bilingual data (`address`, `description`, `business_contacts`, `social_links`). GPS as separate decimal columns (not JSONB) for future delivery distance math.

### `tenant_operating_hours`
- **Scenario/Requirement:** Restaurants close for lunch breaks, holidays, etc.
- **Technical decision:** Multiple rows per day-of-week to support split hours (e.g., open 11–14, closed, reopen 17–22).
- **Description:** Drives storefront "Closed" state. `day_of_week` is 0 (Sunday) to 6 (Saturday). `UNIQUE (tenant_id, day_of_week, open_time)` prevents duplicate slots.

### `tenant_payment_methods`
- **Scenario/Requirement:** Different tenants enable different payment rails. Some have ABA QR, some are cash-only, some plan to add Wing or card.
- **Technical decision:** One row per (method × provider) combo. Replaces the boolean flags pattern (`payment_cash`, `payment_aba_qr`, `payment_card`).
- **Description:** Method is the rail (`CASH`, `ABA_QR`, `CARD`); provider is the gateway (`'aba'`, `'wing'`, `'stripe'`, NULL for cash). `config JSONB` holds non-secret provider config (merchant ID, display name, etc.). Adding a new provider is one INSERT, no schema change.

### `setup_progress`
- **Scenario/Requirement:** Merchant onboarding has 5 milestones (profile, menu, translations, payments, QR). DRAFT tenants can't go ACTIVE until all 5 are done.
- **Technical decision:** Monotonic timestamp columns per milestone + a Postgres `GENERATED STORED` column `go_live_ready` that recomputes on every write.
- **Description:** Once a milestone timestamp is set, it never resets to NULL. The `go_live_ready` column cannot drift from its inputs — it's recomputed by Postgres on every UPDATE. Partial index on `WHERE go_live_ready = FALSE` for the platform-admin "stuck in onboarding" funnel.

### `tenant_health`
- **Scenario/Requirement:** ACTIVE tenants can drift — translations break, payment provider goes down, merchant deletes all menu items.
- **Technical decision:** Sibling of `setup_progress`, created at DRAFT→ACTIVE transition. Tracks live-state health flags + their broken-since timestamps.
- **Description:** Fields: `translations_healthy`, `payments_healthy`, `menu_has_visible_items` (BOOL flags) + matching `*_broken_at` timestamps + cheap counters (`untranslated_item_count`, `disabled_payment_count`). Powers the merchant dashboard's "X items missing Khmer" alert.

### `plans`
- **Scenario/Requirement:** Subscription tier catalog — STARTER / GROWTH / PRO.
- **Technical decision:** Bilingual display, multi-currency, two lifecycle flags (`is_active` = accepting subs, `is_public` = visible in signup UI).
- **Description:** `code` is TEXT (not enum) so adding/retiring plans needs no migration. Pricing in INTEGER cents with multi-currency support via `Currency` enum. Globally-scoped (single-column `id` PK) — plans aren't tenant-specific.

### `plan_features`
- **Scenario/Requirement:** Each plan has different capabilities (max users, custom branding, API access, etc.). Catalog needs to evolve.
- **Technical decision:** One row per (plan × feature_key). `value` as JSONB so it can be number / boolean / string.
- **Description:** Vocabulary lives in TypeScript (`xfos/contracts/enums/plan-features.ts`), not the database. Adding a new feature is an INSERT, not a migration.

### `subscriptions`
- **Scenario/Requirement:** Track each tenant's subscription history. At most one ACTIVE subscription per tenant. Pricing should be grandfathered when plan prices change.
- **Technical decision:** Full history table. Pricing terms snapshotted (`price_cents`, `currency`, `billing_interval`, `plan_code`) at subscription creation. Display name live-joined via `plan_id`.
- **Description:** Stripe-style billing cycles: `current_period_start`/`end` reset on renewal; `started_at` is the lifetime anchor. Cancellation split: `cancelled_at` = intent timestamp, `cancel_at` = scheduled end. Partial unique index enforces "at most one ACTIVE per tenant." Globally-scoped (single-column `id` PK).

### `tenant_sequences`
- **Scenario/Requirement:** Generate unique order/bill numbers per tenant atomically, without Redis dependency.
- **Technical decision:** `tenant_id` IS the PK (one row per tenant, never anything else). Two helper functions: `allocate_order_number()` (daily-reset) and `allocate_bill_number()` (running sequential).
- **Description:** Both helpers use `SELECT FOR UPDATE` row locking — no Redis split-brain risk, no application coordination. Auto-creation trigger inserts the row when a tenant is created. Daily-reset detection compares `counters_reset_on` (stored tenant-local DATE) against today-in-tenant-timezone. The 2026-04-26 refactor split the order helper into 2 obvious-on-inspection statements (was 1 subtle UPDATE RETURNING CASE).

## AUTH (6 tables)

### `users`
- **Scenario/Requirement:** Identify humans on the platform. A user can hold roles in multiple tenants.
- **Technical decision:** Globally-scoped (single-column `id` PK). Auth method via `user_auth_providers`; tenant membership via `user_roles`.
- **Description:** No password column — XFOS uses Telegram + Facebook + Phone-OTP, not username/password. `email` is `CITEXT UNIQUE` (case-insensitive — `alice@x.com` collides with `Alice@X.com`). `phone` is E.164 (regex CHECK). FKs INTO users stay single-column because users are global.

### `user_auth_providers`
- **Scenario/Requirement:** Multi-provider login: a user can sign in via Telegram, Facebook, OR phone-OTP. Encouraged to link 2+ to avoid lockout.
- **Technical decision:** One row per (user × provider). `UNIQUE (provider, provider_id)` ensures one XFOS account per external identity.
- **Description:** Providers: `TELEGRAM` (Login Widget signature), `FACEBOOK` (OAuth 2.0), `PHONE` (SMS OTP). `metadata JSONB` keeps the raw provider response for audit. The 2-of-3 onboarding rule is enforced application-side: every owner/manager/admin must have ≥2 providers linked before going ACTIVE.

### `phone_otp_attempts`
- **Scenario/Requirement:** SMS OTP flow needs rate limiting + audit. Hashed storage, never plaintext.
- **Technical decision:** Phone-keyed (not user-keyed) because OTP flows happen before auth exists. `otp_hash` is SHA-256 of (OTP + per-row salt). 5-minute expiry, 5 failed attempts → 15-minute phone lockout.
- **Description:** Partial indexes for "active OTP for this phone" (hot path) and "expired keys" (cleanup). Globally-scoped — no `tenant_id`.

### `user_roles`
- **Scenario/Requirement:** A user can have different roles in different tenants. PLATFORM_ADMIN and PLATFORM_STAFF have no tenant.
- **Technical decision:** Junction with NULLABLE `tenant_id`. `UNIQUE NULLS NOT DISTINCT (user_id, tenant_id, role)` (PG 15+).
- **Description:** NULLS NOT DISTINCT prevents two `(user, NULL, PLATFORM_ADMIN)` rows from coexisting (without it, NULLs are treated as distinct and the unique constraint allows duplicates). Single-column `id` PK because of the nullable tenant_id.

### `refresh_tokens`
- **Scenario/Requirement:** JWT access tokens are 15-minute short. Refresh tokens enable seamless renewal. Stolen tokens must be revocable.
- **Technical decision:** Store `token_hash` (SHA-256 of raw token), never plaintext. `tenant_id` nullable (platform admins). `revoked_at` for explicit revocation; access denylist in Redis closes the 15-minute window.
- **Description:** Cleanup index on `expires_at` for the periodic purge job. The Redis denylist (keyspace `denylist:jti:{jti}` with TTL=token exp) ensures revocation takes effect within 1ms.

### `invitations`
- **Scenario/Requirement:** Tenants invite staff via Telegram or Facebook Messenger (not email — email isn't the delivery channel in Cambodia).
- **Technical decision:** 72h TTL. Invite delivery via `channel` (`'telegram'` | `'facebook_messenger'`) + `channel_id`. Token stored as SHA-256 hash. CHECK enforces only tenant-scoped roles (no `PLATFORM_ADMIN` invitations).
- **Description:** Accepted invitations create a `user_roles` row. EXPIRED status is derived from `expires_at`, not stored — no cron job needed.

## CATALOG (6 tables)

### `menu_categories`
- **Scenario/Requirement:** Group menu items into categories ("Drinks", "Mains", "Desserts").
- **Technical decision:** Flat hierarchy (no nesting). Bilingual inline. Soft-deleted via `deleted_at`.
- **Description:** Sort_order for display ordering. `is_active` for temporary disable. Composite-PK + composite FK from `menu_items` makes cross-tenant linking impossible.

### `menu_items`
- **Scenario/Requirement:** The catalog row — the thing customers buy. Optional variants (sizes), optional options (modifiers).
- **Technical decision:** Bilingual name + description inline. `base_price_cents` used **only when no variants exist** (variants override base price).
- **Description:** Two visibility flags with different roles: `is_available` (in stock right now — kitchen toggle) vs `is_visible` (shown on menu — merchant toggle). Soft-delete via `deleted_at` because catalog deletion is a notable business event. Currency on the item enables future per-item currency override (rare but supported).

### `menu_item_images`
- **Scenario/Requirement:** Merchants can register multiple images, sortable, with at most one primary image per item.
- **Technical decision:** Separate table (1:N from menu_items). Partial unique index `WHERE is_primary = TRUE` enforces "at most one primary."
- **Description:** Bilingual `alt_text` for accessibility. `sort_order` for carousel display. The 2026-04-25 composite-PK refresh added `tenant_id` directly to this table so the FK to `menu_items` is composite.

### `menu_item_variants`
- **Scenario/Requirement:** Many items have sizes (S/M/L) or styles (heat-level) with different prices.
- **Technical decision:** Separate table (1:N). Variant `price_cents` REPLACES `menu_items.base_price_cents` when present. At most one default per item.
- **Description:** Currency inherited from parent (not stored on variant). `is_available` toggle for stock. Partial unique enforces "one default variant per item." Soft-deleted via `deleted_at`.

### `menu_item_option_groups`
- **Scenario/Requirement:** Add-on / modifier containers ("Spicy Level", "Sauce", "Extras").
- **Technical decision:** Min/max selection rules per group. CHECK `max_select >= min_select`.
- **Description:** `min_select=0, max_select=1` = optional single-select. `min_select=1, max_select=1` = required single-select. `min_select=0, max_select=N` = optional multi-select.

### `menu_item_options`
- **Scenario/Requirement:** Individual selectable options within a group ("Mild", "Extra Cheese", "Ketchup").
- **Technical decision:** `price_delta_cents` (non-negative at MVP) added on top of base/variant price.
- **Description:** Non-negative because merchants can model discounts via promo codes/discount columns elsewhere — keeping option deltas non-negative simplifies invariants.

## ORDER (10 tables)

### `floor_plans`
- **Scenario/Requirement:** Restaurant has multiple seating areas — Main Floor, Patio, VIP Room — each with its own canvas of tables.
- **Technical decision:** Named drawing canvas with width × height. One default ("Main Floor") auto-provisioned at onboarding.
- **Description:** Active-only partial unique on `(tenant_id, name)` allows soft-deleted floor plans to keep history without blocking name reuse.

### `tables`
- **Scenario/Requirement:** Dine-in restaurants need first-class tables — labeled, capacity-limited, positioned on a floor plan, with current status (AVAILABLE / OCCUPIED / RESERVED / CLEANING).
- **Technical decision:** Tables are first-class entities (not just QR labels). Position via `(position_x, position_y, width, height, rotation)`. Shape enum `RECTANGLE | CIRCLE` (CIRCLE has CHECK enforcing width=height).
- **Description:** Renamable label. Active-only partial unique on `(tenant_id, label)`. `current_status` enum drives the floor-plan view. `version` for OCC (multiple staff editing positions). **Pickup counters explicitly excluded** — they live on `qr_contexts` only with `context_type = STOREFRONT`.

### `qr_contexts`
- **Scenario/Requirement:** Customers scan a QR code → resolve tenant + (optional) table. QRs get reprinted, lost, regenerated for security.
- **Technical decision:** Token-keyed (globally unique URL slug). Composite FK to `tables` (`table_id` replaced the old `table_ref TEXT` on 2026-04-24). Self-FK `replaces_id` for regeneration chains.
- **Description:** CHECKs enforce `TABLE` QRs have `table_id`, `STOREFRONT` QRs don't. Partial unique enforces "one ACTIVE QR per table." 6-value `QrDeactivationReason` enum tracks why a QR was disabled. Analytics counters: `scan_count`, `last_scanned_at`, `print_count`, `last_printed_at`. `notes` for merchant-facing free-form text.

### `order_sessions`
- **Scenario/Requirement:** Dine-in / open-tab flows where multiple orders accumulate into one bill. Need to track which table is occupied, by whom, since when.
- **Technical decision:** Sessions are created when a customer scans a TABLE QR (or staff opens manually). Auto-close when bill is paid; force-close button for staff; 24h cleanup job for abandoned sessions.
- **Description:** Two states: `ACTIVE | CLOSED`. The *why* of closure lives in `OrderSessionCloseReason` (`PAID`, `STAFF_FORCE_CLOSED`, `AUTO_TIMEOUT_24H`, `WALKED_AWAY`). Partial unique enforces "one ACTIVE session per table." `last_activity_at` (not `opened_at + 24h`) drives the cleanup job correctly. Denormalized running totals (`subtotal_cents`, `total_cents`, `order_count`) make the merchant-portal "occupied tables" view a single-row read. Accountability triad: `opened_by_id`, `server_id`, `closed_by_id`.

### `carts`
- **Scenario/Requirement:** Multi-device dine-in: a couple at Table 5 might both add items from their own phones. Both should see the same cart.
- **Technical decision:** Server-persisted carts are **dine-in only**. Stall/kiosk uses browser `localStorage` (kiosk reload should reset). One shared ACTIVE cart per session — partial unique enforces this.
- **Description:** Three statuses: `ACTIVE | CONVERTED | ABANDONED`. The *why* of abandonment in `CartAbandonedReason` enum. Multiple historical CONVERTED/ABANDONED rows per session are expected — only ACTIVE is unique. `closed_by_id` set when staff manually resets.

### `cart_items`
- **Scenario/Requirement:** Cart line items that need to convert verbatim into order_items at "Submit Order."
- **Technical decision:** JSONB snapshots: `variant_snapshot` + `options_snapshot`. Cart-to-order conversion = column copy, no re-resolution.
- **Description:** `unit_price_cents` is snapshotted at add-time (variant price + sum of option deltas baked in). `notes` for per-item special instructions. Composite FKs to `carts` + `menu_items` make cross-tenant impossible.

### `orders`
- **Scenario/Requirement:** The central order record. Customer says "I'm LB-042." Tax-grade audit. Multi-device safety. Walk-in support.
- **Technical decision:** Created only AFTER payment gate (PAY_BEFORE) or at submission (PAY_AFTER). Carries: `version` (OCC), full money breakdown (subtotal/discount/tax/service/total), denormalized lifecycle timestamps with monotonic-lifecycle CHECK, customer-facing `estimated_ready_at`, QR attribution (`qr_context_id` + STOREFRONT_QR ⇒ NOT NULL CHECK), source channel (`OrderSource`), accountability (`created_by_id`, `cancelled_by_id` + `cancellation_reason`), tenant-local `order_date` + UNIQUE constraint, `table_id` live FK + `table_ref` snapshot.
- **Description:** Status machine: SUBMITTED → PREPARING → READY → COMPLETED, or → CANCELLED. CHECKs include: `total = subtotal − discount + tax + service`, `discount ≤ subtotal`, lifecycle monotonicity, source/qr_context pairings, source/created_by pairings.

### `order_items`
- **Scenario/Requirement:** Order line items must survive catalog edits/deletes. Optional per-line kitchen workflow (one item ready while another cooks). Optional partial cancellation (out of stock for one line).
- **Technical decision:** Insert-only for content (name, price, variant, options) + JSONB snapshots. Mutable fields: `kitchen_status`, `prepared_at`, `ready_at`, `is_cancelled`, `cancellation_reason`, `cancellation_reason_text`, `cancelled_at`, `cancelled_by_id`. `created_at` for audit (dine-in "Round 2" appends).
- **Description:** `line_subtotal_cents` (raw `unit_price * quantity`) distinct from `line_total_cents` (post-adjustment). Per-line cancellation excludes the line from bill recalc. Composite FKs; `menu_item_id` nullable (item may have been deleted — application sets NULL via UPDATE before deleting the menu item).

### `order_status_history`
- **Scenario/Requirement:** Audit trail of every order status transition. Who, when, why.
- **Technical decision:** Append-only. `from_status`/`to_status` as TEXT (not enum) for archival durability — survives enum evolution. Actor-triad mirror (USER/SYSTEM/WEBHOOK/CRON/API_KEY). Sibling `cancellation_reason` enum mirrored from orders for in-place analytics.
- **Description:** CHECK `from_status != to_status` (no-op transitions forbidden). Partial indexes for request_id correlation and CANCELLED-segment analytics. The TEXT typing is deliberate — the OrderStatus enum has already changed once (2026-04-23 redesign), and historical rows must remain valid without data migration.

### `idempotency_keys`
- **Scenario/Requirement:** Customer taps "Place Order" on a flaky network. Storefront retries. Without idempotency, customer gets two orders + double-charged.
- **Technical decision:** 24h TTL. UNIQUE `(tenant_id, key, endpoint)` — tenant-scoped to prevent cross-tenant cache-hit exfil. **`request_body_hash` SHA-256 NOT NULL** — retries with different body return 409.
- **Description:** Application uses `INSERT … ON CONFLICT DO NOTHING` to short-circuit replays. Cleanup function (BullMQ hourly) deletes expired rows. Actor-triad mirror for forensics. CHECKs: `expires_at > created_at`, `response_code BETWEEN 100 AND 599`.

## BILLING (3 tables)

### `bills`
- **Scenario/Requirement:** Financial receipts. Different ServiceModel × PayTiming combos produce different bill grouping. Tax compliance.
- **Technical decision:** Running sequential `bill_number` (`LB-B-000125`). Full money breakdown (subtotal/discount/tax/service/tip). `version` OCC. Closure accountability (`closed_by_id`, `paid_at`). Void accountability (`voided_at`, `voided_by_id`, `void_reason`). `amount_paid_cents` running total (drives OPEN→PARTIALLY_PAID→PAID transitions reliably).
- **Description:** STALL_KIOSK + PAY_BEFORE: 1 order = 1 bill (no session). STALL_KIOSK + PAY_AFTER: session groups orders. DINE_IN_TABLE: session always exists. CHECK enforces `total = subtotal − discount + tax + service + tip`, `amount_paid <= total`, `(status = PAID) → (amount_paid = total)`, `(status = VOIDED) ↔ void fields set`.

### `bill_orders`
- **Scenario/Requirement:** Many-to-many junction between bills and orders. Required for session-grouped PAY_AFTER billing.
- **Technical decision:** Composite PK `(tenant_id, bill_id, order_id)`. Both FKs composite — replaces what was the schema's most complex parity trigger.
- **Description:** Reverse-lookup index `(tenant_id, order_id)` for "what bill is this order on?"

### `payments`
- **Scenario/Requirement:** One bill can have multiple payment attempts (ABA QR expires → retry). Refunds. Webhook integrity. Cash confirmation accountability.
- **Technical decision:** Append-style — multiple payment rows per bill. Lifecycle transitions denormalized (`initiated_at`, `pending_at`, `succeeded_at`, `failed_at`, `expires_at`). `provider` enum (`'aba'`, `'wing'`, `'cash'`) for analytics by gateway. `version` OCC for webhook-vs-manual race. `gateway_event_id` UNIQUE per tenant + `gateway_signature` for replay-safe verified webhooks. Refund tracking (`refunded_amount_cents` for partial-refund support, `refunded_by_id` accountability).
- **Description:** 7 statuses: INITIATED, PENDING, SUCCEEDED, FAILED, CANCELLED, EXPIRED, REFUNDED. CHECKs: `refund <= amount`, `(status = REFUNDED) → (refund > 0 AND refunded_at IS NOT NULL)`, `(status = SUCCEEDED) → succeeded_at IS NOT NULL`.

## KITCHEN (2 tables)

### `kitchen_tickets`
- **Scenario/Requirement:** Real-time kitchen display. Multiple tablets in the kitchen. Rush-priority lane. Per-transition accountability.
- **Technical decision:** One ticket per order. `ticket_number` = `orders.order_number` (no separate allocation). `version` OCC for multi-tablet races. 4 accountability FKs (`started_by_id`, `marked_ready_by_id`, `completed_by_id`, `cancelled_by_id`). `priority` (0=normal, 1=RUSH, 2=EXPEDITE) with partial index for rush-first FIFO queue.
- **Description:** Status machine: NEW → PREPARING → READY → COMPLETED, or → CANCELLED. `cancellation_reason` reuses `OrderCancellationReason` enum. `expedite_at`, `printed_at` (printer integration), `estimated_ready_at` (mirror of orders). Socket.io emits to `tenant_{tenant_id}` room on every transition. CHECK enforces lifecycle monotonicity.

### `kitchen_ticket_events`
- **Scenario/Requirement:** Audit trail of every ticket transition. Plus non-status events (EXPEDITE, PRINT, PRIORITY_CHANGE) on the same timeline.
- **Technical decision:** Append-only. `event_type` field — `STATUS_CHANGE` (default) | `EXPEDITE` | `PRINT` | `PRIORITY_CHANGE`. `metadata JSONB` for event-specific payload (printer ID, priority delta, etc.). Actor-triad mirror.
- **Description:** CHECK `(event_type = STATUS_CHANGE) → (to_status IS NOT NULL)`. `cancellation_reason` typed mirror for CANCELLED transitions.

## ADMIN (1 table)

### `audit_logs`
- **Scenario/Requirement:** Platform-wide event journal. Cross-tenant by design (some events are platform-level). Must outlive tenant deletion for compliance.
- **Technical decision:** Append-only. `tenant_id` NULLABLE (platform events have no tenant). `ON DELETE SET NULL` on both tenant + user FKs (audit survives entity deletion — the only table in the schema with this).
- **Description:** Three typed axes for indexable filtering:
  - `category "AuditCategory"` — coarse domain (ORDER, BILLING, etc.)
  - `severity "AuditSeverity"` — INFO / NOTICE / WARNING / ALERT (drives alert feed)
  - `actor_type "AuditActorType"` — USER / SYSTEM / WEBHOOK / CRON / API_KEY

  Plus correlation IDs (`request_id`, `auth_session_id`, `idempotency_key`), first-class state diff (`previous_state` + `new_state` JSONB split out from generic `metadata`), provenance (`ip_address INET`, `user_agent`), `retention_until` for per-row GDPR cleanup. **Partitioning explicitly deferred** with documented trigger conditions.

---

# Part 4 — Enums

27 enums total. Each is a Postgres native enum + matching Zod enum in `xfos/contracts/enums/index.ts`.

### TENANT enums

- **`TenantStatus`** — `DRAFT` (onboarding), `ACTIVE` (live), `SUSPENDED` (billing/abuse), `ARCHIVED` (soft-deleted).
- **`ServiceModel`** — `STALL_KIOSK` | `DINE_IN_TABLE`. Drives storefront UX, kitchen flow, and bill grouping.
- **`PayTiming`** — `PAY_BEFORE` | `PAY_AFTER`. Combined with ServiceModel produces 4 operational scenarios. Renamed from `PAY_BEFORE_FULFILLMENT`/`PAY_AFTER_SERVICE`/`PAY_ON_SESSION_CLOSE` (3-value old enum) on schema redesign — fewer states, clearer.
- **`SubscriptionStatus`** — `PENDING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED`, `EXPIRED`.

### AUTH enums

- **`UserStatus`** — `PENDING` (post-signup, awaiting verification), `ACTIVE`, `SUSPENDED`, `DELETED`.
- **`Role`** — 6 values: `PLATFORM_ADMIN`, `PLATFORM_STAFF` (no tenant), `TENANT_OWNER`, `TENANT_MANAGER`, `SERVICE_STAFF`, `KITCHEN_STAFF`. Tenant-scoped roles assigned via `user_roles`.
- **`InvitationStatus`** — `PENDING`, `ACCEPTED`, `REVOKED`. EXPIRED is derived from `expires_at` (no cron job needed to maintain status).
- **`AuthProvider`** — `TELEGRAM`, `FACEBOOK`, `PHONE`. Per `authentication-strategy-v2.md` — three methods only.

### ORDER enums

- **`QrContextType`** — `STOREFRONT` (no table) | `TABLE`. `COUNTER` was removed — every counter case is `STOREFRONT` + `label`.
- **`QrDeactivationReason`** — 6 values: `REGENERATED`, `MERCHANT_DISABLED`, `LOST_OR_DAMAGED`, `EXPIRED_AUTO`, `TABLE_REMOVED`, `TENANT_DEACTIVATED`. System-actor exception for the last two.
- **`OrderSessionStatus`** — `ACTIVE` | `CLOSED`. Minimal lifecycle.
- **`OrderSessionCloseReason`** — sibling enum: `PAID`, `STAFF_FORCE_CLOSED`, `AUTO_TIMEOUT_24H`, `WALKED_AWAY`. Distinct walkaway value drives revenue-leak analytics.
- **`CartStatus`** — `ACTIVE` | `CONVERTED` | `ABANDONED`. Dine-in only.
- **`CartAbandonedReason`** — sibling enum: `SESSION_PAID`, `SESSION_FORCE_CLOSED`, `STAFF_RESET`, `SESSION_TIMEOUT`, `CUSTOMER_DISMISSED`.
- **`OrderStatus`** — 5 values: `SUBMITTED` → `PREPARING` → `READY` → `COMPLETED`, or `CANCELLED`. Replaced earlier enum that had `PENDING_PAYMENT` / `CONFIRMED` (2026-04-23 redesign — payment state moved to its own table).
- **`OrderCancellationReason`** — 7 values: `CUSTOMER_REQUEST`, `OUT_OF_STOCK`, `KITCHEN_OVERLOADED`, `PAYMENT_FAILED`, `DUPLICATE`, `STAFF_ERROR`, `SYSTEM_TIMEOUT`. Reused on `kitchen_tickets` (the overlap is total).
- **`OrderSource`** — `STOREFRONT_QR` (customer self-service) | `MERCHANT_MANUAL` (walk-in cashier or elderly-customer waiter) | `API` | `MOBILE_APP` (future).
- **`TableShape`** — `RECTANGLE` | `CIRCLE`. Two shapes are enough for floor-plan rendering at MVP. CHECK on tables enforces `width = height` for circles.
- **`TableStatus`** — `AVAILABLE`, `OCCUPIED`, `RESERVED`, `CLEANING`. RESERVED is a forward-compat slot for booking; CLEANING is the brief transient between checkout and next seat.

### BILLING enums

- **`BillStatus`** — `OPEN` (no payment yet OR retry in flight), `PARTIALLY_PAID`, `PAID`, `VOIDED`. The bill no longer bounces on payment retries — that's the payments table's job. `UNPAID`/`PENDING_PAYMENT` removed in redesign.
- **`PaymentStatus`** — 7 values: `INITIATED`, `PENDING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `EXPIRED`, `REFUNDED`. Default is `INITIATED` (was `PENDING` previously). `INITIATED` separates "row created" from "gateway contacted."
- **`PaymentMethod`** — `CASH`, `ABA_QR`, `CARD`. CARD reserved but not implemented at MVP.

### KITCHEN enums

- **`TicketStatus`** — `NEW`, `PREPARING`, `READY`, `COMPLETED`, `CANCELLED`. Mirrors order statuses for real-time kitchen display.

### ADMIN enums

- **`AuditCategory`** — 8 values: `ORDER`, `BILLING`, `KITCHEN`, `CATALOG`, `AUTH`, `TENANT`, `PLATFORM`, `SYSTEM`. Coarse axis derived from the action prefix at write time.
- **`AuditSeverity`** — `INFO` (default firehose), `NOTICE` (highlight), `WARNING` (watch), `ALERT` (page). Drives the platform-admin alert feed via partial index.
- **`AuditActorType`** — `USER`, `SYSTEM`, `WEBHOOK`, `CRON`, `API_KEY`. Reused by 4 tables (audit_logs + 3 append-only logs) — the actor-triad mirror.

### Cross-cutting enums

- **`Locale`** — `en` | `km`. Two-locale rule.
- **`Currency`** — `USD` | `KHR`. Cambodia is USD-dominant; KHR for some local merchants.

---

# Part 5 — Authentication & Authorization

### 5.1 Multi-provider auth (Telegram + Facebook + Phone-OTP)

- **Scenario/Requirement:** Cambodia-specific reality: email is rarely a primary identity. Telegram and Facebook are universal; phone numbers anchor identity.
- **Technical decision:** Three providers via `user_auth_providers`. Users encouraged to link 2+ to avoid lockout (e.g., Facebook account locked → fall back to phone).
- **Description:** Telegram via Login Widget (signature-verified payload). Facebook via OAuth 2.0 (App-Scoped User ID). Phone via SMS OTP (no plaintext storage; `otp_hash` only). 2-of-3 onboarding rule: every owner/manager/admin must have ≥2 providers linked before going ACTIVE.

### 5.2 JWT access + refresh token rotation

- **Scenario/Requirement:** Stateless authentication with revocability. Stolen tokens must be killable.
- **Technical decision:** 15-minute access tokens + 30-day refresh tokens. Refresh stored as SHA-256 hash. Redis denylist closes the 15-minute revocation window.
- **Description:** Access denylist keyspace `denylist:jti:{jti}` with TTL = token exp. Adds ~0.5–1ms per request (local Redis hit). Forced role downgrades take effect immediately on revocation, not after access-token expiry.

### 5.3 RBAC with 6 roles

- **Scenario/Requirement:** XFOS has platform users (XFOS staff) and tenant users (merchant staff) with different needs.
- **Technical decision:** 6-role enum: `PLATFORM_ADMIN`, `PLATFORM_STAFF`, `TENANT_OWNER`, `TENANT_MANAGER`, `SERVICE_STAFF`, `KITCHEN_STAFF`. Junction `user_roles` allows multi-tenant role membership.
- **Description:** Platform roles have NULL `tenant_id` (junction enforces NULLS NOT DISTINCT). Tenant roles are scoped to specific tenants. NestJS `RolesGuard` checks role from JWT claims.

### 5.4 `TenantGuard` reads tenant_id from JWT only

- **Scenario/Requirement:** Cross-tenant attack: malicious user sends `{"tenantId": "other_tenant", ...}` in request body, hopes the server trusts it.
- **Technical decision:** `TenantGuard` extracts `tenant_id` from the JWT claim, never from the request body, query string, or path param.
- **Description:** Application-layer enforcement. Combined with composite-PK FK construction (Part 1.9), this makes cross-tenant data bleed near-impossible. The guard injects `tenant_id` into the NestJS request context; controllers and use-cases read it from there, never from input.

### 5.5 Three "internal-only" walls for domain APIs

- **Scenario/Requirement:** Browsers should hit only BFF endpoints, never internal domain APIs.
- **Technical decision:** Three independent walls — any one failing isn't enough.
- **Description:**
  1. **URL prefix routing:** BFFs at `/api/v1/{storefront,kitchen,admin,platform-admin}/*`; domain APIs at `/api/v1/internal/*`.
  2. **`InternalOnlyGuard`** on domain endpoints — rejects requests without a service-token header.
  3. **Frontend ESLint Rule 4** — frontend code can only import its own BFF client (`frontend/<app>/src/lib/api/<bff>.ts`).

### 5.6 Khmer-name policy: Facebook account lockouts

- **Scenario/Requirement:** Cambodian users frequently get Facebook-locked for "real name policy" violations on Khmer characters. They lose access to Facebook login.
- **Technical decision:** Multi-provider linking (5.1) is the primary defense. Phone-OTP is the always-available recovery path.
- **Description:** Onboarding banner: "Link a second method to never get locked out." If a user has Telegram + Phone linked (no Facebook), Facebook account loss is irrelevant.

### 5.7 PIN login for frontline staff (post-MVP)

- **Scenario/Requirement:** Kitchen tablets and counter PCs are shared. Full OAuth login per shift change is impractical.
- **Technical decision:** PIN login for KITCHEN_STAFF and SERVICE_STAFF on tenant-bound devices. Future `user_pins` table.
- **Description:** Not in MVP. The tablets at MVP authenticate as a tenant-scoped service account; individual staff identity is recorded via "who's working this shift?" tap-in. Full PIN flow lands post-MVP.

### 5.8 No customer accounts at MVP

- **Scenario/Requirement:** Storefront customers scan a QR and order. Adding "create an account" is friction.
- **Technical decision:** Anonymous customer flow. Order tracked via unguessable `orders.order_token`. Same-visit re-order banner via browser localStorage.
- **Description:** Anonymous customer events log as `actor_type = SYSTEM`, `actor_label = 'storefront:anonymous'` (per the actor-triad). When customer accounts are added post-MVP, the storefront flow will start carrying `user_id` and these events flip to USER actor.

---

# Part 6 — Folder structure & monorepo

### 6.1 pnpm workspaces + Turborepo monorepo

- **Scenario/Requirement:** XFOS has 4 frontends + 1 backend + multiple shared packages. Need shared types, shared utilities, atomic cross-cutting changes.
- **Technical decision:** Single repo with `pnpm` workspaces and `Turborepo` for caching/parallel builds.
- **Description:** All apps share types via `@platform/*` packages. A schema change updates Prisma + contracts + frontends in one PR. Turborepo caches build outputs so CI doesn't rebuild everything every push.

### 6.2 Layout: `apps/`, `services/`, `packages/`, `internal/`

- **Scenario/Requirement:** Need clear separation between user-facing apps, backend services, shared code, and internal-only tools.
- **Technical decision:**
  - `apps/{storefront,kitchen,admin}` — Next.js 14 frontends
  - `services/api` — NestJS backend (one process)
  - `packages/{ui-customer,ui-admin,types,utils,validators,config}` — shared
  - `internal/platform-admin` — separate Vercel project, no shared UI
  - `infra/docker-compose.yml` — local dev only (postgres + redis)
- **Description:** Platform admin is intentionally separate from `apps/` because it's IP-restricted and shouldn't share UI patterns with customer apps. Each frontend has its own ESLint config enforcing the three UI tiers (Part 1.5).

### 6.3 The `core/` layer is sacred

- **Scenario/Requirement:** Business logic must be unit-testable without spinning up frameworks. Future microservices split must be mechanical.
- **Technical decision:** `services/api/src/modules/<bounded-context>/core/` is pure TypeScript. Allowed: Zod for runtime validation. Forbidden: Prisma, NestJS, BullMQ, Socket.io, React.
- **Description:** The `core/` layer holds entities, value objects, domain services. It's tested in isolation. Infra concerns (database, queue, websocket) live in `infra/`. The `application/` layer wires them together.

### 6.4 `backend/shared/` is infrastructure-only (~15 files max)

- **Scenario/Requirement:** Shared utilities accumulate domain logic over time and become a junk drawer.
- **Technical decision:** `services/api/src/shared/` is strictly infrastructure. No domain words allowed.
- **Description:** Allowed: Prisma wrapper, `@CurrentTenant()` decorator, exception filters, Pino logger, in-process event bus, idempotency service, request-context middleware. Forbidden: anything mentioning `order`, `bill`, `menu`, `kitchen`, `payment`, `customer`. ESLint rule enforces.

### 6.5 Three contract packages (per-frontend BFF + cross-cutting types)

- **Scenario/Requirement:** Each frontend has different DTO needs. But they all share core types (Tenant ID, Currency, Locale, etc.).
- **Technical decision:**
  - `packages/contracts-bff-{storefront,kitchen,admin,platform-admin}/` — per-frontend BFF DTOs (Zod schemas)
  - `packages/contracts/enums/` — cross-domain enums (matches Prisma schema 1:1)
  - `packages/contracts/{auth,order,billing,...}/` — internal domain DTOs (used by domain APIs)
- **Description:** Prevents cross-frontend coupling. The storefront's `OrderResponse` shape doesn't dictate what the merchant portal sees. All BFFs internally translate to/from the same internal domain entities.

### 6.6 No Docker in production

- **Scenario/Requirement:** Operational simplicity at MVP. Vercel + Railway are managed.
- **Technical decision:** Docker Compose for local dev only (postgres + redis). Production is Vercel (frontends) + Railway (API + Postgres) + Upstash (Redis).
- **Description:** Why not Docker in prod? Adds operational surface (registry, image building, k8s/ECS, etc.) without solving any MVP problem. Vercel + Railway both build from git directly. Revisit when we have actual scale/cost reasons.

---

# Part 7 — Tech stack

### 7.1 NestJS for the backend

- **Scenario/Requirement:** Need a Node.js framework with first-class DI, modules, guards, and pipes. Hexagonal-friendly.
- **Technical decision:** NestJS with Express under the hood. Modules map 1:1 to bounded contexts.
- **Description:** Why not bare Express/Fastify? DI + decorators reduce boilerplate. Why not Encore.dev / Hono? NestJS's module system fits hexagonal naturally; community is large; stack is well-known.

### 7.2 Next.js 14 App Router for all 4 frontends

- **Scenario/Requirement:** Server-rendered, mobile-friendly, SEO-aware (storefront), fast hydration (kitchen tablet).
- **Technical decision:** Next.js 14 App Router for storefront, kitchen, merchant portal, platform portal.
- **Description:** Same framework everywhere reduces context-switching cost. App Router enables React Server Components for data-fetching simplicity. Why not Remix / SvelteKit? Next.js has the deepest Vercel integration (the chosen host) and largest community; team familiarity wins.

### 7.3 Prisma as the ORM

- **Scenario/Requirement:** Type-safe database access, schema-as-code, great migrations.
- **Technical decision:** Prisma. `schema.prisma` is the source of truth. `prisma migrate` produces migration SQL.
- **Description:** Why not Drizzle / Kysely? Prisma's migration UX is the best in class, and `prisma generate` produces fully-typed clients including for composite-PK relations. Limitations (no CHECK constraint syntax, no partial indexes, no generated columns) are filled by the hardening migration script.

### 7.4 PostgreSQL 16

- **Scenario/Requirement:** Relational, ACID, multi-tenant SaaS-proven, partial indexes, generated columns, NULLS NOT DISTINCT.
- **Technical decision:** Postgres 16, hosted on Railway in production.
- **Description:** PG 15+ required for `UNIQUE NULLS NOT DISTINCT` on `user_roles`. Why not MySQL / Aurora? Postgres has stronger constraint support (CHECK, partial indexes, generated columns), JSONB, and the developer ecosystem is unmatched.

### 7.5 Redis (Upstash) for queue + cache

- **Scenario/Requirement:** BullMQ needs Redis. Token denylist needs sub-ms TTL. Some hot reads benefit from caching.
- **Technical decision:** Upstash Redis (serverless, pay-per-request).
- **Description:** Why Upstash over self-hosted Redis? Pay-per-request is cheap at MVP volume; no ops overhead. Why not in-process queue? BullMQ jobs must survive API restart; in-process queue (NestJS schedule) loses jobs on crash.

### 7.6 BullMQ for background jobs

- **Scenario/Requirement:** See Part 1.7. Payment, kitchen, notifications, cleanup jobs.
- **Technical decision:** BullMQ (Redis-backed).
- **Description:** Best-in-class TypeScript queue, retries, job priorities, scheduled jobs (cron-like) all built in.

### 7.7 Socket.io for real-time

- **Scenario/Requirement:** Kitchen tablets need new tickets within 2s. Customer status pages need updates.
- **Technical decision:** Socket.io NestJS gateway. Rooms named `tenant_{tenant_id}` (Part 1.6).
- **Description:** Why not Supabase Realtime? Tenant isolation via room naming is more flexible. Why not SSE? Bi-directional is cleaner for ack patterns. Why not raw WebSocket? Socket.io's reconnection + fallback to long-polling matters on flaky Cambodian mobile networks.

### 7.8 Zod for validation (frontend + backend boundaries)

- **Scenario/Requirement:** Type-safe request validation. Same schema usable on frontend and backend.
- **Technical decision:** Zod everywhere validation crosses a boundary. NestJS pipe wraps Zod schemas; frontend client-side forms use the same Zod schemas.
- **Description:** Contracts packages export Zod schemas. The same schema validates a form on the frontend AND the request body on the backend. Why not class-validator? Zod's type inference is sharper; sharing schemas FE↔BE works out of the box; no decorator magic.

### 7.9 Pino + Sentry for observability

- **Scenario/Requirement:** Structured logs for production debugging. Error tracking with stack traces.
- **Technical decision:** Pino for structured JSON logs (every log line carries `tenant_id`, `request_id`, `user_id`). Sentry for error capture.
- **Description:** Why Pino over Winston? Significantly faster, structured-by-default, tiny footprint. Sentry releases tagged with git SHA; Sentry-Postgres breadcrumbs let you see slow queries in error context.

### 7.10 Vercel + Railway + Upstash deployment

- **Scenario/Requirement:** MVP needs to ship. Operational simplicity > absolute control.
- **Technical decision:** Vercel for the 4 Next.js frontends. Railway for the NestJS API + Postgres. Upstash for Redis. All tied to git (push to main = deploy).
- **Description:** Why not AWS / GCP / k8s? Massive overkill at MVP. Vercel + Railway costs are predictable; deploys are ~2 minutes; rollback is one click. Revisit at scale (when monthly Vercel bill ≈ DevOps engineer's salary).

### 7.11 next-intl for i18n

- **Scenario/Requirement:** Khmer-first (km), English fallback (en). Needs to work in Server Components.
- **Technical decision:** `next-intl` (App Router-native).
- **Description:** Per-locale URL prefixes (`/km/*`, `/en/*`). Static rendering of locale-aware pages possible. JSON message files per locale.

### 7.12 shadcn/ui + Tailwind for UI

- **Scenario/Requirement:** Fast UI iteration, accessible defaults, owned components (no version-lock to a UI library).
- **Technical decision:** Tailwind CSS for styling. shadcn/ui (copy-into-repo components) for primitives. Three UI packages (Part 1.5) build on these.
- **Description:** Why shadcn/ui over Material/Chakra? You own the components — no upgrade pain. Why Tailwind over CSS Modules? Faster iteration, smaller production bundles, no naming bikeshedding.

---

# Part 8 — Operational

### 8.1 Migration pipeline

- **Scenario/Requirement:** Schema changes must apply consistently from local dev through production.
- **Technical decision:** Two-step apply: `prisma migrate deploy` (creates tables) → `psql -f scripts/20260410_mvp_hardening.sql` (adds CHECKs, partial indexes, helpers, generated columns, citext).
- **Description:** The hardening SQL is idempotent (`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS … ADD`) and wrapped in a single transaction. Re-runnable on any environment. The reset script `scripts/reset-dev-db.sh` does the full cycle (down → up → migrate → harden → seed).

### 8.2 Cleanup jobs (BullMQ schedule)

- **Scenario/Requirement:** Several tables accumulate rows that need pruning.
- **Technical decision:** BullMQ scheduled jobs hourly/daily. Each calls a Postgres helper function.
- **Description:** Hourly: `cleanup_expired_idempotency_keys()`, expire stale ABA QRs (`payments` partial index), prune expired `phone_otp_attempts`. Daily: close abandoned `order_sessions` (`last_activity_at` >24h), audit-log retention purge (`retention_until < NOW()`). All cleanup events logged to `audit_logs` with `actor_type = 'CRON'`.

### 8.3 Local dev workflow

- **Scenario/Requirement:** New engineer can start contributing in <30 minutes.
- **Technical decision:** `pnpm db:reset` runs the full cycle. `pnpm dev` starts all apps with hot reload.
- **Description:** Postgres + Redis run in Docker (`infra/docker-compose.yml`). Apps run natively (faster hot reload, easier debugging). Seed script (`xfos/database/seeds/dev.seed.ts`) creates one tenant + one user. Note: seed script needs refresh after the 2026-04-23+ schema changes.

### 8.4 CI/CD

- **Scenario/Requirement:** Tests must run on every push. Deploys are git-driven.
- **Technical decision:** GitHub Actions for tests. Vercel + Railway auto-deploy on `main`.
- **Description:** Tests: `pnpm test` (Vitest unit + Supertest integration). E2E: Playwright against a deployed preview environment with real Postgres. Type-check + lint blocking. Bundle-size budget on frontend builds.

### 8.5 Audit-log retention policy

- **Scenario/Requirement:** GDPR-style retention requirements + cost management as audit_logs grows unboundedly.
- **Technical decision:** Per-row `retention_until TIMESTAMP(3)`. NULL = retain forever. Application sets it based on action category.
- **Description:** Most categories retain forever (compliance). PII-heavy events (auth, payment-failure-with-IP) get a 1-year retention. Cleanup job deletes `WHERE retention_until < NOW()`. Partitioning by `created_at` is **explicitly deferred** — Postgres handles 100M+ rows fine; trigger conditions for revisiting are documented in `tables/audit-logs.md`.

---

## Where to go next (after reading this)

1. **`enums-tables-design/tables/postgresql-schema.md`** — every table's DDL with design notes.
2. **`xfos/database/prisma/schema.prisma`** — the executable mirror.
3. **[`design-discussions/`](./design-discussions/)** — per-topic design rationale (8 docs covering numbering, auth tokens, menu/variants/options, service-model × pay-timing combos, onboarding, pricing tiers, order-status redesign, tenant-settings).
4. **`docs/mvp/XFOS-PRD.md`** — product requirements, user stories, acceptance criteria.
5. **`docs/mvp/technical-design/00-start-here.md`** — entry point for surface-specific specs.

If you encounter a decision in the codebase that this document doesn't explain, add it here. The goal is one canonical onboarding doc, not a fragmented tribal knowledge base.
