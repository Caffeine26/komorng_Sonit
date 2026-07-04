# UserStatus — Design Discussion & Decision

**Date:** 2026-04-09
**Status:** ✅ Expanded to 4 values (was 3 — PENDING added)
**Affects:** `users` table
**MVP note:** All four states are active at MVP. PENDING is the default
for new users. Users move to ACTIVE after confirming their identity
(social login confirmation or email verification).

---

## The enum

```sql
CREATE TYPE "UserStatus" AS ENUM (
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'DELETED'
);
```

---

## Part 1 — Each value explained in detail

### `PENDING`

**Meaning:** The user account has been created but the user has not yet
confirmed their identity. The user cannot log in.

**Who sets it:** System (default on creation). Every new user starts as
PENDING.

**What happens to the user:**
- **Authentication:** Login is rejected. The user must complete the
  confirmation step first.
- **How to confirm (depends on auth method):**
  - **Facebook / Telegram / Google:** The social provider confirms identity
    during the OAuth flow → status moves to ACTIVE in the same request.
    PENDING is transient (seconds).
  - **Email + password:** User receives a verification email → clicks the
    link → `email_verified = true` → status moves to ACTIVE.
  - **Invitation acceptance:** Invitee clicks the invitation link →
    connects a social account or sets up email+password → status moves
    to ACTIVE.
- **Roles:** `user_roles` rows may already exist (created during invitation
  acceptance), but the user cannot use them until ACTIVE.
- **Data:** All personal data is present but the account is not yet usable.

**Real-world example:** A noodle stall owner taps "Login with Facebook" on
the registration page. The system creates a `users` row with
`status = 'PENDING'`. Facebook OAuth completes successfully in the same
request → status immediately moves to ACTIVE. The PENDING state lasted
less than a second.

**Real-world example 2 (email):** A platform admin registers with
email+password. The system creates the user as PENDING and sends a
verification email. The admin clicks the link 5 minutes later → ACTIVE.

**Why it exists:** Prevents unverified users from accessing the system.
Without PENDING:
- A user created during an incomplete social login flow would be ACTIVE
  with no confirmed identity.
- An email+password user could log in before verifying their email.
- Race conditions during registration could leave active accounts with
  no confirmed auth provider.

**Typical duration:** Seconds for social login (OAuth round-trip).
Minutes for email verification (waiting for the user to click the link).

---

### `ACTIVE`

**Meaning:** The user account is in normal working state. The user can
authenticate and perform any action their roles allow.

**Who sets it:** System (after identity confirmation). Transitions from
PENDING when:
- Social provider (Facebook/Telegram/Google) confirms identity via OAuth.
- Email verification link is clicked.
- Invitation is accepted with a confirmed auth method.

Also set when reinstating a SUSPENDED user.

**What happens to the user:**
- **Authentication:** Login succeeds. JWT is issued with the user's roles
  and tenant associations.
- **Authorization:** All endpoints allowed by the user's roles are
  accessible. A user with `TENANT_OWNER` on tenant A can manage that
  tenant's menu, staff, orders, reports. A user with `KITCHEN_STAFF` on
  tenant B can see that tenant's kitchen tickets.
- **Multi-tenant access:** If the user holds roles in multiple tenants
  (e.g., manages two restaurants), they can switch between them. The JWT
  includes a `tenantId` claim for the currently active tenant.
- **Data:** All personal data (email, full_name) is present and accurate.

**Real-world example:** Sokha is a tenant owner for "Boba Sokha" (បូបា សុខា),
a bubble tea shop in BKK1. She logs into the merchant portal every morning,
checks yesterday's sales, updates her menu (seasonal taro flavor), and
invites a new kitchen staff member. Her account is ACTIVE — everything works.

---

### `SUSPENDED`

**Meaning:** The user account is temporarily disabled. The user cannot
authenticate, but all their data, roles, and audit history are fully
retained. This is a reversible state.

**Who sets it:**
- **Platform admin** — for security concerns (compromised account,
  suspicious activity) or policy violations (abusive behavior, unauthorized
  access attempts).
- **Tenant owner** — to temporarily disable a staff member. Example: a
  kitchen staff member is on leave, or there's an HR issue being
  investigated.

**What happens to the user:**
- **Authentication:** Login is rejected with a generic error: "Account
  suspended. Contact your administrator." The error does NOT reveal the
  specific reason (security best practice).
- **Active sessions:** All existing refresh tokens for this user are
  revoked immediately. Any active JWT will fail at the next token refresh
  (within the JWT's short TTL, typically 15 minutes).
- **Roles:** All `user_roles` rows remain intact. The user still "has"
  their roles — they just can't use them. This matters because:
  - Reinstating is instant — flip status back to ACTIVE, roles are there.
  - Audit logs still show the user's role at the time of suspension.
- **Data:** All personal data remains. No PII scrubbing.
- **Other users' view:** In the merchant portal's staff list, the user
  appears with a "Suspended" badge. Their name still appears on historical
  order status changes and kitchen ticket events.

**Real-world example 1 (security):** A platform admin notices that a user's
account is making API requests from an unusual IP range at 3 AM. They
suspend the account pending investigation. The user cannot log in. After
confirming it was a false alarm (the user was traveling), the admin
reinstates the account.

**Real-world example 2 (HR):** A BBQ restaurant owner ("Sach Ko Angkor",
សាច់គោអង្គរ) has a kitchen staff member who is on medical leave for
two weeks. The owner suspends the staff member's account so they don't
appear in the kitchen app's active staff roster. When the staff member
returns, the owner reinstates them.

**Why it can't be removed:** Without SUSPENDED, the only options for
disabling a user are:
- Delete them (too permanent — you lose the ability to reinstate quickly,
  and you have to re-invite and re-onboard them).
- Remove their roles (partial — they can still log in, they just can't
  do anything, which is confusing UX).
- Do nothing (dangerous — a compromised account stays live).

SUSPENDED provides clean, reversible deactivation with clear semantics:
"You can't log in right now, but everything is waiting for you when you
come back."

**Typical duration:** Hours to weeks. Security suspensions are usually
resolved within hours (investigate, confirm, reinstate or escalate to
DELETED). HR suspensions may last for the duration of a leave period.

---

### `DELETED`

**Meaning:** The user account is permanently deactivated. This is a
**soft-delete** — the `users` row remains in the database, but the user
is effectively gone. PII should be scrubbed per the data retention policy.

**Who sets it:**
- **Platform admin** — for permanent account termination (confirmed fraud,
  repeated policy violations, legal request).
- **Tenant owner** — to permanently remove a former staff member (after
  they've left the business).
- **User themselves** — account deletion request (GDPR-style right to
  deletion, implemented as soft-delete + PII scrubbing).

**What happens to the user:**
- **Authentication:** Login is rejected with "Account not found." — NOT
  "account deleted." This prevents information leakage about whether an
  email was ever registered.
- **Roles:** All `user_roles` rows for this user are removed (or marked
  inactive). The user no longer appears in any tenant's staff list.
- **PII scrubbing:** Per the data retention policy, the following fields
  are anonymized:
  - `email` → replaced with `deleted_{user_id}@anonymized.local`
  - `full_name` → replaced with `[Deleted User]`
  - `password_hash` → replaced with an invalid hash (can never match)
- **Audit trail:** The `users.id` remains valid. All `audit_logs`,
  `order_status_history`, and `kitchen_ticket_events` rows that reference
  this user's ID still exist. The user's name in those records shows as
  `[Deleted User]` after PII scrubbing.
- **FK integrity:** This is why we soft-delete instead of hard-delete.
  If the `users` row were removed:
  - `audit_logs.user_id` would have dangling FKs (or would need `ON DELETE SET NULL`).
  - `order_status_history.changed_by` would lose attribution.
  - `kitchen_ticket_events.changed_by` would lose attribution.
  - `invitations.invited_by_id` would lose attribution.
  Keeping the row (with scrubbed PII) preserves referential integrity
  while honoring privacy.

**Real-world example 1 (staff departure):** A kitchen staff member at
a food court stall quits. The owner marks them as DELETED. Their name
disappears from the staff list. Historical kitchen ticket events still
show `[Deleted User]` instead of a broken reference. If the former
staff member is later hired by a different tenant, they create a new
account with their email (which was freed up by anonymization).

**Real-world example 2 (user request):** A tenant owner who closed their
business requests account deletion. The platform admin processes the
request: status moves to DELETED, PII is scrubbed. The owner's historical
audit entries remain for compliance, attributed to `[Deleted User]`.

**Why it's not a hard-delete:**
- **FK integrity** — hard-delete cascades would destroy audit history.
- **Legal compliance** — financial records (orders, payments) must be
  retained even after the user is gone.
- **Audit trail** — "who changed this order status?" needs an answer,
  even if that person no longer exists.

**Why it's distinct from SUSPENDED:**
- SUSPENDED = temporary, recoverable, data intact. "Come back tomorrow."
- DELETED = permanent, PII scrubbed, roles removed. "You're gone."
- A SUSPENDED user can be reinstated with one click. A DELETED user's
  PII is gone — reinstatement would require re-registration.

**Typical duration:** Terminal state. The `users` row exists indefinitely
with scrubbed PII. The only way back is to create a new account.

---

## Part 2 — State machine

### The happy path

```
(new user) ──► PENDING ──► ACTIVE ──► ACTIVE ──► ...
            (created)   (confirmed) (working)
```

### Social login (PENDING is transient)

```
PENDING ──► ACTIVE     (Facebook/Telegram/Google confirms, same request)
```

### Email verification

```
PENDING ──► ACTIVE     (user clicks verification link)
```

### Temporary suspension → reinstatement

```
ACTIVE ──► SUSPENDED ──► ACTIVE
        (admin/owner)  (reinstated)
```

### Temporary suspension → permanent deletion

```
ACTIVE ──► SUSPENDED ──► DELETED
        (admin/owner)  (confirmed termination)
```

### Direct deletion (no suspension)

```
ACTIVE ──► DELETED
        (user request / admin termination)
```

### Full state machine diagram

```
                          ┌──────────────────────┐
                          │                      │
                          ▼                      │
PENDING ──► ACTIVE ──► SUSPENDED ──► ACTIVE      │
               │            │                    │
               │            └──► DELETED         │
               │                                 │
               └──► DELETED                      │
```

### Valid transitions (complete list)

| From | To | Trigger |
|---|---|---|
| `PENDING` | `ACTIVE` | Social provider confirms identity (OAuth), email verification link clicked, or invitation accepted |
| `ACTIVE` | `SUSPENDED` | Platform admin suspends (security/policy), tenant owner suspends (HR/leave), or system detects compromise |
| `ACTIVE` | `DELETED` | User requests account deletion, admin permanently terminates, or owner removes departed staff |
| `SUSPENDED` | `ACTIVE` | Admin or owner reinstates after issue is resolved |
| `SUSPENDED` | `DELETED` | Admin confirms permanent termination after investigation, or user requests deletion while suspended |

**Invalid transitions (these should never happen):**
- PENDING to SUSPENDED (can't suspend an unconfirmed account — just delete the row)
- PENDING to DELETED (the user never confirmed — delete the row, don't soft-delete)
- DELETED to ACTIVE (PII is scrubbed — there's nothing to reinstate; create a new account)
- DELETED to SUSPENDED (already terminal — cannot suspend what's been deleted)

---

## Part 3 — Suspension mechanics

### Immediate session invalidation

When a user is suspended, all their active sessions must be invalidated.
The system does this by:

1. Setting `users.status = 'SUSPENDED'`.
2. Revoking all `refresh_tokens` rows for this user (set `revoked_at`).
3. The user's current JWT continues to work until it expires (short TTL,
   ~15 minutes). When the user's client tries to refresh the token, it
   fails because all refresh tokens are revoked.

This is why JWT TTL must be short — a 15-minute window of continued access
after suspension is acceptable. A 24-hour JWT TTL would not be.

### Multi-tenant suspension scope

A user can hold roles in multiple tenants. Suspension is **global** — it
affects all tenants, not just one:

```
User: Veasna
  - TENANT_OWNER on "Noodle House A"
  - KITCHEN_STAFF on "BBQ Place B"

If Veasna is suspended:
  - Cannot access Noodle House A (as owner)
  - Cannot access BBQ Place B (as kitchen staff)
  - Cannot log in at all
```

This is correct because `UserStatus` is on the `users` table, which is
global. If you want to disable a user for ONE tenant but not another, you
remove the specific `user_roles` row — you don't suspend the entire user.

### The difference between "remove role" and "suspend user"

| Action | Scope | Effect | Reversibility |
|---|---|---|---|
| Remove `user_roles` row | One tenant | User loses access to that tenant only | Re-invite required |
| Suspend user | Global (all tenants) | User loses access to everything | Flip status to ACTIVE |
| Delete user | Global (all tenants) | User loses access to everything + PII scrubbed | New account required |

**When to use which:**
- Staff member leaves one restaurant but works at another → remove the role.
- User's account is compromised → suspend the user (blocks all access).
- User permanently leaves the platform → delete the user.

---

## Part 4 — What's NOT in this enum (and why)

| Omitted value | What it would mean | Why we skip it |
|---|---|---|
| ~~`PENDING`~~ | ~~User registered but hasn't confirmed~~ | **Added to the enum.** Originally omitted, but with the multi-provider auth strategy (Facebook + Telegram + Google + email), PENDING is needed to gate access until the user's identity is confirmed — whether via social OAuth or email verification. `users.status` defaults to PENDING, not ACTIVE. |
| `LOCKED` | Account locked after too many failed login attempts | Modeled as a transient state in the auth middleware (rate limiter + cooldown), not a persistent user status. After the cooldown expires, the user can try again. If persistent locking is needed, SUSPENDED covers it. |
| `INACTIVE` | User hasn't logged in for N days | Not a status — it's a computed metric (`last_login_at < now() - interval '90 days'`). There's no reason to change the user's status just because they haven't logged in. They can still log in whenever they want. |
| `BANNED` | Permanently banned from the platform (more severe than DELETED) | Covered by DELETED + a `banned_emails` table or list (if needed). At MVP, DELETED with PII scrubbing is sufficient. If the same person tries to register again with a new email, there's no automated detection — that's a post-MVP anti-fraud concern. |
| `ARCHIVED` | Soft-archived, data retained, can't log in | This is what DELETED already is. Two words for the same concept. DELETED is more universally understood. |

---

## Part 5 — Relationship to other enums and tables

### UserStatus vs TenantStatus

A user and a tenant are separate entities with separate statuses. All four
combinations of (user status, tenant status) are possible and meaningful:

| User status | Tenant status | Situation |
|---|---|---|
| `ACTIVE` | `ACTIVE` | Normal operation |
| `ACTIVE` | `SUSPENDED` | Tenant is suspended but the user (who may work at other tenants) is fine |
| `ACTIVE` | `ARCHIVED` | Tenant is gone; user may still work at other tenants |
| `SUSPENDED` | `ACTIVE` | User's account is compromised; tenant continues to operate (other staff can work) |
| `DELETED` | `ACTIVE` | Former employee; tenant continues operating without them |

### UserStatus and Role

`UserStatus` gates authentication. `Role` gates authorization. Both must
pass for a request to succeed:

```
Step 1: Is users.status = ACTIVE?
          PENDING   → reject ("please confirm your account")
          SUSPENDED → reject ("account suspended")
          DELETED   → reject ("account not found")
Step 2: Does user have the required Role for this endpoint?  → No → 403
Step 3: Proceed
```

### Tables that reference users.id

These are the tables that would break if `users` rows were hard-deleted
(and why DELETED is a soft-delete):

| Table | Column | Purpose |
|---|---|---|
| `user_auth_providers` | `user_id` | Linked auth providers (Facebook, Telegram, Google, email) |
| `user_roles` | `user_id` | Role assignments |
| `refresh_tokens` | `user_id` | Auth sessions |
| `invitations` | `invited_by_id` | Who sent the invite |
| `audit_logs` | `user_id` | Who performed the action |
| `order_status_history` | `changed_by` | Who changed the order status |
| `kitchen_ticket_events` | `changed_by` | Who changed the ticket status |

---

## Part 6 — Decision

### Question: Are 4 values sufficient?

**Answer: Yes.** Four values cover the full lifecycle of a user account:

| Value | Purpose | Can it be removed? |
|---|---|---|
| `PENDING` | User created but not yet confirmed | No — gates access until identity is verified via social login or email |
| `ACTIVE` | The user can work | No — the confirmed/happy state |
| `SUSPENDED` | Temporary block — security, HR, policy | No — without it, disabling a user means deleting them (too permanent) or doing nothing (too dangerous) |
| `DELETED` | Permanent deactivation + PII scrubbing | No — without it, users can never be truly removed, and PII lives forever |

### What we decided

- **4 values.** PENDING → ACTIVE → SUSPENDED ↔ ACTIVE → DELETED.
- **PENDING is the default** for new users. Moves to ACTIVE after identity
  confirmation (social OAuth or email verification).
- **PENDING + `email_verified` are complementary.** PENDING gates login.
  `email_verified` (boolean on `users`) tracks whether the email specifically
  was verified. Social login users move to ACTIVE without email verification
  (the provider confirmed their identity). Email+password users need both
  `status = ACTIVE` AND `email_verified = true`.
- **DELETED is a soft-delete.** The row stays for FK integrity. PII is
  scrubbed per retention policy.
- **No LOCKED state.** Account lockout is a transient auth-layer concern
  (rate limiter + cooldown in Redis), not a persistent status.
- **Suspension is global, not per-tenant.** To disable a user for one
  tenant only, remove the `user_roles` row. To disable them everywhere,
  suspend the user.
- **Login error messages are generic.** PENDING returns "please confirm
  your account", SUSPENDED returns "account suspended", DELETED returns
  "account not found."
