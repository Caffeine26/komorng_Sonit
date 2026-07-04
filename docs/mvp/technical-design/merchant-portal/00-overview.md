# Merchant Portal — Overview

> **Architecture (ADR-008):** The Merchant Portal is a desktop-first browser frontend for restaurant owners/managers. It calls **only** its own BFF surface at `/api/v1/admin/*` (implemented in `backend/api/src/modules/admin/`) plus `/api/v1/auth/*`. It imports types from `@xfos/contracts-bff-admin` only.

## What This App Is

The Merchant Portal is the primary administrative interface for restaurant owners and managers to configure, operate, and monitor their restaurant on the XFOS platform. It is a web application (Next.js App Router) that handles the full lifecycle of a merchant's presence on the platform: from initial setup through day-to-day menu and team management, to reviewing orders and revenue. It is not customer-facing and is not accessible via QR scan. Access requires authentication with a role of `TENANT_OWNER` or `TENANT_MANAGER`.

---

## Who Uses It

| Role | Display Name | Access Level |
|---|---|---|
| `TENANT_OWNER` | Owner | Full access to all features including billing, subscription, and owner-level invitations |
| `TENANT_MANAGER` | Manager | Can manage menu, toggle item availability, view orders, and manage non-owner staff; cannot change billing or invite owners |

A single tenant (restaurant) may have one `TENANT_OWNER` and multiple `TENANT_MANAGER` accounts. Staff roles (e.g. `KITCHEN_STAFF`) do not have access to the Merchant Portal.

---

## Device

| Context | Support Level |
|---|---|
| Laptop (1280px+) | Primary — full layout with sidebar navigation |
| Tablet (768px–1279px) | Supported — sidebar collapses to icon-only or bottom drawer |
| Phone (< 768px) | Supported for read-only views (order status, revenue summary); management tasks (menu editing) are optimised for larger screens |

---

## Key Capabilities

### Setup Wizard (First-Run Onboarding)

New merchants complete a guided 6-step setup wizard before they can go live. The wizard tracks completion state server-side via the `onboarding` module so progress is never lost across devices or sessions.

| Step | Name | What Happens |
|---|---|---|
| 1 | Business Profile | Merchant enters restaurant name, address, logo, and contact details |
| 2 | Service Model | Selects service model (`STALL_KIOSK`, `DINE_IN_TABLE`, or `STALL_OPEN_TAB`) and configures table/counter layout |
| 3 | Menu | Creates at least one category and one menu item (name, price, image optional) |
| 4 | Translations | Adds Khmer translations for all menu items and categories (English is the default input language) |
| 5 | QR Codes | Generates and downloads QR codes for each table/counter; previews the customer-facing Storefront |
| 6 | Go Live | Final checklist review; owner confirms and activates the tenant |

Steps can be revisited after completion. The wizard is skipped for subsequent logins once the tenant is `ACTIVE`.

### Menu Management

| Feature | Detail |
|---|---|
| Categories | Create, reorder (drag-and-drop), and delete categories |
| Items | Create, edit, and delete items within categories; set name, description, price, image |
| Translations | Per-item/category Khmer translation editor with character count; missing translations are flagged |
| Availability toggle | Instant on/off toggle per item; change is reflected on the Storefront within seconds (Redis cache invalidated on toggle) |
| Bulk availability | Select multiple items to toggle availability at once (e.g. "mark all as available" before service) |

### QR Code Generation

- One QR code per table (DINE_IN_TABLE) or one per counter/stall position (STALL_KIOSK)
- QR codes can be downloaded as PNG (for printing) or as a ZIP of all codes
- Each QR code links to `storefront.app/store/{qrToken}` — the token is tenant-scoped and permanent unless regenerated
- Regenerating a QR code invalidates the previous token within 5 minutes (grace period for in-flight sessions)

### Team Management

| Action | TENANT_OWNER | TENANT_MANAGER |
|---|---|---|
| Invite TENANT_MANAGER | Yes | No |
| Invite KITCHEN_STAFF | Yes | Yes |
| Remove any staff member | Yes | Only staff they invited |
| Invite TENANT_OWNER | Yes | No |
| View team list | Yes | Yes |

Invitations are sent via email. Invited users receive a link to set their password and are immediately assigned their role.

### Order History

- View all orders for the current day, with filters for date range, status, and service model
- Per-order detail: items, timestamps, payment method, status history
- Export to CSV (date range selectable)
- Does not show customer personal information beyond what was voluntarily provided (optional name field)

### Revenue Summary

- Today's total revenue, order count, average order value
- 7-day and 30-day trend charts (bar chart)
- Payment method breakdown (cash vs ABA QR)
- This is a reporting view only — no financial settlement or payout management at this stage

### Settings

| Setting | Who Can Change | Notes |
|---|---|---|
| Service model | TENANT_OWNER only | Changing service model affects all future QR scans; a confirmation dialog is required |
| Payment methods | TENANT_OWNER only | Enable/disable cash and ABA QR; configure ABA merchant account credentials |
| ABA account | TENANT_OWNER only | ABA merchant ID and API key; stored encrypted |
| Business profile | Both roles | Name, address, logo, contact info |
| Language default | Both roles | Default Storefront language (Khmer recommended) |

---

## Daily Operations Workflow

A typical manager's daily workflow in the Merchant Portal:

1. **Before service:** Toggle item availability — mark out-of-stock items as unavailable; this invalidates the Redis menu cache and the Storefront reflects the change within seconds.
2. **During service:** Monitor the Orders page for any issues; Merchant Portal does not replace the Kitchen App for order routing but gives visibility.
3. **After service:** Review today's order summary and revenue; download CSV if needed.
4. **Ad hoc:** Add new menu items, edit prices, update translations.

---

## Roles Summary

| Capability | TENANT_OWNER | TENANT_MANAGER |
|---|---|---|
| Complete setup wizard | Yes | No |
| Manage menu (items, categories) | Yes | Yes |
| Add/edit translations | Yes | Yes |
| Toggle item availability | Yes | Yes |
| Generate / download QR codes | Yes | Yes |
| View orders | Yes | Yes |
| Export order CSV | Yes | Yes |
| View revenue summary | Yes | Yes |
| Invite managers | Yes | No |
| Invite kitchen staff | Yes | Yes |
| Remove staff | Yes | Limited |
| Change service model | Yes | No |
| Configure payment methods | Yes | No |
| Manage ABA account credentials | Yes | No |
| View subscription / billing | Yes | No |

---

## Related Documents

| Document | Description |
|---|---|
| [01-e2e-scenarios.md](./01-e2e-scenarios.md) | End-to-end scenarios including merchant onboarding and menu setup flows |
| [../backend/03-domain-boundaries.md](../backend/03-domain-boundaries.md) | API module boundaries — which backend modules the Merchant Portal talks to |
| [../shared/07-logging-monitoring.md](../shared/07-logging-monitoring.md) | Logging and monitoring for all apps including the Merchant Portal |
| [../platform-portal/00-overview.md](../platform-portal/00-overview.md) | Platform Portal overview — how platform admins provision and manage merchants |
| [../backend/00-overview.md](../backend/00-overview.md) | Backend API overview |
