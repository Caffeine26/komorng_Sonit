# QrContextType — Design Discussion & Decision

**Date:** 2026-04-09
**Status:** ✅ Simplified to 2 values (was 3 — COUNTER removed)
**Affects:** `qr_contexts` table
**MVP note:** Both QR context types are active at MVP. The storefront
resolves the QR context type to determine the customer's ordering
experience. Counter/pickup-point scenarios use STOREFRONT with a `label`.

---

## The enum

```sql
CREATE TYPE "QrContextType" AS ENUM (
  'STOREFRONT',
  'TABLE'
);
```

> **Note:** `COUNTER` was removed. Every counter scenario is a STOREFRONT
> with a `label` (e.g., `label = "Counter A"`). See the decision section
> for rationale.

---

## Part 1 — Each value explained in detail

### `STOREFRONT`

**Meaning:** The QR code resolves to the tenant's storefront with no
physical location context. No table number, no counter label — just the
menu. The customer is "somewhere near the business" (standing in line,
walking by, sitting on a bench).

**Who sets it:** Tenant owner or manager, when creating a QR code in the
merchant portal.

**What the QR encodes:**
- Tenant identity (via `qr_contexts.token` → `qr_contexts.tenant_id`)
- Context type: `STOREFRONT`
- No `table_ref` (NULL)
- No location-specific label

**Customer experience after scan:**
1. Customer scans the QR code (printed on a banner, posted on a wall,
   on a tent card at a standing counter).
2. Storefront opens → menu is displayed.
3. Customer adds items to cart, checks out.
4. For `PAY_BEFORE`: customer pays immediately. Kitchen ticket shows
   a pickup number (e.g., "#037") — no table reference.
5. For `PAY_AFTER`: an order session is created. Customer can order
   multiple times. When done, they tap "Pay" to settle.
6. Kitchen ticket shows the order/pickup number. Kitchen staff calls
   out "Number 37!" or displays it on a screen.

**Where this QR code is physically placed:**
- On a banner or sign in front of a stall.
- On a menu board.
- On a flyer or business card.
- At the entrance to a food court (one QR per stall).
- On a food delivery bag (scan to reorder).

**Real-world example:** "Num Banh Chok Dara" (នំបញ្ចុកដារា) is a
noodle stall in Orussey Market. There are no tables — customers stand
in line, order, and eat at a shared bench or take food away. Dara prints
a STOREFRONT QR code on a laminated card and hangs it at the front of
his stall. Customers scan it, order Num Banh Chok ($1.50), pay via ABA QR,
and wait for their number to be called.

**Why it can't be removed:** STOREFRONT is the simplest and most common QR
type. Most Cambodian food stalls have no tables and no counters — just a
stall, a menu, and customers. Without STOREFRONT, every QR code would need
a table or counter reference, which makes no sense for a street-side noodle
stall.

---

### `TABLE`

**Meaning:** The QR code resolves to the tenant's storefront with a specific
table pre-selected. The order is automatically associated with this table.
Kitchen tickets show the table number, and the table map in the merchant
portal shows this table as occupied.

**Who sets it:** Tenant owner or manager, when creating a QR code and
selecting "Table" as the type + entering a table reference (e.g., "Table 5",
"T5", "5").

**What the QR encodes:**
- Tenant identity
- Context type: `TABLE`
- `table_ref`: the table identifier (stored as TEXT — can be "5", "A3",
  "Patio-Left", whatever the business uses)
- Optional `label`: human-readable label (e.g., "Table 5 — Window Seat")

**Customer experience after scan:**
1. Customer sits down at Table 5 and scans the QR code on the table.
2. Storefront opens → menu is displayed → header shows "Table 5"
   (តុទី៥).
3. Customer adds items to cart, checks out.
4. For `PAY_BEFORE` (food court style): customer pays immediately. Kitchen
   ticket shows "Table 5". Food is delivered to the table or customer
   picks up.
5. For `PAY_AFTER` (traditional restaurant): an order session is created,
   anchored to Table 5. Customer can order multiple rounds (appetizers,
   mains, drinks). Each order creates a new kitchen ticket, all showing
   "Table 5". When done, customer taps "Request Bill" to settle.
6. After payment, the table is freed — the merchant portal's table map
   shows it as available.

**Where this QR code is physically placed:**
- On the table itself (sticker, acrylic stand, or embedded in the table).
- On a tent card on the table.
- On a clip attached to the table edge.

**Real-world example:** "Sach Ko Angkor" (សាច់គោអង្គរ) is a BBQ
restaurant in Phnom Penh with 20 tables. Each table has a laminated QR
card in an acrylic stand. A group of four sits at Table 12, scans the QR,
and orders: 2x beef set ($8 each), 1x seafood platter ($12), 4x iced tea
($1 each). The kitchen receives a ticket: "Table 12: 2x beef set, 1x
seafood platter, 4x iced tea." Twenty minutes later, they order another
round of drinks — same session, same table, new ticket. At the end, they
tap "Request Bill" and pay $32 total via ABA QR.

**Why it can't be removed:** TABLE is essential for dine-in restaurants.
Without it, kitchen staff wouldn't know which table to serve, the merchant
portal couldn't show a table map, and the bill-per-table flow wouldn't work.

---

### `COUNTER` — removed

> **This value was removed from the enum.** Every counter/pickup-point
> scenario is covered by `STOREFRONT` with a `label`.

**Why it was removed:**

1. **Every COUNTER scenario is STOREFRONT + label.** A stall with
   "Counter A" and "Counter B" creates two STOREFRONT QR codes with
   `label = "Counter A"` and `label = "Counter B"`. The kitchen ticket
   shows the label regardless of context type.

2. **Merchant confusion.** During QR setup, merchants would see three
   options (Storefront / Table / Counter) and not understand the
   difference between Storefront and Counter. With two options
   (General QR / Table QR), the choice is obvious.

3. **Zero backend difference.** The backend treated COUNTER identically
   to STOREFRONT. Same code path, same session logic, same kitchen ticket
   rendering. The `label` field provides the counter name.

**How counter scenarios work without the COUNTER type:**

| Scenario | QR setup |
|---|---|
| Ramen bar with 8 counter seats | 8 × STOREFRONT QR, `label = "Seat 1"` through `"Seat 8"` |
| Stall with pickup window | 1 × STOREFRONT QR, `label = "Pickup Window"` |
| Food court vendor with 2 counters | 2 × STOREFRONT QR, `label = "Counter A"` and `"Counter B"` |

---

## Part 2 — State machine

QrContextType doesn't have a state machine — the values don't transition.
A QR code is created with one context type and stays that type forever.
If the merchant wants to change a TABLE QR to a COUNTER QR, they
deactivate the old one and create a new one.

### QR context lifecycle (not a status transition, but a lifecycle)

```
Created (is_active = true) ──► Deactivated (is_active = false)
                               │
                               └──► Reactivated (is_active = true)
```

The `is_active` flag on `qr_contexts` controls whether a QR code works.
A deactivated QR shows a "QR code is inactive" message when scanned.

### Resolution flow when a customer scans a QR code

```
Customer scans QR
    │
    ▼
System looks up qr_contexts by token
    │
    ├── Not found → "Invalid QR code"
    ├── is_active = false → "This QR code is inactive"
    ├── expires_at < now() → "This QR code has expired"
    │
    ▼
Check tenant status
    │
    ├── DRAFT → "This restaurant is coming soon"
    ├── SUSPENDED → "This restaurant is temporarily closed"
    ├── ARCHIVED → "This restaurant is no longer on XFOS"
    │
    ▼
Tenant is ACTIVE → resolve context_type
    │
    ├── STOREFRONT → open menu, no table context (optional label shown)
    └── TABLE → open menu, pre-select table_ref as location
```

### QrContextType ↔ ServiceModel compatibility

Not every combination is meaningful:

| ServiceModel | QrContextType | Makes sense? | Example |
|---|---|---|---|
| `STALL_KIOSK` | `STOREFRONT` | Yes — the primary use case | Noodle stall, bubble tea shop. Optional `label` for counter/pickup point. |
| `STALL_KIOSK` | `TABLE` | Unusual but valid | A kiosk at a food court where tables are shared but numbered |
| `DINE_IN_TABLE` | `STOREFRONT` | Valid — for takeaway orders | Restaurant also serves walk-in takeaway |
| `DINE_IN_TABLE` | `TABLE` | Yes — the primary use case | Restaurant, BBQ, hotpot |

The system does NOT enforce compatibility — a stall can have TABLE QR codes
and a restaurant can have STOREFRONT QR codes. The merchant knows their
physical space best.

---

## Part 3 — QR code management

### How QR codes are generated and printed

```
1. Merchant goes to QR Codes section in merchant portal.

2. Clicks "Create QR Code":
   - Selects context type: General QR (STOREFRONT) / Table QR (TABLE)
   - If TABLE: enters the table number ("5", "12")
   - Optionally adds a label ("Counter A", "VIP Table", "Pickup Window")

3. System creates qr_contexts row:
   - Generates a unique, unguessable token (cuid or UUID)
   - Stores the context type and table_ref
   - Sets is_active = true
   - No expiry by default (expires_at is null for permanent QR codes)

4. System generates the QR image:
   - Encodes: https://xfos.com/q/{token}
   - QR image is rendered client-side (no server-side image storage)
   - Merchant can download as PNG or print directly

5. Merchant prints and places the QR code at the physical location.
```

### Bulk QR generation for restaurants

A restaurant with 20 tables needs 20 QR codes. The merchant portal supports
bulk creation:

```
"Create 20 Table QR codes"
  → TABLE-01, TABLE-02, ..., TABLE-20
  → Each gets its own qr_contexts row with table_ref = "1", "2", ..., "20"
  → Downloadable as a single PDF with all 20 QR codes, labeled
```

### QR code URL structure

```
https://xfos.com/q/{token}
```

The URL is short and clean. The token is the only path parameter. The
system looks up `qr_contexts` by token and resolves everything from there:
tenant, context type, table ref, active status.

**Why not `xfos.com/t/{slug}/table/5`?**
- The token-based URL is more secure — the QR code doesn't reveal the
  tenant slug, table number, or any internal structure.
- It's shorter (better for QR code density — fewer characters = simpler
  QR pattern = scans faster on low-quality cameras).
- The token can be rotated without changing the physical QR code's URL
  if the system supports token aliasing (post-MVP).

---

## Part 4 — What's NOT in this enum (and why)

| Omitted value | What it would mean | Why we skip it |
|---|---|---|
| `ROOM` | QR for a private dining room or karaoke room | Semantically identical to TABLE with a different label. Model it as TABLE with `table_ref = "Room 3"`. The kitchen ticket would show "Room 3" which is clear enough. |
| `SEAT` | QR per individual seat (e.g., stadium, cinema, airline) | Far too granular for a food stall/restaurant platform. If a ramen bar wants per-seat QR, use STOREFRONT with `label = "Seat 4"`. |
| `ZONE` | QR for an area (e.g., "Patio", "Rooftop") without a specific table | Use STOREFRONT with a label. A zone without a table number doesn't need location-specific order routing — the customer is "somewhere in the patio." If the kitchen needs to know the zone, the customer can add it in order notes. |
| `DELIVERY` | QR for triggering a delivery order | XFOS doesn't handle delivery at MVP. If added, delivery would likely have its own order flow, not just a QR context type. |
| `MARKETING` | QR for promotional campaigns (scan for discount) | Not a QR context type — it's a marketing feature. A promotional QR would redirect to the storefront with a promo code, not a different context type. |
| `TAKEAWAY` | Explicit takeaway/pickup ordering context | Functionally identical to STOREFRONT. Whether the customer eats at the stall or takes food away is not a QR concern — it might be an order-level flag (post-MVP) but not a QR context type. |

---

## Part 5 — Relationship to other enums and tables

### QrContextType and ServiceModel

The QR context type and the service model are related but independent:

- `ServiceModel` is set on `tenant_settings` — it defines how the business
  operates (stall or dine-in).
- `QrContextType` is set per QR code — it defines what the customer
  experiences when they scan that specific code.

A single tenant can have QR codes of different types:
```
"Sach Ko Angkor" BBQ (DINE_IN_TABLE)
  ├── 20x TABLE QR codes (one per table)
  ├── 2x STOREFRONT QR codes (bar seating, label: "Bar Seat 1", "Bar Seat 2")
  └── 1x STOREFRONT QR code (takeaway entrance, no label)
```

### QrContextType and OrderSessionStatus

The QR context type influences session creation:

| QrContextType | PayTiming | Session created? | Behavior |
|---|---|---|---|
| `STOREFRONT` | `PAY_BEFORE` | No | Single order, single bill |
| `STOREFRONT` | `PAY_AFTER` | Yes | Orders accumulate, one bill |
| `TABLE` | `PAY_BEFORE` | Yes (for table tracking) | Each order paid immediately, table tracked |
| `TABLE` | `PAY_AFTER` | Yes | Orders accumulate, one bill at end |
| `COUNTER` | `PAY_BEFORE` | Same as TABLE | Same behavior |
| `COUNTER` | `PAY_AFTER` | Same as TABLE | Same behavior |

### Tables involved

| Table | How it relates to QrContextType |
|---|---|
| `qr_contexts` | The primary table — `context_type` column uses this enum |
| `order_sessions` | `qr_context_id` references the QR that started the session |
| `orders` | `table_ref` is populated from the QR context's `table_ref` when the order is created |
| `kitchen_tickets` | `table_ref` is snapshotted from the order, which got it from the QR context |

---

## Part 6 — Decision

### Question: Are 2 values sufficient?

**Answer: Yes.** Two values cover the two physical contexts that matter:

| Value | Physical context | Can it be removed? |
|---|---|---|
| `STOREFRONT` | No specific table — standing, walking, counter, pickup point | No — the default for stalls, kiosks, and any non-table context |
| `TABLE` | At a numbered dining table | No — essential for dine-in restaurants with table service |
| ~~`COUNTER`~~ | ~~At a counter, bar, or pickup point~~ | **Removed** — every counter scenario is STOREFRONT + `label`. Keeping it confused merchants ("am I a storefront or a counter?"). |

### Why COUNTER was removed

During design review, we examined whether COUNTER provided value that
STOREFRONT + `label` didn't:

1. **Every COUNTER scenario works with STOREFRONT + label.** A stall with
   "Counter A" and "Counter B" creates two STOREFRONT QRs with labels.
   The kitchen ticket shows the label regardless of context type.
2. **The backend treated COUNTER identically to STOREFRONT.** Same code
   path, same session logic, same kitchen ticket rendering. Zero
   functional difference.
3. **Merchant confusion.** During QR setup, three options (Storefront /
   Table / Counter) forced the merchant to think about a distinction
   that doesn't matter. Two options (General QR / Table QR) are obvious.

### What we decided

- **2 values: STOREFRONT and TABLE.** They represent the one distinction
  that actually changes behavior: is there a physical table or not?
- **COUNTER was removed.** Counter/pickup-point scenarios use STOREFRONT
  with a `label` field.
- **No ROOM, SEAT, ZONE, or DELIVERY types.** These can all be modeled
  using the existing two types with appropriate `label` or `table_ref`
  values.
- **QR codes use token-based URLs** (`/q/{token}`) for security and
  simplicity. The QR code itself doesn't reveal any business information.
- **One tenant can have QR codes of different types.** The system doesn't
  enforce that a STALL_KIOSK tenant can only have STOREFRONT QR codes.
  The merchant knows their space.
