# ServiceModel × PayTiming — Design Decision & Complete Walkthrough

**Date:** 2026-04-09
**Status:** ✅ Finalized
**Affects:** `tenant_settings`, `orders`, `order_sessions`, `bills`,
`bill_orders`, `kitchen_tickets`, `payments`

---

## TL;DR

Two enums, four combinations, every food business covered.

```sql
CREATE TYPE "ServiceModel" AS ENUM ('STALL_KIOSK', 'DINE_IN_TABLE');
CREATE TYPE "PayTiming"    AS ENUM ('PAY_BEFORE', 'PAY_AFTER');
```

| ServiceModel | PayTiming | Session? | Bill grouping | Cart storage | Real example |
|---|---|---|---|---|---|
| `STALL_KIOSK` | `PAY_BEFORE` | No | 1 order = 1 bill | `localStorage` (no DB cart) | Bubble tea, coffee kiosk |
| `STALL_KIOSK` | `PAY_AFTER` | Yes | N orders = 1 bill | `localStorage` (no DB cart) | Noodle stall, bar tab |
| `DINE_IN_TABLE` | `PAY_BEFORE` | Yes (table) | 1 order = 1 bill | **DB cart** (one shared per session) | Food court with tables |
| `DINE_IN_TABLE` | `PAY_AFTER` | Yes (table) | N orders = 1 bill | **DB cart** (one shared per session) | Traditional restaurant |

**Cart-storage policy (decided 2026-04-24):** server-persisted `carts` /
`cart_items` rows are written **only for `DINE_IN_TABLE` sessions**.
Stall/kiosk customers build their basket in browser `localStorage` and
post it directly to the orders API on "Place Order" — no `carts` row
ever exists. Within a dine-in session there is at most one ACTIVE cart
at a time (Option A — shared per-session cart, enforced by partial
unique index). See [`tables/carts.md`](tables/carts.md) for detail.

---

## Part 1 — The problem that led to this design

### Original enums (before simplification)

```sql
-- 3 service models
CREATE TYPE "ServiceModel" AS ENUM ('STALL_KIOSK', 'DINE_IN_TABLE', 'STALL_OPEN_TAB');

-- 3 pay timings
CREATE TYPE "PayTiming" AS ENUM ('PAY_BEFORE_FULFILLMENT', 'PAY_AFTER_SERVICE', 'PAY_ON_SESSION_CLOSE');
```

### The question that started the discussion

> For the majority of kiosks, they can accept both pay timing — either is
> fine. What is the best design?

Real-world observation: a bubble tea shop (pay before) and a noodle stall
(pay after) are both kiosks. The same stall might even handle both —
regular customers eat first and pay after; walk-ups pay at the counter.

### The scenario that broke the old model

A customer at a **pay-after** noodle stall places a second order while
waiting for the first:

```
1. Customer orders bubble tea ($3.00) → kitchen starts
2. While waiting, customer orders donut ($2.00) → kitchen starts
3. Customer receives both items
4. Customer expects to pay $5.00 ONCE
```

Under the old definition, `STALL_KIOSK` was "1 order = 1 bill, always."
This customer would see **two separate bills** and have to pay twice. Bad UX.

Grouping multiple orders into one bill requires a **session**. But a kiosk
with no table running a session is... exactly what `STALL_OPEN_TAB` was
designed for.

### The insight

`STALL_KIOSK + PAY_AFTER` naturally requires session behavior, making it
functionally identical to `STALL_OPEN_TAB`:

```
STALL_KIOSK + pay before  =  no session, 1 order = 1 bill
STALL_KIOSK + pay after   =  needs session — IS the same as STALL_OPEN_TAB
DINE_IN_TABLE              =  session anchored to a table
STALL_OPEN_TAB             =  session without a table = STALL_KIOSK + pay after
```

The three service models weren't independent — they overlapped. The real
distinguishing axis is **physical context** (is there a table?), not
session behavior. Session behavior is **derived from PayTiming**.

Similarly, `PAY_AFTER_SERVICE` and `PAY_ON_SESSION_CLOSE` are the same
backend logic ("find all orders in session → sum → create bill → present
payment") with different button labels ("Request bill" vs "Close tab").
That's a UI copy concern, not a schema concern.

### What was removed and why

| Removed value | Reason |
|---|---|
| `STALL_OPEN_TAB` | Identical to `STALL_KIOSK` + `PAY_AFTER` |
| `PAY_BEFORE_FULFILLMENT` | Renamed to shorter `PAY_BEFORE` |
| `PAY_AFTER_SERVICE` | Merged into `PAY_AFTER` — same backend logic |
| `PAY_ON_SESSION_CLOSE` | Merged into `PAY_AFTER` — same backend logic, different button label |

---

## Part 2 — The two axes explained

### Axis 1: ServiceModel — "Is there a physical table?"

`ServiceModel` answers ONE question: is the customer anchored to a
numbered table?

| Value | Physical context | QR type | Kitchen ticket shows | Merchant portal view |
|---|---|---|---|---|
| `STALL_KIOSK` | No table. Customer stands, walks, or sits informally. | `STOREFRONT` (optional `label` for counter/pickup point) | Pickup number or counter label | Order queue (list) |
| `DINE_IN_TABLE` | Customer at a specific, numbered table. | `TABLE` (QR on the table) | "Table 5" | Table map (occupied / empty) |

### Axis 2: PayTiming — "When does money change hands?"

`PayTiming` answers ONE question: does the customer pay before or after
the kitchen starts working?

| Value | When the customer pays | Order initial status | Session created? |
|---|---|---|---|
| `PAY_BEFORE` | Immediately after placing the order, BEFORE the kitchen starts. Payment must succeed for the order to be created. | `SUBMITTED` (order only exists after payment succeeds) | Only if `DINE_IN_TABLE` (for table tracking) |
| `PAY_AFTER` | After all food is received. Customer requests the bill, then pays. | `SUBMITTED` (order created immediately) | Always — orders accumulate into one bill |

### How they combine

```
                     PAY_BEFORE                       PAY_AFTER
                ┌─────────────────────┐     ┌─────────────────────────┐
 STALL_KIOSK    │ No session          │     │ Session (short tab)     │
                │ 1 order = 1 bill    │     │ N orders = 1 bill       │
                │                     │     │                         │
                │ ☕ Bubble tea shop   │     │ 🍜 Noodle stall         │
                │ ☕ Brown Coffee      │     │ 🍺 Bar tab              │
                │                     │     │ 🍺 Beer garden           │
                └─────────────────────┘     └─────────────────────────┘
                ┌─────────────────────┐     ┌─────────────────────────┐
 DINE_IN_TABLE  │ Session (table)     │     │ Session (table)         │
                │ N orders = 1 bill   │     │ N orders = 1 bill       │
                │                     │     │                         │
                │ 🍔 Food court       │     │ 🥘 Restaurant           │
                │    with tables      │     │ 🍖 BBQ / hotpot         │
                │ 🍕 Fast casual      │     │ 🥗 Sit-down café        │
                └─────────────────────┘     └─────────────────────────┘
```

### Session auto-creation rules (derived, not configured)

```
if PAY_BEFORE:
    STALL_KIOSK   → NO session. 1 order, 1 bill, done.
    DINE_IN_TABLE → session created (for table tracking), but each order is paid immediately.

if PAY_AFTER:
    STALL_KIOSK   → session auto-created. Orders accumulate into one bill.
    DINE_IN_TABLE → session created (anchored to table). Orders accumulate into one bill.
```

Sessions have no timer-based expiry. They close when the bill is paid, the merchant closes them, or a platform-wide background cleanup job closes abandoned sessions after 24 hours.

---

## Part 3 — Complete scenario walkthroughs

### Scenario A — Bubble tea kiosk (STALL_KIOSK + PAY_BEFORE)

**Setup:** `tenant_settings.service_model = STALL_KIOSK`,
`tenant_settings.pay_timing = PAY_BEFORE`

**Story:** Customer walks up to the bubble tea shop, scans the QR code on
the counter, orders one taro milk tea, pays with ABA QR, waits, picks up.

```
Step 1 │ Customer scans STOREFRONT QR
       │ → Storefront opens, shows menu
       │
Step 2 │ Customer picks: Taro Milk Tea ($3.50)
       │ → Cart state in localStorage (no DB cart at MVP)
       │
Step 3 │ Customer taps "Place Order"
       │ → Backend creates:
       │     orders:      { id: order_001, session_id: NULL, status: SUBMITTED,
       │                    pay_timing: PAY_BEFORE, total_cents: 350 }
       │     order_items: { order_id: order_001, item_name: "Taro Milk Tea",
       │                    quantity: 1, unit_price_cents: 350, line_total_cents: 350 }
       │
       │   ⚠ NO session created. NO kitchen ticket yet. Kitchen is waiting for payment.
       │
Step 4 │ Customer pays via ABA QR ($3.50)
       │ → Backend creates:
       │     bills:       { id: bill_001, session_id: NULL, bill_number: "BILL-000001",
       │                    total_cents: 350, status: OPEN }
       │     bill_orders: { bill_id: bill_001, order_id: order_001 }
       │     payments:    { id: pay_001, bill_id: bill_001, method: ABA_QR,
       │                    amount_cents: 350, status: INITIATED }
       │
Step 5 │ ABA webhook confirms payment
       │ → Backend updates:
       │     payments.status     → SUCCEEDED, confirmed_at → now
       │     bills.status        → PAID, paid_at → now
       │     orders.status       → SUBMITTED
       │ → Backend creates:
       │     kitchen_tickets: { id: tkt_001, order_id: order_001,
       │                        ticket_number: "TKT-000001", status: NEW }
       │ → Socket.io emits to room tenant_{id}: new ticket
       │
Step 6 │ Kitchen sees ticket, taps it
       │     kitchen_tickets.status → PREPARING, started_at → now
       │
Step 7 │ Kitchen finishes, taps "Ready"
       │     kitchen_tickets.status → READY, ready_at → now
       │ → Storefront status page updates: "Your order is ready!"
       │
Step 8 │ Customer picks up. Kitchen taps "Complete"
       │     kitchen_tickets.status → COMPLETED, completed_at → now
       │
       │ ✅ DONE. No session. 1 order → 1 bill → 1 payment → 1 ticket.
```

**What if they also want a donut?** They scan the QR again (or the page is
still open), place a NEW order, pay again. Two completely separate transactions.
This is how every coffee shop works — no friction.

**Final DB state:**
```
(no session)
  ├── order_001: Taro Milk Tea $3.50 → bill_001 → payment via ABA_QR ✅
  └── order_002: Donut $2.00         → bill_002 → payment via CASH ✅
```

---

### Scenario B — Noodle stall (STALL_KIOSK + PAY_AFTER)

**Setup:** `tenant_settings.service_model = STALL_KIOSK`,
`tenant_settings.pay_timing = PAY_AFTER`

**Story:** Customer sits at an informal bench, scans QR, orders noodle soup.
While eating, decides to add an iced coffee. Pays for everything at the end.

```
Step 1 │ Customer scans STOREFRONT QR
       │ → Storefront opens, shows menu
       │
Step 2 │ Customer picks: Beef Noodle Soup ($3.50)
       │ → Cart state in localStorage (no DB cart — kiosk policy)
       │ → Taps "Place Order"
       │
Step 3 │ Backend creates (PAY_AFTER — no payment required, no cart row):
       │     order_sessions: { id: sess_001, status: ACTIVE }
       │     orders:         { id: order_001, session_id: sess_001, status: SUBMITTED,
       │                       pay_timing: PAY_AFTER, total_cents: 350 }
       │     order_items:    { order_id: order_001, item_name: "Beef Noodle Soup",
       │                       quantity: 1, line_total_cents: 350 }
       │     kitchen_tickets: { id: tkt_001, order_id: order_001, status: NEW }
       │
       │   ✅ Session auto-created (PAY_AFTER + STALL_KIOSK triggers session).
       │   ✅ Kitchen ticket created IMMEDIATELY (no payment gate).
       │   ✅ The storefront remembers sess_001 in localStorage for this device.
       │
Step 4 │ Kitchen prepares → serves soup. Ticket: NEW → PREPARING → READY → COMPLETED.
       │
Step 5 │ Customer eats... decides to add an iced coffee ($2.00)
       │ → Taps "Add order" on the same storefront page (session is still ACTIVE)
       │
Step 6 │ Backend creates (SAME session):
       │     orders:         { id: order_002, session_id: sess_001, status: SUBMITTED,
       │                       pay_timing: PAY_AFTER, total_cents: 200 }
       │     order_items:    { order_id: order_002, item_name: "Iced Coffee",
       │                       quantity: 1, line_total_cents: 200 }
       │     kitchen_tickets: { id: tkt_002, order_id: order_002, status: NEW }
       │
       │   ✅ Second order linked to the SAME session (sess_001).
       │
Step 7 │ Kitchen prepares → serves coffee. Ticket: NEW → PREPARING → READY → COMPLETED.
       │
Step 8 │ Customer taps "Pay" / "I'm done"
       │ → Backend generates the bill in ONE transaction:
       │
       │   -- Sum all orders in this session
       │   SELECT SUM(total_cents) FROM orders
       │     WHERE session_id = 'sess_001' AND status != 'CANCELLED';
       │   -- Result: 350 + 200 = 550
       │
       │   bills:       { id: bill_001, session_id: sess_001,
       │                  bill_number: "BILL-000001", total_cents: 550, status: OPEN }
       │   bill_orders: { bill_id: bill_001, order_id: order_001 }  ← links order 1
       │                { bill_id: bill_001, order_id: order_002 }  ← links order 2
       │
Step 9 │ Customer pays $5.50 (cash)
       │     payments: { bill_id: bill_001, method: CASH, amount_cents: 550,
       │                 status: SUCCEEDED }
       │     bills.status        → PAID, paid_at → now
       │     order_sessions.status → CLOSED, closed_at → now
       │
       │ ✅ DONE. 1 session → 2 orders → 1 bill → 1 payment.
```

**Final DB state:**
```
order_sessions
  └─ sess_001 (CLOSED)
       ├── orders
       │     ├── order_001: Beef Noodle Soup  $3.50  (SUBMITTED)
       │     └── order_002: Iced Coffee       $2.00  (SUBMITTED)
       └── bills
             └── bill_001: $5.50 (PAID)
                   ├── bill_orders → order_001
                   ├── bill_orders → order_002
                   └── payments
                         └── pay_001: $5.50 CASH (SUCCEEDED)
```

**This is also how a bar tab works.** Replace "noodle stall" with "bar",
"noodle soup" with "beer", and the data flow is identical. No separate
`STALL_OPEN_TAB` model needed.

---

### Scenario C — Food court with tables (DINE_IN_TABLE + PAY_BEFORE)

**Setup:** `tenant_settings.service_model = DINE_IN_TABLE`,
`tenant_settings.pay_timing = PAY_BEFORE`

**Story:** Customer enters a food court, gets Table 12. Scans the QR on the
table, orders, pays at the counter. Food is delivered to the table (or
number is called on screen).

```
Step 1 │ Customer scans TABLE QR on Table 12
       │ → QR encodes: tenant_id + table_ref = "12"
       │ → Storefront opens with "Table 12" pre-selected
       │
Step 2 │ Customer picks Pad Thai ($5.00) + Spring Rolls ($3.00)
       │ → Backend creates the dine-in session and a shared cart on first add:
       │     order_sessions: { sess_001, qr_context_id: qr_table12,
       │                       table_ref: "12", status: ACTIVE }
       │     carts:          { cart_001, session_id: sess_001, status: ACTIVE }
       │     cart_items:     { cart_001, "Pad Thai", qty: 1, unit_price: 500 }
       │                     { cart_001, "Spring Rolls", qty: 1, unit_price: 300 }
       │
       │   ✅ The cart is shared — if a second device at Table 12 scans the same
       │   QR, it reads/writes cart_001 (one ACTIVE cart per session).
       │
       │ → Customer taps "Submit Order"
       │
Step 3 │ Backend converts the cart and creates the order:
       │     carts:          { cart_001 → CONVERTED }
       │     orders:         { id: order_001, session_id: sess_001, status: SUBMITTED,
       │                       pay_timing: PAY_BEFORE, table_ref: "12", total_cents: 800 }
       │     order_items:    { order_id: order_001, item_name: "Pad Thai", line_total_cents: 500 }
       │                     { order_id: order_001, item_name: "Spring Rolls", line_total_cents: 300 }
       │
       │   ✅ Session created (DINE_IN_TABLE always creates a session for table tracking).
       │   ⚠ Kitchen ticket NOT created yet — waiting for payment (PAY_BEFORE).
       │
Step 4 │ Customer pays $8.00 via ABA QR
       │     bills:       { bill_001, session_id: sess_001, table_ref: "12",
       │                    total_cents: 800, status: OPEN }
       │     bill_orders: { bill_001, order_001 }
       │     payments:    { bill_001, ABA_QR, 800, INITIATED }
       │
Step 5 │ ABA webhook confirms
       │     payments.status → SUCCEEDED
       │     bills.status    → PAID
       │     orders.status   → SUBMITTED
       │     kitchen_tickets: { tkt_001, order_id: order_001, table_ref: "12", status: NEW }
       │
       │   ✅ Kitchen ticket now shows: "Table 12 — Pad Thai + Spring Rolls"
       │
Step 6 │ Kitchen prepares → taps "Ready"
       │ → Screen at pickup counter shows: "Table 12 — Ready!"
       │ → OR staff delivers food to Table 12
       │
Step 7 │ Customer eats at table. Decides to order dessert ($4.00).
       │ → Scans Table 12 QR again (same session is still ACTIVE)
       │
Step 8 │ Backend creates (SAME session, new order):
       │     orders:      { order_002, session_id: sess_001, status: SUBMITTED,
       │                    pay_timing: PAY_BEFORE, table_ref: "12", total_cents: 400 }
       │     order_items: { order_002, "Mango Sticky Rice", 400 }
       │
       │   ⚠ Again, kitchen waits for payment.
       │
Step 9 │ Customer pays $4.00 → payment confirmed → kitchen ticket created for order_002
       │     bills:          { bill_002, session_id: sess_001, total_cents: 400, PAID }
       │     bill_orders:    { bill_002, order_002 }
       │     kitchen_tickets: { tkt_002, order_002, "Table 12", NEW }
       │
       │   Note: PAY_BEFORE means EACH order gets its own bill + payment.
       │   The session exists for table tracking, not for bill grouping.
       │
Step 10│ Customer finishes and leaves. Merchant closes the session from
       │   the portal, or the next customer scanning Table 12 triggers a
       │   new session (closing the old one).
       │
       │ ✅ DONE. 1 session → 2 orders → 2 bills → 2 payments.
```

**Final DB state:**
```
order_sessions
  └─ sess_001 (CLOSED, table_ref: "12")
       ├── orders
       │     ├── order_001: Pad Thai + Spring Rolls  $8.00  (SUBMITTED)
       │     └── order_002: Mango Sticky Rice        $4.00  (SUBMITTED)
       └── bills
             ├── bill_001: $8.00 (PAID) → order_001
             └── bill_002: $4.00 (PAID) → order_002
```

**Key difference from PAY_AFTER:** each order gets its own bill because the
customer pays immediately. The session groups orders for table tracking
(kitchen knows "Table 12") but NOT for bill grouping.

---

### Scenario D — Traditional restaurant (DINE_IN_TABLE + PAY_AFTER)

**Setup:** `tenant_settings.service_model = DINE_IN_TABLE`,
`tenant_settings.pay_timing = PAY_AFTER`

**Story:** Group of 3 sits at Table 5 in a Cambodian BBQ restaurant. They
order appetizers, then mains, then drinks. Pay once at the end.

```
Step 1 │ Group scans TABLE QR on Table 5
       │ → Storefront opens: "Table 5"
       │
Step 2 │ Round 1 — Appetizers ($12.00 total)
       │ → Backend creates session + Round 1 shared cart on first add:
       │     order_sessions: { sess_001, table_ref: "5", ACTIVE }
       │     carts:          { cart_001, session_id: sess_001, ACTIVE }
       │     cart_items:     2× Spring Rolls + Papaya Salad (shared by all phones at the table)
       │ → Group taps "Submit Order" — cart converts:
       │     carts:          { cart_001 → CONVERTED }
       │     orders:         { order_001, sess_001, SUBMITTED, PAY_AFTER,
       │                       table_ref: "5", total_cents: 1200 }
       │     order_items:    { "Spring Rolls x2", 600 }, { "Papaya Salad", 600 }
       │     kitchen_tickets: { tkt_001, order_001, "Table 5", NEW }
       │
       │   ✅ Kitchen starts immediately (PAY_AFTER = no payment gate).
       │
Step 3 │ Kitchen prepares → serves appetizers.
       │     tkt_001: NEW → PREPARING → READY → COMPLETED
       │
Step 4 │ 20 minutes later — Round 2 — Mains ($25.00 total)
       │ → One person at the table scans the QR again (or the page is still open)
       │ → Backend creates (SAME session):
       │     orders:         { order_002, sess_001, SUBMITTED, PAY_AFTER,
       │                       table_ref: "5", total_cents: 2500 }
       │     order_items:    { "BBQ Beef", 1200 }, { "Grilled Fish", 800 }, { "Rice x3", 500 }
       │     kitchen_tickets: { tkt_002, order_002, "Table 5", NEW }
       │
Step 5 │ Kitchen prepares → serves mains.
       │
Step 6 │ 30 minutes later — Round 3 — Drinks ($9.00 total)
       │ → Backend creates (SAME session):
       │     orders:         { order_003, sess_001, SUBMITTED, PAY_AFTER,
       │                       table_ref: "5", total_cents: 900 }
       │     order_items:    { "Angkor Beer x2", 600 }, { "Iced Tea", 300 }
       │     kitchen_tickets: { tkt_003, order_003, "Table 5", NEW }
       │
Step 7 │ Group taps "Request Bill"
       │ → Backend generates ONE bill for the entire session:
       │
       │   SELECT SUM(total_cents) FROM orders
       │     WHERE session_id = 'sess_001' AND status != 'CANCELLED';
       │   -- 1200 + 2500 + 900 = 4600
       │
       │     bills:       { bill_001, sess_001, table_ref: "5",
       │                    bill_number: "BILL-000001", total_cents: 4600, OPEN }
       │     bill_orders: { bill_001, order_001 }  ← appetizers
       │                  { bill_001, order_002 }  ← mains
       │                  { bill_001, order_003 }  ← drinks
       │
Step 8 │ Group pays $46.00 (cash)
       │     payments:    { bill_001, CASH, 4600, SUCCEEDED }
       │     bills.status → PAID, paid_at → now
       │     order_sessions.status → CLOSED, closed_at → now
       │
       │ ✅ DONE. 1 session → 3 orders → 1 bill → 1 payment.
       │
Step 9 │ Merchant portal: Table 5 shows "Available" again.
       │   Next group can scan the same Table 5 QR → new session created.
```

**Final DB state:**
```
order_sessions
  └─ sess_001 (CLOSED, table_ref: "5")
       ├── orders
       │     ├── order_001: Appetizers    $12.00  (SUBMITTED)
       │     ├── order_002: Mains         $25.00  (SUBMITTED)
       │     └── order_003: Drinks         $9.00  (SUBMITTED)
       └── bills
             └── bill_001: $46.00 (PAID)
                   ├── bill_orders → order_001
                   ├── bill_orders → order_002
                   ├── bill_orders → order_003
                   └── payments
                         └── pay_001: $46.00 CASH (SUCCEEDED)
```

---

## Part 4 — Comparison of all four scenarios

### Data flow comparison

| | Scenario A | Scenario B | Scenario C | Scenario D |
|---|---|---|---|---|
| **Combo** | STALL_KIOSK + PAY_BEFORE | STALL_KIOSK + PAY_AFTER | DINE_IN_TABLE + PAY_BEFORE | DINE_IN_TABLE + PAY_AFTER |
| **Session** | None | Auto (short tab) | Yes (table) | Yes (table) |
| **Kitchen waits for payment?** | Yes | No | Yes | No |
| **Bill created** | At checkout (with order) | When customer taps "Pay" | At checkout (per order) | When customer taps "Request bill" |
| **Orders per bill** | 1 | N | 1 | N |
| **Table tracking** | No | No | Yes | Yes |
| **Customer adds another order** | New transaction | Same session, same bill | New bill (paid immediately) | Same session, same bill |

### Session lifecycle comparison

```
Scenario A (no session):
  order → pay → cook → serve → done

Scenario B (short session):
  session opens
    → order 1 → cook → serve
    → order 2 → cook → serve
    → order N → cook → serve
  customer taps "Pay"
    → bill created (sum all orders)
    → pay → session closes

Scenario C (table session, pay each):
  session opens (table 12)
    → order 1 → pay → cook → serve
    → order 2 → pay → cook → serve
  customer leaves → merchant closes session

Scenario D (table session, pay at end):
  session opens (table 5)
    → order 1 → cook → serve
    → order 2 → cook → serve
    → order 3 → cook → serve
  customer taps "Request bill"
    → bill created (sum all orders)
    → pay → session closes → table freed
```

### When does the kitchen start?

```
PAY_BEFORE:  cart → payment succeeds → order created (SUBMITTED) → kitchen ticket (NEW)
PAY_AFTER:   cart → order created (SUBMITTED) → kitchen ticket (NEW) → payment later
```

This is the most critical behavioral difference. **PAY_BEFORE gates the
order's existence behind payment. PAY_AFTER creates the order immediately.**
In both cases, the order starts as SUBMITTED — there is no PENDING_PAYMENT
status on the order. See `docs/discussions/order-status-redesign.md`.

---

## Part 5 — Schema changes from this decision

### Enum changes

```sql
-- BEFORE
CREATE TYPE "ServiceModel" AS ENUM ('STALL_KIOSK', 'DINE_IN_TABLE', 'STALL_OPEN_TAB');
CREATE TYPE "PayTiming"    AS ENUM ('PAY_BEFORE_FULFILLMENT', 'PAY_AFTER_SERVICE', 'PAY_ON_SESSION_CLOSE');

-- AFTER
CREATE TYPE "ServiceModel" AS ENUM ('STALL_KIOSK', 'DINE_IN_TABLE');
CREATE TYPE "PayTiming"    AS ENUM ('PAY_BEFORE', 'PAY_AFTER');
```

### `orders` table — new column

```sql
-- Added: pay_timing snapshotted from tenant_settings, overridable per order
pay_timing "PayTiming" NOT NULL
```

The backend uses `orders.pay_timing` (not `tenant_settings.pay_timing`) to
determine when the order record is created:

```
PAY_BEFORE → order created AFTER payment succeeds → status = SUBMITTED
PAY_AFTER  → order created IMMEDIATELY             → status = SUBMITTED
```

In both cases the initial status is SUBMITTED. The difference is WHEN the
order record is created, not what status it starts with. See
`docs/discussions/order-status-redesign.md` for the full flow.

### `tenant_settings` — default changed

```sql
pay_timing "PayTiming" NOT NULL DEFAULT 'PAY_BEFORE'  -- (was 'PAY_BEFORE_FULFILLMENT')
```

---

## Part 6 — Design decisions

### Decision 1: Customer does NOT choose pay timing

The storefront always follows the tenant default. The merchant sets the
policy; per-order overrides come from the merchant portal, not the customer.

**Rationale:**
- Letting customers choose "pay later" creates **credit risk** for the
  merchant (anonymous QR customer walks away without paying).
- Adds cognitive load to a fast flow ("when do you want to pay?" — the
  customer just wants food).
- "Pay later" is easily confused with buy-now-pay-later credit/installments.
- In the real world, the business decides payment policy, not the customer.
  You don't walk into McDonald's and say "I'd prefer to pay after."

**The flexibility still exists** — it's just on the merchant side:
- `tenant_settings.pay_timing` = the default for all storefront orders.
- `orders.pay_timing` = can be overridden per order by the merchant
  (e.g., granting pay-after to a recognized regular customer).

### Decision 2: Session behavior is derived, not configured

No explicit "enable sessions" toggle. The system auto-creates sessions
based on the combination:

| Combination | Session auto-created? | Closes when |
|---|---|---|
| STALL_KIOSK + PAY_BEFORE | No | — |
| STALL_KIOSK + PAY_AFTER | Yes | Bill paid / merchant closes / 24h cleanup |
| DINE_IN_TABLE + PAY_BEFORE | Yes (for table tracking) | Merchant closes / 24h cleanup |
| DINE_IN_TABLE + PAY_AFTER | Yes | Bill paid / merchant closes / 24h cleanup |

### Decision 3: `pay_timing` is per-order (Option B)

`tenant_settings.pay_timing` is the tenant-level **default**.
`orders.pay_timing` is the **actual** timing used for that specific order.

This enables: "Regular customer at a normally pay-before stall gets
pay-after treatment" — the merchant overrides it for that one order,
without changing the default for all other customers.

---

## Part 7 — Files affected by this decision

| File | What changed |
|---|---|
| `docs/discussions/postgresql-schema.md` | Enum definitions, `tenant_settings.pay_timing` default, `orders` table (+`pay_timing` column), `bills` comment |
| `docs/discussions/ENUMS_REFERENCE.md` | Full rewrite of `ServiceModel` and `PayTiming` sections |
| `docs/discussions/discussion_and_decision.md` | Summary entry pointing to this document |
| `xfos/contracts/enums/index.ts` | Must be updated to match (pending) |
| `xfos/database/prisma/schema.prisma` | Must be updated to match (pending — schema.prisma is finalized after postgresql-schema.md) |
