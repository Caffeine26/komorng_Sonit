# scripts/

Repo-level generators. Run from the repo root.

| Command | What it does |
|---|---|
| `pnpm create-domain <name>` | Scaffolds a new hexagonal backend domain under `backend/api/src/domains/<name>/`, auto-registers it in `app.module.ts`. |
| `pnpm create-frontend-app <name>` | Scaffolds a new self-contained Next.js app under `frontend/<name>/`, auto-registers it in `pnpm-workspace.yaml`, picks a unique port. |

Both scripts use `tsx` (installed at the root) and write template files
through `node:fs`. They are intentionally dependency-free so they run in
any cloned checkout.
