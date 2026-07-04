# 82 — CRM & Telegram Strategy

This document defines the Single Customer View (SCV) strategy for the platform, using Telegram as the primary customer communication channel for the Cambodian market.

---

## Overview

### The Vision

Every customer who orders through any merchant on the platform becomes a known identity in a central CRM. Over time, the platform can:
- Show customers their full order history across all merchants
- Enable merchants to run targeted promotions to their own customers
- Enable the platform to run cross-merchant campaigns and loyalty programmes

### Why Telegram

Telegram is the dominant messaging layer in Cambodia — adoption is near-universal. This makes Telegram the ideal channel to:
- Deliver transactional order updates (preparing, ready, paid)
- Build a direct, opt-in communication line with customers
- Maintain order history across sessions (solves the browser-close problem without storing anything server-side during the ordering flow)

No additional app download is required. The opt-in flow is 2 taps on a phone the customer already has open.

---

## Customer Identity via Telegram

### How the Customer Connects

The opt-in is triggered **after** payment is confirmed — never during the checkout or payment path.

```
Order confirmed screen
  └─ "Want to receive order updates on Telegram?" prompt
       ├─ [Yes, connect Telegram]  → Platform generates a one-time token
       │                             Deep link: t.me/{botname}?start={token}
       │                             Customer taps → Telegram opens → bot shows START
       │                             Customer taps START  (2 taps total)
       │                             Bot webhook fires → chat_id linked to order + tenant
       │                             Bot replies: "Connected! We'll send your updates here."
       └─ [No thanks]             → Dismissed, no data stored
```

### What Telegram Gives for Free (Zero Friction)

On the customer tapping START, the Telegram Bot API delivers:

| Field | Description | Use |
|---|---|---|
| `chat_id` | Permanent unique identifier per Telegram account | Master customer ID across all merchants |
| `first_name` | From their Telegram profile | Personalised greetings in messages |
| `last_name` | Optional, from profile | Full name if available |
| `username` | Their @handle if set | Optional display reference |
| `language_code` | e.g. `km`, `en` | Auto-detect preferred language for messages |

No form. No typing. No friction beyond the 2-tap flow.

### What is Inferred from Behaviour (Also Zero Friction)

| Behaviour Signal | What It Reveals |
|---|---|
| Which merchant they ordered from | Store affinity |
| Order timestamps | Meal timing preferences (lunch vs dinner, weekday vs weekend) |
| Items ordered | Taste profile, category preferences |
| Order total | Spending bracket |
| Visit frequency | Loyal vs occasional customer |
| Multi-merchant visits | Cross-stall explorer vs single-stall regular |

No questions asked. Everything above is derived from the orders table.

---

## Data Model

```
customer
  id                     Internal master customer ID (UUID)
  telegram_chat_id       From Telegram Bot API on START
  telegram_first_name    From Telegram profile
  language_code          From Telegram (e.g. "km", "en")
  created_at
  opted_out_at           Set when customer blocks the bot (nullable)

customer_merchant_relationship
  customer_id            FK → customer.id
  tenant_id              FK → tenants.id
  first_order_at
  last_order_at
  total_orders           Running count
  total_spend            Running aggregate (USD)

customer_channels                           ← future-proof for multi-channel
  customer_id            FK → customer.id
  channel                Enum: TELEGRAM | WHATSAPP | LINE
  channel_ref            The channel-specific ID (chat_id for Telegram)
  connected_at
  opted_out_at
```

**Key design principles:**
- `customer.id` is the master identity. Telegram is channel 1 of N.
- Merchants **never** receive `chat_id` directly. All messages are sent through the platform API.
- Everything else — favourite items, average order value, visit frequency — is computed from the `orders` table on demand. Do not denormalise in MVP.

---

## The Opt-In UX

| Moment | Behaviour |
|---|---|
| **When shown** | Post-confirmation screen only. After cash order acknowledgement or after ABA payment confirmed. |
| **When NOT shown** | Never during menu browsing, cart review, checkout, or payment steps. |
| **Prompt copy** | "Want to track your orders and get updates on Telegram?" |
| **CTAs** | [Yes, connect Telegram] [No thanks] |
| **If Yes** | Platform generates a one-time token (UUID, 10-min TTL). Button opens `t.me/{botname}?start={token}`. Telegram opens on the customer's phone. Customer taps START. Bot webhook fires. |
| **On START webhook** | `chat_id` linked to token → order → tenant. `customer` record created or matched (by `chat_id`). `customer_merchant_relationship` upserted. Bot sends confirmation message. |
| **Cross-merchant** | MVP: auto-connect if `chat_id` is already in the system (customer has linked Telegram to any prior merchant on the platform). Skip the prompt entirely and reuse the existing identity. The `customer_merchant_relationship` row is upserted silently on first order at the new merchant. |
| **If No / dismissed** | No data stored. Prompt not shown again on this session. |

---

## Transactional Messages — MVP Scope

These messages fire automatically based on order state transitions. No merchant intervention.

| Trigger | Example Message |
|---|---|
| Order submitted (cash) | ✅ Order #ORD-0043 received at Sok's Kitchen<br>Beef Lok Lak ×2, Iced Coffee ×1<br>Total: $19.00 — pay at counter when ready |
| Order submitted (ABA) | ✅ Order #ORD-0042 confirmed at Mekong Kitchen<br>Amok ×2, Spring Rolls ×1<br>Total: $24.00 — payment received |
| Status → PREPARING | 🍳 Kitchen is preparing your order. |
| Status → READY | 🔔 Your order is ready! Pick it up at the counter. |
| Bill paid | 🙏 Payment received. Thank you for dining with us! |

**Rules for transactional messages:**
- Fire on the same event triggers as the existing WebSocket status updates
- Respect `opted_out_at` — skip silently if set
- Handle Telegram 403 (bot blocked): set `opted_out_at = NOW()`, stop retrying
- Message type must be `TRANSACTIONAL` in the system — enforced at API layer

---

## Promotional Messages — Deferred (Not in MVP)

> **Not in MVP.** Define the capability and the guardrails here so it's ready to implement later — promotional messaging requires rate limiting + platform review guardrails and is explicitly deferred.

### How it Works

```
Merchant composes campaign in Admin Portal
  └─ Selects audience: "all my customers" (customer_merchant_relationship)
  └─ Writes message + optional CTA button (e.g. [Order Now] → storefront deep link)
  └─ Submits for send

Platform API
  └─ Validates message type = PROMOTIONAL
  └─ Checks rate limit: max 2 promotional messages per merchant per week
  └─ Queries customer_merchant_relationship WHERE tenant_id = X AND opted_out_at IS NULL
  └─ Queues via BullMQ → sends to each chat_id
```

### Guardrails Required Before Launch

| Guardrail | Rule |
|---|---|
| Rate limiting | Max 2 promotional messages per merchant per week (enforced at API) |
| Platform review | First campaign from each merchant requires platform approval (or at minimum, audit log) |
| Message type enum | `TRANSACTIONAL` vs `PROMOTIONAL` enforced at model level — merchants cannot send TRANSACTIONAL messages directly |
| Inline keyboard limits | Max 2 buttons per message (Telegram limit: 8, but keep UI clean) |
| Content policy | Defined in merchant terms of service before promotional-messages launch |

### Inline Keyboard Buttons

Telegram supports buttons inside messages (inline keyboards). Use for:
- `[Order Now]` → deep link to storefront: `https://storefront.app/store/{qrToken}`
- `[View Menu]` → same deep link to storefront menu
- `[Rate your order]` → future: feedback flow

---

## Permission Model

```
Platform Admin
  ├── Can message ALL opted-in customers (platform-wide announcements)
  └── Can view full customer table and customer_merchant_relationships

Merchant (Tenant Owner / Manager)
  ├── Can trigger messages to their own customers only
  │   (filtered by customer_merchant_relationship.tenant_id)
  ├── Cannot export or access raw chat_ids
  └── Cannot send to customers of other merchants

Customer
  ├── Opt-out: block the bot → platform receives 403 → opted_out_at set automatically
  └── MVP: granular opt-out (promotional vs transactional, per-merchant) via bot command — note that promotional messaging itself is deferred, but the opt-out vocabulary and bot commands are in MVP so opt-outs are honoured the moment promos launch
```

**Platform owns the customer identity.** Merchants receive a scoped permission to communicate through the platform's channel — they never hold the `chat_id` directly. This is the same model as Grab, Shopify, and other platform businesses. Define this clearly in the merchant agreement before onboarding merchants.

---

## Opt-Out Handling

| Event | System Response |
|---|---|
| Customer blocks the bot | Telegram sends `403 Forbidden` on next message attempt. Platform sets `customer.opted_out_at = NOW()`. No further messages sent. |
| Customer unblocks the bot | Telegram does not notify you. On next opt-in flow, `chat_id` already exists — reconnect and clear `opted_out_at`. |
| Customer requests data deletion | Clear `telegram_chat_id`, `telegram_first_name`. Keep anonymised order history (for merchant revenue records). |

---

## What NOT to Collect in MVP

| Data | Reason to Skip |
|---|---|
| Phone number | Telegram Bot API does not expose it. Asking adds friction. |
| Email | No natural collection point in the ordering flow. |
| Birthday | Requires explicit question — adds friction. Skip for now. |
| GPS / location | Privacy red flag. Location is inferred from which merchant they visit. |
| Full order history visible in Telegram chat | Too complex for MVP bot UX — deliver via storefront "View Orders" instead. |

---

## Multi-Channel Future

The data model is designed for expansion. When WhatsApp or Line are added later:

```
customer.id  ←  always the master identity

customer_channels:
  row 1: channel=TELEGRAM, channel_ref=chat_id_123
  row 2: channel=WHATSAPP, channel_ref=+85512345678   (v2.0)
  row 3: channel=LINE,     channel_ref=uid_abc         (v2.0)
```

Message routing logic queries `customer_channels` for the preferred/active channel rather than `customer.telegram_chat_id` directly. Build to this abstraction from day one.

---

## Implementation Notes

| Concern | Decision |
|---|---|
| Bot framework | Telegram Bot API directly (no third-party framework needed for MVP message types) |
| Message queue | BullMQ (already in stack) — queue all outbound Telegram messages; retry on network error, not on 403 |
| Token storage | One-time connect tokens stored in Redis with 10-min TTL |
| Bot rate limits | Telegram allows 30 messages/second per bot — more than sufficient for MVP scale |
| Message language | Use `language_code` from Telegram profile to send in KH or EN; fall back to tenant's `defaultLocale` |
| Webhook security | Validate `X-Telegram-Bot-Api-Secret-Token` header on all bot webhook endpoints |
