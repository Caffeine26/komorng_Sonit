# Start Here — New Engineer Guide

Welcome to the XFOS technical design docs. This folder is the source of truth for how the system is designed, before a line of code is written. Read this before touching any code.

> **Folder layout is decided elsewhere.** The authoritative description of the monorepo structure (`backend/` · `frontend/` · `contracts/` · `database/` · `infra/`), the four hexagonal layers every backend domain uses, the rule that each frontend app is fully self-contained, **and the BFF-per-frontend rule (ADR-008)** all live in [`../folder_structure_and_decision.md`](../folder_structure_and_decision.md). Read §1, §12, and **§12.3a** there before you open the code. Any doc in this folder that disagrees with it is stale — that file wins.

> **Critical architectural rule (ADR-008):** Each browser frontend has its own BFF NestJS module (`backend/api/src/modules/<bff>/`) and calls **only** that BFF's HTTP surface (`/api/v1/<bff>/*`). Domain APIs (`/api/v1/internal/<domain>/*`) are for scripts, integrations, and admin tools — never for browser frontends. The BFF use cases call domain use cases via DI (not HTTP). See [`shared/09-decisions-adrs.md`](shared/09-decisions-adrs.md) ADR-008 for the full rationale.

---

## What is XFOS?

XFOS (XWater Food Ordering System) is a multi-tenant food ordering SaaS for the Cambodian market. Restaurants use it to offer QR-based digital ordering without a custom app. A customer scans a QR code, browses the menu, orders, and tracks their food — all in the browser.

**4 apps. 1 backend. 1 monorepo.**

| App | Who uses it | URL |
|---|---|---|
| **Storefront** | Customers (guests, no login) | `storefront.app/store/{qrToken}` |
| **Kitchen App (KDS)** | Kitchen staff | `kitchen.xfos.app` |
| **Merchant Portal** | Restaurant owners/managers | `admin.xfos.app` |
| **Platform Portal** | XFOS team (us) | `platform.xfos.app` |

**Tech stack at a glance:** Next.js 14 (App Router) for all four frontends, NestJS + TypeScript for the API, PostgreSQL + Prisma, Redis + BullMQ, Socket.io for real-time, Telegram for CRM, ABA PayWay for payments.

---

## Folder Structure

```
playbook/technical-design/
│
├── 00-start-here.md          ← You are here
├── 00-index.md               ← Full document index
│
├── shared/                   ← Cross-app architecture (read first)
│   ├── 01-architecture.md
│   ├── 02-database-schema.md
│   ├── 03-api-design.md
│   ├── 04-auth-rbac.md
│   ├── 05-error-handling.md
│   ├── 06-naming-conventions.md
│   ├── 07-logging-monitoring.md
│   ├── 08-testing-strategy.md
│   ├── 09-decisions-adrs.md
│   ├── 10-aba-payment.md
│   ├── 11-design-system.md
│   └── 12-cross-system.md    ← State machines, real-time events, actor connections
│
├── storefront/               ← Customer-facing mobile web app
├── kitchen/                  ← Kitchen display system (tablet PWA)
├── merchant-portal/          ← Restaurant admin portal
├── platform-portal/          ← Internal ops portal
└── backend/                  ← NestJS API
```

---

## Reading Paths by Role

### Building the Storefront

| Step | File | Why |
|---|---|---|
| 1 | `shared/01-architecture.md` | Understand the overall system |
| 2 | `shared/12-cross-system.md` | How the storefront connects to other apps |
| 3 | `storefront/00-overview.md` | What the app does, what it doesn't do |
| 4 | `storefront/01-e2e-scenarios.md` | Full customer journeys (kiosk, dine-in, open-tab) |
| 5 | `storefront/02-user-flows.md` | User flow diagrams |
| 6 | `storefront/03-home-design.md` | Mobile layout, navigation, features |
| 7 | `storefront/06-api-contracts.md` | Exactly which endpoints the app calls |
| 8 | `storefront/04-nextjs-architecture.md` | Next.js patterns for this app |
| 9 | `storefront/05-crm-telegram.md` | Telegram opt-in flow |
| 10 | `shared/04-auth-rbac.md` | Auth — no login for storefront, but auth context matters |

### Building the Kitchen App

| Step | File | Why |
|---|---|---|
| 1 | `shared/12-cross-system.md` | State machines + real-time event flow |
| 2 | `kitchen/00-prd.md` | Product requirements |
| 3 | `kitchen/01-e2e-scenarios.md` | Kitchen staff journey |
| 4 | `kitchen/02-user-flows.md` | User flow diagrams |
| 5 | `kitchen/03-ui-design.md` | Ticket board, ticket card specs |
| 6 | `kitchen/04-api-contracts.md` | Endpoints + WebSocket events |
| 7 | `shared/04-auth-rbac.md` | JWT + roles for kitchen staff |

### Building the Merchant Portal

| Step | File | Why |
|---|---|---|
| 1 | `merchant-portal/00-overview.md` | What the portal does |
| 2 | `merchant-portal/01-e2e-scenarios.md` | Onboarding (Scenario F) + daily ops (Scenario G) |
| 3 | `merchant-portal/02-user-flows.md` | Setup flow, menu management flow |
| 4 | `merchant-portal/03-ui-design.md` | Screen layouts, navigation |
| 5 | `merchant-portal/04-api-contracts.md` | Admin API endpoints |
| 6 | `shared/04-auth-rbac.md` | JWT + TENANT_OWNER / TENANT_MANAGER roles |

### Building the Platform Portal

| Step | File | Why |
|---|---|---|
| 1 | `platform-portal/00-overview.md` | What it does, who uses it |
| 2 | `platform-portal/01-e2e-scenarios.md` | Merchant onboarding scenario (Scenario H) |
| 3 | `platform-portal/02-user-flows.md` | Onboarding flow diagram |
| 4 | `platform-portal/03-isolation-design.md` | Security isolation design (ADR-006) |
| 5 | `platform-portal/04-api-contracts.md` | Platform Admin API endpoints |
| 6 | `shared/04-auth-rbac.md` | PLATFORM_ADMIN role |

### Building the Backend API

| Step | File | Why |
|---|---|---|
| 1 | `backend/00-overview.md` | Module structure, deployment |
| 2 | `backend/01-module-structure.md` | Full monorepo folder layout |
| 3 | `backend/03-domain-boundaries.md` | Which module owns what, cross-module rules |
| 4 | `backend/02-sequence-diagrams.md` | Request flows for key operations |
| 5 | `shared/02-database-schema.md` | Full PostgreSQL schema |
| 6 | `shared/03-api-design.md` | API principles, response envelope, pagination |
| 7 | `shared/04-auth-rbac.md` | JWT, RBAC, tenant isolation |
| 8 | `shared/05-error-handling.md` | Error codes, response format |
| 9 | `shared/07-logging-monitoring.md` | Logging patterns, alerting |
| 10 | `shared/10-aba-payment.md` | ABA PayWay integration details |

### Understanding the Big Picture (any role)

Read in this order:
1. `shared/01-architecture.md` — system diagram
2. `shared/12-cross-system.md` — how all actors connect
3. `storefront/01-e2e-scenarios.md` — full customer journeys (most important for product intuition)
4. `shared/09-decisions-adrs.md` — why we made key tech choices

---

## Key Concepts to Know Before Writing Code

**Tenant isolation** — every table has `tenant_id`. Every query filters by it. The `TenantGuard` in NestJS reads `tenantId` from the JWT and injects it into the request. Never trust `tenantId` from the request body.

**Service models** — three models with different payment timing:
- `STALL_KIOSK` + `PAY_PER_ORDER` — customer pays at each order (default kiosk)
- `DINE_IN_TABLE` + `PAY_AFTER_FULFILLMENT` — table orders multiple rounds, pays at the end
- `STALL_OPEN_TAB` + `PAY_ON_SESSION_CLOSE` — Cambodia open-tab: multiple rounds, single bill, cash at end

**Cart is in-memory only** — the storefront cart is React state. It is NOT stored in localStorage. It is lost on page refresh. This is intentional — sessions are 2–5 minutes. Only the order reference (`{ orderNumber, orderId, submittedAt }`) is stored in localStorage with a 5h TTL after submission.

**Menu layout auto-detects** — if the merchant has 0–1 categories: flat 2-column grid. If 2+ categories: category tabs. No config required.

**Real-time is Kitchen-only** — WebSocket push is only for the kitchen app. The storefront uses polling (every 15–20s) for order status. This keeps the storefront stateless and simple.

**Telegram for CRM** — after order confirmation, the storefront prompts the customer to connect Telegram. The platform stores `chat_id` as a customer identity. Merchants never get the `chat_id` directly. See `storefront/05-crm-telegram.md`.

---

## Related Documents

- [`../XFOS—PRD.md`](../XFOS-PRD.md) — master PRD: product, MVP scope, architecture, tech stack, non-negotiable rules, roadmap, and onboarding. Single source of narrative truth for the project.
- [`../README.md`](../README.md) — handoff index with reading order, surface-specific build packs, and the 7 non-negotiable rules at a glance.
