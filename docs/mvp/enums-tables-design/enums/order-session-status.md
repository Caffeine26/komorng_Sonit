# OrderSessionStatus — Design Discussion & Decision

**Date:** 2026-04-09
**Status:** Kept both values — each is justified
**Affects:** `order_sessions` table
**MVP note:** Both states are active at MVP. Sessions are created for dine-in
tables and pay-after stall/kiosk orders. The storefront and billing logic
check session status to determine whether new orders can be added.

---

## The enum

```sql
CREATE TYPE "OrderSessionStatus" AS ENUM (
  'ACTIVE',
  'CLOSED'
);
```

---

## Part 1 — Each value explained in detail

### `ACTIVE`

**Meaning:** The session is open. The customer (or table) can place
additional orders. The bill has not been generated or finalized yet.

**Who sets it:** System (default on creation). A session is created as
ACTIVE when:
- A customer scans a TABLE QR code for a `PAY_AFTER` tenant.
- A customer scans a STOREFRONT QR code for a `PAY_AFTER` tenant
  (short-lived session for stall tabs).
- A customer scans a TABLE QR code for a `PAY_BEFORE` tenant (session
  exists for table tracking, even though each order is paid immediately).

**What happens:**
- **Storefront:** The customer can add items to their cart and place orders.
  Each order is linked to this session via `orders.session_id`. (For
  dine-in sessions the cart is a server-persisted `carts` row shared by
  all devices at the table; for stall/kiosk sessions the cart lives in
  the device's `localStorage`.)
- **Multi-order accumulation:** In `PAY_AFTER` mode, the customer can place
  multiple orders over the course of their visit. All orders accumulate in
  the session and will be combined into one bill when the session closes.
- **Kitchen:** Each order in the session generates its own kitchen ticket.
  All tickets show the same table/counter reference.
- **Merchant portal:** The table map shows this table as "occupied" (green
  or highlighted). The session is visible in the active sessions list.
- **Abandoned session cleanup:** A platform-wide background job closes
  sessions that have been ACTIVE for more than 24 hours. This prevents
  orphaned sessions from stale QR scans or abandoned tables.

**Real-world example 1 (dine-in, PAY_AFTER):** A family sits at Table 7
at "Sach Ko Angkor" (សាច់គោអង្គរ), a BBQ restaurant. They scan the
Table 7 QR code. The system creates an ACTIVE session for Table 7. Over
the next 90 minutes, they place three orders:
- Order 1: 2x beef set, 1x pork set (appetizers)
- Order 2: 4x iced tea, 1x beer (drinks while grilling)
- Order 3: 2x sticky rice, 1x dessert (after the main course)

All three orders are linked to the same session. The kitchen receives three
separate tickets, all labeled "Table 7." The session remains ACTIVE
throughout.

**Real-world example 2 (stall, PAY_AFTER):** At a noodle stall, a customer
scans the STOREFRONT QR and orders noodle soup ($3.50). The system creates
an ACTIVE session. While eating, the customer orders an iced coffee ($1.50)
-- same session. Both orders accumulate. The customer taps "Pay" to settle
both for $5.00.

**Why it can't be removed:** ACTIVE is the only non-terminal state. Without
it, a session would be born CLOSED — which is logically impossible (a session
must be open before it can be closed). Every session starts as ACTIVE.

**Typical duration:**
- Stall tab (STALL_KIOSK + PAY_AFTER): 10-30 minutes
- Food court table (DINE_IN_TABLE + PAY_BEFORE): 20-45 minutes
- Restaurant table (DINE_IN_TABLE + PAY_AFTER): 30 minutes to 3 hours
- Sessions remain ACTIVE until closed by payment, merchant action, or the 24h background cleanup

---

### `CLOSED`

**Meaning:** The session is finalized. No more orders can be added. The
bill has been generated and (if `PAY_AFTER`) paid. The table or counter
is free for the next customer.

**Who sets it:**
- **System** — automatically when the bill is paid (PAY_AFTER flow: customer
  taps "Pay" → bill created → payment succeeds → session closes).
- **Merchant** — manually from the merchant portal. The merchant can
  force-close a session if the customer left without paying (PAY_AFTER
  walkaway scenario) or if the session is stale.
- **System** — background cleanup job closes abandoned sessions after 24
  hours (platform-wide safety net).

**What happens:**
- **Storefront:** If the customer tries to place a new order using the
  same QR code, a NEW session is created (not added to the closed one).
  The storefront treats each QR scan as a potential new session — if no
  ACTIVE session exists for that table, a new one is created.
- **Orders:** All orders in the session are finalized. No new orders can
  reference this session. Existing orders continue through their lifecycle
  (kitchen tickets complete normally).
- **Bill:** For `PAY_AFTER`, the bill is created at session close time by
  summing all non-cancelled orders in the session. For `PAY_BEFORE`, each
  order already has its own bill — session close is just a cleanup.
- **Merchant portal:** The table map shows the table as "available" (grey
  or empty). The session appears in the session history.
- **`closed_at` timestamp** is set, recording when the session ended.

**Real-world example 1 (happy path):** The family at Table 7 finishes their
BBQ dinner. They tap "Request Bill" on the storefront. The system:
1. Finds all non-cancelled orders in the session: $16 + $6.50 + $5 = $27.50
2. Creates a bill for $27.50
3. Customer pays via ABA QR
4. Payment succeeds → bill status = PAID → session status = CLOSED
5. `closed_at` is set to now()
6. Table 7 shows as "available" on the merchant portal's table map
7. The next customer who sits at Table 7 and scans the QR gets a new session

**Real-world example 2 (abandoned session):** A customer at a noodle stall
orders one bowl, eats, and walks away without tapping "Pay" (they forgot,
or they paid cash directly to the stall owner without using the app). The
merchant can close the session from the portal, or the background cleanup
job closes it after 24 hours:
- If the order was already paid (cash marked in merchant portal): session
  closes cleanly.
- If unpaid: the system creates a bill and marks it as OPEN. The merchant
  can settle it manually later or void it.

**Real-world example 3 (merchant force-close):** At a restaurant, the
PAY_AFTER session for Table 3 has been ACTIVE for 3 hours. The table is
visibly empty — the customers left. The manager force-closes the session
from the merchant portal. If there are unpaid orders, the manager can void
them or mark them as paid (cash).

**Why it can't be removed:** CLOSED is the terminal state that signals "this
session is done." Without it:
- Tables would never show as "available" on the table map.
- New customers scanning the same QR code would be added to the previous
  customer's session (cross-customer order contamination).
- There would be no signal to create the final bill.

**Typical duration:** Terminal state. The session row stays in the database
for historical queries (order history, session duration analytics, table
turnover rate).

---

## Part 2 — State machine

### The happy path (PAY_AFTER)

```
ACTIVE ──► CLOSED
        (customer pays bill)
```

### Merchant force-close / abandoned session cleanup

```
ACTIVE ──► CLOSED
        (merchant closes from portal / 24h cleanup job)
```

### Full state machine diagram

```
              ┌──► CLOSED (bill paid)
              │
ACTIVE ──────┼──► CLOSED (merchant force-close)
              │
              └──► CLOSED (24h abandoned session cleanup)
```

### Valid transitions (complete list)

| From | To | Trigger |
|---|---|---|
| `ACTIVE` | `CLOSED` | Bill is paid (PAY_AFTER: all orders settled) |
| `ACTIVE` | `CLOSED` | Merchant force-closes from the portal |
| `ACTIVE` | `CLOSED` | PAY_BEFORE session: all orders are individually paid + table is freed |
| `ACTIVE` | `CLOSED` | Background cleanup job (session abandoned for 24+ hours) |

**Invalid transitions (these should never happen):**
- CLOSED to ACTIVE (a closed session cannot be reopened — if the customer
  returns to the table, a new session is created. Reopening would risk
  mixing two different customers' orders.)

**Note:** This is a two-state machine with a single valid transition:
ACTIVE to CLOSED. It's the simplest possible state machine — one
non-terminal and one terminal. The complexity lies not in the states
themselves but in the triggers and side effects.

---

## Part 3 — Session creation rules

### When is a session created?

The rules depend on `ServiceModel` and `PayTiming`:

```
ServiceModel       PayTiming       Session?    Behavior
──────────────────────────────────────────────────────────────────
STALL_KIOSK       PAY_BEFORE       No          1 order = 1 bill, no session
STALL_KIOSK       PAY_AFTER        Yes         Short tab, orders accumulate
DINE_IN_TABLE     PAY_BEFORE       Yes         Table tracking, each order paid
DINE_IN_TABLE     PAY_AFTER        Yes         Full dine-in, orders accumulate
```

### Why STALL_KIOSK + PAY_BEFORE has no session

This is the simplest flow: customer orders, pays, gets food. There is
nothing to "session" — no table, no tab, no multi-order accumulation.
Creating a session would be pure overhead.

```
Bubble tea kiosk flow (no session):
  Scan QR → Order bubble tea → Pay $3 → Wait → Pick up → Done.
  Want another drink? Scan again → new order → new bill.
```

### Session and QR context interaction

When a customer scans a QR code, the storefront checks for an existing
ACTIVE session:

```
Customer scans TABLE QR for Table 5
    │
    ▼
Is there an ACTIVE session for this tenant + table_ref = "5"?
    │
    ├── Yes → Join the existing session (add orders to it)
    │         (This handles multiple people at the same table)
    │
    └── No  → Create a new ACTIVE session
              Set qr_context_id, table_ref
              Return the new session to the storefront
```

This means two customers at the same table (e.g., a couple) both scan the
QR code and both see the same session. They can both add items, and
everything accumulates into one bill. This is intentional — XFOS is
anonymous at MVP, so there's no per-customer cart separation within a table
session.

### Session closure mechanics

Sessions close by explicit action, not by timer:

```
Scenario A — Normal (bill paid):
  18:00  Session ACTIVE, customer ordering
  19:30  Customer requests bill, pays
  19:31  Session CLOSED (closed_at = 19:31)
  Result: Session closed by payment.

Scenario B — Merchant close:
  18:00  Session ACTIVE, customer ordering
  19:00  Customer places one order, then leaves
  19:15  Merchant sees empty table, force-closes session from portal
  Result: Bill created for unpaid orders. Merchant handles manually.

Scenario C — Abandoned (24h cleanup):
  18:00  Session ACTIVE, customer ordering
  19:00  Customer places one order, walks away without paying
  (next day)
  18:00  Background cleanup job finds session ACTIVE for 24+ hours → CLOSED
  Result: Bill created for unpaid orders. Merchant reviews later.
```

**Who runs the cleanup?** A BullMQ scheduled job that runs periodically,
queries for sessions where `status = 'ACTIVE' AND opened_at < now() - interval '24 hours'`,
and closes them. This is the same pattern used for idempotency key cleanup.

---

## Part 4 — What's NOT in this enum (and why)

| Omitted value | What it would mean | Why we skip it |
|---|---|---|
| `PENDING` | Session created but not yet accepting orders (e.g., waiting for first scan confirmation) | Not needed. Sessions are created at the moment the customer scans the QR — there's no intermediate step. The session is immediately ACTIVE and ready for orders. |
| `EXPIRED` | Session closed due to timeout (distinct from CLOSED) | Sessions no longer have timer-based expiry. They close by payment, merchant action, or a 24h background cleanup. **2026-04-25:** the *why* of closure now lives in the sibling enum `OrderSessionCloseReason` (`PAID` / `STAFF_FORCE_CLOSED` / `AUTO_TIMEOUT_24H` / `WALKED_AWAY`), which gives analytics first-class queries without bloating the lifecycle enum. |
| `PAUSED` | Session temporarily paused (e.g., customer stepped away) | Adds complexity without clear value. If the customer leaves temporarily, the session stays ACTIVE. The expiry timer handles true abandonment. |
| `BILLING` | Session is in the process of billing (orders frozen, payment in progress) | This is a transient state that lasts seconds (create bill → display payment → confirm). Modeling it as a session status would require managing the transition back to ACTIVE (if payment fails) or to CLOSED (if payment succeeds). The bill's own status (`BillStatus`) already tracks this. |
| `DISPUTED` | Session has a payment dispute | Disputes are handled at the `bills` or `payments` level, not the session level. A disputed payment doesn't change the session — it changes the bill status. |

### Why not add `EXPIRED` as distinct from `CLOSED`?

This was considered. The argument for:
- Analytics: "What % of sessions were abandoned vs closed normally?"
- Different merchant portal display: "Session abandoned (no bill paid)"
  vs "Session closed (bill settled)."

**2026-04-25 resolution: sibling enum, not lifecycle bloat.** The
`closed_reason` column on `order_sessions` (typed as
`OrderSessionCloseReason`) carries the analytical detail without
forcing every consumer of the lifecycle enum to handle a third state:

```sql
-- "Find walkaways this week" — first-class indexable query
SELECT * FROM order_sessions
WHERE status = 'CLOSED'
  AND closed_reason = 'WALKED_AWAY'
  AND closed_at >= date_trunc('week', NOW());

-- "Is this session done?" — still a one-column predicate
WHERE status = 'CLOSED'
```

The CHECK constraint
`(status = 'CLOSED') = (closed_reason IS NOT NULL)` makes drift
impossible at the database level. See
`enums/order-session-close-reason.md` for the full design.

---

## Part 5 — Relationship to other enums and tables

### OrderSessionStatus and CartStatus

`carts` rows exist **only for `DINE_IN_TABLE` sessions** (decided
2026-04-24); stall/kiosk sessions hold their basket in `localStorage`
and never write a `carts` row. Within a dine-in session there is at
most one ACTIVE cart at a time (Option A — shared cart across devices,
enforced by partial unique index on `carts.session_id WHERE status =
'ACTIVE'`).

| Session status | Cart behavior (dine-in) |
|---|---|
| `ACTIVE` | One shared ACTIVE cart can exist at a time. "Submit Order" → cart CONVERTED → new ACTIVE cart starts on next add. |
| `CLOSED` | No new carts for this session. Any remaining ACTIVE cart is marked ABANDONED by the session-close handler. |

When a dine-in session closes, the open cart (if any) is automatically
marked as ABANDONED. This is part of the session-close side effects.
Stall/kiosk sessions have no carts to sweep.

### OrderSessionStatus and OrderStatus

| Session status | Order behavior |
|---|---|
| `ACTIVE` | New orders can be created and linked to this session. |
| `CLOSED` | No new orders. Existing orders continue through their lifecycle (kitchen tickets complete normally). |

Closing a session does NOT cancel in-progress orders. If the kitchen is
still preparing food when the session closes (because the customer paid),
the kitchen tickets complete normally. The session close means "no more
NEW orders" — not "stop everything."

### OrderSessionStatus and BillStatus

The bill is created when the session transitions from ACTIVE to CLOSED
(in PAY_AFTER mode):

```
Session ACTIVE → Customer taps "Request Bill"
  → System creates bill (BillStatus = OPEN)
  → Customer initiates payment (PaymentStatus = INITIATED → PENDING)
  → Payment succeeds (PaymentStatus = SUCCEEDED, BillStatus = PAID)
  → Session → CLOSED
```

For PAY_BEFORE sessions, each order has its own bill. The session close
is decoupled from billing.

### Tables involved

| Table | How it relates to OrderSessionStatus |
|---|---|
| `order_sessions` | The primary table — `status` column uses this enum |
| `orders` | `session_id` links orders to the session |
| `carts` | `session_id` links carts to the session — **NOT NULL**, dine-in only (since 2026-04-24) |
| `bills` | `session_id` links the aggregated bill to the session |
| `qr_contexts` | `qr_context_id` on the session records which QR started it |

---

## Part 6 — Decision

### Question: Are 2 values sufficient?

**Answer: Yes.** A session is either open or closed. That's it.

| Value | Purpose | Can it be removed? |
|---|---|---|
| `ACTIVE` | Session is open, accepting orders | No — the only non-terminal state; every session starts here |
| `CLOSED` | Session is done, no more orders | No — the terminal state that frees the table and triggers billing |

### What we decided

- **Keep both values.** Two states is the minimum for a session lifecycle.
  A session must be able to be "open" and "closed."
- **No EXPIRED state.** Sessions close by payment, merchant action, or
  24h cleanup. The close reason can be derived from context (was a bill
  paid?) without adding a third status.
- **No BILLING state.** The billing process is transient and tracked by
  `BillStatus`, not session status.
- **Abandoned session cleanup via BullMQ.** A scheduled job runs
  periodically and closes sessions that have been ACTIVE for more than 24
  hours. This prevents orphaned ACTIVE sessions from blocking table
  availability.
- **Session close triggers side effects:** for dine-in, the ACTIVE cart
  (if any) is marked ABANDONED; the table map is updated; and (for
  PAY_AFTER) the bill is created. These side effects are handled in the
  session-close service, not by the enum itself.
