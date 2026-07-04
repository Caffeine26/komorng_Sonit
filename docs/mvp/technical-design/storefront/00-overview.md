# Storefront — Product Overview

> **Architecture (ADR-008):** The storefront is the customer-facing browser frontend. It calls **only** its own BFF surface at `/api/v1/storefront/*` (implemented in `backend/api/src/modules/storefront/`) plus the cross-cutting `/api/v1/auth/*`. It imports types from `@xfos/contracts-bff-storefront` and has no knowledge of raw domain shapes.

## What Is the Storefront?

The Storefront is the customer-facing mobile web app. Customers reach it by scanning a QR code at a food stall or restaurant table. No app download or account required — the experience opens directly in the phone browser.

The design goal is to feel like a native mobile app: fast, smooth, and intuitive. Every screen and interaction decision is made with that standard in mind.

---

## Who Uses It

Anyone who scans a QR code at a table, counter, or stall entrance. Customers may be first-time users every single visit. The app must be self-explanatory — assume zero prior knowledge.

---

## Target Device

| Attribute    | Detail                              |
| ------------ | ----------------------------------- |
| Primary      | Android phone (mid-range, ~4GB RAM) |
| Secondary    | iPhone (Safari)                     |
| Screen width | 360px–430px                         |
| Connection   | 4G or weak WiFi — variable speed    |

Always design and test on a mid-range Android first. Performance on cheap devices matters more than performance on premium devices.

---

## How Customers Get There

Every session begins with a QR scan. The merchant places a QR code at the table, counter, or stall. Scanning opens the app directly — no URL to type, no search involved.

There is no other entry point. If someone visits the root URL directly (without scanning), they see: _"Scan a QR code to start ordering."_

**Entry point URL:**

```
https://storefront.app/store/{qrToken}
```

The `qrToken` is a permanent, merchant-scoped token. On load, the app calls `GET /storefront/context/{qrToken}` to resolve the token into a tenant context (`tenantId`, `serviceModel`, `paymentMethods`, `defaultLocale`). The menu is then fetched separately. If the token is invalid or the tenant is suspended, the app renders an error page rather than the menu.

---

## Key Features

| Feature          | What the Customer Can Do                                                      |
| ---------------- | ----------------------------------------------------------------------------- |
| Browse menu      | See all available items with photos, Khmer/English names, and prices          |
| Search           | Find items by typing a keyword in either Khmer or English                     |
| Add to cart      | Tap **+** on any card for a quick add, or tap the item image for full details |
| Submit order     | Review cart, add an optional note, and confirm                                |
| Pay — cash       | Choose cash; pay at the counter or end of meal                                |
| Pay — ABA QR     | Scan a QR code in the ABA app to pay digitally                                |
| Track order      | See live status updates: Received → Preparing → Ready                         |
| Connect Telegram | Optional: receive status updates as Telegram messages                         |
| View past orders | See orders from the current visit without scrolling back                      |
| Call for help    | Send a "need assistance" signal to staff (dine-in service model)              |
| Session recovery | Rescan the QR to find an order after the browser was closed                   |

---

## Service Models

The app behaviour adapts based on how the merchant has set up their service. The customer doesn't configure this — it's detected automatically from the QR code.

| Model              | What This Means for the Customer                                          |
| ------------------ | ------------------------------------------------------------------------- |
| **Stall Kiosk**    | Pay before food is prepared. Kiosk-style — each order is independent.     |
| **Dine-In Table**  | Order freely during the meal. Pay the combined bill at the end.           |
| **Open-Tab Stall** | Order multiple rounds informally; pay once when done. Like a running tab. |

---

## Languages

| Language       | Default?                       | Notes |
| -------------- | ------------------------------ | ----- |
| Khmer (`km`)   | Yes — shown on first load      |       |
| English (`en`) | No — toggle available any time |       |

Switching language is instant — no page reload. If a translation is missing for an item, the Khmer name is shown as fallback.

---

## MVP Scope

The following is in scope for the first release:

- All three service models (Kiosk, Dine-In, Open-Tab)
- Menu browsing with category layout
- Client-side keyword search
- Cart management (in-memory — not saved on refresh)
- Cash and ABA QR payment
- Live order status tracking
- Telegram opt-in after order confirmation
- Order history for the current visit
- Call Staff bell (dine-in model)
- First-visit onboarding guide

## MVP Feature Notes

These storefront features are in MVP scope per PRD §1.3. Engineering notes only:

| Feature                                                 | Engineering Note                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Item options and modifiers (size, spice level, add-ons) | **Requires schema work.** Add `item_option_groups`, `item_option_values`, `cart_items.option_selections`. See TODO in `../shared/02-database-schema.md`. |
| Code-entry ordering mode                                | **Requires schema work.** Add `menu_items.item_code` field + merchant setup UI. See TODO in `../shared/02-database-schema.md`. |
| Browser push notifications                              | Requires a service worker on the storefront app.                                                                          |
| Shared/merged cart across multiple phones               | Requires cart sync by session or QR context. Dine-in sessions already carry a session id — reuse that.                   |
| "See All" tab on categorised menus                      | UI-only. Wire into the existing category tabs component.                                                                  |

## Deferred (Not in MVP)

| Feature                  | Why Deferred                                            |
| ------------------------ | ------------------------------------------------------- |
| Server-side menu search  | Client-side filter is sufficient for typical menu sizes |

---

## Technical Reference (Quick Facts for Engineers)

| Fact                    | Detail                                                                      |
| ----------------------- | --------------------------------------------------------------------------- |
| Entry point URL         | `https://storefront.app/store/{qrToken}`                                    |
| Context API             | `GET /storefront/context/{qrToken}`                                         |
| Menu API                | `GET /storefront/{tenantId}/menu` (Redis-cached, 5-min TTL)                 |
| Order submit API        | `POST /storefront/orders`                                                   |
| Payment status poll     | `GET /billing/bills/{billId}/payment-status` — every 2s, max 90s            |
| Order status poll       | `GET /storefront/orders/status/{orderId}` — every 15–20s                    |
| localStorage key        | `orders:{tenantId}` — stores `[{ orderId, orderNumber, submittedAt }]`      |
| localStorage TTL        | 5 hours per entry; max 20 entries; no PII stored                            |
| Real-time updates       | WebSocket room `tenant_{id}` for kitchen; short-poll fallback for customers |
| Service model constants | `STALL_KIOSK` · `DINE_IN_TABLE` · `STALL_OPEN_TAB`                          |
| Pay timing constants    | `PAY_PER_ORDER` (kiosk) · `PAY_ON_SESSION_CLOSE` (open-tab / dine-in)       |

---

## Related Documents

| Document                                                 | What's In It                                          |
| -------------------------------------------------------- | ----------------------------------------------------- |
| [01-e2e-scenarios.md](./01-e2e-scenarios.md)             | Step-by-step customer journeys for all service models |
| [02-user-flows.md](./02-user-flows.md)                   | Flow diagrams for the main customer paths             |
| [03-home-design.md](./03-home-design.md)                 | UX decisions: screens, interactions, and design rules |
| [07-ux-review.md](./07-ux-review.md)                     | Key product decisions and the rationale behind them   |
| [04-nextjs-architecture.md](./04-nextjs-architecture.md) | _(Technical)_ Next.js app structure and routing       |
| [05-crm-telegram.md](./05-crm-telegram.md)               | _(Technical)_ Telegram bot integration                |
| [06-api-contracts.md](./06-api-contracts.md)             | _(Technical)_ API endpoints the Storefront calls      |
