# Platform Portal — End-to-End Scenarios

These scenarios follow the Platform Admin actor through their complete journey. The Platform Portal is an internal tool — used by the startup team (founder, sales ops) to onboard merchants and monitor platform health.

> **How to read these:** Steps in **bold** are actor actions. Steps prefixed with `[SYS]` are system state changes. Error paths are listed at the end of each scenario.

---

## Actors and Surfaces

| Actor | Surface | Device |
| --- | --- | --- |
| **Customer** | Storefront App (mobile web, `/store/{token}`) | Phone (Android/iOS) |
| **Kitchen Staff** | Kitchen App (PWA, `/kitchen`) | Tablet (landscape) |
| **Tenant Owner / Manager** | Merchant Portal (`/admin`) | Laptop, tablet, phone |
| **Platform Admin / Sales Ops** | Platform Portal (`/platform`) | Laptop |

---

## Scenario H: Platform Admin / Sales Ops — Merchant Onboarding

- **Who:** A member of the platform team (the startup founder, initially).
- **Device:** Laptop, IP-restricted internal portal at `https://platform.app/`.
- **Pre-conditions:** A new restaurant has signed up. Sales has agreed on the plan.

### Happy Path

1. **Admin logs in to Platform Admin portal.**
   - `[SYS]` `POST /auth/login` → access token with `PLATFORM_ADMIN` role issued.
   - Admin sees: Platform dashboard — tenant list, onboarding queue, recent activity.

2. **Admin clicks "New Merchant".**
   - Fills in: Business name "Mekong Kitchen", plan "STARTER", owner email `owner@mekongkitchen.com`.
   - `[SYS]` `POST /platform/onboarding/merchants` → merchant record created: `status: PENDING`.
   - Admin sees: Merchant record created with a merchant ID.

3. **Commercial agreement signed offline.** Admin returns to portal.
   **Admin clicks "Provision Tenant"** for Mekong Kitchen.
   - `[SYS]` `POST /platform/onboarding/{merchantId}/provision` → `tenants` record created: `{ status: DRAFT, serviceModel: null }`. `setup_progress` record initialised (all flags false). `subscriptions` record created: `{ plan: STARTER, status: PENDING }`.
   - Admin sees: Tenant provisioned. Status: DRAFT. Setup progress: 0/6.

4. **Admin clicks "Invite Owner".**
   - `[SYS]` `POST /platform/onboarding/{merchantId}/invite { email: owner@mekongkitchen.com }` → invitation created (PENDING, 72h TTL). Email queued via BullMQ.
   - Admin sees: "Invitation sent to owner@mekongkitchen.com."

5. **Admin monitors onboarding progress.**
   - `[SYS]` `GET /platform/onboarding` → all merchants with setup progress.
   - Admin sees: Mekong Kitchen row — "Invited, awaiting owner" → "Setup in progress 3/6" → "ACTIVE 6/6".

6. **Owner completes setup** (see Merchant Portal `01-e2e-scenarios.md`, Scenario F).
   - `[SYS]` `setup_progress.go_live_ready = true`. Tenant status → ACTIVE.
   - Admin sees: Mekong Kitchen status: ACTIVE. Setup: Complete.

7. **Admin views audit trail** for compliance.
   - `[SYS]` `GET /platform/audit-logs?tenantId={id}&sort=created_at&order=desc`.
   - Admin sees: Full log — provisioning, invitation, user creation, order activity.

**Final state:**
`merchant: ACTIVE` | `tenant: ACTIVE` | `subscription: ACTIVE` | `owner user: ACTIVE` | Storefront live.

---

### Error Paths — Scenario H

| What goes wrong | What admin sees | What happens |
| --- | --- | --- |
| Tenant DRAFT → ACTIVE transition fails (DB error) | "Activation failed — retry" button | `tenant.status` stays at `DRAFT`; admin can retry. Failed activation logged to `audit_logs` with `action = 'tenant.activation_failed'`. |
| Owner never accepts invite (72h passes) | Invitation shows "EXPIRED" | Admin can re-invite: new invitation created, old one → EXPIRED |
| Tenant needs to be suspended (non-payment) | Admin toggles via `PATCH /platform/tenants/{id}/status` | `tenant.status = SUSPENDED`; all QR scans return 403 immediately |
| Setup flags stuck (event handler failure) | Setup progress incomplete despite real data | Admin uses `POST /platform/tenants/{id}/setup-progress/recalculate` (TODO-10) |

---

## State Machine Rows — Platform-Relevant Entities

| Entity | States | Terminal State |
| --- | --- | --- |
| `tenant` | `DRAFT → ACTIVE → SUSPENDED / ARCHIVED` | `ARCHIVED` |
| `invitation` | `PENDING → ACCEPTED / EXPIRED / REVOKED` | `ACCEPTED` / `EXPIRED` |

> For the full state machine and cross-actor connections, see `../shared/12-cross-system.md`.
