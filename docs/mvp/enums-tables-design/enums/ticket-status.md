# TicketStatus — Design Discussion & Decision

**Date:** 2026-04-09
**Status:** Kept all 5 values — each is justified
**Affects:** `kitchen_tickets` table, `kitchen_ticket_events` table
**MVP note:** Fully wired for MVP. Every status transition is recorded in
`kitchen_ticket_events` and broadcast via Socket.io to room
`tenant_{tenant_id}`. Timer metrics are computed from timestamp columns,
not stored separately.

---

## The enum

```sql
CREATE TYPE "TicketStatus" AS ENUM (
  'NEW',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED'
);
```

---

## Part 1 — Each value explained in detail

### `NEW`

**Meaning:** A kitchen ticket has just been created and is waiting for
kitchen staff to acknowledge it. The kitchen has been alerted (audible
notification, visual appearance on the board) but nobody has tapped the
ticket yet.

**Who sets it:** System (default on creation, when the associated order
reaches SUBMITTED status — i.e., the order record exists).

**What happens:**
- The ticket appears in the "New" (ថ្មី) column on the kitchen display
  board.
- An audible alert plays on the kitchen tablet (configurable tone).
- Socket.io emits a `ticket:created` event to room `tenant_{tenant_id}`.
- The kitchen display shows the ticket number (TKT-000042), items, special
  notes, and — for dine-in — the table reference ("Table 5" / "តុ ៥").
- For stall/kiosk: a pickup number is displayed.
- The `created_at` timestamp on `kitchen_tickets` marks when the ticket
  entered this state. This is the starting point for wait time calculation.

**Real-world example:** At a busy Cambodian BBQ restaurant (ភោជនីយដ្ឋានសាច់
អាំង) near Riverside, a customer at Table 8 orders grilled beef skewers and
papaya salad. Payment succeeds and the order is created (PAY_BEFORE), or
the order is created immediately (PAY_AFTER). A kitchen ticket is created:

```
┌─────────────────────────────────┐
│  TKT-000042              NEW    │
│  Table 8 (តុ ៨)                │
│─────────────────────────────────│
│  2x Grilled Beef Skewers       │
│     សាច់គោអាំង                │
│  1x Papaya Salad                │
│     ញាំល្ហុង                   │
│  Note: extra spicy (ហឹរខ្លាំង) │
│─────────────────────────────────│
│  12:34 PM                       │
└─────────────────────────────────┘
```

The tablet beeps. The ticket sits in the "New" column until a cook taps it.

**Why it can't be removed:** Without NEW, the ticket would be created
directly as PREPARING — but nobody has acknowledged it yet. The kitchen
might be overwhelmed, on a break, or didn't hear the alert. NEW is the
"inbox" state that makes unacknowledged tickets visible. It's also essential
for wait time metrics — the time between NEW and PREPARING measures how
responsive the kitchen is.

**Typical duration:** Seconds to a few minutes in normal operation. During
a rush, tickets might sit in NEW for 5+ minutes — a signal to the merchant
that they need more kitchen staff.

---

### `PREPARING`

**Meaning:** A kitchen staff member has acknowledged the ticket and is
actively working on the order. Food preparation is in progress.

**Who sets it:** Kitchen staff (taps the ticket in the kitchen app to
acknowledge it).

**What happens:**
- The ticket moves from the "New" column to the "In Progress" (កំពុងរៀបចំ)
  column on the kitchen display board.
- `kitchen_tickets.started_at` is set to the current timestamp.
- Socket.io emits a `ticket:updated` event with the new status.
- The customer's status page (accessible via `order_token`) updates to show
  "Your order is being prepared" (ការបញ្ជាទិញរបស់អ្នកកំពុងរៀបចំ).
- A `kitchen_ticket_events` row is created:
  `{ from_status: 'NEW', to_status: 'PREPARING', changed_by: staff_user_id }`.

**Real-world example:** The BBQ cook sees TKT-000042 in the "New" column.
They tap it. The ticket slides to "In Progress." `started_at` = 12:36 PM.
The cook threads beef onto skewers and fires up the grill. Meanwhile, the
salad prep station handles the papaya salad.

**Why it can't be removed:** Without PREPARING, there would be no signal
that the kitchen has acknowledged the order. The ticket would go from NEW
directly to READY — but the customer needs to know "someone is making your
food" vs "nobody has looked at your order yet." The merchant also needs
this for operational awareness: "we have 8 tickets being prepared and 3
waiting" is actionable information.

**What it means for metrics:** The transition from NEW to PREPARING starts
the **prep time** clock. The transition from NEW to PREPARING also stops
the **wait time** clock. These two metrics measure different things:
- Wait time = kitchen responsiveness (staffing, workload)
- Prep time = cooking/assembly speed (recipe complexity, staff skill)

**Typical duration:** 5-30 minutes depending on the food (a drink takes
2 minutes, a BBQ platter takes 20 minutes).

---

### `READY`

**Meaning:** The food has been prepared and is ready for the customer to
pick up (stall/kiosk) or for the server to deliver to the table (dine-in).

**Who sets it:** Kitchen staff (taps "Ready" / "រួចរាល់" on the ticket in
the kitchen app).

**What happens:**
- The ticket moves from "In Progress" to the "Ready" (រួចរាល់) column on
  the kitchen display board.
- `kitchen_tickets.ready_at` is set to the current timestamp.
- Socket.io emits a `ticket:updated` event with status = READY.
- The customer's status page updates to "Your order is ready!"
  (ការបញ្ជាទិញរបស់អ្នករួចរាល់ហើយ!).
- For stall/kiosk: the pickup number may be displayed on a customer-facing
  screen or called out.
- For dine-in: the server is signaled to deliver to the table.
- A `kitchen_ticket_events` row is created:
  `{ from_status: 'PREPARING', to_status: 'READY', changed_by: staff_user_id }`.

**Real-world example (stall/kiosk):** At a bubble tea shop (ហាងតែគ្រាប់)
near TK Avenue, a customer ordered taro milk tea. The barista finishes
making it, seals the cup, and taps "Ready" on the tablet. The ticket moves
to the "Ready" column. The customer's phone (on the status page) shows
"Your order is ready — please pick up at the counter"
(ការបញ្ជាទិញរបស់អ្នករួចរាល់ — សូមយកនៅបញ្ជរ). The customer walks
up and grabs their drink.

**Real-world example (dine-in):** At the BBQ restaurant, the beef skewers
and papaya salad are plated. The cook taps "Ready." The ticket moves to
"Ready." A server sees "Table 8 — Ready" on the display, picks up the
plates, and walks them to Table 8.

**Why it can't be removed:** READY is the handoff point from kitchen to
customer/server. Without it, the ticket would go from PREPARING to
COMPLETED — but there's a meaningful interval where food sits on the pass
waiting to be picked up or delivered. This interval is the **pickup time**
metric, and it matters:
- Long pickup times at a stall = customers aren't checking their phones
  or the pickup screen needs to be more visible.
- Long pickup times at a restaurant = not enough servers, or the servers
  aren't watching the display.

**Typical duration:** 30 seconds to 5 minutes. Food sitting too long in
READY is a quality concern (gets cold, ice melts).

---

### `COMPLETED`

**Meaning:** The food has been picked up by the customer or delivered to
the table. The ticket's lifecycle is over. This is a terminal state.

**Who sets it:**
- Kitchen staff or server (taps "Complete" / "ចប់សព្វគ្រប់" on the ticket)
- System (auto-complete after a configurable timeout — e.g., 15 minutes
  after READY, the system assumes pickup happened)

**What happens:**
- The ticket disappears from the active kitchen display board (or moves
  to a "Completed" history section).
- `kitchen_tickets.completed_at` is set to the current timestamp.
- Socket.io emits a `ticket:updated` event with status = COMPLETED.
- The customer's status page may update to "Order completed — enjoy your
  meal!" (បញ្ជាទិញចប់សព្វគ្រប់ — រីករាយជាមួយអាហាររបស់អ្នក!).
- A `kitchen_ticket_events` row is created:
  `{ from_status: 'READY', to_status: 'COMPLETED', changed_by: staff_user_id }`.
- All timer metrics become available (wait time, prep time, pickup time,
  total time).

**Real-world example:** The customer at the bubble tea shop picks up their
taro milk tea. The staff taps "Complete." Ticket done. At the BBQ restaurant,
the server delivers the skewers and salad to Table 8, then taps "Complete"
on the tablet on their way back to the kitchen.

**Why it can't be removed:** COMPLETED is the clean terminal state that
confirms food delivery. Without it, tickets would stay in READY forever.
The merchant needs to see "12 orders completed today" in their dashboard.
The timer metrics need an end timestamp to calculate total time.

**Auto-complete behavior:** To prevent tickets from lingering in READY when
staff forget to tap "Complete," the system can auto-complete tickets after
a configurable delay (e.g., 15 minutes). This is a convenience feature
that prevents the kitchen board from accumulating stale tickets during
busy periods. Auto-completed tickets are tagged as system-completed in
`kitchen_ticket_events` (`changed_by = NULL`).

**Typical duration:** Permanent. Terminal state.

---

### `CANCELLED`

**Meaning:** The ticket has been cancelled. The kitchen should stop
preparing the food (if not already finished) or discard what was made.
This is a terminal state.

**Who sets it:**
- System (mirrors `orders.status = CANCELLED` — when an order is cancelled,
  the associated kitchen ticket is also cancelled)
- Merchant (cancels a ticket directly from the kitchen app or merchant
  portal — rare, but needed for operational flexibility)

**What happens:**
- The ticket is visually struck through or removed from the active kitchen
  board, depending on the UI design.
- Socket.io emits a `ticket:updated` event with status = CANCELLED.
- A `kitchen_ticket_events` row is created with the reason for cancellation.
- If the kitchen was already preparing the food, it's wasted — the
  merchant absorbs the cost. This is an operational decision, not a
  system decision.
- The customer's status page (if they still have it open) shows "Order
  cancelled" (ការបញ្ជាទិញត្រូវបានលុបចោល).

**Real-world example 1 (order cancelled before kitchen starts):** At a
kiosk, a customer places an order for a smoothie (PAY_BEFORE). The ABA
QR code is displayed. The customer changes their mind and taps "Cancel"
before scanning. Order → CANCELLED. If the ticket was already created
(e.g., for PAY_AFTER), it also → CANCELLED. The kitchen app shows a
visual cancellation notification so staff doesn't start making the smoothie.

**Real-world example 2 (merchant cancels mid-prep):** At a restaurant, a
customer orders grilled fish. The cook has already started preparing it
when the waiter informs the kitchen that the customer wants to change
their order. The merchant cancels the ticket from the portal. The ticket
→ CANCELLED. The fish prep is stopped (or if already on the grill, it's
written off as waste).

**Real-world example 3 (item unavailable):** A customer orders mango
sticky rice (បាយដំណើបស្វាយ). The kitchen discovers they're out of
mangoes. The merchant cancels the ticket and the order, then messages the
customer (via storefront notification): "Sorry, we're out of mangoes"
(សុំទោស ស្វាយអស់ហើយ). The customer can place a new order.

**Why it can't be removed:** Without CANCELLED, cancelled orders would
leave orphan tickets on the kitchen board — staff would start making food
nobody wants. CANCELLED provides the visual and operational signal to
stop work.

**Can CANCELLED happen from any state?** Yes — a ticket can be cancelled
whether it's NEW, PREPARING, or READY:
- NEW → CANCELLED: Kitchen hasn't started. No waste.
- PREPARING → CANCELLED: Kitchen was cooking. Food is wasted.
- READY → CANCELLED: Food is done but order cancelled. Food is wasted
  (rare — usually the merchant would just give the food to the customer
  anyway, Cambodian hospitality style).

COMPLETED → CANCELLED is invalid — if the customer already picked up
the food, the ticket is done.

**Typical duration:** Permanent. Terminal state.

---

## Part 2 — State machine

### Happy path (stall/kiosk)

```
NEW ──► PREPARING ──► READY ──► COMPLETED
     (staff taps)  (food done)  (customer picks up)
```

### Happy path (dine-in)

```
NEW ──► PREPARING ──► READY ──► COMPLETED
     (staff taps)  (food done)  (server delivers to table)
```

### Order cancelled before kitchen starts

```
NEW ──► CANCELLED
     (order cancelled / item unavailable)
```

### Order cancelled mid-preparation

```
NEW ──► PREPARING ──► CANCELLED
     (staff taps)  (order cancelled — food wasted)
```

### Order cancelled after food is ready (rare)

```
NEW ──► PREPARING ──► READY ──► CANCELLED
     (staff taps)  (food done)  (order cancelled — food wasted)
```

### Full state machine diagram

```
                                    ┌──────────┐
                                    │          │
NEW ──► PREPARING ──► READY ──► COMPLETED      │
 │         │            │          (terminal)   │
 │         │            │                       │
 ▼         ▼            ▼                       │
CANCELLED  CANCELLED   CANCELLED                │
(terminal) (terminal)  (terminal)               │
```

### Valid transitions (complete list)

| From | To | Trigger | Who |
|---|---|---|---|
| `NEW` | `PREPARING` | Kitchen staff acknowledges the ticket | Kitchen staff |
| `NEW` | `CANCELLED` | Order cancelled, item unavailable | System / Merchant |
| `PREPARING` | `READY` | Food is cooked and plated | Kitchen staff |
| `PREPARING` | `CANCELLED` | Order cancelled mid-prep | System / Merchant |
| `READY` | `COMPLETED` | Customer picks up / server delivers | Kitchen staff / System (auto) |
| `READY` | `CANCELLED` | Order cancelled after food is ready (rare) | System / Merchant |

### Invalid transitions (these should never happen)

- **COMPLETED → anything** — Terminal state. Food was delivered. Done.
- **CANCELLED → anything** — Terminal state. Ticket is dead.
- **PREPARING → NEW** — Can't un-acknowledge a ticket. Once you start, you
  either finish (READY) or cancel.
- **READY → PREPARING** — Food can't go back to being cooked. If something
  is wrong with the food, the merchant cancels this ticket and creates a
  new order (re-fire).
- **READY → NEW** — Same reason. No backward transitions in the kitchen
  workflow.
- **COMPLETED → CANCELLED** — If the customer already has the food, you
  can't cancel the ticket. A refund (future) is the mechanism for
  post-delivery issues.

---

## Part 3 — Timer metrics

Kitchen performance is measured by four timer metrics computed from
timestamp fields on `kitchen_tickets`. These are NOT stored as columns —
they are calculated at query time.

### The four metrics

| Metric | Formula | What it measures | Healthy range |
|---|---|---|---|
| **Wait time** | `started_at - created_at` | How long before kitchen acknowledged the ticket | < 2 min (stall), < 5 min (restaurant) |
| **Prep time** | `ready_at - started_at` | How long to cook/prepare the food | Varies by item: 2 min (drink) to 30 min (slow cook) |
| **Pickup time** | `completed_at - ready_at` | How long food sat at the pass waiting for pickup/delivery | < 2 min (stall), < 5 min (restaurant) |
| **Total time** | `completed_at - created_at` | End-to-end from ticket creation to customer receiving food | < 10 min (stall), < 30 min (restaurant) |

### Timestamp columns on kitchen_tickets

```sql
CREATE TABLE kitchen_tickets (
  ...
  started_at    TIMESTAMP(3),  -- set when PREPARING (wait time ends, prep time starts)
  ready_at      TIMESTAMP(3),  -- set when READY (prep time ends, pickup time starts)
  completed_at  TIMESTAMP(3),  -- set when COMPLETED (pickup time ends, total time ends)
  created_at    TIMESTAMP(3),  -- set on creation / NEW (all timers start)
  ...
);
```

### How metrics are computed in SQL

```sql
-- Average wait time for a tenant today
SELECT AVG(EXTRACT(EPOCH FROM (started_at - created_at))) AS avg_wait_seconds
FROM kitchen_tickets
WHERE tenant_id = $1
  AND status = 'COMPLETED'
  AND created_at >= CURRENT_DATE
  AND started_at IS NOT NULL;

-- Average prep time
SELECT AVG(EXTRACT(EPOCH FROM (ready_at - started_at))) AS avg_prep_seconds
FROM kitchen_tickets
WHERE tenant_id = $1
  AND status = 'COMPLETED'
  AND created_at >= CURRENT_DATE
  AND ready_at IS NOT NULL
  AND started_at IS NOT NULL;

-- Average pickup time
SELECT AVG(EXTRACT(EPOCH FROM (completed_at - ready_at))) AS avg_pickup_seconds
FROM kitchen_tickets
WHERE tenant_id = $1
  AND status = 'COMPLETED'
  AND created_at >= CURRENT_DATE
  AND completed_at IS NOT NULL
  AND ready_at IS NOT NULL;

-- Average total time
SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) AS avg_total_seconds
FROM kitchen_tickets
WHERE tenant_id = $1
  AND status = 'COMPLETED'
  AND created_at >= CURRENT_DATE
  AND completed_at IS NOT NULL;
```

### Why metrics are computed, not stored

- **Simplicity:** No trigger or application logic needed to maintain
  computed columns.
- **Correctness:** The values are always derived from the source of truth
  (timestamps), never stale.
- **Flexibility:** New metrics can be derived without schema changes (e.g.,
  "time spent in NEW before the cook who eventually prepared it was assigned"
  — if assignment tracking is added later).
- **Query cost:** These aggregations run over `kitchen_tickets` with a
  `(tenant_id, status)` index. For a single tenant's daily tickets
  (typically < 500 rows), the computation is negligible.

### Operational use of metrics

| Metric | Merchant insight | Action |
|---|---|---|
| High wait time | Kitchen is overwhelmed or understaffed | Add staff, adjust operating hours, limit concurrent orders |
| High prep time | Recipes are complex or staff is slow | Simplify menu, train staff, prep ingredients in advance |
| High pickup time (stall) | Customers aren't noticing their order is ready | Improve customer-facing display, add louder alert |
| High pickup time (restaurant) | Not enough servers or servers aren't watching the board | Add servers, improve kitchen-to-floor communication |
| High total time | Overall throughput is too slow | Identify which sub-metric (wait/prep/pickup) is the bottleneck |

---

## Part 4 — What's NOT in this enum (and why)

| Omitted value | What it would mean | Why we skip it |
|---|---|---|
| `ACKNOWLEDGED` | Staff saw the ticket but hasn't started cooking | Too fine-grained for MVP. In a typical stall, "saw it" and "started it" happen within seconds. PREPARING covers both. If a future need arises to separate "acknowledged but queued" from "actively cooking," this could be inserted between NEW and PREPARING. |
| `DELAYED` | Kitchen is behind and this ticket is pushed back | Not a status — it's an operational reality visible through wait time metrics. A "DELAYED" flag or priority system could be added without changing the core status enum. |
| `IN_QUEUE` | Ticket is in the kitchen queue, waiting its turn | Same as NEW. "In the queue" and "new" are the same state for MVP. A queue management system (priority, ordering) is a future feature. |
| `RE_FIRED` | Ticket was sent back and needs to be made again | Not a status — it's an event. A re-fire creates a new ticket (or resets the current ticket to NEW/PREPARING). The `kitchen_ticket_events` table captures the history. |
| `ON_HOLD` | Ticket is paused (e.g., customer asked to hold their order) | Not in MVP. Could be added as a state reachable from PREPARING, with a transition back to PREPARING when resumed. |
| `PARTIALLY_READY` | Some items on the ticket are ready, others aren't | Not applicable — XFOS creates one ticket per order. If the order has multiple items, "ready" means all items are ready. Future: if tickets are split per item/station, each sub-ticket would have its own status. |
| `SERVED` | Food has been placed on the customer's table | Merged into COMPLETED. For dine-in, COMPLETED means "delivered to table." Adding SERVED between READY and COMPLETED would add a step for every ticket that doesn't provide meaningful operational data at MVP. |

---

## Part 5 — Relationship to other enums and tables

### TicketStatus → OrderStatus (the handoff)

The kitchen ticket takes over where the order leaves off. The relationship
is 1:1 at MVP (one order = one kitchen ticket):

```
ORDER DOMAIN                    KITCHEN DOMAIN
────────────                    ──────────────
(order does not exist yet)       (not yet created)
SUBMITTED      ──────────────►  NEW
  │                              │
  │  (auto-synced from ticket)  PREPARING ──► order: PREPARING
  │                              │
  │                             READY     ──► order: READY
  │                              │
  │                             COMPLETED ──► order: COMPLETED
  │                             (terminal)
  └─► CANCELLED                 CANCELLED
      (terminal)                (terminal)
```

The kitchen ticket is created when the order reaches SUBMITTED (i.e., the
order record exists — for PAY_BEFORE, after payment; for PAY_AFTER,
immediately). From this point, the order auto-syncs its status from the
ticket: SUBMITTED → PREPARING → READY → COMPLETED.

**Cancellation mirror:** If an order is cancelled, the associated ticket
is also cancelled. But if a ticket is cancelled (e.g., kitchen discovered
item unavailable), the order should also be cancelled. This is a bidirectional
relationship that the application must enforce.

### TicketStatus → ServiceModel (display differences)

The `kitchen_tickets.service_model` column (snapshotted from the order)
affects how the ticket is displayed:

| Service model | Kitchen ticket shows | Customer notification |
|---|---|---|
| `STALL_KIOSK` | Ticket number + items | "Your order [number] is ready for pickup" |
| `DINE_IN_TABLE` | Table reference + items | "Your order is being served to your table" |

### TicketStatus → kitchen_ticket_events (audit trail)

Every status transition creates a row in `kitchen_ticket_events`:

```sql
-- Example sequence for TKT-000042:
{ from_status: NULL,        to_status: 'NEW',        changed_by: NULL,       created_at: '12:34' }
{ from_status: 'NEW',       to_status: 'PREPARING',  changed_by: 'cook_01', created_at: '12:36' }
{ from_status: 'PREPARING', to_status: 'READY',      changed_by: 'cook_01', created_at: '12:48' }
{ from_status: 'READY',     to_status: 'COMPLETED',  changed_by: 'serv_02', created_at: '12:50' }
```

`changed_by` references `users.id` and tells you which kitchen staff
member handled each transition. This is useful for:
- Performance tracking per staff member
- Accountability ("who marked this as ready?")
- Training insights ("cook_01 averages 12 min prep time, cook_02 averages
  18 min")

`from_status` and `to_status` are `TEXT` (not enum-typed) so the audit
trail survives if enum values are ever renamed or removed.

### TicketStatus → Socket.io events

Every status transition emits a Socket.io event to room
`tenant_{tenant_id}`:

| Event | Payload (key fields) | Subscribers |
|---|---|---|
| `ticket:created` | ticket_id, ticket_number, items, table_ref, status='NEW' | Kitchen app |
| `ticket:updated` | ticket_id, status, started_at/ready_at/completed_at | Kitchen app, storefront status page |

The kitchen app subscribes to these events to update the display board in
real time. The storefront status page subscribes to know when to show
"preparing" → "ready" → "completed" to the customer.

**Room isolation:** Events are scoped to `tenant_{tenant_id}`. A kitchen
tablet for tenant A never receives tickets for tenant B. This is enforced
by Socket.io room membership, not post-hoc filtering.

---

## Part 6 — Decision summary

### Question: Why 5 statuses and not 3 (NEW, COOKING, DONE)?

**Answer:** Timer metrics require 5 states. With only 3 states, you lose:
- **Wait time** (NEW → PREPARING gap) — collapses if you start at COOKING.
- **Pickup time** (READY → COMPLETED gap) — collapses if you end at DONE.
- **Cancellation tracking** — without CANCELLED, you can't distinguish
  "ticket never completed because of cancellation" from "ticket still in
  progress."

Each status represents a distinct operational moment that has different
actors, different timestamps, and different business meaning:

| Status | Actor | Moment | Metric boundary |
|---|---|---|---|
| NEW | System | Ticket appears on the board | Start of wait time |
| PREPARING | Kitchen staff | Staff starts cooking | End of wait time, start of prep time |
| READY | Kitchen staff | Food is done | End of prep time, start of pickup time |
| COMPLETED | Staff / System | Customer has the food | End of pickup time |
| CANCELLED | System / Merchant | Ticket is dead | N/A (metrics not applicable) |

### Question: Should the customer be able to see these statuses?

**Answer: Yes, selectively.** The storefront status page (accessible via
`order_token`) shows a simplified version:

| Ticket status | Customer sees (English) | Customer sees (Khmer) |
|---|---|---|
| `NEW` | "Order received" | "បានទទួលការបញ្ជាទិញ" |
| `PREPARING` | "Being prepared" | "កំពុងរៀបចំ" |
| `READY` | "Ready for pickup!" / "Being served" | "រួចរាល់សម្រាប់យក!" / "កំពុងដាក់ជូន" |
| `COMPLETED` | "Enjoy your meal!" | "រីករាយជាមួយអាហារ!" |
| `CANCELLED` | "Order cancelled" | "ការបញ្ជាទិញត្រូវបានលុបចោល" |

The customer sees a progress bar or step indicator, not raw status names.

### What we decided

- **Keep all 5 values.** NEW, PREPARING, READY, COMPLETED, and CANCELLED
  each correspond to a distinct operational moment and are required for
  timer metrics and accurate kitchen workflow.
- **Timer metrics are computed, not stored.** Four metrics (wait, prep,
  pickup, total) are derived from timestamp columns at query time.
- **CANCELLED is reachable from NEW, PREPARING, and READY.** But not from
  COMPLETED (food already delivered).
- **No backward transitions.** The kitchen workflow is strictly
  forward-moving. If food needs to be re-made, cancel the ticket and
  create a new order (re-fire).
- **Every transition is audited** via `kitchen_ticket_events` and broadcast
  via Socket.io.
- **Auto-complete is supported** as a system-triggered READY → COMPLETED
  transition after a configurable timeout, to prevent stale tickets on
  the board.
