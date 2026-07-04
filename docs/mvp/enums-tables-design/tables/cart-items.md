# Table Reference: `cart_items`

| Property | Value |
|---|---|
| **Domain** | Order |
| **Tenant-scoped** | Yes (denormalized) |
| **Prisma model** | `CartItem` |
| **Table #** | 26 of 36 |

---

## Part 1 — Overview

The `cart_items` table stores individual line items within a server-persisted dine-in cart. Each row represents one menu item with a quantity, a snapshotted unit price, and optional notes (e.g., "no onions", "extra spicy").

**Scope (decided 2026-04-24):** Like its parent `carts`, this table is used **only for `DINE_IN_TABLE` sessions**. Stall/kiosk flows hold their cart in `localStorage` on the customer's device and never touch this table — they go straight from "Place Order" to creating `orders` + `order_items`.

The key design principle: **`unit_price_cents` is a snapshot.** When a customer adds an item to the dine-in cart, the current price is captured at that moment. If the merchant later changes the menu price, the cart item retains the price the customer saw. This prevents the unpleasant experience of a cart total silently changing between adding items and submitting the round.

`cart_items` has a denormalized `tenant_id` column (Critical finding C1 from the schema stress test). This was added by the `20260410_mvp_hardening.sql` migration to allow the Prisma middleware to enforce `WHERE tenant_id = ?` on every query, even without joining to the parent `carts` table. The `cart_items_tenant_parity` trigger ensures this denormalized value always matches the parent cart's `tenant_id`.

---

## Part 2 — CREATE TABLE

```sql
CREATE TABLE cart_items (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cart_id           TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  menu_item_id      TEXT NOT NULL REFERENCES menu_items(id),
  quantity          INTEGER NOT NULL,
  unit_price_cents  INTEGER NOT NULL,   -- snapshot at add-time (variant + options baked in)
  variant_snapshot  JSONB,              -- nullable: NULL if menu item has no variants
  options_snapshot  JSONB,              -- nullable: NULL if no options selected
  notes             TEXT,
  created_at        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP(3) NOT NULL
);

CREATE INDEX ON cart_items (cart_id);
CREATE INDEX ON cart_items (tenant_id);
```

**Post-hardening changes (H5, H6):**
```sql
-- H5: CHECK constraints
ALTER TABLE cart_items
  ADD CONSTRAINT ci_quantity_positive  CHECK (quantity > 0),
  ADD CONSTRAINT ci_unit_price_nonneg  CHECK (unit_price_cents >= 0);

-- H6: ON DELETE SET NULL for menu_item_id (preserves snapshot if menu item is deleted)
ALTER TABLE cart_items ALTER COLUMN menu_item_id DROP NOT NULL;
ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_menu_item_id_fkey
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL;
```

---

## Part 3 — Column-by-Column

### `id` — TEXT PRIMARY KEY

- **Nullable:** No
- **Default:** None (app-generated cuid)
- **Purpose:** Unique identifier for this cart line item.
- **Constraints:** Primary key.
- **Why:** Standard cuid. Used for updating quantity or removing a specific item from the cart.

### `tenant_id` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None (copied from parent cart at insert time)
- **Purpose:** Denormalized tenant identifier for direct query isolation.
- **Constraints:** `REFERENCES tenants(id) ON DELETE CASCADE`. Indexed. Parity enforced by `cart_items_tenant_parity` trigger.
- **Why:** Critical finding C1. Without this column, every query on `cart_items` would need to join to `carts` to filter by tenant. With it, the Prisma middleware can add `WHERE tenant_id = ?` directly. The parity trigger prevents any code path (including raw SQL, bulk imports, or buggy migrations) from inserting a cart item with a `tenant_id` that does not match its parent cart's tenant.

### `cart_id` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** The cart this item belongs to.
- **Constraints:** `REFERENCES carts(id) ON DELETE CASCADE`. Indexed.
- **Why:** The primary structural relationship. `ON DELETE CASCADE` means removing a cart (e.g., during cleanup) automatically removes its items. This is correct because cart items have no meaning without their parent cart.

### `menu_item_id` — TEXT (nullable after H6)

- **Nullable:** Yes (after H6 hardening; originally NOT NULL)
- **Default:** None
- **Purpose:** Reference to the menu item that was added to the cart.
- **Constraints:** `REFERENCES menu_items(id) ON DELETE SET NULL` (after H6).
- **Why:** Links the cart item to the catalog for display (image, current description, availability check). After H6, this is nullable with `ON DELETE SET NULL` -- if a merchant deletes a menu item while a customer has it in their cart, the FK nulls out gracefully rather than blocking the delete. The `unit_price_cents` snapshot remains valid regardless.

  Before H6, this was NOT NULL with default `NoAction` on delete, which would have prevented a merchant from deleting a menu item that existed in any active cart.

### `quantity` — INTEGER NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** How many of this item the customer wants.
- **Constraints:** `CHECK (quantity > 0)` (H5).
- **Why:** Must be at least 1. If a customer removes an item entirely, the cart_item row should be deleted, not set to quantity 0. The CHECK constraint is belt-and-braces -- the application validates this too (via Zod), but the DB constraint catches edge cases like raw SQL access or buggy migration scripts.

### `unit_price_cents` — INTEGER NOT NULL

- **Nullable:** No
- **Default:** None (computed at add time: variant price OR base price + sum of selected option deltas)
- **Purpose:** The fully-resolved price per unit at the time the item was added to the cart, **with the chosen variant and options already baked in**.
- **Constraints:** `CHECK (unit_price_cents >= 0)` (H5).
- **Why:** This is a **snapshot**, not a live reference. When the customer taps "Add to cart," the storefront computes:

  ```
  unit_price_cents
    = (variant.price_cents IF variant chosen ELSE menu_item.base_price_cents)
    + SUM(option.price_delta_cents FOR option IN selected_options)
  ```

  The result is frozen on the row. If the merchant later edits the menu price, the variant price, or the option delta — or even deletes any of them — the customer pays exactly what they saw. This prevents:
  - Cart totals changing unexpectedly between browsing and submit.
  - Race conditions where price changes mid-cart produce different totals.
  - The need for a price-change notification system in the cart.

  Stored as integer cents (not float/decimal) to avoid floating-point arithmetic errors. $5.50 is stored as `550`. Pairs with `variant_snapshot` and `options_snapshot` so the price breakdown is auditable.

### `variant_snapshot` — JSONB (nullable)

- **Nullable:** Yes (NULL when the menu item has no variants)
- **Default:** `NULL`
- **Purpose:** Records *which* variant the customer chose at add-time — name, label, and the variant's own price — so the cart can render itself correctly and the conversion to `order_items` is a verbatim copy.
- **Constraints:** None at the DB level. Application validates the shape with Zod.
- **Why:** Without this, the cart row only knows `menu_item_id` and the resolved `unit_price_cents` — a reader cannot tell *which* variant produced that price. Storing it as JSONB (rather than `variant_id` alone) makes the row self-contained: cart UI doesn't need a JOIN to display "Pad Thai (Large)", and if the variant is deleted or renamed mid-cart, the customer still sees what they originally chose.

  **Shape (matches `order_items.variant_snapshot`):**

  ```jsonc
  {
    "variant_id": "miv_large",       // FK reference (audit only — may dangle)
    "label_km": "ធំ",
    "label_en": "Large",
    "price_cents": 500
  }
  ```

  When NULL: the menu item has no variants and `unit_price_cents` came from `menu_items.base_price_cents`.

### `options_snapshot` — JSONB (nullable)

- **Nullable:** Yes (NULL when no options are selected)
- **Default:** `NULL`
- **Purpose:** Records *which* options (modifiers, add-ons) the customer selected — group, label, and each option's price delta — so the cart line and the kitchen ticket display the full configuration.
- **Constraints:** None at the DB level. Application validates the shape with Zod and enforces `min_select` / `max_select` rules from `menu_item_option_groups` at add-time.
- **Why:** Same self-containment reason as `variant_snapshot`. Without it, "Pad Thai with extra cheese, no peanuts" can't be reconstructed from the row alone. The kitchen ticket needs to display each option clearly so the cook prepares the dish correctly — making this a JSONB snapshot avoids JOINs on the kitchen-display read path.

  **Shape (matches `order_items.options_snapshot`):**

  ```jsonc
  [
    {
      "option_id":         "mio_extra_cheese",   // FK reference (audit only — may dangle)
      "group_id":          "miog_addons",
      "group_label_km":    "បន្ថែម",
      "group_label_en":    "Add-ons",
      "label_km":          "ឈីសបន្ថែម",
      "label_en":          "Extra cheese",
      "price_delta_cents": 50
    },
    {
      "option_id":         "mio_no_peanuts",
      "group_id":          "miog_allergens",
      "group_label_km":    "អាល្លែកជី",
      "group_label_en":    "Allergens",
      "label_km":          "គ្មានសណ្តែកដី",
      "label_en":          "No peanuts",
      "price_delta_cents": 0
    }
  ]
  ```

  When NULL: no options selected (or the menu item has no option groups).

### `notes` — TEXT

- **Nullable:** Yes
- **Default:** None
- **Purpose:** Customer-provided special instructions for this specific item.
- **Constraints:** None.
- **Why:** Real-world necessity in Cambodia: "no cilantro" ("មិនយកម្ទេស"), "extra spicy" ("ហឹរច្រើន"), "no ice", "less sugar." These notes are per-item, not per-order -- a customer might want their noodle soup extra spicy but their iced tea with normal sugar. When the cart is converted to an order, these notes are carried over to `order_items.notes`.

### `created_at` — TIMESTAMP(3) NOT NULL

- **Nullable:** No
- **Default:** `CURRENT_TIMESTAMP`
- **Purpose:** When this item was added to the cart.
- **Constraints:** None.
- **Why:** Useful for analytics ("how long did the customer spend building their cart?") and for abandoned-cart analysis ("which item was added first vs. last?").

### `updated_at` — TIMESTAMP(3) NOT NULL

- **Nullable:** No
- **Default:** Maintained by Prisma (`@updatedAt`).
- **Purpose:** When this cart item was last modified (quantity changed, notes updated).
- **Constraints:** None.
- **Why:** Standard Prisma convention. Tracks the last interaction with this line item.

---

## Part 4 — Indexes

### `PRIMARY KEY (id)`

- **What it serves:** Direct lookups for updating or deleting a specific cart item.
- **Example:** `UPDATE cart_items SET quantity = 3 WHERE id = 'ci_001'`

### `INDEX ON cart_items (cart_id)`

- **What it serves:** The most common query -- loading all items in a cart.
- **Example:**
  ```sql
  SELECT ci.id, ci.menu_item_id, ci.quantity, ci.unit_price_cents, ci.notes,
         mi.name_km AS item_name, mi.image_url
  FROM cart_items ci
  JOIN menu_items mi ON mi.id = ci.menu_item_id
  WHERE ci.cart_id = 'cart_001'
  ORDER BY ci.created_at ASC;
  ```
- **Why:** Every cart page load fetches all items in the cart. Without this index, the query would scan the entire `cart_items` table.

### `INDEX ON cart_items (tenant_id)`

- **What it serves:** Tenant-scoped administrative queries.
- **Example:**
  ```sql
  -- Analytics: count of items in active carts for this tenant
  SELECT COUNT(*)
  FROM cart_items ci
  JOIN carts c ON c.id = ci.cart_id
  WHERE ci.tenant_id = 'tenant_abc'
    AND c.status = 'ACTIVE';
  ```
- **Why:** Supports the Prisma middleware's `WHERE tenant_id = ?` filter on every query, and enables tenant-scoped analytics without scanning the full table.

---

## Part 5 — Relationships

### Foreign Keys

| Column | References | On Delete | Why |
|---|---|---|---|
| `tenant_id` | `tenants(id)` | `CASCADE` | Tenant deletion removes all cart items |
| `cart_id` | `carts(id)` | `CASCADE` | Cart deletion removes its items |
| `menu_item_id` | `menu_items(id)` | `SET NULL` (H6) | Menu item deletion nulls the reference; the price snapshot survives |

### Incoming References

None. `cart_items` is a leaf table.

### Tenant Parity Trigger

```sql
-- Installed by 20260410_mvp_hardening.sql
CREATE OR REPLACE FUNCTION cart_items_tenant_parity() RETURNS trigger AS $$
DECLARE parent_tenant TEXT;
BEGIN
  SELECT tenant_id INTO parent_tenant FROM carts WHERE id = NEW.cart_id;
  IF parent_tenant IS NULL THEN
    RAISE EXCEPTION 'cart_items: parent cart % not found', NEW.cart_id;
  END IF;
  IF parent_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'cart_items: tenant_id mismatch (row=%, parent=%)',
      NEW.tenant_id, parent_tenant;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

This trigger fires `BEFORE INSERT OR UPDATE OF tenant_id, cart_id` and rejects any row where `cart_items.tenant_id` does not match `carts.tenant_id`.

---

## Part 6 — Real-World Usage Scenarios

### Scenario 1: Dine-in BBQ — shared cart with variants, options, and notes

Two devices at Table 5 of "Sach Ko Ang" (Siem Reap) contribute to the same shared dine-in cart. Lina adds spicy beef skewers (Large size) from her phone; Sokha adds grilled fish with extra lime from his.

```
cart_items:

  { id: 'ci_001',
    cart_id: 'cart_bbq_001',
    menu_item_id: 'mi_beef_skewer',
    quantity: 4,
    unit_price_cents: 700,                          -- 600 (Large) + 100 (extra spicy delta)
    variant_snapshot: {
      variant_id:   'miv_beef_large',
      label_km:     'ធំ',
      label_en:     'Large',
      price_cents:  600
    },
    options_snapshot: [
      { option_id: 'mio_extra_spicy', group_id: 'miog_spice',
        group_label_km: 'កម្រិតហឹរ', group_label_en: 'Spice level',
        label_km: 'ហឹរច្រើន', label_en: 'Extra spicy',
        price_delta_cents: 100 }
    ],
    notes: 'No onions / គ្មានខ្ទឹមបារាំង' }      -- added from Lina's phone

  { id: 'ci_002',
    cart_id: 'cart_bbq_001',
    menu_item_id: 'mi_grilled_fish',
    quantity: 1,
    unit_price_cents: 800,                          -- base 800, no variant, no paid option
    variant_snapshot: NULL,                         -- this menu item has no variants
    options_snapshot: [
      { option_id: 'mio_extra_lime', group_id: 'miog_addons',
        group_label_km: 'បន្ថែម', group_label_en: 'Add-ons',
        label_km: 'ក្រូចឆ្មារបន្ថែម', label_en: 'Extra lime',
        price_delta_cents: 0 }
    ],
    notes: NULL }                                   -- added from Sokha's phone

Cart total: (700 × 4) + 800 = 3600 cents = $36.00
```

Both phones polling `/sessions/{id}/cart` see the same two rows. The cart UI renders each line as "4× Beef Skewers (Large) — Extra spicy — no onions — $7.00 each" purely from the row, no JOINs. When either device taps "Submit Order", the cart converts and the snapshots copy verbatim into `order_items.variant_snapshot` / `options_snapshot`.

### Scenario 2: Price snapshot protects the customer

A merchant changes the price of BBQ Beef from $6.00 to $7.00. A customer already has BBQ Beef in their cart at the old price.

```
Before price change:
  menu_items: { id: 'mi_bbq', base_price_cents: 600 }
  cart_items: { menu_item_id: 'mi_bbq', unit_price_cents: 600 }  -- snapshotted

After price change:
  menu_items: { id: 'mi_bbq', base_price_cents: 700 }  -- updated
  cart_items: { menu_item_id: 'mi_bbq', unit_price_cents: 600 }  -- unchanged!
```

The customer pays $6.00, not $7.00. The snapshot protects the customer from price changes that happen between browsing and ordering.

### Scenario 3: Menu item deleted while in cart

A merchant deletes "Seasonal Mango Salad" from the menu while a customer has it in their cart.

```
Before deletion:
  cart_items: { menu_item_id: 'mi_mango_salad', unit_price_cents: 500, quantity: 1 }

After deletion (H6 ON DELETE SET NULL):
  cart_items: { menu_item_id: NULL, unit_price_cents: 500, quantity: 1 }
```

The application detects `menu_item_id = NULL` and shows the customer a notice: "This item is no longer available." The price snapshot remains for analytics, but the item cannot be ordered.

---

## Part 7 — Design Decisions

### Why price is snapshotted at add-time, not at order-time

Two alternatives were considered:
1. **Snapshot at add-time** (chosen) -- price is captured when "Add to cart" is tapped.
2. **Snapshot at order-time** -- price is read from `menu_items` when "Place order" is tapped.

Option 1 was chosen because it matches customer expectations. When you add a $3.50 item to your cart, you expect to pay $3.50. If the price changes between adding and ordering, the customer should not be surprised. Option 2 would require showing a "prices have changed" warning, which adds complexity and friction.

### Why there is no `line_total_cents` column (unlike `order_items`)

`cart_items` does not have a `line_total_cents` column. The cart total is calculated dynamically: `SUM(unit_price_cents * quantity)`. This is fine for carts because:
- Carts are mutable -- quantities change, items are added/removed.
- Recalculating avoids staleness (if quantity changes, `line_total_cents` would need updating too).
- Cart reads are low-volume (one customer, one cart page).

`order_items` has `line_total_cents` because orders are immutable after creation and read-heavy (kitchen, merchant portal, billing all read order items).

### Why `ON DELETE SET NULL` instead of `ON DELETE RESTRICT` for `menu_item_id`

A merchant must be able to remove items from their menu without first checking if any customer has them in an active cart. `RESTRICT` would block menu cleanup. `SET NULL` gracefully nulls the reference and the application handles the "item no longer available" case.

### Why JSONB snapshots for variants and options (added 2026-04-24)

The menu-items model added `menu_item_variants` (S/M/L) and `menu_item_options` (extras with `price_delta_cents`) on 2026-04-23. `cart_items` must record *which* variant and options the customer chose, otherwise:

1. **The cart can't display itself** — the row only knows `menu_item_id` and the resolved `unit_price_cents`. It can't render "Large Pad Thai with extra cheese" without joining to `menu_item_variants` and `menu_item_options`, which is wrong on the storefront's hot read path.
2. **The price snapshot becomes opaque** — `unit_price_cents = 700` is meaningless without knowing it came from "Large variant ($600) + extra spicy ($100)." Customer disputes ("why is this $7?") become unanswerable.
3. **Cart → order conversion has to re-resolve at submit time** — defeats the whole purpose of snapshotting at add-time and re-introduces the staleness bug `order_items` JSONB snapshots were designed to eliminate.

Two design choices were available:

| Approach | Verdict |
|---|---|
| Live FKs (`variant_id`, junction table for selected options) | Smaller storage, but requires JOINs on every read; conversion to `order_items.*_snapshot` requires joining and re-shaping at submit time. **Rejected.** |
| **JSONB snapshots — same shape as `order_items`** | Self-contained rows, no JOINs to render the cart, conversion is a verbatim column copy. **Chosen.** |

The snapshot shape mirrors `order_items.variant_snapshot` and `order_items.options_snapshot` exactly — the cart-to-order conversion is `INSERT INTO order_items (...) SELECT ... FROM cart_items WHERE cart_id = ?` with no transformation logic.

### Why `tenant_id` is denormalized (C1)

Without denormalization, enforcing tenant isolation on `cart_items` requires a join to `carts`:
```sql
SELECT ci.* FROM cart_items ci
JOIN carts c ON c.id = ci.cart_id
WHERE c.tenant_id = ?;
```

With denormalization, the Prisma middleware can directly filter:
```sql
SELECT * FROM cart_items WHERE tenant_id = ? AND cart_id = ?;
```

This is simpler, faster, and impossible to forget. The parity trigger guarantees correctness.

---

## Part 8 — Related Tables

| Table | Relationship | Notes |
|---|---|---|
| `tenants` | Parent (FK, denormalized) | Tenant isolation via denormalized `tenant_id` |
| `carts` | Parent (FK, CASCADE) | Every cart item belongs to one dine-in cart |
| `order_sessions` | Indirect (via `carts`) | Cart items live only inside `DINE_IN_TABLE` sessions (since 2026-04-24) |
| `menu_items` | Reference (FK, SET NULL) | The catalog item this cart entry represents |
| `menu_items` (inline bilingual) | Indirect | Display name + description for the cart UI — read directly from `menu_items.name_km` / `name_en` (no translations table since 2026-04-23) |
| `menu_item_variants` | Indirect (via `variant_snapshot`) | The chosen variant is captured at add-time; the FK in the JSONB is for audit only and may dangle if the variant is later deleted |
| `menu_item_option_groups` / `menu_item_options` | Indirect (via `options_snapshot`) | Selected options are captured at add-time as a JSONB array; same dangling-FK semantics |
| `order_items` | Conceptual successor | When the cart is converted, cart_items become order_items — **including a verbatim copy of `variant_snapshot` and `options_snapshot`** |
