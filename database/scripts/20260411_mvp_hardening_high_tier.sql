-- ============================================================================
-- XFOS · MVP Schema Hardening — High Tier (DEPRECATED 2026-04-26)
-- ============================================================================
-- This file is intentionally a no-op. It exists to preserve the historical
-- file ordering (`20260411_*.sql` runs after `20260410_*.sql`) for any
-- environment that may have run the original.
--
-- ALL OF THE PREVIOUS CONTENTS WERE FOLDED INTO 20260410_mvp_hardening.sql
-- WHEN THAT FILE WAS REWRITTEN ON 2026-04-26.
--
-- Original 20260411 contents (now in 20260410 or obsolete):
--
--   H1 · users.email → CITEXT          → moved to 20260410 §1
--   H2 · user_roles NULLS NOT DISTINCT → moved to 20260410 §7
--   H3 · partial indexes               → moved to 20260410 §6
--   H4 · DROP menu_items.currency      → OBSOLETE (column kept, multi-currency is a real need)
--   H5 · CHECK constraints             → moved to 20260410 §5
--   H6 · ON DELETE SET NULL FKs        → OBSOLETE (composite FKs + app-level NULL'ing)
--   H7 · tenants.deleted_at + helper   → DEFERRED (tenants use TenantStatus.ARCHIVED for soft-archive)
--   H8 · OrderStatus split             → DEFERRED (already addressed in OrderStatus redesign 2026-04-23)
--
-- DO NOT add new content here. New hardening goes in a fresh dated migration.
-- ============================================================================

BEGIN;
-- intentionally empty
COMMIT;
