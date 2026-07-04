# Table Reference: `bill_orders`

**Domain:** Billing
**Tenant-scoped:** Yes (composite PK `(tenant_id, bill_id, order_id)`)
**Last upgrade:** 2026-04-25 (composite PK; composite FKs to `bills` and `orders`; parity trigger removed)

---

## Part 1 — Overview

`bill_orders` is the many-to-many junction table connecting `bills` to `orders`. It exists because the relationship between bills and orders is not always 1:1:

- **STALL_KIOSK + PAY_BEFORE:** 1 order = 1 bill. The junction has exactly one row per bill.
- **STALL_KIOSK + PAY_AFTER (open tab):** N orders = 1 bill. The customer accumulates orders during a session and pays once at the end.
- **DINE_IN_TABLE:** N orders = 1 bill. A table's entire session is covered by a single bill when the group asks for the check.

The table uses a composite primary key `(tenant_id, bill_id, order_id)`.
This enforces uniqueness at the database level — an order can only appear
on a given bill once — and makes the row tenant-locatable directly.

Both `bill_id` and `order_id` are bound by **composite foreign keys** that
include `tenant_id`. This means a `bill_orders` row can only link a bill
and an order from the *same* tenant — cross-tenant linking is impossible
by construction. No parity trigger is needed (the old
`bill_orders_tenant_parity` was deleted in the 2026-04-25 sweep).

---

## Part 2 — CREATE TABLE

```sql
CREATE TABLE bill_orders (
  tenant_id TEXT NOT NULL,
  bill_id   TEXT NOT NULL,
  order_id  TEXT NOT NULL,
  added_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (tenant_id, bill_id, order_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, bill_id)  REFERENCES bills(tenant_id, id)  ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX ON bill_orders (tenant_id, order_id);   -- reverse lookup: order -> bill
```

The composite FKs replace the previous `bill_orders_tenant_parity` trigger
entirely. With single-column FKs, a row could carry `tenant_id = T1` while
referencing a bill from T2 — the trigger had to catch that. With composite
FKs, the database itself rejects the row because no
`bills(T1, bill_id)` row exists when the bill belongs to T2.

---

## Part 3 — Column-by-Column

| Column | Type | Nullable | Default | Purpose | Constraints | Why |
|--------|------|----------|---------|---------|-------------|-----|
| `tenant_id` | `TEXT` | No | None | Denormalized tenant identifier. Must match the `tenant_id` of both the referenced bill and the referenced order. | `NOT NULL`, `REFERENCES tenants(id) ON DELETE CASCADE`, parity trigger on INSERT/UPDATE | This is the C1/C2 denormalization pattern. Without this column, filtering bill-order associations by tenant would require joining to `bills` or `orders`. With it, `WHERE tenant_id = ?` works directly on the junction table. The parity trigger is the belt-and-braces safety net: even if application code has a bug, the database will reject a cross-tenant link. |
| `bill_id` | `TEXT` | No | None | References the bill this association belongs to. Part of the composite primary key. | `NOT NULL`, `REFERENCES bills(id) ON DELETE CASCADE`, part of `PRIMARY KEY (bill_id, order_id)` | Deleting a bill cascades to remove all its order associations. This is correct because if a bill is deleted (e.g., during tenant data cleanup via `permanent_delete_tenant()`), the associations are meaningless without the bill. |
| `order_id` | `TEXT` | No | None | References the order linked to this bill. Part of the composite primary key. | `NOT NULL`, `REFERENCES orders(id) ON DELETE CASCADE`, part of `PRIMARY KEY (bill_id, order_id)` | Deleting an order also cascades to remove its bill association. The composite PK `(bill_id, order_id)` prevents duplicate links — an order cannot be added to the same bill twice. |
| `added_at` | `TIMESTAMP(3)` | No | `CURRENT_TIMESTAMP` | Timestamp when this order was linked to the bill. | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | In session-based flows, orders are added to a bill one at a time as they are placed. `added_at` records when each addition happened. For pay-before flows where the bill and order are created simultaneously, `added_at` equals the creation time. This is useful for debugging and for displaying the order timeline on a bill receipt. |

---

## Part 4 — Indexes

| Index | Columns | Type | Query it serves | Example SQL |
|-------|---------|------|-----------------|-------------|
| `PRIMARY KEY` | `(bill_id, order_id)` | Unique (B-tree) | Forward lookup: given a bill, find all its orders. This is the primary access pattern — rendering a bill requires fetching all associated orders. | `SELECT o.* FROM bill_orders bo JOIN orders o ON o.id = bo.order_id WHERE bo.bill_id = $1 AND bo.tenant_id = $2;` |
| `bill_orders_order_id_idx` | `(order_id)` | B-tree | Reverse lookup: given an order, find which bill it belongs to. Used by the storefront status page to show payment status for an order. | `SELECT b.* FROM bill_orders bo JOIN bills b ON b.id = bo.bill_id WHERE bo.order_id = $1 AND bo.tenant_id = $2;` |
| `bill_orders_tenant_idx` | `(tenant_id)` | B-tree | Tenant-scoped scans and the `permanent_delete_tenant()` cleanup function. | `DELETE FROM bill_orders WHERE tenant_id = $1;` |

---

## Part 5 — Relationships

| FK Column | References | Cascade Behavior | Notes |
|-----------|------------|-------------------|-------|
| `tenant_id` | `tenants(id)` | `ON DELETE CASCADE` | Tenant deletion removes all junction rows. |
| `bill_id` | `bills(id)` | `ON DELETE CASCADE` | Bill deletion removes all its order links. The orders themselves survive — they are independent entities. |
| `order_id` | `orders(id)` | `ON DELETE CASCADE` | Order deletion removes its bill link. The bill itself survives and may still have other orders linked to it (session-based flows). |

**Parity trigger:** `bill_orders_tenant_parity_trg` fires on every INSERT and UPDATE, checking that `NEW.tenant_id` matches both `bills.tenant_id` (for `NEW.bill_id`) and `orders.tenant_id` (for `NEW.order_id`). If either parent is missing or the tenant IDs disagree, the operation is rejected with a descriptive error.

---

## Part 6 — Real-World Usage Scenarios

### Scenario 1: Single order, single bill (street noodle stall, Phnom Penh)

A customer at a Kuy Teav stall orders a bowl of noodle soup ($2.00). The system creates one order (`ORD-000055`) and one bill (`BILL-000033`). A single `bill_orders` row is inserted:

```
tenant_id = 'clx_noodle_stall_01'
bill_id   = 'clx_bill_033'
order_id  = 'clx_order_055'
added_at  = 2026-04-09 11:32:17.123
```

The customer pays via ABA QR. Done. One row in `bill_orders`, one bill, one order.

### Scenario 2: Multiple orders, one bill (Khmer BBQ restaurant, Siem Reap)

A family at Table 7 places three orders over an hour:

| Time | Order | Items | Total |
|------|-------|-------|-------|
| 18:05 | ORD-000120 | Grilled beef, sticky rice | $6.00 |
| 18:25 | ORD-000121 | 2x Angkor beer | $5.00 |
| 18:50 | ORD-000122 | Fried banana dessert | $2.00 |

At 19:15, the family asks for the bill. The system creates `BILL-000048` with `total_cents = 1300` and inserts three `bill_orders` rows:

```
(tenant_id, bill_id, order_id, added_at)
('clx_bbq_sr', 'clx_bill_048', 'clx_order_120', '2026-04-09 19:15:01.000')
('clx_bbq_sr', 'clx_bill_048', 'clx_order_121', '2026-04-09 19:15:01.001')
('clx_bbq_sr', 'clx_bill_048', 'clx_order_122', '2026-04-09 19:15:01.002')
```

The bill aggregates all three orders. The receipt lists every item from every order.

### Scenario 3: Tenant parity trigger prevents a bug

A hypothetical application bug attempts to link a bill from Tenant A (a coffee shop) to an order from Tenant B (a pizza place). The INSERT:

```sql
INSERT INTO bill_orders (tenant_id, bill_id, order_id)
VALUES ('tenant_a', 'bill_from_tenant_a', 'order_from_tenant_b');
```

The `bill_orders_tenant_parity` trigger fires. It finds that `orders.tenant_id` for `order_from_tenant_b` is `'tenant_b'`, which does not match `NEW.tenant_id = 'tenant_a'`. The trigger raises:

```
ERROR: bill_orders: tenant mismatch with order (row=tenant_a, order=tenant_b)
```

The INSERT is rejected. Cross-tenant data corruption is prevented at the database level.

---

## Part 7 — Design Decisions

1. **Composite primary key, no surrogate id.** The natural key `(bill_id, order_id)` is the identity of this relationship. A surrogate `id TEXT` would add no value — you never look up a bill-order link by its own id. The composite PK also enforces uniqueness without a separate constraint.

2. **No `id` column.** Unlike every other table in the schema, `bill_orders` has no `id TEXT PRIMARY KEY`. This is intentional for a pure junction table. Prisma handles composite PKs via `@@id([billId, orderId])`.

3. **Denormalized `tenant_id` with dual-parent parity trigger.** Most denormalized `tenant_id` columns in the schema validate against one parent. `bill_orders` validates against two — both `bills` and `orders`. This is the C2 hardening finding: without this trigger, a corrupted junction row could silently bridge two tenants' data.

4. **`added_at` instead of `created_at`.** The column is named `added_at` rather than the conventional `created_at` to emphasize that this records when the order was added to the bill, not when the row itself was created (though in practice they are the same). This is a semantic naming choice for clarity in queries and logs.

5. **CASCADE on both `bill_id` and `order_id`.** Deleting either side of the relationship removes the junction row. This is safe because the junction row has no independent meaning — it only represents the relationship.

---

## Part 8 — Related Tables

| Table | Relationship | Purpose |
|-------|-------------|---------|
| `tenants` | Parent (N:1) | Tenant that owns this association. |
| `bills` | Parent (N:1) | The bill side of the M:N relationship. See `bills.md`. |
| `orders` | Parent (N:1) | The order side of the M:N relationship. |
| `payments` | Indirect (via `bills`) | Payments are made against bills. To find payments for an order, join `bill_orders` -> `bills` -> `payments`. |
| `order_items` | Indirect (via `orders`) | To render a bill with line items, join `bill_orders` -> `orders` -> `order_items`. |
