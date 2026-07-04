# lib/api/ — raw fetch clients

The **only** place in this app that builds HTTP requests. `client.ts` exports
`apiFetch` — every other file in `lib/api/*` (e.g. `catalog.ts`, `order.ts`)
uses it to talk to the NestJS backend.

## The two-layer rule

```
features/<x>/api.ts  ──calls──>  lib/api/<domain>.ts  ──calls──>  apiFetch
                                                                      │
                                                                      ▼
                                                              NestJS backend
```

- **`lib/api/` is pure HTTP.** No React, no TanStack Query, no business logic.
  It exports plain async functions that take typed input and return typed output.
- **`features/*/api.ts` is feature-specific orchestration.** It composes one
  or more `lib/api/*` calls and exposes the result to feature hooks.
- **Features must NEVER call `fetch()` directly.** Lint will reject it.

## Isomorphic constraint

`apiFetch` must work in both Server Components (initial render, tenant
resolution, SEO) and client hooks (interactions, mutations). That means:

- Use only the Web Fetch API (no `axios`, no Node-only modules).
- Read auth tokens from an injected context, not `document.cookie` or
  `localStorage` directly.
- Pass `{ cache, next: { revalidate, tags } }` options through unchanged
  so callers can opt into Next.js caching behavior.
