# Infrastructure

Local-dev containers only. **No production Docker at MVP.**

## Start local DB + Redis

```bash
pnpm db:up            # from repo root — starts postgres + redis
pnpm db:migrate       # applies Prisma migrations
pnpm db:seed          # loads dev seed data
```

## Reset everything

```bash
pnpm db:reset         # wipes volumes, re-migrates, re-seeds
```

## Stop

```bash
pnpm db:down
```

## Ports

| Service | Port  | URL                          |
|---------|-------|------------------------------|
| Postgres | 5432 | postgresql://xfos:xfos@localhost:5432/xfos |
| Redis   | 6379  | redis://localhost:6379       |
| Postgres (test) | 5433 | used by CI / integration tests |

## Production

See `deploy/railway/` for the API, and each `frontend/<app>/vercel.json` or
`frontend/<app>/Dockerfile` for frontend deploys. Production uses managed
services — no Docker containers are deployed from this folder.
