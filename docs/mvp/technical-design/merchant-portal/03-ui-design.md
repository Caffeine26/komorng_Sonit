# Merchant Portal — UI Design

This document defines the screen structure, navigation, and key interaction patterns for the Merchant Portal. The portal is used by Tenant Owners and Managers to manage their restaurant's day-to-day operations.

---

## Device & Context

- **Primary device:** Laptop (Chrome/Safari) — for initial setup and back-office tasks
- **Secondary device:** Phone or tablet — for quick operational tasks during service (availability toggle, order review)
- **Authentication:** Email + password login. JWT with `TENANT_OWNER` or `TENANT_MANAGER` role.
- **Access:** `https://admin.xfos.app` (or custom domain per tenant in future)

---

## Navigation Structure

The portal uses a left sidebar (desktop) / bottom navigation (mobile) with five top-level sections:

```
┌──────────────────────────────────────────────────────┐
│  [Restaurant Logo]  Mekong Kitchen          [👤 Me ▾]│  ← Top bar
├───────────┬──────────────────────────────────────────┤
│           │                                          │
│  📊 Dashboard        │  Main content area            │
│  🍽 Menu             │                               │
│  📦 Orders           │                               │
│  ⚙️ Settings         │                               │
│  👥 Team             │                               │
│  📱 QR Codes         │                               │
│                      │                               │
│  ─────────           │                               │
│  🔗 Preview Store    │                               │
│                      │                               │
└───────────┴──────────────────────────────────────────┘
```

---

## Screen 1 — Dashboard

### Purpose
Daily overview. Quick status check before and during service.

### Content
```
Good morning, Sok.

┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Today's     │ │ Revenue     │ │ Active      │ │ Items       │
│ Orders      │ │ Today       │ │ Tables      │ │ Sold Out    │
│    14       │ │   $187      │ │    3        │ │    2        │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘

Recent Orders (last 10)
─────────────────────────────────────────────────
ORD-0043  Table 5  $19.00  READY         8 min ago
ORD-0042  Table 3  $24.00  PREPARING     12 min ago
ORD-0041  Table 1  $12.00  COMPLETED     28 min ago
─────────────────────────────────────────────────
                                    [ View All Orders ]

Setup Progress (shown until 6/6 complete)
┌─────────────────────────────────────────────────┐
│  ✓ Profile   ✓ Service model   ✓ Menu   ✓ QR    │
│  ✗ Translations   ✗ Go-live                     │
│                                [ Complete Setup ]│
└─────────────────────────────────────────────────┘
```

### Roles
- `TENANT_OWNER` — sees revenue, full dashboard
- `TENANT_MANAGER` — sees orders and availability; revenue hidden (role-based visibility is in MVP scope)

---

## Screen 2 — Menu

### Purpose
Build and manage the menu: categories, items, availability, translations.

### Layout
```
Menu
┌──────────────────────────────────────────────┐
│  [ + Add Category ]                          │
│                                              │
│  ▼ Main Dishes            (6 items)   [Edit] │
│  ┌──────────────────────────────────────┐    │
│  │ Beef Lok Lak     $8.50  ● Available  │    │
│  │ Chicken Amok     $7.00  ● Available  │    │
│  │ Beef Amok        $9.00  ◯ Sold Out   │    │
│  │                        [+ Add Item]  │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ▼ Drinks                 (4 items)   [Edit] │
│  ┌──────────────────────────────────────┐    │
│  │ Iced Coffee      $2.00  ● Available  │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

### Availability Toggle
- Toggle switches on each item row: immediate `PUT /admin/catalog/items/{id}/availability`
- Redis menu cache invalidated on save — customers see the change on next menu load (max 5 min)
- Sold-out items appear greyed out and un-tappable on the storefront

### Add / Edit Item Sheet
Slides in from the right:
```
Add Item

Name (English)    [__________________]
Name (Khmer)      [__________________]
Description (EN)  [__________________]
Description (KH)  [__________________]
Category          [Main Dishes ▾    ]
Price             [$ ________]
Photo             [ Upload Image ]
Visible           [toggle] Show on storefront
Available         [toggle] In stock

[ Cancel ]  [ Save Item ]
```

### Category Reorder
Drag-and-drop reordering via `PUT /admin/catalog/categories/reorder`. Categories are shown in the same order customers see them.

---

## Screen 3 — Orders

### Purpose
Read-only order history and bill review. Not for real-time operations (that's the Kitchen App).

### Layout
```
Orders

[ Filter: Status ▾ ] [ Date range ]  [ Export CSV ]

─────────────────────────────────────────────────────────
ORD-0043  Table 5   Beef Lok Lak ×2, Iced Coffee ×1
          $19.00    CASH    READY           today 12:34
          [ View ]
─────────────────────────────────────────────────────────
ORD-0042  Table 3   Amok ×2, Spring Rolls ×1
          $24.00    ABA     CONFIRMED       today 12:20
          [ View ]
─────────────────────────────────────────────────────────
```

### Order Detail
```
Order ORD-0043

Table 5  ·  today 12:34  ·  Cash

Items
  Beef Lok Lak ×2  ....  $17.00
  Iced Coffee ×1   ....   $2.00
                   ─────────────
                   Total: $19.00

Bill: UNPAID → PAID (confirmed by Sok · 12:52)
Kitchen ticket: COMPLETED
```

---

## Screen 4 — Settings

### Purpose
Configure tenant profile, service model, payment, and features.

### Sections

```
Settings

── Business Profile ────────────────────────────────────
Restaurant name    [Mekong Kitchen          ]
Description        [                        ]
Default locale     [ Khmer ▾ ]
                                    [ Save ]

── Service Model ────────────────────────────────────────
Service type       [ Dine-In (Table Service) ▾ ]
Pay timing         [ Pay after meal ▾ ]
                                    [ Save ]

── Payment ──────────────────────────────────────────────
Cash payments      [toggle] Enabled
ABA QR payments    [toggle] Enabled
  ABA Account #    [__________________]
  Account Name     [__________________]
                                    [ Save ]

── Call Staff Bell ──────────────────────────────────────
Call staff feature [toggle] Enabled
                                    [ Save ]
```

---

## Screen 5 — Team

### Purpose
Manage team members who have access to the admin portal and kitchen app.

```
Team

[ + Invite Member ]

─────────────────────────────────────────────────────────
Sok Dara       owner@mekongkitchen.com  TENANT_OWNER  ● Active
Manager Chan   chan@mekongkitchen.com   TENANT_MANAGER ● Active
──── Pending ─────────────────────────────────────────────
chef@mekongkitchen.com                 KITCHEN_STAFF  ⏳ Invited
─────────────────────────────────────────────────────────
```

### Invite Member Sheet
```
Invite Team Member

Email      [__________________]
Role       [ Kitchen Staff ▾ ]

Roles:
  Tenant Manager — portal access, no billing
  Kitchen Staff  — kitchen app only

[ Cancel ]  [ Send Invitation ]
```

---

## Screen 6 — QR Codes

### Purpose
Generate, download, and manage QR codes for tables or entry points.

```
QR Codes

[ + Generate QR ]

─────────────────────────────────────────────────────
[QR] Table 1   /store/abc123   ● Active  [ Download ] [ Deactivate ]
[QR] Table 2   /store/def456   ● Active  [ Download ] [ Deactivate ]
[QR] Counter   /store/ghi789   ● Active  [ Download ] [ Deactivate ]
─────────────────────────────────────────────────────
                                   [ Download All (ZIP) ]
```

### Generate QR Sheet
```
Generate QR Codes

Label          [Table 1          ]
Quantity       [  10  ]   (generates Table 1 through Table 10)

[ Cancel ]  [ Generate ]
```

---

## Setup Progress Widget

Shown on the Dashboard until all 6 steps are complete. Also accessible via a "Setup" nav item during onboarding.

```
Setup Checklist

1. ✓  Complete your business profile
2. ✓  Choose your service model
3. ✓  Add your menu (at least 1 item)
4. ✗  Add Khmer translations          [ Go →]
5. ✓  Generate QR codes
6. ✗  You're live!  (unlocks when 1–5 are done)
```

---

## Role-Based UI Visibility

| Feature | TENANT_OWNER | TENANT_MANAGER | KITCHEN_STAFF |
|---|---|---|---|
| Dashboard revenue (basic) | ✅ | ❌ | ❌ |
| Menu management | ✅ | ✅ | ❌ |
| Availability toggle | ✅ | ✅ | ❌ |
| Orders (read) | ✅ | ✅ | ❌ |
| Bills (read) | ✅ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ |
| Team management | ✅ | ❌ | ❌ |
| QR management | ✅ | ❌ | ❌ |
| Kitchen App | ✅ | ✅ | ✅ |

> `KITCHEN_STAFF` has no portal access — kitchen app only.

---

## MVP vs Deferred

| Feature | MVP | Deferred |
|---|---|---|
| Dashboard (orders, items sold out) | ✅ | |
| Menu management (categories + items) | ✅ | |
| Item availability toggle | ✅ | |
| QR generation + download | ✅ | |
| Orders read-only list + detail | ✅ | |
| Settings (profile, service model, payment) | ✅ | |
| Team invite + role management | ✅ | |
| Setup progress checklist | ✅ | |
| Revenue in dashboard | ✅ basic | Deferred: advanced analytics (charts, segmentation, time-series) |
| Export orders CSV | ✅ | |
| Item modifiers / options | ✅ | **Requires schema work** — see TODO in `../shared/02-database-schema.md` |
| Menu scheduling (time-based availability) | ✅ | **Requires schema work** — `menu_items.active_from`/`active_to` fields, see TODO in `../shared/02-database-schema.md` |
| Promotional messages via Telegram | | Deferred: requires rate limiting + platform-review guardrails |
| Manager role-based visibility restrictions | ✅ | `TENANT_MANAGER` cannot see revenue, bills, settings, team, or QR management |
