# Platform Portal — API Contracts

> **Updated for ADR-008.** These endpoints live in the **platform-admin BFF**: `backend/api/src/modules/platform-admin/`. **The base URL prefix is now `/api/v1/platform-admin/*` (renamed from `/api/v1/platform/*`)** for symmetry with the other BFFs. The BFF orchestrates calls to tenant, billing, and onboarding domain use cases via DI. The platform portal frontend imports these schemas from `@xfos/contracts-bff-platform-admin` and calls them via `frontend/platform-admin/src/lib/api/platform-admin.ts`. ESLint Rule 4 blocks importing raw domain contracts.

These are the only API endpoints the Platform Portal calls. All endpoints require a valid `PLATFORM_ADMIN` JWT. The platform surface is IP-restricted in production AND the API enforces auth so a leaked URL doesn't grant access.

**Base URL:** `https://api.xfos.app/api/v1` (BFF surface: `/platform-admin/*`, plus cross-cutting `/auth/*`)

---

## Auth

The Platform Portal uses the same auth surface as the Merchant Portal.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | Public | Login with email + password |
| POST | `/auth/refresh` | httpOnly cookie | Refresh access token |
| POST | `/auth/logout` | Bearer | Invalidate refresh token |
| GET | `/auth/me` | Bearer | Get current user + roles |

```json
// POST /auth/login — Request
{ "email": "admin@xfos.app", "password": "..." }

// Response 200
{
  "data": {
    "accessToken": "eyJ...",
    "user": { "id": "...", "email": "...", "roles": ["PLATFORM_ADMIN"] }
  }
}
```

---

## Platform Admin BFF Surface (`/api/v1/platform-admin`) — PLATFORM_ADMIN role required

> The endpoints below show paths under the legacy `/platform/*` prefix in places where they appear inside `/path` examples. **All have been renamed to `/platform-admin/*` per ADR-008** — substitute mentally where this section's body still uses the old prefix. Authoritative paths live in `xfos/contracts/bff-platform-admin/`.

### Tenant Management

| Method | Path | Description |
|---|---|---|
| GET | `/platform/tenants` | List all tenants (with filters: `?status=ACTIVE&search=noodles`) |
| GET | `/platform/tenants/:id` | Get full tenant detail |
| PATCH | `/platform/tenants/:id/status` | Activate or suspend a tenant |

```json
// GET /platform/tenants — Response 200
{
  "data": [
    {
      "id": "uuid",
      "businessName": "Mekong Kitchen",
      "status": "ACTIVE",
      "serviceModel": "DINE_IN_TABLE",
      "plan": "STARTER",
      "setupProgress": { "complete": 6, "total": 6 },
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 14 }
}

// PATCH /platform/tenants/:id/status — Request
{ "status": "SUSPENDED", "reason": "Non-payment — subscription overdue" }

// Response 200
{ "data": { "id": "uuid", "status": "SUSPENDED", "updatedAt": "..." } }
```

---

### Onboarding

| Method | Path | Description |
|---|---|---|
| GET | `/platform/onboarding` | List all merchants with onboarding progress |
| POST | `/platform/onboarding/merchants` | Create a new merchant record |
| POST | `/platform/onboarding/:merchantId/provision` | Provision tenant + setup_progress + subscription |
| POST | `/platform/onboarding/:merchantId/invite` | Send invitation email to merchant owner |

```json
// POST /platform/onboarding/merchants — Request
{
  "businessName": "Mekong Kitchen",
  "plan": "STARTER",
  "ownerEmail": "owner@mekongkitchen.com"
}

// Response 201
{
  "data": {
    "merchantId": "uuid",
    "businessName": "Mekong Kitchen",
    "status": "PENDING",
    "createdAt": "2024-01-15T10:00:00Z"
  }
}

// POST /platform/onboarding/:merchantId/provision — Request (no body required)
// Response 201
{
  "data": {
    "tenantId": "uuid",
    "status": "DRAFT",
    "setupProgress": { "complete": 0, "total": 6 }
  }
}

// POST /platform/onboarding/:merchantId/invite — Request
{ "email": "owner@mekongkitchen.com" }

// Response 201
{ "data": { "invitationId": "uuid", "status": "PENDING", "expiresAt": "2024-01-18T10:00:00Z" } }
```

---

### Audit Logs

| Method | Path | Description |
|---|---|---|
| GET | `/platform/audit-logs` | Search audit log (supports `?tenantId=&sort=created_at&order=desc`) |

```json
// GET /platform/audit-logs?tenantId={id} — Response 200
{
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "actorId": "uuid",
      "actorRole": "PLATFORM_ADMIN",
      "event": "tenant.provisioned",
      "meta": {},
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ],
  "meta": { "page": 1, "total": 45 }
}
```

---

### Plans

| Method | Path | Description |
|---|---|---|
| GET | `/platform/plans` | List all subscription plans |
| POST | `/platform/plans` | Create a new plan |

```json
// GET /platform/plans — Response 200
{
  "data": [
    { "id": "uuid", "name": "STARTER", "monthlyFee": "29.00", "currency": "USD" },
    { "id": "uuid", "name": "GROWTH", "monthlyFee": "79.00", "currency": "USD" }
  ]
}
```

---

### Setup Progress Recovery

| Method | Path | Description |
|---|---|---|
| POST | `/platform/tenants/:id/setup-progress/recalculate` | Re-derive all setup flags from DB state (admin recovery tool) |

```json
// Response 200
{
  "data": {
    "tenantId": "uuid",
    "setupProgress": {
      "profileComplete": true,
      "serviceModelSet": true,
      "menuComplete": true,
      "translationsComplete": true,
      "qrCreated": true,
      "goLiveReady": true,
      "complete": 6,
      "total": 6
    }
  }
}
```

---

## Key Error Codes

| Code | Status | When |
|---|---|---|
| `TENANT_NOT_FOUND` | 404 | Tenant ID does not exist |
| `MERCHANT_ALREADY_PROVISIONED` | 409 | Provision called twice |
| `INVITATION_ALREADY_SENT` | 409 | Active invitation already exists |
| `INVALID_STATUS_TRANSITION` | 422 | e.g. ARCHIVED → ACTIVE not allowed |
| `UNAUTHORIZED` | 401 | Missing or expired Bearer token |
| `FORBIDDEN` | 403 | Caller does not have `PLATFORM_ADMIN` role |

---

## No WebSocket Events

The Platform Portal has no real-time requirements at MVP. It polls for data on page load and on user action. WebSocket connections are only for the Kitchen App.
