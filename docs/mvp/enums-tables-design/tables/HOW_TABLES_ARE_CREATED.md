# How XFOS Tables Get Created in Postgres

End-to-end pipeline from `schema.prisma` to a live Postgres database.

## The pipeline at a glance

```
prisma/schema.prisma  ──►  prisma migrate  ──►  migration.sql  ──►  psql  ──►  Postgres
                                                       │
                                  scripts/*.sql  ─────►┤  (hand-written
                                                       │   hardening layer)
                                                       ▼
                                                   seeds/dev.seed.ts
```

| Layer | Tool | Source file | Produces |
|---|---|---|---|
| 1. Container | Docker Compose | `xfos/infra/docker-compose.yml` | an empty Postgres |
| 2. Base schema | Prisma CLI | `xfos/database/prisma/schema.prisma` | auto-generated `prisma/migrations/*/migration.sql`, applied via `prisma migrate deploy` |
| 3. Hardening | `psql` | `xfos/database/scripts/20260410_*.sql`, `20260411_*.sql` | triggers, helper functions, extensions, constraint tweaks |
| 4. Seed data | `tsx` | `xfos/database/seeds/dev.seed.ts` | 1 tenant + 1 user |

---

## 1. Postgres itself runs in Docker (local dev)

`xfos/infra/docker-compose.yml` boots `postgres:16-alpine` as container
`xfos-postgres` on `localhost:5432`. Db / user / password are all `xfos`,
data lives in volume `xfos_pg_data`. Started with:

```bash
pnpm db:up     # → docker compose -f infra/docker-compose.yml up -d
```

**No Docker in prod at MVP** — production Postgres is Railway (per `CLAUDE.md`).
The same migration files are replayed there; only the host changes.

---

## 2. Prisma is the source of truth, not raw SQL

`xfos/database/prisma/schema.prisma` is the **only** place models are declared.
From it, Prisma generates the actual `CREATE TABLE` / `CREATE TYPE` /
`CREATE INDEX` SQL — you never hand-write them.

The root `xfos/package.json` exposes the wrappers:

```bash
pnpm db:migrate    # dev:  prisma migrate dev     → creates a new migration + applies it
pnpm db:generate   # regen Prisma client only
```

Inside `@xfos/database` (`xfos/database/package.json`) those map to:

- **`prisma migrate dev`** — dev only. Diffs `schema.prisma` against the live
  DB, writes a new file to `prisma/migrations/<timestamp>_<name>/migration.sql`,
  applies it, regenerates the Prisma client.
- **`prisma migrate deploy`** — prod / CI. Replays existing migration files in
  order. No diffing, no writes to disk. Idempotent.

### Important state note

`xfos/database/prisma/migrations/` **does not exist yet** — no migration has
ever been generated. The very first `pnpm db:migrate` you run will create
that folder and produce the initial `migration.sql` containing every
`CREATE TABLE`, `CREATE TYPE`, `CREATE INDEX`, and `ALTER TABLE … ADD
CONSTRAINT` statement that `schema.prisma` describes — all 28 tables and
16 enums in one file.

After that first run, every later schema change produces a *new* migration
file alongside it. You never edit, rename, or delete an existing migration
file once it has been applied (see "Rolling back" below).

---

## 3. Hand-written hardening layer runs AFTER Prisma

Two files in `xfos/database/scripts/` are raw SQL that Prisma cannot express.
They run **after** `prisma migrate deploy`, in this order:

```bash
# 1. base schema
pnpm --filter @xfos/database exec prisma migrate deploy

# 2. hardening
psql "$DATABASE_URL" -f database/scripts/20260410_mvp_hardening.sql
psql "$DATABASE_URL" -f database/scripts/20260411_mvp_hardening_high_tier.sql

# 3. regen client if the SQL also requires Prisma schema tweaks
pnpm --filter @xfos/database exec prisma generate
```

What they add (from the header of `20260410_mvp_hardening.sql`):

- `CREATE EXTENSION citext` (case-insensitive email comparisons)
- `tenant_sequences` helper functions:
  - `allocate_order_number(tenant_id)`  → `'ORD-000001'`
  - `allocate_bill_number(tenant_id)`   → `'BILL-000001'`
  - `allocate_ticket_number(tenant_id)` → `'TKT-000001'`
  These replace the rejected "Redis atomic counter" design.
- **Cross-table tenant-parity triggers** on the 6 denormalized child tables
  (`cart_items`, `order_items`, `order_status_history`,
  `menu_category_translations`, `menu_item_translations`,
  `kitchen_ticket_events`) plus `bill_orders` — they enforce that a child
  row's `tenant_id` matches its parent's, preventing cross-tenant bleed even
  if the application middleware has a bug.
- `cleanup_expired_idempotency_keys()` — called hourly by a BullMQ job.

Both files wrap everything in a single `BEGIN … COMMIT`, so a failure rolls
the whole batch back. They use `IF [NOT] EXISTS` and `CREATE OR REPLACE`
where possible, so re-running them on a partially-applied DB is safe.

---

## 4. Seeds (dev only)

After the schema and hardening are applied, `pnpm db:seed` runs
`xfos/database/seeds/dev.seed.ts` to insert one tenant + one user.
Idempotent — safe to re-run as many times as you like.

---

## 5. Full "one-shot" dev reset

`xfos/database/scripts/reset-dev-db.sh` (aliased as `pnpm db:reset`) ties it
all together:

```bash
docker compose -f infra/docker-compose.yml down -v   # wipe volume
docker compose -f infra/docker-compose.yml up -d     # fresh pg
pnpm --filter @xfos/database prisma:migrate          # apply all migrations
pnpm --filter @xfos/database seed:dev                # seed
```

> **Gap:** the reset script does **not** currently run the two hardening
> `.sql` files. For a fully stress-tested DB, append two `psql -f …` lines
> between `prisma:migrate` and `seed:dev`. Otherwise local dev will be
> missing the parity triggers and the `allocate_*_number()` helpers — and
> any code path that calls them will fail.

---

## Rolling back

From `xfos/database/README.md`:

1. **Never** delete a migration that has already been applied in production.
2. Write a **new** migration that reverses the previous change
   (`prisma migrate dev --name revert_<thing>`).
3. For additive-only migrations (new columns, new tables), deploy the reverse.
4. For destructive ones, first restore from PITR (point-in-time recovery — see your DBA / cloud-provider runbook).

---

## Common commands

| Command | What it does |
|---|---|
| `pnpm db:up`       | Start Postgres + Redis containers |
| `pnpm db:down`     | Stop them (keeps the volume) |
| `pnpm db:migrate`  | Generate + apply a new migration (dev) |
| `pnpm db:generate` | Regenerate the Prisma client only |
| `pnpm db:seed`     | Load dev seed data |
| `pnpm db:studio`   | Open Prisma Studio (web GUI for the DB) |
| `pnpm db:reset`    | DESTROY the DB volume, re-migrate, re-seed |
