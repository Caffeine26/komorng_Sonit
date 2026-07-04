# 04 — Sequence Diagrams

> **Updated for ADR-008.** Browser frontends call their BFF (`/api/v1/<bff>/*`) only. The BFF use case orchestrates calls to domain use cases via DI (NOT via HTTP between modules). The diagrams below show "API" as the BFF entry point; "Order Service / Billing Service / Kitchen Service" are domain use cases invoked from the BFF use case via DI.
>
> Translation cheat sheet:
> - `SF -> API: POST /orders` ⇒ `frontend → POST /api/v1/storefront/orders → SubmitStorefrontOrderUseCase`
> - `API -> OS: createOrder()` ⇒ `SubmitStorefrontOrderUseCase.execute() → SubmitOrderUseCase.execute()` (DI call, in-process)
> - `API -> BS: createBill()` ⇒ same BFF use case calls `CreateBillUseCase` next
> - `OS -> KS: order.confirmed event` ⇒ `EventPublisher.publish('order.submitted')` → kitchen domain handler → `CreateKitchenTicketUseCase`

## Flow 1 — Kiosk Order with ABA QR Payment

```mermaid
sequenceDiagram
    actor C as Customer
    participant SF as Storefront
    participant API as API
    participant OS as Order Service
    participant BS as Billing Service
    participant Q as BullMQ (Redis-backed)
    participant ABA as ABA Gateway
    participant KS as Kitchen Service
    participant WS as WebSocket

    C->>SF: Scan QR code
    SF->>API: GET /storefront/context/{token}
    API-->>SF: { tenantId, serviceModel: STALL_KIOSK, menu }

    C->>SF: Browse menu, add items to cart
    C->>SF: Tap "Place Order"

    SF->>API: POST /orders { tenantId, items, sessionId }
    API->>OS: createOrder()
    OS->>OS: Validate items, snapshot prices
    OS-->>API: order { id, status: PENDING_PAYMENT }

    API->>BS: createBill({ orderId, tenantId })
    BS-->>API: bill { id, amount, status: UNPAID }
    API-->>SF: { orderId, billId, amount, paymentMethods }

    C->>SF: Select ABA QR payment
    SF->>API: POST /billing/bills/{billId}/pay { method: ABA_QR }
    API->>BS: createPaymentAttempt()
    BS->>ABA: initiate QR payment request
    ABA-->>BS: { qrCode, deeplink, expiresAt }
    BS-->>API: { paymentAttemptId, qrCode, status: PENDING }
    API-->>SF: QR code to display

    C->>SF: Scan ABA QR with banking app
    ABA->>API: POST /webhooks/aba/payment-callback
    API->>BS: handlePaymentCallback({ success: true })
    BS->>BS: Mark attempt SUCCEEDED
    BS->>BS: Mark bill PAID
    BS->>OS: confirmOrderPayment({ orderId })
    OS->>OS: Update order status: CONFIRMED
    BS->>Q: enqueue create-kitchen-ticket { orderId, tenantId, serviceModel: STALL_KIOSK }
    Q->>KS: worker picks up job (durable, retries)
    KS->>KS: Create ticket { status: NEW }
    KS->>WS: emit('ticket.new', ticket) → room: tenant_{id}
    WS-->>SF: WebSocket: ticket.new

    API-->>C: Order confirmed ✓
```

---

## Flow 2 — Dine-In Order (Pay After Service)

```mermaid
sequenceDiagram
    actor C as Customer
    participant SF as Storefront
    participant API as API
    participant OS as Order Service
    participant BS as Billing Service
    participant Q as BullMQ (Redis-backed)
    participant KS as Kitchen Service
    participant WS as WebSocket
    actor ST as Staff

    C->>SF: Scan table QR code
    SF->>API: GET /storefront/context/{token}
    API-->>SF: { tenantId, serviceModel: DINE_IN_TABLE, tableId: "T5" }

    C->>SF: Browse and add items
    C->>SF: Tap "Submit Order"

    SF->>API: POST /orders { tenantId, tableId, items }
    API->>OS: createOrder()
    OS->>OS: Validate, snapshot prices
    OS-->>API: { orderId, status: SUBMITTED }

    Note over BS: Bill for this table already exists or is created now
    API->>BS: getOrCreateBill({ tenantId, tableId })
    BS-->>API: { billId, status: UNPAID }

    API->>BS: attachOrderToBill({ billId, orderId })
    BS-->>API: { billId, runningTotal }

    OS->>Q: enqueue create-kitchen-ticket { orderId, tenantId, serviceModel: DINE_IN_TABLE }
    Q->>KS: worker picks up job (durable, retries)
    KS->>KS: Create ticket { status: NEW }
    KS->>WS: emit('ticket.new', ticket) → room: tenant_{id}
    API-->>SF: Order submitted ✓ (no payment required now)

    Note over C,KS: Customer may add more rounds
    C->>SF: Add more items (second round)
    SF->>API: POST /orders { tenantId, tableId, items }
    API->>OS: createOrder() — second order
    API->>BS: attachOrderToBill({ billId, orderId2 })

    Note over ST,BS: At end of meal, staff settles bill
    ST->>API: GET /billing/bills/{billId}
    API->>BS: getBill()
    BS-->>ST: { billId, orders: [...], totalAmount, status: UNPAID }

    ST->>API: POST /billing/bills/{billId}/pay { method: CASH }
    API->>BS: recordCashPayment()
    BS->>BS: Create payment record
    BS->>BS: Mark bill PAID (pending staff confirmation)
    ST->>API: POST /billing/bills/{billId}/confirm-cash
    BS->>BS: Mark payment CONFIRMED
    API-->>ST: Payment recorded ✓
```

---

## Flow 3 — Kitchen Ticket Lifecycle

```mermaid
sequenceDiagram
    participant OS as Order Service
    participant Q as BullMQ (Redis-backed)
    participant KS as Kitchen Service
    participant WS as WebSocket
    actor KS_STAFF as Kitchen Staff (App)

    OS->>Q: enqueue create-kitchen-ticket { orderId, tenantId, serviceModel }
    Q->>KS: worker picks up job (durable, retries)
    KS->>KS: Insert ticket { status: NEW }
    KS->>WS: emit('ticket.new', ticket) → room: tenant_{id}
    WS->>KS_STAFF: Push new ticket notification

    KS_STAFF->>KS_STAFF: See ticket in NEW column
    KS_STAFF->>KS: PATCH /kitchen/tickets/{id} { status: PREPARING }
    KS->>KS: Update ticket status
    KS->>KS: Log event: status_changed (NEW → PREPARING)
    KS->>WS: emit('ticket.updated', ticket)
    WS->>KS_STAFF: Move ticket to PREPARING column

    Note over KS_STAFF: Food is prepared
    KS_STAFF->>KS: PATCH /kitchen/tickets/{id} { status: READY }
    KS->>KS: Update ticket status
    KS->>KS: Log event: status_changed (PREPARING → READY)
    KS->>WS: emit('ticket.updated', ticket)
    WS->>KS_STAFF: Move ticket to READY column

    Note over KS_STAFF: Food handed to customer
    KS_STAFF->>KS: PATCH /kitchen/tickets/{id} { status: COMPLETED }
    KS->>KS: Update ticket status + set completedAt
    KS->>WS: emit('ticket.updated', ticket)
    WS->>KS_STAFF: Remove from active queue
```

---

## Flow 4 — Merchant Onboarding (Sales-Assisted)

```mermaid
sequenceDiagram
    actor SALES as Sales/Ops Team
    participant PA as Platform Admin
    participant OB as Onboarding Service
    participant TS as Tenant Service
    participant AUTH as Auth Service
    actor MERCHANT as Merchant Owner

    SALES->>PA: Create merchant record
    PA->>OB: POST /admin/onboarding/merchants { name, plan, email }
    OB->>OB: Create merchant record (status: PENDING)
    OB-->>PA: { merchantId }

    SALES->>PA: Confirm commercial agreement
    PA->>OB: POST /admin/onboarding/{merchantId}/provision
    OB->>TS: createTenant({ merchantId, config })
    TS->>TS: Create tenant record (status: DRAFT)
    TS-->>OB: { tenantId }
    OB->>OB: Update provisioning status: SUCCEEDED
    OB->>OB: Create setup progress record
    OB-->>PA: { tenantId, setupProgress }

    SALES->>PA: Invite merchant owner
    PA->>OB: POST /admin/onboarding/{merchantId}/invite { email }
    OB->>AUTH: createInvitation({ email, tenantId, role: OWNER })
    AUTH->>AUTH: Generate invite token
    AUTH->>AUTH: Send invitation email
    OB-->>PA: Invitation sent ✓

    MERCHANT->>AUTH: Click invite link → POST /auth/accept-invite
    AUTH->>AUTH: Validate token, create user
    AUTH->>AUTH: Assign OWNER role for tenant
    AUTH->>TS: activateTenant({ tenantId })
    TS->>TS: Update tenant status: ACTIVE
    AUTH-->>MERCHANT: Access granted → redirect to admin portal

    MERCHANT->>MERCHANT: Complete setup (menu, QR, payments)
    OB->>OB: Track setup progress milestones
    OB->>OB: Mark setup: READY_TO_GO_LIVE when all complete
```

---

## Flow 5 — Authentication and Token Refresh

```mermaid
sequenceDiagram
    actor U as User
    participant APP as Frontend App
    participant AUTH as Auth Service
    participant API as Protected API

    U->>APP: Submit login form
    APP->>AUTH: POST /auth/login { email, password }
    AUTH->>AUTH: Verify credentials
    AUTH->>AUTH: Generate accessToken (15min) + refreshToken (7d)
    AUTH-->>APP: { accessToken, refreshToken }
    APP->>APP: Store accessToken in memory
    APP->>APP: Store refreshToken in httpOnly cookie

    APP->>API: GET /resource [Authorization: Bearer {accessToken}]
    API->>API: Verify JWT, extract { userId, tenantId, role }
    API-->>APP: 200 OK { data }

    Note over APP,API: Access token expires
    APP->>API: GET /resource [expired token]
    API-->>APP: 401 Unauthorized

    APP->>AUTH: POST /auth/refresh [httpOnly cookie: refreshToken]
    AUTH->>AUTH: Validate refresh token
    AUTH->>AUTH: Issue new accessToken
    AUTH-->>APP: { accessToken }
    APP->>APP: Update in-memory token

    APP->>API: GET /resource [new accessToken]
    API-->>APP: 200 OK { data }
```

---

## Flow 7 — Kiosk Order with Cash Payment (Counter Confirmation)

> **MVP flow.** Per the PRD §1.3 acceptance checklist, a kiosk cash order reaches the kitchen only after counter staff tap "Confirm Cash Received" in the kitchen app. The order is held in `PENDING_PAYMENT` state (synthetic API label: `PENDING_CASH`) until confirmation; the kitchen ticket is created after `confirmCashPayment` succeeds.

```mermaid
sequenceDiagram
    actor C as Customer
    participant SF as Storefront
    participant API as API
    participant OS as Order Service
    participant BS as Billing Service
    participant Q as BullMQ (Redis-backed)
    participant KS as Kitchen Service
    participant WS as WebSocket
    actor STAFF as Counter Staff (Kitchen App)

    C->>SF: Scan QR code
    SF->>API: GET /storefront/context/{token}
    API-->>SF: { tenantId, serviceModel: STALL_KIOSK, paymentMethods: [CASH, ABA_QR] }

    C->>SF: Browse menu, add items to cart
    C->>SF: Tap "Place Order"

    SF->>API: POST /orders { tenantId, items, sessionId }
    API->>OS: createOrder()
    OS->>OS: Validate items, snapshot prices
    OS-->>API: { orderId, status: PENDING_PAYMENT }

    API->>BS: createBill({ orderId, tenantId })
    BS-->>API: { billId, amount, status: UNPAID }
    API-->>SF: { orderId, billId, amount, paymentMethods }

    C->>SF: Select "Pay at Counter (Cash)"
    SF->>API: POST /billing/bills/{billId}/pay { method: CASH }
    API->>BS: createPaymentAttempt({ method: CASH })
    BS->>BS: Create payment attempt { status: PENDING }
    BS->>BS: Bill status → PENDING_PAYMENT
    BS->>WS: emit('cash.pending', { orderId, billId, total, items }) → room: tenant_{id}
    API-->>SF: { orderNumber: "ORD-0042", total: "12.50", status: PENDING_CASH }

    SF-->>C: "Order #0042 — Pay $12.50 at the counter. Show this screen to staff."

    Note over STAFF: Kitchen App — Pending Cash section receives push
    WS->>STAFF: New entry: "ORD-0042 | $12.50 | Beef Lok Lak ×2, Iced Coffee ×1"

    Note over C,STAFF: Customer approaches counter, shows screen. Staff collects cash.

    STAFF->>API: POST /billing/bills/{billId}/confirm-cash
    API->>BS: confirmCashPayment({ billId, staffId })
    BS->>BS: Payment attempt → SUCCEEDED
    BS->>BS: Bill → PAID
    BS->>OS: confirmOrderPayment({ orderId })
    OS->>OS: Order → CONFIRMED
    BS->>Q: enqueue create-kitchen-ticket { orderId, tenantId, serviceModel: STALL_KIOSK, method: CASH }
    Q->>KS: worker picks up job (durable, retries)
    KS->>KS: Insert ticket { status: NEW }
    KS->>WS: emit('ticket.new', ticket) → room: tenant_{id}
    BS->>WS: emit('cash.confirmed', { orderId }) → room: tenant_{id}

    WS->>STAFF: Pending Cash entry removed + ticket appears in NEW column
```

**Key rules:**
- `create-kitchen-ticket` job is only enqueued after `confirmCashPayment` succeeds — never before
- `POST /billing/bills/{billId}/confirm-cash` requires authenticated staff (KITCHEN_STAFF role or above); it is not callable from the customer storefront
- If staff closes the app or disconnects before confirming, the order stays in `PENDING_PAYMENT` — it will reappear in the Pending Cash section on reconnect via a REST fetch on mount
- On confirm failure (network/server error), the Kitchen App must show a clear error and allow retry — never silently mark as confirmed

**Schema note — `status: PENDING_CASH` in the API response:**
`PENDING_CASH` is **NOT** a value in the `orders.status` DB column. It is a synthetic label
computed by the API response layer from two DB fields:
- `order.status = 'PENDING_PAYMENT'`
- `payment.method = 'CASH'`

Do **not** add `PENDING_CASH_PAYMENT` to the `orders` CHECK constraint for this feature.
The existing `PENDING_PAYMENT` status covers this state. The API controller derives the
label: `if (order.status === 'PENDING_PAYMENT' && payment?.method === 'CASH') return 'PENDING_CASH'`.

---

## Flow 8 — Order Status Page (Kiosk Same-Visit Polling)

Customer lands on `/o/{orderToken}` after order confirmation, or taps a link from the "Your orders this visit" banner on a subsequent QR scan.

```mermaid
sequenceDiagram
    actor C as Customer
    participant SP as Status Page (/o/token)
    participant API as API
    participant OS as Order Service
    participant KS as Kitchen Service

    C->>SP: Navigate to /o/{orderToken}\n(from confirmation link or banner)
    SP->>API: GET /storefront/orders/status/{orderToken}
    API->>OS: findOrderByToken(orderToken)
    OS->>KS: getKitchenTicketStatus(orderId)
    KS-->>OS: { kitchenStatus: 'NEW' }
    OS-->>API: { orderNumber, status, kitchenStatus, items, submittedAt }
    API-->>SP: 200 { data }
    SP-->>C: Show order summary + status bar\nNEW → PREPARING → READY

    Note over SP: Page polls every 15-20 seconds
    loop Poll until READY or COMPLETED
        SP->>API: GET /storefront/orders/status/{orderToken}
        API-->>SP: { kitchenStatus: 'PREPARING' }
        SP-->>C: Update status bar
    end

    SP->>API: GET /storefront/orders/status/{orderToken}
    API-->>SP: { kitchenStatus: 'READY' }
    SP-->>C: "Your order is ready!" — stop polling
```

**Rules:**
- Poll only while `kitchenStatus` is `NEW` or `PREPARING` — stop on `READY`, `COMPLETED`, or after 90 minutes
- No auth required; token provides access control
- On network error, show "Checking status…" and retry silently — do not show error to customer

---

## Flow 9 — Kiosk Same-Visit Banner (localStorage Recovery)

Customer re-scans the same kiosk QR after having already ordered during the same visit.

```mermaid
sequenceDiagram
    actor C as Customer
    participant SF as Storefront
    participant LS as localStorage
    participant API as API

    Note over C,LS: Customer already ordered ORD-0042 earlier this visit
    C->>SF: Re-scan kiosk QR → /store/{token}
    SF->>LS: Read orders for tenantSlug "panda-stall"
    LS-->>SF: [{ orderToken, orderNumber: "ORD-0042", submittedAt }]
    SF->>SF: Filter: drop entries older than 3-4h TTL
    SF-->>C: Render "Your orders this visit" banner\nabove the menu — ORD-0042 · [View status]

    C->>SF: Tap "View status" on ORD-0042
    SF->>SF: Navigate to /o/{orderToken}

    Note over C,SF: Customer orders again (second round)
    C->>SF: Browse menu → Checkout
    SF->>API: POST /storefront/orders
    API-->>SF: { orderNumber: "ORD-0043", orderToken: "new_token" }
    SF->>LS: Append ORD-0043 to orders array for "panda-stall"\n(replace oldest if cap of 5 reached)
    SF-->>C: Show confirmation for ORD-0043\nBanner on next re-scan will show both orders
```

---

## Flow 6 — QR Context Resolution

```mermaid
sequenceDiagram
    actor C as Customer
    participant SF as Storefront
    participant TS as Tenant Service

    C->>SF: Navigate to /store/{qrToken}
    SF->>TS: GET /storefront/context/{qrToken}
    TS->>TS: Look up QR context by token

    alt QR is valid
        TS->>TS: Check tenant is ACTIVE
        TS->>TS: Resolve table/location if applicable
        TS-->>SF: { tenantId, tenantName, theme, serviceModel, tableId?, locale }
        SF->>SF: Set tenant context in session
        SF-->>C: Render storefront
    else QR is invalid or expired
        TS-->>SF: 404 { code: QR_INVALID }
        SF-->>C: "This QR code is invalid or expired" error page
    else Tenant is suspended
        TS-->>SF: 403 { code: TENANT_SUSPENDED }
        SF-->>C: "This restaurant is not currently available" page
    end
```

---

## File Mapping Reference

This section maps each sequence-diagram flow above to the exact files in the `xfos/` scaffold. Use it as a scaffold-walker when you are new to the codebase — every flow touches these files in order.

### Flow A — Browse Menu (`GET /api/v1/storefront/context/:slug`)

**System overview:**

```mermaid
flowchart TD
    A[Customer] --> B[Next.js Storefront]
    B --> C[Storefront BFF - NestJS]
    C --> D[Tenant Domain]
    C --> E[Catalog Domain]
    D --> I[(Database)]
    E --> I
```

**Frontend:**

```
xfos/frontend/storefront/src/app/[locale]/(qr)/[tenantSlug]/page.tsx
xfos/frontend/storefront/src/features/menu-browse/hooks/useMenu.ts
xfos/frontend/storefront/src/features/menu-browse/api.ts        ← composes lib/api/storefront.ts
xfos/frontend/storefront/src/lib/api/storefront.ts              ← THE BFF client (only file calling apiFetch)
```

**Backend:**

```
xfos/backend/api/src/modules/storefront/api/storefront.controller.ts
xfos/backend/api/src/modules/storefront/application/use-cases/get-storefront-context.use-case.ts

xfos/backend/api/src/domains/tenant/application/queries/get-tenant-by-slug.query.ts
xfos/backend/api/src/domains/catalog/application/queries/get-public-menu.query.ts
```

**Key code — the BFF use case:**

```ts
// modules/storefront/application/use-cases/get-storefront-context.use-case.ts
async execute({ slug }: { slug: string }) {
  const tenant = await this.tenantPort.getBySlug(slug)
  const menu   = await this.catalogPort.getMenu(tenant.id)
  return { tenant, menu }
}
```

The BFF use case calls domain ports via DI — never over HTTP. The domain owns "what a menu is." The BFF owns "what the storefront needs to render it."

---

### Flow B — Submit Order + Payment (`POST /api/v1/storefront/orders`)

**System overview:**

```mermaid
flowchart TD
    A[User adds items] --> B[Checkout]
    B --> C[POST /storefront/orders]
    C --> D[StorefrontController]
    D --> E[SubmitOrderUseCase  -- BFF]

    E --> F[TenantPort.getBySlug]
    E --> G[CatalogPort.validateItems]
    E --> H[OrderPort.createOrder]
    E --> I[BillingPort.createBill]
    E --> J[BillingPort.initiatePayment]

    J --> K[Payment Gateway]

    E --> L[Return orderToken + paymentUrl]
    L --> B
    B --> M[Redirect or Confirm]
```

**Frontend:**

```
xfos/frontend/storefront/src/features/cart/use-cart.hook.ts
xfos/frontend/storefront/src/features/checkout/use-submit-order.hook.ts
xfos/frontend/storefront/src/features/checkout/api.ts
xfos/frontend/storefront/src/lib/api/storefront.ts            ← only file calling apiFetch
```

**Backend — BFF module (orchestrator):**

```
xfos/backend/api/src/modules/storefront/api/storefront.controller.ts
xfos/backend/api/src/modules/storefront/application/use-cases/submit-order.use-case.ts
xfos/backend/api/src/modules/storefront/application/dto/submit-order.dto.ts
```

**Backend — Domain modules (the truth):**

```
xfos/backend/api/src/domains/order/application/use-cases/create-order.use-case.ts
xfos/backend/api/src/domains/billing/application/use-cases/create-bill.use-case.ts
xfos/backend/api/src/domains/billing/application/use-cases/initiate-payment.use-case.ts
xfos/backend/api/src/domains/catalog/application/queries/validate-items.query.ts
```

**Key code — the BFF submit-order use case:**

```ts
// modules/storefront/application/use-cases/submit-order.use-case.ts
async execute(input: SubmitOrderInput) {
  const tenant = await this.tenantPort.getBySlug(input.tenantSlug)
  const items  = await this.catalogPort.validateItems(input.items)

  const order  = await this.orderPort.createOrder({
    tenantId: tenant.id,
    items,
  })

  const bill   = await this.billingPort.createBill({
    orderId: order.id,
    amount:  order.total,
  })

  let payment = null
  if (input.paymentMethod !== 'CASH') {
    payment = await this.billingPort.initiatePayment({ billId: bill.id })
  }

  return {
    orderToken: order.token,
    paymentUrl: payment?.url ?? null,
  }
}
```

---

### Critical Rules — What Every Flow Must Obey

**Idempotency.** Every `POST` that creates state must accept an `Idempotency-Key` header:

```http
POST /api/v1/storefront/orders
Idempotency-Key: 8f2a7b6e-...
```

Replay of the same key returns the same result, never a duplicate.

**No rollback across domains.** If `createBill` succeeds and `initiatePayment` fails, the order and bill **stay**. The customer retries payment. Do not cascade-delete — it corrupts audit trails.

**Ownership — who decides what:**

| Logic | Owner |
|---|---|
| Pricing | Order domain |
| Payment | Billing domain |
| Menu validation | Catalog domain |
| Ticket creation | Kitchen domain |
| Tenant resolution | Tenant domain |

**The mental model (every feature fits this):**

```mermaid
flowchart LR
    A[Frontend] --> B[BFF Controller]
    B --> C[BFF Use Case]
    C --> D[Domain Use Case / Port]
    D --> E[(Database)]

    E --> D
    D --> C
    C --> B
    B --> A
```

**Change impact — where to edit:**

| Change type | What you edit |
|---|---|
| UI wording / layout | Frontend only |
| Menu business rule (e.g. "items off at 10pm") | `domains/catalog/*` |
| A new API call or response shape | BFF use case + contract |
| A new database field | Prisma schema → domain entity → repository → use case → contract |
| Payment provider behavior | `domains/billing/*` |

---

### What to Build Next — Your First Endpoint

If this is your first backend PR, implement these two BFF endpoints first. They exercise every layer without touching payments:

1. `GET /api/v1/storefront/context/:slug` — the menu-browse flow (Flow A above)
2. `POST /api/v1/storefront/orders` — the submit-order flow (Flow B above, MVP path: `paymentMethod = CASH`, no payment gateway call)

Test them with retries, duplicate requests (idempotency), and a failing tenant (404). This is where the architecture becomes real — not theoretical.
