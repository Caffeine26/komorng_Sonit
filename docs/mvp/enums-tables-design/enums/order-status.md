# OrderStatus — Design Discussion & Decision

**Date:** 2026-04-09 (revised 2026-04-24 — `CANCELLED` rows now carry a sibling reason enum)
**Status:** ✅ Redesigned — 5 values (payment removed, customer UI aligned)
**Affects:** `orders` table, `order_status_history` table
**Full discussion:** [`../order-status-redesign.md`](../order-status-redesign.md)
**Sibling enum (since 2026-04-24):** [`OrderCancellationReason`](order-cancellation-reason.md)
— populated on `orders.cancellation_reason` when `status = 'CANCELLED'`,
distinguishing customer-driven, kitchen-driven, system-driven, and
staff-error cancellations. The lifecycle enum stays at 5 values; the
operational metadata lives in the sibling column.

---

## The enum

```sql
CREATE TYPE "OrderStatus" AS ENUM (
  'SUBMITTED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED'
);
```

Each status maps 1:1 to a customer UI screen. Payment is NOT tracked here —
see `BillStatus` and `PaymentStatus`. The order record only exists AFTER
the payment gate (for PAY_BEFORE) or immediately (for PAY_AFTER).

---

## Part 1 — Each value explained in detail

### `SUBMITTED`

**Meaning:** The order exists. Kitchen tickets are created. This is the
first status of every order — the order record's existence IS the acceptance.

**Customer UI:** "You submitted the order"

**Who sets it:** System (default on creation).

**What happens:**
- For PAY_BEFORE: payment already succeeded before this order record was
  created. The cart → bill → payment → order flow ensures money is confirmed
  before the order exists.
- For PAY_AFTER: the order is created immediately when the customer taps
  "Place order." Payment happens later.
- Kitchen ticket(s) created with status `NEW`.
- Kitchen display shows new ticket with audible alert.
- Customer status page shows "Order submitted."

**Real-world example (PAY_BEFORE):** A customer at a bubble tea kiosk
(តង់ទឹកគ្រាប់ចៀន) scans the counter QR, adds a taro milk tea ($3.50),
pays via ABA QR. Payment succeeds → order record created (SUBMITTED) →
kitchen ticket (NEW) appears on the tablet. The barista starts making it.

**Real-world example (PAY_AFTER):** At a noodle stall (ហាងមី) on Street 63,
the customer scans the QR and orders kuy teav ($3.00). Since this stall
uses PAY_AFTER, the order is created immediately as SUBMITTED. Kitchen
tablet beeps. The cook starts boiling noodles. Payment happens when the
customer finishes eating.

**Why not "ACCEPTED":** The customer thinks in terms of "I submitted my
order," not "the restaurant accepted my order." The order's existence IS
the acceptance — no separate acknowledgment step needed.

**Typical duration:** Seconds to minutes (until kitchen staff taps the
ticket to start preparing).

---

### `PREPARING`

**Meaning:** The kitchen has started working on at least one item in this
order.

**Customer UI:** "We are preparing your order"

**Who sets it:** System (auto-synced from kitchen tickets). Kitchen staff
only updates the ticket — the order follows automatically.

**Sync logic:**
```
kitchen_ticket.status → PREPARING
    ↓
system checks: is order.status still SUBMITTED?
    yes → order.status = PREPARING
    → Socket.io pushes to customer: "We are preparing your order"
```

**What happens:**
- At least one kitchen ticket moved from NEW to PREPARING.
- The customer sees the status change in real time (Socket.io push).
- Other tickets for the same order may still be NEW (multi-station orders).

**Real-world example:** At a BBQ restaurant (សាច់អាំង), the customer ordered
grilled beef ($8) and iced tea ($2). Two kitchen tickets were created: one
for the grill station, one for the drink station. The drink station taps
their ticket first → ticket_2 = PREPARING → order moves to PREPARING.
The customer sees "We are preparing your order" even though the grill
station hasn't started yet.

**Why it's auto-synced, not manually set:** Kitchen staff should never have
to update two things (ticket AND order). They tap the ticket on the kitchen
display — that's it. The order status follows. This prevents sync bugs and
reduces kitchen workflow friction.

**Typical duration:** Minutes (cooking time). Depends on the food.

---

### `READY`

**Meaning:** All items in this order are ready for pickup or serving.

**Customer UI:** "Your order is ready!" (with push notification)

**Who sets it:** System (auto-synced when ALL kitchen tickets reach READY).

**Sync logic:**
```
kitchen_ticket.status → READY
    ↓
system checks: are ALL tickets for this order READY?
    yes → order.status = READY
    → push notification: "Your order is ready!"
    → Socket.io pushes to customer status page
```

**What happens:**
- All kitchen tickets for this order are READY.
- Customer receives a push notification (if enabled).
- The storefront status page updates to "Your order is ready!"
- For STALL_KIOSK: the order number is displayed on screen or called out.
- For DINE_IN_TABLE: the server knows to deliver to the table.

**Real-world example:** At the BBQ restaurant, the grill station finishes
the beef (ticket_1 = READY). The drink was already done (ticket_2 = READY).
Now ALL tickets are READY → order moves to READY. The customer's phone
buzzes: "Your order is ready!" The server brings everything to Table 5.

**Why READY is separate from COMPLETED:** "Ready" = food is done and
waiting. "Completed" = customer received it. The gap between READY and
COMPLETED is the **pickup time** — an important operational metric. If
food sits at READY for 10 minutes, something is wrong (slow pickup counter,
server didn't notice, customer left).

**Typical duration:** Seconds to minutes (until customer picks up or
server delivers).

---

### `COMPLETED`

**Meaning:** The customer received the food. Terminal success state.

**Customer UI:** "Order completed — enjoy!"

**Who sets it:**
- Kitchen staff taps "complete" (customer picked up food).
- Server marks as delivered (for dine-in table service).
- Auto-complete after N minutes of being in READY state (configurable).

**What happens:**
- All kitchen tickets also move to COMPLETED.
- The order disappears from active displays.
- The customer status page shows "Enjoy your meal!"
- Operational metrics are captured: total order time = `completed_at - created_at`.

**Real-world example:** The customer at the BBQ restaurant picks up their
food from the counter (STALL_KIOSK) or the server confirms delivery to
Table 5 (DINE_IN_TABLE). Staff taps "Complete" on the ticket → ticket
COMPLETED → order COMPLETED.

**Typical duration:** Terminal state.

---

### `CANCELLED`

**Meaning:** The order was cancelled before completion. Terminal failure state.

**Customer UI:** "Order cancelled"

**Who sets it:**
- Customer (cancels before kitchen starts — from SUBMITTED).
- Merchant (cancels from merchant portal — item out of stock, suspicious order).
- System (rare edge cases).

**What happens:**
- All associated kitchen tickets are also set to CANCELLED.
- The customer status page shows "Order cancelled."
- The order row stays in the database (soft-cancel via status).
- `order_status_history` records the cancellation with a reason.

**Cancellation rules by status:**

| Cancel from | Allowed? | Notes |
|---|---|---|
| `SUBMITTED` | Yes | Kitchen hasn't started. Clean cancel. |
| `PREPARING` | Yes, with merchant approval | Kitchen already started — food may be wasted. |
| `READY` | Rare, merchant decision | Food is done. Merchant decides to void or not. |
| `COMPLETED` | No | Terminal. Cannot undo. |

**Real-world example:** At a restaurant, a customer orders grilled squid
($8.00). The kitchen discovers they're out of squid. The owner opens the
merchant portal, taps "Cancel", enters reason: "អស់ស្តុក" (out of stock).
Order moves SUBMITTED → CANCELLED. The kitchen ticket is also cancelled.
If PAY_BEFORE and the customer already paid, a refund is needed (tracked
separately — known schema gap).

**Typical duration:** Terminal state.

---

## Part 2 — State machine

### Happy path

```
SUBMITTED ──► PREPARING ──► READY ──► COMPLETED
           (1st ticket     (all        (customer
            preparing)     tickets     picks up)
                           ready)
```

### Cancellation paths

```
SUBMITTED ──► CANCELLED   (customer cancels, merchant cancels)
PREPARING ──► CANCELLED   (merchant cancels — kitchen can't fulfill)
READY     ──► CANCELLED   (rare — merchant voids after food is ready)
```

### Full state machine diagram

```
SUBMITTED ──► PREPARING ──► READY ──► COMPLETED
    │              │           │
    └── CANCELLED ─┘           └── CANCELLED (rare)
```

### Valid transitions

| From | To | Trigger |
|---|---|---|
| `SUBMITTED` | `PREPARING` | First kitchen ticket moves to PREPARING |
| `SUBMITTED` | `CANCELLED` | Customer cancels, merchant cancels, system timeout |
| `PREPARING` | `READY` | All kitchen tickets reach READY |
| `PREPARING` | `CANCELLED` | Merchant cancels (kitchen can't fulfill) |
| `READY` | `COMPLETED` | Staff confirms pickup/delivery, or auto-timeout |
| `READY` | `CANCELLED` | Rare — merchant voids after food is ready |

### Invalid transitions

- COMPLETED → anything (terminal)
- CANCELLED → anything (terminal)
- READY → PREPARING (no backwards)
- PREPARING → SUBMITTED (no backwards)
- COMPLETED → CANCELLED (can't undo served food)

---

## Part 3 — How OrderStatus and TicketStatus work together

### Different audiences, same order

| | OrderStatus | TicketStatus |
|---|---|---|
| Audience | Customer | Kitchen staff |
| Display | Storefront status page | Kitchen display app |
| Granularity | Per order (all items) | Per ticket (per station/item group) |
| Who updates it | System (auto-synced from tickets) | Kitchen staff (tap to advance) |

### Single order, single ticket (bubble tea)

```
Time    Action                    order.status    ticket.status    Customer sees
─────   ─────────────────────     ────────────    ─────────────    ──────────────────────
10:00   Order created             SUBMITTED       NEW              "You submitted the order"
10:02   Cook starts               PREPARING       PREPARING        "We are preparing"
10:05   Drink ready               READY           READY            "Your order is ready!" 📱
10:06   Customer picks up         COMPLETED       COMPLETED        "Enjoy!"
```

### Single order, multiple tickets (noodle station + drink station)

```
Time    Action                    order.status    ticket_1         ticket_2
─────   ─────────────────────     ────────────    ────────         ────────
10:00   Order created             SUBMITTED       NEW              NEW
10:01   Drink station starts      PREPARING ←     NEW              PREPARING
                                  (first ticket)
10:02   Noodle station starts     PREPARING       PREPARING        PREPARING
10:03   Drinks done               PREPARING       PREPARING        READY
                                  (NOT all ready)
10:06   Noodles done              READY ←         READY            READY
                                  (ALL ready)
10:07   Customer picks up         COMPLETED       COMPLETED        COMPLETED
```

### The sync rules (backend auto-applies)

```
ticket → PREPARING?
  └── if order.status == SUBMITTED → order.status = PREPARING

ticket → READY?
  └── if ALL tickets for this order are READY → order.status = READY

ticket → COMPLETED?
  └── if ALL tickets for this order are COMPLETED → order.status = COMPLETED

ticket → CANCELLED?
  └── if ALL tickets for this order are CANCELLED → order.status = CANCELLED
```

### The full 4-enum picture

```
OrderStatus     SUBMITTED → PREPARING → READY → COMPLETED     customer sees this
                     │           ▲          ▲        │
                  (creates)   (auto)     (auto)   (auto)
                     │           │          │        │
                     ▼           │          │        ▼
TicketStatus        NEW → PREPARING →   READY → COMPLETED     kitchen sees this

BillStatus     OPEN → PARTIALLY_PAID → PAID                    money tracking
PaymentStatus  INITIATED → PENDING → SUCCEEDED / FAILED / ...  payment attempts
```

4 enums, 4 concerns, zero overlap.

---

## Part 4 — How payment works without PENDING_PAYMENT on the order

### PAY_BEFORE flow

```
Cart
  ├── STALL_KIOSK    → localStorage on the customer's device (no DB row)
  └── DINE_IN_TABLE  → carts row (one ACTIVE per session, shared across devices)
    │
    ▼
Bill created (OPEN) + Payment initiated (INITIATED → PENDING)
    │
    ▼
Payment succeeds → Payment (SUCCEEDED), Bill (PAID)
    │
    ▼
NOW creates: Order (SUBMITTED) + OrderItems + KitchenTicket (NEW)
    │         + BillOrders (links bill ↔ order)
    ▼
Dine-in: carts.status → CONVERTED      (kiosk: nothing to update — no row)
```

The order only exists AFTER payment. No PENDING_PAYMENT status needed.

### PAY_AFTER flow

```
Cart
  ├── STALL_KIOSK    → localStorage on the customer's device (no DB row)
  └── DINE_IN_TABLE  → carts row (one ACTIVE per session, shared across devices)
    │
    ▼
Order created (SUBMITTED) + OrderItems + KitchenTicket (NEW)
    │         + Session (if not already open)
    ▼
Dine-in: carts.status → CONVERTED      (kiosk: nothing to update — no row)
    :
    : (time passes, customer eats, maybe orders more)
    :
Customer taps "Pay"
    │
    ▼
Bill created + BillOrders + Payment → Bill (PAID)
    │
    ▼
Session → CLOSED
```

The order exists BEFORE payment. Payment is independent.

---

## Part 5 — What's NOT in this enum (and why)

| Omitted value | Why |
|---|---|
| `PENDING_PAYMENT` | Payment belongs on BillStatus + PaymentStatus. The bill tracks settlement state (OPEN → PARTIALLY_PAID → PAID), not payment attempts. The order record only exists after the payment gate. |
| `CONFIRMED` | Redundant — "confirmed" meant "payment succeeded." Now the order's existence IS confirmation. |
| `ACCEPTED` | Same moment as SUBMITTED. The order only exists when accepted. No separate acknowledgment. |
| `IN_PROGRESS` | Redundant with kitchen ticket PREPARING. Auto-synced as PREPARING instead. |
| `REFUNDED` | Refunds are a payment concern, not an order concern. Separate refund table planned. |
| `DRAFT` | That's what carts are for (dine-in: a `carts` row; kiosk: localStorage on the device). Orders only exist after checkout. |
| `ON_HOLD` | Not needed at MVP. Could be added for order batching or fraud review. |

---

## Part 6 — What changed from the original design

| Before (old) | After (new) | Why |
|---|---|---|
| `PENDING_PAYMENT` | *(removed)* | Payment tracked by BillStatus + PaymentStatus |
| `CONFIRMED` | *(removed)* | Order existence = confirmation |
| `SUBMITTED` (was terminal) | `SUBMITTED` (now initial) | The order's first status, not last |
| *(no kitchen tracking)* | `PREPARING` | Auto-synced from first kitchen ticket PREPARING |
| *(no kitchen tracking)* | `READY` | Auto-synced from all kitchen tickets READY |
| *(no kitchen tracking)* | `COMPLETED` | Auto-synced from all kitchen tickets COMPLETED |
| `CANCELLED` | `CANCELLED` | Same — terminal cancel state |

### Why the order now tracks kitchen milestones

The original design said "order lifecycle ends at SUBMITTED; kitchen ticket
takes over." This was architecturally clean but created a customer UX problem:
the customer status page had to query kitchen tickets directly and compute
display state. With the new design, the customer status page reads ONE column
(`orders.status`) and gets the current milestone. The sync happens server-side
automatically.

---

## Part 7 — Customer status page implementation

### Query

```sql
SELECT status, order_number, total_cents, currency, created_at
FROM orders WHERE order_token = 'abc123';
```

Simple. One query. No joins to kitchen tickets.

### Real-time via Socket.io

```
order.status changes → emit to room order_{order_token} → UI updates
```

### UI mapping

| `order.status` | Icon | Customer sees (EN) | Customer sees (KM) |
|---|---|---|---|
| `SUBMITTED` | ✅ | Your order has been submitted | ការបញ្ជាទិញរបស់អ្នកត្រូវបានដាក់ |
| `PREPARING` | 🍳 | We are preparing your order | យើងកំពុងរៀបចំការបញ្ជាទិញរបស់អ្នក |
| `READY` | 🔔 | Your order is ready! | ការបញ្ជាទិញរបស់អ្នករួចរាល់! |
| `COMPLETED` | 🎉 | Order completed — enjoy! | ការបញ្ជាទិញបានបញ្ចប់ — រីករាយ! |
| `CANCELLED` | ❌ | Order cancelled | ការបញ្ជាទិញត្រូវបានលុបចោល |

---

## Part 8 — Decision summary

### What we decided

- **5 values matching the customer UI.** Each status = one screen state.
  No translation layer needed.
- **Payment removed from OrderStatus.** `BillStatus` and `PaymentStatus`
  handle money. The order record only exists after the payment gate
  (PAY_BEFORE) or immediately (PAY_AFTER).
- **Order status auto-syncs from kitchen tickets.** Kitchen staff only
  updates tickets. The order follows automatically via backend event
  handlers. No double work.
- **SUBMITTED is the initial status** (not PENDING_PAYMENT). The order's
  existence IS the acceptance.
- **READY is a distinct status from COMPLETED.** The gap between them is
  the pickup time metric — an important operational KPI.
