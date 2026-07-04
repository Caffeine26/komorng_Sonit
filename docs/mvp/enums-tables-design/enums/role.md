# Role — Design Discussion & Decision

**Date:** 2026-04-09 (revised 2026-04-21)
**Status:** ✅ Expanded to 6 values — added `PLATFORM_STAFF` and `SERVICE_STAFF`
**Affects:** `user_roles.role`, `invitations.role`
**MVP note:** All six roles are active at MVP. The authorization middleware
checks `user_roles.role` on every request to determine what the user can
see and do. Small stalls (1 person) only ever use `TENANT_OWNER` — they
never create other roles, so the additional values are zero-cost for them.

---

## The enum

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

**Two scopes:**

| Scope | Roles | `user_roles.tenant_id` |
|---|---|---|
| Platform (global) | `PLATFORM_ADMIN`, `PLATFORM_STAFF` | `NULL` |
| Tenant (per-restaurant) | `TENANT_OWNER`, `TENANT_MANAGER`, `SERVICE_STAFF`, `KITCHEN_STAFF` | Required |

**Why 6, not 4 (the original design):**
The original enum had only `PLATFORM_ADMIN`, `TENANT_OWNER`,
`TENANT_MANAGER`, `KITCHEN_STAFF`. Two gaps emerged:

1. **Platform side:** one admin level was too risky. Sales/support/ops staff
   needed to view tenants and metrics without the power to suspend
   tenants or change billing. → `PLATFORM_STAFF` added.
2. **Restaurant side:** the jump from `TENANT_MANAGER` (full operational
   control) to `KITCHEN_STAFF` (kitchen-only) was too large. A waiter,
   cashier, or counter person needs front-of-house access — orders, table
   map, payments — without menu/settings authority. → `SERVICE_STAFF`
   added.

See `role-design.md` for the full rationale.

---

## Part 1 — Each value explained in detail

### `PLATFORM_ADMIN`

**Meaning:** Full access to the platform admin portal including dangerous
operations. The "god mode" platform role.

**Who sets it:** Seeded directly in the database or assigned by another
`PLATFORM_ADMIN`. Never assigned through the normal invitation flow.

**What the user can do:**
- View all tenants, their statuses, settings, and subscription details.
- Approve or reject tenant go-live requests (DRAFT → ACTIVE).
- Suspend or archive tenants (ACTIVE → SUSPENDED, SUSPENDED → ARCHIVED).
- View cross-tenant audit logs (all actions across the platform).
- Manage platform-level entities: plans, subscription overrides.
- Manage platform users (create/remove `PLATFORM_ADMIN` and `PLATFORM_STAFF`).
- View platform-wide metrics: total tenants, total orders, revenue.
- Impersonate a tenant for debugging (view their data as read-only).

**What the user CANNOT do:**
- Place orders on behalf of customers (no storefront access).
- Operate a kitchen (no kitchen app access).
- Edit a tenant's menu or settings directly.

**Scope:** Global. `user_roles.tenant_id` is `NULL`.

**Real-world example:** Rith works at XFOS headquarters as a co-founder.
He logs into the platform admin portal each morning, suspends a tenant
that violated terms, approves a new pricing plan override for an
enterprise customer, and adds a new sales hire as `PLATFORM_STAFF`.

**Why it can't be removed:** Without a god-mode role, there is no way to
manage the platform itself.

**Security considerations:**
- Platform admin accounts should use strong passwords and (post-MVP) MFA.
- The platform admin portal is IP-restricted (`internal/platform-admin`
  is a self-contained Vercel project with IP allowlisting).
- All platform admin actions are logged to `audit_logs` with
  `tenant_id = NULL`.
- The number of `PLATFORM_ADMIN` accounts should be minimized (2-3 at MVP).

---

### `PLATFORM_STAFF`

**Meaning:** Read + limited write at the platform level. Covers sales,
support, and ops people who need to see the platform but should not be
trusted with destructive operations.

**Who sets it:** `PLATFORM_ADMIN` (via the platform admin portal).

**What the user can do:**
- View tenant list, tenant details, and tenant metrics.
- View per-tenant audit logs (read-only).
- Create new tenants (used during sales-assisted onboarding).
- View platform-wide metrics dashboards.
- Reach out to tenant owners through whatever support tooling exists
  (out-of-band — email, Telegram, etc.).

**What the user CANNOT do:**
- Suspend or archive tenants.
- Manage billing, plans, or subscription overrides.
- Manage platform users (add/remove other `PLATFORM_ADMIN` /
  `PLATFORM_STAFF` accounts).
- Edit tenant data directly.
- Access merchant portals or kitchen apps.

**Scope:** Global. `user_roles.tenant_id` is `NULL`.

**Real-world example:** Sopheap is a sales rep at XFOS. She onboarded a
new BBQ restaurant in Battambang yesterday. She logs in, finds the
tenant in the list, opens its `setup_progress` to see they got stuck on
QR generation, and pings the owner on Telegram with instructions. She
can see everything she needs to help, but she can't accidentally suspend
a tenant or change their plan.

**Why "PLATFORM_STAFF" not "PLATFORM_OPERATOR" or "PLATFORM_SUPPORT":**
"Staff" is the most inclusive — covers sales, support, AND ops without
implying a specific function. If finer splits are needed later
(`PLATFORM_SALES`, `PLATFORM_SUPPORT`, `PLATFORM_OPS`), they're added as
new enum values once the platform team is ~10+ people.

**Why it exists (and isn't merged with TENANT_OWNER on a demo tenant):**
Sales and support people need to see *all* tenants, not one demo tenant.
A staff role at the platform layer is the only correct seam.

---

### `TENANT_OWNER`

**Meaning:** Full access to a specific tenant's merchant portal. The owner
is the highest authority for their business on the platform.

**Who sets it:**
- System (automatically when a user creates a new tenant — the creator
  becomes the first `TENANT_OWNER`).
- Another `TENANT_OWNER` (via the invitation flow).

**What the user can do:**
- **Menu management:** Create, edit, delete categories and items. Set
  prices. Upload images. Add Khmer and English translations. Toggle
  availability and visibility.
- **Staff management:** Invite new staff (owners, managers, service,
  kitchen). Suspend or remove existing staff. Change staff roles.
- **Settings:** Configure service model (stall/dine-in), pay timing
  (before/after), payment methods (cash, ABA QR), locale, timezone,
  currency. Set business contact info, address, branding.
- **QR management:** Generate QR codes for storefront, tables, counters.
  Activate/deactivate QR codes. Print QR sheets.
- **Orders:** View all orders, cancel orders, view order history.
- **Kitchen:** Access the kitchen app (rarely day-to-day).
- **Reports:** View sales reports, order volume, popular items, revenue.
- **Billing:** View subscription details, update payment method, cancel
  subscription.
- **Danger zone:** Delete the tenant (permanent closure). Remove other
  owners. These are owner-only actions.

**Scope:** Per-tenant. `user_roles.tenant_id` is required. A user can be
`TENANT_OWNER` on multiple tenants.

**Real-world example:** Bopha owns a bubble tea chain with two locations:
"Bopha Boba BKK1" and "Bopha Boba TTP". She has two `user_roles` rows,
both `TENANT_OWNER`, pointing to different tenant IDs. From her merchant
portal, she switches between the two tenants.

**Why it can't be removed:** Every tenant needs at least one owner —
someone responsible for the business with authority to manage billing
and invite/remove staff.

**Multi-owner scenario:** A tenant can have multiple owners. Important
for co-owners (e.g., husband-wife teams). The platform requires at least
one owner per tenant — the last owner cannot remove themselves.

---

### `TENANT_MANAGER`

**Meaning:** Day-to-day operational access to a specific tenant's
merchant portal. A manager can do almost everything an owner can —
except for a few critical "danger zone" actions.

**Who sets it:** `TENANT_OWNER` (via invitation) or another
`TENANT_MANAGER`.

**What the user can do:**
Everything a `TENANT_OWNER` can do, EXCEPT:
- **Cannot delete the tenant.**
- **Cannot manage billing/subscription.**
- **Cannot view financial reports.**
- **Cannot remove owners.**
- **Cannot invite new owners** (can invite managers, service staff,
  kitchen staff).

**What the user CAN do (same as owner):**
- Menu management (full CRUD on categories, items, translations).
- Staff management (invite managers / service staff / kitchen staff,
  suspend/remove non-owner staff).
- Settings (service model, pay timing, payment rails, branding).
- QR management.
- Orders (view, cancel, manage).
- Kitchen app access.

**Scope:** Per-tenant. `user_roles.tenant_id` is required.

**Real-world example:** Chantha is the shift manager at "Sach Ko Angkor"
(សាច់គោអង្គរ), a BBQ restaurant. The owner hired her to run daily
operations. She adjusts the menu (86'd the beef short ribs), invites a
new server for the evening shift, and reviews the order log. She can't
access billing or delete the restaurant.

**Why it exists (and isn't merged with TENANT_OWNER):**
The split is about **risk, not capability**. A manager who accidentally
deletes the tenant or cancels the subscription could cause irreversible
damage. The owner does the high-risk setup once; the manager handles
the high-frequency daily operations.

---

### `SERVICE_STAFF`

**Meaning:** Front-of-house access. Covers waiter, cashier, host,
counter staff, and floor manager. They serve customers, take orders at
the counter or table, and handle payments — but cannot edit the menu or
change tenant settings.

**Who sets it:** `TENANT_OWNER` or `TENANT_MANAGER` (via invitation).

**What the user can do:**
- **Orders:** View today's orders, take/edit orders on behalf of
  customers (counter staff at a stall, server at a table).
- **Table map:** See which tables are occupied / open / paying (for
  dine-in tenants).
- **Payments:** Mark cash payments as received. Confirm a successful
  ABA QR payment if the customer hands them the phone. Issue a refund on
  staff approval (within rules).
- **Sessions:** Open and close order sessions (a "table" lifecycle).
- **Availability toggle:** Mark menu items as "out of stock" — the same
  fast toggle kitchen staff have, scoped to "we ran out at the counter."
- **Customer support:** Look up an order by ID/QR for a confused
  customer.

**What the user CANNOT do:**
- Access the merchant portal proper (any settings/menu/staff/billing
  page returns 403).
- View or edit the menu (beyond the availability toggle).
- View financial reports or revenue data.
- Invite or manage staff.
- Change any tenant settings.
- Access the kitchen ticket queue (different app).

**Scope:** Per-tenant. `user_roles.tenant_id` is required.

**Real-world example:** Davy is the cashier at "Phnom Penh Fried Rice"
(បាយឆាភ្នំពេញ). When a customer walks up, she punches their order into
the merchant POS view, takes their cash, and marks the bill paid. The
order flows to the kitchen tablet automatically. Davy never touches
the menu, never sees the day's revenue, and can't suspend a kitchen
staff member.

**Why "SERVICE_STAFF" not "WAITER" or "CASHIER":**
- "Hall" doesn't translate to all business types — a stall has no hall.
- "Service" covers: waiter, cashier, host, counter staff, floor manager.
- It describes what they DO (provide service), not where they ARE.
- One enum value is simpler than three (`WAITER`, `CASHIER`, `HOST`)
  for an MVP. Functions can become roles later if needed.

**Why it exists (and isn't merged with TENANT_MANAGER):**
- **Security:** Service staff should not see financial data or be able
  to change menu prices.
- **Turnover:** Front-of-house roles have high turnover — minimal access
  minimizes risk.
- **Real-world fit:** A small Cambodian restaurant might have 1 owner +
  1 manager + 2 servers + 1 cook. Without `SERVICE_STAFF`, the servers
  would either need full manager access (too risky) or have no portal
  access at all (can't take orders).

**SERVICE_STAFF and KITCHEN_STAFF are branches, not a hierarchy.** A
server doesn't see the kitchen ticket preparation queue. Kitchen staff
don't see the table map. They're different apps. Someone who works both
hall and kitchen (common in small restaurants) gets two `user_roles`
rows.

---

### `KITCHEN_STAFF`

**Meaning:** Access to the kitchen app only. Can see incoming tickets
and move them through the preparation lifecycle (NEW → PREPARING →
READY → COMPLETED). Cannot access the merchant portal.

**Who sets it:** `TENANT_OWNER` or `TENANT_MANAGER` (via invitation).

**What the user can do:**
- **Kitchen tickets:** View all active tickets for their tenant. See
  ticket details (items, quantities, notes, table reference).
- **Status transitions:** Move tickets through the workflow:
  - NEW → PREPARING ("I'm starting this order")
  - PREPARING → READY ("Food is done, ready for pickup/serving")
  - READY → COMPLETED ("Customer picked up" or "Served to table")
- **Availability toggle:** Mark menu items as "unavailable" (out of
  stock) from the kitchen app.

**What the user CANNOT do:**
- Access the merchant portal (any merchant portal URL returns 403).
- View or manage the menu (beyond the availability toggle).
- View orders, bills, payments, or reports.
- See the table map or take orders (that's `SERVICE_STAFF`).
- Invite or manage staff.
- Change any settings.
- See any financial information.

**Scope:** Per-tenant. `user_roles.tenant_id` is required.

**Real-world example:** Vanna works the kitchen at a Num Banh Chok stall
in Orussey Market. She has a tablet running the kitchen app. Orders ping
in: "1x Num Banh Chok (fish curry), 1x Iced Coffee, no MSG." She taps
to start preparing, taps "Ready" five minutes later, then "Complete"
when the customer takes the food.

**Why it exists (and isn't merged with SERVICE_STAFF):**
- **Different physical context:** Kitchen tablet vs. counter POS — same
  user but two screens, two workflows.
- **Security:** Kitchen staff don't need to see prices or financial
  data.
- **Simplicity:** The kitchen app is intentionally a single-purpose
  tool. Conflating it with order-taking would clutter both apps.

---

## Part 2 — State machine

Roles don't have a state machine in the traditional sense — they don't
transition from one to another. Instead, roles are **assigned and
revoked** via `user_roles` rows.

### Role lifecycle

```
(invitation sent) ──► (invitation accepted) ──► user_roles row created
                                                     │
                                        ┌────────────┴────────────┐
                                        │                         │
                                   Role active               Role removed
                                  (user works)            (user_roles deleted)
```

### Role assignment matrix (who can assign whom)

```
                    Can assign →   PA   PS   TO   TM   SS   KS
Assigner ↓
PLATFORM_ADMIN  (PA)               ✓    ✓    ✗    ✗    ✗    ✗
PLATFORM_STAFF  (PS)               ✗    ✗    ✗    ✗    ✗    ✗
TENANT_OWNER    (TO)               ✗    ✗    ✓    ✓    ✓    ✓
TENANT_MANAGER  (TM)               ✗    ✗    ✗    ✓*   ✓    ✓
SERVICE_STAFF   (SS)               ✗    ✗    ✗    ✗    ✗    ✗
KITCHEN_STAFF   (KS)               ✗    ✗    ✗    ✗    ✗    ✗
```

`*` — Whether managers can invite other managers is a policy decision.
Default at MVP: yes.

**Key rules:**
- `PLATFORM_ADMIN` can assign `PLATFORM_ADMIN` or `PLATFORM_STAFF` (or
  is seeded for the first one). `PLATFORM_STAFF` cannot create platform
  users.
- `TENANT_OWNER` can invite any tenant-scoped role (including other
  owners).
- `TENANT_MANAGER` can invite managers, service staff, kitchen staff
  (not owners).
- `SERVICE_STAFF` and `KITCHEN_STAFF` cannot invite anyone.
- No one can assign a role higher than their own in the hierarchy.

### Permission hierarchy

```
            PLATFORM_ADMIN  (platform-wide, full power)
                  │
                  ▼
            PLATFORM_STAFF  (platform-wide, read + limited write)


            TENANT_OWNER    (per-tenant, full control)
                  │
                  ▼
            TENANT_MANAGER  (per-tenant, operational control)
                  │
              ┌───┴───┐
              ▼       ▼
       SERVICE_STAFF  KITCHEN_STAFF
       (front-of-house, branch)  (back-of-house, branch)
```

Two separate trees: platform and tenant. Within each tree, lower levels
have strictly fewer permissions. `SERVICE_STAFF` and `KITCHEN_STAFF` are
branches off `TENANT_MANAGER` — they don't include each other's
permissions.

### Valid transitions (role changes on a `user_roles` row)

| From | To | Who can do it | Use case |
|---|---|---|---|
| `PLATFORM_STAFF` | `PLATFORM_ADMIN` | `PLATFORM_ADMIN` | Promoting a trusted staff to admin |
| `PLATFORM_ADMIN` | `PLATFORM_STAFF` | `PLATFORM_ADMIN` | Demoting (rare, sensitive — last admin cannot self-demote) |
| `KITCHEN_STAFF` | `SERVICE_STAFF` | `TENANT_MANAGER` | Moving a cook to counter duty |
| `SERVICE_STAFF` | `KITCHEN_STAFF` | `TENANT_MANAGER` | Moving a server to back-of-house |
| `KITCHEN_STAFF` / `SERVICE_STAFF` | `TENANT_MANAGER` | `TENANT_OWNER` | Promoting frontline to manager |
| `TENANT_MANAGER` | `TENANT_OWNER` | `TENANT_OWNER` | Promoting a manager to co-owner |
| `TENANT_MANAGER` | `KITCHEN_STAFF` / `SERVICE_STAFF` | `TENANT_OWNER` | Demoting a manager |
| `TENANT_OWNER` | `TENANT_MANAGER` | `TENANT_OWNER` | Demoting an owner (requires at least one other owner remaining) |

**Note:** Role changes are implemented as deleting the old `user_roles`
row and creating a new one (not updating in place). This preserves
audit trail clarity.

---

## Part 3 — Multi-tenant role mechanics

### A user can hold different roles in different tenants

The `user_roles` junction table supports any combination:

```sql
-- Bopha owns Tenant A and is a server at Tenant B
INSERT INTO user_roles (user_id, tenant_id, role) VALUES
  ('user_bopha', 'tenant_a', 'TENANT_OWNER'),
  ('user_bopha', 'tenant_b', 'SERVICE_STAFF');
```

Realistic: a person might own a small noodle stall and also moonlight as
a server at a friend's restaurant on weekends.

### A user can hold multiple roles in the same tenant

The UNIQUE constraint is `(user_id, tenant_id, role)`, which means a
user CAN have multiple roles for the same tenant. The intended use
case: someone working both hall and kitchen at a small restaurant.

```sql
-- Vanna helps the kitchen AND sometimes runs the counter
INSERT INTO user_roles (user_id, tenant_id, role) VALUES
  ('user_vanna', 'tenant_x', 'KITCHEN_STAFF'),
  ('user_vanna', 'tenant_x', 'SERVICE_STAFF');
```

For overlap with managerial roles, **the highest role wins**:

```
If user has TENANT_OWNER + KITCHEN_STAFF on the same tenant:
  → Treated as TENANT_OWNER. The KITCHEN_STAFF row is redundant
    but not harmful — the kitchen app authorizes them too.
```

The authorization middleware computes: "highest tenant role for this
tenant" + "any branch roles attached." This keeps logic simple while
allowing the dual hall+kitchen pattern.

### Platform users are separate from tenant roles

A user can be both a `PLATFORM_ADMIN` (or `PLATFORM_STAFF`) and a
`TENANT_OWNER`:

```sql
INSERT INTO user_roles (user_id, tenant_id, role) VALUES
  ('user_rith', NULL, 'PLATFORM_ADMIN'),          -- platform-level
  ('user_rith', 'tenant_demo', 'TENANT_OWNER');   -- also owns a demo tenant
```

Useful for the XFOS team to have a demo tenant for testing. The
platform admin portal and the merchant portal are accessed
independently — the user switches context, not roles.

### JWT structure and role resolution

The JWT includes the user's active tenant context:

```json
{
  "sub": "user_bopha",
  "tenantId": "tenant_a",
  "roles": ["TENANT_OWNER"],
  "iat": 1712600000,
  "exp": 1712600900
}
```

When Bopha switches to tenant B, a new JWT is issued:

```json
{
  "sub": "user_bopha",
  "tenantId": "tenant_b",
  "roles": ["SERVICE_STAFF"],
  "iat": 1712600060,
  "exp": 1712600960
}
```

The `tenantId` in the JWT is what the `TenantGuard` uses for tenant
isolation (`WHERE tenant_id = ?`). **The tenantId is NEVER read from
the request body** — always from the JWT claim.

For platform users, no `tenantId` claim is set:

```json
{
  "sub": "user_sopheap",
  "tenantId": null,
  "roles": ["PLATFORM_STAFF"],
  "iat": 1712600000,
  "exp": 1712600900
}
```

---

## Part 4 — What's NOT in this enum (and why)

| Omitted role | Why we skip it |
|---|---|
| `CASHIER` | Covered by `SERVICE_STAFF` — cashier is a function, not a separate role. |
| `WAITER` / `SERVER` | Covered by `SERVICE_STAFF`. |
| `HOST` | Covered by `SERVICE_STAFF`. |
| `FLOOR_MANAGER` | Covered by `SERVICE_STAFF` (or `TENANT_MANAGER` if they have menu authority). |
| `ACCOUNTANT` | View financial reports? Give them `TENANT_OWNER` for now. Add as a separate role only when financial delegation is genuinely needed. |
| `VIEWER` / `READ_ONLY` | Not a realistic need at MVP. Cambodian food stalls don't have investors logging into the portal. |
| `SUPER_ADMIN` | `PLATFORM_ADMIN` is already the highest level. Differentiating admin tiers adds complexity without value. |
| `PLATFORM_SALES` / `PLATFORM_SUPPORT` / `PLATFORM_OPS` | Too granular for MVP. `PLATFORM_STAFF` covers all three. Split when the platform team has 10+ employees. |
| `DELIVERY_DRIVER` | XFOS does not handle delivery at MVP. Add when delivery is built. |
| `CUSTOMER` | XFOS storefront is anonymous at MVP. No customer accounts. |

---

## Part 5 — Relationship to other enums and tables

### Role and InvitationStatus

When a tenant owner invites a staff member, the flow is:

```
Owner clicks "Invite" → invitation created (PENDING)
  → invitation.role = SERVICE_STAFF (or KITCHEN_STAFF, MANAGER, OWNER)
  → email/Telegram invite sent
  → invitee accepts → ACCEPTED
  → user_roles row created with invitation.role
```

`invitations.role` uses the same `Role` enum but constrained to
tenant-scoped values. **Application validates that `PLATFORM_ADMIN` and
`PLATFORM_STAFF` are never set on `invitations`** — those are seeded
directly in the platform admin portal, not via tenant invitation.

### Role and UserStatus

Both must be checked for authorization:

```
1. users.status = ACTIVE?         → No → rejected
2. user_roles exists for tenant?  → No → rejected
3. user_roles.role sufficient?    → No → 403
4. Proceed
```

A user with `TENANT_OWNER` role but `UserStatus = SUSPENDED` cannot
access anything — status gates authentication, role gates authorization.

### Role and TenantStatus

The tenant's status affects what a tenant role can do (platform roles
are unaffected — they always work):

| Role | Tenant DRAFT | Tenant ACTIVE | Tenant SUSPENDED | Tenant ARCHIVED |
|---|---|---|---|---|
| `TENANT_OWNER` | Full merchant portal (setup) | Full access | Read-only portal | No access (410) |
| `TENANT_MANAGER` | Full merchant portal (setup) | Full operational access | Read-only portal | No access (410) |
| `SERVICE_STAFF` | No access (nothing to serve) | Full POS / table access | Complete in-flight sessions only | No access (410) |
| `KITCHEN_STAFF` | Kitchen preview only | Full kitchen access | Complete existing tickets | No access (410) |

### Tables that use the Role enum

| Table | Column | How it uses Role |
|---|---|---|
| `user_roles` | `role` | The primary assignment — which role a user has for a tenant |
| `invitations` | `role` | Which role will be granted when the invitation is accepted (tenant-scoped values only) |

---

## Part 6 — Decision

### Question: Are 6 roles sufficient for MVP?

**Answer: Yes.** Six roles cover every actor in the MVP:

| Role | Who it's for | Can it be removed? |
|---|---|---|
| `PLATFORM_ADMIN` | XFOS founders, CTO | No — someone must hold platform god-mode |
| `PLATFORM_STAFF` | XFOS sales, support, ops | No — without it, every team member would need admin (too risky) |
| `TENANT_OWNER` | Business owner(s) | No — every tenant needs an authority figure |
| `TENANT_MANAGER` | Day-to-day manager | No — owner-only would force every operational person to have danger-zone access |
| `SERVICE_STAFF` | Waiters, cashiers, hosts, counter | No — without it, front-of-house has no portal access |
| `KITCHEN_STAFF` | Cooks, prep staff | No — kitchen app needs a dedicated minimal-permission role |

### What we decided

- **6 roles, two scopes.** Platform-scope (`PLATFORM_ADMIN`,
  `PLATFORM_STAFF`) carry `tenant_id = NULL`. Tenant-scope
  (`TENANT_OWNER`, `TENANT_MANAGER`, `SERVICE_STAFF`, `KITCHEN_STAFF`)
  require a non-null `tenant_id`.
- **No fine-grained RBAC at MVP.** Six roles with hardcoded permission
  sets are simpler to implement, test, and reason about than a
  permissions table with 60 entries. The `user_roles` junction table
  already supports adding new roles when needed.
- **Tenant role hierarchy is OWNER > MANAGER > {SERVICE, KITCHEN}.**
  `SERVICE_STAFF` and `KITCHEN_STAFF` are branches at the same level —
  neither inherits from the other. Each level above has strictly more
  permissions.
- **Multi-tenant roles are supported.** A user can be an owner in one
  tenant and a server in another. The JWT determines which tenant/role
  is active for the current session.
- **Small stalls don't see the complexity.** A 1-person stall registers
  as `TENANT_OWNER`, never invites anyone, and never sees a "Team"
  section in the merchant portal. The 6-role design is zero-cost for
  them.
- **Future expansion path is clear.** When the platform team grows past
  10 people, `PLATFORM_STAFF` splits into `PLATFORM_SALES` /
  `PLATFORM_SUPPORT` / `PLATFORM_OPS`. When tenants ask for an
  accounting role, `ACCOUNTANT` can be added between `TENANT_MANAGER`
  and `SERVICE_STAFF`.

See `role-design.md` for the deeper rationale (gap analysis, stall
reality check, and full permission matrix).
