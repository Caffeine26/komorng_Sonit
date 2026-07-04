# PaymentStatus — Design Discussion & Decision

**Date:** 2026-04-09 (revised 2026-04-09)
**Status:** Redesigned — 7 values: INITIATED, PENDING, SUCCEEDED, FAILED, CANCELLED, EXPIRED, REFUNDED
**Affects:** `payments` table
**MVP note:** Fully wired for MVP. One bill can have multiple payment rows
(retry on ABA QR expiry, split payments). Each payment row tracks a single
attempt.

**Key design change:** Added INITIATED (before PENDING — separates "record
created" from "gateway contacted"), CANCELLED (customer actively cancelled,
distinct from expired/failed), and REFUNDED (full refund of this payment
attempt). Default is now INITIATED, not PENDING.

---

## The enum

```sql
CREATE TYPE "PaymentStatus" AS ENUM (
  'INITIATED',
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED'
);
```

---

## Part 1 — Each value explained in detail

### `INITIATED`

**Meaning:** A payment record has been created in the database, but the
payment has not yet been submitted to the gateway. This is the "record
exists but nothing has happened yet" state. The system may still be
generating a QR code, preparing the gateway request, or waiting for the
customer to confirm their payment method choice.

**Who sets it:** System (default on creation of a `payments` row).

**What happens:**
- A `payments` row exists with `status = 'INITIATED'`.
- No gateway call has been made yet. No QR code has been generated.
- The storefront may be showing a "preparing payment..." spinner or a
  payment method selection screen.
- The associated bill remains OPEN (bills don't track payment attempts).
- This state acts as a lock — only one INITIATED or PENDING payment should
  exist per bill at a time (prevents duplicate payment attempts).

**Real-world example:** A customer at a bubble tea kiosk selects ABA QR
as their payment method and taps "Pay." The backend creates a `payments`
row with status INITIATED, generates a unique `tran_id`, and then calls
the ABA PayWay API. If the API call succeeds and returns a QR string, the
payment moves to PENDING. If the API call fails (network error, ABA is
down), the payment moves to FAILED without ever reaching PENDING.

**Why it was added:** The previous design used PENDING as both "record
created" and "gateway contacted." This conflated two distinct states:
- INITIATED = "we have a record, gateway hasn't been called yet." If the
  gateway call fails, we know the payment never left our system.
- PENDING = "the gateway has been contacted and we're waiting for a
  response." The payment is now in the gateway's hands.

Without INITIATED, a gateway network failure during the initial API call
would leave a PENDING payment that the gateway knows nothing about — the
system would wait for a webhook that will never arrive. With INITIATED,
the failure is caught before the payment enters PENDING, and the system
can immediately retry or fail cleanly.

**Typical duration:** Milliseconds to seconds. The time between creating
the record and successfully contacting the gateway.

---

### `PENDING`

**Meaning:** The payment has been submitted to the gateway and the system
is waiting for confirmation. For ABA QR, this means the KHQR code has been
generated and the customer needs to scan it. For cash, the merchant needs
to confirm receipt.

**Who sets it:** System (after successfully contacting the gateway or
generating the QR code).

**What happens:**
- For ABA_QR: a KHQR code has been generated and displayed to the customer.
  The platform's callback URL is registered with ABA. The system is polling
  or waiting for the webhook.
- For CASH: the payment row is created and the merchant/kitchen staff sees
  a "Confirm cash received" button.
- For CARD: the card authorization request has been sent to the processor
  (not wired at MVP — CARD is a placeholder enum value).
- The associated bill remains OPEN (bills don't track payment attempts).
- The storefront shows a payment-in-progress UI (QR code, countdown timer,
  or "waiting for confirmation" spinner).

**Real-world example (ABA QR):** A customer at a street food stall
(ហាងម្ហូបតាមផ្លូវ) near Wat Phnom orders grilled pork skewers ($2.00).
They choose ABA QR payment. The platform calls ABA PayWay API:
```
POST /api/purchase
  merchant_id: PLATFORM_MERCHANT_ID
  tran_id: "PA-x7k2m9p1"
  amount: "2.00"
  payment_option: "abapay_khqr"
  callback_url: "https://api.xfos.com/webhooks/aba/callback"
  payout: Base64({"accounts":[{"id":"merchant_aba_acct","amount":"2.00"}]})
```
ABA returns a QR code string. The payment row moves from INITIATED to
PENDING. The storefront renders the KHQR code. The customer opens ABA
Mobile to scan.

**Real-world example (cash):** At a noodle stall, the customer finishes
eating and asks for the bill. Bill total: $3.50. The stall owner sees the
bill on their tablet. A `payments` row is created (method: CASH, status:
INITIATED → PENDING in quick succession — cash skips the gateway call).
The owner counts the $3.50, taps "Received cash"
(បានទទួលប្រាក់សុទ្ធ). Payment → SUCCEEDED.

**Why it can't be removed:** PENDING represents the irreducible window
between "gateway contacted" and "payment confirmed." For cash, this window
is seconds (staff counting bills). For ABA QR, it can be up to 5 minutes.
For card payments, it's typically 2-10 seconds. Without PENDING, you'd
jump from INITIATED directly to a terminal state — losing the "waiting
for customer action" state.

**Typical duration:** Seconds (cash) to 5 minutes (ABA QR validity window).

---

### `SUCCEEDED`

**Meaning:** The payment has been confirmed. Money has been received (or
confirmed as received, in the case of cash). This is a terminal state.

**Who sets it:**
- System (for ABA_QR: after webhook received AND check-transaction API
  confirms status "00")
- Merchant/kitchen staff (for CASH: tapping "Received cash" in the app)
- System (for CARD: after authorization success — future)

**What happens:**
- `confirmed_at` timestamp is set on the `payments` row.
- The system checks the sum of all SUCCEEDED payments for this bill:
  - If total collected >= bill total → bill moves to PAID.
  - If total collected < bill total → bill moves to PARTIALLY_PAID.
- For PAY_BEFORE orders (when bill is fully PAID): payment success triggers
  order creation (the order is created as SUBMITTED). Kitchen ticket is
  created.
- For PAY_AFTER orders (when bill is fully PAID): the session is closed.
  No order status change (orders are already SUBMITTED).
- The `gateway_data` JSONB column stores the raw gateway response for audit
  (ABA's full response body, including `apv` approval code and
  `payer_account`).

**Real-world example:** The customer at Wat Phnom scans the KHQR code in
ABA Mobile. They see the pre-filled amount ($2.00) and merchant name. They
tap "Pay." ABA processes the payment:
1. ABA debits customer's account → credits merchant's ABA account (via
   platform payout split) in real time.
2. ABA POSTs to `callback_url`: `{ tran_id: "PA-x7k2m9p1", status: "00" }`.
3. Platform receives webhook, looks up `payments` where
   `reference = "PA-x7k2m9p1" AND status = 'PENDING'`.
4. Platform calls ABA Check Transaction API (signed with platform's HMAC-
   SHA512 key) to verify independently.
5. ABA confirms: `{ status: "00", amount: "2.00" }`.
6. Payment → SUCCEEDED. `confirmed_at` = now. `gateway_data` = full response.
7. Bill → PAID. Order created as SUBMITTED. Kitchen ticket created.

**Why it can't be removed:** Obviously required — it's the success state.

**Why it's terminal:** A SUCCEEDED payment should never change status
(except to REFUNDED for full refunds). If a partial refund is needed, it's
tracked in a separate `payment_refunds` table. The original payment stays
SUCCEEDED because:
- The audit trail must show that money was received at this time.
- Partial refunds exist — the original $10.00 payment stays SUCCEEDED while
  a $3.00 refund is recorded separately.
- Gateway reconciliation depends on matching SUCCEEDED payments to bank
  settlement records.

**Typical duration:** Permanent (unless refunded). Terminal state.

---

### `FAILED`

**Meaning:** The payment was rejected by the payment gateway or processor.
The customer's money was not taken. This is a terminal state for this
specific payment attempt — but a new attempt can be created on the same
bill.

**Who sets it:** System (when the gateway returns an error or rejection
code, or when the initial gateway call from INITIATED fails).

**What happens:**
- The `gateway_data` JSONB column stores the error details from the gateway
  (error code, message, etc.).
- The associated bill stays OPEN (or PARTIALLY_PAID if previous payments
  succeeded). No bill status change on failure.
- The customer sees an error message: "Payment failed — please try again"
  (ការបង់ប្រាក់បរាជ័យ — សូមព្យាយាមម្ដងទៀត).
- For PAY_BEFORE: the order has not been created yet (it only exists after
  payment succeeds). The cart awaits a retry — for `DINE_IN_TABLE` it stays
  CONVERTED in the `carts` table (since 2026-04-24 dine-in carts are
  server-persisted); for `STALL_KIOSK` it stays in the customer's
  `localStorage` (no DB cart row exists at all).
- The failed payment row stays in the database for audit.

**Real-world example:** A customer tries to pay $15.00 via ABA QR, but
their ABA account has insufficient funds. ABA returns a non-"00" status
code. The platform marks the payment as FAILED, stores the error in
`gateway_data`. The bill stays OPEN. The customer sees "Payment failed"
and can try again with a different account or payment method (cash).

**Why it can't be removed:** Without FAILED, rejected payments would either
stay as PENDING forever (blocking the bill from being retried) or disappear
(losing the record that an attempt was made and why it failed). FAILED is
essential for:
- Debugging payment issues ("why did this customer's payment fail 3 times?")
- Analytics ("what's our payment failure rate by method?")
- Retry logic (the system knows the previous attempt failed, so a new one
  is allowed)

**Why it's distinct from EXPIRED and CANCELLED:**
- FAILED = the gateway actively rejected the payment or the gateway call
  itself errored. Something went wrong.
- EXPIRED = nothing happened — the payment window timed out.
- CANCELLED = the customer actively chose to cancel.
Different root causes, different customer messaging, different analytics.

**Typical duration:** Permanent. Terminal state for this payment attempt.

---

### `CANCELLED`

**Meaning:** The customer (or merchant) actively cancelled this payment
attempt before it completed. This is distinct from EXPIRED (timeout with
no action) and FAILED (gateway rejection). The customer made a deliberate
choice to stop this payment.

**Who sets it:**
- System (when the customer taps "Cancel" on the payment screen before
  scanning the QR code or completing the payment).
- Merchant (when the merchant cancels a pending payment from the portal).
- System (when the bill is voided while a payment is in INITIATED or
  PENDING state).

**What happens:**
- The payment row is marked CANCELLED with a reason (if provided).
- The associated bill stays in its current state (OPEN or PARTIALLY_PAID).
  No bill status change.
- The customer returns to the bill view and can initiate a new payment
  attempt.
- If the payment was in PENDING state (QR displayed), the QR is invalidated
  (if possible — depends on gateway support).

**Real-world example:** At a food court, a customer orders pad thai ($4.00)
and selects ABA QR payment. The QR code is displayed. The customer realizes
they left their phone with ABA Mobile in the car. They tap "Cancel payment"
(បោះបង់ការបង់ប្រាក់) on the storefront. Payment → CANCELLED. The customer
walks to their car, comes back, and initiates a new payment attempt (new
`payments` row).

**Why it was added:** The previous design handled active cancellation as
EXPIRED, which lost important information. "Customer actively cancelled"
is operationally different from "QR timed out":
- High CANCELLED rate → the payment UX may be confusing, or customers are
  changing their minds about the payment method.
- High EXPIRED rate → customers don't know how to scan QR, timer is too
  short, or the payment screen is confusing.
- A CANCELLED payment can happen immediately (customer taps cancel 2
  seconds in), while EXPIRED only happens after the full timeout window.

**Typical duration:** Permanent. Terminal state for this payment attempt.

---

### `EXPIRED`

**Meaning:** The payment timed out without any response. For ABA QR, this
means the QR code's validity window elapsed without the customer scanning
it. No money was taken and no gateway rejection occurred — the customer
simply didn't act in time.

**Who sets it:**
- System (for ABA_QR: after the 5-minute QR validity window with no webhook
  received)
- System (for CARD: after an authorization timeout — future)
- Not applicable for CASH (cash doesn't expire — it either gets confirmed
  or the bill is voided)

**What happens:**
- The associated bill stays in its current state (OPEN or PARTIALLY_PAID).
  No bill status change on expiry.
- The storefront shows "Payment expired — try again"
  (បង់ប្រាក់ផុតកំណត់ — សាកម្ដងទៀត) with a "Try again" button.
- The customer can initiate a new payment attempt, which creates a new
  `payments` row (new `tran_id` for ABA).
- For PAY_BEFORE: the order has not been created yet (it only exists after
  payment succeeds). If the customer abandons entirely, no order is created.
- The expired payment row stays in the database for audit.

**Real-world example:** At a busy food court (ផ្សារអាហារ) near Aeon Mall,
a customer orders pad thai ($4.00). The KHQR code is displayed. But the
customer gets distracted — their friend arrives, they start talking, they
forget to scan. Five minutes pass. The QR code is no longer valid. The
platform marks the payment as EXPIRED. The storefront shows a "Payment
expired" screen with a "Try again" button. The customer taps it, a new
QR code is generated (new `tran_id`), and a new `payments` row is created.
The old payment stays as EXPIRED in the database.

**Why it can't be removed:** Without EXPIRED, timed-out payments would
either stay as PENDING forever (how would the system know to allow a retry?)
or be marked as FAILED (but nothing failed — the gateway never rejected
anything). EXPIRED has specific business meaning: "the customer didn't act
in time." This is important for:
- **Retry flow:** The system knows the QR is no longer valid and a new one
  must be generated.
- **Analytics:** "35% of our ABA QR payments expire" signals a UX problem
  — maybe the timer is too short, the QR is hard to scan, or the payment
  screen is confusing.
- **Customer messaging:** "Payment expired" is a different message than
  "Payment failed" — it tells the customer the problem was timing, not their
  account.

**Typical duration:** Permanent. Terminal state for this payment attempt.

---

### `REFUNDED`

**Meaning:** The full amount of this payment attempt was refunded to the
customer. The money that was collected via this payment has been returned.
This is a terminal state.

**Who sets it:** System (when a full refund is processed for this specific
payment attempt, confirmed by the gateway or marked by the merchant for
cash refunds).

**What happens:**
- The `payments` row moves from SUCCEEDED to REFUNDED.
- The `gateway_data` JSONB column is updated with the refund confirmation
  from the gateway (or a merchant note for cash refunds).
- The system recalculates the bill's collected total:
  - If the bill was PAID and this refund drops collected total below the
    bill total, the bill may need manual intervention (void or re-collect).
  - The refund's effect on the bill is handled by business logic, not
    automatic bill status changes.
- A record is also created in the future `payment_refunds` table for audit
  and partial refund tracking.

**Real-world example:** A customer pays $8.00 via ABA QR for grilled
squid. The kitchen discovers they're out of squid. The order is cancelled.
The merchant initiates a full refund from the merchant portal. The platform
processes the refund through ABA PayWay. ABA confirms the refund. Payment
status → REFUNDED. The $8.00 is returned to the customer's account.

**Why it was added:** The previous design had no REFUNDED status — refunds
were entirely deferred to a future `payment_refunds` table. However, for
full refunds (the most common refund scenario), marking the payment itself
as REFUNDED provides:
- Clear visibility in the merchant portal ("this payment was refunded").
- Simpler queries for reconciliation (SUCCEEDED payments minus REFUNDED
  payments = net revenue).
- Accurate bill state recalculation.

**Partial refunds** are NOT tracked by this status. Partial refunds are
tracked in the future `payment_refunds` table. A payment that was partially
refunded stays SUCCEEDED — only full refunds move to REFUNDED.

**Typical duration:** Permanent. Terminal state.

---

## Part 2 — State machine

### ABA QR — happy path

```
INITIATED ──► PENDING ──► SUCCEEDED
           (QR generated)  (webhook + check-transaction confirms)
```

### Cash — happy path

```
INITIATED ──► PENDING ──► SUCCEEDED
           (bill presented) (merchant taps "Received cash")
```

### ABA QR — gateway call fails

```
INITIATED ──► FAILED
           (ABA API returns error or network timeout)
```

### ABA QR — gateway rejection after QR scan

```
INITIATED ──► PENDING ──► FAILED
           (QR generated)  (gateway returns error status)
```

### ABA QR — timeout

```
INITIATED ──► PENDING ──► EXPIRED
           (QR generated)  (5-minute QR validity window elapses)
```

### Customer cancels

```
INITIATED ──► CANCELLED     (cancel before QR generated)
INITIATED ──► PENDING ──► CANCELLED    (cancel after QR displayed)
```

### Full refund

```
INITIATED ──► PENDING ──► SUCCEEDED ──► REFUNDED
                                     (full refund processed)
```

### Full state machine diagram

```
INITIATED ──► PENDING ──► SUCCEEDED ──► REFUNDED  (full refund — terminal)
    │             │
    │             ├──► FAILED          (gateway rejected — terminal)
    │             │
    │             ├──► EXPIRED         (timeout — terminal)
    │             │
    │             └──► CANCELLED       (customer/merchant cancels — terminal)
    │
    ├──► FAILED                        (gateway call failed — terminal)
    │
    └──► CANCELLED                     (cancelled before gateway call — terminal)
```

### Valid transitions (complete list)

| From | To | Trigger |
|---|---|---|
| `INITIATED` | `PENDING` | Gateway contacted successfully; QR generated or cash bill presented |
| `INITIATED` | `FAILED` | Gateway call failed (network error, API error) |
| `INITIATED` | `CANCELLED` | Customer or merchant cancels before gateway is contacted |
| `PENDING` | `SUCCEEDED` | ABA webhook + check-transaction confirms status "00"; or merchant confirms cash received |
| `PENDING` | `FAILED` | ABA returns non-"00" status; or card authorization rejected (future) |
| `PENDING` | `EXPIRED` | ABA QR validity window (5 min) elapses with no webhook; or card authorization times out (future) |
| `PENDING` | `CANCELLED` | Customer taps "Cancel" while QR is displayed; or merchant cancels; or bill is voided |
| `SUCCEEDED` | `REFUNDED` | Full refund processed and confirmed by gateway (or merchant for cash) |

### Invalid transitions (these should never happen)

- **SUCCEEDED → PENDING** — Cannot re-pend a confirmed payment.
- **SUCCEEDED → FAILED** — Money was received. Cannot retroactively fail.
- **FAILED → SUCCEEDED** — A failed payment attempt is dead. To retry,
  create a new `payments` row.
- **FAILED → PENDING** — Same reason. No resurrection of failed attempts.
- **EXPIRED → SUCCEEDED** — An expired QR code cannot be scanned after
  expiry. ABA invalidates it server-side.
- **EXPIRED → PENDING** — No reactivation. Create a new attempt.
- **CANCELLED → anything** — Terminal. The customer chose to stop.
- **REFUNDED → anything** — Terminal. Money was returned.

---

## Part 3 — Payment verification and trust chain

### The ABA PayWay webhook verification pattern

This is the most security-critical flow in the payment system. ABA PayWay
does NOT sign its outbound webhooks with HMAC. The correct verification
pattern is "verify by calling back":

```
Step 1: Receive POST /webhooks/aba/callback
        Body: { tran_id, status, apv, payer_account }
        Warning: This payload is UNSIGNED — anyone could forge it.

Step 2: Look up payment in DB:
        SELECT * FROM payments
        WHERE reference = $tran_id
          AND status = 'PENDING'
          AND tenant_id = $tenant_id;
        → If not found: return 200 (ignore unknown tran_ids silently).

Step 3: Call ABA Check Transaction API (OUTBOUND, signed by platform):
        GET /check-transaction?tran_id={tran_id}
        Signed with HMAC-SHA512 using platform's api_key.
        → ABA responds with the authoritative payment status.

Step 4: Only if ABA confirms status "00":
        UPDATE payments SET status = 'SUCCEEDED', confirmed_at = NOW()
        WHERE id = $payment_id;

Step 5: Return HTTP 200 to ABA (regardless of outcome).
        ABA retries on non-200, so always return 200.
```

**Why check-transaction is mandatory:** Without it, a malicious actor could
POST `{ tran_id: "PA-x7k2m9p1", status: "00" }` to your webhook endpoint
and trick the system into confirming a payment that never happened. The
check-transaction call is the source of trust — it's a signed outbound
request from your server to ABA's server.

### Idempotency of the webhook handler

ABA may send the same webhook multiple times (retry on timeout). The handler
must be idempotent:

```
1. Receive webhook with tran_id
2. Look up payment: reference = tran_id
3. If payment.status != 'PENDING': return 200 (already processed)
4. If payment.status == 'PENDING': verify via check-transaction
```

The second delivery finds the payment already SUCCEEDED and returns 200
without re-processing. No duplicate kitchen tickets, no double charges.

### Cash payment trust model

Cash payments have no external verification. The trust model is:

```
1. Customer hands cash to merchant/staff
2. Staff counts the money
3. Staff taps "Received cash" in the kitchen app or merchant portal
4. Payment → SUCCEEDED
```

The "who confirmed" is tracked via `changed_by` in the audit trail (if
the payment transition is logged). For cash, the merchant is the trust
anchor — same as traditional cash registers.

### Multiple payment attempts per bill

When an ABA QR expires and the customer retries:

```
payments table for bill_001:
  payment_001: method=ABA_QR, status=EXPIRED,   reference="PA-a1b2c3"
  payment_002: method=ABA_QR, status=CANCELLED, reference="PA-d4e5f6"
  payment_003: method=ABA_QR, status=SUCCEEDED, reference="PA-g7h8i9"
```

Only `payment_003` succeeded. The bill has 3 payment rows — 1 expired,
1 cancelled, and 1 succeeded. This is by design — each row is an immutable
record of an attempt. We do not overwrite or reuse payment rows.

---

## Part 4 — What's NOT in this enum (and why)

| Omitted value | What it would mean | Why we skip it |
|---|---|---|
| `PARTIALLY_REFUNDED` | Some amount returned but not the full payment | Tracked in the future `payment_refunds` table, not as a payment status. A partially refunded payment stays SUCCEEDED. The `payment_refunds` table records the partial amount. |
| `AUTHORIZED` | Card pre-authorization hold (funds reserved but not captured) | Not needed at MVP. ABA QR is a direct debit, not auth+capture. CARD payments (future) may need this if using auth/capture flow. Could be added as a state between PENDING and SUCCEEDED. |
| `PROCESSING` | Payment is being processed by the gateway | INITIATED and PENDING cover this. INITIATED = "preparing to contact gateway." PENDING = "gateway contacted, waiting for response." Adding PROCESSING between them adds no value for ABA QR (processing is near-instant). |
| `DISPUTED` | Customer disputes the charge (chargeback) | Not applicable for ABA QR or cash. Card chargebacks (future) would likely be tracked via a separate dispute mechanism, not a payment status. |

### The partial refund approach — `payment_refunds` table

When partial refunds are implemented (post-MVP), the recommended schema is:

```sql
CREATE TABLE payment_refunds (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  payment_id      TEXT NOT NULL REFERENCES payments(id),
  amount_cents    INTEGER NOT NULL,      -- can be less than payment amount (partial)
  reason          TEXT,
  status          TEXT NOT NULL,          -- REQUESTED, APPROVED, PROCESSED, FAILED
  requested_by    TEXT REFERENCES users(id),
  processed_at    TIMESTAMP(3),
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

For full refunds, the `payments` row moves to REFUNDED AND a
`payment_refunds` record is created. For partial refunds, only the
`payment_refunds` record is created — the `payments` row stays SUCCEEDED.

---

## Part 5 — Relationship to other enums and tables

### PaymentStatus → BillStatus

| Payment event | Effect on bill |
|---|---|
| Payment → SUCCEEDED (total collected >= bill total) | Bill → PAID, `paid_at` set |
| Payment → SUCCEEDED (total collected < bill total) | Bill → PARTIALLY_PAID |
| Payment → FAILED | Bill stays OPEN or PARTIALLY_PAID (no change) |
| Payment → EXPIRED | Bill stays OPEN or PARTIALLY_PAID (no change) |
| Payment → CANCELLED | Bill stays OPEN or PARTIALLY_PAID (no change) |
| Payment → REFUNDED | Bill may need manual intervention (void or re-collect) |

**Key change from previous design:** Failed, expired, and cancelled payments
no longer cause the bill to revert. The bill stays in its current state.
Only SUCCEEDED payments move the bill forward.

### PaymentStatus → OrderStatus (for PAY_BEFORE)

| Payment event | Effect on order |
|---|---|
| Payment → SUCCEEDED (bill fully PAID) | Order is created as SUBMITTED (the order didn't exist before payment) |
| Payment → EXPIRED (all retries exhausted) | No order is created. Bill is VOIDED. Dine-in: `carts` row remains CONVERTED. Kiosk: localStorage cart simply expires with the browser. |
| Payment → FAILED (all retries exhausted) | No order is created. Bill is VOIDED. Dine-in: `carts` row remains CONVERTED. Kiosk: localStorage cart simply expires with the browser. |

"All retries exhausted" means the customer has abandoned the payment flow
entirely — they didn't tap "Try again" and the session timed out.

### PaymentStatus → OrderStatus (for PAY_AFTER)

No direct effect. PAY_AFTER orders are already SUBMITTED when the bill is
paid. Payment confirmation closes the session but doesn't change order
status.

### PaymentMethod → PaymentStatus interactions

| Method | INITIATED trigger | PENDING trigger | SUCCEEDED trigger | FAILED trigger | CANCELLED trigger | EXPIRED trigger |
|---|---|---|---|---|---|---|
| `ABA_QR` | Payment record created | QR code generated | Webhook + check-transaction confirms | Gateway error or API call fails | Customer taps cancel | 5-min QR window elapses |
| `CASH` | Payment record created | Bill presented to merchant | Merchant taps "Received cash" | N/A (cash doesn't fail) | Merchant cancels | N/A (cash doesn't expire) |
| `CARD` | Payment record created | Auth request sent (future) | Auth approved (future) | Auth declined (future) | Customer cancels (future) | Auth timeout (future) |

### payments table schema context

```sql
CREATE TABLE payments (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  bill_id      TEXT NOT NULL REFERENCES bills(id),
  method       "PaymentMethod" NOT NULL,
  status       "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
  amount_cents INTEGER NOT NULL,
  currency     "Currency" NOT NULL DEFAULT 'USD',
  reference    TEXT,         -- ABA tran_id (platform-generated, e.g. "PA-x7k2m9p1")
  gateway_data JSONB,        -- raw gateway response (ABA full response body)
  confirmed_at TIMESTAMP(3), -- set when SUCCEEDED
  created_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP(3) NOT NULL
);
```

Key observations:
- `reference` stores the `tran_id` sent to ABA — this is how webhooks
  are matched back to payment rows.
- `gateway_data` is a JSONB dump of the full gateway response. For ABA,
  this includes `apv` (approval code), `payer_account`, and the full
  check-transaction response. For cash, this is NULL.
- `confirmed_at` is only set when status = SUCCEEDED. It's the moment
  the payment was verified, not the moment the customer initiated it
  (that's `created_at`).
- Default status is now `INITIATED` (was `PENDING`). The payment moves
  to PENDING only after the gateway is successfully contacted.

---

## Part 6 — Decision summary

### Question: Why add INITIATED before PENDING?

**Answer:** INITIATED separates "record created" from "gateway contacted."
This matters because:
- If the ABA API call fails (network error, ABA is down), the payment
  stays INITIATED and can be immediately moved to FAILED. Without
  INITIATED, a failed API call would leave a PENDING payment waiting for
  a webhook that will never arrive.
- INITIATED serves as a concurrency lock — only one INITIATED or PENDING
  payment per bill at a time.
- It provides better observability: "payment record exists but gateway
  hasn't been called" is a distinct operational state from "QR is displayed
  and we're waiting for the customer."

### Question: Why add CANCELLED?

**Answer:** CANCELLED captures intentional customer action, which is
operationally different from timeout (EXPIRED) or rejection (FAILED):
- CANCELLED = "customer chose to stop" → possible UX issue with payment
  method selection, or customer changed their mind.
- EXPIRED = "customer didn't act in time" → possible UX issue with QR
  scanning or timer length.
- FAILED = "gateway rejected" → possible account issue or gateway problem.

The previous design merged cancellation into EXPIRED, which lost this
signal. A customer who taps "Cancel" 2 seconds after seeing the QR is
very different from one whose QR times out after 5 minutes.

### Question: Why add REFUNDED?

**Answer:** For full refunds (the most common refund type), marking the
payment as REFUNDED provides immediate visibility without querying the
`payment_refunds` table. It also simplifies reconciliation: net revenue =
SUM(SUCCEEDED payments) - SUM(REFUNDED payments). Partial refunds are
still tracked in the `payment_refunds` table — a partially refunded
payment stays SUCCEEDED.

### Question: Why not merge FAILED and EXPIRED?

**Answer:** Different root causes, different analytics signals, different
customer messaging:
- FAILED = gateway rejected the payment. Something went wrong with the
  customer's account, the gateway, or the network. Message: "Payment
  failed" (ការបង់ប្រាក់បរាជ័យ).
- EXPIRED = nothing happened. The customer didn't scan the QR in time.
  Message: "Payment expired" (បង់ប្រាក់ផុតកំណត់).

Operationally:
- High FAILED rate → investigate gateway issues, check ABA API health.
- High EXPIRED rate → improve payment UX (bigger QR, clearer instructions,
  longer timer, push notification reminder).

### What we decided

- **7 values: INITIATED, PENDING, SUCCEEDED, FAILED, CANCELLED, EXPIRED,
  REFUNDED.** Each has distinct meaning and analytics value.
- **INITIATED is the new default** (was PENDING). The payment record is
  created in INITIATED and moves to PENDING only after the gateway is
  successfully contacted.
- **CANCELLED was added** to distinguish intentional customer cancellation
  from timeout (EXPIRED) and rejection (FAILED).
- **REFUNDED was added** for full refunds. Partial refunds are tracked in
  the `payment_refunds` table.
- **All non-INITIATED/PENDING states are terminal** (except SUCCEEDED →
  REFUNDED for full refunds). No backward transitions. Retries create new
  payment rows.
- **Webhook verification uses check-transaction, not HMAC.** ABA PayWay
  does not sign outbound webhooks. The platform must verify every payment
  by calling ABA's check-transaction API with its own signed request.
- **Cash SUCCEEDED is merchant-attested.** There is no external verification
  for cash. The merchant's tap is the confirmation. This matches real-world
  cash register behavior.
