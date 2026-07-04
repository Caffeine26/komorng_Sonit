# Platform Portal — Overview

> **Architecture (ADR-008):** The Platform Portal is an internal-only browser frontend. It calls **only** its own BFF surface at `/api/v1/platform-admin/*` (implemented in `backend/api/src/modules/platform-admin/`, **renamed from `/api/v1/platform/*`** for symmetry with the other BFFs) plus `/api/v1/auth/*`. It is IP-allowlisted in production AND requires `PLATFORM_ADMIN` JWT auth — both walls must be misconfigured for unauthorized access. It imports types from `@xfos/contracts-bff-platform-admin` only.

## What This App Is

The Platform Portal is an internal operations portal used exclusively by the XFOS platform team — founders, sales operations, and support engineers. It is completely separate from the Merchant Portal and the Storefront, and is not accessible to restaurant owners, kitchen staff, or customers under any circumstances. It exists to give the platform team the tools to onboard new merchants, manage tenant lifecycle, monitor subscription health, investigate issues, and perform operational actions that cannot or should not be delegated to merchants.

---

## Who Uses It

| Role | Description |
|---|---|
| `PLATFORM_ADMIN` | The only role that can access this portal. Assigned manually to platform team members by a root admin. |

There is no self-serve registration for this portal. Accounts are provisioned directly in the database by an existing `PLATFORM_ADMIN`. The portal has its own authentication domain, separate from the merchant auth domain.

**Access is IP-restricted.** Only requests originating from the office network and approved VPN endpoints are accepted. See `03-isolation-design.md` for full isolation architecture.

---

## Key Capabilities

### Merchant Onboarding

The platform team initiates merchant onboarding for every new restaurant on the platform. The workflow:

1. **Create tenant record** — Enter business name, slug, contact email, service model, and subscription tier.
2. **Provision infrastructure** — The system creates the tenant's database namespace, seeds default settings, and generates the initial QR token(s).
3. **Send invitation** — A `TENANT_OWNER` invitation email is dispatched to the merchant's contact email. The merchant sets their password and lands in the Merchant Portal's setup wizard.

This is the only supported merchant creation path. Merchants cannot self-register.

### Tenant Lifecycle Management

Every tenant has a lifecycle status that controls whether their Storefront is live, their Kitchen App is functional, and their data is retained.

| Status | Meaning | Storefront | Kitchen App |
|---|---|---|---|
| `DRAFT` | Tenant created, setup not complete | Inactive | Inactive |
| `ACTIVE` | Live and operational | Active | Active |
| `SUSPENDED` | Temporarily disabled (non-payment, abuse) | Shows "Temporarily unavailable" | Login blocked |
| `ARCHIVED` | Permanently closed — data retained, operations stopped | Inactive | Inactive |

Platform admins can transition tenants through these states from the portal. Suspension and archival require a reason to be recorded (written to the audit log).

Transitions allowed:
- `DRAFT` → `ACTIVE` (manual or on wizard completion)
- `ACTIVE` → `SUSPENDED`
- `SUSPENDED` → `ACTIVE`
- `ACTIVE` → `ARCHIVED`
- `SUSPENDED` → `ARCHIVED`

`ARCHIVED` is a terminal state and cannot be reversed via the UI.

### Subscription Management

| Feature | Detail |
|---|---|
| View current plan | See each tenant's subscription tier and billing status |
| Change plan | Upgrade or downgrade a tenant's subscription tier |
| Mark as overdue | Flag a tenant for non-payment; triggers a warning email |
| Grace period controls | Extend or shorten the grace period before automatic suspension |
| Revenue view | Platform-wide monthly recurring revenue summary (aggregate only) |

Subscription billing itself is handled externally (manual invoice or payment gateway integration). The Platform Portal manages the subscription state in XFOS, not payment processing.

### Audit Log Access

Every significant action taken in the platform — by either a platform admin or a merchant — is recorded in the audit log. The Platform Portal provides a searchable, filterable view.

| Filter | Options |
|---|---|
| Date range | Any range |
| Tenant | Filter by specific merchant |
| Actor | Filter by user (email or ID) |
| Event type | e.g. `tenant.suspended`, `menu.item_deleted`, `payment.succeeded` |
| Source | `PLATFORM_ADMIN` action vs. `TENANT` action |

Audit logs are read-only. They cannot be edited or deleted via any UI or API.

### Setup Progress Monitoring

The Platform Portal shows each tenant's onboarding wizard completion state, so the sales/support team can:

- See which merchants have stalled during setup
- Identify which wizard step they are blocked on
- Manually mark setup steps as complete (override) when there is a known issue
- Trigger re-sends of invitation emails

### Manual Flag Recalculation

Certain setup completion flags are computed from the tenant's data (e.g. "has at least one active menu item"). If data inconsistencies arise, platform admins can trigger a recalculation of these flags for a specific tenant without a full data migration.

---

## Security

The Platform Portal has a distinct security posture compared to the merchant-facing apps.

| Control | Detail |
|---|---|
| Deployment | Deployed as a completely separate Next.js application on a separate domain (e.g. `ops.xfos.internal`) |
| IP allowlist | Ingress restricted to the platform team's office IP range and VPN endpoints at the infrastructure level (not application level) |
| Auth domain | Separate authentication domain from the merchant portal. JWTs issued to `PLATFORM_ADMIN` sessions carry a distinct `iss` claim and are validated by a separate middleware stack. |
| No shared sessions | A `PLATFORM_ADMIN` JWT cannot be used to call merchant-facing API endpoints and vice versa |
| MFA | Multi-factor authentication is required for all `PLATFORM_ADMIN` accounts |
| Session timeout | Platform Portal sessions expire after 8 hours of inactivity |

Full isolation architecture is documented in `03-isolation-design.md`.

---

## Related Documents

| Document | Description |
|---|---|
| [03-isolation-design.md](./03-isolation-design.md) | Platform admin isolation — separate deployment, IP allowlist, auth domain separation |
| [../backend/03-domain-boundaries.md](../backend/03-domain-boundaries.md) | The `platform` and `onboarding` module boundaries that back this portal |
| [../backend/00-overview.md](../backend/00-overview.md) | Backend API overview — the `platform` and `onboarding` modules |
| [../shared/07-logging-monitoring.md](../shared/07-logging-monitoring.md) | Logging and monitoring, including audit log structure |
| [01-e2e-scenarios.md](./01-e2e-scenarios.md) | End-to-end scenarios including the platform admin onboarding flow |
