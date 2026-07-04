# 06 — API Endpoints and Design

> **Updated for ADR-008 (BFF-per-frontend, 2026-04-09).** The HTTP surface now has TWO sides:
>
> 1. **Public BFF surfaces** under `/api/v1/<bff>/*` — one per browser frontend. The frontend may call ONLY its own BFF.
> 2. **Internal domain surfaces** under `/api/v1/internal/<domain>/*` — for scripts, admin tools, server-to-server, and partner integrations. Behind THREE walls (URL prefix + `ServiceTokenGuard` + `InternalOnlyGuard`). **Browser frontends do NOT call these.**
>
> Each BFF surface lives in `backend/api/src/modules/<bff>/`. Each domain lives in `backend/api/src/domains/<domain>/`. BFF use cases call domain use cases via DI, never via HTTP. See ADR-008 in `09-decisions-adrs.md` and §12.3a of `folder_structure_and_decision.md`.

## API Design Principles

- Base URL: `/api/v1/`
- BFF surfaces: `/api/v1/{storefront,kitchen,admin,platform-admin}/*`
- Internal surfaces: `/api/v1/internal/<domain>/*` (service-token auth, network-restricted)
- Auth is a cross-cutting exception: `/api/v1/auth/*` is shared by all frontends (no per-BFF auth flow)
- All responses return JSON
- All timestamps in ISO 8601 UTC: `2024-01-15T10:30:00Z`
- Amounts in minor units (cents) with explicit currency
- Tenant isolation: `tenantId` always read from JWT context (or resolved-from-slug at the BFF entry for storefront's no-auth case), never from request body
- Errors follow a consistent structure (see `05-error-handling.md`)

---

## Response Envelope

```json
// Success
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "total": 50 }   // optional, for lists
}

// Error
{
  "success": false,
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "Menu item not found",
    "details": {}
  }
}
```

---

## Auth Surface (`/api/v1/auth`) — cross-cutting (shared by all frontends)

> **Architectural exception to the BFF rule.** Auth is the only surface that all frontends share directly. Issuing/refreshing JWTs is the same operation regardless of which frontend asked, so duplicating it across four BFFs would be ceremony for no gain. The frontend contract for auth lives in `@xfos/contracts-auth` (the only domain contract a frontend may import alongside `@xfos/contracts-enums`). All other domain shapes go through a BFF.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | Public | Login with email + password |
| POST | `/auth/refresh` | httpOnly cookie | Refresh access token |
| POST | `/auth/logout` | Bearer | Invalidate refresh token |
| POST | `/auth/accept-invite` | Public | Accept invitation + set password |
| POST | `/auth/forgot-password` | Public | Send password reset email |
| POST | `/auth/reset-password` | Token | Reset password |
| GET | `/auth/me` | Bearer | Get current user + roles |

### POST /auth/login
```json
// Request
{ "email": "owner@restaurant.com", "password": "..." }

// Response 200
{
  "data": {
    "accessToken": "eyJ...",
    "user": { "id": "...", "email": "...", "roles": [...] }
  }
}
```

---

## Storefront BFF Surface (`/api/v1/storefront`) — Public

> Implemented in `backend/api/src/modules/storefront/`. The ONLY surface the customer storefront frontend may call (plus `/api/v1/auth/*`). Contracts: `@xfos/contracts-bff-storefront`. The BFF use cases call domain use cases (`SubmitOrderUseCase`, `FindOrderByTokenUseCase`, future `CatalogQueries`) via DI.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/storefront/context/:token` | Public | Resolve QR token → tenant context |
| GET | `/storefront/:tenantId/menu` | Public | Get full menu with translations |
| GET | `/storefront/:tenantId/menu/categories` | Public | Get categories only |
| GET | `/storefront/:tenantId/items/:itemId` | Public | Get item detail |
| POST | `/storefront/:tenantId/sessions` | Public | Create or resume order session |
| GET | `/storefront/:tenantId/sessions/:sessionId` | Public | Get session state |
| POST | `/storefront/orders` | Public | Submit order |
| GET | `/storefront/orders/status/:orderToken` | Public | Get order status by token (for status page polling) |
| GET | `/storefront/bills/:billId` | Public | Get bill (for pay-after confirmation) |

### GET /storefront/context/:token
```json
// Response 200
{
  "data": {
    "tenantId": "clx_t_kohpich_noodles",
    "tenantName": "Koh Pich Noodles",
    "serviceModel": "STALL_KIOSK",
    "payTiming": "PAY_BEFORE",
    "defaultLocale": "km",
    "theme": { "primaryColor": "#E86A3A", "logoUrl": "..." },
    "paymentMethods": ["CASH", "ABA_QR"],
    "tableRef": null
  }
}
```

### POST /storefront/orders

> **tenantId isolation note (public endpoint):** This is a public endpoint — no JWT is
> present. The `tenantId` in the request body is accepted as a client hint (the storefront
> already resolved it from the QR context step), but the server **MUST** validate it against
> the `sessionId`: fetch the session, assert `session.tenantId === req.body.tenantId`, and
> return `403 TENANT_MISMATCH` if they differ. Never use `req.body.tenantId` directly for
> any DB query — always use `session.tenantId` from the server-fetched record.

```json
// Request
{
  "tenantId": "uuid",
  "sessionId": "uuid",
  "items": [
    { "menuItemId": "uuid", "quantity": 2, "notes": "no sugar" }
  ]
}

// Response 201
{
  "data": {
    "orderId": "uuid",
    "orderNumber": "ORD-0042",
    "orderToken": "a3f9c1d2e4b7820f",   // stored in localStorage; used for /o/{token} status URL
    "status": "PENDING_PAYMENT",
    "total": "12.50",
    "currency": "USD",
    "billId": "uuid"
  }
}
```

### GET /storefront/orders/status/:orderToken

Used by the order status page (`/o/{orderToken}`) to poll kitchen progress. No auth required.
Returns only safe public fields — never exposes internal IDs or billing details.

```json
// Response 200
{
  "data": {
    "orderNumber": "ORD-0042",
    "orderToken": "a3f9c1d2e4b7820f",
    "status": "SUBMITTED",
    "kitchenStatus": "PREPARING",   // reflects linked kitchen_ticket.status: NEW | PREPARING | READY | COMPLETED
    "items": [
      { "name": "Beef Lok Lak", "quantity": 2 },
      { "name": "Iced Coffee", "quantity": 1 }
    ],
    "tableRef": null,
    "submittedAt": "2026-03-25T12:34:00Z"
  }
}

// Response 404 — unknown or expired token
{
  "success": false,
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "Order not found"
  }
}
```

**Security note:** The endpoint looks up by `order_token` only — never by `orderId`. Token is 32 hex chars (128-bit entropy), making enumeration infeasible. Rate-limit this endpoint to 30 req/min per IP.

---

## Billing & Payments — split across BFFs

> **No standalone `/api/v1/billing/*` surface in the BFF model.** Billing is a domain (`backend/api/src/domains/billing/`) called by multiple BFFs:
> - **Customer-facing payment confirmation** lives under `/api/v1/storefront/orders/:token/pay` (storefront BFF projection).
> - **Merchant-facing billing reporting** lives under `/api/v1/admin/billing/*` (merchant admin BFF projection).
> - **Cross-tenant billing dashboards** live under `/api/v1/platform-admin/billing/*` (platform-admin BFF projection).
> - **Internal billing operations** (refunds via script, reconciliation jobs, partner integrations) call `/api/v1/internal/billing/*` with a service token.
>
> The endpoints listed below describe the **legacy unified `/api/v1/billing/*` surface** and are kept here for migration reference. New work should add the appropriate BFF projection above and an internal endpoint for non-browser callers.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/billing/bills/:billId` | Public / Staff | Get bill details + payment status |
| POST | `/billing/bills/:billId/pay` | Public | Initiate payment |
| GET | `/billing/bills/:billId/payment-status` | Public | Poll payment status |
| POST | `/billing/bills/:billId/confirm-cash` | Staff (Kitchen/Manager) | Confirm cash received — always scoped to JWT `tenant_id` |
| POST | `/webhooks/aba/callback` | Signed webhook | ABA QR payment callback |
| POST | `/webhooks/card/callback` | Signed webhook | Card payment callback |

> **WEBHOOK SECURITY (MANDATORY):** Both webhook endpoints MUST verify the request signature
> before processing. An unauthenticated POST that confirms a `billId` is a direct payment bypass.
>
> ```typescript
> // backend/api/src/domains/billing/infra/aba-payway/webhook-signature.util.ts
> // Note: implemented as a pure function so it can be used from a Nest controller.
> export function verifyWebhookSignatureOrThrow(params: {
>   secret: string;
>   signature: string | undefined;
>   rawBody: Buffer | undefined;
> }) {
>   const { secret, signature, rawBody } = params;
>   if (!signature) throw new UnauthorizedException('Missing signature');
>
>   // CRITICAL: verify against RAW request body bytes, NOT JSON.stringify(req.body).
>     // ABA (and most gateways) sign the raw bytes they sent. Node's JSON.stringify may
>     // produce a different key order, causing every valid webhook to fail verification.
>   if (!rawBody) throw new InternalServerErrorException('Raw body unavailable');
>
>   const expected = crypto
>       .createHmac('sha256', secret)
>       .update(rawBody)   // ← raw bytes, not re-serialized JSON
>       .digest('hex');
>
>   if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
>     throw new UnauthorizedException('Invalid signature');
>   }
> }
>
> // Required: capture rawBody before JSON parsing in Nest (Express adapter).
> // In main.ts, enable rawBody and use it in the controller:
> //
> // const app = await NestFactory.create<NestExpressApplication>(AppModule, {
> //   rawBody: true,
> // });
> //
> // Then in the controller:
> // @Post('/webhooks/aba/callback')
> // handleAbaCallback(@Req() req: Request & { rawBody?: Buffer }) {
> //   verifyWebhookSignatureOrThrow({
> //     secret: process.env.ABA_WEBHOOK_SECRET!,
> //     signature: req.header('x-webhook-signature'),
> //     rawBody: req.rawBody,
> //   });
> //   // ... process webhook
> // }
>
> // This approach avoids any Express middleware ordering footguns in a Nest codebase.
> ```
>
> ABA provides a shared secret on merchant registration. `HMAC-SHA256` with `timingSafeEqual`
> is the standard. For card provider: use the provider's SDK verification method if available.

### Cross-Tenant Isolation — Billing Endpoints

> All billing endpoints that accept `:billId` as a path parameter **MUST** scope the
> DB lookup to the JWT's `tenant_id`. Never fetch a bill by ID alone:
>
> ```typescript
> // ✓ CORRECT
> const bill = await billRepo.findOne({ id: billId, tenantId: req.auth.tenantId });
> if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill not found', 404);
>
> // ✗ WRONG — cross-tenant enumeration risk
> const bill = await billRepo.findById(billId);
> ```
>
> This applies to: `GET /billing/bills/:billId`, `POST /billing/bills/:billId/pay`,
> `GET /billing/bills/:billId/payment-status`, and `POST /billing/bills/:billId/confirm-cash`.
> Return **404** (not 403) when the bill doesn't belong to the caller's tenant — do not
> reveal whether the billId exists in another tenant.

### POST /billing/bills/:billId/pay
```json
// Request
{
  "method": "ABA_QR",
  "returnUrl": "https://storefront.app/store/token/confirmation"
}

// Response 200 — ABA QR
{
  "data": {
    "paymentAttemptId": "uuid",
    "method": "ABA_QR",
    "status": "PENDING",
    "qrCode": "base64string...",
    "deeplink": "aba://pay?...",
    "expiresAt": "2024-01-15T10:45:00Z"
  }
}

// Response 200 — Cash
{
  "data": {
    "paymentAttemptId": "uuid",
    "method": "CASH",
    "status": "PENDING",
    "amount": "12.50",
    "currency": "USD"
  }
}
```

---

## Kitchen BFF Surface (`/api/v1/kitchen`) — Bearer (Kitchen Staff role)

> Implemented in `backend/api/src/modules/kitchen/`. The ONLY surface the kitchen tablet PWA may call (plus `/api/v1/auth/*`). Contracts: `@xfos/contracts-bff-kitchen`. Real-time ticket updates flow via Socket.io rooms named `tenant_{tenantId}`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/kitchen/tickets` | Kitchen Staff | Get active tickets queue |
| GET | `/kitchen/tickets/:id` | Kitchen Staff | Get ticket detail |
| PATCH | `/kitchen/tickets/:id/status` | Kitchen Staff | Update ticket status |
| GET | `/kitchen/tickets?status=NEW` | Kitchen Staff | Filter by status |
| GET | `/kitchen/tickets?status=PREPARING` | Kitchen Staff | Filter preparing |
| GET | `/kitchen/pending-cash` | Kitchen Staff | List orders awaiting cash confirmation |

### GET /kitchen/tickets
```json
// Response 200
{
  "data": {
    "tickets": [
      {
        "id": "uuid",
        "ticketNumber": "T-007",
        "orderNumber": "ORD-0042",
        "status": "NEW",
        "tableRef": "T5",
        "serviceModel": "DINE_IN_TABLE",
        "items": [
          { "name": "Beef Lok Lak", "quantity": 2, "notes": "" },
          { "name": "Iced Coffee", "quantity": 1, "notes": "less sweet" }
        ],
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

### GET /kitchen/pending-cash
> **MVP endpoint.** Called on Kitchen App mount and on WebSocket reconnect to hydrate the Pending Cash section. Returns all orders for this tenant with `billStatus = PENDING_PAYMENT` and `paymentMethod = CASH`. See Flow 7 in `../backend/02-sequence-diagrams.md` for the full counter-confirmation flow.

```json
// Response 200
{
  "data": {
    "pendingCash": [
      {
        "orderId": "uuid",
        "billId": "uuid",
        "orderNumber": "ORD-0042",
        "total": "12.50",
        "currency": "USD",
        "items": [
          { "name": "Beef Lok Lak", "quantity": 2 },
          { "name": "Iced Coffee", "quantity": 1 }
        ],
        "submittedAt": "2024-01-15T10:28:00Z"
      }
    ]
  }
}
```

### PATCH /kitchen/tickets/:id/status
```json
// Request
{ "status": "PREPARING" }

// Response 200
{
  "data": {
    "id": "uuid",
    "status": "PREPARING",
    "startedAt": "2024-01-15T10:31:00Z"
  }
}

// Validation error
{
  "success": false,
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "Cannot transition from READY to NEW"
  }
}
```

---

## Merchant Admin BFF Surface (`/api/v1/admin`) — Bearer (Tenant Owner/Manager)

> Implemented in `backend/api/src/modules/admin/`. The ONLY surface the merchant portal frontend may call (plus `/api/v1/auth/*`). Contracts: `@xfos/contracts-bff-admin`. Tenant context comes from the JWT, never from the request body.

### Profile & Settings

| Method | Path | Description |
|---|---|---|
| GET | `/admin/tenant` | Get tenant profile |
| PATCH | `/admin/tenant` | Update tenant profile |
| GET | `/admin/tenant/settings` | Get settings |
| PATCH | `/admin/tenant/settings` | Update settings |
| GET | `/admin/tenant/setup-progress` | Get setup checklist |

### Catalog

| Method | Path | Description |
|---|---|---|
| GET | `/admin/catalog/categories` | List categories |
| POST | `/admin/catalog/categories` | Create category |
| PATCH | `/admin/catalog/categories/:id` | Update category |
| DELETE | `/admin/catalog/categories/:id` | Soft-delete category |
| PUT | `/admin/catalog/categories/reorder` | Reorder categories |
| GET | `/admin/catalog/items` | List items |
| POST | `/admin/catalog/items` | Create item |
| GET | `/admin/catalog/items/:id` | Get item |
| PATCH | `/admin/catalog/items/:id` | Update item |
| DELETE | `/admin/catalog/items/:id` | Soft-delete item |
| PUT | `/admin/catalog/items/:id/availability` | Toggle availability |

### QR Management

| Method | Path | Description |
|---|---|---|
| GET | `/admin/qr` | List QR contexts |
| POST | `/admin/qr` | Generate new QR |
| GET | `/admin/qr/:id` | Get QR detail + image |
| PATCH | `/admin/qr/:id` | Update QR label |
| DELETE | `/admin/qr/:id/deactivate` | Deactivate QR |
| GET | `/admin/qr/:id/download` | Download QR image (PNG) |

### Team

| Method | Path | Description |
|---|---|---|
| GET | `/admin/team` | List team members + roles |
| POST | `/admin/team/invite` | Invite new user |
| PATCH | `/admin/team/:userId/role` | Update user role |
| DELETE | `/admin/team/:userId` | Remove user access |

### Orders & Billing (read-only for admin)

| Method | Path | Description |
|---|---|---|
| GET | `/admin/orders` | List orders (with filters) |
| GET | `/admin/orders/:id` | Get order detail |
| GET | `/admin/bills` | List bills |
| GET | `/admin/bills/:id` | Get bill detail |

### POST /admin/catalog/items
```json
// Request
{
  "categoryId": "uuid",
  "basePrice": "8.50",
  "currency": "USD",
  "isAvailable": true,
  "isVisible": true,
  "sortOrder": 3,
  "translations": [
    { "locale": "en", "name": "Beef Lok Lak", "description": "Stir-fried beef..." },
    { "locale": "km", "name": "លលក់", "description": "សាច់គោចៀន..." }
  ]
}

// Response 201
{
  "data": {
    "id": "uuid",
    "basePrice": "8.50",
    "isAvailable": true,
    "translations": [...]
  }
}
```

---

## Platform Admin BFF Surface (`/api/v1/platform-admin`) — Bearer (Platform Admin role)

> Implemented in `backend/api/src/modules/platform-admin/`. The ONLY surface the internal-ops frontend may call (plus `/api/v1/auth/*`). Contracts: `@xfos/contracts-bff-platform-admin`. The frontend itself is IP-allowlisted in production; the API also enforces auth so a leaked URL doesn't grant access. **Renamed from the legacy `/api/v1/platform` prefix** for symmetry with the other BFFs.

| Method | Path | Description |
|---|---|---|
| GET | `/platform/tenants` | List all tenants |
| GET | `/platform/tenants/:id` | Get tenant detail |
| PATCH | `/platform/tenants/:id/status` | Activate/suspend tenant |
| POST | `/platform/onboarding/merchants` | Create merchant record |
| POST | `/platform/onboarding/:merchantId/provision` | Provision tenant |
| POST | `/platform/onboarding/:merchantId/invite` | Invite merchant owner |
| GET | `/platform/onboarding` | List all onboarding records |
| GET | `/platform/audit-logs` | Search audit logs |
| GET | `/platform/plans` | List plans |
| POST | `/platform/plans` | Create plan |

---

## Internal Domain Surfaces (`/api/v1/internal/<domain>/*`)

> **Not for browser frontends.** Per ADR-008, every domain in `backend/api/src/domains/<X>/` may expose its own HTTP controllers under `/api/v1/internal/<X>/*`. These endpoints are for:
>
> - CLI scripts and admin tooling (Retool, Metabase, Hasura)
> - Server-to-server jobs (cron, reconciliation)
> - Partner integrations and webhooks
> - Manual debugging via curl
>
> They are **NOT** for the four browser frontends. Frontends call their BFF only.

### Three walls of protection

| Wall | Mechanism | What it catches |
|---|---|---|
| 1 | URL prefix `/api/v1/internal/*` | Developer mistakes — wrong `@Controller(...)` decorator |
| 2 | `@UseGuards(InternalOnlyGuard, ServiceTokenGuard)` | Misrouted requests + missing/invalid auth |
| 3 | Network: private network, IP allowlist, or API gateway | Public exposure |

All three must be misconfigured for an internal endpoint to leak. See `backend/api/src/shared/guards/README.md`.

### Use-case shaped, not CRUD

Internal endpoints are **not** a CRUD escape hatch. Every internal route is backed by an `application/use-cases/*` use case, which means:

- Domain entity invariants run (e.g. `Order.cancel()` enforces "cannot cancel a submitted order")
- Domain events are published (the same events the BFF path publishes)
- Tenant isolation, audit logging, and idempotency all apply

**Internal APIs MUST:**
- Call `application/use-cases/*` — never skip the layer
- Go through entity methods so invariants run
- Publish the same domain events the BFF path would
- Respect tenant isolation (via service-token scope, not user JWT)

**Internal APIs MUST NOT:**
- Bypass the use case layer
- Directly call `prisma.*.update(...)` from a controller
- Skip entity invariants
- Mutate state without publishing the corresponding domain event

If a script needs to do something the use case layer doesn't allow, **add a new use case** — don't bypass.

### Example endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/internal/order/status/:token` | Same call the BFF makes, exposed for admin tools |
| POST | `/api/v1/internal/order/:id/cancel` | Calls `CancelOrderUseCase` — entity invariants apply |
| POST | `/api/v1/internal/billing/refund/:billId` | Calls `RefundBillUseCase` — publishes `BillRefundedEvent` |
| GET | `/api/v1/internal/tenant/by-slug/:slug` | Cross-tenant lookup; service-token-scoped |

Auth: `Authorization: Bearer <INTERNAL_API_SERVICE_TOKEN>`. Service tokens are issued per consumer and recorded in audit logs. **Never** sent from a browser.

---

## API Versioning Strategy

- Current version: `v1`
- Path-based versioning: `/api/v1/...`
- When breaking changes are needed: add `/api/v2/...`, deprecate v1 with sunset header
- Non-breaking changes (new fields) are backward-compatible — no version bump needed

---

## Pagination

```json
// Query params: ?page=1&limit=20
// Response includes:
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

## Filtering and Sorting

```
GET /admin/orders?status=CONFIRMED&from=2024-01-01&to=2024-01-31&sort=created_at&order=desc
GET /kitchen/tickets?status=NEW,PREPARING
GET /platform/tenants?search=noodles&status=ACTIVE
```

---

## Idempotency

For critical mutations (order creation, payment), clients may pass:
```
Idempotency-Key: {uuid}
```

The server stores the key and result for 24h. Duplicate requests with the same key return the cached response without re-executing.
