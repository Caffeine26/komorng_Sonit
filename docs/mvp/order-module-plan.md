# Order module — session card + new items (implementation notes)

Copy of the executed plan for team visibility in-repo.

## Rules

- One **active session** → one **admin order card** (one open `orders` row).
- Customer **re-submit** appends `order_items` to the same order (uses `order_items.created_at`).
- **Acknowledge** sets `orders.new_items_acknowledged_at` (no status change).
- **COMPLETED** closes `order_sessions`; next QR scan creates a new session.

## API

- `POST /api/v1/storefront/orders?qr=` — first submit creates order; later submits append.
- `POST /api/v1/admin/orders/:orderId/acknowledge-new-items` — clear new-item highlights.
- `PATCH /api/v1/admin/orders/:orderId/status` — `COMPLETED` closes session.

## Migration

`database/prisma/migrations/20260529120000_add_order_new_items_acknowledged_at/`

Run: `pnpm db:migrate` from repo root.
