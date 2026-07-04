# `tenant_sequences`

| Attribute | Value |
|---|---|
| **Domain** | Tenant |
| **Tenant-scoped?** | Yes (1:1 with `tenants`, keyed by `tenant_id`) |
| **Prisma model** | `TenantSequence` |
| **Mapped name** | `@@map("tenant_sequences")` |
| **Status** | ✅ Restructured 2026-04-22 — see `design-discussions/order-numbering-strategy.md` |
| **Last upgrade** | 2026-04-26 (3 sanity CHECK constraints; `allocate_order_number()` refactored for clarity — same atomicity, two simpler statements) |

---

## Part 1: Overview

`tenant_sequences` holds per-tenant counters for generating human-readable order numbers, bill numbers, and (indirectly) kitchen ticket numbers. Each tenant has exactly one row, auto-created by a trigger on tenant insert.

### Two counter types

| Counter | Format produced | Reset cadence | Driven by |
|---|---|---|---|
| **`next_order_counter`** | `LB-042` | **Daily** at the tenant's local midnight | Customer-facing operational rhythm |
| **`next_bill_number`** | `LB-B-000125` | **Never** (running sequential) | Financial / tax-audit requirements |

Kitchen tickets do NOT have their own counter. `kitchen_tickets.ticket_number` is set to the same string as the order's `order_number` at ticket creation — one identifier covers both.

### How allocation works

Application code **must never write to this table directly**. All allocation goes through two Postgres helper functions, each atomic via row-level locking:

```sql
SELECT allocate_order_number('clx8lucky...');  -- returns 'LB-042'
SELECT allocate_bill_number('clx8lucky...');   -- returns 'LB-B-000125'
```

The helpers:

1. `SELECT ... FOR UPDATE` on the `tenant_sequences` row — locks it.
2. For `allocate_order_number`: check whether `counters_reset_on` matches today (in the tenant's timezone); if not, reset the counter and update the date.
3. Read `tenants.code_prefix` for the formatted prefix.
4. Format the returned string.
5. Increment the counter in place, update `updated_at`.
6. Return the formatted string to the caller, commit.

Row-level locking guarantees that two concurrent requests for the same tenant never receive the same number. The Redis-based alternative was rejected early because of split-brain risks between Redis and Postgres (see Part 7).

---

## Part 2: CREATE TABLE

> **2026-04-26:** 3 sanity CHECK constraints added.

```sql
CREATE TABLE tenant_sequences (
  tenant_id              TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

  -- Daily-reset counter for orders (also used by kitchen tickets, which inherit order_number)
  next_order_counter     INTEGER NOT NULL DEFAULT 1,
  counters_reset_on      DATE    NOT NULL DEFAULT CURRENT_DATE,   -- tenant-local date

  -- Running counter for bills (never resets — financial/audit)
  next_bill_number       BIGINT  NOT NULL DEFAULT 1,

  updated_at             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT tenant_sequences_order_counter_positive
    CHECK (next_order_counter >= 1),
  CONSTRAINT tenant_sequences_bill_number_positive
    CHECK (next_bill_number >= 1),
  CONSTRAINT tenant_sequences_reset_date_sane
    CHECK (counters_reset_on >= DATE '2025-01-01')
);
```

### Notes on the 2026-04-26 CHECK constraints

The helper functions can't legitimately write 0, negative, or
nonsensical-date values. But a manual `UPDATE` mistake or a backfill
bug could. These three CHECKs are cheap insurance:

- `next_order_counter >= 1` — counters start at 1 (the next value to
  allocate). Zero or negative would mean the helper allocated the wrong
  number. Catches mistakes like `UPDATE … SET next_order_counter = 0`
  during a botched manual reset.
- `next_bill_number >= 1` — same reasoning.
- `counters_reset_on >= '2025-01-01'` — catches NULL-equivalent dates
  like `1970-01-01` (Unix epoch) that could sneak in via a misconfigured
  default. The `2025-01-01` lower bound is conservative — XFOS launched
  in 2026.

### Helper functions (installed by hardening migration)

```sql
-- Returns e.g. 'LB-042'. Resets counter at tenant-local midnight.
-- 2026-04-26 refactor: split the lock+decide and the apply into two
-- statements for inspection clarity. Same atomicity (FOR UPDATE holds
-- the row lock until COMMIT), same single-round-trip transactional
-- semantics, no behavioral change — just easier to verify.
CREATE OR REPLACE FUNCTION allocate_order_number(p_tenant_id TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prefix        TEXT;
  v_tz            TEXT;
  v_local_today   DATE;
  v_stored_date   DATE;
  v_stored_next   INTEGER;
  v_allocated     INTEGER;
  v_is_reset_day  BOOLEAN;
BEGIN
  -- Read prefix and timezone (timezone from tenant_settings; default
  -- to 'Asia/Phnom_Penh' if the settings row hasn't been populated yet)
  SELECT t.code_prefix,
         COALESCE(ts.timezone, 'Asia/Phnom_Penh')
    INTO v_prefix, v_tz
    FROM tenants t
    LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id
   WHERE t.id = p_tenant_id;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'tenant_sequences: tenant % not found or missing code_prefix', p_tenant_id;
  END IF;

  -- Compute today in the tenant's timezone
  v_local_today := (NOW() AT TIME ZONE v_tz)::date;

  -- Lock the row and read the current state
  SELECT counters_reset_on, next_order_counter
    INTO v_stored_date, v_stored_next
    FROM tenant_sequences
   WHERE tenant_id = p_tenant_id
     FOR UPDATE;

  IF v_stored_date IS NULL THEN
    RAISE EXCEPTION 'tenant_sequences: row missing for tenant %', p_tenant_id;
  END IF;

  -- Decide which number to allocate based on whether this is a new day
  v_is_reset_day := (v_stored_date <> v_local_today);
  v_allocated    := CASE WHEN v_is_reset_day THEN 1
                         ELSE v_stored_next END;

  -- Apply the increment / reset (lock from the SELECT FOR UPDATE still held)
  UPDATE tenant_sequences
     SET next_order_counter  = v_allocated + 1,
         counters_reset_on   = v_local_today,
         updated_at          = NOW()
   WHERE tenant_id = p_tenant_id;

  RETURN v_prefix || '-' || LPAD(v_allocated::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- Returns e.g. 'LB-B-000125'. Never resets.
CREATE OR REPLACE FUNCTION allocate_bill_number(p_tenant_id TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_number BIGINT;
BEGIN
  SELECT code_prefix INTO v_prefix FROM tenants WHERE id = p_tenant_id;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'tenant_sequences: tenant % not found or missing code_prefix', p_tenant_id;
  END IF;

  UPDATE tenant_sequences
     SET next_bill_number = next_bill_number + 1,
         updated_at       = NOW()
   WHERE tenant_id = p_tenant_id
  RETURNING next_bill_number - 1 INTO v_number;

  IF v_number IS NULL THEN
    RAISE EXCEPTION 'tenant_sequences: row missing for tenant %', p_tenant_id;
  END IF;

  RETURN v_prefix || '-B-' || LPAD(v_number::text, 6, '0');
END;
$$ LANGUAGE plpgsql;
```

**There is no `allocate_ticket_number()`.** Kitchen tickets reuse `orders.order_number`.

### Auto-creation trigger (unchanged)

```sql
CREATE OR REPLACE FUNCTION tenants_create_sequences() RETURNS trigger AS $$
BEGIN
  INSERT INTO tenant_sequences (tenant_id) VALUES (NEW.id)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenants_create_sequences_trg
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION tenants_create_sequences();
```

---

## Part 3: Column-by-Column

### `tenant_id` -- TEXT PRIMARY KEY

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None (set by the trigger)
- **Purpose:** Both the primary key and the FK to `tenants`. This is the only table in the schema where `tenant_id` serves as the PK rather than having a separate cuid `id` column.
- **Constraints:** `PRIMARY KEY`, `REFERENCES tenants(id) ON DELETE CASCADE`.
- **Why it exists:** Each tenant has exactly one sequence row. Using `tenant_id` as the PK enforces the 1:1 relationship without needing a separate unique constraint, and makes the `allocate_*_number()` functions simple: `WHERE tenant_id = p_tenant_id` hits the PK index directly.

### `next_order_counter` -- INTEGER NOT NULL DEFAULT 1

- **Type:** `INTEGER`
- **Nullable:** No
- **Default:** `1`
- **Purpose:** The next daily counter to be allocated for an order. `allocate_order_number()` returns the value before incrementing, formatted with the tenant's `code_prefix` (e.g. `'LB-042'`).
- **Constraints:** `NOT NULL`.
- **Why INTEGER, not BIGINT:** resets daily. A tenant hitting 2+ billion orders in a single day is not a realistic concern. INTEGER is enough; using BIGINT here would be noise.

### `counters_reset_on` -- DATE NOT NULL DEFAULT CURRENT_DATE

- **Type:** `DATE`
- **Nullable:** No
- **Default:** `CURRENT_DATE`
- **Purpose:** The tenant-local date for which `next_order_counter` is currently counting. When `allocate_order_number()` runs and computes today-in-tenant-timezone, it compares against this field; if they differ, the counter is reset to `1` (and this column is updated to today).
- **Constraints:** `NOT NULL`.
- **Why it exists:** The mechanism that makes the daily reset atomic. Without a stored date, two concurrent allocators spanning midnight could race (one sees "still yesterday", the other sees "today's first"). Storing the "what day is this counter counting?" date inside the row and comparing inside the `UPDATE ... FOR UPDATE` makes reset and increment one atomic operation.
- **Note:** this column stores a tenant-LOCAL date, not a UTC date. The local date is computed inside the function from `tenant_settings.timezone`.

### `next_bill_number` -- BIGINT NOT NULL DEFAULT 1

- **Type:** `BIGINT`
- **Nullable:** No
- **Default:** `1`
- **Purpose:** Running sequential counter for bills, per tenant. `allocate_bill_number()` returns the value before incrementing, formatted as `'LB-B-000125'`.
- **Constraints:** `NOT NULL`.
- **Why BIGINT:** bills never reset. A busy restaurant doing 500 bills/day hits `BIGINT` territory far into the future (~50 million years). More practically, it supports 6+ digit zero-padding beyond the ~2 billion `INTEGER` ceiling without needing a migration.
- **Why running (not daily):** see `design-discussions/order-numbering-strategy.md` § 4.3 — tax audit, cross-day lookups, and industry compliance expectations.

### `updated_at` -- TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** `CURRENT_TIMESTAMP`
- **Purpose:** When the last counter was allocated.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Audit/debug ("when did this tenant last place an order?"). Updated by both helper functions on every allocation.

---

## Part 4: Indexes

### Primary key index on `tenant_id`

- **Implicit:** Yes.
- **Query served:** Every `allocate_*_number()` call hits this index via `UPDATE ... WHERE tenant_id = ?`.

No additional indexes — this table has one row per tenant, accessed only by PK.

---

## Part 5: Relationships

### Outgoing FK

| Target table | FK column | Cascade | Why |
|---|---|---|---|
| `tenants` | `tenant_id` | `ON DELETE CASCADE` | Sequence counters belong to the tenant |

### Incoming references

None. This table is consumed by the two helper functions, not by FKs from other tables. The generated strings are stored as TEXT on `orders.order_number`, `bills.bill_number`, and `kitchen_tickets.ticket_number` (where `ticket_number = order_number`).

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Lunch rush — two customers order simultaneously

"Street 99 Noodles" (`code_prefix = 'S99'`, timezone `Asia/Phnom_Penh`) has just opened for lunch. At 11:03 AM local time, customers A and B both tap "Place Order" at the exact same instant.

The backend processes both requests concurrently. Each calls `allocate_order_number('clx8street99...')` inside its transaction:

- **Transaction A** acquires the row lock. Reads `next_order_counter = 1`, `counters_reset_on = 2026-04-22`. Today in ICT is `2026-04-22` — matches, no reset. Returns `'S99-001'`. Sets counter to `2`, commits.
- **Transaction B** waits. Once A commits, B acquires the lock. Reads `next_order_counter = 2`, same date. Returns `'S99-002'`. Sets counter to `3`.

Both customers get unique, sequential numbers. No race, no Redis.

### Scenario 2: Tenant-local midnight rollover

At 23:59 local time on 2026-04-22, Street 99 Noodles has allocated up to `S99-187`. `counters_reset_on = 2026-04-22`, `next_order_counter = 188`.

At 00:00:15 local time on 2026-04-23, a late customer places an order:

- `allocate_order_number` computes `v_local_today = 2026-04-23`.
- Row lock acquired.
- `counters_reset_on (2026-04-22) <> v_local_today (2026-04-23)` → reset path.
- Counter set to `2` (the CASE expression's "just reset" branch), `counters_reset_on` set to `2026-04-23`, returns `'S99-001'`.

The next order that night gets `'S99-002'`. By morning, the merchant's orders list for the new day starts fresh at `S99-001`, as expected.

### Scenario 3: Bill allocation — running sequential

Midway through the afternoon at Lucky Burger (`code_prefix = 'LB'`), the cashier closes out a table session. `PaymentUseCase` calls `allocate_bill_number('clx8lucky...')`:

- Row lock acquired.
- `next_bill_number` before: `126`.
- Returns `'LB-B-000125'`. Counter advanced to `127`.

The same-day order for that bill might be `LB-042`; the bill is `LB-B-000125`. The mismatch is intentional — see `design-discussions/order-numbering-strategy.md` § 4.5.

### Scenario 4: Verifying daily volume during a support inquiry

A merchant at Phnom Penh Noodles (`code_prefix = 'PPN'`) reports they think today's order count is wrong. A platform admin:

```sql
SELECT code_prefix, next_order_counter, counters_reset_on, next_bill_number
FROM   tenant_sequences ts
JOIN   tenants t ON t.id = ts.tenant_id
WHERE  t.code_prefix = 'PPN';
```

If `counters_reset_on = 2026-04-22` (today local) and `next_order_counter = 51`, then 50 orders have been allocated today — next would be `PPN-051`. The admin compares with `SELECT COUNT(*) FROM orders WHERE tenant_id = ... AND DATE(created_at AT TIME ZONE 'Asia/Phnom_Penh') = CURRENT_DATE` to confirm.

---

## Part 7: Design Decisions

### Why Postgres functions instead of Redis

The initial design used Redis `INCR` for atomic counter allocation. Rejected because:

- **Split-brain risk:** if Redis crashes after incrementing but before the Postgres transaction commits, the number is burned (gap in the sequence). If Postgres crashes after inserting the order but before Redis increments, two orders could get the same number.
- **Extra dependency on critical path:** Redis is in the stack for BullMQ and caching, but making it a required dependency for order numbering means a Redis outage blocks all ordering.
- **Transactional atomicity:** the Postgres-based approach runs the counter increment and the order insert in the same transaction. Either both succeed or both roll back. No external coordination.

### Why `tenant_id` is the PK instead of a cuid `id`

This is the only table that deviates from the "every table has a cuid `id`" convention. Reason: there is exactly one row per tenant, accessed only by `tenant_id`, and a separate `id` column would add no value. Using `tenant_id` as the PK means `allocate_*_number()` hits the PK index with zero indirection.

### Why daily reset for orders, running for bills

| | Orders | Bills |
|---|---|---|
| Audience | Customer & kitchen (operational) | Accountant & auditor (financial) |
| Lookup horizon | Mostly same-day | Months / years |
| Short & memorable | Critical ("I'm LB-042") | Not needed |
| Legal/audit compliance | None | Tax jurisdictions often require non-resetting |
| Would collide if running forever? | Gets long (`LB-012345`) | Stays readable in a table column |

Different counter strategies for different artifact types is the common POS-industry pattern — not an inconsistency in the schema.

### Why a separate `counters_reset_on` column instead of computing from `updated_at`

`updated_at` is a timestamp; `counters_reset_on` is a local date. Deriving one from the other would require timezone math inside the `WHERE` clause of every allocator call, which is error-prone and harder to index. Storing the local date explicitly keeps the reset check a simple `=` comparison.

### Why the reset path uses two statements (since 2026-04-26)

The pre-2026-04-26 implementation used a single `UPDATE ... RETURNING` with a CASE expression in both the SET and the RETURNING clauses. It was **correct** but subtle — verifying it by inspection required walking through the post-UPDATE state on both branches, and the `RETURNING` clause's `CASE WHEN ... AND next_order_counter = 2 THEN 1` was particularly hard to validate.

The 2026-04-26 refactor splits this into two statements:

1. `SELECT counters_reset_on, next_order_counter ... FOR UPDATE` — locks the row and reads the current state.
2. `UPDATE` — applies the new state.

Same atomicity (the `FOR UPDATE` row lock from step 1 is held until COMMIT), same one-trip-to-the-database transactional semantics, but each statement is independently obvious. The earlier "merge into one UPDATE" optimization saved no real cost — Postgres treats the two statements as one transaction, the lock is held the whole time, and there's only one write.

The trade-off: 1 extra statement per call. The benefit: the function body is now obvious-on-inspection, which is the harder thing to get right when the entire numbering scheme depends on this function being correct under concurrent midnight rollover.

### Why the 2026-04-26 CHECK constraints

Three sanity bounds were added because the table is small but high-stakes:

- `next_order_counter >= 1` — counters store "the next value to allocate." Zero or negative is meaningless.
- `next_bill_number >= 1` — same.
- `counters_reset_on >= '2025-01-01'` — catches NULL-equivalent dates like Unix epoch (`1970-01-01`) that could sneak in via misconfigured defaults or migration mistakes.

The helper functions can't legitimately produce these states, but a manual `UPDATE` mistake or a backfill bug could. The constraints are zero-cost insurance.

### Why no `allocate_ticket_number()`

A kitchen ticket is the kitchen's view of a single order. It does not need its own counter — `kitchen_tickets.ticket_number` is set equal to the order's `order_number` at ticket creation. Eliminating the third counter simplifies the schema (one fewer column on `tenant_sequences`), the API (one fewer helper), and the mental model (customer, cashier, kitchen all say the same string).

### Why `INTEGER` for `next_order_counter` and `BIGINT` for `next_bill_number`

The order counter resets daily — even 1000 orders/day wraps at 10 years before hitting `INTEGER`'s 2.1 billion ceiling (and by then the tenant is long gone). The bill counter never resets — 500 bills/day for 50 years is ~9.1 million, still well under `INTEGER`, but using `BIGINT` eliminates any future conversation about overflow. 4 extra bytes on a single-row-per-tenant table is zero-cost.

### Why prefixes come from `tenants.code_prefix`, not `tenant_sequences`

The prefix is identity-level (like `slug`), immutable, shown on every customer-facing artifact. Storing it on `tenants` (next to `slug` and `name_en`) matches the "identity on `tenants`, counters on `tenant_sequences`" domain boundary. The helper functions JOIN `tenants` once per call to resolve the prefix — cheap, cached on the PK index.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `tenants` | Parent (1:1, PK = FK) | Owns `code_prefix` — the string used to format every allocated number |
| `tenant_settings` | Read-only reference | Source of `timezone` for the daily reset boundary |
| `orders` | Indirect consumer | `orders.order_number` stores the allocated daily string |
| `bills` | Indirect consumer | `bills.bill_number` stores the allocated running string |
| `kitchen_tickets` | Indirect consumer | `kitchen_tickets.ticket_number` inherits `orders.order_number` (no allocation) |
