# 02 — Database Design and Schema

> **Canonical schema lives in [`enums-tables-design/`](../../enums-tables-design/).**
>
> This file used to carry inline DDL. The canonical schema is
> `enums-tables-design/tables/postgresql-schema.md` (the human-readable
> mirror of `xfos/database/prisma/schema.prisma`), and per-table design
> discussions live under `enums-tables-design/tables/<name>.md` and
> `enums-tables-design/enums/<name>.md`.
>
> **Engineers building the MVP should read those, not this file.**
>
> This document is now an overview/index — the principles, the domain map,
> and pointers to the deep-dive docs.

---

## Where to find what

| You want to know… | Read |
|---|---|
| The canonical SQL for every table | [`enums-tables-design/tables/postgresql-schema.md`](../../enums-tables-design/tables/postgresql-schema.md) |
| The Prisma model for every table | [`xfos/database/prisma/schema.prisma`](../../../../xfos/database/prisma/schema.prisma) |
| Why a particular table was designed the way it was | [`enums-tables-design/tables/<table>.md`](../../enums-tables-design/tables/) |
| Every enum value + its design rationale | [`enums-tables-design/enums/ENUMS_REFERENCE.md`](../../enums-tables-design/enums/ENUMS_REFERENCE.md) |
| Per-topic design rationale (auth, numbering, status redesign, etc.) | [`design-discussions/`](../../design-discussions/) |
| The composite-PK pattern, parity-trigger retirement | [`enums-tables-design/tables/HOW_TABLES_ARE_CREATED.md`](../../enums-tables-design/tables/HOW_TABLES_ARE_CREATED.md) |
| The "is this schema sufficient?" review | [`enums-tables-design/tables/SCHEMA_EVALUATION_GUIDE.md`](../../enums-tables-design/tables/SCHEMA_EVALUATION_GUIDE.md) |
| Helper functions, CHECK constraints, partial indexes | [`xfos/database/scripts/20260410_mvp_hardening.sql`](../../../../xfos/database/scripts/20260410_mvp_hardening.sql) |

---

## Design principles (applied schema-wide)

These principles are enforced consistently across all 38 tables. If you
see something in code that violates one of these, treat it as a bug.

### 1. Composite primary keys for tenant-scoped tables

Every tenant-scoped table uses `PRIMARY KEY (tenant_id, id)`. Every
cross-tenant FK is composite:

```sql
FOREIGN KEY (tenant_id, parent_id) REFERENCES parent(tenant_id, id)
```

This makes cross-tenant linking **impossible by FK construction** — a
child row in tenant A cannot reference a parent row in tenant B because
no row exists under that composite key. **No parity triggers anywhere
in the schema.**

**Globally-scoped tables that keep single-column `id` PKs:**
`tenants`, `users`, `user_auth_providers`, `refresh_tokens`,
`phone_otp_attempts`, `plans`, `plan_features`, `subscriptions`.

**Junction tables with nullable `tenant_id` that keep single-column
`id` PKs:** `user_roles`, `audit_logs`. These rely on application-layer
scoping.

### 2. Money is INTEGER cents, never floats

Every monetary column is `INTEGER` (or `BIGINT` for running counters)
with `CHECK (x_cents >= 0)`. Total formulas are enforced by CHECK
constraints (`bills_total_formula`, `orders_total_formula`,
`order_items_line_subtotal_formula`).

### 3. Optimistic concurrency with `version` on user-writable rows

Any table where multiple actors can race a write (orders, bills,
payments, carts, kitchen_tickets, qr_contexts, order_sessions, tables)
carries `version INTEGER NOT NULL DEFAULT 1`. Updates use
`WHERE version = $expected`; mismatches raise application-layer 409s.

### 4. Lifecycle status enums + sibling reason enums

Lifecycle enums stay minimal (e.g. `OrderStatus = SUBMITTED | PREPARING
| READY | COMPLETED | CANCELLED`). The *why* of terminal transitions
lives in a sibling enum (`OrderCancellationReason`,
`CartAbandonedReason`, `OrderSessionCloseReason`,
`QrDeactivationReason`). Gated by `CHECK (status = TERMINAL) =
(reason IS NOT NULL)`.

### 5. Snapshots vs live FKs

When a downstream record needs to survive renames/deletes, pair a
**live FK** with a **snapshot column**:
- `orders.table_id` (live) + `orders.table_ref TEXT` (snapshot of
  `tables.label` at order-create time)
- `cart_items.menu_item_id` (live) + `cart_items.variant_snapshot
  JSONB` + `cart_items.options_snapshot JSONB`
- `order_items.menu_item_id` (live) + `order_items.item_name` +
  variant/options snapshots
- `orders.service_model` (snapshot) vs `tenant_settings.service_model`
  (live)

### 6. Bilingual content inline (`name_km` / `name_en`)

No translation tables. Khmer required + English optional on all
catalog tables (`menu_categories`, `menu_items`, `menu_item_variants`,
`menu_item_option_groups`, `menu_item_options`). Tenant metadata uses
JSONB with bilingual sub-keys (`tenant_settings.address`,
`tenant_settings.description`).

### 7. Daily-reset numbering with explicit `order_date` column

Order numbers reset at tenant-local midnight. Uniqueness is enforced
by `UNIQUE (tenant_id, order_date, order_number)` where `order_date`
is the tenant-local date (from `tenant_settings.timezone`). Allocator
function `allocate_order_number(tenant_id)` returns `(order_date,
order_number)` atomically via row-level locking.

Bill numbers run continuously (never reset) for financial/audit
compliance — `LB-B-000125` style.

### 8. Soft delete via `is_active BOOLEAN` (preferred)

For tables where history must be preserved, `is_active = FALSE`
is the soft-delete marker. `deleted_at TIMESTAMP` is used only when
the *moment* of deactivation matters as much as the fact (e.g.
`menu_categories.deleted_at`).

### 9. Partial unique indexes for "at most one X" rules

Postgres partial unique indexes enforce invariants like:
- One ACTIVE cart per session: `UNIQUE (tenant_id, session_id) WHERE
  status = 'ACTIVE'` on `carts`.
- One ACTIVE QR per table: `UNIQUE (tenant_id, table_id) WHERE
  is_active = TRUE AND table_id IS NOT NULL` on `qr_contexts`.
- One ACTIVE session per table: same shape on `order_sessions`.
- One ACTIVE subscription per tenant.
- One default variant per menu item.
- At most one primary image per menu item.

These live in the hardening migration since Prisma DSL doesn't express
partial indexes.

### 10. CHECK constraints over app-only validation

Hot tables (orders, bills, payments) get full CHECK suites — money
formulas, status-vs-fields parity, lifecycle monotonicity. The
application *also* validates at the API boundary via Zod, but the DB
is the last line of defense during incidents.

### 11. Append-only logs share the actor-triad shape

Every table that records request-level events
(`audit_logs`, `order_status_history`, `kitchen_ticket_events`,
`idempotency_keys`) carries the same actor attribution:

- `actor_type "AuditActorType" NOT NULL` —
  `USER | SYSTEM | WEBHOOK | CRON | API_KEY`
- `actor_label TEXT` — required when `actor_type != USER`
- `user_id` / `changed_by_id` — required when `actor_type = USER`
- `request_id TEXT` — correlation across all four tables

Cross-table incident investigation: `WHERE request_id = X` against
all four tables reconstructs the full request lifecycle.

### 12. Idempotency requires request-body verification

`idempotency_keys.request_body_hash` is `NOT NULL` and stores
`SHA-256(request_body)`. Retries with the same key but a different
body return `409 Conflict` rather than the cached response. Closes a
real cross-tenant cache-confusion vector.

---

## Domain map (38 tables, organized by domain)

```
┌─────────────────────────────────────────────────────────┐
│  TENANT (10)                                            │
│  tenants, tenant_settings, tenant_operating_hours,      │
│  tenant_payment_methods, setup_progress, tenant_health, │
│  plans, plan_features, subscriptions, tenant_sequences  │
├─────────────────────────────────────────────────────────┤
│  AUTH (6)                                               │
│  users, user_auth_providers, phone_otp_attempts,        │
│  user_roles, refresh_tokens, invitations                │
├─────────────────────────────────────────────────────────┤
│  CATALOG (6)                                            │
│  menu_categories, menu_items, menu_item_images,         │
│  menu_item_variants, menu_item_option_groups,           │
│  menu_item_options                                      │
├─────────────────────────────────────────────────────────┤
│  ORDER (10)                                             │
│  floor_plans, tables, qr_contexts, order_sessions,      │
│  carts, cart_items, orders, order_items,                │
│  order_status_history, idempotency_keys                 │
├─────────────────────────────────────────────────────────┤
│  BILLING (3)                                            │
│  bills, bill_orders, payments                           │
├─────────────────────────────────────────────────────────┤
│  KITCHEN (2)                                            │
│  kitchen_tickets, kitchen_ticket_events                 │
├─────────────────────────────────────────────────────────┤
│  ADMIN (1)                                              │
│  audit_logs                                             │
└─────────────────────────────────────────────────────────┘
```

**No** translation tables (`menu_category_translations`,
`menu_item_translations`) — collapsed 2026-04-23 with Khmer required
inline.

**No** `provisioning_jobs`, `tenant_themes`, `roles`, `payment_attempts` — these
were earlier-iteration designs; current schema covers their concerns
elsewhere (`setup_progress`, `tenant_settings.primary_color`,
`Role` enum, multiple `payments` rows per bill).

---

## Enums (27 of them)

Documented in [`enums-tables-design/enums/ENUMS_REFERENCE.md`](../../enums-tables-design/enums/ENUMS_REFERENCE.md). Each
enum also has a dedicated `<enum-name>.md` design doc in the same folder.

| Domain | Enums |
|---|---|
| Tenant | `TenantStatus`, `ServiceModel`, `PayTiming`, `SubscriptionStatus` |
| Auth | `UserStatus`, `Role`, `InvitationStatus`, `AuthProvider` |
| Order — QR + session | `QrContextType`, `QrDeactivationReason`, `OrderSessionStatus`, `OrderSessionCloseReason` |
| Order — cart + order | `CartStatus`, `CartAbandonedReason`, `OrderStatus`, `OrderCancellationReason`, `OrderSource` |
| Order — tables | `TableShape`, `TableStatus` |
| Billing | `BillStatus`, `PaymentStatus`, `PaymentMethod` |
| Kitchen | `TicketStatus` |
| Admin | `AuditCategory`, `AuditSeverity`, `AuditActorType` |
| Cross-cutting | `Locale`, `Currency` |

The `xfos/contracts/enums/index.ts` file mirrors all of these as Zod
enums for runtime validation. Keep three sources in sync: Prisma
schema, contracts/enums, design docs.

---

## How tables get created (Postgres → Prisma → app)

End-to-end pipeline documented in
[`enums-tables-design/tables/HOW_TABLES_ARE_CREATED.md`](../../enums-tables-design/tables/HOW_TABLES_ARE_CREATED.md).
Summary:

1. `xfos/database/prisma/schema.prisma` is the source of truth for the
   table structure.
2. `prisma migrate dev` generates `prisma/migrations/<timestamp>/migration.sql`.
3. After applying the Prisma migration, run
   `xfos/database/scripts/20260410_mvp_hardening.sql` for everything
   Prisma DSL can't express:
   - 60+ CHECK constraints
   - Partial indexes (the one-active-per-X invariants, alert-feed
     partials, retention cleanup partials)
   - `setup_progress.go_live_ready` GENERATED STORED column
   - Helper functions (`allocate_order_number`, `allocate_bill_number`,
     `cleanup_expired_idempotency_keys`)
   - `citext` extension + `users.email → CITEXT` retype
   - `user_roles` UNIQUE NULLS NOT DISTINCT (PG 15+)

The hardening migration is idempotent and re-runnable.

---

## "Where do I find this column?" cheat sheet

Some columns appear in multiple tables. Quick reference:

| Concern | Lives on |
|---|---|
| Tenant FK | Every tenant-scoped table — first column, part of composite PK |
| `version` (OCC) | `orders`, `bills`, `payments`, `carts`, `kitchen_tickets`, `qr_contexts`, `order_sessions`, `tables` |
| `request_id` correlation | `audit_logs`, `order_status_history`, `kitchen_ticket_events`, `idempotency_keys` |
| Bilingual `name_km` / `name_en` | `tenants`, all `menu_*` tables |
| Money breakdown (subtotal/discount/tax/service/tip/total) | `orders` (no tip), `bills` (with tip), `order_sessions` (running totals) |
| `*_by_id` accountability FKs to `users` | 17+ places — see `enums-tables-design/tables/users.md` Part 5 incoming references |
| Snapshot for receipt durability | `orders.table_ref`, `order_sessions.table_ref`, `bills.table_ref`, `kitchen_tickets.table_ref`; `*_snapshot JSONB` on `cart_items` and `order_items` |

---

## What this doc deliberately does not include

- **Inline DDL.** Use `postgresql-schema.md` (canonical) or
  `schema.prisma` (executable).
- **Per-column rationale.** Use the per-table docs in
  `enums-tables-design/tables/<name>.md`.
- **Per-topic design rationale.** Use the docs in
  `design-discussions/` (auth, numbering, status redesign, service-model,
  pricing, onboarding, tenant-settings, menu-items).
- **CHECK constraint inventory.** Use
  `xfos/database/scripts/20260410_mvp_hardening.sql` §5.

If you find a contradiction between this overview and any of the
canonical sources above, **the canonical source wins.**
