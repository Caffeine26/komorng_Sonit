# backend/shared

**Invariant 3 — `shared/` is infrastructure-only.**

> If a file in `shared/` references the word `tenant`, `order`, `bill`, `menu`,
> `kitchen`, `user`, `merchant`, `payment`, or `customer` — it does NOT belong
> here. Move it to the relevant domain.

Target size: **under ~15 files for the lifetime of XFOS.**

## What lives here

- `prisma/` — the single `PrismaClient` instance + tenant-isolation middleware (future)
- `nestjs/` — decorators, filters, interceptors, pipes — all generic
- `health/` — `/health` and `/health/ready` endpoints
- `errors/` — base `DomainError` class that domains extend
- `config/` — type-safe env loader
- `events/` — in-process event bus _infrastructure_ (domain events live in each domain's `core/events/`)
- `logger/` — Pino setup with redaction

## What does NOT live here

Anything that mentions a domain noun. If you're tempted to add
`shared/utils/order-helpers.ts`, stop — that belongs in `domains/order/core/`.
