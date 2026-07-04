# `invitations`

| Attribute | Value |
|---|---|
| **Domain** | Auth |
| **Tenant-scoped?** | Yes |
| **Prisma model** | `Invitation` |
| **Mapped name** | `@@map("invitations")` |

---

## Part 1: Overview

The `invitations` table manages the team member invitation flow. When a tenant
owner or manager wants to add someone to their restaurant's team (a co-owner,
a manager, service staff, or kitchen staff), they create an invitation. The
system generates a cryptographically random token, stores its SHA-256 hash in
this table, and sends the raw token to the invitee via the chosen channel
(Telegram or Facebook Messenger). The invitee clicks the link, connects a
Telegram or Facebook account (and optionally adds phone-OTP as a backup),
and the invitation is marked as accepted — which creates a `user_roles` row
granting the invitee the specified role.

Key security properties:
- **72-hour TTL.** Invitations expire after 72 hours (enforced by `expires_at`
  timestamp, not a status value — see design decisions).
- **SHA-256 hashed tokens.** The raw invitation token is never stored.
- **One-time use.** Once accepted, the invitation cannot be reused.
- **Revocable.** The inviter can revoke a pending invitation before acceptance.
- **Two channels.** Invitations are delivered via Telegram or Facebook
  Messenger (see `design-discussions/authentication-strategy-v2.md`).

This table is the entry point for all user onboarding except the initial owner
registration (which bypasses invitations).

---

## Part 2: CREATE TABLE

> **2026-04-25:** composite-PK refresh. `invited_by_id` stays a
> single-column FK to `users` (users is global, not tenant-scoped).

```sql
CREATE TABLE invitations (
  tenant_id     TEXT NOT NULL,
  id            TEXT NOT NULL,
  email         TEXT,                                  -- nullable: not all invitations go via email
  channel       TEXT NOT NULL DEFAULT 'telegram',      -- 'telegram' or 'facebook_messenger'
  channel_id    TEXT,                                  -- Telegram handle or FB profile URL / Messenger ID
  role          "Role" NOT NULL                        -- only tenant-scoped roles allowed
                CHECK (role IN ('TENANT_OWNER', 'TENANT_MANAGER', 'SERVICE_STAFF', 'KITCHEN_STAFF')),
  token_hash    TEXT UNIQUE NOT NULL,                  -- SHA-256 of raw invite token
  status        "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  expires_at    TIMESTAMP(3) NOT NULL,
  accepted_at   TIMESTAMP(3),
  invited_by_id TEXT REFERENCES users(id),             -- single-column FK: users is global
  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX ON invitations (tenant_id);
CREATE INDEX ON invitations (tenant_id, status);
```

Referenced enums:

```sql
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');
CREATE TYPE "Role" AS ENUM ('PLATFORM_ADMIN', 'PLATFORM_STAFF', 'TENANT_OWNER', 'TENANT_MANAGER', 'SERVICE_STAFF', 'KITCHEN_STAFF');
```

Note: `PLATFORM_ADMIN` and `PLATFORM_STAFF` are in the `Role` enum but are
**not valid values** for invitations. Platform roles are assigned through
internal tooling, not through the invitation flow. Application-layer
validation enforces this.

---

## Part 3: Column-by-Column

### `id` -- TEXT PRIMARY KEY

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** `cuid()`
- **Purpose:** Unique identifier for the invitation record. Used in the Merchant Portal's team management page to display, revoke, or resend invitations.
- **Constraints:** Primary key.
- **Why it exists:** Standard surrogate PK.

### `tenant_id` -- TEXT NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** Which tenant this invitation is for. The invitee will be granted a role in this tenant upon acceptance.
- **Constraints:** `NOT NULL`, `REFERENCES tenants(id) ON DELETE CASCADE`.
- **Why it exists:** Invitations are always tenant-scoped. There is no concept of a "platform invitation" -- platform admins are created through internal tooling. `ON DELETE CASCADE` ensures invitations are cleaned up when a tenant is deleted.

### `email` -- TEXT (nullable — optional contact)

- **Type:** `TEXT`
- **Nullable:** **Yes** — email is not the delivery channel, just optional contact info.
- **Default:** `NULL`
- **Purpose:** Optional email of the person being invited, for contact reference. **Not used to deliver the invitation** (delivery goes via `channel` / `channel_id`). May help match the invitee to an existing `users` row if they previously signed up with Facebook and granted email scope.
- **Constraints:** None (nullable).
- **Why kept:** inviters sometimes know the invitee's email but not their Telegram handle. Storing it optionally captures what the inviter knows. No `UNIQUE` constraint on `(tenant_id, email)` — a tenant may invite the same email multiple times.

### `channel` -- TEXT NOT NULL DEFAULT 'telegram'

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** `'telegram'`
- **Purpose:** How the invitation link is delivered to the invitee.
- **Valid values:** `'telegram'`, `'facebook_messenger'`.
- **Constraints:** `NOT NULL`. Application-layer validates the value is one of the two allowed.
- **Why it exists:** Per `authentication-strategy-v2.md`, auth is Telegram + Facebook + Phone-OTP, and invitations follow the messaging channels actually used in Cambodia. A kitchen staff member may not have email but is reachable on Telegram or Messenger.
- **Why TEXT instead of an enum:** channel values may evolve (e.g. SMS delivery later). A CHECK constraint can tighten it if needed.

### `channel_id` -- TEXT (nullable)

- **Type:** `TEXT`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** The invitee's identifier on the chosen channel.
- **Values by channel:**
  - `telegram` → Telegram username (@handle) or user ID
  - `facebook_messenger` → Facebook profile URL or Messenger ID
- **Constraints:** None.
- **Why it exists:** Enables delivery and matching. Combined with `channel`, it tells the system where to send the invitation link.

### `role` -- "Role" NOT NULL (tenant roles only)

- **Type:** `Role` enum
- **Nullable:** No
- **Default:** None
- **Purpose:** What role the invitee will receive upon acceptance. Valid subset: `TENANT_OWNER`, `TENANT_MANAGER`, `SERVICE_STAFF`, `KITCHEN_STAFF`.
- **Constraints:** `NOT NULL` + `CHECK (role IN ('TENANT_OWNER', 'TENANT_MANAGER', 'SERVICE_STAFF', 'KITCHEN_STAFF'))`. `PLATFORM_ADMIN` and `PLATFORM_STAFF` are rejected at the database level (not just the app), because the blast radius of an accidentally-created platform invitation is platform-wide admin access.
- **Why it exists:** The invitation specifies the role upfront so the invitee knows what they are being invited as ("You've been invited as Kitchen Staff at Lucky Burger") and is used to create the `user_roles` row upon acceptance. The CHECK constraint is defense-in-depth — platform users are seeded through internal tooling, never via this table.

### `token_hash` -- TEXT UNIQUE NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** SHA-256 hex digest of the raw invitation token. The raw token is embedded in the invitation URL (e.g., `xfos.com/invite?token=abc123...`).
- **Constraints:** `UNIQUE`, `NOT NULL`.
- **Why it exists:** **Security.** Same principle as `refresh_tokens.token_hash`. If the database is breached, the attacker gets hashes that cannot be used to accept invitations. The acceptance endpoint hashes the incoming raw token from the URL and looks up the row. The `UNIQUE` constraint ensures no two invitations share a token (collision resistance).

### `status` -- "InvitationStatus" NOT NULL DEFAULT 'PENDING'

- **Type:** `InvitationStatus` enum
- **Nullable:** No
- **Default:** `'PENDING'`
- **Purpose:** Current state of the invitation.
- **Constraints:** Must be one of: `PENDING`, `ACCEPTED`, `REVOKED`.
- **Why it exists:** State machine:
  - `PENDING` — invitation sent, waiting for the invitee to click the link. If `expires_at < now()`, the invitation is effectively expired (checked at click time and on dashboard display).
  - `ACCEPTED` — invitee clicked the link, connected a social account or set up email+password (if new), and a `user_roles` row was created.
  - `REVOKED` — the inviter explicitly cancelled the invitation before it was accepted.
  - Note: `EXPIRED` was removed from the enum. Expiry is derived from `expires_at < now()` at query time — no cron job needed.

### `expires_at` -- TIMESTAMP(3) NOT NULL

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** None (set by the application: `now() + 72 hours`)
- **Purpose:** When the invitation becomes invalid.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Limits the attack window. An invitation link that circulates indefinitely (forwarded via email, posted in a chat group) is a security risk. 72 hours is enough for the invitee to respond while keeping the window tight. A cleanup job transitions `PENDING` invitations past their `expires_at` to `EXPIRED`.

### `accepted_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** When the invitation was accepted. `NULL` for invitations that are still pending, expired, or revoked.
- **Constraints:** None.
- **Why it exists:** Audit trail. The Merchant Portal's team management page shows "Invitation accepted on [date]" alongside team members. Also useful for debugging: "The invitation was sent at `created_at` and accepted 4 hours later."

### `invited_by_id` -- TEXT (nullable FK)

- **Type:** `TEXT`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Which user sent this invitation. `NULL` if the invitation was created by a system process (e.g., auto-invitations during tenant provisioning).
- **Constraints:** `REFERENCES users(id)` (no cascade -- the invitation record survives even if the inviter's account is deleted).
- **Why it exists:** Audit trail. The Merchant Portal shows "Invited by Sokha Vann" next to pending invitations. The `audit_logs` table also captures this, but having it directly on the invitation row avoids a join for the common case.

### `created_at` -- TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** `CURRENT_TIMESTAMP`
- **Purpose:** When the invitation was created.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Audit trail. Combined with `expires_at`, it tells you the invitation's TTL window.

---

## Part 4: Indexes

### Primary key index on `id`

- **Implicit:** Yes
- **Query served:** Direct invitation lookup by ID (used in the Merchant Portal's invitation management).

### Unique index on `token_hash`

- **Implicit:** Yes (created by `UNIQUE`)
- **Query served:** The acceptance flow. When the invitee clicks the link, the backend hashes the raw token from the URL and looks up the invitation.
- **Example:**
  ```sql
  SELECT id, tenant_id, email, role, status, expires_at
  FROM   invitations
  WHERE  token_hash = 'sha256_hex_of_raw_token'
    AND  status = 'PENDING'
    AND  expires_at > NOW();
  ```

### Index on `tenant_id`

- **Query served:** "Show all invitations for this tenant" -- the Merchant Portal's team management page.
- **Example:**
  ```sql
  SELECT email, role, status, created_at, expires_at
  FROM   invitations
  WHERE  tenant_id = 'clx8tenant001...'
  ORDER BY created_at DESC;
  ```

### Index on `status`

- **Query served:** Dashboard filtering — "show all pending invitations for this tenant."
- **Example:**
  ```sql
  SELECT email, channel, role, created_at, expires_at
  FROM   invitations
  WHERE  tenant_id = 'clx8tenant001...'
    AND  status = 'PENDING'
    AND  expires_at > NOW()
  ORDER BY created_at DESC;
  ```

---

## Part 5: Relationships

### Outgoing FKs

| Target table | FK column | Cascade | Why |
|---|---|---|---|
| `tenants` | `tenant_id` | `ON DELETE CASCADE` | Invitation belongs to the tenant; cleaning up on tenant deletion |
| `users` | `invited_by_id` | No cascade | Preserve the invitation record even if the inviter is deleted |

### Incoming references

None. `invitations` is a leaf table.

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Owner invites kitchen staff via Telegram

Sokha owns "Lucky Burger." She navigates to the Merchant Portal's team page, selects "Telegram" as the channel, enters Chenda's Telegram handle `@chenda_cook`, selects "Kitchen Staff," and clicks "Send Invitation."

The system:
1. Generates a raw token: `crypto.randomBytes(32).toString('base64url')` (e.g., `aB3x...kZ9`).
2. Computes `SHA-256(raw_token)` and stores the hash.
3. Inserts:
   ```sql
   INSERT INTO invitations (id, tenant_id, email, channel, channel_id, role, token_hash, status, expires_at, invited_by_id)
   VALUES ('clx8inv001...', 'lucky_burger_id', NULL, 'telegram', '@chenda_cook', 'KITCHEN_STAFF',
           'sha256_hex...', 'PENDING', NOW() + INTERVAL '72 hours', 'sokha_id');
   ```
4. Sends a Telegram message to `@chenda_cook` with the link: `https://xfos.com/invite?token=aB3x...kZ9`.

Chenda has 72 hours to click the link. The Merchant Portal shows: "@chenda_cook — Kitchen Staff — Pending — Expires in 71h."

### Scenario 2: Invitee accepts via Facebook — then links phone as second method

Chenda clicks the link 6 hours later. The backend:

1. Extracts the raw token from the URL, computes `SHA-256(token)`.
2. Looks up:
   ```sql
   SELECT * FROM invitations
   WHERE token_hash = 'sha256_hex...' AND status = 'PENDING' AND expires_at > NOW();
   ```
3. Finds the invitation. Chenda does not have an XFOS account yet, so the system shows a registration page offering two MVP auth providers (Telegram, Facebook).

4. **First method — Facebook.** Chenda taps "Continue with Facebook" → Facebook confirms identity. System creates:
   a. A `users` row for Chenda (`status = 'PENDING'` until second method is linked).
   b. A first `user_auth_providers` row (`provider = FACEBOOK`).

5. **Gate: second method required** (per `authentication-strategy-v2.md` — "link at least two methods" is a hard onboarding gate). The UI shows: *"One more step — add a backup login. Phone or Telegram?"*
   The invitation is NOT yet marked `ACCEPTED`.

6. **Second method — Phone-OTP.** Chenda enters `012 345 678` → app normalizes to `+85512345678` → SMS OTP sent.
   - `phone_otp_attempts` row created with `otp_hash` and `expires_at = NOW() + 5 min`.
   - Chenda enters the code within 5 minutes.
   - App marks `phone_otp_attempts.used_at = NOW()`, sets `users.phone = '+85512345678'`, `phone_verified = TRUE`, `phone_verified_at = NOW()`.
   - Second `user_auth_providers` row created (`provider = PHONE, provider_id = '+85512345678'`).

7. **Two methods linked — finalize.** System:
   a. Flips `users.status = 'ACTIVE'`.
   b. Creates the `user_roles` row: `(chenda_id, lucky_burger_id, KITCHEN_STAFF)`.
   c. Updates the invitation:
      ```sql
      UPDATE invitations
      SET    status = 'ACCEPTED', accepted_at = NOW()
      WHERE  id = 'clx8inv001...';
      ```

8. Redirects Chenda to the kitchen app.

**Day-to-day login:** Chenda's Facebook + Phone link is primarily for identity recovery and onboarding proof. For her daily kitchen shift, she logs in via a **4-digit PIN** on the tenant-bound kitchen tablet (see `authentication-strategy-v2.md` UC-8 and the future `user_pins` table). Her OAuth identity here is what lets support re-associate her if the tablet/PIN system fails.

### Scenario 3: Owner revokes a pending invitation

Sokha accidentally invited the wrong Telegram handle (typo in the @handle). Before the invitee clicks the link, she opens the Merchant Portal and clicks "Revoke":

```sql
UPDATE invitations
SET    status = 'REVOKED'
WHERE  id = 'clx8inv001...' AND status = 'PENDING';
```

If the invitee later clicks the link, the acceptance flow will find `status = 'REVOKED'` and show an error: "This invitation has been revoked. Please contact the restaurant owner."

---

## Part 7: Design Decisions

### Why 72-hour TTL

72 hours (3 days) is a practical balance:
- Long enough for someone to check their email, even if they are not glued to their inbox (common in Cambodia where kitchen staff may check email infrequently).
- Short enough to limit the attack window. A link that lives forever is a liability -- it could be forwarded, screenshotted, or shared in a group chat.
- If the invitee misses the window, the owner can resend a new invitation.

### Why SHA-256 hashed tokens

Same defense-in-depth as `refresh_tokens`. If the database is compromised, the attacker cannot construct a valid invitation URL from the stored hashes. They would need the raw tokens, which were only ever sent via email and never stored.

### Why no UNIQUE(tenant_id, email) constraint

A tenant might need to re-invite the same email:
- The first invitation expired (`EXPIRED`).
- The first invitation was revoked (`REVOKED`).
- The invitee wants to be added with a different role.

Application logic ensures that only one `PENDING` invitation exists for a given `(tenant_id, email)` combination at any time.

### Why `invited_by_id` has no cascade

If Sokha invites Chenda and then Sokha's account is deleted, the invitation record should still show who sent it. Cascading the delete would lose that audit trail. The `invited_by_id` becomes a dangling reference, but since it is nullable and the `users` row might be `DELETED` (soft delete) rather than physically removed, the practical impact is minimal.

### Why platform roles are not valid invitation roles (and enforced at the DB)

`PLATFORM_ADMIN` and `PLATFORM_STAFF` are rare (a handful of people) and
their creation has security implications (platform-wide access). They are
onboarded through internal tooling, not through the self-service invitation flow.

The `role` column carries a `CHECK` constraint restricting values to
`TENANT_OWNER`, `TENANT_MANAGER`, `SERVICE_STAFF`, `KITCHEN_STAFF`. A bug
in the invitation endpoint that lets a platform-role value slip through
would fail at the database layer rather than quietly granting admin
access. Same defense-in-depth reasoning as `UNIQUE NULLS NOT DISTINCT` on
`user_roles`.

### Why EXPIRED was removed from InvitationStatus

The original design had 4 values including EXPIRED. It was removed because:
- It required a **cron job** to periodically flip PENDING → EXPIRED.
- Without the cron job, an invitation with `expires_at = yesterday` still
  shows `status = 'PENDING'` — stale, misleading data.
- The `expires_at` timestamp already tells the truth. The acceptance check
  validates `expires_at > NOW()` regardless of whether EXPIRED exists as a
  status value.
- Dashboard queries derive expiry: `CASE WHEN status = 'PENDING' AND expires_at < NOW() THEN 'expired' ELSE status END`.

### Why multi-channel delivery (not email-only)

With the auth strategy decision (Facebook + Telegram primary), many
invitees — especially kitchen staff in Cambodia — may not have or check
email. Sending an invitation via Telegram or Facebook Messenger reaches them
where they actually are. The `channel` + `channel_id` columns track the
delivery method; the token-link mechanism is identical across all channels.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `tenants` | Parent (N:1) | The tenant this invitation is for |
| `users` | Reference (N:1, as `invited_by_id`) | Who sent the invitation |
| `user_roles` | Logical successor | Accepting an invitation creates a `user_roles` row |
| `users` | Logical successor | Accepting an invitation may create a `users` row (for new invitees) |
| `user_auth_providers` | Logical successor | New invitees connect a social account or set up email on acceptance |
| `audit_logs` | Audit trail | Records invitation creation, acceptance, and revocation |
