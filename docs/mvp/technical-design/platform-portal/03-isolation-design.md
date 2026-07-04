# Platform Admin Isolation — ADR-006 (Updated)

## ADR-006: Platform Admin Separation, Backend API Boundary, Frontend Isolation

### Status: Decided (updated 2026-04-09 to match new folder layout)

> **Where this ADR sits now.** The original version of this file specified a
> three-tier frontend package architecture (`@platform/ui-customer`,
> `@platform/ui-admin`, platform-admin self-contained). That tiered model
> has been **superseded**. The authoritative model is in
> [`../../folder_structure_and_decision.md`](../../folder_structure_and_decision.md)
> §12, which applies the "fully self-contained" rule to **all four** frontend
> apps, not just platform-admin. The isolation guarantees this ADR cares
> about are now built-in to the layout itself.
>
> This file is kept for ADR history + the two unchanged decisions (backend
> API boundary, infrastructure access restriction). Read §12 first for the
> frontend model.

---

## The Three Questions — unchanged

1. **Should Platform Admin be a completely separate app?** → Same monorepo,
   but Platform Admin is a fully self-contained Next.js project. **Same
   applies to storefront, kitchen, and admin now** — see §12 of the decision
   doc.
2. **Should the backend API be one or two?** → One API, one deployment.
   Route-level separation is sufficient at MVP. *(Unchanged.)*
3. **Should Platform Admin share UI components with other apps?** → No, and
   neither should any other frontend app. There are no shared UI packages
   in the monorepo. Each app installs its own shadcn primitives locally.

---

## Decision 1: Frontend isolation — now universal, not platform-admin-specific

### Decision

All four frontend apps live under `frontend/<app>/` as fully self-contained
Next.js projects. None of them share UI code. The only thing any frontend
imports from outside its own folder is `@xfos/contracts-*` (Zod schemas
shared with the backend).

### New layout

```
frontend/
├── storefront/      (port 3000)   customer mobile web         Vercel project A
├── kitchen/         (port 3001)   tablet PWA                   Vercel project B (or Railway/VPS)
├── admin/           (port 3002)   merchant portal              Vercel project C
└── platform-admin/  (port 3003)   internal ops, IP-restricted  Vercel project D (or Fly/VPS)
```

Each app:
- Owns its own `package.json` — pins `next`, `react`, `tailwindcss` directly,
  **not** via a catalog or shared preset.
- Owns its own `next.config.js`, `tailwind.config.ts`, `tsconfig.json`,
  `.eslintrc.cjs`.
- Owns its own `src/components/ui/` — shadcn primitives installed via
  `npx shadcn@latest add button card input` in that folder.
- Owns its own `src/lib/api/` — typed fetchers built against `@xfos/contracts-*`.
- Owns its own `src/lib/design-tokens.ts` — colors, spacing, typography.
- Owns its own `src/lib/i18n/dictionaries/{en,km}.json`.
- Owns its own `vercel.json` / `Dockerfile` for independent deploy.

### Why this is stronger than the original ADR

The original ADR made platform-admin the only self-contained app and kept
`@platform/ui-customer` / `@platform/ui-admin` packages for the other three.
That gave platform-admin total isolation but still exposed storefront,
kitchen, and admin to cascading failures if the shared UI package broke.

Making all four apps self-contained means:

| Change | Can it break the storefront order flow? |
|---|---|
| `frontend/kitchen/**` change | ❌ different app, different runtime |
| `frontend/admin/**` change | ❌ different app, different runtime |
| `frontend/platform-admin/**` change | ❌ different app, different runtime |
| Upgrading React in `frontend/kitchen/package.json` | ❌ each app pins its own |
| Adding a Tailwind plugin to `frontend/admin/tailwind.config.ts` | ❌ each app has its own config |
| `contracts/order/*` change | ✅ the one unavoidable cross-cutting concern |
| `backend/domains/order/**` change | ✅ backend is shared |
| `database/prisma/schema.prisma` change | ✅ most dangerous — founder-only CODEOWNERS |

The cost (duplication of primitives, tokens, i18n dictionaries) is paid
once; the isolation benefit is structural and permanent. Full trade-off
analysis: decision doc §12.11.

### What the old "Decision 3 (three UI tiers)" becomes

**Deleted.** `@platform/ui-customer`, `@platform/ui-admin`, and the
`packages/config/eslint.customer.js` / `eslint.admin.js` / `eslint.platform.js`
boundary files do not exist in the new layout. The tier rules they enforced
are replaced by a single rule:

> Each frontend app may import from `@xfos/contracts-*` and nothing else
> from outside its own folder.

Enforced by each app's own `.eslintrc.cjs` using `no-restricted-imports`
against `**/frontend/**` and `**/backend/**` globs (plus the root-level
cross-folder boundary rule). See any of the four apps' `.eslintrc.cjs`.

---

## Decision 2: Backend API — one deployment — UNCHANGED

Platform Admin calls the same API as every other surface, but through its **own BFF NestJS module** at `backend/api/src/modules/platform-admin/`. Per ADR-008, every browser frontend has its own BFF; Platform Admin is no exception. Platform-admin BFF routes are namespaced at `/api/v1/platform-admin/*` and gated by a NestJS Roles Guard (`@Roles('PLATFORM_ADMIN')`).

```
/api/v1/storefront/*       → public (storefront BFF — modules/storefront/)
/api/v1/kitchen/*          → KITCHEN_STAFF, TENANT_MANAGER, TENANT_OWNER (kitchen BFF — modules/kitchen/)
/api/v1/admin/*            → TENANT_MANAGER, TENANT_OWNER (admin BFF — modules/admin/)
/api/v1/platform-admin/*   → PLATFORM_ADMIN only (platform-admin BFF — modules/platform-admin/)
/api/v1/auth/*             → public (login, refresh, invite — cross-cutting, shared by all frontends)
/api/v1/internal/<X>/*     → service token + private network (NOT for browsers)
```

A `PLATFORM_ADMIN` JWT has no `tenantId` claim — it cannot access
tenant-scoped routes. A `TENANT_OWNER` JWT is rejected by the
`PLATFORM_ADMIN` role guard. The boundary is enforced by the JWT payload
and guards, not by a separate service.

### Why not split the backend API?

| Concern | Split APIs | One API |
|---|---|---|
| Prisma client | Duplicated — migrations must run twice | Single client |
| Auth middleware | Must stay in sync manually | One implementation |
| Business logic | Cross-service calls required | Already co-located |
| Deployment overhead | Two Railway services, two sets of env vars | One |
| Debugging | Which API? | One log stream, one Sentry project |

### Future option

If compliance ever requires infra-level isolation, the same codebase can be
deployed twice with an env flag (`DEPLOYMENT_MODE=internal` / `public`)
controlling which domain modules mount in `app.module.ts`. Not needed at MVP.

---

## Decision 3: Infrastructure-level access restriction — UNCHANGED

Platform Admin restricts access at the **hosting-platform level**, not just
at the application level:

```
Vercel Project D: platform-admin
  Option A → Vercel Access Protection (password or team SSO)
  Option B → Vercel Trusted IPs allowlist (office IP / VPN only)
```

This is on top of the `PLATFORM_ADMIN` JWT role check on the API. Two
independent layers — infra + application.

Additionally, `frontend/platform-admin/next.config.js` sets
`X-Robots-Tag: noindex, nofollow` on every response and uses a tighter
`Referrer-Policy` than the other three apps. Each app has its own
`next.config.js`, so this is a per-app setting — no shared config to drift.

---

## Updated monorepo structure (excerpt)

```
xfos/
├── frontend/
│   ├── storefront/       ← Vercel A (public)
│   ├── kitchen/          ← Vercel B (public)
│   ├── admin/            ← Vercel C (public, auth-gated)
│   └── platform-admin/   ← Vercel D (IP / SSO restricted)
│
├── backend/api/          ← one NestJS deployment → Railway
│
└── contracts/            ← @xfos/contracts-* (Zod) — ONLY shared code
    ├── enums/ order/ auth/ catalog/ billing/ kitchen/ tenant/ onboarding/
```

No `packages/ui-customer`, no `packages/ui-admin`, no `packages/config` with
per-tier ESLint files, no `internal/platform-admin`. All four apps live
side-by-side under `frontend/` and are equally isolated.

Full layout: [`../../folder_structure_and_decision.md`](../../folder_structure_and_decision.md) §3.

---

## Deployment architecture (updated)

```
┌─────────────────── Customer Zone ──────────────────────────────┐
│  Vercel A: storefront.xfos.app   (public, QR-accessed)         │
│  Vercel B: kitchen.xfos.app      (public, PWA)                 │
│  each pins its own deps — storefront can be on Next 14 while   │
│  kitchen tries Next 15                                         │
└────────────────────────────────────────────────────────────────┘

┌─────────────────── Merchant Zone ──────────────────────────────┐
│  Vercel C: admin.xfos.app        (public, auth-gated)          │
│  fully self-contained — own deps, own shadcn primitives        │
└────────────────────────────────────────────────────────────────┘

┌─────────────────── Internal Zone ──────────────────────────────┐
│  Vercel D: platform.xfos.app     (IP/password restricted)      │
│  depends on @xfos/contracts-* ONLY — can split to its own repo │
│  later with `git subtree split frontend/platform-admin`        │
└────────────────────────────────────────────────────────────────┘

┌─────────────────── API Zone ───────────────────────────────────┐
│  Railway: api.xfos.app           (one NestJS deployment)       │
│  Railway: PostgreSQL             (private network)             │
│  Upstash: Redis                  (serverless)                  │
└────────────────────────────────────────────────────────────────┘
```

---

## CI/CD implications

Turborepo caches per workspace. A commit touching only
`frontend/platform-admin/**` redeploys **only** Vercel project D and rebuilds
only `@xfos/frontend-platform-admin`. Nothing about the order flow is
rebuilt. The cross-cutting things that DO trigger multi-app rebuilds are:

- `contracts/*` — rebuilds every consumer (FE + BE)
- `database/prisma/schema.prisma` — rebuilds the backend, re-runs migrations
- `backend/api/**` — rebuilds only the backend

None of those are frontend-app cascades.

---

## Summary of all decisions (updated)

| Question | Decision |
|---|---|
| Repo structure | One monorepo (pnpm + Turborepo), layout per `folder_structure_and_decision.md` |
| Platform admin frontend | `frontend/platform-admin/` — fully self-contained, Vercel project D, IP-restricted |
| **Storefront / kitchen / admin frontends** | **Also fully self-contained** — own deps, own config, own UI primitives (new in updated ADR) |
| Shared frontend UI package | **None.** `@platform/ui-customer` and `@platform/ui-admin` are deleted. |
| Backend API | One NestJS API at `backend/api/`, one Railway deployment |
| Shared code between FE and BE | `contracts/*` Zod schemas — the only cross-cutting concern |
| Boundary enforcement | ESLint `no-restricted-imports` at root (cross-folder) + per-app (frontend↔frontend) + per-layer (backend hexagonal) |
| When to split API | Post-MVP: compliance, separate scaling, or SSO/SAML for internal |

---

## Related documents

- [`../../folder_structure_and_decision.md`](../../folder_structure_and_decision.md) — **authoritative layout + §12 rationale**
- [`../shared/09-decisions-adrs.md`](../shared/09-decisions-adrs.md) — ADR-001 through ADR-005
- [`../backend/00-overview.md`](../backend/00-overview.md) — NestJS backend overview
- [`../backend/01-module-structure.md`](../backend/01-module-structure.md) — NestJS module patterns inside a domain
