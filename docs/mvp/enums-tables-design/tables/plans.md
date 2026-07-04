# `plans`

| Attribute | Value |
|---|---|
| **Domain** | Platform (billing) |
| **Tenant-scoped?** | No — platform-wide catalog |
| **Prisma model** | `Plan` |
| **Mapped name** | `@@map("plans")` |
| **Status** | ✅ Redesigned 2026-04-22 — see `design-discussions/pricing-strategy.md` |

---

## Part 1: Overview

The `plans` table is the platform-level catalog of subscription tiers available to tenants. It defines what pricing plans exist on XFOS (Starter, Growth, Pro — with room to add more over time). Each row is one plan, with bilingual display copy (English + Khmer), price, billing interval, and two lifecycle flags.

This table holds **only identity and presentation** for a plan. What a plan *includes* — limits, feature flags, capability levels — lives in the sibling `plan_features` table (1:N). This split means adding or changing features never requires altering the `plans` schema.

### Two deliberately separate lifecycle flags

- **`is_active`** — can the plan accept subscriptions? Retiring a plan means setting this to `FALSE`.
- **`is_public`** — is the plan visible in the merchant signup UI? A plan can be active but hidden (platform admin can assign manually for trials, early partners, enterprise deals).

This is the mechanism behind the **Phase 1 rollout strategy** (see `pricing-strategy.md`): all 3 plans exist in the DB as active, but only one (`STARTER`) is public. The other two flip to public with a single `UPDATE` when the team is ready.

### Bilingual display

Plan names, taglines, and optional "Most Popular" highlight labels are stored as paired `_en` / `_km` columns. This matches the pattern set by `tenants.name_en` / `tenants.name_km` — each plan has exactly one name in at most two locales, so two columns are simpler than a translation table.

### Why `code` is TEXT, not a Postgres enum

Plan codes are **catalog identifiers**, not application state. The app never branches on `if (plan.code === 'STARTER')` — it reads behavior from `plan_features` rows. Making `code` an enum would force a schema migration to add or retire a plan (Postgres enums cannot remove values without dropping and recreating the type). As TEXT + UNIQUE, plans evolve via `INSERT` / `UPDATE` alone. Compile-time safety for the app lives in a TypeScript constant (`xfos/contracts/enums/plan-codes.ts`), not in the database.

At MVP, subscriptions are **stubbed**: plans exist and tenants can be assigned to one, but there is no enforcement — no feature gating, no automated billing, no dunning. The table is in the schema now so later activation is additive, not disruptive.

---

## Part 2: CREATE TABLE

```sql
CREATE TABLE plans (
  id                  TEXT PRIMARY KEY,
  code                TEXT UNIQUE NOT NULL,             -- 'STARTER' | 'GROWTH' | 'PRO'

  -- Bilingual display
  name_en             TEXT NOT NULL,
  name_km             TEXT NOT NULL,
  tagline_en          TEXT,
  tagline_km          TEXT,
  highlight_label_en  TEXT,                             -- e.g. 'Most Popular'
  highlight_label_km  TEXT,

  -- Pricing
  price_cents         INTEGER,                          -- NULL = custom / contact sales
  currency            "Currency" NOT NULL DEFAULT 'USD',
  billing_interval    TEXT NOT NULL DEFAULT 'MONTHLY',  -- 'MONTHLY' | 'ANNUAL' | 'ONE_TIME'

  -- Lifecycle (two flags, deliberately split — see Part 7)
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,    -- accepting subscriptions?
  is_public           BOOLEAN NOT NULL DEFAULT FALSE,   -- visible in merchant signup UI?

  -- Presentation
  display_order       INTEGER NOT NULL DEFAULT 0,       -- sort order on the pricing page

  created_at          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP(3) NOT NULL
);

-- Partial index for the merchant-facing pricing page
CREATE INDEX idx_plans_public
  ON plans (display_order)
  WHERE is_public = TRUE AND is_active = TRUE;
```

---

## Part 3: Column-by-Column

### `id` -- TEXT PRIMARY KEY

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** `cuid()` (application-generated)
- **Purpose:** Internal identifier.
- **Constraints:** Primary key.
- **Why it exists:** Referenced by `subscriptions.plan_id` and `plan_features.plan_id`. Follows the cuid convention used across the schema.

### `code` -- TEXT UNIQUE NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** Stable machine-readable identifier. Examples: `'STARTER'`, `'GROWTH'`, `'PRO'`. Referenced in seeds, tests, and any surface that needs a stable handle that outlives display renames.
- **Constraints:** `UNIQUE`, `NOT NULL`.
- **Why it exists:** A human-rename-safe handle. The display `name_en` / `name_km` can change (`"Starter"` → `"Basic"`) without breaking references to `code`. Application code uses a TypeScript `PlanCode` union for compile-time safety (see Part 7).

### `name_en` -- TEXT NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** English display name (e.g. `"Starter"`, `"Growth"`, `"Pro"`).
- **Constraints:** `NOT NULL`.
- **Why it exists:** Shown on the merchant portal's pricing page and on subscription detail screens. English is required because it is the system-default language.

### `name_km` -- TEXT NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** Khmer display name (e.g. `"ផែនការចាប់ផ្តើម"`, `"ផែនការរីកចម្រើន"`, `"ផែនការប្រូ"`).
- **Constraints:** `NOT NULL`.
- **Why it exists:** XFOS is a Khmer-first platform. Merchants browsing in Khmer need to see plan names in Khmer without a fallback to English. This mirrors the inline-bilingual pattern used by `tenants.name_en` + `tenants.name_km`.

### `tagline_en` -- TEXT (nullable)

- **Type:** `TEXT`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Short English one-liner shown under the plan name on the pricing page (e.g. `"Everything a small stall needs"`, `"Built for busy restaurants"`).
- **Constraints:** None.
- **Why it exists:** Marketing copy that helps merchants self-select the right plan.

### `tagline_km` -- TEXT (nullable)

- **Type:** `TEXT`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Khmer tagline, parallel to `tagline_en`.
- **Constraints:** None.
- **Why it exists:** Same as `tagline_en`, in Khmer.

### `highlight_label_en` -- TEXT (nullable)

- **Type:** `TEXT`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Badge text rendered above a plan card (e.g. `"Most Popular"`, `"Best Value"`). `NULL` means no badge.
- **Constraints:** None.
- **Why it exists:** Marketing convention — signalling a recommended tier reduces choice paralysis. Stored rather than hardcoded because the "most popular" tier will change over time.

### `highlight_label_km` -- TEXT (nullable)

- **Type:** `TEXT`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Khmer highlight label, parallel to `highlight_label_en`.
- **Constraints:** None.

### `price_cents` -- INTEGER (nullable)

- **Type:** `INTEGER`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Plan price in the smallest unit of `currency`. `NULL` means custom/negotiated (e.g. Enterprise, contact sales). `0` means explicitly free. `1999` means $19.99 (or 19.99 in whatever `currency` is set).
- **Constraints:** `CHECK (price_cents IS NULL OR price_cents >= 0)` (added by hardening migration).
- **Why it exists:** The `NULL` vs `0` distinction is deliberate: `NULL` triggers a "contact sales" flow in the UI; `0` triggers a "free, no charge" flow. **Name is currency-agnostic** (`price_cents`, not `price_usd_cents`) so the same schema supports plans priced in USD today and KHR / JPY later without column renames.

### `currency` -- "Currency" NOT NULL DEFAULT 'USD'

- **Type:** `"Currency"` enum (`'USD'`, `'KHR'`)
- **Nullable:** No
- **Default:** `'USD'`
- **Purpose:** Currency for `price_cents`. USD is the MVP default (XFOS bills merchants in USD).
- **Constraints:** `NOT NULL`.
- **Why it exists:** Future multi-currency support. Adding a KHR-priced plan is as simple as `INSERT INTO plans (..., currency) VALUES (..., 'KHR')` — no schema change.

### `billing_interval` -- TEXT NOT NULL DEFAULT 'MONTHLY'

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** `'MONTHLY'`
- **Purpose:** Subscription cadence. Expected values: `'MONTHLY'`, `'ANNUAL'`, `'ONE_TIME'`.
- **Constraints:** `NOT NULL`. (Future hardening: `CHECK (billing_interval IN ('MONTHLY', 'ANNUAL', 'ONE_TIME'))`.)
- **Why it exists:** Cambodian SMBs may prefer annual billing to smooth seasonal cash flow. Stored as TEXT (not enum) for the same reason `code` is TEXT: adding `'QUARTERLY'` or `'BIENNIAL'` later shouldn't require a migration.

### `is_active` -- BOOLEAN NOT NULL DEFAULT TRUE

- **Type:** `BOOLEAN`
- **Nullable:** No
- **Default:** `TRUE`
- **Purpose:** Whether this plan is accepting new subscriptions. Retiring a plan means setting this to `FALSE`; existing subscriptions on it continue until their natural end.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Plans are never hard-deleted (existing subscriptions reference them). `is_active = FALSE` is the retirement mechanism.

### `is_public` -- BOOLEAN NOT NULL DEFAULT FALSE

- **Type:** `BOOLEAN`
- **Nullable:** No
- **Default:** `FALSE` — new plans are **hidden by default**, surfaced when ready.
- **Purpose:** Whether this plan appears in the merchant signup/pricing UI. A plan can be `is_active = TRUE` but `is_public = FALSE` — the platform admin can still assign it manually (trials, early partners, enterprise deals) but self-service merchants don't see it.
- **Constraints:** `NOT NULL`.
- **Why it exists:** This is the knob that implements Phase 1 — "expose only Starter, keep Growth and Pro ready in the wings." Flipping a plan to public later is a one-row `UPDATE`, not a deploy.

### `display_order` -- INTEGER NOT NULL DEFAULT 0

- **Type:** `INTEGER`
- **Nullable:** No
- **Default:** `0`
- **Purpose:** Sort order on the pricing page. Lower values render first.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Lets platform admin reorder plans without touching code. Convention: `0` for Starter, `10` for Growth, `20` for Pro — gaps leave room to insert new tiers without renumbering.

### `created_at` / `updated_at`

Standard audit columns. `updated_at` tracks when copy, pricing, or visibility was last changed.

---

## Part 4: Indexes

### Primary key index on `id`

- **Implicit:** Yes.
- **Query served:** Lookup by plan ID when loading a subscription's plan details.

### Unique index on `code`

- **Implicit:** Yes (created by `UNIQUE`).
- **Query served:** Lookup by stable plan code, used by seed scripts and by the app when it needs to resolve `'STARTER'` to a row.

### Partial index `idx_plans_public` on `(display_order) WHERE is_public = TRUE AND is_active = TRUE`

- **Purpose:** Serves the merchant-facing pricing page (and later the plan picker on signup). Only public, active plans appear — the partial filter keeps the index tiny.
- **Example query:**
  ```sql
  SELECT id, code, name_en, name_km, tagline_en, tagline_km,
         price_cents, currency, billing_interval,
         highlight_label_en, highlight_label_km
  FROM plans
  WHERE is_public = TRUE AND is_active = TRUE
  ORDER BY display_order;
  ```
- **Phase 1:** at launch this query returns 1 row (`STARTER`). At Phase 2+ it returns 3.

---

## Part 5: Relationships

### Outgoing FKs

None. `plans` is a platform-level root table.

### Incoming references

| Child table | FK column | On Delete | Why |
|---|---|---|---|
| `subscriptions` | `plan_id` | `NO ACTION` (Prisma default) | A plan cannot be deleted if subscriptions reference it; retire it with `is_active = FALSE` instead |
| `plan_features` | `plan_id` | `CASCADE` | Deleting a plan deletes its feature rows — but in practice plans are never deleted, only deactivated |

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Phase 1 seed — 3 plans exist, only Starter is public

During the first deployment, the dev seed script creates all three tiers. Only Starter is marked public so the merchant signup UI shows a single-plan picker — reducing friction and analysis paralysis at launch.

```sql
INSERT INTO plans
  (id, code, name_en, name_km, tagline_en, tagline_km,
   price_cents, currency, billing_interval,
   is_active, is_public, display_order)
VALUES
  ('plan_starter', 'STARTER', 'Starter', 'ផែនការចាប់ផ្តើម',
   'Everything a small stall needs', 'អ្វីគ្រប់យ៉ាងដែលហាងតូចត្រូវការ',
   0, 'USD', 'MONTHLY',
   TRUE, TRUE, 0),

  ('plan_growth', 'GROWTH', 'Growth', 'ផែនការរីកចម្រើន',
   'Built for busy restaurants', 'រចនាសម្រាប់ភោជនីយដ្ឋានមមាញឹក',
   NULL, 'USD', 'MONTHLY',
   TRUE, FALSE, 10),

  ('plan_pro', 'PRO', 'Pro', 'ផែនការប្រូ',
   'For multi-location brands', 'សម្រាប់ម៉ាកដែលមានទីតាំងច្រើន',
   NULL, 'USD', 'MONTHLY',
   TRUE, FALSE, 20);
```

Prices on Growth and Pro are `NULL` until pricing validation (see `pricing-strategy.md` Part 4). At Phase 1, merchants only ever see Starter on the pricing page.

### Scenario 2: Platform admin manually assigns Growth to a friendly early partner

Before Growth goes public, a Phnom Penh BBQ chain requests early access to the multi-location features. The platform admin:

```sql
INSERT INTO subscriptions (tenant_id, plan_id, status, started_at)
VALUES ('tenant_sachko_angkor', 'plan_growth', 'ACTIVE', NOW());
```

No migration, no code change, no flip to `is_public`. The tenant is now on Growth. Their plan features are resolved through `plan_features` rows for `plan_growth`.

### Scenario 3: Phase 2 — expose Growth and Pro to all merchants

After validation confirms willingness-to-pay and the feature set is settled, the team opens up the full tier structure:

```sql
UPDATE plans
SET    is_public = TRUE,
       price_cents = 1999,                  -- $19.99/mo for Growth, finalized after market survey
       highlight_label_en = 'Most Popular',
       highlight_label_km = 'ពេញនិយមបំផុត',
       updated_at = NOW()
WHERE  code = 'GROWTH';

UPDATE plans
SET    is_public = TRUE,
       price_cents = 4999,                  -- $49.99/mo for Pro
       updated_at = NOW()
WHERE  code = 'PRO';
```

The pricing page now shows three plans. No deploy required.

### Scenario 4: Retiring Starter and replacing it with "Basic"

After 18 months, the team decides to replace the free Starter with a paid Basic tier at $4.99/mo:

```sql
-- Retire old plan (existing subscriptions continue; no new subscriptions accepted)
UPDATE plans SET is_active = FALSE, is_public = FALSE WHERE code = 'STARTER';

-- Create new plan
INSERT INTO plans
  (id, code, name_en, name_km, tagline_en, tagline_km,
   price_cents, currency, billing_interval,
   is_active, is_public, display_order)
VALUES
  ('plan_basic', 'BASIC', 'Basic', 'ផែនការមូលដ្ឋាន',
   'For single-location businesses', 'សម្រាប់អាជីវកម្មទីតាំងតែមួយ',
   499, 'USD', 'MONTHLY', TRUE, TRUE, 0);

-- Seed its features (see tables/plan-features.md)
INSERT INTO plan_features (plan_id, feature_key, value) VALUES
  ('plan_basic', 'max_orders_per_month', '1000'::jsonb),
  ('plan_basic', 'max_stores',           '1'::jsonb),
  ...
```

Existing Starter subscribers keep their free tier until it expires. New merchants see Basic. Zero schema changes.

---

## Part 7: Design Decisions

### Why bilingual columns inline (not a translation table)

Each plan has exactly one name in at most two locales (`en`, `km`). A translation table would add a join and buy nothing — this is the same reasoning that drives `tenants.name_en` + `tenants.name_km`. When XFOS expands beyond Khmer + English (if ever), the design can be revisited.

### Why `code` is TEXT and not a Postgres enum

Plans are **data**, not state-machine states. The app never branches on `if (plan.code === 'STARTER')` — it reads behavior from `plan_features` rows. Compile-time safety for the app lives in a TypeScript constant:

```typescript
// xfos/contracts/enums/plan-codes.ts
export const PLAN_CODES = ['STARTER', 'GROWTH', 'PRO'] as const;
export type PlanCode = typeof PLAN_CODES[number];
```

If `code` were a Postgres enum, adding `'ENTERPRISE'` would require a migration, and retiring `'STARTER'` would be effectively impossible (Postgres cannot remove enum values without dropping and recreating the type). TEXT + UNIQUE preserves both safety and flexibility.

### Why two flags (`is_active` + `is_public`) instead of one

Conflating them would mean you cannot have "active but hidden" plans. That combination is essential for:

- **Phase 1 rollout** — Growth and Pro are ready but hidden while the team refines features.
- **Manual admin assignment** — trials, early partners, enterprise deals that live outside the self-service flow.

Merging into a single tri-state enum (`'PUBLIC' | 'HIDDEN' | 'RETIRED'`) would work but creates an enum of its own and forces a migration to add a fourth state. Two orthogonal booleans capture the same semantics with zero migration cost.

### Why `price_cents` and not `price_usd_cents`

The original design baked USD into the column name. That breaks the moment the team wants to price a plan in KHR or JPY (both raised in the pricing strategy). `price_cents` + `currency "Currency"` supports any currency already in the `Currency` enum.

### Why `billing_interval` is TEXT, not an enum

Same reasoning as `code`. The set of intervals is likely to grow (`'QUARTERLY'`, `'BIENNIAL'`). TEXT + an app-side validator avoids migrations for each new interval. A CHECK constraint can tighten later if needed.

### Why no `updated_at` on the original design — and why it's back now

The previous design treated plans as append-only ("create new, deactivate old"). In practice, plans DO get edited — to fix typos, adjust copy, change the highlight label. Adding `updated_at` makes the audit trail honest without blocking the append-preferred pattern.

### Why `is_public` defaults to `FALSE`

Opt-in visibility is safer. Nobody wants to ship a plan the marketing team hasn't reviewed because someone forgot to flip a flag. Making `TRUE` an explicit choice matches the rest of the platform's "default-safe" posture.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `plan_features` | 1:N (child) | What each plan includes — limits, feature flags, capability levels |
| `subscriptions` | 1:N (child) | Which tenants are on which plan |
| `tenants` | Indirect via `subscriptions` | The businesses subscribed |
