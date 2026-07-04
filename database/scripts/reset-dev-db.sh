#!/usr/bin/env bash
# Reset the local dev database. DESTRUCTIVE — deletes all data.
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "==> Stopping and wiping postgres volume..."
docker compose -f infra/docker-compose.yml down -v

echo "==> Starting postgres..."
docker compose -f infra/docker-compose.yml up -d postgres

echo "==> Waiting for postgres..."
sleep 3

echo "==> Running migrations..."
pnpm --filter @xfos/database prisma:migrate

echo "==> Loading dev seed..."
pnpm --filter @xfos/database seed:dev

echo "==> Done. Dev DB ready at postgresql://xfos:xfos@localhost:5432/xfos"
