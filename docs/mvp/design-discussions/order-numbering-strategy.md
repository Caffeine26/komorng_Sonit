# Order / Bill / Ticket Numbering Strategy — Discussion & Decision

**Date:** 2026-04-22
**Status:** ✅ Decided
**Affects:** `tenants`, `tenant_sequences`, `orders`, `bills`, `kitchen_tickets`, merchant portal UI, kitchen app UI, storefront status page, receipt/invoice rendering
**Supersedes:** the original `ORD-000001` / `BILL-000001` / `TKT-000001` running-sequential scheme on `tenant_sequences`.

---

## TL;DR

Three kinds of identifier live together on an order, each with one job:

| Identifier | Example | Visibility | Purpose |
|---|---|---|---|
| Internal ID (cuid) | `clx8ord01...` | Never shown | Database primary key; all joins |
| Access token | `7f3k9a2bz1...` (long, unguessable) | URL only | Security gate for the public status page |
| Display number | `LB-042` | **Everywhere human-readable** | Customer, kitchen, merchant portal, audit log |

Display numbers follow two patterns:

| Artifact | Format | Example | Reset |
|---|---|---|---|
| Order (`orders.order_number`) | `{tenant_prefix}-{3+ digits}` | `LB-042` | **Daily** at tenant-local midnight |
| Kitchen ticket (`kitchen_tickets.ticket_number`) | **Same as the linked order's `order_number`** | `LB-042` | N/A (inherits) |
| Bill (`bills.bill_number`) | `{tenant_prefix}-B-{6+ digits}` | `LB-B-000125` | **Running sequential** (never resets) |

Customers only see `LB-042`. Bills live in the back office.

---

## Part 1 — Three identifiers per order

The original design had `orders.order_number = 'ORD-000001'` (running-sequential across all orders ever). After review, that format has three problems:

1. **Too long to say aloud.** Customer at the counter: *"I'm ORD-zero-zero-zero-zero-four-two"* — cognitive overhead at every interaction.
2. **No tenant context.** `ORD-000042` at Lucky Burger vs. `ORD-000042` at Boba Queen is ambiguous when seen outside tenant context (platform admin, cross-store support).
3. **Leaks tenant volume.** A customer seeing `ORD-005342` can estimate the platform's total order count — a privacy/competitive leak across tenants.

The solution separates **identity** from **access** from **display**:

- **Identity (`orders.id`)** — cuid. Database primary key. Never crosses an API boundary directly; all URLs reference `order_token` instead.
- **Access (`orders.order_token`)** — a long random token, globally unique, unguessable. Used in the public status-page URL (`xfos.app/s/{order_token}`). This is the **only** credential that grants access to an order.
- **Display (`orders.order_number`)** — short, human-readable, tenant-scoped. Shown everywhere humans look at orders.

**Key security property:** the displayed number is **not an access credential**. Guessing `LB-042` gets an attacker nothing — without `order_token`, they cannot read the order. This is why we can safely use short, even predictable, display numbers.

---

## Part 2 — Requirements (from the design discussion)

1. **Easy to spell aloud.** A customer should be able to say their order number to a staff member in one breath.
2. **Short but memorable.** 3–4 digits + prefix.
3. **Unique per store.** No ambiguity when two tenants both reference their "order 042".
4. **Not guessable for security.** Cannot be used to access other people's orders.
5. **No customer-vs-backoffice mismatch.** One number that everyone uses.
6. **Per-tenant control.** Tenants should feel ownership ("that's an LB order, mine").

Requirement 4 is satisfied by `order_token`, not by `order_number`. Requirements 1, 2, 3, 5, 6 drive the `order_number` format.

---

## Part 3 — Industry research

### Pattern survey

| Platform | Customer-facing number | Back-office / accounting number | Linkage |
|---|---|---|---|
| **Gong Cha** (your example) | `M140` (prefix = channel) | Not shown to customers — only tax reg number on receipt | UI |
| **Shopify** | `#1042` (per-shop sequential) | `INV-2026-00125` (separate invoice table) | UI |
| **Starbucks mobile** | `ABC123` (short pickup code) | No bill number shown | UI |
| **Square for Restaurants** | Daily-reset ticket # | Running receipt # for accounting | UI |
| **Toast POS** | Guest check # (resets daily per location) | Running receipt #, per-location | UI |
| **McDonald's self-serve kiosk** | 3-digit order # (resets roughly per hour) | Internal POS transaction ID | Kitchen screen only |

### Consistent pattern across the industry

1. A **short customer-facing number** for operational use. Usually 3–5 chars after any prefix. Often resets (daily / per-shift / per-hour) to keep it short.
2. A **separate running-sequential number** for accounting and tax compliance. Usually not shown on the front of the receipt.
3. **The two numbers never match**, and **the industry doesn't force them to**. The UI always shows the relationship explicitly ("order #1042 → invoice #INV-2026-00125").
4. **No one** uses either number as a security credential — URLs and APIs use opaque tokens or session auth.

### Gong Cha specifically (from the user's screenshot)

The receipt shows two numbers:

- **`注文番号: M140`** — the **order number**. Short, prefixed by channel (`M` = mobile). This is the only order identifier shown to the customer.
- **`登録番号: T3380001006170`** — this is **not an order identifier**. It is Gong Cha's Japanese **適格請求書発行事業者登録番号** — the tax invoice issuer registration number required on every receipt in Japan since the 2023 インボイス制度 reform. Every Gong Cha receipt in Japan shows the exact same `T338…` — it identifies the business, not the order.

So Gong Cha uses **exactly one customer-visible order identifier**: `M140`. Our solution matches this shape (short, prefixed, customer-primary) while adding the tenant-level disambiguation XFOS needs as a multi-tenant platform.

---

## Part 4 — Design decisions

### 4.1 Per-tenant prefix

Every tenant is assigned a **2–4 character uppercase code** at onboarding. Examples: `LB` (Lucky Burger), `BQ` (Boba Queen), `PPN` (Phnom Penh Fried Rice). This prefix:

- Is **globally unique across the platform** (`UNIQUE` on `tenants.code_prefix`).
- Is **immutable** once set. A rebrand does not rewrite history.
- Is **validated** at insert with a CHECK constraint: `^[A-Z]{2,4}$` (uppercase Latin only, no digits, no punctuation, no ambiguity with `0/O/1/I/l`).
- Is chosen by the tenant at onboarding with real-time availability check (like picking a username).

**Why not auto-assigned or channel-based?** Tenants feel ownership of their identity ("LB is our brand"). An opaque auto-assigned code (e.g. `T1234`) reads like an internal ID, not a brand handle.

**Storage location:** `tenants.code_prefix`, not `tenant_settings.code_prefix`. It is identity-level (like `slug`), not configuration-level.

### 4.2 Daily reset for orders (customer-facing, operational)

**Format:** `{code_prefix}-{counter_3_or_more_digits}`. Counter resets to 1 at the tenant's local midnight.

Examples over three days at Lucky Burger:

```
Day 1:  LB-001 → LB-042 → LB-250 → LB-999 → LB-1024
Day 2:  LB-001 → LB-042 → LB-037
Day 3:  LB-001 → LB-156
```

Zero-padded to 3 digits by default. Grows naturally to 4+ digits on busy days with no hard cap.

**Why daily reset:**

- Customer journeys are almost always same-day — a customer who orders at 11:00 pays, eats, leaves by 12:00. They don't reference `LB-042` next week.
- Kitchen staff have the same mental rhythm — "042 is the taro milk tea we're making now."
- Short codes stay short **forever**. A running counter would hit `LB-012345` within a year for a busy stall.

**Why the tenant's local midnight:** the merchant's workday defines a "day". A stall in Phnom Penh (ICT, UTC+7) rolls over at 00:00 ICT; rolling over at UTC midnight would reset at 07:00 local — mid-morning, confusing.

Reset logic reads `tenant_settings.timezone` inside the allocation function.

### 4.3 Running sequential for bills (financial audit)

**Format:** `{code_prefix}-B-{counter_6_or_more_digits}`. Never resets.

Examples: `LB-B-000001`, `LB-B-000125`, `LB-B-123456`.

**Why running (not daily-reset):**

- **Tax audit friendliness.** Many jurisdictions require sequential, non-resetting invoice/bill numbering for legal compliance. Even if Cambodia is lenient at MVP, keeping bills running-sequential avoids a migration when compliance tightens.
- **Cross-day lookups are normal for bills.** Accountants ask "what was bill 000125 last quarter?" — across-day queries need a globally unique (within tenant) identifier.
- **Bills don't need to be memorable.** Customers never quote bill numbers; accountants work with them in tools that do exact-match lookup.

**Why 6-digit zero-padding:** tenants can grow into 7+ digits naturally. A stall doing 500 bills/day hits 6 digits in ~5.5 years; staying zero-padded keeps lists aligned visually.

**Why `-B-` infix:** distinguishes bills from orders at a glance (`LB-042` vs. `LB-B-000125`). Without it, a cross-table log line mixing both numbers is hard to scan.

### 4.4 Tickets share the order's number — no separate sequence

**`kitchen_tickets.ticket_number = orders.order_number`.** Same string. No allocation. No separate counter in `tenant_sequences`.

**Why:**

- A kitchen ticket is the kitchen's view of an order, 1:1 with the order. Two different numbers (`LB-042` order, `LB-T-042` ticket) is an unnecessary translation.
- Kitchen staff say "where's 042?" — which means the same order the cashier just took payment for. One number avoids ambiguity.
- Simplifies the schema: one less counter, one less allocation helper, one less potential collision source.

Storage: `kitchen_tickets.ticket_number TEXT NOT NULL` remains a real column (not a view) — the app sets it to the order's `order_number` at ticket creation. This is intentional **denormalization** for kitchen-app read performance (no JOIN to orders on every kitchen screen refresh).

### 4.5 The two numbers never need to match — the UI surfaces the connection

`LB-042` (order) and `LB-B-000125` (bill) are intentionally unrelated numerically. The connection is shown **in the UI**, not inferred from the format:

```
Bill LB-B-000125
  Orders: LB-042
  Total:  $12.50  ✓ Paid (ABA QR)
```

For multi-order bills (dine-in sessions), forcing a shared number would be incoherent:

```
Session bill LB-B-000126
  Orders: LB-039, LB-040, LB-042
  Total:  $31.20
```

Every POS we surveyed (Shopify, Square, Toast, Starbucks, Gong Cha) shows this kind of linkage in the UI without aligning the underlying numbers. We follow the same pattern.

### 4.6 Prefix immutability

Once a tenant is created with `code_prefix = 'LB'`, that prefix is **frozen**. A rebrand from "Lucky Burger" to "Lucky Bistro" does not rename historical orders. Justifications:

- **Audit integrity.** Historical reports, invoices, and references to `LB-042` must remain resolvable.
- **Customer communication.** A customer with a 2-month-old complaint quoting `LB-042` should be found without knowing the rename.
- **Schema simplicity.** Immutability removes a whole class of cascade/rewrite concerns.

If a tenant genuinely wants a new identity, that's operationally a new tenant record (new `code_prefix`, new onboarding).

---

## Part 5 — UI / UX implications

### Customer storefront status page

```
╔═══════════════════════════╗
║   Your order LB-042       ║
║   Status: PREPARING       ║
║   Ready in ~5 min         ║
║                           ║
║   1× Taro Milk Tea (L)    ║
║   2× Fried Rice           ║
║   Total: $12.50 ✓ Paid    ║
╚═══════════════════════════╝
```

URL: `https://xfos.app/s/{order_token}`. No bill number. No internal ID.

### Printed / digital receipt

```
Lucky Burger
──────────────────
Order  LB-042
Time   2026-04-22 10:31
──────────────────
Taro Milk Tea (L)   $5.50
Fried Rice × 2      $7.00
──────────────────
Total              $12.50
Paid · ABA QR
──────────────────
Tax reg: T-XXXXXXX  (when/if required)
```

Still no bill number — compliance info appears only when the jurisdiction mandates it.

### Merchant portal — orders list

```
┌────────┬──────────────────┬────────────┬────────┬─────────┐
│ Number │ Time             │ Status     │ Total  │ Channel │
├────────┼──────────────────┼────────────┼────────┼─────────┤
│ LB-042 │ 2026-04-22 10:31 │ PREPARING  │ $12.50 │ MOBILE  │
│ LB-041 │ 2026-04-22 10:27 │ READY      │  $6.80 │ COUNTER │
│ LB-040 │ 2026-04-22 10:15 │ COMPLETED  │  $4.20 │ MOBILE  │
└────────┴──────────────────┴────────────┴────────┴─────────┘
```

### Merchant portal — order detail

```
Order LB-042
  2026-04-22 10:31 · Mobile QR

  Items:
    1× Taro Milk Tea (L)     $5.50
    2× Fried Rice            $7.00
                             ─────
  Total                     $12.50

  Status: PREPARING
  Paid ✓  Bill LB-B-000125 · ABA QR · 10:31:48
         [View bill →]
```

### Merchant portal — bills list (financial)

```
┌──────────────┬──────────────────┬──────┬────────┬───────────────────────┐
│ Bill         │ Time             │ St.  │ Total  │ Orders                │
├──────────────┼──────────────────┼──────┼────────┼───────────────────────┤
│ LB-B-000125  │ 2026-04-22 10:31 │ PAID │ $12.50 │ LB-042                │
│ LB-B-000124  │ 2026-04-22 10:20 │ OPEN │ $14.30 │ LB-039, LB-040 (T5)   │
│ LB-B-000123  │ 2026-04-21 22:15 │ PAID │  $8.50 │ LB-150 (yesterday)    │
└──────────────┴──────────────────┴──────┴────────┴───────────────────────┘
```

### Kitchen tablet

```
┌─────────────────┐
│ LB-042          │
│ PREPARING       │
│                 │
│ 1× Taro Milk    │
│    Tea (L)      │
│ 2× Fried Rice   │
│                 │
│ [▶ READY]       │
└─────────────────┘
```

Same identifier as the customer's status page — kitchen and counter share vocabulary.

### Platform admin — cross-tenant orders view

```
Lucky Burger (LB)  ·  LB-042  ·  10:31  ·  $12.50  ·  PREPARING
Boba Queen  (BQ)   ·  BQ-027  ·  10:29  ·   $7.00  ·  READY
Lucky Burger (LB)  ·  LB-041  ·  10:27  ·   $6.80  ·  READY
```

Tenant prefix is tenant identity — no separate tenant column needed for human readers.

---

## Part 6 — Schema impact

| File | Change |
|---|---|
| `tables/tenants.md` | **Add `code_prefix TEXT UNIQUE NOT NULL CHECK (~ '^[A-Z]{2,4}$')`**. Document onboarding UX. Mark immutable. |
| `tables/tenant-sequences.md` | **Restructure**: replace `next_order_number BIGINT` + `next_ticket_number BIGINT` with `next_order_counter INTEGER` + `counters_reset_on DATE`. Keep `next_bill_number BIGINT` (running). Drop the ticket counter entirely (tickets inherit). Update helper function specs. |
| `tables/orders.md` | `order_number` format change (`ORD-000001` → `LB-042`), document 3-identifier model, note daily reset. |
| `tables/bills.md` | `bill_number` format change (`BILL-000001` → `LB-B-000125`), document running-counter rationale. |
| `tables/kitchen-tickets.md` | `ticket_number` = `orders.order_number` (no separate allocation). Denormalized copy for read performance. |
| `tables/postgresql-schema.md` | Reflect all DDL changes. Update helper function comments. |
| `discussion_and_decision.md` | New 2026-04-22 entry at top of log. |

### Allocation helpers (new spec)

```sql
-- Returns (date, formatted_number) — daily-reset counter, tenant-local midnight.
-- Updated 2026-04-24 to return BOTH the tenant-local order_date and the
-- formatted order_number, so the caller can populate orders.order_date in the
-- same INSERT and let the (tenant_id, order_date, order_number) UNIQUE
-- constraint enforce daily-uniqueness at the DB level.
CREATE FUNCTION allocate_order_number(p_tenant_id TEXT)
  RETURNS TABLE (order_date DATE, order_number TEXT) AS $$
  -- 1. Read tenant_settings.timezone for tenant
  -- 2. v_today := today's DATE in that timezone
  -- 3. SELECT tenant_sequences ROW FOR UPDATE
  -- 4. If counters_reset_on != v_today: reset next_order_counter = 1, update date
  -- 5. prefix := SELECT code_prefix FROM tenants WHERE id = p_tenant_id
  -- 6. v_number := prefix || '-' || lpad(next_order_counter::text, 3, '0')
  -- 7. Increment next_order_counter
  -- 8. RETURN QUERY SELECT v_today, v_number
$$ LANGUAGE plpgsql;

-- Returns e.g. 'LB-B-000125' — running sequential, never resets
CREATE FUNCTION allocate_bill_number(p_tenant_id TEXT) RETURNS TEXT AS $$
  -- 1. SELECT tenant_sequences ROW FOR UPDATE
  -- 2. prefix := SELECT code_prefix FROM tenants WHERE id = p_tenant_id
  -- 3. Format: prefix || '-B-' || lpad(next_bill_number::text, 6, '0')
  -- 4. Increment next_bill_number
  -- 5. Return formatted string
$$ LANGUAGE plpgsql;

-- allocate_ticket_number() is REMOVED. kitchen_tickets.ticket_number is set to
-- orders.order_number at ticket creation — no allocation needed.
```

Both helpers are row-locked on `tenant_sequences` for atomic increment. Application code MUST use these helpers and must not write the counter columns directly.

### Belt-and-braces: DB-level UNIQUE on `(tenant_id, order_date, order_number)`

Added 2026-04-24. Even though `allocate_order_number()` is the only sanctioned path and is row-lock-correct, the database now also refuses duplicate `(tenant, day, number)` rows directly:

```sql
ALTER TABLE orders
  ADD CONSTRAINT orders_tenant_day_number_unique
  UNIQUE (tenant_id, order_date, order_number);
```

This protects against:

- Raw-SQL inserts during incident response that bypass the allocator.
- Batch imports / migrations that hand-roll order numbers.
- A future bug in the allocator itself.

Including `order_date` (rather than just `(tenant_id, order_number)`) is essential — the daily-reset design intentionally reuses `LB-042` every day, so a date-less unique constraint would reject legitimate cross-day rows. Tenant-local `order_date` (not UTC) is required for the same reason described in `tables/orders.md` (a 06:30 ICT order on the next calendar day would land in the wrong UTC date and break the constraint).

---

## Part 7 — Open follow-ups

1. **Prefix availability UX** during onboarding — real-time check as the tenant types, with suggested alternatives on collision. Design task for the onboarding flow.
2. **Prefix character set extension** — we chose `A-Z` only. If non-Latin prefixes become useful later (unlikely for short handles), revisit the CHECK constraint.
3. **Tax invoice issuer number** (analogous to Gong Cha's `T338…`) — when XFOS grows into jurisdictions that mandate this, add `tenants.tax_registration_number` (nullable) and surface on receipts where required. Not in scope at MVP.
4. **Formal invoice numbering** (if/when XFOS issues tax invoices distinct from bills) — a future `invoices` table would get its own running-sequential `invoice_number` following the same `LB-I-000001` shape.
5. **Display-time formatting tweaks** — zero-pad width (3 vs 4 vs 5), separator (`-` vs `/`), prefix casing in display — can be changed cosmetically without schema changes by adjusting the allocation helper.

---

## Part 8 — Related docs

| Doc | Relevance |
|---|---|
| `tables/tenants.md` | Home of `code_prefix` |
| `tables/tenant-sequences.md` | Counter storage + allocation helpers |
| `tables/orders.md` | Primary consumer of `allocate_order_number` |
| `tables/bills.md` | Primary consumer of `allocate_bill_number` |
| `tables/kitchen-tickets.md` | Inherits `order_number` as `ticket_number` |
| `authentication-strategy.md` | `order_token` is the unguessable access credential — complements this strategy |
| `pricing-strategy.md` | Unrelated but also uses tenant-prefix pattern (plan `code` is lowercase enum) |
