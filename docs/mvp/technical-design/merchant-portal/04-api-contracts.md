# Merchant Portal — API Contracts

> **Updated for ADR-008.** These endpoints live in the **merchant admin BFF**: `backend/api/src/modules/admin/`. The BFF orchestrates calls to catalog, order, billing, tenant, and onboarding domain use cases via DI. The merchant portal frontend imports these schemas from `@xfos/contracts-bff-admin` and calls them via `frontend/admin/src/lib/api/admin.ts`. ESLint Rule 4 in `.eslintrc.cjs` blocks importing raw domain contracts.

All endpoints require TENANT_OWNER or TENANT_MANAGER role. Tenant scope is enforced server-side via JWT claims.

**Base URL:** `https://api.xfos.app/api/v1` (BFF surface: `/admin/*`, plus cross-cutting `/auth/*`)

**Auth pattern:** All protected endpoints require `Authorization: Bearer {accessToken}`. The `tenantId` is always read from the JWT — never from the request body or path. A request that passes a `tenantId` in the body that differs from the JWT is rejected.

**Role notes:**
- `TENANT_OWNER` — full access to all admin endpoints
- `TENANT_MANAGER` — access to menu, QR, and settings; no access to team management or billing

---

## 1. Authentication

### POST /auth/login

- **Auth:** None (public)
- **Rate limit:** 5 attempts per 15 minutes per IP

**Request body:**
```json
{
  "email": "owner@restaurant.com",
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
      "email": "owner@restaurant.com",
      "roles": ["TENANT_OWNER"],
      "tenantId": "uuid"
    }
  }
}
```

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 401 | `AUTH_INVALID_CREDENTIALS` | Wrong email or password |

---

### POST /auth/refresh

- **Auth:** httpOnly cookie (sent automatically)

**Response 200:**
```json
{
  "data": { "accessToken": "eyJ..." }
}
```

---

### POST /auth/logout

- **Auth:** `Bearer {accessToken}`

**Response 200:**
```json
{
  "data": { "success": true }
}
```

---

### GET /auth/me

Returns the current user's profile and roles. Called on portal load to confirm session validity.

- **Auth:** `Bearer {accessToken}`

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "email": "owner@restaurant.com",
    "roles": ["TENANT_OWNER"],
    "tenantId": "uuid"
  }
}
```

---

## 2. Tenant Settings

### GET /admin/tenant

Fetches the tenant's public profile and configuration.

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "name": "Koh Pich Noodles",
    "slug": "koh-pich-noodles",
    "status": "ACTIVE",
    "defaultLocale": "km",
    "logoUrl": "https://cdn.storefront.app/logos/uuid.png",
    "createdAt": "2026-01-10T00:00:00Z"
  }
}
```

---

### PATCH /admin/tenant

Updates the tenant profile (name, locale, logo).

- **Auth:** `Bearer {accessToken}` — `TENANT_OWNER` only

**Request body:**
```json
{
  "name": "Koh Pich Noodles Updated",
  "defaultLocale": "en",
  "logoUrl": "https://cdn.storefront.app/logos/new.png"
}
```

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "name": "Koh Pich Noodles Updated",
    "defaultLocale": "en",
    "updatedAt": "2026-03-27T10:00:00Z"
  }
}
```

---

### GET /admin/tenant/settings

Fetches payment, service model, and display settings.

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Response 200:**
```json
{
  "data": {
    "serviceModel": "STALL_KIOSK",
    "payTiming": "PAY_BEFORE",
    "paymentMethods": {
      "cash": true,
      "abaQr": true
    },
    "theme": {
      "primaryColor": "#E86A3A"
    }
  }
}
```

---

### PATCH /admin/tenant/settings

Updates payment and service configuration.

- **Auth:** `Bearer {accessToken}` — `TENANT_OWNER` only

**Request body:**
```json
{
  "payTiming": "PAY_BEFORE",
  "paymentMethods": {
    "cash": true,
    "abaQr": false
  },
  "theme": {
    "primaryColor": "#3A7AE8"
  }
}
```

**Response 200:**
```json
{
  "data": {
    "payTiming": "PAY_BEFORE",
    "paymentMethods": { "cash": true, "abaQr": false },
    "updatedAt": "2026-03-27T10:00:00Z"
  }
}
```

---

### GET /admin/tenant/setup-progress

Returns the merchant's onboarding setup checklist status.

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Response 200:**
```json
{
  "data": {
    "overall": "IN_PROGRESS",
    "steps": {
      "profileComplete": true,
      "menuAdded": true,
      "qrGenerated": false,
      "paymentConfigured": false,
      "teamInvited": false
    },
    "completedAt": null
  }
}
```

---

## 3. Menu — Categories

### GET /admin/catalog/categories

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Response 200:**
```json
{
  "data": {
    "categories": [
      {
        "id": "uuid",
        "sortOrder": 1,
        "isVisible": true,
        "itemCount": 5,
        "translations": [
          { "locale": "en", "name": "Main Dishes" },
          { "locale": "km", "name": "មុខម្ហូបចម្បង" }
        ]
      }
    ]
  }
}
```

---

### POST /admin/catalog/categories

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Request body:**
```json
{
  "sortOrder": 1,
  "isVisible": true,
  "translations": [
    { "locale": "en", "name": "Main Dishes" },
    { "locale": "km", "name": "មុខម្ហូបចម្បង" }
  ]
}
```

**Response 201:**
```json
{
  "data": {
    "id": "uuid",
    "sortOrder": 1,
    "isVisible": true,
    "translations": [...]
  }
}
```

---

### PATCH /admin/catalog/categories/:id

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Request body (partial):**
```json
{
  "isVisible": false,
  "translations": [
    { "locale": "en", "name": "Mains" }
  ]
}
```

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "isVisible": false,
    "updatedAt": "2026-03-27T10:00:00Z"
  }
}
```

---

### DELETE /admin/catalog/categories/:id

Soft-deletes the category. Items in the category are not deleted but become uncategorised.

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Response 200:**
```json
{
  "data": { "id": "uuid", "deletedAt": "2026-03-27T10:00:00Z" }
}
```

---

### PUT /admin/catalog/categories/reorder

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Request body:**
```json
{
  "order": ["uuid-cat-1", "uuid-cat-3", "uuid-cat-2"]
}
```

**Response 200:**
```json
{
  "data": { "success": true }
}
```

---

## 4. Menu — Items

### GET /admin/catalog/items

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above
- **Query params:** `?categoryId=uuid&isAvailable=true&page=1&limit=20`

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "categoryId": "uuid",
      "basePrice": "8.50",
      "currency": "USD",
      "isAvailable": true,
      "isVisible": true,
      "sortOrder": 1,
      "imageUrl": "https://cdn.storefront.app/items/uuid.jpg",
      "translations": [
        { "locale": "en", "name": "Beef Lok Lak", "description": "Stir-fried beef..." },
        { "locale": "km", "name": "លោកឡាក់", "description": "សាច់គោចៀន..." }
      ]
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

---

### POST /admin/catalog/items

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Request body:**
```json
{
  "categoryId": "uuid",
  "basePrice": "8.50",
  "currency": "USD",
  "isAvailable": true,
  "isVisible": true,
  "sortOrder": 3,
  "translations": [
    { "locale": "en", "name": "Beef Lok Lak", "description": "Stir-fried beef..." },
    { "locale": "km", "name": "លោកឡាក់", "description": "សាច់គោចៀន..." }
  ]
}
```

**Response 201:**
```json
{
  "data": {
    "id": "uuid",
    "categoryId": "uuid",
    "basePrice": "8.50",
    "isAvailable": true,
    "translations": [...]
  }
}
```

---

### GET /admin/catalog/items/:id

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Response 200:** Same shape as a single item from the list.

---

### PATCH /admin/catalog/items/:id

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Request body (partial):**
```json
{
  "basePrice": "9.00",
  "translations": [
    { "locale": "en", "name": "Beef Lok Lak (Updated)", "description": "..." }
  ]
}
```

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "basePrice": "9.00",
    "updatedAt": "2026-03-27T10:00:00Z"
  }
}
```

---

### DELETE /admin/catalog/items/:id

Soft-deletes an item. It is removed from the live menu immediately.

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Response 200:**
```json
{
  "data": { "id": "uuid", "deletedAt": "2026-03-27T10:00:00Z" }
}
```

---

### PUT /admin/catalog/items/:id/availability

Toggles item availability on/off. Unavailable items are hidden from the storefront menu.

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Request body:**
```json
{
  "isAvailable": false
}
```

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "isAvailable": false,
    "updatedAt": "2026-03-27T10:00:00Z"
  }
}
```

---

## 5. QR Codes

### GET /admin/qr

Lists all QR contexts for the tenant.

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "label": "Table 5",
      "token": "abc123...",
      "tableRef": "T5",
      "serviceModel": "DINE_IN_TABLE",
      "isActive": true,
      "scanCount": 42,
      "createdAt": "2026-01-15T00:00:00Z"
    }
  ]
}
```

---

### POST /admin/qr

Generates a new QR context.

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Request body:**
```json
{
  "label": "Table 5",
  "tableRef": "T5",
  "serviceModel": "DINE_IN_TABLE"
}
```

**Response 201:**
```json
{
  "data": {
    "id": "uuid",
    "label": "Table 5",
    "token": "abc123...",
    "qrImageUrl": "https://cdn.storefront.app/qr/uuid.png",
    "isActive": true,
    "createdAt": "2026-03-27T10:00:00Z"
  }
}
```

---

### GET /admin/qr/:id

Returns full QR detail including image URL.

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Response 200:** Same shape as a single QR entry from list, plus `qrImageUrl`.

---

### PATCH /admin/qr/:id

Updates the QR label or tableRef.

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Request body:**
```json
{
  "label": "Counter 1"
}
```

**Response 200:**
```json
{
  "data": { "id": "uuid", "label": "Counter 1", "updatedAt": "2026-03-27T10:00:00Z" }
}
```

---

### DELETE /admin/qr/:id/deactivate

Deactivates a QR code. Customers scanning it will see the "QR invalid" error page.

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above

**Response 200:**
```json
{
  "data": { "id": "uuid", "isActive": false, "deactivatedAt": "2026-03-27T10:00:00Z" }
}
```

---

### GET /admin/qr/:id/download

Returns the QR image as a PNG binary for download.

- **Auth:** `Bearer {accessToken}` — `TENANT_MANAGER` or above
- **Response:** `Content-Type: image/png`

---

## 6. Orders

### GET /admin/orders

Lists orders for the tenant with optional filters.

- **Auth:** `Bearer {accessToken}` — `TENANT_OWNER` only
- **Query params:** `?status=CONFIRMED&from=2026-01-01&to=2026-03-31&sort=created_at&order=desc&page=1&limit=20`

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "orderNumber": "ORD-0042",
      "status": "CONFIRMED",
      "total": "12.50",
      "currency": "USD",
      "paymentMethod": "ABA_QR",
      "tableRef": "T5",
      "itemCount": 3,
      "createdAt": "2026-03-27T09:00:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 }
}
```

---

### GET /admin/orders/:id

Returns full order detail including items, bill, and payment status.

- **Auth:** `Bearer {accessToken}` — `TENANT_OWNER` only

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "orderNumber": "ORD-0042",
    "status": "CONFIRMED",
    "total": "12.50",
    "currency": "USD",
    "billId": "uuid",
    "billStatus": "PAID",
    "paymentMethod": "ABA_QR",
    "tableRef": "T5",
    "items": [
      { "name": "Beef Lok Lak", "quantity": 2, "unitPrice": "8.50", "notes": "" },
      { "name": "Iced Coffee", "quantity": 1, "unitPrice": "2.00", "notes": "less sweet" }
    ],
    "createdAt": "2026-03-27T09:00:00Z",
    "confirmedAt": "2026-03-27T09:02:00Z"
  }
}
```

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 404 | `ORDER_NOT_FOUND` | Order does not exist or belongs to another tenant |

---

## 7. Team Management

### GET /admin/team

Lists all team members for the tenant and their roles.

- **Auth:** `Bearer {accessToken}` — `TENANT_OWNER` only

**Response 200:**
```json
{
  "data": [
    {
      "userId": "uuid",
      "email": "manager@restaurant.com",
      "role": "TENANT_MANAGER",
      "status": "ACTIVE",
      "joinedAt": "2026-01-20T00:00:00Z"
    }
  ]
}
```

---

### POST /admin/team/invite

Invites a new team member. Sends an email with a one-time accept link (72-hour TTL).

- **Auth:** `Bearer {accessToken}` — `TENANT_OWNER` only

**Request body:**
```json
{
  "email": "kitchen@restaurant.com",
  "role": "KITCHEN_STAFF"
}
```

Valid `role` values: `TENANT_MANAGER` | `KITCHEN_STAFF`

**Response 201:**
```json
{
  "data": {
    "inviteId": "uuid",
    "email": "kitchen@restaurant.com",
    "role": "KITCHEN_STAFF",
    "expiresAt": "2026-03-30T10:00:00Z"
  }
}
```

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 409 | `INVITE_ALREADY_PENDING` | Active invite already exists for this email // inferred |
| 409 | `USER_ALREADY_MEMBER` | Email already has a role in this tenant // inferred |

---

### PATCH /admin/team/:userId/role

Updates an existing team member's role.

- **Auth:** `Bearer {accessToken}` — `TENANT_OWNER` only

**Request body:**
```json
{
  "role": "TENANT_MANAGER"
}
```

**Response 200:**
```json
{
  "data": {
    "userId": "uuid",
    "role": "TENANT_MANAGER",
    "updatedAt": "2026-03-27T10:00:00Z"
  }
}
```

> On role downgrade, the server revokes the user's active refresh tokens. Their next token refresh will fail and force re-login.

---

### DELETE /admin/team/:userId

Removes a team member's access to the tenant.

- **Auth:** `Bearer {accessToken}` — `TENANT_OWNER` only

**Response 200:**
```json
{
  "data": { "userId": "uuid", "removedAt": "2026-03-27T10:00:00Z" }
}
```

> On removal, the server revokes the user's active refresh tokens for this tenant.

**Key error codes:**

| HTTP | Code | When |
|---|---|---|
| 403 | `CANNOT_REMOVE_OWNER` | Attempt to remove the last TENANT_OWNER // inferred |
| 404 | `USER_NOT_FOUND` | User not a member of this tenant |

---

## 8. Dashboard — Summary Stats

### GET /admin/dashboard/summary // inferred

Returns aggregated stats for the merchant portal dashboard.

- **Auth:** `Bearer {accessToken}` — `TENANT_OWNER` only

**Query params:** `?from=2026-03-01&to=2026-03-31` // inferred

**Response 200:**
```json
{
  "data": {
    "period": {
      "from": "2026-03-01",
      "to": "2026-03-31"
    },
    "totalOrders": 312,
    "totalRevenue": "2840.50",
    "currency": "USD",
    "averageOrderValue": "9.10",
    "topItems": [
      { "name": "Beef Lok Lak", "quantity": 154 },
      { "name": "Iced Coffee", "quantity": 120 }
    ],
    "ordersByStatus": {
      "CONFIRMED": 305,
      "CANCELLED": 7
    }
  }
}
```
