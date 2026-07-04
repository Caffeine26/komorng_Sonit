# OrderStatus Redesign — Discussion & Decision

**Date:** 2026-04-09
**Status:** ✅ Decided — 5 values (redesigned from scratch)
**Affects:** `orders` table, `OrderStatus` enum, customer status page,
kitchen ticket sync logic, payment flow

---

## TL;DR

```sql
-- BEFORE (payment mixed into order status)
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'SUBMITTED', 'CANCELLED');

-- AFTER (pure order lifecycle, payment handled by BillStatus + PaymentStatus)
CREATE TYPE "OrderStatus" AS ENUM ('SUBMITTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
```

Each status maps 1:1 to a customer UI screen. No payment mixing. No
overlap with kitchen ticket status. System auto-syncs order status from
kitchen ticket state changes.

---

## Part 1 — Why the original design was wrong

The original `OrderStatus` mixed two concerns:

```
PENDING_PAYMENT → CONFIRMED → SUBMITTED → CANCELLED
      ↑               ↑           ↑
   payment         payment      order
   concern         concern      concern
```

- `PENDING_PAYMENT` = waiting for money → this is a **bill/payment** concern
- `CONFIRMED` = payment succeeded → this is a **bill/payment** concern
- `SUBMITTED` = sent to kitchen → this is an **order** concern

The schema already has `BillStatus` (OPEN → PARTIALLY_PAID → PAID) and
`PaymentStatus` (INITIATED → PENDING → SUCCEEDED) handling the money side.
Having `PENDING_PAYMENT` on the order was redundant.

### The key insight

> The order record should only exist when it's already accepted.
> Before that, it's just a cart.

For PAY_BEFORE: the customer pays first. If payment succeeds → order is
created. If payment fails → no order. The order never sits in a
"waiting for payment" state.

For PAY_AFTER: the customer submits → order is created immediately. Payment
happens later when the customer requests the bill.

In both cases, the moment the order record exists in the database, it's
already accepted. There's no intermediate "submitted but not yet accepted"
state. The payment gate happens **before** the order is born, not after.

---

## Part 2 — The redesigned statuses

```sql
CREATE TYPE "OrderStatus" AS ENUM (
  'SUBMITTED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED'
);
```

### `SUBMITTED`

**Meaning:** The order exists. The kitchen is queued. This is the first
status of every order.

**Customer UI:** "You submitted the order"

**Trigger:**
- PAY_BEFORE: payment succeeds → order record created → status = SUBMITTED
- PAY_AFTER: customer taps "Place order" → order record created → status = SUBMITTED

**What happens:** Kitchen ticket(s) are created with status = NEW. The
kitchen display shows the new ticket with an audible alert. The customer
status page shows "Order submitted."

**Why not "ACCEPTED":** The customer thinks in terms of "I submitted my
order," not "the restaurant accepted my order." The order's existence IS
the acceptance — no separate acknowledgment step needed.

### `PREPARING`

**Meaning:** The kitchen has started working on at least one item in this
order.

**Customer UI:** "We are preparing your order"

**Trigger:** System auto-updates when the **first** kitchen ticket for this
order moves from NEW to PREPARING. No manual update needed on the order
itself — the kitchen staff only taps the ticket.

**Sync logic:**
```
kitchen_ticket.status → PREPARING
    ↓
system checks: order.status == SUBMITTED?
    yes → order.status = PREPARING
    → Socket.io pushes to customer status page
```

### `READY`

**Meaning:** All items in this order are ready for pickup or serving.

**Customer UI:** "Your order is ready!" (with push notification)

**Trigger:** System auto-updates when **ALL** kitchen tickets for this
order reach READY.

**Sync logic:**
```
kitchen_ticket.status → READY
    ↓
system checks: are ALL tickets for this order READY?
    yes → order.status = READY
    → push notification to customer: "Your order is ready!"
    → Socket.io pushes to customer status page
```

**Why this is a separate status from COMPLETED:** "Ready" means the food
is done and waiting. "Completed" means the customer picked it up. The gap
between READY and COMPLETED is the **pickup time** — an important metric
for stalls ("food sits for 5 minutes on average before pickup").

### `COMPLETED`

**Meaning:** The customer received the food. Terminal state.

**Customer UI:** "Order completed — enjoy!"

**Trigger:** Kitchen staff taps "complete" on the ticket (customer picked
up), or auto-complete after N minutes of being in READY state.

### `CANCELLED`

**Meaning:** The order was cancelled before completion. Terminal state.

**Customer UI:** "Order cancelled"

**Trigger:**
- Customer cancels (before kitchen starts — SUBMITTED or PREPARING)
- Merchant cancels (kitchen can't fulfill — out of ingredients, etc.)
- System cancels (timeout, error)

**Cancellation rules:**
- From SUBMITTED: always allowed
- From PREPARING: allowed but may require merchant approval (food already started)
- From READY: not recommended (food is done) — merchant decides
- From COMPLETED: not possible (terminal)

---

## Part 3 — How OrderStatus and TicketStatus work together

### Different audiences, same order

```
OrderStatus     = what the CUSTOMER sees (storefront status page)
TicketStatus    = what the KITCHEN sees (kitchen display app)
```

| | OrderStatus | TicketStatus |
|---|---|---|
| Audience | Customer | Kitchen staff |
| Display | Storefront status page | Kitchen display app |
| Granularity | Per order (all items) | Per ticket (per station/item group) |
| Who updates it | System (auto-synced from tickets) | Kitchen staff (tap to advance) |
| Payment awareness | No (order only exists after payment gate) | No (ticket only exists after order) |

### Single order, single ticket (simple case — bubble tea)

```
Time    Action                    order.status    ticket.status    Customer sees
─────   ─────────────────────     ────────────    ─────────────    ──────────────────────
10:00   Order created             SUBMITTED       NEW              "You submitted the order"
10:02   Cook starts               PREPARING       PREPARING        "We are preparing"
10:05   Drink ready               READY           READY            "Your order is ready!" 📱
10:06   Customer picks up         COMPLETED       COMPLETED        "Enjoy!"
```

### Single order, multiple tickets (restaurant — noodle station + drink station)

```
Time    Action                    order.status    ticket_1         ticket_2
─────   ─────────────────────     ────────────    ────────         ────────
10:00   Order created             SUBMITTED       NEW              NEW
10:01   Drink station starts      PREPARING ←     NEW              PREPARING
                                  (first ticket
                                   preparing)
10:02   Noodle station starts     PREPARING       PREPARING        PREPARING
10:03   Drinks done               PREPARING       PREPARING        READY
                                  (NOT all ready)
10:06   Noodles done              READY ←         READY            READY
                                  (ALL ready)
10:07   Customer picks up         COMPLETED       COMPLETED        COMPLETED
```

**Key rules:**
- Order moves to PREPARING when the **first** ticket starts preparing
- Order moves to READY when **all** tickets are ready
- Order moves to COMPLETED when staff confirms pickup/delivery

### The sync is automatic — kitchen staff only touches tickets

```
Kitchen staff taps ticket
    │
    ▼
ticket.status changes
    │
    ▼
Backend event handler:
    │
    ├── ticket → PREPARING?
    │     └── if order.status == SUBMITTED → order.status = PREPARING
    │
    ├── ticket → READY?
    │     └── if ALL tickets for this order are READY → order.status = READY
    │
    ├── ticket → COMPLETED?
    │     └── if ALL tickets for this order are COMPLETED → order.status = COMPLETED
    │
    └── ticket → CANCELLED?
          └── if ALL tickets for this order are CANCELLED → order.status = CANCELLED

Each order.status change → Socket.io emit to customer status page
```

---

## Part 4 — How payment works WITHOUT payment status on the order

### PAY_BEFORE flow (bubble tea kiosk — STALL_KIOSK + PAY_BEFORE)

```
Customer:  picks items in cart (localStorage — kiosk has no DB cart)
              │
              ▼
           taps "Place Order & Pay"
              │
              ▼
Backend:   creates Bill (OPEN) + Payment (INITIATED)
              │
              ▼
           payment gateway processes (ABA QR, cash, etc.)
              │
              ▼
           payment succeeds → Payment (SUCCEEDED), Bill (PAID)
              │
              ▼
           NOW creates: Order (SUBMITTED) + OrderItems + KitchenTicket (NEW)
              │         + BillOrders (links bill ↔ order)
              ▼
Kitchen:   sees new ticket → starts preparing
```

**The order only exists AFTER payment.** No PENDING_PAYMENT status needed.
If payment fails → no order. Customer retries from the localStorage cart.
(For `DINE_IN_TABLE + PAY_BEFORE` the same flow applies but the cart is a
shared `carts` row; on payment success it transitions ACTIVE → CONVERTED.)

### PAY_AFTER flow (noodle stall — STALL_KIOSK + PAY_AFTER)

```
Customer:  picks items in cart (localStorage — kiosk has no DB cart)
              │
              ▼
           taps "Place Order"
              │
              ▼
Backend:   creates: Order (SUBMITTED) + OrderItems + KitchenTicket (NEW)
              │     + Session (if not already open)
              ▼
              ▼
Kitchen:   sees new ticket → starts preparing
              :
              : (time passes, customer eats, maybe orders more)
              :
Customer:  taps "Pay" / "Close tab"
              │
              ▼
Backend:   creates Bill (OPEN) + BillOrders (links all orders in session)
              │
              ▼
           payment → Bill (PAID)
              │
              ▼
           Session → CLOSED
```

**The order exists BEFORE payment.** Payment happens independently when
the customer is done. The order lifecycle (SUBMITTED → PREPARING → READY →
COMPLETED) runs entirely without touching payment.

### The full picture — all 4 status enums with their owner

```
OrderStatus     SUBMITTED → PREPARING → READY → COMPLETED     customer sees this
                     │           ▲          ▲        │
                  (creates)   (auto)     (auto)   (auto)
                     │           │          │        │
                     ▼           │          │        ▼
TicketStatus        NEW → PREPARING →   READY → COMPLETED     kitchen sees this

BillStatus     OPEN → PARTIALLY_PAID → PAID                    money tracking
PaymentStatus  INITIATED → PENDING → SUCCEEDED / FAILED / CANCELLED / EXPIRED   payment attempts
```

4 enums, 4 concerns, zero overlap:
- **OrderStatus** = customer-facing order milestones
- **TicketStatus** = kitchen-internal preparation steps
- **BillStatus** = is the bill paid?
- **PaymentStatus** = did this specific payment attempt succeed?

---

## Part 5 — State machine

```
SUBMITTED ──► PREPARING ──► READY ──► COMPLETED
    │              │           │
    └──► CANCELLED ┘           └──► CANCELLED (rare — food was ready)
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
- READY → PREPARING (can't go backwards)
- PREPARING → SUBMITTED (can't go backwards)

---

## Part 6 — What was removed and why

| Removed | Why | Replaced by |
|---|---|---|
| `PENDING_PAYMENT` | Payment belongs on BillStatus + PaymentStatus, not orders | `BillStatus.OPEN → PARTIALLY_PAID → PAID` |
| `CONFIRMED` | Redundant — "confirmed" meant "payment succeeded." Now payment is separate. The order's existence IS confirmation. | Order only created after payment (PAY_BEFORE) or immediately (PAY_AFTER) |
| Original `SUBMITTED` | In the old design, SUBMITTED meant "sent to kitchen after payment." Now SUBMITTED is the first status = order exists. | `SUBMITTED` (same name, different meaning — now the initial state) |

---

## Part 7 — Customer status page implementation

### Simple query — no joins needed

```sql
SELECT status, order_number, total_cents, currency, created_at
FROM orders
WHERE order_token = 'abc123';
```

The `order_token` is the unguessable public token embedded in the
customer's status page URL: `xfos.com/order/abc123`.

### Real-time updates via Socket.io

```
Customer opens status page → joins Socket.io room: order_{order_token}

Backend (on order.status change):
  io.to(`order_${order_token}`).emit('order:status', {
    status: 'PREPARING',
    updatedAt: '2026-04-09T10:02:00Z'
  });

Frontend:
  socket.on('order:status', ({ status }) => {
    updateStatusUI(status);
    if (status === 'READY') showPushNotification("Your order is ready!");
  });
```

### UI status mapping

| `order.status` | Icon | Title (EN) | Title (KM) |
|---|---|---|---|
| `SUBMITTED` | ✅ | Your order has been submitted | ការបញ្ជាទិញរបស់អ្នកត្រូវបានដាក់ |
| `PREPARING` | 🍳 | We are preparing your order | យើងកំពុងរៀបចំការបញ្ជាទិញរបស់អ្នក |
| `READY` | 🔔 | Your order is ready! | ការបញ្ជាទិញរបស់អ្នករួចរាល់! |
| `COMPLETED` | 🎉 | Order completed — enjoy! | ការបញ្ជាទិញបានបញ្ចប់ — រីករាយ! |
| `CANCELLED` | ❌ | Order cancelled | ការបញ្ជាទិញត្រូវបានលុបចោល |

---

## Part 8 — Schema changes

### OrderStatus enum

```sql
-- BEFORE
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'SUBMITTED', 'CANCELLED');

-- AFTER
CREATE TYPE "OrderStatus" AS ENUM ('SUBMITTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
```

### `orders` table changes

```sql
-- status default changes
status "OrderStatus" NOT NULL DEFAULT 'SUBMITTED'  -- was 'PENDING_PAYMENT'
```

The `pay_timing` column on `orders` remains — it tells the backend whether
to create the order immediately (PAY_AFTER) or wait for payment (PAY_BEFORE).
But it no longer determines the initial order status — the initial status is
always SUBMITTED (because the order only exists after the payment gate).

---

## Part 9 — Files affected

| File | Change |
|---|---|
| `docs/discussions/tables/postgresql-schema.md` | OrderStatus enum values, orders.status default |
| `docs/discussions/enums/order-status.md` | Full rewrite needed (was written for old 4-value design) |
| `docs/discussions/tables/orders.md` | Status column description needs update |
| `docs/discussions/servicemodel-and-paytiming.md` | References to PENDING_PAYMENT and CONFIRMED need update |
| `docs/discussions/discussion_and_decision.md` | New entry |
