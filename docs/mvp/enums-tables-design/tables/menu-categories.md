# `menu_categories`

| Attribute | Value |
|---|---|
| **Domain** | Catalog |
| **Tenant-scoped?** | Yes |
| **Prisma model** | `MenuCategory` |
| **Mapped name** | `@@map("menu_categories")` |
| **Status** | ✅ Redesigned 2026-04-23 — inline bilingual (km required, en optional); `menu_category_translations` table dropped |

---

## Part 1: Overview

`menu_categories` is the parent container for grouping menu items within a single tenant's storefront menu. Every food stall, restaurant, or kiosk organizes its offerings into categories — "Noodles", "Drinks", "Grilled Meats" — and this table holds one row per category with its bilingual display name stored inline.

### Why categories exist as a separate table

1. **Ordering matters.** Categories control the display order on the storefront (`sort_order`). Without a first-class table, you cannot reorder categories independently of their items.
2. **Hide/rename without item churn.** Merchant toggles "Seasonal Specials" off → 1 UPDATE on the category row, not N UPDATEs across every item in it. Renaming "Bev" → "Beverages" → 1 UPDATE.
3. **Empty categories as placeholders.** A merchant can create "Desserts" before adding items to it.
4. **Translation integrity.** One `name_km` for "Drinks" rendered everywhere — no drift risk from N denormalized copies on items.

### Why inline bilingual (not a separate translations table)

Earlier iterations had a `menu_category_translations` sibling table, reasoning that "more locales might be needed later" (Chinese for tourist areas, Japanese for a ramen shop). That was speculation. XFOS is Khmer-first for the Cambodian SMB market — there is no roadmap for additional locales at MVP.

Inline bilingual (`name_km` + `name_en`) gives:
- No JOIN for storefront menu rendering.
- No parity trigger needed (no cross-table tenant mismatch possible).
- No risk of a category existing without a translation (schema enforces `name_km NOT NULL`).
- A simpler, lighter table — one row per category, not three.

If a third locale is genuinely needed later, `ALTER TABLE … ADD COLUMN name_zh TEXT` is a one-line migration.

### Khmer is required; English is optional

Categories are **customer-facing** — Cambodian customers see them when scanning a QR code. Khmer is their primary language, so `name_km` is required. English (`name_en`) is optional, shown to tourists / expats who switch the storefront locale toggle to EN. Compare with `tenants.name_en NOT NULL + name_km NULL-able`, which inverts this because the tenant name is primarily shown on admin pages, invoices, and platform dashboards (English-heavy audiences).

### Flat hierarchy (no parent_category_id)

Categories are flat — there is no nesting. Street stalls, cafés, and small restaurants (XFOS's target market) don't need a category tree. Toast, Square, and Foodpanda all default to flat categories for the same reason.

If demand for sub-categories appears post-MVP, adding `parent_category_id TEXT REFERENCES menu_categories(id)` is backward-compatible — every existing row just stays at `parent_category_id = NULL` (top-level).

---

## Part 2: CREATE TABLE

> **2026-04-25:** composite-PK refresh.

```sql
CREATE TABLE menu_categories (
  tenant_id   TEXT NOT NULL,
  id          TEXT NOT NULL,

  -- Bilingual display (Khmer required — customer-facing)
  name_km     TEXT NOT NULL,
  name_en     TEXT,

  -- Ordering & visibility
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,

  -- Audit
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(3) NOT NULL,            -- Prisma @updatedAt (no DB default)
  deleted_at  TIMESTAMP(3),

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX ON menu_categories (tenant_id, sort_order) WHERE is_active = TRUE;
```

---

## Part 3: Column-by-Column

### `id` -- TEXT PRIMARY KEY

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** `cuid()` (application-generated)
- **Purpose:** Surrogate primary key.
- **Constraints:** Primary key.
- **Why it exists:** Every table has a cuid PK by convention. Referenced by `menu_items.category_id`.

### `tenant_id` -- TEXT NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** Which tenant owns this category.
- **Constraints:** `NOT NULL`, `REFERENCES tenants(id) ON DELETE CASCADE`.
- **Why it exists:** Tenant isolation. Every tenant-scoped query begins `WHERE tenant_id = ?`. If the tenant is deleted, all their categories are removed.

### `name_km` -- TEXT NOT NULL (Khmer, primary customer-facing)

- **Type:** `TEXT`
- **Nullable:** **No** — Khmer is the customer-facing default in Cambodia.
- **Default:** None (must be provided on insert)
- **Purpose:** The Khmer name of the category as it appears on the storefront menu. Examples: `"ភេសជ្ជៈ"` (Drinks), `"មីឆា"` (Fried Noodles), `"បង្អែម"` (Desserts).
- **Constraints:** `NOT NULL`.
- **Why required:** The storefront default locale is Khmer. A category without a Khmer name would render as blank or fall back to English, breaking the Khmer-first customer experience. Forcing it at the schema layer prevents that class of bug.

### `name_en` -- TEXT (English, optional)

- **Type:** `TEXT`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** The English name of the category, shown to customers who switch the storefront to English. Examples: `"Drinks"`, `"Fried Noodles"`, `"Desserts"`.
- **Constraints:** None beyond type.
- **Why nullable:** Small stalls whose entire clientele is Khmer-speaking may not bother entering an English name. The storefront falls back to `name_km` when the user is on the EN locale and `name_en` is NULL.

### `sort_order` -- INTEGER NOT NULL DEFAULT 0

- **Type:** `INTEGER`
- **Nullable:** No
- **Default:** `0`
- **Purpose:** Display order on the storefront menu. Lower values render first.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Merchants need control over menu layout — "Drinks" before "Food" vs "Food" before "Drinks" is a business decision. Ties are broken by `id` for deterministic ordering.
- **Note:** Not unique within a tenant — two categories with `sort_order = 10` both sort at the same position, then `id ASC` decides. A UNIQUE constraint would force every reorder to be an awkward multi-row UPDATE.

### `is_active` -- BOOLEAN NOT NULL DEFAULT TRUE

- **Type:** `BOOLEAN`
- **Nullable:** No
- **Default:** `TRUE`
- **Purpose:** Whether the category is currently shown on the storefront. A merchant can toggle this off to hide a seasonal or paused category without deleting it.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Captures a distinct state from `deleted_at`. See design decisions.

### `created_at` -- TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** `CURRENT_TIMESTAMP`
- **Purpose:** When the category was created. Audit trail.
- **Constraints:** `NOT NULL`.

### `updated_at` -- TIMESTAMP(3) NOT NULL

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** Maintained by Prisma `@updatedAt` — no DB-level default.
- **Purpose:** Last modification timestamp.
- **Constraints:** `NOT NULL`.

### `deleted_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes — `NULL` means the category is live.
- **Default:** `NULL`
- **Purpose:** Soft-delete timestamp. When a merchant deletes a category, this is set to `NOW()`; the row stays in the database for recovery. See design decisions.
- **Constraints:** None beyond type.

---

## Part 4: Indexes

### Index on `tenant_id`

```sql
CREATE INDEX ON menu_categories (tenant_id);
```

**What queries it serves:** Every query in XFOS scopes by `tenant_id` first. This index makes the most common query — "give me all categories for this tenant" — an index scan instead of a sequential scan.

**Example queries:**

```sql
-- Storefront: load active, non-deleted categories for this tenant, ordered
SELECT id, name_km, name_en, sort_order
FROM menu_categories
WHERE tenant_id = 'clxyz123abc'
  AND deleted_at IS NULL
  AND is_active = TRUE
ORDER BY sort_order ASC, id ASC;

-- Merchant portal: list all live categories (inactive OK, but not soft-deleted)
SELECT id, name_km, name_en, sort_order, is_active
FROM menu_categories
WHERE tenant_id = 'clxyz123abc'
  AND deleted_at IS NULL
ORDER BY sort_order ASC, id ASC;
```

**Why not a composite index `(tenant_id, sort_order)`:** The number of categories per tenant is small (typically 3–15). After the `tenant_id` filter narrows to that handful, Postgres sorts them in memory trivially. A composite index adds write overhead for negligible read benefit.

**Why not a partial index `WHERE deleted_at IS NULL`:** Over-engineering at MVP scale. Most categories are non-deleted in steady state; a partial index barely shrinks the footprint.

### Primary key index on `id`

Implicit. Used by `menu_items.category_id` FK lookups.

---

## Part 5: Relationships

### Outgoing FK

| Target table | FK column | Cascade | Why |
|---|---|---|---|
| `tenants` | `tenant_id` | `ON DELETE CASCADE` | Categories are tenant-owned data |

### Incoming references

| Child table | FK column | On Delete | Notes |
|---|---|---|---|
| `menu_items` | `category_id` | No cascade (Prisma default: `NO ACTION`); `category_id` is nullable — an item can be uncategorized | Soft-delete on the category does not cascade; orphaned items retain their `category_id` pointer to the soft-deleted category row. Recovery (undelete) restores the relationship cleanly. |

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Phnom Penh noodle stall sets up its menu

Sokha opens "Street 99 Noodles" on XFOS. Before adding any items, she creates three categories in the Merchant Portal:

```sql
INSERT INTO menu_categories (id, tenant_id, name_km, name_en, sort_order, is_active) VALUES
  ('cat_01', 'tenant_s99', 'មី',        'Noodles', 10, TRUE),
  ('cat_02', 'tenant_s99', 'បាយ',       'Rice',    20, TRUE),
  ('cat_03', 'tenant_s99', 'ភេសជ្ជៈ',    'Drinks',  30, TRUE);
```

She then adds items, each referencing one of these categories via `menu_items.category_id`. The storefront shows three sections in the specified order.

### Scenario 2: Small stall skips English entirely

Dara runs a one-person noodle cart. His customers are 100% Khmer-speakers. He creates his categories without English names:

```sql
INSERT INTO menu_categories (id, tenant_id, name_km, name_en, sort_order) VALUES
  ('cat_10', 'tenant_dara', 'គុយទាវ',    NULL, 10),
  ('cat_11', 'tenant_dara', 'ភេសជ្ជៈ',    NULL, 20);
```

The storefront renders the Khmer names directly. If a tourist ever switches the locale toggle to English, they see the Khmer names as fallback — better than a blank.

### Scenario 3: Bubble tea shop hides a seasonal category

"Boba Queen" has a "Summer Specials" category active during hot months. In April, she switches seasonal drinks off until next year:

```sql
UPDATE menu_categories
SET    is_active = FALSE, updated_at = NOW()
WHERE  id = 'cat_summer_specials';
```

The category disappears from the storefront. Items within it also disappear (the storefront query filters by category.is_active). Next summer she flips `is_active = TRUE` and everything is back.

### Scenario 4: Merchant reorders categories

Sokha decides customers should see drinks first. She drags "Drinks" above "Noodles" in the Merchant Portal. The client sends a reorder request; the backend updates:

```sql
UPDATE menu_categories SET sort_order = 5,  updated_at = NOW() WHERE id = 'cat_03';  -- Drinks
UPDATE menu_categories SET sort_order = 15, updated_at = NOW() WHERE id = 'cat_01';  -- Noodles
UPDATE menu_categories SET sort_order = 25, updated_at = NOW() WHERE id = 'cat_02';  -- Rice
```

Convention: use spaced `sort_order` values (5, 15, 25…) so inserting between existing categories later doesn't require a full renumber. Ties are broken by `id ASC`.

### Scenario 5: Soft-delete and recovery

Sokha accidentally deletes her "Drinks" category. All her drinks items still reference it via `category_id`:

```sql
UPDATE menu_categories
SET    deleted_at = NOW()
WHERE  id = 'cat_03';
```

The storefront query filters out soft-deleted categories, so "Drinks" vanishes from the customer view — but the items in it are now orphaned (their `category_id` still points to the soft-deleted row). Recovery is one UPDATE:

```sql
UPDATE menu_categories
SET    deleted_at = NULL, updated_at = NOW()
WHERE  id = 'cat_03';
```

Category is back, items reappear under it. No data loss, no cascade complexity.

---

## Part 7: Design Decisions

### Why inline bilingual columns (not a separate translations table)

Previously, category names lived in `menu_category_translations`, with one row per (category_id, locale). That was dropped in favor of inline `name_km` + `name_en` columns. Reasons:

- **No cross-table drift.** One category → one row → two columns. No risk of a category existing without a translation.
- **No JOIN on storefront reads.** The menu-rendering query is the hottest read path — eliminating a JOIN speeds up every storefront page load.
- **No parity trigger.** The cross-table `menu_category_translations_tenant_parity` trigger used to enforce that a translation's tenant matched its category's tenant. With one row, that concern evaporates.
- **Matches the `tenants` inline-bilingual pattern** already in the schema.
- **YAGNI on more locales.** XFOS is Khmer-first for Cambodia. No third locale is planned. If ever needed, `ALTER TABLE ADD COLUMN name_zh TEXT` is a minute's work.
- **Simpler querying:** "categories missing an English name" becomes `WHERE name_en IS NULL`, not a LEFT JOIN with a locale filter.

The tradeoff: adding a third locale becomes a migration (add column) instead of an INSERT. For MVP Cambodia, that cost is zero.

### Why Khmer is required and English is optional (inverse of `tenants`)

Each table's mandatory locale follows its primary audience:

| Table | Required locale | Audience |
|---|---|---|
| `tenants` | English | Admin panels, invoices, platform dashboards (English-heavy) |
| `menu_categories` | **Khmer** | Storefront customers (Khmer-speaking by default) |
| `menu_items` (same pattern when collapsed) | **Khmer** | Storefront customers |

Same schema style, different default — driven by who actually reads the field.

### Soft delete instead of hard delete

1. **Accidental deletion recovery.** Small business owners make mistakes. Restoring is a single `UPDATE` vs. complex data recovery.
2. **Referential safety.** Items that reference this category via `category_id` don't need cascading cleanup; they just stay linked to the soft-deleted row.
3. **Audit trail.** `deleted_at` records when the deletion happened — useful for support.

### `is_active` as a separate concept from `deleted_at`

Both hide the category, but represent different business states:

| `is_active` | `deleted_at IS NULL?` | Visible on storefront? | Merchant portal treatment |
|---|---|---|---|
| `TRUE` | yes | ✅ Yes | Normal edit view |
| `FALSE` | yes | ❌ Hidden (paused) | Shown greyed out — "Paused, can be resumed" |
| `TRUE` | no (deleted) | ❌ Hidden (deleted) | Hidden from default view; appears under "Recently Deleted" |
| `FALSE` | no (deleted) | ❌ Hidden (deleted) | Same as above |

### No `description` column

Categories in a food-ordering context are navigational — "Noodles", "Drinks", "BBQ" — and do not need descriptions. If a tenant needs to explain what "Chef's Specials" means, that copy belongs in the storefront UI as a section header (future feature), not on the category row.

### No `parent_category_id` (flat hierarchy)

XFOS's target market (stalls, cafés, small restaurants) uses flat categories naturally. Adding hierarchy would bring recursive queries, cycle prevention, depth limits, tree UI — all for a feature almost no one in this market uses. If demand appears post-MVP, the migration is one column addition, backward-compatible (existing rows are all top-level).

### No unique constraint on `sort_order`

Ties are broken by `id ASC`. A UNIQUE constraint would force every reorder to be a delicate multi-row UPDATE (temporarily violating the constraint between steps). Not worth it for a display-ordering hint.

### `updated_at` has no DB-level default

Prisma's `@updatedAt` maintains this column on every write, consistent with every other table in the schema. Adding a DB default would be redundant and inconsistent.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `tenants` | Parent (N:1) | Which tenant owns this category |
| `menu_items` | Child (1:N) | Items grouped under this category (nullable FK — uncategorized items allowed) |
