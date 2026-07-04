# 07 — Naming Conventions

> **Updated for ADR-008.** Adds naming conventions for `modules/<bff>/`, `contracts/bff-<app>/`, BFF use cases, and frontend `lib/api/<bff>.ts` clients.

## Guiding Rule

> Be consistent. The second engineer to read the code should never have to guess the convention.

## BFF / Domain layer naming (ADR-008)

| Concept | Pattern | Example |
|---|---|---|
| BFF NestJS module folder | `backend/api/src/modules/<bff>/` (kebab-case) | `modules/storefront/`, `modules/platform-admin/` |
| BFF NestJS module class | `<Bff>Module` (PascalCase) | `StorefrontModule`, `PlatformAdminModule` |
| BFF controller | `<Bff>Controller`, mounted at `@Controller('<bff>')` | `StorefrontController` → `/api/v1/storefront/*` |
| BFF use case | `<Verb><Bff><Noun>UseCase` | `SubmitStorefrontOrderUseCase`, `GetStorefrontContextUseCase` |
| BFF contract package | `@xfos/contracts-bff-<bff>` | `@xfos/contracts-bff-storefront` |
| Domain folder | `backend/api/src/domains/<domain>/` (kebab-case, singular) | `domains/order/`, `domains/catalog/` |
| Domain controller (internal-only) | `<Domain>Controller`, mounted at `@Controller('internal/<domain>')` | `OrderController` → `/api/v1/internal/order/*` |
| Domain use case | `<Verb><Domain><Noun>UseCase` | `SubmitOrderUseCase`, `CancelOrderUseCase` |
| Domain contract package | `@xfos/contracts-<domain>` (backend-internal only) | `@xfos/contracts-order`, `@xfos/contracts-catalog` |
| Frontend BFF client file | `frontend/<app>/src/lib/api/<bff>.ts` | `lib/api/storefront.ts`, `lib/api/platform-admin.ts` |
| Frontend BFF client function | `<verb><Bff><Noun>` (camelCase) | `submitStorefrontOrder`, `listKitchenTickets`, `suspendTenant` |
| Internal API URL prefix | `/api/v1/internal/<domain>/*` | `/api/v1/internal/order/status/:token` |
| Internal API guard composition | `@UseGuards(InternalOnlyGuard, ServiceTokenGuard)` | applied at the controller class level |

---

## TypeScript / JavaScript

### Variables and Functions
```typescript
// camelCase for variables and functions
const tenantId = 'uuid';
const isAvailable = true;
const orderTotal = 12.50;

function createOrder(params: CreateOrderParams) {}
function getMenuItems(tenantId: string) {}
async function fetchBillById(billId: string) {}
```

### Constants
```typescript
// SCREAMING_SNAKE_CASE for true constants
const MAX_CART_ITEMS = 50;
const DEFAULT_LOCALE = 'en';
const JWT_EXPIRY_SECONDS = 900;
```

### Types and Interfaces
```typescript
// PascalCase for types, interfaces, enums, classes
type OrderStatus = 'PENDING_PAYMENT' | 'SUBMITTED' | 'CONFIRMED' | 'CANCELLED';

interface CreateOrderParams {
  tenantId: string;
  sessionId: string;
  items: OrderItemInput[];
}

enum ServiceModel {
  STALL_KIOSK = 'STALL_KIOSK',
  DINE_IN_TABLE = 'DINE_IN_TABLE',
}

class OrderService {
  async create(params: CreateOrderParams): Promise<Order> {}
}
```

### React Components
```tsx
// PascalCase for components
function MenuItemCard({ item }: MenuItemCardProps) {}
function CartSummary() {}
function KitchenTicketRow({ ticket }: TicketRowProps) {}

// Props type named [ComponentName]Props
interface MenuItemCardProps {
  item: MenuItem;
  onAddToCart: (item: MenuItem) => void;
}
```

### Hooks
```typescript
// Prefix with 'use', camelCase
function useCart() {}
function useKitchenSocket(tenantId: string) {}
function useMenuItems(tenantId: string, categoryId?: string) {}
```

### Event Handlers
```typescript
// Prefix with 'handle' or 'on'
function handleAddToCart(item: MenuItem) {}
const onStatusChange = (status: TicketStatus) => {};
```

---

## File and Folder Naming

### TypeScript files
```
// kebab-case for all files
order.service.ts
menu-item.repository.ts
auth.middleware.ts
create-order.schema.ts

// Components: PascalCase to match component name
MenuItemCard.tsx
CartSummary.tsx
KitchenTicketRow.tsx
```

### Folders
```
// kebab-case for folders
/domains/billing/
/middleware/
/menu-items/
/order-sessions/
```

### Test files
```
// Same name as the file being tested + .test or .spec
order.service.test.ts
auth.middleware.spec.ts
MenuItemCard.test.tsx
```

---

## Database Naming

### Tables
```sql
-- snake_case, plural nouns
menu_categories
menu_items
order_sessions
kitchen_tickets
payment_attempts
audit_logs
```

### Columns
```sql
-- snake_case
tenant_id
created_at
updated_at
deleted_at
is_active
is_available
order_number
base_price
```

### Foreign Keys
```sql
-- {referenced_table_singular}_id
tenant_id       -- references tenants
order_id        -- references orders
menu_item_id    -- references menu_items
category_id     -- references menu_categories
```

### Indexes
```sql
-- idx_{table}_{columns}
idx_orders_tenant_status
idx_menu_items_tenant_category
idx_kitchen_tickets_tenant_status
idx_qr_contexts_token
```

### Status / Enum Values
```sql
-- SCREAMING_SNAKE_CASE. XFOS uses Postgres native enum types
-- (CREATE TYPE "OrderStatus" AS ENUM (...)) rather than VARCHAR + CHECK.
-- See xfos/database/prisma/schema.prisma and the dedicated enum docs in
-- enums-tables-design/enums/.
CREATE TYPE "OrderStatus"   AS ENUM ('SUBMITTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ServiceModel"  AS ENUM ('STALL_KIOSK', 'DINE_IN_TABLE');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'ABA_QR', 'CARD');
```

**Exception:** the `from_status` / `to_status` columns in
`order_status_history` and `kitchen_ticket_events` are stored as TEXT
(not enum-typed) so historical rows survive enum evolution.

---

## API Naming

### Endpoints
```
// kebab-case for URL paths, plural nouns for resources
GET    /api/v1/admin/catalog/items
POST   /api/v1/admin/catalog/items
GET    /api/v1/admin/catalog/items/:id
PATCH  /api/v1/admin/catalog/items/:id
DELETE /api/v1/admin/catalog/items/:id

// Actions on resources: /{resource}/{id}/{action}
POST   /api/v1/billing/bills/:id/pay
POST   /api/v1/billing/bills/:id/confirm-cash
PATCH  /api/v1/kitchen/tickets/:id/status
DELETE /api/v1/admin/qr/:id/deactivate
```

### JSON Keys
```json
// camelCase in JSON requests and responses
{
  "tenantId": "uuid",
  "orderId": "uuid",
  "orderNumber": "ORD-0042",
  "basePrice": "8.50",
  "isAvailable": true,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### Query Parameters
```
// camelCase for query params
?tenantId=uuid
?pageSize=20
?sortBy=createdAt
?orderBy=desc
?fromDate=2024-01-01
?toDate=2024-01-31
```

---

## Event / Pub-Sub Naming

```typescript
// {domain}.{verb} — dot-separated, past tense for events
'order.created'
'order.confirmed'
'order.cancelled'
'payment.succeeded'
'payment.failed'
'ticket.status_changed'
'tenant.activated'
'tenant.suspended'
```

---

## Environment Variables

```bash
# SCREAMING_SNAKE_CASE
DATABASE_URL=postgres://...
REDIS_URL=redis://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
ABA_MERCHANT_ID=...
ABA_API_KEY=...

# Public env vars (Next.js only, exposed to browser)
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_APP_URL=https://app.example.com
```

---

## Git Conventions

### Branch Names
```
feature/{ticket-or-description}
fix/{ticket-or-description}
chore/{description}
docs/{description}

# Examples
feature/kitchen-ticket-status
fix/dine-in-bill-association
chore/upgrade-prisma
docs/api-endpoints
```

### Commit Messages
```
// Conventional Commits format
feat: add ABA QR payment initiation
fix: prevent duplicate bill creation on session restart
chore: upgrade Prisma to 5.8
docs: update API endpoint inventory
test: add integration tests for order submission
refactor: extract billing logic to service layer

// With scope
feat(billing): add cash confirmation flow
fix(kitchen): resolve stale socket state on reconnect
feat(storefront): add Khmer translation for checkout
```

---

## Prisma Model Naming

```prisma
// PascalCase singular for models, maps to snake_case tables
model Tenant {
  id          String   @id @default(uuid())
  displayName String   @map("display_name")
  createdAt   DateTime @default(now()) @map("created_at")

  @@map("tenants")
}

model MenuItem {
  @@map("menu_items")
}

model KitchenTicket {
  @@map("kitchen_tickets")
}
```

---

## Summary Cheat Sheet

| Context | Convention | Example |
|---|---|---|
| JS/TS variables | camelCase | `tenantId`, `orderTotal` |
| JS/TS constants | SCREAMING_SNAKE | `MAX_ITEMS`, `JWT_EXPIRY` |
| TS types/interfaces | PascalCase | `OrderStatus`, `CreateOrderParams` |
| React components | PascalCase | `MenuItemCard`, `CartSummary` |
| React hooks | camelCase + `use` prefix | `useCart`, `useKitchenSocket` |
| Files (TS) | kebab-case | `order.service.ts` |
| Files (TSX components) | PascalCase | `MenuItemCard.tsx` |
| DB tables | snake_case plural | `menu_items`, `kitchen_tickets` |
| DB columns | snake_case | `tenant_id`, `created_at` |
| DB enum values | SCREAMING_SNAKE | `'STALL_KIOSK'`, `'ABA_QR'` |
| API paths | kebab-case | `/catalog/menu-items` |
| API JSON keys | camelCase | `{ "tenantId": "..." }` |
| Events | dot-separated past tense | `order.created` |
| Env vars | SCREAMING_SNAKE | `DATABASE_URL` |
| Git branches | kebab-case | `feature/kitchen-ticket` |
