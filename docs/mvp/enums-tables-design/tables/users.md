# `users`

| Attribute | Value |
|---|---|
| **Domain** | Auth |
| **Tenant-scoped?** | No -- global table |
| **Prisma model** | `User` |
| **Mapped name** | `@@map("users")` |

---

## Part 1: Overview

The `users` table is the global identity table for every human who logs into XFOS -- tenant owners, managers, service staff, kitchen staff, platform admins, and platform staff. It is **not tenant-scoped**: a single user record can have roles in multiple tenants (e.g., a restaurateur who owns two stalls), and platform users have no tenant association at all.

Tenant membership is modeled through the `user_roles` junction table, not through columns on `users`. This separation means the same person can be a `TENANT_OWNER` of "Lucky Burger" and a `KITCHEN_STAFF` at "Boba Queen" with a single login.

Authentication is three-provider: Telegram, Facebook, and phone-OTP (see
`user_auth_providers` and `design-discussions/authentication-strategy-v2.md`).
Every merchant / manager / platform account must have at least two providers
linked. No password-based login at MVP.

---

## Part 2: CREATE TABLE

```sql
CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  email               TEXT UNIQUE,                        -- nullable: captured opportunistically from Facebook (contact info only, not used for login)
  phone               TEXT UNIQUE,                        -- nullable: E.164 normalized; present when PHONE provider is linked
  full_name           TEXT,
  avatar_url          TEXT,                               -- from social provider profile
  phone_verified      BOOLEAN NOT NULL DEFAULT FALSE,     -- TRUE once the user completes SMS OTP for this phone
  phone_verified_at   TIMESTAMP(3),                       -- when phone was verified via SMS OTP
  status              "UserStatus" NOT NULL DEFAULT 'PENDING',
  last_login_at       TIMESTAMP(3),
  created_at          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP(3) NOT NULL,
  CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$')   -- E.164 format when present
);
```

Referenced enum:

```sql
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED');
```

Note: After H1 hardening, the `email` column type is changed to `CITEXT` for case-insensitive uniqueness:

```sql
ALTER TABLE users ALTER COLUMN email TYPE CITEXT;
```

---

## Part 3: Column-by-Column

### `id` -- TEXT PRIMARY KEY

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** `cuid()` (application-generated)
- **Purpose:** Globally unique user identifier. Referenced by `user_roles.user_id`, `refresh_tokens.user_id`, `invitations.invited_by_id`, `order_status_history.changed_by`, `kitchen_ticket_events.changed_by`, and `audit_logs.user_id`.
- **Constraints:** Primary key.
- **Why it exists:** The user ID is embedded in JWT tokens, stored in audit logs, and used as the FK target for all user-related relationships. CUIDs are safe for distributed generation and sortable by creation time.

### `email` -- TEXT UNIQUE (nullable, CITEXT after H1)

- **Type:** `TEXT` (becomes `CITEXT` after H1 hardening)
- **Nullable:** **Yes** — most users never provide an email.
- **Default:** `NULL`
- **Purpose:** **Contact info only, not used for login.** Captured opportunistically when Facebook returns it during OAuth (the user granted the `email` scope). Useful for future email notifications or account-recovery courtesy messages. **Not an auth credential.**
- **Constraints:** `UNIQUE` (when not NULL).
- **Why nullable:** Per `authentication-strategy-v2.md`, the three auth methods are Telegram, Facebook, and Phone-OTP — none require email. Facebook may or may not return an email depending on privacy/scope. Telegram doesn't expose email. PHONE doesn't involve email. After H1 hardening, `CITEXT` ensures case-insensitive comparison when email is used.

### `phone` -- TEXT UNIQUE (nullable, E.164)

- **Type:** `TEXT`
- **Nullable:** **Yes** — set when the user links the PHONE provider (by completing SMS OTP).
- **Default:** `NULL`
- **Purpose:** The user's phone number, normalized to E.164 format (e.g. `+85512345678`). When present and `phone_verified = TRUE`, the user can log in via SMS OTP (PHONE provider). Also used as the `user_auth_providers.provider_id` for rows with `provider = 'PHONE'`.
- **Constraints:** `UNIQUE` (when not NULL). `CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$')` — basic E.164 shape.
- **Why it exists:** Per `authentication-strategy-v2.md`, phone-OTP is the primary recovery channel in Cambodia (email adoption is low, phone is universal). A user must link at least two of {Telegram, Facebook, Phone} during onboarding — Phone is the third option and becomes the unconditional fallback when both socials are lost.
- **Why on `users` (not only on `user_auth_providers`):** canonical identity lives on `users`. Same pattern as `email`. The PHONE provider row's `provider_id` mirrors this column; the application keeps them in sync when the user updates their phone.
- **Normalization:** user-entered phone numbers (`"012 345 678"`) are normalized to E.164 at the application layer before insertion (`"+85512345678"`). Raw user input is not stored.

### `full_name` -- TEXT (nullable)

- **Type:** `TEXT`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** The user's display name. Shown in the Merchant Portal's team management page, in audit log entries ("Changed by: Sokha Vann"), and on kitchen ticket events.
- **Constraints:** None beyond type.
- **Why it exists:** May be pre-populated from the social provider's profile (Facebook name, Google name) via `user_auth_providers.display_name`. Can be overridden by the user. Service and kitchen staff onboarded via invitation (especially via PIN-only login on a shared tablet) may never set a full name.

### `avatar_url` -- TEXT (nullable)

- **Type:** `TEXT`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Profile picture URL. Populated from the social provider's profile on first login (Facebook profile pic, Google avatar, Telegram photo).
- **Constraints:** None.
- **Why it exists:** Shown in the merchant portal team list, audit log entries, and kitchen ticket events. Provides a visual identity without requiring the user to manually upload a photo. Points to the provider's CDN; the application should cache/proxy if long-term persistence is needed.

### `phone_verified` -- BOOLEAN NOT NULL DEFAULT FALSE

- **Type:** `BOOLEAN`
- **Nullable:** No
- **Default:** `FALSE`
- **Purpose:** Whether the user's phone number has been verified via SMS OTP. A phone number is only usable for login when this is `TRUE`.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Prevents attackers from adding an arbitrary phone number and bypassing the two-of-three onboarding rule. The user must complete an OTP round-trip to prove they control the number before `phone_verified` flips to `TRUE`. Set atomically with `phone_verified_at` when the OTP is confirmed.

### `phone_verified_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** When the phone was verified. `NULL` means either the phone is not set or the OTP has not been confirmed yet.
- **Constraints:** None beyond type.
- **Why it exists:** Audit — pairs with `phone_verified`. If a user later changes their phone, both `phone_verified` and `phone_verified_at` are reset, and a fresh OTP is required.

### `status` -- "UserStatus" NOT NULL DEFAULT 'PENDING'

- **Type:** `UserStatus` enum
- **Nullable:** No
- **Default:** `'PENDING'`
- **Purpose:** Lifecycle state of the user account.
- **Constraints:** Must be one of: `PENDING`, `ACTIVE`, `SUSPENDED`, `DELETED`.
- **Why it exists:**
  - `PENDING` -- user created but not yet confirmed. Cannot log in. Transitions to `ACTIVE` when: (a) Telegram or Facebook confirms identity via their login flow, (b) phone-OTP is successfully verified, or (c) an invitation is accepted.
  - `ACTIVE` -- normal account, can log in and perform any action their roles allow.
  - `SUSPENDED` -- temporarily blocked (e.g., security concern, admin action, or tenant owner disables a staff member). Cannot log in but data is preserved. Can be reactivated.
  - `DELETED` -- account is permanently deactivated. This is a logical delete, not a physical one -- the row remains for audit trail integrity (audit logs, order history, and ticket events reference this user). PII should be scrubbed per retention policy.

### `last_login_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** When the user last successfully authenticated (via any provider — Facebook, Telegram, Google, email, or PIN). `NULL` means the user has never logged in (e.g., a `PENDING` user who has not yet confirmed their account).
- **Constraints:** None.
- **Why it exists:** Used by the platform admin to identify inactive accounts ("users who haven't logged in for 90 days"), by the merchant portal to show team activity ("Dara last active 3 days ago"), and by future security features (device trust, re-authentication prompts).

### `created_at` -- TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** `CURRENT_TIMESTAMP`
- **Purpose:** When the user account was created.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Audit trail. Enables platform admin reports ("new users this month") and user account age calculations.

### `updated_at` -- TIMESTAMP(3) NOT NULL

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** Managed by Prisma `@updatedAt`
- **Purpose:** Last modification timestamp.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Standard audit field. Updated when the user changes their name, password, or status.

---

## Part 4: Indexes

### Primary key index on `id`

- **Implicit:** Yes
- **Query served:** Every FK lookup from `user_roles`, `refresh_tokens`, `invitations`, `audit_logs`, etc.
- **Example:**
  ```sql
  SELECT full_name, email FROM users WHERE id = 'clx8user001...';
  ```

### Unique index on `phone`

- **Implicit:** Yes (created by `UNIQUE`)
- **Query served:** **Phone-OTP login flow** — look up the user by phone number when they initiate SMS OTP recovery. Hottest auth path after social login.
- **Example:**
  ```sql
  SELECT id, full_name, phone_verified, status
  FROM users
  WHERE phone = '+85512345678';
  ```

### Unique index on `email`

- **Implicit:** Yes (created by `UNIQUE`)
- **Query served:** Opportunistic dedup when Facebook returns an email for a new user (detect duplicate account).
- **Example:**
  ```sql
  SELECT id, status FROM users WHERE email = 'sokha@example.com';
  ```

---

## Part 5: Relationships

### Outgoing FKs

None. `users` is a root table in the Auth domain.

### Why FKs into `users` stay single-column (composite-PK convention, 2026-04-25)

The composite-PK convention (PR `(tenant_id, id)` with composite FKs)
applies to **tenant-scoped** tables. `users` is **globally scoped** —
one user record can hold roles in multiple tenants via `user_roles`. The
`users.id` PK is single-column, and every cross-tenant FK *into* `users`
stays single-column too.

This means a child row like `orders.cancelled_by_id` references the global
user without re-asserting any tenant. The application layer is responsible
for confirming that the referenced user actually has a `user_roles` row
linking them to `orders.tenant_id` — enforced by `TenantGuard` /
`RolesGuard` in NestJS, not by the database.

This is a deliberate trade-off:

- **Pro:** preserves the global-identity invariant. A user genuinely
  exists once across the platform; their attributions accumulate.
- **Pro:** keeps `users` lean (no per-tenant duplication).
- **Con:** the database alone cannot guarantee that a tenant's `orders`
  row points at a user who actually has access to that tenant. The
  application layer must enforce this.

If a future audit requires hard DB-level enforcement, the answer is to
add a partial-CHECK trigger on the parent (e.g. "creator must have a
`user_roles` row for this tenant"), not to add a `tenant_id` column to
`users`. Such triggers are scope-limited and don't break the composite-PK
convention.

### Incoming references

| Child table | FK column | On Delete | Why |
|---|---|---|---|
| `user_auth_providers` | `user_id` | `CASCADE` | Deleting a user removes all their linked auth providers |
| `user_roles` | `user_id` | `CASCADE` | Deleting a user removes all their role assignments |
| `refresh_tokens` | `user_id` | `CASCADE` | Deleting a user revokes all their sessions |
| `invitations` | `invited_by_id` | No cascade (nullable FK) | Single-column FK; preserve the invitation record even if the inviter's account is deleted |
| `order_status_history` | `changed_by` | No cascade (nullable FK) | Single-column FK; preserve audit trail of who changed order status |
| `kitchen_ticket_events` | `changed_by` | No cascade (nullable FK) | Single-column FK; preserve audit trail of who changed ticket status |
| `kitchen_tickets` | `started_by_id` / `marked_ready_by_id` / `completed_by_id` / `cancelled_by_id` | No cascade (nullable FK) | Single-column FKs; per-transition kitchen accountability (2026-04-25) |
| `carts` | `closed_by_id` | No cascade (nullable FK) | Single-column FK; preserve the staff-reset audit trail; only set when `carts.abandoned_reason = 'STAFF_RESET'` |
| `orders` | `created_by_id` | No cascade (nullable FK) | Single-column FK; preserve who entered a `MERCHANT_MANUAL` order (walk-in cashier or elderly-customer waiter) |
| `orders` | `cancelled_by_id` | No cascade (nullable FK) | Single-column FK; preserve who cancelled an order; only set when `orders.status = 'CANCELLED'` |
| `order_items` | `cancelled_by_id` | No cascade (nullable FK) | Single-column FK; per-line partial-cancel accountability (2026-04-25) |
| `bills` | `closed_by_id` / `voided_by_id` | No cascade (nullable FK) | Single-column FKs; bill closure + void accountability (2026-04-25) |
| `payments` | `confirmed_by_id` / `refunded_by_id` | No cascade (nullable FK) | Single-column FKs; cash confirmation + refund accountability (2026-04-25) |
| `audit_logs` | `user_id` | `SET NULL` | Preserve audit logs even if the user is deleted |

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Tenant owner signs up with Facebook, links phone as backup

Sokha Vann wants to launch "Street 99 Noodles" on XFOS. She taps "Continue with Facebook" on the registration page.

The system:
1. Facebook OAuth returns: user ID, name "សុខា វណ្ណ", email `sokha.vann@gmail.com` (she granted email scope), profile pic URL.
2. Creates a `users` row: `email = 'sokha.vann@gmail.com'` (contact info only, from FB), `full_name = 'សុខា វណ្ណ'`, `avatar_url = 'https://graph.facebook.com/...'`, `status = 'PENDING'`.
3. Creates a `user_auth_providers` row: `provider = FACEBOOK`, `provider_id = '10234...'`.
4. Facebook confirmed identity → `status` moves to `ACTIVE`.
5. Creates a `tenants` row for "Street 99 Noodles" with `code_prefix = 'S99'`.
6. Creates a `user_roles` row: `role = 'TENANT_OWNER'`.
7. **Onboarding blocks "Go Live" until a second auth method is linked** (per `authentication-strategy-v2.md`). Sokha chooses "Add phone number":
   - Enters `012 345 678`. App normalizes to `+85512345678` and writes `users.phone`.
   - System sends SMS OTP via the SMS gateway.
   - Sokha enters the 6-digit code. App verifies, sets `phone_verified = TRUE` and `phone_verified_at = NOW()`, and creates a second `user_auth_providers` row: `provider = PHONE, provider_id = '+85512345678'`.

Sokha can now log in with **Facebook OR phone-OTP**. If she later opens a second stall, she creates another tenant — same `users` record, different `tenant_id` in `user_roles`.

### Scenario 2: Facebook locked → Sokha recovers via phone-OTP

Sokha's Facebook account gets locked (Khmer name policy violation — common in Cambodia). She can't use Facebook login.

1. Sokha goes to XFOS login → taps **"Use phone number"**.
2. Enters `+85512345678`. System looks up `users WHERE phone = '+85512345678' AND phone_verified = TRUE` → finds Sokha.
3. Sends SMS OTP. Sokha enters the code within 5 minutes.
4. Verified → system issues JWT. Business continues uninterrupted.

The two-of-three linked-methods rule means Sokha was never at risk of being locked out. If she had also linked Telegram at onboarding (permitted — a user can have all three), that's another independent recovery path.

### Scenario 2b: Both socials lost → phone-OTP as last-line recovery

Bopha's Facebook is locked AND her Telegram account is on a phone that was stolen.

1. Bopha taps **"Use phone number"** on the login page.
2. Enters her phone number (she remembers the number even though she lost the phone — she got a new SIM with the same number).
3. SMS OTP arrives on the new phone. She enters it.
4. System verifies, issues JWT. She is back in.
5. From account settings, she can unlink the dead Facebook and Telegram rows, and re-link fresh ones (new Telegram account on the new phone, etc.) at her leisure.

Phone-OTP is the unconditional recovery lever as long as the merchant still controls their phone number — the most reliable identity anchor in Cambodia.

### Scenario 3: Kitchen staff logs in with a PIN

At "Malis Restaurant," the kitchen tablet is pinned to the tenant. When Chenda starts her shift, she enters her 4-digit PIN. The system:
1. Looks up Chenda's user by `(tenant_id, pin_hash)` (future `user_pins` table).
2. Verifies she has a `KITCHEN_STAFF` role for this tenant via `user_roles`.
3. Issues a short-lived JWT scoped to this tenant.
4. Updates `last_login_at` on her `users` row.

Chenda doesn't need Facebook or email — PIN is the kitchen auth method. The kitchen display shows her name next to ticket status changes: "TKT-000023 marked READY by Chenda."

### Scenario 4: Service staff at the counter takes an order

At "Phnom Penh Fried Rice" (បាយឆាភ្នំពេញ), Davy is the cashier on the morning shift. The counter tablet is pinned to the tenant and configured with `device_role = 'SERVICE'`. When she clocks in, she enters her 4-digit PIN.

1. Tablet sends `tenant_id` (from device config) + PIN + `device_role = 'SERVICE'`.
2. Looks up Davy's user by `(tenant_id, pin_hash)` (future `user_pins` table).
3. Verifies she has a `SERVICE_STAFF` role for this tenant via `user_roles` (the SERVICE device rejects users who only hold `KITCHEN_STAFF`).
4. Issues a short-lived JWT scoped to this tenant + role.
5. Updates `last_login_at` on her `users` row.

A walk-in customer orders 2x fried rice and an iced coffee. Davy taps the items into the counter POS view, takes $4 cash, and marks the bill `PAID`. The order flows to the kitchen tablet automatically — Chenda sees a new ticket pop up. Davy never sees the menu editor, never sees the day's revenue, and can't change tenant settings.

If Davy also helps the kitchen during a rush, she gets a second `user_roles` row for `KITCHEN_STAFF` on the same tenant — then the same PIN works on the kitchen tablet too.

### Scenario 5: Platform admin suspends a compromised account

A platform admin receives an alert that `dara@example.com` has had 50 failed login attempts in 10 minutes, suggesting a brute-force attack.

```sql
UPDATE users
SET    status = 'SUSPENDED', updated_at = NOW()
WHERE  email = 'dara@example.com';
```

All of Dara's active refresh tokens become effectively useless because the `AuthGuard` checks `users.status = 'ACTIVE'` on every token refresh. Dara cannot log in via ANY provider (Facebook, Telegram, email) until a platform admin reactivates the account.

---

## Part 7: Design Decisions

### Why `users` is global, not tenant-scoped

A person can work at multiple businesses. A chef who consults for three restaurants should not need three separate accounts with three passwords. Making `users` global and `user_roles` the tenant-membership junction table solves this cleanly.

### Why no `tenant_id` column

The tenant context for a user is determined at login time from `user_roles`, not from a column on `users`. A user with roles in two tenants selects which tenant to enter during or after login, and the JWT is issued with that tenant's context. This is why `PLATFORM_ADMIN` roles have `NULL` tenant_id in `user_roles` -- platform admins are not bound to any tenant.

### Why `DELETED` is a status, not a physical deletion

Deleting the `users` row would cascade-delete `user_roles` and `refresh_tokens` (acceptable), but it would also null out FKs in `audit_logs`, `order_status_history`, and `kitchen_ticket_events`. The audit trail would show "Changed by: [deleted user]" instead of a name. Keeping the row with `status = 'DELETED'` preserves the identity for historical records while preventing further access.

### Why `email` and `phone` are both nullable

Per `design-discussions/authentication-strategy-v2.md`, auth is **Telegram + Facebook + Phone-OTP**. Each user must have at least two of these linked, but any two will do — no single column is required for every user:

- A user who onboards with Telegram + Facebook may never provide a phone number → `phone` is NULL.
- A user who onboards with Telegram + Phone never provides an email → `email` is NULL.
- A user who onboards with Facebook (email scope granted) + Phone gets `email` populated from Facebook as contact info.

`email` is never used for login — it's purely opportunistic contact info captured from Facebook OAuth when available.

Platform admins (`PLATFORM_ADMIN`, `PLATFORM_STAFF`) follow the same two-of-three rule as merchants.

### Why `PENDING` is the default status

Users are created as `PENDING` and move to `ACTIVE` after confirmation. This prevents:
- Incomplete social login flows (user starts OAuth but doesn't finish) leaving active accounts.
- Race conditions where a user is created but the auth provider hasn't confirmed yet.

For social login (Telegram / Facebook), the transition `PENDING → ACTIVE` happens in the same request — the provider signed/returned identity, so the account activates atomically with creation.

For phone signup, `PENDING → ACTIVE` happens when the first SMS OTP is successfully verified (`phone_verified = TRUE`).

### Why `phone` is stored here AND on `user_auth_providers`

`users.phone` is the **canonical** phone column — one per user, normalized E.164, UNIQUE. When a user links the PHONE provider, a `user_auth_providers` row is created with `provider = 'PHONE'` and `provider_id = users.phone` (same string). This mirrors the email pattern.

Application layer keeps them in sync: if a user updates their phone in account settings, both `users.phone` and the corresponding `user_auth_providers` row's `provider_id` are updated together (and `phone_verified` / `phone_verified_at` reset until a new OTP is completed).

### H1 hardening: CITEXT for email

After the H1 hardening migration, the email column type becomes `CITEXT` (case-insensitive text). This means `SELECT * FROM users WHERE email = 'Sokha@Example.com'` matches a row stored as `sokha@example.com`. Since email is now nullable, the CITEXT behavior only applies when the column has a value.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `user_auth_providers` | 1:N (child) | Linked auth providers (Telegram, Facebook, Phone-OTP) — HOW this user logs in |
| `user_roles` | 1:N (child) | Which tenants this user has access to, and with what role — WHAT this user can do |
| `refresh_tokens` | 1:N (child) | Active auth sessions for this user |
| `invitations` | 1:N (as `invited_by_id`) | Invitations this user has sent |
| `order_status_history` | 1:N (as `changed_by`) | Order state changes made by this user |
| `kitchen_ticket_events` | 1:N (as `changed_by`) | Kitchen ticket state changes made by this user |
| `carts` | 1:N (as `closed_by_id`) | Carts this user manually reset from the merchant portal (only set when `STAFF_RESET`) |
| `orders` | 1:N (as `created_by_id`) | Orders this user entered on behalf of a customer (`MERCHANT_MANUAL`) |
| `orders` | 1:N (as `cancelled_by_id`) | Orders this user cancelled |
| `audit_logs` | 1:N (as `user_id`) | All auditable actions performed by this user |
| `tenants` | Indirect via `user_roles` | The businesses this user is associated with |
