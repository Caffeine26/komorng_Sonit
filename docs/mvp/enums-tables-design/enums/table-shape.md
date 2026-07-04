# TableShape — Design Discussion & Decision

**Date:** 2026-04-24
**Status:** ✅ Applied alongside the tables entity
**Affects:** `tables.shape`

---

## The enum

```sql
CREATE TYPE "TableShape" AS ENUM (
  'RECTANGLE',
  'CIRCLE'
);
```

`tables.shape` is `NOT NULL DEFAULT 'RECTANGLE'`. Pairs with the `tables.width` and `tables.height` columns:

- `RECTANGLE` → independent `width` and `height` (covers squares, rectangles)
- `CIRCLE` → `width = height` (= diameter), enforced by CHECK constraint `tables_circle_is_square`

---

## Part 1 — Why this enum exists

Cambodian restaurants overwhelmingly use two table shapes:

- **Rectangles / squares** — 2-tops, 4-tops, 6-tops, long banquet tables, bar counters
- **Circles** — banquet tables (large round 8/10-tops), bistro 2-tops

Together these cover ~99% of real-world tables. The enum gives the merchant-portal floor-plan editor a tool palette of two primitives, and the staff-side renderer two simple draw paths.

Custom polygons (L-shaped, hexagonal, irregular) were considered and **rejected for MVP** — they require either Bézier curve storage or a separate shape table, neither of which earns its complexity at MVP scale. If a real merchant request lands later, the enum can grow.

---

## Part 2 — Each value explained

### `RECTANGLE`

**Meaning:** Rectangular footprint with independent width and height.

**Rendering:** `<rect x={position_x} y={position_y} width={width} height={height} transform="rotate({rotation})" />` in SVG, or equivalent in any 2D canvas API.

**Use cases:**
- 2-top square (e.g., `width = 80, height = 80`)
- 4-top square (`width = 100, height = 100`)
- 4-top long (`width = 160, height = 80`)
- 6-top banquet (`width = 220, height = 80`)
- Bar counter (`width = 400, height = 60`, often `rotation = 0` along a wall)

**Most common — the default.**

### `CIRCLE`

**Meaning:** Circular footprint. `width = height` is enforced; both represent the diameter.

**Rendering:** `<circle cx={position_x + width/2} cy={position_y + width/2} r={width/2} />`. Rotation is allowed but visually meaningless for a circle (kept as a column for uniformity with rectangles, and for any future asymmetric-circle features like a notch indicating the head of the table).

**Use cases:**
- Round 8/10-top banquet table (`width = 180`)
- Bistro 2-top (`width = 80`)
- Drum-style high-top stool (`width = 60`)

---

## Part 3 — Why these two and not others

### Considered and rejected

| Rejected value | Why |
|---|---|
| `OVAL` | An oval is a rectangle with rounded ends — render the same row as `RECTANGLE` with a CSS `border-radius` if needed. No data-model difference. |
| `L_SHAPED` | Two adjacent rectangles. If a merchant has one, the cleanest model is **two `tables` rows** sharing the same `area` and an app-layer "this is one logical group." Add a `parent_table_id` self-reference if real demand lands. |
| `HEXAGON` / `OCTAGON` | Honestly, who has these in a Cambodian restaurant. Add when someone asks. |
| `CUSTOM_POLYGON` | Requires JSONB point-list storage, custom rendering pipeline, and a polygon editor in the merchant portal. **Massive complexity** for a feature that doesn't exist yet. Hard rejection at MVP. |

### Why `width = height` is enforced for `CIRCLE`

A circle has no concept of independent width and height — a circle that's `width = 100, height = 80` is an ellipse. To prevent the schema accepting nonsense, the CHECK constraint `tables_circle_is_square` rejects rows where `shape = 'CIRCLE'` and `width != height`.

If real demand for ellipses appears, add an `OVAL` value (same rectangle DDL, rendered with rounded ends).

---

## Part 4 — Future evolution

This enum is designed to grow non-disruptively:

- **Add `OVAL`** if rounded-rectangle banquet tables become common.
- **Add `L_SHAPED`** with a self-FK pattern (`parent_table_id`) if booth seating arrives.
- **Add `CUSTOM_POLYGON`** with companion JSONB column only when a real merchant proves the need.

---

## Part 5 — Related tables and enums

| Symbol | Relationship | Notes |
|---|---|---|
| `tables.shape` | Direct user | NOT NULL with default `RECTANGLE` |
| `tables.width` / `tables.height` | Sibling | Constrained by the enum (CHECK enforces `width = height` for `CIRCLE`) |
| `tables.position_x` / `tables.position_y` | Sibling | Top-left corner on the canvas regardless of shape |
| `tables.rotation` | Sibling | Degrees 0–359; meaningful for `RECTANGLE`, cosmetic for `CIRCLE` |
| `floor_plans` | Container | The canvas the table is positioned on |
