# Kitchen App — API Contracts

> **Updated for ADR-008.** These endpoints live in the **kitchen BFF**: `backend/api/src/modules/kitchen/`. The BFF orchestrates calls to the kitchen domain (`domains/kitchen`) and the order domain (`domains/order`) via DI. The kitchen frontend imports these schemas from `@xfos/contracts-bff-kitchen` and calls them via `frontend/kitchen/src/lib/api/kitchen.ts`. ESLint Rule 4 in `.eslintrc.cjs` blocks importing raw domain contracts.

The kitchen app is used by authenticated kitchen staff (KITCHEN_STAFF role). It is real-time first — WebSocket is the primary channel for new tickets, scoped to room `tenant_{tenantId}`.

**Base URL:** `https://api.xfos.app/api/v1` (BFF surface: `/kitchen/*`, plus cross-cutting `/auth/*`)

All requests to protected endpoints require `Authorization: Bearer {accessToken}`. The access token is obtained via `POST /auth/login` and rotated via `POST /auth/refresh`. Tokens are stored in memory (never localStorage) and refreshed automatically on 401.

---

## 1. Authentication

### POST /auth/login

Authenticates a kitchen staff member and returns an access token.

- **Auth:** None (public)
- **Rate limit:** 5 attempts per 15 minutes per IP

**Request body:**
```json
{
  "email": "kitchen@restaurant.com",
  "password": "..."
}
```

**Response 200:**
```json
{
  "data": {
    "accessToken": "eyJ...",
    "user": {
      "id": "uuid",
      "email": "kitchen@restaurant.com",
      "roles": ["KITCHEN_STAFF"],
      "tenantId": "uuid"
    }
  }
}
```

> The refresh token is set as an `httpOnly`, `SameSite=Strict` cookie scoped to `/api/v1/auth/refresh`. The kitchen app does not need to handle it explicitly — it is sent automatically by the browser on refresh calls.

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 401 | `AUTH_INVALID_CREDENTIALS` | Wrong email or password (generic — no user enumeration) |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many failed attempts |

---

### POST /auth/refresh

Exchanges the httpOnly refresh token cookie for a new access token.

- **Auth:** httpOnly cookie (sent automatically)

**Request body:** none

**Response 200:**
```json
{
  "data": {
    "accessToken": "eyJ..."
  }
}
```

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 401 | `AUTH_REFRESH_INVALID` | Refresh token is expired, revoked, or missing |

---

### POST /auth/logout

Invalidates the current refresh token. The kitchen app calls this on explicit logout or when the device is unregistered.

- **Auth:** `Bearer {accessToken}`

**Request body:** none

**Response 200:**
```json
{
  "data": { "success": true }
}
```

---

## 2. Fetch Active Tickets on Load

### GET /kitchen/tickets

Returns the active ticket queue for the authenticated staff member's tenant. Called on app mount and on WebSocket reconnect to hydrate the board.

- **Auth:** `Bearer {accessToken}` — `KITCHEN_STAFF` role or above
- **Tenant scope:** Enforced server-side from JWT `tenantId` claim

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `status` | string | all active | Comma-separated filter: `NEW`, `PREPARING`, `READY` |

**Example:** `GET /kitchen/tickets?status=NEW,PREPARING`

**Response 200:**
```json
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
        "createdAt": "2026-03-27T09:00:00Z"
      }
    ]
  }
}
```

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 401 | `AUTH_TOKEN_INVALID` | Missing or expired access token |
| 403 | `FORBIDDEN` | Role insufficient |

---

## 3. Pending Cash Orders

### GET /kitchen/pending-cash

Returns all orders for this tenant with `billStatus = PENDING_PAYMENT` and `paymentMethod = CASH`. Called on app mount and on WebSocket reconnect to hydrate the Pending Cash section.

- **Auth:** `Bearer {accessToken}` — `KITCHEN_STAFF` role or above

**Response 200:**
```json
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
        "submittedAt": "2026-03-27T09:00:00Z"
      }
    ]
  }
}
```

---

## 4. Ticket Status Transitions

### PATCH /kitchen/tickets/:id/status

Updates a kitchen ticket's status. Valid forward transitions depend on the
ticket's `serviceModel`:

- `STALL_KIOSK`:    `NEW → PREPARING → READY → COMPLETED`
- `DINE_IN_TABLE`:  `NEW → PREPARING → READY → SERVED`

Backward transitions are rejected. `CANCELLED` is **not** a valid target via
this endpoint — cancellation flows through the domain `CancelTicketCommand`
triggered by upstream order voiding (no kitchen-staff cancel button in MVP).

- **Auth:** `Bearer {accessToken}` — `KITCHEN_STAFF` role or above
- **Tenant scope:** Server validates that `ticket.tenantId === jwt.tenantId`

**Path params:**

| Param | Type | Description |
|---|---|---|
| `id` | UUID | Kitchen ticket ID |

**Request body:**
```json
{
  "status": "PREPARING"
}
```

Valid `status` values: `PREPARING` | `READY` | `COMPLETED` | `SERVED`

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "ticketNumber": "T-007",
    "status": "PREPARING",
    "startedAt": "2026-03-27T09:05:00Z",
    "updatedAt": "2026-03-27T09:05:00Z"
  }
}
```

> On success, the server emits `ticket.updated` via WebSocket to all clients in `room: tenant_{id}`, including the storefront status page for the customer.

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 400 | `INVALID_STATUS_TRANSITION` | e.g. attempting `READY → NEW`, or `SERVED` for `STALL_KIOSK` |
| 404 | `TICKET_NOT_FOUND` | Ticket does not exist or belongs to another tenant |
| 409 | `TICKET_ALREADY_COMPLETED` | Ticket is already in a terminal state (`COMPLETED`, `SERVED`, or `CANCELLED`) |

---

## 5. Cash Payment Confirmation

### POST /billing/bills/:billId/confirm-cash

Confirms that cash has been physically collected from the customer. This is the action that moves a cash order from `PENDING_PAYMENT` into the kitchen queue.

> This endpoint is NOT callable from the customer storefront. It requires an authenticated staff token.

- **Auth:** `Bearer {accessToken}` — `KITCHEN_STAFF` role or above
- **Tenant scope:** Server asserts `bill.tenantId === jwt.tenantId`. Returns 404 (not 403) if the bill belongs to another tenant.

**Path params:**

| Param | Type | Description |
|---|---|---|
| `billId` | UUID | From the Pending Cash entry |

**Request body:** none (or empty object)

**Response 200:**
```json
{
  "data": {
    "billId": "uuid",
    "status": "PAID",
    "confirmedAt": "2026-03-27T09:10:00Z",
    "confirmedBy": "uuid"
  }
}
```

> On success, the server:
> 1. Marks the bill as `PAID`
> 2. Creates the kitchen ticket (status `NEW`)
> 3. Emits `ticket.new` to the tenant room
> 4. Emits `cash.confirmed` to the tenant room (removes entry from Pending Cash section)

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 404 | `BILL_NOT_FOUND` | Unknown `billId` or belongs to another tenant |
| 409 | `BILL_ALREADY_CONFIRMED` | Cash already confirmed for this bill |
| 409 | `BILL_NOT_CASH` | Bill's payment method is not `CASH` |

---

## 6. Get Current User

### GET /auth/me

Returns the authenticated user's profile and roles. Used to verify session on app load.

- **Auth:** `Bearer {accessToken}`

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "email": "kitchen@restaurant.com",
    "roles": ["KITCHEN_STAFF"],
    "tenantId": "uuid"
  }
}
```

---

## WebSocket — Events the Kitchen App Listens To

The kitchen app connects to the WebSocket server on mount and joins the tenant room using the `tenantId` from the JWT claims.

**Connection:**
```
wss://api.storefront.app/ws
Authorization: Bearer {accessToken}
// Server extracts tenantId from JWT and adds client to room: tenant_{tenantId}
```

On WebSocket reconnect: re-fetch `GET /kitchen/tickets?status=NEW,PREPARING` and `GET /kitchen/pending-cash` to rehydrate state before relying on incremental events.

---

### Event: `ticket.new`

Emitted when a new kitchen ticket is created. The kitchen app adds the ticket to the `NEW` column.

```json
{
  "event": "ticket.new",
  "data": {
    "id": "uuid",
    "ticketNumber": "T-008",
    "orderNumber": "ORD-0043",
    "status": "NEW",
    "tableRef": "T5",
    "serviceModel": "DINE_IN_TABLE",
    "items": [
      { "name": "Beef Lok Lak", "quantity": 2, "notes": "" },
      { "name": "Iced Coffee", "quantity": 1, "notes": "less sweet" }
    ],
    "createdAt": "2026-03-27T09:00:00Z"
  }
}
```

---

### Event: `ticket.updated`

Emitted on every status transition. The kitchen app moves the ticket to the appropriate column.

```json
{
  "event": "ticket.updated",
  "data": {
    "id": "uuid",
    "ticketNumber": "T-007",
    "orderNumber": "ORD-0042",
    "status": "PREPARING",
    "updatedAt": "2026-03-27T09:05:00Z"
  }
}
```

---

### Event: `staff.callRequested`

Emitted when a dine-in customer taps "Call Staff" on the storefront. The kitchen app shows an alert banner with table reference and reason.

```json
{
  "event": "staff.callRequested",
  "data": {
    "alertId": "uuid",
    "sessionId": "uuid",
    "tableRef": "T5",
    "reason": "REQUEST_BILL",
    "requestedAt": "2026-03-27T09:15:00Z"
  }
}
```

> The kitchen app dismisses this alert by user action (tap to dismiss). There is no server-side dismiss endpoint in MVP — dismiss is local UI state only. // inferred

---

### Event: `cash.pending`

Emitted when a cash order is placed and is waiting for staff confirmation at the counter.

```json
{
  "event": "cash.pending",
  "data": {
    "orderId": "uuid",
    "billId": "uuid",
    "orderNumber": "ORD-0042",
    "total": "12.50",
    "currency": "USD",
    "items": [
      { "name": "Beef Lok Lak", "quantity": 2 },
      { "name": "Iced Coffee", "quantity": 1 }
    ],
    "submittedAt": "2026-03-27T09:00:00Z"
  }
}
```

---

### Event: `cash.confirmed`

Emitted after a staff member confirms cash receipt. The kitchen app removes the entry from the Pending Cash section. (The `ticket.new` event arrives separately to add the ticket to the board.)

```json
{
  "event": "cash.confirmed",
  "data": {
    "orderId": "uuid",
    "billId": "uuid",
    "confirmedAt": "2026-03-27T09:10:00Z"
  }
}
```
