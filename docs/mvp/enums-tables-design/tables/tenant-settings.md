# `tenant_settings`

| Attribute | Value |
|---|---|
| **Domain** | Tenant |
| **Tenant-scoped?** | Yes (1:1 with `tenants`) |
| **Prisma model** | `TenantSettings` |
| **Mapped name** | `@@map("tenant_settings")` |

---

## Part 1: Overview

The `tenant_settings` table holds everything **operational, contactable,
locatable, and brandable** about a business — one row per tenant, enforced
by a unique constraint on `tenant_id`. This is the configuration center for
each restaurant or stall.

The reason this is separate from `tenants` is architectural: the `tenants`
table is the identity anchor (slug, name, status) that rarely changes and
is referenced by many foreign keys. `tenant_settings` changes frequently —
every time a merchant toggles a payment method, updates their contacts, or
changes their logo. Keeping volatile operational data out of the identity
table reduces write contention.

Design principles:
- **JSONB for flexible/bilingual data.** `address`, `description`,
  `business_contacts`, and `social_links` use JSONB — extensible to new
  languages and channels without migrations.
- **Enum array for payment methods.** `"PaymentMethod"[]` replaces 3
  booleans — scales with new methods without adding columns.
- **GPS as separate columns** (not in JSONB) — needed for numeric distance
  calculations in future delivery/marketplace.
- **Operating hours in a separate table** (`tenant_operating_hours`).

See `design-discussions/tenant-settings-improvements.md` for the full design
discussion.

---

## Part 2: CREATE TABLE

> **2026-04-25:** composite-PK refresh. PK is now `(tenant_id, id)`;
> exactly-one-per-tenant enforced by `UNIQUE (tenant_id)`.

```sql
CREATE TABLE tenant_settings (
  tenant_id       TEXT NOT NULL,
  id              TEXT NOT NULL,

  -- Operational
  service_model        "ServiceModel" NOT NULL DEFAULT 'STALL_KIOSK',
  pay_timing           "PayTiming"    NOT NULL DEFAULT 'PAY_BEFORE',
  default_locale       "Locale" NOT NULL DEFAULT 'km',
  timezone             TEXT NOT NULL DEFAULT 'Asia/Phnom_Penh',
  currency             "Currency" NOT NULL DEFAULT 'USD',
  auto_accept_orders   BOOLEAN NOT NULL DEFAULT TRUE,

  -- Tax
  tax_rate_bps     INTEGER NOT NULL DEFAULT 0,
  tax_inclusive    BOOLEAN NOT NULL DEFAULT TRUE,

  -- Business contacts (multi-channel, multi-value)
  business_contacts  JSONB NOT NULL DEFAULT '[]',

  -- Store description (bilingual)
  description  JSONB,

  -- Address (bilingual structured)
  address  JSONB,

  -- GPS (separate columns for numeric math)
  latitude        DECIMAL(10, 7),
  longitude       DECIMAL(10, 7),
  google_maps_url TEXT,

  -- Branding
  primary_color     TEXT,
  logo_url          TEXT,
  cover_image_url   TEXT,

  -- Social links
  social_links  JSONB,

  updated_at    TIMESTAMP(3) NOT NULL,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT tenant_settings_one_per_tenant UNIQUE (tenant_id)
);
```

Referenced enums:

```sql
CREATE TYPE "ServiceModel"  AS ENUM ('STALL_KIOSK', 'DINE_IN_TABLE');
CREATE TYPE "PayTiming"     AS ENUM ('PAY_BEFORE', 'PAY_AFTER');
CREATE TYPE "Locale"        AS ENUM ('en', 'km');
CREATE TYPE "Currency"      AS ENUM ('USD', 'KHR');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'ABA_QR', 'CARD');
```

---

## Part 3: Column-by-Column

### `id` — TEXT PRIMARY KEY

- **Nullable:** No
- **Default:** `cuid()` (application-generated)
- **Purpose:** Surrogate primary key.
- **Why:** Platform convention — every table has a cuid `id`. Keeps Prisma
  relations consistent.

### `tenant_id` — TEXT UNIQUE NOT NULL

- **Nullable:** No
- **Default:** None (set on creation)
- **Purpose:** Links to exactly one tenant. `UNIQUE` enforces 1:1.
- **Constraints:** `REFERENCES tenants(id) ON DELETE CASCADE`.
- **Why:** Settings are meaningless without the tenant. CASCADE cleans up
  automatically.

### `service_model` — "ServiceModel" NOT NULL DEFAULT 'STALL_KIOSK'

- **Purpose:** How the business operates physically.
- `STALL_KIOSK` = no tables, customers order and pick up.
- `DINE_IN_TABLE` = seated customers, table-anchored sessions.
- **Why:** The storefront, kitchen, and billing logic all branch on this.
  See `design-discussions/servicemodel-and-paytiming.md`.

### `pay_timing` — "PayTiming" NOT NULL DEFAULT 'PAY_BEFORE'

- **Purpose:** When payment happens relative to food preparation.
- `PAY_BEFORE` = pay first, kitchen starts after.
- `PAY_AFTER` = eat first, pay later (session-based).
- **Why:** Combined with `service_model`, produces 4 operational scenarios.

### `default_locale` — "Locale" NOT NULL DEFAULT 'km'

- **Purpose:** Customer-facing storefront language.
- `km` = Khmer (default for Cambodia market).
- `en` = English (for tourist-area restaurants).
- **Why:** Per-tenant, not platform-wide. System/admin is always English.

### `timezone` — TEXT NOT NULL DEFAULT 'Asia/Phnom_Penh'

- **Purpose:** IANA timezone for receipt/display timestamps. DB stores UTC;
  this is applied at render time.
- **Why:** Column exists for Thai/Vietnamese expansion.

### `currency` — "Currency" NOT NULL DEFAULT 'USD'

- **Purpose:** Operating currency. Snapshotted onto orders, bills, payments.
- **Why:** Cambodia is USD-dominant. KHR available per tenant.

### `auto_accept_orders` — BOOLEAN NOT NULL DEFAULT TRUE

- **Purpose:** Whether orders go straight to kitchen.
- `TRUE` (default): order → kitchen ticket created immediately. Good for
  stalls where speed matters.
- `FALSE`: order appears in merchant portal for review. Merchant taps
  "Accept" to send to kitchen. Good for restaurants that check stock or
  capacity.
- **Why:** Some merchants want manual review before committing kitchen
  resources.

### `tax_rate_bps` — INTEGER NOT NULL DEFAULT 0

- **Purpose:** Tax rate in basis points. `0` = no tax. `1000` = 10.00%.
- **Why:** Basis points = integer math, no floating point. Supports
  fractional rates (7.5% = 750 bps). `0` means tax is disabled — no
  separate `tax_enabled` boolean needed.
- **Cambodia context:** Standard VAT is 10%. Many small stalls don't
  charge it.

### `tax_inclusive` — BOOLEAN NOT NULL DEFAULT TRUE

- **Purpose:** Whether posted prices include tax.
- `TRUE` (default, Cambodia norm): $5.00 item = $4.55 base + $0.45 tax.
  Customer pays $5.00.
- `FALSE`: $5.00 item + $0.50 tax = $5.50. Customer pays $5.50.

### `business_contacts` — JSONB NOT NULL DEFAULT '[]'

- **Purpose:** Multi-channel, multi-value business contact info.
- **Structure:**
  ```json
  [
    {"type": "phone", "value": "+85512345678", "label": "Smart"},
    {"type": "phone", "value": "+85598765432", "label": "Cellcard"},
    {"type": "messenger", "value": "LuckyBurgerPP"},
    {"type": "telegram", "value": "@luckyburger"},
    {"type": "email", "value": "info@luckyburger.km", "label": "Billing"}
  ]
  ```
- **Supported types:** `phone`, `email`, `telegram`, `messenger`,
  `whatsapp`, `line`, `instagram` — no enum, just convention.
- **Why JSONB, not 3 fixed columns:** Cambodia shops commonly have 2-3
  phone numbers (different carriers), use Messenger more than email, and
  may or may not use Telegram. Fixed columns can't handle this variety.

### `description` — JSONB (nullable)

- **Purpose:** Storefront "About" section text, bilingual.
- **Structure:** `{"en": "Best noodles since 2019", "km": "មីឆាឆ្ងាញ់បំផុត"}`
- **Why JSONB:** Extensible to new languages (`"th": "..."`) without
  migration. Always read as a whole object, never filtered.

### `address` — JSONB (nullable)

- **Purpose:** Full bilingual structured address for storefront and receipts.
- **Structure:**
  ```json
  {
    "street": {"en": "House 23, Street 240, near Wat Phnom", "km": "ផ្ទះ២៣ ផ្លូវ២៤០ ជិតវត្តភ្នំ"},
    "sangkat": {"en": "Chaktomuk", "km": "ចតុមុខ"},
    "khan": {"en": "Daun Penh", "km": "ដូនពេញ"},
    "province": {"en": "Phnom Penh", "km": "ភ្នំពេញ"},
    "country": "KH"
  }
  ```
- **Why JSONB:** Bilingual at every level (street, sangkat, khan, province).
  Separate columns would mean 8+ columns. JSONB keeps it in one.
- **Future marketplace filtering:**
  ```sql
  WHERE address->'khan'->>'en' = 'Daun Penh'
  CREATE INDEX ON tenant_settings ((address->'khan'->>'en'));
  ```
- **Why `street` is free-text:** Cambodian addresses are messy —
  landmark-based, no street numbers in many areas. Structured
  `street_number` + `street_name` doesn't work for "near the big tree,
  behind the pagoda."

### `latitude` / `longitude` — DECIMAL(10, 7)

- **Nullable:** Yes
- **Purpose:** GPS coordinates. ~1.1 cm precision.
- **MVP:** Not used — customers scan QR at the store. Captured now for
  future delivery/online ordering/marketplace.
- **Why separate columns, not in JSONB:** Distance calculations need
  numeric math (`earth_distance()`). JSONB can't do this.

### `google_maps_url` — TEXT (nullable)

- **Purpose:** Shareable Google Maps link. "Get Directions" button on
  storefront.
- **Why:** Many merchants already have their business on Google Maps. They
  paste the link rather than entering lat/lng manually.

### `primary_color` — TEXT (nullable)

- **Purpose:** Storefront accent color (hex, e.g., `#FF6B35`).
- **Why:** Basic branding. Applied to buttons, headers, highlights.

### `logo_url` — TEXT (nullable)

- **Purpose:** Tenant logo. Shown on storefront header and receipts.
- **How:** Uploaded via merchant portal → stored in CDN (S3/R2) → URL saved.

### `cover_image_url` — TEXT (nullable)

- **Purpose:** Storefront hero banner image.
- **How:** Same upload flow as logo.

### `social_links` — JSONB (nullable)

- **Purpose:** Social media profile links for storefront footer.
- **Structure:** `{"facebook": "https://fb.com/...", "instagram": "...", "tiktok": "..."}`
- **Why JSONB:** Platforms change — Facebook, Instagram, TikTok today; Line,
  YouTube, Threads tomorrow. Adding a key = no migration.

### `updated_at` — TIMESTAMP(3) NOT NULL

- **Purpose:** Last modification. Managed by Prisma `@updatedAt`.
- **Why no `created_at`:** Creation timestamp is effectively
  `tenants.created_at` — settings are always created with the tenant.

---

## Part 4: Indexes

### Unique index on `tenant_id`

- **Implicit:** Yes (created by `UNIQUE`)
- **Query served:** Every settings lookup — the app always accesses by tenant_id.
- **Example:**
  ```sql
  SELECT * FROM tenant_settings WHERE tenant_id = 'clx8k9m2n...';
  ```

### Primary key index on `id`

- **Implicit:** Yes (created by `PRIMARY KEY`)
- **Query served:** Direct row lookup (rare).

---

## Part 5: Relationships

### Outgoing FK

| Target table | FK column | Cascade | Why |
|---|---|---|---|
| `tenants` | `tenant_id` | `ON DELETE CASCADE` | Settings are meaningless without the tenant |

### Incoming references

No other table references `tenant_settings` directly. Values like
`service_model`, `pay_timing`, and `currency` are **snapshotted** onto
orders and bills at creation time, not joined live.

### Related table: `tenant_operating_hours`

```sql
CREATE TABLE tenant_operating_hours (
  tenant_id   TEXT NOT NULL,
  id          TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,       -- 0=Sunday, 6=Saturday
  open_time   TIME NOT NULL,
  close_time  TIME NOT NULL,
  is_closed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(3) NOT NULL,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id, day_of_week, open_time)
);
```

Multiple rows per day support lunch breaks:
```
Mon: { day: 1, open: 11:00, close: 14:00 }   ← morning
     { day: 1, open: 17:00, close: 22:00 }   ← evening
Sun: { day: 0, is_closed: true }
```

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Boba kiosk enables ABA QR payments

"Boba Queen" at AEON Mall has been cash-only. They sign up for ABA PayWay
and want to enable QR payments. Payment methods are managed in the
`tenant_payment_methods` table (see `tenant-payment-methods.md`):

```sql
INSERT INTO tenant_payment_methods (id, tenant_id, method, provider, config)
VALUES ('clx_tpm_002', 'clx8boba001...', 'ABA_QR', 'aba', '{
  "merchant_id": "MER-789012",
  "display_name": "Boba Queen",
  "qr_expiry_seconds": 300
}');
```

The storefront checkout immediately shows the ABA QR option alongside cash.

### Scenario 2: Restaurant updates contacts and address

"Malis Restaurant" adds a second phone number and moves locations.

```sql
UPDATE tenant_settings
SET    business_contacts = '[
         {"type":"phone","value":"+85512345678","label":"Smart"},
         {"type":"phone","value":"+85598765432","label":"Cellcard"},
         {"type":"messenger","value":"MalisRestaurant"},
         {"type":"telegram","value":"@malis_pp"}
       ]'::jsonb,
       address = '{
         "street":{"en":"#136 Street 21, Tonle Bassac","km":"ផ្ទះលេខ ១៣៦ ផ្លូវ ២១ សង្កាត់ទន្លេបាសាក់"},
         "sangkat":{"en":"Tonle Bassac","km":"ទន្លេបាសាក់"},
         "khan":{"en":"Chamkar Mon","km":"ចំការមន"},
         "province":{"en":"Phnom Penh","km":"ភ្នំពេញ"},
         "country":"KH"
       }'::jsonb,
       latitude = 11.5563000,
       longitude = 104.9282000,
       updated_at = NOW()
WHERE  tenant_id = 'clx8malis001...';
```

### Scenario 3: Platform analytics — payment method adoption

```sql
-- Find all active tenants that haven't enabled ABA QR
SELECT t.slug, t.name_en
FROM   tenants t
WHERE  t.status = 'ACTIVE'
  AND  NOT EXISTS (
    SELECT 1 FROM tenant_payment_methods tpm
    WHERE tpm.tenant_id = t.id AND tpm.method = 'ABA_QR' AND tpm.is_enabled = TRUE
  )
ORDER BY t.created_at;
```

---

## Part 7: Design Decisions

### Why settings are separate from `tenants`

The `tenants` table is the FK target for 22+ tables. Every write creates
contention. Settings change frequently — payment toggles, branding, address.
Separating them reduces write contention on the identity record.

### Why JSONB for address, description, contacts, social links

These fields are:
- **Bilingual** (address, description) or **multi-value** (contacts, social)
- **Never filtered** at MVP (read as a whole object, displayed per locale)
- **Extensible** (new languages, new contact channels, new social platforms)

Separate columns would mean 8+ address columns, 3+ description columns,
and a new migration for every social platform. JSONB keeps each concern
in one column.

### Why GPS stays as columns, not JSONB

Future delivery needs distance calculations:
```sql
WHERE earth_distance(ll_to_earth(latitude, longitude), ll_to_earth(?, ?)) < 5000
```
JSONB can't do numeric math. DECIMAL columns can.

### Why `tax_rate_bps = 0` instead of `tax_enabled` boolean

`rate = 0` means no tax — the boolean was redundant. One fewer column,
zero ambiguity. Basis points (integer) avoid floating-point rounding.

### Why payment methods moved to a separate table

Payment methods were originally 3 booleans, then an enum array. Both were
replaced by `tenant_payment_methods` table because each method needs:
per-tenant provider config (merchant ID, display name), enable/disable
toggle, and audit trail. See `tenant-payment-methods.md`.

### Why `session_timeout_min` was removed

Session timeout was removed because timer-based expiry is more harmful than
helpful. A beer garden customer shouldn't be timed out mid-visit. Sessions
close by: (1) bill paid → auto-close, (2) merchant manually closes, or
(3) background cleanup job for truly abandoned sessions (24h, platform-wide).

### Why `business_contacts` JSONB instead of fixed columns

Cambodia reality: shops have 2-3 phone numbers (Smart, Cellcard, Metfone),
use Messenger more than email, may or may not use Telegram. Fixed columns
(`business_email`, `business_phone`, `support_telegram`) assumed exactly 1
of each. JSONB array supports any number of any channel type.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `tenants` | Parent (1:1) | The identity this settings row belongs to |
| `tenant_operating_hours` | Sibling (both children of tenant) | Opening hours per day |
| `tenant_payment_methods` | Sibling (both children of tenant) | Payment method config (moved out of this table) |
| `orders` | Indirect consumer | `service_model`, `pay_timing`, `currency` snapshotted at creation |
| `bills` | Indirect consumer | `currency` snapshotted onto bills |
| `setup_progress` | Sibling (1:1 child of tenant) | Tracks onboarding completion |
| `menu_items` | Indirect consumer | `currency` inherited from tenant settings |
