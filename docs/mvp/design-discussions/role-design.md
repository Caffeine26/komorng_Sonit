# Role Design — Discussion & Decision

**Date:** 2026-04-09
**Status:** ✅ Decided — 6 roles
**Affects:** `Role` enum, `user_roles` table, authorization middleware on
all 4 surfaces

---

## TL;DR

```sql
CREATE TYPE "Role" AS ENUM (
  'PLATFORM_ADMIN',
  'PLATFORM_STAFF',
  'TENANT_OWNER',
  'TENANT_MANAGER',
  'SERVICE_STAFF',
  'KITCHEN_STAFF'
);
```

6 roles split across two scopes:
- **Platform** (2): full admin vs read+limited-write staff
- **Tenant** (4): owner → manager → service staff / kitchen staff

Small stalls (1 person) only need `TENANT_OWNER` — they never create
additional roles. The other roles exist for larger restaurants with
dedicated staff.

---

## Part 1 — The problem with 4 roles

The original enum had 4 roles:

```sql
CREATE TYPE "Role" AS ENUM ('PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_MANAGER', 'KITCHEN_STAFF');
```

Two gaps were identified:

### Gap 1 — Platform side: one admin level is risky

With only `PLATFORM_ADMIN`, every platform team member (sales, support, ops
engineers) gets the same destructive power: suspend tenants, delete data,
manage billing. A sales person answering inquiries should NOT have the
"delete tenant" button.

### Gap 2 — Restaurant side: no front-of-house role

The jump from `TENANT_MANAGER` (can edit menu, manage staff) to
`KITCHEN_STAFF` (can only see tickets) is too large. A restaurant with
10+ staff has people who:
- Watch the table map (which tables are occupied)
- Handle cash payments (tap "received cash")
- Call out pickup numbers for kiosk customers
- Close table sessions when guests leave
- Help customers with ordering issues

They're NOT kitchen staff (don't need the ticket queue) and NOT managers
(shouldn't edit the menu or invite staff). They need a role in between.

---

## Part 2 — The 6-role design

### Platform roles

| Role | Who | Access |
|---|---|---|
| `PLATFORM_ADMIN` | Founders, CTO | Full platform access including dangerous operations: suspend/archive tenants, manage billing/plans, manage platform users, all audit logs |
| `PLATFORM_STAFF` | Sales, support, ops | View tenant list/details, view metrics, create tenants (onboarding), view audit logs (read-only). Cannot suspend tenants, manage billing, or manage platform users |

**Why `PLATFORM_STAFF` not `PLATFORM_OPERATOR` or `PLATFORM_SUPPORT`:**
"Staff" is the most inclusive — covers sales, support, AND ops without
implying a specific function. If finer splits are needed later
(PLATFORM_SALES, PLATFORM_SUPPORT), add new enum values.

### Tenant roles

| Role | Who | Access |
|---|---|---|
| `TENANT_OWNER` | Business owner(s) | Full tenant access: menu, staff, settings, QR codes, billing/subscription, financial reports, delete tenant |
| `TENANT_MANAGER` | Day-to-day manager | Operational management: menu, staff (cannot remove owners), settings, QR codes. No billing, no financial reports, cannot delete tenant |
| `SERVICE_STAFF` | Waiters, cashiers, hosts, counter staff | Front-of-house: view orders & table map, handle cash payments, close table sessions, call out pickup numbers. No menu editing, no staff management, no settings |
| `KITCHEN_STAFF` | Cooks, food prep | Kitchen app only: view tickets, update ticket status (NEW → PREPARING → READY → COMPLETED), toggle item availability. No access to merchant portal |

### Role hierarchy

```
PLATFORM
  PLATFORM_ADMIN ──── full platform access, dangerous ops
  PLATFORM_STAFF ──── read + limited write (sales/support/ops)

TENANT
  TENANT_OWNER ────── full tenant access including billing/finance
    └── TENANT_MANAGER ── operational management, no billing
          ├── SERVICE_STAFF ── hall/floor: tables, orders, cash
          └── KITCHEN_STAFF ── kitchen: tickets only
```

**SERVICE_STAFF and KITCHEN_STAFF are branches, not a hierarchy.** A server
doesn't see the kitchen ticket preparation queue. Kitchen staff don't see
the table map. They're different apps.

If someone works both hall and kitchen (common in small restaurants), they
get two `user_roles` rows — the table already supports multiple roles per
user per tenant.

### Why `SERVICE_STAFF` not "hall staff"

- "Hall" doesn't translate to all business types (a kiosk has no hall).
- "Service" covers: waiter, cashier, host, counter staff, floor manager.
- It describes what they DO (provide service), not where they ARE.

---

## Part 3 — Full permission matrix

| Permission | PLATFORM_ADMIN | PLATFORM_STAFF | TENANT_OWNER | TENANT_MANAGER | SERVICE_STAFF | KITCHEN_STAFF |
|---|---|---|---|---|---|---|
| **Platform portal** | | | | | | |
| View all tenants | Yes | Yes (read-only) | — | — | — | — |
| Create tenant | Yes | Yes | — | — | — | — |
| Suspend/archive tenant | Yes | No | — | — | — | — |
| Manage plans/billing | Yes | No | — | — | — | — |
| Manage platform users | Yes | No | — | — | — | — |
| View platform audit logs | Yes | Yes (read-only) | — | — | — | — |
| **Merchant portal** | | | | | | |
| Edit menu (items, categories) | — | — | Yes | Yes | No | No |
| Edit translations | — | — | Yes | Yes | No | No |
| Manage tenant settings | — | — | Yes | Yes | No | No |
| Manage staff (invite/remove) | — | — | Yes | Yes (not owners) | No | No |
| Manage QR codes | — | — | Yes | Yes | No | No |
| View financial reports | — | — | Yes | No | No | No |
| Manage billing/subscription | — | — | Yes | No | No | No |
| Delete tenant | — | — | Yes | No | No | No |
| View orders and bills | — | — | Yes | Yes | Yes | No |
| View table map | — | — | Yes | Yes | Yes | No |
| Handle cash payments | — | — | Yes | Yes | Yes | No |
| Close table sessions | — | — | Yes | Yes | Yes | No |
| **Kitchen app** | | | | | | |
| View kitchen tickets | — | — | Yes | Yes | No | Yes |
| Update ticket status | — | — | Yes | Yes | No | Yes |
| Toggle item availability | — | — | Yes | Yes | No | Yes |

---

## Part 4 — Small stall reality

For a kiosk or noodle stall with 1 person, `TENANT_OWNER` is sufficient.
The owner runs the entire operation: takes orders, cooks, handles payments.
They never create additional roles — they don't need to.

The onboarding flow reflects this:

```
Small stall (1 person):
  Owner registers → TENANT_OWNER role → done.
  No staff invitation step. No role management.
  The owner uses merchant portal + kitchen app with the same account.

Medium restaurant (3-5 people):
  Owner registers → TENANT_OWNER
  Invites a cook → KITCHEN_STAFF
  Maybe invites a cashier → SERVICE_STAFF
  That's it.

Large restaurant (10+ people):
  Owner registers → TENANT_OWNER
  Invites a manager → TENANT_MANAGER
  Manager invites 3 kitchen staff → KITCHEN_STAFF
  Manager invites 2 servers + 1 cashier → SERVICE_STAFF
  Full role hierarchy in use.
```

**The roles don't add complexity for small stalls** — they just ignore
what they don't need. A 1-person stall sees no "Team" section in the
merchant portal (or it shows "Just you" with an "Invite team" button).

---

## Part 5 — What's NOT in this enum

| Omitted role | Why skip it |
|---|---|
| `CASHIER` | Covered by `SERVICE_STAFF` — cashier is a function, not a role |
| `WAITER` / `SERVER` | Covered by `SERVICE_STAFF` |
| `HOST` | Covered by `SERVICE_STAFF` |
| `DELIVERY_DRIVER` | No delivery at MVP. Add when delivery is built. |
| `ACCOUNTANT` | View financial reports? Give them `TENANT_OWNER` or add when needed |
| `PLATFORM_SALES` / `PLATFORM_SUPPORT` | Too granular for MVP. `PLATFORM_STAFF` covers both. Split when you have 10+ platform employees. |

---

## Part 6 — Schema impact

### Enum change

```sql
-- BEFORE (4 roles)
CREATE TYPE "Role" AS ENUM ('PLATFORM_ADMIN', 'TENANT_OWNER', 'TENANT_MANAGER', 'KITCHEN_STAFF');

-- AFTER (6 roles)
CREATE TYPE "Role" AS ENUM (
  'PLATFORM_ADMIN',
  'PLATFORM_STAFF',
  'TENANT_OWNER',
  'TENANT_MANAGER',
  'SERVICE_STAFF',
  'KITCHEN_STAFF'
);
```

### `user_roles` table — unchanged

The table already supports any number of roles per user per tenant.
Adding new enum values requires no structural change.

### Authorization middleware

Each surface checks roles differently:

```
Platform admin portal:
  PLATFORM_ADMIN → full access
  PLATFORM_STAFF → read + limited write
  All others     → 403

Merchant portal:
  TENANT_OWNER   → full access
  TENANT_MANAGER → no billing/finance pages
  SERVICE_STAFF  → orders, tables, payments only
  KITCHEN_STAFF  → redirect to kitchen app
  PLATFORM_*     → not applicable (separate app)

Kitchen app:
  KITCHEN_STAFF  → full kitchen access
  TENANT_OWNER   → full kitchen access (they can see everything)
  TENANT_MANAGER → full kitchen access
  SERVICE_STAFF  → no access (redirect to merchant portal)

Storefront:
  No auth required (anonymous QR ordering)
```

---

## Part 7 — Files updated

| File | Change |
|---|---|
| `docs/discussions/tables/postgresql-schema.md` | `Role` enum: 4 → 6 values |
| `docs/discussions/discussion_and_decision.md` | Summary entry pointing to this document |
| `docs/discussions/enums/role.md` | Needs update (was written for 4 roles) |
