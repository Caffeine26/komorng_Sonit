# XFOS — Engineer Handoff

Welcome. This is the entry point for building **XFOS**, the multi-tenant food-ordering platform for Cambodia. Everything you need to build the backend and the four frontends is in this folder. Start here — this README tells you exactly what to read, in what order, and which docs to open for the surface you are working on today.

---

## 1. What you are building — one sentence

> XFOS is a multi-tenant SaaS platform for Cambodian food stalls, kiosks, and dine-in restaurants. A customer scans a QR code → browses the menu in Khmer or English → places an order → pays. The kitchen sees the order in real time on a tablet and prints a ticket. Merchants manage their menu, team and QR codes in a portal. XFOS ops runs a separate internal console.

**The hard rule:** *"If a restaurant cannot operate daily using this system, MVP has failed."*

---

## 2. The five things you are shipping

One NestJS backend serving four Next.js frontends. Each app lives in the already-scaffolded `xfos/` monorepo:

| Surface | Who uses it | Where | Folder |
|---|---|---|---|
| **Storefront App** | Customers | Phone (mobile web, QR-accessed) | `xfos/frontend/storefront` |
| **Kitchen App (KDS)** | Kitchen staff | Tablet PWA on the wall | `xfos/frontend/kitchen` |
| **Merchant Portal** | Restaurant owners / managers | Desktop / tablet | `xfos/frontend/admin` |
| **Platform Portal** | XFOS internal ops team | Internal browser, IP-allowlisted | `xfos/frontend/platform-admin` |
| **Backend API** | All four frontends | Single NestJS process | `xfos/backend/api` |

Each frontend talks to its own BFF prefix inside the single backend:
```
Storefront       → /api/v1/storefront/*
Kitchen          → /api/v1/kitchen/*
Merchant Portal  → /api/v1/admin/*
Platform Portal  → /api/v1/platform-admin/*
```

---

## 3. Day 1 reading order (do these in order)

These five documents give you the whole picture. Read them before writing any code.

1. **[KEY-DECISIONS.md](./KEY-DECISIONS.md)** — **start here.** A single consolidated reference covering every significant design decision in XFOS — schema-wide conventions, tables, enums, architecture, auth, folder structure, tech stack. Each entry has scenario / decision / description. Designed for fast onboarding without reading 60+ design docs.
2. **[ARCHITECTURE-RATIONALE.md](./ARCHITECTURE-RATIONALE.md)** — why XFOS uses DDD + Hexagonal Architecture, with honest pros, cons, comparisons against alternatives, and concrete XFOS-specific examples. Read this when you want to understand *why* the codebase is shaped the way it is, not just *how*.
3. **[XFOS-PRD.md](./XFOS-PRD.md)** — the master PRD. Product, architecture, BFF pattern, hexagonal domain layer, tech stack, folder structure, non-negotiable rules, MVP scope + phasing, roadmap, onboarding. Read fully — §4.3 + §8 contain the narrative end-to-end walkthrough.
4. **[folder_structure_and_decision.md](./folder_structure_and_decision.md)** — the authoritative monorepo layout + the four invariants the code must obey. The `xfos/` scaffold already matches this doc.
5. **[technical-design/00-start-here.md](./technical-design/00-start-here.md)** and **[technical-design/00-index.md](./technical-design/00-index.md)** — the detailed-specs entry point.

---

## 4. Day 2+ reading — cross-cutting specs

Everything in [`technical-design/shared/`](./technical-design/shared/) applies to every surface. Read these before touching any backend or frontend code that isn't UI-only.

> **Schema design lives in [`enums-tables-design/`](./enums-tables-design/).**
> The canonical DDL is [`enums-tables-design/tables/postgresql-schema.md`](./enums-tables-design/tables/postgresql-schema.md);
> per-table design rationale is under [`enums-tables-design/tables/`](./enums-tables-design/tables/);
> per-enum design is under [`enums-tables-design/enums/`](./enums-tables-design/enums/).
> The shared/02 file in this folder is now an overview/index only.
>
> **Per-topic design rationale lives in [`design-discussions/`](./design-discussions/)** — 10 docs covering the auth strategy (Telegram + Facebook + Phone-OTP), order/bill numbering, status redesign, ServiceModel × PayTiming combinations, role design, onboarding milestones, pricing tiers, tenant settings, menu items/variants/options, and JWT token walkthrough. Read these when a per-table doc points at one.

| # | File | Covers |
|---|---|---|
| 01 | [`01-architecture.md`](./technical-design/shared/01-architecture.md) | System diagram — clients, edge, core, data, external |
| 02 | [`02-database-schema.md`](./technical-design/shared/02-database-schema.md) | **Overview only** — pointers to `enums-tables-design/tables/postgresql-schema.md` (canonical DDL, 38 tables, 27 enums) and the per-table design docs |
| 03 | [`03-api-design.md`](./technical-design/shared/03-api-design.md) | API principles, response envelope, BFF vs internal surfaces |
| 04 | [`04-auth-rbac.md`](./technical-design/shared/04-auth-rbac.md) | JWT access + refresh rotation, four roles, login flows |
| 05 | [`05-error-handling.md`](./technical-design/shared/05-error-handling.md) | Error response format, HTTP mapping, error catalog |
| 06 | [`06-naming-conventions.md`](./technical-design/shared/06-naming-conventions.md) | TS + BFF/domain naming (enforced by ESLint) |
| 07 | [`07-logging-monitoring.md`](./technical-design/shared/07-logging-monitoring.md) | Pino structured logs + Sentry |
| 08 | **[`08-testing-strategy.md`](./technical-design/shared/08-testing-strategy.md)** | **The 7 critical E2E flows — your definition of done** |
| 09 | [`09-decisions-adrs.md`](./technical-design/shared/09-decisions-adrs.md) | ADRs — **ADR-008 (BFF-per-frontend) is the linchpin, read twice** |
| 10 | [`10-aba-payment.md`](./technical-design/shared/10-aba-payment.md) | ABA PayWay integration |
| 11 | [`11-design-system.md`](./technical-design/shared/11-design-system.md) | Typography (Inter + Noto Sans Khmer), color tokens, Khmer rules |
| 12 | [`12-cross-system.md`](./technical-design/shared/12-cross-system.md) | Full state machine and cross-actor event flows |

---

## 5. Surface-specific build packs

When you start on a specific app, open these in order. They contain the PRD, user flows, wireframes, and API contracts for that surface.

### Backend (`xfos/backend/api`)

1. [`technical-design/backend/00-overview.md`](./technical-design/backend/00-overview.md) — backend architecture blueprint
2. [`technical-design/backend/01-module-structure.md`](./technical-design/backend/01-module-structure.md) — NestJS module wiring (BFF + domains)
3. [`technical-design/backend/02-sequence-diagrams.md`](./technical-design/backend/02-sequence-diagrams.md) — seven key flows with mermaid diagrams
4. [`technical-design/backend/03-domain-boundaries.md`](./technical-design/backend/03-domain-boundaries.md) — module ownership map + no-cross-domain import rules
5. Plus **all 12 files under `technical-design/shared/`** (section 4 above).

### Storefront (`xfos/frontend/storefront`)

1. [`technical-design/storefront/00-overview.md`](./technical-design/storefront/00-overview.md) — product spec + device constraints
2. [`technical-design/storefront/01-e2e-scenarios.md`](./technical-design/storefront/01-e2e-scenarios.md) — four customer journeys (kiosk cash, kiosk ABA QR, dine-in multi-round, same-visit return)
3. [`technical-design/storefront/02-user-flows.md`](./technical-design/storefront/02-user-flows.md)
4. [`technical-design/storefront/03-home-design.md`](./technical-design/storefront/03-home-design.md)
5. [`technical-design/storefront/04-nextjs-architecture.md`](./technical-design/storefront/04-nextjs-architecture.md)
6. [`technical-design/storefront/05-crm-telegram.md`](./technical-design/storefront/05-crm-telegram.md)
7. [`technical-design/storefront/06-api-contracts.md`](./technical-design/storefront/06-api-contracts.md) — `/api/v1/storefront/*` contract
8. [`technical-design/storefront/07-ux-review.md`](./technical-design/storefront/07-ux-review.md)

### Kitchen (`xfos/frontend/kitchen`)

1. [`technical-design/kitchen/00-prd.md`](./technical-design/kitchen/00-prd.md) — kitchen product spec + architecture
2. [`technical-design/kitchen/01-e2e-scenarios.md`](./technical-design/kitchen/01-e2e-scenarios.md) — kitchen staff flows
3. [`technical-design/kitchen/02-user-flows.md`](./technical-design/kitchen/02-user-flows.md)
4. [`technical-design/kitchen/03-ui-design.md`](./technical-design/kitchen/03-ui-design.md) — tablet landscape layout, color states
5. [`technical-design/kitchen/04-api-contracts.md`](./technical-design/kitchen/04-api-contracts.md) — `/api/v1/kitchen/*` contract

### Merchant Portal (`xfos/frontend/admin`)

1. [`technical-design/merchant-portal/00-overview.md`](./technical-design/merchant-portal/00-overview.md) — product spec, two roles (OWNER, MANAGER)
2. [`technical-design/merchant-portal/01-e2e-scenarios.md`](./technical-design/merchant-portal/01-e2e-scenarios.md) — onboarding + daily flows
3. [`technical-design/merchant-portal/02-user-flows.md`](./technical-design/merchant-portal/02-user-flows.md)
4. [`technical-design/merchant-portal/03-ui-design.md`](./technical-design/merchant-portal/03-ui-design.md)
5. [`technical-design/merchant-portal/04-api-contracts.md`](./technical-design/merchant-portal/04-api-contracts.md) — `/api/v1/admin/*` contract

### Platform Portal (`xfos/frontend/platform-admin`)

1. [`technical-design/platform-portal/00-overview.md`](./technical-design/platform-portal/00-overview.md) — internal-only tool, PLATFORM_ADMIN role only
2. [`technical-design/platform-portal/01-e2e-scenarios.md`](./technical-design/platform-portal/01-e2e-scenarios.md) — ops workflows
3. [`technical-design/platform-portal/02-user-flows.md`](./technical-design/platform-portal/02-user-flows.md)
4. [`technical-design/platform-portal/03-isolation-design.md`](./technical-design/platform-portal/03-isolation-design.md) — IP allowlist + JWT double-wall
5. [`technical-design/platform-portal/04-api-contracts.md`](./technical-design/platform-portal/04-api-contracts.md) — `/api/v1/platform-admin/*` contract

---

## 6. The non-negotiable rules

These are enforced by ESLint, by code review, by CHECK constraints, and by the architecture itself. Memorize them.

### Application-layer rules (PRD §7)

1. **`tenantId` from JWT only.** Never read `tenantId` from request body, query string, or path param. The `TenantGuard` reads it from the JWT claim.
2. **Three UI tiers, no cross-imports.** `@platform/ui-customer` (storefront, kitchen) cannot import from `@platform/ui-admin` (merchant portal). `platform-admin` imports from neither.
3. **Socket.io rooms = `tenant_{id}`.** Cross-tenant event bleed is prevented by room naming, not by filtering. Every emit goes to a tenant room.
4. **BullMQ for kitchen tickets, payments, notifications.** These cannot be fire-and-forget. The job must survive an API restart.
5. **Khmer-first i18n.** Khmer (`km`) and English (`en`) via `next-intl`. Missing Khmer falls back to English.
6. **One backend, no microservices split.** Modular monolith stays modular monolith until Phase 3. Hexagonal makes the future split mechanical.
7. **Prisma is the single source of truth for the DB.** No hand-written migrations beyond `xfos/database/scripts/20260410_mvp_hardening.sql` (which adds CHECKs, partial indexes, generated columns, and helper functions Prisma DSL doesn't express). No RLS policies.

### Schema-level rules (locked 2026-04-25/26 — see [`enums-tables-design/`](./enums-tables-design/) and [`design-discussions/`](./design-discussions/))

8. **Composite PK `(tenant_id, id)` for every tenant-scoped table.** Cross-tenant FKs are composite. Cross-tenant linking is impossible by construction. **No parity triggers anywhere.**
9. **Money is INTEGER cents.** Every monetary column has `CHECK (x_cents >= 0)`; total formulas are CHECK-enforced.
10. **`version INTEGER` (OCC) on user-writable rows.** Concurrent writers race-safe; mismatches → 409.
11. **Lifecycle status enums + sibling reason enums.** Lifecycle stays minimal (`OrderStatus`); the *why* of terminal transitions lives in a sibling (`OrderCancellationReason`) gated by CHECK.
12. **Snapshot + live-FK pair** for downstream rows that must survive renames/deletes (`orders.table_ref` snapshot + `orders.table_id` FK; `order_items` JSONB snapshots).
13. **Bilingual content inline** (`name_km` required + `name_en` optional). No translation tables.
14. **All append-only logs share the actor-triad shape** (`actor_type` + `actor_label` + `request_id`). One `request_id`-keyed query reconstructs an entire request lifecycle across `audit_logs` + `order_status_history` + `kitchen_ticket_events` + `idempotency_keys`.
15. **Idempotency keys verify request body** via `SHA-256(body)`. Same key + different body → `409 Conflict`, never the cached response.

---

## 7. The four invariants (from PRD §6.3)

The architecture dies if any of these break:

1. **The hexagonal flow.** Dependency arrow points inward: `api → application → core ← infra`. `core` never imports a framework.
2. **`core/` is sacred.** Pure TypeScript. Allowed: Zod (for validation). Forbidden: Prisma, NestJS, BullMQ, Socket.io, React.
3. **`backend/shared/` is infrastructure-only.** ~15 files max. Allowed: Prisma wrapper, `@CurrentTenant()` decorator, exception filters, Pino logger, in-process event bus. Forbidden: anything mentioning `order`, `bill`, `menu`, `kitchen`, `payment`, `customer`.
4. **Handlers translate, use cases decide.** Event handlers receive events and call use cases. Zero business logic, zero `if` statements in handlers.

---

## 8. Definition of done — the seven E2E flows

A feature is shipped when all seven of these still pass in Playwright. The full spec is in [`technical-design/shared/08-testing-strategy.md`](./technical-design/shared/08-testing-strategy.md).

1. **Kiosk order** — submit → kitchen → complete
2. **Dine-in multi-round** — multiple orders → one bill → paid
3. **Kitchen ticket lifecycle** — NEW → PREPARING → READY → COMPLETED
4. **Merchant onboarding** — setup checklist → go-live
5. **Khmer i18n** — all text in both languages
6. **Order status page** — polling, 15–20s, reflects kitchen state
7. **Same-visit order banner** — storefront kiosk, localStorage, TTL

**Never mock the database in E2E tests.** Run against the real test database on port 5433.

---

## 9. Optional deeper dives

Reference material — not required to build, but useful as a lookup:

- [`full_details_of_each_tech_stack.md`](./full_details_of_each_tech_stack.md) — deeper tech-stack reference than PRD §5. Use it when you need to know exactly where each tool is applied.

---

## 10. What's in `archive/`

Historical review docs, adversarial stress tests, and earlier design iterations that have been superseded by the PRD and `technical-design/`. **You should not need anything in `archive/` to build.** They are kept only for history and traceability.

---

## Where to start right now

1. Read §1–§2 of this README (you just did).
2. Open [`XFOS-PRD.md`](./XFOS-PRD.md) and read it cover to cover. §4.3 and §8 are the narrative walkthrough — follow the customer-scans-QR flow there.
3. Open [`enums-tables-design/tables/postgresql-schema.md`](./enums-tables-design/tables/postgresql-schema.md) to see the full canonical schema (38 tables, 27 enums, all CHECK constraints documented). Pair it with [`xfos/database/prisma/schema.prisma`](../../xfos/database/prisma/schema.prisma) which is the executable mirror.
4. Come back to this README and pick the surface-specific build pack (§5) for whichever app you are starting on.

Welcome aboard. Build it exactly as designed.
