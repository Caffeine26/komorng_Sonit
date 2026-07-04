# CartStatus — Design Discussion & Decision

**Date:** 2026-04-09 (revised 2026-04-24 — scope reduced to dine-in only)
**Status:** Kept all 3 values — each is justified
**Affects:** `carts` table
**MVP scope (2026-04-24):** The `carts` table — and therefore this enum —
applies **only to `DINE_IN_TABLE` sessions**. Stall/kiosk flows
(`STALL_KIOSK + PAY_BEFORE` and `STALL_KIOSK + PAY_AFTER`) keep their cart
in the customer's browser `localStorage` and never write a row to `carts`.
Within a dine-in session there is **at most one `ACTIVE` cart at a time**
(enforced by a partial unique index on `carts.session_id`); each round of
ordering produces one CONVERTED cart, and a new ACTIVE cart starts when
the next round begins.

**MVP note:** All three states are active at MVP — but only inside dine-in
sessions. The storefront uses ACTIVE carts for round-building, CONVERTED
carts after each "Submit Order" tap, and the session-close handler marks
any open cart as ABANDONED when the bill is paid or the session times out.

---

## The enum

```sql
CREATE TYPE "CartStatus" AS ENUM (
  'ACTIVE',
  'CONVERTED',
  'ABANDONED'
);
```

---

## Part 1 — Each value explained in detail

### `ACTIVE`

**Meaning:** The customer is currently browsing and building their order.
Items in the cart are mutable — the customer can add, remove, or change
quantities.

**Who sets it:** System (default on creation). A cart is created as ACTIVE
when a customer starts adding items on the storefront.

**What happens:**
- **Cart items are mutable.** The customer can:
  - Add items (creates `cart_items` rows)
  - Remove items (deletes `cart_items` rows)
  - Change quantities (updates `cart_items.quantity`)
  - Add notes per item (updates `cart_items.notes`)
- **Prices are snapshotted at add-time.** When a customer adds a menu item
  to the cart, `cart_items.unit_price_cents` is set to the item's current
  price. If the merchant changes the price while the customer is browsing,
  the cart keeps the original price. This prevents surprise price changes
  at checkout.
- **Cart is always linked to a dine-in session.** `carts.session_id` is
  NOT NULL — every cart belongs to a `DINE_IN_TABLE` `order_sessions` row.
  Stall/kiosk flows do not create cart rows.
- **One ACTIVE cart per session (Option A — shared cart).** A partial
  unique index on `carts.session_id WHERE status = 'ACTIVE'` enforces
  this. When multiple devices at the same table scan the QR, they all
  read and write the same ACTIVE cart row.
- **Cart is tenant-scoped.** `carts.tenant_id` ensures cart isolation.
  Cross-tenant bleed is impossible (parity trigger).
- **No customer identity at MVP.** The cart is identified by its parent
  `session_id`. Phase 2 will add a nullable `customer_id` for mobile-app
  pickup and marketplace flows — additive, no breaking change.

**Real-world example:** A group of three at Table 5 of "Sach Ko Ang"
(សាច់គោអាំង) BBQ restaurant in Siem Reap. Two of them scan the table QR
and start building Round 1 together:
- Lina taps "Beef Skewers" (4 × $6.00) from her phone → added to cart.
- Sokha taps "Grilled Fish" ($8.00) from his phone → added to the same
  cart row (shared per-session).
- Lina taps "Steamed Rice" ($1.50) × 3 → added.
- Sokha changes Beef Skewers quantity from 4 to 6 → updated.
- Cart total: 6× Beef Skewers ($36.00) + Grilled Fish ($8.00) + 3× Rice
  ($4.50) = $48.50.
- Cart status: ACTIVE. Ready for "Submit Order."

(A bubble-tea customer at "Boba Khmae" doing the equivalent flow has the
same UX in their browser — but no `carts` row is written; the basket lives
in `localStorage` and goes straight to `orders` on submit.)

**Why it can't be removed:** ACTIVE is the only mutable state. Without it,
there's no way to represent "the customer is still shopping." Every cart
starts here.

**Typical duration:** 5–30 minutes per round at a dine-in table —
multiple rounds are normal across a meal. Each round = one ACTIVE cart
that eventually transitions to CONVERTED.

---

### `CONVERTED`

**Meaning:** The customer completed checkout. The cart items were
snapshotted into `order_items`, an `orders` row was created, and the cart
is now read-only. The cart has served its purpose — it became an order.

**Who sets it:** System (automatically at checkout). The checkout flow:
1. Customer taps "Checkout" on the storefront.
2. System validates cart items (all items still available? prices still
   correct? quantities > 0?).
3. System creates an `orders` row from the cart.
4. System creates `order_items` rows by snapshotting `cart_items` (with
   `item_name` resolved from translations).
5. System sets `carts.status = 'CONVERTED'`.
6. Cart is now read-only — the customer cannot modify it.

**What happens:**
- **Cart items are frozen.** No adds, removes, or quantity changes.
  The items live on as `order_items` on the new order.
- **Cart is retained** for auditing and debugging ("what was in the cart
  when the customer checked out?"). It's not deleted.
- **If the customer wants to order again:** A new cart is created (new
  ACTIVE cart). The CONVERTED cart stays as a historical record.
- **In a session:** If the customer is in an ACTIVE session (dine-in or
  pay-after stall), they can create a new cart and order again — multiple
  carts/orders per session.

**Real-world example:** Sokha taps "Submit Order" on the shared Round 1
cart at Sach Ko Ang (6× Beef Skewers, Grilled Fish, 3× Rice). The system:
1. Creates Order ORD-000042 with `subtotal_cents = 4850`, `total_cents = 4850`,
   `session_id = 'sess_bbq_005'`.
2. Creates three `order_items` rows snapshotting the cart items with their
   bilingual names, variant + options snapshots, and prices.
3. Sets `cart_001.status = CONVERTED`.
4. Because dine-in is `PAY_AFTER`: order is created immediately as
   SUBMITTED, kitchen ticket is created, kitchen starts cooking. The bill
   is settled later when the table requests it.
5. When the table starts Round 2, a new ACTIVE cart (`cart_002`) is
   created in the same session — the partial unique index allows it
   because `cart_001` is no longer ACTIVE.

The CONVERTED cart stays in the database. It's linked to the order via
shared `session_id` and timing, but there's no FK from `orders` back to
`carts` — the order stands on its own with its `order_items`.

**Why it can't be removed:** CONVERTED is what prevents double-checkout.
Without it, a customer could tap "Checkout" twice and create two identical
orders. The checkout flow checks: is the cart ACTIVE? If yes, proceed.
If CONVERTED, reject ("this cart has already been checked out").

**Typical duration:** Terminal state. The cart row stays for historical
reference and analytics.

---

### `ABANDONED`

**Meaning:** The customer left without checking out. Items were added to
the cart but never converted into an order. The cart is now read-only.

**Who sets it:**
- **System (session-close handler)** — when the dine-in session closes
  (bill paid, merchant force-close, or 24h cleanup job), any ACTIVE cart
  in that session is immediately marked ABANDONED.
- **System (cleanup sweep)** — a periodic BullMQ job marks any cart whose
  parent session has been CLOSED for more than a few minutes but whose
  status was missed by the close handler. This is a belt-and-braces
  safety net.

**What happens:**
- **Cart items are frozen.** Same as CONVERTED — no more modifications.
- **No order was created.** The items in the cart never became an order.
  The kitchen never saw these items.
- **Data is retained for analytics.** Abandoned cart data is valuable:
  - **What items do people add but not buy?** If 50% of carts containing
    "Spicy Noodle Soup" are abandoned, maybe the price is too high or
    the description is unclear.
  - **Where do people drop off?** If abandonment spikes at a certain
    time of day, maybe the storefront is slow or the menu is overwhelming.
  - **Cart abandonment rate.** A key e-commerce metric. High abandonment
    signals UX or pricing issues.

**Real-world example 1 (bill arrives mid-browsing):** At Sach Ko Ang,
the table requests the bill at the end of the meal. The waiter brings
it; one guest is still browsing dessert options on their phone but never
taps "Submit Order." The bill is paid, the session transitions to
CLOSED, and the in-progress dessert cart is marked ABANDONED. The
merchant's analytics: "1 dessert round considered but not ordered at
Table 5 — guests Pavi and Coffee Pudding had been added."

**Real-world example 2 (price shock at the table):** A guest at a BBQ
restaurant adds the premium wagyu platter ($45) to the shared dine-in
cart. The group sees the total and removes it. They submit a smaller
order without it. The cart that contained the wagyu was either
CONVERTED (without the wagyu line) or, if the group changed their mind
mid-build and never submitted, ABANDONED on session close. Wagyu
appearing in many ABANDONED carts is a price signal for the merchant.

**Real-world example 3 (merchant force-close):** The merchant closes
the session for Table 8 from the portal (the table is empty — guests
left without paying / the staff resolved a walkaway separately). Any
ACTIVE cart in the session is immediately marked ABANDONED.

**Note on stall/kiosk:** Kiosk customers who add items in `localStorage`
and walk away never reach this status — there's no `carts` row to mark.
The basket simply expires with the browser session. Abandonment
analytics for kiosk are derived client-side via lightweight telemetry,
not from this table.

**Why it can't be removed:** Without ABANDONED, stale carts would stay
ACTIVE forever. This has two problems:
1. **Data integrity:** If a customer returns to a stale QR code days later,
   they might see items from their previous visit still in the cart —
   with potentially outdated prices.
2. **Analytics:** There's no way to distinguish "the customer is still
   browsing" from "the customer left." Abandoned cart analytics require
   a clear terminal state.

**Why it's distinct from CONVERTED:**
- CONVERTED = the customer bought something. Happy outcome.
- ABANDONED = the customer left without buying. Lost revenue opportunity.
- Different business meaning, different analytics, different follow-up
  actions.

**Typical duration:** Terminal state. Cart rows are retained for analytics.
A cleanup job may eventually purge very old ABANDONED carts (e.g., older
than 90 days) to save storage, but this is a post-MVP concern.

---

## Part 2 — State machine

### The happy path

```
ACTIVE ──► CONVERTED
        (customer checks out)
```

### Abandonment (session close)

```
ACTIVE ──► ABANDONED
        (parent dine-in session CLOSED without "Submit Order")
```

### Abandonment (cleanup sweep)

```
ACTIVE ──► ABANDONED
        (BullMQ sweep — safety net for sessions whose close handler missed the cart)
```

### Full state machine diagram

```
              ┌──► CONVERTED  (checkout successful)
              │
ACTIVE ──────┤
              │
              └──► ABANDONED  (timeout / session close / cleanup)
```

### Valid transitions (complete list)

| From | To | Trigger |
|---|---|---|
| `ACTIVE` | `CONVERTED` | Anyone at the table taps "Submit Order" → order created from cart items; partial unique index frees up the slot for the next round's ACTIVE cart |
| `ACTIVE` | `ABANDONED` | Parent dine-in session transitions ACTIVE → CLOSED (bill paid) without this cart being submitted |
| `ACTIVE` | `ABANDONED` | Merchant force-closes the session from the portal |
| `ACTIVE` | `ABANDONED` | 24h background cleanup closes the parent session (safety net) |

**Invalid transitions (these should never happen):**
- CONVERTED to ACTIVE (the order already exists — you can't "un-checkout")
- CONVERTED to ABANDONED (the cart successfully became an order — it wasn't abandoned)
- ABANDONED to ACTIVE (the cart is stale — if the customer returns, they start fresh)
- ABANDONED to CONVERTED (stale cart items may have outdated prices, unavailable items, etc.)

**Note:** Like OrderSessionStatus, this is a simple fan-out from ACTIVE to
one of two terminal states. ACTIVE is the only mutable state.

---

## Part 3 — Cart lifecycle in different ordering modes

### STALL_KIOSK (any pay timing) — no `carts` row

Kiosk flows do **not** write to the `carts` table. The basket lives in
`localStorage` on the customer's device. On "Place Order", the storefront
posts the basket directly to the orders API, which creates `orders` and
`order_items` from the payload. Reload / close = fresh basket.

```
Customer scans STOREFRONT QR
    │
    ▼
Storefront opens; basket = empty array in localStorage
    │
    ├── Customer adds items (localStorage updates)
    ├── Customer taps "Place Order"
    │     → POST /orders { items: [...] }
    │     → Backend creates orders + order_items directly
    │     → (PAY_BEFORE: payment gate first; PAY_AFTER: order is SUBMITTED immediately)
    │
    └── Customer reloads / closes browser
          → localStorage may be cleared by the storefront on load (kiosk reset behaviour)
          → No DB cleanup needed — there was never a row
```

This is a deliberate design choice (2026-04-24): kiosk is one-shot
transactional, multi-device sharing isn't a use case, and saving DB
writes matters on the highest-volume surface.

### DINE_IN_TABLE (any pay timing) — server-persisted, one shared cart per session

```
Customer scans TABLE QR (Table 5)
    │
    ▼
Session created (ACTIVE)
Cart #1 created (ACTIVE, session_id linked)
    │
    ├── Cart #1: appetizer order → CONVERTED → Order #1 (SUBMITTED)
    │
    ├── 20 min later: Cart #2 → main course → CONVERTED → Order #2
    │
    ├── 45 min later: Cart #3 → desserts → CONVERTED → Order #3
    │
    ├── Cart #4 started (customer was browsing drinks but decided not to)
    │     → Left in ACTIVE state
    │
    └── Customer taps "Request Bill" → bill for orders 1+2+3 → paid
          → Session CLOSED
          → Cart #4: ABANDONED (never checked out)
```

### Price snapshot timing

A critical detail: `cart_items.unit_price_cents` is set when the item is
added to the cart, not when the cart is checked out. This means:

```
18:00  Customer adds "Kuy Teav" to cart. Price = $2.00 → unit_price_cents = 200.
18:05  Merchant changes Kuy Teav price to $2.50 (evening pricing).
18:10  Customer checks out. They pay $2.00, not $2.50.
```

This is standard e-commerce behavior: the price at add-time is the price
the customer agreed to. Changing prices mid-cart would be a terrible
customer experience.

**Edge case:** What if the item becomes unavailable (`is_available = false`)
between add-time and checkout? The checkout validation catches this:
- "Kuy Teav is currently unavailable. Remove it from your cart to proceed."
- The customer can remove the item and continue, or abandon the cart.

---

## Part 4 — What's NOT in this enum (and why)

| Omitted value | What it would mean | Why we skip it |
|---|---|---|
| `EXPIRED` | Cart timed out (distinct from ABANDONED) | Same reasoning as OrderSessionStatus: "expired" vs "abandoned" is a distinction that can be derived from timestamps. A cart abandoned by timeout and a cart abandoned by session close are both ABANDONED. The trigger is recorded in `audit_logs` if needed. |
| `MERGED` | Cart was combined with another cart | Not a feature at MVP. Merging carts (e.g., two people at the same table combining their carts into one order) is a post-MVP concern. If added, MERGED would be a terminal state pointing to the surviving cart. |
| `SAVED` | Cart saved for later (wishlist-like) | Not relevant for food ordering. Food orders are immediate — nobody saves a cart of noodle soup to buy next week. This is an e-commerce concept that doesn't apply. |
| `PENDING_CHECKOUT` | Customer hit "checkout" but payment hasn't completed yet | This is a transient state that lasts seconds. The checkout flow is: ACTIVE cart → validate → create order → set CONVERTED. There's no gap where the cart needs a "pending checkout" status. If the order creation fails (validation error), the cart stays ACTIVE and the customer can retry. |
| `VOIDED` | Cart was voided by the merchant | Merchants don't interact with carts — carts are customer-side. If a merchant cancels an order, the order status changes (to CANCELLED), not the cart status. The cart was already CONVERTED at that point. |

---

## Part 5 — Relationship to other enums and tables

### CartStatus and OrderSessionStatus

| Session status | Cart behavior |
|---|---|
| `ACTIVE` | Carts can be created, modified, and checked out within the session |
| `CLOSED` | Any ACTIVE carts linked to this session are automatically ABANDONED |

This is a key side effect of session close: the system sweeps for orphaned
ACTIVE carts and marks them ABANDONED.

### CartStatus and OrderStatus

The cart-to-order conversion is a one-way snapshot:

```
Cart (ACTIVE)                          Order
├── cart_items:                        ├── order_items:
│   ├── menu_item_id: "item_A"        │   ├── menu_item_id: "item_A"
│   │   unit_price_cents: 250         │   │   item_name: "Taro Milk Tea"
│   │   quantity: 2                   │   │   unit_price_cents: 250
│   │   notes: "less ice"            │   │   quantity: 2
│   │                                 │   │   line_total_cents: 500
│   └── menu_item_id: "item_B"        │   │   notes: "less ice"
│       unit_price_cents: 200         │   │
│       quantity: 1                   │   └── menu_item_id: "item_B"
│       notes: null                   │       item_name: "Mango Smoothie"
│                                     │       unit_price_cents: 200
Cart → CONVERTED                      │       quantity: 1
                                      │       line_total_cents: 200
                                      │       notes: null
                                      ├── subtotal_cents: 700
                                      └── total_cents: 700
```

Key differences between `cart_items` and `order_items`:
- `order_items` adds `item_name` (snapshotted from translations — survives
  if the translation changes later).
- `order_items` adds `line_total_cents` (precomputed: quantity * price).
- `order_items` does NOT have an FK back to `carts` or `cart_items`.
  The order is self-contained.

### CartStatus and ServiceModel / PayTiming

`carts` rows exist **only for `DINE_IN_TABLE`** (decided 2026-04-24).
Stall/kiosk flows skip the table entirely. Within dine-in, the cart
itself doesn't change behaviour based on `PayTiming`. The difference is
in what happens AFTER conversion:

| PayTiming | After cart CONVERTED |
|---|---|
| `PAY_BEFORE` | Payment gate → payment success → order created as SUBMITTED → kitchen starts |
| `PAY_AFTER` | Order created immediately as SUBMITTED → kitchen starts |

### Tables involved

| Table | How it relates to CartStatus |
|---|---|
| `carts` | The primary table — `status` column uses this enum (dine-in only since 2026-04-24) |
| `cart_items` | Items in the cart. Mutable when cart is ACTIVE, frozen when CONVERTED or ABANDONED |
| `order_sessions` | `session_id` on the cart links to the session (NOT NULL — every cart belongs to a `DINE_IN_TABLE` session) |
| `orders` | Created from the cart when status transitions to CONVERTED |
| `order_items` | Created as a snapshot of `cart_items` during conversion |

---

## Part 6 — Decision

### Question: Are 3 values sufficient?

**Answer: Yes.** A cart has one mutable state and two terminal states:

| Value | Purpose | Can it be removed? |
|---|---|---|
| `ACTIVE` | Customer is still browsing and adding items | No — the only mutable state; every cart starts here |
| `CONVERTED` | Customer checked out, order was created | No — the success terminal; without it, there's no way to prevent double-checkout |
| `ABANDONED` | Customer left without buying | No — the failure terminal; without it, stale carts accumulate and analytics are impossible |

### What we decided

- **Keep all 3 values.** They represent the three outcomes of a shopping
  cart: still shopping, bought, or left.
- **No EXPIRED state.** Abandonment covers all cases of "cart didn't
  convert." The trigger (timeout vs session close vs manual cleanup) is
  contextual, not a status.
- **No PENDING_CHECKOUT.** The checkout-to-conversion flow is atomic.
  The cart goes from ACTIVE to CONVERTED in a single transaction. There's
  no intermediate state.
- **Abandoned cart analytics are a product feature.** The ABANDONED status
  enables abandoned cart reports in the merchant portal (post-MVP): "X%
  of carts were abandoned today, most contained [popular items]." This
  data helps merchants optimize their menu and pricing.
- **Price snapshots at add-time, not checkout-time.** This is standard
  e-commerce behavior and protects the customer from surprise mid-browsing
  price changes.
- **Scope reduced to dine-in only (2026-04-24).** Stall/kiosk basket lives
  in `localStorage` — no `carts` row, no `cart_items` rows. The enum's
  three states still cover every dine-in cart's lifecycle exactly.
- **One ACTIVE cart per session (Option A — shared cart).** Enforced by
  `UNIQUE(session_id) WHERE status = 'ACTIVE'`. Multiple devices at the
  same table see and write the same cart row. Phase 2 may evolve to
  Option C (shared cart with per-line-item device attribution) by adding
  a `cart_items.added_by_device` column — additive, no breaking change.
- **`ABANDONED` is one state, but the *reason* is captured separately
  (2026-04-24).** A sibling enum [`CartAbandonedReason`](cart-abandoned-reason.md)
  lives on `carts.abandoned_reason`, distinguishing benign cases
  (`SESSION_PAID`) from operational concerns (`SESSION_FORCE_CLOSED`,
  `SESSION_TIMEOUT`) and explicit staff actions (`STAFF_RESET`, with
  `carts.closed_by_id` recording *who*). This keeps `CartStatus` small
  while letting dashboards segment abandonment cleanly.
- **Optimistic concurrency via `carts.version` (2026-04-24).** Multi-device
  shared carts can be updated by two phones at the same instant. Every
  write checks-and-bumps `version`; conflicts surface as 0-rows-affected
  and the client refetches. Cleaner than holding row locks across HTTP
  requests.
