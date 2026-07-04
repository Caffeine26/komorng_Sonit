# OrderSource — Design Discussion & Decision

**Date:** 2026-04-24
**Status:** ✅ Applied alongside the orders enterprise upgrade
**Affects:** `orders.source`

---

## The enum

```sql
CREATE TYPE "OrderSource" AS ENUM (
  'STOREFRONT_QR',
  'MERCHANT_MANUAL',
  'API',
  'MOBILE_APP'
);
```

`orders.source` is `NOT NULL DEFAULT 'STOREFRONT_QR'`. The CHECK constraints `orders_storefront_has_no_creator` and `orders_manual_has_creator` enforce the source ↔ `created_by_id` pairing rules.

---

## Part 1 — Why this enum exists

The vast majority of orders at MVP come from a customer scanning a QR code and ordering through the storefront (`STOREFRONT_QR`). But the user identified two real workflows that require staff to enter the order on behalf of the customer:

1. **Walk-in at a stall** — a customer arrives at the noodle stall and tells the cashier their order verbally. The cashier enters it into the merchant portal.
2. **Elderly dine-in customer** — a customer at a sit-down restaurant asks the waiter to enter their order, because the QR-scan flow is too unfamiliar.

Both workflows produce a normal order in every functional sense (kitchen ticket, bill, payment, status lifecycle), but the system needs to record:

- **Where the order came from** (so analytics and operational reports distinguish self-service from staff-entered).
- **Which staff member entered it** (for accountability, training feedback, dispute resolution).

The enum also reserves space for two future sources (`API`, `MOBILE_APP`) so adding them later is a non-breaking enum addition rather than a schema migration.

---

## Part 2 — Each value explained

### `STOREFRONT_QR`

**Meaning:** The customer scanned a QR code (storefront or table) and built the order themselves through the storefront PWA.

**`created_by_id`:** **Must be NULL.** Customers are anonymous at MVP — there is no `users` row to reference. The CHECK constraint `orders_storefront_has_no_creator` enforces this.

**`qr_context_id`:** Set to the QR that was scanned.

**Real-world example:** A customer at "Brown Coffee" scans the counter QR, picks Caramel Latte, taps "Place Order & Pay." The order has `source = STOREFRONT_QR`, `qr_context_id = qr_brown_counter`, `created_by_id = NULL`.

**Frequency:** Default for most orders.

---

### `MERCHANT_MANUAL`

**Meaning:** A staff member entered the order in the merchant portal on behalf of the customer.

**`created_by_id`:** **Must be NOT NULL.** The CHECK constraint `orders_manual_has_creator` enforces this — every staff-entered order has clear accountability.

**`qr_context_id`:** Optional. Set if the staff member explicitly tagged a table or pickup point in the portal (common for dine-in: the waiter selects "Table 5" before adding items). NULL for pure walk-up entry.

**Real-world examples:**

1. **Walk-in noodle stall (the user's first scenario):**
   ```
   source:         MERCHANT_MANUAL
   created_by_id:  'usr_sokha_cashier'
   qr_context_id:  NULL                  -- no table, walk-up
   service_model:  STALL_KIOSK
   pay_timing:     PAY_AFTER             -- standard for the stall
   ```

2. **Elderly dine-in (the user's second scenario):**
   ```
   source:         MERCHANT_MANUAL
   created_by_id:  'usr_pavi_waiter'
   qr_context_id:  'qr_table5'           -- waiter selected the table from the portal
   service_model:  DINE_IN_TABLE
   pay_timing:     PAY_AFTER
   table_ref:      '5'
   ```

3. **Phone-in pickup:** A regular customer calls the stall to place a takeaway order. The cashier enters it; same shape as walk-in.

**Frequency:** Common at dine-in restaurants for elderly customers; common at stalls for walk-ups; rare at pure self-service kiosks.

---

### `API`

**Meaning:** A third-party integration created the order via the platform's REST/GraphQL API.

**`created_by_id`:** Optional — depends on the integration design (may be a service account user, may be NULL for system integrations).

**Status:** **Reserved for post-MVP.** No API endpoints exist today. The value is included so future delivery aggregator integrations (Foodpanda, Nham24, etc.) and partner POS systems can be added without an enum migration.

**Frequency:** N/A (not in use).

---

### `MOBILE_APP`

**Meaning:** A customer placed the order through the future XFOS mobile app (Phase 2: pickup orders, marketplace browsing).

**`created_by_id`:** Will likely be NULL once customer accounts exist — the mobile app will set a future `customer_id` column instead.

**Status:** **Reserved for post-MVP.** Phase 2 territory. Listed today for forward-compatibility so analytics can track the channel from day one when it launches.

**Frequency:** N/A (not in use).

---

## Part 3 — CHECK constraints — `source` ↔ `created_by_id` pairing

Two constraints encode the rules at the database level:

```sql
-- STOREFRONT_QR forbids created_by_id (customers are anonymous)
CONSTRAINT orders_storefront_has_no_creator
  CHECK ((source != 'STOREFRONT_QR') OR (created_by_id IS NULL))

-- MERCHANT_MANUAL requires created_by_id (staff must be accountable)
CONSTRAINT orders_manual_has_creator
  CHECK ((source != 'MERCHANT_MANUAL') OR (created_by_id IS NOT NULL))
```

`API` and `MOBILE_APP` are unconstrained — `created_by_id` may be set or NULL depending on the integration design.

These rules could have been left to the application layer, but the orders table is hot for raw SQL during incident response and migrations. The DB-level CHECK ensures no code path (raw SQL, batch import, buggy migration) can produce an inconsistent row.

---

## Part 4 — Why these four and not others

### Considered and rejected

| Rejected value | Why |
|---|---|
| `IN_PERSON` | Ambiguous — does it mean walk-up at a counter? Self-scanned at a table? Already covered by `STOREFRONT_QR` (with table QR) or `MERCHANT_MANUAL`. |
| `PHONE` | Sub-case of `MERCHANT_MANUAL` (staff entering a phone-in). The fact that the customer called doesn't change the system's data model — only the staff's notes do. |
| `DELIVERY_PARTNER` | Sub-case of `API` (any delivery aggregator integrates via the API). |
| `KIOSK_TERMINAL` | Hypothetical self-service touchscreen distinct from QR scanning — not in MVP scope. If added later, `KIOSK` could be its own value or treated as a sub-case of `STOREFRONT_QR`. |

### Why no `customer_id` column today

The user already documented this on `carts`: customer accounts arrive in Phase 2 (mobile app, marketplace, pickup). At MVP all storefront customers are anonymous, identified per-order by `order_token`. `MOBILE_APP` will pair with a future `customer_id TEXT REFERENCES customers(id)` column — additive, no breaking change.

---

## Part 5 — Future evolution

This enum is designed to grow non-disruptively:

- **Add `KIOSK_TERMINAL`** if/when a dedicated self-service touchscreen mode ships.
- **Add `WHATSAPP_BOT` / `TELEGRAM_BOT`** if/when chat ordering ships.
- **Add `VOICE_AI`** for voice-call ordering (post-Phase 2).

Each addition is `ALTER TYPE … ADD VALUE` with no migration of existing rows.

---

## Part 6 — Related tables and enums

| Symbol | Relationship | Notes |
|---|---|---|
| `orders.source` | Direct user | NOT NULL with default `STOREFRONT_QR` |
| `orders.created_by_id` | Sibling | Pairing enforced by CHECK constraints |
| `orders.qr_context_id` | Sibling | Set for `STOREFRONT_QR`; optional for `MERCHANT_MANUAL` |
| `users` | FK target via `created_by_id` | Identifies the staff member who entered the order |
| `qr_contexts` | FK target via `qr_context_id` | The QR that started the order, if any |
| `idempotency_keys` | Indirect | Used by all sources to prevent double-submission on retry |
