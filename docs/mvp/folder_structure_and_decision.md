# Folder Structure & Architecture Decision — XFOS

> **TL;DR.** One monorepo (pnpm + Turborepo). The top level is split by **deployable tier** (`backend/` · `frontend/` · `contracts/` · `database/` · `infra/`). Each backend domain is a NestJS module organized in **four hexagonal layers** — `core/` (pure business logic) · `application/` (use cases) · `infra/` (Prisma + external adapters) · `api/` (HTTP controllers). The four invariants in §1 are non-negotiable and enforced by ESLint at build time.
>
> **Frontend apps are fully self-contained and independently managed.** There is **no** `frontend/shared/` of workspace packages — each of the four Next.js apps pins its own dependency versions, owns its own Tailwind / Next.js / ESLint config, owns its own UI primitives and design tokens, and can be deployed to any host (Vercel, Netlify, Railway, a VPS via Next.js standalone output) independently of the others. The only thing a frontend app imports from outside its own folder is `contracts/*` — Zod schemas that must stay in sync with the backend. This principle is spelled out in §12.
>
> **Read §1 first, then §12 for the frontend policy.** Everything else assumes you know the four invariants.

---

## Table of Contents

1. [The Four Invariants (read first)](#1-the-four-invariants-read-first)
2. [Layout — High-Level View](#2-layout--high-level-view)
3. [Layout — Detailed View (the whole product)](#3-layout--detailed-view-the-whole-product)
4. [Worked Example — "Submit a Customer Order"](#4-worked-example--submit-a-customer-order)
5. [How to Debug When Things Break](#5-how-to-debug-when-things-break)
6. [Why This Layout Wins for XFOS Specifically](#6-why-this-layout-wins-for-xfos-specifically)
7. [What Already Decided This (ADR pointers)](#7-what-already-decided-this-adr-pointers)
8. [Scaling Timeline — Monorepo at Thousands of Merchants](#8-scaling-timeline--monorepo-at-thousands-of-merchants)
9. [When to Revisit (Exit Criteria)](#9-when-to-revisit-exit-criteria)
10. [Migration Path — If You Ever Need to Split](#10-migration-path--if-you-ever-need-to-split)
11. [Cross-References](#11-cross-references)
12. [Frontend App Isolation — Independent Setup, Deploy, and Portability](#12-frontend-app-isolation--independent-setup-deploy-and-portability)

---

## 1. The Four Invariants (read first)

These four rules **define** the architecture. Violate any one of them and the rest collapses into "vanilla NestJS with extra folders". They are enforced by ESLint at build time and by code review at merge time.

### Invariant 1 — The Flow

```
HTTP request
    │
    ▼
┌─────────────────────────┐
│  api/  (controller)     │  ← ONLY layer that touches HTTP / NestJS HTTP decorators
│  validates DTO,         │
│  calls use case         │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  application/           │  ← orchestrator — the "do this thing" layer
│  use case:              │
│    1. load via port     │
│    2. create / mutate   │
│       domain entities   │
│    3. persist via port  │
│    4. publish event     │
│       via port          │
└─────┬──────────────┬────┘
      │              │
   uses              │ depends on (interface)
      ▼              ▼
┌──────────┐    ┌────────────┐
│  core/   │    │ core/ports │  ← interfaces, NOT implementations
│ entities │    │   (e.g.    │
│ services │    │  Order     │
│ events   │    │  Repo)     │
└──────────┘    └─────┬──────┘
                      │ implemented by
                      ▼
                ┌────────────┐
                │  infra/    │  ← ONLY layer that touches Prisma / Redis / BullMQ / Socket.io
                │  Prisma    │
                │  adapter   │
                └─────┬──────┘
                      │
                      ▼
                ┌────────────┐
                │ PostgreSQL │
                └────────────┘
```

**Compile-time dependency arrow:** `api → application → core ← infra`. Always points inward. `infra` depends on `core` (to implement the port interfaces); `core` depends on **nothing**.

**Runtime call flow:** `HTTP → Controller → UseCase → (Port → Infra → DB)`, where the use case manipulates Domain entities throughout. The use case never knows Prisma exists — it sees only the port interface and gets an injected Prisma adapter at startup via NestJS DI.

**Response goes the other way:** `DB → Prisma row → infra mapper → Domain entity → use case returns entity → controller maps to DTO → HTTP response`. The mapping at the infra layer is what keeps Prisma types from leaking into core.

### Invariant 2 — `core/` Is Sacred

`core/` imports **nothing** except plain TypeScript and (optionally) Zod for value-object validation. The full forbidden list:

```typescript
// ❌ FORBIDDEN in any file under core/
import { PrismaClient, Order } from '@prisma/client';   // no ORM
import { Injectable, Inject } from '@nestjs/common';    // no NestJS decorators
import { EventEmitter2 } from '@nestjs/event-emitter';  // no Nest event bus
import { Queue } from 'bullmq';                         // no infrastructure libs
import { Server } from 'socket.io';                     // no transport
import Redis from 'ioredis';                            // no cache
import axios from 'axios';                              // no HTTP clients
import React from 'react';                              // (obviously)
// And no cross-domain reach-ins:
import { Bill } from '@xfos/backend-billing/core';      // ❌ use events instead
```

The **only** library exception is **Zod**, and only for value-object construction:

```typescript
// ✅ allowed in core/value-objects/email.vo.ts
import { z } from 'zod';
const EmailSchema = z.string().email();
export class Email {
  private constructor(public readonly value: string) {}
  static create(input: string): Email {
    return new Email(EmailSchema.parse(input));
  }
}
```

**Why this rule is non-negotiable:** if `core/` imports Prisma even once, your domain entity becomes coupled to your DB schema. Every Prisma migration becomes a domain change. Unit tests stop being fast (they need a DB connection). Service extraction stops being mechanical. The whole pattern collapses.

**Enforcement:** ESLint `no-restricted-imports` per layer (config in §3.6). The first time the rule fires on a junior's PR is the day the architecture saves itself.

### Invariant 3 — `backend/shared/` Is Infrastructure-Only

`backend/shared/` exists for things that:

- Are needed by every domain
- Have **zero** business logic
- Have **zero** domain knowledge
- Are framework / infrastructure glue

**Allowed:** Prisma client wrapper · NestJS common decorators (`@CurrentUser`, `@CurrentTenant`) · global exception filters · request-logging interceptor · Pino logger setup · in-process event bus *infrastructure* · base error classes · type-safe environment loader · health-check controller.

**Forbidden:** anything that mentions a domain noun. The rule, written for `backend/shared/README.md`:

> **If a file in `backend/shared/` references the word `tenant`, `order`, `bill`, `menu`, `kitchen`, `user`, `merchant`, `payment`, or `customer` — it does NOT belong here. Move it to the relevant domain.**

A growing `backend/shared/` is a code smell. Target: **under ~15 files for the lifetime of XFOS.** If it starts growing, the answer is "this should have been in a domain", not "we need more shared utilities".

### Invariant 4 — Handlers Translate, Use Cases Decide

Event handlers (in `application/handlers/`) are **translators**, not doers. A handler's only job is: receive a domain event, call a use case. Zero `if` statements. Zero business decisions. Zero direct repo access.

**✅ Correct handler — pure translation, ~10 lines:**

```typescript
// backend/domains/kitchen/application/handlers/on-order-submitted.handler.ts
@Injectable()
export class OnOrderSubmittedHandler {
  constructor(private readonly createTicket: CreateKitchenTicketUseCase) {}

  @OnEvent('order.submitted')
  async handle(event: OrderSubmittedEvent): Promise<void> {
    await this.createTicket.execute({
      tenantId: event.tenantId,
      orderId:  event.orderId,
      items:    event.items,
    });
  }
}
```

**❌ Wrong handler — business logic leaked in:**

```typescript
@Injectable()
export class OnOrderSubmittedHandler {
  constructor(private readonly repo: KitchenTicketRepository) {}  // ← red flag #1

  @OnEvent('order.submitted')
  async handle(event: OrderSubmittedEvent): Promise<void> {
    if (event.serviceModel === 'STALL_KIOSK' && event.paymentStatus !== 'CONFIRMED') {
      return;                                                     // ❌ business policy in handler
    }
    const ticket = {
      orderId: event.orderId,
      status:  'NEW',
      items:   event.items.filter(i => i.requiresPreparation),    // ❌ business rule in handler
    };
    await this.repo.save(ticket);                                 // ❌ direct repo access
  }
}
```

The rule, written as a one-liner: *"Handlers translate. Use cases decide. If a handler has an `if` that isn't `event.tenantId !== this.context.tenantId`, it's wrong."*

---

## 2. Layout — High-Level View

This is the bird's-eye view of the entire repo. **Six top-level folders, each owning one concern.** Read this in 60 seconds, understand where everything lives.

```
food-ordering-platform/
│
├── backend/                         ← All server-side code (NestJS)
│   ├── api/                         #   NestJS app shell — main.ts, app.module.ts (~30 lines total)
│   ├── domains/                     #   Bounded contexts, each with hexagonal layers inside
│   │   ├── auth/                    #     Identity, JWT, sessions, invitations, MFA
│   │   ├── tenant/                  #     Multi-tenancy guard + tenant lifecycle (CROWN JEWEL)
│   │   ├── catalog/                 #     Menu, categories, items, Khmer translations
│   │   ├── order/                   #     Cart, submission, status, idempotency, sessions
│   │   ├── billing/                 #     Bills, payments, ABA integration, webhooks
│   │   ├── kitchen/                 #     Tickets, real-time gateway, status transitions
│   │   └── onboarding/              #     Sales-assisted merchant provisioning, setup checklist
│   ├── workers/                     #   FUTURE (Phase 2): BullMQ workers as separate process
│   └── shared/                      #   Infrastructure-only utilities (TINY — see Invariant 3)
│
├── frontend/                        ← Browser-side code (Next.js 14) — see §12
│   │                                #   NO frontend/shared/ workspace packages.
│   │                                #   Each app is fully self-contained and independently managed.
│   │                                #   Each app owns its own deps, config, UI primitives, design tokens,
│   │                                #   i18n, API client. The only thing they import from outside their
│   │                                #   own folder is `contracts/*` (the API contract with the backend).
│   │                                #   Each app can deploy to any host independently.
│   ├── storefront/                  #   Customer mobile web (QR-accessed) — self-contained
│   ├── kitchen/                     #   Tablet PWA for kitchen staff — self-contained
│   ├── admin/                       #   Tenant admin / merchant portal — self-contained
│   └── platform-admin/              #   Internal ops — self-contained (ADR-006)
│
├── contracts/                       ← API contracts — single source of truth for shapes
│   ├── auth/                        #   Zod schemas; types via z.infer
│   ├── catalog/
│   ├── order/
│   ├── billing/
│   ├── kitchen/
│   ├── tenant/
│   ├── onboarding/
│   └── enums/                       #   Cross-domain enums (Role, OrderStatus, BillStatus)
│
├── database/                        ← THE database — ONE schema, ONE migration history
│   ├── prisma/
│   │   └── schema.prisma            #   ONE file, organized by section comments per domain
│   ├── migrations/                  #   Auto-generated by Prisma — chronological
│   └── seeds/                       #   Dev seed data, test fixtures
│
├── infra/                           ← Local-dev + deploy configs (NOT business code)
│   ├── docker-compose.yml           #   Local dev: postgres + redis
│   ├── docker-compose.test.yml      #   Test DB on port 5433
│   └── deploy/                      #   Railway / Vercel manifests, IaC if any
│
├── docs/                            ← Product, architecture, ADRs, this file
├── .github/
│   ├── CODEOWNERS                   #   Per-domain ownership (read in 30 seconds)
│   └── workflows/                   #   GitHub Actions CI
│
├── pnpm-workspace.yaml              # globs: backend/api, backend/domains/*, backend/shared/*,
│                                    #         frontend/{storefront,kitchen,admin,platform-admin},
│                                    #         contracts/*, database
│                                    #   NOTE: no frontend/shared/* — see §12.
├── turbo.json                       # Turborepo task graph + cache config
├── package.json                     # Root scripts (lint, test, build) — no runtime deps
├── .env.example                     # Reference env vars (no secrets)
├── .gitignore
├── README.md                        # Onboarding — clone, install, dev, sparse-checkout instructions
└── CLAUDE.md                        # Claude Code project context
```

**Six folders. Six concerns. No ambiguity.** A backend dev opens `backend/`. A frontend dev opens `frontend/`. The DB schema is exactly one file in `database/prisma/schema.prisma`. API contracts are exactly one folder, `contracts/`. There is no "where does this go?" question.

The **dependency arrows between top-level folders** (one direction only):

```
        ┌──────────┐         ┌──────────┐
        │ frontend │  ──→    │ contracts│
        └──────────┘         └────▲─────┘
                                  │
        ┌──────────┐              │
        │ backend  │  ────────────┘
        └─────┬────┘
              │
              ▼
        ┌──────────┐
        │ database │
        └──────────┘
```

- `frontend/` depends on `contracts/` (to know request/response shapes)
- `backend/` depends on `contracts/` (same shapes — single source of truth) and on `database/` (the Prisma client)
- `contracts/` depends on **nothing**
- `database/` depends on **nothing**
- `frontend/` and `backend/` **never** import from each other

This is enforced via ESLint workspace boundaries. A frontend file that tries to `import` from `backend/` fails the build.

---

## 3. Layout — Detailed View (the whole product)

This is the full tree, including the inside of every domain, every frontend app, the contracts and database structure, and the supporting config files. **Use this when you're scaffolding the repo or onboarding a new engineer who needs the complete picture.**

For brevity, two patterns are used to avoid repetition:

- **`order/` is fully expanded** as the reference domain. Every file inside it is shown. **All other backend domains follow the same shape** — copy `order/` and substitute the domain name.
- **`storefront/` is fully expanded** as the reference frontend app. The other Next.js apps (`kitchen/`, `admin/`, `platform-admin/`) follow the same shape.

> **A note on `src/`.** The `backend/` tree and `contracts/` packages do **not** use a `src/` wrapper folder — the four hexagonal layers (or the package's content folders) sit directly at the package root. The reason: those packages have nothing at their root except code and a few meta files (`package.json`, `tsconfig.json`, `.eslintrc.cjs`, `README.md`, `CODEOWNERS`), so wrapping them in `src/` adds depth without information.
>
> The four Next.js apps under `frontend/` **do** keep `src/` because of `public/`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, and `vercel.json` all living at the project root — the `src/` wrapper cleanly separates source from configs and static assets, which is the standard Next.js convention.
>
> **A note on `frontend/shared/`.** There is no `frontend/shared/` directory. Per §12, each frontend app is fully self-contained: it has its own copies of UI primitives (shadcn installed directly), its own design tokens, its own API client functions, and its own i18n dictionaries. The only package a frontend app imports from outside its own folder is `contracts/*`.

```
food-ordering-platform/
│
│ ═══════════════════════════════════════════════════════════════════════════
│  BACKEND  —  NestJS modular monolith deployed to Railway
│ ═══════════════════════════════════════════════════════════════════════════
│
├── backend/
│   │
│   ├── api/                                      # The NestJS app shell — ~30 lines total
│   │   ├── main.ts                               # NestFactory.create(...) bootstrap
│   │   ├── app.module.ts                         # Imports every domain's module + global filters
│   │   ├── tests/
│   │   │   └── e2e/                              # Cross-domain end-to-end tests (real DB, real Nest)
│   │   │       ├── submit-order.e2e-spec.ts
│   │   │       ├── pay-bill.e2e-spec.ts
│   │   │       └── tenant-isolation.e2e-spec.ts  # CRITICAL: cross-tenant access returns 404
│   │   ├── tsconfig.json
│   │   ├── nest-cli.json
│   │   └── package.json                          # @xfos/backend-api
│   │
│   ├── domains/
│   │   │
│   │   │ ─────────────────────────────────────────────────────────────────
│   │   │  REFERENCE DOMAIN — fully expanded. All other domains follow this.
│   │   │ ─────────────────────────────────────────────────────────────────
│   │   │
│   │   ├── order/                                # @xfos/backend-order
│   │   │   │
│   │   │   ├── core/                             # ← INVARIANT 2: zero framework imports
│   │   │   │   │
│   │   │   │   ├── entities/                     # Rich domain objects with methods + invariants
│   │   │   │   │   ├── order.entity.ts           #   class Order { addItem(), submit(), cancel() }
│   │   │   │   │   ├── order-item.entity.ts
│   │   │   │   │   └── order-session.entity.ts
│   │   │   │   │
│   │   │   │   ├── value-objects/                # Immutable, validated, no identity
│   │   │   │   │   ├── order-id.vo.ts            #   branded UUID
│   │   │   │   │   ├── order-token.vo.ts         #   128-bit random token (unguessable status URL)
│   │   │   │   │   ├── money.vo.ts               #   Money(amount, currency) — never raw numbers
│   │   │   │   │   ├── order-status.vo.ts        #   union with transition rules
│   │   │   │   │   └── service-model.vo.ts       #   STALL_KIOSK | DINE_IN_TABLE | STALL_OPEN_TAB
│   │   │   │   │
│   │   │   │   ├── services/                     # Pure domain functions — no I/O
│   │   │   │   │   ├── order-pricing.service.ts          # calculateTotal(items, tax, discount)
│   │   │   │   │   ├── order-validation.service.ts       # validateSubmissionRules(order, tenant)
│   │   │   │   │   └── kitchen-ticket-policy.service.ts  # shouldCreateTicketImmediately(...)
│   │   │   │   │
│   │   │   │   ├── events/                       # Plain TypeScript types — no framework
│   │   │   │   │   ├── order-submitted.event.ts
│   │   │   │   │   ├── order-confirmed.event.ts
│   │   │   │   │   ├── order-cancelled.event.ts
│   │   │   │   │   └── order-item-added.event.ts
│   │   │   │   │
│   │   │   │   ├── ports/                        # ← Interfaces the inner layers need from outside
│   │   │   │   │   ├── order.repository.port.ts          # interface OrderRepository { save, findById, ... }
│   │   │   │   │   ├── order-session.repository.port.ts
│   │   │   │   │   ├── menu-item-reader.port.ts          # cross-domain READ port (catalog)
│   │   │   │   │   ├── tenant-reader.port.ts             # cross-domain READ port (tenant)
│   │   │   │   │   └── event-publisher.port.ts           # interface EventPublisher { publish(event) }
│   │   │   │   │
│   │   │   │   └── errors/                       # Domain-specific errors — extend backend/shared/errors
│   │   │   │       ├── order-not-found.error.ts
│   │   │   │       ├── order-already-confirmed.error.ts
│   │   │   │       ├── order-empty.error.ts
│   │   │   │       └── invalid-status-transition.error.ts
│   │   │   │
│   │   │   ├── application/                      # ← Use cases. Imports core only. No framework imports.
│   │   │   │   │
│   │   │   │   ├── use-cases/                    # One file per business action
│   │   │   │   │   ├── submit-order.use-case.ts          # The headliner
│   │   │   │   │   ├── add-item-to-order.use-case.ts
│   │   │   │   │   ├── cancel-order.use-case.ts
│   │   │   │   │   ├── confirm-order.use-case.ts
│   │   │   │   │   ├── resume-dine-in-session.use-case.ts
│   │   │   │   │   └── close-order-session.use-case.ts
│   │   │   │   │
│   │   │   │   ├── queries/                      # Read-side operations (CQRS-lite — healthy split)
│   │   │   │   │   ├── get-order-by-token.query.ts       # for /o/{token} status page
│   │   │   │   │   ├── get-active-session-orders.query.ts # for same-visit banner
│   │   │   │   │   └── list-tenant-orders.query.ts
│   │   │   │   │
│   │   │   │   └── handlers/                     # ← INVARIANT 4: translators only, no logic
│   │   │   │       ├── on-payment-confirmed.handler.ts   # billing.payment.confirmed → ConfirmOrderUseCase
│   │   │   │       └── on-tenant-suspended.handler.ts    # tenant.suspended → CancelActiveOrdersUseCase
│   │   │   │
│   │   │   ├── infra/                            # ← Adapters. Implements ports. Uses Prisma, BullMQ, etc.
│   │   │   │   │
│   │   │   │   ├── repositories/                 # Implements core/ports/*.repository.port.ts
│   │   │   │   │   ├── prisma-order.repository.ts
│   │   │   │   │   ├── prisma-order-session.repository.ts
│   │   │   │   │   ├── prisma-menu-item-reader.ts        # implements MenuItemReader by querying catalog tables
│   │   │   │   │   └── prisma-tenant-reader.ts
│   │   │   │   │
│   │   │   │   ├── publishers/                   # Implements EventPublisher port
│   │   │   │   │   └── nest-event-publisher.ts           # uses backend/shared/events/ in-process bus
│   │   │   │   │
│   │   │   │   ├── mappers/                      # Convert Prisma rows ↔ Domain entities
│   │   │   │   │   ├── prisma-to-order.mapper.ts
│   │   │   │   │   └── order-to-prisma.mapper.ts
│   │   │   │   │
│   │   │   │   └── order-infra.module.ts         # NestJS module that wires ports → adapters
│   │   │   │
│   │   │   ├── api/                              # ← The ONLY layer that knows about HTTP
│   │   │   │   │
│   │   │   │   ├── controllers/
│   │   │   │   │   ├── order.controller.ts                # POST /storefront/orders, etc.
│   │   │   │   │   ├── order-status.controller.ts         # GET /o/:token
│   │   │   │   │   └── admin-order.controller.ts          # GET /admin/orders, etc. (role-gated)
│   │   │   │   │
│   │   │   │   ├── dto/                          # Request/response shapes — Zod from contracts/order/
│   │   │   │   │   ├── submit-order.dto.ts                # imports SubmitOrderSchema from @xfos/contracts
│   │   │   │   │   ├── order-response.dto.ts
│   │   │   │   │   └── order-status-response.dto.ts
│   │   │   │   │
│   │   │   │   ├── presenters/                   # Map Domain entities → DTOs (no domain leakage)
│   │   │   │   │   └── order.presenter.ts
│   │   │   │   │
│   │   │   │   └── order.module.ts               # NestJS module — wires controllers + use cases
│   │   │   │
│   │   │   ├── index.ts                          # Public exports: only the NestJS module + events
│   │   │   │
│   │   │   ├── tests/
│   │   │   │   ├── core/                         # Pure unit tests — fast, no DB, no Nest
│   │   │   │   │   ├── order.entity.spec.ts
│   │   │   │   │   ├── order-pricing.service.spec.ts
│   │   │   │   │   └── kitchen-ticket-policy.spec.ts
│   │   │   │   ├── application/                  # Use case tests with MOCKED ports — still fast
│   │   │   │   │   ├── submit-order.use-case.spec.ts
│   │   │   │   │   └── cancel-order.use-case.spec.ts
│   │   │   │   └── integration/                  # Real DB, real Nest — slow, but few
│   │   │   │       └── prisma-order.repository.spec.ts
│   │   │   │
│   │   │   ├── .eslintrc.cjs                     # ← INVARIANT 2 enforcement (per-layer import rules)
│   │   │   ├── tsconfig.json
│   │   │   ├── package.json                      # @xfos/backend-order
│   │   │   ├── CODEOWNERS                        # Per-domain owners override root rules
│   │   │   └── README.md                         # "What this domain owns. How to add a use case. How to debug."
│   │   │
│   │   │ ─────────────────────────────────────────────────────────────────
│   │   │  OTHER DOMAINS — same shape as order/. Only the highlights shown.
│   │   │ ─────────────────────────────────────────────────────────────────
│   │   │
│   │   ├── auth/                                 # @xfos/backend-auth
│   │   │   ├── core/
│   │   │   │   ├── entities/                     # User, Invitation, RefreshToken
│   │   │   │   ├── value-objects/                # Email, HashedPassword, Role, JwtClaims
│   │   │   │   ├── services/                     # password-hashing.service, token-issuance-policy.service
│   │   │   │   ├── events/                       # user-logged-in, user-logged-out, invitation-accepted
│   │   │   │   ├── ports/                        # UserRepo, InvitationRepo, TokenSigner, MfaProvider
│   │   │   │   └── errors/                       # InvalidCredentials, TokenExpired, InvitationUsed
│   │   │   ├── application/
│   │   │   │   ├── use-cases/                    # login, refresh, logout, accept-invite,
│   │   │   │   │                                 #   forgot-password, reset-password, enroll-mfa, verify-mfa
│   │   │   │   ├── queries/                      # get-current-user, list-active-sessions
│   │   │   │   └── handlers/                     # on-tenant-suspended → revoke-all-tokens
│   │   │   ├── infra/
│   │   │   │   ├── repositories/                 # PrismaUserRepo, PrismaInvitationRepo
│   │   │   │   ├── token-signers/                # JwtTokenSigner (uses jsonwebtoken)
│   │   │   │   └── mfa-providers/                # OtpAuthMfaProvider (uses otplib)
│   │   │   └── api/
│   │   │       ├── controllers/                  # auth.controller, mfa.controller
│   │   │       ├── strategies/                   # NestJS JwtStrategy (Passport)
│   │   │       ├── guards/                       # JwtAuthGuard, RolesGuard
│   │   │       └── auth.module.ts
│   │   │
│   │   ├── tenant/                               # @xfos/backend-tenant — THE crown jewel
│   │   │   ├── core/                             # Tenant entity, TenantId VO, TenantStatus VO,
│   │   │   │                                     #   TenantIsolationService (the rule "tenant_id from JWT")
│   │   │   ├── application/                      # provision-tenant, suspend-tenant, activate-tenant
│   │   │   ├── infra/                            # PrismaTenantRepo
│   │   │   └── api/
│   │   │       ├── guards/
│   │   │       │   └── tenant.guard.ts           # ← reads tenantId from JWT, injects into request
│   │   │       ├── decorators/
│   │   │       │   └── current-tenant.decorator.ts
│   │   │       └── tenant.module.ts
│   │   │
│   │   ├── catalog/                              # @xfos/backend-catalog
│   │   │   ├── core/                             # Category, MenuItem, Translation entities
│   │   │   ├── application/                      # CRUD use cases + bulk-import-menu, toggle-availability
│   │   │   ├── infra/                            # PrismaCategoryRepo, PrismaMenuItemRepo
│   │   │   └── api/                              # catalog.controller (admin) + storefront-catalog.controller (public)
│   │   │
│   │   ├── billing/                              # @xfos/backend-billing
│   │   │   ├── core/                             # Bill entity, Payment entity, BillStatus VO,
│   │   │   │                                     #   PaymentMethod VO, IdempotencyKey VO,
│   │   │   │                                     #   bill-accumulation.service (kiosk vs dine-in policy)
│   │   │   ├── application/
│   │   │   │   ├── use-cases/                    # create-bill, record-cash-payment, initiate-aba-payment,
│   │   │   │   │                                 #   confirm-aba-payment-via-check-tx, void-bill
│   │   │   │   ├── queries/                      # get-bill-status (polled by storefront)
│   │   │   │   └── handlers/                     # on-order-submitted → CreateBillForOrderUseCase
│   │   │   ├── infra/
│   │   │   │   ├── repositories/                 # PrismaBillRepo, PrismaPaymentRepo
│   │   │   │   ├── aba-payway/                   # ← The ABA SDK adapter — implements PaymentGateway port
│   │   │   │   │   ├── aba-payway.client.ts
│   │   │   │   │   └── aba-payway.config.ts
│   │   │   │   └── jobs/                         # BullMQ job processors for payment retries
│   │   │   └── api/
│   │   │       ├── controllers/                  # billing.controller, webhook.controller (ABA callback)
│   │   │       └── billing.module.ts
│   │   │
│   │   ├── kitchen/                              # @xfos/backend-kitchen
│   │   │   ├── core/                             # KitchenTicket entity, TicketStatus VO,
│   │   │   │                                     #   ticket-transition.service (NEW→PREPARING→READY→COMPLETED)
│   │   │   ├── application/
│   │   │   │   ├── use-cases/                    # create-ticket, advance-ticket-status, cancel-ticket
│   │   │   │   ├── queries/                      # list-active-tickets-for-tenant
│   │   │   │   └── handlers/                     # on-order-submitted → CreateKitchenTicketUseCase
│   │   │   │                                     # on-payment-confirmed → CreateKitchenTicketUseCase (kiosk path)
│   │   │   ├── infra/
│   │   │   │   ├── repositories/                 # PrismaKitchenTicketRepo
│   │   │   │   └── gateways/
│   │   │   │       └── socket-io.gateway.ts      # ← Socket.io rooms keyed by tenant_{id}
│   │   │   └── api/
│   │   │       ├── controllers/                  # kitchen.controller (REST fallback for polling)
│   │   │       └── kitchen.module.ts
│   │   │
│   │   └── onboarding/                           # @xfos/backend-onboarding
│   │       ├── core/                             # SetupChecklist entity, OnboardingStep VO
│   │       ├── application/                      # provision-tenant-from-invite, advance-checklist-step
│   │       ├── infra/                            # PrismaSetupProgressRepo, EmailInviteSender
│   │       └── api/                              # onboarding.controller (sales-assisted internal endpoints)
│   │
│   ├── workers/                                  # FUTURE — Phase 2 of the scaling timeline
│   │   └── (created when BullMQ workers need to scale separately from the API)
│   │     Mirrors backend/api/ but only imports application/handlers/* from each domain.
│   │     Reuses the same core/ and application/ packages — no duplication.
│   │
│   └── shared/                                   # ← INVARIANT 3: TINY. Infrastructure-only. ~12 files.
│       │
│       ├── prisma/                               # The single PrismaClient instance
│       │   ├── prisma.service.ts                 # NestJS provider wrapping PrismaClient
│       │   ├── tenant-isolation.middleware.ts    # ← The safety net that throws if a query forgets tenant_id
│       │   └── index.ts
│       │
│       ├── nestjs/                               # NestJS-specific glue, no domain knowledge
│       │   ├── decorators/
│       │   │   ├── current-user.decorator.ts             # extracts JWT user from request
│       │   │   └── current-tenant.decorator.ts           # extracts tenantId from request context
│       │   ├── filters/
│       │   │   ├── domain-error.filter.ts                # maps DomainError → HTTP response (generic)
│       │   │   └── unknown-error.filter.ts
│       │   ├── interceptors/
│       │   │   ├── request-id.interceptor.ts
│       │   │   └── request-logging.interceptor.ts
│       │   └── pipes/
│       │       └── zod-validation.pipe.ts                # generic Zod validator → 400 on failure
│       │
│       ├── events/                               # In-process event bus *infrastructure*
│       │   ├── event-publisher.port.ts                   # interface — used by domains
│       │   ├── nest-event-publisher.ts                   # default in-process implementation
│       │   └── index.ts
│       │   # Note: domain events themselves live in each domain's core/events/, NOT here.
│       │
│       ├── errors/                               # Base error classes — pure TypeScript
│       │   ├── domain-error.ts                           # base class — domains extend this
│       │   ├── not-found.error.ts
│       │   ├── unauthorized.error.ts
│       │   ├── validation.error.ts
│       │   └── index.ts
│       │
│       ├── logger/                               # Pino setup with redaction
│       │   ├── pino.config.ts                            # redacts password, authorization, card_number
│       │   └── index.ts
│       │
│       ├── config/                               # Type-safe env loader
│       │   ├── env.schema.ts                             # Zod schema for process.env
│       │   └── env.service.ts                            # ONE place that reads process.env
│       │
│       ├── health/                               # Generic /health and /health/ready endpoints
│       │   └── health.controller.ts
│       │
│       └── README.md                             # ← The discipline rule (Invariant 3) lives here
│
│ ═══════════════════════════════════════════════════════════════════════════
│  FRONTEND  —  4 Next.js 14 apps deployed to Vercel
│ ═══════════════════════════════════════════════════════════════════════════
│
├── frontend/
│   │                                             # NO frontend/shared/ — see §12 for the rationale.
│   │                                             # Each app below is a fully self-contained Next.js
│   │                                             # application: own deps, own config, own UI primitives,
│   │                                             # own design tokens, own i18n, own API client functions.
│   │                                             # The ONLY thing any app imports from outside its own
│   │                                             # folder is @xfos/contracts-* (Zod schemas shared with
│   │                                             # the backend).
│   │
│   │ ─────────────────────────────────────────────────────────────────────
│   │  REFERENCE APP — fully expanded. The other apps follow the same shape.
│   │ ─────────────────────────────────────────────────────────────────────
│   │
│   ├── storefront/                               # @xfos/frontend-storefront — fully self-contained
│   │   ├── src/
│   │   │   │
│   │   │   ├── app/                              # Next.js 14 App Router — ROUTING ONLY
│   │   │   │   ├── layout.tsx                    # root html/body — minimal
│   │   │   │   ├── error.tsx                     # route-level error boundary
│   │   │   │   ├── loading.tsx                   # route-level suspense fallback
│   │   │   │   ├── not-found.tsx
│   │   │   │   ├── global-error.tsx              # top-level error boundary (own <html>)
│   │   │   │   ├── [locale]/                     # /en, /km — Khmer-first
│   │   │   │   │   ├── layout.tsx                # wraps i18n / Query / Theme providers
│   │   │   │   │   ├── page.tsx                  # locale landing
│   │   │   │   │   ├── (qr)/                     # route group — tenant entry via QR
│   │   │   │   │   │   └── [tenantSlug]/
│   │   │   │   │   │       ├── layout.tsx        # ⭐ tenant fetch HERE (Server Component)
│   │   │   │   │   │       ├── page.tsx          # tenant landing
│   │   │   │   │   │       ├── menu/page.tsx
│   │   │   │   │   │       ├── cart/page.tsx
│   │   │   │   │   │       └── checkout/page.tsx
│   │   │   │   │   └── o/
│   │   │   │   │       └── [token]/
│   │   │   │   │           └── page.tsx          # public order status (no account)
│   │   │   │   └── api/                          # tightly-scoped BFF — webhooks, OAuth callbacks ONLY
│   │   │   │
│   │   │   ├── middleware.ts                     # locale detection ONLY — keep thin
│   │   │   │
│   │   │   ├── features/                         # ⭐ THE BULK OF THE CODE
│   │   │   │   ├── menu-browse/
│   │   │   │   │   ├── components/MenuList.tsx
│   │   │   │   │   ├── hooks/useMenu.ts          # calls api.ts → lib/api/catalog.ts
│   │   │   │   │   ├── api.ts                    # composes lib/api/* — NEVER fetch() directly
│   │   │   │   │   ├── types.ts
│   │   │   │   │   └── index.ts                  # public API — re-exports for other features
│   │   │   │   ├── cart/
│   │   │   │   │   ├── components/CartDrawer.tsx
│   │   │   │   │   ├── hooks/useCart.ts
│   │   │   │   │   ├── store.ts                  # Zustand local state
│   │   │   │   │   └── index.ts
│   │   │   │   ├── checkout/
│   │   │   │   │   ├── components/CheckoutForm.tsx
│   │   │   │   │   ├── hooks/useSubmitOrder.ts
│   │   │   │   │   ├── api.ts                    # composes lib/api/order.ts
│   │   │   │   │   └── index.ts
│   │   │   │   └── order-status/
│   │   │   │       ├── components/OrderStatusCard.tsx
│   │   │   │       ├── hooks/useOrderStatus.ts
│   │   │   │       └── index.ts
│   │   │   │
│   │   │   ├── components/
│   │   │   │   ├── ui/                           # shadcn primitives (LOCAL COPY)
│   │   │   │   │   ├── button.tsx                #   `npx shadcn@latest add button` — installed here
│   │   │   │   │   ├── input.tsx
│   │   │   │   │   └── card.tsx
│   │   │   │   └── layout/                       # cross-feature shells (Header, Footer, Shell)
│   │   │   │
│   │   │   ├── providers/                        # React tree providers
│   │   │   │   ├── query-provider.tsx            # TanStack Query
│   │   │   │   └── i18n-provider.tsx             # next-intl
│   │   │   │
│   │   │   ├── lib/                              # LOW-LEVEL UTILITIES ONLY — no business logic
│   │   │   │   ├── api/                          # ⭐ raw fetch clients — the only place that builds requests
│   │   │   │   │   ├── client.ts                 #   apiFetch — auth, retries, isomorphic
│   │   │   │   │   ├── catalog.ts                #   typed via @xfos/contracts-catalog
│   │   │   │   │   ├── order.ts                  #   typed via @xfos/contracts-order
│   │   │   │   │   ├── billing.ts
│   │   │   │   │   └── tenant.ts
│   │   │   │   ├── i18n/
│   │   │   │   │   └── dictionaries/{en,km}.json
│   │   │   │   ├── analytics/                    # provider-agnostic event tracking
│   │   │   │   ├── telemetry/                    # Sentry + browser logger
│   │   │   │   ├── format/                       # money, dates, phone, Khmer numerals
│   │   │   │   └── utils/cn.ts                   # pure helpers
│   │   │   │
│   │   │   ├── config/                           # env + constants + GENERATED tokens
│   │   │   │   ├── env.ts                        # Zod-validated env loader
│   │   │   │   ├── constants.ts                  # SUPPORTED_LOCALES, DEFAULT_LOCALE, APP_NAME
│   │   │   │   └── design-tokens.ts              # GENERATED — never edit by hand
│   │   │   │
│   │   │   └── styles/
│   │   │       └── globals.css                   # Tailwind directives
│   │   │
│   │   ├── design-system/                        # JSON source of truth for the brand
│   │   │   ├── design_system.json                #   ← edit this; build:tokens regenerates config/design-tokens.ts
│   │   │   └── build-tokens.ts
│   │   ├── public/                               # Static assets — OWNED by this app
│   │   ├── tests/                                # Vitest + Playwright — OUTSIDE src/
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   └── e2e/
│   │   ├── next.config.js                        # OWN — no extends from a shared preset
│   │   ├── tailwind.config.ts                    # OWN — reads src/config/design-tokens.ts
│   │   ├── postcss.config.js                     # OWN
│   │   ├── tsconfig.json                         # OWN — extends root tsconfig.base.json
│   │   ├── .eslintrc.cjs                         # OWN — three boundary rules (see §12.3)
│   │   ├── package.json                          # OWN — versions pinned directly, contracts/* are the only workspace deps
│   │   ├── .env.example                          # OWN env reference (no secrets)
│   │   └── README.md                             # "How to develop, build, deploy THIS app"
│   │
│   │ ─────────────────────────────────────────────────────────────────────
│   │  OTHER FRONTEND APPS — each follows the same self-contained shape.
│   │  Each has its OWN copies of src/components/ui, src/lib/api,
│   │  src/lib/i18n, src/config/design-tokens.ts, own next.config.js,
│   │  own Tailwind config. Duplication is the price of independence — see §12.
│   │ ─────────────────────────────────────────────────────────────────────
│   │
│   ├── kitchen/                                  # @xfos/frontend-kitchen — tablet PWA (self-contained)
│   │   └── src/
│   │       ├── app/                              # Next.js routes
│   │       ├── features/
│   │       │   ├── ticket-board/                 # Kanban: NEW | PREPARING | READY
│   │       │   ├── ticket-card/                  # this app's own Socket.io client in src/lib/api/kitchen.ts
│   │       │   ├── ticket-detail/
│   │       │   ├── audio-alerts/
│   │       │   └── login/                        # KITCHEN_STAFF login flow
│   │       ├── components/ui/                    # this app's OWN shadcn primitives
│   │       └── lib/                              # this app's OWN api/, i18n/, design-tokens.ts
│   │
│   ├── admin/                                    # @xfos/frontend-admin — merchant portal (self-contained)
│   │   └── src/
│   │       ├── app/
│   │       ├── features/
│   │       │   ├── menu-edit/                    # Category/item CRUD with Khmer translations
│   │       │   ├── qr-manage/                    # Generate, list, deactivate QR codes
│   │       │   ├── team-manage/                  # Invite staff, assign roles
│   │       │   ├── settings/                     # Service model, brand, business profile
│   │       │   ├── onboarding-checklist/         # 6-step setup progress
│   │       │   └── dashboard/                    # Storefront status, menu completeness
│   │       ├── components/ui/                    # this app's OWN shadcn primitives
│   │       └── lib/                              # this app's OWN api/, i18n/, design-tokens.ts
│   │
│   └── platform-admin/                           # @xfos/frontend-platform-admin — internal ops
│       │                                         # Self-contained per ADR-006 AND §12.
│       │                                         # IP-allowlisted Vercel project (or own VPS) with
│       │                                         # independent deploy from the other three apps.
│       └── src/
│           ├── app/
│           ├── features/
│           │   ├── tenant-management/            # List, suspend, activate tenants
│           │   ├── audit-log-viewer/
│           │   ├── system-health/
│           │   └── billing-overview/             # Cross-tenant revenue dashboard
│           ├── components/ui/                    # this app's OWN shadcn primitives
│           └── lib/                              # this app's OWN api/, i18n/, design-tokens.ts
│
│ ═══════════════════════════════════════════════════════════════════════════
│  CONTRACTS  —  Single source of truth for API shapes (Zod schemas)
│ ═══════════════════════════════════════════════════════════════════════════
│
├── contracts/
│   │
│   ├── auth/                                     # @xfos/contracts-auth
│   │   ├── login.schema.ts                       # LoginSchema; type LoginInput = z.infer<typeof LoginSchema>
│   │   ├── refresh.schema.ts
│   │   ├── logout.schema.ts
│   │   ├── accept-invite.schema.ts
│   │   ├── forgot-password.schema.ts
│   │   ├── reset-password.schema.ts
│   │   ├── enroll-mfa.schema.ts
│   │   ├── verify-mfa.schema.ts
│   │   ├── index.ts
│   │   └── package.json
│   │
│   ├── catalog/                                  # @xfos/contracts-catalog
│   │   ├── category.schema.ts
│   │   ├── menu-item.schema.ts
│   │   ├── translation.schema.ts
│   │   ├── create-category.schema.ts
│   │   ├── update-menu-item.schema.ts
│   │   └── public-menu-response.schema.ts        # what storefront receives
│   │
│   ├── order/                                    # @xfos/contracts-order
│   │   ├── order.schema.ts                       # canonical Order shape
│   │   ├── order-item.schema.ts
│   │   ├── submit-order.schema.ts                # POST /storefront/orders body
│   │   ├── order-response.schema.ts              # POST /storefront/orders response
│   │   ├── order-status-response.schema.ts       # GET /o/:token response
│   │   └── cancel-order.schema.ts
│   │
│   ├── billing/                                  # @xfos/contracts-billing
│   │   ├── bill.schema.ts
│   │   ├── payment.schema.ts
│   │   ├── pay-bill.schema.ts                    # POST /billing/bills/:id/pay body
│   │   ├── payment-status-response.schema.ts     # GET /billing/bills/:id/payment-status response
│   │   └── aba-webhook.schema.ts                 # ABA callback payload (validated even though signature verification is via call-back-API)
│   │
│   ├── kitchen/                                  # @xfos/contracts-kitchen
│   │   ├── ticket.schema.ts
│   │   ├── ticket-status.schema.ts
│   │   ├── advance-ticket.schema.ts
│   │   ├── list-tickets-response.schema.ts
│   │   └── ticket-event.schema.ts                # WebSocket payload — same shape as REST
│   │
│   ├── tenant/                                   # @xfos/contracts-tenant
│   │   ├── tenant.schema.ts
│   │   ├── tenant-settings.schema.ts
│   │   └── tenant-context-response.schema.ts     # GET /storefront/context/:token response
│   │
│   ├── onboarding/                               # @xfos/contracts-onboarding
│   │   ├── invite.schema.ts
│   │   ├── setup-progress.schema.ts
│   │   └── provision-tenant.schema.ts
│   │
│   └── enums/                                    # @xfos/contracts/enums — cross-domain Zod enums
│       │                                         # Single file: index.ts (matches Prisma schema enums 1:1).
│       │                                         # See xfos/contracts/enums/index.ts for the canonical list.
│       │                                         # The 27 enums currently defined (2026-04-26):
│       ├── role                                  # PLATFORM_ADMIN | PLATFORM_STAFF | TENANT_OWNER | TENANT_MANAGER | SERVICE_STAFF | KITCHEN_STAFF
│       ├── tenant-status                         # DRAFT | ACTIVE | SUSPENDED | ARCHIVED
│       ├── service-model                         # STALL_KIOSK | DINE_IN_TABLE
│       ├── pay-timing                            # PAY_BEFORE | PAY_AFTER
│       ├── subscription-status                   # PENDING | ACTIVE | PAST_DUE | SUSPENDED | CANCELLED | EXPIRED
│       ├── user-status                           # PENDING | ACTIVE | SUSPENDED | DELETED
│       ├── invitation-status                     # PENDING | ACCEPTED | REVOKED  (EXPIRED derived)
│       ├── auth-provider                         # TELEGRAM | FACEBOOK | PHONE
│       ├── qr-context-type                       # STOREFRONT | TABLE
│       ├── qr-deactivation-reason                # REGENERATED | MERCHANT_DISABLED | LOST_OR_DAMAGED | EXPIRED_AUTO | TABLE_REMOVED | TENANT_DEACTIVATED
│       ├── order-session-status                  # ACTIVE | CLOSED
│       ├── order-session-close-reason            # PAID | STAFF_FORCE_CLOSED | AUTO_TIMEOUT_24H | WALKED_AWAY
│       ├── cart-status                           # ACTIVE | CONVERTED | ABANDONED
│       ├── cart-abandoned-reason                 # SESSION_PAID | SESSION_FORCE_CLOSED | STAFF_RESET | SESSION_TIMEOUT | CUSTOMER_DISMISSED
│       ├── order-status                          # SUBMITTED | PREPARING | READY | COMPLETED | CANCELLED
│       ├── order-cancellation-reason             # CUSTOMER_REQUEST | OUT_OF_STOCK | KITCHEN_OVERLOADED | PAYMENT_FAILED | DUPLICATE | STAFF_ERROR | SYSTEM_TIMEOUT
│       ├── order-source                          # STOREFRONT_QR | MERCHANT_MANUAL | API | MOBILE_APP
│       ├── table-shape                           # RECTANGLE | CIRCLE
│       ├── table-status                          # AVAILABLE | OCCUPIED | RESERVED | CLEANING
│       ├── bill-status                           # OPEN | PARTIALLY_PAID | PAID | VOIDED
│       ├── payment-status                        # INITIATED | PENDING | SUCCEEDED | FAILED | CANCELLED | EXPIRED | REFUNDED
│       ├── payment-method                        # CASH | ABA_QR | CARD
│       ├── ticket-status                         # NEW | PREPARING | READY | COMPLETED | CANCELLED
│       ├── audit-category                        # ORDER | BILLING | KITCHEN | CATALOG | AUTH | TENANT | PLATFORM | SYSTEM
│       ├── audit-severity                        # INFO | NOTICE | WARNING | ALERT
│       ├── audit-actor-type                      # USER | SYSTEM | WEBHOOK | CRON | API_KEY
│       ├── locale                                # en | km
│       ├── currency                              # USD | KHR
│       └── error-code.enum.ts                    # all 40+ error codes from shared/05-error-handling.md
│
│ ═══════════════════════════════════════════════════════════════════════════
│  DATABASE  —  ONE schema, ONE migration history
│ ═══════════════════════════════════════════════════════════════════════════
│
├── database/
│   ├── prisma/
│   │   └── schema.prisma                         # ← THE schema. Single file. Section comments per domain.
│   │                                             #   // ============ AUTH ============
│   │                                             #   model User { ... }
│   │                                             #   model Invitation { ... }
│   │                                             #   model RefreshToken { ... }
│   │                                             #
│   │                                             #   // ============ TENANT ============
│   │                                             #   model Tenant { ... }
│   │                                             #   model TenantSettings { ... }
│   │                                             #   ... (all 20+ tables organized by section)
│   │
│   ├── migrations/                               # Auto-generated by Prisma — chronological, single history
│   │   ├── 20260101000000_initial/
│   │   │   └── migration.sql
│   │   ├── 20260102000000_add_idempotency_keys/
│   │   │   └── migration.sql
│   │   └── migration_lock.toml
│   │
│   ├── seeds/
│   │   ├── dev.seed.ts                           # Local dev: one tenant, one staff, sample menu
│   │   ├── test.seed.ts                          # Integration tests: minimal fixtures
│   │   └── factories/                            # Reusable factory functions for tests
│   │       ├── tenant.factory.ts
│   │       ├── user.factory.ts
│   │       ├── menu-item.factory.ts
│   │       └── order.factory.ts
│   │
│   ├── scripts/
│   │   ├── reset-dev-db.sh                       # docker compose down -v && up && migrate && seed
│   │   └── verify-tenant-isolation.ts            # CI script — runs synthetic cross-tenant queries
│   │
│   ├── package.json                              # @xfos/database — exports PrismaClient via re-export
│   ├── README.md                                 # "How to add a table, how to write a safe migration, how to roll back"
│   └── CODEOWNERS                                # @founder ONLY (this is the crown jewel)
│
│ ═══════════════════════════════════════════════════════════════════════════
│  INFRASTRUCTURE  —  Local dev + deploy configs (NOT business code)
│ ═══════════════════════════════════════════════════════════════════════════
│
├── infra/
│   ├── docker-compose.yml                        # Local dev: postgres:16-alpine + redis:7-alpine + pgadmin
│   ├── docker-compose.test.yml                   # Test DB on port 5433 (separate from dev port 5432)
│   ├── deploy/
│   │   ├── railway/
│   │   │   └── railway.json                      # API deploy config — MAX_REPLICAS=1 hard-coded
│   │   └── vercel/
│   │       └── (each frontend app has its own vercel.json next to its package.json)
│   └── README.md                                 # "How to start local infra, how to wipe and reset"
│
│ ═══════════════════════════════════════════════════════════════════════════
│  DOCS, GITHUB, ROOT CONFIGS
│ ═══════════════════════════════════════════════════════════════════════════
│
├── docs/                                         # All product, architecture, design docs
│   ├── mvp/
│   │   ├── README.md                             # Handoff index: reading order + surface build packs
│   │   ├── XFOS — PRD.md                         # Master PRD (narrative + architecture + MVP scope + roadmap)
│   │   ├── folder_structure_and_decision.md      # ← THIS FILE (authoritative monorepo layout + invariants)
│   │   ├── full_details_of_each_tech_stack.md    # Deeper tech-stack reference
│   │   ├── technical-design/
│   │   │   ├── 00-start-here.md
│   │   │   ├── 00-index.md
│   │   │   ├── shared/                           # 12 cross-cutting design docs
│   │   │   ├── backend/                          # 4 backend-specific design docs
│   │   │   ├── storefront/                       # per-surface PRDs
│   │   │   ├── kitchen/
│   │   │   ├── merchant-portal/
│   │   │   └── platform-portal/
│   │   └── archive/                              # Superseded drafts and reviews (not in engineer reading path)
│   └── archive/                                  # Old PRDs, deprecated specs
│
├── .github/
│   ├── CODEOWNERS                                # ← Per-domain rules (read in 30 seconds)
│   ├── workflows/
│   │   ├── ci.yml                                # lint, typecheck, unit + integration tests, build
│   │   ├── e2e.yml                               # Playwright E2E on PRs touching apps/
│   │   ├── tenant-isolation-check.yml            # CI gate — runs database/scripts/verify-tenant-isolation.ts
│   │   └── max-replicas-check.yml                # CI gate — fails if railway.json MAX_REPLICAS != 1
│   ├── pull_request_template.md
│   └── ISSUE_TEMPLATE/
│
├── pnpm-workspace.yaml                           # workspace globs
├── turbo.json                                    # task graph + remote cache config
├── package.json                                  # root scripts: lint, test, build, dev (no runtime deps)
├── tsconfig.base.json                            # base TS config extended by every workspace
├── .eslintrc.cjs                                 # base ESLint config + workspace boundary rules
├── .prettierrc
├── .editorconfig
├── .nvmrc                                        # pinned Node version
├── .env.example                                  # reference env vars (no secrets)
├── .gitignore
├── README.md                                     # onboarding: clone, install, dev, sparse-checkout
└── CLAUDE.md                                     # Claude Code project context
```

### 3.1 The `pnpm-workspace.yaml`

```yaml
packages:
  - 'backend/api'
  - 'backend/domains/*'
  - 'backend/workers'             # exists once Phase 2 hires the workers process
  - 'backend/shared/*'
  - 'frontend/storefront'         # each frontend app is its own workspace — see §12
  - 'frontend/kitchen'
  - 'frontend/admin'
  - 'frontend/platform-admin'
  - 'contracts/*'
  - 'database'
```

**No `frontend/shared/*` entry.** Per §12, there is no shared frontend workspace package. Each frontend app is a separate workspace that pins its own dependency versions in its own `package.json`. The four apps are listed individually (rather than `frontend/*`) to make the file an exhaustive, explicit index of every workspace package — if a fifth frontend app is added, it must be added here deliberately.

**No pnpm `catalog:` references and no root `pnpm.overrides` for the frontend stack.** Each frontend app pins `next`, `react`, `tailwindcss`, and `typescript` directly in its own `package.json` at whatever version it wants. Storefront can stay on Next 14 while kitchen upgrades to Next 15. This is the whole point of §12.

### 3.2 The `turbo.json` (sketch)

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "lint": {
      "outputs": []
    },
    "test:unit": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:integration": {
      "dependsOn": ["^build", "database#prisma:generate"],
      "outputs": ["coverage/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

The key choice: `test:unit` does NOT depend on `database#prisma:generate`. This is the whole point of Invariant 2 — unit tests run without a Prisma client because `core/` and `application/` don't import it.

### 3.3 The `tsconfig.json` per backend domain (no-`src/` pattern)

Because backend domain packages have no `src/` wrapper, the tsconfig needs an explicit `include` list. This is one-time setup per domain (the `pnpm create-domain` scaffold writes it for you):

```jsonc
// backend/domains/order/tsconfig.json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist"
  },
  "include": ["core", "application", "infra", "api", "index.ts"],
  "exclude": ["dist", "tests", "node_modules"]
}
```

The `tsconfig.base.json` at the repo root holds shared compiler options (`strict`, `target`, `module`, `lib`, etc.) so individual domain configs stay tiny.

For the four Next.js apps under `frontend/` that **do** keep `src/`, the tsconfig is the standard Next.js form:

```jsonc
// frontend/storefront/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", ".next", "dist"]
}
```

The asymmetry is intentional and explained in the note at the top of §3.

### 3.4 ESLint per-layer enforcement

The file each domain ships at `backend/domains/<domain>/.eslintrc.cjs`:

```js
// backend/domains/order/.eslintrc.cjs
module.exports = {
  extends: ['../../../.eslintrc.cjs'],
  overrides: [
    {
      files: ['core/**/*.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            { group: ['@prisma/client', '@prisma/*'],
              message: 'core/ must be framework-free. Define a port in core/ports and put the Prisma adapter in infra/.' },
            { group: ['@nestjs/*'],
              message: 'core/ must be framework-free. NestJS belongs in application/ (@Injectable only) or api/.' },
            { group: ['axios', 'node-fetch', 'got', 'undici'],
              message: 'core/ cannot make network calls. Define a port and put the HTTP client in infra/.' },
            { group: ['bullmq', 'ioredis', '@socket.io/*', 'socket.io'],
              message: 'core/ cannot touch infrastructure. Define an EventPublisher port and put the adapter in infra/.' },
            { group: ['../infra/**', '../api/**', '../application/**'],
              message: 'core/ cannot import from sibling layers. Dependency arrows point INWARD only.' },
            { group: ['@xfos/backend-*'],
              message: 'core/ of one domain cannot import another domain. Use ports + events.' },
          ],
        }],
      },
    },
    {
      files: ['application/**/*.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            { group: ['@prisma/client', '@prisma/*'],
              message: 'application/ uses ports, not Prisma directly. Inject the repository interface from core/ports.' },
            { group: ['@nestjs/common'],
              importNames: ['Controller', 'Get', 'Post', 'Put', 'Delete', 'Patch', 'Param', 'Body', 'Query', 'Req', 'Res', 'Headers'],
              message: 'application/ has no HTTP knowledge. HTTP decorators belong in api/.' },
            { group: ['../infra/**', '../api/**'],
              message: 'application/ cannot import infra/ or api/. Use injected ports.' },
          ],
        }],
      },
    },
    {
      files: ['infra/**/*.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            { group: ['../api/**'],
              message: 'infra/ cannot depend on api/. The arrow points from api → application → core ← infra.' },
          ],
        }],
      },
    },
    {
      files: ['api/**/*.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            { group: ['../infra/**'],
              message: 'api/ talks to use cases, not infra directly. Use the use case from application/.' },
          ],
        }],
      },
    },
  ],
};
```

This file is **identical for every domain** — only the path comment changes. Ship it as a generator template (`pnpm create-domain <name>`).

### 3.5 Workspace boundaries between top-level folders

In the **root** `.eslintrc.cjs`, add cross-folder boundary rules using `eslint-plugin-boundaries`:

```js
// .eslintrc.cjs (root)
module.exports = {
  // ...
  settings: {
    'boundaries/elements': [
      { type: 'backend',   pattern: 'backend/**' },
      { type: 'frontend',  pattern: 'frontend/**' },
      { type: 'contracts', pattern: 'contracts/**' },
      { type: 'database',  pattern: 'database/**' },
    ],
  },
  rules: {
    'boundaries/element-types': ['error', {
      default: 'disallow',
      rules: [
        { from: 'backend',   allow: ['backend', 'contracts', 'database'] },
        { from: 'frontend',  allow: ['frontend', 'contracts'] },
        { from: 'contracts', allow: ['contracts'] },
        { from: 'database',  allow: [] },
      ],
    }],
  },
};
```

This makes the dependency arrow between top-level folders an enforced rule, not a convention. A frontend file that imports from `backend/` fails the build with a clear error.

### 3.6 `pnpm create-domain <name>` scaffold script

Stored at the root as `scripts/create-domain.ts`. Generates the full hexagonal skeleton for a new domain in 5 seconds:

```
$ pnpm create-domain promotions
✓ Created backend/domains/promotions/{core,application,infra,api}
✓ Created backend/domains/promotions/.eslintrc.cjs
✓ Created backend/domains/promotions/tsconfig.json
✓ Created backend/domains/promotions/package.json (@xfos/backend-promotions)
✓ Created backend/domains/promotions/README.md
✓ Created backend/domains/promotions/CODEOWNERS (founder-only by default)
✓ Created contracts/promotions/index.ts
✓ Updated backend/api/app.module.ts to import PromotionsModule
✓ Reminder: add a section comment to database/prisma/schema.prisma if this domain has tables
```

This is the antidote to the "more boilerplate" complaint. New domain in 5 seconds, same shape every time.

### 3.7 What's in `backend/domains/<domain>/README.md`

Every domain ships a README that answers four questions in order. New engineers read it before opening any source file:

1. **What does this domain own?** (One paragraph. "Auth owns identity, JWT issuance, refresh-token rotation, invitations, password reset, and MFA.")
2. **How does it connect to other domains?** (Bulleted list of events it publishes and events it subscribes to. No direct cross-domain calls except via `application/queries/`.)
3. **How do I add a new use case?** (Step-by-step: define entity in `core/`, add port if needed, write use case in `application/`, write adapter in `infra/`, expose via controller in `api/`, add Zod schema in `contracts/`, add tests at three levels.)
4. **How do I debug X?** (Common scenarios with file pointers. "If a JWT is being rejected, start at `api/strategies/jwt.strategy.ts`. If MFA enrollment fails, start at `application/use-cases/enroll-mfa.use-case.ts`.")

---

## 4. Worked Example — "Submit a Customer Order"

This walks through every file involved in submitting an order from the storefront, end to end. It is the canonical reference for what hexagonal looks like in practice.

**Scenario:** Customer scans QR, browses menu, taps "Place order" with three items in cart.

### Files involved (in call order)

| Step | File | What it does |
|---|---|---|
| 1 | `frontend/storefront/src/features/checkout/hooks/useSubmitOrder.ts` | React hook collects cart from `features/cart`, calls `features/checkout/api.ts` |
| 1a | `frontend/storefront/src/features/checkout/api.ts` | Feature-layer wrapper — composes calls to `lib/api/storefront.ts` |
| 2 | `frontend/storefront/src/lib/api/storefront.ts` | THIS APP's typed BFF client — uses `apiFetch` from `lib/api/client.ts`, built against `@xfos/contracts-bff-storefront`. POSTs to `/api/v1/storefront/orders`. The frontend never sees raw domain shapes. |
| 3 | `contracts/bff-storefront/submit-order.schema.ts` | BFF Zod schema (customer-facing projection) — validated on both sides |
| 4 | `backend/api/src/modules/storefront/api/storefront.controller.ts` | BFF controller. Validates DTO via `ZodValidationPipe`, calls `SubmitStorefrontOrderUseCase.execute(dto)`. Mounted at `/api/v1/storefront/orders`. |
| 4a | `backend/api/src/modules/storefront/application/use-cases/submit-storefront-order.use-case.ts` | BFF use case. Orchestrates: lookup catalog (price/availability), call `domains/order`'s `SubmitOrderUseCase` via DI, call `domains/billing`'s `CreateBillUseCase`, project the result to the customer-facing shape. **No business rules here** — pure orchestration. |
| 5 | `backend/api/src/domains/order/application/use-cases/submit-order.use-case.ts` | Domain use case (called by the BFF use case via DI, not over HTTP). Orchestrates: load session via port → validate via core service → look up menu items via cross-domain port → construct `Order` entity → save via port → publish event via port |
| 5a | `backend/api/src/domains/order/api/controllers/order.controller.ts` | The SAME order use case is also exposed at `/api/v1/internal/order/*` under three guards (URL prefix + ServiceTokenGuard + InternalOnlyGuard) for internal tools and scripts. Browser frontends never call this. |
| 6 | `backend/domains/order/core/entities/order.entity.ts` | `Order.create(...)` checks invariants (non-empty, items belong to tenant, prices match snapshot) and emits `OrderSubmittedEvent` |
| 7 | `backend/domains/order/core/ports/order.repository.port.ts` | The interface `OrderRepository` (just an interface — no implementation here) |
| 8 | `backend/domains/order/infra/repositories/prisma-order.repository.ts` | Implements `OrderRepository` using Prisma. Maps domain `Order` ↔ Prisma row via mappers/. Wired into NestJS DI in `order-infra.module.ts` |
| 9 | `backend/shared/prisma/prisma.service.ts` | The single `PrismaClient` instance with the tenant-isolation middleware attached |
| 10 | `database/prisma/schema.prisma` | The actual `orders` and `order_items` tables |
| 11 | `backend/shared/events/nest-event-publisher.ts` | In-process event bus publishes `OrderSubmittedEvent` synchronously |
| 12 | `backend/domains/kitchen/application/handlers/on-order-submitted.handler.ts` | **Kitchen domain** subscribes — translates event into `CreateKitchenTicketUseCase.execute({...})` |
| 13 | `backend/domains/kitchen/application/use-cases/create-kitchen-ticket.use-case.ts` | Creates `KitchenTicket` entity via core, persists via port, publishes `TicketCreatedEvent` |
| 14 | `backend/domains/kitchen/infra/gateways/socket-io.gateway.ts` | On `TicketCreatedEvent`, emits a `ticket.new` message to room `tenant_${tenantId}` |
| 15 | `frontend/kitchen/src/features/ticket-board/hooks/useTicketStream.ts` | Kitchen tablet receives the WebSocket event, prepends ticket to the NEW column |

### Key observations

- The order use case **never imports Prisma**. It depends on `OrderRepository` (interface) and gets the Prisma adapter injected at runtime by NestJS.
- The order use case **never imports the kitchen domain**. It publishes `OrderSubmittedEvent`. The kitchen domain subscribes via a handler. Day one, the bus is in-process. Phase 3 of the scaling timeline (when kitchen is extracted into its own service), the bus becomes BullMQ or NATS. **Zero changes to `core/` or `application/` of either domain.**
- The schema in `contracts/order/submit-order.schema.ts` is used by **both** the frontend hook (to type the request body) and the backend controller (to validate it via `ZodValidationPipe`). Single source of truth.
- The entire `core/` layer of `order/` can be unit-tested in milliseconds with no DB, no Nest, no Socket.io. The integration test for the Prisma repository is the only slow test.

### How to add a NEW order action (e.g., "add discount code")

Follow the recipe in order:

1. **Add the entity behavior** in `core/entities/order.entity.ts` — `Order.applyDiscount(code: DiscountCode): void` with invariants ("can't discount a confirmed order", "discount must be > 0").
2. **Add a value object** in `core/value-objects/discount-code.vo.ts` if needed.
3. **Add a port** in `core/ports/discount-code-reader.port.ts` (interface for looking up discount codes — implementation will live in `catalog/` or wherever discounts are owned).
4. **Add a use case** in `application/use-cases/apply-discount-to-order.use-case.ts` — orchestrates: load order, load discount code, call `order.applyDiscount(...)`, save.
5. **Implement the port** in `infra/repositories/prisma-discount-code-reader.ts` if discount codes live in the order domain (or use `catalog/application/queries/get-discount-code.query.ts` if they don't).
6. **Add a controller route** in `api/controllers/order.controller.ts` — `@Post(':id/discount')` calls the use case.
7. **Add the contract** in `contracts/order/apply-discount.schema.ts`.
8. **Add tests:** `tests/core/order.entity.spec.ts` (entity invariants), `tests/application/apply-discount.use-case.spec.ts` (with mocked ports), `tests/integration/...` (real DB if needed).

That's the recipe. Every feature follows the same shape.

---

## 5. How to Debug When Things Break

Hexagonal makes debugging predictable because each kind of bug lives in a known layer.

| Symptom | Where to look first | Why |
|---|---|---|
| **HTTP 400** ("invalid request body") | `contracts/<domain>/*.schema.ts` | The Zod schema is rejecting the payload. The error message says which field. |
| **HTTP 401 / 403** | `backend/domains/auth/api/strategies/` and `backend/domains/tenant/api/guards/tenant.guard.ts` | Auth strategy or tenant guard is rejecting the request. |
| **HTTP 404** ("not found") | `backend/domains/<domain>/infra/repositories/prisma-*.repository.ts` | The repository's `findOne` returned null. Likely a tenant-isolation cross-tenant access (returns 404 by design — never 403 — to avoid leaking existence). |
| **HTTP 422** ("business rule violation") | `backend/domains/<domain>/core/entities/*.entity.ts` | A domain invariant threw. The entity's `submit()` / `cancel()` / etc. method has the rule. |
| **HTTP 500** | `backend/shared/nestjs/filters/unknown-error.filter.ts` logs it. Then trace into `application/use-cases/` for the failing operation. |
| **Wrong total / wrong calculation** | `backend/domains/<domain>/core/services/*.service.ts` | Pure functions live here. Write a unit test that reproduces the input. Fix in core. |
| **Order is created but kitchen never sees it** | `backend/domains/kitchen/application/handlers/on-order-submitted.handler.ts` | The handler subscribed correctly? Then the use case it calls. Then the Socket.io gateway that broadcasts. |
| **Socket.io ticket updates not arriving on the kitchen tablet** | `backend/domains/kitchen/infra/gateways/socket-io.gateway.ts` (room name? tenant ID?), then `frontend/kitchen/src/features/ticket-board/hooks/useTicketStream.ts` (subscribed to the right event?) |
| **Cross-tenant data leak** (the nightmare) | `backend/shared/prisma/tenant-isolation.middleware.ts` should have caught it. If it didn't, the offending file is in some domain's `infra/repositories/` and forgot the `tenantId` filter. |
| **Migration fails on deploy** | `database/migrations/` — the bad migration file. Roll back per `database/README.md`. |
| **Build fails with "core/ must be framework-free"** | Someone tried to import Prisma or NestJS into `core/`. The ESLint error says exactly which file. **Do not bypass the rule.** Define a port instead. |

The debugging recipe: **find the layer first, the domain second, the file third.** That's what the layout buys you.

---

## 6. Why This Layout Wins for XFOS Specifically

These are the XFOS-specific reasons (each tied to a fact already in the docs).

### 6.1 Tenant isolation is the crown jewel — it deserves a pure home

The single most important rule in the system is *"every query includes `WHERE tenant_id = ?` from the JWT, never from input"* (`shared/04-auth-rbac.md`). In this layout + hexagonal, this rule lives in:

- **`backend/domains/tenant/core/services/tenant-isolation.service.ts`** — pure logic, unit-tested with no framework
- **`backend/domains/tenant/api/guards/tenant.guard.ts`** — the NestJS guard that calls the service
- **`backend/shared/prisma/tenant-isolation.middleware.ts`** — the Prisma middleware safety net

Three layers, one rule, all testable, none coupled to each other. If Prisma changes, only the middleware changes. If NestJS changes, only the guard changes. The rule itself never changes.

### 6.2 The Prisma schema is the single source of truth (ADR-004)

`database/prisma/schema.prisma` is **one file**. One migration history. Cross-domain joins are first-class. The schema is owned by the founder via CODEOWNERS. Junior frontend devs never need to read it — they consume types from the generated Prisma client (which the backend wraps and exposes only via repository ports).

### 6.3 The 8 backend modules in `backend/00-overview.md` become 8 real packages

The team already drew the bounded contexts on paper: `auth`, `tenant`, `catalog`, `order`, `billing`, `kitchen`, `onboarding`, `admin`. In this layout + hexagonal, those become real workspace packages with explicit dependency declarations, not just folders inside `src/modules/`. The modular monolith philosophy is now enforced at the file system, not just by convention.

### 6.4 Service extraction in Phase 3 of the scaling timeline becomes mechanical

When the time comes to extract `kitchen-realtime` into its own NestJS service (Phase 3, ~500–2,000 merchants), the work is:

1. `cp -r backend/domains/kitchen/ new-repo/`
2. Replace `infra/repositories/prisma-kitchen-ticket.repository.ts` with one that talks to the new isolated DB (or keep it pointing at the same DB if you're not splitting data yet).
3. Replace the in-process `EventPublisher` adapter with a BullMQ / NATS / Kafka adapter.
4. Add a thin `api/main.ts` to bootstrap the new service.
5. Done.

**`core/` and `application/` move unchanged.** The business logic is forever. This is the promise that this layout delivers, because the layers that hold the business logic are already infrastructure-free.

### 6.5 Junior engineers get a recipe, not a maze

"You own `domains/catalog`. Read its README. To add a use case: write the entity, write the use case, write the adapter, write the controller, write the schema, write the tests." It's a 5-step procedure with the same shape every time. Once a junior internalizes it on one domain, they can ship features in any other domain.

### 6.6 Frontend features stay simple — feature folders, not packages

Frontend features live **inside** their app (`frontend/storefront/src/features/menu-browse/`), not as workspace packages. There is no `frontend/shared/` directory at all — per §12, each app owns full copies of its UI primitives, design tokens, i18n dictionaries, and API client functions. Features needed by multiple apps (like `order-status`, which both storefront and kitchen consume) are duplicated into each app's own `src/features/` folder. This keeps the workspace package count low (~10 total) and each app fully portable to any host.

### 6.7 `contracts/` resolves the types-vs-validators question once

Each contract file is a Zod schema; the TypeScript type is `z.infer<typeof Schema>`. **One source of truth** for what crosses the wire. The backend uses the schema in a `ZodValidationPipe`. The frontend uses it for form validation and to type API responses. No drift, no parallel maintenance, no separate `types/` package.

---

## 7. What Already Decided This (ADR pointers)

This document does not relitigate the ADRs that already exist. They point to the same direction:

- **ADR-003 — Monorepo (`shared/09-decisions-adrs.md`):** YES to monorepo with pnpm + Turborepo. Reasons: shared TypeScript types prevent FE/BE drift, single PR for cross-cutting changes, Turborepo cache, small team.
- **ADR-006 — Platform-admin isolation (`platform-portal/03-isolation-design.md`):** Same monorepo, fully self-contained `internal/platform-admin` (now `frontend/platform-admin`), no shared UI imports, separate Vercel project, IP-allowlisted. Splits later **only** if compliance demands it.
- **ADR-004 — Prisma single schema:** ONE `schema.prisma`, ONE migration history. No per-domain schema fragmentation.
- **`backend/00-overview.md`** — modular monolith, 8 domain modules. This layout + hexagonal makes those modules real packages.
- **`mvp-design-spec.md:93`** — "Perfect microservices architecture | Never early." This layout supports the modular monolith pattern AND makes future extraction mechanical, which is the right balance.

This layout + hexagonal is the *implementation* of these decisions, not a contradiction of them.

---

## 8. Scaling Timeline — Monorepo at Thousands of Merchants

> *"When the company grows to a few thousand merchants, will the monorepo still work?"*
>
> Short answer: **yes.** "Thousands of merchants" is a runtime concern; "the monorepo holds up" is a team-size concern. They scale on different axes.

### 8.1 Two questions with two different drivers

| Question | Real driver | When it bites |
|---|---|---|
| **Will the monorepo (code organization) hold up?** | Number of **engineers**, not merchants | ~30–50+ engineers |
| **Will the system (runtime architecture) hold up?** | Number of **merchants** and orders/sec | Starts biting at ~50–100 active restaurants |

### 8.2 The actual XFOS scaling timeline

| Phase | Merchants | Engineers | What changes | Repo? |
|---|---|---|---|---|
| **1 — MVP** | 1–50 | 2–4 | Current architecture works as-is. Ship the 6 P0 fixes from `architecture-review.md`. | Monorepo (unchanged) |
| **2 — Early growth** | 50–500 | 4–8 | Ship the **Redis adapter for Socket.io** (lifts the `MAX_REPLICAS=1` constraint — finding F-2). Add **PgBouncer**. Add a **CDN** for menu images. Hire your first DevOps-leaning generalist. | Monorepo (unchanged) |
| **3 — Scale** | 500–2,000 | 8–15 | **Extract `kitchen-realtime` into its own NestJS service.** Because the kitchen domain is hexagonal, this is mechanical: `cp -r backend/domains/kitchen/`, swap the in-process event bus adapter for BullMQ/NATS, replace the Prisma adapter with one talking to the new isolated DB. **Core and application layers move unchanged.** Add **Postgres read replicas**. | Monorepo with 2–3 services |
| **4 — Big** | 2,000+ | 15–30+ | Extract 1–2 more hot domains if metrics demand it (probably `billing` or notifications). Look at sharding Postgres by `tenant_id`. **Now** consider whether the repo itself needs splitting — most teams find Turborepo remote cache + sparse-checkout solves CI slowness without splitting. | Still monorepo (probably) |

**The critical insight:** every scaling change in this table is a **deployment** change, not a **repo** change. This layout + hexagonal makes Phase 3 (the hardest one) **mechanical** because the layers that hold business logic are already infrastructure-free. This is the payoff for the boilerplate cost.

### 8.3 What you should actually budget for at thousands of merchants

If planning for that scale, the things to spend money and engineering attention on are runtime, not code organization:

1. **Finding F-2 (the `MAX_REPLICAS=1` Socket.io constraint)** — hits long before merchant 500. Ship the Redis adapter early.
2. **Postgres connection pool** — add **PgBouncer** and explicit `?connection_limit=` in `DATABASE_URL`.
3. **Background job throughput** — `backend/workers/` becomes a separate process. Easy because workers reuse the same `core/` and `application/` packages from the monorepo.
4. **Database backup and PITR cost** — at thousands of merchants, daily snapshot retention costs real money. Plan for it (finding F-4).
5. **Observability cost** — Sentry, Datadog, Logtail all bill per event. Budget $200–500/month for observability around the 500-merchant mark.
6. **ABA PayWay rate limits** — talk to ABA early about projected volume.

### 8.4 Bottom line

**This layout + hexagonal decision is good for the next 3–5 years.** What needs to change as you scale is the *runtime* architecture, and every one of those changes happens **inside** the monorepo, not by splitting it.

---

## 9. When to Revisit (Exit Criteria)

In the same format other ADRs use — concrete, falsifiable triggers.

**Split one or more workspaces into separate repos when at least TWO of the following become true:**

1. **Team size > 10 engineers** with two or more sub-teams that have independent release cadences.
2. **Storefront and API release cadences diverge by 10× or more.** E.g., API ships once a week, storefront ships 50× a day.
3. **CI cycle time on `main` exceeds 20 minutes** despite Turborepo caching, and profiling shows the slowdown comes from cross-workspace task ordering.
4. **A regulatory or compliance requirement** explicitly mandates code separation (e.g., a SOC 2 / PCI auditor requires payment-handling code in a separate repo with separate access controls).
5. **A specific workspace becomes a hot security target** (e.g., an open-source UI package you want to publish publicly while keeping the rest private).
6. **You hire a dedicated DevOps engineer** whose job is to manage cross-repo deploys.

Until at least **two** of these are true, splitting will cost more than it saves.

---

## 10. Migration Path — If You Ever Need to Split

Hexagonal makes this dramatically simpler because each domain's `core/` and `application/` are already infrastructure-free. Splitting is mostly a packaging exercise, not a refactor.

### Step 1 — Split `contracts/<domain>` first

This is the lowest-risk, highest-value split because contracts have zero runtime code.

1. Create `xfos-contracts-<domain>` repo. Copy `contracts/<domain>/` to it.
2. Add `@changesets/cli`. Publish `v0.1.0` to a private npm registry.
3. In the monorepo, replace `contracts/<domain>/` with a re-export package that does `export * from '@xfos/contracts-<domain>'`. Import paths are unchanged.

**Effort: ~1 day. Risk: low.**

### Step 2 — Split `backend/domains/<domain>` (the headline)

Hexagonal makes this nearly mechanical:

1. `cp -r backend/domains/<domain>/ new-repo-name/`
2. Create a thin `api/main.ts` to bootstrap the new NestJS service.
3. Replace `infra/repositories/prisma-*.repository.ts` with one that talks to the new isolated database (or keep pointing at the same DB if you're not splitting data yet).
4. Replace the in-process `EventPublisher` adapter with a real message bus adapter (BullMQ, NATS, RabbitMQ, Kafka). Also add subscribers for events from the original monorepo via the same bus.
5. Update the original monorepo's `backend/api/app.module.ts` to remove the extracted domain's NestJS module (no longer imported in-process).
6. Update the cross-domain port implementations in other domains' `infra/` to call the new service via HTTP/gRPC instead of in-process.

**`core/` and `application/` move unchanged.** This is the entire point.

**Effort: ~5 days for the first extraction. ~3 days for each subsequent one (you've built the playbook). Risk: medium (deployment coordination, message bus setup).**

### Step 3 — Split `frontend/<app>` if needed

Each frontend app already has its own Vercel project, so the deployment is unchanged. The work is purely about Git org structure.

1. Create `xfos-<app>` repo. Copy `frontend/<app>/` to it.
2. Set up its own CI pipeline.
3. Switch the Vercel project's Git source to the new repo.

**Effort: ~2 days per app. Risk: low.**

### Step 4 — `database/` always stays put

Even if you split everything else, the schema stays in one place — either in its own repo (`xfos-database`) or alongside whichever service ends up owning the most tables. **Never** split the schema per service unless you are fully committed to a microservices migration with eventual consistency between services. That is a multi-quarter project, not a refactor.

**Total effort to fully extract one domain: ~10 days, including testing.** The savings come from hexagonal's clean boundaries.

---

## 11. Cross-References

| Document | Why |
|---|---|
| `docs/mvp/technical-design/shared/09-decisions-adrs.md` | **ADR-003 + ADR-004 + ADR-005** — the authoritative decisions this layout + hexagonal implements. |
| `docs/mvp/technical-design/platform-portal/03-isolation-design.md` | **ADR-006** — explains why platform-admin is in `frontend/platform-admin/` (was `internal/platform-admin/`) and not a separate repo. |
| `docs/mvp/technical-design/backend/00-overview.md` | The 8 backend modules — these become the 8 hexagonal domains in `backend/domains/`. |
| `docs/mvp/technical-design/backend/01-module-structure.md` | The original folder sketch. **Should be updated to match this layout.** |
| `docs/mvp/technical-design/backend/03-domain-boundaries.md` | The cross-domain communication rules. This layout + hexagonal enforces these via ports + events. |
| `docs/mvp/architecture-review.md` | The accompanying architecture review. F-1 (webhook spec contradiction), F-2 (`MAX_REPLICAS=1`), F-3 (secrets), F-5 (MFA), F-6 (CORS/CSP) all need to be addressed regardless of layout. |
| `docs/mvp/mvp-design-spec.md` | Section 4 ("Monorepo Structure") references the older layout. **Should be updated to match this layout.** Note: lines 117 and 161 still say "Express" — see `architecture-review.md` D-1. |
| `.github/CODEOWNERS` | Currently drafted against older paths (`apps/`, `services/`, `packages/`). **Needs to be updated to match these paths** (`backend/domains/*`, `frontend/*`, `contracts/*`, `database/`). Per §12, there are no `frontend/shared/*` paths to protect — each frontend app's own CODEOWNERS file is enough. |

---

## 12. Frontend App Isolation — Independent Setup, Deploy, and Portability

> This section answers a concern raised during design discussion:
>
> *"I don't want one management for all different 4 apps. I want a separate management. If I decide to upgrade and change any tools, library, or config of each app, I can do so without rolling out or impacting the other. I want to have the management completely separated. I now feel scary of deployment or mistake of a frontend app due to the other app and the shared folder may impact each other, and introduce complexity in deployment in separate Vercel app, or if I decide to deploy one frontend app in a different platform or my own VPS."*
>
> This is a legitimate architectural choice and it overrides any earlier section of this document that describes shared frontend packages. **Each frontend app is treated as if it were its own repository, living inside the monorepo for developer convenience but managed as a fully independent unit.**

### 12.1 The principle

**Each frontend app is fully self-contained.** This means:

1. **Owns its own dependencies.** Its `package.json` pins `next`, `react`, `react-dom`, `tailwindcss`, `typescript`, and every other frontend dependency directly. No pnpm catalog references. No root `pnpm.overrides` for the frontend stack. Storefront can be on Next 14 while kitchen is on Next 15. That's a feature.
2. **Owns its own config.** Its `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `.eslintrc.cjs`, and `tsconfig.json` are all standalone. They do **not** extend from a shared frontend preset. (The root `tsconfig.base.json` may be extended for TypeScript *compiler strictness* options only — `strict`, `target`, `module`, `lib` — but everything app-specific is local.)
3. **Owns its own UI primitives.** Each app runs `npx shadcn@latest add button input card ...` locally. The Button component in `frontend/storefront/src/components/ui/button.tsx` is a separate file from the Button component in `frontend/kitchen/src/components/ui/button.tsx`. If you want them to look identical, you copy-paste.
4. **Owns its own design tokens.** Each app has `frontend/<app>/design-system/design_system.json` (the brand source of truth) and a generated `frontend/<app>/src/config/design-tokens.ts`. If you rebrand, you update four JSON files and run `pnpm build:tokens` in each. (This is the explicit cost of the trade-off.)
5. **Owns its own i18n.** Each app has `frontend/<app>/src/lib/i18n/dictionaries/{en,km}.json`. The Khmer translation for "Add to cart" lives in the storefront's dictionary; the Khmer translation for "Mark ready" lives in the kitchen's dictionary. They never mix.
6. **Owns its own API client.** Each app writes its own typed fetch functions in `frontend/<app>/src/lib/api/` using the Zod schemas from `contracts/*`. `lib/api/client.ts` exposes the base `apiFetch`, and per-domain wrappers (`lib/api/order.ts`, `lib/api/catalog.ts`) layer on top. Features call into `lib/api/*` exclusively — never raw `fetch()`. See the two-layer rule in §12.3. The contract is the shared piece; the HTTP client code is not.
7. **Owns its own deploy config.** Its `vercel.json` (or `Dockerfile` for VPS / Railway / Fly / self-host) is specific to this app. Each app can be deployed to a **different platform** if desired — storefront on Vercel, kitchen on Railway, admin on a VPS, platform-admin on Fly.io. Nothing couples them at deploy time.

### 12.2 What IS shared (and why)

The only thing a frontend app imports from outside its own folder is **`contracts/*`**, the Zod schemas that define the HTTP request/response shapes. These must be shared because:

- The backend uses them as its API validation (via `ZodValidationPipe`).
- The frontend uses them to type its fetch calls and to validate response bodies at runtime.
- If frontend and backend drift on the shape, the system breaks at runtime — no amount of per-app independence can fix that.

The contracts package is the **one** unavoidable coupling between the backend and each frontend. Everything else is app-local.

### 12.3 The updated `frontend/` tree (what each app actually contains)

Every frontend app follows the same enterprise-grade layout. Use
`pnpm create-frontend-app <name>` (see §12.8) to scaffold a new one in five
seconds with this exact shape.

**Mental model:**

```
User → App Router (Server) → Feature Hooks (Client) → lib/api → Backend
```

Server Components (in `app/[locale]/.../layout.tsx`) do the initial fetch
(tenant resolution, SEO, first paint). Client hooks under `features/*/hooks`
do interactions, mutations, and revalidation. **Both** go through the same
isomorphic `lib/api/*` clients. There is no second backend in `app/api/`.

```
frontend/<app>/
├── design-system/                   # JSON source of truth for the brand
│   ├── design_system.json           #   ← edit this (colors, spacing, typography)
│   ├── build-tokens.ts              #   Zod-validates and writes src/config/design-tokens.ts
│   └── README.md
│
├── public/                          # Static assets
│
├── tests/                           # Test home — outside src/
│   ├── unit/                        #   Vitest unit tests for lib/ and features/*/api.ts
│   ├── integration/                 #   Vitest + RTL + MSW
│   └── e2e/                         #   Playwright
│
├── src/
│   ├── app/                         # ROUTING ONLY — layouts, pages, error boundaries
│   │   ├── layout.tsx               #   Root html/body — intentionally minimal
│   │   ├── error.tsx                #   Route-level error boundary
│   │   ├── loading.tsx              #   Route-level suspense fallback
│   │   ├── not-found.tsx            #   404 page
│   │   ├── global-error.tsx         #   Top-level error boundary (own <html>)
│   │   ├── [locale]/                #   /en, /km — Khmer-first routing
│   │   │   ├── layout.tsx           #     Wraps providers (i18n, Query, Theme)
│   │   │   ├── page.tsx             #     Locale-aware landing
│   │   │   └── (route-groups)/      #     e.g. (qr)/[tenantSlug] for storefront
│   │   └── api/                     #   TIGHTLY-SCOPED BFF — webhooks, OAuth callbacks, file
│   │                                #   uploads with private creds. NO business logic.
│   │
│   ├── middleware.ts                # LOCALE DETECTION ONLY — no DB calls, no auth lookups
│   │
│   ├── features/                    # ⭐ THE BULK OF THE CODE — bounded feature folders
│   │   └── <feature>/
│   │       ├── components/          #   Feature-specific UI
│   │       ├── hooks/               #   React hooks (TanStack Query lives here)
│   │       ├── api.ts               #   Feature-specific API — calls lib/api/* internally
│   │       ├── store.ts             #   (optional) Zustand or local state
│   │       ├── types.ts             #   Feature-specific types
│   │       └── index.ts             #   PUBLIC API — re-exports what other features can use
│   │
│   ├── components/
│   │   ├── ui/                      # THIS APP'S shadcn primitives (LOCAL COPY)
│   │   │                            #   `npx shadcn@latest add button card input` IN THIS FOLDER
│   │   └── layout/                  # Cross-feature layout shells (Header, Sidebar, Shell)
│   │
│   ├── providers/                   # React tree providers — wired by app/[locale]/layout.tsx
│   │   ├── query-provider.tsx       #   TanStack Query
│   │   ├── i18n-provider.tsx        #   next-intl
│   │   └── README.md                #   (add theme, auth, socket as needed)
│   │
│   ├── lib/                         # LOW-LEVEL UTILITIES ONLY — no business logic
│   │   ├── api/                     #   RAW fetch clients — the only place that builds requests
│   │   │   ├── client.ts            #     apiFetch — auth, retries, tracing, isomorphic
│   │   │   ├── catalog.ts           #     Per-domain wrappers — call apiFetch
│   │   │   ├── order.ts
│   │   │   └── README.md            #     The two-layer API rule
│   │   ├── i18n/
│   │   │   └── dictionaries/        #     en.json, km.json
│   │   ├── analytics/               #   Provider-agnostic event tracking
│   │   ├── telemetry/               #   Sentry + browser logger
│   │   ├── format/                  #   Money, dates, phone, Khmer numerals
│   │   └── utils/                   #   Pure helpers (cn, debounce, slugify)
│   │
│   ├── config/                      # env + constants + GENERATED design tokens
│   │   ├── env.ts                   #   Zod-validated env loader
│   │   ├── constants.ts             #   SUPPORTED_LOCALES, DEFAULT_LOCALE, APP_NAME
│   │   └── design-tokens.ts         #   GENERATED from design-system/design_system.json
│   │
│   └── styles/
│       └── globals.css              # Tailwind directives + app-specific overrides
│
├── package.json                     # OWN dependency list — no catalog:, only contracts/* workspace deps
├── next.config.js                   # OWN — not extending any shared preset
├── tailwind.config.ts               # OWN — reads from src/config/design-tokens.ts
├── postcss.config.js                # OWN
├── tsconfig.json                    # OWN — extends root tsconfig.base.json
├── .eslintrc.cjs                    # OWN — with feature/lib boundary rules (see below)
├── .env.example                     # OWN env reference (no secrets)
└── README.md                        # "How to develop, build, deploy THIS app"
```

**Three ESLint boundary rules — codified in every app's `.eslintrc.cjs`:**

1. **App isolation.** Cannot import from sibling `frontend/*` or any `backend/*`. Only `@xfos/contracts-*` is allowed.
2. **Feature isolation.** `features/<A>` cannot reach into `features/<B>/components/Foo` — only `@/features/<B>` (its `index.ts` public API).
3. **`lib/` is a one-way dependency.** `lib/*` cannot import from `features/*`. If two features need to share something, move it to `lib/`.

**The two-layer API rule** (also in `src/lib/api/README.md`):

```
features/<x>/api.ts  ──calls──>  lib/api/<domain>.ts  ──calls──>  apiFetch  ──>  Backend
```

Features must NEVER call `fetch()` directly. The only place HTTP requests are
constructed is `lib/api/client.ts`. This gives you one place to add auth
headers, retries, tracing, and Next.js cache directives — and one constraint
that keeps `lib/api/*` isomorphic so it works in both Server Components and
client hooks.

**Tenant resolution lives in `app/[locale]/(qr)/[tenantSlug]/layout.tsx`** —
not middleware (too early, can't use Prisma), not in every page (N+1 risk).
The Server Component layout fetches the tenant once per visit and React
caches the result for all child pages.

### 12.3a The BFF rule (ADR-008) — what each frontend's `lib/api/` looks like

Per ADR-008, **each browser frontend has exactly one BFF NestJS module** in
`backend/api/src/modules/<bff>/`, and **the frontend may call only that BFF**.
This collapses each app's `lib/api/*` to a single typed wrapper around the
BFF's endpoints — no per-domain clients in the frontend, ever.

```
frontend/<app>/src/lib/api/
├── client.ts          # base apiFetch wrapper (isomorphic, no business logic)
└── <bff>.ts           # THIS APP's typed BFF client — the only API surface
```

| App | BFF client file | BFF contract package | Backend module |
|---|---|---|---|
| storefront | `lib/api/storefront.ts` | `@xfos/contracts-bff-storefront` | `modules/storefront/` |
| kitchen | `lib/api/kitchen.ts` | `@xfos/contracts-bff-kitchen` | `modules/kitchen/` |
| admin | `lib/api/admin.ts` | `@xfos/contracts-bff-admin` | `modules/admin/` |
| platform-admin | `lib/api/platform-admin.ts` | `@xfos/contracts-bff-platform-admin` | `modules/platform-admin/` |

**Frontend ESLint Rule 4** blocks importing raw domain contracts
(`@xfos/contracts-{order,catalog,billing,tenant,...}`) and sibling-app BFF
contracts. Each frontend may import only:
- `@xfos/contracts-enums` (shared enums)
- `@xfos/contracts-bff-<own-app>` (its own BFF projection)

**Two HTTP surfaces:**

```
                 PUBLIC                                INTERNAL
              (browser FEs)                       (scripts, CLI, integrations)
                    │                                       │
                    ▼                                       ▼
       /api/v1/<bff>/*                       /api/v1/internal/<domain>/*
                    │                                       │
                    └────────┬─────────┬─────────┬──────────┘
                             │         │         │
                             ▼         ▼         ▼
                       modules/    domains/  shared/guards
                       <bff>/      <X>/      (3 walls)
                             │         │
                             └────┬────┘
                                  │ (DI, not HTTP)
                                  ▼
                       application/use-cases
                                  │
                                  ▼
                          core entities + ports
                                  │
                                  ▼
                              Postgres
```

**Three walls for internal endpoints** (all three must be misconfigured for a leak):
1. **URL prefix** — `/api/v1/internal/*` (developer mistakes)
2. **Auth guard** — `ServiceTokenGuard` rejects user JWTs (misrouted requests)
3. **Network** — private network / IP allowlist / API gateway (public exposure)

**Internal APIs are use-case shaped, not CRUD.** Every internal route runs
through `application/use-cases/*` so domain invariants, events, and audit
logging all apply. Internal APIs MUST NOT bypass entities, MUST NOT directly
mutate the database, and MUST go through the same use case the BFF would
call. See `backend/api/src/modules/README.md` and ADR-008.

### 12.4 A sample `package.json` for one app

Note the absence of `catalog:` references — every version is pinned directly. The only workspace deps are `contracts/*`.

```jsonc
// frontend/storefront/package.json
{
  "name": "@xfos/frontend-storefront",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev":        "next dev",
    "build":      "next build",
    "start":      "next start",
    "lint":       "next lint",
    "typecheck":  "tsc --noEmit",
    "test":       "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next":      "14.2.5",                         // pinned, not catalog:
    "react":     "18.3.1",
    "react-dom": "18.3.1",
    "zod":       "3.23.8",
    "next-intl": "3.17.2",
    "@xfos/contracts-catalog": "workspace:*",      // the ONLY workspace deps
    "@xfos/contracts-order":   "workspace:*",
    "@xfos/contracts-billing": "workspace:*",
    "@xfos/contracts-tenant":  "workspace:*",
    "@xfos/contracts-enums":   "workspace:*"
  },
  "devDependencies": {
    "typescript":     "5.5.4",
    "tailwindcss":    "3.4.7",
    "postcss":        "8.4.41",
    "autoprefixer":   "10.4.19",
    "@types/react":     "18.3.3",
    "@types/react-dom": "18.3.0",
    "@types/node":      "20.14.14",
    "eslint":           "8.57.0",
    "eslint-config-next": "14.2.5",
    "vitest":           "2.0.5",
    "@vitejs/plugin-react": "4.3.1"
  }
}
```

**Upgrading Next.js in storefront only:** change `"next": "14.2.5"` to `"next": "15.0.0"` in this file. Run `pnpm install --filter @xfos/frontend-storefront`. Run `pnpm --filter @xfos/frontend-storefront build`. Kitchen, admin, and platform-admin are **untouched** — they stay on whatever version their own `package.json` pins.

### 12.5 A sample `next.config.js` for one app (standalone — not extending anything)

```js
// frontend/storefront/next.config.js
/** @type {import('next').NextConfig} */
module.exports = {
  output: 'standalone',                   // ← critical for portable deploy (see §12.6)
  reactStrictMode: true,
  poweredByHeader: false,

  // Transpile the contracts workspace package so it's bundled into the output
  transpilePackages: [
    '@xfos/contracts-catalog',
    '@xfos/contracts-order',
    '@xfos/contracts-billing',
    '@xfos/contracts-tenant',
    '@xfos/contracts-enums',
  ],

  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.xfos.app' }],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'X-Frame-Options',            value: 'DENY' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};
```

Kitchen has its own `next.config.js` with different security headers (tablet PWA needs different rules). Admin has its own with different `remotePatterns`. Platform-admin has its own with tighter CSP. They are not generated from a factory; they are deliberately written per app. If a change is needed in all four, you edit all four files — and that's the point.

### 12.6 Deployment portability — Next.js `output: 'standalone'`

The single most important thing that makes each frontend app portable is Next.js's built-in `output: 'standalone'` mode. Enabled in `next.config.js`, it causes `next build` to emit a **self-contained** output directory that includes:

- The compiled server code
- A minimal `node_modules` with only the runtime deps actually used
- The `public/` folder
- Everything needed to run the app **without any workspace context**

The result is a directory you can tar, upload, and run anywhere Node.js is installed. No pnpm workspace resolution needed at runtime.

**Example Dockerfile per app** (identical shape for all four, but each lives in its own folder):

```dockerfile
# frontend/storefront/Dockerfile
# Build stage — happens in the monorepo context
FROM node:20-alpine AS builder
WORKDIR /repo

# Copy the minimum needed to resolve this app's workspace deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY contracts ./contracts
COPY frontend/storefront ./frontend/storefront

RUN npm install -g pnpm@9
RUN pnpm install --filter @xfos/frontend-storefront...
RUN pnpm --filter @xfos/frontend-storefront build

# Runtime stage — only the standalone output
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy the standalone output (this is what makes it portable)
COPY --from=builder --chown=nextjs:nodejs /repo/frontend/storefront/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/frontend/storefront/.next/static ./frontend/storefront/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/frontend/storefront/public ./frontend/storefront/public

USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "frontend/storefront/server.js"]
```

**Where you can deploy each app:**

| Target | How |
|---|---|
| **Vercel** | Set the Vercel project's Root Directory to `frontend/storefront/`. Zero Dockerfile needed. |
| **Netlify** | Same pattern, Root Directory → `frontend/storefront/`. |
| **Railway** | Use the Dockerfile above. Railway builds and runs it. |
| **Fly.io** | `fly launch` from `frontend/storefront/` with the Dockerfile. |
| **Your own VPS** | `docker build -t xfos-storefront -f frontend/storefront/Dockerfile .` from the repo root, then `docker run` on the VPS. Or extract the standalone output and run `node frontend/storefront/server.js` directly on the VPS. |
| **Cloudflare Workers / Pages** | Build with the Cloudflare adapter; still a per-app choice. |

Each app picks its own deploy target independently. Storefront can move from Vercel to a VPS without touching kitchen, admin, or platform-admin.

### 12.7 Cross-app failure containment — the simplified matrix

Because each frontend app is self-contained, the set of things that can affect the customer-facing order flow on storefront is much smaller than the previous matrix:

| Change | Can it break storefront's order flow? |
|---|---|
| `frontend/kitchen/**` change | ❌ No. Different app, different deploy, different runtime. Physically impossible. |
| `frontend/admin/**` change | ❌ No. Same reasoning. |
| `frontend/platform-admin/**` change | ❌ No. Same reasoning. |
| `frontend/storefront/**` change | ✅ Yes — only this app is affected. Mitigation: preview deploys, tests, senior review on main branch. |
| Adding a UI primitive to `frontend/admin/src/components/ui/` | ❌ No. Storefront has its own copies; they are physically separate files. |
| Upgrading React in `frontend/kitchen/package.json` | ❌ No. Each app pins its own React version. |
| Adding a Tailwind plugin to `frontend/admin/tailwind.config.ts` | ❌ No. Each app has its own Tailwind config. |
| Changing `contracts/order/submit-order.schema.ts` | ✅ Yes — and changes the backend too. This is the one cross-cutting change. Mitigation: contract changes require senior review, and Zod validation on both sides catches runtime mismatches immediately. |
| Changing `backend/domains/order/**` | ✅ Yes — but the backend is shared. Mitigation: backend tests + preview deploys. |
| Changing `database/prisma/schema.prisma` | ✅ Yes — most dangerous change in the whole system. Mitigation: founder-only CODEOWNERS, additive migrations, restore drills (F-4). |

**Only three things can affect the storefront's order flow: storefront's own code, the `contracts/order/` schema, and the backend or database.** Three of those are unavoidable in any architecture (the contract is the interface, the backend is where orders actually run, the DB is where they persist). The fourth — another frontend app — is **architecturally impossible** with this layout.

### 12.8 `pnpm create-frontend-app <name>` scaffold

A script that generates a new fully self-contained Next.js app in ~5 seconds. Lives at `scripts/create-frontend-app.ts` in the repo root:

```
$ pnpm create-frontend-app reports
✓ Created frontend/reports/ (port 3104)
✓ Layout: app/[locale] + features/ + lib/ + providers/ + config/
✓ ESLint boundary rules: app isolation, feature isolation, lib one-way
✓ Tests scaffold: tests/{unit,integration,e2e}
✓ Updated pnpm-workspace.yaml

Next steps:
  pnpm install
  pnpm --filter @xfos/frontend-reports build:tokens
  pnpm --filter @xfos/frontend-reports dev
```

The scaffolder generates the full structure shown in §12.3:

- `package.json` pinned to the exact same Next/React/Tailwind versions as the
  other apps (no `catalog:` references) — only `@xfos/contracts-enums` as a
  workspace dep by default.
- `next.config.js` with `output: 'standalone'`, security headers, and only
  the contract packages in `transpilePackages`.
- `tailwind.config.ts` reading from `src/config/design-tokens.ts`.
- `.eslintrc.cjs` with the three boundary rules wired in.
- `design-system/design_system.json` starter brand JSON + `build-tokens.ts`
  generator that writes to `src/config/design-tokens.ts`.
- `src/middleware.ts` that does locale detection and nothing else.
- `src/app/{layout,error,loading,not-found,global-error}.tsx` plus
  `src/app/[locale]/{layout,page}.tsx` for locale-aware routing.
- `src/lib/api/client.ts` with the isomorphic `apiFetch` wrapper, plus
  `lib/api/README.md` documenting the two-layer rule.
- `src/providers/{query-provider,i18n-provider}.tsx` stubs.
- `src/lib/{analytics,telemetry,format,utils}/` with READMEs explaining intent.
- `tests/{unit,integration,e2e}/` placeholders with READMEs.
- `README.md` per app with the structure diagram and the mental model.

After scaffolding, install shadcn primitives **into the new app's folder**:

```bash
cd frontend/reports
npx shadcn@latest add button input card dialog form
# → primitives land in src/components/ui/ — owned by this app
```

**Setup for a new frontend app: one command, ~5 seconds, same shape every time.** The scaffold copies a *reference* design-tokens file and a *reference* i18n dictionary into the new app — from that point on, the new app owns them and can edit them freely without affecting any other app.

### 12.9 Maintaining visual consistency without shared packages

The honest trade-off: without a shared `@xfos/ui-primitives` package, the four apps can drift visually. A button in storefront could end up slightly differently colored than a button in admin. How do you keep them consistent?

**Three tools, in order of strictness:**

1. **A reference document.** `xfos/docs/frontend-design-system.md` describes the brand: primary color `#0F766E`, font family, spacing scale, button radius, etc. When rebranding, you update this doc and then update each app's `design-system/design_system.json`, run `pnpm build:tokens`, and commit the regenerated `src/config/design-tokens.ts`. The reference is the specification; the JSONs are the implementation.
2. **A CI visual-regression test.** Playwright runs against all four apps' preview deploys and takes snapshots of canonical components (Button, Input, Card). The snapshots must be byte-identical across apps OR must be explicitly acknowledged as different. Any accidental drift fails CI.
3. **The `pnpm create-frontend-app` scaffold is the initial source of truth.** New apps start from the same templates. Drift only happens when an engineer deliberately edits a file, which is visible in code review.

Tools 1 and 3 are cheap and should exist from day one. Tool 2 is worth adding once you have more than two frontend apps actively developed.

### 12.10 What each frontend app's `CODEOWNERS` looks like

Each app has its own `CODEOWNERS` file at its package root. Example:

```
# frontend/storefront/CODEOWNERS
*                                 @storefront-dev @founder
src/lib/api/                      @storefront-dev @founder @senior-frontend
src/middleware.ts                 @storefront-dev @founder @senior-frontend
src/config/                       @storefront-dev @founder
design-system/design_system.json  @storefront-dev @founder
package.json                      @founder
next.config.js                    @founder
tailwind.config.ts                @storefront-dev @founder
```

This file overrides the root `.github/CODEOWNERS` for any path matching inside `frontend/storefront/`. A junior working on storefront can freely edit `src/features/*` and `src/components/ui/*`, but changes to `package.json` (dependency bumps), `src/middleware.ts` (locale routing), or `src/lib/api/` (the only place that builds HTTP requests) require senior approval.

The root `.github/CODEOWNERS` only needs one line per frontend app:

```
# .github/CODEOWNERS
/frontend/storefront/             @storefront-dev @founder
/frontend/kitchen/                @kitchen-dev @founder
/frontend/admin/                  @admin-dev @founder
/frontend/platform-admin/         @founder
/contracts/                       @founder @senior-eng
/database/                        @founder
/backend/                         (see backend/domains/*/CODEOWNERS for domain-level rules)
```

No rules for `frontend/shared/*` because that directory does not exist.

### 12.11 Trade-offs (honest)

**What you pay for this isolation:**

1. **Code duplication.** Four copies of the Button component. Four Tailwind configs. Four i18n setups. Four API clients. If you rebrand, you touch four files instead of one.
2. **Slower initial setup.** First app takes the normal Next.js setup time. The scaffold script mitigates this for subsequent apps, but each app still has its full set of config files.
3. **Visual drift risk.** Without shared components, apps can end up subtly different. Mitigation: reference doc + visual regression tests (§12.9).
4. **Upgrade discipline per app.** Each app decides independently when to upgrade Next.js, React, Tailwind, etc. That's the whole point — but it means someone has to remember to upgrade each app. Set a quarterly review: "are any apps on outdated major versions?".
5. **Slightly larger CI time.** Each app builds independently. Turborepo caching still helps, but there's no shared build output between apps.

**What you get in exchange:**

1. **Zero cross-app cascade risk.** Physically impossible for admin to break storefront at runtime.
2. **Independent upgrades.** Storefront can stay on Next 14 for 6 months while kitchen tries Next 15. No coordination required.
3. **Full deployment portability.** Each app can live on Vercel, Netlify, Railway, Fly, a VPS, Cloudflare Pages, or Docker-on-Kubernetes. Independently.
4. **No shared-package review bottleneck.** Nothing is "shared" except contracts, so senior review is only needed for contracts changes.
5. **Simpler mental model per app.** A junior working on kitchen only needs to understand kitchen. There's no "where does this import come from?" question.
6. **Future-proof against polyrepo split.** If you ever want to extract an app to its own repo, it's literally `git subtree split frontend/storefront/`. The app is already a standalone unit.

### 12.12 When to revisit this decision

Go back to shared frontend packages if **at least two** of the following become true:

1. **Visual drift has become a real customer-facing problem** — merchants or customers are complaining that the storefront and admin look like different products.
2. **The same UI fix has been applied to all four apps more than three times** (e.g., a Button accessibility bug fixed four times in a quarter).
3. **i18n dictionaries have drifted** — the same Khmer translation is wrong in storefront but right in admin because nobody synced them.
4. **A frontend team of 5+ engineers** is now working on all four apps, and the duplication cost exceeds the isolation benefit.
5. **A brand refresh is coming** and updating four apps by hand is a multi-week project.

Until at least two of these are true, the isolation is paying for itself.

### 12.13 Summary

| Question | Answer |
|---|---|
| Can I upgrade Next.js in storefront without touching kitchen? | **Yes.** Each app pins its own version. |
| Can I deploy storefront to Vercel and kitchen to a VPS? | **Yes.** Each app has its own deploy config. Next.js `output: 'standalone'` + Dockerfile per app. |
| Can a mistake in admin break the order flow on storefront? | **Physically no** (different apps, different runtimes). Only shared things — `contracts/*`, backend, database — can have cross-app runtime impact, and those are unavoidable in any architecture. |
| Can I move storefront to its own GitHub repo later? | **Yes, easily.** `git subtree split` extracts it as a standalone unit. It has no workspace dependencies except `contracts/*`, which can be published to a private registry. |
| What's the cost? | **Duplication.** Four copies of UI primitives, design tokens, i18n dictionaries, API client functions. Discipline (docs + visual regression tests) prevents drift. |
| What's the benefit? | **Complete independence.** Zero cross-app cascade risk. Independent upgrades. Full deploy portability. |

---

## Appendix — One-Sentence Summary

**One monorepo. Six top-level folders by deployable tier. Each backend domain has four hexagonal layers (`core/application/infra/api`). Four invariants enforced by ESLint. Splitting later is `cp -r` because the business logic was always infrastructure-free.**
