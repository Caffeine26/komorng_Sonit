# CartAbandonedReason — Design Discussion & Decision

**Date:** 2026-04-24
**Status:** ✅ Applied alongside the carts column additions
**Affects:** `carts.abandoned_reason`
**Sibling enum:** [`CartStatus`](cart-status.md) — this enum only takes a value when `CartStatus = 'ABANDONED'`.

---

## The enum

```sql
CREATE TYPE "CartAbandonedReason" AS ENUM (
  'SESSION_PAID',
  'SESSION_FORCE_CLOSED',
  'STAFF_RESET',
  'SESSION_TIMEOUT',
  'CUSTOMER_DISMISSED'
);
```

`carts.abandoned_reason` is nullable. The CHECK constraint `carts_abandoned_reason_only_when_abandoned` guarantees it is set if and only if `status = 'ABANDONED'`.

---

## Part 1 — Why this enum exists

A single `ABANDONED` cart-status value covers the lifecycle correctly (item added, never ordered) but conflates very different operational situations. From a merchant's viewpoint, these are not the same event:

| Situation | What the merchant should do |
|---|---|
| Guest paid the bill, left a half-built dessert cart | Nothing — happy outcome, useful product-feedback signal |
| Merchant force-closed an unpaid walkaway table | Investigate the walkaway / loss |
| Staff explicitly reset a wrong-table scan | Confirm the table is ready for the next customer |
| 24h background cleanup swept a forgotten session | Operational hygiene; rare in healthy stores |
| Future: customer tapped "clear cart" on the storefront | Lightweight UX signal |

If all five looked identical in the data, dashboards could not segment them and merchants could not distinguish "high abandonment because guests don't like dessert pricing" from "high abandonment because we have a walkaway problem." Splitting `CartStatus` into five values would have leaked operational metadata into the lifecycle model and forced every status check to enumerate variants forever. Recording the trigger in a sibling column keeps the lifecycle clean.

---

## Part 2 — Each value explained

### `SESSION_PAID`

**Meaning:** The dine-in session closed because the bill was paid, but this cart was still ACTIVE (had unsubmitted items). The cart is marked ABANDONED with this reason as a side-effect of session close.

**Who sets it:** System — the session-close handler, when `BillStatus → PAID` triggers `OrderSessionStatus → CLOSED`.

**Set with:** `closed_by_id IS NULL` (system action, not staff).

**Real-world example:** Group at Table 5 ate appetizers, mains, and drinks (each round CONVERTED). During dessert browsing, the bill arrived and they paid without submitting the dessert round. The dessert cart is `ABANDONED` with reason `SESSION_PAID`. Analytics: "guests considered dessert but didn't order — perhaps move dessert recommendation earlier in the meal."

**Operational meaning:** Benign. Not a problem to fix.

---

### `SESSION_FORCE_CLOSED`

**Meaning:** The merchant manually closed the dine-in session from the portal — typically because a table walked away without paying, or staff needed to clear a stuck session.

**Who sets it:** System — the session-close handler, when a merchant action transitions `OrderSessionStatus → CLOSED` outside the bill-paid path.

**Set with:** `closed_by_id IS NULL` (the staff action targets the *session*, not the cart; the cart is closed as a side effect).

**Real-world example:** A group at Table 8 left without requesting the bill (walkaway). Staff confirmed the table is empty and closed the session from the merchant portal. Any ACTIVE cart on that session is `ABANDONED` with reason `SESSION_FORCE_CLOSED`.

**Operational meaning:** Negative signal. High counts may indicate walkaway problems, slow staff response, or kitchen delays driving impatient guests away.

---

### `STAFF_RESET`

**Meaning:** A staff member explicitly abandoned this specific cart — usually because the wrong customer scanned the table QR, the cart contains test items, or the table is being reset for a new party while the session itself stays open.

**Who sets it:** Staff (via merchant portal "Reset cart" action).

**Set with:** `closed_by_id = users.id` of the staff member. The CHECK constraint `carts_closed_by_only_for_staff_reset` enforces this — `closed_by_id` is allowed only with this reason.

**Real-world example:** A new customer at "Sach Ko Ang" scans Table 5 by mistake (they meant Table 6) and starts adding items. Lina, the waiter, taps "Reset cart" on Table 5 in the portal. The cart is `ABANDONED` with reason `STAFF_RESET`, `closed_by_id = 'usr_lina_staff'`. The next customer at Table 5 starts a fresh ACTIVE cart in the same session.

**Operational meaning:** Routine cleanup. The audit trail (who reset what, when) supports dispute resolution and staff training.

---

### `SESSION_TIMEOUT`

**Meaning:** The 24h background cleanup job closed an abandoned session, sweeping any open cart along with it. Safety net for sessions that no one explicitly closed.

**Who sets it:** System — the BullMQ cleanup job.

**Set with:** `closed_by_id IS NULL`.

**Real-world example:** A small kiosk forgot to close out at end-of-day. A customer's cart from yesterday at 8 PM is still ACTIVE today at 8 AM. The 24h sweep marks the parent session CLOSED and the cart ABANDONED with reason `SESSION_TIMEOUT`.

**Operational meaning:** Hygiene. Should be rare; persistent counts indicate staff are not closing sessions properly.

---

### `CUSTOMER_DISMISSED`

**Meaning:** The customer explicitly cleared the shared cart from the storefront (e.g., a "Clear all items" button, or a "Start over" flow).

**Who sets it:** System — invoked from the storefront when the customer (or last device in the session) chooses to discard the cart.

**Set with:** `closed_by_id IS NULL` (no staff involvement).

**Status:** **Reserved for post-MVP.** No current storefront button maps to this; included for forward-compatibility so we don't migrate the enum later. Listed today so future dashboards have a stable category.

**Operational meaning:** Customer-driven UX signal — useful when the storefront grows a "clear cart" affordance.

---

## Part 3 — Decision matrix

| Reason | `closed_by_id` | Trigger | Frequency | Operational meaning |
|---|---|---|---|---|
| `SESSION_PAID` | NULL | System — bill paid | Common | Benign |
| `SESSION_FORCE_CLOSED` | NULL | System — merchant closes session | Occasional | Negative |
| `STAFF_RESET` | `users.id` (required) | Staff — "Reset cart" | Occasional | Routine cleanup |
| `SESSION_TIMEOUT` | NULL | System — 24h sweep | Rare | Hygiene issue |
| `CUSTOMER_DISMISSED` | NULL | System — storefront action | Post-MVP | UX signal |

---

## Part 4 — Why these five and not others

### Considered and rejected

| Rejected value | Why |
|---|---|
| `PRICE_TOO_HIGH` / `OUT_OF_STOCK` | These are *causes inferred from analytics* on the cart contents, not transitions the system itself can detect at close time. Data-mine them from `cart_items`, don't model them. |
| `MERGED` | Cart merging is not a feature (Option A is one shared cart per session). If post-MVP merging arrives, add then. |
| `CONVERTED_PARTIALLY` | Carts are atomic — they convert as a whole or not at all. There is no "partial submit" flow. |
| `EXPIRED` (separate from `SESSION_TIMEOUT`) | Carts have no independent expiry; they live and die with their session. The 24h sweep IS the timeout. |
| `STAFF_VOIDED` (distinct from reset) | "Voided" implies a financial dimension that doesn't apply to carts (no money has moved). Reset covers it. |

### Why `STAFF_RESET` is the only reason allowed to set `closed_by_id`

The CHECK constraint `carts_closed_by_only_for_staff_reset` prevents the column from drifting into a generic "who touched this row" field. The other four reasons are system actions; recording a user there would be misleading. If a future requirement needs to track *which session-close action a staff member triggered*, that belongs on the `order_sessions` row (`order_sessions.closed_by_id`), not on every child cart.

---

## Part 5 — Future evolution

This enum is designed to grow non-disruptively:

- **Add a new reason → ALTER TYPE … ADD VALUE.** Existing rows are unaffected (column is nullable).
- **Promote a reason to require accountability** → loosen the existing CHECK constraint to allow `closed_by_id` for that reason too.
- **Phase 2 (mobile app, marketplace) → may add `CUSTOMER_ACCOUNT_CLOSED`** for carts owned by an account that was deleted.

---

## Part 6 — Related tables and enums

| Symbol | Relationship | Notes |
|---|---|---|
| `carts.abandoned_reason` | Direct user | Nullable column constrained to be set only when `status = 'ABANDONED'` |
| `carts.closed_by_id` | Sibling | Linked semantically: `STAFF_RESET` requires this, others forbid it |
| `CartStatus` | Parent enum | This reason is meaningful only when `status = 'ABANDONED'` |
| `OrderSessionStatus` | Trigger source | Most reasons fire as a side effect of `OrderSessionStatus → CLOSED` |
| `users` | FK target via `closed_by_id` | Identifies the staff member for `STAFF_RESET` |
| `audit_logs` | Sibling record | A redundant audit row may be written when `STAFF_RESET` fires, capturing payload details beyond what fits on `carts` |
