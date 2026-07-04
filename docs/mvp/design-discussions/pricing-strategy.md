# Pricing Strategy — Discussion & Validation Plan

**Date:** 2026-04-22 (strategy drafted + schema finalized same day)
**Status:** ✅ Schema finalized & applied — strategy (tier features, prices, validation) still in progress
**Affects:** `plans` table, new `plan_features` table, merchant portal billing UI, go-to-market
**Outcome:**
- The 3-tier framework (Starter / Growth / Pro) is strategically sound as a template but untested against Cambodian market realities.
- The `plans` + `plan_features` schema is **flexible by design**: tier taxonomy, features, prices, and visibility can all evolve via `INSERT` / `UPDATE`, not migrations.
- **Phase 1 rollout**: 3 plans exist in DB; only `STARTER` is `is_public = TRUE`. Growth and Pro are ready in the wings — one `UPDATE` flips them visible when the team is ready.
- Four must-validate assumptions identified; cheap validation moves proposed.
- Discovery/pivot area: the real differentiation may be **Messenger/Telegram bot integration**, not Single Customer View (SCV) — customers already volunteer their identity to merchants via Messenger for free.
- **Applied schema docs:** `tables/plans.md` (rewritten), `tables/plan-features.md` (new), `tables/postgresql-schema.md` (both DDLs added, inventory 32 → 33).

---

## Part 1 — Proposed pricing strategy (user's draft)

### Core principle

Plans must scale with:

- Operational complexity
- Order volume
- Business maturity
- Data sophistication

Avoid feature dumping. Every plan must have a **clear upgrade trigger**.

### Tier structure

| Plan     | Role                    | Goal                          |
|----------|-------------------------|-------------------------------|
| Starter  | Entry                   | Acquire users                 |
| Growth   | Default / Most Popular  | Drive revenue (main plan)     |
| Pro      | Advanced                | Capture high-value customers  |

### Detailed plan comparison

| Category              | Starter                          | Growth (Most Popular)                 | Pro                                  |
|----------------------|----------------------------------|--------------------------------------|--------------------------------------|
| Target User          | Small stall / café               | Busy restaurant                      | Multi-location / chain               |
| Business Stage       | Early / low volume               | Growing / operational pressure       | Scaling / optimization               |
| Stores               | 1                                | Multiple                             | Unlimited                            |
| Order Volume         | Limited (e.g. 300–500/month)     | High / soft limit or unlimited       | Unlimited                            |
| Devices / Printers   | 1                                | Multiple                             | Unlimited                            |
| Ordering             | Basic                            | Advanced workflow                    | Advanced + optimized                 |
| Kitchen Workflow     | Manual                           | Structured routing                   | Fully optimized                      |
| Analytics            | None / very basic                | Sales + operational insights         | Advanced (LTV, retention, cohorts)   |
| Customer Data        | None                             | Basic capture                        | Full customer profile (SCV)          |
| Promotions           | No                               | Yes                                  | Advanced targeting                   |
| Marketing Automation | No                               | Basic                                | Advanced (segmentation, campaigns)   |
| API Access           | No                               | No / Limited                         | Yes                                  |
| Roles & Permissions  | No                               | Basic                                | Advanced RBAC                        |
| Support              | Standard                         | Priority                             | Priority + SLA                       |

### Tier detail

**Starter** — 1 store, basic menu & ordering, simple order list, 1 printer/device, limited monthly orders. Replaces manual ordering, reduces errors, quick setup, low cost. Target: street vendor, small café, single-operator business. Upgrade trigger: hits order limit, needs multiple devices, struggles during peak hours.

**Growth** (primary revenue driver) — multiple stores/zones, multiple printers (kitchen + cashier), order routing (kitchen workflow), promotions & discounts, sales analytics, customer data capture (foundation for SCV). Faster kitchen ops, better staff coordination, revenue visibility, start building customer intelligence. Target: busy restaurant, multi-staff, high peak-hour traffic. Upgrade trigger: needs automation, wants integrations, deeper customer insights, expansion to multiple locations.

**Pro** — unlimited stores, advanced analytics (LTV, retention, cohorts), full customer profiles (SCV), API access, marketing automation (segmentation, campaigns), role-based access control, priority support. Data-driven growth, centralized control across locations, higher customer retention, marketing efficiency at scale. Target: restaurant chain, multi-location brand, data-driven operator. Upgrade trigger: enterprise needs, custom integrations, SLA / support requirements.

### Feature-gating strategy

Gate by **scale and sophistication**, not arbitrary restriction:

| Dimension            | Progression                          |
|---------------------|--------------------------------------|
| Stores              | 1 → Multiple → Unlimited             |
| Devices             | 1 → Multiple → Unlimited             |
| Orders              | Limited → High → Unlimited           |
| Workflow            | Manual → Structured → Optimized      |
| Data                | None → Basic → Advanced (SCV)        |
| Marketing           | None → Basic → Automated             |

### Strategic differentiation thesis

Most competitors offer ordering + printing. Your edge must be:

> **Customer Data Platform (SCV) + Marketing Automation**

If this is not strongly positioned in Growth and Pro, the product becomes commodity infrastructure.

### Critical rules

1. **Limit visible plans.** Max 3. Optional: Enterprise (hidden / sales-driven).
2. **Ensure upgrade pressure.** Each plan must create natural friction — operational limits, growth constraints, missing capabilities.
3. **Avoid feature chaos.** Do NOT randomly assign features or create inconsistent value gaps.

### Final recommendation (user's draft)

Start with STARTER / GROWTH (highlight as "Most Popular") / PRO. Focus on strong upgrade triggers, clear differentiation, SCV-driven value in higher tiers.

### Next step (user's draft)

Define: pricing (USD / KHR / JPY), order limits vs unlimited strategy, hardware bundling (printer + SaaS).

---

## Part 2 — Initial review (generalist read)

### What's working well

- **3-tier + "Most Popular" anchor** is textbook SaaS wisdom. Reduces choice paralysis, makes Growth the default.
- **Explicit upgrade triggers per tier** is mature discipline, better than feature lists.
- **"Avoid feature dumping" principle** — pricing-page clarity is hard; this rule protects it.
- **The SCV + marketing automation differentiation thesis** is directionally correct for the generic SaaS case. Ordering + printing is commoditized globally.

### Cambodia-specific concerns (framework is context-free)

1. **No price ceiling discussion.** A $19.99 Growth plan is aggressive for a Phnom Penh stall doing $200/day. Without reference prices from local competitors or surveyed merchants, the tier pricing is built on assumption.
2. **"Multiple stores" tier presumes a market segment that may barely exist.** If <5% of the addressable market has 2+ locations, Growth's anchor feature (multi-store) is invisible to 95% of tenants — and Growth is supposed to be the revenue driver.
3. **The SCV moat assumes data capture the MVP can't do.** Storefront is anonymous per `CLAUDE.md`. Marketing automation presumes customers give email/phone/Telegram. Whether Khmer stall customers will volunteer that info is testable but untested.
4. **Missing: transaction-fee revenue.** Square/Toast make most of their money on payment processing. ABA QR is integrated. 0.5-1% per transaction may fit this market better than subscription tiers.
5. **Missing: hardware bundling.** Many small merchants don't have tablets or receipt printers. Bundled hardware + SaaS may be the real product.

---

## Part 3 — Adversarial review (product-strategy-critic)

The generalist review was stress-tested by an adversarial agent. It surfaced risks I (the generalist) missed:

### Risks not flagged by the generalist

1. **Facebook/Messenger isn't a competitor — it's the incumbent AND the free SCV.** Cambodian customers already identify themselves to restaurants via Messenger (name, profile photo, chat history). Your Pro-tier "customer profile" is competing with a free product customers already use daily. **The real Pro-tier feature may not be SCV — it may be Messenger/Telegram Bot integration that pipes orders into your kitchen PWA.** Miss this and Pro is dead on arrival.

2. **The "device limit" gating axis is a self-inflicted wound.** A 1-device Starter means the owner can't print in the kitchen AND take orders at the counter. That's not a tier — that's a broken product. Device count as a paywall will generate workarounds (shared tablet, screen-mirroring) and support tickets. Gate on **stores + order volume**, not devices.

3. **No retention story at any tier.** Cambodian SMB food businesses have high mortality (anecdotally 30-50% close within 18 months — needs validation). If ARPU is $10/mo and average tenant lifespan is 9 months, LTV is $90 and CAC must stay under $30. Tier design is premature until tenant churn is known.

4. **"Unlimited stores" in Pro is a pricing trap.** A 20-location chain pays the same as a 3-location. Either meter on stores with overage, or cap at ~10 and send bigger to sales / "contact us" Enterprise.

5. **Transaction-fee model has an NBC regulatory trap.** NBC (National Bank of Cambodia) rules on payment facilitation may require a PSP (Payment Service Provider) license to take a % of KHQR transactions. **Investigate before modeling this as a revenue lever.** Flagged as a research task — the critic did not have current 2026 NBC rulings.

6. **"Priority + SLA" support is a positioning mistake in this market.** Khmer-first support is itself a tier feature. "Priority + SLA" in English doesn't matter to Cambodian merchants. Position support tier around **language + channel + hours** (e.g., "Khmer-speaking human on Telegram within 2 hours during business hours"), not SLA percentages a 3-engineer team can't honor anyway.

---

## Part 4 — Must-validate assumptions

Before committing to tier structure in the product or schema, validate in this order:

| # | Assumption | Cheap validation move | Kill signal |
|---|---|---|---|
| 1 | Willingness-to-pay ceiling is ≥ $8/mo for basic ordering + printing | Survey 25-30 stalls across Phnom Penh + Siem Reap | <40% say yes → pricing is too high |
| 2 | A "multi-location chain" segment is large enough to anchor Growth | Scrape Foodpanda / NHAM24 listings, count unique brand names with 2+ locations | <8% of TAM → multi-store is the wrong gating axis for Growth |
| 3 | Customers will volunteer identity at the anonymous storefront (phone/Telegram) | 2-week pilot with one friendly tenant — optional phone field at checkout | <25% capture rate → SCV tier is fiction |
| 4 | Messenger/Telegram is NOT already serving the ordering use case for >50% of customers | 15 customer interviews: "how did you order your last takeaway?" | >50% Messenger → moat is chat-bot integration, not SCV |
| 5 | Seasonality and cash-flow pattern | Ask tenants about Khmer New Year, Pchum Ben, rainy-season revenue swings | Informs annual vs monthly billing and dunning tolerance |

**Additional research item:** confirm NBC PSP licensing requirements for taking a % of KHQR transactions (risk #5 above). Desk research → legal consult if positive signal.

---

## Part 5 — Schema decision (✅ finalized 2026-04-22)

### Principle

**Plans are data, not schema.** The schema captures *shape*; the specific tiers, features, prices, and visibility all flow through `INSERT` / `UPDATE`. That keeps iteration fast while the strategy itself is still being validated.

### Final schema

See `tables/plans.md` and `tables/plan-features.md` for full column-by-column docs. Summary below.

```sql
-- plans: catalog entry, bilingual display, two lifecycle flags
CREATE TABLE plans (
  id                  TEXT PRIMARY KEY,
  code                TEXT UNIQUE NOT NULL,             -- 'STARTER' | 'GROWTH' | 'PRO' (machine key, TEXT not enum)
  name_en             TEXT NOT NULL,
  name_km             TEXT NOT NULL,
  tagline_en          TEXT,
  tagline_km          TEXT,
  highlight_label_en  TEXT,                             -- e.g. 'Most Popular'
  highlight_label_km  TEXT,
  price_cents         INTEGER,                          -- NULL = custom / contact sales
  currency            "Currency" NOT NULL DEFAULT 'USD',
  billing_interval    TEXT NOT NULL DEFAULT 'MONTHLY',  -- 'MONTHLY' | 'ANNUAL' | 'ONE_TIME'
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,    -- accepting subscriptions?
  is_public           BOOLEAN NOT NULL DEFAULT FALSE,   -- visible in signup UI?
  display_order       INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP(3) NOT NULL
);

CREATE INDEX idx_plans_public
  ON plans (display_order)
  WHERE is_public = TRUE AND is_active = TRUE;

-- plan_features: one row per (plan × capability)
CREATE TABLE plan_features (
  id            TEXT PRIMARY KEY,
  plan_id       TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  feature_key   TEXT NOT NULL,                          -- vocabulary in TS code, not DB
  value         JSONB NOT NULL,                         -- number | boolean | string (native JSON type)
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (plan_id, feature_key)
);

CREATE INDEX ON plan_features (plan_id);
```

### Key decisions (and rationale)

| Decision | Why |
|---|---|
| `code` is TEXT, not a Postgres enum | Plans are catalog identifiers, not app state. The app reads behavior from `plan_features`, never branches on `code`. Enums force a migration to add / retire a plan. |
| Bilingual columns inline (`name_en` + `name_km`), not a translation table | Matches `tenants.name_en` / `tenants.name_km`. Each plan has exactly one name in at most two locales — no join worth the cost. |
| Two lifecycle flags: `is_active` + `is_public` | Enables "active but hidden" state — critical for Phase 1 (Growth and Pro exist but are not shown to merchants yet) and for manual admin assignment of enterprise deals. |
| `price_cents`, not `price_usd_cents` | Currency-agnostic column name + explicit `currency` enum. Supports multi-currency pricing without a rename. |
| `value JSONB` (not 4 typed sidecars, not `TEXT`) | Preserves native JSON type. One column, flexible for future composite values, no "3 of 4 columns always NULL" problem. |
| Feature vocabulary in TypeScript, not a `plan_feature_definitions` table | Adding a feature = code change only, no migration. TS unions give compile-time safety equivalent to a FK'd vocabulary table. |

### Phase 1 seed

3 plans exist; only Starter is public:

| code | is_active | is_public | price_cents |
|---|---|---|---|
| `STARTER` | ✅ TRUE | ✅ **TRUE** | 0 |
| `GROWTH`  | ✅ TRUE | ❌ FALSE   | NULL (TBD) |
| `PRO`     | ✅ TRUE | ❌ FALSE   | NULL (TBD) |

Growth's and Pro's prices, highlight labels, and final feature sets remain TBD pending validation.

### Starter feature vocabulary (applied)

Seeded rows for STARTER in `plan_features`:

```
max_orders_per_month       = 500
max_stores                 = 1
promotions_enabled         = false
analytics_level            = "none"
scv_enabled                = false
marketing_automation_level = "none"
api_access_enabled         = false
rbac_level                 = "none"
support_level              = "standard"
```

See `tables/plan-features.md` Scenario 1 for the full SQL seed across all 3 plans.

### What is NOT decided yet

- **Prices** for Growth and Pro (depends on validation #1 — willingness-to-pay survey).
- **Feature gating matrix** — which specific features belong in Growth vs Pro (depends on validation #3 and #4 — SCV capture rate and Messenger substitute rate).
- **Whether "multi-store" remains Growth's anchor** (depends on validation #2 — if <8% of TAM has multiple locations, the anchor shifts to order volume).
- **Whether to add a transaction-fee plan** (depends on NBC PSP licensing research).
- **Whether Pro's core value is SCV or Messenger/Telegram bot integration** (depends on validation #4).

None of these unknowns require schema changes to resolve — they all resolve via data.

---

## Part 6 — Next steps

### Schema (✅ done 2026-04-22)

1. ✅ `tables/plans.md` rewritten to the final design.
2. ✅ `tables/plan-features.md` created.
3. ✅ `tables/postgresql-schema.md` updated (both DDLs, inventory bumped to 33 tables).
4. ✅ Seed rows defined for all 3 plans (Scenario 1 in each table doc). Starter is public; Growth and Pro are seeded as `is_public = FALSE` pending validation.

### Validation (market — still open)

5. Run the 5 validation moves in Part 4 — most are <2 weeks of effort each. Expected cost: survey fees + one friendly pilot tenant.
6. Desk-research NBC PSP licensing. If positive, consult local legal before modeling transaction fees.

### Post-validation

7. **Data-only updates** — no schema changes needed:
   - `UPDATE plans SET price_cents = ...` for Growth and Pro after willingness-to-pay data.
   - `INSERT INTO plan_features` (or `UPDATE` existing rows) to finalize the gating matrix.
   - `UPDATE plans SET is_public = TRUE WHERE code IN ('GROWTH', 'PRO')` when ready to launch the full pricing page.
8. If a new tier is added (e.g., `ENTERPRISE`, or a transaction-fee plan) — single `INSERT INTO plans` row + its feature rows.

### Code

9. Create `xfos/contracts/enums/plan-codes.ts` — TypeScript constant + `PlanCode` union.
10. Create `xfos/contracts/enums/plan-features.ts` — the feature-key catalog with expected value types, `unlimited` sentinels, and bilingual labels (see `tables/plan-features.md` Part 1).

---

## Part 7 — Open questions for the next session

1. Is the "SCV" terminology really what you want to keep, or was it a placeholder? If the real Pro differentiator is Messenger/Telegram bot integration (critic's hypothesis), does that change the Pro tier's target customer?
2. Do we want JPY in the pricing matrix (mentioned in the original draft's "Next Step")? Is that for a future Japan market, or was it speculative? Affects whether `plans.currency` needs to be multi-value or whether a per-currency `plan_prices` sub-table makes sense.
3. Who runs the 25-30 stall survey? Founder-led, or do we need a local research hire?
4. What's the tolerance for Starter being free vs $3-5/mo? Freemium lowers acquisition friction but requires a sharper upgrade funnel.
