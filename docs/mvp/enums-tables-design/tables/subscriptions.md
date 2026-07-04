# `subscriptions`

| Attribute | Value |
|---|---|
| **Domain** | Billing |
| **Tenant-scoped?** | Yes |
| **Prisma model** | `Subscription` |
| **Mapped name** | `@@map("subscriptions")` |
| **Status** | ✅ Redesigned 2026-04-22 — aligned with `plans` / `plan_features` split; snapshot pricing; Stripe-style period + cancellation timestamps |

---

## Part 1: Overview

`subscriptions` records **which plan each tenant is on** and the lifecycle of that subscription. It is the bridge between the platform-level `plans` catalog and individual `tenants`.

### Three invariants

1. **The table is a full history.** Every period, upgrade, downgrade, renewal, or restart creates a **new row**. Nothing is edited in place for billing-relevant changes; older rows stay exactly as they were at the time they governed the tenant.
2. **At most one `ACTIVE` row per tenant at any moment.** Enforced by a partial unique index (see Part 4). Other rows for the same tenant may be `CANCELLED`, `EXPIRED`, `SUSPENDED`, etc.
3. **Pricing terms are snapshotted, not live-dereferenced.** When a subscription is created, `price_cents`, `currency`, `billing_interval`, and `plan_code` are copied onto the row. A later change to `plans.price_cents` does not retroactively alter what existing subscribers were billed.

### Snapshot vs. live data

| Concept | Where it lives | Why |
|---|---|---|
| Historical price, currency, billing interval for *this* subscription | Snapshotted on the `subscriptions` row | Grandfathering. Plan price changes must not shift the terms of existing subscribers. |
| Stable plan code for analytics / invoice references | Snapshotted (`plan_code`) | The name `STARTER` is the historical record; renaming the plan later should not rewrite old invoice history. |
| Display name (bilingual), tagline, highlight label | **Live-dereferenced via `plan_id`** | Cosmetic. If a plan display name is fixed (typo, rebrand), existing subscribers see the corrected name immediately. Invoices that need frozen display text should be captured on a future `invoices` table. |

### MVP state

Subscriptions are **stubbed**: a row may exist per tenant but there is **no enforcement** — no feature gating, no automated billing, no dunning. A tenant with any subscription status still operates normally. The schema is scaffolded now so v1.1 billing is additive, not disruptive.

See the sibling docs for the plan catalog (`tables/plans.md`), plan features (`tables/plan-features.md`), and the full state-machine rationale (`enums/subscription-status.md`).

---

## Part 2: CREATE TABLE

```sql
CREATE TABLE subscriptions (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Plan reference (for display & analytics joins)
  plan_id               TEXT NOT NULL REFERENCES plans(id),

  -- Snapshot at subscription creation (grandfathering — see Part 7)
  plan_code             TEXT NOT NULL,
  price_cents           INTEGER NOT NULL,                       -- frozen; no longer affected by plan price changes
  currency              "Currency" NOT NULL DEFAULT 'USD',
  billing_interval      TEXT NOT NULL DEFAULT 'MONTHLY',

  -- Lifecycle
  status                "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',

  -- Timeline
  started_at            TIMESTAMP(3),                           -- first activation — set once and never reset
  current_period_start  TIMESTAMP(3),                           -- start of the current billing cycle
  current_period_end    TIMESTAMP(3),                           -- end of the current billing cycle (renews each cycle)

  -- Cancellation
  cancel_at             TIMESTAMP(3),                           -- scheduled end date (access stops here)
  cancelled_at          TIMESTAMP(3),                           -- when the tenant clicked cancel (intent timestamp)

  created_at            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP(3) NOT NULL
);

-- Primary lookup — "what's the subscription history for this tenant?"
CREATE INDEX ON subscriptions (tenant_id);

-- Enforce one-active-per-tenant (partial unique index)
CREATE UNIQUE INDEX subscriptions_one_active_per_tenant
  ON subscriptions (tenant_id)
  WHERE status = 'ACTIVE';

-- Billing dunning query (scoped to PAST_DUE only — the hot query)
CREATE INDEX subscriptions_past_due_idx
  ON subscriptions (current_period_end)
  WHERE status = 'PAST_DUE';
```

---

## Part 3: Column-by-Column

### `id` -- TEXT PRIMARY KEY

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** `cuid()` (application-generated)
- **Purpose:** Unique identifier for this subscription row.
- **Constraints:** Primary key.
- **Why it exists:** A tenant may have many subscription rows over time. Each one needs a stable handle — invoices, audit logs, webhooks reference this.

### `tenant_id` -- TEXT NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** Which tenant this subscription belongs to.
- **Constraints:** `NOT NULL`, `REFERENCES tenants(id) ON DELETE CASCADE`.
- **Why it exists:** Tenant-scoping anchor. Cascade ensures subscription rows are cleaned up on tenant deletion.

### `plan_id` -- TEXT NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** Links to the current `plans` row. Used for **live display** (bilingual name, tagline, highlight label) and for analytics joins.
- **Constraints:** `NOT NULL`, `REFERENCES plans(id)` with no cascade — plans must not be deleted while subscriptions reference them.
- **Why it exists:** The subscription references a catalog entry, not just a frozen code. Cosmetic updates to the plan (name fix, tagline rewrite) are reflected automatically.

### `plan_code` -- TEXT NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** The plan's stable machine code **at the time of subscription**. Example: `'STARTER'`, `'GROWTH'`, `'PRO'`. Snapshotted.
- **Constraints:** `NOT NULL`.
- **Why it exists:** `plans.code` is stable but not guaranteed permanent — a plan can be retired and a new plan with the same code pattern created later. Snapshotting keeps historical reporting honest ("this tenant was on STARTER in Q1 2026") even if the current `plans.code` values drift. Used by invoices, analytics, and any audit query that needs a name-independent handle.

### `price_cents` -- INTEGER NOT NULL

- **Type:** `INTEGER`
- **Nullable:** **No** (unlike `plans.price_cents`).
- **Default:** None
- **Purpose:** The price agreed for this subscription period, in the smallest unit of `currency`.
- **Constraints:** `NOT NULL`, `CHECK (price_cents >= 0)` (add via hardening).
- **Why it exists:** The grandfathering mechanism. Once a subscription exists, a price has been agreed — even for "contact sales" plans where `plans.price_cents IS NULL`, the negotiated price becomes concrete on the subscription row. Subsequent changes to `plans.price_cents` do not alter existing subscriptions' billing.

### `currency` -- "Currency" NOT NULL DEFAULT 'USD'

- **Type:** `"Currency"` enum (`'USD'`, `'KHR'`)
- **Nullable:** No
- **Default:** `'USD'`
- **Purpose:** Currency for `price_cents`. Snapshotted at subscription creation.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Same grandfathering rationale as `price_cents`. If the platform later introduces KHR-denominated plans, existing USD subscribers keep their USD terms.

### `billing_interval` -- TEXT NOT NULL DEFAULT 'MONTHLY'

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** `'MONTHLY'`
- **Purpose:** How often the subscription renews — `'MONTHLY'`, `'ANNUAL'`, `'ONE_TIME'`. Snapshotted.
- **Constraints:** `NOT NULL`.
- **Why it exists:** The tenant signed up for a specific cadence; changing the plan's cadence upstream must not silently reshape this tenant's billing cycle.

### `status` -- "SubscriptionStatus" NOT NULL DEFAULT 'PENDING'

- **Type:** `SubscriptionStatus` enum
- **Nullable:** No
- **Default:** `'PENDING'`
- **Purpose:** Current lifecycle state. Values: `PENDING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED`, `EXPIRED`.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Drives billing logic and future feature gating. Full state-machine description lives in `enums/subscription-status.md`.

### `started_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** When the subscription first became `ACTIVE`. Set once; never reset on renewal.
- **Constraints:** None beyond type.
- **Why it exists:** Historical anchor for this subscription's lifetime. Used for "how long has this tenant been on this plan?" reports. Contrast with `current_period_start`, which resets every renewal.

### `current_period_start` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Start of the **current** billing cycle. Resets on each renewal (monthly plans: bumps forward one month).
- **Constraints:** None beyond type.
- **Why it exists:** Stripe-style billing cycle tracking. Invoicing logic uses `current_period_start` and `current_period_end` to compute "what period is this invoice for?".

### `current_period_end` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** End of the current billing cycle. When `status = 'ACTIVE'` and `current_period_end < NOW()`, the billing job should either renew (success) or transition the row to `PAST_DUE` (failure).
- **Constraints:** None beyond type.
- **Why it exists:** The renewal deadline. Also the source for the partial `subscriptions_past_due_idx` index — the platform admin queries "which PAST_DUE subscriptions are closest to suspension?" by ordering on this column.

### `cancel_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** **Scheduled** cancellation date — the moment the subscription will actually end. Typically set equal to `current_period_end` when a tenant cancels ("cancel at end of current period"). `NULL` means no cancellation is scheduled.
- **Constraints:** None beyond type.
- **Why it exists:** Separates intent from effect. A tenant cancels on day 5 of a 30-day period; they retain access for the remaining 25 days because `cancel_at = current_period_end` is ~25 days in the future. The billing job transitions `status` from `CANCELLED` to `EXPIRED` when `NOW() >= cancel_at`.

### `cancelled_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** **Intent** timestamp — when the tenant clicked "cancel" (or the platform admin cancelled on their behalf). `NULL` means no cancellation has been requested.
- **Constraints:** None beyond type.
- **Why it exists:** Audit / customer support. Together with `cancel_at`, the pair answers both "when did they cancel?" and "when does access end?" — which are different questions.

### `created_at` -- TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** `CURRENT_TIMESTAMP`
- **Purpose:** When the subscription row was created. Can predate `started_at` for scheduled-start subscriptions.
- **Constraints:** `NOT NULL`.

### `updated_at` -- TIMESTAMP(3) NOT NULL

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** Managed by Prisma `@updatedAt`
- **Purpose:** Last modification timestamp.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Audit. Updated on every status transition and on period renewal.

---

## Part 4: Indexes

### Index on `tenant_id`

- **Implicit:** No — explicit `CREATE INDEX`.
- **Query served:** Most common read. "What is this tenant's current subscription?" and "What is this tenant's subscription history?".
- **Example (current active subscription):**
  ```sql
  SELECT * FROM subscriptions
  WHERE tenant_id = 'clx8...' AND status = 'ACTIVE';
  ```

### Partial unique index `subscriptions_one_active_per_tenant`

- **Definition:** `UNIQUE ON subscriptions (tenant_id) WHERE status = 'ACTIVE'`
- **Purpose:** Enforces invariant #2 at the database level — at most one active subscription per tenant. Any attempt to insert a second ACTIVE row for the same tenant fails with a unique constraint violation.
- **Why partial:** We need uniqueness only on ACTIVE rows; multiple CANCELLED / EXPIRED / PAST_DUE rows per tenant are legal (full history). A full unique index would forbid that.

### Partial index `subscriptions_past_due_idx`

- **Definition:** `ON subscriptions (current_period_end) WHERE status = 'PAST_DUE'`
- **Purpose:** Platform admin / dunning job query — "list all PAST_DUE subscriptions, ordered by how long they've been past due."
- **Example:**
  ```sql
  SELECT s.*, t.name_en, t.name_km
  FROM   subscriptions s
  JOIN   tenants t ON t.id = s.tenant_id
  WHERE  s.status = 'PAST_DUE'
  ORDER BY s.current_period_end;
  ```
- **Why partial:** `PAST_DUE` is rare in steady state. A full `(status)` index would be 95%+ ACTIVE entries, wasted space. The partial index stays tiny and hot.

### Primary key index on `id`

- Implicit.

---

## Part 5: Relationships

### Outgoing FKs

| Target table | FK column | Cascade | Why |
|---|---|---|---|
| `tenants` | `tenant_id` | `ON DELETE CASCADE` | Subscription is meaningless without the tenant |
| `plans` | `plan_id` | No cascade (Prisma default: `NO ACTION`) | A plan with active subscriptions cannot be deleted; deactivate it via `plans.is_active = FALSE` instead |

### Incoming references

None at MVP — `subscriptions` is a leaf. **Future billing infrastructure will reference this table:**

- `invoices` (planned v1.1) — each invoice points back to the subscription that generated it.
- `billing_events` / `dunning_attempts` (planned v1.1) — retry history for failed payments.
- `subscription_payment_methods` (planned) — link a subscription to a specific card/account on file.

Schema is ready for these additive changes.

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: New tenant signup (MVP behavior)

At MVP, `CreateTenantUseCase` **does not** automatically create a subscription row — billing is stubbed. A platform admin may insert one manually for early tenants if needed:

```sql
INSERT INTO subscriptions
  (id, tenant_id, plan_id, plan_code,
   price_cents, currency, billing_interval, status,
   started_at, current_period_start, current_period_end,
   created_at, updated_at)
VALUES
  ('clx8sub001', 'clx8lucky001',
   (SELECT id FROM plans WHERE code = 'STARTER'),
   'STARTER',
   0, 'USD', 'MONTHLY', 'ACTIVE',
   NOW(), NOW(), NOW() + INTERVAL '1 month',
   NOW(), NOW());
```

Starter is free at MVP (`price_cents = 0`), so no billing runs. When v1.1 billing activates, auto-creation moves into `CreateTenantUseCase` as a guaranteed side-effect.

### Scenario 2: Platform admin reviews past-due subscriptions (v1.1+)

A daily BullMQ job runs:

```sql
UPDATE subscriptions
SET    status = 'PAST_DUE', updated_at = NOW()
WHERE  status = 'ACTIVE'
  AND  current_period_end < NOW();
```

Then the admin dashboard query (served by `subscriptions_past_due_idx`):

```sql
SELECT t.slug,
       COALESCE(t.name_km, t.name_en) AS display_name,
       s.plan_code,
       s.current_period_end,
       s.price_cents,
       s.currency
FROM   subscriptions s
JOIN   tenants t ON t.id = s.tenant_id
WHERE  s.status = 'PAST_DUE'
ORDER BY s.current_period_end;
```

Note: `display_name` reads `tenants.name_en` / `tenants.name_km` directly (per the tenants bilingual pattern). If the admin needs the plan's current display name, they JOIN `plans` on `s.plan_id` — the `plan_code` snapshot is for stable history, not display.

### Scenario 3a: Tenant upgrades from Starter → Growth (immediate)

Upgrade is instant — old subscription ends now, new subscription begins now. Two SQL writes in a single transaction:

```sql
BEGIN;

-- End the old subscription immediately
UPDATE subscriptions
SET    status       = 'EXPIRED',
       cancelled_at = NOW(),
       cancel_at    = NOW(),
       updated_at   = NOW()
WHERE  tenant_id = 'clx8boba001' AND status = 'ACTIVE';

-- Begin the new one — snapshot terms from the Growth plan's current state
INSERT INTO subscriptions
  (id, tenant_id, plan_id, plan_code,
   price_cents, currency, billing_interval, status,
   started_at, current_period_start, current_period_end,
   created_at, updated_at)
SELECT
  'clx8sub002', 'clx8boba001',
  p.id, p.code,
  p.price_cents, p.currency, p.billing_interval,
  'ACTIVE',
  NOW(), NOW(), NOW() + INTERVAL '1 month',
  NOW(), NOW()
FROM plans p
WHERE p.code = 'GROWTH';

COMMIT;
```

The partial unique index ensures the old row is EXPIRED before the new row becomes ACTIVE — otherwise the transaction fails cleanly. Billing logic charges the difference (or prorates) based on days remaining in the original Starter period.

### Scenario 3b: Tenant cancels (access continues until period end)

Cancellation is scheduled, not immediate. The tenant keeps access until the current period ends:

```sql
UPDATE subscriptions
SET    status       = 'CANCELLED',
       cancelled_at = NOW(),                    -- intent: now
       cancel_at    = current_period_end,       -- access stops: end of current period
       updated_at   = NOW()
WHERE  tenant_id = 'clx8boba001' AND status = 'ACTIVE';
```

A nightly job later transitions `CANCELLED` → `EXPIRED` when `NOW() >= cancel_at`. During the gap, `cancelled_at IS NOT NULL AND cancel_at > NOW()` — the merchant portal shows: *"Subscription ends in 17 days. Changed your mind? Re-activate."*

### Scenario 4: Grandfathering in action

On 2026-04-01, the platform raises the Growth plan price from $19.99 to $29.99:

```sql
UPDATE plans SET price_cents = 2999 WHERE code = 'GROWTH';
```

Existing Growth subscribers are **not affected**. Their `subscriptions.price_cents = 1999` is frozen; invoices continue at $19.99 until they cancel or upgrade. New tenants signing up for Growth after the price change snapshot `price_cents = 2999` on their subscription row.

This is the reason for the snapshot columns — see Part 7.

---

## Part 7: Design Decisions

### Why snapshot `price_cents`, `currency`, `billing_interval`, and `plan_code`

Without snapshots, a plan price change retroactively rewrites every existing subscriber's terms — a major billing surprise and a common source of production incidents. The industry-standard mitigation (Stripe, Chargebee, Paddle) is to snapshot pricing onto each subscription period at creation time. A plan is a **template**; a subscription is a **contract** that references but does not depend on the template.

`plan_code` is snapshotted for analytics and invoice history — a later rename or retirement of the plan catalog entry does not rewrite what a tenant's Q1 2026 invoice was for.

### Why NOT snapshot `plan_name_en` / `plan_name_km`

Display names are cosmetic. A typo fix, rebrand, or Khmer translation improvement should update what every subscriber sees on their billing page — including historical ones. Snapshotting display names would force an `UPDATE` across subscriptions on every cosmetic change. `plan_id` + a JOIN handles this correctly.

If frozen display text is genuinely needed for a specific artifact (e.g., a downloadable invoice PDF), that belongs on a future `invoices` table, not on `subscriptions`.

### Why `price_cents` is `NOT NULL` here (but nullable on `plans`)

On `plans`, `NULL` means "contact sales / custom pricing" — the catalog entry has no listed price. On `subscriptions`, by the time a row exists, a price has been agreed (even if negotiated). Nullable on this row would invite bugs ("what do we charge? 🤷"). Keep it tight.

### Why split `current_period_start` / `current_period_end` from `started_at`

The original design had `started_at` + `ends_at`, which conflated two concepts:

- The subscription's lifetime anchor ("when did this tenant first sign up for this plan?") — set once, never reset.
- The current billing cycle boundaries — reset on every renewal.

Stripe distinguishes `start_date` (lifetime) from `current_period_start` / `current_period_end` (cycle). Adopting the same vocabulary keeps the schema legible to anyone who's worked on SaaS billing before.

### Why split `cancel_at` from `cancelled_at`

Two distinct questions that deserve distinct columns:

- `cancelled_at` — **when** did the tenant click cancel? (intent timestamp)
- `cancel_at` — **when** will access actually end? (scheduled effect)

During the gap, the tenant has CANCELLED status but still has working features. Collapsing both into one column (as the original design did) makes it impossible to distinguish the two states cleanly.

### Why enforce "one ACTIVE per tenant" at the DB level

The invariant must hold at all times, and application-code guards are insufficient under concurrency (two simultaneous requests, two replicated workers, etc.). A partial unique index makes duplicate ACTIVE rows **impossible** — the second insert fails with a constraint violation, which the app handles as "upgrade already in progress" or similar.

### Why the table is history-bearing (many rows per tenant over time)

Plan changes, cancellations, reactivations, and renewals all create new rows. Alternatives considered:

- **Single row per tenant, updated in place.** Loses history, breaks grandfathering, loses audit trail.
- **Separate `subscription_history` table.** More tables, more joins, more complexity. Single history-bearing table is simpler.

The partial unique index gives us both: a clean "current" query (`WHERE status = 'ACTIVE'`) and a full audit trail (all rows).

### Why no TRIALING status or `trial_start` / `trial_end` columns at MVP

The `SubscriptionStatus` enum deliberately omits `TRIALING` (see `enums/subscription-status.md` Part 4). At MVP there is no trial feature. When trials are designed, the follow-up decision is whether to:

1. Add a `TRIALING` enum value and dedicated trial timestamp columns, or
2. Model trials as `PENDING` status with a `trial_end` date (less explicit).

Either is a purely additive change — zero cost to defer.

### Why `plan_id` has no cascade

A plan with active subscriptions must not be deleted — existing subscribers reference it. Retirement is via `plans.is_active = FALSE`, which allows existing subscriptions to continue but blocks new ones. The FK with no cascade enforces this at the database level.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `tenants` | Parent (N:1) | The tenant this subscription belongs to |
| `plans` | Reference (N:1, live) | Cosmetic display (name, tagline, highlight label); snapshot of pricing lives on this row |
| `plan_features` | Indirect via `plans` | Which capabilities this subscription includes (feature gating reads via the plan) |
| `invoices` (planned v1.1+) | Incoming — child (1:N) | Each invoice generated from this subscription period |
| `billing_events` (planned v1.1+) | Incoming — child (1:N) | Retry history, dunning attempts, webhook events |
