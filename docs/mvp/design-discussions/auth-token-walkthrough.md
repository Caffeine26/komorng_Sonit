# Auth Tokens — End-to-End Walkthrough

**Date:** 2026-04-23
**Status:** 🟢 Reference doc (not a decision)
**Purpose:** explain in plain English how XFOS uses access tokens and refresh tokens, why we store a `token_hash` and not the raw token, and what happens in each step of a user's session. Meant as a learning reference, not a spec.

---

## The two tokens, in plain terms

Every logged-in session in XFOS has **two tokens** — one short, one long.

| | Access token (JWT) | Refresh token |
|---|---|---|
| **Lifetime** | 15 minutes | 30 days |
| **Format** | JWT (readable: contains `userId`, `tenantId`, `role`, expiry) | Opaque random string |
| **Sent on every request?** | Yes — in the `Authorization: Bearer …` header | No — only when the access token expires |
| **Stored on client** | In-memory or short-lived cookie | Secure httpOnly cookie |
| **Stored in DB?** | No — stateless | Yes — only the **hash** (`token_hash`), never the raw |
| **Revocable mid-life?** | No (but expires quickly) | Yes — set `revoked_at` |
| **Issued on login?** | Yes | Yes |
| **Issued on refresh?** | Yes (new one) | Yes (new one — the old is revoked) |

The split is deliberate: the access token is fast, stateless, and short-lived, so a stolen one is nearly worthless. The refresh token is the only thing that persists — and the only thing a careful attacker could try to steal over time.

---

## Where everything lives

Follow the data as it moves between client, server, and database.

### Client (browser or mobile app)

- **Access token (raw JWT):** stored in memory (or a short-lived cookie). Sent with every API call.
- **Refresh token (raw string):** stored in a `Secure, HttpOnly, SameSite=Strict` cookie. The browser sends it automatically to `/auth/refresh`; JavaScript cannot read it.
- **Nothing else.** No password, no OAuth tokens from Facebook/Telegram — those stay on the server side.

### Server (XFOS NestJS API)

- **Access token:** not stored anywhere. It's signed with a server secret; verification is stateless (decode + check signature + check expiry).
- **Refresh token:** raw token is never stored. When a refresh arrives, the server computes `SHA-256(raw_token)` and looks up the `token_hash` in the DB.
- **JWT signing key:** in an environment variable, not the DB.

### Database (`refresh_tokens` table)

```
id          — cuid
user_id     — who owns this session
tenant_id   — which tenant context (NULL for platform roles)
token_hash  — SHA-256 hex of the raw token
expires_at  — 30 days from creation
revoked_at  — NULL while active; NOW() on logout or compromise
created_at  — audit
```

**The raw token never touches the database.** Only its hash.

---

## Why a hash, not the raw token?

Imagine a database leak. With raw refresh tokens stored, an attacker with a DB dump can log in as every active user — 30 days of full access to every merchant's portal.

With only SHA-256 hashes:
- The attacker has `sha256_hex_strings…`. These are one-way — you cannot reverse a SHA-256 to recover the raw token.
- Presenting a hash to `/auth/refresh` fails because the endpoint expects the **raw** token (it hashes what it receives and compares).
- The attacker would need the raw tokens, which only exist on individual client devices.

This is the same "store the hash, not the secret" principle that protects passwords. Even though refresh tokens are rotated frequently (so a stolen one has at most 30 days of value), hashing is free insurance.

---

## Full scenario — Sokha logs in

**Actors:** Sokha (owner of "Street 99 Noodles"), using her phone browser. Tenant `code_prefix = 'S99'`.

### Step 1 — Login (Telegram OAuth)

Sokha taps **"Continue with Telegram"** on the XFOS login page.

```
Telegram Login Widget → confirms identity → returns signed payload
  { id: '987654321', first_name: 'Sokha', auth_date: ..., hash: ... }

Server:
  1. Verify the Telegram payload signature with the bot token. ✓
  2. Look up: user_auth_providers WHERE provider='TELEGRAM' AND provider_id='987654321'
     → finds Sokha's user (user_id = 'user_sokha_01')
  3. Check users.status = 'ACTIVE'. ✓
  4. Sokha has a TENANT_OWNER role for 'Street 99 Noodles' (tenant_s99).
     → current session is scoped to that tenant.

  5. GENERATE ACCESS TOKEN (JWT):
        {
          sub: 'user_sokha_01',
          tenantId: 'tenant_s99',
          role: 'TENANT_OWNER',
          iat: 2026-04-23T10:00:00Z,
          exp: 2026-04-23T10:15:00Z        ← 15 min lifetime
        }
     Signed with server secret → 'eyJhbGci...very-long-jwt-string'

  6. GENERATE REFRESH TOKEN:
        raw_token = crypto.randomBytes(32).toString('base64url')
                  = 'k7m2nP9x4Wq8bv3tz6aJhR5fL1oEdYcSvB0uT2iN4gH'   (43 chars)

  7. HASH IT:
        token_hash = sha256(raw_token).toHex()
                   = 'a1b2c3d4e5f6789...64-char-hex'

  8. INSERT INTO refresh_tokens:
        (id: 'rt_01', user_id: 'user_sokha_01', tenant_id: 'tenant_s99',
         token_hash: 'a1b2c3d4...',
         expires_at: 2026-05-23T10:00:00Z,   ← 30 days from now
         revoked_at: NULL,
         created_at: 2026-04-23T10:00:00Z)

  9. RESPOND to the client:
        Set-Cookie: refresh_token=k7m2nP9x4Wq8... ; HttpOnly ; Secure ; SameSite=Strict
        Body: { accessToken: 'eyJhbGci...' }
```

**What Sokha's browser holds now:**
- `accessToken` in memory (JS can read it for API calls).
- `refresh_token` in an httpOnly cookie (JS cannot read it — only sent automatically by the browser).

**What the DB holds:**
- One `refresh_tokens` row with `token_hash = 'a1b2c3d4...'`. The raw token is nowhere in the database.

### Step 2 — Normal API calls (within 15 minutes)

Sokha edits a menu item. Her browser sends:

```
POST /admin/menu-items
Authorization: Bearer eyJhbGci...
```

Server:
1. Decode the JWT. Verify signature. Check `exp > NOW()`. ✓
2. Extract `userId`, `tenantId`, `role`.
3. TenantGuard enforces `tenantId` scope. Authorize the action.
4. Execute the update.

**No DB lookup on `refresh_tokens`.** Fast, stateless. This is the hot path for every API call during the session.

### Step 3 — 15 minutes pass, access token expires

Sokha clicks "Save" on a menu item at minute 16. Her browser sends the request — but the access token is now expired.

```
POST /admin/menu-items
Authorization: Bearer eyJhbGci... (exp: 10:15:00Z, NOW() = 10:16:00Z)

Server:
  → verifies signature ✓ but checks exp → EXPIRED
  → responds 401 Unauthorized { reason: 'ACCESS_TOKEN_EXPIRED' }
```

The client (seeing 401 with this specific reason) automatically triggers the refresh flow. **Sokha never sees this** — it's transparent.

### Step 4 — Refresh flow

```
POST /auth/refresh
Cookie: refresh_token=k7m2nP9x4Wq8bv3tz6aJhR5fL1oEdYcSvB0uT2iN4gH
  (browser automatically attaches the cookie)

Server:
  1. Read the raw refresh_token from the cookie.
  2. Hash it: sha256(raw_token) = 'a1b2c3d4...'
  3. Look up:
        SELECT * FROM refresh_tokens
        WHERE token_hash = 'a1b2c3d4...'
          AND revoked_at IS NULL
          AND expires_at > NOW();
     → finds the row. ✓

  4. ROTATE — revoke the old token immediately:
        UPDATE refresh_tokens
        SET    revoked_at = NOW()
        WHERE  id = 'rt_01';

  5. Issue a NEW access token + NEW refresh token:
        new_raw_token   = crypto.randomBytes(32).toString('base64url')
                        = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890!@#$%^&'
        new_token_hash  = sha256(new_raw_token) = 'f9e8d7c6...'
        new_access_token = JWT with exp = NOW() + 15 min

        INSERT INTO refresh_tokens
          (id: 'rt_02', user_id: 'user_sokha_01', tenant_id: 'tenant_s99',
           token_hash: 'f9e8d7c6...',
           expires_at: 2026-05-23T10:16:00Z,
           revoked_at: NULL,
           created_at: 2026-04-23T10:16:00Z)

  6. Respond:
        Set-Cookie: refresh_token=aBcDeFgHiJ... ; HttpOnly ; Secure ; SameSite=Strict
        Body: { accessToken: 'eyJ...new-jwt' }

  7. The client retries the original POST /admin/menu-items with the new access token.
```

**DB state now:**
```
id     user_id          tenant_id     token_hash    revoked_at       expires_at
rt_01  user_sokha_01    tenant_s99    a1b2c3d4...   2026-04-23 10:16  2026-05-23 10:00
rt_02  user_sokha_01    tenant_s99    f9e8d7c6...   NULL              2026-05-23 10:16
```

The old token (`rt_01`) is revoked; the new one (`rt_02`) is active. Sokha's browser now holds the new cookie and the new access token. She can keep working for another 15 minutes before the next refresh.

### Step 5 — Sokha clicks "Log out"

```
POST /auth/logout
Cookie: refresh_token=aBcDeFgHiJ...

Server:
  1. Hash the token → 'f9e8d7c6...'
  2. UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = 'f9e8d7c6...'
  3. Respond: Set-Cookie: refresh_token=; Max-Age=0  (clear the cookie)
  4. Client discards the in-memory access token.
```

**DB state now:**
```
rt_01  (old, rotated)   revoked_at = 2026-04-23 10:16
rt_02  (logged out)     revoked_at = 2026-04-23 10:30
```

Both rows stay in the DB until the cleanup job deletes expired/revoked rows (typically daily, keeping 7 days for audit).

---

## Attack scenarios — what breaks, what holds

### Attack 1 — Database dump is stolen

Attacker grabs the `refresh_tokens` table.

```
id     user_id          token_hash    ...
rt_02  user_sokha_01    f9e8d7c6...
```

What the attacker has: SHA-256 hashes.
What they need to log in: the raw token (`aBcDeFgHi...`).
SHA-256 is one-way — they cannot reverse the hash.

**Attacker's options:** brute-force the pre-image of SHA-256. With 32 bytes = 256 bits of randomness, this is computationally infeasible (would take longer than the age of the universe).

**Blast radius:** near zero. Hash-only storage is the defense.

### Attack 2 — Stolen refresh token (from a single user's device)

Attacker steals Sokha's browser cookie via malware.

```
raw refresh_token = 'aBcDeFgHiJ...'
```

Attacker can call `/auth/refresh`, get a new access token, and impersonate Sokha. Bad.

**But:** rotation catches it. Here's the scenario:

1. Attacker calls `/auth/refresh` with `aBc…` → succeeds. Old token rotated to a new one (`xYz…`). Attacker has `xYz…`.
2. Meanwhile, Sokha's browser (still holding `aBc…`) hits its next access-token expiry and calls `/auth/refresh` with `aBc…`.
3. Server looks up `aBc…`'s hash → finds the row → **`revoked_at IS NOT NULL`** (just rotated).
4. Server response: `401 { reason: 'TOKEN_REUSE_DETECTED' }` + triggers a compromise alert.
5. System revokes **ALL** of Sokha's refresh tokens (including the attacker's fresh one):
    ```
    UPDATE refresh_tokens SET revoked_at = NOW()
    WHERE user_id = 'user_sokha_01' AND revoked_at IS NULL;
    ```
6. Sokha (and the attacker) both have to log in again. The legitimate Sokha does so fine via Telegram — with a fresh session. The attacker, who does not have Sokha's Telegram account, cannot.

**Blast radius:** limited to the time between theft and the first refresh mismatch. Usually < 15 minutes.

### Attack 3 — Database dump + stolen client cookie

The nuclear scenario. Attacker has both. They can log in as Sokha for up to 30 days — but **they cannot log in as any other user**, because each user's refresh token is independently random.

**This is why 30-day TTL + rotation matters:** it bounds the blast even in the worst case.

### Attack 4 — Someone guesses a `token_hash`?

They can't. The `token_hash` is the SHA-256 of a 32-byte random token. Even if they know a valid hash from the DB, the refresh endpoint requires the **raw** token. Submitting a hash → server hashes it again → `sha256(sha256(x))` → doesn't match the stored hash → rejected.

---

## A note on access tokens (JWTs)

The access token is NOT in this table. It's not stored server-side at all — it's stateless.

A JWT looks like `header.payload.signature` where:
- `header` is just `{ "alg": "HS256", "typ": "JWT" }` (base64-encoded).
- `payload` has `{ sub, tenantId, role, iat, exp }` (base64-encoded — **readable by anyone**).
- `signature` is `HMAC-SHA256(header.payload, SERVER_SECRET)`.

Anyone holding the JWT can read the payload. What they cannot do is forge one — they would need the server secret to produce a valid signature.

Access tokens are short-lived precisely because they are impossible to revoke. You bet on quick expiry instead of runtime invalidation. Refresh tokens (stored, hashed, revocable) fill the other half of the puzzle.

---

## Quick "mental model" recap

1. **Access token** = your fast badge. Unrevocable but short-lived (15 min). Used on every API call.
2. **Refresh token** = your long-lived ticket. Revocable. Used only to get new access tokens.
3. **Token rotation** = every refresh produces a new refresh token. If the old one ever shows up again, someone stole it.
4. **`token_hash`** = the database stores only the SHA-256 hash. If the DB leaks, the attacker gets nothing usable.
5. **Customers have none of this.** They're anonymous — no tokens, no session. Only an `order_token` URL for their status page, which is a one-shot credential, not a session credential.

---

## Related docs

- `tables/refresh-tokens.md` — the table definition and column-by-column docs
- `authentication-strategy-v2.md` — the overall auth strategy (Telegram + Facebook + Phone-OTP)
- `tables/user-auth-providers.md` — where provider identity (Telegram user ID, Facebook ID, phone) is linked to users — this is the "who are you" side of auth. Refresh tokens are the "stay logged in" side.
- `tables/phone-otp-attempts.md` — separate table for SMS OTP workflow; once OTP is consumed, a refresh token is issued (same flow as Telegram/Facebook login).
