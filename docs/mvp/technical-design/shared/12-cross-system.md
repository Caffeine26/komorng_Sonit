# Cross-System Reference

> **Updated for ADR-008.** All four browser apps connect to the backend via their **own BFF surface only**: storefront → `/api/v1/storefront/*`, kitchen → `/api/v1/kitchen/*`, admin → `/api/v1/admin/*`, platform-admin → `/api/v1/platform-admin/*`. Auth (`/api/v1/auth/*`) is the one cross-cutting exception. No browser frontend ever calls a domain endpoint directly. See `09-decisions-adrs.md` ADR-008 and `folder_structure_and_decision.md` §12.3a.

This document is the definitive reference for how all four apps and the backend connect to each other. It documents the full state machine, real-time event flows, and cross-actor dependencies.

---

## Actors and Surfaces

| Actor | Surface | Device |
| --- | --- | --- |
| **Customer** | Storefront App (mobile web, `/store/{token}`) | Phone (Android/iOS) |
| **Kitchen Staff** | Kitchen App (PWA, `/kitchen`) | Tablet (landscape) |
| **Tenant Owner / Manager** | Merchant Portal (`/admin`) | Laptop, tablet, phone |
| **Platform Admin / Sales Ops** | Platform Portal (`/platform`) | Laptop |

---

## Cross-Actor Connections

```
Platform Admin (Scenario H)
    └─ provisions tenant → sends invite ──────────────────────┐
                                                               ▼
                                                     Tenant Owner (Scenario F) accepts invite
                                                         └─ completes setup
                                                             └─ enters ABA account number (optional)
                                                             └─ generates QR codes ──────────┐
                                                                                              ▼
Customer (Scenarios A/B/C/D/I) scans QR ─────────────── places order
    └─ pays (ABA or cash)                                     │
        └─ ABA: platform PayWay → payout → merchant account   │
        └─ Cash: staff confirms manually                       │
        └─ order confirmed ─────────────────────────── Kitchen Staff (Scenario E)
                                                              └─ prepares + completes ticket
                                                                  │
                                                        Tenant Owner (Scenario G) reviews in orders list
```

---

## Real-Time Event Flows

| Trigger | Transport | Latency | Receiver |
|---|---|---|---|
| Customer submits order | WebSocket `ticket.new` → room `tenant_{id}` | < 2s | Kitchen App |
| Kitchen marks READY | Status page polling `GET /storefront/orders/status/{token}` | 15–20s | Customer (storefront) |
| Kitchen marks READY (Telegram) | BullMQ → Telegram Bot API | < 5s | Customer (Telegram chat) |
| Admin toggles item unavailable | Redis cache DEL `menu:{tenantId}` | Max 5 min (cache TTL) | Customer (next menu load) |
| ABA webhook fires | `POST /webhooks/aba/callback` → verify → status poll | < 2s (next poll) | Customer (payment screen) |
| Customer taps Telegram opt-in | Bot webhook → link `chat_id` to order + tenant | < 2s | Bot confirms to customer |
| Order status changes | BullMQ → Telegram Bot API | < 5s | Customer (Telegram) |

---

## State Machine Summary

| Entity | States | Terminal State |
| --- | --- | --- |
| `order` | `PENDING_PAYMENT → CONFIRMED` (ABA) or `SUBMITTED` (dine-in/cash) or `CANCELLED` | `CONFIRMED` / `CANCELLED` |
| `bill` | `UNPAID → PENDING_PAYMENT → PAID` | `PAID` / `VOIDED` |
| `kitchen_ticket` | `NEW → PREPARING → READY → COMPLETED` | `COMPLETED` / `CANCELLED` |
| `payment_attempt` | `PENDING → SUCCEEDED / FAILED / EXPIRED` | `SUCCEEDED` / `FAILED` |
| `invitation` | `PENDING → ACCEPTED / EXPIRED / REVOKED` | `ACCEPTED` / `EXPIRED` |
| `tenant` | `DRAFT → ACTIVE → SUSPENDED / ARCHIVED` | `ARCHIVED` |
| `order_session` | `ACTIVE → CLOSED` (manual, on bill payment, or TTL expiry) | `CLOSED` |
| `customer_telegram` | `PENDING_CONNECT → CONNECTED → OPTED_OUT` | `OPTED_OUT` |

> **`payment_attempt.external_ref`:** Stores the `tran_id` sent to ABA PayWay at QR generation time. Used to match the incoming webhook callback and to call the ABA Check Transaction API for verification. Format: `PA-{12-char paymentAttemptId}`. Max 20 chars (ABA constraint).

---

## Tenant Isolation Enforcement

Every API surface that operates on tenant data reads `tenant_id` from the JWT claim — never from the request body. This is enforced in:

- **NestJS guards** — `TenantGuard` injects `tenantId` from the access token into the request context
- **Prisma queries** — every query against tenant-scoped tables includes `WHERE tenant_id = ?`
- **WebSocket rooms** — kitchen sockets join `tenant_{id}` on connection, receive events only for their tenant

**Platform Admin** is the only role that can query across tenants. Platform Admin JWTs carry `role: PLATFORM_ADMIN` with no `tenantId` claim; the Platform Admin BFF surface (`/api/v1/platform-admin/*`) does not apply `TenantGuard`.

See `shared/04-auth-rbac.md` for the full RBAC model and JWT structure.

---

## Service Model × Pay Timing Matrix

| `serviceModel` | `payTiming` | Payment screen | Bill creation | Session |
|---|---|---|---|---|
| `STALL_KIOSK` | `PAY_PER_ORDER` | Shown at each order submission | Per order | No session |
| `DINE_IN_TABLE` | `PAY_AFTER_FULFILLMENT` | Shown at bill request at session end | Per table / per session | Yes (`order_session`) |
| `STALL_OPEN_TAB` | `PAY_ON_SESSION_CLOSE` | Not shown on submit; shown only at View Bill | Per session | Yes (`order_session`) |

---

## Shared Infrastructure

| Component | Used By | Purpose |
|---|---|---|
| PostgreSQL | All apps (via API) | Primary data store — orders, billing, menu, tenants |
| Redis | API | Session cache, menu cache, Socket.io adapter, BullMQ, Telegram connect tokens |
| BullMQ | API | Durable job queue — payment jobs, Telegram notifications, email invitations |
| Socket.io | Kitchen App + API | Real-time ticket push — `ticket.new`, `ticket.updated`, `staff.callRequested` |
| Telegram Bot API | Storefront + API | Customer opt-in, transactional order status messages |
| ABA PayWay | Storefront + API | QR payment generation + webhook verification |

---

## WebSocket Events Reference

| Event | Direction | Payload | Room |
|---|---|---|---|
| `ticket.new` | API → Kitchen App | `{ ticketId, orderNumber, tableRef, items, serviceModel }` | `tenant_{id}` |
| `ticket.updated` | API → Kitchen App | `{ ticketId, status, updatedAt }` | `tenant_{id}` |
| `ticket.completed` | API → Kitchen App | `{ ticketId }` | `tenant_{id}` |
| `staff.callRequested` | API → Kitchen App | `{ sessionId, tableRef, serviceModel, sentAt }` | `tenant_{id}` |

The storefront does **not** maintain a persistent WebSocket connection. It uses polling (`GET /storefront/orders/status/{token}` every 15–20s) for order status updates. WebSocket push is exclusively for the kitchen app.
