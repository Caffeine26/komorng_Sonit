# OrderCancellationReason — Design Discussion & Decision

**Date:** 2026-04-24
**Status:** ✅ Applied alongside the orders enterprise upgrade
**Affects:** `orders.cancellation_reason`
**Sibling enum:** [`OrderStatus`](order-status.md) — this enum only takes a value when `OrderStatus = 'CANCELLED'`.

---

## The enum

```sql
CREATE TYPE "OrderCancellationReason" AS ENUM (
  'CUSTOMER_REQUEST',
  'OUT_OF_STOCK',
  'KITCHEN_OVERLOADED',
  'PAYMENT_FAILED',
  'DUPLICATE',
  'STAFF_ERROR',
  'SYSTEM_TIMEOUT'
);
```

`orders.cancellation_reason` is nullable. The CHECK constraint `orders_cancellation_reason_only_when_cancelled` guarantees it is set only when `status = 'CANCELLED'`.

---

## Part 1 — Why this enum exists

A single `CANCELLED` order-status value covers the lifecycle correctly but conflates very different operational situations. From a merchant's viewpoint, these demand different responses:

| Situation | What the merchant should do |
|---|---|
| Customer asked to cancel before kitchen started | Routine — log it |
| Kitchen ran out of beef and cancelled an order | Investigate supply chain |
| Staff intentionally cancelled to manage a backed-up kitchen | Capacity planning signal |
| PAY_AFTER bill couldn't be settled | Collections / fraud signal |
| Accidental double-submit caught and rolled back | App-bug signal if frequent |
| Wrong table or wrong items entered by staff | Training signal |
| 24h cleanup found a stale order | Hygiene issue |

If all seven looked identical in the data, "12 cancellations today" would be an alarm with no signal. Splitting `OrderStatus` into seven values (`CANCELLED_BY_CUSTOMER`, `CANCELLED_BY_KITCHEN`, …) would have leaked operational metadata into the lifecycle model and forced every status check to enumerate variants forever. Recording the reason in a sibling column keeps the lifecycle clean.

---

## Part 2 — Each value explained

### `CUSTOMER_REQUEST`

**Meaning:** The customer asked to cancel — either through the storefront cancel button (if implemented) or by telling staff in person.

**Who sets it:** Staff (tapping "Cancel" in the merchant portal after the customer asks) or the storefront cancel flow.

**`cancelled_by_id`:** Set when staff process the cancellation; NULL if the customer self-services through the storefront (anonymous flow).

**Real-world example:** A customer at "Brown Coffee" places an order for a Caramel Latte then realises they're late for a meeting. They ask the cashier to cancel. The cashier taps "Cancel" → reason `CUSTOMER_REQUEST`, `cancelled_by_id` = cashier's user ID.

**Operational meaning:** Routine. High counts may indicate slow kitchen response (customers losing patience).

---

### `OUT_OF_STOCK`

**Meaning:** The kitchen cannot fulfill an item in the order because of an ingredient shortage.

**Who sets it:** Kitchen staff via the kitchen-display app, or merchant via the portal.

**`cancelled_by_id`:** The staff member who confirmed the shortage.

**Real-world example:** "Sach Ko Ang" runs out of premium wagyu. An order containing wagyu is cancelled with reason `OUT_OF_STOCK`. The merchant follows up with the customer to suggest alternatives.

**Operational meaning:** Negative signal. Clusters point at supply-chain issues; specific items repeating point at portion sizing or popular-item under-stocking.

---

### `KITCHEN_OVERLOADED`

**Meaning:** The merchant proactively cancelled the order to manage a backed-up queue.

**Who sets it:** Merchant via portal.

**`cancelled_by_id`:** The merchant.

**Real-world example:** A festival surge floods "Kuy Teav Phnom Penh" with 30 orders simultaneously. The merchant cancels the lowest-priority orders to keep wait times for the remaining ones reasonable, with apologies and full refunds.

**Operational meaning:** Capacity-planning signal. Frequent occurrences indicate the kitchen is under-staffed for peak hours.

---

### `PAYMENT_FAILED`

**Meaning:** A `PAY_AFTER` order's bill could not be settled — the customer left without paying, the payment gateway rejected all retry attempts, or the bill was force-voided.

**Who sets it:** System — the payment-failure handler.

**`cancelled_by_id`:** NULL (system action). The original `created_by_id` and the underlying payment failure are both auditable through their own tables.

**Real-world example:** A customer at "Sach Ko Ang" finishes the meal, taps "Request bill," but their ABA QR fails three times. They walk out. Staff close the bill as VOIDED, and the linked orders are cancelled with reason `PAYMENT_FAILED`.

**Operational meaning:** Walkaway / loss event. High counts indicate fraud or poor payment UX.

---

### `DUPLICATE`

**Meaning:** Two near-identical orders were created in quick succession — typically a customer double-tap on "Place Order" or a network retry. The duplicate is cancelled to keep the kitchen from preparing the same food twice.

**Who sets it:** System — the dedup handler (typically catches it via `idempotency_keys` but may also be invoked manually).

**`cancelled_by_id`:** Usually NULL (system); set if a staff member manually flagged the duplicate.

**Real-world example:** A customer's network drops mid-tap. The storefront retries; the second request creates an order before the idempotency lookup completes. The dedup sweep cancels the later row.

**Operational meaning:** App-bug signal if frequent. Idempotency keys should normally prevent this — clusters suggest a UX or backend issue.

---

### `STAFF_ERROR`

**Meaning:** A staff member entered the order incorrectly — wrong table, wrong items, wrong customer — and is cancelling to re-enter it.

**Who sets it:** Staff via the merchant portal.

**`cancelled_by_id`:** The staff member who made the error.

**Real-world example:** Pavi the waiter accidentally enters Grandmother Lina's order for Table 5 onto Table 6. He notices, taps "Cancel" with reason `STAFF_ERROR`, and re-enters it correctly on Table 5.

**Operational meaning:** Training signal. Per-staff `STAFF_ERROR` counts identify staff who need more training or tools that need a clearer UX.

---

### `SYSTEM_TIMEOUT`

**Meaning:** The 24h background cleanup job cancelled a stale order that was still in `SUBMITTED` or `PREPARING` long after the parent session was closed.

**Who sets it:** System — the BullMQ cleanup job.

**`cancelled_by_id`:** NULL.

**Real-world example:** A merchant's tablet ran out of battery overnight; the next morning they find an order from yesterday at 9 PM still in `PREPARING`. The cleanup sweep marks it `CANCELLED` with reason `SYSTEM_TIMEOUT`.

**Operational meaning:** Hygiene. Should be rare; persistent counts indicate operational issues (devices powering off, kitchen staff not closing tickets).

---

## Part 3 — Decision matrix

| Reason | `cancelled_by_id` | Trigger | Frequency | Operational meaning |
|---|---|---|---|---|
| `CUSTOMER_REQUEST` | Usually staff (NULL if self-service) | Customer-driven | Common | Routine; investigate if clustering |
| `OUT_OF_STOCK` | Staff | Kitchen-driven | Occasional | Supply-chain signal |
| `KITCHEN_OVERLOADED` | Merchant | Capacity action | Rare | Capacity planning |
| `PAYMENT_FAILED` | NULL (system) | Payment-flow side effect | Rare | Walkaway / fraud signal |
| `DUPLICATE` | NULL (system) usually | Dedup handler | Very rare | App-bug signal |
| `STAFF_ERROR` | Staff | Manual re-entry | Occasional | Training signal |
| `SYSTEM_TIMEOUT` | NULL | 24h cleanup | Very rare | Hygiene issue |

---

## Part 4 — Why these seven and not others

### Considered and rejected

| Rejected value | Why |
|---|---|
| `MERCHANT_REJECTED` | Vague — every other reason is a more specific case of "merchant rejected." |
| `FRAUD_SUSPECTED` | At MVP, fraud detection is not a feature. If added, the cancellation will land as `PAYMENT_FAILED` or a manual `CUSTOMER_REQUEST`. |
| `KITCHEN_CLOSED` | Sub-case of `KITCHEN_OVERLOADED`. End-of-day order rejections fall under the same operational signal. |
| `WRONG_LOCATION` | Sub-case of `STAFF_ERROR`. |
| `ITEM_DISCONTINUED` | Sub-case of `OUT_OF_STOCK` (permanent rather than temporary). The merchant should also delete the item from the menu. |
| `REFUNDED` | Refund is a *payment* event, not a cancellation reason. The order may be `COMPLETED` and still receive a partial refund through `payments`. Cancellation and refund are independent. |

### Why no separate "system" vs "user" axis

The reason itself usually tells you which (`CUSTOMER_REQUEST` and `STAFF_ERROR` are user; `PAYMENT_FAILED`, `DUPLICATE`, `SYSTEM_TIMEOUT` are system). The `cancelled_by_id` column makes the actor explicit. A second enum dimension would be redundant.

---

## Part 5 — Future evolution

This enum is designed to grow non-disruptively:

- **Add a new reason → ALTER TYPE … ADD VALUE.** Existing rows are unaffected (column is nullable).
- **Phase 2 may add `MARKETPLACE_REJECTED`** for customers who place an order through the future mobile-app marketplace and have it rejected by the chosen restaurant.
- **Phase 2 may add `DELIVERY_FAILED`** for pickup/delivery flows where the courier or pickup never happened.

---

## Part 6 — Related tables and enums

| Symbol | Relationship | Notes |
|---|---|---|
| `orders.cancellation_reason` | Direct user | Nullable column, set only when `status = 'CANCELLED'` |
| `orders.cancelled_by_id` | Sibling | Identifies the staff member when applicable |
| `orders.cancelled_at` | Sibling | Timestamp when the cancellation fired |
| `OrderStatus` | Parent enum | This reason is meaningful only when `status = 'CANCELLED'` |
| `users` | FK target via `cancelled_by_id` | Identifies the cancelling staff member |
| `order_status_history` | Sibling record | Captures the full transition (from-status → CANCELLED) with timestamp and actor |
| `audit_logs` | Sibling record | Optional richer audit row for high-stakes cancellations |
| `payments` | Trigger source for `PAYMENT_FAILED` | Payment-failure handler propagates to order cancellation |
