# TableStatus — Design Discussion & Decision

**Date:** 2026-04-24
**Status:** ✅ Applied alongside the tables entity
**Affects:** `tables.current_status`

---

## The enum

```sql
CREATE TYPE "TableStatus" AS ENUM (
  'AVAILABLE',
  'OCCUPIED',
  'RESERVED',
  'CLEANING'
);
```

`tables.current_status` is `NOT NULL DEFAULT 'AVAILABLE'`.

---

## Part 1 — Why this enum exists

The merchant's floor-plan UI needs to render every table's current state in real time so hall staff can see at a glance which tables are free, busy, reserved, or being reset. The status column drives the colour of the table in the floor plan and gates merchant-portal actions ("Show me available tables for the next reservation").

Two design choices were made:

1. **Store the status on the row, not derive it from sessions.** The user explicitly chose this in the design Q&A. It supports `RESERVED` and `CLEANING` (which don't have a session) and lets the floor-plan UI render with a simple `SELECT current_status` instead of a join across sessions.
2. **Keep the enum to four values that map cleanly to UI colours.** Anything more granular (e.g., `WAITING_FOR_CHECK`, `COMPLIMENTARY_OFFERED`) is operational metadata that lives in `notes` or `order_sessions`, not in a table-state enum.

---

## Part 2 — Each value explained

### `AVAILABLE`

**Meaning:** The table is empty and ready for the next customer.

**Floor-plan colour:** Green.

**Set by:** Default on table creation. Reset to AVAILABLE by the application when:
- An active session linked to this table closes (bill paid / merchant force-close / 24h sweep) AND
- No staff member has manually marked the table CLEANING.

**Real-world example:** Lunch service ends, the last guests leave Table 5, the bill is paid, the session closes. The table reverts to AVAILABLE. The hostess sees green and seats the next walk-in.

### `OCCUPIED`

**Meaning:** A customer is currently using the table — there is an active dine-in session.

**Floor-plan colour:** Red (or your portal's "busy" colour).

**Set by:** The application, when an `order_sessions` row with `service_model = DINE_IN_TABLE` becomes active and links to this table.

**Cleared by:** The application, when the session closes (transitions to `CLOSED`).

**Real-world example:** Grandmother Lina's group sits at Table 5; the waiter scans/selects Table 5 in the portal and starts a session. The table state flips to OCCUPIED. As long as the session is open, the table stays OCCUPIED.

### `RESERVED`

**Meaning:** The table is **booked for a guest who has not yet arrived**. The table is not free for walk-ins, even though no one is currently sitting at it.

**Floor-plan colour:** Yellow / amber.

**Set by:** Staff (via merchant-portal "Reserve" action). The portal optionally records the reservation time, party size, and contact name in `tables.notes` or in a future `reservations` table.

**Cleared by:** Staff (when the reserved party arrives, the staff start a session — which transitions the table to OCCUPIED — or when the staff manually cancel the reservation).

**Real-world example:** A regular customer calls to book a table for 7:00 PM. At 6:30 the hostess marks Table 8 RESERVED so walk-ins are routed elsewhere. When the party arrives, the hostess starts a session; the table flips to OCCUPIED.

### `CLEANING`

**Meaning:** The table is **being reset between guests** — staff are wiping it down, replacing settings, etc. Not ready for the next customer yet.

**Floor-plan colour:** Blue (or your portal's "transitional" colour).

**Set by:** Staff (via merchant-portal "Mark as cleaning" action) OR automatically when a session closes if the tenant has enabled "auto-clean state" (post-MVP option).

**Cleared by:** Staff (when cleanup is done, mark AVAILABLE).

**Real-world example:** A four-top finishes their meal at 1:15 PM. The waiter clears the dishes, marks the table CLEANING. Five minutes later the busser has wiped the table and reset it; the busser marks it AVAILABLE.

> **Naming note:** This was originally proposed as `PREPARING`. Renamed to `CLEANING` because `PREPARING` is already used by `OrderStatus` (kitchen preparing food). Different concepts, same word — confusion when reading queries that join orders and tables. `CLEANING` is unambiguous.

---

## Part 3 — Sync rules between sessions and table status

Because `OCCUPIED` is stored (not derived), the application keeps the column in sync with `order_sessions`:

| Event | Table state transition |
|---|---|
| Session opens linked to table | `AVAILABLE` / `RESERVED` → `OCCUPIED` |
| Session closes (bill paid, force-close, 24h sweep) | `OCCUPIED` → `AVAILABLE` (or `CLEANING` if the tenant has auto-clean enabled — post-MVP) |
| Staff marks table reserved | `AVAILABLE` → `RESERVED` |
| Staff marks table cleaning | any → `CLEANING` |
| Staff marks table available | any → `AVAILABLE` |

Concurrency: simultaneous "session open" + "staff marks RESERVED" can race. The `tables.version` (OCC) column resolves it — last writer wins after refetching state.

---

## Part 4 — Decision matrix

| Value | Set by | Cleared by | Has session? | Floor-plan colour |
|---|---|---|---|---|
| `AVAILABLE` | System / staff | Session opens / staff action | No | Green |
| `OCCUPIED` | System (session opens) | System (session closes) | **Yes** | Red |
| `RESERVED` | Staff | Staff (or system on session open) | No | Yellow |
| `CLEANING` | Staff | Staff | No | Blue |

---

## Part 5 — Why these four and not others

### Considered and rejected

| Rejected value | Why |
|---|---|
| `WAITING_FOR_CHECK` | Sub-case of `OCCUPIED`. Derive from the session's bill state if needed (`bills.status = 'OPEN'` and `order.status = 'COMPLETED'`). Don't pollute table status with bill status. |
| `OUT_OF_SERVICE` | Sub-case of `is_active = FALSE` (the table is soft-deleted from active circulation). Different concept — table-status is short-lived; deactivation is structural. |
| `BLOCKED` | Same as `RESERVED` operationally. Don't have two words for "not available right now." |
| `MERGED` | Combining two tables into one for a large party — not a status, but a relationship. Add a `parent_table_id` if real demand appears. |
| `DIRTY` | Pejorative. `CLEANING` is the action, which is more productive UX. |
| `PREPARING` | Already used by `OrderStatus` (kitchen). Renamed to `CLEANING` to avoid query-reading confusion. |

### Why `OCCUPIED` is stored, not derived

Trade-off considered:

| Approach | Pros | Cons |
|---|---|---|
| **Derive `OCCUPIED` from active sessions** | Always accurate, no sync code | Cannot represent `RESERVED` or `CLEANING` (no session) → need a separate column anyway |
| **Hybrid (derive `OCCUPIED`, store `RESERVED`/`CLEANING`)** | Simpler model | Read logic is `if has_active_session OCCUPIED else current_status` — confusing |
| **Store all four (chosen)** | Single column drives the floor-plan render with no logic | Sync code must keep `OCCUPIED` consistent with `order_sessions` |

The user explicitly chose option 3 in the design Q&A. The sync code is a small handful of cases (table 1 above), and the simplicity at every read site is worth it.

---

## Part 6 — Future evolution

- **Per-tenant colour overrides** — could move to the merchant-portal theme. Don't add columns.
- **Per-status timeouts** — e.g., "auto-clear `RESERVED` after 30 minutes if guest hasn't shown up." Could be a `reserved_until TIMESTAMP(3)` column on `tables` later.
- **`MERGED` for large parties** — if/when "join two tables for a party of 8" becomes a feature, model it via a `parent_table_id` self-FK rather than adding `MERGED` to this enum.

---

## Part 7 — Related tables and enums

| Symbol | Relationship | Notes |
|---|---|---|
| `tables.current_status` | Direct user | NOT NULL with default `AVAILABLE` |
| `order_sessions.status` | Trigger source for `OCCUPIED` | Application keeps `tables.current_status` in sync with active sessions |
| `OrderStatus` | Distinct enum | Despite both having `PREPARING`-style values, the enums are typed and don't conflict in PostgreSQL — but `CLEANING` is used here for human readability |
| `OrderSessionStatus` | Sibling concept | A table is OCCUPIED ⇔ it has an `ACTIVE` `order_sessions` row |
| `tables.is_active` | Sibling | Soft-delete; status-enum applies only to `is_active = TRUE` rows |
