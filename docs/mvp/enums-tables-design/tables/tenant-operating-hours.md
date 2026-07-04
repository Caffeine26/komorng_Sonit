# `tenant_operating_hours`

| Attribute | Value |
|---|---|
| **Domain** | Tenant |
| **Tenant-scoped?** | Yes |
| **Prisma model** | `TenantOperatingHour` |
| **Mapped name** | `@@map("tenant_operating_hours")` |

---

## Part 1: Overview

The `tenant_operating_hours` table stores per-day opening hours for each
tenant. It answers: "Is this restaurant open right now?" and "What are
their hours on Saturday?"

The storefront uses this to show "Open" / "Closed" status and optionally
block orders outside operating hours. The merchant portal uses it in the
settings page where the owner configures their weekly schedule.

**Why a separate table, not a column on `tenant_settings`:**
- A restaurant may have **multiple time slots per day** (lunch break: open
  11:00-14:00, closed 14:00-17:00, reopen 17:00-22:00). This requires
  multiple rows per day — impossible with a single column.
- 7 days × 1-2 slots = 7-14 rows per tenant. A JSONB column could hold
  this, but SQL queries like "is this tenant open right now?" are much
  cleaner with rows:
  ```sql
  SELECT EXISTS (
    SELECT 1 FROM tenant_operating_hours
    WHERE tenant_id = 'x'
      AND day_of_week = EXTRACT(DOW FROM NOW())
      AND is_closed = FALSE
      AND open_time <= CURRENT_TIME
      AND close_time > CURRENT_TIME
  );
  ```
  With JSONB, this would require parsing and comparing times in application
  code — error-prone and not indexable.

**If no rows exist** for a tenant, the storefront treats the business as
"always open" (no schedule configured). This is the default for new tenants
during onboarding — they can add hours later.

---

## Part 2: CREATE TABLE

> **2026-04-25:** composite-PK refresh.

```sql
CREATE TABLE tenant_operating_hours (
  tenant_id   TEXT NOT NULL,
  id          TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,          -- 0=Sunday, 6=Saturday
  open_time   TIME NOT NULL,
  close_time  TIME NOT NULL,
  is_closed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id, day_of_week, open_time)
);
```

---

## Part 3: Column-by-Column

### `id` — TEXT PRIMARY KEY

- **Nullable:** No
- **Default:** `cuid()` (application-generated)
- **Purpose:** Surrogate primary key.

### `tenant_id` — TEXT NOT NULL

- **Nullable:** No
- **Constraints:** `REFERENCES tenants(id) ON DELETE CASCADE`. Indexed.
- **Purpose:** Which tenant this schedule row belongs to. One tenant has
  7-14 rows (one or two per day of the week).
- **Why CASCADE:** If a tenant is deleted, their schedule is cleaned up.

### `day_of_week` — INTEGER NOT NULL

- **Nullable:** No
- **Purpose:** Which day this row applies to.
- **Values:** `0` = Sunday, `1` = Monday, ..., `6` = Saturday.
  Matches PostgreSQL's `EXTRACT(DOW FROM timestamp)` which returns 0-6
  with Sunday = 0.
- **Why INTEGER not TEXT:** Direct comparison with `EXTRACT(DOW FROM NOW())`
  — no string parsing needed. "Is the restaurant open right now?" is a
  single integer comparison.
- **Why not an enum (MONDAY, TUESDAY, ...):** An integer matches the
  PostgreSQL DOW function directly. An enum would require mapping
  `'MONDAY' → 1` in every query.

### `open_time` — TIME NOT NULL

- **Nullable:** No
- **Purpose:** When the restaurant opens on this day (or this time slot).
- **Type:** PostgreSQL `TIME` (without timezone) — e.g., `07:00:00`,
  `11:30:00`, `17:00:00`.
- **Why TIME not TEXT:** The database can compare times directly. "Is it
  between open_time and close_time right now?" works natively with
  `CURRENT_TIME`.
- **Why without timezone:** All times are in the tenant's local timezone
  (stored in `tenant_settings.timezone`). The application converts
  `CURRENT_TIME` to the tenant's timezone before comparing.

### `close_time` — TIME NOT NULL

- **Nullable:** No
- **Purpose:** When the restaurant closes on this day (or this time slot).
- **Edge case — overnight hours:** A bar open 20:00-02:00 has
  `close_time < open_time`. The application handles this:
  ```
  if close_time > open_time:
    is_open = open_time <= now AND now < close_time
  else:  -- overnight (e.g., 20:00-02:00)
    is_open = now >= open_time OR now < close_time
  ```
  Alternatively, model it as two rows:
  ```
  Saturday: { open: 20:00, close: 23:59 }
  Sunday:   { open: 00:00, close: 02:00 }
  ```

### `is_closed` — BOOLEAN NOT NULL DEFAULT FALSE

- **Nullable:** No
- **Default:** `FALSE`
- **Purpose:** Whether the restaurant is closed on this day.
- **Why not just omit the row?** The merchant needs to explicitly mark a
  day as closed vs not having configured that day yet:
  - Row exists, `is_closed = FALSE` → "Open from 09:00 to 21:00"
  - Row exists, `is_closed = TRUE` → "Closed on Sunday" (explicitly marked)
  - No row for this day → "Hours not configured" (no schedule set yet)
- **When `is_closed = TRUE`:** `open_time` and `close_time` are ignored
  (can be set to `00:00` as placeholders). The query checks `is_closed`
  first.

### `created_at` — TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

- **Purpose:** When this schedule row was created.

### `updated_at` — TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

- **Purpose:** Last modification. Managed by Prisma `@updatedAt`.

---

## Part 4: Indexes

### `UNIQUE (tenant_id, day_of_week, open_time)`

- **Purpose:** Prevents duplicate time slots. A tenant can't have two
  entries for "Monday at 09:00."
- **Allows:** Multiple entries per day with different `open_time` values
  (for lunch breaks — see scenarios below).

### `INDEX ON tenant_operating_hours (tenant_id)`

- **Query served:** All schedule queries — loading the full weekly schedule
  for display, checking "is open now."
- **Example:**
  ```sql
  -- Load full weekly schedule for merchant portal settings page
  SELECT day_of_week, open_time, close_time, is_closed
  FROM tenant_operating_hours
  WHERE tenant_id = 'x'
  ORDER BY day_of_week, open_time;
  ```

---

## Part 5: Relationships

### Outgoing FK

| Target table | FK column | Cascade | Why |
|---|---|---|---|
| `tenants` | `tenant_id` | `ON DELETE CASCADE` | Schedule belongs to the tenant |

### Incoming references

None. `tenant_operating_hours` is a leaf table.

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Simple schedule — noodle stall open every day

"Kuy Teav Sok" (គុយទាវសុខ) is open 7 days a week, 6:00 AM to 2:00 PM
(breakfast/lunch only).

```
tenant_operating_hours rows:
  { day: 0, open: 06:00, close: 14:00, is_closed: false }  -- Sunday
  { day: 1, open: 06:00, close: 14:00, is_closed: false }  -- Monday
  { day: 2, open: 06:00, close: 14:00, is_closed: false }  -- Tuesday
  { day: 3, open: 06:00, close: 14:00, is_closed: false }  -- Wednesday
  { day: 4, open: 06:00, close: 14:00, is_closed: false }  -- Thursday
  { day: 5, open: 06:00, close: 14:00, is_closed: false }  -- Friday
  { day: 6, open: 06:00, close: 14:00, is_closed: false }  -- Saturday
```

7 rows. The storefront shows "Open 6:00 AM - 2:00 PM daily."

### Scenario 2: Restaurant with lunch break

"Malis Restaurant" is open for lunch and dinner with a break in between.
Closed on Mondays.

```
tenant_operating_hours rows:
  { day: 0, open: 11:00, close: 14:00, is_closed: false }  -- Sunday lunch
  { day: 0, open: 17:00, close: 22:00, is_closed: false }  -- Sunday dinner
  { day: 1, is_closed: true, open: 00:00, close: 00:00 }   -- Monday CLOSED
  { day: 2, open: 11:00, close: 14:00, is_closed: false }  -- Tuesday lunch
  { day: 2, open: 17:00, close: 22:00, is_closed: false }  -- Tuesday dinner
  ... (same pattern for Wed-Sat)
```

13 rows (2 per open day + 1 for closed Monday). The storefront shows:
- "Monday: Closed"
- "Tuesday-Sunday: 11:00 AM - 2:00 PM, 5:00 PM - 10:00 PM"

The "is open now?" query at 3:00 PM on a Tuesday returns FALSE (between
lunch and dinner slots).

### Scenario 3: Bar with late-night hours

"Bassac Lane Bar" opens at 5:00 PM and closes at 2:00 AM (next day).
Closed on Tuesdays.

```
tenant_operating_hours rows:
  { day: 0, open: 17:00, close: 23:59, is_closed: false }  -- Sunday evening
  { day: 1, open: 00:00, close: 02:00, is_closed: false }  -- Monday early AM (Sunday overflow)
  { day: 1, open: 17:00, close: 23:59, is_closed: false }  -- Monday evening
  { day: 2, open: 00:00, close: 02:00, is_closed: false }  -- Tuesday early AM (Monday overflow)
  { day: 2, is_closed: true, open: 00:00, close: 00:00 }   -- Tuesday CLOSED (no evening opening)
  ... (pattern continues)
```

Overnight hours are modeled as two rows: one for the evening (17:00-23:59)
and one for the early morning overflow (00:00-02:00 on the next day).

### Scenario 4: Checking "is open now?" in code

The storefront calls this on every page load to show the open/closed badge:

```sql
-- Is this tenant open right now?
-- (application converts NOW() to tenant's timezone first)
SELECT EXISTS (
  SELECT 1
  FROM tenant_operating_hours
  WHERE tenant_id = 'x'
    AND day_of_week = EXTRACT(DOW FROM NOW() AT TIME ZONE 'Asia/Phnom_Penh')
    AND is_closed = FALSE
    AND open_time <= (NOW() AT TIME ZONE 'Asia/Phnom_Penh')::TIME
    AND close_time > (NOW() AT TIME ZONE 'Asia/Phnom_Penh')::TIME
) AS is_open;
```

If no rows exist for this tenant → defaults to "always open" (no schedule
configured).

### Scenario 5: Merchant configures schedule from portal

The merchant portal's Settings → Operating Hours page shows a weekly grid.
The merchant fills in times for each day and taps "Save."

The backend upserts all rows in one transaction:

```sql
-- Delete existing schedule and replace (simplest approach)
DELETE FROM tenant_operating_hours WHERE tenant_id = 'x';

-- Insert new schedule
INSERT INTO tenant_operating_hours (id, tenant_id, day_of_week, open_time, close_time, is_closed)
VALUES
  ('id_1', 'x', 0, '06:00', '14:00', false),  -- Sunday
  ('id_2', 'x', 1, '06:00', '14:00', false),  -- Monday
  ('id_3', 'x', 2, '06:00', '14:00', false),  -- Tuesday
  ('id_4', 'x', 3, '06:00', '14:00', false),  -- Wednesday
  ('id_5', 'x', 4, '06:00', '14:00', false),  -- Thursday
  ('id_6', 'x', 5, '06:00', '14:00', false),  -- Friday
  ('id_7', 'x', 6, '06:00', '14:00', false);  -- Saturday
```

---

## Part 7: Design Decisions

### Why a table, not a JSONB column on `tenant_settings`

A JSONB column like `operating_hours JSONB` could hold the entire schedule:
```json
[
  {"day": 0, "slots": [{"open": "06:00", "close": "14:00"}]},
  {"day": 1, "slots": [{"open": "11:00", "close": "14:00"}, {"open": "17:00", "close": "22:00"}]}
]
```

But the most important query — "is this tenant open right now?" — becomes
application code instead of SQL:

```javascript
// JSONB approach: parse, loop, compare times in JS
const hours = tenant.operatingHours;
const today = hours.find(h => h.day === new Date().getDay());
const now = getCurrentTime();
const isOpen = today?.slots.some(s => now >= s.open && now < s.close);
```

vs.

```sql
-- Table approach: one SQL query, indexable, correct timezone handling
SELECT EXISTS (
  SELECT 1 FROM tenant_operating_hours
  WHERE tenant_id = 'x'
    AND day_of_week = EXTRACT(DOW FROM NOW() AT TIME ZONE tz)
    AND is_closed = FALSE
    AND open_time <= (NOW() AT TIME ZONE tz)::TIME
    AND close_time > (NOW() AT TIME ZONE tz)::TIME
);
```

The SQL approach is:
- Timezone-correct (PostgreSQL handles `AT TIME ZONE`)
- Indexable (the `(tenant_id)` index serves the query)
- Testable (pure SQL, no application logic)
- Consistent (same query works from any client — backend, cron job, admin tool)

### Why `day_of_week` is INTEGER 0-6, not TEXT or enum

PostgreSQL's `EXTRACT(DOW FROM timestamp)` returns 0 (Sunday) through 6
(Saturday). Using the same encoding means no mapping needed:

```sql
WHERE day_of_week = EXTRACT(DOW FROM NOW())  -- direct comparison
```

An enum (`MONDAY`, `TUESDAY`, ...) would require:
```sql
WHERE day_of_week = CASE EXTRACT(DOW FROM NOW())
  WHEN 0 THEN 'SUNDAY' WHEN 1 THEN 'MONDAY' ... END  -- painful
```

### Why `is_closed` exists instead of just omitting the row

Three states need to be distinguishable:

| State | Meaning | How it's modeled |
|---|---|---|
| Open with schedule | "Open 09:00-21:00" | Row exists, `is_closed = false` |
| Explicitly closed | "Closed on Monday" | Row exists, `is_closed = true` |
| No schedule set | "Hours not configured" | No row for this day |

Without `is_closed`, you can't distinguish "closed on Monday" from "haven't
configured Monday yet." The merchant portal needs this distinction to show
the right UI (toggle vs empty state).

### Why no `label` or `slot_name` column

A label like "Lunch" or "Dinner" was considered for the time slots but
rejected. The frontend can derive labels from the times:
- 06:00-14:00 → "Morning"
- 11:00-14:00 → "Lunch"
- 17:00-22:00 → "Dinner"

Adding a label column is extra data entry for the merchant with no
functional benefit. The schedule is displayed as times, not named sessions.

### Why TIME without timezone

All times are in the tenant's local timezone (from `tenant_settings.timezone`).
PostgreSQL `TIME` stores just hours:minutes:seconds without timezone info.
The application converts `NOW()` to the tenant's timezone before comparing:

```sql
(NOW() AT TIME ZONE 'Asia/Phnom_Penh')::TIME
```

Using `TIMETZ` (time with timezone) would complicate things — the tenant's
timezone is already known from `tenant_settings`, and mixing timezone-aware
times with timezone-naive comparisons is a common source of bugs.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `tenants` | Parent (N:1) | The tenant this schedule belongs to |
| `tenant_settings` | Sibling (both children of tenant) | `tenant_settings.timezone` determines how to interpret the TIME values |
| `qr_contexts` | Indirect | The storefront checks operating hours when a customer scans the QR — if closed, show "This restaurant is currently closed" |
| `orders` | Indirect | If `block_orders_when_closed` is implemented (future), the ordering system checks this table before accepting an order |
| `setup_progress` | Indirect | A future enhancement could check "has the tenant set up operating hours?" as an onboarding step |
