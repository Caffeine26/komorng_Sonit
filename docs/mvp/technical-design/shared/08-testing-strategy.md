# 12 — Testing

## Testing Philosophy

- **Test business behavior, not implementation details.**
- **Integration tests over unit tests** for domain services — they test the real system.
- **Do not mock the database** — use a real test DB (separate PostgreSQL instance or Docker).
- **Unit tests** for pure functions: validators, formatters, utilities.
- **E2E tests** for the most critical user flows only.

---

## Test Types and Scope

| Type | Scope | Tool | Coverage Target |
|---|---|---|---|
| Unit | Pure functions, validators | Vitest | 100% of utility/validation logic |
| Integration | Domain services + DB | Vitest + Prisma test DB | All happy paths + critical error paths |
| API | HTTP request/response | Supertest + Vitest | All endpoints: happy + error cases |
| E2E | Full user flows in browser | Playwright | 5 critical flows (see below) |
| Component | UI components | Vitest + React Testing Library | Key interactive components |

### The 5 Critical E2E Flows (Playwright)

These are the non-negotiable flows that must pass before any production deploy:

| # | Flow | Surfaces Tested | What Breaks If This Fails |
|---|---|---|---|
| **E2E-1** | **Kiosk order:** Customer scans kiosk QR → browses menu → adds items → submits order → kitchen receives ticket | Storefront + API + Kitchen App | Core value prop — ordering doesn't work |
| **E2E-2** | **Dine-in multi-round:** Customer scans table QR → orders round 1 → taps "Add more items" → orders round 2 → both orders on same kitchen session | Storefront + API | Dine-in flow broken, multi-round ordering fails |
| **E2E-3** | **Kitchen lifecycle:** Ticket in NEW → staff taps Start Preparing → PREPARING → staff taps Mark Ready → READY → staff taps Complete → removed from queue | Kitchen App + API | Kitchen workflow broken |
| **E2E-4** | **Merchant onboarding:** Accept invite → set password → complete 6-step setup → generate QR → storefront goes LIVE | Admin Portal + API + Storefront | New restaurant cannot onboard |
| **E2E-5** | **Khmer i18n:** Customer scans QR (English) → switches to Khmer mid-browse → cart preserved → places order → confirmation screen in Khmer | Storefront (i18n) | Khmer-speaking customers cannot use the product |
| **E2E-6** | **Order status page:** Customer places kiosk order → taps "Track your order" → `/o/{token}` shows NEW → staff marks PREPARING → page updates | Storefront + API + Kitchen App | Customer has no feedback on order progress |
| **E2E-7** | **Same-visit banner:** Customer orders → re-scans same QR → banner shows prior order → tap "View status" navigates to `/o/{token}` | Storefront (client-side) | Return customers see stale menu with no history |

---

## Test Infrastructure Setup

### Test Database

```yaml
# docker-compose.test.yml
services:
  postgres-test:
    image: postgres:16
    environment:
      POSTGRES_DB: platform_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"  # different port from dev
```

```typescript
// tests/setup.ts
import { execSync } from 'child_process';
import { prisma } from '../src/lib/db';

beforeAll(async () => {
  // Run migrations against test DB
  execSync('DATABASE_URL=postgres://test:test@localhost:5433/platform_test npx prisma migrate deploy');
});

beforeEach(async () => {
  // Clean all tables between tests (order matters for FK constraints)
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.kitchenTicketEvent.deleteMany(),
    prisma.kitchenTicket.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.billOrder.deleteMany(),
    prisma.bill.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.orderSession.deleteMany(),
    prisma.menuItemTranslation.deleteMany(),
    prisma.menuItem.deleteMany(),
    prisma.menuCategoryTranslation.deleteMany(),
    prisma.menuCategory.deleteMany(),
    prisma.qrContext.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.user.deleteMany(),
    prisma.setupProgress.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.tenantSettings.deleteMany(),
    prisma.tenant.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

### Test Fixtures

```typescript
// tests/fixtures/tenant.fixture.ts
import { prisma } from '../../src/lib/db';

export async function createTestTenant(overrides = {}) {
  // Tenant identity is minimal — operational config lives on tenant_settings.
  return prisma.tenant.create({
    data: {
      slug: 'test-restaurant',
      codePrefix: 'TR',
      nameEn: 'Test Restaurant',
      nameKm: 'ភោជនីយដ្ឋានសាកល្បង',
      status: 'ACTIVE',
      settings: {
        create: {
          serviceModel: 'STALL_KIOSK',
          payTiming: 'PAY_BEFORE',
          defaultLocale: 'km',
          currency: 'USD',
        },
      },
      paymentMethods: {
        create: [
          { method: 'CASH', isEnabled: true },
        ],
      },
      ...overrides,
    },
  });
}

export async function createTestOrder(tenantId: string, sessionId: string, overrides = {}) {
  return prisma.order.create({
    data: {
      tenantId,
      sessionId,
      orderNumber: `ORD-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      orderToken: require('crypto').randomBytes(16).toString('hex'),  // REQUIRED — no DB default
      status: 'PENDING_PAYMENT',
      serviceModel: 'STALL_KIOSK',
      subtotal: 8.50,
      total: 8.50,
      currency: 'USD',
      ...overrides,
    },
  });
}

export async function createTestMenuItem(tenantId: string, categoryId: string, overrides = {}) {
  return prisma.menuItem.create({
    data: {
      tenantId,
      categoryId,
      basePrice: 8.50,
      currency: 'USD',
      isAvailable: true,
      isVisible: true,
      translations: {
        createMany: {
          data: [
            { locale: 'en', name: 'Test Item', description: 'Test description' },
            { locale: 'km', name: 'ទំនិញសាកល្បង', description: 'ការពិពណ៌នាសាកល្បង' },
          ],
        },
      },
      ...overrides,
    },
  });
}
```

---

## Unit Tests

### Validator Tests

```typescript
// tests/unit/validators/order.schema.test.ts
import { describe, it, expect } from 'vitest';
import { createOrderSchema } from '../../../src/validators/order.schema';

describe('createOrderSchema', () => {
  it('validates a valid order', () => {
    const result = createOrderSchema.safeParse({
      tenantId: 'valid-uuid',
      sessionId: 'valid-uuid',
      items: [{ menuItemId: 'valid-uuid', quantity: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty items array', () => {
    const result = createOrderSchema.safeParse({
      tenantId: 'valid-uuid',
      sessionId: 'valid-uuid',
      items: [],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('items');
  });

  it('rejects zero quantity', () => {
    const result = createOrderSchema.safeParse({
      tenantId: 'valid-uuid',
      sessionId: 'valid-uuid',
      items: [{ menuItemId: 'valid-uuid', quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });
});
```

---

## Integration Tests (Domain Services)

### Order Service Tests

```typescript
// tests/integration/ordering/order.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { OrderService } from '../../../src/domains/ordering/order.service';
import { createTestTenant, createTestMenuItem } from '../../fixtures';

describe('OrderService', () => {
  let orderService: OrderService;
  let tenant: Tenant;
  let item: MenuItem;

  beforeEach(async () => {
    orderService = new OrderService(/* real deps, real DB */);
    tenant = await createTestTenant();
    const category = await createTestCategory(tenant.id);
    item = await createTestMenuItem(tenant.id, category.id);
  });

  describe('createOrder', () => {
    it('creates an order with correct totals', async () => {
      const order = await orderService.createOrder({
        tenantId: tenant.id,
        items: [{ menuItemId: item.id, quantity: 2 }],
      });

      expect(order.status).toBe('PENDING_PAYMENT');
      expect(order.total).toBe('17.00');  // 8.50 * 2
      expect(order.orderNumber).toMatch(/^ORD-/);
    });

    it('snapshots item name and price at order time', async () => {
      const order = await orderService.createOrder({
        tenantId: tenant.id,
        items: [{ menuItemId: item.id, quantity: 1 }],
      });

      const orderItem = order.items[0];
      expect(orderItem.itemName).toBe('Test Item');
      expect(orderItem.unitPrice).toBe('8.50');

      // Changing the menu item should not affect the order
      await prisma.menuItem.update({
        where: { id: item.id },
        data: { basePrice: 99.00 },
      });

      const refetched = await orderService.getOrder(order.id);
      expect(refetched.items[0].unitPrice).toBe('8.50');  // still original price
    });

    it('throws when item is unavailable', async () => {
      await prisma.menuItem.update({
        where: { id: item.id },
        data: { isAvailable: false },
      });

      await expect(
        orderService.createOrder({
          tenantId: tenant.id,
          items: [{ menuItemId: item.id, quantity: 1 }],
        })
      ).rejects.toMatchObject({ code: 'ORDER_INVALID_ITEM' });
    });

    it('enforces tenant isolation', async () => {
      const otherTenant = await createTestTenant({ slug: 'other' });
      const otherCategory = await createTestCategory(otherTenant.id);
      const otherItem = await createTestMenuItem(otherTenant.id, otherCategory.id);

      await expect(
        orderService.createOrder({
          tenantId: tenant.id,
          items: [{ menuItemId: otherItem.id, quantity: 1 }],  // wrong tenant's item
        })
      ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND' });
    });
  });
});
```

### Billing Service Tests

```typescript
// tests/integration/billing/billing.service.test.ts
describe('BillingService — Dine-In', () => {
  it('accumulates multiple orders into one bill', async () => {
    const bill = await billingService.getOrCreateBill({ tenantId, sessionId });

    const order1 = await createTestOrder(tenantId, [{ itemId, quantity: 1 }]);
    const order2 = await createTestOrder(tenantId, [{ itemId, quantity: 2 }]);

    await billingService.attachOrder(bill.id, order1.id);
    await billingService.attachOrder(bill.id, order2.id);

    const updatedBill = await billingService.getBill(bill.id);
    expect(updatedBill.total).toBe('25.50');  // 8.50 + 17.00
    expect(updatedBill.status).toBe('UNPAID');
  });

  it('does not allow double-paying', async () => {
    const bill = await createPaidBill();

    await expect(
      billingService.initiatePayment({ billId: bill.id, method: 'CASH' })
    ).rejects.toMatchObject({ code: 'BILL_ALREADY_PAID' });
  });
});
```

---

## API Tests

```typescript
// tests/api/kitchen.api.test.ts
import request from 'supertest';
import { app } from '../../src/app';

describe('PATCH /api/v1/kitchen/tickets/:id/status', () => {
  it('updates ticket to PREPARING', async () => {
    const { ticket, token } = await setupKitchenTicket();

    const res = await request(app)
      .patch(`/api/v1/kitchen/tickets/${ticket.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PREPARING' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PREPARING');
    expect(res.body.data.startedAt).toBeTruthy();
  });

  it('rejects invalid status transition', async () => {
    const { ticket, token } = await setupKitchenTicket({ status: 'READY' });

    const res = await request(app)
      .patch(`/api/v1/kitchen/tickets/${ticket.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'NEW' });  // can't go backwards

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('rejects cross-tenant access', async () => {
    const { ticket } = await setupKitchenTicket();
    const { token: otherToken } = await setupKitchenStaff({ tenantId: 'other-tenant' });

    const res = await request(app)
      .patch(`/api/v1/kitchen/tickets/${ticket.id}/status`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ status: 'PREPARING' });

    expect(res.status).toBe(404);  // Not found — tenant isolation
  });
});
```

---

## E2E Tests (Playwright)

### Critical Flows to Cover

1. Kiosk order + ABA QR payment
2. Dine-in order submission (no immediate payment)
3. Kitchen ticket lifecycle (NEW → PREPARING → READY → COMPLETED)
4. Merchant creates menu item
5. Merchant generates QR code

```typescript
// tests/e2e/kiosk-order.spec.ts
import { test, expect } from '@playwright/test';

test('kiosk customer can place and pay for an order', async ({ page }) => {
  // Navigate via QR token
  await page.goto(`/store/${TEST_QR_TOKEN}`);
  await expect(page.locator('[data-testid="storefront-header"]')).toBeVisible();

  // Add item to cart
  await page.click('[data-testid="item-card"]:first-child button');
  await expect(page.locator('[data-testid="cart-count"]')).toHaveText('1');

  // Proceed to checkout
  await page.click('[data-testid="view-cart-btn"]');
  await page.click('[data-testid="checkout-btn"]');

  // Select payment method
  await page.click('[data-testid="payment-method-aba-qr"]');
  await page.click('[data-testid="place-order-btn"]');

  // QR code should be visible
  await expect(page.locator('[data-testid="aba-qr-code"]')).toBeVisible();
});
```

---

## Test Coverage Targets

| Domain | Integration Test Coverage |
|---|---|
| Order Service | All status transitions, tenant isolation, price snapshot, kiosk vs dine-in ticket trigger |
| Billing Service | Kiosk flow, dine-in accumulation, payment states, concurrent payment race |
| Kitchen Service | All status transitions, tenant isolation, socket reconnect state recovery |
| Auth Service | Login, token refresh, invite flow (3 error cases), role checks, refresh race condition |
| Storefront | QR resolution, context types, suspended tenant, session expiry Party A/B |
| Menu Caching | Cache hit, miss, invalidation on availability toggle, Redis-down fallback |
| Idempotency | Duplicate order submission returns same response, 24h expiry |

**Minimum for Definition of Done:** All happy paths + critical error paths covered.

---

## Missing Test Specs (Added from Eng Review)

### Invitation Error Cases

```typescript
// tests/integration/auth/invite.service.test.ts

describe('Auth — invitation flow', () => {
  it('rejects non-existent token with AUTH_INVITE_INVALID', async () => {
    await expect(authService.acceptInvite('bad-token', 'pass'))
      .rejects.toMatchObject({ code: 'AUTH_INVITE_INVALID' });
  });

  it('rejects already-used invite with AUTH_INVITE_USED', async () => {
    const { token } = await createTestInvite();
    await authService.acceptInvite(token, 'pass1'); // first use
    await expect(authService.acceptInvite(token, 'pass2'))
      .rejects.toMatchObject({ code: 'AUTH_INVITE_USED' });
  });

  it('rejects expired invite with AUTH_INVITE_EXPIRED', async () => {
    const { token } = await createTestInvite({ expiresAt: new Date(Date.now() - 1000) });
    await expect(authService.acceptInvite(token, 'pass'))
      .rejects.toMatchObject({ code: 'AUTH_INVITE_EXPIRED' });
  });
});
```

### Menu Cache Integration Tests

```typescript
// tests/integration/catalog/menu-cache.test.ts

describe('Menu cache', () => {
  it('serves menu from cache on second request', async () => {
    await request(app).get(`/storefront/${tenantId}/menu`); // populates cache
    const spy = jest.spyOn(prisma.menuCategory, 'findMany');
    await request(app).get(`/storefront/${tenantId}/menu`); // should hit cache
    expect(spy).not.toHaveBeenCalled();
  });

  it('invalidates cache when item availability is toggled', async () => {
    await request(app).get(`/storefront/${tenantId}/menu`); // populate cache
    await request(app)
      .put(`/admin/catalog/items/${item.id}/availability`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isAvailable: false });
    const spy = jest.spyOn(prisma.menuCategory, 'findMany');
    await request(app).get(`/storefront/${tenantId}/menu`); // cache should be gone
    expect(spy).toHaveBeenCalled(); // hit DB, not cache
  });

  it('falls back to Postgres when Redis is unavailable', async () => {
    jest.spyOn(redis, 'get').mockRejectedValue(new Error('Redis down'));
    jest.spyOn(redis, 'setex').mockRejectedValue(new Error('Redis down'));
    const res = await request(app).get(`/storefront/${tenantId}/menu`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined(); // menu still served
  });
});
```

### Order Session Expiry Tests

```typescript
// tests/integration/ordering/session.service.test.ts

describe('OrderSession — 4h expiry', () => {
  it('creates new session for Party B after Party A session expires', async () => {
    const sessionA = await createTestSession({
      qrContextId: qrContext.id,
      expiresAt: new Date(Date.now() - 1000), // expired
    });

    const sessionB = await sessionService.getOrCreateSession({
      tenantId: tenant.id,
      qrContextId: qrContext.id,
    });

    expect(sessionB.id).not.toBe(sessionA.id);
    expect(sessionB.status).toBe('ACTIVE');
  });

  it('reuses active session within 4h window', async () => {
    const session1 = await sessionService.getOrCreateSession({
      tenantId: tenant.id,
      qrContextId: qrContext.id,
    });
    const session2 = await sessionService.getOrCreateSession({
      tenantId: tenant.id,
      qrContextId: qrContext.id,
    });
    expect(session1.id).toBe(session2.id);
  });
});
```

### Idempotency Key Tests

```typescript
// tests/api/idempotency.test.ts

describe('Idempotency — order submission', () => {
  it('returns same response for duplicate idempotency key', async () => {
    const key = randomUUID();
    const res1 = await request(app)
      .post('/storefront/orders')
      .set('Idempotency-Key', key)
      .send(validOrderPayload);

    const res2 = await request(app)
      .post('/storefront/orders')
      .set('Idempotency-Key', key)
      .send(validOrderPayload);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res2.body.data.orderId).toBe(res1.body.data.orderId);

    // Verify only ONE order was actually created
    const orders = await prisma.order.findMany({ where: { sessionId: session.id } });
    expect(orders).toHaveLength(1);
  });
});
```

### Kiosk vs Dine-In Kitchen Ticket Trigger Tests

```typescript
// tests/integration/ordering/order.service.test.ts (additions)

describe('Kitchen ticket creation trigger', () => {
  it('does NOT create kitchen ticket immediately for KIOSK order', async () => {
    const order = await orderService.createOrder({
      ...kioskOrderParams,
      serviceModel: 'STALL_KIOSK',
    });
    const tickets = await prisma.kitchenTicket.findMany({ where: { orderId: order.id } });
    expect(tickets).toHaveLength(0); // ticket created only after payment
  });

  it('creates kitchen ticket immediately for DINE_IN order', async () => {
    const order = await orderService.createOrder({
      ...dineInOrderParams,
      serviceModel: 'DINE_IN_TABLE',
    });
    const tickets = await prisma.kitchenTicket.findMany({ where: { orderId: order.id } });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].status).toBe('NEW');
  });
});
```

### Concurrent Bill Payment Race Condition Test

```typescript
// tests/integration/billing/billing.service.test.ts (addition)

it('prevents two simultaneous payment attempts on the same bill', async () => {
  const bill = await createTestBill({ status: 'UNPAID' });

  // Fire both payments concurrently
  const [result1, result2] = await Promise.allSettled([
    billingService.initiatePayment({ billId: bill.id, method: 'CASH' }),
    billingService.initiatePayment({ billId: bill.id, method: 'CASH' }),
  ]);

  const succeeded = [result1, result2].filter(r => r.status === 'fulfilled');
  const failed = [result1, result2].filter(r => r.status === 'rejected');

  expect(succeeded).toHaveLength(1);
  expect(failed).toHaveLength(1);
  expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({
    code: 'PAYMENT_PENDING',
  });
});
```

### Order Status Page Tests (Added from Re-Review — 2026-03-25)

```typescript
// tests/api/order-status.api.test.ts

describe('GET /storefront/orders/status/:orderToken', () => {
  it('returns order + kitchenStatus for a valid token', async () => {
    const { order, ticket } = await setupOrderWithTicket({ kitchenStatus: 'PREPARING' });

    const res = await request(app)
      .get(`/api/v1/storefront/orders/status/${order.orderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.orderNumber).toBe(order.orderNumber);
    expect(res.body.data.kitchenStatus).toBe('PREPARING');
    expect(res.body.data.items).toHaveLength(order.items.length);
    // Must NOT expose internal IDs
    expect(res.body.data.orderId).toBeUndefined();
    expect(res.body.data.billId).toBeUndefined();
  });

  it('returns ORDER_NOT_FOUND for unknown token', async () => {
    const res = await request(app)
      .get('/api/v1/storefront/orders/status/00000000000000000000000000000000');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
  });

  it('returns kitchenStatus: null when no ticket exists yet', async () => {
    // e.g., dine-in order just created before kitchen processed it
    const order = await createTestOrder(tenant.id, session.id, {
      status: 'SUBMITTED',
      serviceModel: 'DINE_IN_TABLE',
    });
    // No kitchen ticket created yet

    const res = await request(app)
      .get(`/api/v1/storefront/orders/status/${order.orderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.kitchenStatus).toBeNull();
  });

  it('still returns data when order is COMPLETED', async () => {
    const { order } = await setupOrderWithTicket({ kitchenStatus: 'COMPLETED' });

    const res = await request(app)
      .get(`/api/v1/storefront/orders/status/${order.orderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.kitchenStatus).toBe('COMPLETED');
  });
});

describe('POST /storefront/orders — orderToken in response', () => {
  it('includes a 32-char hex orderToken in the 201 response', async () => {
    const res = await request(app)
      .post('/api/v1/storefront/orders')
      .send(validOrderPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.orderToken).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generates unique orderTokens for concurrent order submissions', async () => {
    const [res1, res2] = await Promise.all([
      request(app).post('/api/v1/storefront/orders').send(validOrderPayload),
      request(app).post('/api/v1/storefront/orders').send({ ...validOrderPayload, sessionId: session2.id }),
    ]);

    expect(res1.body.data.orderToken).not.toBe(res2.body.data.orderToken);
  });
});
```

### Kiosk Cash MVP — Immediate Ticket Test (Extension of Prior Test)

```typescript
// tests/integration/ordering/order.service.test.ts (extension)

describe('Kitchen ticket creation — cash kiosk (MVP)', () => {
  it('creates kitchen ticket immediately for CASH payment on STALL_KIOSK', async () => {
    // Cash kiosk MVP: ticket created at order submission, NOT waiting for payment
    const order = await orderService.createOrder({
      tenantId: tenant.id,
      sessionId: session.id,
      serviceModel: 'STALL_KIOSK',
      paymentMethod: 'CASH',   // cash = immediate ticket in MVP
      items: [{ menuItemId: item.id, quantity: 1 }],
    });

    const tickets = await prisma.kitchenTicket.findMany({ where: { orderId: order.id } });
    expect(tickets).toHaveLength(1);     // ticket created immediately
    expect(tickets[0].status).toBe('NEW');
  });

  it('does NOT create kitchen ticket for ABA QR kiosk order (awaits payment.confirmed)', async () => {
    const order = await orderService.createOrder({
      tenantId: tenant.id,
      sessionId: session.id,
      serviceModel: 'STALL_KIOSK',
      paymentMethod: 'ABA_QR',   // digital = wait for webhook
      items: [{ menuItemId: item.id, quantity: 1 }],
    });

    const tickets = await prisma.kitchenTicket.findMany({ where: { orderId: order.id } });
    expect(tickets).toHaveLength(0);     // no ticket until payment.confirmed
  });
});
```

### E2E — Order Status Page and Same-Visit Banner

```typescript
// tests/e2e/order-status-page.spec.ts

test('order status page shows correct kitchen status progression', async ({ page }) => {
  // Place a kiosk order
  await page.goto(`/store/${TEST_KIOSK_QR_TOKEN}`);
  await page.click('[data-testid="item-card"]:first-child button');
  await page.click('[data-testid="view-cart-btn"]');
  await page.click('[data-testid="checkout-btn"]');
  await page.click('[data-testid="payment-method-cash"]');
  await page.click('[data-testid="place-order-btn"]');

  // Should show confirmation with "Track your order" link
  const trackLink = page.locator('[data-testid="track-order-link"]');
  await expect(trackLink).toBeVisible();
  const href = await trackLink.getAttribute('href');
  expect(href).toMatch(/^\/o\/[0-9a-f]{32}$/);

  // Navigate to status page
  await page.click('[data-testid="track-order-link"]');
  await expect(page.locator('[data-testid="order-status-bar"]')).toBeVisible();
  await expect(page.locator('[data-testid="status-new"]')).toHaveAttribute('aria-current', 'true');
});

test('same-visit banner appears on re-scan after order', async ({ page }) => {
  // First scan + order
  await page.goto(`/store/${TEST_KIOSK_QR_TOKEN}`);
  await page.click('[data-testid="item-card"]:first-child button');
  await page.click('[data-testid="view-cart-btn"]');
  await page.click('[data-testid="checkout-btn"]');
  await page.click('[data-testid="payment-method-cash"]');
  await page.click('[data-testid="place-order-btn"]');
  await expect(page.locator('[data-testid="order-confirmation"]')).toBeVisible();

  // Re-scan (navigate to same QR URL again)
  await page.goto(`/store/${TEST_KIOSK_QR_TOKEN}`);

  // Banner should show prior order
  const banner = page.locator('[data-testid="same-visit-banner"]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('ORD-');
  await expect(banner.locator('[data-testid="view-status-link"]')).toBeVisible();
});

test('same-visit banner excludes orders older than TTL', async ({ page }) => {
  // Inject an expired order into localStorage
  await page.goto(`/store/${TEST_KIOSK_QR_TOKEN}`);
  await page.evaluate((tenantSlug) => {
    const expiredTime = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(); // 5h ago
    localStorage.setItem(`orders:${tenantSlug}`, JSON.stringify({
      tenantSlug,
      orders: [{ orderToken: 'abc123', orderNumber: 'ORD-0001', submittedAt: expiredTime }],
    }));
  }, 'test-restaurant');

  await page.reload();

  // Banner should NOT appear (expired entry filtered)
  await expect(page.locator('[data-testid="same-visit-banner"]')).not.toBeVisible();
});
```

---

## CI Pipeline

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: platform_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install
      - run: pnpm db:migrate:test
      - run: pnpm test:unit
      - run: pnpm test:integration
      - run: pnpm test:api
```

**All tests must pass before merging to main.**
