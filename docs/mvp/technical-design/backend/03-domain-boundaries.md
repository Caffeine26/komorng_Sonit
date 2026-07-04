# Backend — Domain Boundaries

> **Updated for ADR-008.** Module ownership is split into two layers:
> - **BFF modules** (`backend/api/src/modules/<bff>/`) own HTTP orchestration for one browser frontend each. They own NO entities.
> - **Domain modules** (`backend/api/src/domains/<X>/`) own entities and business rules. They expose internal HTTP under `/api/v1/internal/<X>/*` (3-walled).
>
> Browser frontends call only their BFF. Cross-domain coordination happens **only** via BFF use cases (DI) or in-process events. Domains MUST NOT import each other.

---

## Module Ownership Map (Two Layers)

### BFF layer — `backend/api/src/modules/<bff>/`

| BFF Module | Frontend it serves | Imports these domain modules |
|---|---|---|
| `StorefrontModule` | `frontend/storefront` | `OrderModule`, `CatalogModule`, `BillingModule`, `TenantModule` |
| `KitchenModule` (BFF) | `frontend/kitchen` | `KitchenDomainModule`, `OrderModule` |
| `AdminModule` | `frontend/admin` | `CatalogModule`, `OrderModule`, `BillingModule`, `TenantModule`, `OnboardingModule` |
| `PlatformAdminModule` | `frontend/platform-admin` | `TenantModule`, `BillingModule`, `OnboardingModule` |

A BFF module owns: its controllers (`@Controller('<bff>')`), its application use cases (orchestration only), and its `<bff>.module.ts` wiring. It does NOT own entities, repositories, or business rules.

### Domain layer — `backend/api/src/domains/<X>/`

| Domain | Owns | Does NOT own | Internal HTTP at |
|---|---|---|---|
| `AuthModule` | Login, token issuance, refresh, invite flow, password reset, role definitions | User creation beyond invite flow | `/api/v1/auth/*` (cross-cutting, NOT under `/internal/*`) |
| `TenantModule` | Tenant profile, settings, lifecycle, multi-tenant guard | QR contexts (now in catalog) | `/api/v1/internal/tenant/*` |
| `CatalogModule` | Categories, items, translations, availability, **QR contexts** | Pricing logic at order time (snapshot at submission) | `/api/v1/internal/catalog/*` |
| `OrderModule` | Order entity + state machine, order items, order submission, cancellation | Payment, kitchen dispatch | `/api/v1/internal/order/*` |
| `BillingModule` | Bills, payment attempts, ABA QR generation, ABA webhook handling | Order status transitions, kitchen dispatch | `/api/v1/internal/billing/*` |
| `KitchenDomainModule` | Kitchen tickets, lifecycle (NEW→PREPARING→READY→COMPLETED), Socket.io gateway, cash queue | Order creation, billing | `/api/v1/internal/kitchen/*` |
| `OnboardingModule` | Plans, subscriptions, provisioning, activation | Per-tenant business logic | `/api/v1/internal/onboarding/*` |
| `HealthModule` | `GET /health`, `GET /health/ready`, DB + Redis dependency checks | None | `/health` (no version prefix) |

> **What happened to `StorefrontModule` as a domain?** It is no longer a domain. The browser-facing storefront concerns (QR resolution, menu serving, order submission orchestration) live in `modules/storefront/` (BFF). Each underlying piece is owned by the appropriate domain (`tenant`, `catalog`, `order`, `billing`).
>
> **What happened to `WebhooksModule`?** ABA callback handling now lives inside `BillingModule` (`domains/billing/api/aba-webhook.controller.ts`). Telegram webhook handling moves into the owning domain's `infra/`. There is no catch-all `WebhooksModule`.
>
> **What happened to `NotificationsModule`?** Each domain owns its own outbound notifications via `infra/` adapters (e.g. `domains/billing/infra/telegram-notifier.ts`). No shared notifications module.

---

## Domain Responsibilities in Detail

### AuthModule

- Issues access tokens (15 min TTL) and refresh tokens (7 day TTL, stored in Redis)
- Invitation flow: generates HMAC-signed invite tokens, validates on `accept-invite`, creates user record
- Password reset: generates time-limited reset tokens, validates, updates password hash
- Does **not** know about tenants — only issues a JWT that contains `{ sub: userId, tenantId, roles[] }`

### StorefrontModule

- Resolves `qrToken` → tenant context (serviceModel, payTiming, paymentMethods)
- Serves the menu from Redis cache (5 min TTL) with Postgres fallback
- Validates cart items on order submission (checks `is_available`)
- Creates `order` and `order_session` records
- Delegates bill creation to `BillingModule` (in-process call)
- Delegates kitchen ticket creation to `KitchenModule` (in-process call)
- Handles the call-staff bell: emits `staff.callRequested` via the socket gateway
- Does **not** process payments — hands off to `BillingModule`

### KitchenModule

- Serves the active ticket queue to the kitchen app (filtered by `tenant_id`, sorted by `created_at`)
- Accepts status transition requests with validation (e.g. cannot go from NEW → COMPLETED)
- Emits `ticket.updated` and `ticket.completed` events via the socket gateway
- Cash confirmation (`POST /kitchen/bills/{id}/confirm-cash`) → delegates to `BillingModule`
- Does **not** create tickets — that is `StorefrontModule`'s responsibility

### BillingModule

- Creates bills and associates orders to bills
- Generates ABA QR codes via the ABA PayWay API (using platform's merchant credentials)
- Receives and validates ABA webhook callbacks (via `WebhooksModule` delegation)
- Calls ABA Check Transaction API to verify payment before marking as PAID
- Marks bills as PAID and triggers downstream: `order → CONFIRMED`, `kitchen_ticket → NEW`
- Does **not** know about the UI — all status transitions are reflected via WebSocket or polling

### NotificationsModule

- Listens to events from Billing and Kitchen via in-process event emitter (or BullMQ consumers)
- Sends Telegram messages for: order received, preparing, ready, paid
- Handles Telegram opt-in: stores `chat_id`, creates/upserts `customer` and `customer_merchant_relationship`
- Handles Telegram 403 (bot blocked): sets `opted_out_at`, stops retrying
- Does **not** decide when to send — it reacts to domain events

---

## Cross-Module Communication Rules

1. **In-process function calls** — modules may call each other's services directly within the same NestJS process. Use NestJS DI to inject the service. Avoid circular dependencies.
2. **Domain events (BullMQ)** — for async side effects (Telegram, email), use BullMQ jobs. The producer enqueues a job; the consumer handles it asynchronously. This decouples the main request path from slow I/O.
3. **No direct DB queries across module boundaries** — each module queries only the tables it owns. Cross-module data is fetched via the owning module's service.
4. **No `tenant_id` in request body** — always read from JWT via `TenantGuard`. If a module needs `tenantId`, it reads from `req.tenantId` (injected by the guard).

---

## Event Flow: Order Submission

```
StorefrontModule.createOrder(params)
  │
  ├─ validates cart items (own DB query on menu_items)
  ├─ creates order record (own table)
  │
  ├─ calls BillingModule.getOrCreateBill(tenantId, tableRef, sessionId)
  │   └─ returns billId
  │
  ├─ calls KitchenModule.createTicket(orderId, billId, items, serviceModel)
  │   ├─ creates kitchen_ticket record
  │   └─ emits socket event ticket.new → tenant room
  │
  ├─ stores order reference in response (orderToken for polling)
  │
  └─ (for ABA): calls BillingModule.generateAbaQr(billId, amount)
      └─ calls ABA PayWay API, creates payment_attempt
```

---

## Event Flow: ABA Payment Confirmed

```
WebhooksModule receives POST /webhooks/aba/callback
  │
  └─ delegates to BillingModule.handleAbaCallback(payload)
      ├─ looks up payment_attempt by external_ref
      ├─ calls ABA Check Transaction API (verify)
      ├─ marks payment_attempt → SUCCEEDED
      ├─ marks bill → PAID
      ├─ marks order → CONFIRMED
      ├─ calls KitchenModule.createTicket(orderId) [if ABA path — ticket created post-payment]
      │   └─ emits ticket.new socket event
      └─ enqueues NotificationsModule job: telegram.orderConfirmed
```

---

## Shared Infrastructure

These are not modules — they are infrastructure services injected into any module that needs them:

| Service | Purpose |
|---|---|
| `PrismaService` | DB access — all modules use this |
| `RedisService` | Cache, session store, token store |
| `SocketGateway` | WebSocket emit — injected into Kitchen and Storefront modules |
| `BullMQ queues` | Declared once, injected into producer modules; consumed by `NotificationsModule` |

---

## Folder Structure

The authoritative folder layout lives in
[`../../folder_structure_and_decision.md`](../../folder_structure_and_decision.md).
Summary for backend: every domain sits under `backend/api/src/domains/<name>/`
with four hexagonal layers:

```
backend/api/src/domains/<name>/
├── core/          ← pure TypeScript — entities, value objects, ports, domain errors
├── application/   ← use cases (orchestrators), queries, event handlers
├── infra/         ← Prisma / Redis / BullMQ / Socket.io adapters
└── api/           ← NestJS controllers, DTOs, the module exported to app.module.ts
```

Shared infrastructure (PrismaService, Nest filters/pipes, Pino logger, env
config, health endpoints) lives in `backend/api/src/shared/`. It contains **no**
domain knowledge — see Invariant 3 in the decision doc.

Notifications / Telegram / webhooks / BullMQ consumers are not a separate
module; they live inside the owning domain's `infra/` layer (e.g. ABA PayWay
client under `domains/billing/infra/aba-payway/`, the Telegram bot client
under `domains/notifications/infra/` once that domain is scaffolded). The
reference domain is `domains/order/` — see its README for the recipe.

See [`01-module-structure.md`](./01-module-structure.md) for the NestJS-specific
patterns used inside each domain (DI tokens, module wiring, event bus).
