# providers/

React tree providers wired in by `app/[locale]/layout.tsx`:

- `query-provider.tsx` — TanStack Query
- `i18n-provider.tsx`  — next-intl
- (add more here as needed: theme, auth, socket, analytics)

Providers should be tiny client components that wrap children. Heavy logic
belongs in `lib/` modules that providers consume.
