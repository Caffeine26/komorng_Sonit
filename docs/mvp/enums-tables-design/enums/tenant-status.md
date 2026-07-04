# TenantStatus — Design Discussion & Decision

**Date:** 2026-04-09
**Status:** Kept all 4 values — each is justified
**Affects:** `tenants` table
**MVP note:** All four states are active at MVP. `DRAFT` and `ACTIVE` are the
primary states used during onboarding and go-live. `SUSPENDED` and `ARCHIVED`
exist for platform admin enforcement.

---

## The enum

```sql
CREATE TYPE "TenantStatus" AS ENUM (
  'DRAFT',
  'ACTIVE',
  'SUSPENDED',
  'ARCHIVED'
);
```

---

## Part 1 — Each value explained in detail

### `DRAFT`

**Meaning:** The tenant record exists but the business is not yet live.
Onboarding is in progress — the owner is configuring their menu, settings,
payment methods, QR codes, and translations.

**Who sets it:** System (default on creation). When a new tenant is registered,
`tenants.status` defaults to `'DRAFT'`.

**What happens to the tenant:**
- **Storefront** returns 404 — customers cannot see the menu or place orders.
  The storefront URL (`xfos.com/t/{slug}`) is reserved but not publicly
  accessible.
- **Kitchen app** is accessible for setup/preview only — no real tickets flow
  because no orders can be placed.
- **Merchant portal** is fully accessible — the owner configures everything
  here. The onboarding checklist (`setup_progress`) guides them through
  each step: profile, menu, translations, payments, QR codes.
- **Billing** is not active — no subscription charges while in DRAFT. The
  subscription (if created) would be `PENDING`.
- **QR codes** can be generated and printed, but scanning them returns a
  "coming soon" or 404 page, not the storefront.

**Real-world example:** Dara registers his noodle stall "Num Banh Chok Dara"
(នំបញ្ចុកដារា) on XFOS. The system creates the tenant as DRAFT. Over
the next two days, Dara uploads his menu (Num Banh Chok $1.50, Kuy Teav
$2.00, Iced Coffee $1.00), sets his payment methods (cash + ABA QR),
generates a QR code for his counter, and adds Khmer translations. His
`setup_progress` checklist shows 5/5 complete. He clicks "Request Go-Live"
and waits for platform approval.

**Why it can't be removed:** Without DRAFT, a new tenant would be immediately
ACTIVE — meaning an incomplete menu, no payment configuration, and possibly
no translations would be live and visible to customers. DRAFT is the staging
area that prevents a half-configured storefront from going public.

**Typical duration:** Hours to days. Fast operators finish in an hour; others
take a week. There is no timeout — DRAFT persists until the owner completes
onboarding and the platform approves go-live.

---

### `ACTIVE`

**Meaning:** The tenant is live and operational. Everything works.

**Who sets it:** Platform admin (manual go-live approval) or system
(automated when `setup_progress.go_live_ready = true`, depending on whether
auto-approval is enabled).

**What happens to the tenant:**
- **Storefront** is public — customers can scan QR codes, browse the menu,
  and place orders.
- **Kitchen app** receives real orders as kitchen tickets via Socket.io.
  The kitchen display shows NEW tickets and staff processes them through
  PREPARING, READY, COMPLETED.
- **Merchant portal** is fully operational — order management, menu edits,
  reports, staff invitations, QR management, everything.
- **Billing** is active — the subscription is `ACTIVE`, charges run on
  schedule.
- **Orders flow end-to-end:** customer orders, kitchen cooks, payment
  settles, business gets paid.

**Real-world example:** Dara's noodle stall is approved. Status moves to
ACTIVE. A customer walks up, scans the counter QR code, orders Kuy Teav
for $2.00, pays via ABA QR. The kitchen display shows a new ticket. Dara
prepares the noodle soup, taps "Ready", and the customer picks it up. The
system is working.

**Why it can't be removed:** This is the happy path. Every tenant that is
serving customers is ACTIVE. Without it there is no "live" state.

---

### `SUSPENDED`

**Meaning:** The tenant is temporarily disabled. The business data is intact,
but customer-facing operations are restricted. This is a reversible state —
the tenant can be reinstated to ACTIVE.

**Who sets it:**
- **Platform admin** — for policy violations, abuse, fraud, or content
  issues. Example: a restaurant is uploading copyrighted images as menu
  photos, or the platform detects suspicious order patterns.
- **Platform admin** — for non-payment (when subscription enforcement is
  wired in v1.1+, SUSPENDED will also be set automatically when the
  subscription moves to SUSPENDED after the dunning grace period).
- **Tenant owner request** — a tenant may ask to temporarily suspend
  their account (e.g., going on vacation, seasonal closure, renovation).

**What happens to the tenant:**
- **Storefront** shows a "temporarily closed" (បិទជាបណ្តោះអាសន្ន)
  message. Customers can see the storefront exists but cannot place orders.
- **Existing orders** that were in progress when suspension happened can
  be completed (kitchen finishes cooking, customer picks up). No NEW orders
  are accepted.
- **Kitchen app** goes read-only — existing tickets can be viewed and
  completed, but no new tickets arrive.
- **Merchant portal** is accessible in a degraded state — the owner can
  see their data, update payment methods, contact support, but cannot
  make menu changes or operational adjustments until reinstated.
- **Billing** depends on the reason:
  - If suspended for non-payment: billing is in dunning mode.
  - If suspended by admin for policy: billing may be paused.
  - If suspended at tenant's request: billing may be paused or cancelled.
- **Data is fully retained** — nothing is deleted. All menu items, orders,
  reports, staff accounts remain intact.

**Real-world example 1 (policy violation):** A BBQ restaurant in Phnom Penh
is offering items that violate platform terms (e.g., listing alcohol for
delivery in a restricted zone). The platform admin suspends the tenant.
The owner receives an email explaining the reason. After removing the
violating items and confirming compliance, the admin reinstates them to
ACTIVE.

**Real-world example 2 (tenant request):** A bubble tea shop closes for
two weeks during Khmer New Year (April). The owner requests suspension so
customers don't try to order from a closed shop. After the holiday, they
contact support and get reinstated to ACTIVE.

**Why it can't be merged with ARCHIVED:**
- SUSPENDED = temporary, recoverable. "Fix the issue / wait it out, and
  come back." The merchant portal remains accessible. The expectation is
  that the tenant WILL return.
- ARCHIVED = permanent, terminal. "You're done." The tenant is gone for
  good (or needs significant platform support to revive).
- Different communication, different business process, different merchant
  portal experience.

**Typical duration:** Days to weeks. A policy violation might be resolved in
24 hours. A seasonal closure might last 2-4 weeks. Non-payment suspension
might last until the tenant pays or is eventually archived.

---

### `ARCHIVED`

**Meaning:** The tenant is permanently closed. This is a soft-delete — the
row remains in the database for audit, legal, and FK integrity, but the
tenant is invisible to all users and all surfaces.

**Who sets it:**
- **Platform admin** — after a prolonged SUSPENDED state with no resolution.
- **Platform admin** — at the tenant owner's explicit request to permanently
  close their account.
- **Platform admin** — for severe policy violations, fraud, or legal reasons
  where reinstatement is not appropriate.

**What happens to the tenant:**
- **All surfaces return 404/gone.** Storefront, kitchen app, merchant
  portal — all inaccessible.
- **QR codes** that customers may have saved resolve to a "this business
  is no longer on XFOS" page, not a generic 404. This is better UX than
  a blank error.
- **Data is retained** per the data retention policy. Order history, payment
  records, audit logs — all preserved for legal/compliance purposes.
- **Billing** is terminated. No further charges. Any remaining subscription
  is CANCELLED.
- **Staff accounts** (`user_roles`) are soft-deactivated for this tenant.
  If a staff member also works at another tenant, their other roles are
  unaffected. If this was their only tenant, their `users` row remains
  (for audit trail) but they have no active roles.
- **Cannot be reactivated without platform support.** If the owner changes
  their mind, they must contact XFOS support, who may create a NEW tenant
  or (in exceptional cases) move the archived tenant back to DRAFT for
  re-onboarding.

**Real-world example 1 (voluntary closure):** A food court stall in TK
Avenue closes because the owner is moving abroad. They request permanent
closure. Platform admin archives the tenant. Their order history is retained
for 90 days (or per retention policy) for any disputes, then PII is scrubbed.

**Real-world example 2 (involuntary):** A tenant has been SUSPENDED for 60
days due to non-payment with no response to emails or calls. The platform
admin moves them to ARCHIVED. If the owner returns months later wanting
to reopen, they go through a new onboarding flow (new tenant, new setup).

**Why it's distinct from hard-deleting the row:**
- `orders`, `bills`, `payments`, `audit_logs`, `kitchen_ticket_events`
  all reference `tenants.id` via foreign keys.
- Hard-deleting the tenant row would either cascade-delete all that data
  (losing financial records) or fail on FK constraints.
- ARCHIVED as a soft-delete preserves referential integrity while making
  the tenant invisible.

**Typical duration:** Terminal state. The row exists indefinitely (or until
data retention policy triggers PII scrubbing on associated records).

---

## Part 2 — State machine

### The happy path

```
DRAFT ──► ACTIVE ──► ACTIVE ──► ACTIVE ──► ...
       (go-live)   (operating)  (operating)
```

### Suspension and reinstatement

```
ACTIVE ──► SUSPENDED ──► ACTIVE
        (admin/request)  (reinstated)
```

### Suspension to permanent closure

```
ACTIVE ──► SUSPENDED ──► ARCHIVED
        (admin)        (retention expired / voluntary close)
```

### Direct closure (no suspension)

```
ACTIVE ──► ARCHIVED
        (owner requests permanent close)
```

### Full state machine diagram

```
                  ┌──────────────────────┐
                  │                      │
                  ▼                      │
DRAFT ──► ACTIVE ──► SUSPENDED ──► ACTIVE
             │           │
             │           │
             │           └──► ARCHIVED
             │
             └──► ARCHIVED (direct close)
```

### Valid transitions (complete list)

| From | To | Trigger |
|---|---|---|
| `DRAFT` | `ACTIVE` | Platform admin approves go-live (or auto-approval when `setup_progress.go_live_ready = true`) |
| `ACTIVE` | `SUSPENDED` | Platform admin suspends (policy violation, non-payment) or tenant owner requests temporary closure |
| `ACTIVE` | `ARCHIVED` | Tenant owner requests permanent closure, or platform admin terminates (severe violation) |
| `SUSPENDED` | `ACTIVE` | Platform admin reinstates after issue is resolved |
| `SUSPENDED` | `ARCHIVED` | Retention period expires with no resolution, or tenant owner requests permanent closure while suspended |

**Invalid transitions (these should never happen):**
- ARCHIVED to ACTIVE (create a new tenant instead; do not revive archived tenants)
- ARCHIVED to SUSPENDED (already terminal — no point in suspending what's gone)
- ARCHIVED to DRAFT (same — a new tenant should be created)
- DRAFT to SUSPENDED (a tenant that was never live cannot be suspended; if onboarding is abandoned, it stays in DRAFT or is archived)
- DRAFT to ARCHIVED (debatable — could be valid for abandoned onboarding cleanup, but at MVP, DRAFT tenants are simply left as DRAFT; a future cleanup job could archive them)
- SUSPENDED to DRAFT (going "back to setup" doesn't make sense — reinstate to ACTIVE or archive)

**Edge case — DRAFT to ARCHIVED:** This transition is intentionally omitted
at MVP. If a tenant abandons onboarding, the DRAFT record stays. A future
cleanup job (post-MVP) could archive stale DRAFT tenants after 90 days of
inactivity. For now, the volume of abandoned DRAFT tenants will be low enough
that manual cleanup by platform admins is sufficient.

---

## Part 3 — The go-live flow

The most important transition is DRAFT to ACTIVE — the moment a tenant goes
live and starts receiving real customer orders.

```
1. Owner completes onboarding checklist (setup_progress)
   ├── profile_complete     = true (name, locale, currency, timezone)
   ├── menu_complete        = true (at least 1 category + 1 item)
   ├── translations_complete = true (Khmer names for all items)
   ├── payments_configured  = true (at least cash enabled)
   └── qr_created           = true (at least 1 QR context)

2. System sets go_live_ready = true on setup_progress

3. Go-live trigger:
   Option A (manual): Platform admin reviews and approves → status = ACTIVE
   Option B (auto):   System detects go_live_ready = true → status = ACTIVE

4. Post-go-live:
   - Storefront URL becomes publicly accessible
   - QR codes resolve to the live storefront
   - Kitchen app starts receiving tickets
   - Billing cycle begins (when subscriptions are enforced)
   - audit_log entry: { action: 'tenant.go_live', entity_type: 'tenant' }
```

### Why go-live requires at least one QR code

Without a QR code, customers have no way to reach the storefront. The XFOS
storefront is QR-first — there is no browsable directory or search page at
MVP. If a tenant goes live with zero QR codes, they have a storefront that
nobody can access. Requiring `qr_created = true` prevents this.

### Suspension impact on in-flight orders

When a tenant is suspended, the system must handle orders that are already
in progress:

```
Order status        | What happens
--------------------|--------------------------------------------
SUBMITTED           | Allowed to proceed (kitchen ticket exists)
PREPARING           | Allowed to proceed (kitchen has started)
READY               | Allowed to proceed (food is done, pick up)
Kitchen: NEW        | Allowed to proceed (ticket just arrived)
Kitchen: PREPARING  | Allowed to proceed (food is being cooked)
Kitchen: READY      | Allowed to proceed (food is done, pick up)
Kitchen: COMPLETED  | No action needed (already finished)
```

The rule: **don't waste food.** If the kitchen has already started on an
order, let it complete. In the new model, orders only exist after the
payment gate (PAY_BEFORE) or immediately (PAY_AFTER), so all existing
orders already have kitchen tickets. The suspension blocks new orders from
being created, but in-progress orders are allowed to finish.

---

## Part 4 — What's NOT in this enum (and why)

| Omitted value | What it would mean | Why we skip it |
|---|---|---|
| `PENDING_APPROVAL` | Tenant submitted for go-live review, waiting for admin | Modeled as `DRAFT` + `go_live_ready = true` instead. Adding a separate status for "DRAFT but ready" duplicates a boolean check as an enum value. The `setup_progress.go_live_ready` flag is sufficient. |
| `TRIAL` | Tenant has temporary access to paid features for evaluation | XFOS doesn't offer free trials (see PRD). If trials are added, they belong on `SubscriptionStatus` (as `TRIALING`), not on `TenantStatus`. The tenant itself is either live or not. |
| `INACTIVE` | Tenant exists but is voluntarily paused (not a policy issue) | Merged into `SUSPENDED`. The reason for suspension (admin action vs tenant request) is recorded in `audit_logs.metadata`, not as a separate enum value. Two kinds of "not active but not gone" would confuse the UI and authorization logic. |
| `MIGRATING` | Tenant data is being imported from another platform | Not relevant at MVP. If data migration tooling is built, it would be a background job, not a tenant status. The tenant stays in DRAFT until migration completes. |
| `DELINQUENT` | Tenant is behind on payments but not yet suspended | This is `SubscriptionStatus = PAST_DUE`. Billing states live on the subscription, not the tenant. The tenant stays ACTIVE during the payment grace period — degradation happens at the subscription/feature level, not the tenant status level. |

---

## Part 5 — Relationship to other enums and tables

### TenantStatus vs SubscriptionStatus

These are two independent state machines. TenantStatus controls platform
access; SubscriptionStatus controls billing. They influence each other but
are NOT coupled:

| Tenant status | Subscription status | Situation |
|---|---|---|
| `DRAFT` | `PENDING` | Normal onboarding — tenant setting up, subscription not yet activated |
| `ACTIVE` | `ACTIVE` | Happy path — tenant live, subscription paid |
| `ACTIVE` | `PAST_DUE` | Payment failed but tenant still operates during grace period |
| `ACTIVE` | `SUSPENDED` | Depends on policy — tenant may still be ACTIVE if subscription enforcement is soft |
| `SUSPENDED` | `ACTIVE` | Admin suspended tenant for policy reasons even though billing is current |
| `SUSPENDED` | `SUSPENDED` | Both billing and platform access are blocked |
| `ARCHIVED` | `CANCELLED` | Tenant permanently closed, subscription terminated |

**Key insight:** A platform admin can suspend a tenant (`TenantStatus =
SUSPENDED`) even if their subscription is `ACTIVE` — for example, a tenant
violating content policies. The subscription continues to exist (and may
even continue billing, depending on policy), but the tenant cannot operate.
The two state machines are independent.

### TenantStatus and the authorization middleware

Every API request to a tenant-scoped endpoint follows this chain:

```
Request → AuthGuard (JWT valid?) → TenantGuard (tenantId from JWT)
        → TenantStatusCheck (is tenant ACTIVE?)
        → RoleGuard (does user have required role?)
        → Controller
```

The `TenantStatusCheck` middleware rejects requests when the tenant is
not ACTIVE:

| Tenant status | API behavior |
|---|---|
| `DRAFT` | Allow merchant portal endpoints only (setup). Block storefront/kitchen. |
| `ACTIVE` | Allow all endpoints. |
| `SUSPENDED` | Allow read-only merchant portal. Block storefront orders. Allow kitchen to complete existing tickets. |
| `ARCHIVED` | Block everything. Return 410 Gone. |

### Tables that reference TenantStatus

Only `tenants.status` uses this enum directly. However, virtually every
tenant-scoped table is indirectly affected:

- `tenant_settings` — operational config is meaningless if tenant is ARCHIVED
- `qr_contexts` — QR resolution checks tenant status before rendering storefront
- `orders` — order creation checks tenant status (must be ACTIVE)
- `kitchen_tickets` — ticket display checks tenant status
- `audit_logs` — records all status transitions

---

## Part 6 — Decision

### Question: Are 4 values sufficient?

**Answer: Yes.** The four values map cleanly to the four states a business
can be in on any platform:

| Value | Real-world analogy | Can it be removed? |
|---|---|---|
| `DRAFT` | "Setting up shop — hammering the sign, stocking the shelves" | No — without it, incomplete setups go live |
| `ACTIVE` | "Open for business" | No — the happy path |
| `SUSPENDED` | "Temporarily closed" sign on the door | No — without it, any enforcement goes straight to permanent closure |
| `ARCHIVED` | "Gone out of business" — landlord rents the space to someone else | No — need a terminal state that preserves data for audit |

### What we decided

- **Keep all 4 values.** Each represents a distinct business state with
  different access rules, different billing implications, and different
  customer-facing behavior.
- **DRAFT to ACTIVE is gated by `setup_progress.go_live_ready`.** The
  go-live trigger is either manual (platform admin) or automatic (system
  detects readiness). Both paths are supported.
- **SUSPENDED is a catch-all** for any temporary deactivation — whether
  initiated by the platform (policy/payment) or the tenant (vacation/
  seasonal). The reason is recorded in `audit_logs`, not in the enum.
- **ARCHIVED is a soft-delete.** The row stays for FK integrity and audit.
  PII scrubbing on associated records follows the data retention policy.
- **No PENDING_APPROVAL state.** The combination of `DRAFT` +
  `setup_progress.go_live_ready = true` is sufficient and avoids adding
  a fifth status for a transient pre-launch moment.
