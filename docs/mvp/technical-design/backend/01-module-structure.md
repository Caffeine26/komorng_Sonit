# Backend — NestJS Module Structure

> **The authoritative folder layout is not in this file.** It lives in
> [`../../folder_structure_and_decision.md`](../../folder_structure_and_decision.md)
> — read §1 (the four invariants), §2 (high-level tree), §3 (detailed tree),
> §12 (frontend app isolation), **and §12.3a (the BFF rule, ADR-008)** before
> opening any source code.
>
> This file documents the **NestJS-specific patterns** used inside both layers
> of the backend:
>
> - **`backend/api/src/modules/<bff>/`** — BFF NestJS modules (one per browser frontend, ADR-008)
> - **`backend/api/src/domains/<domain>/`** — domain modules with the four hexagonal layers
>
> It assumes you've already read the decision doc.

---

## 1. The monorepo at a glance

```
xfos/
├── backend/api/              ← @xfos/backend-api — ONE NestJS package
│   └── src/
│       ├── main.ts
│       ├── app.module.ts                    ← imports BFFs + domains + Prisma + Health
│       ├── shared/                          ← infra glue only — Invariant 3
│       │   └── guards/                      ← InternalOnlyGuard, ServiceTokenGuard (3 walls)
│       ├── modules/                         ← ⭐ BFF layer (ADR-008)
│       │   ├── storefront/                  ← /api/v1/storefront/*
│       │   ├── kitchen/                     ← /api/v1/kitchen/*
│       │   ├── admin/                       ← /api/v1/admin/*
│       │   └── platform-admin/              ← /api/v1/platform-admin/*
│       └── domains/                         ← internal /api/v1/internal/<X>/* (3-walled)
│           ├── order/        ← REFERENCE domain, all four layers
│           ├── auth/
│           ├── tenant/
│           ├── catalog/
│           ├── billing/
│           ├── kitchen/
│           └── onboarding/
│
├── frontend/                 ← four self-contained Next.js apps — §12
│   ├── storefront/   (port 3000)            ← calls @xfos/contracts-bff-storefront ONLY
│   ├── kitchen/      (port 3001)            ← calls @xfos/contracts-bff-kitchen ONLY
│   ├── admin/        (port 3002)            ← calls @xfos/contracts-bff-admin ONLY
│   └── platform-admin/ (port 3003)          ← calls @xfos/contracts-bff-platform-admin ONLY
│
├── contracts/                ← workspace packages of Zod schemas
│   ├── enums/                                ← shared enums (frontend may import)
│   ├── bff-storefront/                       ← ⭐ BFF contracts (frontend may import)
│   ├── bff-kitchen/
│   ├── bff-admin/
│   ├── bff-platform-admin/
│   └── order/ auth/ catalog/ billing/ kitchen/ tenant/ onboarding/   ← domain contracts (backend-internal only)
│
├── database/                 ← ONE Prisma schema
│   ├── prisma/schema.prisma
│   └── seeds/
│
├── infra/                    ← docker-compose + Railway deploy
└── scripts/                  ← create-domain.ts, create-frontend-app.ts
```

Workspace packages (see `pnpm-workspace.yaml`):
- `backend/api` — the single NestJS package
- `frontend/{storefront,kitchen,admin,platform-admin}` — four independent apps
- `contracts/*` — eight Zod packages
- `database` — the Prisma schema

**There is no `frontend/shared/`.** Per §12 of the decision doc, each
frontend app pins its own deps, owns its own UI primitives (shadcn installed
locally), and deploys independently. The only package any frontend imports
from outside its own folder is `@xfos/contracts-*`.

---

## 2. Four hexagonal layers per domain

```
backend/api/src/domains/<name>/
├── core/                     ← pure TypeScript — no framework, no ORM, no transport
│   ├── entities/                  (rich domain objects with invariants)
│   ├── value-objects/             (Money, Email, Role — immutable, validated)
│   ├── services/                  (pure domain functions)
│   ├── events/                    (plain-TS event types)
│   ├── ports/                     (interfaces the use cases need from outside)
│   └── errors/                    (domain-specific errors extending DomainError)
│
├── application/              ← use cases — orchestrators only
│   ├── use-cases/                 (one file per business action)
│   ├── queries/                   (read-side; CQRS-lite)
│   └── handlers/                  (event → use case — TRANSLATORS ONLY, Invariant 4)
│
├── infra/                    ← adapters — implements ports from core/ports
│   ├── repositories/              (PrismaXxxRepository)
│   ├── mappers/                   (Prisma row ↔ domain entity)
│   ├── publishers/                (EventPublisher adapter)
│   └── <domain>-infra.module.ts   (NestJS module wiring port → adapter)
│
├── api/                      ← the ONLY layer that knows about HTTP
│   ├── controllers/
│   ├── dto/                       (imports Zod schemas from contracts/<domain>/)
│   ├── presenters/                (domain entity → DTO)
│   └── <domain>.module.ts         (THE module exported to app.module.ts)
│
├── index.ts                  ← only exports the NestJS module + event types
└── README.md                 ← "what this domain owns / how to add a use case / how to debug"
```

**Dependency arrow (compile-time):** `api → application → core ← infra`.
Always inward. `core` imports nothing except plain TS + Zod. `infra`
implements port interfaces from `core/ports/`. `api` calls use cases, never
reaches into `infra`. This is enforced by per-layer ESLint rules in
`backend/api/.eslintrc.cjs` — see §3.4 of the decision doc for the exact
config.

The **reference fully-expanded domain is `order/`**. Copy its shape when
scaffolding new ones (or just run `pnpm create-domain <name>`).

---

## 3. NestJS wiring patterns

### 3.1 Port as an injection token

Each port gets a `Symbol` used as the NestJS DI token. Keeps interfaces
framework-free while NestJS can still inject a concrete implementation.

```typescript
// backend/api/src/domains/order/core/ports/order.repository.port.ts
export interface OrderRepository {
  save(order: Order): Promise<void>;
  findByToken(token: string): Promise<Order | null>;
}
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
```

```typescript
// backend/api/src/domains/order/application/use-cases/submit-order.use-case.ts
@Injectable()
export class SubmitOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
  ) {}
  // ...
}
```

### 3.2 Wiring port → adapter in the domain's Nest module

The ONLY place port ↔ adapter is bound. Swap the `useClass` to move between
in-memory (default, no DB needed) and Prisma (real DB).

```typescript
// backend/api/src/domains/order/api/order.module.ts
@Module({
  controllers: [OrderController],
  providers: [
    SubmitOrderUseCase,
    {
      provide: ORDER_REPOSITORY,
      useClass: InMemoryOrderRepository,
      // useClass: PrismaOrderRepository,   // ← swap this line to go DB-backed
    },
  ],
  exports: [SubmitOrderUseCase],
})
export class OrderModule {}
```

The `InMemoryOrderRepository` is deliberate — it lets the backend boot and
serve `/api/v1/orders` **without any database**. Flip the provider to
`PrismaOrderRepository` once you've run `pnpm db:up && pnpm db:migrate`.
The use case and controller do **not** change — that's the hexagonal payoff.

### 3.3 Zod validation via `ZodValidationPipe`

Request bodies are validated against the schemas in `contracts/<domain>/`
using a generic `ZodValidationPipe`. **No `class-validator`** — the contract
is the single source of truth for both sides of the wire.

```typescript
// backend/api/src/domains/order/api/controllers/order.controller.ts
@Post()
async submit(
  @Body(new ZodValidationPipe(SubmitOrderSchema)) dto: SubmitOrderInput,
): Promise<OrderResponse> {
  const order = await this.submitOrderUseCase.execute({
    tenantId: /* from JWT via @CurrentTenant() */,
    items: dto.items,
  });
  return this.presenter.toResponse(order);
}
```

### 3.4 Root app module composition

`backend/api/src/app.module.ts` imports:
- `ConfigModule` (global) — reads env vars at boot
- `PrismaModule` (global, from `shared/prisma/`)
- `HealthModule` (from `shared/health/`)
- One NestJS module per domain (e.g. `OrderModule`) — each domain exposes
  exactly ONE module via `<domain>/api/<domain>.module.ts`

The `pnpm create-domain <name>` script at `scripts/create-domain.ts`
scaffolds all four layers and auto-registers the new module in
`app.module.ts`. See `scripts/README.md`.

### 3.5 Cross-domain communication — events, not direct calls

Domains never import each other's code. When the order domain needs to tell
the kitchen domain that an order was submitted, it publishes an event:

```
1. domains/order/application/use-cases/submit-order.use-case.ts
     → publishes `order.submitted` via EventPublisher port

2. domains/kitchen/application/handlers/on-order-submitted.handler.ts
     → receives the event (via NestJS @OnEvent or equivalent)
     → calls CreateKitchenTicketUseCase.execute({...})
     → Invariant 4: handlers TRANSLATE, they never decide
```

The in-process bus lives in `backend/api/src/shared/events/`. When (Phase 3
of the scaling timeline) `kitchen-realtime` is extracted into its own
service, the in-process `EventPublisher` adapter is swapped for a BullMQ /
NATS adapter — **no changes to `core/` or `application/` of either domain.**

### 3.6 Tenant isolation

Every tenant-scoped query **must** include `WHERE tenant_id = ?`, and the
`tenantId` comes from the JWT via `TenantGuard` → request context, **never**
from the request body. The rule is enforced at three layers:

- **Domain layer** — pure logic in `domains/tenant/core/services/tenant-isolation.service.ts`
- **Guard layer** — `domains/tenant/api/guards/tenant.guard.ts` reads the JWT
  claim and injects `tenantId` into the request
- **Prisma layer** — `shared/prisma/tenant-isolation.middleware.ts` is a
  safety net that throws if a query on a tenant-scoped table forgets the filter

See [`../shared/04-auth-rbac.md`](../shared/04-auth-rbac.md).

---

## 4. Scaffolding a new domain

```bash
pnpm create-domain promotions
```

The script creates `backend/api/src/domains/promotions/` with all four layer
folders, a stub port, an in-memory adapter, a `@Controller('promotions')`
exposing `GET /api/v1/promotions/health`, and a `PromotionsModule` — and
auto-registers that module in `app.module.ts`. Boot the backend (`pnpm
dev:backend`) and you'll see `Mapped {/api/v1/promotions/health, GET}` in
the log.

From there, follow the recipe in `domains/order/README.md` to add the first
use case.

---

## 5. What's NOT in this file

- **Folder structure.** See [`../../folder_structure_and_decision.md`](../../folder_structure_and_decision.md).
- **The four invariants.** See §1 of the decision doc. Violating them
  collapses the whole pattern — no exceptions.
- **Frontend layout.** See §12 of the decision doc. Each frontend app is
  self-contained, owns its own deps/config/UI primitives, deploys
  independently. There is no shared frontend package.
- **Database schema.** See [`../shared/02-database-schema.md`](../shared/02-database-schema.md)
  and `database/prisma/schema.prisma`.
- **API design (URL shape, envelopes, pagination).** See [`../shared/03-api-design.md`](../shared/03-api-design.md).
- **Deploy config.** See `infra/deploy/railway/railway.json` and each
  frontend app's `vercel.json` / `Dockerfile`.

---

## 6. Related documents

- [`../../folder_structure_and_decision.md`](../../folder_structure_and_decision.md) — **authoritative folder layout + invariants**
- [`00-overview.md`](./00-overview.md) — backend module overview, tech stack, deployment
- [`02-sequence-diagrams.md`](./02-sequence-diagrams.md) — request flows for kiosk / dine-in / auth / QR
- [`03-domain-boundaries.md`](./03-domain-boundaries.md) — which domain owns what, cross-domain rules
- [`../shared/04-auth-rbac.md`](../shared/04-auth-rbac.md) — JWT, RBAC, tenant isolation
- [`../shared/09-decisions-adrs.md`](../shared/09-decisions-adrs.md) — ADR-003 (monorepo), ADR-004 (Prisma), ADR-005 (Socket.io), ADR-006 (platform admin isolation)
