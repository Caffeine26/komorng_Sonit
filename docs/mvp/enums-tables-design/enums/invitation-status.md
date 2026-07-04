# InvitationStatus — Design Discussion & Decision

**Date:** 2026-04-09
**Status:** ✅ Simplified to 3 values (was 4 — EXPIRED removed)
**Affects:** `invitations` table
**MVP note:** The full invitation flow is active at MVP. Tenant owners invite
staff through the merchant portal (via email, Facebook Messenger, or
Telegram), and the invitation lifecycle uses three statuses. Expiry is
derived from the `expires_at` timestamp, not a status value.

---

## The enum

```sql
CREATE TYPE "InvitationStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'REVOKED'
);
```

> **Note:** `EXPIRED` was removed. Expiry is derived from `expires_at < now()`
> at query time. See Part 3 for the rationale.

---

## Part 1 — Each value explained in detail

### `PENDING`

**Meaning:** The invitation has been sent but not yet acted on. The invite
token is valid and waiting for the invitee to click the link.

**Who sets it:** System (default on creation). When a tenant owner or manager
creates an invitation, it starts as PENDING.

**What happens:**
- An email (or Telegram message, depending on delivery method) is sent to
  the invitee containing an invite link with a unique, unguessable token.
- The `invitations` row stores the SHA-256 hash of the token (never the
  raw token).
- The invite link resolves to a registration/acceptance page on the
  merchant portal.
- The invitee can click the link at any time within the 72-hour TTL.
- The invitation row includes: `tenant_id` (which tenant), `role` (what
  role will be granted), `email` (who was invited), `invited_by_id`
  (who sent it), `expires_at` (72 hours from creation).

**Real-world example:** Bopha owns a bubble tea shop. She needs to add her
new barista, Dara, to the kitchen app. From the merchant portal, she goes
to Staff → Invite, enters Dara's email, selects "Kitchen Staff" as the
role, and clicks "Send Invitation." The system creates a PENDING invitation
and emails Dara a link.

**Why it can't be removed:** PENDING is the initial state — without it,
invitations would need to be instantly accepted or instantly expired. There
must be a window of time between "invitation sent" and "invitee responds."

**Typical duration:** Minutes to hours. Most invitations are accepted within
a few hours (the inviter tells the invitee "check your email"). Some take
a day or two if the invitee is not immediately available.

---

### `ACCEPTED`

**Meaning:** The invitee clicked the link, completed registration (if new
to the platform) or confirmed acceptance (if already a user), and a
`user_roles` row was created granting them the specified role.

**Who sets it:** System (automatically when the invitee successfully accepts).

**What happens:**
- If the invitee is a **new user** (email not in `users` table):
  - They are redirected to a registration form (set password, enter name).
  - A new `users` row is created with `status = 'ACTIVE'`.
  - A `user_roles` row is created with the invited `role` and `tenant_id`.
  - The invitation status moves to ACCEPTED. `accepted_at` is set.
- If the invitee is an **existing user** (email already in `users` table):
  - They are shown a confirmation: "You've been invited to join {tenant}
    as {role}. Accept?"
  - On acceptance, a `user_roles` row is created (adding a new tenant
    to their existing account).
  - The invitation status moves to ACCEPTED. `accepted_at` is set.
- The invite token is now consumed — it cannot be used again.

**Real-world example:** Dara receives the email, clicks the link, creates
his account (password, name), and is immediately logged into the kitchen
app for Bopha's bubble tea shop. He can see tickets. The invitation is now
ACCEPTED and Bopha sees "Dara — Kitchen Staff — Active" in her staff list.

**Why it can't be removed:** ACCEPTED is the terminal success state. Without
it, there's no way to distinguish "invitation worked" from "invitation is
still waiting" in the invitations table.

**Typical duration:** Terminal state. The invitation row is kept for audit
(who invited whom, when was it accepted) but is never acted on again.

---

### `EXPIRED` — removed (derived from timestamp)

> **This value was removed from the enum.** Expiry is derived at query time
> from `expires_at < now()`. See Part 3 for the full rationale.

The invitation's 72-hour TTL is enforced by checking `expires_at` when
someone clicks the link, and by the dashboard when displaying invitation
status. There is no cron job that flips `PENDING → EXPIRED`.

**How expiry works without a status value:**
- When someone clicks the link: `if expires_at < now() → "Invitation expired"`
- Dashboard display: `CASE WHEN status = 'PENDING' AND expires_at < now() THEN 'expired' ELSE status END`
- Re-invite: owner creates a new invitation (old one stays PENDING with an expired timestamp)

**The 72-hour TTL still exists** — it's just enforced by the timestamp,
not by a status transition. The security properties are identical.

---

### `REVOKED`

**Meaning:** The invitation was explicitly cancelled by the inviter before
the invitee accepted. The token is invalidated.

**Who sets it:** Tenant owner or tenant manager (manually, from the
merchant portal's staff/invitations UI).

**What happens:**
- The invite token is immediately invalidated — clicking the link shows
  "This invitation has been cancelled."
- The invitee was never added to the tenant — no `user_roles` row exists.
- The invitation row is kept for audit (who revoked it, when).
- If the inviter wants to re-invite the same person, they create a new
  invitation.

**Real-world example 1 (wrong person):** Bopha accidentally invited the
wrong email address — `dara@gmail.com` instead of `dara.chef@gmail.com`.
She realizes the mistake within minutes, goes to the invitations list,
and clicks "Revoke" next to the incorrect invitation. Then she sends a
new invitation to the correct email.

**Real-world example 2 (changed plans):** A BBQ restaurant owner invited
a kitchen staff member for the evening shift. Before the invitee accepts,
the owner realizes they don't need the extra staff after all (slow season).
They revoke the invitation.

**Real-world example 3 (security):** An owner suspects the invitation
email was compromised (forwarded to the wrong person). They revoke the
invitation immediately to prevent an unauthorized person from accepting it.

**Why it can't be merged with EXPIRED:**
- EXPIRED = passive — nobody did anything, time ran out.
- REVOKED = active — someone deliberately cancelled the invitation.
- The distinction matters for:
  - **Audit:** "Why wasn't this person added?" — "The invitation expired
    because they didn't respond" vs "The owner cancelled the invitation."
  - **UX:** The invitee sees a different message — "This invitation has
    expired" vs "This invitation has been cancelled."
  - **Analytics:** High expiry rate suggests invitees aren't checking
    email (delivery issue?). High revocation rate suggests inviters
    are making mistakes (UX issue in the invite form?).

**Typical duration:** Terminal state. Revoked invitations are kept for
audit.

---

## Part 2 — State machine

### The happy path

```
PENDING ──► ACCEPTED
         (invitee clicks link)
```

### Revocation

```
PENDING ──► REVOKED
         (inviter cancels)
```

### Re-invitation after expiry

```
PENDING (expired by timestamp)
    → (new invitation) → PENDING ──► ACCEPTED
```

### Full state machine diagram

```
              ┌──► ACCEPTED  (invitee accepts, expires_at not reached)
PENDING ──────┤
              └──► REVOKED   (inviter cancels)

Expiry is NOT a status transition — it's a timestamp check:
  PENDING + expires_at < now() = effectively expired (link rejected)
```

### Valid transitions (complete list)

| From | To | Trigger |
|---|---|---|
| `PENDING` | `ACCEPTED` | Invitee clicks the link AND `expires_at > now()` |
| `PENDING` | `REVOKED` | Inviter (owner/manager) cancels the invitation from the merchant portal |

**Expiry is not a transition** — a PENDING invitation with `expires_at < now()`
stays PENDING in the database. The application rejects the link at click time.
The dashboard shows it as "expired" using display logic, not a status column.

**Invalid transitions (these should never happen):**
- ACCEPTED to anything (terminal — the role was already granted)
- REVOKED to ACCEPTED (the token is invalidated — cannot accept a revoked invitation)
- Anything to PENDING (invitations are never "re-opened" — create a new one instead)

**Note:** The state machine is a simple fan-out from PENDING to one of two
terminal states. Expiry is a timestamp guard on the PENDING → ACCEPTED
transition, not a state of its own.

---

## Part 3 — The invitation flow in detail

### End-to-end sequence

```
1. Inviter (owner/manager) opens Staff → Invite in the merchant portal.

2. Inviter fills out:
   - Contact: email address, Facebook profile, OR Telegram handle
   - Role to assign (TENANT_OWNER, TENANT_MANAGER, SERVICE_STAFF, or KITCHEN_STAFF)

3. System creates the invitation:
   - Generates a cryptographically random token (32 bytes, base64url)
   - Stores SHA-256(token) in invitations.token_hash
   - Sets expires_at = now() + 72 hours
   - Sets status = PENDING
   - Sets channel = 'email' | 'facebook_messenger' | 'telegram'
   - Sets channel_id = Telegram handle, FB profile URL, or NULL for email
   - Sets invited_by_id = current user's ID
   - Creates audit_log entry: { action: 'invitation.created' }

4. System sends the invitation link via the chosen channel:
   - Email: sends email with link https://xfos.com/invite/{raw_token}
   - Facebook Messenger: sends message via Messenger API (or owner pastes link)
   - Telegram: sends message via Telegram Bot API

5. Invitee receives and clicks the link.

6. System validates:
   - Token exists? (hash lookup)
   - Status = PENDING? (not already accepted/revoked)
   - expires_at > now()? (not expired)
   - If any check fails → show appropriate error message:
     - status = ACCEPTED → "Already used"
     - status = REVOKED → "Invitation was cancelled"
     - expires_at < now() → "Invitation expired, ask for a new one"

7. If invitee is a new user:
   - Show registration page: connect a social account (Facebook/Telegram/Google)
     OR set up email+password
   - Create users row (status = PENDING → ACTIVE on confirmation)
   - Create user_auth_providers row for the chosen auth method
   - Create user_roles row with invitation.role + invitation.tenant_id
   - Update invitation: status = ACCEPTED, accepted_at = now()

8. If invitee is an existing user:
   - Show confirmation: "Join {tenant} as {role}?"
   - On confirm: create user_roles row
   - Update invitation: status = ACCEPTED, accepted_at = now()

9. Invitee is logged in and redirected to the appropriate app:
   - KITCHEN_STAFF → kitchen app
   - SERVICE_STAFF → merchant portal (orders/tables view)
   - TENANT_MANAGER → merchant portal
   - TENANT_OWNER → merchant portal
```

### Token security

| Property | Implementation |
|---|---|
| Token length | 32 bytes (256 bits of entropy) |
| Token encoding | Base64url (URL-safe) |
| Storage | SHA-256 hash only (raw token never stored) |
| Transmission | Over HTTPS in the invite link |
| Validation | Constant-time comparison of hashes |
| Single-use | Token is consumed on acceptance |
| TTL | 72 hours (configurable) |

This follows the same pattern as password reset tokens. The raw token
appears only in the invite email. The database never stores it — only the
hash. This means:
- A database breach does not expose valid invite tokens.
- Tokens cannot be reconstructed from hashes.
- The invitee's link is the only path to acceptance.

### Duplicate invitation handling

What happens if an owner invites the same email twice while a PENDING
invitation exists?

**Option A (chosen):** Allow it — create a new invitation. The old PENDING
invitation is automatically REVOKED (system-revoked). This is simpler UX:
the owner doesn't need to revoke-then-reinvite. Both invitation rows exist
for audit.

**Option B (rejected):** Block it — "An invitation for this email is
already pending." This forces the owner to explicitly revoke first, adding
friction for a common scenario (re-sending an invite because the first
email didn't arrive or went to spam).

---

## Part 4 — What's NOT in this enum (and why)

| Omitted value | What it would mean | Why we skip it |
|---|---|---|
| `DECLINED` | Invitee explicitly rejected the invitation ("No thanks") | Not implemented at MVP. The invitee simply doesn't click the link, and the invitation expires. Adding DECLINED would require a UI on the acceptance page for "Reject this invitation" — unnecessary complexity for a low-frequency action. If the invitee doesn't want to join, they ignore the email. |
| `BOUNCED` | Email delivery failed (invalid address, mailbox full) | Email delivery status is tracked by the email provider (SendGrid, SES), not in the invitations table. A bounced invitation stays PENDING and eventually expires. The inviter can see delivery status in a future email dashboard (post-MVP). |
| `RESENT` | The invitation was resent (new email, same token) | Modeled as a re-send action on the existing PENDING invitation — the status doesn't change, only a new email is triggered. No enum value needed. |
| `CLAIMED` | Someone clicked the link but hasn't completed registration yet | Too granular. The acceptance flow is short (fill name + password) and happens in one session. If the invitee abandons registration halfway, the invitation stays PENDING and they can try again. There's no need to track this intermediate state. |

---

## Part 5 — Relationship to other enums and tables

### InvitationStatus and Role

Each invitation specifies a `Role` that will be granted on acceptance:

```sql
INSERT INTO invitations (tenant_id, email, role, token_hash, status, expires_at)
VALUES ('tenant_a', 'dara@email.com', 'KITCHEN_STAFF', 'sha256...', 'PENDING', '2026-04-12T10:00:00Z');
```

The `role` column uses the same `Role` enum. Only tenant-scoped roles can
be invited: `TENANT_OWNER`, `TENANT_MANAGER`, `KITCHEN_STAFF`. You cannot
invite someone as `PLATFORM_ADMIN` — that role is assigned through a
different mechanism (direct database insert or admin-to-admin assignment).

### InvitationStatus and UserStatus

On acceptance, the newly created (or existing) user's status must be
`ACTIVE`. If an existing user with `UserStatus = SUSPENDED` tries to accept
an invitation, the acceptance should fail: "Your account is suspended.
Contact your administrator." The user's status gates everything.

### InvitationStatus and TenantStatus

Invitations should only be created for ACTIVE tenants. If a tenant is
SUSPENDED or ARCHIVED, the invitation flow should be blocked:

| Tenant status | Can create invitations? | Can accept invitations? |
|---|---|---|
| `DRAFT` | Yes (owner is setting up staff during onboarding) | Yes |
| `ACTIVE` | Yes | Yes |
| `SUSPENDED` | No (merchant portal is read-only) | No (tenant is not operational) |
| `ARCHIVED` | No (all access is blocked) | No (tenant is gone) |

### Tables involved in the invitation flow

| Table | How it's involved |
|---|---|
| `invitations` | The invitation record itself |
| `users` | Created or looked up when the invitation is accepted |
| `user_roles` | Created when the invitation is accepted — the actual role grant |
| `audit_logs` | Records invitation creation, acceptance, expiry, and revocation |

---

## Part 6 — Decision

### Question: Are 3 values sufficient?

**Answer: Yes.** The invitation lifecycle has one non-terminal state and
two terminal states, plus timestamp-derived expiry:

| Value | Purpose | Can it be removed? |
|---|---|---|
| `PENDING` | Invitation is waiting for action | No — the default state between "sent" and "resolved" |
| `ACCEPTED` | Invitation was accepted, role was granted | No — the success terminal state |
| `REVOKED` | Invitation was actively cancelled by inviter | No — without it, there's no way to cancel a mistaken or compromised invitation |
| ~~`EXPIRED`~~ | ~~Invitation timed out~~ | **Removed** — derived from `expires_at < now()`. No cron job needed. |

### Why EXPIRED was removed

The original design had 4 values including EXPIRED. It was removed because:
- It required a **cron job** to periodically flip PENDING → EXPIRED.
  Without that cron job, stale data: an invitation with `expires_at = yesterday`
  still shows `status = 'PENDING'`.
- The **timestamp already tells the truth**. `expires_at < now()` is the
  definitive answer. Duplicating it as a status adds a second source of
  truth that can go stale.
- The **acceptance check doesn't change**: the link-click handler checks
  `expires_at > now()` regardless of whether EXPIRED exists as a status.
- Dashboard queries use `CASE WHEN` to display "expired" as a label —
  slightly more complex SQL, but eliminates the cron job entirely.

### What we decided

- **3 values.** One non-terminal (PENDING) and two terminals (ACCEPTED,
  REVOKED). Expiry is a timestamp check, not a status.
- **72-hour TTL.** Standard practice for invite tokens.
- **Multi-channel delivery.** Invitations can be sent via email, Facebook
  Messenger, or Telegram (see `authentication-strategy.md`). The `channel`
  and `channel_id` columns on the `invitations` table track delivery method.
- **No DECLINED state.** Ignoring the invitation (letting it expire) serves
  the same purpose without added complexity.
- **Token stored as SHA-256 hash.** Same security model as password reset
  tokens. Raw token appears only in the invitation link.
- **Re-invite creates a new row.** Old invitation is auto-revoked. Both
  rows exist for audit trail completeness.
- **Role subset expanded.** Valid roles for invitations: `TENANT_OWNER`,
  `TENANT_MANAGER`, `SERVICE_STAFF`, `KITCHEN_STAFF`. `PLATFORM_ADMIN` and
  `PLATFORM_STAFF` are NOT invitable — platform roles use internal tooling.
