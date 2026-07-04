# Table Reference: `bills`

**Domain:** Billing
**Tenant-scoped:** Yes (composite PK `(tenant_id, id)`)
**Last upgrade:** 2026-04-25 (composite PK; full monetary breakdown; `version` OCC; `amount_paid_cents`; closure + void accountability; `table_id` live FK)

---

## Part 1 — Overview

The `bills` table is the financial aggregation layer between orders and payments. Every payment in XFOS is made against a bill, never directly against an order. This indirection exists because the relationship between orders and bills varies by service model:

- **STALL_KIOSK + PAY_BEFORE:** One order produces one bill. The customer pays before the kitchen starts. No session involved.
- **STALL_KIOSK + PAY_AFTER (open tab):** Multiple orders accumulate under a session. One bill covers all of them when the customer requests it.
- **DINE_IN_TABLE:** A session is anchored to a physical table. The customer places multiple orders over the meal. One bill covers the entire session at the end.

The bill is the entity that the `payments` table points at. A bill can have multiple payment attempts (e.g., an ABA QR expires and the customer retries). The bill's `status` tracks the aggregate outcome: is this bill settled or not?

Bill numbers are human-readable (`LB-B-000001`, `LB-B-000002`, ...) and generated atomically via the `allocate_bill_number(tenant_id)` Postgres function from the `tenant_sequences` table. Format: `{tenants.code_prefix}-B-{6+ digit zero-padded running counter}`. The `-B-` infix distinguishes bill numbers from order numbers at a glance (`LB-042` is an order, `LB-B-000125` is a bill). Bill numbers are **running sequential — never reset** — because financial/audit contexts expect non-resetting invoice numbering. They are unique per tenant, not globally. See `design-discussions/order-numbering-strategy.md` for the full rationale.

---

## Part 2 — CREATE TABLE

```sql
CREATE TABLE bills (
  tenant_id          TEXT NOT NULL,
  id                 TEXT NOT NULL,
  session_id         TEXT,                              -- composite FK below
  table_id           TEXT,                              -- live FK to tables (composite); nullable
  table_ref          TEXT,                              -- snapshot of tables.label at bill-open time
  bill_number        TEXT NOT NULL,                     -- 'LB-B-000125' — running sequential (never resets)
  status             "BillStatus" NOT NULL DEFAULT 'OPEN',

  -- Monetary breakdown (integer cents)
  subtotal_cents       INTEGER NOT NULL DEFAULT 0,
  discount_cents       INTEGER NOT NULL DEFAULT 0,
  tax_cents            INTEGER NOT NULL DEFAULT 0,
  service_charge_cents INTEGER NOT NULL DEFAULT 0,
  tip_cents            INTEGER NOT NULL DEFAULT 0,
  total_cents          INTEGER NOT NULL DEFAULT 0,
  amount_paid_cents    INTEGER NOT NULL DEFAULT 0,      -- running total of SUCCEEDED payments
  currency             "Currency" NOT NULL DEFAULT 'USD',

  notes              TEXT,

  -- Optimistic concurrency
  version            INTEGER NOT NULL DEFAULT 1,

  -- Closure accountability
  paid_at            TIMESTAMP(3),
  closed_by_id       TEXT REFERENCES users(id),         -- single-column FK: users is global

  -- Void accountability (cancellation/refund of unpaid bill)
  voided_at          TIMESTAMP(3),
  voided_by_id       TEXT REFERENCES users(id),
  void_reason        TEXT,

  created_at         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP(3) NOT NULL,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, session_id) REFERENCES order_sessions(tenant_id, id),
  FOREIGN KEY (tenant_id, table_id)   REFERENCES tables(tenant_id, id),
  UNIQUE (tenant_id, bill_number),

  -- Hygiene CHECK constraints
  CONSTRAINT bills_subtotal_nonneg          CHECK (subtotal_cents       >= 0),
  CONSTRAINT bills_discount_nonneg          CHECK (discount_cents       >= 0),
  CONSTRAINT bills_tax_nonneg               CHECK (tax_cents            >= 0),
  CONSTRAINT bills_service_charge_nonneg    CHECK (service_charge_cents >= 0),
  CONSTRAINT bills_tip_nonneg               CHECK (tip_cents            >= 0),
  CONSTRAINT bills_total_nonneg             CHECK (total_cents          >= 0),
  CONSTRAINT bills_amount_paid_nonneg       CHECK (amount_paid_cents    >= 0),
  CONSTRAINT bills_discount_le_subtotal     CHECK (discount_cents <= subtotal_cents),
  CONSTRAINT bills_total_formula
    CHECK (total_cents = subtotal_cents - discount_cents + tax_cents + service_charge_cents + tip_cents),
  CONSTRAINT bills_amount_paid_le_total
    CHECK (amount_paid_cents <= total_cents),
  CONSTRAINT bills_paid_status_matches_amount
    CHECK ((status != 'PAID') OR (amount_paid_cents = total_cents)),
  CONSTRAINT bills_voided_only_when_voided
    CHECK ((status = 'VOIDED') OR (voided_at IS NULL AND voided_by_id IS NULL AND void_reason IS NULL)),
  CONSTRAINT bills_paid_at_when_paid
    CHECK ((status != 'PAID') OR (paid_at IS NOT NULL))
);

CREATE INDEX ON bills (tenant_id, status);
CREATE INDEX ON bills (tenant_id, session_id);
CREATE INDEX ON bills (tenant_id, table_id);
CREATE INDEX ON bills (tenant_id, created_at DESC);                          -- "today's bills" dashboard
```

### Notes on the 2026-04-25 enterprise upgrade

- **Composite-PK + composite FKs** to `order_sessions(tenant_id, id)` and
  `tables(tenant_id, id)` make cross-tenant linking impossible by
  construction. The old `bills_session_tenant_parity` trigger is gone.
- **Full monetary breakdown.** `subtotal_cents`, `discount_cents`,
  `tax_cents`, `service_charge_cents`, `tip_cents`, `total_cents` —
  matches the breakdown on `orders`. Receipts can show line-by-line tax /
  service charge instead of just a total. `bills_total_formula` CHECK
  guarantees the math is correct at the DB level.
- **`amount_paid_cents`.** Running total of confirmed payments. Drives the
  `OPEN → PARTIALLY_PAID → PAID` transitions reliably. Combined with
  `bills_paid_status_matches_amount` CHECK, status drift is impossible.
- **`version` OCC.** Multiple cashiers in the merchant portal can edit a
  shared bill (e.g. discounting, tip adjustment). OCC prevents lost updates.
- **`closed_by_id`.** Records which staff member marked the bill paid —
  important for end-of-day reconciliation and fraud audits.
- **Void accountability.** `voided_at` + `voided_by_id` + `void_reason`
  capture the "why" when a staff member voids an OPEN bill (e.g. customer
  walked out, system error). The CHECK `bills_voided_only_when_voided`
  prevents stray void fields on non-voided bills.
- **`table_id` live FK + `table_ref` snapshot.** Same pair pattern as
  `orders` and `order_sessions`: the live FK powers "what's at this table"
  queries, the snapshot survives table renames so historical bills still
  show "Table 5" even if the table is later renamed "VIP Booth".

---

## Part 3 — Column-by-Column

| Column | Type | Nullable | Default | Purpose | Constraints | Why |
|--------|------|----------|---------|---------|-------------|-----|
| `id` | `TEXT` | No | App-generated cuid | Primary key. System-internal identifier, never shown to customers or on receipts. | `PRIMARY KEY` | Cuid is generated by the application layer (Prisma). Text-based IDs avoid integer sequence guessing and are safe across distributed systems. |
| `tenant_id` | `TEXT` | No | None | Links this bill to the owning tenant. Every query against `bills` MUST include `WHERE tenant_id = ?` to enforce tenant isolation. | `NOT NULL`, `REFERENCES tenants(id) ON DELETE CASCADE` | Application-layer tenant isolation (no RLS). The CASCADE ensures tenant deletion cleans up all bills. The `tenant_id` comes from the JWT claim via `TenantGuard`, never from the request body. |
| `session_id` | `TEXT` | Yes | `NULL` | Links to the `order_sessions` row when this bill belongs to a multi-order session. NULL for STALL_KIOSK + PAY_BEFORE (no session needed). | `REFERENCES order_sessions(id)` | DINE_IN_TABLE and PAY_AFTER flows use sessions to group orders. A stall kiosk with pay-before creates one order = one bill with no session. Nullable because not all service models require sessions. |
| `table_ref` | `TEXT` | Yes | `NULL` | Human-readable table identifier (e.g., "Table 5", "A3"). Denormalized from the session or QR context for display convenience. | None | A Phnom Penh bai sach chrouk shop with numbered tables wants "Table 5" printed on the bill. Storing it here avoids joining back to `order_sessions` or `qr_contexts` on every bill render. NULL for counter-service stalls that have no tables. |
| `bill_number` | `TEXT` | No | None | Human-readable bill identifier, formatted as `{tenants.code_prefix}-B-{6+ digits}`, e.g. `LB-B-000125`. Generated by `allocate_bill_number(tenant_id)`. Running sequential — **never resets** (financial/audit context). Primarily shown in the merchant portal's bills view, in accounting exports, and on receipts when tax compliance requires it. Customers generally do not quote this — they reference orders by `order_number`. | `NOT NULL`, `UNIQUE (tenant_id, bill_number)` | Running counters with tenant prefix: each tenant has their own counter space (LB-B-000001 at Lucky Burger and BQ-B-000001 at Boba Queen are independent). The `-B-` infix prevents visual confusion with order numbers (`LB-042`). Generated via Postgres function, not application code, to prevent race conditions under concurrent requests. |
| `status` | `"BillStatus"` | No | `'OPEN'` | Current lifecycle state of the bill. Enum values: `OPEN`, `PARTIALLY_PAID`, `PAID`, `VOIDED`. | `NOT NULL`, `DEFAULT 'OPEN'` | The state machine is: `OPEN` (just created, no payment confirmed yet — the bill stays `OPEN` while payment attempts are in-flight; in-flight state is tracked on the `payments` table, not here) -> `PARTIALLY_PAID` (at least one payment succeeded but the total is not yet covered) -> `PAID` (full amount confirmed) or `VOIDED` (manually cancelled by staff). There is no `REFUNDED` status on bills — refunds are tracked on `PaymentStatus.REFUNDED` at the payment level. |
| `subtotal_cents` | `INTEGER` | No | `0` | Sum of all linked orders' totals before any bill-level adjustments. Stored in cents to avoid floating-point errors. | `NOT NULL`, `DEFAULT 0`, `CHECK (subtotal_cents >= 0)` | Integer cents is the universal money representation in XFOS. A $2.50 subtotal is stored as `250`. Defaults to 0 because the bill may be created before orders are linked (session-based flows). |
| `total_cents` | `INTEGER` | No | `0` | Final amount the customer owes. Currently equals `subtotal_cents` (MVP has no discounts or tax). | `NOT NULL`, `DEFAULT 0`, `CHECK (total_cents >= 0)`, `CHECK (total_cents >= subtotal_cents)` | Separated from subtotal to leave room for future discount/tax/surcharge calculations without a schema migration. The `total_cents >= subtotal_cents` constraint prevents negative discounts from producing a bill below the subtotal — revisit if discount support is added. |
| `currency` | `"Currency"` | No | `'USD'` | ISO 4217 currency code. Snapshotted at bill creation time from `tenant_settings.currency`. | `NOT NULL`, `DEFAULT 'USD'`, Postgres `"Currency"` enum | Cambodia is USD-dominant for commerce. Some tenants may use KHR (Cambodian Riel). The value is snapshotted, not joined from `tenant_settings`, because a tenant could theoretically change their currency later and existing bills must retain their original currency. |
| `paid_at` | `TIMESTAMP(3)` | Yes | `NULL` | Timestamp when the bill transitioned to `PAID`. Set by the payment confirmation handler. | None | NULL until payment is confirmed. Used for revenue reporting ("show me all bills paid today"), receipt timestamps, and reconciliation with ABA PayWay transaction records. A Siem Reap restaurant owner checking their daily revenue dashboard filters by `paid_at`. |
| `created_at` | `TIMESTAMP(3)` | No | `CURRENT_TIMESTAMP` | Row creation time. Set automatically by Postgres. | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | Audit trail and debugging. Also used for "bills created today" queries in the merchant portal. |
| `updated_at` | `TIMESTAMP(3)` | No | None (Prisma-managed) | Last modification time. Maintained by Prisma's `@updatedAt` directive. | `NOT NULL` | Optimistic concurrency detection and cache invalidation. Prisma sets this automatically on every `UPDATE`. |

---

## Part 4 — Indexes

| Index | Columns | Type | Query it serves | Example SQL |
|-------|---------|------|-----------------|-------------|
| `bills_tenant_id_bill_number_key` | `(tenant_id, bill_number)` | Unique | Look up a bill by its human-readable number within a tenant. Used by merchant portal search and accounting exports. Bill numbers never reset, so this constraint is straightforward (unlike `orders.order_number` which resets daily). | `SELECT * FROM bills WHERE tenant_id = $1 AND bill_number = 'LB-B-000125';` |
| `bills_tenant_id_status_idx` | `(tenant_id, status)` | B-tree | List all open or partially-paid bills for a tenant. Powers the merchant portal's "open bills" view and the kitchen's awareness of outstanding payments. | `SELECT * FROM bills WHERE tenant_id = $1 AND status = 'OPEN' ORDER BY created_at DESC;` |

---

## Part 5 — Relationships

| FK Column | References | Cascade Behavior | Notes |
|-----------|------------|-------------------|-------|
| `tenant_id` | `tenants(id)` | `ON DELETE CASCADE` | Tenant deletion removes all bills. In production, `permanent_delete_tenant()` handles this in batched order to avoid long locks. |
| `(tenant_id, session_id)` | `order_sessions(tenant_id, id)` | Default (no cascade) | Composite FK enforces same-tenant. A session closing is a logical event, not a data deletion. |
| `(tenant_id, table_id)` | `tables(tenant_id, id)` | Default (no cascade) | Live link to dine-in table for "what's at this table" queries. Cross-tenant linking impossible by construction. |
| `closed_by_id` | `users(id)` | (no action) | Single-column because `users` is global. |
| `voided_by_id` | `users(id)` | (no action) | Single-column because `users` is global. |

**Reverse relationships (other tables pointing to `bills`):**

| Table | FK Column | Cascade |
|-------|-----------|---------|
| `bill_orders` | `bill_id` | `ON DELETE CASCADE` — deleting a bill removes all its order associations. |
| `payments` | `bill_id` | `ON DELETE CASCADE` — deleting a bill removes all payment attempts. |

---

## Part 6 — Real-World Usage Scenarios

### Scenario 1: Stall kiosk, pay-before (Lok Lak cart near Central Market, Phnom Penh)

A customer scans the QR code taped to the counter. They add Beef Lok Lak ($5.00) and an Iced Coffee ($1.50) to their cart and tap "Order & Pay". The system:

1. Calls `allocate_bill_number(tenant_id)` -> `'LB-B-000017'`.
2. Creates a `bills` row: `subtotal_cents = 650`, `total_cents = 650`, `status = 'OPEN'`, `session_id = NULL`.
3. Creates a `payments` row with `status = 'INITIATED'`. Displays the ABA QR payment screen. Payment status moves to `PENDING`. Bill stays `OPEN` — in-flight payment state is tracked on the `payments` table, not the bill.
4. ABA webhook confirms payment. Payment status moves to `SUCCEEDED`. Bill status moves to `PAID`, `paid_at` is set.
5. NOW creates the `orders` row with `total_cents = 650`, `status = 'SUBMITTED'`, and a kitchen ticket.
6. Creates a `bill_orders` junction row linking this bill to this order.

### Scenario 2: Dine-in table, pay-after (Khmer BBQ restaurant, Siem Reap)

A group sits at Table 3 and scans the table QR. An `order_session` is created. Over 45 minutes they place three separate orders:

1. Order 1: Grilled pork skewers ($3.00) + sticky rice ($1.00) -> `ORD-000088`
2. Order 2: Two more beers ($2.50 each) -> `ORD-000089`
3. Order 3: Fried spring rolls ($2.00) -> `ORD-000090`

Each order immediately produces a kitchen ticket (no payment needed yet). When they are ready to leave, a staff member taps "Generate Bill" in the merchant portal. The system:

1. Calls `allocate_bill_number(tenant_id)` -> `'BQ-B-000031'`.
2. Creates a `bills` row: `subtotal_cents = 1100`, `total_cents = 1100`, `session_id = <session>`, `table_ref = 'Table 3'`.
3. Creates three `bill_orders` rows linking the bill to all three orders.
4. Customer pays via ABA QR. Bill -> `PAID`. Session -> `CLOSED`.

### Scenario 3: ABA QR expires, customer retries

A customer at a noodle stall sees the ABA QR on their phone but gets distracted. After 5 minutes the QR expires. The first `payments` row moves to `EXPIRED`. The bill stays `OPEN` — it does not bounce between statuses for in-flight payment attempts. The customer taps "Try Again", a new `payments` row is created (`INITIATED` -> `PENDING`) with a fresh ABA QR, and the bill remains `OPEN` until the second attempt succeeds, at which point it moves to `PAID`.

---

## Part 7 — Design Decisions

1. **Bill is separate from Order.** Many food-ordering systems treat the order as the billing entity. XFOS separates them because dine-in and open-tab flows need N orders consolidated into one bill. The `bill_orders` junction table makes this possible without N:1 hacks on the order table.

2. **No `REFUNDED` status on bills.** The `BillStatus` enum has `OPEN`, `PARTIALLY_PAID`, `PAID`, and `VOIDED`, but no `REFUNDED`. Refunds are tracked at the payment level (`PaymentStatus.REFUNDED`). A bill that was fully refunded stays `PAID` — the refund is recorded on the individual payment rows. A dedicated `refund_logs` table may be added post-MVP for detailed refund tracking.

3. **`subtotal_cents` and `total_cents` are both stored.** At MVP they are always equal (no discounts, no tax). They are separated now so that adding a discount or service charge later requires only application logic changes, not a schema migration.

4. **`currency` is snapshotted, not joined.** If a tenant switches from USD to KHR, existing bills retain their original currency. This is standard for financial records.

5. **Bill number generation is Postgres-native.** The `allocate_bill_number()` function uses `UPDATE ... RETURNING` on `tenant_sequences`, which row-locks atomically. This prevents duplicate bill numbers under concurrent requests without relying on Redis or application-level locking.

6. **No dedicated `bill_status_history` table.** Bill state transitions are currently recorded only in `audit_logs` (e.g., `action = 'bill.paid'`). The `SCHEMA_EVALUATION_GUIDE.md` flags this as a gap — bills are financial entities and arguably deserve a typed history table like orders have. This is deferred to post-MVP.

7. **`table_ref` is denormalized.** It duplicates data from the session or QR context. This is intentional: receipts and the merchant portal need to show "Table 3" without joining three tables.

---

## Part 8 — Related Tables

| Table | Relationship | Purpose |
|-------|-------------|---------|
| `tenants` | Parent (1:N) | Tenant that owns this bill. |
| `order_sessions` | Optional parent (N:1) | Session that groups multiple orders into this bill. NULL for pay-before stall flows. |
| `bill_orders` | Junction (M:N with `orders`) | Links one or more orders to this bill. See `bill-orders.md`. |
| `payments` | Child (1:N) | Payment attempts against this bill. Multiple attempts possible (QR expiry + retry). See `payments.md`. |
| `audit_logs` | Loose reference via `entity_type = 'Bill'` | Records bill lifecycle events (`bill.created`, `bill.paid`, `bill.voided`). See `audit-logs.md`. |
| `tenant_sequences` | Indirect (via `allocate_bill_number()`) | Source of the monotonic bill number counter for this tenant. |
