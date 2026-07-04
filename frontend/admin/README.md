# @xfos/frontend-admin

Admin. Port **3002**. Self-contained (see docs §12).

```bash
pnpm --filter @xfos/frontend-admin dev          # → http://localhost:3002
pnpm --filter @xfos/frontend-admin build:tokens # regenerate design tokens
pnpm --filter @xfos/frontend-admin test         # vitest
```

## Structure

```
src/
├── app/                  Next.js routing only (layouts, pages, error/loading)
├── middleware.ts         Locale detection ONLY (keep thin)
├── features/             Bounded feature folders — the bulk of the code
├── components/
│   ├── ui/               shadcn primitives (LOCAL COPY ONLY)
│   └── layout/           Cross-feature layout shells (Header, Sidebar)
├── providers/            React tree providers (Query, i18n, Theme...)
├── lib/                  Low-level utilities only — NO business logic
│   ├── api/              Raw fetch clients — features/*/api.ts wraps these
│   ├── i18n/             dictionaries (en/km)
│   ├── analytics/
│   ├── telemetry/        Sentry + browser logger
│   ├── format/
│   └── utils/
├── config/               env, constants, generated design tokens
└── styles/               globals.css
```

## The two-layer API rule

`features/<x>/api.ts` must call `lib/api/*` — never `fetch()` directly. See
`src/lib/api/README.md` for the full pattern.

## Mental model

```
User → App Router (Server) → Feature Hooks (Client) → lib/api → Backend
```

## Design tokens

Edit `design-system/design_system.json` then run `pnpm build:tokens`.
`src/config/design-tokens.ts` is **generated** — never edit by hand.
