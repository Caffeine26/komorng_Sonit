# Table Reference: `order_items`

| Property | Value |
|---|---|
| **Domain** | Order |
| **Tenant-scoped** | Yes (composite PK `(tenant_id, id)`) |
| **Prisma model** | `OrderItem` |
| **Table #** | 30 of 38 |
| **Last upgrade** | 2026-04-25 (composite PK, per-line kitchen workflow, partial-cancellation, line_subtotal_cents, audit `created_at`) |

---

## Part 1 — Overview

The `order_items` table stores the individual line items within an order. Each row represents one menu item with a quantity, a snapshotted price, and a pre-calculated line total. Together, the order items for a given order define exactly what the customer ordered and at what price.

The defining design principle of this table is **snapshot isolation**. When an order is placed, the item name and price are captured as immutable snapshots. The `item_name` column stores the localized name as it appeared to the customer at order time. The `unit_price_cents` column stores the price as it was when the order was placed. These values never change, even if the merchant later renames the item, changes the price, or deletes it from the menu entirely.

This means `order_items` is the source of truth for what was ordered and what it cost. The `menu_item_id` FK is a convenience reference back to the catalog (for images, descriptions, and linking), but it is not structurally necessary -- if the menu item is deleted, the order item retains its name and price via `ON DELETE SET NULL` (H6).

Cross-tenant linking via `order_id` or `menu_item_id` is impossible by
construction since 2026-04-25 — both FKs are composite, including
`tenant_id`. No parity trigger needed.

---

## Part 2 — CREATE TABLE

```sql
CREATE TABLE order_items (
  tenant_id            TEXT NOT NULL,
  id                   TEXT NOT NULL,
  order_id             TEXT NOT NULL,
  menu_item_id         TEXT,                                                 -- nullable: menu item may have been deleted
  item_name            TEXT NOT NULL,                                        -- snapshot of localized name at order time

  -- Variant + options snapshots (JSONB)
  variant_snapshot     JSONB,                                                -- e.g. {"id": "var_l", "name_km": "ធំ", "name_en": "Large", "price_cents": 500}
  options_snapshot     JSONB,                                                -- e.g. [{"option_id": "opt_meat", "group_name": "Extras", ...}]

  quantity             INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents     INTEGER NOT NULL CHECK (unit_price_cents >= 0),       -- variant price + sum of option deltas
  line_subtotal_cents  INTEGER NOT NULL CHECK (line_subtotal_cents >= 0),    -- unit_price_cents * quantity (pre-discount)
  line_total_cents     INTEGER NOT NULL CHECK (line_total_cents >= 0),       -- final line amount after any line-level adjustments

  notes                TEXT,

  -- Per-line kitchen workflow (nullable; set when ticket cooks at item granularity)
  kitchen_status       "TicketStatus",
  prepared_at          TIMESTAMP(3),
  ready_at             TIMESTAMP(3),

  -- Per-line cancellation (e.g. out of stock for one item only)
  is_cancelled              BOOLEAN NOT NULL DEFAULT FALSE,
  cancellation_reason       "OrderCancellationReason",
  cancellation_reason_text  TEXT,
  cancelled_at              TIMESTAMP(3),
  cancelled_by_id           TEXT REFERENCES users(id),

  created_at           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, order_id)     REFERENCES orders(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, menu_item_id) REFERENCES menu_items(tenant_id, id),

  CONSTRAINT order_items_line_subtotal_formula
    CHECK (line_subtotal_cents = unit_price_cents * quantity),
  CONSTRAINT order_items_cancellation_reason_only_when_cancelled
    CHECK ((is_cancelled = TRUE) OR (cancellation_reason IS NULL)),
  CONSTRAINT order_items_cancelled_by_only_when_cancelled
    CHECK ((cancelled_by_id IS NULL) OR (is_cancelled = TRUE)),
  CONSTRAINT order_items_kitchen_lifecycle_monotonic
    CHECK ((ready_at IS NULL OR prepared_at IS NOT NULL))
);

CREATE INDEX ON order_items (tenant_id, order_id);
CREATE INDEX ON order_items (tenant_id, menu_item_id);                       -- "how often was item X ordered"
CREATE INDEX ON order_items (tenant_id, kitchen_status) WHERE kitchen_status IS NOT NULL;
```

### Notes on the 2026-04-25 enterprise upgrade

- **Per-line kitchen workflow.** `kitchen_status`/`prepared_at`/`ready_at` let
  the kitchen mark individual items ready while the order as a whole is still
  cooking — useful for staggered serving (e.g. drinks first, food later).
  When NULL, the item inherits the parent ticket's status.
- **Partial cancellation.** A single item can be cancelled (e.g. out of stock)
  without cancelling the whole order. `is_cancelled = TRUE` + `cancellation_reason`
  + optional free-form `cancellation_reason_text` capture the staff's rationale.
  The bill recalculation excludes cancelled lines.
- **`line_subtotal_cents` vs `line_total_cents`.** Subtotal is the raw
  `unit_price * quantity`; total is the final amount on the receipt after any
  line-level adjustments (currently the same; future work could add per-line
  promo discounts).
- **`created_at`.** Added 2026-04-25 to support per-line audit and to
  distinguish items added later (e.g. dine-in "add another round of beers"
  appended to an open session's order).
- **`menu_item_id` FK behaviour.** Composite FK to `menu_items(tenant_id, id)`.
  When a menu item is deleted, the FK constraint will block the delete unless
  the application sets `menu_item_id = NULL` first or unless `ON DELETE SET NULL`
  is added to the FK definition. Application policy: deleting a menu item
  triggers a `UPDATE order_items SET menu_item_id = NULL WHERE menu_item_id = ?`
  step before the delete (replaces the old `ON DELETE SET NULL`).

---

## Part 3 — Column-by-Column

### `id` — TEXT PRIMARY KEY

- **Nullable:** No
- **Default:** None (app-generated cuid)
- **Purpose:** Unique identifier for this line item.
- **Constraints:** Primary key.
- **Why:** Standard cuid pattern. Used for direct lookups (e.g., kitchen display highlighting a specific item).

### `tenant_id` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None (copied from parent order at insert time)
- **Purpose:** Denormalized tenant identifier for direct query isolation.
- **Constraints:** `REFERENCES tenants(id) ON DELETE CASCADE`. Indexed. Parity enforced by `order_items_tenant_parity` trigger.
- **Why:** Critical finding C1 from the schema stress test. Without this column, every query on `order_items` would need to join to `orders` to filter by tenant. With denormalization, the Prisma middleware can add `WHERE tenant_id = ?` directly on every query. The parity trigger guarantees that `order_items.tenant_id` always matches `orders.tenant_id`.

### `order_id` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** The order this item belongs to.
- **Constraints:** `REFERENCES orders(id) ON DELETE CASCADE`. Indexed.
- **Why:** The core structural relationship. `ON DELETE CASCADE` means deleting an order (e.g., during tenant cleanup) removes its items. This is correct because order items have no meaning without their parent order.

### `menu_item_id` — TEXT (nullable after H6)

- **Nullable:** Yes (after H6 hardening; `REFERENCES menu_items(id) ON DELETE SET NULL`)
- **Default:** None
- **Purpose:** Reference back to the catalog item that was ordered.
- **Constraints:** FK to `menu_items(id)` with `ON DELETE SET NULL` (H6).
- **Why:** This is a **convenience reference**, not the source of truth. The source of truth for what was ordered is `item_name` and `unit_price_cents`. The FK exists for:
  - Displaying the item's image on receipts and the status page.
  - Linking to the current menu item for "reorder" functionality.
  - Analytics ("which menu items sell best?").

  After H6, `ON DELETE SET NULL` ensures that deleting a menu item does not cascade-delete historical order data. The order item survives with `menu_item_id = NULL`, retaining its name and price.

### `item_name` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None (snapshotted from `menu_items.name_km` or `name_en` at order time, matching the customer's active locale)
- **Purpose:** The localized name of the item as the customer saw it.
- **Constraints:** None.
- **Why:** This is the most important design decision on this table. The name is **snapshotted at order time**, not read from `menu_items` at display time. Reasons:
  1. **The menu item might be renamed.** "Taro Milk Tea" becomes "Classic Taro Boba." The receipt and kitchen ticket should show what the customer actually ordered, not the new name.
  2. **The menu item might be deleted.** With `ON DELETE SET NULL` on `menu_item_id`, the FK nulls out, but the name survives.
  3. **The translation might change.** The Khmer name "តែទឹកដោះគោតារ៉ូ" might be corrected. Historical orders retain the original.
  4. **No join required.** The kitchen display, receipt, and status page can render the item name directly from `order_items` without joining to `menu_items`. This is critical for the kitchen display, which polls frequently.

  The locale of the snapshot matches the storefront locale the customer was browsing in (usually `km` for Khmer customers, `en` for English).

### `variant_snapshot` — JSONB (nullable)

- **Nullable:** Yes — NULL when the item has no variants
- **Default:** `NULL`
- **Purpose:** The variant the customer chose (Small / Medium / Large etc.), captured as JSONB at order time. Self-contained — does not require `menu_item_variants` to still exist.
- **Shape:**
  ```jsonb
  {
    "id": "var_l",
    "name_km": "ធំ",
    "name_en": "Large",
    "price_cents": 500
  }
  ```
- **Why:** Same snapshot rationale as `item_name` — the variant might be renamed, its price changed, or the row deleted after the order is placed. The receipt must show what the customer actually ordered. Also avoids a join to `menu_item_variants` on every kitchen-screen or receipt render. **Source:** since 2026-04-24, `cart_items.variant_snapshot` carries the same JSONB shape, so cart-to-order conversion is a verbatim column copy — no re-resolution at submit time.

### `options_snapshot` — JSONB (nullable)

- **Nullable:** Yes — NULL (or `[]`) when the customer picked no options
- **Default:** `NULL`
- **Purpose:** The selected options (modifiers, add-ons) captured as a JSONB array at order time.
- **Shape:**
  ```jsonb
  [
    {"option_id": "opt_mild",    "group_name": "Spicy Level", "name_km": "ហឹរតិច",   "name_en": "Mild",        "price_delta_cents": 0},
    {"option_id": "opt_meat",    "group_name": "Extras",      "name_km": "សាច់បន្ថែម", "name_en": "Extra Meat",  "price_delta_cents": 200},
    {"option_id": "opt_cheese",  "group_name": "Extras",      "name_km": "ឈីសបន្ថែម",  "name_en": "Extra Cheese","price_delta_cents": 100}
  ]
  ```
- **Why:** Same snapshot rationale — options rename/retire over time, but past orders must stay faithful. The kitchen needs to see exactly what modifiers the customer asked for; the receipt must show the price breakdown.
- **Note:** `unit_price_cents` already includes the sum of option deltas. The snapshot is for display + audit, not for recomputing price.
- **Source:** since 2026-04-24, `cart_items.options_snapshot` carries the same JSONB shape, so cart-to-order conversion is a verbatim column copy — no re-resolution at submit time.

### `quantity` — INTEGER NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** How many of this item were ordered.
- **Constraints:** `CHECK (quantity > 0)` (H5).
- **Why:** Must be at least 1. An order item with quantity 0 is meaningless and should not exist. The CHECK constraint (H5) is the database-level enforcement; the application validates this via Zod at the API boundary.

### `unit_price_cents` — INTEGER NOT NULL

- **Nullable:** No
- **Default:** None (snapshotted from `menu_items.base_price_cents` at order time)
- **Purpose:** The price per unit at the time the order was placed.
- **Constraints:** `CHECK (unit_price_cents >= 0)` (H5).
- **Why:** Another critical snapshot. Like `item_name`, this is captured at order time and never changes. If the merchant raises the price of BBQ Beef from $6.00 to $7.00, existing orders retain $6.00. The CHECK constraint allows $0.00 (for complimentary items or promotions) but not negative values.

  Stored as integer cents. $6.00 is `600`.

### `line_total_cents` — INTEGER NOT NULL

- **Nullable:** No
- **Default:** None (calculated by the application as `unit_price_cents * quantity`)
- **Purpose:** The total price for this line item: `unit_price_cents * quantity`.
- **Constraints:** `CHECK (line_total_cents >= 0)` (H5). `CHECK (line_total_cents = unit_price_cents * quantity)` (H5).
- **Why:** Pre-calculated and stored (unlike `cart_items`, which has no `line_total_cents`). Reasons:
  1. **Orders are immutable.** The quantity and price never change after creation, so the calculated value is stable. There is no risk of staleness.
  2. **Read performance.** Billing, receipts, kitchen tickets, and analytics all need line totals. Pre-calculating avoids multiplying on every read.
  3. **Data integrity.** The CHECK constraint `line_total_cents = unit_price_cents * quantity` guarantees arithmetic correctness at the database level. If application code has a rounding bug, the INSERT fails rather than silently storing wrong data.

  Example: 3 x BBQ Beef at $6.00 each = `line_total_cents = 600 * 3 = 1800`.

### `notes` — TEXT

- **Nullable:** Yes
- **Default:** None
- **Purpose:** Per-item special instructions from the customer.
- **Constraints:** None.
- **Why:** Copied from `cart_items.notes` at order conversion. Examples:
  - "No onions" / "គ្មានខ្ទឹមបារាំង"
  - "Extra spicy" / "ហឹរច្រើន"
  - "Well done"
  - "Allergic to peanuts"

  These notes appear on the kitchen ticket for the relevant item. Distinct from `orders.notes`, which applies to the entire order.

---

## Part 4 — Indexes

### `PRIMARY KEY (id)`

- **What it serves:** Direct lookups for a specific line item.
- **Example:** `SELECT * FROM order_items WHERE id = 'oi_001'`

### `INDEX ON order_items (order_id)`

- **What it serves:** The most common query -- loading all items for an order. Used by kitchen tickets, receipts, the status page, and the merchant portal.
- **Example:**
  ```sql
  SELECT id, item_name, quantity, unit_price_cents, line_total_cents, notes
  FROM order_items
  WHERE order_id = 'order_001'
  ORDER BY id;
  ```
- **Why:** Every order display requires fetching its items. Without this index, the query scans the entire table.

### `INDEX ON order_items (tenant_id)`

- **What it serves:** Tenant-scoped aggregate queries for analytics and reporting.
- **Example:**
  ```sql
  -- Top selling items this week
  SELECT item_name, SUM(quantity) AS total_sold, SUM(line_total_cents) AS revenue_cents
  FROM order_items
  WHERE tenant_id = 'tenant_abc'
    AND order_id IN (SELECT id FROM orders WHERE created_at >= '2026-04-07')
  GROUP BY item_name
  ORDER BY total_sold DESC
  LIMIT 10;
  ```
- **Why:** Supports the Prisma middleware's `WHERE tenant_id = ?` filter and enables tenant-scoped analytics.

---

## Part 5 — Relationships

### Foreign Keys

| Column | References | On Delete | Why |
|---|---|---|---|
| `tenant_id` | `tenants(id)` | `CASCADE` | Tenant deletion removes all order items |
| `(tenant_id, order_id)` | `orders(tenant_id, id)` | `CASCADE` | Order deletion removes its items; composite FK enforces same-tenant |
| `(tenant_id, menu_item_id)` | `menu_items(tenant_id, id)` | (no action) | Menu item deletion is preceded by app-level `UPDATE … SET menu_item_id = NULL`; preserves historical order data |
| `cancelled_by_id` | `users(id)` | (no action) | Single-column FK because `users` is global |

### Incoming References

None. `order_items` is a leaf table.

### Tenant Parity (since 2026-04-25)

No trigger needed — composite FKs to `orders(tenant_id, id)` and
`menu_items(tenant_id, id)` make cross-tenant linking impossible by
construction.

---

## Part 6 — Real-World Usage Scenarios

### Scenario 1: Bubble tea order -- two items, one with notes

A customer at "Boba Khmae" orders a Taro Milk Tea (less sugar) and two Mango Smoothies.

```
order_items:
  { id: 'oi_001', order_id: 'order_boba_001', menu_item_id: 'mi_taro',
    item_name: 'តែទឹកដោះគោតារ៉ូ',          -- Khmer name snapshot
    quantity: 1, unit_price_cents: 350, line_total_cents: 350,
    notes: 'ស្ករតិច / Less sugar' }

  { id: 'oi_002', order_id: 'order_boba_001', menu_item_id: 'mi_mango',
    item_name: 'ស្មូធីស្វាយ',                 -- Khmer name snapshot
    quantity: 2, unit_price_cents: 400, line_total_cents: 800,
    notes: NULL }

Order subtotal: 350 + 800 = 1150 ($11.50)
```

### Scenario 2: BBQ restaurant -- appetizer round

A group at Table 5 orders appetizers at "Sach Ko Ang."

```
order_items for order_bbq_001:
  { item_name: 'Spring Rolls / នំបញ្ចុកបំពង',
    quantity: 2, unit_price_cents: 300, line_total_cents: 600, notes: NULL }

  { item_name: 'Papaya Salad / បុកល្ហុង',
    quantity: 1, unit_price_cents: 600, line_total_cents: 600,
    notes: 'Not too spicy / កុំហឹរពេក' }

Order subtotal: 600 + 600 = 1200 ($12.00)
```

The kitchen ticket shows both items with their notes. The "Table 5" label comes from `orders.table_ref`, not from `order_items`.

### Scenario 3: Menu item deleted after order -- snapshot survives

A merchant deletes "Seasonal Durian Shake" from the menu. An order placed yesterday included this item.

```
Before deletion:
  order_items: { menu_item_id: 'mi_durian', item_name: 'Durian Shake',
                 unit_price_cents: 500, line_total_cents: 500 }

After deletion (H6):
  order_items: { menu_item_id: NULL, item_name: 'Durian Shake',
                 unit_price_cents: 500, line_total_cents: 500 }
```

The order receipt still shows "Durian Shake -- $5.00." The analytics query "what sold last week?" still includes it. Only the catalog link is broken (no image, no "reorder" button).

---

## Part 7 — Design Decisions

### Why variants + options are snapshotted as JSONB (not normalized)

When the customer orders "Large Taro + Extra Boba + Less Sugar", we need to preserve what they ordered even if the catalog later changes. Two options were considered:

- **Option A (chosen):** inline `variant_snapshot` + `options_snapshot` JSONB columns on `order_items`. Self-contained. Kitchen screen and receipt render without joins. Rename / delete on the catalog does not retroactively alter the order.
- **Option B (rejected for MVP):** a separate `order_item_options` child table with FK rows for each selected option. More normalized, better for analytics ("how many extra-bacon orders last month?"), but adds a table, more writes per order, and more joins on every display.

JSONB is the right MVP trade: simpler schema, zero joins on the hot path, full fidelity preserved. If analytics demand arises post-MVP, the JSONB can be mined (Postgres `jsonb_to_recordset` is capable) or a normalized child table can be added later without breaking existing data.

### Why `item_name` is a snapshot, not a join

The alternative — storing only `menu_item_id` and reading the live `menu_items.name_km` (or `name_en`) at display time — was rejected for four reasons:

1. **Historical accuracy:** Menu items are renamed, translations are corrected, items are deleted. The order must show what the customer actually saw.
2. **Performance:** Kitchen tickets, receipts, and the status page all display item names. Joining to `menu_items` on every read adds latency to a hot path.
3. **Resilience:** If the menu item is deleted, the order item is still displayable.
4. **Simplicity:** One column, one value, no join, no NULL handling.

### Why `created_at` was added 2026-04-25 (and `updated_at` still isn't)

Order items remain effectively immutable for their *contents* (name, price,
variant, options). However, the 2026-04-25 enterprise upgrade introduced
two mutating fields:

- `kitchen_status` (`NEW → PREPARING → READY → COMPLETED`) — set by kitchen
  staff during cooking.
- `is_cancelled` + cancellation fields — set if a single line is cancelled
  partway through cooking.

`created_at` was added so we can audit "when did this line item appear in
the order?" — important for dine-in flows where staff append more rows
after the initial submit (e.g. "Round 2 of beers"). The order's
`created_at` only captures the first submit, not subsequent appends.

`updated_at` is intentionally still **not** present: the kitchen workflow
mutations are append-style (set timestamps once each), and the
cancellation timestamp `cancelled_at` already records the only "real"
mutation. A general-purpose `updated_at` would invite drift and is not
needed by any read path.

### Why `line_total_cents` is stored (not just calculated)

Unlike `cart_items` (mutable, low-read), `order_items` are immutable and high-read. Pre-calculating the line total:
- Eliminates multiplication on every read.
- Enables the CHECK constraint `line_total_cents = unit_price_cents * quantity`, which catches application bugs at the database level.
- Makes aggregate queries (sum of line totals) a simple `SUM(line_total_cents)` instead of `SUM(unit_price_cents * quantity)`.

### Why `ON DELETE SET NULL` instead of `ON DELETE CASCADE` for `menu_item_id` (H6)

Cascading menu item deletion to order items would destroy historical revenue data. A merchant deleting last month's seasonal item should not erase all orders that included it. `SET NULL` preserves the order data while breaking only the catalog link.

---

## Part 8 — Related Tables

| Table | Relationship | Notes |
|---|---|---|
| `tenants` | Parent (FK, denormalized) | Tenant isolation via denormalized `tenant_id` |
| `orders` | Parent (FK, CASCADE) | Every order item belongs to one order |
| `menu_items` (inline bilingual) | Reference (FK, SET NULL) | Catalog link for images, "reorder" functionality, and the source of `item_name` snapshots — `name_km` / `name_en` live directly on this table (no translations child since 2026-04-23) |
| `kitchen_tickets` | Indirect (via orders) | Kitchen ticket displays these items |
| `cart_items` | Conceptual predecessor (dine-in only) | For `DINE_IN_TABLE`, cart items snapshot into order items on "Submit Order." For `STALL_KIOSK`, order items are built directly from the storefront's localStorage payload — no `cart_items` rows exist. |
