# `user_roles`

| Attribute | Value |
|---|---|
| **Domain** | Auth |
| **Tenant-scoped?** | Yes (nullable -- `NULL` for `PLATFORM_ADMIN`) |
| **Prisma model** | `UserRole` |
| **Mapped name** | `@@map("user_roles")` |

---

## Part 1: Overview

The `user_roles` table is the junction table that connects users to tenants with a specific role. It answers the question: "Which tenants can this user access, and what can they do in each one?" A user may have multiple rows -- one per (tenant, role) combination. For example, Sokha might be a `TENANT_OWNER` of "Lucky Burger" and a `KITCHEN_STAFF` at "Boba Queen."

The key design rule: **`PLATFORM_ADMIN` and `PLATFORM_STAFF` roles have `tenant_id = NULL`.** Platform users are not bound to any tenant; they operate at the platform level (suspending tenants, managing plans, viewing audit logs across the board, supporting merchants). All tenant roles (`TENANT_OWNER`, `TENANT_MANAGER`, `SERVICE_STAFF`, `KITCHEN_STAFF`) require a non-null `tenant_id`.

This table is the backbone of XFOS's authorization system. The `TenantGuard` middleware reads the user's roles from the JWT (originally populated from this table at login), extracts the `tenantId`, and injects it into the request context. Every tenant-scoped query then uses `WHERE tenant_id = ?` from that context. This is application-layer tenant isolation -- no RLS, no row security policies.

---

## Part 2: CREATE TABLE

```sql
CREATE TABLE user_roles (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id  TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  role       "Role" NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- NULLS NOT DISTINCT: treats multiple NULL tenant_ids as the same value
  -- so that a user cannot be assigned PLATFORM_ADMIN (or PLATFORM_STAFF) twice.
  -- Requires PostgreSQL 15+ (default on Railway / Supabase).
  UNIQUE NULLS NOT DISTINCT (user_id, tenant_id, role)
);

CREATE INDEX ON user_roles (user_id);
CREATE INDEX ON user_roles (tenant_id);
```

Referenced enum:

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

**Fallback for PostgreSQL < 15** (not expected — MVP deploys on PG 15+):
replace the `UNIQUE NULLS NOT DISTINCT` clause with two partial unique
indexes that together enforce the same invariant:

```sql
-- Tenant-scoped roles
CREATE UNIQUE INDEX user_roles_tenant_unique_idx
  ON user_roles (user_id, tenant_id, role) WHERE tenant_id IS NOT NULL;

-- Platform-scoped roles (tenant_id is NULL)
CREATE UNIQUE INDEX user_roles_platform_unique_idx
  ON user_roles (user_id, role) WHERE tenant_id IS NULL;
```

---

## Part 3: Column-by-Column

### `id` -- TEXT PRIMARY KEY

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** `cuid()`
- **Purpose:** Surrogate primary key for the role assignment.
- **Constraints:** Primary key.
- **Why it exists:** Enables direct row operations (e.g., revoking a specific role assignment by ID) without composing a composite key. The Prisma ORM also works more cleanly with a single-column PK.

### `user_id` -- TEXT NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** Which user holds this role.
- **Constraints:** `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE`.
- **Why it exists:** The FK to the `users` table. `ON DELETE CASCADE` ensures that deleting a user automatically removes all their role assignments across all tenants. This is the correct behavior: if the user is gone, their access should be gone too.

### `tenant_id` -- TEXT (nullable)

- **Type:** `TEXT`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Which tenant this role applies to. `NULL` for `PLATFORM_ADMIN` and `PLATFORM_STAFF` roles (platform users are not bound to any tenant).
- **Constraints:** `REFERENCES tenants(id) ON DELETE CASCADE`.
- **Why it exists:** This is the tenant-scoping column for authorization. When a user logs in, the system reads their `user_roles` rows to determine which tenants they can access. The JWT is then issued with the selected tenant's ID. `NULL` for platform users means the JWT has no tenant context, and the `TenantGuard` middleware allows access to platform-level routes only.

### `role` -- "Role" NOT NULL

- **Type:** `Role` enum
- **Nullable:** No
- **Default:** None
- **Purpose:** What the user can do. The 6 roles split into platform-scope and tenant-scope:
  - `PLATFORM_ADMIN` -- full platform access (suspend tenants, manage plans/billing, manage platform users, all audit logs). `tenant_id` must be `NULL`.
  - `PLATFORM_STAFF` -- read + limited write at the platform level (view tenant list/details/metrics, create tenants for onboarding, view audit logs read-only). Cannot suspend tenants, manage billing, or manage platform users. `tenant_id` must be `NULL`.
  - `TENANT_OWNER` -- full control of their tenant (manage menu, team, settings, QR codes, billing/subscription, financial reports, delete tenant). Can invite other users.
  - `TENANT_MANAGER` -- operational management (menu, staff except owners, settings, QR codes). No billing, no financial reports, cannot delete tenant. Can invite service/kitchen staff.
  - `SERVICE_STAFF` -- front-of-house (view orders & table map, take/edit orders, handle payments at counter, mark sessions closed). Covers waiter, cashier, host, counter staff. Cannot access menu management, settings, or financial reports.
  - `KITCHEN_STAFF` -- kitchen app only (view and manage tickets, change ticket status NEW → PREPARING → READY → COMPLETED). Cannot access the merchant portal.
- **Constraints:** Must be one of: `PLATFORM_ADMIN`, `PLATFORM_STAFF`, `TENANT_OWNER`, `TENANT_MANAGER`, `SERVICE_STAFF`, `KITCHEN_STAFF`.
- **Why it exists:** RBAC (Role-Based Access Control). Each API endpoint checks the user's role against a required minimum. The role is also embedded in the JWT for fast middleware checks without a database query on every request.

### `created_at` -- TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** `CURRENT_TIMESTAMP`
- **Purpose:** When this role was assigned.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Audit trail. Enables queries like "when was this kitchen staff member added?" and helps the merchant portal's team management page show "Member since" dates.

---

## Part 4: Indexes

### Unique constraint on `(user_id, tenant_id, role)` — `NULLS NOT DISTINCT`

- **Purpose:** Prevents duplicate role assignments — across both tenant-scoped roles (`KITCHEN_STAFF` at the same tenant twice) and platform-scoped roles (`PLATFORM_ADMIN` assigned twice to the same user, which would have two NULL `tenant_id` rows).
- **Why `NULLS NOT DISTINCT`:** PostgreSQL's default `UNIQUE` treats each NULL as a distinct value, which means `(sokha, NULL, PLATFORM_ADMIN)` could be inserted twice under the default semantics — defeating the invariant. `NULLS NOT DISTINCT` (PG 15+) treats NULLs as equal for uniqueness purposes, catching the duplicate at the DB layer. This is the MVP setup, not a post-MVP hardening.
- **Example of what it prevents:**
  ```sql
  -- Second insert fails with "duplicate key value violates unique constraint":
  INSERT INTO user_roles (id, user_id, tenant_id, role)
  VALUES ('id1', 'sokha', 'lucky-burger', 'TENANT_OWNER');
  INSERT INTO user_roles (id, user_id, tenant_id, role)
  VALUES ('id2', 'sokha', 'lucky-burger', 'TENANT_OWNER');

  -- Also blocks duplicate PLATFORM_ADMIN (both rows have tenant_id = NULL):
  INSERT INTO user_roles (id, user_id, tenant_id, role)
  VALUES ('id3', 'visal', NULL, 'PLATFORM_ADMIN');
  INSERT INTO user_roles (id, user_id, tenant_id, role)
  VALUES ('id4', 'visal', NULL, 'PLATFORM_ADMIN');  -- rejected
  ```

### Index on `user_id`

- **Query served:** "What tenants and roles does this user have?" -- called at login to populate the JWT.
- **Example:**
  ```sql
  SELECT tenant_id, role FROM user_roles WHERE user_id = 'clx8user001...';
  ```

### Index on `tenant_id`

- **Query served:** "Who are the team members for this tenant?" -- the Merchant Portal's team management page.
- **Example:**
  ```sql
  SELECT ur.role, u.full_name, u.phone, u.email, ur.created_at
  FROM   user_roles ur
  JOIN   users u ON u.id = ur.user_id
  WHERE  ur.tenant_id = 'clx8tenant001...'
  ORDER BY ur.created_at;
  ```

---

## Part 5: Relationships

### Outgoing FKs

| Target table | FK column | Cascade | Why |
|---|---|---|---|
| `users` | `user_id` | `ON DELETE CASCADE` | User deletion removes all role assignments |
| `tenants` | `tenant_id` | `ON DELETE CASCADE` | Tenant deletion removes all role assignments for that tenant |

### Incoming references

None. `user_roles` is a leaf table -- no other table references it.

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Tenant owner invites a kitchen staff member

Sokha owns "Lucky Burger" (ឡាកគី បឺហ្គឺ). She wants to add Chenda to the kitchen team. In the Merchant Portal, she enters Chenda's Telegram handle `@chenda_cook` (the primary way Cambodian merchants contact their staff) and selects "Kitchen Staff."

The system:
1. Creates a row in `invitations` with `channel = 'telegram'`, `channel_id = '@chenda_cook'`, `role = 'KITCHEN_STAFF'`, `tenant_id = lucky_burger.id`.
2. Delivers the invite link to Chenda via Telegram (the bot messages her with the link — SHA-256 hashed token stored in `invitations.token_hash`).
3. Chenda taps the link, which opens XFOS. She signs up with Telegram (one tap) and then adds a phone number + OTP as her second method.
4. Once both methods are linked, the system:
   a. Creates a `users` row for Chenda (if she doesn't already have one).
   b. Creates a `user_roles` row: `user_id = chenda.id`, `tenant_id = lucky_burger.id`, `role = 'KITCHEN_STAFF'`.
   c. Updates `invitations.status = 'ACCEPTED'`.

Chenda can now log into the kitchen app for "Lucky Burger." She cannot access the merchant portal or any other tenant.

### Scenario 2: One person works at two restaurants

Dara is a chef who consults for both "Lucky Burger" and "Malis Restaurant." He has one `users` row and two `user_roles` rows:

```
| user_id | tenant_id      | role           |
|---------|----------------|----------------|
| dara    | lucky-burger   | KITCHEN_STAFF  |
| dara    | malis          | TENANT_MANAGER |
```

When Dara logs in, the system reads both roles and presents a tenant picker: "Which restaurant do you want to access?" After selecting "Lucky Burger," the JWT is issued with `tenantId = lucky-burger` and `role = KITCHEN_STAFF`. If he switches to "Malis," a new JWT is issued with `tenantId = malis` and `role = TENANT_MANAGER`.

### Scenario 3: Platform admin accesses cross-tenant data

An XFOS platform admin named Visal has a `user_roles` row with `tenant_id = NULL` and `role = 'PLATFORM_ADMIN'`. When Visal logs in, there is no tenant picker -- the JWT has no `tenantId` claim. The `TenantGuard` sees the `PLATFORM_ADMIN` role and allows access to platform-level routes: `/admin/tenants`, `/admin/plans`, `/admin/audit-logs`.

Visal can view any tenant's data through the platform admin interface, but the queries are explicitly scoped (the admin UI passes a `tenantId` query parameter, not the JWT context). This is intentional -- the admin must consciously select which tenant to inspect.

---

## Part 7: Design Decisions

### Why a junction table instead of a `role` column on `users`

A single `role` column on `users` cannot represent:
- A user with roles in multiple tenants.
- A user with multiple roles in the same tenant (though this is unlikely, the schema allows it).
- The tenant context for each role (which tenant does `KITCHEN_STAFF` apply to?).

The junction table solves all three and is the standard RBAC pattern.

### Why `PLATFORM_ADMIN` and `PLATFORM_STAFF` use `NULL tenant_id`

Platform users are explicitly not tied to any tenant. Using `NULL` makes this clear at the data level and means:
- The `TenantGuard` middleware can detect platform users by the absence of a `tenantId` claim in the JWT.
- Platform users cannot accidentally be scoped to a tenant.
- Queries like "show all tenant-scoped users for this tenant" naturally exclude them.

PostgreSQL's default `UNIQUE` treats each `NULL` as distinct, which would allow duplicate `(userId, NULL, PLATFORM_ADMIN)` rows. The CREATE TABLE uses `UNIQUE NULLS NOT DISTINCT` (PG 15+) to catch this at the DB layer — see Part 2 for the definition and Part 4 for examples of what it prevents.

### Why `SERVICE_STAFF` and `KITCHEN_STAFF` are branches, not a hierarchy

Front-of-house and back-of-house are different apps with no overlap: a server doesn't see the kitchen ticket queue; kitchen staff don't see the table map. They sit side-by-side, not above/below each other. Someone who works both (common in small restaurants) gets two `user_roles` rows -- the table already supports multiple roles per user per tenant.

### Why no role hierarchy in the database

The role hierarchy (OWNER > MANAGER > {SERVICE_STAFF, KITCHEN_STAFF}) is enforced in application code (NestJS guards), not in the database. This is intentional:
- Role hierarchies are business logic, not data integrity constraints.
- The hierarchy might change (e.g., splitting `PLATFORM_STAFF` into `PLATFORM_SALES` and `PLATFORM_SUPPORT` once the platform team grows).
- The database's job is to store the role assignment; the API's job is to interpret it.

### Why `ON DELETE CASCADE` on both FKs

If a user is deleted, all their roles should be removed (they can no longer access anything). If a tenant is deleted, all roles for that tenant should be removed (the tenant no longer exists). Both cascades are safe and expected.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `users` | Parent (N:1) | The user who holds this role |
| `tenants` | Parent (N:1, nullable) | The tenant this role applies to |
| `invitations` | Logical predecessor | Accepting an invitation creates a `user_roles` row |
| `refresh_tokens` | Sibling (both reference user + tenant) | Refresh tokens carry the same tenant context as the role |
