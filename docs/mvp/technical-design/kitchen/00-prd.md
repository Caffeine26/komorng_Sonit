# Kitchen App (KDS) — Product Requirements Document (PRD)

> **Architecture (ADR-008):** The Kitchen App is a tablet-PWA browser frontend. It calls **only** its own BFF surface at `/api/v1/kitchen/*` (implemented in `backend/api/src/modules/kitchen/`) plus `/api/v1/auth/*`. Real-time ticket updates flow via Socket.io rooms named `tenant_{tenantId}`. It imports types from `@xfos/contracts-bff-kitchen` only.

## 1. Overview

### 1.1 Product Name
Kitchen App (Kitchen Display System - KDS)

### 1.2 Objective
Build a high-reliability kitchen execution system that enables restaurant staff to:
- Receive orders in real-time
- Execute orders efficiently under pressure
- Minimize errors and delays
- Transition gradually from paper-based workflows to digital operations

### 1.3 Strategic Positioning
- Phase 1: Printer-first system (adoption)
- Phase 2: Hybrid system (printer + KDS)
- Phase 3: Full KDS system (optimization & analytics)

---

## 2. Problem Statement

### 2.1 Current State (Target Market: Cambodia SMEs)
- Kitchens rely on printed tickets
- No centralized order visibility
- No real-time tracking of order status
- High error rate during peak hours
- No performance analytics

### 2.2 Key Challenges
- Staff are not tech-native
- High-pressure environment
- Resistance to workflow change
- Low trust in digital-only systems

---

## 3. Goals & Success Metrics

### 3.1 Goals
- Ensure seamless order execution in kitchen
- Reduce order preparation time
- Improve order accuracy
- Enable gradual digital adoption

### 3.2 KPIs

| Metric                     | Target              |
|--------------------------|--------------------|
| Order processing latency | < 1 second         |
| Tap-to-complete time     | < 200ms            |
| System uptime            | > 99.5%            |
| Adoption rate (tablet)   | > 60% (after 3 mo) |
| Order error rate         | -30% reduction     |

---

## 4. User Personas

### 4.1 Kitchen Staff (Primary)
- Low technical familiarity
- Works under time pressure
- Needs simple, fast interactions

### 4.2 Kitchen Manager
- Oversees operations
- Needs visibility into delays and workload

---

## 5. Product Scope

## 5.1 Phase 1 — Printer-first (MVP)

### Features:
- Auto-print orders
- Tablet displays orders (read-only)
- Real-time order feed
- Sound alerts for new orders

### Non-goals:
- No interaction required
- No workflow enforcement

---

## 5.2 Phase 2 — Hybrid KDS

### Features:
- Tap "DONE" to complete orders
- Real-time synchronization
- Basic order tracking

---

## 5.3 Phase 3 — Full KDS

### Features:
- Full workflow (New → Preparing → Done)
- Station-based routing
- Order prioritization
- Performance analytics

---

## 6. Functional Requirements

## 6.1 Order Display

### Requirements:
- Orders displayed as cards in grid layout
- No vertical scrolling during peak
- Oldest orders shown first (top-left priority)

### Order Card Content:
- Order ID
- Time since order (timer)
- Item list (max 5–6 visible lines)
- Status indicator
- Action button (DONE)

---

## 6.2 Order Lifecycle

### State Machine:

| State       | Description              |
|------------|--------------------------|
| New        | Order received           |
| Preparing  | Implicit (no action)     |
| Done       | Completed by staff       |

### Actions:
- Tap DONE → removes order from screen

---

## 6.3 Timer & Priority

- Timer starts at order creation
- Color-coded urgency:
  - <3 min → normal
  - 3–7 min → warning (yellow)
  - >7 min → critical (red)

---

## 6.4 Real-time Updates

- Orders pushed instantly to KDS
- WebSocket-based communication
- No manual refresh

---

## 6.5 Sound Notifications

| Event       | Behavior        |
|------------|----------------|
| New Order   | Short beep     |
| Late Order  | Repeating alert|
| Done        | Optional sound |

---

## 6.6 Multi-Station Support (Phase 3)

- Orders split by category:
  - Grill
  - Drinks
  - Dessert

- Each station sees only relevant items

---

## 6.7 Offline & Reliability

- Local caching of orders
- Auto-reconnect mechanism
- Printer fallback if system fails

---

## 7. Non-Functional Requirements

### 7.1 Performance
- Render latency < 500ms
- Action response < 200ms

### 7.2 Reliability
- Must operate in unstable network conditions
- Graceful degradation (printer fallback)

### 7.3 Usability
- One-tap interactions only
- Large touch targets
- Readable from 3–5 meters

### 7.4 Scalability
- Support 100+ concurrent orders per kitchen

---

## 8. UI/UX Requirements

### 8.1 Design Principles
- Glanceable UI
- No complex navigation
- Color-driven status

### 8.2 Layout

- Header: Station name, time, order count
- Main: Order card grid (2–4 columns)
- Footer: minimal controls

---

## 9. Hardware Requirements

### Minimum Setup:
- Android tablet (10–13 inch)
- Thermal printer (80mm)

### Optional:
- Large display screen
- Wall-mounted tablet

---

## 10. System Architecture

### Frontend:
- Next.js (PWA)
- WebSocket client
- Local state cache

### Backend:
- NestJS API
- WebSocket Gateway
- Redis (Pub/Sub for events)

### Flow:
1. Order created
2. Backend emits event
3. KDS receives via WebSocket
4. Printer triggered (optional)
5. UI updates instantly

---

## 11. Risks & Mitigation

| Risk                     | Mitigation                        |
|--------------------------|----------------------------------|
| Staff reject tablet      | Printer-first approach            |
| Network instability      | Offline cache + printer fallback  |
| UI complexity            | One-action design                 |
| Hardware failure         | Redundant printer system          |

---

## 12. Future Enhancements

- AI-based prep time prediction
- Auto-prioritization
- Voice alerts
- Kitchen performance dashboard
- Integration with delivery platforms

---

## 13. Success Criteria

- Kitchens continue using system after 30 days
- Tablet interaction increases over time
- Reduction in order delays and errors
- Positive feedback from kitchen staff

---

## 14. Summary

This Kitchen App is not a UI product — it is an operational system designed for high-pressure environments.

Success depends on:
- Minimizing behavior change
- Ensuring reliability
- Providing clear, fast interactions

Hybrid approach (printer + KDS) is critical for adoption and long-term scalability.