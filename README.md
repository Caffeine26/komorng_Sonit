# XFOS — Cambodian Food-Ordering Platform

> A customer scans a QR code → browses the menu in Khmer or English → places an order → pays. The kitchen sees the order in real time on a tablet and prints a ticket. Merchants manage their menu, team, and QR codes in a portal. XFOS ops runs a separate internal console.

XFOS is a multi-tenant SaaS platform for Cambodian food stalls, kiosks, and dine-in restaurants. The repo is published as **`komorng`** on GitHub.

**The hard rule:** *"If a restaurant cannot operate daily using this system, MVP has failed."*

---

## What's in this monorepo

One **NestJS** modular-monolith backend serves four **Next.js 14** frontends. Each surface talks to its own BFF prefix in the single backend process.

| Surface | Who uses it | Device | Path | BFF prefix | Port |
|---|---|---|---|---|---|
| **Storefront** | Customers | Mobile (QR-accessed) | `frontend/storefront` | `/api/v1/storefront/*` | 3000 |
| **Kitchen (KDS)** | Kitchen staff | Tablet PWA | `frontend/kitchen` | `/api/v1/kitchen/*` | 3001 |
| **Merchant Portal** | Restaurant owners | Desktop / tablet | `frontend/admin` | `/api/v1/admin/*` | 3002 |
| **Platform Portal** | XFOS internal ops | Browser (IP allow-list) | `frontend/platform-admin` | `/api/v1/platform-admin/*` | 3003 |
| **Backend API** | All four frontends | NestJS process | `backend/api` | — | 4000 |

---

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript 5.5 (strict) |
| Backend | NestJS 10 (modular monolith, hexagonal domains) |
| Frontend | Next.js 14.2 (App Router), React 18 |
| Database | PostgreSQL 16 with Prisma ORM (single schema, 38 tables, 27 enums) |
| Cache / queues | Redis 7 |
| Contracts | Zod schemas in `contracts/*` — single source of truth for HTTP shapes |
| Auth | JWT access + refresh rotation; login via Telegram, Facebook, or Phone-OTP |
| Payments | ABA PayWay |
| i18n | Khmer + English; Inter + Noto Sans Khmer |
| Logging | Pino structured logs + Sentry |
| Build | Turborepo + pnpm workspaces |
| Tests | Vitest (unit), Playwright (E2E against real test DB) |
| Local infra | Docker Compose (Postgres, Redis) |

---

## Repository layout

```
backend/api/             NestJS backend — one process, hexagonal domains as src/ subfolders
frontend/storefront/     Customer-facing mobile web app (QR landing → cart → pay)
frontend/kitchen/        KDS tablet PWA — tickets, status updates
frontend/admin/          Merchant Portal — menu, team, QR codes, settings
frontend/platform-admin/ Internal ops console for XFOS staff
contracts/               Zod request/response schemas, shared between server and clients
  ├── auth, billing, catalog, kitchen, onboarding, order, tenant, enums
  └── bff-storefront, bff-kitchen, bff-admin, bff-platform-admin
database/                The ONE Prisma schema, migrations, seeds
infra/                   docker-compose.yml + deploy configs (Railway, Vercel)
docs/mvp/                Engineer handoff — PRD, technical design, schema rationale
scripts/                 Domain and frontend-app scaffolders
```

---

## Quickstart

Requirements: Node ≥ 20.11, pnpm ≥ 9, Docker Desktop.

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env and start Postgres + Redis
cp .env.example .env.local
pnpm db:up

# 3. Apply migrations and seed dev data
pnpm db:migrate
pnpm db:seed

# 4. Run everything in parallel (backend + 4 frontends)
pnpm dev
```

Run a single surface instead:

```bash
pnpm dev:backend          # NestJS API on :4000
pnpm dev:storefront       # Next.js on :3000
pnpm dev:kitchen          # Next.js on :3001
pnpm dev:admin            # Next.js on :3002
pnpm dev:platform-admin   # Next.js on :3003
```

Database utilities:

```bash
pnpm db:studio            # Prisma Studio
pnpm db:reset             # Wipe, re-migrate, re-seed (destructive)
```

Quality gates:

```bash
pnpm typecheck
pnpm lint
pnpm test                 # all packages
pnpm test:integration     # integration suite (real DB)
```

---

## Architecture in one paragraph

A **single NestJS process** exposes four BFF prefixes (`/api/v1/{storefront,kitchen,admin,platform-admin}/*`). Each BFF is the only interface its frontend talks to — no frontend imports a domain module directly. Behind the BFFs, business logic lives in **hexagonal domains** (`auth`, `tenant`, `catalog`, `order`, `kitchen`, `billing`, `onboarding`) with ports/adapters; the Prisma client is the only data adapter. Frontends share a strict contract via **Zod schemas in `contracts/*`** that both sides import. ADR-008 (BFF-per-frontend) is the load-bearing decision — see `docs/mvp/technical-design/shared/09-decisions-adrs.md`.

---

## Engineering rules (non-negotiable)

- **Multi-tenant isolation:** every tenant-scoped query MUST filter by `tenant_id`. No exceptions.
- **One Prisma schema:** the canonical DDL is `docs/mvp/enums-tables-design/tables/postgresql-schema.md`; `database/prisma/schema.prisma` is the executable mirror.
- **No frontend → domain coupling:** frontends call BFFs only.
- **Never mock the database in E2E tests.** Run against the real test database (port 5433).
- **All user-facing strings are i18n-keyed.** Khmer and English are first-class.
- **Error envelope, response envelope, naming conventions, logging:** see `docs/mvp/technical-design/shared/`.

---

## Definition of done — 7 critical E2E flows

A feature ships only when these still pass in Playwright (full spec in `docs/mvp/technical-design/shared/08-testing-strategy.md`):

1. Kiosk order — submit → kitchen → complete
2. Dine-in multi-round — multiple orders → one bill → paid
3. Kitchen ticket lifecycle — `NEW → PREPARING → READY → COMPLETED`
4. Merchant onboarding — setup checklist → go-live
5. Khmer i18n — all text in both languages
6. Order status page — polling, 15–20 s, reflects kitchen state
7. Same-visit order banner — storefront kiosk, localStorage, TTL

---

## Documentation map

Start here, in this order:

| # | Doc | Purpose |
|---|---|---|
| 1 | [`docs/mvp/README.md`](docs/mvp/README.md) | Engineer Handoff — what to read and in what order |
| 2 | [`docs/mvp/XFOS-PRD.md`](docs/mvp/XFOS-PRD.md) | Product Requirements — the source of truth |
| 3 | [`docs/mvp/enums-tables-design/tables/postgresql-schema.md`](docs/mvp/enums-tables-design/tables/postgresql-schema.md) | Canonical DDL — 38 tables, 27 enums, all CHECK constraints |
| 4 | [`docs/mvp/technical-design/shared/`](docs/mvp/technical-design/shared/) | Architecture, API design, auth/RBAC, error handling, naming, logging, testing, ADRs, ABA PayWay, design system, cross-system flows |
| 5 | [`docs/mvp/design-discussions/`](docs/mvp/design-discussions/) | Per-topic design rationale (auth strategy, order numbering, status redesign, pricing tiers, etc.) |
| 6 | [`docs/mvp/folder_structure_and_decision.md`](docs/mvp/folder_structure_and_decision.md) | Why the monorepo is shaped this way |

---

## Status

Pre-alpha. Schema is locked (2026-04-25/26). Backend and frontend apps are scaffolded; feature implementation is in progress. Schema and design changes go through the docs in `docs/mvp/` first — code follows.

---

## License

Proprietary. All rights reserved.
