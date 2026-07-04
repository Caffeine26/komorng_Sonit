# Table Reference: `floor_plans`

| Property | Value |
|---|---|
| **Domain** | Order |
| **Tenant-scoped** | Yes (composite PK) |
| **Prisma model** | `FloorPlan` |
| **Table #** | NEW — added 2026-04-24 (37 of 38) |

---

## Part 1 — Overview

The `floor_plans` table represents a **named drawing canvas** on which a tenant's dine-in tables are positioned. Each floor plan is a coordinate system (width × height in arbitrary canvas units) that the merchant uses in the portal to draw a layout, and that hall staff use at the front-of-house tablet to see live table status.

Most Cambodian restaurants have two natural zones — for example **Main Floor** and **Patio**, or **Ground Floor** and **VIP Room** — and want to render them as separate plans the staff can switch between. A single shared canvas would either crowd those zones together visually or force them to be modelled as awkward sub-areas.

A tenant has **one or more floor plans**. Onboarding auto-provisions one default plan (named "Main Floor") so a single-zone restaurant never has to think about it.

### Lifecycle

1. **Created** — at tenant onboarding (default "Main Floor"), or when the merchant taps "Add floor plan" in the portal.
2. **Edited** — merchant adjusts width/height (canvas resize), name, sort order. Tables on the plan keep their positions.
3. **Active** while merchants and staff use it for layout and status display.
4. **Soft-deleted** — `is_active = FALSE` removes it from active circulation. Existing tables on a deactivated plan must be moved or also deactivated first (enforced by the application, not the schema, because cross-row CHECKs are clumsy).

### Out of scope at MVP

- **Background image** (uploading a real architectural blueprint as a backdrop). Add a nullable `background_image_url TEXT` column when a real merchant requests it.
- **Per-zone scale** (1 unit = 5cm vs 10cm). Canvas units are arbitrary at MVP; the renderer scales to fit the viewport.
- **Multi-tenant locations** — XFOS treats each tenant as one location for now. If a single business expands to multiple physical locations, the cleanest path is **one tenant per location** rather than nested floor-plan hierarchies.

---

## Part 2 — CREATE TABLE

```sql
CREATE TABLE floor_plans (
  tenant_id   TEXT NOT NULL,
  id          TEXT NOT NULL,
  name        TEXT NOT NULL,                              -- 'Main Floor', 'Patio', 'VIP Room'
  width       INTEGER NOT NULL DEFAULT 1000,              -- canvas width in arbitrary units
  height      INTEGER NOT NULL DEFAULT 800,               -- canvas height
  sort_order  INTEGER NOT NULL DEFAULT 0,                 -- display order in the merchant portal tab strip
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,              -- soft-delete via deactivation
  notes       TEXT,                                       -- internal notes for the merchant
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(3) NOT NULL,

  -- Composite PK enforces tenant isolation at the FK level (no parity triggers needed)
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,

  CONSTRAINT floor_plans_width_range  CHECK (width  > 0 AND width  <= 10000),
  CONSTRAINT floor_plans_height_range CHECK (height > 0 AND height <= 10000),

  -- Two ACTIVE plans can't share a name within a tenant (deactivated plans free their name)
  CONSTRAINT floor_plans_active_name_unique UNIQUE (tenant_id, name) DEFERRABLE INITIALLY IMMEDIATE
    -- NOTE: PostgreSQL doesn't allow partial UNIQUE on table constraints; promote to a partial index instead:
);

-- Partial unique index — replaces the conditional UNIQUE above
CREATE UNIQUE INDEX floor_plans_active_name_unique
  ON floor_plans (tenant_id, name)
  WHERE is_active = TRUE;

CREATE INDEX ON floor_plans (tenant_id, sort_order)
  WHERE is_active = TRUE;
```

---

## Part 3 — Column-by-Column

### `tenant_id` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** The tenant that owns this floor plan.
- **Constraints:** Part of the composite primary key `(tenant_id, id)`. `FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`.
- **Why:** Floor plans are inherently tenant-scoped — every floor plan belongs to one restaurant. The composite PK pattern means every cross-table FK to this row is also composite, eliminating any chance of a child row (a `tables` row) belonging to a different tenant than its parent floor plan.

### `id` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None (app-generated cuid)
- **Purpose:** Unique identifier for this floor plan within its tenant.
- **Constraints:** Part of the composite primary key `(tenant_id, id)`.
- **Why:** Standard cuid pattern. Referenced by `tables.floor_plan_id`.

### `name` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** Human-readable name shown in the merchant portal's floor-plan tab strip and in the staff-side renderer.
- **Constraints:** Active plans must have a unique name within a tenant — `UNIQUE INDEX (tenant_id, name) WHERE is_active = TRUE`. Deactivated plans free their name for reuse.
- **Why:** Merchants think in terms of zone names — "Main Floor", "Patio", "VIP Room". Shorter labels render better on the portal's tab strip. Application validation should enforce reasonable length (e.g., 1–40 chars) and prevent leading/trailing whitespace.

### `width` — INTEGER NOT NULL DEFAULT 1000

- **Nullable:** No
- **Default:** `1000`
- **Purpose:** The canvas width in arbitrary "canvas units" (the merchant portal's coordinate system).
- **Constraints:** `CHECK (width > 0 AND width <= 10000)`.
- **Why:** Canvas units are deliberately abstract — not pixels, not metres. The portal's editor renders at any zoom level the merchant likes, and the staff renderer scales to fit the viewport. Default `1000` × `800` is a comfortable starting size for a typical restaurant; merchants can resize to fit their real layout.

  Upper bound `10000` is a sanity guard against UI bugs that would otherwise let the canvas grow unbounded; it's well past the size any real-world restaurant needs.

### `height` — INTEGER NOT NULL DEFAULT 800

Same shape as `width`. Default `800`. Same `CHECK (height > 0 AND height <= 10000)`.

### `sort_order` — INTEGER NOT NULL DEFAULT 0

- **Nullable:** No
- **Default:** `0`
- **Purpose:** Determines the order of floor-plan tabs in the merchant portal and in the staff renderer.
- **Constraints:** None at the DB level (application sorts).
- **Why:** When a tenant has "Main Floor" + "Patio" + "VIP Room", they want a deterministic order. Lowest `sort_order` first; ties broken by `created_at`. The portal can offer drag-to-reorder which writes new `sort_order` values.

### `is_active` — BOOLEAN NOT NULL DEFAULT TRUE

- **Nullable:** No
- **Default:** `TRUE`
- **Purpose:** Soft-delete via deactivation. `FALSE` removes the plan from active circulation without losing historical data.
- **Constraints:** None at the DB level.
- **Why:** Hard-deleting a floor plan would either CASCADE its tables (losing operational history) or fail because tables / orders reference them. Soft-delete via `is_active = FALSE` is the standard pattern. The application MUST require all tables on the plan to be moved or also deactivated before the plan can be deactivated — this is enforced in the merchant-portal flow, not as a CHECK (cross-row CHECKs are clumsy in PostgreSQL).

### `notes` — TEXT (nullable)

- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Free-form internal notes for the merchant ("renovated 2026-Q2", "patio closed during rainy season").
- **Constraints:** None.
- **Why:** Optional. Never customer-facing.

### `created_at` / `updated_at` — TIMESTAMP(3) NOT NULL

Standard audit timestamps. `created_at` defaults to `CURRENT_TIMESTAMP`; `updated_at` is maintained by Prisma `@updatedAt`.

---

## Part 4 — Indexes

### `PRIMARY KEY (tenant_id, id)`

- **What it serves:** Direct lookups, and the FK target for `tables.floor_plan_id`. The leading `tenant_id` makes tenant-scoped scans efficient.

### `UNIQUE INDEX floor_plans_active_name_unique ON (tenant_id, name) WHERE is_active = TRUE`

- **What it serves:** Two things at once.
  1. Prevents the merchant from creating two active "Patio" floor plans by mistake.
  2. Indexes the "find floor plan by name" lookup the merchant portal uses when restoring view state.
- **Why partial:** Deactivated plans should not block name reuse. The merchant might deactivate "Patio (old)" and create a fresh "Patio".

### `INDEX ON (tenant_id, sort_order) WHERE is_active = TRUE`

- **What it serves:** The merchant portal's "list all my active floor plans in display order" query.

---

## Part 5 — Relationships

### Foreign Keys

| Column | References | On Delete | Why |
|---|---|---|---|
| `(tenant_id)` | `tenants(id)` | `CASCADE` | Tenant deletion removes all floor plans |

### Incoming References

| Table | Column | Relationship | On Delete |
|---|---|---|---|
| `tables` | `(tenant_id, floor_plan_id)` | Many tables per floor plan | No cascade — application requires all tables to be moved or deactivated before a floor plan can be soft-deleted |

### Cross-FK Tenant Parity

**None needed.** The composite PK `(tenant_id, id)` and composite FK `(tenant_id, floor_plan_id)` make cross-tenant references mathematically impossible. Parity triggers retired schema-wide on 2026-04-24.

---

## Part 6 — Real-World Usage Scenarios

### Scenario 1: Onboarding default

Sokha signs up "Boba Khmae" (a small bubble-tea kiosk). The onboarding wizard auto-provisions one floor plan:

```
floor_plans:
  (tenant_id: 'clx_boba_khmae', id: 'fp_default', name: 'Main Floor',
   width: 1000, height: 800, sort_order: 0, is_active: TRUE)
```

Sokha never visits the floor-plan editor — she's a kiosk, no dine-in tables. The default plan exists for the schema invariant ("every tenant has at least one floor plan") but is unused.

### Scenario 2: Multi-zone restaurant

Borey runs "Sach Ko Ang" — a 40-seat indoor BBQ restaurant with a 20-seat patio. He configures two plans:

```
floor_plans:
  (id: 'fp_main',  name: 'Main Floor',  width: 1200, height: 900, sort_order: 0)
  (id: 'fp_patio', name: 'Patio',       width: 800,  height: 600, sort_order: 1)
```

The merchant portal shows two tabs. The staff tablet at the host stand shows two tabs too. When the host needs a 4-top, they glance at "Main Floor" first; if everything's red, they switch to "Patio".

### Scenario 3: Renovation / soft-delete

The patio closes for rainy season. Borey opens the floor plan in the portal and toggles `is_active = FALSE`. The portal warns him: "This floor plan has 8 tables. Move them to another plan or deactivate them first." Borey deactivates the patio's tables, then deactivates the plan. Two months later he reactivates everything for the next dry season — the same `id`, the same tables, no migration.

---

## Part 7 — Design Decisions

### Why a separate `floor_plans` table instead of canvas dimensions on `tenant_settings`

A single canvas per tenant works for one-zone restaurants but breaks for multi-zone (indoor + patio + VIP). Putting `floor_plan_width` and `floor_plan_height` on `tenant_settings` would force multi-zone tenants to either cram everything onto one canvas (visually bad) or model zones as awkward sub-areas. A first-class `floor_plans` table costs one extra table but makes multi-zone correct from day one.

### Why arbitrary canvas units (not pixels or metres)

Pixels are coupled to a specific viewport size — a layout drawn at 1920×1080 looks tiny at 800×600. Metres require the merchant to measure their restaurant accurately, which they won't. Arbitrary units (the merchant draws what looks right; the renderer scales to fit) is the only model that works without merchant cognitive load.

### Why `is_active` instead of hard delete

Deactivated plans retain history (orders that reference tables on this plan still resolve correctly). Hard delete with `ON DELETE CASCADE` would break that — yesterday's order receipt looking up "Table 5" would fail because the table and its plan no longer exist.

### Why the application enforces "no active tables before deactivation," not a CHECK

Cross-row CHECK constraints in PostgreSQL require either a trigger or a stored procedure — both clumsy and easy to bypass with raw SQL during incident response. The merchant-portal flow is the only place a floor plan gets deactivated, and that flow can show a clear error message ("Move the 8 tables on Patio first"). DB-level enforcement is over-engineered for this case.

### Why the partial UNIQUE on `(tenant_id, name)`

Two active plans with the same name confuses the staff and the renderer. But after a renovation, the merchant might want "Patio (old)" deactivated and a fresh "Patio" — the partial constraint allows this naturally.

---

## Part 8 — Related Tables

| Table | Relationship | Notes |
|---|---|---|
| `tenants` | Parent (composite FK on tenant_id) | Tenant deletion CASCADE-removes all floor plans |
| `tables` | Children (composite FK `(tenant_id, floor_plan_id)`) | Tables are positioned on a floor plan |
| `qr_contexts` | Indirect (via `tables.id`) | Each table can have at most one active QR; floor plan determines where the QR's table lives |
| `order_sessions` | Indirect (via `tables.id`) | Active sessions on tables drive the OCCUPIED state shown on the floor plan |
| `tenant_settings` | Sibling | Onboarding auto-creates the default floor plan; future per-tenant render preferences could live here |
