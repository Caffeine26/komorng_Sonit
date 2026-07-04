# `phone_otp_attempts`

| Attribute | Value |
|---|---|
| **Domain** | Auth |
| **Tenant-scoped?** | No — global (keyed by phone number, not tenant) |
| **Prisma model** | `PhoneOtpAttempt` |
| **Mapped name** | `@@map("phone_otp_attempts")` |
| **Status** | ✅ New table 2026-04-23 — supports phone-OTP auth per `authentication-strategy-v2.md` |

---

## Part 1: Overview

`phone_otp_attempts` is the short-lived audit + rate-limiting store for SMS OTP codes issued during phone-number verification or phone-OTP login.

Every time a user requests an OTP (during signup-add-phone, recovery login, or phone-update-reverify), a row is inserted here with:

- The target phone number.
- A hash of the 6-digit OTP code (never the code itself in plaintext).
- An expiration timestamp (5 minutes after send).
- Counters for failed verification attempts.
- The source IP for abuse detection.

When the user enters the code, the app:

1. Finds the most recent non-expired, non-used row for that phone.
2. Checks `attempt_count` — if ≥ 5, lock the phone for 15 minutes and reject.
3. Compares the input to `otp_hash`. On match, marks the row `used_at = NOW()`.
4. On mismatch, increments `attempt_count`.

**This table is not the identity store.** The identity (user → phone mapping) lives on `users.phone` and `user_auth_providers` (provider = PHONE). This table is transient state for the OTP workflow — rows naturally expire and are periodically purged.

### Why phone number (not user_id) is the key

OTP flows happen **before** the user is authenticated. During signup, the user has no session; during recovery, the primary login is exactly what's broken. The phone number is what we have — it's the handle we rate-limit on, the recipient of the SMS, and the key we use to match incoming codes back to attempts.

A PHONE-provider user_auth_providers row may or may not exist yet when an attempt is created (it won't exist for first-time phone linking). Keying on phone keeps the workflow uniform across both cases.

### Rate-limiting strategy

| Rule | Window | Limit |
|---|---|---|
| OTP sends per phone | 60 seconds | 1 |
| OTP sends per phone | 1 hour | 5 |
| OTP sends per IP | 1 hour | 20 |
| Failed verifications per OTP code | (until code expires) | 5 |
| Lockout after 5 failed verifications | 15 minutes | 0 sends, 0 verifications accepted |

These rules are enforced at the application layer using queries against this table plus a short Redis cache for hot counters (see Part 7).

---

## Part 2: CREATE TABLE

```sql
CREATE TABLE phone_otp_attempts (
  id               TEXT PRIMARY KEY,
  phone            TEXT NOT NULL                           -- E.164 format, normalized
                   CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  otp_hash         TEXT NOT NULL,                          -- SHA-256 of the 6-digit OTP + per-row salt
  purpose          TEXT NOT NULL,                          -- 'signup' | 'login' | 'reverify' | 'add_phone'
  expires_at       TIMESTAMP(3) NOT NULL,                  -- typically NOW() + 5 minutes
  attempt_count    INTEGER NOT NULL DEFAULT 0,             -- failed verification attempts
  used_at          TIMESTAMP(3),                           -- set when the code is successfully consumed
  ip_address       INET,                                   -- source of the send request (for IP rate limiting)
  user_agent       TEXT,                                   -- optional; for abuse forensics
  created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Hot lookup: find the current valid OTP for this phone
CREATE INDEX phone_otp_attempts_phone_active_idx
  ON phone_otp_attempts (phone, created_at DESC)
  WHERE used_at IS NULL AND expires_at > CURRENT_TIMESTAMP;

-- Rate-limiting lookup: count recent sends for a phone
CREATE INDEX phone_otp_attempts_phone_created_idx
  ON phone_otp_attempts (phone, created_at DESC);

-- Cleanup job: find expired rows
CREATE INDEX phone_otp_attempts_expires_idx
  ON phone_otp_attempts (expires_at)
  WHERE used_at IS NULL;
```

---

## Part 3: Column-by-Column

### `id` -- TEXT PRIMARY KEY

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** `cuid()` (application-generated)
- **Purpose:** Surrogate primary key.
- **Constraints:** Primary key.
- **Why it exists:** Each OTP attempt is a distinct event. Audit logs and support tooling reference rows by `id`.

### `phone` -- TEXT NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** The target phone number, normalized to E.164 (e.g. `+85512345678`). The SMS is sent here; the verification is matched by this column.
- **Constraints:** `NOT NULL`, `CHECK (phone ~ '^\+[1-9][0-9]{6,14}$')`.
- **Why on this table (not FK'd to `users`):** OTP flows happen before auth. The phone may not yet be linked to a user (first-time phone add) or the user may be inaccessible (recovery login — all social providers broken). Keeping the column standalone handles both uniformly.

### `otp_hash` -- TEXT NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** SHA-256 hash of the 6-digit OTP code concatenated with a per-row salt. The raw OTP is never stored — if the database leaks, attackers cannot see the codes in transit.
- **Constraints:** `NOT NULL`.
- **Hash scheme:** `sha256(otp_code || row_salt)`. `row_salt` is a random 16-byte value generated per row (stored alongside the hash, or derived from `id`). SHA-256 is sufficient for short-lived 6-digit codes; bcrypt/argon2 is unnecessary (code entropy is only ~20 bits, code expires in 5 minutes — speed of verification matters more than resistance to offline cracking).

### `purpose` -- TEXT NOT NULL

- **Type:** `TEXT`
- **Nullable:** No
- **Default:** None
- **Purpose:** What the OTP is for, at a high level:
  - `'signup'` — first-time phone linking during onboarding.
  - `'login'` — recovery or standalone phone login.
  - `'reverify'` — user changed their phone; new OTP to confirm the new number.
  - `'add_phone'` — user adding phone to an already-active account (account settings).
- **Constraints:** `NOT NULL`. App-layer validates the value.
- **Why it exists:** Different purposes have different downstream effects. A successful `'login'` OTP issues a JWT; a successful `'signup'` OTP sets `users.phone_verified = TRUE` and creates the PHONE auth_providers row; etc. Storing the purpose makes the workflow explicit and audit-able.

### `expires_at` -- TIMESTAMP(3) NOT NULL

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** None (set by the app to `NOW() + INTERVAL '5 minutes'` at insert)
- **Purpose:** When this OTP stops being valid. After this time, verification attempts are rejected regardless of whether the code matches.
- **Constraints:** `NOT NULL`.
- **Why 5 minutes:** long enough for a user to type an SMS code with some real-world friction (lost signal, distraction), short enough that a leaked or intercepted code has minimal value. Industry-standard.

### `attempt_count` -- INTEGER NOT NULL DEFAULT 0

- **Type:** `INTEGER`
- **Nullable:** No
- **Default:** `0`
- **Purpose:** Number of failed verification attempts against this OTP row. When it reaches 5, the row is effectively locked — further attempts are rejected and the phone is considered "under attack" (15-minute soft lockout).
- **Constraints:** `NOT NULL`, app-layer convention `>= 0`.
- **Why counter per row (not per phone):** A user mistyping the code 4 times should not lock them out forever — they can request a new OTP (new row, counter resets). Per-row lock is the right granularity.

### `used_at` -- TIMESTAMP(3) (nullable)

- **Type:** `TIMESTAMP(3)`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Set to the current timestamp when the OTP is successfully consumed. Once set, this row is "spent" — cannot be reused, even if `expires_at` is still in the future.
- **Constraints:** None beyond type.
- **Why it exists:** Single-use semantics. Without it, an attacker with a leaked code could replay it multiple times (to cause state changes like re-verifying the phone, clearing a lockout, etc.). Each OTP is one-shot.

### `ip_address` -- INET (nullable)

- **Type:** `INET`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** The source IP of the request that triggered the OTP send. Used for IP-based rate limiting (e.g. max 20 sends per IP per hour) and for abuse forensics.
- **Constraints:** None beyond type.

### `user_agent` -- TEXT (nullable)

- **Type:** `TEXT`
- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** The HTTP User-Agent of the originating request. Optional — stored for abuse forensics when investigating suspicious patterns.
- **Constraints:** None.

### `created_at` -- TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

- **Type:** `TIMESTAMP(3)`
- **Nullable:** No
- **Default:** `CURRENT_TIMESTAMP`
- **Purpose:** When the row was inserted (i.e., when the SMS was sent).
- **Constraints:** `NOT NULL`.
- **Why it exists:** Time-window rate limiting reads this column: "how many sends to this phone in the last 60 seconds?"

---

## Part 4: Indexes

### Partial index `phone_otp_attempts_phone_active_idx`

- **Definition:** `(phone, created_at DESC) WHERE used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`
- **Query served:** **The hot path during verification** — find the most recent active (unused, unexpired) OTP row for this phone.
- **Example:**
  ```sql
  SELECT id, otp_hash, attempt_count, expires_at
  FROM phone_otp_attempts
  WHERE phone = '+85512345678'
    AND used_at IS NULL
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;
  ```
- **Why partial:** 99% of rows are past-state (used or expired). The partial index stays microscopic and hot.

### Index `phone_otp_attempts_phone_created_idx`

- **Definition:** `(phone, created_at DESC)`
- **Query served:** Rate-limit checks — count recent sends for this phone.
- **Example:**
  ```sql
  SELECT COUNT(*) FROM phone_otp_attempts
  WHERE phone = '+85512345678'
    AND created_at > NOW() - INTERVAL '1 hour';
  ```

### Partial index `phone_otp_attempts_expires_idx`

- **Definition:** `(expires_at) WHERE used_at IS NULL`
- **Query served:** Nightly cleanup job — purge expired unused rows.
- **Why partial:** Used rows are purged on a different cadence (audit retention window); this index only helps the unused-expired sweep.

### Primary key index on `id`

- Implicit.

---

## Part 5: Relationships

### Outgoing FKs

None. `phone_otp_attempts` does NOT reference `users`. The phone number is the soft-linkage (see Part 1). This makes the table self-contained for pre-auth and recovery flows.

### Incoming references

None. Leaf table.

### Soft linkage

- `phone_otp_attempts.phone` ↔ `users.phone`: application-layer correlation. When an OTP is successfully consumed with `purpose = 'login'` or `purpose = 'signup'`, the app looks up `users WHERE phone = ?` to find/create the user.
- `phone_otp_attempts.phone` ↔ `user_auth_providers.provider_id` (where `provider = 'PHONE'`): same pattern. Success promotes the attempt row to a `user_auth_providers` PHONE row (or confirms an existing one).

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: First-time phone linking (signup)

During merchant onboarding (per `authentication-strategy-v2.md` UC-2), Sokha has signed up with Telegram and is adding phone as her second auth method.

```
1. UI: "Enter your phone number"
2. User enters: 012 345 678 → app normalizes to +85512345678
3. App checks: any phone_otp_attempts in last 60s for +85512345678?
     → No. Generate 6-digit OTP = '482913', per-row salt, otp_hash = sha256('482913' || salt).
4. INSERT:
     phone: '+85512345678',
     otp_hash: '<hash>',
     purpose: 'signup',
     expires_at: NOW() + 5 minutes,
     ip_address: 'xxx.xxx.xxx.xxx'
5. App calls SMS gateway → "Your XFOS code is 482913"
6. Sokha receives SMS, enters 482913 in the UI.
7. App queries: SELECT FROM phone_otp_attempts WHERE phone='+85512345678' AND used_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1
   → finds the row.
8. Compares sha256('482913' || salt) with stored otp_hash → match.
9. UPDATE: used_at = NOW().
10. App writes users.phone = '+85512345678', phone_verified = TRUE, phone_verified_at = NOW().
11. App creates user_auth_providers row: provider = 'PHONE', provider_id = '+85512345678'.
12. Sokha's account now has 2 providers linked (TELEGRAM + PHONE). setup_progress.profile_completed_at unblocked.
```

### Scenario 2: Recovery login (both socials lost)

Per UC-6 of `authentication-strategy-v2.md`. Bopha lost access to both Facebook and Telegram but still has her phone.

```
1. Bopha taps "Use phone number" on login page.
2. Enters her phone.
3. App rate-checks (60s: 0, 1h: 0) → OK.
4. Generates OTP, inserts row with purpose='login'.
5. SMS sent. Bopha enters code.
6. App verifies — match — updates used_at.
7. App queries users WHERE phone = '+85512345678' AND phone_verified = TRUE
   → finds Bopha's user.
8. Verifies she has a PHONE row in user_auth_providers → yes.
9. Issues JWT with Bopha's primary tenant context.
10. Bopha is logged in. Can now update her dead provider rows from account settings.
```

### Scenario 3: Brute-force attempt

An attacker tries to brute-force a 6-digit code for a known phone.

```
1. Attacker sends a verification attempt with guess '000000'.
2. App finds the active row, compares hash → mismatch.
3. UPDATE attempt_count = 1.
4. Attacker tries '000001'... '000004'. attempt_count reaches 5.
5. On next attempt, app checks attempt_count >= 5 → reject with "Too many attempts. Please wait 15 minutes and request a new code."
6. App ALSO marks the phone as locked in the Redis hot cache for 15 minutes — no new OTPs accepted during this window.
7. After 15 minutes, lockout clears. If the legitimate user returns, they request a new OTP (new row, fresh counter).
```

At 5 attempts out of 1,000,000 possibilities, brute-forcing a 6-digit code is statistically negligible.

### Scenario 4: Accidental double-send

A user taps "Send OTP" twice within 30 seconds (slow SMS delivery makes them think the first didn't work).

```
1. First tap: row inserted, SMS queued.
2. Second tap (within 60s): app checks rate limit → rejects with "We just sent a code. Please wait {remaining_seconds} seconds before requesting another."
3. First SMS arrives 20 seconds later. User enters the code. Verified.
```

### Scenario 5: Nightly cleanup job

BullMQ cron job runs at 03:00 local time.

```sql
DELETE FROM phone_otp_attempts
WHERE expires_at < NOW() - INTERVAL '7 days';
```

Retention: 7 days after expiry (for audit / abuse-investigation window). Used rows are kept for the same window. Active rows are never touched by cleanup.

---

## Part 7: Design Decisions

### Why a table instead of Redis-only

Redis would be faster, but:
- OTP attempts are a security-audit artifact. A row in Postgres is durable and queryable; Redis keys expire.
- Rate-limiting joins with `audit_logs` for abuse-forensics queries are trivial with a table, awkward with cross-store joins.
- The hot-path reads are still sub-millisecond on an indexed Postgres table at MVP scale.
- Redis is still used as a complementary hot cache for rate-limit counters and lockout state — but Postgres is the source of truth.

### Why hash the OTP instead of encrypt

Hashing is strictly one-way — the database never contains the code in a recoverable form. Even the system operators cannot retrieve a code post-send (they'd need to re-send a new one). Encryption would require a key, and a compromised key exposes every in-flight code. Hashing is simpler and safer for this use case.

### Why SHA-256 and not bcrypt/argon2

6-digit OTPs have only ~20 bits of entropy — no hash function protects against offline brute force if the database leaks. The attacker would try all 1M combinations in seconds regardless of algorithm. What actually protects the system:

1. **Short lifetime** (5 minutes) — the hash is irrelevant after expiry.
2. **Rate limiting** (5 attempts per code, lockout after) — prevents online brute force.
3. **Single use** (`used_at`) — even if cracked, it cannot be reused.

Given these, fast SHA-256 verification is the right choice — argon2 at every login attempt adds latency without improving security.

### Why phone (not user_id) as the key

OTP flows happen before auth. The phone is available; the user may not be. Keying on phone unifies signup (no user yet) and recovery (user unreachable through primary providers) under one workflow.

### Why no FK to `users`

If `phone_otp_attempts.user_id` existed as a FK, first-time phone add could not insert a row until the user exists — but during signup, the user exists. During recovery, the user exists too. So the FK is *workable* but requires a JOIN for every rate-limit query. The phone-keyed design skips the JOIN and handles the edge case where phone was mistyped or belongs to someone other than the intended user — the abuse investigation is simpler when the phone is the primary lookup key.

### Why store `ip_address` and `user_agent`

For abuse forensics. If someone suspects their phone is being spammed with OTPs (targeted harassment), support staff need to see which IPs and UAs requested the sends. Pseudonymized; retained for the audit window.

### Why purpose is TEXT, not an enum

The set of purposes may grow over time (`'step_up_auth'`, `'delete_account_confirm'`, etc.). Enum migrations per new purpose add ceremony with no safety benefit — the application layer already validates acceptable values. A CHECK constraint can tighten later if needed.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `users` | Soft linkage via `phone` | Successful OTP sets `users.phone_verified = TRUE`; recovery login resolves `users` by matching `phone` |
| `user_auth_providers` | Soft linkage via `phone` / `provider_id` | Successful signup-add-phone creates a `provider = 'PHONE'` row; verifying during login confirms the existing one |
| `audit_logs` | Sibling | Successful OTP consumption emits an audit entry (`action = 'phone.otp_verified'`); failed-lockout events emit `'phone.otp_locked'` |
| `tenant_settings` | None — OTP is user-global | Unlike most schema tables, phone OTP is not tenant-scoped |

### Out of scope (deferred)

- **SMS delivery status webhooks.** The SMS gateway (Twilio or local) emits delivery-status callbacks. Handling them is a separate concern — possibly a future `sms_delivery_events` table. For MVP, fire-and-forget with retry on failure is sufficient.
- **Multi-channel OTP.** Email OTP, voice-call OTP, WhatsApp OTP — all out of scope. Phone-SMS is the only MVP channel.
