# @xfos/database

The **one** Prisma schema for the entire platform. Owned by the founder via
CODEOWNERS (see `.github/CODEOWNERS`).

## Files

- `prisma/schema.prisma` — THE schema. Single file, organized by section comments per domain.
- `prisma/migrations/` — auto-generated, chronological. Never hand-edit.
- `seeds/dev.seed.ts` — local dev seed (one tenant, one user).
- `seeds/test.seed.ts` — integration test minimal fixtures.
- `index.ts` — re-exports `PrismaClient` so backend code does `import { PrismaClient } from '@xfos/database'`.

## Common commands (run from repo root)

```bash
pnpm db:up          # start postgres + redis
pnpm db:migrate     # apply migrations + regenerate the client
pnpm db:generate    # regenerate the Prisma client only
pnpm db:seed        # load dev seed
pnpm db:studio      # open Prisma Studio
pnpm db:reset       # wipe the volume, re-migrate, re-seed (DESTRUCTIVE)
```

## Adding a table — the safe playbook

1. Open `prisma/schema.prisma`. Find the **section comment** for the owning
   domain (e.g. `// ========= ORDER =========`). If it doesn't exist yet, add it.
2. Add the model under that section. **All tenant-scoped tables must include
   `tenantId` and a composite index or unique constraint on it.**
3. Run `pnpm db:migrate` and give the migration a descriptive name
   (e.g. `add_order_discount_code_column`).
4. Commit `prisma/migrations/<timestamp>_*/migration.sql` along with your
   schema change. **Never amend or delete an existing migration file.**
5. If the table needs seed data, update `seeds/dev.seed.ts` (idempotent only).

## Rolling back

1. **Never** delete a migration that has already been applied in prod.
2. Write a **new** migration that reverses the previous change
   (`prisma migrate dev --name revert_<thing>`).
3. For additive-only migrations (new columns, new tables), deploy the reverse;
   for destructive ones, first restore from PITR (see `docs/TODOS.md` F-4).

## Tenant isolation (DO NOT SKIP)

The schema does NOT use Postgres RLS. Tenant isolation is enforced in the
application layer via `backend/shared/prisma/tenant-isolation.middleware.ts`.
Every query against a tenant-scoped table MUST include `tenantId` that was
read from the JWT, never from request input. See
`docs/mvp/technical-design/shared/04-auth-rbac.md`.
