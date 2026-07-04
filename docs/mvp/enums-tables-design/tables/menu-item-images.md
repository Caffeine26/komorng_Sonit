# `menu_item_images`

| Attribute | Value |
|---|---|
| **Domain** | Catalog |
| **Tenant-scoped?** | Indirect (via `menu_item_id` → `menu_items.tenant_id`) |
| **Prisma model** | `MenuItemImage` |
| **Mapped name** | `@@map("menu_item_images")` |
| **Status** | ✅ New table 2026-04-23 — multiple-images-per-item design |

---

## Part 1: Overview

`menu_item_images` holds the photos attached to a menu item. Each item can have multiple images in a specific display order, with at most one marked as primary (the image shown in thumbnails / list views). Images are separated from `menu_items` so merchants can manage a photo set — upload, reorder, swap the primary — without touching the item row.

### Why a separate table (vs an `image_url` column)

- **Multiple photos per item.** A bubble tea might have 4 photos — hero shot, pour, close-up of boba, packaging. One column cannot hold them.
- **Sortable carousel.** Storefront renders photos in merchant-controlled order.
- **Primary image anchor.** List views (kitchen tablet, merchant portal, search results) need one "main" photo; the rest are gallery fill.
- **Delete and re-upload without altering the item row.**

---

## Part 2: CREATE TABLE

> **2026-04-25:** composite-PK refresh. `tenant_id` was added so the FK
> to `menu_items` can be composite. Cross-tenant linking is impossible
> by construction.

```sql
CREATE TABLE menu_item_images (
  tenant_id     TEXT NOT NULL,
  id            TEXT NOT NULL,
  menu_item_id  TEXT NOT NULL,

  image_url     TEXT NOT NULL,                   -- CDN URL

  -- Optional bilingual accessibility text (for screen readers, SEO)
  alt_text_km   TEXT,
  alt_text_en   TEXT,

  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,

  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, menu_item_id) REFERENCES menu_items(tenant_id, id) ON DELETE CASCADE
);

-- Fast lookup for the storefront carousel
CREATE INDEX idx_menu_item_images_item_order
  ON menu_item_images (tenant_id, menu_item_id, sort_order);

-- At most ONE primary image per item (partial unique index)
CREATE UNIQUE INDEX uniq_menu_item_primary_image
  ON menu_item_images (tenant_id, menu_item_id)
  WHERE is_primary = TRUE;
```

---

## Part 3: Column-by-Column

### `id` -- TEXT PRIMARY KEY

cuid. Platform convention.

### `menu_item_id` -- TEXT NOT NULL

FK to `menu_items`. `ON DELETE CASCADE` — images die with the item. If an item is soft-deleted (`deleted_at` set), images remain in place (they're cheap to keep, and restore-after-accidental-delete keeps the photo set).

### `image_url` -- TEXT NOT NULL

CDN URL of the image, uploaded via the merchant portal. Points to whatever storage backend XFOS uses (S3-compatible, Cloudinary, etc.).

### `alt_text_km` / `alt_text_en` -- TEXT (nullable)

Optional accessibility text per locale. Shown to screen readers, used by image search / SEO if images get indexed. Nullable because most merchants won't bother; when absent, the app can fall back to the item's name.

### `sort_order` -- INTEGER NOT NULL DEFAULT 0

Display order for the carousel. Ties broken by `id ASC`. Convention: space values (10, 20, 30…) to make mid-list inserts painless.

### `is_primary` -- BOOLEAN NOT NULL DEFAULT FALSE

Whether this image is the "main" image for list views. Enforced by the partial unique index to be **at most one `TRUE` per item**.

If zero images are marked primary, the storefront falls back to the image with the smallest `sort_order`. App logic may auto-promote the first uploaded image to primary.

### `created_at` -- TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

Standard. No `updated_at` — images are add/delete artifacts, not edited in place. Reordering updates `sort_order`, which is trivial; the audit trail can live in `audit_logs` if ever needed.

---

## Part 4: Indexes

### Composite `(menu_item_id, sort_order)`

Serves the storefront's primary query — "get all images for this item in display order":

```sql
SELECT id, image_url, alt_text_km, alt_text_en, is_primary
FROM menu_item_images
WHERE menu_item_id = 'item_taro'
ORDER BY sort_order ASC, id ASC;
```

### Partial UNIQUE `WHERE is_primary = TRUE`

Enforces the "at most one primary per item" invariant at the DB layer. Same defense-in-depth pattern as `subscriptions_one_active_per_tenant`. Attempting a second primary insert/UPDATE raises a unique-violation error; the app handles by first clearing the old primary.

---

## Part 5: Relationships

### Outgoing FK

| Target | FK | Cascade |
|---|---|---|
| `menu_items` | `menu_item_id` | `ON DELETE CASCADE` |

### Incoming references

None.

### Not explicitly denormalized with `tenant_id`

Images are implicit children of a tenant's items. The storefront / merchant-portal queries always include a `menu_item_id` filter (or a JOIN), so tenant isolation is naturally preserved. Adding a denormalized `tenant_id` + parity trigger would be over-engineering for a table that is read only in single-item contexts.

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Upload 3 photos, mark one primary

```sql
INSERT INTO menu_item_images (id, menu_item_id, image_url, sort_order, is_primary) VALUES
  ('img_1', 'item_taro', 'https://cdn.../taro-hero.jpg',   10, TRUE),
  ('img_2', 'item_taro', 'https://cdn.../taro-pour.jpg',   20, FALSE),
  ('img_3', 'item_taro', 'https://cdn.../taro-bobas.jpg',  30, FALSE);
```

Storefront list view shows `img_1`. Item detail opens a carousel starting at `img_1`, scrolling through `img_2`, `img_3`.

### Scenario 2: Swap primary

Merchant decides `img_2` should be the main photo:

```sql
BEGIN;
UPDATE menu_item_images SET is_primary = FALSE WHERE id = 'img_1';
UPDATE menu_item_images SET is_primary = TRUE  WHERE id = 'img_2';
COMMIT;
```

If the app accidentally tries to mark two primaries, the second `UPDATE` fails with a unique-constraint violation. Transaction rolls back; the invariant holds.

### Scenario 3: Delete an image

Hard delete. The image disappears from the carousel immediately. If it was the primary, the next-lowest `sort_order` becomes the de-facto primary (app fallback).

### Scenario 4: Tenant uploads no image — display falls back to placeholder

`menu_item_images` has zero rows for this item. Storefront renders a placeholder graphic; merchant portal shows "No images uploaded yet" with an upload button.

---

## Part 7: Design Decisions

### Why a partial UNIQUE index instead of an app-only rule

Two admin operations racing could set two images as primary simultaneously. A partial index catches it at the DB — guaranteed no two rows with `is_primary = TRUE` for the same item at any commit. The app handles the error by clearing the old primary before setting a new one.

### Why no `width` / `height` / `mime_type` / `file_size` columns

That metadata can be derived from the image itself or from the CDN (most CDNs attach EXIF + serve content-type headers). Storing it on this row would duplicate what the CDN already knows and create drift if the image is replaced.

### Why no soft delete

Images are cheap to re-upload. Hard delete simplifies the schema. If a merchant accidentally deletes a needed photo, they re-upload — less costly than maintaining `deleted_at` + "trash" tooling for a low-value resource.

### Why optional alt text

Accessibility best practice says alt text matters. Most merchants will never fill it in. Nullable + app fallback (use the item's `name_km` / `name_en` when alt is NULL) captures the win without burdening data entry.

### Why the CASCADE on item deletion (but not on soft-delete)

When an item is **hard-deleted** (GDPR / admin cleanup), images must go with it — they're orphans otherwise, and the CDN URL is a dangling pointer. The cascade handles this automatically.

When an item is **soft-deleted** (merchant dropped an item from the menu), images are retained. If the item is later restored, its photo set comes back.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `menu_items` | Parent (N:1) | The item these images belong to |
