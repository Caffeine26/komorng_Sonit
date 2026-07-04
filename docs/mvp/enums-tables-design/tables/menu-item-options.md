# `menu_item_options`

| Attribute | Value |
|---|---|
| **Domain** | Catalog |
| **Tenant-scoped?** | Yes (denormalized `tenant_id`) |
| **Prisma model** | `MenuItemOption` |
| **Mapped name** | `@@map("menu_item_options")` |
| **Status** | ✅ New table 2026-04-23 |

---

## Part 1: Overview

`menu_item_options` holds the individual selectable choices within a `menu_item_option_group`. Each option has a display name (bilingual) and a `price_delta_cents` — the amount added to the item's/variant's base price when selected.

Examples:

- Group "Sauce" → options: `Ketchup (+$0)`, `Mustard (+$0)`, `Mayo (+$0)`.
- Group "Extras" → options: `Extra Meat (+$2)`, `Extra Cheese (+$1)`, `Extra Bacon (+$1.50)`.
- Group "Size" (could also be a variant) → options: `Small (+$0)`, `Large (+$1)`.

The selection rules (required vs optional, single vs multi-select) live on the **group**, not the option.

---

## Part 2: CREATE TABLE

> **2026-04-25:** composite-PK refresh.

```sql
CREATE TABLE menu_item_options (
  tenant_id          TEXT NOT NULL,
  id                 TEXT NOT NULL,
  option_group_id    TEXT NOT NULL,

  -- Bilingual display (Khmer required — customer-facing)
  name_km            TEXT NOT NULL,          -- 'ហឹរតិច', 'ទឹកប៉េង', 'សាច់បន្ថែម'
  name_en            TEXT,                   -- 'Less Spicy', 'Ketchup', 'Extra Meat'

  -- Price adjustment (non-negative — merchants can model discounts elsewhere)
  price_delta_cents  INTEGER NOT NULL DEFAULT 0 CHECK (price_delta_cents >= 0),

  is_available       BOOLEAN NOT NULL DEFAULT TRUE,

  sort_order         INTEGER NOT NULL DEFAULT 0,

  created_at         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP(3) NOT NULL,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, option_group_id) REFERENCES menu_item_option_groups(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX ON menu_item_options (tenant_id, option_group_id, sort_order);
```

---

## Part 3: Column-by-Column

### `id`, `tenant_id`, `option_group_id`

Standard. `tenant_id` denormalized for parity with sibling catalog tables.

### `name_km` -- TEXT NOT NULL

Khmer option label. Examples: `'ហឹរតិច'` (Mild), `'ទឹកប៉េង'` (Ketchup), `'សាច់បន្ថែម'` (Extra Meat).

### `name_en` -- TEXT (optional)

English option label. Falls back to `name_km` when NULL and customer is on EN locale.

### `price_delta_cents` -- INTEGER NOT NULL DEFAULT 0

Amount added to the item's base/variant price when this option is selected. `0` for free modifiers (heat level, sauce choice where all sauces cost the same), positive for upsells.

**Constraints:** `CHECK (price_delta_cents >= 0)`. Negative deltas (discounts) are **not allowed** at MVP — if merchants want discounts, they model them as promotions at the order level (not at the item-option level). This avoids edge cases like "no cheese (-$0.50) + extra bacon (+$1)" price math and keeps option UX predictable.

### `is_available` -- BOOLEAN NOT NULL DEFAULT TRUE

Whether this option is currently orderable. Ran out of bacon? Kitchen staff flips "Extra Bacon" to `FALSE`; the option appears greyed out in the picker.

### `sort_order`, `created_at`, `updated_at`

Standard. No soft delete — options are structural, historical orders preserve them via `order_items.options_snapshot` JSONB.

---

## Part 4: Indexes

### Composite `(option_group_id, sort_order)`

Primary query: "give me all active options for this group in display order":

```sql
SELECT id, name_km, name_en, price_delta_cents, is_available
FROM menu_item_options
WHERE option_group_id = 'og_extras'
ORDER BY sort_order ASC, id ASC;
```

### Index on `tenant_id`

Serves tenant-wide admin queries ("all options in this tenant").

---

## Part 5: Relationships

### Outgoing FKs

| Target | FK | Cascade |
|---|---|---|
| `tenants` | `tenant_id` | `ON DELETE CASCADE` |
| `menu_item_option_groups` | `option_group_id` | `ON DELETE CASCADE` |

### Incoming references

| Table | Notes |
|---|---|
| `order_items` (via JSONB snapshot) | Selected options are snapshotted into `order_items.options_snapshot` at order time — each entry carries `{option_id, group_name, option_name_km, option_name_en, price_delta_cents}`. Preserves what was ordered even if the option is later renamed or deleted. |

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Populate the Extras group

```sql
INSERT INTO menu_item_options
  (id, tenant_id, option_group_id, name_km, name_en, price_delta_cents, sort_order)
VALUES
  ('opt_meat',   'tenant_lb', 'og_extras', 'សាច់បន្ថែម',  'Extra Meat',  200, 10),
  ('opt_cheese', 'tenant_lb', 'og_extras', 'ឈីសបន្ថែម',   'Extra Cheese', 100, 20),
  ('opt_bacon',  'tenant_lb', 'og_extras', 'បេកុនបន្ថែម', 'Extra Bacon', 150, 30);
```

### Scenario 2: Free-modifier group (heat level)

```sql
INSERT INTO menu_item_options
  (id, tenant_id, option_group_id, name_km, name_en, price_delta_cents, sort_order)
VALUES
  ('opt_mild', 'tenant_lb', 'og_spicy', 'មិនហឹរ',  'Not Spicy',   0, 10),
  ('opt_med',  'tenant_lb', 'og_spicy', 'ហឹរមធ្យម', 'Medium Hot', 0, 20),
  ('opt_hot',  'tenant_lb', 'og_spicy', 'ហឹរខ្លាំង', 'Very Spicy', 0, 30);
```

### Scenario 3: Customer selects options — final price math

Customer orders a Burger (base $6.50) with: `Medium Hot (+$0)`, `Ketchup (+$0)`, `Extra Meat (+$2)`, `Extra Cheese (+$1)`.

Final unit price = `6.50 + 0 + 0 + 2.00 + 1.00 = $9.50`.

Snapshot written to `order_items`:

```jsonb
-- order_items.options_snapshot
[
  {"option_id": "opt_med",    "group_name": "Spicy Level", "name_km": "ហឹរមធ្យម",  "name_en": "Medium Hot",  "price_delta_cents": 0},
  {"option_id": "opt_ketchup","group_name": "Sauce",       "name_km": "ទឹកប៉េង",   "name_en": "Ketchup",     "price_delta_cents": 0},
  {"option_id": "opt_meat",   "group_name": "Extras",      "name_km": "សាច់បន្ថែម",  "name_en": "Extra Meat",  "price_delta_cents": 200},
  {"option_id": "opt_cheese", "group_name": "Extras",      "name_km": "ឈីសបន្ថែម",   "name_en": "Extra Cheese","price_delta_cents": 100}
]
```

`order_items.unit_price_cents = 950` captures the full $9.50.

### Scenario 4: Run out of an option mid-service

Kitchen runs out of bacon. One UPDATE:

```sql
UPDATE menu_item_options
SET    is_available = FALSE, updated_at = NOW()
WHERE  id = 'opt_bacon';
```

Storefront picker greys out "Extra Bacon (+$1.50) — Sold out". Customer picks from what's left. When supply returns, flip back to `TRUE`.

### Scenario 5: Rename an option

Merchant decides "Extra Cheese" should be "Double Cheese":

```sql
UPDATE menu_item_options
SET    name_en = 'Double Cheese', updated_at = NOW()
WHERE  id = 'opt_cheese';
```

Future orders use the new label. Historical order snapshots keep "Extra Cheese" from when they were placed — by design.

---

## Part 7: Design Decisions

### Why `price_delta_cents` is non-negative at MVP

Negative deltas (e.g. "no cheese → −$0.50") introduce subtle complexity:

- Is "no cheese" an opt-OUT of a default, or an opt-IN to a discount?
- What if a customer picks "extra cheese (+$1)" and "no cheese (−$0.50)" in the same order? (Impossible under the group's single-select rule, but the data model would permit it.)
- Do discounts stack?

At MVP, discounts are handled at the **order level** (a future promotions / coupon system), not at the option level. The CHECK constraint prevents accidental bugs. If real demand for option-level discounts appears post-MVP, drop the CHECK.

### Why hard delete (no `deleted_at`)

Options are structural menu data. Historical orders carry JSONB snapshots that are self-contained — they don't need the option row to still exist for rendering. Hard delete simplifies the schema.

### Why `tenant_id` on this table (denormalized)

Consistent with the C1 denormalization pattern across catalog tables. Enables tenant-scoped admin queries ("list all options in this tenant") without joining through the option group. Parity validation (app layer or trigger) ensures the tenant matches the parent group's tenant.

### Why no `description` column

Options are short labels — "Extra Meat", "Ketchup", "Less Spicy". Descriptions are unnecessary. If an option genuinely needs more context, that context belongs in the item's description or the group's name.

### Why options don't have their own images

Most options don't need visuals. If a high-end restaurant ever wants per-option imagery (rare), adding a column later is cheap.

### Why no `sku` column

Options are modifiers, not sellable-SKU entities. Inventory for add-ons (like "bacon") is tracked at a higher level if needed — usually merchants don't track extras as individual SKUs. Variants carry SKUs because variants ARE the sellable unit.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `menu_item_option_groups` | Parent (N:1) | The group this option belongs to; carries selection rules |
| `menu_items` | Indirect (via group) | The item this option modifies |
| `tenants` | Parent (N:1) | Tenant isolation |
| `order_items` (via JSONB snapshot) | Indirect | Selected options snapshotted into `options_snapshot` at order time |
