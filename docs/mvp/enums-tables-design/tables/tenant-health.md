# `tenant_health`

| Attribute | Value |
|---|---|
| **Domain** | Tenant |
| **Tenant-scoped?** | Yes (1:1 with `tenants`, only for `ACTIVE` tenants) |
| **Prisma model** | `TenantHealth` |
| **Mapped name** | `@@map("tenant_health")` |
| **Status** | ✅ New table 2026-04-21 — see `design-discussions/onboarding-status-redesign.md` |

---

## Part 1: Overview

`tenant_health` tracks the **live operational health** of a tenant *after* they have gone live. It is the sibling of `setup_progress`, which tracks the path *to* going live.

The split exists because two very different questions live in the merchant portal:

| Question | Source |
|---|---|
| *"Have you finished setting up?"* | `setup_progress` (monotonic, signup → go-live) |
| *"Is anything broken right now that needs your attention?"* | `tenant_health` (live, flips both ways) |

Without the split, a single boolean like "translations complete?" had two meanings depending on `tenants.status` — tutorial vs. warning — and the merchant portal had to branch to figure out which one it was reading. With the split, each table answers exactly one question.

### Lifecycle

- A `tenant_health` row is **created at the moment a tenant transitions `DRAFT → ACTIVE`** (the same `GoLiveUseCase` that sets `setup_progress.went_live_at`). All flags default to `TRUE` (the tenant just passed every onboarding gate, so they are healthy by definition).
- A `tenant_health` row is **never created for a `DRAFT` tenant** — there is nothing live to be unhealthy about yet.
- A `tenant_health` row is **cascade-deleted** when the tenant is deleted.

### What lives here

Three live-health invariants that can break post-launch:

| Invariant | Flag | Detected by |
|---|---|---|
| Every visible menu item has both `en` and `km` translations | `translations_healthy` | `TranslationCheckService` on menu mutations |
| At least one payment method is enabled | `payments_healthy` | `UpdateTenantSettingsUseCase` / `UpdatePaymentMethodUseCase` |
| At least one visible menu item exists | `menu_has_visible_items` | `UpdateMenuItemUseCase` / `DeleteMenuItemUseCase` |

Each flag carries a companion timestamp (`*_broken_at`, `NULL` when healthy) and, where useful, a counter (e.g., `untranslated_item_count`). The table is intentionally a **cheap summary** — when the merchant clicks a warning to drill in, the portal queries the source table directly. We don't store specific item IDs here to avoid a second place where they can drift.

---

## Part 2: CREATE TABLE

> **2026-04-25:** composite-PK refresh.

```sql
CREATE TABLE tenant_health (
  tenant_id                  TEXT NOT NULL,
  id                         TEXT NOT NULL,

  -- Current live-state flags. TRUE = healthy. Can flip both ways.
  translations_healthy       BOOLEAN NOT NULL DEFAULT TRUE,
  payments_healthy           BOOLEAN NOT NULL DEFAULT TRUE,
  menu_has_visible_items     BOOLEAN NOT NULL DEFAULT TRUE,

  -- When the unhealthy condition started (NULL when healthy)
  translations_broken_at     TIMESTAMP(3),
  payments_broken_at         TIMESTAMP(3),
  menu_broken_at             TIMESTAMP(3),

  -- Cheap counters for UI alert copy ("3 menu items missing Khmer")
  untranslated_item_count    INTEGER NOT NULL DEFAULT 0,
  disabled_payment_count     INTEGER NOT NULL DEFAULT 0,

  created_at                 TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMP(3) NOT NULL,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT tenant_health_one_per_tenant UNIQUE (tenant_id)
);

-- Partial index for the platform admin's "tenants with issues right now" dashboard
CREATE INDEX idx_tenant_health_unhealthy
  ON tenant_health (tenant_id)
  WHERE translations_healthy = FALSE
     OR payments_healthy     = FALSE
     OR menu_has_visible_items = FALSE;
```

---

## Part 3: Column-by-Column

### `id` -- TEXT PRIMARY KEY

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** `cuid()` (application-generated)
- **Purpose:** Surrogate primary key.
- **Constraints:** Primary key.
- **Why it exists:** Platform convention.

### `tenant_id` -- TEXT UNIQUE NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** Links this health row to exactly one tenant.
- **Constraints:** `UNIQUE`, `NOT NULL`, `REFERENCES tenants(id) ON DELETE CASCADE`.
- **Why it exists:** Enforces the 1:1 relationship. If the tenant is deleted, the health row goes with it.

### `translations_healthy` -- BOOLEAN NOT NULL DEFAULT TRUE

- **Type:** `BOOLEAN`
- **Nullable:** No
- **Default:** `TRUE`
- **Purpose:** Whether every visible menu item and every menu category currently has both `en` and `km` translations.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Detects the most common post-launch drift — a manager adds a new item in English, forgets the Khmer translation, and the customer-facing storefront is now partially untranslated. Set to `FALSE` by `TranslationCheckService` when coverage drops; flipped back to `TRUE` when full coverage is restored.

### `payments_healthy` -- BOOLEAN NOT NULL DEFAULT TRUE

- **Type:** `BOOLEAN`
- **Nullable:** No
- **Default:** `TRUE`
- **Purpose:** Whether the tenant has at least one enabled payment method right now.
- **Constraints:** `NOT NULL`.
- **Why it exists:** A live tenant who disables every payment method (rare but possible) cannot accept money — customers get an error at checkout. The merchant needs a loud warning.

### `menu_has_visible_items` -- BOOLEAN NOT NULL DEFAULT TRUE

- **Type:** `BOOLEAN`
- **Nullable:** No
- **Default:** `TRUE`
- **Purpose:** Whether at least one menu item is currently visible (i.e. `is_visible = TRUE` and not soft-deleted).
- **Constraints:** `NOT NULL`.
- **Why it exists:** A live tenant who hides every item (or whose only item is sold out and toggled off) presents an empty storefront. Worth surfacing.

### `translations_broken_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes — `NULL` while `translations_healthy = TRUE`.
- **Default:** `NULL`
- **Purpose:** When translation coverage first dropped below 100% in the current "broken" episode.
- **Constraints:** None beyond type.
- **Why it exists:** Powers the warning's "broken since" copy and lets the platform team measure mean-time-to-recovery on translation drift. Cleared back to `NULL` when `translations_healthy` flips back to `TRUE`.

### `payments_broken_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** When the tenant entered the "no payment method enabled" state.
- **Constraints:** None beyond type.

### `menu_broken_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** When the tenant's visible-items count first dropped to zero.
- **Constraints:** None beyond type.

### `untranslated_item_count` -- INTEGER NOT NULL DEFAULT 0

- **Type:** `INTEGER`
- **Nullable:** No
- **Default:** `0`
- **Purpose:** How many menu items are currently missing at least one of `en` / `km`.
- **Constraints:** `NOT NULL`, application convention `>= 0`.
- **Why it exists:** Lets the merchant portal render specific copy ("3 items missing English") without scanning `menu_items` on every page load. Recomputed by `TranslationCheckService`.

### `disabled_payment_count` -- INTEGER NOT NULL DEFAULT 0

- **Type:** `INTEGER`
- **Nullable:** No
- **Default:** `0`
- **Purpose:** How many payment methods the tenant has disabled (out of the methods they previously had enabled).
- **Constraints:** `NOT NULL`.
- **Why it exists:** Companion metric for the payments warning.

### `created_at` -- TIMESTAMP(3) NOT NULL DEFAULT NOW()

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** `NOW()`
- **Purpose:** When this health row was created — equivalent to "when did this tenant first go live", since the row is created at the `DRAFT → ACTIVE` transition.
- **Constraints:** `NOT NULL`.

### `updated_at` -- TIMESTAMP(3) NOT NULL

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** Managed by Prisma `@updatedAt`
- **Purpose:** Last write to this row. Useful for "stale health" alerts (no updates in N days could indicate the writer service is broken).
- **Constraints:** `NOT NULL`.

---

## Part 4: Indexes

### Unique index on `tenant_id`

- **Implicit:** Yes (created by `UNIQUE`)
- **Query served:** Every health lookup by tenant.

### Primary key index on `id`

- **Implicit:** Yes (created by `PRIMARY KEY`)

### Partial index `idx_tenant_health_unhealthy`

- **Purpose:** Powers the platform admin's "tenants currently degraded" dashboard. The vast majority of live tenants are healthy on all flags; only the unhealthy ones need to be scanned for the alert list.
- **Query served:**
  ```sql
  SELECT t.id, t.slug, t.name_en, t.name_km, th.*
  FROM   tenant_health th
  JOIN   tenants t ON t.id = th.tenant_id
  WHERE  th.translations_healthy   = FALSE
     OR  th.payments_healthy       = FALSE
     OR  th.menu_has_visible_items = FALSE
  ORDER BY LEAST(
    COALESCE(th.translations_broken_at, 'infinity'),
    COALESCE(th.payments_broken_at,     'infinity'),
    COALESCE(th.menu_broken_at,         'infinity')
  );
  ```
- **Why partial:** keeps the index a tiny fraction of the row count.

---

## Part 5: Relationships

### Outgoing FK

| Target table | FK column | Cascade | Why |
|---|---|---|---|
| `tenants` | `tenant_id` | `ON DELETE CASCADE` | Health row is meaningless without the tenant |

### Incoming references

None. `tenant_health` is a leaf node in the schema graph. Its sibling `setup_progress` does not reference it (or vice versa); they coordinate through `tenants` only.

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Tenant goes live, health row is born

"Phnom Penh Fried Rice" has just had its 5th milestone completed. The merchant taps "Go Live." `GoLiveUseCase`:

1. Sets `setup_progress.went_live_at = NOW()`.
2. Transitions `tenants.status` from `DRAFT` to `ACTIVE`.
3. Inserts a `tenant_health` row with all flags `TRUE` and counters at `0`.

The Merchant Portal now shows the live dashboard ("All systems operational") instead of the onboarding tutorial.

### Scenario 2: New menu item without Khmer translation

The manager at "Boba Queen" adds "Taro Milk Tea" in English. `CreateMenuItemUseCase` calls `TranslationCheckService` after the write:

1. Service counts items missing `km` → `untranslated_item_count = 1`.
2. Sets `translations_healthy = FALSE`.
3. Sets `translations_broken_at = NOW()` (was `NULL` — first item in the current broken episode).

The Merchant Portal's `OnboardingStatusService` reports `phase = 'live_with_issues'` and surfaces a `liveIssue`:

> ⚠ "Taro Milk Tea" needs a Khmer translation. [Fix]

The link goes to the menu-items screen filtered to `missing_km = true`. The merchant adds the translation; service recomputes:

1. `untranslated_item_count = 0`.
2. `translations_healthy = TRUE`.
3. `translations_broken_at = NULL`.

Banner disappears.

### Scenario 3: Merchant disables every payment method

A tenant accidentally disables both ABA QR and cash in one settings save. `UpdateTenantSettingsUseCase` re-checks `tenant_payment_methods`:

1. `disabled_payment_count = 2` (or however many were enabled).
2. `payments_healthy = FALSE`.
3. `payments_broken_at = NOW()`.

Storefront customers get an error at checkout. The Merchant Portal banner reads:

> 🛑 You have no payment methods enabled. Customers cannot pay. [Re-enable]

### Scenario 4: Platform admin reviews degraded tenants

Each morning the platform admin runs the index-served query in §4 to see which live tenants need a nudge:

```sql
SELECT t.slug, th.translations_healthy, th.payments_healthy,
       th.menu_has_visible_items,
       th.untranslated_item_count
FROM   tenant_health th
JOIN   tenants t ON t.id = th.tenant_id
WHERE  NOT (th.translations_healthy AND th.payments_healthy AND th.menu_has_visible_items);
```

Reach-out is tracked out of band (Telegram, email).

---

## Part 7: Design Decisions

### Why a separate table from `setup_progress`

Combining the two breaks the most-important UX distinction the merchant portal needs to make: tutorial vs. warning. By giving each concern its own table with a clear lifetime (signup→live for `setup_progress`, live-forever for `tenant_health`) the portal reads the right table for the right job and the schema documents the intent.

### Why no item ID lists in this table

`tenant_health` is intentionally a **cheap summary** (flags + counts + timestamps). When the merchant clicks "Fix", the portal queries the source table (`menu_items WHERE name_en IS NULL`, `tenant_payment_methods`, etc.) to get the actual broken records. Storing item IDs here would create a second place where they can drift, and would force this table to be updated on every menu mutation regardless of whether the health-relevant aggregate changed.

### Why default flags to `TRUE`, not `FALSE`

The row is created **only at the `DRAFT → ACTIVE` transition**, after every onboarding gate has passed. A brand-new live tenant is healthy by construction. Defaulting to `TRUE` matches that fact and avoids a redundant first-write to flip them.

### Why `created_at` here when `setup_progress.went_live_at` already records it

They are equivalent today, and one of them is technically redundant. `tenant_health.created_at` is kept for two reasons: (1) consistency with every other table on the platform, and (2) future-proofing if the lifecycle ever changes (e.g., `tenant_health` rows getting reset on a tenant suspension/reactivation cycle, where `setup_progress.went_live_at` would still point to the original launch).

### Why partial indexes everywhere

In steady state, well-run tenants are healthy on every flag. A full index would store one row per live tenant for queries we never run on the healthy side. Partial indexes scoped to `WHERE *_healthy = FALSE` keep the index tiny and serve the actual queries.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `tenants` | Parent (1:1, only for `ACTIVE`) | The tenant this health row belongs to |
| `setup_progress` | Sibling (1:1, both children of tenant) | The "did they finish onboarding" answer; this table is the "are they OK now" answer |
| `menu_items` | Indirect | `menu_has_visible_items` is derived from item visibility; `untranslated_item_count` requires a join here |
| `menu_items` (inline bilingual) | Indirect | Source for `translations_healthy` and `untranslated_item_count` — checks `name_en IS NULL` count |
| `menu_categories` | Indirect | Category English-name coverage (via inline `name_en` column) also factors into `translations_healthy` |
| `tenant_payment_methods` | Indirect | Source for `payments_healthy` and `disabled_payment_count` |
