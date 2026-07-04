# Tenant Settings Improvements — Discussion & Decision

**Date:** 2026-04-09
**Status:** ✅ Decided
**Affects:** `tenant_settings` table, new `tenant_operating_hours` table

---

## TL;DR

The `tenant_settings` table was improved with: tax config, bilingual store
description, Cambodia-specific structured address (sangkat/khan/province),
cover image, social links as JSONB, auto-accept toggle, and a new
`tenant_operating_hours` table for opening hours. Payment methods were
moved to a separate `tenant_payment_methods` table. Session timeout was
removed (sessions close by payment/merchant action/24h cleanup).

---

## Part 1 — Problems with the original table

### Problem 1: Missing fields that restaurants need

The original table had operational config, payment booleans, business
contact, physical address, and branding — but was missing:

| Missing | Why it matters |
|---|---|
| Operating hours | Storefront needs "Open now" / "Closed". Orders should be blocked outside hours. |
| Tax config | Cambodia has 10% VAT. Some stalls don't charge it. Receipts need to show tax or not. |
| Store description (bilingual) | Storefront "About" section. "Best noodles in BKK1 since 2019." |
| Auto-accept orders toggle | Some stalls want orders straight to kitchen. Some restaurants want to review first. |
| Cover image | Storefront hero banner. |
| Social media links | Facebook, Instagram, TikTok for storefront footer. |

### Problem 2: Payment booleans don't scale

```sql
-- 3 booleans today, +1 column for every new payment method
payment_cash    BOOLEAN NOT NULL DEFAULT TRUE,
payment_aba_qr  BOOLEAN NOT NULL DEFAULT FALSE,
payment_card    BOOLEAN NOT NULL DEFAULT FALSE,
-- Adding Wing? pi_pay? crypto? Another column each time.
```

### Problem 3: Address was poorly structured for Cambodia

`address_line1_en` / `address_line1_km` implies a "line 2" that doesn't
exist. Cambodia has a specific hierarchy (Street → Sangkat → Khan →
Province) that needs structured fields for filtering ("show all restaurants
in Daun Penh").

### Problem 4: Operating hours can't be a single column

A restaurant might be:
- Mon-Fri: 7:00-21:00
- Sat: 8:00-22:00
- Sun: closed
- Or: open 11:00-14:00, closed 14:00-17:00, open 17:00-22:00 (lunch break)

This needs its own table, not a column.

---

## Part 2 — Decisions for each improvement

### Description — two columns, not JSONB

`description_en` and `description_km` as two TEXT columns. Matches the
pattern used for `tenants.name_en` / `name_km`. JSONB (`{"en":"...","km":"..."}`)
loses NOT NULL enforcement and makes queries messier for just 2 locales.

```sql
description_en  TEXT,
description_km  TEXT,
```

### Cover image — straightforward

```sql
cover_image_url TEXT,   -- storefront hero banner
```

### Social links — JSONB, not separate columns

Cambodia's social media landscape changes fast (Facebook, Instagram, TikTok,
YouTube, Line, Telegram). Separate columns means a migration for every new
platform. JSONB is extensible:

```sql
social_links  JSONB,   -- {"facebook":"https://fb.com/...","instagram":"...","tiktok":"..."}
```

**Why JSONB wins:**
- Adding a new platform = insert a key, no migration.
- Unknown future platforms (Line, YouTube, Threads) = same.
- The app never queries "find all tenants with Instagram" — it just reads
  the whole object and renders icons.
- `Object.entries(social_links)` → display all linked platforms.

**Why separate columns lose:** You'd add `line_url`, `youtube_url`,
`threads_url` columns every few months as platforms shift.

### Payment methods — separate table, not booleans or array

Replace 3 booleans with a dedicated `tenant_payment_methods` table:

```sql
-- BEFORE (3 booleans)
payment_cash    BOOLEAN NOT NULL DEFAULT TRUE,
payment_aba_qr  BOOLEAN NOT NULL DEFAULT FALSE,
payment_card    BOOLEAN NOT NULL DEFAULT FALSE,

-- AFTER (separate table)
-- See tenant-payment-methods.md for full schema
CREATE TABLE tenant_payment_methods (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  method     "PaymentMethod" NOT NULL,
  provider   TEXT,
  config     JSONB,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ...
);
```

**Why a separate table wins over an enum array on tenant_settings:**
- Each payment method needs per-method config (provider credentials, display order, enabled/disabled toggle).
- An enum array (`"PaymentMethod"[]`) can only store which methods exist, not their configuration.
- The table allows enabling/disabling individual methods without removing them.
- Adding Wing, Pi Pay, or new providers = insert a row, not a migration.

See `tables/tenant-payment-methods.md` for the full discussion.

### Address — hybrid (structured + free-text)

Cambodia has a specific address hierarchy:

```
Street/House → Sangkat (commune) → Khan (district) → Province/City → Country
```

But real Cambodian addresses are messy: "near the big tree, behind the
pagoda" or "opposite Lucky Supermarket, Street 271." Pure structured fields
can't capture this. Pure free-text can't be filtered.

**Decision: structured fields for filterable parts + free-text for the rest.**

```sql
-- Free-text (the specific location — landmarks, street, house)
address_en        TEXT,              -- "House 23, Street 240, near Wat Phnom"
address_km        TEXT,              -- "ផ្ទះ២៣ ផ្លូវ២៤០ ជិតវត្តភ្នំ"

-- Structured (standardized, filterable)
sangkat           TEXT,              -- commune/sangkat
khan              TEXT,              -- district/khan
province          TEXT,              -- "Phnom Penh", "Siem Reap"
country           TEXT NOT NULL DEFAULT 'KH',

-- GPS
latitude          DECIMAL(10, 7),
longitude         DECIMAL(10, 7),
google_maps_url   TEXT,
```

**Why hybrid, not one-line or fully structured:**

| Approach | Problem |
|---|---|
| One line only | Can't filter "show all restaurants in Daun Penh" |
| Fully structured only | "Near the big tree, behind the pagoda" doesn't fit `street_number` + `street_name` |
| Hybrid | Free-text captures messy reality; structured fields enable filtering |

**Updated decision:** After further discussion, the entire address (including
sangkat, khan, province) was moved into ONE JSONB column with bilingual
support at every level. Separate columns for sangkat/khan/province were
dropped in favor of a single structured JSONB:

```json
{
  "street": {"en": "House 23, Street 240", "km": "ផ្ទះ២៣ ផ្លូវ២៤០"},
  "sangkat": {"en": "Chaktomuk", "km": "ចតុមុខ"},
  "khan": {"en": "Daun Penh", "km": "ដូនពេញ"},
  "province": {"en": "Phnom Penh", "km": "ភ្នំពេញ"},
  "country": "KH"
}
```

Future marketplace filtering uses JSONB path queries with GIN indexes:
```sql
WHERE address->'khan'->>'en' = 'Daun Penh'
```

### Why GPS stays as separate columns, not inside `address` JSONB

`latitude`, `longitude`, and `google_maps_url` are NOT in the `address`
JSONB — they stay as dedicated columns. Reasons:

1. **Distance math requires numeric columns.** Future delivery/marketplace
   needs spatial queries:
   ```sql
   -- "restaurants within 5km of me"
   WHERE earth_distance(
     ll_to_earth(latitude, longitude),
     ll_to_earth(customer_lat, customer_lng)
   ) < 5000
   ```
   If lat/lng were in JSONB, every query would need a cast:
   ```sql
   -- Ugly, slow, can't use spatial indexes
   WHERE earth_distance(
     ll_to_earth((address->>'latitude')::decimal, (address->>'longitude')::decimal),
     ll_to_earth(?, ?)
   ) < 5000
   ```
   No spatial index can optimize the JSONB version.

2. **Spatial indexes need real columns.** When delivery is built, a PostGIS
   or `earthdistance` index on `(latitude, longitude)` is trivial with
   DECIMAL columns. Impossible with JSONB-embedded values.

3. **`google_maps_url` stays with lat/lng.** It's closely tied — all three
   are "GPS/location" data. Splitting one into JSONB while keeping two as
   columns is awkward. Keep them together.

**Rule of thumb:** JSONB for display data (bilingual text, social links).
DECIMAL/numeric columns for data that needs math or indexing.

### Tax config — two fields

```sql
tax_rate_bps     INTEGER NOT NULL DEFAULT 0,       -- 0 = no tax. 1000 = 10.00% VAT
tax_inclusive    BOOLEAN NOT NULL DEFAULT TRUE,     -- price includes tax? (Cambodia norm)
```

Simplified from 3 fields: `tax_rate_bps = 0` means no tax — no separate
`tax_enabled` boolean needed.

**Why basis points:** `10.00%` = `1000` bps. Integer math, no floating
point. Supports fractional rates (e.g., 7.5% = 750 bps) without decimals.

**Why `tax_inclusive` defaults to TRUE:** In Cambodia, posted prices
typically include VAT. The receipt shows the breakdown. A $5.00 item with
10% inclusive tax = $4.55 base + $0.45 tax. The customer still pays $5.00.

### Auto-accept orders

```sql
auto_accept_orders  BOOLEAN NOT NULL DEFAULT TRUE,
```

- `TRUE` (default): orders go straight to kitchen. SUBMITTED → kitchen
  ticket created automatically. Good for stalls where speed matters.
- `FALSE`: orders appear in the merchant portal for review. The merchant
  taps "Accept" to send to kitchen. Good for restaurants that want to
  check stock or capacity before committing.

### Session timeout — removed

~~`session_timeout_min INTEGER NOT NULL DEFAULT 30`~~ was removed. Sessions
no longer have a configurable timeout or an `expires_at` column. Sessions
close by:
1. Bill paid -- session auto-closes.
2. Merchant manually closes from the portal.
3. Background cleanup job for abandoned sessions (24h, platform-wide).

This simplification was made because configurable per-tenant timeouts added
edge cases (what if the customer is still eating when the timer fires?)
without solving the real problem. The 24-hour platform-wide cleanup is a
sufficient safety net for truly abandoned sessions.

### Operating hours — separate table

```sql
CREATE TABLE tenant_operating_hours (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,          -- 0=Sunday, 6=Saturday
  open_time   TIME NOT NULL,
  close_time  TIME NOT NULL,
  is_closed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(3) NOT NULL,
  UNIQUE (tenant_id, day_of_week, open_time)
);

CREATE INDEX ON tenant_operating_hours (tenant_id);
```

**Multiple rows per day** handles lunch breaks:

```
Mon: { day: 1, open: 11:00, close: 14:00 }   ← morning session
     { day: 1, open: 17:00, close: 22:00 }   ← evening session
Tue: same pattern
Sun: { day: 0, is_closed: true, open: 00:00, close: 00:00 }
```

**Why a separate table, not a JSONB column:**
- Multiple time slots per day (lunch break) need multiple rows.
- Querying "is this tenant open right now?" is cleaner with SQL:
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
- JSONB would require parsing and comparing times in application code.

---

## Part 3 — The updated schema

### `tenant_settings` (revised)

```sql
CREATE TABLE tenant_settings (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Operational
  service_model        "ServiceModel" NOT NULL DEFAULT 'STALL_KIOSK',
  pay_timing           "PayTiming"    NOT NULL DEFAULT 'PAY_BEFORE',
  default_locale       "Locale" NOT NULL DEFAULT 'km',
  timezone             TEXT NOT NULL DEFAULT 'Asia/Phnom_Penh',
  currency             "Currency" NOT NULL DEFAULT 'USD',
  auto_accept_orders   BOOLEAN NOT NULL DEFAULT TRUE,

  -- Tax
  tax_rate_bps     INTEGER NOT NULL DEFAULT 0,        -- 0 = no tax. 1000 = 10.00%
  tax_inclusive    BOOLEAN NOT NULL DEFAULT TRUE,

  -- Payment methods: moved to tenant_payment_methods table (see tenant-payment-methods.md)

  -- Business contacts (multi-channel, multi-value)
  business_contacts  JSONB NOT NULL DEFAULT '[]',

  -- Store description (bilingual)
  description  JSONB,                                 -- {"en": "...", "km": "..."}

  -- Address (bilingual structured JSONB)
  address  JSONB,                                     -- {"street":{"en":"...","km":"..."},"sangkat":{...},"khan":{...},"province":{...},"country":"KH"}

  -- GPS (separate columns for numeric math)
  latitude        DECIMAL(10, 7),
  longitude       DECIMAL(10, 7),
  google_maps_url TEXT,

  -- Branding
  primary_color     TEXT,
  logo_url          TEXT,
  cover_image_url   TEXT,

  -- Social links
  social_links  JSONB,                                -- {"facebook":"...","instagram":"...","tiktok":"..."}

  updated_at    TIMESTAMP(3) NOT NULL
);
```

### `tenant_operating_hours` (new table)

```sql
CREATE TABLE tenant_operating_hours (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,          -- 0=Sunday, 6=Saturday
  open_time   TIME NOT NULL,
  close_time  TIME NOT NULL,
  is_closed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(3) NOT NULL,
  UNIQUE (tenant_id, day_of_week, open_time)
);

CREATE INDEX ON tenant_operating_hours (tenant_id);
```

---

## Part 4 — Summary of all changes

| Change | Before | After | Why |
|---|---|---|---|
| Payment methods | 3 booleans | `tenant_payment_methods` table | Per-method config, scales with new methods |
| Address | `address_line1_en/km` + `city` | `address_en/km` + `sangkat` + `khan` + `province` | Cambodia-specific structure, filterable |
| Description | missing | `description_en` + `description_km` | Storefront "About" section |
| Cover image | missing | `cover_image_url` | Storefront hero banner |
| Social links | missing | `social_links JSONB` | Extensible, no migration per platform |
| Tax | missing | `tax_enabled` + `tax_rate_bps` + `tax_inclusive` | Cambodia 10% VAT, receipt display |
| Auto-accept | missing | `auto_accept_orders BOOLEAN` | Some merchants want to review first |
| Session timeout | hardcoded 30/240 | **Removed** | Sessions close by payment/merchant action/24h cleanup |
| Operating hours | missing | **New table** `tenant_operating_hours` | "Open now" / "Closed", per-day, lunch breaks |
| City column | `city TEXT` | Replaced by `address JSONB` (sangkat/khan/province inside) | Bilingual, filterable via JSONB path queries |

---

## Part 5 — Files updated

| File | Change |
|---|---|
| `docs/discussions/tables/postgresql-schema.md` | ✅ `tenant_settings` SQL updated, `tenant_operating_hours` added, inventory 29→30 |
| `docs/discussions/tables/tenant-settings.md` | ✅ Full rewrite |
| `docs/discussions/discussion_and_decision.md` | ✅ New entry |
