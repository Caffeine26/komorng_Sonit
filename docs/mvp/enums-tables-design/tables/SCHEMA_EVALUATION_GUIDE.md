# XFOS Schema Evaluation Guide

How to decide whether `xfos/database/prisma/schema.prisma` is **sufficient**
(covers every product capability) and **healthy** (follows best practices)
before any code is written against it.

This guide is the founder/PM-friendly version. You don't need to read Prisma
syntax — `xfos/database/postgresql-schema.md` is the human-readable mirror.

---

## The two questions you're really asking

| Question | What it means | Where the answer lives |
|---|---|---|
| **1. Sufficient?**     | "Can every screen and every user action in the product be stored and retrieved using only these tables?" | The PRD + every UI design doc |
| **2. Best practice?**  | "Will these tables hold up under multi-tenancy, scale, audit, and change?"                                | The schema itself + the design ADRs |

Sufficiency is a **product** question. Best-practice is an **engineering**
question. They are evaluated differently — do them in two passes.

---

## Pass 1 — Sufficiency (the coverage matrix)

The goal: prove that every product capability has a home in the schema.
You build a **coverage matrix** by listing capabilities on the left and
tables on the right.

### Step 1.1 — List every capability the MVP must support

Pull these straight from `docs/mvp/XFOS — PRD.md` (the "Acceptance checklist
— the MVP is done when…" section is the quickest source of truth) and from
each surface's user-flows doc:

- `docs/mvp/technical-design/storefront/...`
- `docs/mvp/technical-design/kitchen/...`
- `docs/mvp/technical-design/merchant-portal/...`
- `docs/mvp/technical-design/platform-portal/...`

Write each capability as a single user-visible verb. Examples:

- Customer scans QR and sees the menu in Khmer
- Customer adds an item to the cart with a note ("no chili")
- Customer pays via ABA QR; if it expires they retry
- Kitchen sees a new ticket appear within 2 seconds
- Kitchen marks ticket READY → customer status page updates
- Merchant invites a kitchen-staff teammate
- Merchant edits a menu item price
- Platform admin suspends a tenant
- Tenant owner views yesterday's revenue
- Tenant owner downloads an audit log of who voided what

### Step 1.2 — For each capability, answer four questions

| Q | Why it matters |
|---|---|
| **a. What table(s) hold the input?**                          | If none → schema is missing a table |
| **b. What table(s) hold the output (what is read back)?**     | If you have to compute it from 5 joins on every page load → consider a snapshot column or a denormalized field |
| **c. What table records that the action *happened*?**         | If none → no audit trail; add an `*_history` row or an `audit_logs` row |
| **d. What field tells you which tenant it belongs to?**       | If none → cross-tenant bleed risk; tenant_id must be on the row |

### Step 1.3 — Worked example: "Customer pays via ABA QR; retries on expiry"

| Need | Table / column | Status |
|---|---|---|
| Cart while picking items                          | `carts` + `cart_items`                           | ✅ |
| Order created on checkout                        | `orders`, `order_items`                          | ✅ |
| Bill that aggregates the order(s)                | `bills`, `bill_orders`                           | ✅ |
| First payment attempt (INITIATED → PENDING)      | `payments` (status `INITIATED` → `PENDING`, method `ABA_QR`) | ✅ |
| First attempt expired                            | `payments.status = 'EXPIRED'`                    | ✅ |
| Second attempt INITIATED → PENDING → SUCCEEDED   | a new `payments` row (one bill → many payments) | ✅ |
| Idempotent retry from the customer's phone       | `idempotency_keys` (24h TTL, scoped by tenant)   | ✅ |
| Audit who/what/when                              | `audit_logs` + `payments.gateway_data`           | ✅ |

This capability is fully covered. Move on.

### Step 1.4 — When a capability has no home

You will hit gaps. Resolve each one with one of these moves:

- **Add a column** to an existing table (smallest, cheapest fix).
- **Add a join table** when it's a many-to-many.
- **Add a new table** when it's a new domain noun (e.g. `discounts`,
  `promotions`, `reviews`, `printer_devices`).
- **Defer it explicitly** if it's a Post-MVP capability — but write a one-line
  note so you don't forget.

The output of Pass 1 is a single document — the coverage matrix — that lists
every capability with its mapped table(s), or marks it `GAP` / `DEFERRED`.

---

## Pass 2 — Best practices (the 10-point health checklist)

Once coverage is proven, run these 10 checks against the schema. Each one is
a yes/no question with a clear remediation if the answer is no.

### Check 1 — Tenant isolation is on EVERY tenant-scoped row

> Does every tenant-scoped table have a `tenant_id` column, an index on it,
> and a path to populate it from the JWT (never the request body)?

**How to verify in `schema.prisma`:** look for tables that hold
business data and confirm each has `tenantId String` plus `@@index([tenantId])`
or a composite index starting with `tenantId`. The current schema does this
for 22 tables and uses **denormalized `tenant_id`** on 6 child tables
(`cart_items`, `order_items`, `order_status_history`,
`menu_category_translations`, `menu_item_translations`,
`kitchen_ticket_events`) — these are the C1 changes from
`docs/mvp/database-schema-stress-test.md` and are enforced by parity
triggers in `scripts/20260410_mvp_hardening.sql`.

**Red flag:** a tenant-scoped table where `tenant_id` is missing, nullable
without justification, or only present on the parent row. The fix is
denormalize + parity trigger.

### Check 2 — Money is integers, never floats

> Are all currency amounts `Int` cents (not `Float`, `Decimal`, or `Numeric`)?

The current schema uses `*_cents Int` everywhere (`subtotalCents`,
`totalCents`, `unitPriceCents`, `lineTotalCents`, `amountCents`,
`priceUsdCents`). ✅

**Red flag:** any field named `price`, `amount`, `total`, or `cost` typed
as `Float` or `Decimal`. Floats lose pennies; switch to `Int` cents.

### Check 3 — Time, currency, and locale are explicit

> Does every row that needs a currency carry one (default `KHR`)? Every
> row that needs a locale (`en` / `kh`)? Every timestamp typed as
> `DateTime`, never `String`?

Current schema: ✅ (currency defaulted on `tenant_settings`, `menu_items`,
`orders`, `bills`, `payments`; locale on translations; all timestamps are
proper DateTime).

### Check 4 — Append-only audit trails for state machines

> Does every state-changing entity (`Order`, `KitchenTicket`, `Bill`,
> `Payment`) have a sibling `*_history` or `*_events` table that records
> every transition?

Current schema: `Order → OrderStatusHistory` ✅, `KitchenTicket →
KitchenTicketEvent` ✅. **Bill** state changes (`OPEN → PAID`) currently
have **no** dedicated history table — the only trail is `audit_logs.action
= 'bill.paid'`. **Payment** transitions are also captured only through
`audit_logs`. Decide whether `audit_logs` is enough; for the financial
domain, a typed `bill_status_history` is the safer call.

### Check 5 — Snapshots, not joins, for things that must not change

> When an order is placed, are the item name and price **copied** into
> `order_items`, or are they joined back to `menu_items` at read time?

Current schema: ✅ (`OrderItem.itemName`, `OrderItem.unitPriceCents`,
`OrderItem.lineTotalCents` are snapshots). This means a merchant can
rename or delete a menu item without rewriting history.

**Why this matters:** a customer's receipt for last Tuesday must always
read "Beef Lok Lak — 18,000 KHR" even if the merchant later renamed it to
"Lok Lak Special" or raised the price to 22,000.

### Check 6 — Soft delete for things people might want back

> For entities a merchant could delete by accident (menu item, category,
> teammate), is there a `deletedAt` column instead of a hard `DELETE`?

Current schema: `MenuCategory.deletedAt` ✅, `MenuItem.deletedAt` ✅.
**Users** are hard-deleted via `UserStatus.DELETED`. **Tenants** are
soft-archived via `TenantStatus.ARCHIVED`. Decide whether `Invitation`
needs `deletedAt` — currently it has `InvitationStatus.REVOKED` instead,
which is fine.

### Check 7 — Idempotency for any side-effect endpoint

> Can a customer retry "place order" or "pay" without getting charged
> twice or creating a duplicate order?

Current schema: `IdempotencyKey` table with 24h TTL, scoped per tenant
(C5). ✅

**Test you should run when the API exists:** POST the same order with
the same `Idempotency-Key` header twice in a row. The second response
must be byte-identical to the first, and there must be exactly one row
in `orders`.

### Check 8 — Human-readable identifiers without race conditions

> Order numbers, bill numbers, and ticket numbers — are they generated
> in a way that survives concurrent inserts without a race?

Current schema: `tenant_sequences` table + `allocate_order_number()`,
`allocate_bill_number()`, `allocate_ticket_number()` Postgres functions
(installed by `20260410_mvp_hardening.sql`, C3 finding). ✅

**Red flag:** any code path that does `SELECT MAX(orderNumber) + 1` and
then `INSERT`. Two concurrent customers will collide. The helper
functions are the only correct way.

### Check 9 — i18n stored in proper translation tables, not JSON blobs

> Is each translatable string (category name, item name, item
> description) stored in a row keyed by `(parent_id, locale)`, with a
> uniqueness constraint?

Current schema: `MenuCategoryTranslation` and `MenuItemTranslation`,
both with `@@unique([parentId, locale])`. ✅

**Red flag:** a column called `name_json` or `name` typed `Json` holding
`{ "en": "...", "kh": "..." }`. That breaks search, validation, and
indexing.

### Check 10 — Indexes match the queries you'll actually run

> For every page in the product, can you write the WHERE clause it needs
> and confirm there's an index that makes it fast?

Current schema covers the obvious ones:

- "Show all open orders for this tenant" → `@@index([tenantId, status])` on `orders` ✅
- "Show this kitchen's queue, NEW first" → `@@index([tenantId, status])` on `kitchen_tickets` ✅
- "Find orders for this session" → `@@index([sessionId])` on `orders` ✅
- "Cleanup expired idempotency keys" → `@@index([expiresAt])` ✅
- "Audit log timeline for a tenant" → `@@index([tenantId, createdAt(sort: Desc)])` ✅

**How to find missing ones:** for every page mockup, write the SQL the
backend will run. If a `WHERE` clause doesn't match an index prefix, add
one. Don't add speculative indexes — they cost write throughput.

---

## A short list of things this schema does NOT yet cover

These are "found gaps" worth deciding on before code starts. None are
necessarily bugs — some are intentional defers.

| Gap | Recommendation |
|---|---|
| `bill_status_history` table       | Add it. Bills are financial; audit_logs alone is too coarse. |
| `Discount` / `Promotion` table    | If MVP supports any "10% off lunch", add now; if not, defer explicitly. |
| `MenuItemModifier` (size, addons) | Real menus have variants. Decide if MVP supports them; if yes, add now. |
| `PrinterDevice` / `KdsDevice`     | Kitchen tablet identity & last-seen heartbeat — needed for "device offline" alerts. |
| `Notification` / `OutboxEvent`    | If you want guaranteed Telegram/email delivery from a transaction, add an outbox table. |
| `TenantBranding` assets           | `tenant_settings.logoUrl` exists, but no table for multiple images, hero banners, or theme files. |
| `CustomerContact` (phone)         | MVP has no customer accounts, but Telegram-based status pings need a phone or chat_id stored somewhere. |
| `RefundLog` / `PaymentRefund`     | `PaymentStatus.REFUNDED` now exists for full refunds. A dedicated `refund_logs` table may still be needed for partial refunds, refund reasons, and detailed audit trails post-MVP. |

Take this list to a 30-minute review with one engineer and decide
**add now / add later / never** for each. Write the answers down.

---

## How to actually do the evaluation (90-minute checklist)

This is the procedure. Follow it in order.

1. **(15 min)** Print `xfos/database/postgresql-schema.md` and the
   "Acceptance checklist" section of `docs/mvp/XFOS — PRD.md` side by side.
2. **(30 min)** Build the Pass 1 coverage matrix in a spreadsheet. One row
   per capability. Mark each `✅`, `GAP`, or `DEFERRED`. Stop when every
   capability has a verdict.
3. **(30 min)** Run the Pass 2 checklist (Checks 1–10) against the schema.
   For every check, write the answer as a one-line "yes — see X" or "no —
   needs Y".
4. **(15 min)** Review the gap list above. For each, decide add now / add
   later / never. Capture the decision in `docs/mvp/database-schema-decisions.md`
   (create the file if it doesn't exist).
5. Open one Linear/GitHub issue per `add now` item. Now you can build.

---

## What "good enough" looks like

You do not need a perfect schema before coding. You need one where:

- Every MVP capability has a mapped table (Pass 1 complete, no `GAP` left).
- Every Pass 2 check is either ✅ or has a tracked issue.
- The decisions you deferred are written down with a reason.

If you get there, the schema is sufficient and ready to build against.
Anything that comes up later goes through the migration playbook in
`xfos/database/README.md` — that's the whole point of having one.
