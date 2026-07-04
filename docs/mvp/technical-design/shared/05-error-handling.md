# 08 — Error Handling

> **Updated for ADR-008.** The error contract is the **same shape** for both BFF surfaces (`/api/v1/<bff>/*`) and internal domain surfaces (`/api/v1/internal/<domain>/*`). BFF use cases catch `DomainError` exceptions thrown by domain entities/use cases and translate them into stable HTTP error responses for the frontend. The frontend imports `BffErrorSchema` from its own BFF contract package (`@xfos/contracts-bff-<app>`) — never from a domain contract. See ADR-008 in `09-decisions-adrs.md`.

## Principles

1. **Never return a vague error.** Every error has a machine-readable code.
2. **Never leak internals.** Stack traces, SQL errors, and internal paths stay in logs, not responses.
3. **Never claim success when it didn't happen.** A payment failure is never silently swallowed.
4. **All errors are logged** with enough context to reproduce the issue.
5. **BFF projects domain errors.** Domain code throws structured `DomainError` exceptions; the BFF use case maps them to BFF error codes that match the frontend's contract. Domain error codes do NOT leak to the frontend unchanged.

---

## Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "Menu item not found",
    "details": {},
    "requestId": "req_abc123"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `code` | string | Machine-readable error code (see catalog below) |
| `message` | string | Human-readable message (English, safe to show in dev, not prod) |
| `details` | object | Optional: field-level validation errors, context |
| `requestId` | string | Trace ID for support lookup |

---

## HTTP Status Code Usage

| Status | When to Use |
|---|---|
| `200` | Success (GET, PATCH) |
| `201` | Created (POST) |
| `204` | Success, no body (DELETE) |
| `400` | Bad request — validation error, invalid input |
| `401` | Unauthenticated — missing or expired token |
| `403` | Unauthorized — authenticated but lacks permission |
| `404` | Resource not found |
| `409` | Conflict — duplicate, invalid state transition |
| `422` | Unprocessable — passes validation but violates business rule |
| `429` | Rate limited |
| `500` | Unexpected server error |
| `503` | Service unavailable (maintenance, DB down) |

---

## Error Code Catalog

### Auth Errors

| Code | HTTP | Description |
|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `AUTH_TOKEN_EXPIRED` | 401 | Access token is expired |
| `AUTH_TOKEN_INVALID` | 401 | Token malformed or tampered |
| `AUTH_REFRESH_INVALID` | 401 | Refresh token invalid or expired |
| `AUTH_FORBIDDEN` | 403 | Role does not permit this action |
| `AUTH_INVITE_INVALID` | 400 | Invitation token malformed |
| `AUTH_INVITE_EXPIRED` | 410 | Invitation token expired (72h TTL) |
| `AUTH_INVITE_USED` | 409 | Invitation token already accepted |

### Tenant Errors

| Code | HTTP | Description |
|---|---|---|
| `TENANT_NOT_FOUND` | 404 | Tenant does not exist |
| `TENANT_SUSPENDED` | 403 | Tenant is suspended — cannot operate |
| `TENANT_NOT_ACTIVE` | 403 | Tenant not yet activated |
| `TENANT_SETUP_INCOMPLETE` | 422 | Required setup not done |

### QR / Storefront Errors

| Code | HTTP | Description |
|---|---|---|
| `QR_INVALID` | 404 | QR token not found or inactive |
| `QR_EXPIRED` | 410 | QR token has expired |
| `SESSION_NOT_FOUND` | 404 | Order session not found |
| `SESSION_CLOSED` | 409 | Session already closed |

### Catalog Errors

| Code | HTTP | Description |
|---|---|---|
| `CATEGORY_NOT_FOUND` | 404 | Category not found |
| `ITEM_NOT_FOUND` | 404 | Menu item not found |
| `ITEM_UNAVAILABLE` | 422 | Item is not available for ordering |
| `TRANSLATION_MISSING` | 422 | Required translation not provided |

### Order Errors

| Code | HTTP | Description |
|---|---|---|
| `ORDER_NOT_FOUND` | 404 | Order not found |
| `ORDER_EMPTY` | 400 | Order submitted with no items |
| `ORDER_INVALID_ITEM` | 400 | One or more items are invalid/unavailable |
| `ORDER_ALREADY_CONFIRMED` | 409 | Order already confirmed, cannot modify |
| `ORDER_CANCELLED` | 409 | Order was cancelled |

### Billing / Payment Errors

| Code | HTTP | Description |
|---|---|---|
| `BILL_NOT_FOUND` | 404 | Bill not found |
| `BILL_ALREADY_PAID` | 409 | Bill is already settled |
| `BILL_VOIDED` | 409 | Bill has been voided |
| `PAYMENT_METHOD_NOT_ENABLED` | 422 | Payment method not enabled for tenant |
| `PAYMENT_FAILED` | 422 | Payment attempt failed |
| `PAYMENT_EXPIRED` | 409 | Payment QR/link has expired |
| `PAYMENT_PENDING` | 409 | A payment attempt is already pending |
| `PAYMENT_NOT_FOUND` | 404 | Payment attempt not found |

### Kitchen Errors

| Code | HTTP | Description |
|---|---|---|
| `TICKET_NOT_FOUND` | 404 | Kitchen ticket not found |
| `INVALID_STATUS_TRANSITION` | 409 | Status transition not allowed |

### Validation Errors

| Code | HTTP | Description |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Input failed schema validation |
| `INVALID_PAGINATION` | 400 | Invalid page/limit params |
| `DUPLICATE_RESOURCE` | 409 | Resource already exists |

### System Errors

| Code | HTTP | Description |
|---|---|---|
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | System temporarily unavailable |
| `RATE_LIMITED` | 429 | Too many requests |

---

## Rate Limiting (NestJS)

All rate limits return `RATE_LIMITED` (429) with a `Retry-After` header.

| Endpoint | Limit | Key | Reason |
|---|---|---|---|
| `POST /auth/login` | 5 requests / 15 min | Per IP | Brute force protection |
| `GET /storefront/context/:token` | 100 requests / min | Per IP | Token enumeration protection |
| `POST /storefront/orders` | 10 submissions / hour | Per `order_session_id` | Flood protection (not per IP — restaurant guest WiFi NATs all customers to one IP) |
| `POST /auth/forgot-password` | 3 requests / hour | Per IP | Email spam prevention |

**Important:** `/storefront/orders` uses `order_session_id` from the request body as the rate limit key, not IP address. Per-IP rate limiting would incorrectly throttle all customers sharing restaurant guest WiFi.

---

## ITEM_UNAVAILABLE in Order Submission

When items become unavailable between cart creation and order submission, return:

```json
{
  "success": false,
  "error": {
    "code": "ITEM_UNAVAILABLE",
    "message": "Some items in your order are no longer available",
    "details": {
      "unavailableItems": [
        { "itemId": "uuid-1", "name": "Amok Fish Curry" },
        { "itemId": "uuid-2", "name": "Bai Sach Chrouk" }
      ]
    }
  }
}
```

The storefront must remove unavailable items from the cart and re-display the cart with a "Some items are now unavailable" banner before the customer can re-submit.

---

## Validation Error Detail Format

For `VALIDATION_ERROR`, include field-level detail:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "fields": [
        { "field": "items", "message": "At least one item is required" },
        { "field": "items[0].quantity", "message": "Quantity must be greater than 0" }
      ]
    }
  }
}
```

---

## Backend Error Classes

```typescript
// src/lib/errors.ts

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly httpStatus: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(details: { fields: Array<{ field: string; message: string }> }) {
    super('VALIDATION_ERROR', 'Request validation failed', 400, details);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 409);
  }
}

export class ForbiddenError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 403);
  }
}

export class BusinessRuleError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 422, details);
  }
}
```

---

## Global Error Handling (NestJS Exception Filter)

```typescript
// backend/api/src/shared/nestjs/filters/app-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from '../lib/errors';

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const requestId =
      (req.header('x-request-id') as string | undefined) ??
      (req as any).id ??
      `req_${Math.random().toString(36).slice(2, 10)}`;

    // AppError: our domain errors
    if (exception instanceof AppError) {
      return res.status(exception.httpStatus).json({
        success: false,
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details || {},
          requestId,
        },
      });
    }

    // HttpException: Nest/guards/validation pipe errors
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as any;

      return res.status(status).json({
        success: false,
        error: {
          code: body?.code ?? 'HTTP_EXCEPTION',
          message: body?.message ?? exception.message,
          details: body?.details ?? {},
          requestId,
        },
      });
    }

    // Fallback: unexpected errors
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId,
      },
    });
  }
}
```

---

## Domain Service Error Usage

```typescript
// src/domains/ordering/order.service.ts
import { NotFoundError, ValidationError, BusinessRuleError } from '../../lib/errors';

export class OrderService {
  async createOrder(params: CreateOrderParams): Promise<Order> {
    // Validate tenant exists
    const tenant = await this.tenantRepo.findById(params.tenantId);
    if (!tenant) {
      throw new NotFoundError('TENANT_NOT_FOUND', 'Tenant not found');
    }

    // Validate items are available
    const unavailableItems = await this.checkItemAvailability(params.items);
    if (unavailableItems.length > 0) {
      throw new BusinessRuleError('ORDER_INVALID_ITEM', 'Some items are unavailable', {
        unavailableItemIds: unavailableItems.map(i => i.id),
      });
    }

    // ... create order
  }
}
```

---

## Frontend Error Handling

```typescript
// packages/utils/src/api-client.ts
async function handleResponse<T>(response: Response): Promise<T> {
  const body = await response.json();

  if (!response.ok || !body.success) {
    const error = body.error;

    // Handle specific codes on the frontend
    switch (error.code) {
      case 'AUTH_TOKEN_EXPIRED':
        // trigger token refresh
        break;
      case 'TENANT_SUSPENDED':
        // redirect to suspended page
        break;
      case 'ITEM_UNAVAILABLE':
        // show "Item no longer available" toast
        break;
    }

    throw new ApiError(error.code, error.message, error.details);
  }

  return body.data as T;
}
```

---

## Never Do This

```typescript
// ❌ WRONG — generic error with no code
res.status(400).json({ message: 'Something went wrong' });

// ❌ WRONG — leaking internal error
res.status(500).json({ error: err.stack });

// ❌ WRONG — swallowing payment errors silently
try {
  await processPayment();
} catch {
  // ignore
}

// ❌ WRONG — returning 200 on failure
res.status(200).json({ success: false, error: 'Payment failed' });
// → Use 422 instead
```
