# Table Reference: `order_status_history`

| Property | Value |
|---|---|
| **Domain** | Order |
| **Tenant-scoped** | Yes (composite PK `(tenant_id, id)`) |
| **Prisma model** | `OrderStatusHistory` |
| **Table #** | 31 of 38 |
| **Last upgrade** | 2026-04-26 (renamed `changed_by` → `changed_by_id`; aligned actor model with `audit_logs` via `actor_type`/`actor_label`; `cancellation_reason` typed mirror; `request_id` + `metadata` for correlation; no-op CHECK; 2 partial indexes) |

---

## Part 1 — Overview

The `order_status_history` table is an **append-only audit trail** of every status transition an order goes through. Every time `orders.status` changes, a new row is inserted here recording what the status was before, what it changed to, who made the change, and why.

This table answers questions that `orders.status` alone cannot:
- **When** did the order move from `SUBMITTED` to `PREPARING`? (Kitchen response time.)
- **When** did the order move from `PREPARING` to `READY`? (Preparation time.)
- **Who** cancelled this order? (A customer, a merchant, or the system via timeout?)
- **Why** was this order cancelled? (Free-text reason for audit and dispute resolution.)
- **How long** did each status last? (Operational analytics: time in queue, time preparing, time waiting for pickup, etc.)

The table is append-only by design. Rows are never updated or deleted during normal operation. This makes it a reliable audit trail -- even if application code has bugs that incorrectly update `orders.status`, the history table preserves the real sequence of events.

### Why `from_status` and `to_status` are TEXT, not enum

The `OrderStatus` enum has already changed once: the original design had `PENDING_PAYMENT`, `CONFIRMED`, `SUBMITTED`, `CANCELLED`, and the redesign (see `design-discussions/order-status-redesign.md`) replaced it with `SUBMITTED`, `PREPARING`, `READY`, `COMPLETED`, `CANCELLED`. If `from_status` and `to_status` were enum-typed, that migration would have required rewriting all historical rows — changing the audit trail. Using TEXT decouples the history table from enum evolution. Historical rows survive any enum change without data migration. Future enum changes (if any) will similarly leave history intact.

`tenant_id` is denormalized from the parent `orders` table (C1) with a parity trigger.

---

## Part 2 — CREATE TABLE

> **2026-04-25:** composite-PK refresh. Composite FK to `orders` makes
> cross-tenant linking impossible by construction — old
> `order_status_history_tenant_parity` trigger removed.
>
> **2026-04-26:** actor disambiguation aligned with `audit_logs`;
> `changed_by` → `changed_by_id` rename; `cancellation_reason` typed
> mirror; correlation IDs; CHECK suite.

```sql
CREATE TABLE order_status_history (
  tenant_id            TEXT NOT NULL,
  id                   TEXT NOT NULL,
  order_id             TEXT NOT NULL,

  -- Transition
  from_status          TEXT,                                              -- NULL for initial creation
  to_status            TEXT NOT NULL,
  cancellation_reason  "OrderCancellationReason",                         -- typed mirror when to_status = CANCELLED
  reason               TEXT,                                              -- free-form human-readable note

  -- Actor (aligned with audit_logs)
  actor_type           "AuditActorType" NOT NULL,                         -- USER | SYSTEM | WEBHOOK | CRON | API_KEY
  actor_label          TEXT,                                              -- required when actor_type != USER
  changed_by_id        TEXT REFERENCES users(id),                         -- single-column FK; users is global

  -- Correlation
  request_id           TEXT,                                              -- API request / BullMQ job ID
  metadata             JSONB,                                             -- transition-specific structured context

  created_at           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT order_status_history_user_actor_has_user_id
    CHECK ((actor_type = 'USER') = (changed_by_id IS NOT NULL)),
  CONSTRAINT order_status_history_system_actors_have_label
    CHECK ((actor_type = 'USER') OR (actor_label IS NOT NULL)),
  CONSTRAINT order_status_history_no_op_transition
    CHECK (from_status IS NULL OR from_status != to_status)
);

CREATE INDEX ON order_status_history (tenant_id, order_id, created_at);

-- Correlation lookup
CREATE INDEX order_status_history_request_id_idx
  ON order_status_history (request_id)
  WHERE request_id IS NOT NULL;

-- Cancellation analytics
CREATE INDEX order_status_history_cancellation_idx
  ON order_status_history (tenant_id, created_at DESC)
  WHERE to_status = 'CANCELLED';
```

### Notes on the 2026-04-26 enterprise upgrade

- **Naming alignment.** `changed_by` → `changed_by_id`. Every other
  user FK in the schema uses the `*_id` suffix; this column was the
  last hold-out.
- **Actor disambiguation.** Reuses the `AuditActorType` enum from
  `audit_logs`. The same status transition might come from:
  - `USER` — kitchen staff tap "Mark Ready" on the tablet
  - `SYSTEM` — `auto_accept_orders=TRUE` flips `SUBMITTED` → `PREPARING`
  - `WEBHOOK` — incoming ABA payment callback flips a `SUBMITTED`
    PAY_BEFORE order to `PREPARING`
  - `CRON` — auto-cancel-stale-pending job flips `SUBMITTED` → `CANCELLED`
  Now each is queryable as a first-class category.
- **`actor_label`.** Required when `actor_type != USER`:
  `"BullMQ:auto-accept-after-payment"`, `"ABA-webhook"`,
  `"cron:auto-cancel-stale-1h"`. CHECK constraint enforces.
- **`cancellation_reason` typed mirror.** When `to_status = 'CANCELLED'`,
  this column carries the same `OrderCancellationReason` enum value
  that landed on `orders.cancellation_reason`. Lets the cancellation
  analytics query stay on the history table without joining back to
  orders (which is the hot read path):
  ```sql
  -- "Cancellation breakdown by reason today"
  SELECT cancellation_reason, COUNT(*)
  FROM order_status_history
  WHERE tenant_id = $1
    AND to_status = 'CANCELLED'
    AND created_at::date = CURRENT_DATE
  GROUP BY cancellation_reason;
  ```
  The partial index `WHERE to_status = 'CANCELLED'` makes this cheap.
  No CHECK enforcing "cancellation_reason set iff to_status = CANCELLED" —
  the TEXT typing of `to_status` (for archival durability) makes that
  CHECK potentially reject historical rows after enum changes. Trust
  the application layer.
- **`request_id`.** Same correlation field as `audit_logs`. Ties
  status transitions back to the originating API request or BullMQ
  job. When investigating "why did this batch of orders get cancelled
  at 14:32?", pulling all `order_status_history` rows with the same
  `request_id` answers it instantly.
- **`metadata` JSONB.** Transition-specific structured context.
  Examples:
  - `{"trigger": "auto_accept_orders=true"}` for `SUBMITTED →
    PREPARING` SYSTEM transitions.
  - `{"webhook_event_id": "aba_evt_123"}` for WEBHOOK transitions.
  - `{"detected_anomaly": "kitchen_overload", "queue_size": 47}` for
    forced cancellations.
  The free-form `reason TEXT` stays for human-readable notes; `metadata`
  is for structured, queryable extras (parallels the `audit_logs.metadata`
  vs `previous_state`/`new_state` split).
- **No-op CHECK.** `from_status IS NULL OR from_status != to_status`.
  Writing the same status as a "transition" is a bug — make it
  impossible.

### What was deliberately not added

- **`category` enum** — redundant; everything here is order-domain.
  `audit_logs.category` exists for the cross-cutting log; this table
  is domain-specific.
- **`severity` enum** — status transitions don't have a natural severity
  axis. The `to_status` itself carries the operational signal
  (`CANCELLED` is the concerning case).
- **`previous_state` / `new_state` JSONB** — the `from_status` /
  `to_status` columns ARE the diff. JSONB columns here would be
  redundant.
- **`auth_session_id`, `idempotency_key`** — order-status transitions
  don't typically come through idempotent API calls. The cross-table
  audit live in `audit_logs`.
- **`retention_until`** — order_status_history follows the parent
  order's lifecycle (`ON DELETE CASCADE`). Per-row retention is
  over-engineering.

### Why CHECK constraints don't enforce status enum membership

`from_status` and `to_status` are TEXT, not enum-typed. Adding a CHECK
like `to_status IN ('SUBMITTED', 'PREPARING', 'READY', 'COMPLETED',
'CANCELLED')` would defeat the archival-durability decision: when the
enum evolves (it's already evolved once — see
`design-discussions/order-status-redesign.md`), the CHECK would either
reject historical rows or require a migration. The TEXT typing is the
right choice; status validity is enforced at write time by the
application's `OrderService.transition()` method.

---

## Part 3 — Column-by-Column

### `id` — TEXT PRIMARY KEY

- **Nullable:** No
- **Default:** None (app-generated cuid)
- **Purpose:** Unique identifier for this history entry.
- **Constraints:** Primary key.
- **Why:** Standard cuid. Rarely used for direct lookups -- history is typically queried by `order_id` -- but needed for the primary key requirement.

### `tenant_id` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None (copied from parent order at insert time)
- **Purpose:** Denormalized tenant identifier for direct query isolation.
- **Constraints:** `REFERENCES tenants(id) ON DELETE CASCADE`. Indexed. Parity enforced by `order_status_history_tenant_parity` trigger.
- **Why:** Critical finding C1. Allows the Prisma middleware to enforce `WHERE tenant_id = ?` on every query without joining to `orders`. The parity trigger guarantees that the history entry's `tenant_id` matches its parent order's `tenant_id`.

### `order_id` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** The order this status change belongs to.
- **Constraints:** `REFERENCES orders(id) ON DELETE CASCADE`. Indexed.
- **Why:** The core structural relationship. An order can have many history entries (one per status transition). `ON DELETE CASCADE` means order deletion removes its history -- correct because history without an order is meaningless.

### `from_status` — TEXT

- **Nullable:** Yes
- **Default:** None
- **Purpose:** The status the order was in before this transition.
- **Constraints:** None (deliberately TEXT, not enum).
- **Why:** Nullable for the **first** history entry, which records the initial status at order creation. At that point, there is no "from" status -- the order did not exist before:
  - Both PAY_BEFORE and PAY_AFTER: `{ from_status: NULL, to_status: 'SUBMITTED' }` -- order created, kitchen ticket queued.

  (The order record is only created after the payment gate for PAY_BEFORE, or immediately for PAY_AFTER. In both cases, the initial status is always `SUBMITTED`.)

  TEXT (not enum) because the `OrderStatus` enum has already changed once (see `design-discussions/order-status-redesign.md`). Historical rows must survive enum changes without data migration. See Part 7 for the full rationale.

### `to_status` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** The status the order transitioned to.
- **Constraints:** None (deliberately TEXT, not enum).
- **Why:** The target status of this transition. Combined with `from_status`, this fully describes the transition:
  - `SUBMITTED` -> `PREPARING` (first kitchen ticket moves to PREPARING)
  - `SUBMITTED` -> `CANCELLED` (customer or merchant cancels before kitchen starts)
  - `PREPARING` -> `READY` (all kitchen tickets reach READY)
  - `PREPARING` -> `CANCELLED` (merchant cancels — kitchen can't fulfill)
  - `READY` -> `COMPLETED` (staff confirms pickup/delivery)
  - `READY` -> `CANCELLED` (rare — merchant voids after food is ready)

  TEXT for the same enum-evolution reasons as `from_status`.

### `cancellation_reason` — `"OrderCancellationReason"` *(2026-04-26)*

- **Nullable:** Yes
- **Default:** None
- **Purpose:** Typed mirror of `orders.cancellation_reason` when this transition is `to_status = 'CANCELLED'`. Drives in-place cancellation analytics without joining to `orders`.
- **Constraints:** No DB-level CHECK forcing it to be set when `to_status = 'CANCELLED'` (the TEXT typing of `to_status` for archival durability would make such a CHECK potentially reject rows after enum changes). Application-layer convention enforces.
- **Why:** Cancellation segmentation queries are hot — "what % of cancellations today were `OUT_OF_STOCK`?" — and joining to `orders` is acceptable but unnecessary when the value can live here too. Same enum, mirrored at write time.

### `actor_type` — `"AuditActorType"` *(2026-04-26)*

- **Nullable:** No
- **Default:** None
- **Purpose:** Disambiguates the actor: `USER`, `SYSTEM`, `WEBHOOK`, `CRON`, `API_KEY`. Reuses the enum defined in `enums/audit-actor-type.md`.
- **Constraints:** `NOT NULL`. Paired with `changed_by_id` and `actor_label` via CHECK constraints.
- **Why:** The pre-2026-04-26 design used `changed_by IS NULL` to mean "system" — but that collapsed system / webhook / cron / api_key into one ambiguous case. Now each is queryable as a first-class category. Aligns with `audit_logs` actor model so the merchant-portal "who advanced this order?" view shares query shape with the platform-admin audit view.

### `actor_label` — TEXT *(2026-04-26)*

- **Nullable:** Yes (only when `actor_type = USER`)
- **Default:** None
- **Purpose:** Names the system actor when `actor_type != USER`. Examples: `"BullMQ:auto-accept-after-payment"`, `"ABA-webhook"`, `"cron:auto-cancel-stale-1h"`.
- **Constraints:** CHECK `(actor_type = 'USER') OR (actor_label IS NOT NULL)`.
- **Why:** "user_id IS NULL = system" was ambiguous; "actor_label = 'ABA-webhook'" is forensic gold.

### `changed_by_id` — TEXT *(renamed from `changed_by` 2026-04-26)*

- **Nullable:** Yes (only when `actor_type = USER`)
- **Default:** None
- **Purpose:** The human user who triggered this status change. Single-column FK because `users` is global.
- **Constraints:** `REFERENCES users(id)`. CHECK `(actor_type = 'USER') = (changed_by_id IS NOT NULL)`.
- **Why:** Naming aligned with the rest of the schema's `*_id` suffix convention. The CHECK constraint with `actor_type` makes drift impossible: USER actors must have user_id; non-USER actors must not.

  No cascade on user deletion (default `NO ACTION`) — audit trails should not lose attribution. If user deletion is needed, the application sets `changed_by_id = NULL` and `actor_type = SYSTEM` (with `actor_label = "redacted-deleted-user"`) before hard-delete.

### `reason` — TEXT

- **Nullable:** Yes
- **Default:** None
- **Purpose:** A free-text human-readable explanation of this status change.
- **Constraints:** None.
- **Why:** Critical for dispute resolution and operational debugging. Examples:
  - `"Kitchen ticket TKT-000001 moved to PREPARING"`
  - `"All tickets ready — order auto-synced to READY"`
  - `"Cancelled by kitchen: out of stock — Beef Noodle Soup"`
  - `"Customer cancelled before kitchen started"`
  - `"Staff confirmed pickup"`

  Khmer examples:
  - `"អស់ស្តុក — មីកញ្ចប់សាច់គោ"` ("Out of stock -- Beef Noodle Soup")
  - `"អតិថិជនបោះបង់មុនផ្ទះបាយចាប់ផ្តើម"` ("Customer cancelled before kitchen started")

  NULL for routine transitions that need no explanation (e.g., `SUBMITTED` -> `PREPARING` via normal kitchen auto-sync).

  **Distinct from `cancellation_reason`:** `cancellation_reason` is the typed enum (machine-readable, indexable); `reason` is the free-form note (human-readable). Both can be set; they don't conflict.

### `request_id` — TEXT *(2026-04-26)*

- **Nullable:** Yes
- **Default:** None
- **Purpose:** Correlation ID. Same field as `audit_logs.request_id` and the rest of the request-tracing surface.
- **Constraints:** Indexed (partial: `WHERE request_id IS NOT NULL`).
- **Why:** When investigating an incident, pulling all `order_status_history` rows with the same `request_id` shows every status transition triggered by one originating API request or BullMQ job. Especially useful when one ABA payment webhook flips multiple PAY_BEFORE orders to `PREPARING` — they all share a request_id.

### `metadata` — JSONB *(2026-04-26)*

- **Nullable:** Yes
- **Default:** None
- **Purpose:** Transition-specific structured context. Schema varies per transition type.
- **Constraints:** None.
- **Why:** Examples:
  - `{"trigger": "auto_accept_orders=true"}` for SYSTEM transitions.
  - `{"webhook_event_id": "aba_evt_123", "payment_id": "pay_001"}` for WEBHOOK transitions.
  - `{"detected_anomaly": "kitchen_overload", "queue_size": 47}` for forced cancellations.
  - `{"sync_source": "kitchen_ticket_TKT-042"}` for kitchen-ticket-mirror transitions.

  Distinct from `reason` (human-readable) and `cancellation_reason` (typed enum). `metadata` is for structured queryable extras.

### `created_at` — TIMESTAMP(3) NOT NULL

- **Nullable:** No
- **Default:** `CURRENT_TIMESTAMP`
- **Purpose:** When this status transition occurred.
- **Constraints:** None.
- **Why:** The single most important column for operational analytics. The time difference between consecutive history entries measures how long the order spent in each status:
  - `SUBMITTED` -> `PREPARING`: kitchen response time (how fast the kitchen starts on a new order).
  - `PREPARING` -> `READY`: preparation time (how long the kitchen takes to cook).
  - `READY` -> `COMPLETED`: pickup time (how long food sits before the customer picks it up).
  - Time from first history entry to last: total order lifecycle.

  No `updated_at` because history entries are never updated.

---

## Part 4 — Indexes

### `PRIMARY KEY (tenant_id, id)`

Direct lookups (rarely used in practice).

### `INDEX (tenant_id, order_id, created_at)`

The hot query — loading the full history for one order, in order.

```sql
SELECT from_status, to_status, actor_type, actor_label,
       changed_by_id, cancellation_reason, reason, created_at
FROM order_status_history
WHERE tenant_id = $1 AND order_id = $2
ORDER BY created_at ASC;
```

Every order detail view in the merchant portal shows the status timeline.

### `order_status_history_request_id_idx` *(2026-04-26)* — partial

```sql
CREATE INDEX order_status_history_request_id_idx
  ON order_status_history (request_id)
  WHERE request_id IS NOT NULL;
```

Cross-event correlation. "What status transitions happened during this
incident's originating request?":

```sql
SELECT * FROM order_status_history
WHERE request_id = $1
ORDER BY created_at ASC;
```

### `order_status_history_cancellation_idx` *(2026-04-26)* — partial

```sql
CREATE INDEX order_status_history_cancellation_idx
  ON order_status_history (tenant_id, created_at DESC)
  WHERE to_status = 'CANCELLED';
```

Cancellation analytics. "Cancellation breakdown by reason today":

```sql
SELECT cancellation_reason, COUNT(*)
FROM order_status_history
WHERE tenant_id = $1
  AND to_status = 'CANCELLED'
  AND created_at::date = CURRENT_DATE
GROUP BY cancellation_reason
ORDER BY COUNT(*) DESC;
```

The partial index keeps this query cheap regardless of how many
non-cancelled transitions accumulate.

### Operational analytics queries (no dedicated index)

The `(tenant_id, order_id, created_at)` index is a covering index for
most operational analytics. Example: average kitchen response time
this week:

```sql
SELECT AVG(EXTRACT(EPOCH FROM (h2.created_at - h1.created_at))) AS avg_kitchen_response_seconds
FROM order_status_history h1
JOIN order_status_history h2
  ON h2.tenant_id = h1.tenant_id AND h2.order_id = h1.order_id
WHERE h1.tenant_id = $1
  AND h1.to_status = 'SUBMITTED'
  AND h2.to_status = 'PREPARING'
  AND h1.created_at >= NOW() - INTERVAL '7 days';
```

---

## Part 5 — Relationships

### Foreign Keys

| Column | References | On Delete | Why |
|---|---|---|---|
| `tenant_id` | `tenants(id)` | `CASCADE` | Tenant deletion removes all history |
| `(tenant_id, order_id)` | `orders(tenant_id, id)` | `CASCADE` | Order deletion removes its history; composite FK enforces same-tenant |
| `changed_by_id` | `users(id)` | No cascade (default `NO ACTION`) | Audit trails should not lose attribution; single-column FK because `users` is global. **Renamed 2026-04-26** from `changed_by` for `*_id` suffix convention. |

### Incoming References

None. `order_status_history` is a leaf table.

### Tenant Parity (since 2026-04-25)

No trigger needed — composite FK to `orders(tenant_id, id)` makes
cross-tenant linking impossible by construction.

---

## Part 6 — Real-World Usage Scenarios

### Scenario 1: Successful PAY_BEFORE order at a bubble tea shop

A customer at "Brown Coffee" in Phnom Penh pays via ABA QR. After payment succeeds, the order is created and sent to the kitchen. The full history:

```
order_status_history for order_bc_001:

  #1  from: NULL              to: SUBMITTED
      actor_type: WEBHOOK     actor_label: 'ABA-webhook'
      changed_by_id: NULL     reason: NULL
      request_id: 'req_aba_callback_a3f...'
      metadata: {"webhook_event_id":"aba_evt_456","payment_id":"pay_001"}
      created_at: 2026-04-09 14:30:45
      → Order created (after payment succeeded), kitchen ticket TKT-000001 created

  #2  from: SUBMITTED         to: PREPARING
      actor_type: SYSTEM      actor_label: 'auto-sync:kitchen-ticket'
      changed_by_id: NULL     reason: 'Kitchen ticket TKT-000001 moved to PREPARING'
      metadata: {"sync_source":"kitchen_ticket_TKT-000001"}
      created_at: 2026-04-09 14:32:00
      → Kitchen started, ~75 seconds after order creation

  #3  from: PREPARING         to: READY
      actor_type: SYSTEM      actor_label: 'auto-sync:kitchen-ticket'
      changed_by_id: NULL     reason: 'All tickets ready'
      created_at: 2026-04-09 14:35:00
      → All items ready, 3 minutes of preparation

  #4  from: READY             to: COMPLETED
      actor_type: USER        actor_label: NULL
      changed_by_id: 'user_kitchen_dara'
      reason: 'Staff confirmed pickup'
      created_at: 2026-04-09 14:35:30
      → Customer picked up, 30 seconds after ready
```

Analytics from this history:
- Kitchen response time (SUBMITTED -> PREPARING): 75 seconds.
- Preparation time (PREPARING -> READY): 3 minutes.
- Pickup time (READY -> COMPLETED): 30 seconds.
- Total order lifecycle: ~4.75 minutes.
- (Payment latency is tracked separately on the bill/payment side, not here.)

### Scenario 2: Cancelled PAY_AFTER order at a BBQ restaurant

A group at Table 5 of "Sach Ko Ang" in Siem Reap orders appetizers, but the kitchen is out of Spring Rolls. The kitchen staff cancels the order.

```
order_status_history for order_bbq_cancel:

  #1  from: NULL              to: SUBMITTED
      actor_type: USER        actor_label: NULL
      changed_by_id: 'user_server_borey'
      cancellation_reason: NULL  reason: NULL
      created_at: 2026-04-09 18:05:00
      → Order created (PAY_AFTER = SUBMITTED immediately), kitchen ticket created

  #2  from: SUBMITTED         to: CANCELLED
      actor_type: USER        actor_label: NULL
      changed_by_id: 'user_kitchen_staff_01'
      cancellation_reason: 'OUT_OF_STOCK'
      reason: 'អស់ស្តុក — នំបញ្ចុកបំពង (Out of stock — Spring Rolls)'
      created_at: 2026-04-09 18:06:30
      → Kitchen staff cancelled after 90 seconds
```

Note: `cancellation_reason` carries the typed `OrderCancellationReason`
enum value; `reason` carries the bilingual human-readable note. Both are
useful — analytics queries the enum, the merchant portal displays the
text.

The merchant portal shows: "Order ORD-000015 cancelled by Kitchen Staff #1. Reason: Out of stock -- Spring Rolls."

### Scenario 3: Full lifecycle of a PAY_AFTER order with multiple rounds (noodle stall)

A customer at "Kuy Teav Phnom Penh" orders beef noodle soup, the kitchen prepares it, and it is picked up.

```
order_status_history for order_kt_001:

  #1  from: NULL              to: SUBMITTED
      actor_type: USER        actor_label: NULL
      changed_by_id: 'user_server_dara'
      created_at: 2026-04-09 11:30:00
      → Order created (PAY_AFTER), kitchen ticket TKT-000023 created

  #2  from: SUBMITTED         to: PREPARING
      actor_type: SYSTEM      actor_label: 'auto-sync:kitchen-ticket'
      changed_by_id: NULL     reason: 'Kitchen ticket TKT-000023 moved to PREPARING'
      metadata: {"sync_source":"kitchen_ticket_TKT-000023"}
      created_at: 2026-04-09 11:31:00
      → Kitchen started after 60 seconds

  #3  from: PREPARING         to: READY
      actor_type: SYSTEM      actor_label: 'auto-sync:kitchen-ticket'
      changed_by_id: NULL     reason: 'All tickets ready'
      created_at: 2026-04-09 11:38:00
      → Soup ready after 7 minutes of preparation

  #4  from: READY             to: COMPLETED
      actor_type: USER        actor_label: NULL
      changed_by_id: 'user_kitchen_staff_01'
      reason: 'Served to table'
      created_at: 2026-04-09 11:39:00
      → Served 1 minute after ready
```

Analytics from this history:
- Kitchen response time: 60 seconds.
- Preparation time: 7 minutes.
- Serving time: 1 minute.
- Payment for this order happens later (tracked on the bill side, not in order status history).

---

## Part 7 — Design Decisions

### Why `from_status` and `to_status` are TEXT, not the `OrderStatus` enum

This is the single most important design decision on this table, and it has already proven its value. The `OrderStatus` enum was redesigned (see `design-discussions/order-status-redesign.md`):
- `PENDING_PAYMENT` was removed (payment tracking moved entirely to `BillStatus` + `PaymentStatus`).
- `CONFIRMED` was removed (the order's existence IS confirmation).
- `PREPARING`, `READY`, `COMPLETED` were added.
- `SUBMITTED` changed meaning (was terminal "sent to kitchen," now initial "order exists").

If `from_status` and `to_status` had been `"OrderStatus"` enum columns, this migration would have required:
1. Adding the new enum values.
2. Rewriting all historical rows to map old values to new values.
3. Removing the old enum values.

Step 2 would have been destructive — changing the audit trail. Because the columns are TEXT, the enum migration only touched `orders.status`. Historical rows with `from_status = 'PENDING_PAYMENT'` or `to_status = 'CONFIRMED'` remain untouched, preserving an accurate record of what actually happened under the old design.

### Why the table is append-only

History entries are never updated or deleted (except via CASCADE when the parent order or tenant is deleted). This guarantees:
- **Tamper resistance.** No one can silently change the record of when or why an order was cancelled.
- **Completeness.** Every transition is recorded, even if the application crashes between updating `orders.status` and inserting the history row (in which case, the missing row is detectable).
- **Simplicity.** No UPDATE logic, no concurrency conflicts, no optimistic locking needed.

### Why `changed_by_id` references `users(id)` without CASCADE

Deleting a user who triggered status changes would either:
- `CASCADE` -- delete the history entries, destroying the audit trail. Unacceptable.
- `SET NULL` -- lose the attribution ("who cancelled this order?"). Bad but survivable.
- `NO ACTION` (chosen) -- block user deletion. This is the safest default.

In practice, users are soft-deleted (`users.status = 'DELETED'`), not hard-deleted. The FK never triggers. If hard deletion is needed in the future, the application should explicitly handle the history entries first.

### Why there is no `updated_at` column

Append-only tables do not need `updated_at`. The row is written once and never modified. Adding `updated_at` would waste 8 bytes per row and imply mutability that does not exist.

---

## Part 8 — Related Tables

| Table | Relationship | Notes |
|---|---|---|
| `tenants` | Parent (FK, denormalized) | Tenant isolation via denormalized `tenant_id` |
| `orders` | Parent (FK, CASCADE) | Every history entry belongs to one order |
| `users` | Optional reference (FK) | The user who triggered the change, if human-initiated |
| `kitchen_tickets` | Indirect (via orders) | Kitchen ticket status changes have their own history table (`kitchen_ticket_events`) |
| `audit_logs` | Related | Some status changes also generate audit log entries for platform-level monitoring |
