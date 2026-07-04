# Storefront App — API Contracts

> **Updated for ADR-008.** These endpoints live in the **storefront BFF**: `backend/api/src/modules/storefront/`. The customer is a guest — tenant context is resolved at the BFF entry from the URL slug (no JWT, no account). The BFF use case (`SubmitStorefrontOrderUseCase`, `GetStorefrontContextUseCase`, etc.) calls the underlying domain use cases via DI — the storefront frontend never sees raw domain shapes.
>
> **Frontend usage:** The storefront frontend imports these schemas from `@xfos/contracts-bff-storefront` and calls them via `frontend/storefront/src/lib/api/storefront.ts`. ESLint Rule 4 blocks importing raw domain contracts (`@xfos/contracts-order`, etc.).

These are the only API endpoints the storefront app calls. The customer is a guest — no auth token required for most endpoints.

**Base URL:** `https://api.xfos.app/api/v1` (BFF surface: `/storefront/*`)

All responses follow the standard envelope:
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "...", "message": "..." } }
```

---

## 1. QR Context Resolution

### GET /storefront/context/:qrToken

Resolves the QR token scanned by the customer into full tenant context. Called immediately on storefront load before anything else is rendered.

- **Auth:** None (public)
- **Rate limit:** 60 req/min per IP

**Path params:**

| Param | Type | Description |
|---|---|---|
| `qrToken` | string | Opaque token printed on the QR code |

**Response 200:**
```json
{
  "data": {
    "tenantId": "clx_t_kohpich_noodles",
    "tenantName": "Koh Pich Noodles",
    "serviceModel": "STALL_KIOSK",
    "payTiming": "PAY_BEFORE",
    "defaultLocale": "km",
    "theme": {
      "primaryColor": "#E86A3A",
      "logoUrl": "https://cdn.storefront.app/logos/tenant-uuid.png"
    },
    "paymentMethods": ["CASH", "ABA_QR"],
    "tableRef": null
  }
}
```

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 404 | `QR_INVALID` | Token does not exist or has been deactivated |
| 403 | `TENANT_SUSPENDED` | Tenant exists but is suspended or archived |

---

## 2. Menu Loading

### GET /storefront/:tenantId/menu

Fetches the full menu — all categories and items — in all available locales. Response is served from Redis cache (5-min TTL) in production.

- **Auth:** None (public)
- **Cache:** Redis, 5-min TTL; falls back to Postgres

**Path params:**

| Param | Type | Description |
|---|---|---|
| `tenantId` | UUID | Resolved from the QR context step |

**Response 200:**
```json
{
  "data": {
    "tenantId": "uuid",
    "categories": [
      {
        "id": "uuid",
        "sortOrder": 1,
        "translations": [
          { "locale": "en", "name": "Main Dishes" },
          { "locale": "km", "name": "មុខម្ហូបចម្បង" }
        ],
        "items": [
          {
            "id": "uuid",
            "basePrice": "8.50",
            "currency": "USD",
            "isAvailable": true,
            "imageUrl": "https://cdn.storefront.app/items/uuid.jpg",
            "translations": [
              { "locale": "en", "name": "Beef Lok Lak", "description": "Stir-fried beef..." },
              { "locale": "km", "name": "លោកឡាក់", "description": "សាច់គោចៀន..." }
            ]
          }
        ]
      }
    ]
  }
}
```

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 404 | `TENANT_NOT_FOUND` | Unknown tenantId |
| 404 | `MENU_NOT_FOUND` | Tenant has no published menu yet |

---

## 3. Session Management

### POST /storefront/:tenantId/sessions

Creates or resumes an order session. Called before order submission. The returned `sessionId` is required when submitting an order.

- **Auth:** None (public)

**Path params:**

| Param | Type | Description |
|---|---|---|
| `tenantId` | UUID | Resolved from QR context |

**Request body:**
```json
{
  "sessionId": "uuid",     // optional — pass to resume an existing session
  "tableRef": "T5",        // optional — for DINE_IN_TABLE service model
  "qrToken": "string"      // the original QR token; used server-side for validation
}
```

**Response 200/201:**
```json
{
  "data": {
    "sessionId": "uuid",
    "tenantId": "uuid",
    "tableRef": "T5",
    "serviceModel": "DINE_IN_TABLE",
    "status": "ACTIVE",
    "createdAt": "2026-03-27T08:00:00Z"
  }
}
```

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 404 | `SESSION_NOT_FOUND` | Provided `sessionId` does not exist |
| 409 | `SESSION_CLOSED` | Session was already closed or expired |

---

## 4. Order Submission

### POST /storefront/orders

Submits the customer's cart as an order. This is the primary write operation of the storefront.

> **Security:** `tenantId` in the request body is a client hint only. The server fetches the session by `sessionId`, asserts `session.tenantId === req.body.tenantId`, and returns `403 TENANT_MISMATCH` if they differ. All subsequent DB operations use `session.tenantId` — never the client-supplied value.

- **Auth:** None (public)
- **Idempotency:** Supports `Idempotency-Key: {uuid}` header; duplicate keys return the cached response for 24h

**Request body:**
```json
{
  "tenantId": "uuid",
  "sessionId": "uuid",
  "items": [
    { "menuItemId": "uuid", "quantity": 2, "notes": "no sugar" },
    { "menuItemId": "uuid", "quantity": 1, "notes": "" }
  ]
}
```

**Response 201:**
```json
{
  "data": {
    "orderId": "uuid",
    "orderNumber": "ORD-0042",
    "orderToken": "a3f9c1d2e4b7820f",
    "status": "PENDING_PAYMENT",
    "total": "12.50",
    "currency": "USD",
    "billId": "uuid"
  }
}
```

> `orderToken` is a 32-hex-char opaque token (128-bit entropy). Store it in `localStorage` under `orders:{tenantSlug}` with a 5-hour TTL. It is the key for the order status page at `/o/{orderToken}`.

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing required fields or malformed request |
| 403 | `TENANT_MISMATCH` | `sessionId` belongs to a different tenant |
| 404 | `SESSION_NOT_FOUND` | `sessionId` not found |
| 409 | `ITEM_UNAVAILABLE` | One or more items are no longer available |
| 422 | `EMPTY_ORDER` | Items array is empty |

---

## 5. Order Status Polling

### GET /storefront/orders/status/:orderToken

Used by the order status page (`/o/{orderToken}`) to poll kitchen progress. Returns only safe public fields — never exposes internal IDs or billing details.

- **Auth:** None (public)
- **Rate limit:** 30 req/min per IP (enumeration protection)
- **Poll interval:** Every 15–20 seconds. Stop polling when `kitchenStatus` is `READY`, `COMPLETED`, or after 90 minutes.

**Path params:**

| Param | Type | Description |
|---|---|---|
| `orderToken` | string | 32-hex opaque token from order submission |

**Response 200:**
```json
{
  "data": {
    "orderNumber": "ORD-0042",
    "orderToken": "a3f9c1d2e4b7820f",
    "status": "SUBMITTED",
    "kitchenStatus": "PREPARING",
    "items": [
      { "name": "Beef Lok Lak", "quantity": 2 },
      { "name": "Iced Coffee", "quantity": 1 }
    ],
    "tableRef": null,
    "submittedAt": "2026-03-25T12:34:00Z"
  }
}
```

`kitchenStatus` values: `NEW` | `PREPARING` | `READY` | `COMPLETED`

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 404 | `ORDER_NOT_FOUND` | Token is unknown or expired |

---

## 6. Payment Initiation (ABA QR / Cash)

### POST /billing/bills/:billId/pay

Initiates a payment attempt for a bill. Called after order submission when the tenant requires payment before fulfillment.

- **Auth:** None (public)

**Path params:**

| Param | Type | Description |
|---|---|---|
| `billId` | UUID | Returned from `POST /storefront/orders` |

**Request body:**
```json
{
  "method": "ABA_QR",
  "returnUrl": "https://storefront.app/store/{qrToken}/confirmation"
}
```

`method` values: `ABA_QR` | `CASH`

**Response 200 — ABA QR:**
```json
{
  "data": {
    "paymentAttemptId": "uuid",
    "method": "ABA_QR",
    "status": "PENDING",
    "qrCode": "base64string...",
    "deeplink": "aba://pay?...",
    "expiresAt": "2026-03-27T10:45:00Z"
  }
}
```

**Response 200 — Cash:**
```json
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

> For cash orders, the storefront shows a "Pay at the counter" confirmation screen. No further polling is needed — the kitchen will be notified once counter staff confirm receipt via the kitchen app.

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 404 | `BILL_NOT_FOUND` | `billId` unknown (returns 404 even if it belongs to another tenant) |
| 409 | `BILL_ALREADY_PAID` | Bill has already been settled |
| 422 | `PAYMENT_METHOD_NOT_ENABLED` | Tenant does not accept this payment method |

---

## 7. Bill Payment Status Polling

### GET /billing/bills/:billId/payment-status

Polls the payment status of a bill. Used by the storefront to detect when an ABA QR payment has been confirmed by the gateway webhook.

- **Auth:** None (public)
- **Poll interval:** Every 3 seconds while ABA QR payment is pending. Stop on `PAID` or on user navigation away.

**Path params:**

| Param | Type | Description |
|---|---|---|
| `billId` | UUID | From order submission response |

**Response 200:**
```json
{
  "data": {
    "billId": "uuid",
    "status": "PENDING",
    "method": "ABA_QR",
    "paidAt": null
  }
}
```

`status` values: `UNPAID` | `PENDING` | `PAID` | `FAILED`

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 404 | `BILL_NOT_FOUND` | Unknown `billId` |

---

## 8. Call Staff

### POST /storefront/sessions/:sessionId/call-staff

Sends a "call staff" alert to the kitchen/counter app. Used in dine-in service models.

- **Auth:** None (public) // inferred — session-scoped action, no JWT in storefront

**Path params:**

| Param | Type | Description |
|---|---|---|
| `sessionId` | UUID | Active session ID |

**Request body:**
```json
{
  "reason": "REQUEST_BILL"
}
```

`reason` values (// inferred): `REQUEST_BILL` | `NEED_ASSISTANCE` | `OTHER`

**Response 201:**
```json
{
  "data": {
    "alertId": "uuid",
    "sessionId": "uuid",
    "reason": "REQUEST_BILL",
    "tableRef": "T5",
    "createdAt": "2026-03-27T09:15:00Z"
  }
}
```

> On success, the server emits `staff.callRequested` via WebSocket to the tenant's kitchen room. The kitchen app shows an alert banner.

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 404 | `SESSION_NOT_FOUND` | Unknown or expired session |
| 429 | `CALL_STAFF_RATE_LIMITED` | Too many call-staff requests from this session // inferred |

---

## 9. Telegram Opt-In Token Generation

### POST /storefront/sessions/:sessionId/telegram-connect

Generates a one-time Telegram connect token displayed on the post-confirmation screen. The customer taps the generated deep link to open the bot and tap START.

- **Auth:** None (public) // inferred
- **Token TTL:** 10 minutes (stored in Redis)

**Path params:**

| Param | Type | Description |
|---|---|---|
| `sessionId` | UUID | The active session tied to the confirmed order |

**Request body:**
```json
{
  "orderId": "uuid"
}
```

**Response 201:**
```json
{
  "data": {
    "connectToken": "uuid",
    "deeplink": "https://t.me/{botname}?start={connectToken}",
    "expiresAt": "2026-03-27T09:25:00Z"
  }
}
```

> After the customer taps START in Telegram, the bot webhook resolves the `connectToken` to the order and tenant, creates or matches the `customer` record by `chat_id`, and upserts the `customer_merchant_relationship`. The token is deleted from Redis on first use.

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 404 | `SESSION_NOT_FOUND` | Unknown session |
| 404 | `ORDER_NOT_FOUND` | `orderId` not found on this session // inferred |

---

## WebSocket — Events the Storefront Listens To

The storefront connects to the WebSocket server and joins the tenant room after the QR context step.

**Connection:**
```
wss://api.storefront.app/ws
// Room: joined automatically by the server on connection with tenantId context
```

### Event: `ticket.new`

Emitted when a new kitchen ticket is created for this tenant. The storefront uses this to update the order status page for the customer's current order.

```json
{
  "event": "ticket.new",
  "data": {
    "ticketId": "uuid",
    "orderId": "uuid",
    "orderNumber": "ORD-0042",
    "ticketNumber": "T-007",
    "status": "NEW",
    "tableRef": "T5",
    "items": [
      { "name": "Beef Lok Lak", "quantity": 2 },
      { "name": "Iced Coffee", "quantity": 1 }
    ],
    "createdAt": "2026-03-27T09:00:00Z"
  }
}
```

### Event: `ticket.updated`

Emitted on every kitchen ticket status transition. The storefront matches on `orderId` (from `localStorage`) to update the status bar on the order status page.

```json
{
  "event": "ticket.updated",
  "data": {
    "ticketId": "uuid",
    "orderId": "uuid",
    "orderNumber": "ORD-0042",
    "status": "READY",
    "updatedAt": "2026-03-27T09:12:00Z"
  }
}
```

`status` progression: `NEW` → `PREPARING` → `READY` → `COMPLETED`

> The storefront stops listening for a given order once it receives `READY` or `COMPLETED`, or after 90 minutes from order submission.

### Event: `cash.confirmed`

Emitted when counter staff confirm a cash payment. The storefront uses this to transition the customer's confirmation screen from "waiting for cash" to "order confirmed."

```json
{
  "event": "cash.confirmed",
  "data": {
    "orderId": "uuid",
    "orderNumber": "ORD-0042",
    "confirmedAt": "2026-03-27T09:05:00Z"
  }
}
```
