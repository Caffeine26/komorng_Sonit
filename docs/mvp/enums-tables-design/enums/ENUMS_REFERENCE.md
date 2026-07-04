# XFOS — Enum Reference

Detailed explanation of every Postgres enum used in the XFOS schema.
Enums must stay in sync with `xfos/contracts/enums/index.ts` (the TypeScript
mirror used by frontend and backend).

---

## TenantStatus

**Used by:** `tenants.status`
**Controls:** whether a tenant's storefront, kitchen, and merchant portal are
accessible, and whether the platform bills them.

| Value | Meaning | Who sets it | What happens |
|---|---|---|---|
| `DRAFT` | Tenant registered but not yet live. Onboarding in progress. | System (default on creation) | Storefront returns 404. Kitchen and merchant portal accessible for setup only. No billing. |
| `ACTIVE` | Tenant is live and operational. | Platform admin (go-live approval) or automated when `setup_progress.go_live_ready = true` | Storefront is public. Orders flow. Billing active. |
| `SUSPENDED` | Temporarily disabled — e.g. non-payment, policy violation, or tenant's own request. | Platform admin | Storefront shows "temporarily closed". Existing orders can be completed but no new orders accepted. Kitchen read-only. Billing paused or dunning. |
| `ARCHIVED` | Permanently closed. Soft-delete — data is retained for audit/legal but the tenant is invisible. | Platform admin | All surfaces return 404/gone. Data retained per retention policy. No billing. Cannot be reactivated without platform support. |

**State machine:**

```
DRAFT → ACTIVE → SUSPENDED → ACTIVE (reinstate)
                            → ARCHIVED
       ACTIVE → ARCHIVED (direct close)
```

---

## ServiceModel

**Used by:** `tenant_settings.service_model`, `orders.service_model`,
`kitchen_tickets.service_model`
**Controls:** the physical context of the ordering experience — specifically,
whether the customer is anchored to a table or not. This enum answers ONE
question: **is there a physical table?**

```sql
CREATE TYPE "ServiceModel" AS ENUM ('STALL_KIOSK', 'DINE_IN_TABLE');
```

| Value | Physical context | QR type | Kitchen ticket shows | Merchant portal view |
|---|---|---|---|---|
| `STALL_KIOSK` | No table. Customer stands, walks, or sits informally. | `STOREFRONT` (optional `label` for counter/pickup point) | Pickup number or counter label | Order queue (list) |
| `DINE_IN_TABLE` | Customer is at a specific, numbered table. | `TABLE` (QR on the table) | "Table 5" | Table map (occupied / empty) |

### How ServiceModel combines with PayTiming

`ServiceModel` and `PayTiming` are two independent axes. Together they
produce four combinations that cover every real-world food business:

| ServiceModel | PayTiming | Session? | Bill grouping | Real-world example |
|---|---|---|---|---|
| `STALL_KIOSK` | `PAY_BEFORE` | No | 1 order = 1 bill | Bubble tea shop, Brown Coffee counter |
| `STALL_KIOSK` | `PAY_AFTER` | Yes (short tab) | N orders = 1 bill | Noodle stall, bar tab, beer garden |
| `DINE_IN_TABLE` | `PAY_BEFORE` | Yes (table-anchored) | N orders = 1 bill | Food court with tables, fast-casual with table numbers |
| `DINE_IN_TABLE` | `PAY_AFTER` | Yes (table-anchored) | N orders = 1 bill | Traditional sit-down restaurant, BBQ, hotpot |

### Session auto-creation rules (derived from the combination)

```
if PAY_BEFORE:
    STALL_KIOSK   → no session. 1 order, 1 bill, done.
    DINE_IN_TABLE → session created (for table tracking), but each order is paid immediately.

if PAY_AFTER:
    STALL_KIOSK   → session auto-created. Orders accumulate into one bill.
    DINE_IN_TABLE → session created (anchored to table). Orders accumulate into one bill.
```

### Real-world scenarios

**Scenario A — Bubble tea kiosk (STALL_KIOSK + PAY_BEFORE):**
```
Customer scans QR → orders bubble tea → pays $3 → waits → picks up → done.
If they also want a donut: scan again → order donut → pay $2 → pick up.
Two separate orders, two separate bills. Normal coffee-shop behavior.
```

**Scenario B — Noodle stall (STALL_KIOSK + PAY_AFTER):**
```
Customer scans QR → orders noodle soup → kitchen cooks → serves.
While eating, customer orders iced coffee → kitchen makes → serves.
Customer taps "Pay" → both orders grouped into one bill ($5.50) → pays → leaves.
```
This is the scenario that required sessions on STALL_KIOSK. Without a session,
the customer would have to pay for each order separately — bad UX.

**Scenario C — Food court with tables (DINE_IN_TABLE + PAY_BEFORE):**
```
Customer gets Table 12 → scans Table 12 QR → orders → pays $8 →
sits down → number displayed on screen → picks up food → eats at table.
```

**Scenario D — Traditional restaurant (DINE_IN_TABLE + PAY_AFTER):**
```
Customer sits at Table 5 → scans QR → orders appetizers.
20 min later → orders mains. 30 min later → orders drinks.
Taps "Request bill" → one bill for all 3 orders → pays → leaves.
```

### How bill grouping works for multi-order sessions (scenarios B & D)

The "combining" happens through three tables working together:

```
order_sessions
  └─ session_001 (CLOSED)
       │
       ├── orders
       │     ├── order_001: Noodle Soup   $3.50  (CONFIRMED)
       │     └── order_002: Iced Coffee   $2.00  (CONFIRMED)
       │
       └── bills
             └── bill_001: $5.50 (PAID)
                   │
                   ├── bill_orders → order_001
                   ├── bill_orders → order_002
                   │
                   └── payments
                         └── payment_001: $5.50 CASH (SUCCEEDED)
```

1. **`order_sessions`** — the container that groups orders over time
2. **`bills`** — the financial document that sums all orders
3. **`bill_orders`** — the junction table that links N orders → 1 bill

When the customer taps "Pay" / "Close tab", the backend finds all
non-cancelled orders in the session, sums their totals, creates one bill,
links them through `bill_orders`, and presents the payment screen.

```sql
-- Sum all orders in this session
SELECT SUM(total_cents) AS bill_total
FROM orders
WHERE session_id = 'session_001'
  AND tenant_id = 'tenant_A'
  AND status != 'CANCELLED';

-- Create the bill
INSERT INTO bills (id, tenant_id, session_id, bill_number, total_cents, status)
VALUES ('bill_001', 'tenant_A', 'session_001', 'BILL-000001', 550, 'OPEN');

-- Link all orders to the bill
INSERT INTO bill_orders (tenant_id, bill_id, order_id)
SELECT 'tenant_A', 'bill_001', id
FROM orders
WHERE session_id = 'session_001'
  AND tenant_id = 'tenant_A'
  AND status != 'CANCELLED';
```

### Why `STALL_OPEN_TAB` was removed

The original schema had three values: `STALL_KIOSK`, `DINE_IN_TABLE`,
`STALL_OPEN_TAB`. During design review we discovered that:

1. `STALL_KIOSK` + `PAY_AFTER` needs sessions to group multiple orders —
   which is exactly what `STALL_OPEN_TAB` was designed for.
2. `STALL_OPEN_TAB` is therefore just `STALL_KIOSK` + `PAY_AFTER` — a
   combination, not a distinct model.
3. The real distinguishing axis is **physical context** (table or no table),
   not **session behavior** (session behavior is derived from `PayTiming`).

Removing `STALL_OPEN_TAB` eliminates a code path, simplifies onboarding
("pick one of two models"), and removes the ambiguity of "should my
pay-after kiosk use STALL_KIOSK or STALL_OPEN_TAB?"

A bar is `STALL_KIOSK` + `PAY_AFTER`. A food court tab is `STALL_KIOSK` +
`PAY_AFTER`. No separate model needed.

### Why it's snapshotted on `orders` and `kitchen_tickets`

The kitchen display needs to know how to present the ticket — a stall ticket
shows "ready for pickup" while a dine-in ticket shows "Table 5". Snapshotting
`service_model` on the order avoids a join to `tenant_settings` on every
ticket render, and survives if the tenant changes their model later.

`pay_timing` is also snapshotted on `orders` (as of this design revision)
because the tenant's default can be overridden per order — e.g., the
merchant manually creates a pay-after order for a regular at a normally
pay-before kiosk.

---

## PayTiming

**Used by:** `tenant_settings.pay_timing` (tenant default),
`orders.pay_timing` (per-order snapshot, can override the tenant default)
**Controls:** at what point in the order lifecycle a payment is collected.

```sql
CREATE TYPE "PayTiming" AS ENUM ('PAY_BEFORE', 'PAY_AFTER');
```

| Value | When the customer pays | Order initial status | Session created? |
|---|---|---|---|
| `PAY_BEFORE` | Immediately after placing the order, **before** the kitchen starts. Payment must succeed for the order to be created. | `SUBMITTED` (order only exists after payment) | Only if `DINE_IN_TABLE` (for table tracking) |
| `PAY_AFTER` | After all food is received. Customer requests the bill or closes the tab, then pays. | `SUBMITTED` (order created immediately) | Always — orders accumulate into one bill |

### How it changes the order creation flow

```
# The order record is only created AFTER the payment gate:
if pay_timing == PAY_BEFORE:
    cart → bill + payment → payment succeeds → order created (SUBMITTED)
    # order only exists after money is confirmed

if pay_timing == PAY_AFTER:
    cart → order created (SUBMITTED) → bill + payment happen later
    # order exists immediately, payment is independent

# Where "cart" lives:
#   STALL_KIOSK   → localStorage on the customer's device (no DB row)
#   DINE_IN_TABLE → carts row, one ACTIVE per session (shared across devices)
```

In both cases the initial order status is SUBMITTED. The difference is
WHEN the order record is created, not what status it starts with.
See `design-discussions/order-status-redesign.md` for the full design.

### Why `PAY_AFTER_SERVICE` and `PAY_ON_SESSION_CLOSE` were merged

The original schema had three values: `PAY_BEFORE_FULFILLMENT`,
`PAY_AFTER_SERVICE`, `PAY_ON_SESSION_CLOSE`. During design review we
discovered that:

- `PAY_AFTER_SERVICE` = "customer requests the bill → pays → leaves"
- `PAY_ON_SESSION_CLOSE` = "customer closes the tab → pays → leaves"

These are the **same action with different button labels**. The backend
logic is identical: find all orders in the session, sum them, create a
bill, present payment. The only difference is the UI copy ("Request bill"
vs "Close tab"), which is a frontend concern, not a schema concern.

Merging them into `PAY_AFTER` eliminates a distinction that only existed
at the UI label level and cuts one code path from the backend.

### Relationship with `ServiceModel`

`PayTiming` is a separate column (not derived from `ServiceModel`) because
both service models support both pay timings:

- A bubble tea kiosk uses `PAY_BEFORE` (pay at counter, pick up drink).
- A noodle stall uses `PAY_AFTER` (eat first, pay after).
- A restaurant uses `PAY_AFTER` (eat rounds, request bill at end).
- A food court with tables uses `PAY_BEFORE` (pay at counter, food
  delivered to table or number called).

The two columns are set together during tenant onboarding but can be
decoupled — e.g., a merchant might override `pay_timing` per order
from the merchant portal.

### Design decision: merchant controls pay timing, not the customer

The customer does NOT choose "pay now" vs "pay later" on the storefront.
The merchant sets the default via `tenant_settings.pay_timing`, and the
storefront follows it. Per-order overrides come from the merchant side
(e.g., granting pay-after to a regular customer via the merchant portal).

Rationale:
- Letting customers choose "pay after" creates **credit risk** for the
  merchant (customer walks away without paying).
- QR ordering is anonymous — higher walkaway risk than in-person.
- It adds cognitive load ("when do you want to pay?") to a flow that
  should be fast (stalls are about speed).
- "Pay later" sounds like buy-now-pay-later credit, confusing customers.

---

## SubscriptionStatus

**Used by:** `subscriptions.status`
**Controls:** the billing lifecycle of a tenant's subscription to a platform
plan. Stubbed for MVP — no enforcement yet.

| Value | Meaning |
|---|---|
| `PENDING` | Subscription created but not yet activated (e.g. waiting for first payment). |
| `ACTIVE` | Subscription is current and paid. Tenant has full access to their plan's features. |
| `PAST_DUE` | Payment failed but grace period is still running. Tenant retains access. Dunning emails are sent. |
| `SUSPENDED` | Grace period expired. Tenant loses access to paid features. Storefront may be degraded (e.g. no analytics, no ABA QR). |
| `CANCELLED` | Tenant or platform explicitly cancelled. No further billing. Tenant reverts to free tier or goes to `ARCHIVED`. |
| `EXPIRED` | Subscription reached its natural `ends_at` date without renewal. Same effect as `CANCELLED`. |

**State machine:**

```
PENDING → ACTIVE → PAST_DUE → ACTIVE (payment recovered)
                             → SUSPENDED → ACTIVE (payment recovered)
                                         → CANCELLED
         ACTIVE → CANCELLED (voluntary)
         ACTIVE → EXPIRED (natural end)
```

---

## UserStatus

**Used by:** `users.status`
**Controls:** whether a user can authenticate and access any part of the system.

| Value | Meaning | Can log in? | Data retained? |
|---|---|---|---|
| `ACTIVE` | Normal state. User can log in and perform any action their roles allow. | Yes | Yes |
| `SUSPENDED` | Temporarily disabled — e.g. security concern, HR action, or tenant owner's request to disable a staff member. | No — login rejected with "account suspended" | Yes — all data, roles, and audit history intact. Can be reactivated. |
| `DELETED` | Permanently deactivated. A soft-delete — the row stays for FK integrity and audit trail, but all PII should be scrubbed per retention policy. | No — login rejected with "account not found" | Row exists but PII (email, name) may be anonymized. Roles are removed. |

**Note:** `DELETED` is a soft-delete at the application layer. The `users`
row is NOT hard-deleted because `audit_logs`, `order_status_history`, and
`kitchen_ticket_events` reference `users.id` and those records must survive.

---

## Role

**Used by:** `user_roles.role`
**Controls:** what a user can see and do. A user may hold multiple roles
(e.g. `TENANT_OWNER` in tenant A + `KITCHEN_STAFF` in tenant B). Roles
are per-tenant except `PLATFORM_ADMIN` and `PLATFORM_STAFF` which are global.

| Value | Scope | What they can do | `user_roles.tenant_id` |
|---|---|---|---|
| `PLATFORM_ADMIN` | Global (no tenant) | Full platform access including dangerous operations: suspend/archive tenants, manage billing/plans, manage platform users, all audit logs. | `NULL` |
| `PLATFORM_STAFF` | Global (no tenant) | Read + limited write at the platform level: view tenant list/details, view metrics, create tenants (onboarding), view audit logs (read-only). Cannot suspend tenants, manage billing, or manage platform users. | `NULL` |
| `TENANT_OWNER` | Per tenant | Full access to their tenant's merchant portal. Manage menu, staff, settings, payments, QR codes, billing/subscription, financial reports, delete tenant. Can invite other owners/managers/staff. | Required |
| `TENANT_MANAGER` | Per tenant | Same as `TENANT_OWNER` except cannot delete the tenant, cannot manage billing/subscription, cannot remove other owners, no financial reports. Day-to-day operational manager. | Required |
| `SERVICE_STAFF` | Per tenant | Front-of-house: view orders & table map, take/edit orders, handle payments at counter, mark sessions closed. Covers waiter, cashier, host, counter staff. No menu management, no settings. | Required |
| `KITCHEN_STAFF` | Per tenant | Access to the kitchen app only. See tickets, change ticket status (NEW → PREPARING → READY → COMPLETED). Cannot access merchant portal or any admin features. | Required |

**Why not finer-grained permissions (RBAC with individual permissions)?**
MVP scope — six roles cover every persona without listing individual
permissions. If finer splits are needed later (e.g., `PLATFORM_SALES` /
`PLATFORM_SUPPORT`, or `ACCOUNTANT`), they're added as new enum values
and the authorization middleware is extended. The `user_roles` junction
table already supports any number of roles per user per tenant — small
stalls only ever use `TENANT_OWNER` and ignore the rest.

---

## InvitationStatus

**Used by:** `invitations.status`
**Controls:** the lifecycle of a team member invitation.

| Value | Meaning | What happens next |
|---|---|---|
| `PENDING` | Invitation sent, not yet acted on. Token is valid. | User clicks the link → registers or links account → status becomes `ACCEPTED`. |
| `ACCEPTED` | User accepted the invitation. A `user_roles` row was created. | Terminal state. The invitation row is kept for audit. |
| `EXPIRED` | 72 hours passed without acceptance. Token is no longer valid. | Owner can re-invite (creates a new invitation row). |
| `REVOKED` | Owner or manager explicitly cancelled the invitation before acceptance. | Terminal state. Token is invalidated. |

**State machine:**

```
PENDING → ACCEPTED (user clicks link)
        → EXPIRED  (72h TTL)
        → REVOKED  (owner cancels)
```

---

## QrContextType

**Used by:** `qr_contexts.context_type`
**Controls:** what the QR code resolves to when scanned by a customer.

| Value | What the QR encodes | Customer experience after scan |
|---|---|---|
| `STOREFRONT` | Tenant identity only — no table, no counter. | Opens the storefront menu. Used by stalls and kiosks where there are no tables. Customer orders from anywhere (standing in line, walking by). |
| `TABLE` | Tenant + specific table reference (e.g. "Table 5"). | Opens the storefront with the table pre-selected. Used for dine-in — the order is automatically associated with this table. Kitchen tickets show the table number. |
| ~~`COUNTER`~~ | *Removed.* Every COUNTER scenario is a STOREFRONT with a `label` (e.g., `label = "Counter A"`). Keeping it confused merchants during QR setup. |

**Why not just use `TABLE` for everything?** Semantics matter for the kitchen
display and receipt — "Table 5" vs "Counter A" vs no location context at all.
The `STOREFRONT` type also signals to the frontend: don't show any
table/counter picker UI.

---

## QrDeactivationReason

**Used by:** `qr_contexts.deactivation_reason`
**Controls:** the *why* of QR-code deactivation. Sibling-enum to
`is_active`; gated by CHECK constraint
`(is_active = TRUE) OR (deactivated_at IS NOT NULL AND deactivation_reason IS NOT NULL)`.

| Value | Meaning | `deactivated_by_id` |
|---|---|---|
| `REGENERATED` | Replaced by a new QR (placard ripped, rebranding, security rotation). Predecessor of a new row whose `replaces_id` points back. | Required (human) |
| `MERCHANT_DISABLED` | Merchant manually turned the QR off — table broken, under maintenance, reserved for an event. | Required (human) |
| `LOST_OR_DAMAGED` | Placard was lost, stolen, or physically damaged; merchant marked it as such (no replacement created yet). | Required (human) |
| `EXPIRED_AUTO` | `expires_at` passed and a background cleanup job auto-deactivated the row. | NULL allowed (system actor) |
| `TABLE_REMOVED` | The parent `tables` row was deactivated; cascading deactivation of QRs anchored to it. | Required (human, the staff who deactivated the table) |
| `TENANT_DEACTIVATED` | The tenant itself was suspended/archived; cascading deactivation of all QRs. | NULL allowed (system actor) |

**Why a separate enum (vs adding states to a richer lifecycle enum):**
- `is_active` stays a simple boolean — the storefront's "can I scan
  this?" check is `WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())`.
- The `_reason` column carries the analytical detail without bloating
  the lifecycle predicate.
- New reasons (e.g., `BRANDING_REFRESH`, `LEGAL_REQUEST`) are pure
  additive enum changes.
- Same pattern as `OrderCancellationReason`/`CartAbandonedReason`/`OrderSessionCloseReason`.

See `enums/qr-deactivation-reason.md` and `tables/qr-contexts.md`.

---

## OrderSessionStatus

**Used by:** `order_sessions.status`
**Controls:** whether new orders can be added to this session.

| Value | Meaning |
|---|---|
| `ACTIVE` | Session is open. Customers can place additional orders. The bill has not been requested yet. |
| `CLOSED` | Session is closed. No more orders can be added. The bill has been generated and (if paid) the table is free. Closed when the bill is paid, the merchant closes it, or the 24h background cleanup runs. |

**Note:** Only relevant for `DINE_IN_TABLE` and `STALL_OPEN_TAB` service
models. `STALL_KIOSK` may create a session for internal consistency but
it's opened and closed in the same transaction (single order = single bill).

---

## OrderSessionCloseReason

**Used by:** `order_sessions.closed_reason`
**Controls:** the *why* of session closure. Sibling-enum to
`OrderSessionStatus` — gated by CHECK constraint
`(status = 'CLOSED') = (closed_reason IS NOT NULL)`.

| Value | Meaning | Triggered by |
|---|---|---|
| `PAID` | Bill was paid in full. The normal happy-path closure. | Payment confirmation handler (sets `closed_by_id` to the staff who confirmed cash, or NULL for self-service ABA QR) |
| `STAFF_FORCE_CLOSED` | Staff manually closed the session from the merchant portal — table cleared, session opened by mistake, etc. Customer paid (or didn't, but the staff explicitly chose this code over `WALKED_AWAY`). | Merchant portal "Close Session" button |
| `AUTO_TIMEOUT_24H` | Background cleanup job closed an inactive session. Inactivity is measured by `last_activity_at`, not `opened_at`. | Platform-wide BullMQ job |
| `WALKED_AWAY` | Customer left without paying; staff acknowledged the loss. Distinct from `STAFF_FORCE_CLOSED` so analytics can isolate revenue leak. | Merchant portal "Mark as walkaway" button |

**Why a separate enum (vs adding to `OrderSessionStatus`):**
- The lifecycle enum (`ACTIVE`/`CLOSED`) stays minimal — every "is this
  session done?" check is one column.
- Adding new close reasons (`MERGED_INTO_OTHER`, `STAFF_ERROR_DUPLICATE`)
  is a pure additive change without affecting the lifecycle predicate.
- Same pattern as `OrderCancellationReason` (sibling to `OrderStatus`)
  and `CartAbandonedReason` (sibling to `CartStatus`).

See `tables/order-sessions.md` for the full design.

---

## CartStatus

**Used by:** `carts.status`
**Controls:** what stage the cart is in.
**Scope (since 2026-04-24):** populated **only for `DINE_IN_TABLE` sessions**.
Stall/kiosk flows hold the cart in browser `localStorage` and never write a
`carts` row, so this enum doesn't apply to them. Within a dine-in session
there is at most one `ACTIVE` cart at a time (Option A — shared per-session
cart, enforced by partial unique index on `carts.session_id WHERE status = 'ACTIVE'`).

| Value | Meaning | What happens to the items |
|---|---|---|
| `ACTIVE` | The shared cart for this dine-in session is being built. Multiple devices at the table read/write the same row. | Items are mutable — add, remove, change quantity. |
| `CONVERTED` | Someone tapped "Submit Order." An `orders` row was created from this cart, and the next round will start a new ACTIVE cart in the same session. | Items are frozen — snapshotted into `order_items`. Read-only. |
| `ABANDONED` | The dine-in session closed (bill paid / merchant force-close / 24h cleanup) or staff explicitly reset the cart. The trigger is recorded in `carts.abandoned_reason`. | Items remain for analytics. Read-only. |

**State machine:**

```
ACTIVE → CONVERTED (checkout)
       → ABANDONED (session close / staff reset / 24h cleanup) — with abandoned_reason set
```

---

## CartAbandonedReason

**Used by:** `carts.abandoned_reason` (nullable)
**Controls:** *why* a cart became `ABANDONED`. NULL on non-abandoned rows;
the CHECK constraint `carts_abandoned_reason_only_when_abandoned`
enforces this.
**Why a sibling enum, not more `CartStatus` values:** `CartStatus` models
the lifecycle (mutable / success-terminal / failure-terminal); the
*reason* a cart hit the failure terminal is operational metadata —
splitting `CartStatus` would force every status check to enumerate
variants forever. See [`cart-abandoned-reason.md`](cart-abandoned-reason.md).

| Value | Trigger | `closed_by_id` | Operational meaning |
|---|---|---|---|
| `SESSION_PAID` | Bill paid → session closed; cart had unsubmitted items | NULL (system) | Benign. Useful product-feedback signal. |
| `SESSION_FORCE_CLOSED` | Merchant manually closed the session (walkaway / stuck table) | NULL (system) | Negative signal worth investigating. |
| `STAFF_RESET` | Staff tapped "Reset cart" in the merchant portal | **Required** (`users.id`) | Routine cleanup; audit trail captures *who*. |
| `SESSION_TIMEOUT` | 24h background cleanup swept an abandoned session | NULL (system) | Hygiene issue if frequent. |
| `CUSTOMER_DISMISSED` | Customer-facing "Clear cart" action | NULL (system) | **Reserved for post-MVP.** Listed for forward-compatibility. |

The CHECK constraint `carts_closed_by_only_for_staff_reset` rejects any
row where `closed_by_id` is set with a reason other than `STAFF_RESET`.

---

## OrderStatus

**Used by:** `orders.status`
**Controls:** the customer-visible order lifecycle. Maps 1:1 to the customer
status page. Every transition is recorded in `order_status_history`.
Payment is NOT tracked here — see `BillStatus` and `PaymentStatus`.

See `design-discussions/order-status-redesign.md` for the full design discussion.

```sql
CREATE TYPE "OrderStatus" AS ENUM ('SUBMITTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
```

| Value | Customer UI | Trigger |
|---|---|---|
| `SUBMITTED` | "You submitted the order" | Order record created (after payment for PAY_BEFORE, immediately for PAY_AFTER) |
| `PREPARING` | "We are preparing your order" | System auto-updates when first kitchen ticket moves to PREPARING |
| `READY` | "Your order is ready!" | System auto-updates when ALL kitchen tickets reach READY |
| `COMPLETED` | "Order completed" | Staff confirms pickup/delivery, or auto-timeout |
| `CANCELLED` | "Order cancelled" | Customer, merchant, or system |

**State machine:**

```
SUBMITTED → PREPARING → READY → COMPLETED
    │            │         │
    └─ CANCELLED ┘         └─ CANCELLED (rare)
```

**Key design decisions:**
- Payment statuses (`PENDING_PAYMENT`, `CONFIRMED`) were removed — payment
  is tracked by `BillStatus` + `PaymentStatus`, not the order.
- The order record only exists AFTER the payment gate (for PAY_BEFORE).
  No "waiting for payment" state on the order.
- `PREPARING` and `READY` are auto-synced from kitchen ticket state changes.
  Kitchen staff only updates tickets; the order status follows automatically.
- Since 2026-04-24, `CANCELLED` rows carry a sibling
  `orders.cancellation_reason` (see `OrderCancellationReason` below) and
  optional `orders.cancelled_by_id` for accountability.

---

## OrderCancellationReason

**Used by:** `orders.cancellation_reason` (nullable)
**Controls:** *why* an order became `CANCELLED`. NULL on non-cancelled rows;
the CHECK constraint `orders_cancellation_reason_only_when_cancelled`
enforces this.
**Why a sibling enum, not more `OrderStatus` values:** lifecycle is one
concern; operational metadata is another. Splitting `OrderStatus` would
force every status check to enumerate variants forever. See
[`order-cancellation-reason.md`](order-cancellation-reason.md).

| Value | Trigger | `cancelled_by_id` | Operational meaning |
|---|---|---|---|
| `CUSTOMER_REQUEST` | Customer asked to cancel | Staff (or NULL if customer-self-service) | Routine; investigate clusters |
| `OUT_OF_STOCK` | Kitchen ingredient shortage | Staff | Supply-chain signal |
| `KITCHEN_OVERLOADED` | Merchant managing queue at capacity | Merchant | Capacity-planning signal |
| `PAYMENT_FAILED` | (PAY_AFTER) bill couldn't settle | NULL (system) | Walkaway / fraud signal |
| `DUPLICATE` | Dedup handler caught a double-submit | NULL (system) | App-bug signal if frequent |
| `STAFF_ERROR` | Wrong table / wrong items / misclick | Staff | Training signal |
| `SYSTEM_TIMEOUT` | 24h cleanup of stale orders | NULL (system) | Hygiene issue |

---

## OrderSource

**Used by:** `orders.source`
**Controls:** the channel through which an order was created.
**Why this enum exists:** distinguishes self-service from staff-entered
orders, and reserves space for future channels without enum migrations.
The user's two real MVP scenarios drive the `MERCHANT_MANUAL` value:
walk-in customers at stalls, and elderly customers at dine-in
restaurants who ask staff to enter orders for them. See
[`order-source.md`](order-source.md).

| Value | When used | `created_by_id` | Status |
|---|---|---|---|
| `STOREFRONT_QR` | Customer scanned QR and ordered themselves | **Must be NULL** (CHECK) | Default |
| `MERCHANT_MANUAL` | Staff entered the order in the merchant portal | **Must be NOT NULL** (CHECK) | MVP |
| `API` | Future third-party integration (delivery aggregator, partner POS) | Optional | Reserved for post-MVP |
| `MOBILE_APP` | Future XFOS customer mobile app | Optional (likely NULL once `customer_id` ships) | Reserved for Phase 2 |

CHECK constraints `orders_storefront_has_no_creator` and
`orders_manual_has_creator` enforce the source ↔ `created_by_id` pairing.

---

## BillStatus

**Used by:** `bills.status`
**Controls:** the settlement state of a bill (which may aggregate multiple orders).
The bill no longer tracks in-flight payment state — that's the `payments` table's
job via `PaymentStatus`.

| Value | Meaning |
|---|---|
| `OPEN` | Bill created, full amount not yet collected. Default state. The bill stays OPEN regardless of whether payment attempts are in flight, expired, or not yet started. |
| `PARTIALLY_PAID` | At least one payment succeeded, but collected total < bill total. More money is owed. |
| `PAID` | Full amount received and confirmed. `paid_at` is set. Bill is settled. |
| `VOIDED` | Bill was cancelled or written off — e.g. all orders on the bill were cancelled, or the merchant granted a full comp. |

**State machine:**

```
OPEN → PARTIALLY_PAID → PAID    (split payment)
OPEN → PAID                     (full payment in one go)
OPEN → VOIDED                   (all orders cancelled / merchant comp)
PARTIALLY_PAID → VOIDED         (rare — requires refund of collected amount)
```

**Key design change:** `UNPAID` was renamed to `OPEN`. `PENDING_PAYMENT` was
removed entirely. The bill no longer bounces between states on payment retries.
`PARTIALLY_PAID` was added to track split/partial payment scenarios.

---

## PaymentStatus

**Used by:** `payments.status`
**Controls:** the outcome of a single payment attempt. One bill can have
multiple payment rows (e.g. ABA QR expires → retry → new `payments` row,
or split payments across multiple rows).

| Value | Meaning |
|---|---|
| `INITIATED` | Payment record created, gateway not yet contacted. Default state. |
| `PENDING` | Gateway contacted, waiting for callback or cashier confirmation. QR is displayed (for ABA_QR). |
| `SUCCEEDED` | Payment confirmed by the gateway (or marked as received for cash). `confirmed_at` is set. |
| `FAILED` | Payment rejected by the gateway, or gateway call failed — insufficient funds, network error, etc. |
| `CANCELLED` | Customer or merchant actively cancelled this payment attempt before it completed. |
| `EXPIRED` | Payment timed out — e.g. ABA QR code was not scanned within the validity window. |
| `REFUNDED` | Full refund processed and confirmed. Money returned to the customer. |

**State machine:**

```
INITIATED → PENDING    (gateway contacted successfully)
          → FAILED     (gateway call failed)
          → CANCELLED  (cancelled before gateway call)

PENDING → SUCCEEDED    (gateway confirms)
        → FAILED       (gateway rejects)
        → EXPIRED      (timeout)
        → CANCELLED    (customer/merchant cancels)

SUCCEEDED → REFUNDED   (full refund processed)
```

**Key design changes:** `INITIATED` was added before `PENDING` to separate
"record created" from "gateway contacted." `CANCELLED` was added to
distinguish intentional cancellation from timeout or rejection. `REFUNDED`
was added for full refunds (partial refunds are tracked in a separate
`payment_refunds` table). Default is now `INITIATED` (was `PENDING`).

---

## PaymentMethod

**Used by:** `payments.method`
**Controls:** which payment rail was used.

| Value | How it works | Gateway / integration |
|---|---|---|
| `CASH` | Customer pays cash at the counter. Merchant marks the payment as received in the merchant portal or kitchen app. | None — purely application-side. Merchant taps "received cash". |
| `ABA_QR` | Customer scans an ABA PayWay KHQR code displayed on the storefront. ABA sends a webhook on payment confirmation. | ABA PayWay API. See `docs/mvp/technical-design/shared/10-aba-payway.md`. |
| `CARD` | Credit/debit card payment. Not wired for MVP — present as an enum value for future use. | TBD — Stripe, ABA card gateway, or local acquirer. |

**Why not a `payment_methods` reference table instead of an enum?** Because
the payment rails are tightly coupled to integration code (gateway SDKs,
webhook handlers, receipt formatters). Adding a new method requires code
changes anyway — an enum keeps the allowed values explicit and type-checked
at both the DB and TypeScript layers.

---

## TicketStatus

**Used by:** `kitchen_tickets.status`
**Controls:** the kitchen preparation lifecycle. Every transition is recorded
in `kitchen_ticket_events` and broadcast via Socket.io to room
`tenant_{tenant_id}`.

| Value | Meaning | Who triggers it | Kitchen display |
|---|---|---|---|
| `NEW` | Ticket just arrived. Kitchen has not acknowledged it. | System (auto, when order is confirmed) | Ticket appears in the "New" column. Audible alert plays. |
| `PREPARING` | Kitchen staff acknowledged and started working on it. | Kitchen staff taps the ticket | Ticket moves to the "In Progress" column. `started_at` is set. |
| `READY` | Food is ready for pickup or serving. | Kitchen staff taps "Ready" | Ticket moves to the "Ready" column. `ready_at` is set. Storefront status page updates (customer sees "your order is ready"). |
| `COMPLETED` | Food has been picked up by the customer or served to the table. | Kitchen staff taps "Complete", or auto-complete after N minutes | Ticket disappears from the active board. `completed_at` is set. |
| `CANCELLED` | Order was cancelled after the ticket was created. | System (mirrors `orders.status = CANCELLED`) | Ticket is visually struck-through or removed, depending on UI. |

**State machine:**

```
NEW → PREPARING → READY → COMPLETED
    → CANCELLED (at any point before COMPLETED)
PREPARING → CANCELLED
READY → CANCELLED (rare — food was ready but order cancelled)
```

**Timer metrics derived from these states:**
- **Wait time** = `started_at - created_at` (how long before kitchen acknowledged)
- **Prep time** = `ready_at - started_at` (how long to cook)
- **Pickup time** = `completed_at - ready_at` (how long food sat waiting)
- **Total time** = `completed_at - created_at` (end-to-end)

These are not stored as columns — they're computed at query time from the
timestamp fields on `kitchen_tickets`.

---

## AuthProvider

**Used by:** `user_auth_providers.provider`
**Controls:** which authentication method a given `user_auth_providers` row
represents. Per `design-discussions/authentication-strategy-v2.md`, the three
auth methods are **Telegram + Facebook + Phone-OTP**.

| Value | What it represents | `provider_id` stores |
|---|---|---|
| `TELEGRAM` | Telegram Login Widget (signature-verified payload) | Telegram user ID (numeric string) |
| `FACEBOOK` | Facebook Login (OAuth 2.0) | Facebook App-Scoped User ID (numeric string) |
| `PHONE` | SMS-OTP via phone number (not OAuth) | Phone number in E.164 format (mirrors `users.phone`) |

**Onboarding invariant:** every merchant / manager / platform admin /
platform staff account must have **at least two `user_auth_providers` rows
across TELEGRAM / FACEBOOK / PHONE**. Enforced as a hard gate during
onboarding (`setup_progress.profile_completed_at` is blocked until
satisfied) and on provider unlink (cannot drop below two).

**Not an AuthProvider value:** PIN login for frontline staff (kitchen /
counter tablets) is tenant-scoped and lives on a future `user_pins` table,
not here. See `user-auth-providers.md` Part 7.

---

## TableShape

**Used by:** `tables.shape`
**Controls:** the rendered shape of a dine-in table on the merchant
floor-plan canvas. Added 2026-04-24 with the `tables` + `floor_plans`
introduction.

| Value | Meaning | Geometry constraint |
|---|---|---|
| `RECTANGLE` | Rectangular table — the default for most layouts. | `width` and `height` are independent. |
| `CIRCLE` | Circular table. | DDL CHECK enforces `width = height` (a circle's bounding box is a square). |

**Why only two shapes:** floor-plan rendering at MVP is a simple HTML
canvas. Adding `OVAL`, `HEXAGON`, etc. is a UI investment with no
operational payoff — a merchant shaping their floor plan as roughly
matching reality is enough to identify "Table 5" at a glance.

See `tables.md` and `floor-plans.md` for the full design.

---

## TableStatus

**Used by:** `tables.current_status`
**Controls:** the live operational state of a dine-in table — what the
host / server / merchant portal sees when looking at the floor plan.

| Value | Meaning | Set by |
|---|---|---|
| `AVAILABLE` | Empty and ready to seat. Default state. | System (transition from `OCCUPIED → AVAILABLE` on session close + cleanup; from `CLEANING → AVAILABLE` on staff "ready" tap). |
| `OCCUPIED` | A customer is currently using the table. An `order_sessions` row with `status = ACTIVE` exists. | System (transition from `AVAILABLE → OCCUPIED` on first scan / first order). |
| `RESERVED` | The table is held for a future customer (booking). MVP has no formal reservation system, so this is a forward-compat slot. | Merchant portal (manual). |
| `CLEANING` | Customer just left, staff is wiping down. Brief transient state. | Merchant portal (server taps "needs cleaning" after `OCCUPIED → CLOSED`). |

**State machine:**

```
AVAILABLE → OCCUPIED   (customer arrives, scans table QR or staff seats them)
OCCUPIED  → CLEANING   (session closed, customer left)
CLEANING  → AVAILABLE  (staff finished cleaning)
AVAILABLE → RESERVED   (merchant marks held for booking)
RESERVED  → OCCUPIED   (reserved customer arrives)
RESERVED  → AVAILABLE  (booking cancelled / no-show)
```

**Why these four states:**

- `AVAILABLE` and `OCCUPIED` are the core operational pair — every floor
  plan needs them.
- `RESERVED` reserves UI / DB space for a future booking feature without
  forcing a schema migration when it ships.
- `CLEANING` was added on the user's request to model the real-world
  case where a server needs to mark a table "in transition" — otherwise
  the floor plan would show `AVAILABLE` immediately on session close
  and a host would seat the next customer at a dirty table.

**Not modelled:** `OUT_OF_SERVICE` (broken chair, leaking ceiling). Use
`tables.is_active = FALSE` instead — soft-delete the table from the live
floor plan.

See `tables.md` for the full design.

---

## AuditCategory

**Used by:** `audit_logs.category`
**Controls:** the coarse domain axis of an audit event. Application
code derives this from the action prefix at write time (e.g.,
`'bill.paid'` → `BILLING`).

| Value | Action prefixes | Examples |
|---|---|---|
| `ORDER` | `order.*`, `cart.*`, `session.*`, `qr.*` | `order.created`, `cart.abandoned`, `qr.regenerated` |
| `BILLING` | `bill.*`, `payment.*`, `refund.*` | `bill.paid`, `payment.failed`, `payment.refunded` |
| `KITCHEN` | `ticket.*` | `ticket.status_changed`, `ticket.expedited` |
| `CATALOG` | `menu_item.*`, `menu_category.*`, `menu_*` | `menu_item.created`, `menu_item.price_changed` |
| `AUTH` | `user.*`, `auth.*`, `invitation.*`, `role.*` | `user.invited`, `auth.session_revoked`, `role.changed` |
| `TENANT` | `tenant.*`, `tenant_settings.*`, `floor_plan.*`, `table.*` | `tenant.activated`, `floor_plan.created` |
| `PLATFORM` | `plan.*`, `subscription.*`, `platform.*` | `plan.published`, `subscription.created` |
| `SYSTEM` | `system.*`, `cleanup.*`, `cron.*`, `webhook.*` | `cleanup.idempotency_keys_purged`, `webhook.received` |

**Why coarse, not detailed:** `action` is the detailed axis (free-form
text). `category` is for indexable dashboards and filter chips in the
merchant portal — "show me only billing events." A small enum stays
stable; if a new domain emerges (e.g., `LOYALTY`), an additive enum
change is cheap.

See `enums/audit-category.md` and `tables/audit-logs.md`.

---

## AuditSeverity

**Used by:** `audit_logs.severity`
**Controls:** how attention-worthy this event is.

| Value | Meaning |
|---|---|
| `INFO` | Normal operations (default). The firehose: every `order.created`, `payment.succeeded`. |
| `NOTICE` | Notable but not concerning. E.g., `tenant.suspended` (administrative action), `bill.voided` (legitimate void). |
| `WARNING` | Something to watch. `payment.failed` retries hitting limits, repeated `bill.voided` from same actor. |
| `ALERT` | Page someone. `security.compromised_session_detected`, `system.database_unavailable`, `payment.gateway_signature_invalid`. |

**Indexed via partial index:**
```sql
CREATE INDEX audit_logs_severity_alert_idx
  ON audit_logs (severity, created_at DESC)
  WHERE severity IN ('WARNING', 'ALERT');
```

The partial index keeps the alert-feed query cheap regardless of how
many `INFO` rows the table accumulates.

See `enums/audit-severity.md`.

---

## AuditActorType

**Used by:** `audit_logs.actor_type`
**Controls:** who triggered the event. Disambiguates the historical
"`user_id IS NULL`" ambiguity into typed actor classes.

| Value | Meaning | `user_id` | `actor_label` |
|---|---|---|---|
| `USER` | A real human via the merchant portal, kitchen tablet, or storefront | required | NULL |
| `SYSTEM` | A platform-internal background process | NULL | required (e.g., `"BullMQ:idempotency-cleanup"`) |
| `WEBHOOK` | An incoming third-party callback | NULL | required (e.g., `"ABA-webhook"`) |
| `CRON` | A scheduled job | NULL | required (e.g., `"cron:tenant-deactivate"`) |
| `API_KEY` | Programmatic access via API key (future) | NULL | required (e.g., `"apikey:xfos-public-001"`) |

**CHECK constraints enforce:**
```sql
CONSTRAINT audit_logs_user_actor_has_user_id
  CHECK ((actor_type = 'USER') = (user_id IS NOT NULL)),
CONSTRAINT audit_logs_system_actors_have_label
  CHECK ((actor_type = 'USER') OR (actor_label IS NOT NULL))
```

USER actors have `user_id`; non-USER actors have `actor_label`. No drift
possible.

See `enums/audit-actor-type.md`.

