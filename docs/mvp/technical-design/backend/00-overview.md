# Backend — Overview

> **Updated for ADR-008 (BFF-per-frontend, 2026-04-09).** The backend now exposes **two HTTP surfaces**: BFF surfaces (`/api/v1/<bff>/*`, one per browser frontend, in `backend/api/src/modules/<bff>/`) and internal domain surfaces (`/api/v1/internal/<domain>/*`, in `backend/api/src/domains/<domain>/api/`, behind 3 walls). See `../shared/09-decisions-adrs.md` ADR-008.

The backend is a **NestJS modular monolith** that serves all four browser apps via dedicated BFF modules and exposes its domain layer to internal consumers via a separate guarded surface. It also manages the WebSocket gateway for real-time kitchen updates.

---

## What this app is

A single NestJS process that:
- Serves **BFF surfaces** under `/api/v1/{storefront,kitchen,admin,platform-admin}/*` — one BFF per browser frontend
- Serves **internal domain surfaces** under `/api/v1/internal/<domain>/*` — gated by `InternalOnlyGuard` + `ServiceTokenGuard`, for scripts and integrations only
- Serves the cross-cutting **auth surface** at `/api/v1/auth/*`
- Manages a WebSocket gateway for real-time kitchen ticket events (rooms named `tenant_{tenantId}`)
- Processes async jobs (ABA payment verification, Telegram notifications, email) via BullMQ
- Handles ABA webhook callbacks from the payment provider
- Handles Telegram bot webhook callbacks for CRM opt-in

---

## Who calls it

| Caller | Surface | Auth |
|---|---|---|
| Storefront App (browser) | `/api/v1/storefront/*` (BFF) | Public + tenant context resolved at BFF entry |
| Kitchen App (browser) | `/api/v1/kitchen/*` (BFF) | Bearer JWT (`KITCHEN_STAFF` or above) |
| Merchant Portal (browser) | `/api/v1/admin/*` (BFF) | Bearer JWT (`TENANT_OWNER` or `TENANT_MANAGER`) |
| Platform Portal (browser) | `/api/v1/platform-admin/*` (BFF, renamed from `/platform`) | Bearer JWT (`PLATFORM_ADMIN`) |
| All four browser apps (auth) | `/api/v1/auth/*` (cross-cutting) | Public for login/refresh/forgot; Bearer for `/me` and `/logout` |
| CLI scripts, admin tools (Retool/Metabase), integrations, cron | `/api/v1/internal/<domain>/*` | Service token (`Authorization: Bearer <INTERNAL_API_SERVICE_TOKEN>`) + network restriction |
| ABA PayWay | `/api/v1/webhooks/aba/callback` | Signed payload (secret header) |
| Telegram | `/api/v1/webhooks/telegram` | Secret token header |

**Browser frontends do NOT call domain endpoints directly.** ESLint Rule 4 in each frontend's `.eslintrc.cjs` blocks raw domain contract imports.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS + TypeScript |
| HTTP server | Express adapter (shipped with `@nestjs/platform-express`) |
| Database | PostgreSQL (via Prisma ORM — single schema at `database/prisma/schema.prisma`) |
| Cache / Queue broker | Redis (Upstash) |
| Job queue | BullMQ |
| Real-time | Socket.io (NestJS gateway) |
| Auth | Custom JWT — access + refresh token |
| Validation | **Zod only** (no `class-validator`). Request bodies are validated per-controller via `ZodValidationPipe` using the schemas from `@xfos/contracts-*`. |
| Logging | Pino |
| Error tracking | Sentry |

---

## Module Structure (high-level)

The backend is **one** NestJS package (`@xfos/backend-api`) at `backend/api/`.
The structure has **two top-level groupings**:

1. **`modules/<bff>/`** — BFF layer, one per browser frontend. Pure orchestration. Owns no entities.
2. **`domains/<X>/`** — bounded contexts with the four hexagonal layers. Owns business rules.

The reference domain is `order/`. The reference BFF module is `storefront/`.

```
backend/api/src/
├── main.ts                      ← NestFactory bootstrap
├── app.module.ts                ← imports every BFF module + every domain module + PrismaModule + HealthModule
│
├── shared/                      ← infrastructure glue only — NO domain knowledge (Invariant 3)
│   ├── prisma/                  ← PrismaService + PrismaModule (single client)
│   ├── nestjs/
│   │   ├── pipes/               ← ZodValidationPipe (generic, used per-controller)
│   │   ├── filters/             ← DomainErrorFilter, UnknownErrorFilter
│   │   ├── interceptors/        ← RequestLoggingInterceptor
│   │   └── decorators/          ← @CurrentUser(), @CurrentTenant()
│   ├── guards/                  ← InternalOnlyGuard, ServiceTokenGuard (3-walls for /api/v1/internal/*)
│   ├── errors/                  ← base DomainError / NotFoundError / ValidationError
│   ├── events/                  ← in-process event bus infrastructure
│   ├── logger/                  ← Pino config with redaction
│   ├── config/                  ← typed env loader
│   └── health/                  ← GET /health, GET /health/ready
│
├── modules/                     ← ⭐ BFF layer (ADR-008) — one per browser frontend
│   ├── storefront/              ← /api/v1/storefront/* (customer mobile web)
│   │   ├── api/                       ← StorefrontController
│   │   ├── application/use-cases/     ← GetStorefrontContextUseCase, SubmitStorefrontOrderUseCase
│   │   └── storefront.module.ts       ← imports Order/Catalog/Tenant/Billing modules
│   ├── kitchen/                 ← /api/v1/kitchen/* (tablet PWA)
│   │   ├── api/
│   │   ├── application/use-cases/     ← ListKitchenTicketsUseCase, MarkTicketReadyUseCase
│   │   └── kitchen.module.ts          ← imports Kitchen/Order modules
│   ├── admin/                   ← /api/v1/admin/* (merchant portal)
│   │   ├── api/
│   │   ├── application/use-cases/     ← GetMenuOverviewUseCase, GetTodaySummaryUseCase
│   │   └── admin.module.ts            ← imports Catalog/Order/Billing/Tenant modules
│   └── platform-admin/          ← /api/v1/platform-admin/* (internal ops)
│       ├── api/
│       ├── application/use-cases/     ← ListTenantsUseCase, SuspendTenantUseCase
│       └── platform-admin.module.ts   ← imports Tenant/Billing modules
│
└── domains/                     ← bounded contexts, same four-layer shape each
    ├── order/                   ← REFERENCE domain (fully expanded)
    │   ├── core/                     ← pure TS — entities, value objects, services, ports, errors
    │   ├── application/              ← use cases, queries, event handlers — EXPORTED to BFF modules
    │   ├── infra/                    ← Prisma/Redis/Socket.io/BullMQ adapters (implements ports)
    │   └── api/                      ← OrderController @ /api/v1/internal/order/* (3-walled)
    ├── auth/                    ← identity, JWT, sessions, invitations (cross-cutting /api/v1/auth/*)
    ├── tenant/                  ← multi-tenant guard + tenant lifecycle (crown jewel)
    ├── catalog/                 ← categories, items, translations
    ├── billing/                 ← bills, payments, ABA PayWay integration, webhooks
    ├── kitchen/                 ← tickets, Socket.io gateway, status transitions
    └── onboarding/              ← sales-assisted tenant provisioning
```

**The BFF/domain split rule (ADR-008):**
- Domains contain business rules + entities. They expose internal HTTP via `domains/<X>/api/`.
- BFFs contain orchestration only. They expose public HTTP via `modules/<bff>/api/`.
- BFF use cases call domain use cases via DI. **Never via HTTP between modules.**
- Domains do NOT import each other. Cross-domain coordination = BFF use case OR in-process event.

**The rule for `shared/`:** if a file mentions a domain noun (`order`,
`tenant`, `bill`, `menu`, `kitchen`, `user`, `payment`, `customer`), it does
NOT belong in `shared/` — move it to the owning domain. Target: under
~15 files for the lifetime of XFOS.

**Cross-cutting concerns folded into domains:** things that used to be
standalone modules (`notifications`, `webhooks`) live inside the owning
domain's `infra/` layer instead. ABA PayWay client and webhook handler live
under `domains/billing/infra/aba-payway/`. The Telegram bot adapter lives
under its owning domain's `infra/`. There is no catch-all `webhooks` module.

See [`01-module-structure.md`](./01-module-structure.md) for NestJS wiring
patterns (DI tokens, module providers, in-memory vs. Prisma adapters) and
[`../../folder_structure_and_decision.md`](../../folder_structure_and_decision.md)
for the authoritative folder layout + the four invariants.

---

## Deployment

| Component | Platform | Notes |
|---|---|---|
| NestJS API | Railway | Single container, auto-deploy from `main` |
| PostgreSQL | Railway (managed) or Neon | See `shared/09-decisions-adrs.md` ADR-002 |
| Redis | Upstash | Serverless Redis; used for cache, queues, socket adapter |
| Vercel (Next.js apps) | Vercel | Storefront, Kitchen, Merchant Portal, Platform Portal |

---

## Key Design Decisions

- **Modular monolith, not microservices.** Domain modules are isolated by folder, share a single DB, and communicate in-process. Splitting to services is deferred until proven scale need.
- **BFF-per-frontend (ADR-008).** Each browser frontend has a dedicated NestJS module under `modules/<bff>/`. The frontend calls only its BFF; internal domain endpoints (`/api/v1/internal/<domain>/*`) are gated by 3 walls and not for browsers.
- **Domains do not call each other.** Cross-domain coordination happens in BFF use cases (via DI) or via in-process events. No `OrderModule` import inside `BillingModule` etc.
- **Prisma ORM.** Schema-as-code, type-safe queries, migration workflow. One `schema.prisma` is the source of truth for all DB tables.
- **Tenant isolation by convention + backstop.** Every query on a tenant-scoped table includes `WHERE tenant_id = ?`. The `TenantGuard` reads `tenantId` from the JWT claim and injects it into the request context. The API never trusts `tenantId` from the request body. **A Prisma extension enforces this at the query layer** so missing-where mistakes throw at runtime instead of leaking.
- **BullMQ for durability.** Payment jobs and Telegram notifications go through BullMQ (not direct HTTP or fire-and-forget). If the process restarts, jobs survive in Redis.
- **Socket.io for kitchen real-time.** Kitchen staff join a room per tenant on connect. Events are namespaced to `tenant_{id}` — cross-tenant bleed is impossible by design.

For all ADRs, see `shared/09-decisions-adrs.md`.
