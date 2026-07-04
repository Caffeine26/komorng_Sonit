# `menu_items`

| Attribute | Value |
|---|---|
| **Domain** | Catalog |
| **Tenant-scoped?** | Yes |
| **Prisma model** | `MenuItem` |
| **Mapped name** | `@@map("menu_items")` |
| **Status** | ✅ Redesigned 2026-04-23 — inline bilingual (km required, en optional); `menu_item_translations` table dropped |

---

## Part 1: Overview

`menu_items` is the catalog of sellable food and drink items for each tenant's storefront. Each row represents one item (a dish, a drink, a side) with its bilingual display name, optional bilingual description, price, availability flags, and image. Items are grouped under `menu_categories` via a nullable `category_id` (uncategorized items are allowed).

### Why inline bilingual (not a separate translations table)

Earlier iterations had `menu_item_translations` as a sibling table. On 2026-04-23, it was collapsed into `menu_items` via inline columns — same rationale as the `menu_categories` collapse earlier that day:

- **No JOIN on the storefront menu render** (the hottest read path).
- **No parity trigger** needed (cross-table tenant mismatch is structurally impossible).
- **No orphan-translation risk** — one row per item, all locales on that row.
- **Matches the `menu_categories` and `tenants` inline patterns** already in the schema.
- **Simpler "missing English" queries:** `WHERE name_en IS NULL`, not a LEFT JOIN with a locale filter.

Cost: +4 TEXT columns on `menu_items`. Storage is negligible (unbounded TEXT stores pointers when NULL). If a third locale is ever needed, `ALTER TABLE ADD COLUMN name_zh TEXT, ADD COLUMN description_zh TEXT` — one migration, zero data loss.

### Khmer required, English optional (customer-facing)

Items render to customers on the storefront, Khmer-first:

- `name_km` is **NOT NULL** — every item must have a Khmer name.
- `name_en` is optional — shown when the customer toggles the EN locale; falls back to `name_km` if missing.
- `description_km` and `description_en` are both optional — many stall items ("Iced Coffee") need no description.

This inverts the `tenants.name_en NOT NULL` rule because `tenants` is admin-facing while `menu_items` is customer-facing. Each table's mandatory locale follows its primary audience.

### Two visibility toggles

Items have **two** boolean state flags — deliberately distinct:

| | `is_available` | `is_visible` |
|---|---|---|
| **Meaning** | Stock status — can we make this right now? | Menu status — should customers see this? |
| **Flipped by** | Kitchen staff (fast, per-shift) | Merchant/manager (rarely) |
| **UI behavior** | Item visible but greyed out with "Out of stock" | Item hidden entirely from storefront |

See design decisions for more.

---

## Part 2: CREATE TABLE

> **2026-04-25:** composite-PK refresh. `category_id` FK is now composite,
> so cross-tenant linking is impossible by construction.

```sql
CREATE TABLE menu_items (
  tenant_id        TEXT NOT NULL,
  id               TEXT NOT NULL,
  category_id      TEXT,                                  -- nullable; composite FK below

  -- Bilingual display (Khmer required — customer-facing)
  name_km          TEXT NOT NULL,
  name_en          TEXT,
  description_km   TEXT,
  description_en   TEXT,

  -- Identification
  sku              TEXT,

  -- Pricing (used only when the item has NO variants; see menu_item_variants)
  base_price_cents INTEGER CHECK (base_price_cents IS NULL OR base_price_cents >= 0),
  currency         "Currency" NOT NULL DEFAULT 'USD',

  -- Visibility (two toggles, two roles — see design decisions)
  is_available     BOOLEAN NOT NULL DEFAULT TRUE,
  is_visible       BOOLEAN NOT NULL DEFAULT TRUE,

  -- Ordering
  sort_order       INTEGER NOT NULL DEFAULT 0,

  -- (Images live on `menu_item_images`, see enums-tables-design/tables/menu-item-images.md)

  -- Audit
  created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP(3) NOT NULL,
  deleted_at       TIMESTAMP(3),

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, category_id) REFERENCES menu_categories(tenant_id, id)
);

CREATE INDEX ON menu_items (tenant_id, category_id);
CREATE INDEX ON menu_items (tenant_id);
```

---

## Part 3: Column-by-Column

### `id` -- TEXT PRIMARY KEY

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** `cuid()` (application-generated)
- **Purpose:** Surrogate primary key.
- **Why it exists:** Referenced by `cart_items.menu_item_id`, `order_items.menu_item_id`, and internally throughout the catalog domain.

### `tenant_id` -- TEXT NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** Which tenant owns this item.
- **Constraints:** `NOT NULL`, `REFERENCES tenants(id) ON DELETE CASCADE`.
- **Why it exists:** Tenant isolation. Cascade ensures items are removed when a tenant is deleted.

### `category_id` -- TEXT (nullable)

- **Type:** `TEXT`
- **Nullable:** **Yes** — uncategorized items are allowed.
- **Default:** `NULL`
- **Purpose:** Which menu category this item belongs to.
- **Constraints:** `REFERENCES menu_categories(id)` (no cascade). Application enforces that `category_id`'s tenant matches `menu_items.tenant_id` — there's no DB-level parity trigger for this because category deletions don't happen in practice (they are soft-deleted).
- **Why nullable:** Small stalls with 5 items often don't bother with categories. The storefront shows uncategorized items in an "Other" or unnamed section. Forcing a category would be merchant friction with no customer benefit at small scale.

### `name_km` -- TEXT NOT NULL (Khmer, primary customer-facing)

- **Type:** `TEXT`
- **Nullable:** **No** — Khmer is the customer-facing default.
- **Default:** None
- **Purpose:** Item name in Khmer. Shown on the storefront menu, on kitchen tickets (when staff operate in Khmer), and snapshotted onto `order_items.item_name` at order time. Examples: `"បាយឆាគោ"` (Beef Fried Rice), `"កាហ្វេទឹកកក"` (Iced Coffee).
- **Constraints:** `NOT NULL`.
- **Why required:** Storefront default locale is Khmer. Without a Khmer name, the customer sees a blank or falls back to English — breaking Khmer-first UX.

### `name_en` -- TEXT (English, optional)

- **Type:** `TEXT`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** English translation of the item name. Shown when the customer selects the EN locale toggle.
- **Why nullable:** Khmer-only stalls may never enter English names. The storefront falls back to `name_km` when `name_en IS NULL` and the viewer is on the EN locale — not ideal, but better than blank.

### `description_km` -- TEXT (Khmer description, optional)

- **Type:** `TEXT`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Khmer description of the item — helpful for complex dishes ("Slow-grilled pork ribs with tamarind glaze, served with sticky rice"). Optional because many items ("Iced Coffee") are self-explanatory.
- **Why nullable:** Forcing a description would be data-entry burden on stall owners for no customer benefit.

### `description_en` -- TEXT (English description, optional)

- **Type:** `TEXT`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** English description. Same rationale as `description_km`.

### `sku` -- TEXT (nullable)

- **Type:** `TEXT`
- **Nullable:** Yes — optional merchant-supplied code.
- **Default:** `NULL`
- **Purpose:** Merchant-facing item code for inventory or accounting integration. Not shown to customers. Examples: `"NOO-001"`, `"BEV-TARO-L"`.
- **Constraints:** No uniqueness constraint — tenants may reuse SKUs as they see fit. Application can enforce uniqueness per tenant if desired.
- **Why nullable:** Street stalls don't use SKUs. Larger tenants with inventory systems may.

### `base_price_cents` -- INTEGER NOT NULL

- **Type:** `INTEGER`
- **Nullable:** No
- **Default:** None
- **Purpose:** Item price in the smallest currency unit. For USD: `1250` = $12.50. For KHR: `4000` = ៛4,000 (no decimals for KHR in practice).
- **Constraints:** `NOT NULL`, `CHECK (base_price_cents >= 0)`.
- **Why "base" price:** leaves room for future modifiers (size surcharge, toppings, promotions). Currently no modifier table at MVP — every item is sold at its base price.

### `currency` -- "Currency" NOT NULL DEFAULT 'USD'

- **Type:** `"Currency"` enum (`'USD'`, `'KHR'`)
- **Nullable:** No
- **Default:** `'USD'`
- **Purpose:** Currency this item is priced in.
- **Why per-item:** A single tenant might price some items in USD and others in KHR (a common Cambodian pattern — imported drinks in USD, local food in KHR). Snapshotted onto `order_items.currency` at order time.

### `is_available` -- BOOLEAN NOT NULL DEFAULT TRUE

- **Type:** `BOOLEAN`
- **Nullable:** No
- **Default:** `TRUE`
- **Purpose:** "Is this item currently in stock?" Flipped by kitchen staff during a shift.
- **Why it exists:** Fast stock toggle without hiding the item entirely. Customers see it greyed out with "Sold out today" — they know it exists and may be available tomorrow.

### `is_visible` -- BOOLEAN NOT NULL DEFAULT TRUE

- **Type:** `BOOLEAN`
- **Nullable:** No
- **Default:** `TRUE`
- **Purpose:** "Should this item appear on the menu at all?" Flipped by merchant/manager for seasonal items, retired dishes, drafts.
- **Why distinct from `is_available`:** See design decisions.

### `sort_order` -- INTEGER NOT NULL DEFAULT 0

- **Type:** `INTEGER`
- **Nullable:** No
- **Default:** `0`
- **Purpose:** Display order within the category. Lower values first.
- **Note:** Not unique; ties broken by `id ASC` for deterministic render.

### Images — moved to a separate table

Items can have multiple sortable images with a designated primary. See `tables/menu-item-images.md`.

### `created_at` -- TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

Standard audit.

### `updated_at` -- TIMESTAMP(3) NOT NULL

Maintained by Prisma `@updatedAt`. No DB default.

### `deleted_at` -- TIMESTAMP(3) (nullable)

- **Purpose:** Soft-delete timestamp.
- **Why soft:** Items are referenced by historical `order_items`. Hard delete would orphan those. Soft delete preserves audit / financial history.

---

## Part 4: Indexes

### Composite index on `(tenant_id, category_id)`

```sql
CREATE INDEX ON menu_items (tenant_id, category_id);
```

Serves the storefront's primary query: "give me all items in category X for tenant Y". Used when the customer taps a category to see its items.

```sql
SELECT id, name_km, name_en, description_km, description_en,
       base_price_cents, currency, is_available, sort_order
FROM menu_items
WHERE tenant_id = 'clxyz'
  AND category_id = 'cat_01'
  AND is_visible = TRUE
  AND deleted_at IS NULL
ORDER BY sort_order ASC, id ASC;

-- Primary image fetched separately (one round-trip per screen, indexed):
SELECT menu_item_id, image_url, alt_text_km, alt_text_en
FROM   menu_item_images
WHERE  menu_item_id = ANY($1::text[])
  AND  is_primary = TRUE;
```

### Index on `tenant_id`

Broader catchall for tenant-scoped queries that don't filter by category (e.g., merchant portal's "all items" view, or uncategorized items where `category_id IS NULL`).

### Primary key index on `id`

Implicit. Serves FK lookups from `cart_items`, `order_items`, and internal references.

---

## Part 5: Relationships

### Outgoing FKs

| Target table | FK column | Cascade | Why |
|---|---|---|---|
| `tenants` | `tenant_id` | `ON DELETE CASCADE` | Items are tenant-owned |
| `menu_categories` | `category_id` | No cascade (nullable) | Items can exist without a category or with a soft-deleted category |

### Incoming references

| Child table | FK column | Notes |
|---|---|---|
| `cart_items` | `menu_item_id` | Shopping-cart references (live). FK + app-layer check. |
| `order_items` | `menu_item_id` | Historical order references. `order_items.item_name` snapshots the item's name at order time, so order history survives even if the item is renamed or soft-deleted. |

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Stall owner adds a bilingual item

Sokha creates "Beef Fried Rice" for her stall (tenant prefix `S99`). She enters the Khmer name (required) and optionally the English name and descriptions:

```sql
INSERT INTO menu_items (
  id, tenant_id, category_id,
  name_km, name_en, description_km, description_en,
  base_price_cents, currency,
  is_available, is_visible,
  sort_order
) VALUES (
  'item_001', 'tenant_s99', 'cat_noodles',
  'បាយឆាគោ', 'Beef Fried Rice',
  'បាយឆាជាមួយសាច់គោខ្មៅ',
  'Fried rice with tender beef and dark soy sauce',
  350, 'USD',
  TRUE, TRUE,
  10
);
```

On the storefront (Khmer locale), customers see *"បាយឆាគោ — បាយឆាជាមួយសាច់គោខ្មៅ — $3.50"*. Toggle to English → *"Beef Fried Rice — Fried rice with tender beef and dark soy sauce — $3.50"*.

### Scenario 2: Khmer-only stall skips English

A small noodle cart with 100% local clientele:

```sql
INSERT INTO menu_items (id, tenant_id, name_km, base_price_cents)
VALUES ('item_050', 'tenant_dara', 'គុយទាវ', 250);
```

`name_en`, `description_km`, `description_en` all NULL. Storefront renders the Khmer name. If a tourist ever toggles to English, the fallback shows the Khmer name (better than blank).

### Scenario 3: Kitchen runs out of a topping mid-service

A kitchen staff member at Lucky Burger opens the kitchen app and sees the "Extra Cheese Burger" is now out of stock. One tap:

```sql
UPDATE menu_items
SET    is_available = FALSE, updated_at = NOW()
WHERE  id = 'item_extra_cheese';
```

The storefront menu continues to show the item — but greyed out with "Sold out today" — so customers understand it exists but isn't orderable right now. Tomorrow when supplies arrive, kitchen flips it back to `TRUE` with one tap.

### Scenario 4: Merchant retires an old item

Boba Queen's manager decides to drop the "Brown Sugar Milk Tea" from the menu entirely. Two approaches:

- **Temporarily hide** (seasonal, might return): `UPDATE menu_items SET is_visible = FALSE WHERE id = ?`. Item disappears from the storefront but stays editable in the merchant portal.
- **Soft delete** (gone for good): `UPDATE menu_items SET deleted_at = NOW() WHERE id = ?`. Item is hidden and moved to the "Recently Deleted" section of the merchant portal.

In both cases, historical `order_items` rows referencing this item stay intact — they carry a snapshot of the name via `item_name`.

### Scenario 5: Merchant updates prices across the menu

BBQ restaurant needs to raise prices due to rising meat costs. The merchant portal bulk-updates several items:

```sql
UPDATE menu_items SET base_price_cents = 1200, updated_at = NOW() WHERE id = 'item_ribs';
UPDATE menu_items SET base_price_cents =  550, updated_at = NOW() WHERE id = 'item_drink';
-- ... repeated for affected items
```

Future orders use the new prices. Existing in-flight orders (already placed) still reference the OLD price via `order_items.unit_price_cents` — snapshotted at order time, so past bills don't silently change.

---

## Part 7: Design Decisions

### Why inline bilingual columns (not a separate translations table)

On 2026-04-23 `menu_item_translations` was collapsed into `menu_items`. Reasons:

- **No JOIN on storefront reads** — every menu render is faster.
- **No parity trigger needed.** Cross-table tenant mismatch is impossible when translations live on the parent row.
- **No orphan-translation risk.** A single row holds all locales; a missing `name_en` is a NULL, not a missing row.
- **Matches the `menu_categories` collapse** from earlier the same day, and the `tenants` inline-bilingual pattern.
- **Simpler "items missing English" query:** `WHERE name_en IS NULL`.
- **YAGNI on a third locale.** Cambodia is Khmer-first. If Chinese or Japanese is ever needed, `ALTER TABLE ADD COLUMN name_zh TEXT, ADD COLUMN description_zh TEXT` — one migration.

The tradeoff: +4 TEXT columns on `menu_items`. Storage is negligible for nullable TEXT (pointers when NULL).

### Why Khmer is required but English is optional

`name_km NOT NULL` guarantees the customer-facing storefront always has a name to render. `name_en` is opportunistic — entered only when the merchant wants bilingual coverage. Falls back to `name_km` for English viewers when missing.

`description_km` and `description_en` are **both optional** because descriptions are optional even in the primary locale (many items are self-explanatory).

### `is_available` vs `is_visible` — two toggles, two roles

Conflating them into one flag would force one of these flows:

- Kitchen staff must open the merchant portal to toggle stock → slow, wrong role.
- Merchant must use the kitchen tablet to hide a seasonal item → wrong tool.

Splitting gives each role its own fast-path toggle, and the storefront's rendering logic is just: `show if (is_visible AND deleted_at IS NULL)`; if also `NOT is_available`, render greyed out with "Sold out today".

### Money as integer cents (not floats)

Every monetary column across XFOS uses `INTEGER` cents. Floats have rounding bugs; decimals are per-row heavier. `INTEGER` + app-layer formatting is the industry norm.

### Nullable `category_id` — items can be uncategorized

Small tenants with 5 items don't need categories. The `storefront` query groups them under an "Other" header or renders them flat. Forcing a category would be merchant friction with no customer benefit at small scale.

### Soft delete for items

Items are referenced by historical `order_items`. Hard delete would break order-history queries ("what did I sell last month?") or force a cascade that damages the audit trail. Soft delete (`deleted_at`) preserves the row; order history stays intact.

### `order_items.item_name` snapshots the item's name at order time

When an order is placed, the current Khmer (or English, depending on the customer's locale) name is **copied** onto `order_items.item_name`. That way:

- A merchant renaming the item next week doesn't silently rewrite past order history.
- Order details are self-contained — historical queries don't need to join `menu_items`.

The source for this snapshot was previously `menu_item_translations`; with the collapse, it's now `menu_items.name_km` or `menu_items.name_en` directly. Same semantics, one fewer table read.

### Variants, options, images — separate tables

An item optionally has:

- Multiple images (`menu_item_images`, one marked primary).
- Size/style variants with independent prices (`menu_item_variants`, e.g. S/M/L).
- Configurable options grouped by concept (`menu_item_option_groups` + `menu_item_options`, e.g. "Spicy Level: mild/hot/very hot", "Extras: extra meat +$2").

See `design-discussions/menu-items-variants-options.md` for the full design + 7 use-case walkthroughs.

### Pricing rule when variants exist

If an item has **no variants**, `base_price_cents` is required and is the item's price. If the item has **variants**, `base_price_cents` is ignored (typically `NULL`); each variant carries its own `price_cents` and replaces (does not add to) the base. Options then add their `price_delta_cents` on top. Enforced at the application layer.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `tenants` | Parent (N:1) | Tenant that owns this item |
| `menu_categories` | Parent (N:1, nullable) | Category grouping (inline bilingual names now) |
| `menu_item_images` | Child (1:N) | Multiple sortable images with optional alt text; at most one primary |
| `menu_item_variants` | Child (1:N) | Size/style variants (S/M/L) with independent prices; at most one default |
| `menu_item_option_groups` | Child (1:N) | Option groups (spicy level, sauce, extras) |
| `menu_item_options` | Indirect (via option groups) | Actual selectable options with `price_delta_cents` |
| `cart_items` | Child (1:N) | Active cart references (live) |
| `order_items` | Child (1:N) | Historical order references; snapshots of variant + options live in JSONB columns |
| `setup_progress` | Indirect | `menu_completed_at` depends on items existing |
| `tenant_health` | Indirect | `translations_healthy` checks whether items have `name_en` coverage |
