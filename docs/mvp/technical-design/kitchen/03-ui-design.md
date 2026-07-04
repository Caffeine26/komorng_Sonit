# Kitchen App (KDS) — UI Design

## Device & Environment

| Attribute | Detail |
|---|---|
| Target device | 10" Android tablet (e.g. Samsung Galaxy Tab A8, Lenovo Tab M10) |
| Orientation | Landscape only — the app enforces this |
| Mounting | Wall-mounted or counter-standing; touchscreen interaction at arm's reach |
| Usage pattern | Persistent all-day use; one device per kitchen station, running as an installed PWA |
| Ambient conditions | Kitchen environment — grease, steam, noise; large touch targets required (min 48px) |
| Brightness | Screen typically at full brightness; UI must be readable under harsh lighting |

---

## App Type: Installed PWA

The Kitchen App is installed to the Android home screen as a Progressive Web App. This means:

- Runs in standalone mode (no browser chrome)
- Persistent across power cycles — the tablet boots back into the app
- Receives WebSocket push updates in the foreground
- Does NOT require offline capability beyond the already-loaded shell; all data is real-time from the server

The app does not support multi-device simultaneous login for the same kitchen station. Token refresh is silent and automatic.

---

## Layout: Three-Column Kanban Board

The primary screen is a three-column board filling the full landscape viewport. There is no sidebar, no navigation drawer, and no secondary screens during active service — everything kitchen staff needs is on this one screen.

```
┌─────────────────────────────────────────────────────────────────┐
│  [XFOS Kitchen]           Station: Main Kitchen    [Logout]     │
├───────────────────┬──────────────────────┬──────────────────────┤
│      NEW          │      PREPARING        │       READY          │
│  (blue / neutral) │      (amber)          │    (green pulsing)   │
│                   │                       │                      │
│  [Ticket card]    │  [Ticket card]        │  [Ticket card]       │
│  [Ticket card]    │                       │  [Ticket card]       │
│                   │                       │                      │
└───────────────────┴──────────────────────┴──────────────────────┘
```

- Each column is independently scrollable
- Column headers are sticky and always visible
- Columns are equal width (33.3% each)
- No horizontal scroll — if a column overflows vertically, it scrolls independently

---

## Ticket Card Design

Each ticket is a card within its column. Cards are ordered by submission time, oldest at the top.

### Card Anatomy

```
┌──────────────────────────────┐
│  #T5-004          ⏱ 3m 22s  │  ← Order number + elapsed time
│  TABLE T5                    │  ← Table ref ("Counter" for kiosk)
├──────────────────────────────┤
│  2x  Amok Fish               │
│  1x  Jasmine Rice            │
│  1x  Iced Coffee             │
├──────────────────────────────┤
│  Note: no chili on the amok  │  ← Optional customer note (if present)
├──────────────────────────────┤
│  [ Start Preparing ]         │  ← Primary action button
└──────────────────────────────┘
```

### Card Fields

| Field | Description |
|---|---|
| Order number | Short human-readable reference (e.g. `T5-004`) |
| Table ref | Table label from QR context, or "Counter" for stall kiosk orders |
| Items list | Each line: `{qty}x {item name}` — no prices shown |
| Customer note | Free-text note submitted with the order; shown only if non-empty |
| Elapsed time | Time since the order was submitted, updating every 30 seconds |
| Action button | Column-specific CTA (see Actions section) |

### Card Sizing

- Minimum card height: 120px
- Font size for item names: 16px (readable at arm's reach)
- Action button height: 48px minimum
- Card margin between cards: 12px

---

## Color System

Color is the primary communication mechanism. Kitchen staff must be able to read status at a glance from across the station.

| Column | Status | Background | Border | Label color |
|---|---|---|---|---|
| NEW | Ticket just arrived | `#EFF6FF` (blue-50) | `#3B82F6` (blue-500) | `#1E40AF` (blue-800) |
| PREPARING | In progress | `#FFFBEB` (amber-50) | `#F59E0B` (amber-400) | `#92400E` (amber-900) |
| READY | Done, awaiting pickup/serve | `#F0FDF4` (green-50) | `#22C55E` (green-500) — pulsing | `#166534` (green-800) |

### Elapsed Time Color Escalation (within NEW column)

As time passes without action, the elapsed time indicator changes color to indicate urgency:

| Elapsed | Indicator color |
|---|---|
| 0 – 3 min | `#6B7280` (gray-500) — neutral |
| 3 – 6 min | `#F59E0B` (amber-500) — warning |
| 6+ min | `#EF4444` (red-500) — urgent |

### READY Column Pulse Animation

Cards in the READY column have a subtle green border pulse (CSS `@keyframes` box-shadow pulse, 2s cycle) to draw attention. The pulse stops after 60 seconds to reduce distraction once staff have acknowledged.

---

## Audio Alert

When a new ticket arrives in the NEW column, the app plays a chime sound to alert kitchen staff who may not be watching the screen.

| Property | Detail |
|---|---|
| Trigger | New WebSocket event: `ticket.created` |
| Sound | Short (~0.5s) notification chime — distinct from a system sound |
| Volume | System volume — staff should set the tablet volume appropriately |
| Implementation | Web Audio API `AudioContext`, pre-loaded on first user interaction to comply with browser autoplay policy |
| Repeat | Plays once per new ticket. Does not repeat if staff do not act. |
| Mute toggle | Header bar provides a mute toggle (🔔 / 🔕) for environments where audio is unwanted |

---

## Actions Per Column

### NEW Column

| Action | Button label | Result |
|---|---|---|
| Begin work on this ticket | "Start Preparing" | Ticket moves to PREPARING column; `ticket.status` → `PREPARING`; timestamp recorded |

### PREPARING Column

| Action | Button label | Result |
|---|---|---|
| Mark food ready | "Mark Ready" | Ticket moves to READY column; `ticket.status` → `READY`; storefront customer receives status update |

### READY Column — context-dependent

For `STALL_KIOSK` service model (counter pickup):

| Action | Button label | Result |
|---|---|---|
| Customer has collected order | "Completed" | Ticket removed from board; `ticket.status` → `COMPLETED` |

For `DINE_IN_TABLE` service model (table service):

| Action | Button label | Result |
|---|---|---|
| Food delivered to table | "Served" | Ticket removed from board; `ticket.status` → `SERVED` |

The service model is resolved from the tenant's configuration and is applied per-ticket based on the order's origin context.

---

## Call Staff Alert

When a customer at a dine-in table taps the "Call Staff" bell in the Storefront, a persistent alert card appears above all ticket columns.

### Alert Card Anatomy

```
┌──────────────────────────────────────────────────────────────────┐
│  🔔  HELP NEEDED · Table T5 · 2 min ago              [Dismiss]  │
└──────────────────────────────────────────────────────────────────┘
```

| Property | Detail |
|---|---|
| Position | Fixed banner above the three-column board, below the header |
| Color | Amber background (`#FFFBEB`), amber-600 border, bold text |
| Content | Table label, elapsed time since request was made |
| Dismiss | Staff taps "Dismiss" to acknowledge and remove the alert |
| Multiple alerts | If multiple tables call simultaneously, alerts stack vertically |
| Persistence | The alert remains until explicitly dismissed — it does not auto-dismiss |

---

## Connection Status Banner

The app depends entirely on its WebSocket connection for real-time updates. When the connection is lost, the staff must be informed immediately.

```
┌──────────────────────────────────────────────────────────────────┐
│  ⚠  Reconnecting… Orders may be delayed.                        │
└──────────────────────────────────────────────────────────────────┘
```

| Property | Detail |
|---|---|
| Position | Fixed banner at the very top of the screen (above the header) |
| Color | Red background (`#FEF2F2`), red-600 text |
| Trigger | Socket.io `disconnect` event |
| Dismiss | Auto-dismisses when connection is restored (`connect` event) |
| Reconnect behaviour | Socket.io handles exponential backoff reconnection automatically |
| During reconnection | Existing tickets remain visible (stale); new tickets will appear once reconnected |

---

## Authentication

| Property | Detail |
|---|---|
| Login screen | Email + password form; shown only on first load or after logout |
| Token storage | Access token in memory; refresh token in `httpOnly` cookie |
| Silent refresh | Access token is refreshed automatically before expiry; no logout on token expiry |
| Session persistence | After install, staff remain logged in indefinitely unless they explicitly log out |
| Logout | Button in the header; clears tokens and returns to the login screen |
| Role required | `KITCHEN_STAFF` or `TENANT_MANAGER` — enforced server-side |

The login screen is minimal: logo, email field, password field, sign-in button. No "forgot password" flow on this screen (handled via the Merchant Portal).

---

## Responsive Behaviour & Portrait Mode

The Kitchen App is designed exclusively for landscape orientation on a 10" tablet. It does not support portrait mode or small phone screens.

When the device is in portrait orientation, the app replaces the board entirely with a rotation prompt:

```
┌────────────────────────────────┐
│                                │
│    ↻  Please rotate your       │
│       tablet to landscape      │
│       to use the Kitchen App   │
│                                │
└────────────────────────────────┘
```

This is implemented via a CSS `@media (orientation: portrait)` rule that hides the board and shows the rotation message. No JavaScript is required for this behaviour.

---

## Empty State

When there are no active tickets in any column:

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│              [subtle kitchen illustration]                       │
│                                                                  │
│                  No active orders                                │
│           New orders will appear here automatically             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

| Property | Detail |
|---|---|
| Illustration | Minimal line-art — a bowl or kitchen utensil (SVG, inline) |
| Text color | `#9CA3AF` (gray-400) — subdued, non-alarming |
| Layout | Vertically centred in the board area |
| Behaviour | As soon as a new ticket arrives, the empty state disappears instantly |

The empty state is shown per-column as well: if NEW has tickets but PREPARING is empty, the PREPARING column shows "No orders in progress" in subdued text centred in the column.
