# 13 — Technical Decisions

## ADR-001: Docker — Yes for Development, Optional for Production

### Status: Decided

### Context

The team needs consistency between local development environments and must decide whether to use Docker for production deployment.

### Decision

**Use Docker Compose for local development. Do NOT use Docker for MVP production deployment.**

### For Local Development: YES to Docker

```yaml
# docker-compose.yml — local dev only
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: platform_dev
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # Optional: pgAdmin for DB inspection
  pgadmin:
    image: dpage/pgadmin4
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@dev.local
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"

volumes:
  postgres_data:
```

**Developer workflow:**
```bash
# Start infrastructure
docker compose up -d postgres redis

# Run apps natively (for hot reload)
pnpm dev
```

**Why Docker for local dev:**
- Every developer gets the same PostgreSQL version
- No "works on my machine" DB config issues
- Easy to wipe and reset the DB

### For Production: NO to Docker at MVP

**Use platform-as-a-service instead:**

| Service | Platform | Why |
|---|---|---|
| Next.js frontends | **Vercel** | Zero-config, automatic deploys, CDN, edge |
| Node.js API | **Railway** or **Fly.io** | Simple container deploy, managed, cheap |
| PostgreSQL | **Railway** managed PostgreSQL | No ops overhead, automatic backups |
| Redis | **Upstash** | Serverless Redis, free tier generous |

**Why NOT Docker in production at MVP:**

1. **Operational complexity** — Docker in production requires: image builds, container orchestration, health checks, restart policies, volume management. A 2-person team cannot manage this well.
2. **No team bandwidth** — DevOps is a full-time job. At MVP, use managed services.
3. **PaaS is good enough** — Railway/Fly.io handles zero-downtime deploys, rollbacks, and scaling without Docker expertise.
4. **Cost** — Managed services at MVP scale cost $20–50/month total.

### When to revisit Docker in production

Add Docker when:
- Team has dedicated DevOps/infra person
- Self-hosting is required (compliance, cost at scale)
- Kubernetes migration is planned

---

## ADR-002: Database — PostgreSQL (Managed), NOT Supabase Auth/SDK

### Status: Decided

### Context

Need to choose between:
1. **Supabase** (BaaS platform — PostgreSQL + Auth + Storage + Realtime + SDK)
2. **Managed PostgreSQL** (Railway/Neon/RDS) with custom backend

### Decision

**Use managed PostgreSQL (not Supabase). Build custom auth layer.**

### Why Not Supabase (Full Platform)

| Concern | Detail |
|---|---|
| **Row Level Security (RLS)** | Supabase enforces tenant isolation via RLS policies. This adds significant complexity to migrations, debugging, and onboarding new engineers. Our multi-tenant model needs explicit `tenant_id` enforcement at the application layer, which is simpler and more testable. |
| **Lock-in** | Using Supabase Auth, Supabase Realtime, and Supabase Storage ties the entire application to one vendor. Each feature becomes harder to migrate individually. |
| **Auth model mismatch** | Supabase Auth is designed for user auth with its own user table. Our auth model has custom roles (`TENANT_OWNER`, `KITCHEN_STAFF`, etc.), invitation flows, and platform admin users. Fitting this into Supabase Auth creates workarounds. |
| **Prisma + Supabase friction** | Using Prisma migrations alongside Supabase's migration tooling creates conflicts. We should own our schema fully. |
| **Real-time via Supabase** | Supabase Realtime uses Postgres logical replication changes. Our kitchen real-time needs are better served by Socket.io with explicit domain events (order confirmed → ticket created → push to kitchen). |

### Why YES to Managed PostgreSQL

| Benefit | Detail |
|---|---|
| Full schema control | Prisma manages migrations. No secondary tool conflict. |
| Simple tenant isolation | `WHERE tenant_id = ?` at application layer. Testable, predictable. |
| Any cloud provider | Railway, Neon, Supabase DB-only, RDS — all work identically. |
| Clear ownership | The application owns auth, not a third-party service. |

### Using Supabase PostgreSQL as Database-Only (Optional)

If you want the Supabase dashboard for DB inspection, you **can** use Supabase's PostgreSQL host without using any Supabase SDK features:

```env
# Just use the PostgreSQL connection string
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
```

This is acceptable — you get a managed PostgreSQL with a nice UI, and you use zero Supabase-specific features.

### Comparison Summary

| | Supabase (full) | Managed PostgreSQL |
|---|---|---|
| Auth | Supabase Auth (limited role control) | Custom JWT (full control) |
| Realtime | Supabase Realtime (DB changes) | Socket.io (domain events) |
| Schema control | Partial (RLS + migrations conflict) | Full (Prisma only) |
| Migrations | Friction with Prisma | Clean Prisma migrations |
| Multi-tenant | RLS policies | App-layer tenant_id |
| Vendor lock-in | High | Low |
| Learning curve | Medium (RLS is non-trivial) | Low |
| Cost | Free tier → $25/month | ~$5–15/month (Railway) |

**Final answer:** Use PostgreSQL directly. Supabase is a good product for the right use case — but this platform's auth model, multi-tenancy, and real-time requirements are better served by owning the stack.

---

## ADR-003: Monorepo — pnpm + Turborepo

### Status: Decided

### Decision: YES to monorepo with pnpm workspaces + Turborepo

**Why:**
- 4 Next.js apps + 1 API + shared packages
- Shared TypeScript types prevent frontend/backend type drift
- Single PR changes all surfaces that need updating
- Turborepo caches build artifacts — fast CI
- Small team: one repo is simpler to manage than 5 repos

---

## ADR-004: ORM — Prisma

### Status: Decided

### Decision: Prisma

**Why Prisma over raw SQL / Knex / Drizzle:**
- Type-safe queries generated from schema
- Migration system is simple and reliable
- Schema file is the single source of truth
- Good documentation and community
- Works perfectly with PostgreSQL and TypeScript

**Why not raw SQL:**
- We need type safety — raw queries are error-prone at scale
- Prisma's generated types eliminate entire class of bugs

**Caveat:**
- Avoid Prisma for complex reporting queries (use raw SQL via `prisma.$queryRaw` for those)

---

## ADR-005: Real-Time — Socket.io over Supabase Realtime / SSE

### Status: Decided

### Decision: Socket.io for kitchen real-time updates

**Why Socket.io:**
- Bidirectional — kitchen staff can acknowledge tickets
- Room-based — naturally maps to `tenant_{id}` rooms
- Reconnection handling built-in
- Well-understood, battle-tested

**Why not Server-Sent Events (SSE):**
- SSE is one-way only (server → client)
- Kitchen staff need to update ticket status too

**Why not Supabase Realtime:**
- Couples real-time to DB change events instead of domain events
- We emit `ticket.new` when a kitchen ticket is created — this is a domain event, not just a DB insert

**Implementation note:**
- Socket.io runs inside the API server (same Node.js process for MVP)
- Each tenant's kitchen staff joins room: `tenant_{tenantId}`
- When a kitchen ticket changes, emit to that room only

---

## ADR-008: BFF-per-frontend, domain APIs internal-only

### Status: Decided (2026-04-09)

### Decision: One BFF NestJS module per browser frontend; raw domain APIs are internal-only behind three independent walls

**Context.** XFOS has four browser-facing frontends (storefront, kitchen,
admin, platform-admin) and a single NestJS modular monolith with hexagonal
domains (order, catalog, billing, tenant, kitchen, auth, onboarding). Without
a clear convention, two failure modes are likely:

1. **Frontends call domain APIs directly.** They need 3–5 round trips per
   page (tenant + menu + billing + ...), couple to domain shapes, and break
   every time a domain field is renamed. UI iteration becomes painful.
2. **Domain APIs are exposed to the public internet.** Any controller bug or
   forgotten guard becomes a tenant-isolation incident.

**Decision.** Two HTTP surfaces, three walls.

#### Surface 1: BFF — public, browser frontends only

```
backend/api/src/modules/
├── storefront/         → /api/v1/storefront/*       (only storefront FE may call)
├── kitchen/            → /api/v1/kitchen/*          (only kitchen FE may call)
├── admin/              → /api/v1/admin/*            (only admin FE may call)
└── platform-admin/     → /api/v1/platform-admin/*   (only platform-admin FE may call)
```

Each BFF module:
- Owns NO entities or business rules. Pure orchestration.
- Imports the domain modules whose use cases it composes.
- Calls domain use cases via DI — never via HTTP between modules.
- Exposes UI-projected, aggregated endpoints. The customer-facing storefront
  contract has no `costCents` field; the merchant admin contract does.
- Each BFF has its own contract package: `contracts/bff-{storefront,kitchen,admin,platform-admin}/`.

Browser frontends import **only** their BFF contract. Enforced by ESLint:

```js
// frontend/storefront/.eslintrc.cjs
{
  group: ['@xfos/contracts-order', '@xfos/contracts-catalog', /* ... */ ],
  message: 'Use @xfos/contracts-bff-storefront — your BFF projects what you need.'
}
```

#### Surface 2: Internal domain APIs — private, behind three walls

```
backend/api/src/domains/<X>/api/<X>.controller.ts  → /api/v1/internal/<X>/*
```

| Wall | Mechanism | Catches |
|---|---|---|
| 1 | URL prefix `/api/v1/internal/*` | Developer mistakes — wrong `@Controller(...)` decorator |
| 2 | `@UseGuards(InternalOnlyGuard, ServiceTokenGuard)` | Misrouted requests + missing auth |
| 3 | Network: private network, IP allowlist, or API gateway | Public exposure |

All three must be misconfigured for an internal endpoint to leak.

Internal API consumers: CLI scripts, admin tools (Retool/Metabase/Hasura),
debugging via curl, server-to-server jobs, future partner integrations,
webhooks. **Never browser frontends.** Auth is **service token**, never
user JWTs.

#### Internal APIs are use-case shaped, not CRUD

Internal endpoints are **not** a CRUD escape hatch. Every internal route is
backed by an `application/use-cases/*` use case, which means:

- Domain entity invariants run (e.g. `Order.cancel()` enforces "cannot cancel
  a submitted order")
- Domain events are published (the same events the BFF path publishes)
- Tenant isolation, audit logging, and idempotency all apply

**Internal APIs MUST:**
- Call `application/use-cases/*` — never skip the layer
- Go through entity methods so invariants run
- Publish the same domain events the BFF path would
- Respect tenant isolation via the same guard layer (or its service-token equivalent)

**Internal APIs MUST NOT:**
- Bypass the use case layer
- Directly call `prisma.*.update(...)` from a controller
- Skip entity invariants
- Mutate state without publishing the corresponding domain event

If a script needs to do something the use case layer doesn't allow, **add a
new use case** — don't bypass.

### Trade-offs (honest)

**Cost.** Four BFF modules + four BFF contract packages = some duplication
of orchestration code. Adding a customer-facing field requires updates in
three places (domain schema → BFF projection → frontend). It's the price of
independent UI evolution and physical separation between customer-facing and
merchant-facing data shapes.

**Risk: BFF becomes a god module.** Mitigate by enforcing rule "BFF use cases
contain only orchestration; if you find business logic, push it down into the
domain entity or use case." Code review on `modules/<bff>/application/use-cases/`
should reject anything that looks like a rule.

**Risk: internal API bypass.** Mitigate with the three walls. Any one wall
failing isn't enough.

### Why not the alternatives

- **Frontend → domain APIs directly.** Couples the frontend to domain shapes,
  forces 3–5 round trips per page, and breaks every time a domain field
  is renamed. UI iteration becomes painful.
- **One shared "API for all frontends" controller.** Forces all four UIs into
  the same shape. The customer storefront ends up returning merchant cost
  fields; the kitchen ends up returning billing details. UI bloat is how this
  always plays out.
- **A separate BFF microservice per frontend.** Adds infra, latency, and
  duplicated business logic. The BFF is light enough to live as a NestJS
  module inside the same process.
- **No internal domain APIs at all.** Cuts off CLI tools, admin scripts,
  partner integrations, and debugging. The "BFF for everything" rule is
  about browser frontends — internal consumers are different.

### Implementation pointers

- BFF modules: `backend/api/src/modules/{storefront,kitchen,admin,platform-admin}/`
- Internal-only guards: `backend/api/src/shared/guards/{internal-only,service-token}.guard.ts`
- BFF contracts: `contracts/bff-{storefront,kitchen,admin,platform-admin}/`
- Frontend BFF clients: `frontend/<app>/src/lib/api/<bff>.ts`
- Frontend ESLint enforcement: each `frontend/<app>/.eslintrc.cjs` Rule 4
- Worked example: `docs/mvp/folder_structure_and_decision.md` §4

---

## ADR-009: Composite primary keys for tenant-scoped tables

### Status: Decided 2026-04-24, fully applied 2026-04-25

### Context

XFOS is multi-tenant. Tenant isolation is the single most important
correctness property. The original design used single-column `id` PKs
on every table, with `tenant_id` as a denormalized column on child
tables and parity triggers (`order_items_tenant_parity`,
`bill_orders_tenant_parity`, etc.) ensuring that a child row's
`tenant_id` matches its parent's.

This worked but had drawbacks:
- 11 parity triggers across the schema, each a small piece of
  PL/pgSQL that must be maintained.
- Triggers are easy to forget when adding new tables.
- Triggers fire after the FK check, so violations show up as a generic
  RAISE EXCEPTION rather than a structured FK error.

### Decision

**Every tenant-scoped table uses `PRIMARY KEY (tenant_id, id)` and every
cross-tenant FK is composite `FOREIGN KEY (tenant_id, parent_id)
REFERENCES parent(tenant_id, id)`.** Cross-tenant linking becomes
**impossible by FK construction** — Postgres rejects the insert because
no row exists under that composite key. **All parity triggers are
retired.**

### Tables that intentionally keep single-column `id` PK

- `tenants` — the tenant root.
- `users`, `user_auth_providers`, `refresh_tokens`,
  `phone_otp_attempts` — global identity.
- `plans`, `plan_features`, `subscriptions` — platform-level catalog.
- `user_roles`, `audit_logs` — junction tables with NULLABLE
  `tenant_id`.
- `tenant_sequences` — `tenant_id` IS the PK (one row per tenant).

### Consequences

- **Pro:** No parity triggers. Cross-tenant linking is impossible
  without writing raw SQL that bypasses the FK.
- **Pro:** PK index already covers most tenant-scoped queries
  (`WHERE tenant_id = ? AND id = ?`).
- **Con:** Slightly larger PK index (TEXT + TEXT vs TEXT). Negligible
  at MVP scale.
- **Con:** Prisma DSL needs explicit `references: [tenantId, id]` on
  every relation declaration. Verbose but mechanical.

### Why not the alternatives

- **Keep parity triggers.** Works but requires ongoing maintenance.
  Composite FKs make the database itself enforce the invariant.
- **PostgreSQL Row-Level Security (RLS).** Rejected separately
  (ADR-002). RLS adds a session-context dependency that's awkward
  for multi-tenant SaaS.
- **Separate database per tenant.** Operationally heavy at MVP.
  Revisit if/when a tenant demands physical isolation.

See [`enums-tables-design/tables/HOW_TABLES_ARE_CREATED.md`](../../enums-tables-design/tables/HOW_TABLES_ARE_CREATED.md)
for the detailed convention + new-table template.

---

## ADR-010: Lifecycle status enums + sibling reason enums

### Status: Decided 2026-04-24, applied schema-wide 2026-04-25/26

### Context

Several tables have a status field where the *why* of a terminal
transition matters for analytics, audit, and customer support:

- An order moves to `CANCELLED` — was it because the kitchen ran out
  of stock, the customer asked, or the system timed out the payment?
- A cart moves to `ABANDONED` — was it because the bill was paid, the
  staff manually reset, or the customer dismissed?
- A QR is deactivated — was it regenerated, lost, expired, etc.?
- A session is closed — paid, walked away, force-closed?

The temptation is to bake these reasons into the lifecycle enum
itself: `OrderStatus = ... | CANCELLED_BY_KITCHEN | CANCELLED_OUT_OF_STOCK
| ...`. This bloats every consumer of the lifecycle enum and forces
every "is this order done?" check to handle a long list of terminal
states.

### Decision

**Lifecycle enums stay minimal.** Terminal-reason metadata lives in a
separate sibling enum + nullable column, gated by a CHECK constraint:

```sql
status              "OrderStatus" NOT NULL,
cancellation_reason "OrderCancellationReason",  -- nullable
CONSTRAINT orders_cancellation_reason_only_when_cancelled
  CHECK ((status = 'CANCELLED') OR (cancellation_reason IS NULL))
```

Applied across the schema:

| Lifecycle enum | Sibling reason enum | On table |
|---|---|---|
| `OrderStatus` | `OrderCancellationReason` | `orders`, `order_items`, `kitchen_tickets`, `kitchen_ticket_events`, `order_status_history` |
| `CartStatus` | `CartAbandonedReason` | `carts` |
| `OrderSessionStatus` | `OrderSessionCloseReason` | `order_sessions` |
| (`is_active` boolean) | `QrDeactivationReason` | `qr_contexts` |

### Consequences

- **Pro:** Lifecycle queries stay one-column predicates
  (`WHERE status = 'CANCELLED'`).
- **Pro:** Reason vocabulary can evolve without affecting the
  lifecycle enum's consumers.
- **Pro:** Analytics gets first-class indexable queries on the reason
  column ("how many cancellations were OUT_OF_STOCK this week?").
- **Con:** Two columns instead of one. CHECK constraints to maintain.
  Worth it.

### System-actor exception

For sibling-reason enums that include system-driven values (e.g.
`QrDeactivationReason.EXPIRED_AUTO`, `OrderSessionCloseReason.AUTO_TIMEOUT_24H`),
the corresponding `*_by_id` accountability FK is allowed to be NULL.
Enforced by a CHECK like:

```sql
CHECK ((deactivation_reason IS NULL)
       OR (deactivation_reason IN ('EXPIRED_AUTO', 'TENANT_DEACTIVATED'))
       OR (deactivated_by_id IS NOT NULL))
```

Avoids a synthetic "system" user row in `users` while preserving
human-actor accountability for everything else.

---

## ADR-011: Actor-triad mirror across all append-only logs

### Status: Decided 2026-04-26

### Context

XFOS has four tables that record request-level events:

- `audit_logs` — cross-cutting platform event journal
- `order_status_history` — per-order state transitions
- `kitchen_ticket_events` — per-ticket state transitions
- `idempotency_keys` — request-dedup cache

Each of these initially had its own actor-attribution scheme. Some had
just `changed_by` (FK to users) where NULL meant "system." But "system"
is ambiguous — was it a webhook, a cron, a background daemon, or a
future API key?

### Decision

**Every append-only log in the schema carries the same actor
attribution shape.** Defined by the `AuditActorType` enum:

```sql
CREATE TYPE "AuditActorType" AS ENUM (
  'USER', 'SYSTEM', 'WEBHOOK', 'CRON', 'API_KEY'
);
```

Each log table includes:
- `actor_type "AuditActorType" NOT NULL`
- `actor_label TEXT` — required when `actor_type != USER`
  (e.g. `'BullMQ:idempotency-cleanup'`, `'ABA-webhook'`)
- A user FK column (`user_id` or `changed_by_id`) — required when
  `actor_type = USER`
- `request_id TEXT` — correlation ID across all four tables

Enforced by CHECK constraints:
```sql
CHECK ((actor_type = 'USER') = (user_fk IS NOT NULL))
CHECK ((actor_type = 'USER') OR (actor_label IS NOT NULL))
```

### Consequences

- **Pro:** A platform-admin investigation runs the same query against
  all four tables. `WHERE request_id = X` reconstructs an entire
  request lifecycle.
- **Pro:** Background-job rate analysis (`WHERE actor_type = 'CRON'`)
  becomes trivial.
- **Pro:** When a webhook starts misbehaving, one query identifies all
  events it triggered.
- **Con:** Three extra columns on each log table. Acceptable.

### Cross-event correlation

The application's `RequestContext` middleware generates a `request_id`
on every API request and every BullMQ job, propagating it via NestJS
async-local-storage. Every audit/log write picks it up automatically.

See [`enums-tables-design/enums/audit-actor-type.md`](../../enums-tables-design/enums/audit-actor-type.md)
and [`enums-tables-design/tables/audit-logs.md`](../../enums-tables-design/tables/audit-logs.md).

---

## ADR-012: Idempotency keys verify request body via SHA-256

### Status: Decided 2026-04-26 (security fix)

### Context

XFOS's `idempotency_keys` table prevents duplicate processing of the
same client request. The original design assumed:

> Same `(tenant_id, key, endpoint)` → same request → return cached response.

This assumption was unverified. A stolen idempotency key replayed with
a *different* payload would silently hit the cache and return the
original response — confusing at best, exploitable at worst (an
attacker could "claim" credit for the original request without an
audit trail).

### Decision

**Add `request_body_hash TEXT NOT NULL` (SHA-256 hex of the request
body) to `idempotency_keys`.** On retry:

- Same `(tenant_id, key, endpoint)` + **same** hash → return cached
  response.
- Same `(tenant_id, key, endpoint)` + **different** hash → return
  `409 Conflict`. Do NOT process; do NOT return the cached response.

The application's `IdempotencyService.check()` does the comparison;
the database stores the hash.

### Consequences

- **Pro:** Closes a real cross-request cache-confusion vector.
- **Pro:** Mismatches log a `WARNING`-severity audit event; repeated
  mismatches escalate to `ALERT` for security investigation.
- **Con:** Every idempotent request now computes a SHA-256 hash. Cheap
  on modern hardware; not a real cost.

### Implementation pointers

- DB column: `idempotency_keys.request_body_hash TEXT NOT NULL`
- Application: `xfos/services/api/src/shared/idempotency/idempotency.service.ts`
- Hash function: canonical JSON stringify, then `crypto.createHash('sha256')`
- Mismatch handler: 409 + audit log entry

See [`enums-tables-design/tables/idempotency-keys.md`](../../enums-tables-design/tables/idempotency-keys.md).

---

## ADR-013: No translation tables — bilingual content lives inline

### Status: Decided 2026-04-23

### Context

The original schema had `menu_category_translations` and
`menu_item_translations` tables, keyed by `(parent_id, locale)`,
following the standard "internationalized data" pattern.

For XFOS specifically, this is over-engineered:
- XFOS supports exactly two locales: Khmer (`km`) required + English
  (`en`) optional. Adding a third would be a major product decision.
- Customer-facing text (menu item names, descriptions) is rendered
  on every storefront load. JOINing translation tables on every
  render is unnecessary I/O.
- Catalog editing in the merchant portal updates both locales together
  in the same form. There's no editorial workflow that justifies a
  separate translations table.

### Decision

**Bilingual columns inline on the parent table.** Khmer required,
English optional:

```sql
name_km        TEXT NOT NULL,         -- customer-facing, required
name_en        TEXT,                  -- optional
description_km TEXT,
description_en TEXT
```

Tables affected: `menu_categories`, `menu_items`, `menu_item_variants`,
`menu_item_option_groups`, `menu_item_options`. The translation tables
are dropped from the schema entirely.

### Consequences

- **Pro:** No JOINs on the storefront hot path.
- **Pro:** Half the catalog tables.
- **Con:** Adding a third locale is a schema migration (new columns)
  rather than just inserting rows. Acceptable — it would be a major
  product decision either way.

### Tenant-level metadata uses JSONB

`tenant_settings.address` and `tenant_settings.description` are
multi-locale via JSONB structure (`{"en": "...", "km": "..."}`)
because they're rendered as-is, never searched, and not subject to
catalog-editing workflows.

See [`design-discussions/menu-items-variants-options.md`](../../design-discussions/menu-items-variants-options.md).
