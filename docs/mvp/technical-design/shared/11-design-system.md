# 16 — Design System & UI Specifications

> Decisions made in `/plan-design-review` session on 2026-03-25.
> These specifications apply to all product surfaces. Implementers must not deviate without updating this document.

---

## Typography

### Fonts

| Usage | Font | Source | Notes |
|---|---|---|---|
| English / Latin | **Inter** | `next/font/google` | Default weight: 400/500/700. Variable font. |
| Khmer script | **Noto Sans Khmer** | `next/font/google` | Subset to Unicode range U+1780–U+17FF. |

**Loading strategy:** Both fonts loaded via `next/font` for zero layout shift. Both fonts apply `font-display: swap`.

**Khmer-specific rules:**
- Minimum `line-height: 2` (or Tailwind `leading-loose`) for any Khmer text block.
- Subscript characters (coeng forms) must not be clipped — never use `overflow-hidden` on a single line of Khmer text without adequate `line-height`.
- Button and label strings in Khmer are typically 10–20% longer than English equivalents. All button widths must accommodate text wrapping or have a minimum width that fits the longer Khmer equivalent.
- Tested device target: Android 10+ with Chrome. System font fallback for Khmer is `Khmer OS Siemreap`.

---

## Color System

### Platform Default Colors

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#E07B39` | Primary CTA, active chips, brand accent |
| `--color-primary-foreground` | `#FFFFFF` | Text on primary backgrounds |
| `--color-warning` | `#F59E0B` | Kitchen ticket aging threshold |
| `--color-destructive` | `#DC2626` | Errors, destructive actions |
| `--color-success` | `#16A34A` | Live status, payment confirmed |
| `--color-muted` | `#6B7280` | Sold-out items, secondary text |

**Merchant customization:** The `--color-primary` token is overridden per-tenant using the `theme.primaryColor` value from the storefront context API response. All other tokens remain platform defaults.

**CSS variables** must be defined in `globals.css` using the shadcn/ui token convention. Never hardcode hex values outside of this file.

### Contrast Requirements (WCAG AA)

- Body text on white: minimum 4.5:1 ratio
- Large text (≥24px or bold ≥18.67px): minimum 3:1 ratio
- UI components (buttons, inputs, focus rings): minimum 3:1 ratio
- Sold-out items use `--color-muted` on white: must meet 3:1 minimum

---

## Spacing & Touch Targets

- **Minimum touch target:** 44×44px for all tappable elements on mobile and tablet
- **Spacing scale:** Use Tailwind default spacing scale (4px base unit)
- **Card padding:** `p-4` (16px) minimum on all interactive cards

---

## Accessibility Baseline

All custom components must meet these minimum requirements:

1. **Contrast:** 4.5:1 for normal text, 3:1 for large text and UI components
2. **Touch targets:** 44px minimum on mobile and tablet surfaces
3. **Focus visible:** All interactive elements must have a visible focus ring (use `focus-visible:ring-2` Tailwind class). Never suppress focus outlines.
4. **ARIA labels:** All icon-only buttons must have `aria-label` attributes
5. **ARIA landmarks:** Each page must use semantic HTML landmarks (`<header>`, `<main>`, `<nav>`, `<footer>`)

---

## Customer Storefront — UI Specifications

### Layout Shell

```
┌─────────────────────────────────┐
│ [Logo] Restaurant Name  EN|KH   │  ← sticky header (56px)
│ Language toggle: top-right      │
├─────────────────────────────────┤
│ [Cat 1] [Cat 2] [Cat 3] [...]   │  ← sticky category chips (horizontal scroll)
├─────────────────────────────────┤
│  (item cards scroll here)       │
│                                 │
│                                 │
├─────────────────────────────────┤
│ █ N items  View Cart →  $XX.XX  │  ← sticky bottom bar (appears when cart > 0)
└─────────────────────────────────┘
```

### Category Navigation
- Pattern: **sticky horizontal chips** (scroll horizontally if > 5 categories)
- Active chip: filled with `--color-primary`, white text
- Inactive chip: outlined, neutral text
- On scroll: category chip auto-activates when its section scrolls into view

### Item Cards
- Pattern: **image-left horizontal card**
- Image: 80×80px thumbnail, `object-cover`, rounded corners (`rounded-md`)
- Image fallback: neutral gray placeholder (`bg-muted rounded-md`)
- Item name: font-medium, max 2 lines, truncate with ellipsis
- Description: text-sm text-muted, max 2 lines, truncate
- Price: font-semibold, right-aligned
- Tap target: full card is tappable, opens item detail sheet

### Sold-Out Items
- Sold-out items **remain visible** on the menu
- Appearance: 50% opacity on image, `--color-muted` text, `[SOLD OUT]` / `[អស់ស្តុក]` badge
- Not tappable: `pointer-events-none`
- Position: sorted to bottom of their category section

### Cart Bottom Bar
- Appears as soon as cart has 1+ item
- Content: item count chip | "View Cart" label | running total (right)
- Background: `--color-primary`
- Text: `--color-primary-foreground` (white)
- Height: 56px minimum (touch-safe)

### Loading State (First Load)
- Header renders immediately with restaurant name (from QR context, resolved server-side)
- Category chips: pulsing skeleton placeholders (3–4 chips)
- Item area: 3 skeleton item cards pulsing

### Error State: Invalid QR
- Full screen, centered: "This QR code is not valid." / "QR code នេះមិនត្រឹមត្រូវទេ"
- Subtext: "Please ask staff for the correct QR code."
- No navigation, no retry (QR is invalid, not a network error)

### Error State: Menu Unavailable
Shown when the menu API call fails (DB unavailable, network error) after the QR context has loaded.
The restaurant name and logo are already available from the QR context, so show them.
- Restaurant logo (top center, from `qr_context.theme.logoUrl`)
- Heading: "Menu temporarily unavailable" / "ម៉ឺនុយមិនអាចប្រើបានឥឡូវនេះ"
- Subtext: "Please ask our staff to assist you." / "សូមទំនាក់ទំនងបុគ្គលិករបស់យើង"
- NO retry button — the menu will reload automatically when the error resolves
- Background: white, centered content, `--color-muted` text

### Error State: Items No Longer Available (Order Rejection)
Shown when order submission returns `ITEM_UNAVAILABLE`.
- Inline banner at top of cart: `--color-warning-bg` (#FEF3C7) background, amber text
- "Some items are now sold out:" followed by item names as a bullet list
- Below the banner: updated cart without the unavailable items
- CTA: "Update Order" button re-submits without the removed items
- Removed items shown in the cart view with a strikethrough + "[Sold Out]" label

### Order Confirmation Screen
```
┌─────────────────────────────────┐
│                                 │
│    ✔  Order Received            │  ← success icon + heading
│                                 │
│  ┌──────────────────────────┐   │
│  │         ORD-042          │   │  ← order number, 48px bold
│  └──────────────────────────┘   │
│                                 │
│  [Kiosk copy]:                  │
│  "Please pay at the counter     │
│   when your order is called."   │
│                                 │
│  [Dine-in copy]:                │
│  "Your food is being prepared.  │
│   We'll bring it to your table."│
│                                 │
│  ▾ 2 items — $7.50 total        │  ← collapsible receipt
└─────────────────────────────────┘
```

### Dine-In: Second Round
- After order confirmation, show an "Order More" button/link: "Add more items →" / "បន្ថែមមុខអាហារ →"
- This resumes the same session and returns to the menu with an empty cart

### Currency
- USD only in MVP (`$` prefix, 2 decimal places)
- KHR equivalent display deferred to Phase 2

---

## Kitchen App — UI Specifications

### Target Device & Orientation
- **Primary:** Tablet, landscape (1024×768 or 1280×800)
- **Fallback:** Portrait tablet — stack columns vertically, one column visible at a time with swipe/tab navigation

### Kanban Layout
```
┌───────────────────────────────────────────────────────────┐
│  Kitchen  ● LIVE  [T-007 T-006 T-005]   10:45 AM  [Logout]│  ← header
├───────────────────────────────────────────────────────────┤
│   NEW (3)         PREPARING (2)         READY (1)          │  ← column headers with count
│  ┌─────────┐      ┌─────────┐          ┌─────────┐        │
│  │         │      │         │          │         │        │
│  │ tickets │      │ tickets │          │ tickets │        │
│  │ scroll  │      │ scroll  │          │ scroll  │        │
│  └─────────┘      └─────────┘          └─────────┘        │
└───────────────────────────────────────────────────────────┘
```
- Each column scrolls independently
- Column headers show ticket count badge: `NEW (3)`

### Ticket Card Anatomy
```
┌──────────────────────────────┐
│ T-007  │  Table 5  │  4 min  │  ← row 1: ticket # | table ref | elapsed (bold)
├──────────────────────────────┤
│ Beef Lok Lak           x2    │  ← items, quantity right-aligned
│  └ no onion                  │  ← notes indented under item
│ Iced Coffee            x1    │
│  └ less sweet                │
├──────────────────────────────┤
│     [ Start Preparing → ]    │  ← CTA button, full width
└──────────────────────────────┘
```

**Card states:**
- **Normal:** neutral border
- **Warning (>5 min in NEW):** `border-warning` (amber/orange) — visual nudge only, no sound
- **Overdue (>10 min in NEW):** border pulses (CSS animation)

**CTA labels by status:**
- `NEW` → "Start Preparing →"
- `PREPARING` → "Mark Ready ✓"
- `READY` → "Mark Completed ✓"

**Khmer CTA labels:**
- `NEW` → "ចាប់ផ្តើមរៀបចំ →"
- `PREPARING` → "ត្រៀមរួចរាល់ ✓"
- `READY` → "បានបញ្ចប់ ✓"

### Empty Queue State
- All three columns remain visible with their headers
- Each empty column shows centered: "All clear" / "អស់ហើយ"
- Connection status indicator remains prominent (green ● LIVE)

### Connection Status
- **LIVE:** `● LIVE` green dot in header
- **CONNECTING:** `◌ Connecting...` amber, animated
- **DISCONNECTED:** full-width red banner: "Connection lost. Tickets may be outdated. Reconnecting..." — banner stays until reconnected

### Audio Alert
- New ticket arrival: browser notification sound (user must grant audio permission on first login)
- Alert plays once + visual flash (column border flashes)
- If browser audio is blocked: visual flash only, permission request prompt shown once

---

## Tenant Admin Portal — UI Specifications

### Navigation
- Left sidebar, fixed width 240px
- Items: Dashboard | Menu | QR Codes | Settings | Team

### First Login State (Dashboard)
```
┌──────────────────────────────────────────────────────┐
│ Sidebar │ ┌────────────────────────────────────────┐ │
│         │ │  Welcome, Koh Pich Noodles!           │ │
│Dashboard│ │  Complete your setup to go live (0/6)  │ │
│Menu     │ │  [Start Setup →]          [Skip]       │ │
│QR Codes │ └────────────────────────────────────────┘ │
│Settings │  Storefront: ○ OFFLINE  |  Menu: 0 items   │
│Team     │  QR Codes: 0 active                        │
└──────────────────────────────────────────────────────┘
```

### Setup Checklist (6 steps)

| # | Step | Condition for completion |
|---|---|---|
| 1 | Business Profile | Name, description saved |
| 2 | Service Model | KIOSK or DINE_IN_TABLE selected |
| 3 | Menu | ≥1 category and ≥1 item created |
| 4 | Translations | ≥1 item has Khmer translation |
| 5 | QR Codes | ≥1 QR code generated |
| 6 | Go Live | Steps 1–5 complete |

**Step completion:** checked in real-time via `GET /admin/tenant/setup-progress` API.

### Go Live Celebration
When step 6 is reached (all 5 prerequisites complete):
```
┌────────────────────────────────────────────────────────┐
│ ████████████████████████████████████████████████████   │  ← success green banner
│  ✔  Koh Pich Noodles is now LIVE!                      │
│  Your storefront is ready for customers.               │
│  storefront.domain.com/store/{token}                   │
│  [ View Storefront ]   [ Copy Link ]                   │
│ ████████████████████████████████████████████████████   │
└────────────────────────────────────────────────────────┘
```

### Empty States

| Section | Empty state message |
|---|---|
| Menu → Categories | "No categories yet. [+ Add your first category]" |
| Menu → Items | "No items in this category. [+ Add item]" |
| QR Codes | "No QR codes yet. [+ Generate QR Code]" |
| Team | "Only you so far. [+ Invite a team member]" |
| Orders | "No orders yet. Orders will appear here once your storefront is live." |

---

## QR Code Download Template

**File:** PNG, 1200×1200px, 300 DPI (print-ready)

**Template layout:**
```
┌────────────────────────────────────────┐
│          [Restaurant Logo]             │
│          Restaurant Name               │
│                                        │
│    ┌──────────────────────────────┐    │
│    │                              │    │
│    │         [ QR CODE ]          │    │
│    │          300×300px           │    │
│    │                              │    │
│    └──────────────────────────────┘    │
│                                        │
│   Scan to order / ស្កែនដើម្បីកម្ម  │
│          [Table 5]  ← if dine-in       │
└────────────────────────────────────────┘
```

---

## Rendering Strategy Update

| Page | Rendering | Reason |
|---|---|---|
| Storefront menu | **Dynamic (SSR)** | Immediate availability consistency. No ISR. |
| Cart | Client-only | User state, no server needed |
| Checkout | Client Component | Payment interaction |
| Order confirmation | Server (dynamic) | Real-time order status |
| Admin dashboard | Server (dynamic) | Always fresh data |
| Admin menu editor | Client Component | Form interactions |
| Kitchen queue | Client Component | WebSocket, real-time |
| Platform admin | Server (dynamic) | Fresh data, internal tool |

> **Note:** This overrides the `Storefront menu: Static/ISR (60s)` entry in `03-nextjs-architecture.md`.
> The ISR approach was incompatible with the requirement for immediate availability toggle effect.
> Use `revalidatePath('/store/[token]')` for non-availability updates (e.g., menu reorder, price changes)
> where a short lag is acceptable.

---

## What Is NOT in Scope (Deferred)

| Item | Deferred to |
|---|---|
| KHR currency display | Phase 2 |
| Motion / animation spec | Post-MVP design polish |
| Dark mode | Not planned |
| Merchant theme builder (beyond primary color) | Phase 3 |
| Customer-facing order history | Phase 3 |

> **ABA QR waiting state and countdown timer are in MVP.** Per PRD §1.2.1, both cash and ABA QR digital payment are in MVP scope. The ABA QR screen (QR image, amount, countdown, cancel, retry) must be designed and built in MVP. See `10-aba-payment.md` for the payment flow contract.
