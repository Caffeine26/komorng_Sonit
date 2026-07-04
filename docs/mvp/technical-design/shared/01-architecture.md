# 02 — Architecture Diagram

> **Updated for ADR-008 (BFF-per-frontend, 2026-04-09).** The NestJS backend now exposes **two HTTP surfaces**:
>
> 1. **Public BFF surfaces** (`/api/v1/<bff>/*`) — one per browser frontend, lives in `backend/api/src/modules/<bff>/`. The frontend may call ONLY its BFF.
> 2. **Internal domain surfaces** (`/api/v1/internal/<domain>/*`) — for scripts and integrations, lives in `backend/api/src/domains/<domain>/api/`. Behind URL prefix + `ServiceTokenGuard` + `InternalOnlyGuard`.
>
> BFF use cases call domain use cases via DI (NOT via HTTP between modules). See `09-decisions-adrs.md` ADR-008 and `folder_structure_and_decision.md` §12.3a.

**Backend stack (MVP):** **NestJS** + **TypeScript**. The HTTP API, BFF modules, domain modules, guards, and Socket.io gateway run in one NestJS application (Node.js is the runtime only).

## High-Level System Architecture

```mermaid
graph TB
  subgraph Clients
    SF["Storefront App\nCustomer ordering experience"]
    MP["Portal\nMerchant setup + management"]
    KA["Kitchen App\nKitchen operations"]
    PA["Platform Admin Portal\nInternal ops"]
  end

  subgraph Edge
    CDN["CDN + WAF"]
    GW["API Gateway / Reverse Proxy\nRate limiting · Auth header · Routing"]
  end

  subgraph Core Platform
    WEB["Next.js Apps\nStorefront · Portal · Kitchen · Admin"]
    API["NestJS API\nModular monolith · TypeScript\n(HTTP + domain modules)"]
    RT["Real-time\nSocket.io · NestJS Gateway"]
    JOB["Background jobs\nBullMQ · Nest processors"]
  end

  subgraph Data Stores
    PG[(PostgreSQL)]
    RD[(Redis)]
  end

  subgraph External Services
    PAY["Payment Providers\nABA QR · Card Processor"]
    MSG["Email/SMS Provider"]
  end

  SF --> CDN
  MP --> CDN
  KA --> CDN
  PA --> CDN

  CDN --> WEB
  SF -->|HTTPS| GW
  MP -->|HTTPS| GW
  KA -->|HTTPS| GW
  PA -->|HTTPS| GW

  GW --> API
  KA -->|WebSocket| RT

  API --> PG
  API --> RD
  API --> JOB
  RT --> RD

  JOB --> PAY
  JOB --> MSG
```

---

## System Architecture Overview

```mermaid
graph TB
    subgraph Client Layer
        SF[Storefront App<br/>Next.js · Mobile Web]
        MP[Portal<br/>Next.js · Web]
        KA[Kitchen App<br/>Next.js PWA · Tablet]
        PA[Platform Admin Portal<br/>Next.js · Web]
    end

    subgraph API Gateway Layer
        GW[API Gateway / Reverse Proxy<br/>Nginx · Rate Limiting · Auth Header]
    end

    subgraph NestJS["NestJS backend · modular monolith"]
        subgraph BFFs["BFF layer (modules/&lt;bff&gt;) — one per browser frontend"]
            BSF[StorefrontModule<br/>/api/v1/storefront/*]
            BKT[KitchenModule<br/>/api/v1/kitchen/*]
            BAD[AdminModule<br/>/api/v1/admin/*]
            BPA[PlatformAdminModule<br/>/api/v1/platform-admin/*]
        end
        subgraph Domains["Domain layer (domains/&lt;X&gt;) — internal-only HTTP at /api/v1/internal/*"]
            AS[Auth module]
            TS[Tenant module]
            CS[Catalog module]
            OS[Order module]
            BS[Billing module]
            KS[Kitchen domain module]
            OB[Onboarding module]
        end
    end

    subgraph Real-Time Layer
        WS[Socket.io gateway<br/>NestJS · Kitchen push]
    end

    subgraph Data Layer
        PG[(PostgreSQL<br/>Primary DB)]
        RD[(Redis<br/>Cache + Sessions + Queue)]
    end

    subgraph Job Layer
        BQ[BullMQ queues<br/>Payment · Notifications · Kitchen ticket jobs]
    end

    subgraph External Integrations
        ABA[ABA QR<br/>Payment Gateway]
        CARD[Card Processor<br/>Stripe / local]
        EMAIL[Email Service<br/>Notifications]
    end

    SF -->|HTTPS /api/v1/storefront| GW
    MP -->|HTTPS /api/v1/admin| GW
    KA -->|HTTPS /api/v1/kitchen| GW
    PA -->|HTTPS /api/v1/platform-admin| GW

    KA -->|WebSocket| WS

    GW --> BSF
    GW --> BKT
    GW --> BAD
    GW --> BPA

    BSF -->|DI| OS
    BSF -->|DI| CS
    BSF -->|DI| BS
    BSF -->|DI| TS
    BKT -->|DI| KS
    BKT -->|DI| OS
    BAD -->|DI| CS
    BAD -->|DI| OS
    BAD -->|DI| BS
    BAD -->|DI| TS
    BPA -->|DI| TS
    BPA -->|DI| BS

    WS --> KS

    AS --> PG
    TS --> PG
    CS --> PG
    OS --> PG
    BS --> PG
    KS --> PG
    OB --> PG
    ADM --> PG

    TS --> RD
    CS --> RD
    OS --> RD

    BS --> BQ
    OB --> BQ

    BQ --> ABA
    BQ --> CARD
    BQ --> EMAIL

    OS -->|order.created event| KS
    BS -->|payment.confirmed event| OS
```

---

## Domain Responsibilities

Domains live in `backend/api/src/domains/<X>/`. They own business rules and entities. They expose internal HTTP routes under `/api/v1/internal/<X>/*` (3-walled, service-token only). **They do NOT call each other directly** — cross-domain coordination happens in BFF use cases or via in-process events.

| Domain | Owns | Called by which BFFs |
|---|---|---|
| `domains/auth` | JWT tokens, sessions, user identity | (cross-cutting — `/api/v1/auth/*` shared across all frontends) |
| `domains/tenant` | Tenant config, settings, theme, QR contexts | storefront, admin, platform-admin |
| `domains/catalog` | Categories, items, translations, availability | storefront, admin |
| `domains/order` | Orders, order items, order lifecycle | storefront, kitchen, admin, platform-admin |
| `domains/billing` | Bills, payments, payment attempts, settlement | storefront (pay-now), admin (reporting), platform-admin (cross-tenant) |
| `domains/kitchen` | Kitchen tickets, workflow states, readiness | kitchen, admin (order monitoring) |
| `domains/onboarding` | Plans, subscriptions, provisioning, activation | admin, platform-admin |

## BFF Module Responsibilities

BFFs live in `backend/api/src/modules/<bff>/`. They own NO entities or business rules — pure orchestration of domain use cases into UI-projected responses.

| BFF Module | Frontend it serves | Domains it imports |
|---|---|---|
| `modules/storefront` | `frontend/storefront` | tenant, catalog, order, billing |
| `modules/kitchen` | `frontend/kitchen` | kitchen, order |
| `modules/admin` | `frontend/admin` | catalog, order, billing, tenant, onboarding |
| `modules/platform-admin` | `frontend/platform-admin` | tenant, billing, onboarding |

---

## Multi-Tenant Isolation Model

```mermaid
graph LR
    REQ[Incoming Request] --> AM[JwtAuthGuard]
    AM -->|verify JWT| TM[TenantGuard]
    TM -->|resolve tenant_id| RC[Request context]
    RC -->|inject tenant_id| SVC[Domain service]
    SVC -->|WHERE tenant_id = ?| DB[(PostgreSQL)]

    style DB fill:#dbeafe
    style TM fill:#fef3c7
```

Every DB query on tenant-bound data **must** include `WHERE tenant_id = :tenantId`. This is enforced in repositories, not left to convention. Tenant and JWT checks run as **NestJS guards** (and related pipeline hooks), not ad-hoc framework-specific middleware.

---

## Data Flow — Kiosk Order (Pay Before)

```
Customer → QR Scan → Storefront loads (tenant + menu)
       → Cart built → Checkout
       → Order created (PENDING_PAYMENT)
       → Bill created (UNPAID)
       → Customer selects payment method
       → Payment attempt created (PENDING)
       → [ABA QR / Card] → Payment confirmed
       → Bill marked PAID
       → Order status → CONFIRMED
       → Kitchen ticket created (NEW)   ← AFTER payment confirmation
       → Kitchen: PREPARING → READY → COMPLETED
```

> **KIOSK RULE:** Kitchen ticket creation depends on payment method:
>
> | Payment method | MVP behaviour | Trigger |
> |---|---|---|
> | ABA QR / Card | Ticket created AFTER payment confirmed | `payment.confirmed` webhook → Billing Service → `createKitchenTicket()` |
> | Cash (MVP) | Ticket created IMMEDIATELY when cash payment is initiated | `POST /billing/bills/:billId/pay { method: CASH }` → Billing Service → `createKitchenTicket()` |
>
> **Why Billing Service fires the cash ticket (not Order Service):** The payment method is
> unknown at order creation — the customer selects Cash at the payment step. Firing from
> Billing Service after `pay { method: CASH }` is the first moment the service model +
> payment method combination is both known and confirmed. Order Service never sees the
> method selection directly.
>
> Rationale: In MVP the kiosk ticket is created only after payment is confirmed
> (see PRD §1.3 acceptance checklist). ABA QR is confirmed via webhook; cash is confirmed
> by counter staff tapping "Confirm Cash Received" in the kitchen app (`PENDING_CASH`
> gate). The kitchen ticket is enqueued via BullMQ after confirmation and surfaced via the
> `ticket.new` Socket.io event. See Flow 1 (ABA) and Flow 7 (cash) in
> `02-sequence-diagrams.md`.

---

## Data Flow — Dine-In Order (Pay After)

```
Customer → Table QR scan → Storefront loads (tenant + table context)
       → Cart built → Submit order
       → Order created (SUBMITTED)
       → Kitchen ticket created (NEW)   ← IMMEDIATELY on order submit
       → Kitchen: PREPARING → READY
       → [Customer may add more rounds, each creates another ticket]
       → Bill accumulates all orders (UNPAID)
       → End of meal: Staff collects payment
       → Payment recorded → Bill marked PAID
```

> **DINE-IN RULE:** Kitchen ticket is created immediately on order submission.
> Trigger: `order.created` event (status = SUBMITTED) → `createKitchenTicket()`.
> Rationale: Food preparation starts right away; payment happens at end of meal.

> **CRITICAL:** The `createKitchenTicket` trigger differs by service model AND payment method:
> - `service_model = DINE_IN_TABLE` → Order Service enqueues `create-kitchen-ticket` job immediately on `order.created`
> - `service_model = STALL_KIOSK + method = ABA_QR / CARD` → Billing Service enqueues job after `payment.confirmed` webhook
> - `service_model = STALL_KIOSK + method = CASH` → Billing Service enqueues job immediately when `POST /billing/bills/:billId/pay { method: CASH }` is processed
>
> Order Service never fires `createKitchenTicket` for kiosk orders — it has no visibility into
> the payment method selected. Billing Service owns the kiosk ticket trigger in both cash and
> digital paths.

---

## Real-Time Architecture (Kitchen)

```mermaid
sequenceDiagram
    participant O as Order Service
    participant B as Billing Service
    participant Q as BullMQ (Redis-backed)
    participant K as Kitchen Service
    participant WS as NestJS Socket.io gateway
    participant KA as Kitchen App

    Note over O,K: Path A — Dine-In (ticket fires at order creation)
    O->>Q: enqueue create-kitchen-ticket job { orderId, tenantId, serviceModel: DINE_IN_TABLE }
    Q->>K: worker picks up job (durable, retried on failure)
    K->>K: create kitchen ticket (NEW)
    K->>WS: emit ticket.new to room: tenant_{id}
    WS->>KA: push new ticket

    Note over B,K: Path B — Cash Kiosk MVP (ticket fires when customer selects Cash)
    B->>Q: enqueue create-kitchen-ticket job { orderId, tenantId, serviceModel: STALL_KIOSK }
    Q->>K: worker picks up job (durable, retried on failure)
    K->>K: create kitchen ticket (NEW)
    K->>WS: emit ticket.new to room: tenant_{id}
    WS->>KA: push new ticket

    Note over B,K: Path C — ABA QR / Card Kiosk (ticket fires after payment confirmed)
    B->>Q: enqueue create-kitchen-ticket job { orderId, tenantId, serviceModel: STALL_KIOSK }
    Q->>K: worker picks up job (durable, retried on failure)
    K->>K: create kitchen ticket (NEW)
    K->>WS: emit ticket.new to room: tenant_{id}
    WS->>KA: push new ticket
```

> **WHY BullMQ, NOT Redis pub/sub:** Redis pub/sub is fire-and-forget. If the Kitchen Service
> worker is restarting at the moment Order or Billing Service emits, the event is silently
> dropped and no kitchen ticket is ever created — a silent order loss. BullMQ (already in
> the stack for payment/notification jobs) persists jobs in Redis and retries on failure.
> Use `createKitchenTicketQueue` with `attempts: 3, backoff: { type: 'exponential', delay: 500 }`.
> Do NOT use raw `redis.publish()` for the order→kitchen handoff.

---

## Deployment Architecture (MVP)

```
┌─────────────────────────────────────────────┐
│                 Cloud Provider               │
│  (Render / Railway / Fly.io / AWS)           │
│                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  │ Storefront   │  │   Portal     │  │   Kitchen    │  │ Platform     │
│  │ App (Next.js)│  │ (Next.js)    │  │ App (Next.js)│  │ Admin (Next.js)│
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │     Backend API (NestJS + Socket.io)   │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌─────────────┐    ┌─────────────────┐     │
│  │ PostgreSQL  │    │     Redis        │     │
│  │  (managed) │    │   (managed)      │     │
│  └─────────────┘    └─────────────────┘     │
└─────────────────────────────────────────────┘
```

**MVP deployment targets:**
- Frontends: Vercel (zero-config Next.js deployment)
- API: Railway or Fly.io (NestJS app — container / Node runtime)
- PostgreSQL: Supabase DB only (PostgreSQL-as-a-service, no Supabase Auth/SDK)
- Redis: Upstash (serverless Redis)

> **MVP DEPLOYMENT TRUTH (single source):**
> - **Socket.io runs in the same NestJS API runtime** (no separate realtime service for MVP).
> - **Kitchen ticket creation is queue-driven**: Order/Billing enqueue `create-kitchen-ticket` in BullMQ, then a worker/processor in the backend consumes and creates tickets.
> - **Source of truth is PostgreSQL**; WebSocket events are a live update layer only.
> - If we split realtime or workers into dedicated services later, update this section first before changing other docs.

> **SINGLE-INSTANCE CONSTRAINT (MVP):** The Socket.io server requires sticky sessions or a
> Redis adapter (`@socket.io/redis-adapter`) to operate correctly across multiple API instances.
> **Do not scale the API to more than 1 instance without first configuring the Redis adapter.**
> Scaling to 2+ instances without this causes kitchen ticket updates to silently drop for clients
> connected to a different instance. For Phase 1, enforce `MAX_REPLICAS=1` in the deployment config.
> See TODOS.md for the Redis adapter upgrade task.

---

## Phase 1 Tech Stack Summary

| Layer | Technology | Reason |
|---|---|---|
| Frontend framework | Next.js 14 (App Router) | Full-stack, RSC, best DX |
| Backend API | NestJS + TypeScript | Modular architecture, DI, production-ready patterns; runs on Node.js |
| ORM | Prisma | Type-safe, great migrations |
| Database | PostgreSQL | Relational, multi-tenant safe |
| Cache | Redis (Upstash) | Sessions, queue, pub-sub |
| Real-time | Socket.io | Kitchen live updates |
| Auth | JWT (access + refresh) | Stateless, tenant-aware |
| UI components | shadcn/ui + Tailwind CSS | Fast, consistent |
| Validation | Zod | Runtime + compile-time |
| Queue | BullMQ (Redis) | Reliable job processing |
| Monorepo | pnpm + Turborepo | Fast builds, shared packages |
| i18n | next-intl | Khmer + English |
