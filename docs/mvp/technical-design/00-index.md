# Technical Design Documents

> **Updated for ADR-008 (BFF-per-frontend, 2026-04-09).** The architectural shape now in force:
> - **4 BFF modules** (`backend/api/src/modules/{storefront,kitchen,admin,platform-admin}/`) — one per browser frontend
> - **8 domain modules** (`backend/api/src/domains/<domain>/`) — internal-only HTTP under `/api/v1/internal/*`
> - **Cross-cutting auth** (`/api/v1/auth/*`) — shared across frontends
> - **Frontend `lib/api/<bff>.ts`** is the only place HTTP requests are built; features call it via `features/<x>/api.ts`
>
> Authoritative references:
> - [`shared/09-decisions-adrs.md`](shared/09-decisions-adrs.md) — ADR-008 in full
> - [`../folder_structure_and_decision.md`](../folder_structure_and_decision.md) §12.3a — the BFF rule with diagrams
> - [`shared/01-architecture.md`](shared/01-architecture.md) — the system diagram with BFFs
> - [`shared/03-api-design.md`](shared/03-api-design.md) — endpoint catalog by BFF surface

## Overview

- **Formal Name** : TBD
- **Temporary Service Name** : XFOS (XWater Food Ordering System)
- **Brief Product Description** : [V1 PRD](https://docs.google.com/document/d/1f_2398AU31feC6Rqy5F0Lk_HA-cUps0qmU6O-MLIeJ4/)

## What is XFOS?

XFOS is a multi-tenant food ordering system that helps food stalls, kiosks, and dine-in restaurants operate their business through QR-code digital ordering, real-time kitchen integration and operations.

The product starts by solving operational and commercial pain for restaurants:

- QR ordering for food stalls / kiosks and dine-in restaurants
- multilingual customer storefronts with Khmer and English support
- merchant admin portal for menu, settings, QR, and staff management
- kitchen app for order preparation workflow

## MVP Readiness Criteria

| Criteria | Definition |
| --- | --- |
| **Backend Ready** | Core API capabilities are complete for MVP, including auth, tenant isolation, ordering, kitchen, billing/payment, and onboarding flows. Endpoints are tested and deployed in production. |
| **Storefront App Ready** | Customers can complete the full mobile flow end-to-end for both kiosk and dine-in: scan QR, browse menu, place order, pay (where applicable), and track order status. |
| **Kitchen App Ready** | Kitchen staff can reliably receive new tickets in real time, update ticket lifecycle states (`NEW` → `PREPARING` → `READY` → `COMPLETED`), and recover queue state after reconnect. |
| **Merchant Portal Ready** | Restaurant owners/managers can independently complete setup and daily operations: configure profile/settings, manage menu and availability, generate/manage QR contexts, and manage team access. |
| **Platform Portal Ready** | Platform operators can onboard and provision tenants, monitor tenant lifecycle/status, and access essential system-level operational visibility needed to run MVP safely. |

## Definition of Done (for each criteria)

A component is **Ready** only when ALL of the following are true:

- [ ] Working end-to-end — usable by a real restaurant in production
- [ ] All features working as expected (no critical bugs blocking operations)
- [ ] All dependencies resolved (no waiting on external blockers)
- [ ] All tests passing (unit + integration + API tests in CI)
- [ ] All documentation complete (API docs, setup guide, config guide)
- [ ] All code reviewed and approved (minimum 1 reviewer for each PR)
- [ ] All code deployed to the production environment

---

## Documents

> **New here?** Start with [`00-start-here.md`](./00-start-here.md) — it gives you a reading path based on which app you are building.
>
> **Folder layout.** The authoritative description of the monorepo folder structure (backend/frontend/contracts/database/infra + hexagonal domain layers) is [`../folder_structure_and_decision.md`](../folder_structure_and_decision.md). Read its §1 (the four invariants) and §12 (frontend app isolation) before opening any source code. Anything in the backend/shared docs that disagrees with that file is stale — that file wins.

### Shared — Cross-App Architecture

| File | Description |
| --- | --- |
| [shared/01-architecture.md](./shared/01-architecture.md) | System architecture, tech stack, Mermaid diagrams |
| [shared/02-database-schema.md](./shared/02-database-schema.md) | Full PostgreSQL schema for all domains |
| [shared/03-api-design.md](./shared/03-api-design.md) | All REST endpoints by surface + request/response examples |
| [shared/04-auth-rbac.md](./shared/04-auth-rbac.md) | JWT strategy, RBAC, roles, tenant isolation |
| [shared/05-error-handling.md](./shared/05-error-handling.md) | Error codes, response format, middleware, client handling |
| [shared/06-naming-conventions.md](./shared/06-naming-conventions.md) | Code, DB, API, Git naming rules |
| [shared/07-logging-monitoring.md](./shared/07-logging-monitoring.md) | Pino setup, log levels, alerting rules, monitoring stack |
| [shared/08-testing-strategy.md](./shared/08-testing-strategy.md) | Test strategy, integration tests, E2E, CI pipeline |
| [shared/09-decisions-adrs.md](./shared/09-decisions-adrs.md) | ADRs: Docker, Database, ORM, Monorepo, Platform isolation |
| [shared/10-aba-payment.md](./shared/10-aba-payment.md) | ABA PayWay integration feasibility and design |
| [shared/11-design-system.md](./shared/11-design-system.md) | Fonts, colors, component specs, interaction states |
| [shared/12-cross-system.md](./shared/12-cross-system.md) | State machines, real-time events, cross-actor connections |

### Storefront — Customer-Facing Mobile Web App

| File | Description |
| --- | --- |
| [storefront/00-overview.md](./storefront/00-overview.md) | What this app is, who uses it, service models supported |
| [storefront/01-e2e-scenarios.md](./storefront/01-e2e-scenarios.md) | Step-by-step customer journeys: kiosk (cash + ABA), dine-in, open-tab |
| [storefront/02-user-flows.md](./storefront/02-user-flows.md) | Mermaid flow diagrams: order, Telegram opt-in, session recovery |
| [storefront/03-home-design.md](./storefront/03-home-design.md) | Mobile layout, bottom nav, onboarding guide, call-staff, order history |
| [storefront/04-nextjs-architecture.md](./storefront/04-nextjs-architecture.md) | Next.js App Router patterns for this app |
| [storefront/05-crm-telegram.md](./storefront/05-crm-telegram.md) | CRM & Telegram strategy: opt-in flow, data model, permission model |
| [storefront/06-api-contracts.md](./storefront/06-api-contracts.md) | All API endpoints the storefront calls + WebSocket events |
| [storefront/07-ux-review.md](./storefront/07-ux-review.md) | UX review and design decisions for the storefront |

### Kitchen App — Kitchen Display System (Tablet PWA)

| File | Description |
| --- | --- |
| [kitchen/00-prd.md](./kitchen/00-prd.md) | Product requirements for the Kitchen App |
| [kitchen/01-e2e-scenarios.md](./kitchen/01-e2e-scenarios.md) | Kitchen staff journey: full service session |
| [kitchen/02-user-flows.md](./kitchen/02-user-flows.md) | User flow diagrams for kitchen staff |
| [kitchen/03-ui-design.md](./kitchen/03-ui-design.md) | Ticket board layout, ticket card spec, call-staff alert |
| [kitchen/04-api-contracts.md](./kitchen/04-api-contracts.md) | Kitchen API endpoints + WebSocket events (subscribed + emitted) |

### Merchant Portal — Restaurant Admin Portal

| File | Description |
| --- | --- |
| [merchant-portal/00-overview.md](./merchant-portal/00-overview.md) | What the portal does, who uses it, device context |
| [merchant-portal/01-e2e-scenarios.md](./merchant-portal/01-e2e-scenarios.md) | Onboarding (Scenario F) and daily operations (Scenario G) |
| [merchant-portal/02-user-flows.md](./merchant-portal/02-user-flows.md) | Setup checklist flow, menu management flow |
| [merchant-portal/03-ui-design.md](./merchant-portal/03-ui-design.md) | Screen layouts: dashboard, menu, orders, settings, team, QR |
| [merchant-portal/04-api-contracts.md](./merchant-portal/04-api-contracts.md) | Admin API endpoints: catalog, QR, team, orders, settings |

### Platform Portal — Internal Ops Portal

| File | Description |
| --- | --- |
| [platform-portal/00-overview.md](./platform-portal/00-overview.md) | What the platform portal does, who uses it |
| [platform-portal/01-e2e-scenarios.md](./platform-portal/01-e2e-scenarios.md) | Merchant onboarding scenario (Scenario H) |
| [platform-portal/02-user-flows.md](./platform-portal/02-user-flows.md) | Platform admin user flow diagrams |
| [platform-portal/03-isolation-design.md](./platform-portal/03-isolation-design.md) | ADR-006: separate deployment, security isolation design |
| [platform-portal/04-api-contracts.md](./platform-portal/04-api-contracts.md) | Platform Admin API endpoints |

### Backend — NestJS API

| File | Description |
| --- | --- |
| [backend/00-overview.md](./backend/00-overview.md) | Module overview, deployment, key design decisions |
| [backend/01-module-structure.md](./backend/01-module-structure.md) | Monorepo layout, app and package structure |
| [backend/02-sequence-diagrams.md](./backend/02-sequence-diagrams.md) | Sequence diagrams: kiosk order, dine-in, kitchen, auth, QR |
| [backend/03-domain-boundaries.md](./backend/03-domain-boundaries.md) | Which module owns what, cross-module communication rules |

---

## Related Documents

- [`../XFOS — PRD.md`](../XFOS%20%E2%80%94%20PRD.md) — master PRD (product, architecture, MVP scope + phasing, roadmap, onboarding). Replaces the old `mvp.md`.
- [`../folder_structure_and_decision.md`](../folder_structure_and_decision.md) — authoritative monorepo folder layout + the four hexagonal invariants.
- [`../README.md`](../README.md) — the handoff index: surface-specific build packs, reading order, non-negotiable rules.

---

## Tech Stack Quick Reference

| Layer | Technology | Remarks |
| --- | --- | --- |
| Frontend | Next.js 14 (App Router) | One framework for all customer surfaces; App Router + RSC fit SEO and server-first data for storefronts; aligns with Vercel deployment. |
| Backend API | NestJS + TypeScript (Node.js) | Modular monolith with clear domain modules, DI, guards, and testable services; matches `shared/01-architecture.md` and Nest module layout. |
| ORM | Prisma | Schema-as-code, type-safe queries, migrations, and good fit for PostgreSQL + multi-tenant `tenant_id` patterns. |
| Database | PostgreSQL | Relational model for orders, billing, kitchen tickets; ACID; managed Postgres (Railway, Neon, RDS, or Supabase **DB-only** — no Supabase Auth/SDK; see `shared/09-decisions-adrs.md` ADR-002). |
| Cache / Queue | Redis (Upstash) + BullMQ | Redis for sessions, cache, and Socket.io adapter; BullMQ for durable jobs (payments, notifications, kitchen ticket creation) vs fire-and-forget pub/sub. |
| Real-time | Socket.io (NestJS gateway) | Kitchen ticket push; same Nest process as MVP; scale to multi-instance only with Redis adapter + sticky sessions (see `shared/01-architecture.md`). |
| Auth | Custom JWT (access + refresh) | Stateless API; refresh in `httpOnly` cookie; full control over tenant claims and roles without vendor lock-in. |
| UI | shadcn/ui + Tailwind CSS | Composable primitives, fast iteration, consistent theming across merchant and customer apps. |
| Validation | Zod | Shared runtime validation for API + forms; pairs with TS and Prisma. |
| Monorepo | pnpm + Turborepo | Workspace-aware installs, cacheable builds. Layout: `backend/` · `frontend/` · `contracts/` · `database/` · `infra/`. See [`../folder_structure_and_decision.md`](../folder_structure_and_decision.md) — authoritative source. |
| i18n | next-intl (English + Khmer) | Locale-aware routing and messages for App Router; product requirement for Cambodia market. |
| Testing | Vitest + Supertest + Playwright | Vitest for unit/integration speed; Supertest for HTTP contracts; Playwright for critical E2E flows. |
| Logging | Pino | Structured JSON logs, low overhead; stdout-friendly for Railway/Vercel log drains. |
| Error Tracking | Sentry | Grouped errors, stack traces, release tracking; optional performance for MVP. |
| Uptime | Betterstack | External uptime checks independent of your host; alerts before customers notice outages. |
| Deployment | Vercel (frontends) + Railway (API) | Vercel for Next.js; Railway for Nest API + Postgres/Redis adjacency; simple MVP ops path. |
