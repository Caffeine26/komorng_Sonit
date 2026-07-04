# Why DDD + Hexagonal Architecture is the Right Choice for XFOS

> **Audience:** Engineers, technical reviewers, and stakeholders who want to
> understand why XFOS uses Domain-Driven Design (DDD) plus Hexagonal
> Architecture (Ports & Adapters), and why this combination is genuinely
> strong for this specific product — not just architectural fashion.
>
> **TL;DR:** XFOS has 8 distinct bounded contexts, 4 frontends, 3 input
> channels (HTTP / WebSocket / Queue), and multiple replaceable
> infrastructure choices (payment gateway, notification channel, hosting
> platform). DDD gives us the language and boundary tools; Hexagonal
> Architecture gives us the dependency-direction discipline that keeps
> business logic alive across infrastructure changes. Together they make
> the codebase testable, evolvable, and learnable. The cost is a steeper
> learning curve and more files per feature — both manageable with
> documentation and tooling.

---

## Table of contents

1. [What DDD and Hexagonal Architecture are (in 5 minutes)](#1-what-ddd-and-hexagonal-architecture-are-in-5-minutes)
2. [Why the combination is strong (the general case)](#2-why-the-combination-is-strong-the-general-case)
3. [Why it fits XFOS specifically (10 match factors)](#3-why-it-fits-xfos-specifically-10-match-factors)
4. [Consolidated pros](#4-consolidated-pros)
5. [Honest cons and how XFOS mitigates each](#5-honest-cons-and-how-xfos-mitigates-each)
6. [Comparison with alternatives](#6-comparison-with-alternatives)
7. [Concrete examples in XFOS](#7-concrete-examples-in-xfos)
8. [When NOT to use this architecture](#8-when-not-to-use-this-architecture)
9. [References and further reading](#9-references-and-further-reading)

---

## 1. What DDD and Hexagonal Architecture are (in 5 minutes)

### 1.1 Domain-Driven Design (Eric Evans, 2003)

DDD is two things at once:

**Strategic design** — how you split a large system:

- **Bounded Contexts** — a model is consistent only within a context. The
  word "Order" means something specific in the Storefront context and
  something different in the Billing context. Bounded contexts have
  explicit boundaries; cross-context communication uses defined contracts
  (events, anti-corruption layers).
- **Ubiquitous Language** — code uses the same words the business uses.
  No `OrderProcessor`, `OrderManager`, `OrderHelper`. Just `Order` (entity)
  and named use cases like `SubmitOrder`, `CancelOrder`, `MarkOrderReady`.
- **Context Mapping** — explicit relationships between contexts:
  upstream/downstream, partnership, customer/supplier, conformist,
  anti-corruption layer.

**Tactical design** — how you build inside a context:

- **Entities** — objects with identity (a `Bill` with id `LB-B-000125`).
  Behavior lives on the entity, not in service classes.
- **Value Objects** — objects without identity, defined by their
  attributes (`Money(amount=650, currency=USD)`). Immutable. Equality is
  value-based.
- **Aggregates** — clusters of entities with one root. The root is the
  only entry point; consistency boundaries align with aggregates. Example:
  `Order` aggregate root has `OrderItem` children — you don't reach
  inside the aggregate.
- **Domain Services** — operations that don't fit naturally on one
  entity (e.g., "Calculate bill total across multiple orders").
- **Domain Events** — facts that have happened (`OrderSubmitted`,
  `PaymentSucceeded`, `BillVoided`). Domain events drive cross-context
  communication.
- **Repositories** — abstractions for retrieving aggregates. The domain
  defines the *interface*; infrastructure provides the implementation.

### 1.2 Hexagonal Architecture (Alistair Cockburn, 2005)

Also called **Ports and Adapters**.

The picture:

```
                    ┌─────────────────────┐
                    │   PRIMARY ADAPTERS   │
                    │  (driving the app)   │
                    │                     │
                    │  HTTP controllers   │
                    │  WebSocket gateway  │
                    │  CLI tools          │
                    │  Queue handlers     │
                    │  Cron jobs          │
                    └──────────┬──────────┘
                               ▼
                  ┌─────────────────────────┐
                  │      INPUT PORTS         │
                  │  (interfaces the core    │
                  │   exposes to the world)  │
                  └────────────┬─────────────┘
                               ▼
              ┌────────────────────────────────┐
              │         APPLICATION CORE        │
              │  (entities, use cases, rules)   │
              │  ──────────────────────────     │
              │   PURE BUSINESS LOGIC           │
              │   No frameworks. No I/O.        │
              └────────────────┬───────────────┘
                               ▼
                  ┌─────────────────────────┐
                  │     OUTPUT PORTS         │
                  │  (interfaces the core    │
                  │   needs from the world)  │
                  └────────────┬─────────────┘
                               ▼
                    ┌─────────────────────┐
                    │  SECONDARY ADAPTERS  │
                    │  (driven by the app) │
                    │                     │
                    │  PostgreSQL repo    │
                    │  Redis cache        │
                    │  Socket.io emitter  │
                    │  ABA payment client │
                    │  Telegram sender    │
                    └─────────────────────┘
```

**Key rule (the Dependency Inversion Principle):** the core defines the
interfaces it needs from the outside world. Infrastructure code
implements those interfaces. Dependencies point **inward**:

```
Adapters → Ports → Core
```

The core never imports an adapter. The core never imports a framework.
The core is pure TypeScript (in our case) with maybe a validation library
(Zod) — that's it.

### 1.3 How DDD and Hexagonal combine

DDD answers: "how do we model the business?"
Hexagonal answers: "where does the model live?"

DDD says: build entities, value objects, use cases, domain events.
Hexagonal says: put them in the core; let adapters translate between
external concerns (HTTP, DB, queue) and the domain.

Together they form what's often called **Clean Architecture** or
**Onion Architecture** (Jeffrey Palermo) — the same pattern with slightly
different vocabulary. We use the term "Hexagonal" because it's the most
pictorial; "DDD" because it's the most established for the business-modeling
side.

---

## 2. Why the combination is strong (the general case)

These are the reasons DDD + Hexagonal wins for non-trivial business
systems, independent of XFOS.

### 2.1 Business logic outlives infrastructure

The average enterprise codebase changes its database, framework, payment
processor, or queue at least once. If your business logic is tangled with
"the way Prisma works" or "what NestJS expects," every infrastructure
swap is a rewrite.

In hexagonal, the core defines what it needs (`OrderRepository.save(order)`).
The adapter (PrismaOrderRepository) implements it. Swapping Prisma for
Drizzle is a one-adapter change; the core doesn't know.

### 2.2 Tests run in milliseconds, not seconds

Pure-domain unit tests don't need a database, a queue, or a network.
`new Order(...)` + assertions — done. A test suite for the entire domain
layer can run in <1 second.

Without hexagonal, every unit test pulls in a Postgres connection, a
NestJS module, and probably 30MB of dependencies. CI takes 10 minutes to
run what should take 30 seconds.

### 2.3 The model becomes the documentation

Ubiquitous language means code reads like the business spec. When a
merchant says "the bill should be voided," there's a `Bill.void()` method.
When the business says "an order can be cancelled with a reason," there's
a `Order.cancel(reason: OrderCancellationReason)` method. New engineers
trace business behavior by reading the entities, not by digging through
service classes named `OrderProcessor`.

### 2.4 Bounded contexts contain change

When the catalog team rewrites menu management, they touch
`modules/catalog/`. They don't accidentally break orders because orders
don't import catalog code — they communicate via events
(`MenuItemDeleted`, `MenuItemPriceChanged`).

This is the single most underrated benefit. Most "architecture problems"
in growing codebases come from unbounded change radius. DDD's bounded
contexts cap the radius.

### 2.5 Use cases make intent explicit

Hexagonal forces every action to be a named use case:
`SubmitOrderUseCase`, `MarkOrderReadyUseCase`, `VoidBillUseCase`. Each
has one method (`execute(input)`). Each tells the reader what business
operation it performs.

This is in contrast to "service" classes that accumulate dozens of
methods (`OrderService.findById`, `.create`, `.update`, `.delete`,
`.findByTenant`, `.findByStatus`, `.maybeRefund`, `.void`...) — the
class becomes a junk drawer.

### 2.6 Domain events enable evolution

`PaymentSucceeded` event has 5 listeners today: bill update, kitchen
ticket creation, audit log, customer notification, analytics. Tomorrow
add a 6th (loyalty points) — zero changes to existing code, zero risk
of breaking existing flows.

This is event-driven choreography without the operational complexity of
event sourcing or message brokers (events stay in-process at MVP scale,
fan out to BullMQ when durability matters).

### 2.7 Multi-channel inputs share business logic

A REST API call, a WebSocket message, a BullMQ job, and a CLI command
should all be able to "submit an order" without three copies of the
business rule. In hexagonal, each is a primary adapter that translates
its input format and calls `SubmitOrderUseCase.execute(...)`. The
business rule lives once.

### 2.8 The codebase teaches itself

A new engineer opens `modules/order/core/entities/Order.ts` and learns
what an order *is*. They open `modules/order/application/use-cases/`
and learn what *can be done* to it. They open `modules/order/infra/`
and learn how it talks to the outside world. The structure mirrors the
mental model.

---

## 3. Why it fits XFOS specifically (10 match factors)

This is the case for *this product*, not architecture for its own sake.

### 3.1 Match factor 1 — XFOS has 8 distinct bounded contexts already

The PRD already identifies 8 bounded contexts:

| Context | Owns |
|---|---|
| **Auth** | JWT, refresh tokens, multi-provider login, invitations, OTP |
| **Tenant** | Tenant lifecycle, settings, operating hours, payment-method config, branding |
| **Catalog** | Bilingual menus, items, variants, options, images |
| **Order** | Carts, orders, status, idempotency, floor plans, tables, QR |
| **Billing** | Bills, payments, refunds, ABA PayWay, webhooks |
| **Kitchen** | Tickets, real-time display, priority queue |
| **Onboarding** | DRAFT→ACTIVE provisioning, milestone tracking |
| **Admin** | Cross-tenant audit log, platform-level events |

These contexts emerged naturally from the product analysis, not by
forcing a DDD shape onto a flat domain. **When the contexts are real,
DDD is the right tool.** When they're forced, DDD becomes ceremonial.

XFOS's contexts even have ubiquitous language with the business — a
merchant says "session," "ticket," "bill," and the code uses the same
words.

### 3.2 Match factor 2 — Multi-tenancy is a textbook strategic-DDD problem

Multi-tenant SaaS has invariants that *must* hold across every code path:
- Every query filters by `tenant_id`
- `tenant_id` comes from the JWT claim, never from input
- Cross-tenant FK linking is impossible

These are domain invariants. In hexagonal, they live in the application
core (the `TenantGuard`, the `@CurrentTenant()` decorator, the
composite-PK enforcement). They're enforced once, applied everywhere.
Without hexagonal, every controller would re-implement the tenancy check,
and one missed implementation = security incident.

### 3.3 Match factor 3 — Multiple input channels, same domain

XFOS receives requests through:
- **HTTP (REST)** — frontends call BFF endpoints
- **WebSocket (Socket.io)** — kitchen tablets receive ticket events
- **HTTP webhooks** — ABA PayWay callbacks
- **Queue jobs (BullMQ)** — payment retries, notification dispatch
- **Scheduled jobs** — session cleanup, idempotency purge, audit retention

All of these eventually call use cases like `SubmitOrder`,
`MarkPaymentSucceeded`, `CloseSession`. Without hexagonal, the business
rule for "succeeded payment moves bill to PAID" would exist in 3 places
(HTTP webhook handler, manual cash confirmation, refund-reversal flow).
With hexagonal, it exists once in `MarkPaymentSucceededUseCase`.

### 3.4 Match factor 4 — Multiple replaceable infrastructure choices

XFOS will swap at least these over its lifetime:

| What | Today | Realistic future |
|---|---|---|
| Payment gateway | ABA PayWay | + Wing, + Stripe, + Pi Pay |
| Notification channel | Telegram | + Email, + SMS, + Facebook Messenger |
| Hosting | Railway + Vercel | + AWS / self-hosted at scale |
| Cache/queue | Upstash Redis | Self-hosted Redis at scale |
| Realtime | Socket.io | Maybe split kitchen to its own service |

Each is a **secondary adapter** in hexagonal. Adding a second payment
gateway is implementing one more `PaymentGateway` interface. The core's
"how to charge a bill" doesn't change.

Compare to a non-hexagonal codebase where `BillService.markPaid()` does
`await abaClient.confirm(billId)` directly — adding Wing means hunting
through 30 files for ABA references.

### 3.5 Match factor 5 — Multiple frontends with different shapes (BFF pattern)

XFOS has 4 frontends with very different needs:

- **Storefront** — minimal payload, mobile-optimized, anonymous customer
- **Kitchen** — real-time push, large fonts, landscape tablet
- **Merchant Portal** — table-heavy, desktop-dense, role-aware
- **Platform Portal** — cross-tenant, ops-focused, IP-restricted

Without hexagonal, you'd either:
- (a) Force all 4 into the same DTO shape (storefront ends up with
  merchant-cost fields; kitchen sees billing details)
- (b) Duplicate domain logic per frontend

Hexagonal's primary-adapter pattern lets the BFF layer translate without
duplicating domain logic. The `SubmitOrder` use case has one signature;
each BFF translates its own DTO into that signature.

### 3.6 Match factor 6 — Audit and compliance are first-class concerns

Cambodia is a regulated environment for tax-audited revenue. XFOS has
to prove what happened, when, by whom. The schema reflects this:
`audit_logs`, `order_status_history`, `kitchen_ticket_events`,
`idempotency_keys` all carry actor-attribution, request correlation,
state diffs.

Domain events (`OrderSubmitted`, `BillPaid`, `PaymentRefunded`) are the
natural source of audit log entries. In hexagonal, an event handler in
the Admin module subscribes to all domain events and writes audit logs.
**No business logic is duplicated for audit purposes.**

This pattern is hard to bolt onto an MVC codebase after the fact;
designing it from day 1 is cheap.

### 3.7 Match factor 7 — Future microservices split is plausible

The kitchen service is the most likely candidate to split out: real-time
needs, different scaling pattern, distinct team-of-one. With hexagonal,
splitting the Kitchen module into a separate service means:

1. Replace the in-process event bus with a network event bus (NATS,
   Redis pub/sub, etc.) for the events Kitchen publishes/subscribes.
2. Replace the in-process repo with an HTTP client to the new service.
3. Done.

The kitchen domain logic doesn't change. The kitchen entities don't
change. The use cases don't change. Only the adapters change.

Without hexagonal, splitting a service typically means rewriting
business logic into a new framework, then spending months reconciling
behavior differences.

### 3.8 Match factor 8 — Ubiquitous language matters across two languages (Khmer + English)

XFOS supports Khmer-first interfaces. Merchants speak Khmer; engineers
speak English; product specs are in English. The risk is a translation
layer between business intent and code (e.g., the merchant says
"session" in Khmer, the spec says "order group," the code says
`OrderContainer`).

DDD's ubiquitous-language discipline is a forcing function: the code
uses the same word the business uses. We have an `OrderSession` entity.
Not `OrderContainer`, not `OrderGroup`, not `Tab`. This catches
translation errors at the design phase.

### 3.9 Match factor 9 — Real domain rules to enforce (not CRUD)

XFOS has genuine business rules, not just CRUD operations:

- "An order can only move from PREPARING to READY, not from PREPARING
  to COMPLETED" — encoded in `Order.markReady()`.
- "A bill cannot be VOIDED if it has SUCCEEDED payments" — encoded in
  `Bill.void()`.
- "A cart can only have ONE active state per session" — encoded in the
  Cart aggregate + DB partial unique.
- "Payment retries are allowed; the bill stays OPEN until a payment
  SUCCEEDS" — encoded in `Payment` and `Bill` lifecycle.
- "An idempotency key with a different request body returns 409, not
  the cached response" — encoded in `IdempotencyService.check()`.

Putting these in entity methods (vs scattering across controllers and
service classes) means there's exactly one place to verify the rule.
Code review of `Order.cancel()` is a finite, focused conversation.

### 3.10 Match factor 10 — The MVP is the seed of a long-lived platform

XFOS isn't a throwaway prototype. The product is intended to grow over
years: more payment gateways, more service models, customer accounts,
loyalty programs, multi-location merchants, etc. The 8 bounded contexts
will likely become 12, then 16.

Hexagonal makes growth additive (new adapter, new use case) instead of
disruptive (refactor across many files). DDD makes context boundaries
explicit so growth doesn't blur them.

A throwaway MVP doesn't need this. A platform MVP does.

---

## 4. Consolidated pros

### 4.1 Testability

- Domain unit tests run in milliseconds.
- Use case tests can mock 1–2 ports instead of bootstrapping a framework.
- Integration tests focus on adapter↔service correctness, not domain
  re-validation.
- Easier to enforce 80%+ coverage on the domain (where bugs hurt most).

### 4.2 Replaceability

- Database swap (Prisma → another ORM) is one adapter rewrite.
- Payment-gateway swap (ABA → Wing) is one adapter add.
- Notification-channel swap (Telegram → email) is one adapter add.
- Hosting swap (Railway → AWS) doesn't touch domain code.

### 4.3 Multi-channel input convergence

- HTTP, WebSocket, BullMQ, cron all converge on the same use cases.
- Business rule lives once.
- Adding a 5th input channel (e.g., a CLI for ops) is 1 adapter file.

### 4.4 Bounded change radius

- Catalog rewrite doesn't touch order code.
- Auth provider addition doesn't touch billing.
- Cross-context coupling happens via explicit events.
- Refactors stay local; the blast radius matches the bounded context.

### 4.5 Ubiquitous language

- Code uses business words.
- Specs translate cleanly to code (and vice versa).
- New engineers learn the domain by reading entities.
- Stakeholder reviews can read code.

### 4.6 Explicit invariants

- Multi-tenancy invariants in one place (TenantGuard, composite-PK).
- Money invariants in entity methods (`Money.add`, `Money.subtract`).
- Status-machine invariants in entity methods (`Order.markReady`).
- All enforced consistently; no "I forgot to filter."

### 4.7 Documented decisions

- Each bounded context has its own design doc.
- Each entity has its own design rationale.
- Each adapter has its own integration test.
- Onboarding cost per new engineer drops over time as the docs mature.

### 4.8 Explicit asynchronous boundaries

- BullMQ jobs, cron, webhooks all enter through adapters.
- Domain events drive cross-context async flows.
- No "fire and forget" hidden in service methods.

### 4.9 Audit and compliance built in

- Domain events naturally feed audit logs.
- Actor-triad pattern (USER/SYSTEM/WEBHOOK/CRON) maps to adapter types.
- Request correlation via `request_id` reconstructs full lifecycle.

### 4.10 Future-proofs the team scaling story

- Bounded contexts become team boundaries (Conway's Law-aligned).
- Extracting a microservice is mechanical, not architectural.
- Onboarding to one context doesn't require understanding the whole system.

---

## 5. Honest cons and how XFOS mitigates each

These are real costs. Pretending they don't exist is how DDD acquired
its reputation as "over-engineering" in the wrong contexts.

### 5.1 Steeper learning curve

- **The cost:** A new engineer who's only worked in MVC or Active-Record
  Rails-style codebases will need 2–4 weeks to internalize the patterns.
  Common confusions: "where do I put this?" "Why so many files?" "Why
  can't I just import Prisma here?"
- **XFOS mitigation:**
  - `KEY-DECISIONS.md` and this `ARCHITECTURE-RATIONALE.md` are the
    onboarding entry points. A new engineer reads these once and has
    the mental model.
  - ESLint enforces the dependency direction. Imports of forbidden
    modules (Prisma in `core/`) fail at lint time, not at runtime.
  - The 8 bounded contexts are documented; engineers don't need to
    derive them.
  - Code review enforces the patterns until they're internalized.

### 5.2 More files per feature

- **The cost:** A simple "create order" touches: Order entity, OrderItem
  entity, OrderRepository port, PrismaOrderRepository adapter,
  SubmitOrderUseCase, SubmitOrderInputDTO, SubmitOrderOutputDTO,
  StorefrontController, OrderSubmittedEvent, audit log handler. 10 files
  for one feature.
- **XFOS mitigation:**
  - NestJS schematics generate the boilerplate.
  - The "10 files" is *one feature once*; subsequent features in the
    same module reuse most of the structure.
  - Many features only add 2–4 files (a new use case + DTO).
  - The alternative (one fat `OrderService` with 30 methods) costs more
    over time even if it costs less today.

### 5.3 Risk of over-abstraction ("ports for everything")

- **The cost:** New engineers sometimes apply hexagonal to things that
  don't need it. They define a port + adapter for reading a hard-coded
  config value. They mock interfaces that have one implementation forever.
- **XFOS mitigation:**
  - Documented rule: ports exist for things that *might be replaced* or
    *need to be tested without I/O*. Otherwise, a function is a function.
  - Code review catches over-abstraction.
  - The "core is sacred" rule is *one-directional* — keep frameworks out
    of core, don't invert structures that don't need inversion.

### 5.4 Anemic domain model trap

- **The cost:** Engineers create entities with only getters/setters and
  put all logic in use cases. The "domain" becomes a glorified DTO. This
  is the most common DDD failure mode.
- **XFOS mitigation:**
  - Entities have behavior methods: `Order.cancel(reason)`, `Bill.void()`,
    `Payment.markRefunded()`.
  - Code review explicitly looks for "is the rule on the entity?"
  - The CHECK constraints in the database are a backstop — they'd fail
    if the entity skipped a rule.
  - Junior engineers are shown examples in code review.

### 5.5 Aggregate boundaries are hard

- **The cost:** Designing the right aggregates is one of the hardest
  parts of DDD. Get it wrong and you have either huge aggregates that
  serialize badly or fragmented aggregates that need transactions
  spanning many.
- **XFOS mitigation:**
  - Aggregates are kept small: `Order` + `OrderItems`, `Bill` + `Payments`,
    `Cart` + `CartItems`, `KitchenTicket` + `KitchenTicketEvents`.
  - Cross-aggregate consistency uses domain events, not transactions.
  - The schema enforces aggregate consistency via composite FKs and
    CHECK constraints — the database catches design errors.

### 5.6 Performance overhead from "load the whole aggregate"

- **The cost:** Loading an entire `Order` aggregate just to read one
  field is wasteful. Pure-DDD codebases sometimes have N+1 problems
  because aggregates are loaded eagerly.
- **XFOS mitigation:**
  - Read models for query-heavy operations. The merchant-portal
    "today's orders" view doesn't load full Order aggregates — it
    queries a flat read model via Prisma.
  - Aggregates load eagerly only on the *write* path; reads use
    dedicated query objects.
  - Hexagonal supports CQRS-lite: separate `OrderRepository` (write
    aggregates) from `OrderQueries` (read flat data).

### 5.7 Initial velocity is slower

- **The cost:** First feature in a hexagonal/DDD codebase takes 2–3×
  longer than first feature in a Rails-style codebase. The structural
  scaffolding has to come first.
- **XFOS mitigation:**
  - The structural scaffolding *is the work* for the first features —
    it pays back from feature 5 onward.
  - The 8 contexts are already designed; engineers don't re-derive them.
  - Velocity at month 6 in DDD/hexagonal exceeds velocity at month 6
    in Rails-style by a wide margin (this is the well-documented "MVC
    spaghetti at month 12" problem).

### 5.8 Tooling gap (NestJS isn't pure DDD)

- **The cost:** NestJS is module-oriented but not DDD-native. Some
  patterns (decorators, guards, pipes) lean toward MVC. There's no
  built-in `Aggregate`/`Entity`/`Repository` scaffold.
- **XFOS mitigation:**
  - NestJS modules map cleanly to bounded contexts.
  - The DI container supports port/adapter inversion natively.
  - We define our own conventions (the 4 invariants in PRD §6.3) and
    enforce via ESLint + code review.
  - Worked examples in `xfos/services/api/src/modules/` show the pattern.

### 5.9 Over-engineering risk for small features

- **The cost:** A "rename a tenant" admin endpoint shouldn't need a use
  case + entity method + event + audit handler. Sometimes a CRUD
  endpoint is just a CRUD endpoint.
- **XFOS mitigation:**
  - We allow "simple CRUD" endpoints in adapter code for genuinely
    structural data (e.g., `tenant_settings` updates that only mutate
    one column).
  - Domain events are emitted only when the operation has business
    significance.
  - Junior engineers are encouraged to ask "does this need to be a use
    case?" before adding one.

### 5.10 Architecture decay over time

- **The cost:** Without enforcement, dependency rules drift. A junior
  imports Prisma into `core/` "just this once" and the rule erodes.
- **XFOS mitigation:**
  - ESLint rules block forbidden imports at lint time.
  - The 4 invariants (PRD §6.3) are documented and enforced in code review.
  - Periodic architecture reviews catch drift before it spreads.
  - The composite-PK schema convention (Part 2.1 of `KEY-DECISIONS.md`)
    is one example of using the database itself to enforce architectural
    invariants.

---

## 6. Comparison with alternatives

### 6.1 vs MVC (e.g., Ruby on Rails, Django, classic Express)

**MVC strengths:**
- Fast first feature.
- Lots of tooling, generators, conventions.
- Familiar to most web engineers.

**MVC weaknesses for XFOS specifically:**
- Domain logic ends up in controllers (no clear "where does this rule
  live?") or in fat models that mix DB and behavior.
- Models couple tightly to the ORM. Swapping Prisma is a rewrite.
- Multi-tenancy invariants get repeated in every controller.
- Cross-cutting features (audit, idempotency) get tacked on as filters
  that hide rather than express intent.
- Bounded contexts don't exist as a first-class concept; the codebase
  flattens into "models" and "controllers."

**Verdict:** MVC is excellent for content sites, simple CRUD tools, and
prototypes. For a multi-tenant SaaS with 8 bounded contexts, 4
frontends, and 5 input channels, it's the wrong tool — the cost shows
up at month 6, not month 1.

### 6.2 vs Service-Oriented (no DDD, no hexagonal)

This is "MVC + service classes": move logic out of controllers into
service classes, but keep them framework-coupled.

**Strengths:**
- Slightly cleaner than fat controllers.
- Familiar pattern in many enterprises.

**Weaknesses for XFOS:**
- Service classes accumulate procedural code. `OrderService.cancel()`
  becomes a 200-line function.
- Services often import each other, creating tangled cross-context
  dependencies. `OrderService` calls `BillingService` calls
  `KitchenService` — refactoring becomes terrifying.
- Loses ubiquitous language; "service" is generic, not domain-specific.
- Same coupling-to-ORM problem as MVC.

**Verdict:** Service-oriented is "MVC pretending to be cleaner."
Doesn't solve XFOS's problems.

### 6.3 vs Microservices from day 1

**Strengths:**
- Strong service boundaries by definition.
- Independent deployment per service.
- Team autonomy.

**Weaknesses for XFOS at MVP scale:**
- Operational overhead (8 services × deploys, monitoring, secrets) costs
  more than the team has.
- Cross-service transactions are very hard. XFOS has real
  cross-context invariants ("order created → kitchen ticket created"
  must be atomic-ish).
- Network calls add latency.
- 8 codebases × repeated boilerplate.
- Premature optimization for a problem (independent scaling) we don't
  have yet.

**Verdict:** Microservices are the right *eventual* destination for
some XFOS contexts (Kitchen, maybe Storefront). But starting there
trades MVP velocity for autonomy we don't need yet. Hexagonal+DDD
makes the future split mechanical when we need it.

### 6.4 vs Anemic domain model + Active Record

**Strengths:**
- Familiar (Rails-style).
- Fast iteration.
- ORM does most of the work.

**Weaknesses for XFOS:**
- Business rules end up scattered (controllers, services, validators,
  callbacks).
- Active Record couples domain to the ORM totally — every test needs
  a database.
- Callbacks hide order of operations. "What happens when an order is
  saved?" requires reading 5 files.
- Multi-tenancy enforcement is callback-driven and easy to bypass.

**Verdict:** Active Record was a 2005 best-practice. For 2026 SaaS
with strict tenant isolation, audit, and multi-channel inputs, it's
not the right tool.

### 6.5 vs Functional / Event Sourcing

**Strengths:**
- Audit log built-in (the events ARE the state).
- Strong correctness story.
- Time-travel debugging.

**Weaknesses for XFOS:**
- Steeper learning curve than DDD/hexagonal.
- Smaller TypeScript ecosystem; fewer team members familiar.
- Read models require maintenance (projections drift).
- Performance is harder to reason about for high-write paths.

**Verdict:** Event sourcing is excellent for some domains (financial
ledgers, audit-heavy systems). XFOS's `audit_logs` table gives us 80%
of the audit benefit at 20% of the cost. The actor-triad mirror across
4 tables is event-sourcing-lite without the operational cost.

---

## 7. Concrete examples in XFOS

How DDD + Hexagonal play out in real XFOS flows.

### 7.1 Example: Customer places a PAY_BEFORE order

**The flow:**

1. Customer scans QR → storefront opens → adds items → taps "Place Order."
2. Storefront sends POST `/api/v1/storefront/orders` with the cart payload.
3. **`StorefrontController`** (primary adapter) translates the HTTP body
   into a `SubmitOrderInput` DTO, calls
   `SubmitOrderUseCase.execute(input)`.
4. **`SubmitOrderUseCase`** (application layer) orchestrates:
   - Loads the menu item via `MenuItemRepository` (output port).
   - Validates availability via `Order.fromCart(cart, items)` (entity
     factory method — pure domain).
   - Persists the new `Order` aggregate via `OrderRepository.save()`.
   - Publishes `OrderSubmitted` domain event.
   - Returns the order's public token.
5. **`PrismaOrderRepository`** (secondary adapter) translates the entity
   into a Prisma `create` call.
6. **Audit handler** (in Admin context) subscribes to `OrderSubmitted`
   and writes an `audit_logs` row with `actor_type = SYSTEM` (anonymous
   storefront) and the originating `request_id`.
7. **Kitchen handler** (in Kitchen context) subscribes to
   `OrderSubmitted` (when payment succeeds for PAY_BEFORE) and creates
   a `KitchenTicket`.
8. Customer is redirected to the status page.

**What hexagonal gives us:** the same `SubmitOrderUseCase` works whether
the input comes from a customer scan, a merchant entering a walk-in
order, or a future mobile app. Each input source is one adapter; the
business rule is one place.

**What DDD gives us:** the rule "order can be created only after
payment for PAY_BEFORE" lives on the `Order` aggregate's factory method,
not scattered across the controller and the service. Reading
`Order.fromCart()` tells you exactly what an order is.

### 7.2 Example: ABA payment webhook arrives

**The flow:**

1. ABA PayWay sends a payment-status callback to
   POST `/api/v1/webhooks/aba`.
2. **`AbaWebhookController`** (primary adapter) verifies the HMAC
   signature, translates ABA's payload into a `MarkPaymentSucceededInput`,
   calls `MarkPaymentSucceededUseCase.execute(input)`.
3. **`MarkPaymentSucceededUseCase`** orchestrates:
   - Idempotency check via `IdempotencyService` (against
     `gateway_event_id` UNIQUE).
   - Load `Payment` aggregate via `PaymentRepository`.
   - Call `Payment.markSucceeded()` (entity method, validates state
     machine).
   - Update `Bill.amount_paid_cents` via aggregate; transition to
     PAID if total reached.
   - Publish `PaymentSucceeded` event.
4. **Audit handler** logs with `actor_type = WEBHOOK`,
   `actor_label = 'ABA-webhook'`, captured `request_id`.
5. **Order handler** subscribes to `PaymentSucceeded` and transitions
   the bound `Order` from "awaiting payment" to `SUBMITTED` (creating
   the kitchen ticket downstream).
6. Customer's status page polls and sees "preparing."

**What hexagonal gives us:** if XFOS adds Wing payment tomorrow, the
WingWebhookController is one new file. It calls the same
`MarkPaymentSucceededUseCase`. No business rule is duplicated.

**What DDD gives us:** "succeeded payment" is not a database write — it's
a business event with side effects (audit, kitchen, customer
notification). The `PaymentSucceeded` event captures that meaning.
Adding a new side effect (loyalty points) is one new event handler.

### 7.3 Example: Kitchen marks a ticket READY

**The flow:**

1. Kitchen tablet UI: staff taps "Ready" on ticket TKT-042.
2. WebSocket message → **`KitchenGateway`** (primary adapter) →
   `MarkTicketReadyUseCase.execute(input)`.
3. Use case loads `KitchenTicket` aggregate, calls
   `ticket.markReady(staffId)`. The entity method:
   - Validates state machine (must be in PREPARING).
   - Increments `version` for OCC.
   - Records `marked_ready_by_id`, `ready_at`.
4. Persists via repository.
5. Publishes `TicketMarkedReady` event.
6. **Order handler** updates the parent `Order` to READY status (when
   all items in the order are ready).
7. **Storefront notification handler** sends a push to the customer's
   status page via Socket.io room `tenant_{tenantId}`.
8. **Audit handler** logs `actor_type = USER`, `changed_by_id = staff_id`.

**What hexagonal gives us:** if a future ops dashboard adds a
"force-ready" admin action, that adapter calls the same use case (with a
different actor). Same business rule, two input adapters.

**What DDD gives us:** the state-machine rule lives on `KitchenTicket`,
not scattered. If we ever add a "kitchen pause" feature, we add a method
to the entity; everywhere that operates on tickets sees it consistently.

### 7.4 Example: Daily session cleanup

**The flow:**

1. BullMQ scheduled job fires every hour.
2. **`SessionCleanupHandler`** (primary adapter — queue handler) calls
   `CleanupAbandonedSessionsUseCase.execute()`.
3. Use case queries via `OrderSessionRepository.findAbandoned(threshold)`,
   iterates and calls `session.closeAuto('AUTO_TIMEOUT_24H')` on each.
4. Each closure publishes `SessionClosed` event.
5. **Audit handler** logs `actor_type = CRON`,
   `actor_label = 'cron:session-timeout-24h'`.

**What hexagonal gives us:** the same `closeAuto()` rule applies whether
triggered by cron, by manual ops, or by future automatic logic.

**What DDD gives us:** "abandoned" is a business concept — a session
where `last_activity_at` is older than 24 hours. The threshold is a
business policy on the `OrderSession` entity, not a magic number in the
cron handler.

---

## 8. When NOT to use this architecture

Honest disclosure — DDD + Hexagonal is the wrong choice when:

- **The domain is genuinely simple.** A blog, a static brochure site, an
  internal admin tool with 3 tables — DDD is overkill. Use Rails / Django
  / fastify with classic MVC.
- **The product is a true throwaway prototype.** If the goal is to test
  market fit in 2 weeks and either pivot or scrap, optimize for velocity.
- **The team has zero DDD experience and no time to learn.** Bad DDD
  (anemic models, ports for every config read) is worse than good MVC.
- **The product has one input channel and one infrastructure choice
  forever.** No webhooks, no queue, no real-time, no integrations. Then
  the "hexagonal pays back when you swap infrastructure" argument is
  vacuous.
- **There are no genuine bounded contexts.** A single-purpose tool that
  does one thing doesn't have multiple contexts to manage. DDD's
  strategic patterns offer nothing.

**XFOS doesn't match any of these conditions.** The domain is
non-trivial (8 contexts), the product is a multi-year platform, the
team is willing to invest in patterns, the input channels are diverse,
the infrastructure will evolve. **DDD + Hexagonal is the right call.**

---

## 9. References and further reading

### 9.1 Foundational books

- **Eric Evans, *Domain-Driven Design: Tackling Complexity in the Heart
  of Software* (2003).** The original DDD book. Strategic + tactical
  patterns. Dense but canonical.
- **Vaughn Vernon, *Implementing Domain-Driven Design* (2013).** More
  approachable than Evans. Worked examples in C#/Java. Strong on
  bounded contexts and aggregate design.
- **Vaughn Vernon, *Domain-Driven Design Distilled* (2016).** The
  150-page "executive summary" — the right book to hand a stakeholder
  who needs to understand DDD without becoming an expert.
- **Alistair Cockburn, "Hexagonal Architecture" essay (2005).** The
  original ports-and-adapters paper. Short and sharp.
  [alistair.cockburn.us/hexagonal-architecture/](https://alistair.cockburn.us/hexagonal-architecture/)
- **Robert C. Martin, *Clean Architecture* (2017).** Same idea as
  hexagonal with slightly different vocabulary. Strong on the
  Dependency Rule.

### 9.2 Practical guides

- **Khalil Stemmler, *Software Essentials* (online series).** Great
  TypeScript-specific applications of DDD/hexagonal.
  [khalilstemmler.com](https://khalilstemmler.com/)
- **Mark Seemann, "Dependency Injection Principles, Practices, and
  Patterns" (2019).** Hexagonal in practice with DI containers.
- **NestJS official docs — "Hexagonal Architecture in NestJS"
  community articles.** Directly applicable to XFOS.

### 9.3 Critical perspectives (worth reading for balance)

- **DHH, "Conceptual Compression" (2018).** A counterpoint from the
  Rails creator — sometimes patterns add cost without benefit. Worth
  reading to keep DDD ambitions grounded.
- **Martin Fowler, "AnemicDomainModel" (2003).** The classic warning
  about DDD-flavored codebases that aren't really doing DDD.
- **Gregor Hohpe, "Event-Driven Architecture: How to Get It Right."**
  Cautionary advice on event-driven systems — relevant because XFOS
  uses domain events extensively.

### 9.4 XFOS-specific docs

- [`docs/mvp/KEY-DECISIONS.md`](./KEY-DECISIONS.md) — every significant
  design decision in XFOS, organized by topic.
- [`docs/mvp/XFOS-PRD.md`](./XFOS-PRD.md) §6 — architecture invariants
  and the four non-negotiable rules.
- [`docs/mvp/folder_structure_and_decision.md`](./folder_structure_and_decision.md)
  — the monorepo layout that mirrors the architecture.
- [`docs/mvp/technical-design/backend/`](./technical-design/backend/)
  — module structure, sequence diagrams, domain boundaries.
- [`docs/mvp/technical-design/shared/09-decisions-adrs.md`](./technical-design/shared/09-decisions-adrs.md)
  — ADRs covering the architecture choices.

---

## Closing argument

XFOS is a multi-tenant SaaS for Cambodia's food businesses. The product
must be:

- **Correct** under multi-tenant load (no cross-tenant bleed, ever).
- **Auditable** for tax and merchant-trust reasons.
- **Evolvable** as more payment gateways, more service models, more
  features ship.
- **Testable** because production bugs in payment or kitchen flows lose
  merchant trust quickly.
- **Buildable** by a small team without ballooning into spaghetti.

DDD gives us the language and the bounded contexts to model this
correctly. Hexagonal gives us the dependency-direction discipline that
keeps the domain alive across infrastructure changes. The 8 bounded
contexts identified in design are not arbitrary — they emerge from the
product itself.

The cost is real (steeper learning curve, more files, slower first
feature) but XFOS is not a 3-month throwaway. It's a long-lived platform.
At month 6, month 12, month 24, the architecture pays back compounding
dividends: easier feature additions, easier infrastructure swaps, easier
team scaling, easier debugging, easier compliance evidence.

This is not architecture-for-architecture's-sake. This is the right
tool for this product. The four invariants (PRD §6.3), the composite-PK
convention, the actor-triad mirror, the BFF-per-frontend pattern — every
one of them is enabled by, and reinforces, the DDD + Hexagonal
foundation.

The proof is in the schema: 38 tables, 27 enums, 60+ CHECK constraints,
13 documented design conventions, 4 input channels, 4 frontends, 8
bounded contexts. None of this is accidental complexity. It's the
domain expressing itself in code. The architecture is what makes that
expression sustainable.
