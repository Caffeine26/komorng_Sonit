# Komorng — Master Engineering Prompt
## Cart → Order: Full End-to-End Implementation
**Version:** 3.0 (Final) | **Project:** Komorng (Multi-Tenant Food Ordering System)
**Agent target:** Claude Code / Antigravity / Any agentic coding assistant
**Scope:** Backend cart management + order submission. PAY_AFTER + DINE_IN_TABLE only.
**Date:** 2026-05-26

---

## 0. MANDATORY PRE-FLIGHT — Read Before Touching Anything

```
[ ] Read README.md at project root
[ ] Read technical-design/backend/01-module-structure.md
[ ] Scan database/prisma/schema.prisma — confirm Cart, CartItem, Order,
    OrderItem, OrderSession, OrderStatusHistory, KitchenTicket models
[ ] Scan database/prisma/migrations/ — note latest migration name
[ ] Confirm monorepo packages: contracts/bff-admin, contracts/bff-storefront,
    contracts/enums, backend/api, frontend/admin, frontend/storefront
[ ] Confirm backend/api/src/domains/ directory structure
[ ] Confirm backend/api/src/modules/ BFF module structure
[ ] Check what already exists in backend/api/src/domains/order/core/
    (Step 3 was completed — Order entity, OrderItem VO, order errors exist)
[ ] Confirm frontend/storefront/src/features/cart/store.ts EXISTS
    (will be DELETED and replaced by API calls — do not touch until Step F1)
[ ] Confirm frontend/admin/src/app/[locale]/[tenantSlug]/new-order/page.tsx EXISTS
    (local cart state will be replaced — do not touch until Step F2)
[ ] Wait for explicit "Proceed" before modifying any file
```

**If any structural file is missing → STOP. Report. Ask. Never infer.**

---

## 1. Project Context

**Stack:** NestJS + Prisma + TypeScript, Hexagonal Architecture + DDD
**Monorepo:** Turborepo
**DB:** PostgreSQL — all tenant-scoped tables use composite PK (tenant_id, id)
**Money:** Always integer cents — NEVER float or Decimal
**Auth:** JWT via TenantGuard — tenantId ALWAYS from JWT, NEVER from body
**Storefront auth:** Anonymous customer identified by QR token via QrSessionGuard
**Scope lock:** PAY_AFTER + DINE_IN_TABLE only. No PENDING_PAYMENT, no STALL_KIOSK.

### What is already built (Step 3 complete)
```
backend/api/src/domains/order/core/
  entities/order.entity.ts          ✅ done
  value-objects/order-item.vo.ts    ✅ done
  errors/order.errors.ts            ✅ done
contracts/bff-storefront/src/order/
  submit-order-storefront.contract.ts ✅ done
```

### What needs to be built (this prompt)
Everything else — cart domain + order domain fully wired end-to-end.

---

## 2. The Domain Connection Map

This is the single most important thing to understand before writing any code.
Cart and Order are two separate domains that connect at one precise point.

```
┌─────────────────────────────────────────────────────────────┐
│                    CART DOMAIN                              │
│                                                             │
│  Customer/Staff adds items → CartItem[]                     │
│  Cart lives as status: ACTIVE                               │
│  Cart is always tied to an OrderSession                     │
│  Cart has no monetary meaning until submitted               │
│                                                             │
│  CartEntity ──────────────────────────────────────────────► │
│                         CartSnapshot (read-only projection) │
└─────────────────────────────┬───────────────────────────────┘
                              │
                    submit-order use case
                    reads CartSnapshot,
                    validates it, converts it
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    ORDER DOMAIN                             │
│                                                             │
│  Order.createFromCart(cartSnapshot) → OrderEntity           │
│  Cart status → CONVERTED (one-way, irreversible)            │
│  OrderItem[] snapshotted from CartItem[]                    │
│  Prices locked at submission time                           │
│  Order is the financial record                              │
│                                                             │
│  OrderEntity ─────────────────────────────────────────────► │
│                         Kitchen tickets (future)            │
│                         Billing (future)                    │
└─────────────────────────────────────────────────────────────┘
```

### The two entry paths

```
PATH A — Storefront (Customer)
  Anonymous customer (QR token)
  ┌──────────────────────────────────────────────────────┐
  │ 1. QR scan → resolve tenantId + create OrderSession  │
  │ 2. GET  /storefront/cart         → get or create cart│
  │ 3. POST /storefront/cart/items   → add item          │
  │ 4. PATCH /storefront/cart/items/:id → update qty     │
  │ 5. DELETE /storefront/cart/items/:id → remove item   │
  │ 6. POST /storefront/orders       → submit cart→order │
  └──────────────────────────────────────────────────────┘
  Source: STOREFRONT_QR
  tenantId: from QR token (QrSessionGuard)
  sessionId: from QR context (resolved by guard)

PATH B — Admin Counter (Merchant Staff)
  Authenticated staff (JWT)
  ┌──────────────────────────────────────────────────────┐
  │ 1. Staff opens new order → POST /admin/sessions      │
  │    (creates OrderSession for selected table)         │
  │ 2. GET  /admin/cart/:sessionId   → get or create cart│
  │ 3. POST /admin/cart/items        → add item          │
  │ 4. PATCH /admin/cart/items/:id   → update qty        │
  │ 5. DELETE /admin/cart/items/:id  → remove item       │
  │ 6. POST /admin/orders            → submit cart→order │
  └──────────────────────────────────────────────────────┘
  Source: MERCHANT_MANUAL
  tenantId: from JWT (TenantGuard)
  sessionId: from JWT context or request param
  createdById: from JWT sub claim
```

---

## 3. Architecture — Full File Map

```
contracts/
  bff-storefront/src/cart/
    cart.contract.ts                     ← Step C1
  bff-admin/src/cart/
    cart.contract.ts                     ← Step C2
  bff-admin/src/order/
    submit-order-admin.contract.ts       ← Step O1
    list-orders.contract.ts              ← Step O1
    update-order-status.contract.ts      ← Step O1

backend/api/src/domains/cart/
  core/
    entities/
      cart.entity.ts                     ← Step C3
    value-objects/
      cart-item.vo.ts                    ← Step C3
    ports/
      cart.repository.ts                 ← Step C4 (ICartRepository)
    errors/
      cart.errors.ts                     ← Step C3
  application/
    use-cases/
      get-or-create-cart.use-case.ts     ← Step C5
      add-cart-item.use-case.ts          ← Step C6
      update-cart-item.use-case.ts       ← Step C7
      remove-cart-item.use-case.ts       ← Step C8
      get-cart.use-case.ts               ← Step C9
  infra/
    repositories/
      cart.repository.impl.ts            ← Step C10
    mappers/
      cart.mapper.ts                     ← Step C10
  cart.module.ts                         ← Step C11

backend/api/src/modules/
  bff-storefront/cart/
    cart-storefront.handler.ts           ← Step C12
    cart-storefront.controller.ts        ← Step C12
  bff-admin/cart/
    cart-admin.handler.ts                ← Step C13
    cart-admin.controller.ts             ← Step C13

backend/api/src/domains/order/
  core/
    entities/order.entity.ts             ✅ EXISTS
    value-objects/order-item.vo.ts       ✅ EXISTS
    errors/order.errors.ts               ✅ EXISTS
    ports/
      order.repository.ts                ← Step O2 (IOrderRepository)
      order-event-publisher.port.ts      ← Step O3
  application/
    use-cases/
      submit-order-storefront.use-case.ts ← Step O4
      submit-order-admin.use-case.ts      ← Step O5
      get-orders.use-case.ts              ← Step O6
      update-order-status.use-case.ts     ← Step O7
  infra/
    repositories/
      order.repository.impl.ts           ← Step O8
    mappers/
      order.mapper.ts                    ← Step O8
    adapters/
      no-op-order-event-publisher.ts     ← Step O9
  order.module.ts                        ← Step O9

backend/api/src/modules/
  bff-storefront/order/
    submit-order-storefront.handler.ts   ← Step O10
    submit-order-storefront.controller.ts ← Step O10
  bff-admin/order/
    submit-order-admin.handler.ts        ← Step O11
    list-orders.handler.ts               ← Step O11
    update-order-status.handler.ts       ← Step O11
    order-admin.controller.ts            ← Step O11

frontend/storefront/src/features/cart/
  api.ts                                 ← Step F1 (replace store.ts)
  hooks/useCart.ts                       ← Step F1
  store.ts                               ← Step F1 (DELETE this file)

frontend/admin/src/lib/api/cart.ts       ← Step F2
frontend/admin/src/app/.../new-order/
  page.tsx                               ← Step F2 (wire to backend cart)
```

---

## 4. The Complete Atomic Step Plan

> **Rules — non-negotiable:**
> - ONE step per turn. No bundling. No exceptions.
> - [Manager] presents this full list → STOP → wait for "Proceed" → execute Step C1.
> - After each step [Tester] validates before moving on.
> - Step regression: if step N reveals step N-1 is wrong → STOP, report, fix, then resume.

---

### ═══ PHASE 1: CART CONTRACTS ═══

---

### STEP C1 — bff-storefront cart contract

**Package:** `contracts/bff-storefront/src/cart/cart.contract.ts`

```typescript
// GET /storefront/cart → GetCartOutput
// POST /storefront/cart/items → AddCartItemInput / AddCartItemOutput
// PATCH /storefront/cart/items/:id → UpdateCartItemInput / UpdateCartItemOutput
// DELETE /storefront/cart/items/:id → (no body) / DeleteCartItemOutput

// CartItemDto (shared shape used in all outputs):
{
  id: string
  menuItemId: string
  itemName: string
  quantity: number           // min 1
  unitPriceCents: number     // min 0
  lineTotalCents: number     // computed: qty * unitPrice
  variantSnapshot: object | null
  optionsSnapshot: object | null
  notes: string | null
}

// GetCartOutput:
{
  cartId: string
  sessionId: string
  status: 'ACTIVE'
  items: CartItemDto[]
  subtotalCents: number      // sum of all lineTotalCents
  itemCount: number
}

// AddCartItemInput:
{
  menuItemId: string
  quantity: number           // min 1
  unitPriceCents: number     // min 0 — validated against DB in use case
  variantSnapshot?: object
  optionsSnapshot?: object
  notes?: string
}

// AddCartItemOutput: GetCartOutput (return full cart after mutation)

// UpdateCartItemInput:
{
  quantity: number           // min 1
}

// UpdateCartItemOutput: GetCartOutput

// DeleteCartItemOutput: GetCartOutput
```

**Rules:**
- Pure Zod + TypeScript. Zero NestJS/Prisma.
- Export all schemas AND inferred types.
- Re-export from `contracts/bff-storefront/index.ts`.

**[Tester] checks:**
- [ ] No NestJS/Prisma imports
- [ ] All schemas export Zod schema + `z.infer<>` type
- [ ] Re-exported from index.ts
- [ ] `pnpm build` passes in contracts/bff-storefront

---

### STEP C2 — bff-admin cart contract

**Package:** `contracts/bff-admin/src/cart/cart.contract.ts`

Same shape as C1 with one addition — `AddCartItemInput` for admin includes `itemName` as a required field (staff can override the display name for manual entries):

```typescript
// AddCartItemInput (admin):
{
  sessionId: string          // admin must specify which session
  menuItemId: string
  itemName: string           // required for admin — staff sees item name
  quantity: number
  unitPriceCents: number
  variantSnapshot?: object
  optionsSnapshot?: object
  notes?: string
}

// GetCartInput (admin — query param):
{
  sessionId: string
}

// All output shapes identical to storefront contract
```

**Rules:** Same as C1. Re-export from `contracts/bff-admin/index.ts`.

**[Tester] checks:** Same as C1 for bff-admin package.

---

### STEP C3 — Cart entity + CartItem value object + cart errors

**Layer:** `backend/api/src/domains/cart/core/`

**`cart-item.vo.ts`** — immutable value object:
```typescript
// Properties:
//   id: string (cuid — assigned at creation)
//   cartId: string
//   menuItemId: string
//   itemName: string         ← snapshotted at add time
//   quantity: number         ← min 1
//   unitPriceCents: number   ← min 0, snapshotted at add time
//   lineTotalCents: number   ← computed: qty * unitPrice (integer math)
//   variantSnapshot: unknown | null
//   optionsSnapshot: unknown | null
//   notes: string | null

// Factory: CartItemVO.create(params) → CartItemVO
// Method: withQuantity(qty: number) → CartItemVO (returns NEW VO, immutable)
```

**`cart.entity.ts`** — rich domain object:
```typescript
// Properties:
//   tenantId, id, sessionId
//   status: CartStatus ('ACTIVE' | 'CONVERTED' | 'ABANDONED')
//   items: CartItemVO[]
//   version: number
//   createdAt, updatedAt

// Factory: CartEntity.create(params) → CartEntity (status: ACTIVE)
// Reconstitute: CartEntity.reconstitute(props) → CartEntity (from DB)

// Domain methods:
//   addItem(item: CartItemVO): void
//     → if same menuItemId + same variantSnapshot exists: increment qty
//     → else: push new CartItemVO
//     → throws CartAlreadyConvertedError if status !== ACTIVE

//   updateItem(cartItemId: string, quantity: number): void
//     → quantity < 1 → throw ValidationError
//     → item not found → throw CartItemNotFoundError
//     → throws CartAlreadyConvertedError if status !== ACTIVE

//   removeItem(cartItemId: string): void
//     → item not found → throw CartItemNotFoundError
//     → throws CartAlreadyConvertedError if status !== ACTIVE

//   markConverted(): void
//     → sets status = 'CONVERTED'
//     → throws CartAlreadyConvertedError if already CONVERTED

//   get subtotalCents(): number
//     → sum of all item.lineTotalCents (integer math, no floats)

//   get itemCount(): number
//     → sum of all item.quantity

//   toSnapshot(): CartSnapshot
//     → projection used by Order domain (see connection map)
```

**`cart.errors.ts`:**
```typescript
export class CartNotFoundError extends DomainError
export class CartAlreadyConvertedError extends DomainError
export class CartItemNotFoundError extends DomainError
export class CartEmptyError extends DomainError
export class CartSessionMismatchError extends DomainError
```

**Rules:**
- ZERO NestJS/Prisma imports in core/
- lineTotalCents always integer math: `Math.floor(qty * unitPrice)`
- Status guard on all mutation methods

**[Tester] checks:**
- [ ] No NestJS/Prisma imports
- [ ] lineTotalCents is integer math only
- [ ] addItem deduplication works (same item → increment qty)
- [ ] All mutation methods throw CartAlreadyConvertedError when CONVERTED
- [ ] `pnpm build` passes

---

### STEP C4 — ICartRepository port

**Layer:** `backend/api/src/domains/cart/core/ports/cart.repository.ts`

```typescript
export interface ICartRepository {
  // Read
  findActiveBySession(tenantId: string, sessionId: string): Promise<CartEntity | null>
  findById(tenantId: string, cartId: string): Promise<CartEntity | null>

  // Write
  save(cart: CartEntity): Promise<void>       // INSERT
  update(cart: CartEntity): Promise<void>     // UPDATE items + version

  // Conversion (called by Order domain)
  markConverted(tenantId: string, cartId: string): Promise<void>

  // Item name resolution
  // Cart needs to snapshot item name at add time
  resolveItemName(tenantId: string, menuItemId: string): Promise<{
    nameEn: string
    nameKm: string | null
    basePriceCents: number | null
  } | null>
}

export const CART_REPOSITORY_PORT = Symbol('ICartRepository')

// CartSnapshot — the projection passed to Order domain at submission
// This is the ONLY thing Order domain receives from Cart domain
export interface CartSnapshot {
  cartId: string
  sessionId: string
  items: {
    menuItemId: string
    itemName: string
    quantity: number
    unitPriceCents: number
    lineTotalCents: number
    variantSnapshot: unknown
    optionsSnapshot: unknown
    notes: string | null
  }[]
  subtotalCents: number
}
```

**Critical note on CartSnapshot:**
The `CartSnapshot` is defined here in the Cart domain and also referenced by the Order domain. The Order domain does NOT import from the Cart domain — it has its own `CartSnapshot` interface in `order.repository.ts` with the same shape. This avoids circular domain dependencies.

**Rules:** Pure TypeScript interface — zero NestJS/Prisma.

**[Tester] checks:**
- [ ] No NestJS/Prisma imports
- [ ] CART_REPOSITORY_PORT symbol exported
- [ ] CartSnapshot exported
- [ ] `pnpm build` passes

---

### STEP C5 — get-or-create-cart use case

**Layer:** `backend/api/src/domains/cart/application/use-cases/get-or-create-cart.use-case.ts`

**Input:** `{ tenantId: string, sessionId: string }`

**Logic:**
```
1. Call ICartRepository.findActiveBySession(tenantId, sessionId)
2. If found → return existing cart (idempotent)
3. If not found → CartEntity.create({ tenantId, sessionId })
4. Call ICartRepository.save(newCart)
5. Return cart summary (cartId, sessionId, items[], subtotalCents, itemCount)
```

**Rules:**
- Ports only — no Prisma, no adapters
- Idempotent — calling twice returns same cart
- tenantId from caller (BFF passes from JWT/QR guard)

**[Tester] checks:**
- [ ] No NestJS/Prisma imports
- [ ] Idempotency: second call returns existing cart
- [ ] `pnpm build` passes

---

### STEP C6 — add-cart-item use case

**Layer:** `backend/api/src/domains/cart/application/use-cases/add-cart-item.use-case.ts`

**Input:**
```typescript
{
  tenantId: string
  sessionId: string
  menuItemId: string
  itemName?: string        // admin can override; storefront resolves from DB
  quantity: number
  unitPriceCents: number
  variantSnapshot?: unknown
  optionsSnapshot?: unknown
  notes?: string
}
```

**Logic:**
```
1. Load cart via ICartRepository.findActiveBySession(tenantId, sessionId)
   → If not found: auto-create via CartEntity.create() + save
2. If itemName not provided → resolve via ICartRepository.resolveItemName()
   → If item doesn't exist for tenant → throw ValidationError
3. Build CartItemVO.create({ ...params, itemName })
4. Call cart.addItem(item)
   → entity handles deduplication (same menuItemId + variant → increment)
5. Call ICartRepository.update(cart)
6. Return full cart snapshot
```

**Rules:**
- Price is passed in from frontend but MUST be validated:
  - Resolve item from DB via resolveItemName()
  - If `unitPriceCents` differs from DB price by more than 1 cent → use DB price
  - This prevents price manipulation from frontend
- tenantId isolation on all repository calls

**[Tester] checks:**
- [ ] No NestJS/Prisma imports
- [ ] Price validation against DB — frontend cannot override price
- [ ] Deduplication handled by entity, not use case
- [ ] `pnpm build` passes

---

### STEP C7 — update-cart-item use case

**Layer:** `backend/api/src/domains/cart/application/use-cases/update-cart-item.use-case.ts`

**Input:** `{ tenantId: string, cartId: string, cartItemId: string, quantity: number }`

**Logic:**
```
1. Load cart via ICartRepository.findById(tenantId, cartId)
   → Not found → CartNotFoundError
2. Call cart.updateItem(cartItemId, quantity)
   → Entity validates: quantity >= 1
   → Entity validates: item exists in cart
   → Entity validates: cart is ACTIVE
3. Call ICartRepository.update(cart)
4. Return full cart snapshot
```

**[Tester] checks:**
- [ ] No NestJS/Prisma imports
- [ ] Validation in entity, not use case
- [ ] tenantId isolation
- [ ] `pnpm build` passes

---

### STEP C8 — remove-cart-item use case

**Layer:** `backend/api/src/domains/cart/application/use-cases/remove-cart-item.use-case.ts`

**Input:** `{ tenantId: string, cartId: string, cartItemId: string }`

**Logic:**
```
1. Load cart via ICartRepository.findById(tenantId, cartId)
   → Not found → CartNotFoundError
2. Call cart.removeItem(cartItemId)
   → Entity validates: item exists
   → Entity validates: cart is ACTIVE
3. Call ICartRepository.update(cart)
4. Return full cart snapshot
```

**[Tester] checks:** Same pattern as C7.

---

### STEP C9 — get-cart use case

**Layer:** `backend/api/src/domains/cart/application/use-cases/get-cart.use-case.ts`

**Input:** `{ tenantId: string, sessionId: string }`

**Logic:**
```
1. Load cart via ICartRepository.findActiveBySession(tenantId, sessionId)
   → Not found → return empty cart shape (do NOT throw — cart may not exist yet)
2. Return cart summary DTO
```

**[Tester] checks:**
- [ ] Returns empty shape (not error) when no cart exists
- [ ] `pnpm build` passes

---

### STEP C10 — Prisma cart repository + mapper

**Layer:** `backend/api/src/domains/cart/infra/`

**`cart.mapper.ts`:**
```typescript
// toDomain(raw: PrismaCart & { items: PrismaCartItem[] }): CartEntity
//   → maps each PrismaCartItem → CartItemVO
//   → returns CartEntity.reconstitute(props)

// toPersistence(cart: CartEntity): Prisma.CartCreateInput
// itemToPersistence(item: CartItemVO, cartId: string, tenantId: string)
```

**`cart.repository.impl.ts`** — implements ICartRepository:
```typescript
// findActiveBySession():
//   prisma.cart.findFirst({
//     where: { tenantId, sessionId, status: 'ACTIVE' },
//     include: { items: true }
//   }) → map to domain

// findById():
//   prisma.cart.findFirst({
//     where: { tenantId, id: cartId },
//     include: { items: true }
//   }) → map to domain

// save():
//   prisma.cart.create({ data: { ...cart, items: { createMany: { data: items } } } })

// update():
//   prisma.$transaction([
//     prisma.cartItem.deleteMany({ where: { tenantId, cartId: cart.id } }),
//     prisma.cartItem.createMany({ data: mappedItems }),
//     prisma.cart.update({
//       where: { tenantId_id: { tenantId, id: cart.id } },
//       data: { version: cart.version + 1, updatedAt: new Date() }
//     })
//   ])

// markConverted():
//   prisma.cart.update({
//     where: { tenantId_id: { tenantId, id: cartId } },
//     data: { status: 'CONVERTED' }
//   })

// resolveItemName():
//   prisma.menuItem.findFirst({
//     where: { tenantId, id: menuItemId, isAvailable: true, deletedAt: null },
//     select: { nameEn: true, nameKm: true, basePriceCents: true }
//   })
```

**Rules:**
- EVERY query includes `tenantId` in `where`
- No Prisma model escapes infra/ — always mapped via cart.mapper.ts
- update() uses transaction to replace items atomically
- Composite PK in all update/delete: `{ tenantId_id: { tenantId, id } }`

**[Tester] checks:**
- [ ] Every query has `where: { tenantId, ... }`
- [ ] Every update uses composite where
- [ ] Mapper present — no PrismaCart type escapes infra/
- [ ] Transaction used for item replacement
- [ ] `pnpm build` passes

---

### STEP C11 — cart.module.ts

**Layer:** `backend/api/src/domains/cart/cart.module.ts`

```typescript
@Module({
  providers: [
    { provide: CART_REPOSITORY_PORT, useClass: CartRepositoryImpl },
    GetOrCreateCartUseCase,
    AddCartItemUseCase,
    UpdateCartItemUseCase,
    RemoveCartItemUseCase,
    GetCartUseCase,
  ],
  exports: [
    GetOrCreateCartUseCase,
    AddCartItemUseCase,
    UpdateCartItemUseCase,
    RemoveCartItemUseCase,
    GetCartUseCase,
  ],
})
export class CartModule {}
```

**[Tester] checks:**
- [ ] Port symbol as provide key
- [ ] All use cases exported
- [ ] `pnpm build` passes

---

### STEP C12 — bff-storefront cart handler + controller

**Layer:** `backend/api/src/modules/bff-storefront/cart/`

**Routes:**
```
GET    /storefront/cart              → GetOrCreateCartUseCase
POST   /storefront/cart/items        → AddCartItemUseCase
PATCH  /storefront/cart/items/:id    → UpdateCartItemUseCase
DELETE /storefront/cart/items/:id    → RemoveCartItemUseCase
```

**Guard:** QrSessionGuard (anonymous — no JWT)
- Resolves `tenantId` from QR token
- Resolves `sessionId` from QR context
- Attaches both to request object

**Handler responsibilities:**
- Validate request body against Zod contract
- Extract tenantId + sessionId from guard context (NEVER from body)
- Call use case
- Return output DTO

**[Tester] checks:**
- [ ] tenantId from QrSessionGuard — never from body
- [ ] sessionId from QrSessionGuard — never from body
- [ ] Controller is thin — zero business logic
- [ ] `pnpm build` passes

---

### STEP C13 — bff-admin cart handler + controller

**Layer:** `backend/api/src/modules/bff-admin/cart/`

**Routes:**
```
GET    /admin/cart          ?sessionId=xxx  → GetOrCreateCartUseCase
POST   /admin/cart/items                   → AddCartItemUseCase
PATCH  /admin/cart/items/:id               → UpdateCartItemUseCase
DELETE /admin/cart/items/:id               → RemoveCartItemUseCase
```

**Guard:** JwtAuthGuard + TenantGuard + RolesGuard
- Allowed roles: TENANT_OWNER | TENANT_MANAGER | SERVICE_STAFF
- tenantId from JWT claim
- sessionId from query param (GET) or body (POST/PATCH/DELETE)

**[Tester] checks:**
- [ ] All routes behind JwtAuthGuard + TenantGuard
- [ ] tenantId from JWT only
- [ ] `pnpm build` passes

---

### ═══ PHASE 2: ORDER CONTRACTS ═══

---

### STEP O1 — bff-admin order contracts

**Package:** `contracts/bff-admin/src/order/`

**Files:**
- `submit-order-admin.contract.ts`
- `list-orders.contract.ts`
- `update-order-status.contract.ts`

**submit-order-admin input:**
```typescript
{
  sessionId: string
  cartId: string             // the ACTIVE cart to convert
  tableId?: string           // optional — staff may not assign a table
  notes?: string
}
```

**submit-order-admin output:**
```typescript
{
  orderId: string
  orderNumber: string
  status: 'SUBMITTED'
  totalCents: number
  itemCount: number
  createdAt: string          // ISO datetime
}
```

**list-orders output (per item):**
```typescript
{
  orderId: string
  orderNumber: string
  status: OrderStatus
  tableRef: string | null
  totalCents: number
  itemCount: number
  source: OrderSource
  createdAt: string
  submittedAt: string | null
}
```

**update-order-status input:**
```typescript
{
  status: 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED'
  cancellationReason?: OrderCancellationReason
  reason?: string
}
```

**Rules:** Pure Zod + TypeScript. Re-export from index.ts.

---

### ═══ PHASE 3: ORDER DOMAIN (PORTS) ═══

---

### STEP O2 — IOrderRepository port

**Layer:** `backend/api/src/domains/order/core/ports/order.repository.ts`

```typescript
export interface IOrderRepository {
  save(order: OrderEntity): Promise<void>
  update(order: OrderEntity): Promise<void>
  findById(tenantId: string, orderId: string): Promise<OrderEntity | null>
  findByTenant(tenantId: string, filters?: {
    status?: OrderStatus
    sessionId?: string
    tableId?: string
    limit?: number      // default 50, max 100
    offset?: number     // default 0
  }): Promise<OrderEntity[]>

  // Cart reading — Order domain reads cart at submission time
  // NOTE: This is a READ-ONLY projection. Cart domain owns the write.
  findActiveCart(tenantId: string, cartId: string): Promise<CartSnapshot | null>

  // Cart conversion — called AFTER order is saved
  markCartConverted(tenantId: string, cartId: string): Promise<void>

  // Order number from Postgres sequence function
  allocateOrderNumber(tenantId: string): Promise<string>
}

export const ORDER_REPOSITORY_PORT = Symbol('IOrderRepository')

// CartSnapshot — identical shape to cart domain's CartSnapshot
// Defined here independently to avoid cross-domain import
export interface CartSnapshot {
  cartId: string
  sessionId: string
  items: {
    menuItemId: string
    itemName: string
    quantity: number
    unitPriceCents: number
    lineTotalCents: number
    variantSnapshot: unknown
    optionsSnapshot: unknown
    notes: string | null
  }[]
  subtotalCents: number
}
```

**[Tester] checks:**
- [ ] No NestJS/Prisma imports
- [ ] CartSnapshot defined independently (no import from cart domain)
- [ ] Symbol exported
- [ ] `pnpm build` passes

---

### STEP O3 — IOrderEventPublisher port

**Layer:** `backend/api/src/domains/order/core/ports/order-event-publisher.port.ts`

```typescript
export interface OrderSubmittedEvent {
  tenantId: string
  orderId: string
  orderNumber: string
  tableRef: string | null
  source: OrderSource
  items: { itemName: string; quantity: number; unitPriceCents: number }[]
  totalCents: number
  submittedAt: Date
}

export interface IOrderEventPublisher {
  publishOrderSubmitted(event: OrderSubmittedEvent): Promise<void>
}

export const ORDER_EVENT_PUBLISHER_PORT = Symbol('IOrderEventPublisher')
```

**Note:** Telegram adapter will implement this in Phase 2 (future).
A no-op adapter registers now so the system compiles.

---

### ═══ PHASE 4: ORDER USE CASES ═══

---

### STEP O4 — submit-order-storefront use case

**Layer:** `backend/api/src/domains/order/application/use-cases/submit-order-storefront.use-case.ts`

**Input:** `{ tenantId: string, cartId: string, sessionId: string, notes?: string }`

**Logic — THE CRITICAL CONNECTION POINT:**
```
1. Load CartSnapshot via IOrderRepository.findActiveCart(tenantId, cartId)
   → Not found → CartNotFoundError
   → Already CONVERTED → CartAlreadyConvertedError

2. Validate: cartSnapshot.sessionId === input.sessionId
   → Mismatch → CartSessionMismatchError

3. Validate: cartSnapshot.items.length > 0
   → Empty → EmptyOrderError

4. Allocate orderNumber via IOrderRepository.allocateOrderNumber(tenantId)

5. Generate orderToken (cuid())

6. Build order via Order.createFromCart({
     tenantId,
     cartSnapshot,           ← THIS is how Cart connects to Order
     orderNumber,
     orderToken,
     notes
   })
   → Entity sets: status=SUBMITTED, serviceModel=DINE_IN_TABLE,
     payTiming=PAY_AFTER, source=STOREFRONT_QR, submittedAt=now()
   → Entity computes totals from cartSnapshot items

7. Save order: IOrderRepository.save(order)

8. Convert cart: IOrderRepository.markCartConverted(tenantId, cartId)
   ← ONE-WAY. Cart can never go back to ACTIVE after this.

9. Publish event (non-fatal):
   try {
     await eventPublisher.publishOrderSubmitted(event)
   } catch (e) {
     // log only — never break order submission
   }

10. Return: { orderId, orderNumber, orderToken, status, totalCents,
              estimatedReadyAt: null, createdAt }
```

**Rules:**
- Steps 7 + 8 must be atomic — if save fails, cart must NOT be marked converted
- Use a DB transaction in the repository to ensure atomicity
- Event publish is always non-fatal

**[Tester] checks:**
- [ ] No NestJS/Prisma imports
- [ ] Cart conversion only happens AFTER order is saved
- [ ] Event publish wrapped in try/catch
- [ ] `pnpm build` passes

---

### STEP O5 — submit-order-admin use case

**Layer:** `backend/api/src/domains/order/application/use-cases/submit-order-admin.use-case.ts`

**Input:**
```typescript
{
  tenantId: string
  sessionId: string
  cartId: string        // the active admin cart to convert
  tableId?: string
  notes?: string
  createdById: string   // from JWT sub — never from body
}
```

**Logic — same cart→order connection, different source:**
```
1. Load CartSnapshot via IOrderRepository.findActiveCart(tenantId, cartId)
   → Not found → CartNotFoundError
   → Already CONVERTED → CartAlreadyConvertedError

2. Validate: cartSnapshot.sessionId === input.sessionId

3. Validate: cartSnapshot.items.length > 0 → EmptyOrderError

4. Allocate orderNumber

5. Generate orderToken

6. Build order via Order.createFromCounter({
     tenantId,
     sessionId,
     tableId,
     items: cartSnapshot.items mapped to OrderItemVO[],
     orderNumber,
     orderToken,
     notes,
     createdById       ← from JWT, never from cart or body
   })

7. Save order + markCartConverted (atomic — same transaction)

8. Publish event (non-fatal)

9. Return: { orderId, orderNumber, status, totalCents, itemCount, createdAt }
```

**[Tester] checks:**
- [ ] createdById from JWT param — not from cart, not from body
- [ ] Same atomicity rule: save + convert in transaction
- [ ] `pnpm build` passes

---

### STEP O6 — get-orders use case

**Layer:** `backend/api/src/domains/order/application/use-cases/get-orders.use-case.ts`

**Input:**
```typescript
{
  tenantId: string
  filters?: {
    status?: OrderStatus
    sessionId?: string
    tableId?: string
    limit?: number    // default 50, max 100
    offset?: number   // default 0
  }
}
```

**Logic:**
```
1. IOrderRepository.findByTenant(tenantId, filters)
2. Map OrderEntity[] → output DTO[]
3. Return list
```

---

### STEP O7 — update-order-status use case

**Layer:** `backend/api/src/domains/order/application/use-cases/update-order-status.use-case.ts`

**Input:**
```typescript
{
  tenantId: string
  orderId: string
  newStatus: 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED'
  cancellationReason?: OrderCancellationReason
  reason?: string
  actorId: string    // from JWT sub
}
```

**Logic:**
```
1. IOrderRepository.findById(tenantId, orderId)
   → Not found → OrderNotFoundError

2. order.transitionTo(newStatus, actorId)
   → Entity enforces allowed transitions:
     SUBMITTED → PREPARING, CANCELLED
     PREPARING → READY, CANCELLED
     READY → COMPLETED
     COMPLETED → (terminal — no transitions)
     CANCELLED → (terminal — OrderAlreadyCancelledError)

3. If CANCELLED: order.cancel(cancellationReason, actorId)

4. IOrderRepository.update(order)

5. Return updated order summary
```

**Rules:** Transition logic lives in the entity, not the use case.

---

### ═══ PHASE 5: ORDER INFRASTRUCTURE ═══

---

### STEP O8 — Prisma order repository + mapper

**Layer:** `backend/api/src/domains/order/infra/`

**`order.mapper.ts`:**
```typescript
// toDomain(raw: PrismaOrder & { items: PrismaOrderItem[] }): OrderEntity
// toPersistence(order: OrderEntity): Prisma.OrderCreateInput
// itemToPersistence(item: OrderItemVO, tenantId: string, orderId: string)
```

**`order.repository.impl.ts`:**
```typescript
// save():
//   prisma.$transaction([
//     prisma.order.create({ data: { ...order } }),
//     prisma.orderItem.createMany({ data: items }),
//     prisma.orderStatusHistory.create({ data: SUBMITTED event })
//   ])

// update():
//   prisma.order.update({
//     where: { tenantId_id: { tenantId, id: order.id } },
//     data: { status, ...timestamps, version: order.version + 1 }
//   })
//   + prisma.orderStatusHistory.create({ data: transition event })

// findById():
//   prisma.order.findFirst({
//     where: { tenantId, id: orderId },
//     include: { items: true }
//   }) → map to domain

// findByTenant():
//   prisma.order.findMany({
//     where: { tenantId, ...filters },
//     include: { items: true },
//     orderBy: { createdAt: 'desc' },
//     take: limit, skip: offset
//   }) → map to domain[]

// findActiveCart():
//   prisma.cart.findFirst({
//     where: { tenantId, id: cartId, status: 'ACTIVE' },
//     include: { items: { include: { menuItem: true } } }
//   }) → map to CartSnapshot

// markCartConverted():
//   prisma.cart.update({
//     where: { tenantId_id: { tenantId, id: cartId } },
//     data: { status: 'CONVERTED' }
//   })

// allocateOrderNumber():
//   prisma.$queryRaw`
//     SELECT allocate_order_number(${tenantId}::text) AS order_number
//   ` → return string
```

**CRITICAL — atomicity rule:**
`save()` + `markCartConverted()` must be wrapped in a single Prisma transaction when called from submit use cases. The repository `save()` method accepts an optional `cartIdToConvert` param:
```typescript
save(order: OrderEntity, cartIdToConvert?: string): Promise<void>
// If cartIdToConvert provided → wraps order create + cart update in $transaction
```

**Rules:**
- Every query includes tenantId
- No Prisma model escapes infra/
- OrderStatusHistory entry created on every status change
- Composite PK on all update/delete

**[Tester] checks:**
- [ ] Every findMany/findFirst has where: { tenantId }
- [ ] Every update uses composite where: { tenantId_id }
- [ ] OrderStatusHistory created on save() and update()
- [ ] save() transaction includes cart conversion when provided
- [ ] Mapper present — no raw Prisma type escapes infra/
- [ ] `pnpm build` passes

---

### STEP O9 — order.module.ts + no-op event publisher

**Layer:** `backend/api/src/domains/order/`

**`infra/adapters/no-op-order-event-publisher.ts`:**
```typescript
@Injectable()
export class NoOpOrderEventPublisher implements IOrderEventPublisher {
  async publishOrderSubmitted(_event: OrderSubmittedEvent): Promise<void> {
    // Phase 2: Telegram adapter replaces this
  }
}
```

**`order.module.ts`:**
```typescript
@Module({
  imports: [CartModule],    // ← Order module imports Cart module
  providers: [
    { provide: ORDER_REPOSITORY_PORT, useClass: OrderRepositoryImpl },
    { provide: ORDER_EVENT_PUBLISHER_PORT, useClass: NoOpOrderEventPublisher },
    SubmitOrderStorefrontUseCase,
    SubmitOrderAdminUseCase,
    GetOrdersUseCase,
    UpdateOrderStatusUseCase,
  ],
  exports: [
    SubmitOrderStorefrontUseCase,
    SubmitOrderAdminUseCase,
    GetOrdersUseCase,
    UpdateOrderStatusUseCase,
  ],
})
export class OrderModule {}
```

**Why OrderModule imports CartModule:**
The order repository reads cart data (findActiveCart + markCartConverted).
CartModule must be available in the DI context.

**[Tester] checks:**
- [ ] CartModule imported
- [ ] Both port symbols as provide keys
- [ ] No-op publisher satisfies IOrderEventPublisher interface
- [ ] `pnpm build` passes

---

### ═══ PHASE 6: API WIRING ═══

---

### STEP O10 — bff-storefront order handler + controller

**Layer:** `backend/api/src/modules/bff-storefront/order/`

**Route:**
```
POST /storefront/orders → SubmitOrderStorefrontUseCase
```

**Guard:** QrSessionGuard
- tenantId from QR token
- sessionId from QR context

**Handler:**
```
1. Validate body: { cartId, notes? } against submitOrderStorefrontInputSchema
2. Extract tenantId + sessionId from QrSessionGuard
3. Call SubmitOrderStorefrontUseCase.execute({ tenantId, sessionId, cartId, notes })
4. Return output
```

**[Tester] checks:**
- [ ] tenantId + sessionId from guard — never from body
- [ ] Thin controller — zero business logic
- [ ] `pnpm build` passes

---

### STEP O11 — bff-admin order handlers + controller

**Layer:** `backend/api/src/modules/bff-admin/order/`

**Routes:**
```
POST   /admin/orders              → SubmitOrderAdminUseCase
GET    /admin/orders              → GetOrdersUseCase
PATCH  /admin/orders/:id/status   → UpdateOrderStatusUseCase
```

**Guards:** JwtAuthGuard + TenantGuard + RolesGuard
- Roles: TENANT_OWNER | TENANT_MANAGER | SERVICE_STAFF
- tenantId from JWT
- createdById / actorId from JWT sub

**[Tester] checks:**
- [ ] All routes behind auth guards
- [ ] tenantId from JWT only
- [ ] actorId from JWT sub — never from body
- [ ] `pnpm build` passes

---

### ═══ PHASE 7: FRONTEND MIGRATION ═══

---

### STEP F1 — Storefront: replace localStorage cart with API calls

**Files to change:**
- DELETE: `frontend/storefront/src/features/cart/store.ts`
- CREATE: `frontend/storefront/src/features/cart/api.ts`
- CREATE: `frontend/storefront/src/features/cart/hooks/useCart.ts`
- UPDATE: `frontend/storefront/src/features/cart/index.ts`

**`api.ts`** — thin API client:
```typescript
// getCart(qrToken: string): Promise<GetCartOutput>
//   GET /storefront/cart (Authorization: Bearer qrToken)

// addCartItem(qrToken: string, input: AddCartItemInput): Promise<GetCartOutput>
//   POST /storefront/cart/items

// updateCartItem(qrToken: string, cartItemId: string, quantity: number)
//   PATCH /storefront/cart/items/:cartItemId

// removeCartItem(qrToken: string, cartItemId: string)
//   DELETE /storefront/cart/items/:cartItemId
```

**`hooks/useCart.ts`** — React Query hook:
```typescript
// useCart(qrToken) → { cart, isLoading, addItem, updateItem, removeItem }
// Uses React Query for caching + optimistic updates
// qrToken passed as auth header — never stored in localStorage
```

**Layout rule:**
- QR token comes from URL param (?qr=TOKEN) — read from URL, never localStorage
- All cart components refactored to use useCart() hook
- AddToCartButton, CartFooter, RemoveItemDialog all updated

**[Tester] checks:**
- [ ] store.ts deleted — no localStorage references remain
- [ ] All cart components import from useCart hook
- [ ] QR token from URL, not localStorage
- [ ] `pnpm build` passes

---

### STEP F2 — Admin: replace local useState cart with API calls

**Files to change:**
- CREATE: `frontend/admin/src/lib/api/cart.ts`
- UPDATE: `frontend/admin/src/app/[locale]/[tenantSlug]/new-order/page.tsx`
- UPDATE: `frontend/admin/src/features/order-management/components/OrderFormModal.tsx`

**`lib/api/cart.ts`:**
```typescript
// getOrCreateCart(sessionId, tenantSlug): Promise<GetCartOutput>
// addCartItem(sessionId, input, tenantSlug): Promise<GetCartOutput>
// updateCartItem(cartItemId, quantity, tenantSlug): Promise<GetCartOutput>
// removeCartItem(cartItemId, tenantSlug): Promise<GetCartOutput>
// submitOrder(cartId, sessionId, tableId, tenantSlug): Promise<SubmitOrderAdminOutput>
```

**`new-order/page.tsx` changes:**
- Remove: `const [cart, setCart] = useState<CartItem[]>([])`
- Remove: `addDirectlyToCart`, `handleModalAddToCart`, `updateQuantity`, `removeCartItem` local functions
- Remove: `totalCents` local computation
- Add: `useQuery` for cart state (sessionId-scoped)
- Add: `useMutation` for each cart operation
- Add: session creation on page load (POST /admin/sessions → get sessionId)
- Wire: "Place Order" button → `submitOrder(cartId, sessionId, tableId)`
- Uncomment and fix: `createAdminOrder` call

**Layout rule:**
- ZERO visual changes — all Tailwind classes preserved exactly
- Only data binding changes — replace local state with API calls
- Cart panel still renders same UI, just with server data

**[Tester] checks:**
- [ ] Zero className or layout changes
- [ ] All local cart state removed
- [ ] API calls use the new cart.ts client
- [ ] `pnpm build` passes

---

### STEP F3 — Final end-to-end validation

**[Tester] runs the complete checklist:**

```
══ Architecture & Purity ══
  [ ] Zero NestJS/Prisma imports in any core/ folder
  [ ] Use cases call ports only — never adapters or Prisma
  [ ] Handlers have zero business logic
  [ ] Controllers are thin HTTP gateways
  [ ] BFF rule: no controller imports from application/use-cases/ directly
  [ ] Mappers present in both cart and order infra/
  [ ] No Prisma model type escapes infra/ in either domain

══ Domain Connection ══
  [ ] Cart → Order connection only via CartSnapshot projection
  [ ] No direct import from cart domain in order domain
  [ ] CartSnapshot shape matches between both domains
  [ ] markCartConverted() called only AFTER order is saved
  [ ] save() + markCartConverted() wrapped in DB transaction
  [ ] Order entity uses cartSnapshot items — prices are locked at submission

══ Multi-Tenancy & Security ══
  [ ] Every findMany/findFirst has where: { tenantId }
  [ ] Every create has tenantId in data
  [ ] Every update/delete uses composite where: { tenantId_id }
  [ ] tenantId from JWT (admin) / QR guard (storefront) — never from body
  [ ] sessionId from QR guard (storefront) — never from body
  [ ] createdById / actorId from JWT sub — never from body or cart

══ Cart Rules ══
  [ ] Cart status ACTIVE → CONVERTED is one-way and irreversible
  [ ] Price validation: unitPriceCents checked against DB at add-item time
  [ ] Deduplication: same menuItemId + variant → increment quantity
  [ ] Cart always tied to OrderSession (sessionId NOT NULL)
  [ ] ACTIVE cart constraint: one per session (enforced by DB partial unique)

══ Order Rules ══
  [ ] PAY_AFTER hardcoded in entity factory methods
  [ ] DINE_IN_TABLE hardcoded in entity factory methods
  [ ] PENDING_PAYMENT never set in this scope
  [ ] Status transitions validated by entity — not use case, not controller
  [ ] OrderStatusHistory entry on every status change
  [ ] allocateOrderNumber uses Postgres function — not app-level counter

══ Frontend Migration ══
  [ ] store.ts deleted — zero localStorage cart references in storefront
  [ ] Admin new-order page local cart state fully removed
  [ ] Zero visual/layout changes in both admin and storefront

══ Build ══
  [ ] pnpm build passes in all contract packages
  [ ] pnpm build passes in backend/api
  [ ] pnpm build passes in frontend/admin
  [ ] pnpm build passes in frontend/storefront
  [ ] pnpm turbo build passes at monorepo root
```

---

## 5. The Connection Summary (Read This Before Every Session)

```
QR Scan
  → QrSessionGuard resolves tenantId + sessionId
  → GET /storefront/cart
      → GetOrCreateCartUseCase
          → CartEntity created/loaded (ACTIVE)

Customer adds items
  → POST /storefront/cart/items
      → AddCartItemUseCase
          → Price validated against DB (frontend cannot manipulate price)
          → CartItemVO added to CartEntity
          → CartEntity saved to DB

Customer submits
  → POST /storefront/orders
      → SubmitOrderStorefrontUseCase
          → Reads CartSnapshot from IOrderRepository.findActiveCart()
          → Order.createFromCart(cartSnapshot)
              → Items + prices locked from snapshot
              → status = SUBMITTED, payTiming = PAY_AFTER
          → IOrderRepository.save(order, cartIdToConvert)  ← ATOMIC TRANSACTION
              → order saved + cart marked CONVERTED in same transaction
          → IOrderEventPublisher.publishOrderSubmitted()   ← non-fatal

Admin counter staff
  → POST /admin/sessions → creates OrderSession
  → GET /admin/cart?sessionId=xxx → GetOrCreateCartUseCase
  → POST /admin/cart/items → AddCartItemUseCase
  → POST /admin/orders → SubmitOrderAdminUseCase (same flow, source=MERCHANT_MANUAL)
```

---

## 6. Out of Scope — Do Not Build

```
❌ PENDING_PAYMENT status or cash confirmation
❌ STALL_KIOSK service model
❌ Telegram notification adapter (Phase 2)
❌ Stock/inventory management (Phase 3)
❌ Promotions / discount engine (Phase 3)
❌ Payment processing / billing
❌ Kitchen ticket creation (separate module)
❌ Bill generation (separate module)
❌ Order session management (assumed pre-existing or built separately)
```

---

## 7. Step Index — Quick Reference

| Step | What | Layer |
|---|---|---|
| C1 | bff-storefront cart contract | contracts |
| C2 | bff-admin cart contract | contracts |
| C3 | Cart entity + CartItem VO + errors | core |
| C4 | ICartRepository port | core |
| C5 | get-or-create-cart use case | application |
| C6 | add-cart-item use case | application |
| C7 | update-cart-item use case | application |
| C8 | remove-cart-item use case | application |
| C9 | get-cart use case | application |
| C10 | Prisma cart repository + mapper | infra |
| C11 | cart.module.ts | module |
| C12 | bff-storefront cart controller | BFF |
| C13 | bff-admin cart controller | BFF |
| O1 | bff-admin order contracts | contracts |
| O2 | IOrderRepository port | core |
| O3 | IOrderEventPublisher port | core |
| O4 | submit-order-storefront use case | application |
| O5 | submit-order-admin use case | application |
| O6 | get-orders use case | application |
| O7 | update-order-status use case | application |
| O8 | Prisma order repository + mapper | infra |
| O9 | order.module.ts + no-op publisher | module |
| O10 | bff-storefront order controller | BFF |
| O11 | bff-admin order controller | BFF |
| F1 | Storefront: replace localStorage cart | frontend |
| F2 | Admin: replace local state cart | frontend |
| F3 | Final end-to-end validation | validation |

---

## 8. How to Use This Prompt

1. Paste this entire document as your first message to the agent
2. Agent runs pre-flight (Section 0) and reports status
3. Review the report — confirm everything is correct
4. Say **"Proceed"** to begin Step C1
5. After each step completes and [Tester] validates → say **"Proceed"** for the next

**One "Proceed" = one atomic step. No exceptions.**

If you resume a session mid-plan, the agent re-runs pre-flight,
identifies the last completed step, and picks up from the next one.