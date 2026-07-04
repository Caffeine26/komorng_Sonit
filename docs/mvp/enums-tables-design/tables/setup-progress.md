# `setup_progress`

| Attribute | Value |
|---|---|
| **Domain** | Tenant |
| **Tenant-scoped?** | Yes (1:1 with `tenants`) |
| **Prisma model** | `SetupProgress` |
| **Mapped name** | `@@map("setup_progress")` |
| **Status** | ✅ Redesigned 2026-04-21 — see `design-discussions/onboarding-status-redesign.md` |

---

## Part 1: Overview

`setup_progress` is the tenant's **onboarding checklist** — one row per tenant, tracking when each setup milestone was completed. When a new restaurant owner signs up on XFOS they need to:

1. Fill in their business profile (name, address, contact, service model, pay timing).
2. Create at least one visible menu item with a price.
3. Add Khmer (`km`) and English (`en`) translations for every menu item and category.
4. Configure at least one enabled payment method.
5. Generate at least one QR code (storefront or table-bound).

Each milestone is recorded as a **timestamp** (`*_completed_at`). When all five timestamps are non-null, the `go_live_ready` flag — a `GENERATED STORED` column — is automatically `TRUE`. The Merchant Portal's "Go Live" button gates on this flag, and the backend transitions `tenants.status` from `DRAFT` to `ACTIVE` on click.

### Two important invariants

1. **Monotonic.** Once a `*_completed_at` timestamp is set, it never goes back to `NULL`. A restaurant that finishes its profile, then later edits it, does not "lose" the milestone — the original completion timestamp stays.
2. **Onboarding-only.** This table tracks the path from signup → first go-live. Anything that *breaks* after going live (a newly-added menu item missing its Khmer translation, a payment method getting disabled) is recorded in the separate `tenant_health` table — not here.

This split removes the long-standing ambiguity of "is this row telling me the tenant is *still onboarding* or *live but degraded*?". `setup_progress` answers only the first question.

### What changed from the original design (2026-04-21)

| Aspect | Before | After |
|---|---|---|
| Step state | Boolean (`profile_complete`, etc.) | Timestamp (`profile_completed_at`, etc.) |
| `go_live_ready` | Stored boolean — application had to recompute it on every mutation | `GENERATED ALWAYS AS (... ) STORED` — derived in the database, cannot drift |
| Lifetime | Implicit (used `tenants.created_at` if asked) | Explicit `created_at` and `went_live_at` columns for funnel analytics |
| Live drift (e.g., new menu item without translation) | Same booleans flipped back to `false`, polluting the onboarding semantics | Moved to `tenant_health` |
| Consumer | Merchant Portal queried this table directly | Merchant Portal binds to `OnboardingStatusService` which composes this row + source tables into a rich DTO |

See `design-discussions/onboarding-status-redesign.md` for the full rationale.

---

## Part 2: CREATE TABLE

> **2026-04-25:** composite-PK refresh.

```sql
CREATE TABLE setup_progress (
  tenant_id                  TEXT NOT NULL,
  id                         TEXT NOT NULL,

  -- Milestone timestamps. NULL = not yet completed. Monotonic: never set back to NULL.
  profile_completed_at       TIMESTAMP(3),
  menu_completed_at          TIMESTAMP(3),
  translations_completed_at  TIMESTAMP(3),
  payments_configured_at     TIMESTAMP(3),
  qr_created_at              TIMESTAMP(3),

  -- Lifetime bookends
  created_at                 TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  went_live_at               TIMESTAMP(3),
  updated_at                 TIMESTAMP(3) NOT NULL,

  -- Derived gate. Cannot drift from its inputs.
  go_live_ready BOOLEAN NOT NULL GENERATED ALWAYS AS (
        profile_completed_at      IS NOT NULL
    AND menu_completed_at         IS NOT NULL
    AND translations_completed_at IS NOT NULL
    AND payments_configured_at    IS NOT NULL
    AND qr_created_at             IS NOT NULL
  ) STORED,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT setup_progress_one_per_tenant UNIQUE (tenant_id)
);

-- Partial index for the "stuck in onboarding" funnel query
CREATE INDEX idx_setup_progress_stuck
  ON setup_progress (created_at)
  WHERE go_live_ready = FALSE;
```

---

## Part 3: Column-by-Column

### `id` -- TEXT PRIMARY KEY

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** `cuid()` (application-generated)
- **Purpose:** Surrogate primary key.
- **Constraints:** Primary key.
- **Why it exists:** Follows the platform convention of cuid IDs on every table. `tenant_id` could serve as PK but consistency with the rest of the schema is preferred.

### `tenant_id` -- TEXT UNIQUE NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** Links this checklist to exactly one tenant.
- **Constraints:** `UNIQUE`, `NOT NULL`, `REFERENCES tenants(id) ON DELETE CASCADE`.
- **Why it exists:** Enforces the 1:1 relationship. If the tenant is deleted, the checklist is cascade-deleted.

### `profile_completed_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes — `NULL` means the step hasn't been completed yet.
- **Default:** `NULL`
- **Purpose:** When the tenant finished their business profile (name, address, contact info, service model, pay timing). All required fields must be present in `tenant_settings`.
- **Constraints:** None beyond type. Monotonic by application convention — once set, it is never updated to a different value or back to `NULL`.
- **Why it exists:** Step 1 of onboarding. Set by the `UpdateTenantSettingsUseCase` when the required fields (`service_model`, at least one tenant name, `business_phone` or `business_email`) become present for the first time. Subsequent edits do not change this column. The boolean question "is the profile done?" is `profile_completed_at IS NOT NULL`; the timestamp also enables coaching copy ("you finished your profile 3 days ago").

### `menu_completed_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes — `NULL` means the step hasn't been completed yet.
- **Default:** `NULL`
- **Purpose:** When the tenant created their first visible menu item with a price.
- **Constraints:** None beyond type. Monotonic.
- **Why it exists:** Step 2 of onboarding. Set by `CreateMenuItemUseCase` when the first menu item is persisted. A restaurant with no menu cannot accept orders. Once the first item exists, this milestone is permanent — deleting all menu items afterwards does not revert the timestamp (that's a degraded-live problem, surfaced by `tenant_health.menu_has_visible_items`).

### `translations_completed_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes — `NULL` means the step hasn't been completed yet.
- **Default:** `NULL`
- **Purpose:** When all menu items and categories first achieved full coverage in both `en` and `km` locales. Set by `TranslationCheckService` the first time the coverage check passes.
- **Constraints:** None beyond type. Monotonic.
- **Why it exists:** Step 3 of onboarding. XFOS is Khmer-first — a menu that exists only in English is incomplete for the target market. Critically, **this timestamp does NOT revert** when a new untranslated item is added later. That post-launch drift is tracked in `tenant_health.translations_healthy` (and `untranslated_item_count`). The onboarding milestone is a historical fact ("the tenant has demonstrated they can produce a fully-translated menu"); the live drift is a current state.

### `payments_configured_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes — `NULL` means the step hasn't been completed yet.
- **Default:** `NULL`
- **Purpose:** When the tenant first had at least one enabled payment method.
- **Constraints:** None beyond type. Monotonic.
- **Why it exists:** Step 4 of onboarding. Cash is enabled by default on `tenant_settings`, so this is typically set at tenant-creation time. If a tenant explicitly disables every payment method post-launch (unusual), the onboarding milestone stays — but `tenant_health.payments_healthy` flips to `FALSE` and the merchant portal warns them.

### `qr_created_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes — `NULL` means the step hasn't been completed yet.
- **Default:** `NULL`
- **Purpose:** When the tenant generated their first QR code (first row in `qr_contexts`).
- **Constraints:** None beyond type. Monotonic.
- **Why it exists:** Step 5 of onboarding. Without a QR code, customers cannot find the storefront. Set by `CreateQrContextUseCase` on the first QR generation.

### `created_at` -- TIMESTAMP(3) NOT NULL DEFAULT NOW()

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** `NOW()` (Postgres-side)
- **Purpose:** When the checklist was created — effectively the moment the tenant signed up, since this row is created by the same use case that creates the tenant.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Funnel analytics. Without it, "median time from signup to go-live" requires a join to `tenants.created_at`. Storing it locally makes single-table queries possible and avoids a hot path on the tenants table.

### `went_live_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes — `NULL` until the tenant transitions `DRAFT` → `ACTIVE`.
- **Default:** `NULL`
- **Purpose:** When the tenant first went live.
- **Constraints:** None beyond type. Set exactly once.
- **Why it exists:** Closes the funnel. Powers metrics like "time-to-live by week", "median time-to-live by service model", and "% of tenants that ever go live within 7 days of signup". Set by `GoLiveUseCase` at the same moment it transitions `tenants.status` from `DRAFT` to `ACTIVE`.

### `updated_at` -- TIMESTAMP(3) NOT NULL

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** Managed by Prisma `@updatedAt`
- **Purpose:** Last modification timestamp.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Standard audit field. Useful for tracking when the last onboarding step was completed (for "active onboarding" dashboards).

### `go_live_ready` -- BOOLEAN NOT NULL GENERATED STORED

- **Type:** `BOOLEAN`
- **Nullable:** No
- **Default:** Computed (`FALSE` for a brand-new tenant since all milestone timestamps are `NULL`).
- **Purpose:** Whether all five onboarding milestones are complete and the tenant is ready to go live.
- **Constraints:** `NOT NULL`. **Cannot be written by application code** — Postgres rejects any `INSERT`/`UPDATE` that targets this column. The value is recomputed automatically every time any input column changes.
- **Why it exists:** This is the gate the Merchant Portal's "Go Live" button checks. Making it `GENERATED ALWAYS AS (...) STORED` means:
  - No application code path can leave it inconsistent with its inputs.
  - Indexes can be built on it (the `idx_setup_progress_stuck` partial index uses it).
  - The platform admin can query "stuck" tenants without running app logic.
  - The cost is one extra column write per row update, paid by the database — negligible at MVP scale.

---

## Part 4: Indexes

### Unique index on `tenant_id`

- **Implicit:** Yes (created by `UNIQUE`)
- **Query served:** Every setup-progress lookup, since the Merchant Portal loads this by tenant ID.
- **Example:**
  ```sql
  SELECT * FROM setup_progress WHERE tenant_id = 'clx8k9m2n0001vq...';
  ```

### Primary key index on `id`

- **Implicit:** Yes (created by `PRIMARY KEY`)
- **Query served:** Direct row lookup by ID (rare).

### Partial index `idx_setup_progress_stuck` on `(created_at) WHERE go_live_ready = FALSE`

- **Purpose:** Powers the platform admin's "stuck in onboarding" funnel query. The vast majority of rows are `go_live_ready = TRUE` once tenants launch, so the partial filter keeps the index tiny and hot.
- **Query served:**
  ```sql
  SELECT tenant_id, created_at
  FROM   setup_progress
  WHERE  go_live_ready = FALSE
    AND  created_at < NOW() - INTERVAL '7 days'
  ORDER BY created_at;
  ```
- **Why a partial index, not a full one:** Once `go_live_ready` is `TRUE` for a tenant, we never need to scan them in the funnel report. A full index on `go_live_ready` would store an entry for every live tenant — pure waste.

---

## Part 5: Relationships

### Outgoing FK

| Target table | FK column | Cascade | Why |
|---|---|---|---|
| `tenants` | `tenant_id` | `ON DELETE CASCADE` | Checklist is meaningless without the tenant |

### Incoming references

No other table references `setup_progress`. It is a leaf node in the schema graph. The sibling `tenant_health` table also references `tenants` directly, not this table — they are peers, not parent/child.

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: New stall owner works through onboarding

Dara registers "Phnom Penh Fried Rice" (បាយឆាភ្នំពេញ) on XFOS at 2026-04-21 09:14:03. Same use case creates his `setup_progress` row:

| Column | Value |
|---|---|
| `created_at` | `2026-04-21 09:14:03` |
| `profile_completed_at` | `NULL` |
| `menu_completed_at` | `NULL` |
| `translations_completed_at` | `NULL` |
| `payments_configured_at` | `2026-04-21 09:14:03` (cash is enabled by default — `tenant_settings.cash_enabled = true`) |
| `qr_created_at` | `NULL` |
| `went_live_at` | `NULL` |
| `go_live_ready` | `FALSE` (computed) |

The Merchant Portal renders a 1/5 progress bar via `OnboardingStatusService`. Dara fills in his profile — `UpdateTenantSettingsUseCase` sets `profile_completed_at = 2026-04-21 09:31:48`. He adds three menu items (`menu_completed_at` set), each with both Khmer and English (`translations_completed_at` set). He generates a QR code (`qr_created_at` set).

Now all five milestone timestamps are non-null. Postgres recomputes `go_live_ready = TRUE` automatically. The "Go Live" button becomes clickable. Dara taps it; `GoLiveUseCase`:

1. Sets `went_live_at = NOW()` on `setup_progress`.
2. Transitions `tenants.status` from `DRAFT` to `ACTIVE`.
3. Creates the `tenant_health` row with all flags `TRUE`.

### Scenario 2: Merchant adds a new untranslated menu item (drift, not regression)

"Boba Queen" went live on 2026-03-15 — `setup_progress.went_live_at = '2026-03-15 17:42:00'`, all milestone timestamps set, `go_live_ready = TRUE`. The manager adds "Taro Milk Tea" in English only.

**What does NOT happen:** `translations_completed_at` is **not** reset to `NULL`. The onboarding milestone is preserved as a historical fact.

**What does happen:** `TranslationCheckService` updates `tenant_health`:
- `translations_healthy = FALSE`
- `translations_broken_at = NOW()`
- `untranslated_item_count = 1`

The Merchant Portal fetches `OnboardingStatusService` which returns `phase = 'live_with_issues'` and a `liveIssues` entry pointing to the broken item. The portal shows a warning banner — not the onboarding tutorial.

This split is the entire reason for the redesign: the manager is being shown a *warning*, not a *checklist*, because the system can tell the difference.

### Scenario 3: Platform admin checks the onboarding funnel

A platform operator wants to know who's stuck and why:

```sql
SELECT
  COUNT(*) FILTER (WHERE go_live_ready = false)                         AS stuck,
  COUNT(*) FILTER (WHERE go_live_ready = true)                          AS launched,
  COUNT(*) FILTER (WHERE profile_completed_at      IS NULL)             AS missing_profile,
  COUNT(*) FILTER (WHERE menu_completed_at         IS NULL)             AS missing_menu,
  COUNT(*) FILTER (WHERE translations_completed_at IS NULL)             AS missing_translations,
  COUNT(*) FILTER (WHERE qr_created_at             IS NULL)             AS missing_qr,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '14 days'
                     AND go_live_ready = false)                         AS stalled_2wk
FROM setup_progress;
```

Plus the time-to-live distribution that wasn't possible before:

```sql
SELECT
  date_trunc('week', created_at)                                              AS signup_week,
  COUNT(*)                                                                    AS signups,
  COUNT(went_live_at)                                                         AS launched,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY went_live_at - created_at)      AS median_ttl,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY went_live_at - created_at)      AS p90_ttl
FROM setup_progress
WHERE created_at >= NOW() - INTERVAL '12 weeks'
GROUP BY 1
ORDER BY 1;
```

### Scenario 4: Coaching copy in the Merchant Portal

Three days after Dara completes his profile but stalls on the menu, the portal greets him with: *"Great job — you finished your business profile 3 days ago. Just 2 steps left to go live: add at least one menu item, and generate a QR code."*

That copy is rendered from `profile_completed_at` and the diff between completed and remaining milestones — both surfaced through `OnboardingStatusService`. None of this was possible with booleans.

---

## Part 7: Design Decisions

### Why timestamps instead of booleans

A timestamp `IS NOT NULL` carries the same boolean signal but **also** records the moment. With one column we get: the gate (`IS NOT NULL`), the coaching copy ("you finished your profile 3 days ago"), and the funnel analytics (median time-to-live). Booleans throw two-thirds of that away.

### Why `go_live_ready` is GENERATED, not application-computed

The original design required every mutation path to remember to recompute and write `go_live_ready`. One missed update and the database lies — the Merchant Portal happily shows a stuck "Go Live" button to a tenant who actually has every milestone done. Making it `GENERATED ALWAYS AS (...) STORED` makes that drift impossible: the database recomputes from inputs on every write to the row, and Postgres rejects any direct write to the column. There is one source of truth, enforced at the storage layer.

### Why this table is monotonic (and live drift lives elsewhere)

A "checklist" mental model maps cleanly to monotonic timestamps: once you check a box, it stays checked. A *current health* model lives in `tenant_health` where flags freely flip both ways. Conflating the two — as the original design did — broke the UX: the Merchant Portal could not tell whether `translations_complete = false` meant "this tenant is brand new and hasn't translated anything yet → show tutorial" or "this tenant is live but a recently-added item lacks Khmer → show warning". With the split, the answer is unambiguous from `phase`:

- `tenants.status = DRAFT` → onboarding tutorial, sourced from `setup_progress`.
- `tenants.status = ACTIVE` and `tenant_health.*_healthy` all `TRUE` → "All systems operational" dashboard.
- `tenants.status = ACTIVE` and any `tenant_health.*_healthy` `FALSE` → degraded-live warnings, sourced from `tenant_health`.

### Why explicit `created_at` and `went_live_at`

`tenants.created_at` is *almost* the right value for `setup_progress.created_at`, since the row is created in the same use case — but storing it locally turns the funnel query into a single-table scan and avoids a hot path on `tenants`. `went_live_at` has no equivalent on `tenants` (`tenants.status` flipped to `ACTIVE`, but the timestamp of that flip wasn't recorded). This column closes the funnel.

### Why a partial index instead of a full one on `go_live_ready`

99% of rows in steady state will be `go_live_ready = TRUE` (most tenants have launched). The platform admin only ever queries the *false* side. A partial index `WHERE go_live_ready = FALSE` is microscopic compared to a full index, stays hot, and serves the exact query we care about.

### Why the Merchant Portal does not bind to this table directly

The portal needs more than the seven columns here. It needs counts ("2 of 5 menu items have English names"), specific missing fields ("your business phone is empty"), and labels in two languages — all of which require reads from `tenant_settings`, `menu_items` (inline bilingual), `tenant_payment_methods`, and `qr_contexts`. Doing those reads in the UI layer would couple the portal to schema details and replicate logic across consumers. Instead, `OnboardingStatusService` (NestJS application layer) composes a single rich DTO server-side. The portal renders the DTO; the table stays a fast index.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `tenants` | Parent (1:1) | The tenant this checklist belongs to |
| `tenant_health` | Sibling (1:1, both children of tenant) | Live-state drift after going live (translations breaking, payments disabled). Created at `DRAFT → ACTIVE` transition. |
| `tenant_settings` | Sibling (1:1, both children of tenant) | Profile completion is derived from settings state |
| `menu_items` | Indirect | Menu completion is set when first item is persisted; live-state coverage is tracked in `tenant_health` |
| `menu_items` (inline bilingual) | Indirect | Translation completion checks `name_en` presence on items (was previously a `menu_item_translations` join pre-collapse) |
| `menu_categories` | Indirect | Category names are stored inline (`name_km`, `name_en`); translation completion checks `name_en` presence |
| `tenant_payment_methods` | Indirect | Payments configuration milestone is set when first method is enabled; live-state in `tenant_health` |
| `qr_contexts` | Indirect | QR creation milestone is set when first QR context row exists |
