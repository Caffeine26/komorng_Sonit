# `menu_item_option_groups`

| Attribute | Value |
|---|---|
| **Domain** | Catalog |
| **Tenant-scoped?** | Yes (denormalized `tenant_id`) |
| **Prisma model** | `MenuItemOptionGroup` |
| **Mapped name** | `@@map("menu_item_option_groups")` |
| **Status** | ✅ New table 2026-04-23 |

---

## Part 1: Overview

`menu_item_option_groups` is the container for add-on / modifier choices an item offers. A group bundles related options together and sets the selection rules (required vs optional, single vs multi-select). Examples:

- *"Spicy Level"* — required, single-select (Mild / Hot / Very Hot).
- *"Sauce"* — optional, single-select (Ketchup / Mustard / none).
- *"Extras"* — optional, multi-select up to 3 (Extra Meat / Extra Cheese / Extra Bacon).

Each group has one or more rows in `menu_item_options`. Options carry the selectable labels and their `price_delta_cents`.

### How `min_select` and `max_select` map to UX

| `min_select` | `max_select` | UI | Example |
|---|---|---|---|
| `0` | `1` | Optional radio or "None" option | "Sauce" |
| `1` | `1` | Required radio | "Spicy Level" |
| `0` | `N` (≥2) | Optional checkboxes | "Extras — pick up to 3" |
| `1` | `N` (≥2) | Required checkboxes with min | "Pick at least one side" |

Enforced at the app layer during order validation.

---

## Part 2: CREATE TABLE

> **2026-04-25:** composite-PK refresh.

```sql
CREATE TABLE menu_item_option_groups (
  tenant_id        TEXT NOT NULL,
  id               TEXT NOT NULL,
  menu_item_id     TEXT NOT NULL,

  -- Bilingual display (Khmer required — customer-facing)
  name_km          TEXT NOT NULL,          -- 'កម្រិតហឹរ', 'ទឹកជ្រលក់', 'បន្ថែម'
  name_en          TEXT,                   -- 'Spicy Level', 'Sauce', 'Extras'

  -- Selection constraints
  min_select       INTEGER NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select       INTEGER NOT NULL DEFAULT 1 CHECK (max_select >= 1),

  sort_order       INTEGER NOT NULL DEFAULT 0,

  created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP(3) NOT NULL,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, menu_item_id) REFERENCES menu_items(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT chk_min_max_select CHECK (max_select >= min_select)
);

CREATE INDEX ON menu_item_option_groups (tenant_id, menu_item_id, sort_order);
```

---

## Part 3: Column-by-Column

### `id`, `tenant_id`, `menu_item_id`

Standard. Tenant_id denormalized for parity defense.

### `name_km` / `name_en`

Group label shown above the option list in the picker. Khmer required, English optional (customer-facing).

### `min_select` — INTEGER NOT NULL DEFAULT 0

Minimum number of options the customer must pick from this group. `0` means the group is optional (customer can skip). `1` means required.

### `max_select` — INTEGER NOT NULL DEFAULT 1

Maximum number of options selectable. `1` = single-select (radio). `≥2` = multi-select (checkbox).

### CHECK constraints

- `min_select >= 0`
- `max_select >= 1`
- `max_select >= min_select` (a group where max < min is impossible to satisfy)

### `sort_order`, `created_at`, `updated_at`

Standard.

---

## Part 4: Indexes

### Composite `(menu_item_id, sort_order)`

Serves the storefront's primary query — "get all option groups for this item in display order":

```sql
SELECT id, name_km, name_en, min_select, max_select
FROM menu_item_option_groups
WHERE menu_item_id = 'item_burger'
ORDER BY sort_order ASC, id ASC;
```

Then for each group, fetch its options from `menu_item_options WHERE option_group_id = ...`.

---

## Part 5: Relationships

### Outgoing FKs

| Target | FK | Cascade |
|---|---|---|
| `tenants` | `tenant_id` | `ON DELETE CASCADE` |
| `menu_items` | `menu_item_id` | `ON DELETE CASCADE` |

### Incoming references

| Child | FK | Notes |
|---|---|---|
| `menu_item_options` | `option_group_id` | Cascades — options die with the group |

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Required Spicy Level + optional Sauce + optional Extras

Burger item: required heat (single), optional sauce (single), optional extras (multi up to 3).

```sql
INSERT INTO menu_item_option_groups
  (id, tenant_id, menu_item_id, name_km, name_en, min_select, max_select, sort_order)
VALUES
  ('og_spicy',  'tenant_lb', 'item_burger', 'កម្រិតហឹរ',  'Spicy Level', 1, 1, 10),
  ('og_sauce',  'tenant_lb', 'item_burger', 'ទឹកជ្រលក់',   'Sauce',       0, 1, 20),
  ('og_extras', 'tenant_lb', 'item_burger', 'បន្ថែម',     'Extras',      0, 3, 30);
```

Storefront renders three sections in the modal:

```
┌────────────────────────────────┐
│ Burger — $6.50                 │
│                                │
│ Spicy Level *  (required)      │
│  ◯ Not Spicy                   │
│  ◯ Medium Hot                  │
│  ◯ Very Spicy                  │
│                                │
│ Sauce          (optional)      │
│  ◯ Ketchup                     │
│  ◯ Mustard                     │
│                                │
│ Extras — pick up to 3          │
│  ☐ Extra Meat   +$2.00         │
│  ☐ Extra Cheese +$1.00         │
│  ☐ Extra Bacon  +$1.50         │
└────────────────────────────────┘
```

### Scenario 2: Merchant renames a group

Merchant decides "Spicy Level" should be "Heat Level":

```sql
UPDATE menu_item_option_groups
SET    name_en = 'Heat Level', updated_at = NOW()
WHERE  id = 'og_spicy';
```

Future order modals show the new label. Historical orders that snapshotted the old name in `order_items.options_snapshot` still show "Spicy Level" — by design.

### Scenario 3: Delete a group

Merchant removes the "Extras" group entirely:

```sql
DELETE FROM menu_item_option_groups WHERE id = 'og_extras';
```

Cascade removes all `menu_item_options` under it. Storefront picker no longer shows the Extras section. Historical orders remain intact via their JSONB snapshots.

---

## Part 7: Design Decisions

### Why a group + option split (not flat rows)

Flat "options" with a `group_name` string would allow drift ("Extras" vs "extras" vs "Extra"). A group table forces a single canonical label per group, enforces selection rules centrally, and lets the UI render clean sections.

### Why `min_select` / `max_select` are per-group (not per-option)

Selection rules are a property of the **group**, not individual options. "Pick up to 3 extras" applies to the entire Extras group. Putting this on options would create ambiguity ("can I pick 3 ketchups and 0 mustards? or 2 each?") and scatter the rule.

### Why `max_select = 1` default

The common case is a single-select picker (radio). Multi-select is explicit opt-in via `max_select >= 2`.

### Why CHECK constraints on `min/max`

Nonsensical combinations (`max < min`, negative values) would be allowed by the default integer types. CHECKs catch them at the DB layer — defense-in-depth against app bugs.

### Why no soft delete

Groups are merchant-controlled menu structure, not historical records. If deleted, historical `order_items.options_snapshot` JSONB rows preserve what customers actually ordered. Hard delete is sufficient.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `menu_items` | Parent (N:1) | The item this option group modifies |
| `menu_item_options` | Child (1:N) | The actual selectable options in this group |
| `tenants` | Parent (N:1) | Tenant isolation |
| `order_items` (via JSONB snapshot) | Indirect | Selected options snapshotted with the group name preserved |
