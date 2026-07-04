# Food Ordering SaaS — Full Detailed Usage of Each Stack

> **Updated for ADR-008.** Where this doc references "Backend API" or "Backend", that is now the NestJS modular monolith at `xfos/backend/api/`, with two HTTP surfaces:
> - **BFF surfaces** at `/api/v1/<bff>/*` — `backend/api/src/modules/<bff>/`, one per browser frontend (storefront, kitchen, admin, platform-admin)
> - **Internal domain surfaces** at `/api/v1/internal/<domain>/*` — `backend/api/src/domains/<domain>/api/`, gated by `InternalOnlyGuard` + `ServiceTokenGuard`
>
> Browser frontends call only their BFF (plus the cross-cutting `/api/v1/auth/*`). Internal domain APIs are for scripts, admin tools, and integrations only. See [`technical-design/shared/09-decisions-adrs.md`](technical-design/shared/09-decisions-adrs.md) ADR-008 and [`folder_structure_and_decision.md`](folder_structure_and_decision.md) §12.3a.

This document specifies **exactly where and how each technology is used** in the system. It removes abstraction and maps each tool to concrete responsibilities and runtime behavior.

## 1. Core Stack

### Frontend — Next.js 14 (App Router)

#### Customer Ordering App (QR Flow)

- Scan QR → load restaurant menu page (SSR/edge where appropriate)
- Fetch menu (categories, items, modifiers) from Backend API
- Render menu with availability states (in stock / out of stock / time-based)
- Add items to cart (client state)
- Apply modifiers (size, toppings, extras)
- Calculate provisional pricing on client (display only)
- Checkout flow:
  - select order type (dine-in / takeaway)
  - enter table number / notes
  - confirm order
  - Submit order to Backend API
  - Show confirmation (order number, status)
  - Subscribe/poll for order status updates (fallback to polling if WS unavailable)

#### Admin Dashboard (Restaurant Staff)

- Authentication UI (login, password reset)
- Menu management:
  - create/edit/delete categories
  - create/edit/delete items
  - upload images (via object storage)
  - manage modifiers and options
  - toggle availability
- Order management:
  - view incoming orders list
  - filter by status
  - update status (confirm, preparing, ready, complete)
- Staff management:
  - create users
  - assign roles/permissions
- Analytics views:
  - daily/weekly order counts
  - revenue summaries

#### Shared Frontend Responsibilities

- Call Backend APIs (typed client/SDK)
- Client-side validation (Zod)
- Internationalization (English/Khmer via next-intl)
- UI state management (forms, cart, filters)
- Error handling and UX feedback

---

### Backend API — NestJS (Node.js + TypeScript)

#### Cross-Cutting

- Request lifecycle: guards → pipes/validation → controller → service → repository/ORM
- Attach user_id, tenant_id, roles to request context
- Enforce RBAC via guards
- Emit domain events for async processing and realtime

#### Auth Module

- Login (email/password)
- Issue JWT access + refresh tokens
- Refresh token rotation
- Logout (invalidate session if stored)
- Password reset and email verification

#### Tenant / Restaurant Modules

- Create tenant (restaurant owner)
- Manage restaurant profile, branches, business hours
- Tenant-scoped configuration

#### User / RBAC Module

- Create/manage users (admin, cashier, kitchen)
- Assign roles and permissions
- Enforce permissions on every request

#### Menu Module

- CRUD categories, items, modifiers
- Availability logic (time windows, stock flags)
- Public menu retrieval for customer app

#### Order Module (Critical Path)

- Validate request payload
- Recalculate pricing server-side (authoritative)
- Transactionally create:
  - order
  - order_items
  - order_item_modifiers
- Generate order number
- Manage state transitions:
  - pending → confirmed → preparing → ready → completed
- Emit events:
  - enqueue jobs (BullMQ)
  - publish realtime updates (Socket.io)

#### Payment Module (if enabled)

- Create payment intent/session
- Handle provider webhooks
- Verify signatures and status
- Update order status on success/failure

#### Notification Module

- Enqueue notifications (email/SMS/Telegram)
- Build message payloads

#### Realtime Module (Gateway)

- Manage WebSocket connections
- Room strategy (tenant_id, role, store)
- Emit events: new order, order updates

#### Audit Module

- Record admin actions (menu changes, role updates, overrides)
- Persist audit logs

---

### ORM — Prisma

- Used inside NestJS services/repositories
- Execute queries and transactions (e.g., order creation)
- Manage schema migrations
- Provide type-safe access to DB models

---

### Database — PostgreSQL

#### Data Domains

- Tenancy: tenants, restaurants, branches
- Identity: users, roles, permissions
- Menu: categories, items, modifiers, options
- Orders: orders, order_items, order_item_modifiers
- System: sessions (optional), audit_logs

#### Behaviors

- Enforce tenant_id isolation in all queries
- Use transactions for order creation and payment updates
- Index hot paths (orders by status/time, items by category)

---

### Cache / Queue — Redis + BullMQ

#### Queue (BullMQ)

- Order events:
  - new order → notify kitchen/dashboard
  - status changes → downstream notifications
- Notifications:
  - email/SMS/Telegram sending
- Webhooks:
  - retry failed callbacks (idempotent)
- Scheduled jobs:
  - cleanup, report generation

#### Cache (Redis)

- Cache menu/restaurant read models (optional)
- Rate limiting counters (login, API abuse)

---

### Realtime — Socket.io (NestJS Gateway)

- Kitchen/KDS: receive new orders instantly
- Staff dashboard: live status updates
- Flow: Backend emits → gateway → clients in tenant/role rooms

---

### Auth — JWT (Access + Refresh) + RBAC

- Authenticate users and issue tokens
- Attach identity/tenant context to each request
- Enforce role/permission checks per endpoint

---

### Validation — Zod (FE) + class-validator (BE)

- Frontend: validate forms (login, menu edits, checkout)
- Backend: validate DTOs (CreateOrderDto, etc.)

---

### UI — shadcn/ui + Tailwind CSS

- Build admin and customer UIs (buttons, forms, tables, dialogs)
- Mobile-first layouts for ordering flow

---

### Monorepo — pnpm + Turborepo

- Share packages: ui, types, schemas, config, sdk
- Keep FE/BE contracts consistent

## 2. Infrastructure & Runtime

### Frontend Hosting — Vercel

- Host Next.js apps (customer + admin)
- Edge/static delivery for assets and pages

### Backend Hosting — Railway / Render / VPS

- Run NestJS API (HTTP server)
- Expose REST endpoints

### Background Workers — NestJS + BullMQ

- Separate process consuming queues
- Execute async jobs (notifications, retries)

### Object Storage — S3 / Cloudinary

- Store menu images, logos, uploads
- Serve via CDN URLs

### CDN — Vercel Edge / Cloudflare

- Deliver static assets and images globally

## 3. Observability & Ops

### Logging — Pino

- Log requests, errors, and domain events
- Include context: tenant_id, user_id, order_id, request_id

### Error Tracking — Sentry

- Capture frontend and backend exceptions
- Aggregate and alert on issues

### Monitoring — Better Stack

- Uptime checks for API and frontend
- Alerting on outages

### Metrics (Optional) — Prometheus + Grafana

- Track latency, throughput, queue depth

## 4. Testing

### Backend — Vitest + Supertest

- Unit and integration tests for services/controllers
- Verify auth, RBAC, order logic

### E2E — Playwright

- Simulate real flows: browse menu → place order → verify outcome

## 5. API & Contracts

### OpenAPI (Swagger via NestJS)

- Document endpoints (/auth, /menu, /orders, etc.)
- Serve as source of truth for FE/BE integration

### API Client (SDK)

- Generated/typed client used by frontend to call APIs safely

## 6. Internationalization

### next-intl

- Render UI in English and Khmer
- Handle locale switching and formatting

## 7. Security (Non-Negotiable)

- Authentication: secure token issuance and validation
- Authorization: RBAC checks on all protected routes
- Multi-tenancy: enforce tenant_id in all data access
- Rate limiting: protect auth and sensitive endpoints
- Input validation: prevent invalid/malicious data
- Secrets management: secure credentials and keys
- Audit logs: record critical admin actions

## 8. End-to-End System Flow

### Menu Load

- Client (Next.js) → GET /menu → NestJS → Prisma → PostgreSQL → response

### Order Placement

- Client → POST /orders → NestJS validates + transaction → PostgreSQL
- Emit: enqueue job (BullMQ) + publish realtime event (Socket.io)

### Async Processing

- Worker consumes job → sends notifications / retries webhooks

### Realtime Updates

- Gateway pushes events to kitchen/dashboard clients

## Final Notes

- Each component has a single responsibility; avoid overlap
- Orders and payments must be transactional and idempotent
- All data access must be tenant-scoped
- Controllers remain thin; business logic lives in services
