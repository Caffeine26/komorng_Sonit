# features/

Each feature is a bounded folder with this shape:

```
features/<feature-name>/
├── components/      Feature-specific UI
├── hooks/           React hooks (TanStack Query queries/mutations live here)
├── api.ts           Feature-specific API calls — calls lib/api/* internally
├── store.ts         (optional) Zustand or local state
├── types.ts         Feature-specific types
└── index.ts         Public API — re-exports what other features can use
```

## Boundary rules (enforced by ESLint)

1. **No cross-feature internals.** `features/<A>` cannot import from
   `features/<B>/components/Foo` — only from `@/features/<B>` (its index.ts).
2. **No raw fetch.** `api.ts` must call `@/lib/api/*`, never `fetch()` directly.
3. **lib/ cannot depend on features/.** One-way dependency.

If two features need to share something, move it to `lib/` or
`components/shared/` — do not reach across features.
