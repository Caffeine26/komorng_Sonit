# Storefront — UX Decisions & Screen Design

This document captures the UX decisions for the Storefront, the screen layout, and the interaction rules for each key feature. Junior engineers should read this alongside the e2e scenarios before building any screen.

---

## App Shell

The Storefront is designed to feel like a native app — using CSS and layout design only. No installation prompt, no "Add to Home Screen."

### Why no install?

This is a multi-tenant platform. A customer might visit Sok's Kitchen today and Mekong Kitchen tomorrow. Installing a specific restaurant to the home screen would lock them to one merchant. The QR scan is the correct and natural entry point every time.

### How we achieve the native-app feel

| Technique | What it achieves |
|---|---|
| Fixed bottom navigation bar | Strongest visual signal that "this is an app" |
| Full-height layout (`100dvh`) | Content fills the entire screen — no browser chrome visible |
| Disable pull-to-refresh | Feels native; prevents accidental page refresh |
| Prevent text selection on UI elements | Eliminates the "this is a webpage" feel |
| iPhone notch and home indicator handling | Layout extends properly to screen edges on iOS |
| Minimum 44×44px tap targets | Matches iOS and Android touch standards |
| Smooth slide/fade transitions | Native-feeling navigation between screens |
| Liquid Glass navigation chrome | Translucent blurred nav bar and cart drawer — depth without opacity |

**Performance rule:** The glass blur effect is capped at 12px and applied to navigation chrome only (tab bar, cart drawer, bottom sheets). It is NOT applied to item cards. This keeps scrolling at 60fps on mid-range Android.

**CSS implementation for Liquid Glass surfaces:**

| Surface | CSS |
|---|---|
| Tab bar | `backdrop-filter: blur(12px)` + `background: rgba(255,255,255,0.15)` (dark: `rgba(0,0,0,0.25)`) |
| Cart drawer | Same glass surface + `border-top: 1px solid rgba(255,255,255,0.2)` |
| Bottom sheets | Same glass surface |
| Item cards | **Solid background only** — glass is reserved for chrome |
| Reduced-motion fallback | Disable blur animation; use solid semi-transparent fill on devices without `backdrop-filter` |

**CSS layout rules for native-app feel:**

| Property | Value | Why |
|---|---|---|
| Body height | `100dvh`, `overflow: hidden` on shell | Full-screen layout |
| Bottom nav | `position: fixed; bottom: 0` | Persistent like a native app |
| Scroll bounce | `overscroll-behavior: none` | Disables pull-to-refresh |
| Text selection | `-webkit-user-select: none` on UI elements | Removes "webpage" feel |
| Safe area — bottom | `env(safe-area-inset-bottom)` on bottom nav | Clears iPhone home indicator |
| Safe area — top | `env(safe-area-inset-top)` on top bar | Clears iPhone notch |
| Viewport | `viewport-fit=cover` in meta tag | Extends into notch/safe areas |

---

## Screen Layout

```
┌──────────────────────────────────────┐
│  [Restaurant Name + Logo]  [KH/EN]   │  ← Top bar
│                              [Help?] │
├──────────────────────────────────────┤
│                                      │
│         Main content area            │
│                                      │
│         Menu / Order Status /        │
│         Order History / Help         │
│                                      │
│                          [ 🛒  2 ]   │  ← Floating cart button
│                                      │
└──────────────────────────────────────┘
│  [ Menu ]  [ My Orders ]  [ Help ]   │  ← Bottom navigation (glass)
└──────────────────────────────────────┘
```

---

## Bottom Navigation

Three tabs only. Three is the maximum — more creates cognitive load on a small screen. The cart is a floating button, not a nav tab.

| Tab | Always Visible | Badge |
|---|---|---|
| **Menu** | Yes | — |
| **My Orders** | Yes | Red dot when any active order is READY |
| **Help / Call Staff** | Yes (can be disabled per merchant) | — |

---

## Menu Layout Rules

Menu layout is chosen automatically based on the number of categories. Merchants do not configure this.

| Category Count | Layout |
|---|---|
| 0–1 categories | 2-column flat grid — no category navigation |
| 2+ categories | Category tabs shown at the top of the menu |

This covers the common cases cleanly. "See All" across categories is in MVP scope.

---

## Search Bar

- Collapsible bar at the top of the menu screen
- Client-side only: filters the menu items already loaded on screen
- Searches the active locale only (if language is set to Khmer, search runs against Khmer names)
- Empty state: "No items found for '[query]'." with a clear button

**What this means for engineers:** There is no search API call in MVP. `GET /storefront/{tenantId}/menu` returns all items for both locales. The search filter runs in the browser against that already-loaded payload — no additional request is made. Server-side search remains deferred (not in MVP).

---

## Item Cards — Two Interaction Zones

Each item card has two distinct tap targets:

| Tap Target | What Happens |
|---|---|
| **+ button** | Quick-add: item added to cart instantly. No detail page. |
| **Item image** | Opens the item detail sheet (slides up from bottom) |
| **Item name or price** (no image available) | Opens the item detail sheet (same behaviour as tapping image) |

After the first add, the **+** button is replaced by `− N +` inline quantity controls directly on the card. The customer can increment and decrement without leaving the menu. Decrementing to 0 removes the item from the cart.

---

## Item Detail Sheet

Slides up from the bottom of the screen. Contains:
- Large item photo (or placeholder if no image)
- Item name in both English and Khmer
- Description (if available)
- Price
- Quantity controls (`− N +`)
- **Add to Cart** button

Tapping outside the sheet, or swiping it down, dismisses it without adding to the cart.

---

## Cart Behaviour

| Rule | Detail |
|---|---|
| Cart is in-memory only | Not saved to device storage. Lost on page refresh. |
| Cart is per-device | Each phone has its own cart, even at the same dine-in table. |
| Cart is cleared on successful order submission | Customer starts fresh after each order. |
| Empty cart state | "Your cart is empty" — Checkout button is hidden. |

The cart is intentionally not persisted. Ordering sessions are short. The trade-off is acceptable for MVP.

**What IS saved to `localStorage`:** After a successful order submission, only a slim reference is stored — NOT the full cart.

```json
// localStorage key: "orders:{tenantId}"
[
  {
    "orderId": "uuid",
    "orderNumber": "ORD-0043",
    "submittedAt": "2024-11-15T10:23:00.000Z"
  }
]
```

Rules: 5h TTL per entry · max 20 entries · no PII (no name, no payment details) · expired entries pruned on mount.

---

## Checkout and Payment

The checkout flow is two steps:

1. **Cart review** — customer sees all items, quantities, and total. Can remove items.
2. **Payment selection** — customer chooses Cash or ABA QR based on what the merchant supports.

**For dine-in and open-tab models:** There is no payment step at order submission. Customer taps "Submit Order" directly — payment happens at the end of the session.

**ABA QR payment screen:**
- KHQR code displayed prominently
- "Open ABA Pay" button (deep link to the ABA app)
- 5-minute countdown timer
- App polls for payment confirmation every 2 seconds (up to 90 seconds max)

---

## Order Confirmation Screen

Shown immediately after a successful order submission. Contains:
- Order number (e.g. ORD-0043)
- Items ordered
- For kiosk + cash: total to pay and where to pay
- For kiosk + ABA: confirmation that payment was received
- Live status bar (Received → Preparing → Ready)
- Telegram opt-in prompt (below the confirmation — never during payment)
- **Order More** button (for dine-in and open-tab models)

---

## Order Status Tracking

On the order status page:
- Progress bar: **Received → Preparing → Ready → Completed**
- Status updates every 15–20 seconds (polling via `GET /storefront/orders/status/{orderId}`)
- When Ready: in-app banner slides in from the top, device vibrates, **[My Orders]** tab shows a red badge
- Polling stops once the READY or COMPLETED state is received

The status page is accessible by:
- Tapping "Track your order" on the confirmation screen
- Tapping any order row in the **[My Orders]** tab

---

## My Orders Tab

Lists all orders placed from this device during the current visit.

```
My Orders

─────────────────────────────
🟢 ORD-0043  ●  READY          ← green pulsing dot, shown first
   Beef Lok Lak ×2, Iced Coffee ×1
   $19.00  ·  8 min ago
   [ View Details ]
─────────────────────────────
⚪ ORD-0041  ·  COMPLETED
   Amok ×1, Rice ×1
   $12.00  ·  2 hours ago
   [ View Details ]
─────────────────────────────
```

- READY orders are highlighted and shown at the top regardless of time
- Orders older than 5 hours are automatically pruned and not shown
- Empty state: "No recent orders on this device. Scan a QR code to start ordering."
- The list only shows orders from the current merchant — never from other stalls

---

## Telegram Opt-In

The prompt appears once per session on the confirmation screen after order submission. Never shown during checkout, payment, or browsing.

**Two taps total:**
1. Customer taps "Yes, connect Telegram" → Telegram opens with a pre-filled START command
2. Customer taps START

Once connected, the Telegram bot sends:
- Order status updates (Preparing, Ready, Paid)
- No promotional messages in MVP

If the customer connects Telegram, do NOT show a browser push notification prompt. They already have their notification channel.

---

## Call Staff Bell (Dine-In)

Located in the **[Help]** tab of the bottom navigation. Tapping opens a confirmation sheet:

```
🔔 Call a staff member?

A staff member will come to
your table shortly.

[ Yes, call staff ]
[ Cancel ]
```

After confirming:
- Customer sees: "Staff has been notified." with a checkmark
- Button is disabled for 2 minutes (cooldown) to prevent repeat pings

What staff sees in the kitchen app: a persistent alert card at the top of the board — visually distinct from food tickets.

**API:** `POST /storefront/sessions/{sessionId}/call-staff` with payload `{ tableRef, serviceModel, sentAt }`. Server emits WebSocket event `staff.callRequested` → room `tenant_{id}` → kitchen app.

---

## First-Visit Onboarding Guide

A 3-slide swipeable overlay appears on the first visit to a new merchant. Triggered once per merchant per device. The **[?]** button in the top bar makes it accessible again at any time.

| Slide | Message |
|---|---|
| 1 | "Welcome to [Restaurant Name]. You're ready to order." |
| 2 | "Browse the menu and tap + to add items to your cart." |
| 3 | "Submit your order and track it live right here." |

- Swipe left/right or tap dots to navigate
- **[Skip]** button always visible
- **[Got it]** on the last slide dismisses and marks guide as seen
- Loads behind the onboarding overlay — menu is ready when guide is dismissed
- Copy adapts to the merchant's default language (Khmer or English)

---

## Language Toggle

- One-tap toggle in the top bar: **KH / EN**
- Switching is instant — no page reload
- Cart state is preserved during the switch
- Menu content for both languages is loaded on app start — no re-fetch needed
- If a translation is missing for an item, the Khmer name is shown as fallback

---

## MVP vs Deferred

| Feature | Status |
|---|---|
| Full-screen mobile layout (CSS) | MVP |
| Three-tab bottom navigation | MVP |
| Auto-layout by category count | MVP |
| Quick-add + inline quantity controls | MVP |
| Item detail sheet | MVP |
| In-memory cart only | MVP |
| Collapsible search bar (client-side) | MVP |
| Order status tracking (polling) | MVP |
| In-app READY banner + vibration | MVP |
| My Orders tab | MVP |
| Call Staff bell | MVP |
| First-visit onboarding overlay | MVP |
| Telegram opt-in | MVP |
| iPhone notch / safe area handling (CSS) | MVP |
| Item options and modifiers (size, spice level) | MVP — **requires schema work, see TODO in `shared/02-database-schema.md`** |
| Code-entry ordering mode | MVP — **requires `menu_items.item_code` field, see TODO in `shared/02-database-schema.md`** |
| Browser push notifications | MVP — requires service worker |
| "See All" tab on categorised menus | MVP |
| Shared/merged cart across devices | MVP |
| Server-side menu search | Deferred (not in MVP) |
