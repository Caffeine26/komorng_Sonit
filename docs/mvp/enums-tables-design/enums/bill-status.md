# BillStatus — Design Discussion & Decision

**Date:** 2026-04-09 (revised 2026-04-09)
**Status:** Redesigned — 4 values: OPEN, PARTIALLY_PAID, PAID, VOIDED
**Affects:** `bills` table
**MVP note:** Fully wired for MVP. Bills are created for every payment
scenario — single-order PAY_BEFORE, multi-order PAY_AFTER sessions, and
dine-in table sessions. The `bill_orders` junction table links N orders
to 1 bill.

**Key design change:** The bill no longer tracks in-flight payment state.
`UNPAID` became `OPEN`, `PENDING_PAYMENT` was removed entirely. The
`payments` table (via `PaymentStatus`) owns all payment-attempt lifecycle
tracking. The bill only cares about how much money has been collected vs
how much is owed.

---

## The enum

```sql
CREATE TYPE "BillStatus" AS ENUM (
  'OPEN',
  'PARTIALLY_PAID',
  'PAID',
  'VOIDED'
);
```

---

## Part 1 — Each value explained in detail

### `OPEN`

**Meaning:** The bill has been created and its total calculated, but the
full amount has not yet been collected. Money may or may not be owed — the
key point is that the bill is not yet settled. An OPEN bill stays OPEN
regardless of whether a payment attempt is currently in flight, a QR code
is displayed, or no payment has been started at all.

**Who sets it:** System (default on creation).

**What happens to the bill:**
- The bill row exists with `total_cents` calculated from the linked orders
  via `bill_orders`.
- Zero or more `payments` rows may exist in any state — INITIATED, PENDING,
  FAILED, EXPIRED, CANCELLED. None of these change the bill status.
- The customer may or may not have seen the bill yet — for PAY_AFTER, the
  bill is generated when the customer taps "Request bill" (សុំវិក្កយបត្រ).
- The merchant portal shows this bill in the "Open" tab.

**Real-world example:** At a sit-down restaurant (ភោជនីយដ្ឋាន) on
Norodom Boulevard, a family orders appetizers, mains, and drinks across
three separate orders during their meal. When they're ready to leave, they
tap "Request bill" on the storefront. The backend sums all three orders:
$4.50 + $18.00 + $6.00 = $28.50. A bill is created with status OPEN and
`total_cents = 2850`. It stays OPEN whether the customer is reviewing the
bill, has a QR code displayed, or is waiting for a failed payment to
resolve.

**Why it's OPEN and not UNPAID:** The name "OPEN" better reflects the
semantics. An "unpaid" bill implies zero payment activity. An "open" bill
simply means "not yet settled" — it could have in-flight payments,
expired attempts, or nothing at all. The bill doesn't care about payment
attempts; it cares about settlement.

**Why the bill no longer tracks in-flight payment state:** The previous
design had `PENDING_PAYMENT` on the bill to indicate "a payment is in
progress." This created coupling between the bill and payment lifecycles
and required the bill to bounce between UNPAID and PENDING_PAYMENT on
every retry. The new design is simpler: the bill is OPEN until enough
money is collected. The `payments` table tracks every attempt
independently. This eliminates the retry loop on the bill status and
removes the need for concurrency guards against dual payment attempts at
the bill level (that guard now lives on the payments table via
`PaymentStatus.INITIATED`).

**Typical duration:** Seconds to minutes. In PAY_BEFORE single-order flows,
the bill may pass through OPEN so quickly it's barely noticeable (bill
created → payment succeeds in the same flow). In PAY_AFTER restaurant
scenarios, the bill might stay OPEN for several minutes while the customer
reviews it and pays.

---

### `PARTIALLY_PAID`

**Meaning:** Some payment has been received but the full bill amount has
not been collected yet. The bill has at least one SUCCEEDED payment, but
`SUM(succeeded_payments.amount_cents) < bills.total_cents`.

**Who sets it:** System (when a payment succeeds but the total collected
is less than the bill total).

**What happens to the bill:**
- At least one `payments` row exists with status `SUCCEEDED`.
- `paid_cents` (or the computed sum of succeeded payments) is less than
  `total_cents`.
- The customer sees a "remaining balance" on the storefront.
- The merchant portal shows this bill as "Partially paid" with the
  outstanding amount.
- Additional payment attempts can be created to cover the remainder.

**Real-world example:** At a restaurant, a group of friends splits a
$30.00 bill. Friend A pays $15.00 via ABA QR — payment succeeds. The bill
moves from OPEN to PARTIALLY_PAID. Friend B then pays the remaining $15.00
— when that payment succeeds, the bill moves to PAID.

**Why it was added:** The previous design had no PARTIALLY_PAID — bills
were all-or-nothing. As the platform supports real-world payment scenarios
(split payments, partial cash + QR combinations), the bill needs to
accurately reflect that some money has been collected but more is owed.
Without PARTIALLY_PAID, a bill with $15 of $30 collected would show as
OPEN (misleading — money HAS been received) or PAID (incorrect — the
full amount hasn't been collected).

**Typical duration:** Minutes. The gap between the first partial payment
succeeding and the final payment completing the bill. In practice, split
payments happen in quick succession.

---

### `PAID`

**Meaning:** The full amount has been received and confirmed. The bill is
settled. `paid_at` is set.

**Who sets it:** System (when the sum of SUCCEEDED payments meets or
exceeds `total_cents` — either via ABA webhook + check-transaction
confirmation, or merchant marking cash as received).

**What happens to the bill:**
- `paid_at` timestamp is set.
- The bill is considered settled — no further payment action needed.
- For PAY_BEFORE: payment success triggers order creation — the order is
  created as SUBMITTED, and kitchen tickets are created.
- For PAY_AFTER: the order session is closed (`OrderSessionStatus = CLOSED`),
  and the table (if dine-in) is freed.
- The merchant portal shows this bill in the "Paid" tab.
- Revenue reporting counts this bill.

**Real-world example 1 (PAY_BEFORE, ABA QR):** The customer at the boba
tea shop scans the KHQR code. ABA processes the payment. ABA sends a
webhook to the platform's callback URL. The platform verifies via
check-transaction API. Payment confirmed: $2.50 received. Payment status →
SUCCEEDED. Bill status → PAID. `paid_at` = now. Order created as SUBMITTED.
Kitchen ticket created.

**Real-world example 2 (PAY_AFTER, cash):** At a noodle stall (ហាងគុយទាវ)
in Phsar Kandal, the customer finishes eating. Bill total: $5.50 (kuy teav
$3.50 + iced coffee $2.00). Customer pays cash at the counter. The stall
owner opens the kitchen app, taps "Received cash" (បានទទួលប្រាក់សុទ្ធ).
Payment status → SUCCEEDED. Bill status → PAID. Session → CLOSED.

**Why it can't be removed:** Obviously required — it's the success state.
Without PAID, you'd never know which bills are settled.

**Typical duration:** Permanent — this is a terminal state. A paid bill
stays paid. (If refunds are implemented in the future, the refund would
be tracked separately on the `payments` table or a new refund table — the
bill itself stays PAID.)

---

### `VOIDED`

**Meaning:** The bill has been cancelled or written off. No payment was
collected (or if a partial payment was received, it must be refunded
separately). The bill is dead — it doesn't count in revenue reporting.

**Who sets it:**
- System (automatically when all orders on the bill are CANCELLED)
- Merchant (manually voids a bill — e.g., full comp for a VIP, mistake
  correction, service recovery)
- System (when an order is cancelled and the bill has only that one order)

**What happens to the bill:**
- The bill is excluded from revenue reports and daily settlement totals.
- Any in-flight payment (INITIATED or PENDING) on this bill is also
  cancelled.
- The linked orders are (or should already be) CANCELLED.
- The bill row stays in the database — voided, not deleted. Audit trail
  preserved.
- The merchant portal shows this in the "Voided" tab (useful for
  shrinkage/loss tracking).

**Real-world example 1 (system void — order cancelled):** A customer at a
kiosk orders a mango smoothie ($3.00). The ABA QR code is displayed. The
customer changes their mind and taps "Cancel". Order → CANCELLED. Since the
bill only had this one order, the bill → VOIDED. The $3.00 never appears in
revenue.

**Real-world example 2 (merchant comp):** At a restaurant, a customer
complains that their soup was cold. The owner decides to comp the entire
meal ($12.00). They open the merchant portal, find the bill, and tap
"Void bill" (មោឃភាព). Bill → VOIDED. The $12.00 is excluded from revenue
but tracked for loss reporting.

**Real-world example 3 (mistake correction):** A merchant accidentally
creates a duplicate bill. They void the duplicate. Only the original bill
counts.

**Why it can't be removed:** Without VOIDED, cancelled/comped bills would
either stay as OPEN forever (polluting the open list and inflating
outstanding receivables) or need to be hard-deleted (losing the audit
trail). VOIDED is the clean terminal state for bills that should not be
collected.

**Typical duration:** Terminal state. A voided bill stays voided permanently.

---

## Part 2 — State machine

### PAY_BEFORE single-order — happy path

```
OPEN ──► PAID
      (payment succeeds — full amount)
```

### PAY_AFTER multi-order — happy path

```
(bill created when customer requests it)
OPEN ──► PAID
      (payment succeeds — full amount)
```

### Split payment — happy path

```
OPEN ──► PARTIALLY_PAID ──► PAID
      (1st payment succeeds,   (2nd payment covers remainder)
       partial amount)
```

### Payment failed or expired — retry

```
OPEN ──────────────────────► OPEN ──► PAID
  (payment FAILED/EXPIRED;     (new attempt succeeds)
   bill stays OPEN — no
   status bounce)
```

Note: Unlike the old design, the bill does NOT change status when a payment
fails or expires. It stays OPEN. Only successful payments move the bill
forward.

### All orders cancelled — void

```
OPEN ──► VOIDED
      (all orders cancelled / merchant comp)
```

### Full state machine diagram

```
OPEN ──► PARTIALLY_PAID ──► PAID     (split payment — terminal)
  │              │
  │              └──► VOIDED          (voided after partial payment — rare,
  │                                    requires refund of collected amount)
  ├──► PAID                           (full payment in one go — terminal)
  │
  └──► VOIDED                         (all orders cancelled / comp)
```

### Valid transitions (complete list)

| From | To | Trigger |
|---|---|---|
| `OPEN` | `PARTIALLY_PAID` | A payment succeeds but collected total < bill total |
| `OPEN` | `PAID` | A payment succeeds and collected total >= bill total |
| `OPEN` | `VOIDED` | All linked orders cancelled, or merchant voids the bill |
| `PARTIALLY_PAID` | `PAID` | Another payment succeeds and collected total >= bill total |
| `PARTIALLY_PAID` | `VOIDED` | Merchant voids the bill (requires refund of partial amount collected) |

### Invalid transitions (these should never happen)

- **PAID → OPEN** — Can't un-pay a bill. If a refund is needed, that's
  tracked separately (future refund table), not by reverting bill status.
- **PAID → VOIDED** — A paid bill was collected. Voiding it would mean
  money was received but not counted — an accounting integrity violation.
  Refunds are the correct mechanism.
- **PAID → PARTIALLY_PAID** — Makes no sense. Already fully paid.
- **VOIDED → OPEN** — A voided bill is dead. If the customer wants to
  order again, create a new bill.
- **VOIDED → PAID** — Can't pay a voided bill.
- **VOIDED → PARTIALLY_PAID** — Same — terminal state.
- **PARTIALLY_PAID → OPEN** — Once money is collected, the bill cannot
  go backwards. Even if a refund is issued, that's tracked separately.

---

## Part 3 — Bill creation timing and aggregation

### When is a bill created?

The timing depends on `ServiceModel` + `PayTiming`:

| Scenario | When bill is created | Orders on the bill |
|---|---|---|
| STALL_KIOSK + PAY_BEFORE | At checkout, same time as order | 1 order = 1 bill |
| STALL_KIOSK + PAY_AFTER | When customer taps "Pay" / "Close tab" | N orders (all in session) = 1 bill |
| DINE_IN_TABLE + PAY_BEFORE | At checkout, per order | 1 order = 1 bill (each paid immediately) |
| DINE_IN_TABLE + PAY_AFTER | When customer taps "Request bill" | N orders (all in session) = 1 bill |

### The bill_orders junction table

Bills and orders are linked through `bill_orders`, not a direct FK. This
many-to-many relationship exists because PAY_AFTER scenarios aggregate
multiple orders into one bill:

```sql
-- Customer had 3 orders during their restaurant visit:
-- order_001: Appetizer  $4.50
-- order_002: Main       $12.00
-- order_003: Drinks     $6.00

-- One bill covers all three:
bill_001: total_cents = 2250, status = OPEN

bill_orders:
  (bill_001, order_001)
  (bill_001, order_002)
  (bill_001, order_003)
```

### Bill total calculation

The bill total is computed from the linked orders at bill creation time:

```sql
SELECT SUM(o.total_cents) AS bill_total
FROM orders o
JOIN bill_orders bo ON bo.order_id = o.id
WHERE bo.bill_id = $1
  AND bo.tenant_id = $2
  AND o.status != 'CANCELLED';
```

If an order is cancelled after the bill is created but before payment, the
bill total should be recalculated and the cancelled order's `bill_orders`
row retained (for audit) but excluded from the sum.

### Retry flow (ABA QR expiry)

When an ABA QR code expires, the flow is:

```
1. payments row: PENDING → EXPIRED
2. bills row: stays OPEN (no status change — bill doesn't track payment attempts)
3. Customer sees "Payment expired — try again" (បង់ប្រាក់ផុតកំណត់ — សាកម្ដងទៀត)
4. Customer taps "Try again"
5. New payments row created: INITIATED → PENDING
6. bills row: still OPEN
7. New ABA QR code generated with new tran_id
```

Each retry creates a new `payments` row. The old one stays as EXPIRED for
audit. This means one bill can have multiple `payments` rows — only one
should ever be SUCCEEDED (for the full amount) or multiple SUCCEEDED rows
(for split payments). The bill status only changes when a payment succeeds.

---

## Part 4 — What's NOT in this enum (and why)

| Omitted value | What it would mean | Why we skip it |
|---|---|---|
| `UNPAID` | (Renamed to OPEN) | OPEN better reflects the semantics — an open bill may have in-flight payments, expired attempts, or nothing at all. "Unpaid" implies no payment activity whatsoever. |
| `PENDING_PAYMENT` | A payment attempt is in progress | Removed. The bill no longer tracks in-flight payment state. The `payments` table owns this via `PaymentStatus` (INITIATED, PENDING). This eliminated the UNPAID ↔ PENDING_PAYMENT bounce on every retry and decoupled the bill from the payment attempt lifecycle. |
| `REFUNDED` | Payment was returned to the customer | Refunds are tracked at the payment level, not the bill level. A bill can be partially refunded. The bill itself stays PAID. Known schema gap — refund table planned. |
| `OVERDUE` | Bill has been unpaid past a threshold | Not relevant for food ordering — payments happen in real time. There's no "pay later in 30 days" invoicing model. |
| `DISPUTED` | Customer contests the charge | Not in scope. Chargebacks from card payments would be handled by the payment gateway, not a bill status. |
| `DRAFT` | Bill being assembled, not finalized | Bills are created atomically — the total is calculated from orders in one transaction. There's no "building a bill" phase. |
| `SPLIT` | Bill was divided among multiple payers | Not a status — split payment is handled by multiple payment rows against one bill. PARTIALLY_PAID tracks the intermediate state. |

---

## Part 5 — Relationship to other enums and tables

### BillStatus → PaymentStatus

Each bill can have multiple `payments` rows (retry on expiry, split
payments). The relationship:

| Bill status | Expected payment states | Explanation |
|---|---|---|
| `OPEN` | No payments, or all payments are non-SUCCEEDED (INITIATED, PENDING, EXPIRED, FAILED, CANCELLED) | No successful payment yet |
| `PARTIALLY_PAID` | At least one SUCCEEDED payment, but collected total < bill total | Some money received, more owed |
| `PAID` | SUCCEEDED payment(s) totalling >= bill total | Bill is settled |
| `VOIDED` | No SUCCEEDED payments (or any collected amount must be refunded) | Bill was cancelled |

**Invariant:** The bill status is derived purely from the sum of SUCCEEDED
payment amounts vs the bill total. In-flight payments (INITIATED, PENDING)
do not affect bill status.

### BillStatus → OrderStatus

| Bill event | Effect on linked orders |
|---|---|
| Bill → PAID (PAY_BEFORE) | Order is created as SUBMITTED (kitchen tickets created) |
| Bill → PAID (PAY_AFTER) | No effect on orders — they're already SUBMITTED. Session → CLOSED. |
| Bill → VOIDED | Orders should already be CANCELLED (or become CANCELLED) |

### BillStatus → OrderSessionStatus

| Bill event | Effect on session |
|---|---|
| Bill → PAID | Session → CLOSED. Table is freed. |
| Bill → VOIDED | Session → CLOSED. Table is freed. |

### bills table schema context

```sql
CREATE TABLE bills (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  session_id     TEXT REFERENCES order_sessions(id),  -- NULL for sessionless PAY_BEFORE
  table_ref      TEXT,                                 -- denormalized for receipt display
  bill_number    TEXT NOT NULL,                        -- BILL-000001 (per-tenant sequence)
  status         "BillStatus" NOT NULL DEFAULT 'OPEN',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  total_cents    INTEGER NOT NULL DEFAULT 0,
  currency       "Currency" NOT NULL DEFAULT 'USD',
  paid_at        TIMESTAMP(3),                         -- set when status → PAID
  created_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP(3) NOT NULL,
  UNIQUE (tenant_id, bill_number)
);
```

Key observations:
- `session_id` is nullable — PAY_BEFORE stall orders have no session.
- `bill_number` is generated by `allocate_bill_number(tenant_id)` from
  `tenant_sequences`. Format: `BILL-000001`.
- `paid_at` is only set when status = PAID. It's NULL for OPEN,
  PARTIALLY_PAID, and VOIDED.
- Money is in cents (integer) to avoid floating-point precision issues.

---

## Part 6 — Decision summary

### Question: Why remove PENDING_PAYMENT?

**Answer:** PENDING_PAYMENT coupled the bill to the payment attempt
lifecycle. Every time a payment expired or failed, the bill had to bounce
back to UNPAID. Every new attempt moved it to PENDING_PAYMENT. This
created:
- A retry loop on the bill status (UNPAID ↔ PENDING_PAYMENT).
- Concurrency complexity (prevent two PENDING_PAYMENT transitions).
- Misleading semantics ("the bill is pending payment" vs "a payment
  attempt is pending" are different things).

The new design is cleaner: the bill is OPEN until money is collected. The
`payments` table tracks attempt state independently. The bill only moves
forward (OPEN → PARTIALLY_PAID → PAID), never backwards.

### Question: Why rename UNPAID to OPEN?

**Answer:** "Open" is more accurate. An open bill may have:
- No payment attempts at all (customer is reviewing the bill).
- An in-flight payment (QR code displayed, PENDING).
- Multiple failed/expired attempts.
In all these cases, the bill is "open" — not yet settled. "Unpaid" implies
zero payment activity, which isn't always true.

### Question: Why add PARTIALLY_PAID?

**Answer:** With the removal of PENDING_PAYMENT, the bill needs a way to
represent "some money collected, more owed." This covers:
- Split payments (two friends each pay half).
- Mixed method payments (partial cash + QR for the rest).
- Partial payment followed by a failed second attempt (the bill is
  PARTIALLY_PAID, not OPEN — money HAS been received).

Without PARTIALLY_PAID, a bill with $15 of $30 collected would be either
OPEN (misleading) or PAID (incorrect).

### Question: Should VOIDED be on BillStatus or on a separate flag?

**Answer: Status is correct.** A voided bill is fundamentally different from
an open bill — it should never be paid, never retried, never counted. A
boolean `is_voided` flag on an OPEN bill would risk someone accidentally
initiating payment on a voided bill if they don't check the flag. Making it
a status makes the state machine enforce the rule: VOIDED is terminal.

### What we decided

- **4 values: OPEN, PARTIALLY_PAID, PAID, VOIDED.** Each has distinct
  business meaning and different downstream effects.
- **OPEN replaces UNPAID.** Better semantics for a bill that may have
  in-flight payment attempts.
- **PENDING_PAYMENT removed.** The bill no longer tracks payment attempt
  lifecycle. That's the `payments` table's job.
- **PARTIALLY_PAID added.** Covers split payments and partial collection
  scenarios.
- **Bill status only moves forward.** OPEN → PARTIALLY_PAID → PAID. No
  backwards transitions. No retry loops on the bill.
- **PAID and VOIDED are terminal.** No transitions out of either state.
- **No REFUNDED status.** Refunds are tracked at the payment level. A
  paid bill stays PAID even if partially refunded. This is consistent
  with how payment gateways work (Stripe, ABA) — the original charge
  stays as "succeeded" with a linked refund record.
