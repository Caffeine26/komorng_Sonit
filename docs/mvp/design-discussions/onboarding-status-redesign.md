# Onboarding Status Redesign — Discussion & Proposal

**Date:** 2026-04-20 (decided 2026-04-21, schema applied 2026-04-22)
**Status:** ✅ Decided & applied to schema docs
**Affects:** `setup_progress` table, new `tenant_health` table, new `OnboardingStatusService`, Merchant Portal onboarding UX
**Applied changes:**
- `tables/setup-progress.md` — rewritten to timestamps + `GENERATED STORED` `go_live_ready` + monotonic semantics
- `tables/tenant-health.md` — new sibling table for live-state drift
- `tables/postgresql-schema.md` — both DDLs updated; tenant_health added to inventory
- `OnboardingStatusService` — to be implemented in `services/api` once code lands

---

## TL;DR

The current `setup_progress` table is fine as a **Go-Live gate** but
insufficient as the model behind a good onboarding UX. This doc proposes:

1. **Fix the drift bug** — make `go_live_ready` a `GENERATED` column so it
   can never disagree with its inputs.
2. **Add timeline fields** — `created_at`, `went_live_at`, and per-step
   `*_completed_at` so the Merchant Portal can show coaching copy and the
   product team can measure the onboarding funnel.
3. **Stop conflating two concerns** — "still onboarding" and "live but has
   drift" are different problems. Split the live-health flags
   (`translations_complete`, `payments_configured` when they revert
   post-launch) into a new `tenant_health` table.
4. **Introduce an `OnboardingStatusService`** — the Merchant Portal binds
   to this service, not to the raw table. The service composes
   `setup_progress` + the five source tables (`tenant_settings`,
   `menu_items`, `tenant_payment_methods`,
   `qr_contexts`) into a single rich status DTO that can answer "what
   step am I on", "what specifically is missing", and "when did I
   complete each step".

---

## Part 1 — Problems with the current design

### Problem 1 — `go_live_ready` is stored but fully derivable

```sql
go_live_ready BOOLEAN NOT NULL DEFAULT FALSE  -- stored
-- but it's just:
-- profile_complete AND menu_complete AND translations_complete
-- AND payments_configured AND qr_created
```

Every mutation path must remember to recompute it. One missed update →
the DB now lies. The justification ("one column read vs. five") is
negligible: reading six BOOLEANs costs the same as reading one.

### Problem 2 — Booleans alone can't drive a good UX

`menu_complete = false` tells the user *that* their menu is incomplete,
not *how much* they've done or *what's missing*. Every time the portal
needs to render a step's detail, it has to query the source table
anyway. The boolean flag is a progress-bar index, not a complete model.

| Question the tenant asks | Can the table answer it? |
|---|---|
| "How much of my menu have I done?" | ❌ needs `COUNT(menu_items)` |
| "Which items are missing English?" | ❌ needs `SELECT FROM menu_items WHERE name_en IS NULL` (was a JOIN pre-collapse) |
| "Which profile fields am I missing?" | ❌ needs `tenant_settings` row |
| "When did I complete my profile?" | ❌ no timestamp stored |
| "Has something I already did broken?" | ❌ can't distinguish "never done" vs "done-then-broke" |

### Problem 3 — "Never done" and "done-then-broke" are indistinguishable

`translations_complete = false` could mean:

- A brand-new tenant who hasn't translated anything yet → show **tutorial**.
- An `ACTIVE` tenant whose newly-added menu item broke the invariant →
  show **warning alert**.

These demand totally different UI, but one bit can't tell them apart.

### Problem 4 — No timeline for coaching or analytics

Without `created_at` and per-step `*_completed_at`:

- UI can't say "you completed your profile 3 days ago — just 2 steps
  left!"
- Product team can't measure "median time from signup to go-live" or
  "which step causes the longest stall".
- Backfilling these timestamps later requires best-effort guessing from
  `audit_logs`.

### Problem 5 — The table conflates onboarding with ongoing health

Part 7 of the current doc says *"`translations_complete` and
`payments_configured` can both revert"*. But a revert on an `ACTIVE`
tenant is not an **onboarding** problem — the tenant already onboarded.
It's a **live health** problem.

Today both states live in the same table, so the word
"setup_progress" carries two meanings, and the portal UX has to branch
on `tenants.status` to figure out which one it's reading. This is the
root of the "tutorial vs. warning" ambiguity in Problem 3.

---

## Part 2 — Two concerns, two tables

| Concern | Lifetime | Data we want | Table |
|---|---|---|---|
| **Onboarding progress** (checklist, Go-Live gate) | Signup → `ACTIVE` | Timestamps for each milestone, monotonic | `setup_progress` |
| **Live health** (still OK after going live?) | `ACTIVE` forever | Current flags, counts of broken items, last-broken-at | `tenant_health` |

Splitting these:

- Makes `setup_progress` monotonic — flags only flip false → true, never
  back. Matches the mental model of a checklist. Simpler invariants.
- Makes `tenant_health` a live dashboard — flags can flip freely. Its job
  is to surface alerts to an already-live tenant.
- Removes the tutorial-vs-warning ambiguity. The portal reads the right
  table for the right job.

---

## Part 3 — Proposed schemas

### 3.1 — Revised `setup_progress`

```sql
CREATE TABLE setup_progress (
  id                         TEXT PRIMARY KEY,
  tenant_id                  TEXT UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Milestone timestamps (nullable = not yet completed)
  profile_completed_at       TIMESTAMP(3),
  menu_completed_at          TIMESTAMP(3),
  translations_completed_at  TIMESTAMP(3),
  payments_configured_at     TIMESTAMP(3),
  qr_created_at              TIMESTAMP(3),

  -- Lifetime bookends
  created_at                 TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  went_live_at               TIMESTAMP(3),
  updated_at                 TIMESTAMP(3) NOT NULL,

  -- Derived — never store a boolean you can compute
  go_live_ready BOOLEAN NOT NULL GENERATED ALWAYS AS (
    profile_completed_at      IS NOT NULL
    AND menu_completed_at     IS NOT NULL
    AND translations_completed_at IS NOT NULL
    AND payments_configured_at    IS NOT NULL
    AND qr_created_at         IS NOT NULL
  ) STORED
);

CREATE INDEX idx_setup_progress_go_live_ready
  ON setup_progress (go_live_ready)
  WHERE go_live_ready = FALSE;  -- platform admin funnel query
```

**Why timestamps, not booleans:** a timestamp carries a boolean for free
(`IS NOT NULL`) **plus** the moment it happened. You get the gate, the
coaching copy ("you finished your profile 3 days ago"), and the funnel
analytics from one column.

**Why `GENERATED`:** it's impossible for the DB to hold a state where
`go_live_ready` disagrees with its inputs. No application code can
cause drift.

**Monotonicity:** these timestamps are never nulled back. Once the
profile is done, it's done. If something breaks post-launch, that
belongs in `tenant_health`, not here.

### 3.2 — New `tenant_health`

```sql
CREATE TABLE tenant_health (
  id                         TEXT PRIMARY KEY,
  tenant_id                  TEXT UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Current live-state flags. Can flip both ways.
  translations_healthy       BOOLEAN NOT NULL DEFAULT TRUE,
  payments_healthy           BOOLEAN NOT NULL DEFAULT TRUE,
  menu_has_visible_items     BOOLEAN NOT NULL DEFAULT TRUE,

  -- Why it's unhealthy (NULL when healthy)
  translations_broken_at     TIMESTAMP(3),
  payments_broken_at         TIMESTAMP(3),
  menu_broken_at             TIMESTAMP(3),

  -- Counters for UI alert copy
  untranslated_item_count    INTEGER NOT NULL DEFAULT 0,
  disabled_payment_count     INTEGER NOT NULL DEFAULT 0,

  updated_at                 TIMESTAMP(3) NOT NULL
);
```

**Lifecycle:** created at the same moment a tenant transitions to
`ACTIVE`. Never relevant for `DRAFT` tenants. One row per live tenant.

**Who writes it:** the same domain services that flip the corresponding
source state. Example: `CreateMenuItemUseCase` on an `ACTIVE` tenant
checks if the item has both `en` and `km` translations and updates
`translations_healthy` + `untranslated_item_count` accordingly.

**Open question:** should this also hold *which specific items* are
broken (e.g. `untranslated_item_ids TEXT[]`)? Leaning **no** — the
Merchant Portal can query the source table directly when the user
clicks into the alert. Keeping this table as a cheap summary avoids a
second place where item IDs can drift.

---

## Part 4 — `OnboardingStatusService`

The Merchant Portal should **never bind directly to `setup_progress`**.
It binds to a single application service that returns a rich DTO.

### 4.1 — Service shape

```ts
// services/api/src/modules/onboarding/onboarding-status.service.ts
interface OnboardingStatus {
  phase: 'onboarding' | 'live' | 'live_with_issues';

  overall: {
    stepsDone: number;          // 0..5
    stepsTotal: number;         // 5 at MVP
    canGoLive: boolean;         // setup_progress.go_live_ready
    wentLiveAt: string | null;
  };

  steps: OnboardingStep[];      // always length 5 at MVP

  liveIssues?: LiveIssue[];     // only when phase = 'live_with_issues'
}

interface OnboardingStep {
  key: 'profile' | 'menu' | 'translations' | 'payments' | 'qr';
  label: { en: string; km: string };
  status: 'done' | 'partial' | 'todo';
  completedAt: string | null;
  detail: StepDetail;            // discriminated by key — see below
  nextAction: {
    href: string;                // e.g. '/admin/menu'
    label: { en: string; km: string };
  } | null;
}

// Example discriminated details
type StepDetail =
  | { key: 'profile'; missingFields: string[]; filledFields: string[] }
  | { key: 'menu'; itemCount: number; minRequired: number }
  | { key: 'translations'; untranslatedItems: { id: string; nameEn: string }[] }
  | { key: 'payments'; enabledMethods: string[]; suggested: string[] }
  | { key: 'qr'; qrContextCount: number };

interface LiveIssue {
  kind: 'translations' | 'payments' | 'menu';
  brokenAt: string;
  detailHref: string;
  summary: { en: string; km: string };
}
```

### 4.2 — How the service composes data

| DTO field | Source |
|---|---|
| `phase` | `tenants.status` + `tenant_health` |
| `overall.canGoLive` | `setup_progress.go_live_ready` |
| `overall.wentLiveAt` | `setup_progress.went_live_at` |
| `steps[].completedAt` | `setup_progress.*_completed_at` |
| `steps.profile.detail` | `tenant_settings` row — compute missing fields |
| `steps.menu.detail` | `COUNT(*) FROM menu_items WHERE tenant_id = ? AND is_visible = true` |
| `steps.translations.detail` | `SELECT FROM menu_items WHERE name_en IS NULL` query (single-table after collapse) |
| `steps.payments.detail` | `tenant_payment_methods WHERE enabled = true` |
| `steps.qr.detail` | `COUNT(*) FROM qr_contexts WHERE tenant_id = ?` |
| `liveIssues` | `tenant_health` flags that are false |

**One endpoint, one round trip for the portal.** The service does the
joins server-side, in one place, with the right indexes.

### 4.3 — Why this is the right seam

- The **portal** stays dumb — it just renders the DTO. Zero business
  logic client-side about "what counts as complete".
- The **table** stays lean — it's a fast index, not a god object.
- Adding a new step later = one service change + one migration column.
  No UI refactor needed for teams reading this DTO.

---

## Part 5 — Merchant Portal UX mapping

What the redesign unlocks, concretely:

### During onboarding

- **Progress bar** → `overall.stepsDone` / `overall.stepsTotal`
- **Per-step card** → each `steps[i]` with status badge ⚪/🟡/✅
- **Specific hints** → rendered from `steps[i].detail`:
  - Menu: "2 items added, add at least 1 more" (from `itemCount` vs `minRequired`)
  - Translations: "'Taro Milk Tea' needs Khmer" (from `untranslatedItems`)
  - Profile: "Add your business phone and address" (from `missingFields`)
- **Coaching copy** → "You finished your profile {X} days ago" using
  `completedAt` timestamps
- **Go-Live button** → enabled iff `overall.canGoLive`

### After going live

- **Default view** → "All systems operational" dashboard
- **Issue banners** → one per `liveIssues[i]`, each linking to the
  source screen (`detailHref`) so the tenant can fix it in one tap
- **Never shows onboarding tutorials** — because `phase` tells the
  portal this tenant is already live

### For platform admin

- "Stuck in onboarding" query → `setup_progress.go_live_ready = FALSE`
  (served by the partial index in §3.1)
- "Time-to-live median" → `percentile_cont(0.5) WITHIN GROUP (ORDER BY
  went_live_at - created_at)` — directly answerable now
- "Which step stalls longest" → for each step key, median delta between
  `created_at` and `*_completed_at`

---

## Part 6 — Migration path

Pre-launch, no production data to preserve — we can cut cleanly:

1. Drop the booleans from `setup_progress`. Add timestamps + GENERATED
   column + `created_at` + `went_live_at`.
2. Create `tenant_health`.
3. Update domain services to write timestamps (not booleans) on step
   completion.
4. Move "broken post-launch" logic out of `setup_progress` writes and
   into `tenant_health` writes.
5. Build `OnboardingStatusService` and refactor the Merchant Portal
   onboarding page to consume its DTO instead of the raw table.
6. Update `docs/discussions/tables/setup-progress.md` to match. Create
   `docs/discussions/tables/tenant-health.md`.

No data backfill needed since no tenants exist yet.

---

## Part 7 — Tradeoffs and open questions

### Tradeoff: two tables instead of one

**Against:** more surface area, more Prisma models, more migrations.
**For:** eliminates the tutorial-vs-warning ambiguity, keeps each
table's invariants simple (one monotonic, one not), maps 1:1 to the two
UX states (`onboarding` vs `live`).

### Tradeoff: service layer instead of direct table access

**Against:** another file, another abstraction.
**For:** the Merchant Portal would end up doing the joins in the UI
layer otherwise. Better to do it once, server-side, with the right
indexes, than replicate it in every consumer.

### Open question: per-step detail in `tenant_health`?

Should `tenant_health` store `untranslated_item_ids TEXT[]` or let the
UI query `menu_items` directly (`WHERE name_en IS NULL`) when the user
clicks in? I lean **directly query the source**, to keep `tenant_health`
a cheap summary. Trade: one extra query when the user drills into an
alert.

### Open question: is `live_with_issues` really a separate phase?

I included it in the DTO, but we could fold it into `live` and let the
presence of `liveIssues[]` drive the UI. Leaning **yes keep it
separate** so the portal can show a distinct header color without
parsing the array.

### Open question: should we add a `tenant_id` NOT NULL trigger / extra defense?

Both tables are 1:1 with `tenants` and the FK already enforces this.
Nothing special needed beyond the standard three-layer tenant defense
from CLAUDE.md.

---

## Part 8 — Decisions requested

Please confirm / reject each of these so we can move to implementation:

1. **Convert `go_live_ready` to a `GENERATED` column.** ❓
2. **Replace step booleans with step timestamps.** ❓
3. **Add `created_at` and `went_live_at` to `setup_progress`.** ❓
4. **Create `tenant_health` as a separate table for post-launch flags.** ❓
5. **Introduce `OnboardingStatusService` as the portal's only contract.** ❓
6. **Keep drill-down item lists out of `tenant_health` (query source tables instead).** ❓
7. **Expose `live_with_issues` as a distinct phase, not a flag on `live`.** ❓

Once decisions are logged, I'll:
- Update `xfos/database/prisma/schema.prisma`
- Rewrite `docs/discussions/tables/setup-progress.md` to match
- Add `docs/discussions/tables/tenant-health.md`
- Sketch the NestJS module for `OnboardingStatusService`
