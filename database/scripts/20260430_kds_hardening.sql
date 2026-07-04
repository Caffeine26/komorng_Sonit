-- ============================================================================
-- KDS Schema Hardening Script
-- ============================================================================
-- Date:    2026-04-30
-- Track:   A — Schema hardening & seed data
-- Path:    database/scripts/20260430_kds_hardening.sql
-- Scope:   kitchen_tickets timestamp-invariant CHECK constraints +
--          kitchen_ticket_events idempotency lookup index.
--          Supplements the platform-wide 20260410_mvp_hardening.sql with the
--          KDS-specific hardening that the platform script does not cover.
--
-- WHY THIS LIVES IN scripts/ AND NOT prisma/migrations/
--   Prisma's migration engine tracks every directory under prisma/migrations/
--   in its _prisma_migrations table and checksums migration.sql against what
--   `prisma migrate dev` would generate. Hand-written DDL placed there will be
--   silently absorbed by `prisma migrate deploy` with a wrong checksum, then
--   poison future schema diffs. The team's convention (see
--   20260410_mvp_hardening.sql) is to keep raw hardening in scripts/ and apply
--   it via psql AFTER `prisma migrate deploy`.
--
-- WHAT THIS FILE ADDS
--   1. Forward-direction timestamp invariants (CHECK constraints) on
--      kitchen_tickets that encode the valid lifecycle shape:
--        · Each intermediate/terminal status MUST have its timestamp set.
--        · Timestamps may only be non-NULL when the matching status is set
--          (or a later status that implies it already happened).
--        · cancelled_at and cancellation_reason must appear together.
--      These supplement the existing constraints in 20260410_mvp_hardening.sql
--      which cover only priority_range, lifecycle_monotonic (backward direction),
--      and cancellation_only_when_cancelled.
--
--   2. Partial index on kitchen_ticket_events(request_id) for idempotency
--      lookups (X-Request-Id deduplication on status-change requests).
--
-- WHAT WAS REMOVED IN REVIEW
--   An earlier draft also added kitchen_tickets_queue_partial_idx. That index
--   is a structural duplicate of kitchen_tickets_queue_idx already created by
--   20260410_mvp_hardening.sql (lines 740–742). One owner; the platform script
--   keeps it. Do not re-introduce a second copy.
--
-- SAFETY
--   · Runs in a single transaction.
--   · The new index uses CREATE INDEX IF NOT EXISTS — safe to re-run.
--   · All constraints use DROP IF EXISTS + ADD to be idempotent (matches style
--     of 20260410_mvp_hardening.sql).
--
-- APPLY ORDER
--   Apply AFTER the base Prisma migration and AFTER 20260410_mvp_hardening.sql:
--     pnpm --filter @xfos/database prisma:migrate:deploy
--     psql "$DATABASE_URL" -f database/scripts/20260410_mvp_hardening.sql
--     psql "$DATABASE_URL" -f database/scripts/20260430_kds_hardening.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CHECK CONSTRAINTS: kitchen_tickets timestamp/status invariants
-- ============================================================================
-- The existing 20260410_mvp_hardening.sql covers:
--   · kitchen_tickets_priority_range          (0 <= priority <= 2)
--   · kitchen_tickets_lifecycle_monotonic     (backward: ready_at->started_at->…)
--   · kitchen_tickets_cancellation_only_when_cancelled
--
-- This script adds the forward-direction invariants: if a status has been
-- reached, its corresponding timestamp MUST be set; and timestamps must only
-- appear when the matching (or later) status applies.
--
-- A NOTE ON CANCELLED ROWS
--   Tickets cancelled AFTER reaching PREPARING/READY retain their started_at /
--   ready_at — that is correct, those events did happen. The constraints below
--   permit started_at and ready_at when status = CANCELLED for exactly that
--   reason. completed_at and cancelled_at remain mutually exclusive.
--
-- Pairing rule for (cancelled_at, cancellation_reason):
--   Both NULL or both NOT NULL. Rationale: a cancellation without a reason
--   is an operational mystery; a reason without a timestamp is a ghost.

-- started_at: present when the ticket reached PREPARING (or any later/terminal
-- state, including CANCELLED-after-PREPARING and SERVED); NULL while still NEW.
ALTER TABLE kitchen_tickets
  DROP CONSTRAINT IF EXISTS kitchen_tickets_started_at_status,
  ADD  CONSTRAINT kitchen_tickets_started_at_status
       CHECK (started_at IS NULL OR status IN ('PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'SERVED'));

-- PREPARING must have started_at set
ALTER TABLE kitchen_tickets
  DROP CONSTRAINT IF EXISTS kitchen_tickets_preparing_requires_started_at,
  ADD  CONSTRAINT kitchen_tickets_preparing_requires_started_at
       CHECK ((status != 'PREPARING') OR (started_at IS NOT NULL));

-- ready_at: present iff the ticket reached READY (status READY/COMPLETED/SERVED,
-- or CANCELLED-after-READY); NULL otherwise. CANCELLED rows MAY have ready_at
-- if cancelled from READY, MAY NOT if cancelled from NEW/PREPARING. SERVED
-- always has ready_at because it can only be entered from READY.
ALTER TABLE kitchen_tickets
  DROP CONSTRAINT IF EXISTS kitchen_tickets_ready_at_status,
  ADD  CONSTRAINT kitchen_tickets_ready_at_status
       CHECK (ready_at IS NULL OR status IN ('READY', 'COMPLETED', 'CANCELLED', 'SERVED'));

-- SERVED is a terminal state reached only from READY, so ready_at must be set.
ALTER TABLE kitchen_tickets
  DROP CONSTRAINT IF EXISTS kitchen_tickets_served_requires_ready_at,
  ADD  CONSTRAINT kitchen_tickets_served_requires_ready_at
       CHECK ((status != 'SERVED') OR (ready_at IS NOT NULL));

-- READY must have ready_at set
ALTER TABLE kitchen_tickets
  DROP CONSTRAINT IF EXISTS kitchen_tickets_ready_requires_ready_at,
  ADD  CONSTRAINT kitchen_tickets_ready_requires_ready_at
       CHECK ((status != 'READY') OR (ready_at IS NOT NULL));

-- completed_at: only when COMPLETED
ALTER TABLE kitchen_tickets
  DROP CONSTRAINT IF EXISTS kitchen_tickets_completed_at_status,
  ADD  CONSTRAINT kitchen_tickets_completed_at_status
       CHECK (completed_at IS NULL OR status = 'COMPLETED');

-- COMPLETED must have completed_at set
ALTER TABLE kitchen_tickets
  DROP CONSTRAINT IF EXISTS kitchen_tickets_completed_requires_completed_at,
  ADD  CONSTRAINT kitchen_tickets_completed_requires_completed_at
       CHECK ((status != 'COMPLETED') OR (completed_at IS NOT NULL));

-- cancelled_at: only when CANCELLED
ALTER TABLE kitchen_tickets
  DROP CONSTRAINT IF EXISTS kitchen_tickets_cancelled_at_status,
  ADD  CONSTRAINT kitchen_tickets_cancelled_at_status
       CHECK (cancelled_at IS NULL OR status = 'CANCELLED');

-- CANCELLED must have cancelled_at set
ALTER TABLE kitchen_tickets
  DROP CONSTRAINT IF EXISTS kitchen_tickets_cancelled_requires_cancelled_at,
  ADD  CONSTRAINT kitchen_tickets_cancelled_requires_cancelled_at
       CHECK ((status != 'CANCELLED') OR (cancelled_at IS NOT NULL));

-- cancelled_at and cancellation_reason must appear together (both or neither)
ALTER TABLE kitchen_tickets
  DROP CONSTRAINT IF EXISTS kitchen_tickets_cancellation_fields_paired,
  ADD  CONSTRAINT kitchen_tickets_cancellation_fields_paired
       CHECK ((cancelled_at IS NULL) = (cancellation_reason IS NULL));


-- ============================================================================
-- 2. IDEMPOTENCY INDEX ON kitchen_ticket_events.request_id
-- ============================================================================
-- Allows the BFF to look up whether a status-change request (identified by
-- its X-Request-Id header) has already been processed, without a full table
-- scan. Partial: NULL request_id rows (fire-and-forget events) are excluded.
-- IF NOT EXISTS: safe even on a re-apply.

CREATE INDEX IF NOT EXISTS kitchen_ticket_events_request_id_idx
  ON kitchen_ticket_events (request_id) WHERE request_id IS NOT NULL;


COMMIT;

-- ============================================================================
-- DONE
-- ============================================================================
-- Verification queries:
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'kitchen_tickets'::regclass
--      AND conname LIKE 'kitchen_tickets_%';
--
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'kitchen_ticket_events'
--      AND indexname = 'kitchen_ticket_events_request_id_idx';
-- ============================================================================
