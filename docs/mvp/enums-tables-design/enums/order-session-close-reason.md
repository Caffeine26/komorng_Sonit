# Enum Reference: `OrderSessionCloseReason`

| Property | Value |
|---|---|
| **Used by** | `order_sessions.closed_reason` |
| **Domain** | Order |
| **Pattern** | Sibling-enum to `OrderSessionStatus` |
| **Introduced** | 2026-04-25 |

---

## Part 1 — What this enum is

`OrderSessionCloseReason` records **why** a session was closed. It is a
sibling to `OrderSessionStatus`: the lifecycle enum says *whether* the
session is open, this enum says *what ended it*. They are gated by a
CHECK constraint:

```sql
CONSTRAINT order_sessions_closed_reason_only_when_closed
  CHECK ((status = 'CLOSED') = (closed_reason IS NOT NULL))
```

Reason set ⇔ status = CLOSED. The database itself rejects any drift.

---

## Part 2 — Values

```sql
CREATE TYPE "OrderSessionCloseReason" AS ENUM (
  'PAID',
  'STAFF_FORCE_CLOSED',
  'AUTO_TIMEOUT_24H',
  'WALKED_AWAY'
);
```

### `PAID`

The bill was paid in full. The normal happy-path closure.

- **Triggered by:** the payment-confirmation handler (after the final
  `payments.status = SUCCEEDED` row brings `bills.amount_paid_cents`
  up to `bills.total_cents`).
- **`closed_by_id`:** typically NULL for ABA QR (self-service); the
  cashier's `users.id` for cash payments.
- **`closed_at`:** set to the payment confirmation timestamp.

### `STAFF_FORCE_CLOSED`

Staff manually closed the session from the merchant portal for any
non-walkaway reason. Examples:

- Customer paid in cash via informal arrangement and the merchant just
  wants the session off the floor plan.
- Session was opened by mistake (e.g., wrong QR scanned, double-tap on
  "open session").
- Group decided to leave but paid a different way — covered by another
  patron, comped by the manager, etc.

- **Triggered by:** "Close Session" button in the merchant portal.
- **`closed_by_id`:** the staff member who clicked. Required (no NULL).
- **Distinct from `WALKED_AWAY`** because analytics needs to separate
  "revenue leak" from "operational housekeeping."

### `AUTO_TIMEOUT_24H`

The platform-wide background cleanup job closed a session whose
`last_activity_at` is older than 24 hours.

- **Triggered by:** a BullMQ job that runs hourly:
  ```sql
  UPDATE order_sessions
  SET    status = 'CLOSED',
         closed_at = NOW(),
         closed_reason = 'AUTO_TIMEOUT_24H'
  WHERE  status = 'ACTIVE'
    AND  last_activity_at < NOW() - INTERVAL '24 hours';
  ```
- **`closed_by_id`:** NULL (system, not a user).
- **Why 24h?** The 2026-04-25 design uses `last_activity_at`, not
  `opened_at` — so a session that's been ordering steadily all evening
  isn't garbage-collected. 24h of *no activity* really does mean the
  customer walked away or the merchant forgot.

### `WALKED_AWAY`

Customer left without paying; staff acknowledged the loss.

- **Triggered by:** "Mark as walkaway" button in the merchant portal.
- **`closed_by_id`:** the staff member who clicked. Required.
- **Distinct from `STAFF_FORCE_CLOSED`:** this code explicitly indicates
  unrecovered revenue. Powers the "walkaways this week" analytics
  report.

---

## Part 3 — Real-world scenarios

### Scenario 1: Normal dine-in payment

A group at Table 5 finishes their meal and pays via ABA QR. The payment
webhook arrives, the bill moves to PAID, and the session-close handler
runs:

```sql
UPDATE order_sessions
SET    status = 'CLOSED',
       closed_at = NOW(),
       closed_reason = 'PAID',
       version = version + 1
WHERE  tenant_id = $1 AND id = $2 AND version = $3;
```

`closed_by_id` is NULL — the customer paid themselves via QR.

### Scenario 2: Customer walks out without paying

A solo customer at a coffee stall finishes their drink and walks away
without paying. After 10 minutes the staff realizes and taps "Mark as
walkaway":

```sql
UPDATE order_sessions
SET    status = 'CLOSED',
       closed_at = NOW(),
       closed_reason = 'WALKED_AWAY',
       closed_by_id = $staff_id,
       version = version + 1
WHERE  tenant_id = $1 AND id = $2 AND version = $3;
```

End-of-day report: `SELECT SUM(total_cents) FROM order_sessions WHERE
closed_reason = 'WALKED_AWAY' AND closed_at::date = CURRENT_DATE` →
walkaway loss.

### Scenario 3: Staff opened a session by mistake

A new server accidentally opened a session for Table 3 by tapping the
wrong QR. They realize before any orders are placed and immediately
close it:

```sql
UPDATE order_sessions
SET    status = 'CLOSED',
       closed_at = NOW(),
       closed_reason = 'STAFF_FORCE_CLOSED',
       closed_by_id = $staff_id,
       version = version + 1
WHERE  tenant_id = $1 AND id = $2 AND version = $3;
```

The session has `total_cents = 0`, `order_count = 0`. It shows up in
audit logs as a benign housekeeping event, not a revenue leak.

### Scenario 4: Customer left, staff forgot to close

A merchant closes shop for the night without manually closing Table 7's
session. The next morning at 9 AM, the cleanup job runs:

```sql
UPDATE order_sessions
SET    status = 'CLOSED',
       closed_at = NOW(),
       closed_reason = 'AUTO_TIMEOUT_24H'
WHERE  status = 'ACTIVE'
  AND  last_activity_at < NOW() - INTERVAL '24 hours';
```

The merchant reviews the audit log and either marks the bill paid (if
they remember the cash) or accepts it as a walkaway via a separate
voiding workflow.

---

## Part 4 — Design decisions

### Why a sibling enum, not a richer status enum

The same reasoning that drove `OrderCancellationReason` (sibling to
`OrderStatus`) and `CartAbandonedReason` (sibling to `CartStatus`):

1. **Lifecycle queries stay simple.** "Is this session active?" is
   `WHERE status = 'ACTIVE'`. Adding `EXPIRED`, `WALKED_AWAY`,
   `MERGED` as status values bloats every consumer.
2. **The vocabulary can evolve independently.** Future reasons
   (`MERGED_INTO_OTHER`, `STAFF_ERROR_DUPLICATE`) are pure additive
   enum changes that don't affect anyone reading `status`.
3. **Analytics gets first-class queries.** Filtering on
   `closed_reason` is opt-in and indexable if needed.

### Why these four values, not more

Started from real operational scenarios:

- Normal closure path (`PAID`).
- Manual operational housekeeping (`STAFF_FORCE_CLOSED`).
- Inactivity safety net (`AUTO_TIMEOUT_24H`).
- Revenue-leak audit trail (`WALKED_AWAY`).

`MERGED` was considered — when two parties combine tables, sessions
could merge — but the user explicitly deferred the merge feature
(2026-04-25, see `discussion_and_decision.md`). Adding the enum value
now without the feature would be premature.

### Why `closed_by_id` is enforced application-side, not via CHECK

The CHECK could be `(closed_reason = 'AUTO_TIMEOUT_24H') OR
(closed_by_id IS NOT NULL)` — i.e., human-driven closures must record
the actor. This is correct semantically but the database doesn't know
about the cleanup-job system identity. Application enforces this in
the `OrderSessionService.close()` method; CHECK isn't worth the
complexity.

---

## Part 5 — Related

| Doc | Relationship |
|---|---|
| `tables/order-sessions.md` | The host table |
| `enums/order-session-status.md` | The lifecycle enum (sibling) |
| `enums/order-cancellation-reason.md` | Same pattern at the order level |
| `enums/cart-abandoned-reason.md` | Same pattern at the cart level |
