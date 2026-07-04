# 03 — Next.js Architecture Design

> **Updated for ADR-008 (BFF-per-frontend, 2026-04-09).** The storefront frontend calls **only** `/api/v1/storefront/*` (its BFF) and `/api/v1/auth/*` (cross-cutting). It imports types from `@xfos/contracts-bff-storefront` and `@xfos/contracts-enums` — never from raw domain contracts. ESLint Rule 4 in `.eslintrc.cjs` enforces this. See `../shared/09-decisions-adrs.md` ADR-008 and `../../folder_structure_and_decision.md` §12.3a.

## Overview

All four product surfaces use **Next.js 14 with App Router**. Each app is independently deployable but lives in the same monorepo. The backend API is a **separate NestJS service (Node.js + TypeScript)** — Next.js apps do not contain business logic. They fetch from their BFF surface only (`backend/api/src/modules/<bff>/`).

### The two-layer API rule

Inside each frontend app:

```
features/<x>/api.ts  ──calls──>  lib/api/<bff>.ts  ──calls──>  apiFetch  ──>  /api/v1/<bff>/*
                                                                                    │
                                                                                    ▼
                                                                          backend/api/src/modules/<bff>/
                                                                                    │
                                                                                    ▼ (DI, not HTTP)
                                                                            domain use cases
```

- `lib/api/client.ts` — base `apiFetch` wrapper, isomorphic, the only place that builds requests
- `lib/api/storefront.ts` — typed wrappers around `/api/v1/storefront/*` endpoints
- `features/<x>/api.ts` — feature-layer composition that calls `lib/api/storefront.ts` (never raw `fetch()`)
- Features must NEVER import a sibling feature's internals; only via `@/features/<name>` (its index.ts)

---

## App Router Structure Strategy

### Server Components vs Client Components

| Use Server Component | Use Client Component |
|---|---|
| Page layouts, initial data fetch | Interactive forms, inputs |
| Menu/catalog display (static-ish) | Cart (user state) |
| Order confirmation page | Payment flow UI |
| SEO-sensitive pages | Kitchen ticket updates (socket) |
| Auth-gated dashboard shells | Language switcher |

**Rule:** Default to Server Components. Add `'use client'` only when interactivity or browser APIs are required.

---

## Storefront App Architecture

### Route Structure
```
app/
├── [locale]/              # Locale prefix for i18n (en, km)
│   ├── layout.tsx         # Root layout — loads fonts, providers
│   └── store/
│       └── [token]/       # QR token route
│           ├── layout.tsx # Resolves tenant from token, injects context
│           ├── page.tsx   # Menu browsing (Server Component)
│           │              # On load: reads localStorage, shows "Your orders this visit"
│           │              # banner if non-expired orders exist for this tenant
│           ├── cart/
│           │   └── page.tsx   # Cart review (Client Component)
│           ├── checkout/
│           │   └── page.tsx   # Payment flow (Client Component)
│           └── confirmation/
│               └── page.tsx   # Order confirmed (Server Component)
│                              # Writes orderToken + orderNumber to localStorage via
│                              # useOrderTracking hook after successful submission
├── o/
│   └── [orderToken]/
│       └── page.tsx       # Order status page (Client Component — polling)
│                          # Public, no auth. Polls GET /storefront/orders/status/{token}
│                          # every 15-20s. Stops on READY/COMPLETED or after 90 min.
```

### Data Flow Pattern
```
URL: /en/store/{qrToken}

layout.tsx (Server)
  └── fetch GET /api/v1/storefront/context/{qrToken}
      └── Returns: { tenantId, tenantName, theme, tableId?, serviceModel }
          └── Inject into React context via provider

page.tsx (Server)
  └── fetch GET /api/v1/storefront/{tenantId}/menu
      └── Returns: { categories: [...], items: [...] }
          └── Renders menu (no JS needed for initial render)
```

### Cart State
- Managed with **Zustand** (client-side only)
- Persisted to `localStorage` for session continuity
- Cleared on order confirmation

### Order Tracking (Kiosk Same-Visit)
Managed by a `useOrderTracking` hook — separate from cart state:

```typescript
// hooks/useOrderTracking.ts
// localStorage key: `orders:{tenantSlug}`
// Structure: { tenantSlug: string, orders: OrderEntry[] }
// OrderEntry: { orderToken, orderNumber, submittedAt }

const ORDER_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const ORDER_CAP = 5;

export function useOrderTracking(tenantSlug: string) {
  function saveOrder(entry: { orderToken: string; orderNumber: string }) {
    const key = `orders:${tenantSlug}`;
    const stored = JSON.parse(localStorage.getItem(key) ?? '{"orders":[]}');
    const now = Date.now();
    // Drop expired entries, then append, then cap
    const valid = stored.orders.filter(
      (o: OrderEntry) => now - new Date(o.submittedAt).getTime() < ORDER_TTL_MS
    );
    valid.push({ ...entry, submittedAt: new Date().toISOString() });
    if (valid.length > ORDER_CAP) valid.splice(0, valid.length - ORDER_CAP);
    localStorage.setItem(key, JSON.stringify({ tenantSlug, orders: valid }));
  }

  function getActiveOrders(): OrderEntry[] {
    const key = `orders:${tenantSlug}`;
    const stored = JSON.parse(localStorage.getItem(key) ?? '{"orders":[]}');
    const now = Date.now();
    return stored.orders.filter(
      (o: OrderEntry) => now - new Date(o.submittedAt).getTime() < ORDER_TTL_MS
    );
  }

  return { saveOrder, getActiveOrders };
}
```

- `saveOrder` is called from the confirmation page after a successful order submission
- `getActiveOrders` is called on the storefront home page to determine whether to show the banner
- Never stores sensitive data — only `orderToken`, `orderNumber`, and `submittedAt`

### i18n Pattern
```typescript
// next-intl setup
// middleware.ts — locale detection from browser preference
// app/[locale]/layout.tsx — loads messages

// Usage in Server Component
import { useTranslations } from 'next-intl';
const t = useTranslations('menu');
// t('addToCart') → "Add to Cart" / "បន្ថែមទៅកន្ត្រក"
```

---

## Admin Portal Architecture

### Route Groups
```
app/
├── (auth)/
│   ├── login/page.tsx          # Login form
│   └── invite/[token]/page.tsx # Accept invitation
└── (dashboard)/
    ├── layout.tsx              # Sidebar + auth guard
    ├── page.tsx                # Dashboard overview
    ├── menu/
    │   ├── categories/page.tsx
    │   └── items/
    │       ├── page.tsx        # Item list
    │       ├── new/page.tsx    # Create item
    │       └── [id]/page.tsx   # Edit item
    ├── qr/page.tsx
    ├── settings/
    │   ├── profile/page.tsx
    │   ├── payments/page.tsx
    │   └── service/page.tsx
    └── team/page.tsx
```

### Auth Guard Pattern
```typescript
// app/(dashboard)/layout.tsx
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';

export default async function DashboardLayout({ children }) {
  const session = await getServerSession();
  if (!session) redirect('/login');
  return <AdminShell session={session}>{children}</AdminShell>;
}
```

### Data Mutation Pattern (Server Actions)
```typescript
// app/(dashboard)/menu/items/actions.ts
'use server';
import { revalidatePath } from 'next/cache';

export async function createMenuItem(formData: FormData) {
  const data = itemSchema.parse(Object.fromEntries(formData));
  await apiClient.post('/api/v1/admin/catalog/items', data);
  revalidatePath('/menu/items');
}
```

---

## Kitchen App Architecture

### PWA Configuration
```typescript
// next.config.ts
import withPWA from 'next-pwa';

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // Disable in dev
  disable: process.env.NODE_ENV === 'development',
});
```

### Real-Time Updates
```typescript
// hooks/useKitchenSocket.ts
'use client';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useTicketStore } from '@/stores/tickets';

export function useKitchenSocket(tenantId: string) {
  const { addTicket, updateTicket, setTickets } = useTicketStore();

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_API_URL, {
      auth: { token: getAccessToken() },
    });

    socket.emit('join', `tenant_${tenantId}`);

    socket.on('ticket.new', (ticket) => addTicket(ticket));
    socket.on('ticket.updated', (ticket) => updateTicket(ticket));

    // On reconnect (includes cases where the socket dropped due to expired token),
    // refresh the access token first, then re-fetch all active tickets from the DB.
    // This ensures the kitchen queue is never stale after a disconnection.
    socket.on('connect', async () => {
      const newToken = await refreshAccessToken(process.env.NEXT_PUBLIC_API_URL!);
      if (newToken) {
        socket.auth = { token: newToken }; // update auth for next reconnect
        setToken(newToken);
      }
      // Re-fetch tickets missed while disconnected (DB is source of truth)
      const tickets = await apiClient.get(`/kitchen/tickets?status=active`);
      setTickets(tickets.data);
    });

    // Token expiry during a long session: socket.io re-authentication
    // If the server returns 'unauthorized' on a token check, force reconnect
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') {
        // Server disconnected us (likely expired auth) — reconnect after refresh
        socket.connect();
      }
    });

    return () => socket.disconnect();
  }, [tenantId]);
}
```

### Ticket Queue View
```typescript
// app/(kitchen)/page.tsx — Client Component
'use client';

export default function KitchenQueue() {
  useKitchenSocket(tenantId);
  const tickets = useTicketStore((s) => s.activeTickets);

  return (
    <div className="grid grid-cols-3 gap-4">
      <TicketColumn status="NEW" tickets={tickets.filter(t => t.status === 'NEW')} />
      <TicketColumn status="PREPARING" tickets={tickets.filter(t => t.status === 'PREPARING')} />
      <TicketColumn status="READY" tickets={tickets.filter(t => t.status === 'READY')} />
    </div>
  );
}
```

---

## API Client Pattern (Shared)

```typescript
// packages/utils/src/api-client.ts
import ky from 'ky';

// Single refresh queue — prevents concurrent 401s from issuing multiple refresh calls.
// Scenario: user returns after 20+ min idle; multiple components fire requests in parallel
// with expired token. All get 401. Only the first triggers a refresh; the rest wait on
// the same promise. This is especially important on slow mobile (3G/4G in Cambodia).
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(baseUrl: string): Promise<string | null> {
  if (refreshPromise) return refreshPromise; // queue: return in-flight refresh

  refreshPromise = ky
    .post(`${baseUrl}/api/v1/auth/refresh`, { credentials: 'include' })
    .json<{ data: { accessToken: string } }>()
    .then((res) => res.data.accessToken)
    .catch(() => null) // refresh failed → null → caller logs out
    .finally(() => {
      refreshPromise = null; // clear queue when done
    });

  return refreshPromise;
}

export function createApiClient(
  baseUrl: string,
  getToken: () => string | null,
  setToken: (token: string) => void,
  onLogout: () => void,
) {
  return ky.create({
    prefixUrl: baseUrl,
    hooks: {
      beforeRequest: [
        (request) => {
          const token = getToken();
          if (token) request.headers.set('Authorization', `Bearer ${token}`);
        },
      ],
      afterResponse: [
        async (request, options, response) => {
          if (response.status === 401) {
            const newToken = await refreshAccessToken(baseUrl);
            if (!newToken) { onLogout(); return; }
            setToken(newToken);
            request.headers.set('Authorization', `Bearer ${newToken}`);
            return ky(request); // retry original request with new token
          }
        },
      ],
    },
  });
}
```

---

## Environment Variables Pattern

Each app has its own `.env.local`:

```bash
# frontend/storefront/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_APP_NAME=XFOS Storefront

# frontend/admin/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_APP_NAME=XFOS Admin

# frontend/kitchen/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000
NEXT_PUBLIC_APP_NAME=XFOS Kitchen
```

Validated at startup with Zod:
```typescript
// src/lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
```

---

## Rendering Strategy by Page

| Page | Rendering | Reason |
|---|---|---|
| Storefront menu | Server (dynamic) + Redis cache | Dynamic for immediate availability toggle. Menu response cached in Redis (key: `menu:{tenantId}`, TTL 5min). Cache invalidated explicitly when merchant updates menu item availability. See `16-design-system.md`. |
| Cart | Client-only | User state, no server needed |
| Checkout | Client Component | Payment interaction |
| Order confirmation | Server (dynamic) | Real-time order status |
| Order status page (`/o/[token]`) | Client Component | Polls API every 15–20s; needs `useEffect` for interval |
| Admin dashboard | Server (dynamic) | Always fresh data |
| Admin menu editor | Client Component | Form interactions |
| Kitchen queue | Client Component | WebSocket, real-time |
| Platform admin | Server (dynamic) | Fresh data, internal tool |

### Menu Caching Pattern

Redis is best-effort. If Redis is unavailable (Upstash outage, network timeout), the endpoint
falls back silently to Postgres. Cache errors are logged as warnings, never propagated to customers.

```typescript
// API: GET /storefront/:tenantId/menu
const cacheKey = `menu:${tenantId}`;

// Best-effort cache read — never throws
let cached: string | null = null;
try {
  cached = await redis.get(cacheKey);
} catch (err) {
  logger.warn({ err, tenantId }, 'Redis GET failed — falling back to Postgres');
}

if (cached) return JSON.parse(cached);

const menu = await prisma.menuCategory.findMany({
  where: { tenantId, deletedAt: null },
  include: {
    translations: true,
    items: {
      where: { deletedAt: null },
      include: { translations: true },
    },
  },
  orderBy: { sortOrder: 'asc' },
});

// Best-effort cache write — never throws
try {
  await redis.setex(cacheKey, 300, JSON.stringify(menu)); // TTL 5min
} catch (err) {
  logger.warn({ err, tenantId }, 'Redis SET failed — menu served uncached');
}

return menu;

// Invalidation: called when merchant updates item availability
// Also best-effort — a stale cache miss on next request is acceptable
async function invalidateMenuCache(tenantId: string): Promise<void> {
  try {
    await redis.del(`menu:${tenantId}`);
  } catch (err) {
    logger.warn({ err, tenantId }, 'Redis DEL failed during cache invalidation');
  }
}
```

### Kitchen App Reconnection Pattern

On socket reconnect, the kitchen app must re-fetch all active tickets from the API
to recover state missed during the disconnection. Do not rely solely on socket events
for state — socket events are a live update layer on top of the DB source of truth.

```typescript
// hooks/useKitchenSocket.ts
socket.on('connect', async () => {
  // Recover any tickets missed while disconnected
  const tickets = await apiClient.get(`/kitchen/tickets?tenantId=${tenantId}&status=active`);
  setTickets(tickets.data);
});
```

---

## Error Handling in Next.js

```
app/
├── error.tsx          # Catches errors in route segments
├── not-found.tsx      # 404 pages
└── global-error.tsx   # Root-level error boundary
```

```typescript
// app/store/[token]/error.tsx
'use client';

export default function StorefrontError({ error, reset }) {
  return (
    <div>
      <p>Something went wrong loading this storefront.</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

---

## Loading States

```
app/(dashboard)/
├── loading.tsx        # Skeleton shown while page loads
└── menu/
    └── loading.tsx    # Menu-specific skeleton
```

Use **Suspense boundaries** for partial loading:
```typescript
<Suspense fallback={<MenuSkeleton />}>
  <MenuList tenantId={tenantId} />
</Suspense>
```

---

## Security Considerations

| Concern | Solution |
|---|---|
| Auth token storage | `httpOnly` cookie (not localStorage) |
| CSRF | SameSite=Strict cookie + CSRF token for mutations |
| Tenant data leakage | Never trust client-passed `tenantId` — always read from JWT |
| XSS | No `dangerouslySetInnerHTML`; sanitize all user content |
| Environment variables | Server-only vars never prefixed with `NEXT_PUBLIC_` |
