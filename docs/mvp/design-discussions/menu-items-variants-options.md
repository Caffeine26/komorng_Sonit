# Menu Items — Variants, Options, and Images (Design & Use Cases)

**Date:** 2026-04-23
**Status:** ✅ Approved & applied
**Affects:** `menu_items` (image_url removed), 4 new tables (`menu_item_images`, `menu_item_variants`, `menu_item_option_groups`, `menu_item_options`), and `order_items` JSONB snapshot extension. **Followed up 2026-04-24:** `cart_items` got the same `variant_snapshot` + `options_snapshot` JSONB columns so cart → order conversion is a verbatim column copy. See the carts-related entries in [`discussion_and_decision.md`](discussion_and_decision.md).

**Decisions locked (user-approved):**
1. `name_km` mandatory; `name_en` optional on all 5 catalog tables.
2. `menu_items.category_id` nullable (uncategorized items allowed for small stalls).
3. `currency` inherits from `menu_items`; NOT stored on `menu_item_variants`.
4. Alt text on images kept as nullable `alt_text_km` / `alt_text_en`.
5. `CHECK (price_delta_cents >= 0)` on `menu_item_options` — no negative deltas; discounts live at the order/promotion level.
6. Order snapshots: **Option A** — `variant_snapshot JSONB` + `options_snapshot JSONB` on `order_items`.
7. `is_default` variant — optional (zero or one per item, enforced by partial unique index).

**Applied changes:**
- `tables/menu-items.md` — dropped `image_url`; Part 7 adds the pricing rule and variants/options cross-references; Part 8 lists the 4 new sibling tables.
- [`tables/menu-item-images.md`](tables/menu-item-images.md) — new.
- [`tables/menu-item-variants.md`](tables/menu-item-variants.md) — new.
- [`tables/menu-item-option-groups.md`](tables/menu-item-option-groups.md) — new.
- [`tables/menu-item-options.md`](tables/menu-item-options.md) — new.
- `tables/order-items.md` — added `variant_snapshot` + `options_snapshot` JSONB columns, column docs, and the Option A vs Option B design decision.
- `tables/postgresql-schema.md` — all DDLs added/updated; inventory 32 → **36**.

---

## Requirements (from user)

1. **Multiple images per item, sortable**, with a designated primary image.
2. **Variants / SKUs**: sizes like `S / M / L` or heat levels like `Less Spicy / Spicy / Very Spicy`, each with its own price.
3. **Add-ons / options**: extras like "more meat +$2", sauce pickers ("ketchup / mustard"), "extra rice +$1".
4. **Bilingual display**, Khmer required, English optional (matches the pattern on `tenants`, `menu_categories`).

---

## Proposed schema — 5 tables

(User's draft with issues corrected — see Part 7 for what changed.)

### 1. `menu_items` (revised)

```sql
CREATE TABLE menu_items (
  id               TEXT PRIMARY KEY,

  tenant_id        TEXT NOT NULL
                   REFERENCES tenants(id) ON DELETE CASCADE,

  category_id      TEXT REFERENCES menu_categories(id),   -- nullable: uncategorized items allowed

  -- Bilingual display (Khmer required — customer-facing)
  name_km          TEXT NOT NULL,
  name_en          TEXT,
  description_km   TEXT,
  description_en   TEXT,

  -- Pricing: used ONLY when the item has NO variants
  base_price_cents INTEGER CHECK (base_price_cents IS NULL OR base_price_cents >= 0),
  currency         "Currency" NOT NULL DEFAULT 'USD',

  -- Operations
  is_available     BOOLEAN NOT NULL DEFAULT TRUE,
  is_visible       BOOLEAN NOT NULL DEFAULT TRUE,

  sort_order       INTEGER NOT NULL DEFAULT 0,

  -- Optional metadata
  sku              TEXT,

  created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP(3) NOT NULL,                         -- Prisma @updatedAt (no DB default)
  deleted_at       TIMESTAMP(3)
);

CREATE INDEX ON menu_items (tenant_id, category_id);
CREATE INDEX ON menu_items (tenant_id);
```

**Pricing rule (enforced at app layer):**
- If the item has no variants → `base_price_cents` must be set; storefront uses it.
- If the item has variants → `base_price_cents` MAY be `NULL`; storefront displays the range `min(variant.price) – max(variant.price)` and requires the customer to pick one.

### 2. `menu_item_images`

```sql
CREATE TABLE menu_item_images (
  id            TEXT PRIMARY KEY,

  menu_item_id  TEXT NOT NULL
                REFERENCES menu_items(id) ON DELETE CASCADE,

  image_url     TEXT NOT NULL,
  alt_text_km   TEXT,                                          -- optional accessibility text
  alt_text_en   TEXT,

  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,

  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_menu_item_images_item_order
  ON menu_item_images (menu_item_id, sort_order);

-- At most one primary image per item
CREATE UNIQUE INDEX uniq_menu_item_primary_image
  ON menu_item_images (menu_item_id)
  WHERE is_primary = TRUE;
```

If no image is marked primary, the storefront falls back to the lowest `sort_order`.

### 3. `menu_item_variants`

```sql
CREATE TABLE menu_item_variants (
  id               TEXT PRIMARY KEY,

  tenant_id        TEXT NOT NULL
                   REFERENCES tenants(id) ON DELETE CASCADE,

  menu_item_id     TEXT NOT NULL
                   REFERENCES menu_items(id) ON DELETE CASCADE,

  -- Bilingual display (Khmer required)
  name_km          TEXT NOT NULL,   -- 'តូច', 'មធ្យម', 'ធំ'
  name_en          TEXT,            -- 'Small', 'Medium', 'Large'

  price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
  currency         "Currency" NOT NULL DEFAULT 'USD',

  sku              TEXT,            -- e.g. 'COF-S', 'COF-M'

  is_available     BOOLEAN NOT NULL DEFAULT TRUE,
  is_default       BOOLEAN NOT NULL DEFAULT FALSE,

  sort_order       INTEGER NOT NULL DEFAULT 0,

  created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP(3) NOT NULL,
  deleted_at       TIMESTAMP(3)
);

CREATE INDEX idx_variants_item_active
  ON menu_item_variants (menu_item_id, sort_order)
  WHERE deleted_at IS NULL;

-- At most one default variant per item
CREATE UNIQUE INDEX uniq_default_variant_per_item
  ON menu_item_variants (menu_item_id)
  WHERE is_default = TRUE AND deleted_at IS NULL;
```

Variant price **replaces** the item's `base_price_cents`; it does not add to it.

### 4. `menu_item_option_groups`

```sql
CREATE TABLE menu_item_option_groups (
  id               TEXT PRIMARY KEY,

  tenant_id        TEXT NOT NULL
                   REFERENCES tenants(id) ON DELETE CASCADE,

  menu_item_id     TEXT NOT NULL
                   REFERENCES menu_items(id) ON DELETE CASCADE,

  -- Bilingual display (Khmer required)
  name_km          TEXT NOT NULL,     -- 'កម្រិតហឹរ', 'ទឹកជ្រលក់', 'បន្ថែម'
  name_en          TEXT,              -- 'Spicy Level', 'Sauce', 'Extras'

  -- Selection constraints
  min_select       INTEGER NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select       INTEGER NOT NULL DEFAULT 1 CHECK (max_select >= 1),

  sort_order       INTEGER NOT NULL DEFAULT 0,

  created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP(3) NOT NULL,

  CONSTRAINT chk_min_max_select CHECK (max_select >= min_select)
);

CREATE INDEX ON menu_item_option_groups (menu_item_id, sort_order);
```

| `min_select` | `max_select` | Behavior |
|---|---|---|
| `0` | `1` | Optional, single-select (e.g. "Sauce: none / ketchup / mustard") |
| `1` | `1` | Required, single-select (e.g. "Spicy Level: mild / medium / hot — pick one") |
| `0` | `N` | Optional, multi-select (e.g. "Extras: more meat, extra rice, both, or neither") |
| `1` | `N` | Required, multi-select (uncommon but supported) |

### 5. `menu_item_options`

```sql
CREATE TABLE menu_item_options (
  id                 TEXT PRIMARY KEY,

  tenant_id          TEXT NOT NULL
                     REFERENCES tenants(id) ON DELETE CASCADE,

  option_group_id    TEXT NOT NULL
                     REFERENCES menu_item_option_groups(id) ON DELETE CASCADE,

  -- Bilingual display (Khmer required)
  name_km            TEXT NOT NULL,     -- 'ហឹរតិច', 'ទឹកប៉េង', 'សាច់បន្ថែម'
  name_en            TEXT,              -- 'Less Spicy', 'Ketchup', 'Extra Meat'

  -- Price adjustment — positive for upsells, zero for free, negative for discounts (rare)
  price_delta_cents  INTEGER NOT NULL DEFAULT 0,

  is_available       BOOLEAN NOT NULL DEFAULT TRUE,

  sort_order         INTEGER NOT NULL DEFAULT 0,

  created_at         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP(3) NOT NULL
);

CREATE INDEX ON menu_item_options (option_group_id, sort_order);
CREATE INDEX ON menu_item_options (tenant_id);
```

`price_delta_cents` is applied **on top** of the item's/variant's base price. Example: a Size L coffee ($3.50) with "Extra Shot" (+$0.75) and "Less Sugar" ($0.00) → final unit price = $4.25.

---

## Part 7: Issues I fixed in the user's original draft

### 🔴 1. `name_en NOT NULL, name_km TEXT` (reversed)

Your draft had `name_en NOT NULL` on every table, but your remark said "name_km is mandatory, name_en is optional." I followed the remark — customer-facing Khmer is required, English optional. Matches the pattern on `menu_categories` and the rest of the customer-facing domain.

### 🔴 2. `category_id NOT NULL` (would break small-stall UX)

Your draft made `category_id` required on `menu_items`. That means a 5-item noodle cart must create a category before it can add any item — extra onboarding friction. Existing design had it nullable (uncategorized items allowed), which the `menu_categories.md` doc explicitly supports. I kept it **nullable**.

If you intended to force categorization, say so and I'll flip it back — but my recommendation is nullable for the small-stall ergonomics.

### 🔴 3. `base_price_cents` semantics need a rule (not just a comment)

Your draft has `base_price_cents INTEGER` (nullable), with a comment saying "used ONLY if no variants." That rule lives nowhere in the schema — a merchant could legitimately have both a base price AND variants, and the app would have to pick which one wins.

Fix: app-layer rule (documented above) — `base_price_cents` is required when an item has zero variants; ignored when variants exist. Could also add a CHECK or trigger, but the app-level invariant is simpler.

### 🟠 4. `currency` on every variant (redundant with item)

Your draft has `currency` on both `menu_items` and `menu_item_variants`. In practice every variant of one item shares the item's currency. I kept it on the variant for flexibility (in case of multi-currency pricing within one item — unusual but possible) — same pattern as your draft. If you want to tighten, drop it from variants and have them inherit.

### 🟠 5. Missing `tenant_id` on `menu_item_options`

Your draft has `tenant_id` on `option_groups` but not on `options`. The group's cascade would handle tenant-parity implicitly, but for consistency with the rest of the schema (every tenant-scoped table has an explicit `tenant_id` for indexing and parity-trigger defense), I added it.

### 🟡 6. `updated_at DEFAULT CURRENT_TIMESTAMP`

Schema convention (per `tenants`, `menu_categories`, etc.) is Prisma `@updatedAt` without a DB default. Removed the DEFAULT for consistency.

### 🟡 7. No `alt_text` on images (accessibility)

Added optional `alt_text_km` / `alt_text_en` columns. Cheap, improves accessibility (screen readers) and SEO if images ever get indexed. Can be dropped if you prefer minimal.

---

## Part 8: Use cases

### UC-1: Bubble tea shop sells a drink in three sizes (variants, no options)

**Setup by merchant:**

```sql
-- Item (no base_price_cents — variants will price it)
INSERT INTO menu_items (id, tenant_id, category_id, name_km, name_en)
VALUES ('item_taro', 'tenant_bq', 'cat_drinks',
        'តែទឹកដោះគោតារ៉ូ', 'Taro Milk Tea');

-- Three variants
INSERT INTO menu_item_variants
  (id, tenant_id, menu_item_id, name_km, name_en, price_cents, is_default, sort_order)
VALUES
  ('var_taro_s', 'tenant_bq', 'item_taro', 'តូច',   'Small',  300,  FALSE, 10),
  ('var_taro_m', 'tenant_bq', 'item_taro', 'មធ្យម', 'Medium', 400,  TRUE,  20),
  ('var_taro_l', 'tenant_bq', 'item_taro', 'ធំ',    'Large',  500,  FALSE, 30);
```

**Customer experience:**
- Storefront shows: *"តែទឹកដោះគោតារ៉ូ  —  $3.00 – $5.00"* (price range from variants).
- Tap the item → size picker appears. Medium is pre-selected (from `is_default = TRUE`).
- Customer picks Large → total $5.00, added to cart.

### UC-2: Burger with "always required" heat level + optional toppings (option groups)

**Setup:**

```sql
-- Item with a base price (no variants)
INSERT INTO menu_items
  (id, tenant_id, category_id, name_km, name_en, base_price_cents)
VALUES ('item_burger', 'tenant_lb', 'cat_mains',
        'ហាំប៊ឺហ្គឺ', 'Burger', 650);

-- Option group 1: spicy level (REQUIRED, single-select)
INSERT INTO menu_item_option_groups
  (id, tenant_id, menu_item_id, name_km, name_en, min_select, max_select, sort_order)
VALUES ('og_spicy', 'tenant_lb', 'item_burger',
        'កម្រិតហឹរ', 'Spicy Level', 1, 1, 10);

INSERT INTO menu_item_options
  (id, tenant_id, option_group_id, name_km, name_en, price_delta_cents, sort_order)
VALUES
  ('opt_mild',  'tenant_lb', 'og_spicy', 'មិនហឹរ',  'Not Spicy',   0, 10),
  ('opt_mid',   'tenant_lb', 'og_spicy', 'ហឹរមធ្យម', 'Medium Hot', 0, 20),
  ('opt_hot',   'tenant_lb', 'og_spicy', 'ហឹរខ្លាំង', 'Very Spicy', 0, 30);

-- Option group 2: sauce (OPTIONAL, single-select)
INSERT INTO menu_item_option_groups
  (id, tenant_id, menu_item_id, name_km, name_en, min_select, max_select, sort_order)
VALUES ('og_sauce', 'tenant_lb', 'item_burger',
        'ទឹកជ្រលក់', 'Sauce', 0, 1, 20);

INSERT INTO menu_item_options
  (id, tenant_id, option_group_id, name_km, name_en, price_delta_cents, sort_order)
VALUES
  ('opt_ketchup', 'tenant_lb', 'og_sauce', 'ទឹកប៉េង',   'Ketchup',  0, 10),
  ('opt_mustard', 'tenant_lb', 'og_sauce', 'មូស្ស្តាត', 'Mustard',  0, 20);

-- Option group 3: extras (OPTIONAL, multi-select)
INSERT INTO menu_item_option_groups
  (id, tenant_id, menu_item_id, name_km, name_en, min_select, max_select, sort_order)
VALUES ('og_extras', 'tenant_lb', 'item_burger',
        'បន្ថែម', 'Extras', 0, 3, 30);

INSERT INTO menu_item_options
  (id, tenant_id, option_group_id, name_km, name_en, price_delta_cents, sort_order)
VALUES
  ('opt_meat',    'tenant_lb', 'og_extras', 'សាច់បន្ថែម',  'Extra Meat',  200, 10),
  ('opt_cheese',  'tenant_lb', 'og_extras', 'ឈីសបន្ថែម',   'Extra Cheese', 100, 20),
  ('opt_bacon',   'tenant_lb', 'og_extras', 'បេកុនបន្ថែម', 'Extra Bacon', 150, 30);
```

**Customer experience:**
- Storefront shows: *"ហាំប៊ឺហ្គឺ  —  $6.50"*.
- Customer taps → modal with 3 required/optional sections:
  - **Spicy Level** (required, radio) → customer must pick one.
  - **Sauce** (optional, radio) → customer picks or skips.
  - **Extras** (optional, up to 3 checkboxes) → customer picks 0–3.
- Price updates live as selections change.

Example final selection: *Medium Hot + Ketchup + Extra Meat + Extra Cheese*
= $6.50 + $0 + $0 + $2.00 + $1.00 = **$9.50**.

### UC-3: Simple item — no variants, no options (street stall case)

```sql
INSERT INTO menu_items (id, tenant_id, category_id, name_km, base_price_cents)
VALUES ('item_rice', 'tenant_dara', NULL, 'បាយឆា', 250);
```

No variants. No options. No category. No images. Storefront shows: *"បាយឆា  —  $2.50"*. Customer taps "Add" → added to cart. Total simplest path works unchanged.

### UC-4: Item with variants AND options combined

A Taro Milk Tea with sizes (variants) AND a sugar level (option group):

- Variants: Small $3.00 / Medium $4.00 / Large $5.00
- Option group "Sugar Level" (required, single-select): Normal, Less Sugar, No Sugar — all $0.

Customer picks Large + Less Sugar → $5.00 + $0 = $5.00. The variant replaces the base price; the option adds its delta (here zero).

A pricier example: Large + Extra Boba ($0.50) = $5.00 + $0.50 = **$5.50**.

### UC-5: Multiple images with primary + sort order

A bubble tea shop uploads 4 photos of Taro Milk Tea:

```sql
INSERT INTO menu_item_images
  (id, menu_item_id, image_url, alt_text_km, alt_text_en, sort_order, is_primary)
VALUES
  ('img_1', 'item_taro', 'https://cdn.xfos.app/taro-hero.jpg',    'តារ៉ូនៅក្នុងកែវ',     'Taro in cup',      10, TRUE),
  ('img_2', 'item_taro', 'https://cdn.xfos.app/taro-pour.jpg',    NULL,                  NULL,               20, FALSE),
  ('img_3', 'item_taro', 'https://cdn.xfos.app/taro-bobas.jpg',   NULL,                  NULL,               30, FALSE),
  ('img_4', 'item_taro', 'https://cdn.xfos.app/taro-detail.jpg',  NULL,                  NULL,               40, FALSE);
```

Storefront renders a carousel starting with the primary, then scrolls through the others in `sort_order`. The unique partial index `WHERE is_primary = TRUE` guarantees at most one primary exists.

### UC-6: Item availability per variant

At peak hour, Boba Queen runs out of Large cups but Small and Medium are fine. The kitchen staff:

```sql
UPDATE menu_item_variants
SET    is_available = FALSE, updated_at = NOW()
WHERE  id = 'var_taro_l';
```

Storefront: Taro Milk Tea is still available, but in the size picker, "Large" is greyed out with "Sold out". Other sizes still clickable.

### UC-7: Ordering flow — snapshot into `order_items`

This is the **important follow-up question**: when a customer submits an order with *Large Taro + Extra Boba + Less Sugar*, how do we persist that **in the order so it survives renames/deletes**?

Today's `order_items` carries:
- `menu_item_id` (FK, can be nulled on delete)
- `item_name` (snapshotted text)
- `unit_price_cents` (snapshotted price)
- `quantity`, `line_total_cents`, `notes`

To carry variant + options through to the order, we need two extensions — **proposed, not yet designed**:

**Option A (recommended for MVP): JSONB snapshot on `order_items`**

```sql
ALTER TABLE order_items
  ADD COLUMN variant_snapshot  JSONB,     -- {id, name_km, name_en, price_cents} at order time
  ADD COLUMN options_snapshot  JSONB;     -- [{group_name, option_name_km, option_name_en, price_delta_cents}, ...]
```

- One column per concept, both nullable.
- Historical receipts render from the snapshot — rename, deletion, or price change on the catalog does NOT alter past orders.
- No new tables, no additional joins.
- Adequate for display; insufficient for analytics-grade breakdowns (use `menu_items.id` for that).

**Option B (future, if detailed analytics needed): new `order_item_options` child table**

```sql
order_item_options (
  order_item_id, option_id, name_km, name_en, price_delta_cents
)
```

More normalized, queryable ("how many extra-bacon orders last month?"), but one more table + more writes per order.

**My recommendation:** Option A for MVP, upgrade to Option B only if analytics demand it. The order_items doc needs a design decision section added to reflect this.

---

## Part 9: Open questions for approval

Please confirm or adjust each before I apply the schema changes to table docs:

1. **`category_id` on `menu_items` — nullable or required?** I'm recommending nullable for small-stall UX. Your draft had it required.
2. **Is `currency` on `menu_item_variants` redundant with `menu_items.currency`?** Keep for flexibility, or drop and inherit?
3. **Option A (JSONB snapshot on `order_items`) vs Option B (new child table)** for variant/option persistence. MVP recommendation: A.
4. **Alt text columns on images** (`alt_text_km`, `alt_text_en`) — keep for accessibility, or drop for minimal?
5. **`is_default` variant — should it be required (exactly one default per item) or optional (zero or one)?** I kept it optional (app may nudge merchant to set one). Your draft was also optional.
6. **Option `price_delta_cents` allow negative values?** (For rare cases like "no cheese → −$0.50 discount.") Currently allowed — no constraint. Keep or forbid with `CHECK (price_delta_cents >= 0)`?

---

## Part 10: What happens if approved

I will:

1. Rewrite `tables/menu-items.md` with the corrected design (name_km mandatory, nullable category_id, pricing rule documented).
2. Create 4 new table docs:
   - `tables/menu-item-images.md`
   - `tables/menu-item-variants.md`
   - `tables/menu-item-option-groups.md`
   - `tables/menu-item-options.md`
3. Add all 4 DDLs to `tables/postgresql-schema.md` and update the inventory (32 → 36 tables).
4. Extend `tables/order-items.md` with the variant/options snapshot approach (Option A).
5. Update `discussion_and_decision.md` with a new 2026-04-23 entry.

---

## Part 11: What this replaces

The **already-applied** collapse to inline bilingual on `menu_items` (earlier today) stands — the `name_km` + `name_en` + `description_km` + `description_en` columns are the right answer and remain. This proposal **extends** that structure with variants/options/images; it does not undo the translation-table collapse.

The only thing to reconsider from my earlier rewrite of `menu-items.md`: the existing `image_url TEXT` column on `menu_items` should be **removed**, since images now live on `menu_item_images`. Storefronts should display the primary image (or fall back to `sort_order = 0`).
