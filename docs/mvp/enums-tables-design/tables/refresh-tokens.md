# `refresh_tokens`

| Attribute | Value |
|---|---|
| **Domain** | Auth |
| **Tenant-scoped?** | Nullable (NULL for platform roles — `PLATFORM_ADMIN`, `PLATFORM_STAFF`; set for all tenant users) |
| **Prisma model** | `RefreshToken` |
| **Mapped name** | `@@map("refresh_tokens")` |

---

## Part 1: Overview

The `refresh_tokens` table stores hashed refresh tokens for JWT-based authentication. When a user logs in, the system issues a short-lived access token (JWT) and a long-lived refresh token. The raw refresh token is sent to the client; only its **SHA-256 hash** is stored in this table. When the access token expires, the client presents the refresh token to obtain a new access/refresh pair (token rotation).

This table enables:
- **Token rotation:** Each refresh produces a new token and invalidates the old one, limiting the damage window if a token is stolen.
- **Explicit revocation:** Logging out revokes the token by setting `revoked_at`.
- **Multi-device sessions:** A user can have multiple active refresh tokens (one per device/browser).
- **Cleanup:** A BullMQ job periodically deletes expired and revoked tokens.

The `tenant_id` column is nullable because **platform users** (`PLATFORM_ADMIN` and `PLATFORM_STAFF`) have no tenant context. For all other users (tenant owners, managers, service staff, kitchen staff), `tenant_id` identifies which tenant the session is scoped to.

---

## Part 2: CREATE TABLE

```sql
CREATE TABLE refresh_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id  TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,  -- SHA-256 hex
  expires_at TIMESTAMP(3) NOT NULL,
  revoked_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ON refresh_tokens (user_id);
CREATE INDEX ON refresh_tokens (user_id, tenant_id);
CREATE INDEX ON refresh_tokens (expires_at);  -- for cleanup job
```

Note: After H3 hardening, a partial index is added for the active-token expiry cleanup:

```sql
CREATE INDEX IF NOT EXISTS refresh_tokens_active_expiry_idx
  ON refresh_tokens (expires_at)
  WHERE revoked_at IS NULL;
```

---

## Part 3: Column-by-Column

### `id` -- TEXT PRIMARY KEY

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** `cuid()`
- **Purpose:** Unique identifier for the token record. Used by the application when revoking a specific token by ID (e.g., "log out this specific device session").
- **Constraints:** Primary key.
- **Why it exists:** Standard surrogate PK. The `token_hash` is also unique but is a long hex string, unsuitable as a join target.

### `user_id` -- TEXT NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** Which user this token belongs to.
- **Constraints:** `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE`.
- **Why it exists:** When a user is deleted, all their refresh tokens must be cascade-deleted to prevent orphaned sessions. This FK enables the "revoke all sessions for this user" operation: `DELETE FROM refresh_tokens WHERE user_id = ?`.

### `tenant_id` -- TEXT (nullable)

- **Type:** `TEXT`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Which tenant this session is scoped to. `NULL` for platform-role sessions (`PLATFORM_ADMIN` and `PLATFORM_STAFF`).
- **Constraints:** `REFERENCES tenants(id) ON DELETE CASCADE`.
- **Why it exists:** A user with roles in multiple tenants has separate refresh tokens per tenant. When the user logs into "Lucky Burger," the token carries `tenant_id = lucky_burger_id`. If they switch to "Boba Queen" in the same browser, a new token is issued with `tenant_id = boba_queen_id`. This prevents a token issued for one tenant from being reused to access another -- the `TenantGuard` validates that the token's `tenant_id` matches the request context.

### `token_hash` -- TEXT UNIQUE NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** SHA-256 hex digest of the raw refresh token. The raw token is a cryptographically random string (e.g., 32 bytes, base64url-encoded) sent to the client. Only the hash is stored.
- **Constraints:** `UNIQUE`, `NOT NULL`.
- **Why it exists:** **Security.** If the database is compromised (SQL injection, backup leak, unauthorized access), the attacker gets hashes, not usable tokens. They cannot present a hash to the refresh endpoint -- the endpoint hashes the incoming raw token and compares. This is the same principle as password hashing, applied to bearer tokens.

### `expires_at` -- TIMESTAMP(3) NOT NULL

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** None (set by the application: `now() + 30 days` typical)
- **Purpose:** When this token becomes invalid, regardless of whether it has been revoked.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Ensures tokens have a finite lifetime. Even if a token is never explicitly revoked (user closes the browser, loses the device), it will eventually expire. The cleanup job deletes rows where `expires_at < NOW()`.

### `revoked_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** When this token was explicitly revoked (user clicked "Log out" or admin force-revoked sessions). `NULL` means the token has not been revoked and is still valid (if not expired).
- **Constraints:** None.
- **Why it exists:** Enables explicit logout. The refresh endpoint checks: `if (token.revoked_at IS NOT NULL) { reject }`. Token rotation also revokes the old token when issuing a new one -- this is how stolen token detection works (if an old, already-rotated token is presented, the system knows the token was compromised and can revoke all tokens for the user).

### `created_at` -- TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** `CURRENT_TIMESTAMP`
- **Purpose:** When the token was issued.
- **Constraints:** `NOT NULL`.
- **Why it exists:** Audit trail. Useful for debugging ("this token was issued 29 days ago and is about to expire") and for the platform admin's session management view.

---

## Part 4: Indexes

### Primary key index on `id`

- **Implicit:** Yes
- **Query served:** Direct token lookup by ID (used in admin session management).

### Unique index on `token_hash`

- **Implicit:** Yes (created by `UNIQUE`)
- **Query served:** The critical path -- the refresh endpoint. When a user presents a refresh token, the backend hashes it and looks up the row.
- **Example:**
  ```sql
  SELECT id, user_id, tenant_id, expires_at, revoked_at
  FROM   refresh_tokens
  WHERE  token_hash = 'a1b2c3d4e5f6...';  -- SHA-256 hex of the raw token
  ```

### Index on `user_id`

- **Query served:** "Revoke all sessions for this user" (admin action, password change, account compromise).
- **Example:**
  ```sql
  UPDATE refresh_tokens
  SET    revoked_at = NOW()
  WHERE  user_id = 'clx8user001...' AND revoked_at IS NULL;
  ```

### Composite index on `(user_id, tenant_id)`

- **Query served:** "Revoke all sessions for this user in this tenant" (when a user's role is removed from a specific tenant).
- **Example:**
  ```sql
  UPDATE refresh_tokens
  SET    revoked_at = NOW()
  WHERE  user_id = 'clx8user001...' AND tenant_id = 'clx8tenant001...' AND revoked_at IS NULL;
  ```

### Index on `expires_at`

- **Query served:** The cleanup job that deletes expired tokens.
- **Example:**
  ```sql
  DELETE FROM refresh_tokens WHERE expires_at < NOW();
  ```

### Partial index on `expires_at WHERE revoked_at IS NULL` (after H3)

- **Query served:** Optimized cleanup that targets only active (non-revoked) tokens.
- **Example:**
  ```sql
  DELETE FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at < NOW();
  ```

---

## Part 5: Relationships

### Outgoing FKs

| Target table | FK column | Cascade | Why |
|---|---|---|---|
| `users` | `user_id` | `ON DELETE CASCADE` | User deletion removes all their sessions |
| `tenants` | `tenant_id` | `ON DELETE CASCADE` | Tenant deletion removes all sessions scoped to that tenant |

### Incoming references

None. `refresh_tokens` is a leaf table.

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: Normal login and token refresh

Sokha logs into the Merchant Portal for "Lucky Burger." Per
`authentication-strategy-v2.md`, the login flow is one of three paths —
Telegram, Facebook, or phone-OTP. The refresh-token issuance is
identical regardless of which path:

1. **Login via Telegram / Facebook / Phone-OTP.**
   - Telegram: Login Widget returns a signed payload. Backend verifies
     the signature against the bot token.
   - Facebook: OAuth 2.0 code-exchange returns an access token + user ID.
   - Phone-OTP: a `phone_otp_attempts` row is marked `used_at = NOW()`.
2. Backend finds the matching `users` row (via `user_auth_providers`
   `WHERE provider = ? AND provider_id = ?` for social, or
   `users WHERE phone = ? AND phone_verified = TRUE` for phone-OTP).
3. Checks `users.status = 'ACTIVE'` and reads `user_roles` for the
   tenant Sokha is logging into.
4. Generates a raw refresh token:
   `crypto.randomBytes(32).toString('base64url')`.
5. Hashes it: `SHA-256(raw_token)`.
6. Inserts into `refresh_tokens`:
   ```sql
   INSERT INTO refresh_tokens (id, user_id, tenant_id, token_hash, expires_at, created_at)
   VALUES ('rt_01', 'sokha_id', 'lucky_burger_id', 'sha256_hex...', NOW() + INTERVAL '30 days', NOW());
   ```
7. Returns the raw token to the client in a `Secure; HttpOnly; SameSite=Strict` cookie, and the new access token (JWT) in the response body.

15 minutes later, the access token expires. The client sends a request to `POST /auth/refresh` (the browser automatically attaches the cookie). The backend:
1. Hashes the incoming raw token.
2. Looks up `WHERE token_hash = ?`.
3. Checks `expires_at > NOW()` AND `revoked_at IS NULL`.
4. **Rotates:** revokes the old token (`SET revoked_at = NOW()`), inserts a new row with a fresh `token_hash`, and issues a new access token.
5. Responds with the new cookie and the new access token.

For the full step-by-step flow with concrete values, see `design-discussions/auth-token-walkthrough.md`.

### Scenario 2: User logs out explicitly

Sokha clicks "Log out" in the Merchant Portal. The frontend sends the refresh token to `POST /auth/logout`. The backend:

```sql
UPDATE refresh_tokens
SET    revoked_at = NOW()
WHERE  token_hash = 'sha256_of_presented_token'
  AND  revoked_at IS NULL;
```

The next time the client tries to refresh, it gets a 401.

### Scenario 3: Automatic compromise detection via token reuse

Rotation plus hash lookup lets the server detect token theft without any explicit action from the user or the platform admin.

**Setup:** Sokha's refresh token (raw `aBc…`, hash `f9e8d7c6…`) is stolen from her laptop — maybe via malware. Both she and the attacker now hold the same raw token.

1. **Attacker moves first.** Calls `/auth/refresh` with `aBc…`. Server looks up the hash, finds the row, rotates: old row is revoked, attacker receives a new token `xYz…`. Attacker is logged in as Sokha.
2. **Sokha's browser refreshes shortly after.** Her next access-token expiry triggers `/auth/refresh` with the same stolen raw token `aBc…`.
3. **Server hashes `aBc…` → `f9e8d7c6…` → finds the row, but `revoked_at IS NOT NULL`.** Token already consumed. This is the compromise signal.
4. **Server response:** `401 { reason: 'TOKEN_REUSE_DETECTED' }` + triggers the revoke-all-sessions flow:
   ```sql
   UPDATE refresh_tokens
   SET    revoked_at = NOW()
   WHERE  user_id = 'sokha_id' AND revoked_at IS NULL;
   ```
5. **Both Sokha and the attacker are now fully logged out**, including the fresh token the attacker just obtained. Sokha logs in again via Telegram (or whichever provider); the attacker, who does not have Sokha's Telegram account, cannot.

This is the primary benefit of token rotation: you detect leaks automatically, and the blast radius is bounded to one refresh cycle (minutes, not the full 30-day TTL).

### Scenario 4: Platform-admin-initiated revocation

A platform admin suspects Dara's account is compromised — perhaps from a suspicious-login alert or a user report. They revoke all his sessions manually:

```sql
UPDATE refresh_tokens
SET    revoked_at = NOW()
WHERE  user_id = 'dara_id' AND revoked_at IS NULL;
```

Dara is logged out of every device for every tenant. On his next access, he re-authenticates via his normal auth methods (Telegram, Facebook, or phone-OTP — whichever he has linked).

---

## Part 7: Design Decisions

### Why SHA-256 hash instead of storing the raw token

If the database is breached, raw tokens would allow an attacker to impersonate every logged-in user. Storing only the hash means:
- The attacker gets hashes, which cannot be reversed.
- They cannot present a hash to the refresh endpoint (it expects the raw token, hashes it internally, and compares).
- This is the same defense-in-depth principle as password hashing.

### Why token rotation (new token on every refresh)

Without rotation, a stolen refresh token is valid for its full lifetime (e.g., 30 days). With rotation, each refresh invalidates the old token. If both the legitimate user and the attacker try to use the same token, one of them gets a "token already used" error -- signaling a compromise. The system can then revoke all tokens for that user.

### Why `tenant_id` is nullable

**Platform roles** (`PLATFORM_ADMIN` and `PLATFORM_STAFF`) have no tenant context — their sessions are platform-scoped. Making `tenant_id` nullable accommodates this without a separate table or a magic sentinel value. All other sessions (merchants, managers, service staff, kitchen staff) carry a concrete `tenant_id` matching the tenant they logged into.

### Multi-tenant users — one refresh token per tenant session

A user with roles in multiple tenants (e.g. Dara, a `KITCHEN_STAFF` at Lucky Burger AND a `TENANT_MANAGER` at Malis) gets **one refresh token per active tenant session**. Each row has its own `tenant_id`, its own JWT audience, and its own revocation scope.

If Dara is logged into Lucky Burger and then switches to Malis in his tenant picker, the server issues a new refresh token scoped to Malis — the Lucky Burger token either stays valid in parallel (if he's using two browser tabs) or is revoked explicitly (if the UI treats tenant-switching as a logout-and-relogin). Either behavior is valid; implementation details live in the auth-service code.

Consequence: querying "is this user logged in?" requires checking across all their `refresh_tokens` rows, not just one.

### Why there is no `updated_at`

Refresh tokens are effectively append-only with soft revocation. A token is created, potentially revoked (by setting `revoked_at`), and eventually deleted by the cleanup job. There is no "update the token's data" operation. `created_at` and `revoked_at` together capture the full lifecycle.

### Why `ON DELETE CASCADE` on `tenant_id`

If a tenant is permanently deleted, all sessions scoped to that tenant must be invalidated. The cascade handles this automatically. A user who had roles in the deleted tenant can still log into their other tenants (those refresh tokens are on separate rows with different `tenant_id` values).

---

## Part 8: Related Tables

| Table / doc | Relationship | Purpose |
|---|---|---|
| `users` | Parent (N:1) | The user this session belongs to |
| `tenants` | Parent (N:1, nullable) | The tenant this session is scoped to |
| `user_roles` | Sibling (logical) | The role assignment that authorized this session |
| `user_auth_providers` | Sibling (logical) | Identity side — how the user proved they are who they say before a refresh token was issued |
| `phone_otp_attempts` | Sibling (logical) | For phone-OTP logins — the row marked `used_at` just before a refresh token is issued |
| `auth-token-walkthrough.md` | Reference doc | Step-by-step walkthrough of access token + refresh token lifecycle with concrete values |
| `authentication-strategy-v2.md` | Strategy doc | Why we use Telegram + Facebook + Phone-OTP as the three auth paths |
