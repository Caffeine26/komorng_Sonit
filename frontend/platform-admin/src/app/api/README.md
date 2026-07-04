# app/api/ — tightly-scoped BFF

Route handlers here are **only** for things that physically must terminate on
the Next.js domain:

- OAuth callbacks (auth provider redirects)
- Webhooks that must hit the frontend host (e.g. ABA PayWay return URL)
- File uploads proxied with private credentials
- Server-only env var proxies for the browser

**Business logic does not live here.** All business endpoints live in the
NestJS backend (`backend/api`). If you find yourself querying Prisma or
implementing a use case in `app/api/`, stop and add it to the backend instead.
