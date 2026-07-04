# `plan_features`

| Attribute | Value |
|---|---|
| **Domain** | Platform (billing) |
| **Tenant-scoped?** | No — platform-wide |
| **Prisma model** | `PlanFeature` |
| **Mapped name** | `@@map("plan_features")` |
| **Status** | ✅ New table 2026-04-22 — see `design-discussions/pricing-strategy.md` |

---

## Part 1: Overview

`plan_features` is the sibling of `plans`. Each row is **one capability on one plan** — a number, boolean, or enum value that tells the application what the plan includes.

Example: plan Growth might have these rows:

| feature_key | value |
|---|---|
| `max_orders_per_month` | `5000` |
| `max_stores` | `5` |
| `promotions_enabled` | `true` |
| `analytics_level` | `"basic"` |

The split from `plans` is deliberate: **adding a new capability never requires altering the `plans` schema**. When Phase 2 introduces `telegram_bot_enabled`, the team inserts `plan_features` rows — no migration, no downtime.

### Where the feature vocabulary lives

The `feature_key` column is a free TEXT value, but the vocabulary of allowed keys (and their expected value types, labels, and formatters) lives in **TypeScript code**, not in the database:

```typescript
// xfos/contracts/enums/plan-features.ts
export const PLAN_FEATURES = {
  max_orders_per_month: {
    type: 'number',
    unlimited: -1,
    label: { en: 'Monthly orders', km: 'ការបញ្ជាទិញប្រចាំខែ' },
  },
  max_stores: {
    type: 'number',
    unlimited: -1,
    label: { en: 'Stores', km: 'ហាង' },
  },
  promotions_enabled: {
    type: 'boolean',
    label: { en: 'Promotions', km: 'ការផ្សព្វផ្សាយ' },
  },
  analytics_level: {
    type: 'enum',
    values: ['none', 'basic', 'advanced'],
    label: { en: 'Analytics', km: 'វិភាគ' },
  },
} as const;

export type FeatureKey = keyof typeof PLAN_FEATURES;
```

Why TS and not a `plan_feature_definitions` table?

- **Zero migrations to iterate on the feature set.** Pre-code / design-phase is exactly when the vocabulary is unstable.
- **TypeScript unions** give compile-time typo safety (`planFeatures.promotinsEnabled` fails `tsc`).
- **Bilingual labels co-locate with the app code that renders them** — one source of truth per feature.
- When the platform matures and non-TS clients need to read feature metadata, a definitions table can be added **additively** without reshaping `plan_features`.

### Value storage — JSONB, not typed sidecars

`value` is `JSONB NOT NULL`. A number is stored as a JSON number (`500`), a boolean as JSON boolean (`true`), a string enum as JSON string (`"basic"`). This keeps the table narrow (one value column, not four), preserves the native type at the DB level (Postgres's `jsonb_typeof` returns `'number'`, `'boolean'`, `'string'` correctly), and stays open to future composite values (arrays, objects) without schema changes.

---

## Part 2: CREATE TABLE

```sql
CREATE TABLE plan_features (
  id            TEXT PRIMARY KEY,
  plan_id       TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  feature_key   TEXT NOT NULL,                          -- vocabulary lives in TS, not DB
  value         JSONB NOT NULL,                         -- native type preserved (number/bool/string/...)
  display_order INTEGER NOT NULL DEFAULT 0,             -- sort order on pricing page feature list
  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (plan_id, feature_key)
);

CREATE INDEX ON plan_features (plan_id);
```

---

## Part 3: Column-by-Column

### `id` -- TEXT PRIMARY KEY

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** `cuid()` (application-generated)
- **Purpose:** Surrogate primary key.
- **Constraints:** Primary key.
- **Why it exists:** Platform convention. `(plan_id, feature_key)` is already unique, but a single-column PK is easier for Prisma and audit logs.

### `plan_id` -- TEXT NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** Which plan this feature belongs to.
- **Constraints:** `NOT NULL`, `REFERENCES plans(id) ON DELETE CASCADE`.
- **Why it exists:** The 1:N parent link. Cascade delete means retiring a plan row also removes its feature rows — in practice plans are deactivated rather than deleted, so this cascade rarely fires, but is safe by construction.

### `feature_key` -- TEXT NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** The capability name. Examples: `'max_orders_per_month'`, `'max_stores'`, `'promotions_enabled'`, `'analytics_level'`, `'scv_enabled'`, `'rbac_level'`, `'api_access_enabled'`.
- **Constraints:** `NOT NULL`, part of `UNIQUE (plan_id, feature_key)`.
- **Why it exists:** The handle the application reads to gate behavior. It is TEXT (not an enum, not a FK to a definitions table) so the team can add new keys without migrations. Safety is enforced at the TypeScript layer:
  ```typescript
  const feature = planFeatures.get('max_orders_per_month' satisfies FeatureKey);
  ```

### `value` -- JSONB NOT NULL

- **Type:** `JSONB`
- **Nullable:** No
- **Default:** None
- **Purpose:** The feature's value. Stored as whatever JSON type is natural:
  - Numbers for limits: `500`, `1`, `-1` (convention: `-1` = unlimited)
  - Booleans for flags: `true`, `false`
  - Strings for enums: `"basic"`, `"advanced"`
  - Future: arrays, objects if a feature needs structured config
- **Constraints:** `NOT NULL`. Optional future hardening: `CHECK (jsonb_typeof(value) IN ('number', 'boolean', 'string'))`.
- **Why it exists:** One column for every value type avoids the "3 of 4 sidecar columns are always NULL" problem. The app reads the JSON type that matches the feature's TypeScript catalog entry — mismatches (e.g. a `number`-typed feature with a `boolean` value) are caught at runtime by the feature loader, not lost in string parsing.

### `display_order` -- INTEGER NOT NULL DEFAULT 0

- **Type:** `INTEGER`
- **Nullable:** No
- **Default:** `0`
- **Purpose:** Sort order when rendering a plan's feature list on the pricing page. Lower values render first.
- **Constraints:** `NOT NULL`.
- **Why it exists:** The TypeScript catalog order gives a default, but `display_order` lets platform admin reorder per-plan without code changes (e.g. Pro might want to lead with "Unlimited stores" while Growth leads with "Monthly orders").

### `created_at` -- TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** `CURRENT_TIMESTAMP`
- **Purpose:** When this feature row was created. Useful for audit/"when was X added to this plan".
- **Constraints:** `NOT NULL`.

---

## Part 4: Indexes

### Primary key index on `id`

- **Implicit:** Yes. Rarely queried directly.

### Unique composite on `(plan_id, feature_key)`

- **Implicit:** Yes (from `UNIQUE`).
- **Query served:** Direct lookup of one feature on one plan — used internally by the app's feature loader.
- **Also prevents:** A plan having two conflicting values for the same feature.

### Index on `plan_id`

- **Purpose:** Primary read path — load all features for a given plan, which is what the feature loader does on every request that needs plan gating.
- **Example:**
  ```sql
  SELECT feature_key, value
  FROM   plan_features
  WHERE  plan_id = 'plan_starter'
  ORDER BY display_order;
  ```

---

## Part 5: Relationships

### Outgoing FK

| Target table | FK column | Cascade | Why |
|---|---|---|---|
| `plans` | `plan_id` | `ON DELETE CASCADE` | Features are meaningless without the plan — but in practice plans are deactivated, not deleted |

### Incoming references

None. `plan_features` is a leaf node.

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Seed feature rows for all three plans

Runs after `plans` are seeded (see `tables/plans.md` Scenario 1). Features marked `-1` mean "unlimited"; `false`/`"none"` mean the plan does not include that capability.

```sql
-- STARTER
INSERT INTO plan_features (plan_id, feature_key, value, display_order) VALUES
  ('plan_starter', 'max_orders_per_month',       '500'::jsonb,       10),
  ('plan_starter', 'max_stores',                 '1'::jsonb,         20),
  ('plan_starter', 'promotions_enabled',         'false'::jsonb,     30),
  ('plan_starter', 'analytics_level',            '"none"'::jsonb,    40),
  ('plan_starter', 'scv_enabled',                'false'::jsonb,     50),
  ('plan_starter', 'marketing_automation_level', '"none"'::jsonb,    60),
  ('plan_starter', 'api_access_enabled',         'false'::jsonb,     70),
  ('plan_starter', 'rbac_level',                 '"none"'::jsonb,    80),
  ('plan_starter', 'support_level',              '"standard"'::jsonb, 90);

-- GROWTH (seeded but not yet public; features still being finalized)
INSERT INTO plan_features (plan_id, feature_key, value, display_order) VALUES
  ('plan_growth', 'max_orders_per_month',        '5000'::jsonb,      10),
  ('plan_growth', 'max_stores',                  '5'::jsonb,         20),
  ('plan_growth', 'promotions_enabled',          'true'::jsonb,      30),
  ('plan_growth', 'analytics_level',             '"basic"'::jsonb,   40),
  ('plan_growth', 'scv_enabled',                 'false'::jsonb,     50),
  ('plan_growth', 'marketing_automation_level',  '"basic"'::jsonb,   60),
  ('plan_growth', 'api_access_enabled',          'false'::jsonb,     70),
  ('plan_growth', 'rbac_level',                  '"basic"'::jsonb,   80),
  ('plan_growth', 'support_level',               '"priority_telegram_km"'::jsonb, 90);

-- PRO (seeded but not yet public)
INSERT INTO plan_features (plan_id, feature_key, value, display_order) VALUES
  ('plan_pro', 'max_orders_per_month',       '-1'::jsonb,         10),  -- unlimited
  ('plan_pro', 'max_stores',                 '-1'::jsonb,         20),  -- unlimited
  ('plan_pro', 'promotions_enabled',         'true'::jsonb,       30),
  ('plan_pro', 'analytics_level',            '"advanced"'::jsonb, 40),
  ('plan_pro', 'scv_enabled',                'true'::jsonb,       50),
  ('plan_pro', 'marketing_automation_level', '"advanced"'::jsonb, 60),
  ('plan_pro', 'api_access_enabled',         'true'::jsonb,       70),
  ('plan_pro', 'rbac_level',                 '"advanced"'::jsonb, 80),
  ('plan_pro', 'support_level',              '"priority_telegram_km"'::jsonb, 90);
```

### Scenario 2: Adding a new feature in Phase 2 (no migration)

The team decides to introduce Telegram bot integration. Steps:

1. Add `telegram_bot_enabled` to `xfos/contracts/enums/plan-features.ts`. TypeScript compile succeeds because the new key is now in the union.
2. Insert rows — one `UPDATE`-style bulk insert, no schema change:
   ```sql
   INSERT INTO plan_features (plan_id, feature_key, value, display_order) VALUES
     ('plan_starter', 'telegram_bot_enabled', 'false'::jsonb, 100),
     ('plan_growth',  'telegram_bot_enabled', 'true'::jsonb,  100),
     ('plan_pro',     'telegram_bot_enabled', 'true'::jsonb,  100);
   ```
3. Deploy. App now reads the new feature via the same loader it uses for every other feature.

### Scenario 3: Application reads a tenant's features at request time

Pseudocode for the feature loader (runs once at login, result cached in request context):

```typescript
async function loadFeaturesForTenant(tenantId: string): Promise<ResolvedFeatures> {
  const subscription = await db.subscription.findActive(tenantId);
  const rawFeatures  = await db.planFeature.findManyByPlan(subscription.planId);

  const resolved: Partial<ResolvedFeatures> = {};
  for (const row of rawFeatures) {
    const def = PLAN_FEATURES[row.feature_key as FeatureKey];
    if (!def) continue;                          // unknown key → ignore, log warning
    resolved[row.feature_key] = row.value;       // JSONB → native JS type
  }
  return resolved as ResolvedFeatures;
}
```

Gating in a use case:

```typescript
if (!features.promotions_enabled) throw new ForbiddenException('Promotions not in plan');
if (orderCount >= features.max_orders_per_month && features.max_orders_per_month !== -1) {
  throw new QuotaExceededException();
}
```

### Scenario 4: Platform admin adjusts one plan's limit

The team wants to bump Growth's monthly order cap from 5,000 to 10,000 based on usage data:

```sql
UPDATE plan_features
SET    value = '10000'::jsonb
WHERE  plan_id = 'plan_growth' AND feature_key = 'max_orders_per_month';
```

All Growth tenants see the new limit on their next request. No redeploy.

---

## Part 7: Design Decisions

### Why one generic `value JSONB` instead of typed sidecars

The alternative is `value_type TEXT + value_int INTEGER + value_bool BOOLEAN + value_text TEXT`. That design has DB-layer typing but:

- **3 of 4 value columns are always NULL** for every row — visual noise and wasted space.
- **Adding a new type** (decimal, array, object) requires a migration.
- **Same-concept inconsistency** — enums live in `value_text`, booleans in `value_bool`. The app still has to switch on `value_type` to read the right column.

JSONB preserves the native type (`jsonb_typeof` returns the right thing), handles future composite values without schema change, and keeps the table narrow. Stricter DB-layer typing can be added later with a CHECK constraint if proven necessary.

### Why no FK on `feature_key` to a definitions table

The critic version proposed `feature_key TEXT NOT NULL REFERENCES plan_feature_definitions(key)`. That gives DB-level vocabulary enforcement but costs a migration for every new feature. Pre-code / design-phase is when the vocabulary is most volatile; migration friction here directly slows iteration.

TypeScript unions give **equivalent compile-time safety** for the app (which is the only consumer today) without the migration cost. If non-TS clients ever need to enumerate valid keys, a definitions table becomes an additive change — no reshape needed.

### Why plan-level display order (not just catalog order)

The TS catalog gives a natural default order ("max_orders_per_month appears before promotions_enabled"), but different plans may want to lead with different features. Growth might feature its order volume; Pro might feature unlimited stores. `display_order` per row makes that a data tweak, not a code change.

### Why `UNIQUE (plan_id, feature_key)` and not `PRIMARY KEY (plan_id, feature_key)`

A single-column surrogate PK (`id`) plays better with Prisma and matches the rest of the schema's convention. The `UNIQUE` constraint gives the same integrity guarantee as a composite PK.

### Why no `updated_at`

Rows are edited rarely (pricing/limit adjustments) and their audit trail is best captured at the change-event level (an `audit_logs` row emitted by the admin action). Adding `updated_at` wouldn't tell a reader which column changed; the audit log does.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `plans` | Parent (1:N) | The plan these features belong to |
| `subscriptions` | Indirect via `plans` | A tenant's plan determines which feature rows gate their requests |
| `tenants` | Indirect via `subscriptions` | The gated party |
