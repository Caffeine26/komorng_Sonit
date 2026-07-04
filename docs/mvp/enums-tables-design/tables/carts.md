# Table Reference: `carts`

| Property | Value |
|---|---|
| **Domain** | Order |
| **Tenant-scoped** | Yes |
| **Prisma model** | `Cart` |
| **Table #** | 25 of 36 |

---

## Part 1 — Overview

The `carts` table represents an **in-progress, server-persisted order** for a **dine-in table session**. It is the shared basket that every device scanning the same table QR contributes to and sees in real time.

### Scope (decided 2026-04-24)

Server-side carts exist **only for `DINE_IN_TABLE` sessions**. For all `STALL_KIOSK` flows (both `PAY_BEFORE` and `PAY_AFTER`), the cart lives **only in the customer's browser `localStorage`** and never reaches this table. The reasoning:

| Service model | Cart storage | Why |
|---|---|---|
| `STALL_KIOSK` (any pay timing) | `localStorage` only | One-shot transactional flow. Reload = fresh start matches kiosk UX. No multi-device sharing pattern. Avoids DB writes on the highest-volume surface. |
| `DINE_IN_TABLE` (any pay timing) | Server-persisted (`carts` row) | Larger basket, longer session, customer may switch apps and lose tab. **Multiple devices at the same table share one cart** (everyone scans the QR, everyone contributes). |

### Cart-per-session rule

Within a `DINE_IN_TABLE` session there is **at most one `ACTIVE` cart at any moment** (enforced by a partial unique index). Each round of ordering produces one `CONVERTED` cart (snapshot into `orders`/`order_items`), and a new `ACTIVE` cart is created when the next person at the table starts adding items.

So a single dine-in session typically looks like:

```
session sess_bbq_005 (DINE_IN_TABLE, ACTIVE)
  ├── cart #1 → CONVERTED (round 1: appetizers → order_001)
  ├── cart #2 → CONVERTED (round 2: mains → order_002)
  ├── cart #3 → CONVERTED (round 3: drinks → order_003)
  └── cart #4 → ABANDONED (someone started adding desserts then bill arrived)
```

### Lifecycle

1. **Created** lazily — the first device in a `DINE_IN_TABLE` session to add an item triggers the row insert. `status = ACTIVE`, `version = 1`.
2. **Active** while any device at the table is browsing/modifying. All devices in the session read and write the same row, with `version` enforcing safe concurrent updates.
3. **Converted** when someone taps "Submit Order" — items snapshot into `order_items`, a new `orders` row is created, cart `status = CONVERTED`.
4. **Abandoned** when:
   - the session closes (bill paid / merchant force-close / 24h cleanup), or
   - staff explicitly reset the table from the merchant portal.

   `status = ABANDONED` and `abandoned_reason` records *why*. If the trigger was a staff action, `closed_by_id` records *who*.

### Forward compatibility (Phase 2)

When customer accounts arrive (mobile app, pickup, marketplace), the table will gain a nullable `customer_id` column. No breaking change — anonymous dine-in carts keep working, and authenticated carts gain ownership. Out of scope for MVP.

---

## Part 2 — CREATE TABLE

```sql
-- Why this enum exists: ABANDONED alone can't tell merchants whether the
-- cart was left over from a successful payment or whether the table was
-- force-closed. Captured separately so the cart-status enum stays small
-- and dashboards can segment cleanly. See enums/cart-abandoned-reason.md.
CREATE TYPE "CartAbandonedReason" AS ENUM (
  'SESSION_PAID',          -- bill settled; this cart had leftover items
  'SESSION_FORCE_CLOSED',  -- merchant manually closed the table from the portal
  'STAFF_RESET',           -- staff explicitly abandoned this cart for the next customer
  'SESSION_TIMEOUT',       -- 24h background cleanup
  'CUSTOMER_DISMISSED'     -- customer-facing "clear cart" action (future)
);

CREATE TABLE carts (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id        TEXT NOT NULL REFERENCES order_sessions(id),
  status            "CartStatus" NOT NULL DEFAULT 'ACTIVE',
  version           INTEGER NOT NULL DEFAULT 1,
  abandoned_reason  "CartAbandonedReason",
  closed_by_id      TEXT REFERENCES users(id),
  created_at        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP(3) NOT NULL,

  -- Hygiene constraints
  CONSTRAINT carts_abandoned_reason_only_when_abandoned
    CHECK ((status = 'ABANDONED') OR (abandoned_reason IS NULL)),
  CONSTRAINT carts_closed_by_only_for_staff_reset
    CHECK ((closed_by_id IS NULL) OR (abandoned_reason = 'STAFF_RESET'))
);

CREATE INDEX ON carts (tenant_id, status);
CREATE INDEX ON carts (session_id);

-- One active cart per session (Option A: shared per-session cart)
CREATE UNIQUE INDEX carts_one_active_per_session
  ON carts (session_id)
  WHERE status = 'ACTIVE';
```

---

## Part 3 — Column-by-Column

### `id` — TEXT PRIMARY KEY

- **Nullable:** No
- **Default:** None (app-generated cuid)
- **Purpose:** Unique identifier for this cart.
- **Constraints:** Primary key.
- **Why:** Standard cuid pattern. Referenced by `cart_items` to associate line items with a cart.

### `tenant_id` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** The tenant whose dine-in session this cart belongs to.
- **Constraints:** `REFERENCES tenants(id) ON DELETE CASCADE`. Indexed as part of `(tenant_id, status)`.
- **Why:** Tenant isolation. Every cart query includes `WHERE tenant_id = ?`. CASCADE ensures tenant deletion removes all carts.

### `session_id` — TEXT NOT NULL

- **Nullable:** **No** (changed 2026-04-24 — was nullable when carts also covered standalone kiosk orders).
- **Default:** None
- **Purpose:** The dine-in session this cart belongs to.
- **Constraints:** `REFERENCES order_sessions(id)`. Indexed. Cross-FK tenant parity enforced by `carts_session_tenant_parity` trigger. Partial unique index `(session_id) WHERE status = 'ACTIVE'` enforces one active cart per session.
- **Why:** Carts now exist only inside dine-in sessions, so the link is mandatory. The partial unique index implements **Option A: one shared cart per session** — when multiple devices scan the same table QR, they all read/write the same `ACTIVE` cart row. The tenant parity trigger (C2) prevents a cart from referencing a session owned by a different tenant.

### `status` — "CartStatus" NOT NULL

- **Nullable:** No
- **Default:** `'ACTIVE'`
- **Purpose:** Tracks the cart's lifecycle state.
- **Constraints:** Must be one of: `ACTIVE`, `CONVERTED`, `ABANDONED`.
- **Why:**
  - `ACTIVE` — the table is still building this round of orders. Items can be added, removed, or modified by any device in the session. **At most one per session.**
  - `CONVERTED` — someone tapped "Submit Order." Cart items were copied into `order_items`, a new order was created, and the cart is no longer modifiable. The cart row is preserved for analytics and to anchor the next round.
  - `ABANDONED` — the session closed (bill paid, merchant force-close, or 24h cleanup) without this cart being converted. Set automatically by the session-close handler. Preserved for analytics.

  ```sql
  CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED');
  ```

### `version` — INTEGER NOT NULL DEFAULT 1

- **Nullable:** No
- **Default:** `1`
- **Purpose:** Optimistic-concurrency counter. Every UPDATE on this row must include `WHERE version = $expected` and bump `version + 1`. Prevents lost updates when two devices in the shared cart act at the same instant.
- **Constraints:** None at the DB level — the contract is enforced by the application layer (Prisma middleware or the cart service).
- **Why:** This table runs a **shared cart pattern**: multiple phones at the same table read and write the same `ACTIVE` row. Two simultaneous taps ("Add Beer" and "Submit Order" within the same network round-trip) are not theoretical — they happen daily at busy tables. Without `version`, one update silently overwrites the other (lost item, ghost line, or double-submit). With `version`, the second writer sees `0 rows affected`, refetches state, and retries cleanly. Standard OCC pattern.

  Example race:
  ```
  T+0ms   Lina/Sokha both read   {status: ACTIVE, version: 5, items: [Beef, Fish]}
  T+10ms  Lina  → UPDATE … SET status='CONVERTED', version=6 WHERE id=… AND version=5  ✓
  T+11ms  Sokha → UPDATE … SET version=6                         WHERE id=… AND version=5
                  → 0 rows affected (already 6)
                  → app refetches, shows: "Order #042 just submitted — start a new round?"
  ```

  Cheaper than `SELECT … FOR UPDATE` row locks and works correctly across separate HTTP requests (each in its own transaction).

### `abandoned_reason` — "CartAbandonedReason" (nullable)

- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** When `status = 'ABANDONED'`, records *why* the cart was abandoned. NULL otherwise.
- **Constraints:** `CHECK ((status = 'ABANDONED') OR (abandoned_reason IS NULL))` — guarantees the column is meaningful only on abandoned rows.
- **Why:** A single `ABANDONED` status fits the cart's lifecycle but conflates very different operational situations: a guest paid the bill and left a half-built dessert cart vs. staff had to force-close a walkaway table. Both are "abandoned" technically, but merchants need to act on them differently. Splitting the enum status would have leaked operational metadata into the lifecycle model; a sibling reason column keeps the lifecycle clean while making dashboards segmentable. See [`enums/cart-abandoned-reason.md`](../enums/cart-abandoned-reason.md) for the full value list and semantics.

### `closed_by_id` — TEXT (nullable)

- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** When a staff member manually abandons a cart (e.g., "Reset Table 5" from the merchant portal), records *who*. NULL for system-driven abandonment.
- **Constraints:** `REFERENCES users(id)`. `CHECK ((closed_by_id IS NULL) OR (abandoned_reason = 'STAFF_RESET'))` — set only when the reason is a staff reset.
- **Why:** Accountability. Disputes happen ("who cleared my table while I was in the bathroom?"); audits demand a paper trail. The `_id` suffix follows the schema's existing FK-naming convention (`tenant_id`, `session_id`, `qr_context_id` …). The CHECK constraint prevents this column from being silently misused for other transition reasons.

### `created_at` — TIMESTAMP(3) NOT NULL

- **Nullable:** No
- **Default:** `CURRENT_TIMESTAMP`
- **Purpose:** When the cart was created (i.e., when the first item of this round was added).
- **Constraints:** None.
- **Why:** Standard audit timestamp. Used to measure "time to first order" and round duration.

### `updated_at` — TIMESTAMP(3) NOT NULL

- **Nullable:** No
- **Default:** Maintained by Prisma (`@updatedAt`).
- **Purpose:** When the cart was last modified (item added, quantity changed, etc.).
- **Constraints:** None.
- **Why:** Used for "stale cart" detection within a session and for the session-close ABANDONED sweep.

---

## Part 4 — Indexes

### `PRIMARY KEY (id)`

- **What it serves:** Direct cart lookups when a device polls or refreshes.
- **Example:** `SELECT * FROM carts WHERE id = 'cart_001'`

### `INDEX ON carts (tenant_id, status)`

- **What it serves:** Tenant-scoped administrative queries (e.g., abandonment analytics, dashboard counts).
- **Example:**
  ```sql
  -- "How many carts were abandoned today at this tenant?"
  SELECT COUNT(*) FROM carts
  WHERE tenant_id = 'tenant_abc'
    AND status = 'ABANDONED'
    AND updated_at >= CURRENT_DATE;
  ```

### `INDEX ON carts (session_id)`

- **What it serves:** Loading every cart that has existed in a session (for "round history" UI in the merchant portal).
- **Example:**
  ```sql
  SELECT id, status, created_at FROM carts
  WHERE session_id = 'sess_bbq_005'
  ORDER BY created_at ASC;
  ```

### `UNIQUE INDEX carts_one_active_per_session ON carts (session_id) WHERE status = 'ACTIVE'`

- **What it serves:** Two things at once:
  1. **Hot-path lookup** — "Find the current ACTIVE cart for this session." Returns 0 or 1 row.
  2. **Hard guarantee** — the database refuses to create a second ACTIVE cart while one already exists. Two devices both tapping "Add to cart" simultaneously cannot accidentally split into two carts; one wins, the other reads the existing row.
- **Example (hot path):**
  ```sql
  SELECT id FROM carts
  WHERE session_id = 'sess_bbq_005'
    AND status = 'ACTIVE'
  LIMIT 1;
  ```
- **Why partial:** Once a cart converts or is abandoned, it stays in the table for analytics — but it must not block a fresh `ACTIVE` cart for the next round. The `WHERE status = 'ACTIVE'` predicate keeps the constraint scoped to the live row only.

---

## Part 5 — Relationships

### Foreign Keys

| Column | References | On Delete | Why |
|---|---|---|---|
| `tenant_id` | `tenants(id)` | `CASCADE` | Tenant deletion removes all carts |
| `session_id` | `order_sessions(id)` | No cascade (default) | Session closure does not delete carts — they are marked ABANDONED or remain CONVERTED for analytics |
| `closed_by_id` | `users(id)` | No cascade (default) | Set only on `STAFF_RESET`; user deletion should not erase the audit trail (consider soft-delete on users) |

### Incoming References

| Table | Column | Relationship | Notes |
|---|---|---|---|
| `cart_items` | `cart_id` | Many items per cart | `ON DELETE CASCADE` — deleting a cart removes its items |

### Cross-FK Tenant Parity Triggers

| Trigger | Validates |
|---|---|
| `carts_session_tenant_parity` | `carts.tenant_id` matches `order_sessions.tenant_id` |

---

## Part 6 — Real-World Usage Scenarios

### Scenario 1: BBQ restaurant — shared cart across two phones

A group of four at Table 5 of "Sach Ko Ang" in Siem Reap. Two of them scan the table QR. They build a first round of appetizers together — Lina adds Beef Skewers from her phone, Sokha adds Grilled Squid from his.

```
order_sessions:
  id: 'sess_bbq_005', tenant_id: 'clx_sach_ko', status: ACTIVE

carts (one ACTIVE row, shared by both devices):
  id:         'cart_bbq_001'
  session_id: 'sess_bbq_005'
  status:     ACTIVE

cart_items:
  { cart_id: 'cart_bbq_001', item: 'Beef Skewers',  qty: 4, price: 600 }   -- added from Lina's phone
  { cart_id: 'cart_bbq_001', item: 'Grilled Squid', qty: 1, price: 800 }   -- added from Sokha's phone
```

When Sokha's phone polls `/sessions/sess_bbq_005/cart`, it returns the same row Lina is viewing — including the Beef Skewers Lina just added. They tap "Submit Order" together; the cart converts and Order #1 is created.

### Scenario 2: Multiple rounds in one dine-in session

Same table, after Round 1 converts. Lina starts Round 2 (mains). A new ACTIVE cart appears.

```
carts for sess_bbq_005:
  cart_001  CONVERTED  (Round 1 — appetizers, became order_001)
  cart_002  ACTIVE     (Round 2 — being built now)
```

The partial unique index permits this because only `cart_002` has `status = 'ACTIVE'`. After cart_002 converts, cart_003 starts for desserts, and so on.

### Scenario 3: Session closes while a cart is still active

The bill arrives during dessert browsing. The customer pays without submitting the in-progress dessert cart. The session-close handler marks the open cart as ABANDONED.

```
carts for sess_bbq_005 (after bill paid):
  cart_001  CONVERTED   (appetizers)
  cart_002  CONVERTED   (mains)
  cart_003  CONVERTED   (drinks)
  cart_004  ABANDONED   (dessert browsing, never submitted)
```

The abandoned cart is data: "guests at this table considered ordering desserts but didn't follow through — perhaps move dessert recommendations earlier in the meal."

### Scenario 4: Staff reset — wrong customer scanned the QR

A new customer at "Sach Ko Ang" scans Table 5 by mistake (they meant Table 6) and starts adding items. Staff notices, taps "Reset cart" for Table 5 from the merchant portal.

```
carts:
  id:                'cart_bbq_005'
  session_id:        'sess_bbq_005'
  status:            ACTIVE → ABANDONED
  abandoned_reason:  STAFF_RESET
  closed_by_id:      'usr_lina_staff'    -- the waiter who tapped "Reset"
  updated_at:        2026-04-09 19:12:00
```

The next customer at Table 5 starts a fresh ACTIVE cart in the same session. The audit trail records who reset the cart and why.

### Scenario 5: Stall/kiosk — no cart row

A bubble-tea customer at "Boba Khmae" scans the counter QR, builds a basket of two drinks in `localStorage`, and taps "Place Order."

```
carts:        (no row)
cart_items:   (no rows)

orders:       { id: 'order_boba_017', session_id: NULL, status: SUBMITTED, total_cents: 750 }
order_items:  ... (built directly from the localStorage payload)
```

Reload the page mid-shopping → the localStorage cart resets and the customer starts over. By design.

---

## Part 7 — Design Decisions

### Why server-persist only for dine-in (decided 2026-04-24)

| Stall/kiosk | Dine-in |
|---|---|
| One-shot purchase, fast in-and-out | Long visit, multiple rounds, multiple devices |
| Reload = fresh start matches the UX | Lost-tab recovery is valuable |
| No multi-device sharing pattern | Group at one table sharing one cart is normal |
| Highest-volume surface — saving DB writes matters | Lower volume, DB cost is fine |

The `localStorage` cart on the storefront covers stall/kiosk completely. Adding server persistence there would be cost without benefit. For dine-in, the same `localStorage` would defeat the multi-device-sharing use case (one of the strongest reasons dine-in needs server state at all).

### Why one shared cart per session (Option A)

When multiple devices at one table scan the QR, they share a single `ACTIVE` cart, enforced by the partial unique index. Alternatives considered:

- **Option B — one cart per device.** Each phone has its own cart, items attributed to each device within the session. Better for split-bill UX, but requires a `device_token` column and a join to render the table-level cart. Rejected as premature complexity for MVP.
- **Option C — shared cart with per-line-item device attribution.** Same as A but each `cart_items` row records which device added it. Forward-compatible — `cart_items.added_by_device` can be added later without breaking the shared-cart shape.

**MVP = A. Phase 2 likely = C.**

### Why `session_id` is now NOT NULL

Previously, `session_id` was nullable to support `STALL_KIOSK + PAY_BEFORE` standalone carts. Since 2026-04-24, kiosk flows skip this table entirely, so every row in `carts` belongs to a session. NOT NULL is now the truthful constraint and lets the partial unique index enforce one-active-cart-per-session without ambiguity.

### Why abandoned carts are preserved, not deleted

Abandoned carts are valuable analytics data: "What rounds were started but never submitted? At what point in the meal do guests stop adding?" Deleting them would lose this. A periodic cleanup job can purge ABANDONED carts older than 90 days.

### Why a separate `abandoned_reason` instead of more enum values

`CartStatus` could have been split (`ABANDONED_BY_PAYMENT`, `ABANDONED_BY_TIMEOUT`, `ABANDONED_BY_STAFF`, …), but that conflates two concepts:

- **Lifecycle state** (am I mutable? Did I become an order?) → belongs in `status`
- **Operational metadata** (why did the lifecycle end?) → belongs in `abandoned_reason`

Splitting the lifecycle enum would force every status check (`WHERE status = 'ABANDONED'`) to enumerate all the variants forever. The sibling-column approach keeps lifecycle queries simple and makes adding a new reason a non-breaking enum addition. The CHECK constraint guarantees the reason is only set when the lifecycle is actually ABANDONED.

### Why optimistic concurrency (`version`), not row locks

The shared-cart pattern means many concurrent readers and occasional simultaneous writers from different devices. The two safe approaches are:

1. **Pessimistic locking** — `SELECT … FOR UPDATE` on the cart in every write path. Holds row locks for the duration of the transaction (including network round-trips). Blocks readers in some isolation levels.
2. **Optimistic concurrency control (OCC)** — `UPDATE … WHERE version = $expected; bump version`. No locks held; conflicts surface as `0 rows affected`.

OCC was chosen because conflicts are rare in practice (most table interactions are sequential), the per-row latency is lower (no lock acquisition), and it works correctly across separate HTTP requests where each writer has its own short-lived transaction. Cost: one INTEGER per cart and a 5-line app-layer wrapper.

### Why CHECK constraints, not just app validation

Both `abandoned_reason` and `closed_by_id` could be enforced in the application layer alone. They are also encoded as DB CHECK constraints because:

- The cart table is hot for raw SQL access during incident response, ad-hoc analytics, and migration scripts. CHECK constraints prevent a tired engineer from inserting `closed_by_id` on a CONVERTED row at 2 AM.
- The cost is two SQL lines, paid once at migration time. The application code becomes simpler because it can trust the invariant.

### Why no `customer_id` at MVP

XFOS has no customer accounts at MVP. The dine-in cart's identity is the **session** (which is anchored to the table QR). When customer accounts arrive in Phase 2 (mobile app, pickup, marketplace), a nullable `customer_id` column will be added — additive, no breaking change.

---

## Part 8 — Related Tables

| Table | Relationship | Notes |
|---|---|---|
| `tenants` | Parent (FK) | Every cart belongs to one tenant |
| `order_sessions` | Required parent (FK) | Carts exist only inside `DINE_IN_TABLE` sessions |
| `users` | Optional reference (FK `closed_by_id`) | Captures the staff member who manually reset/abandoned the cart (only set when `abandoned_reason = 'STAFF_RESET'`) |
| `cart_items` | Children (FK `cart_id`, CASCADE) | The line items in this cart. `cart_items.notes` carries per-item special instructions ("exclude pepper / មិនយកម្ទេស") that snapshot into `order_items.notes` and surface on the kitchen ticket. |
| `orders` | Conceptual successor | When a cart is CONVERTED, its items become `order_items` in a new order |
| `menu_items` | Indirect (via cart_items) | Cart items reference menu items for validation and display |
