# Kitchen App — End-to-End Scenarios

These scenarios follow the kitchen staff actor through their complete journey.

---

## Actors and Surfaces

| Actor                          | Surface                                       | Device                |
| ------------------------------ | --------------------------------------------- | --------------------- |
| **Customer**                   | Storefront App (mobile web, `/store/{token}`) | Phone (Android/iOS)   |
| **Kitchen Staff**              | Kitchen App (PWA, `/kitchen`)                 | Tablet (landscape)    |
| **Tenant Owner (Merchant)**    | Merchant Portal (`/admin`)                    | Laptop, tablet, phone |
| **Platform Admin / Sales Ops** | Platform Portal (`/platform`)                 | Laptop                |

---

## Scenario E: Kitchen Staff — Full Service Session

- **Who:** A kitchen staff member working a lunch shift.
- **Device:** 10" Android tablet in landscape mode, Kitchen App loaded as PWA.
- **Pre-conditions:** Tenant is ACTIVE. Staff has a `KITCHEN_STAFF` role.

### Happy Path

1. **Staff opens Kitchen App** on tablet. URL: `https://kitchen.app/`.
   Sees: Login screen.

2. **Staff enters email + password.** Taps "Login".
   - `[SYS]` `POST /auth/login` → `accessToken` (15 min) stored in memory. `refreshToken` in httpOnly cookie.
   - `[SYS]` `GET /kitchen/tickets?status=NEW,PREPARING` → fetches all active tickets on mount.
   - Staff sees: Kitchen board — **NEW** | **PREPARING** | **READY** columns. Active tickets load immediately (REST, not socket). Socket.io connection established in background.

3. **New order arrives mid-shift.**
   - `[SYS]` Order service creates kitchen ticket. WebSocket emits `ticket.new`.
   - Staff sees: New ticket card in **NEW** column with audio chime and visual highlight.
   - Ticket shows: ORD-0044 | Table T3 (or "Counter" for kiosk) | Amok ×2, Rice ×2 | timestamp.

4. **Staff taps the ticket to start.**
   - `[SYS]` `PATCH /kitchen/tickets/{id}/status { status: PREPARING }` → `started_at = NOW()`. Event logged to `kitchen_ticket_events`.
   - `[SYS]` WebSocket emits `ticket.updated` to all connected kitchen clients for this tenant.
   - Staff sees: Ticket moves from **NEW** to **PREPARING**.

5. **Staff prepares the food.**

6. **Food is ready. Staff taps "Mark Ready".**
   - `[SYS]` `PATCH /kitchen/tickets/{id}/status { status: READY }` → `ready_at = NOW()`.
   - Staff sees: Ticket moves to **READY**. For dine-in, service staff sees the table is ready.

7. **Staff taps "Completed"** (after customer picks up kiosk order, or after serving a dine-in table).
   - `[SYS]` `PATCH /kitchen/tickets/{id}/status { status: COMPLETED }` → `completed_at = NOW()`.
   - Staff sees: Ticket disappears from the active board.

8. **Access token expires (15 min).** Next API call returns 401.
   - `[SYS]` API client intercepts 401. Fires `POST /auth/refresh` (httpOnly cookie). New `accessToken` issued. Original request retried.
   - Staff sees: Nothing — seamless.

9. **WiFi drops.** Socket disconnects.
   - `[SYS]` Socket.io client detects disconnect. Reconnect loop starts (exponential backoff).
   - Staff sees: "Reconnecting…" banner at top of screen.

10. **WiFi restores.** Socket reconnects.
    - `[SYS]` Socket re-authenticates with refreshed access token. App calls `GET /kitchen/tickets` to re-fetch all active tickets (catches any events missed during disconnect).
    - Staff sees: Banner disappears. Queue refreshed with current state.

11. **End of shift.** Staff taps "Logout".
    - `[SYS]` `POST /auth/logout` → refresh token invalidated in DB.
    - Staff sees: Login screen.

---

### Error Paths — Scenario E

| What goes wrong | What staff sees | What happens |
| --- | --- | --- |
| Invalid status transition (e.g. READY → NEW) | "Cannot change status backwards" error toast | `INVALID_STATUS_TRANSITION`; ticket stays in READY |
| Another staff already moved the ticket | Ticket updates automatically via WebSocket | `ticket.updated` received; both tablets stay in sync |
| Tablet battery dies mid-shift | Operator uses admin portal order list as fallback | Kitchen app state is server-side; no data lost |
| Token refresh fails (7-day inactivity) | Redirected to login screen | Re-login required; in-progress ticket actions not lost |

---

## State Machine — Kitchen Ticket

| Entity           | States                                        | Terminal State            |
| ---------------- | --------------------------------------------- | ------------------------- |
| `kitchen_ticket` | `NEW → PREPARING → READY → COMPLETED`         | `COMPLETED` / `CANCELLED` |

---

> For the full state machine and cross-actor connections, see `../shared/12-cross-system.md`
