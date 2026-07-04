# SubscriptionStatus — Design Discussion & Decision

**Date:** 2026-04-09
**Status:** ✅ Kept all 6 values — each is justified
**Affects:** `subscriptions` table
**MVP note:** Subscriptions are stubbed for MVP — no enforcement. This enum
exists so the schema is ready when billing is wired in v1.1+.

---

## The enum

```sql
CREATE TYPE "SubscriptionStatus" AS ENUM (
  'PENDING',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELLED',
  'EXPIRED'
);
```

---

## Part 1 — Each value explained in detail

### `PENDING`

**Meaning:** Subscription record created but not yet activated. Waiting for
the first payment to succeed.

**Who sets it:** System (default on creation).

**What happens to the tenant:**
- Tenant can access the merchant portal for setup (same as `TenantStatus = DRAFT`).
- Storefront is NOT live — no orders can flow.
- No billing cycle has started.

**Real-world example:** Tenant owner picks the "Growth" plan during
onboarding → enters payment details → system creates the subscription as
PENDING → payment gateway processes the first charge → on success, status
moves to ACTIVE.

**Why it can't be removed:** Without PENDING, you'd set the subscription to
ACTIVE at creation — granting full access before the first payment succeeds.
A declined card would mean free access until you detect the failure.

**Typical duration:** Seconds to minutes (payment processing time). If the
first payment fails, the subscription stays PENDING and the tenant is
prompted to update their payment method.

---

### `ACTIVE`

**Meaning:** Subscription is current and fully paid. The tenant has access to
all features included in their plan.

**Who sets it:** System (after successful payment — first or recurring).

**What happens to the tenant:**
- Full access to all plan features.
- Storefront is live (assuming `TenantStatus = ACTIVE`).
- Orders flow. Kitchen operates. Reports available.
- Billing cycle runs automatically (monthly or annual).

**Real-world example:** Everything is working. The tenant is paying, the
platform is delivering value. The happy path.

---

### `PAST_DUE`

**Meaning:** A recurring payment has failed, but the tenant is still within
the grace period. The platform is actively trying to collect payment (dunning).

**Who sets it:** System (automatically when a scheduled payment fails).

**What happens to the tenant:**
- **Access is preserved** — the tenant continues operating normally.
- The merchant portal shows a warning banner: "Payment failed. Please update
  your payment method."
- Dunning emails are sent on a schedule (see dunning flow below).
- The system retries the payment automatically (e.g., day 1, day 3, day 7).

**Real-world example:** The tenant's credit card expired last month. The
monthly charge on April 1st failed. The subscription moves to PAST_DUE.
The tenant gets an email: "Your payment failed. Please update your card."
They have 14 days to fix it before being SUSPENDED.

**Why it can't be removed:** Without PAST_DUE, a failed payment would either:
- Immediately SUSPEND the tenant (too harsh — one declined charge kills their
  business for the day, even though it might be a temporary card issue), or
- Stay ACTIVE (too lenient — you're providing free service with no urgency
  for the tenant to fix their payment method).

PAST_DUE is the critical grace period. It's the difference between losing a
customer over a temporary card decline vs recovering the payment and keeping
them. **Most SaaS churn reduction happens in this state** — good dunning
flows recover 30-50% of failed payments.

**Typical duration:** 7-14 days (configurable grace period).

---

### `SUSPENDED`

**Meaning:** The grace period has expired and payment has still not been
recovered. The platform has restricted the tenant's access.

**Who sets it:** System (automatically when the PAST_DUE grace period expires
without successful payment) or Platform Admin (manual intervention for policy
violations, abuse, etc.).

**What happens to the tenant:**
- Storefront may be degraded: still visible, but new orders may be blocked
  or premium features disabled.
- Merchant portal shows a hard block: "Your subscription is suspended.
  Update your payment method to restore access."
- Kitchen app may go read-only (can view existing tickets but not accept new ones).
- **Data is fully retained** — nothing is deleted.
- If the tenant pays, status moves back to ACTIVE immediately.

**Real-world example:** The tenant ignored 3 dunning emails over 14 days.
On day 15, the system moves them to SUSPENDED. Their storefront shows
"temporarily closed" to customers. The tenant calls support, updates their
card, the overdue amount is charged, and they're back to ACTIVE within minutes.

**Why it can't be merged with CANCELLED:**
- SUSPENDED = involuntary, recoverable. "We cut you off — pay us and come back."
- CANCELLED = voluntary or terminal. "You chose to leave" or "We've terminated you."
- Different business meaning, different customer communication, different
  reactivation flow.

**Typical duration:** Days to weeks. After 30-60 days of SUSPENDED with no
response, the system (or admin) may move to CANCELLED.

---

### `CANCELLED`

**Meaning:** The subscription has been explicitly terminated. No further
billing. The tenant's access reverts to the free tier (if one exists) or is
removed entirely.

**Who sets it:**
- Tenant owner (voluntary cancellation from the merchant portal)
- Platform admin (forced termination for policy violations, fraud, etc.)
- System (automatic after prolonged SUSPENDED state, per retention policy)

**What happens to the tenant:**
- All paid features are disabled immediately (or at end of current billing
  period, depending on cancellation policy).
- Tenant may revert to a free/starter plan if one exists.
- If no free plan: storefront goes offline, `TenantStatus` may move to
  ARCHIVED.
- **Data is retained** per the data retention policy — the tenant can
  resubscribe and get their data back within the retention window.

**Real-world example 1 (voluntary):** Tenant owner decides to close their
shop. They go to Settings → Subscription → Cancel. The subscription moves to
CANCELLED at the end of the current billing period.

**Real-world example 2 (involuntary):** After 45 days in SUSPENDED state
with no response to emails, the system automatically moves to CANCELLED.
The storefront goes offline.

**Typical duration:** Terminal state. To resubscribe, the tenant creates a
new subscription record (PENDING → ACTIVE).

---

### `EXPIRED`

**Meaning:** The subscription reached its natural `ends_at` date without
being renewed. Nobody actively cancelled — the term simply ran out.

**Who sets it:** System (automatically when `ends_at` is reached and no
renewal has been processed).

**What happens to the tenant:** Same as CANCELLED — paid features disabled,
revert to free tier or go offline.

**Real-world example:** Tenant signed up for a 1-year annual plan on
2026-01-01. The plan's `ends_at` is 2027-01-01. On that date, if no renewal
payment has been processed, the subscription moves to EXPIRED.

**Why it's distinct from CANCELLED:**
- CANCELLED = someone actively pressed "cancel" or admin terminated.
  This is **voluntary churn** or **forced churn**.
- EXPIRED = nobody did anything, the plan just ran out.
  This is **passive churn** (non-renewal).

For analytics, these are different signals:
- High CANCELLED rate → something is wrong (price, value, competition).
- High EXPIRED rate → your renewal flow is broken (didn't send reminders,
  payment method wasn't updated, renewal UX is confusing).

**Can it be merged into CANCELLED?** Technically yes — the downstream effect
(no access) is the same. You'd lose the churn-type distinction. For MVP this
doesn't matter (subscriptions aren't enforced). Keeping it costs nothing and
preserves the distinction for when analytics matter.

---

## Part 2 — State machine

### The happy path

```
PENDING ──► ACTIVE ──► ACTIVE ──► ACTIVE ──► ...
         (1st pay)   (renew)    (renew)
```

### Payment failure → recovery

```
ACTIVE ──► PAST_DUE ──► ACTIVE
         (pay fail)    (pay recovered)
```

### Payment failure → suspension → recovery

```
ACTIVE ──► PAST_DUE ──► SUSPENDED ──► ACTIVE
         (pay fail)   (grace ends)   (pay recovered)
```

### Payment failure → suspension → cancellation

```
ACTIVE ──► PAST_DUE ──► SUSPENDED ──► CANCELLED
         (pay fail)   (grace ends)   (retention expired)
```

### Voluntary cancellation

```
ACTIVE ──► CANCELLED
         (tenant cancels)
```

### Natural expiry (fixed-term plans)

```
ACTIVE ──► EXPIRED
         (ends_at reached, no renewal)
```

### Full state machine diagram

```
                    ┌──────────────────────────────┐
                    │                              │
                    ▼                              │
PENDING ──► ACTIVE ──► PAST_DUE ──► SUSPENDED ──► CANCELLED
              │                         │              ▲
              │                         │              │
              │                         └──► ACTIVE ───┘
              │                        (pay recovered)
              │
              ├──► CANCELLED  (voluntary cancel)
              │
              └──► EXPIRED    (fixed-term ended)
```

### Valid transitions (complete list)

| From | To | Trigger |
|---|---|---|
| `PENDING` | `ACTIVE` | First payment succeeds |
| `PENDING` | `CANCELLED` | First payment fails permanently / tenant abandons |
| `ACTIVE` | `PAST_DUE` | Recurring payment fails |
| `ACTIVE` | `CANCELLED` | Tenant voluntarily cancels |
| `ACTIVE` | `EXPIRED` | Fixed-term `ends_at` reached without renewal |
| `PAST_DUE` | `ACTIVE` | Payment recovered (retry or manual update) |
| `PAST_DUE` | `SUSPENDED` | Grace period expires without recovery |
| `SUSPENDED` | `ACTIVE` | Payment recovered |
| `SUSPENDED` | `CANCELLED` | Retention period expires / admin terminates |

**Invalid transitions (these should never happen):**
- CANCELLED → ACTIVE (create a new subscription instead)
- EXPIRED → ACTIVE (create a new subscription instead)
- PENDING → PAST_DUE (can't be past due if you've never been active)
- PENDING → SUSPENDED (same reason)

---

## Part 3 — The dunning flow

"Dunning" is the process of recovering failed payments. It's the most
important revenue-recovery mechanism in SaaS billing.

```
Day 0:  Payment fails → status = PAST_DUE
        → Email: "Your payment failed. Please update your payment method."
        → In-app banner on merchant portal.
        → Automatic retry #1.

Day 3:  → Email: "Reminder — your payment is still failing."
        → Automatic retry #2.

Day 7:  → Email: "Urgent — your subscription will be suspended in 7 days."
        → Automatic retry #3.

Day 14: Grace period expires → status = SUSPENDED
        → Email: "Your subscription has been suspended."
        → Storefront degraded / offline.
        → No more automatic retries.

Day 14-45: Tenant can manually update payment method and pay.
           → If they pay: SUSPENDED → ACTIVE (instant).

Day 45: Retention period expires → status = CANCELLED
        → Email: "Your subscription has been cancelled."
        → Data retained per retention policy (e.g., 90 days).
```

### Why PAST_DUE is the critical state

Most recovered payments happen in the first 7 days:

```
Day 1-3:   ~30% of failed payments are recovered (card retry succeeds)
Day 3-7:   ~15% more recovered (tenant updates card after email)
Day 7-14:  ~5% more recovered (urgent email drives action)
After 14:  Recovery rate drops to < 2%
```

Without PAST_DUE, you'd either keep them ACTIVE (no urgency) or immediately
SUSPEND (lose the 50% you could have recovered). **PAST_DUE exists to maximize
revenue recovery.**

---

## Part 4 — What's NOT in this enum (and why)

| Omitted value | What it would mean | Why we skip it |
|---|---|---|
| `TRIALING` | Free trial period before first payment | XFOS doesn't offer free trials in the PRD. If added later, insert before PENDING in the state machine: TRIALING → PENDING → ACTIVE. |
| `PAUSED` | Tenant temporarily pauses (vacation, Ramadan, off-season) | Not in MVP scope. If needed, add as a state between ACTIVE and CANCELLED with a resume path. |
| `GRANDFATHERED` | Legacy pricing plan no longer available to new tenants | Not relevant until pricing changes. Could be modeled as a flag on the subscription, not a status. |
| `INCOMPLETE` | Stripe's term for "requires further action" (3D Secure, etc.) | XFOS uses ABA PayWay + cash. No 3D Secure at MVP. If card payments are added later, this may be needed. |

---

## Part 5 — How SubscriptionStatus relates to TenantStatus

These are two different state machines on two different tables, but they
influence each other:

| Subscription status | Expected tenant status | Why |
|---|---|---|
| `PENDING` | `DRAFT` | Tenant is onboarding, not yet live |
| `ACTIVE` | `ACTIVE` | Tenant is live and operational |
| `PAST_DUE` | `ACTIVE` | Tenant still has access during grace period |
| `SUSPENDED` | `ACTIVE` or `SUSPENDED` | Depends on policy — degrade features or block entirely |
| `CANCELLED` | `ACTIVE` (free tier) or `ARCHIVED` | Depends on whether a free plan exists |
| `EXPIRED` | Same as CANCELLED | Same behavior |

**Important:** `TenantStatus` and `SubscriptionStatus` are NOT 1:1.
A platform admin can suspend a tenant (`TenantStatus = SUSPENDED`) even if
the subscription is ACTIVE (e.g., policy violation, abuse). The two state
machines are independent.

---

## Part 6 — Comparison with industry standard (Stripe)

Stripe's subscription statuses for reference:

| Stripe | XFOS equivalent | Notes |
|---|---|---|
| `incomplete` | `PENDING` | First payment not yet confirmed |
| `incomplete_expired` | (none — PENDING + timeout → CANCELLED) | Could be modeled as PENDING → CANCELLED |
| `trialing` | (not needed) | No free trials in XFOS |
| `active` | `ACTIVE` | Exact match |
| `past_due` | `PAST_DUE` | Exact match |
| `unpaid` | `SUSPENDED` | Stripe separates "past_due" (retrying) from "unpaid" (gave up retrying). XFOS merges the "gave up" state into SUSPENDED. |
| `canceled` | `CANCELLED` | Exact match |
| `paused` | (not needed) | Not in MVP scope |

**XFOS has 6 statuses vs Stripe's 8.** The simplification:
- No TRIALING (no free trials)
- No PAUSED (not in MVP)
- PENDING covers both `incomplete` and `incomplete_expired`
- SUSPENDED covers Stripe's `unpaid`
- Added EXPIRED (Stripe handles this implicitly via `canceled` + metadata)

---

## Part 7 — Decision

### Question: Are 6 values too many?

**Answer: No.** Each value serves a distinct purpose:

| Value | Purpose | Can it be removed? |
|---|---|---|
| `PENDING` | Prevent access before first payment | No — without it, declined cards get free access |
| `ACTIVE` | The happy path | No |
| `PAST_DUE` | Grace period for failed payments | No — this is where 30-50% of revenue is recovered |
| `SUSPENDED` | Hard block after grace period | No — can't merge with CANCELLED (different intent: recoverable vs terminal) |
| `CANCELLED` | Explicit termination | No |
| `EXPIRED` | Natural end of fixed-term plan | **Debatable** — could merge into CANCELLED, but you'd lose the voluntary vs passive churn distinction. Keep it; costs nothing. |

### What we decided

- **Keep all 6 values.** They align with the industry standard (Stripe) and
  each has a distinct business purpose.
- **MVP: no enforcement.** The enum and the `subscriptions` table exist for
  schema readiness, but no code checks subscription status before granting
  access. All tenants operate as if ACTIVE.
- **v1.1+ wire-up:** When billing is enabled, the dunning flow (ACTIVE →
  PAST_DUE → SUSPENDED → CANCELLED) will be implemented as a BullMQ job
  that runs daily, checks payment status, and transitions subscriptions
  through the state machine.
- **TRIALING and PAUSED are intentionally omitted.** They can be added later
  as new enum values without breaking existing records.
