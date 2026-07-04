# Table Reference: `tables`

| Property | Value |
|---|---|
| **Domain** | Order |
| **Tenant-scoped** | Yes (composite PK) |
| **Prisma model** | `RestaurantTable`<br>(NOT `Table` — JavaScript and SQL both reserve "Table" in many contexts) |
| **Table #** | NEW — added 2026-04-24 (38 of 38) |

---

## Part 1 — Overview

The `tables` table represents a **physical dine-in seated table** at a restaurant. Each row is a draggable, named, status-bearing rectangle (or circle) on a `floor_plans` canvas. Rows in this table:

- Are positioned on a parent `floor_plans` row (one floor plan, many tables).
- Render in the merchant-portal **floor-plan editor** (drag, resize, rotate, label).
- Render in the staff-side **floor-plan tablet** with their current state colour.
- Are referenced by `qr_contexts` (one active QR per table at most), `order_sessions`, and `orders`.

### What is and isn't a "table"

`tables` is **strictly for dine-in seated tables** that should appear on the floor plan. Pickup counters, takeaway shelves, and storefront-only QR codes are NOT modelled here — they stay as `qr_contexts` rows with `context_type = 'STOREFRONT'` and no `table_id`. The split:

| Physical thing | Modelled as |
|---|---|
| Dine-in seated table | `tables` row + `qr_contexts` row pointing to it |
| Pickup counter / takeaway shelf | `qr_contexts` row only (`context_type = 'STOREFRONT'`) |
| Counter where customers can scan but not sit | `qr_contexts` row only |

This separation keeps the floor-plan UI clean (no random "Pickup Counter" rectangle floating in the middle of the dining room) and gives the staff renderer a meaningful set of objects.

### Renaming and QR regeneration

Two operational requirements drove the design:

1. **Tables can be renamed anytime via the merchant portal.** The `id` (cuid) stays stable; the `label` column changes freely. Historical orders snapshot the label at order time (`orders.table_ref` / `order_sessions.table_ref`) so old receipts always show the original label.
2. **QRs can be regenerated anytime.** When a placard rips or a table is replaced, the merchant generates a new QR — which deactivates the old `qr_contexts` row and creates a new active one. The partial unique index `qr_contexts_one_active_per_table` enforces "at most one active QR per table."

Together these mean **table identity is durable** (same `id` across renames and QR rotations) while everything around it is replaceable.

### Lifecycle

1. **Created** — merchant taps "Add table" in the floor-plan editor; portal POSTs the new row with default position/size.
2. **Edited** — merchant drags, resizes, rotates, renames; staff change `current_status` (RESERVED, CLEANING).
3. **Active** while in service. The application keeps `current_status = OCCUPIED` in sync with active sessions linked to the table.
4. **Soft-deleted** — `is_active = FALSE` removes the table from active circulation. Existing orders / sessions referencing it still resolve correctly. The label becomes available for reuse on a new table.

### Out of scope at MVP

- **Multi-table merging** for large parties — model as a separate session-level concept later.
- **Per-seat tracking within a table** — a "split-bill by seat" UX. Phase 2.
- **Reservation system** — `RESERVED` is a status flag; a real reservations table (with start time, party size, contact) is post-MVP. Until then, the merchant can use `tables.notes` for ad-hoc info.

---

## Part 2 — CREATE TABLE

```sql
-- Required enums (see enums/table-shape.md and enums/table-status.md)
CREATE TYPE "TableShape"  AS ENUM ('RECTANGLE', 'CIRCLE');
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING');

CREATE TABLE tables (
  tenant_id        TEXT NOT NULL,
  id               TEXT NOT NULL,
  floor_plan_id    TEXT NOT NULL,                                 -- parent canvas

  -- Display
  label            TEXT NOT NULL,                                  -- '5', 'VIP-1', 'Patio-A' — renamable

  -- Configuration
  capacity         INTEGER,                                        -- seats; nullable (bar stools etc.)
  area             TEXT,                                           -- 'main hall', 'patio', 'private room' — free text

  -- Floor-plan render data (canvas units)
  shape            "TableShape" NOT NULL DEFAULT 'RECTANGLE',
  position_x       INTEGER NOT NULL,                               -- top-left x on the canvas
  position_y       INTEGER NOT NULL,                               -- top-left y on the canvas
  width            INTEGER NOT NULL,                               -- canvas units
  height           INTEGER NOT NULL,                               -- canvas units (= width if shape=CIRCLE)
  rotation         INTEGER NOT NULL DEFAULT 0,                     -- degrees 0–359; meaningful for RECTANGLE

  -- State
  current_status   "TableStatus" NOT NULL DEFAULT 'AVAILABLE',     -- driven by sessions + staff actions
  version          INTEGER NOT NULL DEFAULT 1,                     -- optimistic concurrency

  -- Operational
  notes            TEXT,                                           -- 'near window', 'wobbly leg'
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,                  -- soft-delete

  created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP(3) NOT NULL,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, floor_plan_id) REFERENCES floor_plans(tenant_id, id),

  -- Shape / size sanity
  CONSTRAINT tables_shape_circle_is_square
    CHECK (shape != 'CIRCLE' OR width = height),
  CONSTRAINT tables_width_range     CHECK (width    > 0 AND width    <= 10000),
  CONSTRAINT tables_height_range    CHECK (height   > 0 AND height   <= 10000),
  CONSTRAINT tables_position_x_range CHECK (position_x >= 0 AND position_x <= 10000),
  CONSTRAINT tables_position_y_range CHECK (position_y >= 0 AND position_y <= 10000),
  CONSTRAINT tables_rotation_range  CHECK (rotation >= 0 AND rotation < 360),
  CONSTRAINT tables_capacity_positive CHECK (capacity IS NULL OR capacity > 0)
);

-- Two ACTIVE tables can't share a label within a tenant (deactivated tables free their label)
CREATE UNIQUE INDEX tables_active_label_unique
  ON tables (tenant_id, label)
  WHERE is_active = TRUE;

-- Floor-plan editor: load all tables on a plan
CREATE INDEX ON tables (tenant_id, floor_plan_id) WHERE is_active = TRUE;

-- Status dashboard / "find available 4-tops"
CREATE INDEX ON tables (tenant_id, current_status) WHERE is_active = TRUE;
```

---

## Part 3 — Column-by-Column

### `tenant_id` — TEXT NOT NULL

Composite PK with `id`. FK to `tenants(id) ON DELETE CASCADE`. Same pattern as every tenant-scoped table since the 2026-04-24 schema-wide composite-PK adoption.

### `id` — TEXT NOT NULL (cuid)

App-generated. Stable across renames and QR rotations.

### `floor_plan_id` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** The floor plan this table sits on.
- **Constraints:** `FOREIGN KEY (tenant_id, floor_plan_id) REFERENCES floor_plans(tenant_id, id)`. Indexed.
- **Why:** Composite FK. Required because tables don't make sense outside a floor plan — the merchant needs to know which canvas to render the table on. If the merchant has only one plan, the application sets this to the default plan automatically.

### `label` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** Human-readable name shown on the floor plan, on receipts, on kitchen tickets, and in the merchant-portal table list.
- **Constraints:** Active tables must have a unique label within a tenant — `UNIQUE INDEX tables_active_label_unique ON (tenant_id, label) WHERE is_active = TRUE`. Deactivated tables free their label.
- **Why:** Cambodian table identifiers are highly variable: `'5'`, `'A3'`, `'VIP-1'`, `'Terrace Left'`, `'Outdoor 3'`. TEXT (not INTEGER) accommodates them all. Application validation should enforce reasonable length (1–20 chars) and trim whitespace.

  Renamable anytime — historical accuracy is preserved by snapshotting the label onto `orders.table_ref` / `order_sessions.table_ref` at order/session creation time. Renaming "Table 5" to "Table 5A" today does NOT rewrite yesterday's receipts.

### `capacity` — INTEGER (nullable)

- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Number of seats the table accommodates.
- **Constraints:** `CHECK (capacity IS NULL OR capacity > 0)`.
- **Why:** Optional. Most tables have a defined capacity (a 2-top, a 4-top, an 8-top), but bar stools or counter spots may not. Used by the merchant portal for "find available table for a party of 6" queries and by analytics for "average revenue per seat per hour."

### `area` — TEXT (nullable)

- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Free-text zone label ("main hall", "patio", "private room").
- **Constraints:** None.
- **Why:** Even within a single floor plan, merchants may want to group tables by area for reporting ("how much revenue did the patio do this month?"). Free text is intentional — no enum because zone names vary wildly. Nullable because not every restaurant has named zones.

### `shape` — "TableShape" NOT NULL DEFAULT 'RECTANGLE'

- **Nullable:** No
- **Default:** `'RECTANGLE'`
- **Purpose:** Geometric shape for rendering.
- **Constraints:** Pairs with `width`/`height` via `CHECK (shape != 'CIRCLE' OR width = height)`.
- **Why:** Two values cover ~99% of real-world tables. See [`enums/table-shape.md`](../enums/table-shape.md).

### `position_x`, `position_y` — INTEGER NOT NULL

- **Nullable:** No
- **Default:** None (set by the merchant portal at "Add table" time, defaults to a sensible spot)
- **Purpose:** Top-left corner coordinates on the parent floor plan's canvas.
- **Constraints:** `CHECK (position_x >= 0 AND position_x <= 10000)`, same for `position_y`.
- **Why:** Top-left convention matches HTML/SVG/canvas APIs. The renderer translates to screen pixels by scaling against the viewport. Upper bound is a sanity guard against UI bugs.

### `width`, `height` — INTEGER NOT NULL

- **Nullable:** No
- **Default:** None (portal supplies sensible defaults: 80×80 for square 2-top, 100×100 for 4-top, etc.)
- **Purpose:** Footprint dimensions in canvas units.
- **Constraints:** `CHECK (width > 0 AND width <= 10000)`, same for `height`. `CHECK (shape != 'CIRCLE' OR width = height)` ensures circles are real circles.
- **Why:** Independent width/height supports rectangles (2-top square, long banquet, bar counter). For circles, both columns hold the diameter; the equality CHECK enforces the constraint at the schema level.

### `rotation` — INTEGER NOT NULL DEFAULT 0

- **Nullable:** No
- **Default:** `0`
- **Purpose:** Rotation in degrees (0–359), applied around the table's centre.
- **Constraints:** `CHECK (rotation >= 0 AND rotation < 360)`.
- **Why:** Rectangles often need rotation to fit a corner or follow a wall ("Table 5 sits at 15° along the patio rail"). Stored as integer degrees rather than radians for human readability and easier merchant-portal UX (snap-to-15° controls). Cosmetic for circles.

### `current_status` — "TableStatus" NOT NULL DEFAULT 'AVAILABLE'

- **Nullable:** No
- **Default:** `'AVAILABLE'`
- **Purpose:** Drives the colour shown on the floor plan.
- **Constraints:** `NOT NULL`. Sync logic (application-layer) keeps `OCCUPIED` consistent with active sessions linked to the table.
- **Why:** Stored (not derived) so the read query is a single column scan. See [`enums/table-status.md`](../enums/table-status.md) for the four values and the sync rules.

### `version` — INTEGER NOT NULL DEFAULT 1

- **Nullable:** No
- **Default:** `1`
- **Purpose:** Optimistic-concurrency counter for status updates.
- **Constraints:** None at the DB level.
- **Why:** Two writes can race: a session-open handler firing `current_status → OCCUPIED` while a staff member taps "Mark as Reserved" at the same instant. Each writer checks-and-bumps `version`; the loser refetches and either retries or surfaces a conflict. Same OCC pattern as `orders.version` and `carts.version`.

### `notes` — TEXT (nullable)

Free-form merchant note. "Near window", "wobbly leg", "loud — avoid for VIPs". Nullable.

### `is_active` — BOOLEAN NOT NULL DEFAULT TRUE

Soft-delete via deactivation. `FALSE` removes from active circulation; existing orders/sessions referencing the table still resolve.

### `created_at` / `updated_at` — TIMESTAMP(3) NOT NULL

Standard audit timestamps.

---

## Part 4 — Indexes

### `PRIMARY KEY (tenant_id, id)`

Composite. Direct lookups, FK target for `qr_contexts.table_id`, `orders.table_id`, `order_sessions.table_id`.

### `UNIQUE INDEX tables_active_label_unique ON (tenant_id, label) WHERE is_active = TRUE`

Two purposes: prevents duplicate labels among active tables, and indexes "look up table by label" (rare, but happens during merchant-portal staff workflows).

### `INDEX ON (tenant_id, floor_plan_id) WHERE is_active = TRUE`

The hot path: floor-plan editor and staff renderer load "all active tables for this plan."

### `INDEX ON (tenant_id, current_status) WHERE is_active = TRUE`

Status dashboard queries: "show me all available 4-tops", "show me all OCCUPIED tables and their open sessions."

---

## Part 5 — Relationships

### Foreign Keys (composite)

| Column(s) | References | On Delete | Why |
|---|---|---|---|
| `(tenant_id)` | `tenants(id)` | `CASCADE` | Tenant deletion removes all tables |
| `(tenant_id, floor_plan_id)` | `floor_plans(tenant_id, id)` | No cascade — application requires moving/deactivating tables before plan deletion |

### Incoming References

| Table | Column(s) | Relationship | On Delete |
|---|---|---|---|
| `qr_contexts` | `(tenant_id, table_id)` | Many QRs over time, **at most one active per table** (partial unique) | No cascade — QRs are historical |
| `order_sessions` | `(tenant_id, table_id)` | Many sessions over time per table | No cascade — sessions are historical |
| `orders` | `(tenant_id, table_id)` | Many orders per table | No cascade — orders are historical |

### Cross-FK Tenant Parity

**None needed.** Composite FKs make cross-tenant references impossible by construction. Parity triggers retired schema-wide on 2026-04-24.

---

## Part 6 — Real-World Usage Scenarios

### Scenario 1: Merchant draws the floor plan

Borey opens the merchant portal at "Sach Ko Ang" for the first time. The default floor plan ("Main Floor", 1200×900) is empty. He:

1. Taps "Add table" → portal creates `(label: 'Table 1', shape: RECTANGLE, position_x: 50, position_y: 50, width: 100, height: 100)`.
2. Drags it to (200, 150). Resizes to 120×80 (a 4-top long).
3. Renames to "Table 5" (his preferred numbering).
4. Adds 11 more tables, each with a different label and position.
5. Switches to "Patio" tab, draws 4 round tables.

Each operation is one PUT to the table row, bumping `version` for OCC.

### Scenario 2: Customer arrives and is seated

A party of 4 arrives at "Sach Ko Ang." The hostess looks at the staff floor-plan tablet:

```
Tables (Main Floor):
  Table 5  (4-top, AVAILABLE — green)
  Table 6  (4-top, OCCUPIED — red)
  Table 7  (2-top, AVAILABLE — green)
  ...
```

She taps Table 5, then "Seat customer." The portal:

1. Creates an `order_sessions` row linked to `(tenant_id, table_id) = (clx_sach_ko, tbl_table_5)`.
2. Updates `tables.current_status = 'OCCUPIED'` (with `version` check).
3. The floor-plan tablet receives a Socket.io event and re-renders Table 5 in red.

### Scenario 3: Reservation arrives

A regular calls to book Table 8 at 7pm. At 6:30 the hostess marks:

```
UPDATE tables
   SET current_status = 'RESERVED', version = version + 1
 WHERE tenant_id = 'clx_sach_ko' AND id = 'tbl_table_8' AND version = 12;
```

The floor plan shows Table 8 in yellow. Walk-ins are routed elsewhere. When the reserved party arrives at 7:15, the hostess starts a session — table flips to OCCUPIED.

### Scenario 4: QR code regeneration

The QR sticker on Table 5 rips. Borey opens the table in the portal, taps "Regenerate QR." The application:

1. Sets `qr_contexts.is_active = FALSE` on the existing active QR for Table 5.
2. INSERTs a new `qr_contexts` row for Table 5 with `is_active = TRUE`.
3. The partial unique index `qr_contexts_one_active_per_table` enforces step 1 must complete before step 2 can succeed (transaction, not race).
4. The portal generates a downloadable / printable PNG of the new QR for Borey to print.

The old QR row stays in the database (audit: orders that came from the old sticker still resolve). The new QR is the only one that produces an active session on the next scan.

### Scenario 5: Renaming a table

Mid-renovation, Borey decides to rename Table 5 to "Window Booth." He edits the label in the portal. `tables.label` updates. **Yesterday's order receipt still says "Table 5"** because `orders.table_ref` snapshotted that value at order time. Tonight's receipts say "Window Booth."

### Scenario 6: End of patio season

Rainy season starts. Borey deactivates the patio:

1. For each table on `fp_patio`: set `is_active = FALSE`.
2. The 4 patio tables drop out of the floor-plan tablet view.
3. Their labels ("Patio 1" – "Patio 4") become available for reuse if needed.
4. Two months later, dry season returns. Borey sets all 4 tables back to `is_active = TRUE`. Same IDs, same positions, same QR codes (which were never deactivated).

---

## Part 7 — Design Decisions

### Why `tables` is dine-in only

User-confirmed in the design Q&A: pickup counters do not need a position on the floor plan. Conflating dine-in tables with takeaway/counter QRs would clutter the floor-plan UI with random rectangles that don't represent seating. The split is enforced not by a CHECK on `tables` but by the application: pickup counters never get a `tables` row.

### Why composite PK `(tenant_id, id)`

Schema-wide pattern adopted 2026-04-24. Eliminates cross-table tenant-parity triggers because the FK shape itself prevents cross-tenant linking. Same reason every other tenant-scoped table got the same pattern in the same sweep.

### Why `OCCUPIED` is stored, not derived

User-chosen in the design Q&A. See [`enums/table-status.md`](../enums/table-status.md) for the full reasoning. Trade-off accepted: requires sync code, but simplifies every read at the cost of a small handful of write paths.

### Why floor-plan position is `(x, y, width, height, rotation)` and not JSONB

User-confirmed in the design Q&A. Three reasons:

1. **Queryable.** "Find tables overlapping the rectangle from (200, 150) to (400, 300)" needs columns, not JSON.
2. **Validatable.** The CHECK constraints (`width > 0`, `rotation < 360`, `shape='CIRCLE' → width=height`) only work on columns.
3. **Sufficient.** Rectangles and circles cover ~99% of real tables. Custom polygons would require either Bézier storage or a separate shape table — over-engineering.

### Why arbitrary canvas units (not pixels or metres)

Pixels couple to viewport size. Metres require accurate floor measurements the merchant won't provide. Arbitrary integer units (the merchant draws what looks right; the renderer scales to fit) is the model with the lowest cognitive load. Same reasoning as `floor_plans.width`/`height`.

### Why `label` is renamable but `id` is stable

Real-world: merchants regularly rename tables ("Table 5" → "VIP Booth" after a renovation). They never want their order history to retroactively say "VIP Booth ordered Pad Thai" if it was Table 5 at the time. The split — durable `id`, renamable `label`, snapshotted `table_ref` on orders/sessions — is the only way to satisfy both requirements.

### Why one active QR per table (partial unique index)

User-confirmed in the design Q&A. Matches the "regenerate replaces" mental model. Old QRs stay in the database for audit (yesterday's orders that came from a now-replaced sticker still resolve correctly). Multi-active-QR scenarios (front + back of placard) are deferred until a real merchant request lands.

### Why `version` for optimistic concurrency

Status updates can race: a session-open handler trying to set `OCCUPIED` while a staff member taps "Reserved" at the same millisecond. Without OCC, last-write-wins quietly overrides the manual action. With `version`, the loser sees `0 rows affected` and refetches. Same pattern as `orders.version` and `carts.version`.

---

## Part 8 — Related Tables

| Table | Relationship | Notes |
|---|---|---|
| `tenants` | Parent (FK on `tenant_id`) | CASCADE |
| `floor_plans` | Parent (composite FK `(tenant_id, floor_plan_id)`) | The canvas the table is drawn on |
| `qr_contexts` | Children (composite FK `(tenant_id, table_id)`) | Many over time, at most one active |
| `order_sessions` | Children (composite FK `(tenant_id, table_id)`) | Active session ⇒ table is OCCUPIED |
| `orders` | Children (composite FK `(tenant_id, table_id)`) | Live link to the table; `table_ref` is the snapshot label |
| `users` | Indirect | Staff members manipulate tables via the merchant portal; per-action accountability lives in `audit_logs` |
