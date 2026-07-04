# Table Reference: `order_sessions`

| Property | Value |
|---|---|
| **Domain** | Order |
| **Tenant-scoped** | Yes (composite PK `(tenant_id, id)`) |
| **Prisma model** | `OrderSession` |
| **Table #** | 26 of 38 |
| **Last upgrade** | 2026-04-25 (`version` OCC; `closed_reason` enum; `last_activity_at`; accountability `opened_by_id`/`server_id`/`closed_by_id`; `party_size` + `notes`; denormalized running totals; one-ACTIVE-per-table partial unique index) |

---

## Part 1 — Overview

The `order_sessions` table groups multiple orders into a single visit. It represents the concept of "a customer (or group) is currently engaged with this restaurant" -- whether they are sitting at a table, standing at a noodle stall with a running tab, or occupying a food court seat.

Not every order needs a session. The simplest flow -- `STALL_KIOSK + PAY_BEFORE` (bubble tea, coffee kiosk) -- has no session at all. The customer orders, pays, picks up, and walks away. Each order is independent.

Sessions become necessary when:
1. **Multiple orders accumulate into one bill** (`PAY_AFTER`) -- the system needs a container to group orders before generating the bill.
2. **Table tracking is needed** (`DINE_IN_TABLE`) -- the system needs to know which table is occupied and which orders belong to it.

The session lifecycle is derived from the `ServiceModel x PayTiming` combination, not explicitly configured:

| Combination | Session created? |
|---|---|
| `STALL_KIOSK + PAY_BEFORE` | No |
| `STALL_KIOSK + PAY_AFTER` | Yes (auto) |
| `DINE_IN_TABLE + PAY_BEFORE` | Yes (for table tracking) |
| `DINE_IN_TABLE + PAY_AFTER` | Yes |

Sessions have no timer-based expiry. They close when: (1) the bill is paid, (2) the merchant manually closes the session from the portal, or (3) a platform-wide background cleanup job closes abandoned sessions after 24 hours.

Sessions are short-lived operational records. Once closed, they are historical artifacts -- useful for reporting ("how long did Table 5 sit?") but not actively queried by the storefront.

---

## Part 2 — CREATE TABLE

```sql
CREATE TABLE order_sessions (
  tenant_id           TEXT NOT NULL,
  id                  TEXT NOT NULL,

  -- Provenance
  qr_context_id       TEXT,                                   -- nullable; composite FK below
  table_id            TEXT,                                   -- nullable; live composite FK to tables
  table_ref           TEXT,                                   -- snapshot of tables.label at session-open time

  -- Lifecycle
  status              "OrderSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  closed_reason       "OrderSessionCloseReason",              -- nullable; required when status=CLOSED

  -- Optimistic concurrency
  version             INTEGER NOT NULL DEFAULT 1,

  -- Operational metadata
  party_size          SMALLINT,                                -- nullable; party size set by host
  notes               TEXT,

  -- Running session totals (denormalized for floor-plan view)
  subtotal_cents      INTEGER NOT NULL DEFAULT 0,
  total_cents         INTEGER NOT NULL DEFAULT 0,
  order_count         INTEGER NOT NULL DEFAULT 0,

  -- Lifecycle timestamps
  opened_at           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at           TIMESTAMP(3),

  -- Accountability (single-column FKs: users is global)
  opened_by_id        TEXT REFERENCES users(id),               -- staff who manually opened (NULL when QR scan)
  server_id           TEXT REFERENCES users(id),               -- staff serving this table
  closed_by_id        TEXT REFERENCES users(id),               -- staff who closed

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, qr_context_id) REFERENCES qr_contexts(tenant_id, id),
  FOREIGN KEY (tenant_id, table_id)      REFERENCES tables(tenant_id, id),

  CONSTRAINT order_sessions_closed_at_matches_status
    CHECK ((closed_at IS NULL) = (status = 'ACTIVE')),
  CONSTRAINT order_sessions_closed_at_after_opened
    CHECK (closed_at IS NULL OR closed_at >= opened_at),
  CONSTRAINT order_sessions_closed_reason_only_when_closed
    CHECK ((status = 'CLOSED') = (closed_reason IS NOT NULL)),
  CONSTRAINT order_sessions_party_size_positive
    CHECK (party_size IS NULL OR party_size > 0),
  CONSTRAINT order_sessions_subtotal_nonneg     CHECK (subtotal_cents >= 0),
  CONSTRAINT order_sessions_total_nonneg        CHECK (total_cents    >= 0),
  CONSTRAINT order_sessions_order_count_nonneg  CHECK (order_count    >= 0),
  CONSTRAINT order_sessions_last_activity_after_opened
    CHECK (last_activity_at >= opened_at)
);

CREATE INDEX ON order_sessions (tenant_id, status);

-- One ACTIVE session per table
CREATE UNIQUE INDEX order_sessions_one_active_per_table
  ON order_sessions (tenant_id, table_id)
  WHERE status = 'ACTIVE' AND table_id IS NOT NULL;

-- Cleanup job: find stale ACTIVE sessions
CREATE INDEX order_sessions_cleanup_idx
  ON order_sessions (tenant_id, last_activity_at)
  WHERE status = 'ACTIVE';

-- Historical session list (merchant portal "all sessions" view)
CREATE INDEX ON order_sessions (tenant_id, opened_at DESC);
```

### Notes on the 2026-04-25 enterprise upgrade

- **`version` OCC.** Multiple actors race to write a session: customer
  placing order via storefront, server clearing the table, payment
  webhook closing it. Without OCC, a payment-success callback that
  arrives 50ms after a manual force-close would silently overwrite the
  staff member's closure. OCC turns the second writer's update into a
  rejected `version` mismatch, so the application can re-read and decide.
- **`closed_reason` + sibling enum `OrderSessionCloseReason`.** Sibling-
  enum pattern (same as `OrderCancellationReason`/`CartAbandonedReason`):
  the lifecycle enum stays minimal (`ACTIVE`/`CLOSED`), the *why*
  goes in a separate column with its own dedicated vocabulary
  (`PAID`, `STAFF_FORCE_CLOSED`, `AUTO_TIMEOUT_24H`, `WALKED_AWAY`).
  CHECK constraints make "reason set iff status = CLOSED" a database-
  level invariant.
- **`last_activity_at`.** The original 24h-cleanup design used
  `opened_at + 24h`, which would close a perfectly good 8-hour-running
  session. `last_activity_at` is bumped on every order INSERT, every
  cart write, and every server-side touch. The cleanup job runs
  `WHERE status='ACTIVE' AND last_activity_at < NOW() - interval '24h'`
  and only catches actually-abandoned sessions.
- **`party_size`.** Optional, set by host on seat. Drives analytics
  ("avg party size by hour"), kitchen prep sizing, and the floor-plan
  display ("Table 5: party of 4").
- **`notes`.** Server-facing free-form text. "VIP guest", "birthday —
  bring cake at 8pm", "needs high chair", "dietary restrictions".
  Distinct from `orders.notes` (per-order) — `order_sessions.notes`
  applies to the whole table for the whole visit.
- **Running totals (`subtotal_cents`, `total_cents`, `order_count`).**
  Denormalized for the merchant-portal floor-plan view. Without these,
  rendering "Table 5 — $42.50, 4 orders" requires JOINing to `orders`
  + summing `total_cents`. With these, it's a single-row read on the
  hot path that refreshes every few seconds during service. Updated
  transactionally when an order is added or cancelled — same
  transaction that writes the order writes the session totals.
- **Accountability (`opened_by_id`, `server_id`, `closed_by_id`).**
  - `opened_by_id` records the staff who *manually* opened the session
    for a walk-in. NULL when the customer self-served via a QR scan
    (which is the dominant path).
  - `server_id` is the staff member responsible for this table. Used
    for floor-plan attribution ("whose tables are these?") and tip
    pooling.
  - `closed_by_id` records who closed the session. Combined with
    `closed_reason`, the audit trail tells the full story:
    `(closed_by_id=staff_007, closed_reason=WALKED_AWAY)` is a clear
    record of an unpaid walkaway acknowledged by a specific staff
    member.
- **One-ACTIVE-per-table partial unique index.** Two parties seated at
  the same table = two ACTIVE sessions = bug. The index makes that
  state impossible. The condition `WHERE table_id IS NOT NULL` is
  needed because stall/kiosk sessions have NULL `table_id` — we don't
  want to enforce uniqueness on NULL, which would fail anyway under
  Postgres NULL semantics but is cleaner to express explicitly.

---

## Part 3 — Column-by-Column

### `id` — TEXT PRIMARY KEY

- **Nullable:** No
- **Default:** None (app-generated cuid)
- **Purpose:** Unique identifier for this session.
- **Constraints:** Primary key.
- **Why:** Standard cuid pattern. Referenced by `orders`, `bills`, and (for dine-in sessions only) `carts` to link them to a session.

### `tenant_id` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** The tenant that this session belongs to.
- **Constraints:** `REFERENCES tenants(id) ON DELETE CASCADE`. Indexed as part of `(tenant_id, status)`.
- **Why:** Every session is tenant-scoped. The application layer uses `WHERE tenant_id = ?` on every query (enforced by `TenantGuard` via JWT). CASCADE ensures tenant deletion cleans up all sessions.

### `qr_context_id` — TEXT

- **Nullable:** Yes
- **Default:** None
- **Purpose:** The QR code that initiated this session.
- **Constraints:** `REFERENCES qr_contexts(id)`. Cross-FK tenant parity enforced by `order_sessions_qr_tenant_parity` trigger.
- **Why:** Nullable because sessions can be created programmatically (e.g., a merchant creates a session for a walk-in customer from the merchant portal, or a future API allows session creation without a QR scan). When set, it provides an audit trail: "this session was started because someone scanned the Table 5 QR code." The tenant parity trigger (C2) prevents a session from accidentally referencing a QR code owned by a different tenant.

### `table_ref` — TEXT

- **Nullable:** Yes
- **Default:** None
- **Purpose:** The human-readable table identifier, copied from `qr_contexts.table_ref` at session creation time.
- **Constraints:** None.
- **Why:** Denormalized from `qr_contexts` for two reasons:
  1. **Read performance** -- kitchen tickets and the merchant portal read `table_ref` from the session (and from orders), not by joining to `qr_contexts`. This is a hot-path read.
  2. **Historical accuracy** -- if the QR context is later relabeled (Table 5 becomes Table 5A), the session retains the original value. The customer sat at "Table 5" when they started, and that is what the kitchen ticket and the receipt should say.

  NULL for `STALL_KIOSK` sessions (no table) and for sessions created without a QR context.

### `status` — "OrderSessionStatus" NOT NULL

- **Nullable:** No
- **Default:** `'ACTIVE'`
- **Purpose:** Whether this session is currently accepting new orders.
- **Constraints:** Must be one of: `ACTIVE`, `CLOSED`.
- **Why:** The session status enum is intentionally minimal:
  - `ACTIVE` -- the session is open. Customers can place new orders, the storefront shows the running order list, and the table appears as "occupied" in the merchant portal.
  - `CLOSED` -- the session is finished. No new orders can be placed. The table is freed. The bill has been paid (for `PAY_AFTER`) or the customer has left (for `PAY_BEFORE`).

  There is no `EXPIRED` status. Sessions close by explicit action (bill paid, merchant closes) or by a platform-wide background cleanup job that closes abandoned sessions after 24 hours.

  ```sql
  CREATE TYPE "OrderSessionStatus" AS ENUM ('ACTIVE', 'CLOSED');
  ```

### `opened_at` — TIMESTAMP(3) NOT NULL

- **Nullable:** No
- **Default:** `CURRENT_TIMESTAMP`
- **Purpose:** When the session was created.
- **Constraints:** None.
- **Why:** Separate from `created_at` by design intent -- though in practice they are the same value. `opened_at` is the business-domain timestamp ("when did the customer sit down?"), while `created_at` would be the system timestamp. The decision was to use `opened_at` directly and skip a redundant `created_at` column, since sessions are always "opened" at creation time. Used for reporting: average session duration = `closed_at - opened_at`.

### `closed_at` — TIMESTAMP(3)

- **Nullable:** Yes
- **Default:** None
- **Purpose:** When the session was closed.
- **Constraints:** None.
- **Why:** NULL while the session is `ACTIVE`. Set when the session transitions to `CLOSED`, which happens when:
  - `PAY_AFTER`: the bill is paid.
  - `PAY_BEFORE + DINE_IN_TABLE`: the merchant closes the session from the portal (e.g., clearing a table).
  - Manual close by merchant (e.g., clearing a table).
  - Background cleanup job closes abandoned sessions after 24 hours (platform-wide).

  `closed_at - opened_at` gives session duration for analytics.

---

## Part 4 — Indexes

### `PRIMARY KEY (id)`

- **What it serves:** Direct lookups by session ID from orders, carts, and bills.
- **Example:** `SELECT * FROM order_sessions WHERE id = 'sess_001'`

### `INDEX ON order_sessions (tenant_id, status)`

- **What it serves:** Two critical queries:
  1. **Merchant portal: active sessions list** -- "Show me all currently occupied tables."
  2. **Session resolution on QR scan** -- "Is there already an active session for this tenant + table?"

- **Example (merchant portal):**
  ```sql
  SELECT id, table_ref, opened_at
  FROM order_sessions
  WHERE tenant_id = 'tenant_abc'
    AND status = 'ACTIVE'
  ORDER BY opened_at DESC;
  ```

- **Example (session resolution):**
  ```sql
  SELECT id
  FROM order_sessions
  WHERE tenant_id = 'tenant_abc'
    AND table_ref = '5'
    AND status = 'ACTIVE'
  LIMIT 1;
  ```

- **Why composite:** Queries always filter by `tenant_id` first (tenant isolation), then by `status` (only `ACTIVE` sessions are interesting for real-time operations). The composite index serves both filters in one B-tree traversal.

---

## Part 5 — Relationships

### Foreign Keys

| Column | References | On Delete | Why |
|---|---|---|---|
| `tenant_id` | `tenants(id)` | `CASCADE` | Tenant deletion cleans up all sessions |
| `(tenant_id, qr_context_id)` | `qr_contexts(tenant_id, id)` | No cascade (default) | QR deactivation should not close active sessions. The FK is informational. Cross-tenant linking impossible by construction (composite FK). |
| `(tenant_id, table_id)` | `tables(tenant_id, id)` | No cascade (default) | Live FK to dine-in table. Cross-tenant linking impossible. |
| `opened_by_id` | `users(id)` | (no action) | Single-column FK because `users` is global. |
| `server_id` | `users(id)` | (no action) | Single-column FK; staff serving the table. |
| `closed_by_id` | `users(id)` | (no action) | Single-column FK; staff who closed the session. |

### Incoming References

| Table | Column | Relationship | Notes |
|---|---|---|---|
| `orders` | `session_id` | Many orders per session | The core grouping relationship |
| `carts` | `session_id` | Many historical carts per session, **at most one ACTIVE** | **Dine-in sessions only** (since 2026-04-24). Stall/kiosk sessions never have cart rows — their basket lives in `localStorage`. The partial unique index `carts_one_active_per_session` enforces one ACTIVE cart per dine-in session (Option A: shared cart). |
| `bills` | `session_id` | One or more bills per session | PAY_AFTER: one bill. PAY_BEFORE: one bill per order. |

### Tenant Parity (since 2026-04-25)

No triggers needed — every cross-tenant FK to or from `order_sessions`
is composite, including `tenant_id`. The database itself rejects any
attempt to link a child row in tenant A to a session in tenant B. The
historical triggers (`order_sessions_qr_tenant_parity`,
`orders_session_tenant_parity`, `carts_session_tenant_parity`,
`bills_session_tenant_parity`) are gone.

---

## Part 6 — Real-World Usage Scenarios

### Scenario 1: Noodle stall session (STALL_KIOSK + PAY_AFTER)

A customer at a Phnom Penh noodle stall ("Kuy Teav Phnom Penh") orders beef noodle soup ($3.50). While eating, they add an iced coffee ($2.00). They pay $5.50 at the end.

```
order_sessions:
  id:            'sess_noodle_001'
  tenant_id:     'clx_kuy_teav'
  qr_context_id: 'clx_qr_counter'
  table_ref:     NULL                    -- no table (stall)
  status:        ACTIVE → CLOSED
  opened_at:     2026-04-09 11:30:00
  closed_at:     2026-04-09 11:52:00

  orders within this session:
    order_001: Beef Noodle Soup  $3.50  (COMPLETED)
    order_002: Iced Coffee       $2.00  (COMPLETED)

  bill:
    bill_001: $5.50 (PAID) → links to both orders
```

The session auto-created because `PAY_AFTER` requires bill grouping. If the customer walks away without paying, the merchant can force-close the session from the portal, or the background cleanup job closes it after 24 hours.

### Scenario 2: BBQ restaurant table session (DINE_IN_TABLE + PAY_AFTER)

A group of four at a Siem Reap BBQ restaurant ("Sach Ko Ang") sits at Table 5. Over 90 minutes, they place three rounds of orders: appetizers ($12), mains ($25), and drinks ($9). They request the bill and pay $46 in cash.

```
order_sessions:
  id:            'sess_bbq_005'
  tenant_id:     'clx_sach_ko'
  qr_context_id: 'clx_qr_table5'
  table_ref:     '5'
  status:        ACTIVE → CLOSED
  opened_at:     2026-04-09 18:00:00
  closed_at:     2026-04-09 19:32:00

  orders: 3 (appetizers, mains, drinks)
  bill: $46.00 (one bill, all three orders)
```

The merchant portal shows Table 5 as "occupied" from 18:00 to 19:32. After the session closes, Table 5 becomes "available" and the next group can scan the same QR.

### Scenario 3: Food court table with pay-before (DINE_IN_TABLE + PAY_BEFORE)

A customer at a food court scans the QR on Table 12, orders Pad Thai ($5) and pays immediately. Later they order dessert ($4) and pay again. Two separate bills, but both tracked to Table 12.

```
order_sessions:
  id:            'sess_fc_012'
  tenant_id:     'clx_food_court'
  qr_context_id: 'clx_qr_table12'
  table_ref:     '12'
  status:        ACTIVE → CLOSED
  opened_at:     2026-04-09 12:15:00
  closed_at:     2026-04-09 12:55:00     -- merchant closed / customer left

  orders:
    order_001: Pad Thai $5.00 → bill_001 (PAID)
    order_002: Mango Sticky Rice $4.00 → bill_002 (PAID)
```

The session exists for table tracking (kitchen tickets show "Table 12"), not for bill grouping. Each order is paid independently because `PAY_BEFORE`. The session is closed by the merchant from the portal when the customer leaves, or by the background cleanup job after 24 hours of inactivity.

---

## Part 7 — Design Decisions

### Why there is no `created_at` column

The `opened_at` column serves double duty as both the business timestamp ("when did the session start?") and the creation timestamp. Adding a separate `created_at` would always have the same value and waste space. If a future requirement needs to distinguish "when was the DB row inserted" from "when did the session conceptually open," the column can be added -- but for MVP, they are identical.

### Why sessions have no timer-based expiry

Sessions do not have an `expires_at` column or a configurable timeout. A session closes when one of three things happens: (1) the bill is paid (PAY_AFTER flow), (2) the merchant manually closes it from the portal (e.g., clearing a table, voiding a walkaway), or (3) a platform-wide background cleanup job closes abandoned sessions after 24 hours of *real* inactivity. This design was chosen because:

- **Configurable timeouts were unnecessary complexity.** The original design had a per-tenant `session_timeout_min` setting and an `expires_at` column on sessions. In practice, the business logic is simple: a session is done when payment happens or the merchant says it is done. A timer that fires at 30 minutes or 4 hours adds edge cases (what if the customer is still eating?) without solving the real problem (zombie sessions).
- **The 24-hour cleanup is a safety net, not a business rule.** It catches sessions that were genuinely abandoned (customer walked away, merchant forgot). 24 hours is generous enough that no legitimate session will be closed prematurely.
- **`last_activity_at` (added 2026-04-25) measures real activity, not time since open.** A session that has been ordering steadily for 8 hours is *not* abandoned, even though it's been open for a long time. The cleanup job uses `last_activity_at < NOW() - interval '24h'`, which only catches sessions where the customer truly walked away. Touched on every order INSERT, every cart write, every server-side action.
- **No need for "approaching expiry" warnings or extension logic.** The old design required sending "your session is about to expire" notices and allowing customers to extend. This is unnecessary UX complexity for a food ordering app.

### Why there is no `EXPIRED` status (the close reason carries the detail instead)

The lifecycle enum stays at two states (`ACTIVE`, `CLOSED`). The *why* of
closure lives in `closed_reason` — `PAID`, `STAFF_FORCE_CLOSED`,
`AUTO_TIMEOUT_24H`, `WALKED_AWAY` — which is a sibling enum gated by a
CHECK constraint (reason set iff status = CLOSED). This is the same
sibling-enum pattern used by `OrderCancellationReason` and
`CartAbandonedReason`.

Reasons this is better than adding `EXPIRED` to the lifecycle enum:

- **Operational and analytical concerns are separated.** "Is this
  session active?" is a one-column predicate (`status = 'ACTIVE'`).
  "Why was it closed?" is a separate analytical question on
  `closed_reason`.
- **The vocabulary can evolve without touching the lifecycle enum.**
  Adding `MERGED_INTO_OTHER` to `OrderSessionCloseReason` post-MVP is a
  pure additive change — no migration of code that pattern-matches on
  the lifecycle enum.
- **Queries don't bloat.** "Find finished sessions" is still
  `WHERE status = 'CLOSED'`. Filtering by close reason is opt-in
  (`AND closed_reason = 'WALKED_AWAY'`).

### Why `qr_context_id` is nullable

Sessions can be created without a QR scan -- for example, a merchant manually opens a session for a walk-in customer from the merchant portal, or a future POS integration creates sessions programmatically. The QR context is informational, not structural.

### Why `table_ref` is denormalized from `qr_contexts`

The table reference is copied at session creation time and never updated. If the QR context is relabeled ("Table 5" becomes "Table 5A"), the session retains the original value. This preserves historical accuracy for kitchen tickets, receipts, and reporting.

---

## Part 8 — Related Tables

| Table | Relationship | Notes |
|---|---|---|
| `tenants` | Parent (FK) | Every session belongs to one tenant |
| `qr_contexts` | Optional parent (FK) | The QR code that started this session |
| `orders` | Children (FK `session_id`) | The orders placed within this session |
| `carts` | Children (FK `session_id`, NOT NULL on cart side) | **Dine-in only** (since 2026-04-24). One ACTIVE shared cart per session at a time; many CONVERTED / ABANDONED rows accumulate over the meal. |
| `bills` | Children (FK `session_id`) | The bill(s) generated for this session |
| `tenant_settings` | Sibling (same tenant) | `service_model` + `pay_timing` determine session creation rules |
