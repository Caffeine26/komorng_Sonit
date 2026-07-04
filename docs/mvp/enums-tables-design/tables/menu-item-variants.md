# `menu_item_variants`

| Attribute | Value |
|---|---|
| **Domain** | Catalog |
| **Tenant-scoped?** | Yes (denormalized `tenant_id` for parity) |
| **Prisma model** | `MenuItemVariant` |
| **Mapped name** | `@@map("menu_item_variants")` |
| **Status** | ✅ New table 2026-04-23 — size/style variants with independent prices |

---

## Part 1: Overview

`menu_item_variants` holds **size/style variants** of a menu item where each variant has its own price. Common examples:

- Coffee in Small / Medium / Large sizes at $2.50 / $3.00 / $3.50.
- Boba sweetness levels at the same price (price_cents all equal — still useful as a picker).
- Noodle bowl sizes at different prices.

Variants are **replacement-priced**: when an item has variants, the variant's `price_cents` is the total price — it does not add to `menu_items.base_price_cents`. The base price is ignored when variants exist.

### Variants vs options

| | Variants | Options |
|---|---|---|
| What | Core size/style choice | Add-ons, modifiers |
| Pricing | Replaces base price | Adds `price_delta` on top |
| Selection | Exactly one | Zero to many (per group) |
| Example | S / M / L | "Extra meat", "Less sugar", "Ketchup" |
| Table | `menu_item_variants` | `menu_item_option_groups` + `menu_item_options` |

A single item can have BOTH — e.g., "Large Coffee + Extra Shot" uses a variant (Large) and an option (Extra Shot).

### `is_default` flag

At most one variant per item can be marked as the default. The storefront pre-selects this variant when the customer opens the picker. Enforced by a partial unique index. Setting a default is **optional** — if zero variants are default, the storefront shows the picker with nothing pre-selected (customer must pick).

### Currency inherits from the parent item

Unlike `menu_items`, variants do **not** have a `currency` column. They inherit the parent item's currency. This keeps the model simple: a merchant pricing "Iced Coffee" in USD has all sizes in USD; it is not meaningful to price Small in USD and Large in KHR.

---

## Part 2: CREATE TABLE

> **2026-04-25:** composite-PK refresh.

```sql
CREATE TABLE menu_item_variants (
  tenant_id        TEXT NOT NULL,
  id               TEXT NOT NULL,
  menu_item_id     TEXT NOT NULL,

  -- Bilingual display (Khmer required — customer-facing)
  name_km          TEXT NOT NULL,     -- 'តូច', 'មធ្យម', 'ធំ'
  name_en          TEXT,              -- 'Small', 'Medium', 'Large'

  -- Pricing (currency inherited from menu_items)
  price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),

  -- Identification
  sku              TEXT,               -- e.g. 'COF-S', 'COF-M'

  -- Availability
  is_available     BOOLEAN NOT NULL DEFAULT TRUE,
  is_default       BOOLEAN NOT NULL DEFAULT FALSE,

  sort_order       INTEGER NOT NULL DEFAULT 0,

  created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP(3) NOT NULL,
  deleted_at       TIMESTAMP(3),

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, menu_item_id) REFERENCES menu_items(tenant_id, id) ON DELETE CASCADE
);

-- Fast lookup: active variants for a given item in display order
CREATE INDEX idx_variants_item_active
  ON menu_item_variants (tenant_id, menu_item_id, sort_order)
  WHERE deleted_at IS NULL;

-- At most ONE default variant per item
CREATE UNIQUE INDEX uniq_default_variant_per_item
  ON menu_item_variants (tenant_id, menu_item_id)
  WHERE is_default = TRUE AND deleted_at IS NULL;
```

---

## Part 3: Column-by-Column

### `id`, `tenant_id`, `menu_item_id`

Standard. `tenant_id` is denormalized for tenant-parity defense (the app validates on INSERT that variant tenant matches the parent item tenant).

### `name_km` -- TEXT NOT NULL (required, customer-facing)

Khmer variant name — `'តូច'` (Small), `'មធ្យម'` (Medium), `'ធំ'` (Large), `'ហឹរ'` (Spicy), etc. Required because the storefront is Khmer-first.

### `name_en` -- TEXT (optional)

English variant name. Shown when customer toggles EN; falls back to `name_km` if NULL.

### `price_cents` -- INTEGER NOT NULL

Total price of this variant in the smallest currency unit (cents for USD, ៛ for KHR). **Replaces** `menu_items.base_price_cents` — does not add.

`CHECK (price_cents >= 0)`. Zero is valid (free-with-purchase variants), negative is invalid.

### `sku` -- TEXT (nullable)

Optional merchant-supplied code — `'COF-S'`, `'COF-L'`. Useful for inventory integration. Not shown to customers.

### `is_available` -- BOOLEAN

Per-variant availability. Kitchen can mark Large out-of-stock while Small/Medium stay available. Storefront renders unavailable variants greyed out.

### `is_default` -- BOOLEAN

Whether this variant is pre-selected in the variant picker. Partial unique index enforces **at most one default per item**. Optional — zero defaults is valid (customer must explicitly pick).

### `sort_order`, `created_at`, `updated_at`, `deleted_at`

Standard. Soft-delete supported because historical order snapshots may reference a variant by name/ID; soft-delete preserves the row for reporting.

---

## Part 4: Indexes

### Partial index `idx_variants_item_active`

Serves the storefront's hot path:

```sql
SELECT id, name_km, name_en, price_cents, is_available, is_default
FROM menu_item_variants
WHERE menu_item_id = 'item_taro'
  AND deleted_at IS NULL
ORDER BY sort_order ASC, id ASC;
```

The partial filter keeps the index small — soft-deleted variants are excluded.

### Partial UNIQUE `uniq_default_variant_per_item`

Enforces the "at most one default per item" invariant at the DB layer. Setting a second `is_default = TRUE` for the same item fails with a unique-violation; the app clears the old default before setting a new one.

---

## Part 5: Relationships

### Outgoing FKs

| Target | FK | Cascade |
|---|---|---|
| `tenants` | `tenant_id` | `ON DELETE CASCADE` |
| `menu_items` | `menu_item_id` | `ON DELETE CASCADE` |

### Incoming references

| Table | Notes |
|---|---|
| `order_items` (via JSONB snapshot) | When a customer orders a variant, a copy of its {id, name_km, name_en, price_cents} is snapshotted onto `order_items.variant_snapshot` so historical orders survive variant changes/deletions. |

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Bubble tea sizes

```sql
INSERT INTO menu_item_variants
  (id, tenant_id, menu_item_id, name_km, name_en, price_cents, is_default, sort_order)
VALUES
  ('var_s', 'tenant_bq', 'item_taro', 'តូច',   'Small',  300, FALSE, 10),
  ('var_m', 'tenant_bq', 'item_taro', 'មធ្យម', 'Medium', 400, TRUE,  20),
  ('var_l', 'tenant_bq', 'item_taro', 'ធំ',    'Large',  500, FALSE, 30);
```

Storefront shows *"Taro Milk Tea — $3.00 – $5.00"* (price range). Customer taps item → picker opens with Medium pre-selected. Customer chooses Large → added to cart at $5.00.

### Scenario 2: Heat-level variants (same price)

Some shops use variants for heat levels even though all sizes cost the same:

```sql
INSERT INTO menu_item_variants (id, tenant_id, menu_item_id, name_km, name_en, price_cents, sort_order) VALUES
  ('var_mild', 'tenant_lb', 'item_chili', 'មិនហឹរ',   'Mild',     500, 10),
  ('var_med',  'tenant_lb', 'item_chili', 'ហឹរមធ្យម', 'Medium Hot', 500, 20),
  ('var_hot',  'tenant_lb', 'item_chili', 'ហឹរខ្លាំង', 'Very Hot',   500, 30);
```

Storefront shows a single price (`$5.00`) because all variants are equal; picker is still shown because the customer must pick a heat.

**Note:** heat level could also be modeled as an **option group** with `min_select = 1, max_select = 1, price_delta_cents = 0` (see `menu-item-option-groups.md`). The choice between variant and option is:
- **Variant:** the choice *is* the item's identity (Small vs Large coffee = different cups).
- **Option:** the choice modifies the base item (Mild vs Hot burger = same burger, different prep).

Both work; merchant convention decides.

### Scenario 3: Run out of one size mid-shift

```sql
UPDATE menu_item_variants
SET    is_available = FALSE, updated_at = NOW()
WHERE  id = 'var_l';
```

Picker greys out "Large" with a "Sold out" label. Customer must pick a different size or cancel. Other variants unaffected.

### Scenario 4: Retire a variant

A shop drops the "Extra Large" size. Soft-delete:

```sql
UPDATE menu_item_variants
SET    deleted_at = NOW(), is_default = FALSE, updated_at = NOW()
WHERE  id = 'var_xl';
```

The partial index excludes it from future picker queries. Historical `order_items` rows that snapshotted this variant still render correctly from their JSONB snapshot.

### Scenario 5: Order at snapshot time

Customer orders "Large Taro":

```jsonb
-- written to order_items.variant_snapshot
{
  "id": "var_l",
  "name_km": "ធំ",
  "name_en": "Large",
  "price_cents": 500
}
```

Even if `var_l` is later renamed or deleted, the order receipt still shows "ធំ / Large — $5.00" from the snapshot.

---

## Part 7: Design Decisions

### Why variants replace (not add to) base price

Industry norm (Toast, Square, Starbucks, Foodpanda). "Large Coffee = $3.50" is simpler to reason about than "Coffee base $2.00 + Large modifier +$1.50 = $3.50". The former matches how merchants think about their menu.

The alternative (variants add to base) forces the merchant to price every variant as a delta, which is error-prone and doesn't match how they set prices on paper menus.

### Why soft delete variants

Historical `order_items.variant_snapshot` references variants by ID. Hard-deleting a variant while those snapshots exist is fine (snapshots are self-contained), but soft-delete preserves the ability to "restore the Large size after realizing we shouldn't have dropped it" without reconstructing it.

### Why `is_default` is optional (zero is valid)

Forcing exactly one default would be extra onboarding friction. Many stalls simply list variants; the customer picks. If the merchant wants a recommended pre-selection, they set `is_default = TRUE` on one variant. The app may nudge them to pick one but doesn't block.

### Why no `description` column on variants

Variants are size/style picks. They don't need rich descriptions — the label + price is sufficient. If a variant genuinely needs elaboration (rare), it goes in the item's `description_km` / `description_en`.

### Why `currency` inherits from the item

Variants of a single item share the item's currency. Having `currency` on both the item and every variant would create drift risk for no realistic use case. Inheriting from `menu_items.currency` keeps the model simple.

### Why `tenant_id` is denormalized

Consistent with the tenant-parity defense pattern on other tenant-scoped child tables. Allows indexing on tenant for admin-wide reports ("list all variants in this tenant") and catches cross-tenant bugs if the app ever inserts a variant with a mismatched tenant.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `menu_items` | Parent (N:1) | The item this variant belongs to |
| `tenants` | Parent (N:1) | Tenant isolation |
| `menu_item_option_groups` | Sibling (both children of `menu_items`) | Options layer applied on top of variants |
| `order_items` (via JSONB snapshot) | Indirect consumer | `variant_snapshot` column captures variant details at order time |
