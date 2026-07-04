# Table Reference: `idempotency_keys`

| Property | Value |
|---|---|
| **Domain** | Order |
| **Tenant-scoped** | Yes (composite PK `(tenant_id, id)`) |
| **Prisma model** | `IdempotencyKey` |
| **Table #** | 32 of 38 |
| **Last upgrade** | 2026-04-26 (`request_body_hash` SHA-256 — security fix; actor-triad mirror via `actor_type`/`actor_label`/`user_id`; `request_id` correlation; 4 CHECK constraints; 2 partial indexes) |

---

## Part 1 — Overview

The `idempotency_keys` table prevents duplicate processing of the same request. When a customer taps "Place Order" and the network is flaky, the storefront may retry the request. Without idempotency protection, the customer would get two identical orders and be charged twice. This table ensures that the same request, sent multiple times, produces the same result exactly once.

The mechanism is straightforward:
1. The storefront generates a unique `key` (UUID) before sending the order creation request.
2. The backend checks `idempotency_keys` for a matching `(tenant_id, key, endpoint)` row.
3. **If found:** the cached response is returned immediately. No order is created.
4. **If not found:** the order is created, and a new `idempotency_keys` row is inserted with the response.

The unique constraint is scoped per-tenant (C5 from the schema stress test). This prevents a cross-tenant security issue: without tenant scoping, an attacker in Tenant B who guesses Tenant A's idempotency key would receive Tenant A's cached response body -- leaking order data across tenant boundaries.

Keys have a 24-hour TTL. Expired keys are cleaned up hourly by a BullMQ job that calls the `cleanup_expired_idempotency_keys()` Postgres function.

---

## Part 2 — CREATE TABLE

> **2026-04-25:** composite-PK refresh.
>
> **2026-04-26:** added `request_body_hash` (security fix); actor-triad
> mirror; `request_id` correlation; CHECK suite; 2 partial indexes.

```sql
CREATE TABLE idempotency_keys (
  tenant_id          TEXT NOT NULL,
  id                 TEXT NOT NULL,

  -- Request identity
  key                TEXT NOT NULL,                            -- client-generated (typically UUID v4)
  endpoint           TEXT NOT NULL,                            -- e.g. 'POST /storefront/orders'
  request_body_hash  TEXT NOT NULL,                            -- SHA-256 hex of request body

  -- Cached response
  response_code      INTEGER NOT NULL,
  response_body      JSONB NOT NULL,

  -- Actor (aligned with audit_logs / order_status_history / kitchen_ticket_events)
  actor_type         "AuditActorType" NOT NULL,
  actor_label        TEXT,                                     -- required when actor_type != USER
  user_id            TEXT REFERENCES users(id),                -- single-column FK; users is global

  -- Correlation
  request_id         TEXT,                                     -- API request ID

  -- Lifecycle
  created_at         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at         TIMESTAMP(3) NOT NULL,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id, key, endpoint),

  CONSTRAINT idempotency_keys_user_actor_has_user_id
    CHECK ((actor_type = 'USER') = (user_id IS NOT NULL)),
  CONSTRAINT idempotency_keys_system_actors_have_label
    CHECK ((actor_type = 'USER') OR (actor_label IS NOT NULL)),
  CONSTRAINT idempotency_keys_expires_after_created
    CHECK (expires_at > created_at),
  CONSTRAINT idempotency_keys_response_code_valid
    CHECK (response_code BETWEEN 100 AND 599)
);

CREATE INDEX ON idempotency_keys (expires_at);

-- Correlation lookup
CREATE INDEX idempotency_keys_request_id_idx
  ON idempotency_keys (request_id)
  WHERE request_id IS NOT NULL;

-- "All idempotent requests by this user today"
CREATE INDEX idempotency_keys_user_id_idx
  ON idempotency_keys (user_id)
  WHERE user_id IS NOT NULL;
```

### Notes on the 2026-04-26 enterprise upgrade

- **`request_body_hash` (SHA-256 hex) — security fix.** The pre-2026-04-26
  design assumed "same `(tenant_id, key, endpoint)` ⇒ same request"
  but did not verify the request body. A legitimate retry with the
  same body would correctly hit the cache and return the cached
  response. **But** a stolen key replayed with a *different* body
  would *also* hit the cache and return the original response —
  silently allowing the attacker to "claim" credit for the original
  request without any audit trace.

  The fix: at insert time, the application stores `SHA-256(request_body)`
  in `request_body_hash`. On a retry:
  - Same `(tenant_id, key, endpoint)` + **same** hash → return cached
    `response_code` + `response_body` (original behavior).
  - Same `(tenant_id, key, endpoint)` + **different** hash → return
    `409 Conflict` with body `{"error": "idempotency_key_reused_with_different_payload"}`.
    Do NOT process the new request; do NOT return the cached response.

  The application's `IdempotencyService.check()` does the comparison;
  the database stores the hash. NOT NULL because every legitimate
  insert can compute the hash.

- **Actor-triad mirror (`actor_type` + `actor_label` + `user_id`).**
  Same shape as `audit_logs`, `order_status_history`,
  `kitchen_ticket_events`. Records the actor of the *original*
  request — useful for "who's submitting failed orders repeatedly?"
  forensics and abuse detection. At MVP the dominant actor is
  `SYSTEM` with `actor_label = 'storefront:anonymous'` (anonymous
  customer scanning a QR); merchant actions via the portal carry
  `USER` + `user_id`.

- **`request_id`.** Same correlation field as the append-only logs.
  When the same originating API request created an audit log entry,
  an order-status transition, AND an idempotency cache row, all three
  carry the same `request_id` — incident triage walks them with one
  query per table.

- **CHECK `expires_at > created_at`.** Sanity. No legitimate insert
  has expiry ≤ creation.

- **CHECK `response_code BETWEEN 100 AND 599`.** HTTP status sanity.
  Catches bugs where the application stores something nonsensical.

---

## Part 3 — Column-by-Column

### `id` — TEXT PRIMARY KEY

- **Nullable:** No
- **Default:** None (app-generated cuid)
- **Purpose:** Internal unique identifier for this idempotency record.
- **Constraints:** Primary key.
- **Why:** Standard cuid. Rarely used for direct lookups -- the primary access pattern is via the `(tenant_id, key, endpoint)` composite unique constraint.

### `tenant_id` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** The tenant that this idempotency key belongs to.
- **Constraints:** `REFERENCES tenants(id) ON DELETE CASCADE`. Part of the `UNIQUE (tenant_id, key, endpoint)` constraint.
- **Why:** Critical finding C5 from the schema stress test. The original design had the unique constraint on `(key, endpoint)` only -- tenant-unaware. This meant:
  - If Tenant A's storefront sends `key = "abc123"` to `POST /storefront/orders`, the response is cached.
  - If an attacker at Tenant B sends the same `key = "abc123"` to the same endpoint, they would receive Tenant A's cached response body, which contains order details, prices, and item names.

  Making `tenant_id` NOT NULL and including it in the unique constraint eliminates this cross-tenant cache-hit exfiltration vector. Tenant B's `key = "abc123"` is now a different cache entry from Tenant A's.

### `key` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None (generated by the client, typically a UUID v4)
- **Purpose:** The client-generated idempotency key sent in the request header (e.g., `Idempotency-Key: abc123`).
- **Constraints:** Part of `UNIQUE (tenant_id, key, endpoint)`.
- **Why:** The client (storefront JavaScript) generates this value before sending the request. If the request needs to be retried (network error, timeout), the same key is sent again. The server uses this key to detect the retry and return the cached response.

  The key is opaque to the server -- it does not parse or validate the format. Typically a UUID v4 (`550e8400-e29b-41d4-a716-446655440000`), but any unique string works. The only requirement is that the client generates a new key for each semantically different request.

### `endpoint` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** The API endpoint that this key was used with.
- **Constraints:** Part of `UNIQUE (tenant_id, key, endpoint)`.
- **Why:** The same key value can be used for different endpoints without collision. For example:
  - `key = "abc123"`, `endpoint = "POST /storefront/orders"` -- one cache entry.
  - `key = "abc123"`, `endpoint = "POST /storefront/payments"` -- a different cache entry.

  This prevents accidental cross-endpoint cache hits. The endpoint is stored as a human-readable string (not an enum) for flexibility -- new endpoints can be added without schema changes.

  Examples: `'POST /storefront/orders'`, `'POST /storefront/payments'`, `'POST /merchant/orders/{id}/cancel'`.

### `request_body_hash` — TEXT NOT NULL *(2026-04-26)*

- **Nullable:** No
- **Default:** None (computed by application from request body)
- **Purpose:** SHA-256 hex digest of the request body. Used to detect when the same `(tenant_id, key, endpoint)` is used with different payloads — either a client bug or an attack.
- **Constraints:** `NOT NULL`.
- **Why:** Closes a security hole in the original design. Without this column, a stolen idempotency key replayed with a malicious payload would hit the cache and silently return the original response. With it:
  - **Same hash on retry** → return cached `response_code` + `response_body`. Normal idempotent retry.
  - **Different hash on retry** → return `409 Conflict`. Do NOT process; do NOT return the cached response.

  The application computes `SHA-256(JSON.stringify(body))` (canonicalized) and writes it to this column at insert time. The check at lookup time is a single string compare — cheap.

  64-char hex string for SHA-256. SHA-1 was considered (40 chars, marginally cheaper) but rejected for collision resistance.

### `actor_type` — `"AuditActorType"` NOT NULL *(2026-04-26)*

- **Nullable:** No
- **Default:** None
- **Purpose:** Disambiguates the originator of the request: `USER`, `SYSTEM`, `WEBHOOK`, `CRON`, `API_KEY`. Reuses the enum from `audit_logs`.
- **Constraints:** `NOT NULL` + CHECK with `user_id` and `actor_label`.
- **Why:** Aligns with the actor-triad mirror applied across all the schema's append-only logs. Forensics queries like "all idempotent requests by this user today" or "all webhook-driven idempotent retries this hour" become trivially queryable.

  At MVP, the dominant value is `SYSTEM` with `actor_label = 'storefront:anonymous'` (anonymous customer placing an order). Merchant actions via the portal are `USER` + `user_id`. Future: ABA gateway webhook retries log as `WEBHOOK` + `actor_label = 'ABA-webhook'`.

### `actor_label` — TEXT *(2026-04-26)*

- **Nullable:** Yes (only when `actor_type = USER`)
- **Default:** None
- **Purpose:** When `actor_type != USER`, names the system actor: `'storefront:anonymous'`, `'ABA-webhook'`, `'BullMQ:retry-queue'`.
- **Constraints:** CHECK `actor_type = USER OR actor_label IS NOT NULL`.

### `user_id` — TEXT *(2026-04-26)*

- **Nullable:** Yes (only when `actor_type = USER`)
- **Default:** None
- **Purpose:** The human user who originated the request, when `actor_type = USER`.
- **Constraints:** `REFERENCES users(id)` (single-column; `users` is global). CHECK `(actor_type = 'USER') = (user_id IS NOT NULL)`.

### `request_id` — TEXT *(2026-04-26)*

- **Nullable:** Yes
- **Default:** None
- **Purpose:** Correlation ID. Same field as `audit_logs.request_id` — ties this idempotency entry back to every audit-log row, status-history row, and kitchen-event row produced by the same originating request.
- **Constraints:** Indexed (partial: `WHERE request_id IS NOT NULL`).

### `response_code` — INTEGER NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** The HTTP status code of the original response.
- **Constraints:** None.
- **Why:** When a retry hits the cache, the server must return the same HTTP status code as the original response. If the original request returned `201 Created`, the retry must also return `201`, not `200 OK`. This ensures the client sees a consistent response regardless of whether it was the original or a retry.

  Also useful for debugging: "this idempotency key was used for a request that returned 400 -- the client sent bad data and retried the same bad request."

### `response_body` — JSONB NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** The complete JSON response body of the original request.
- **Constraints:** None.
- **Why:** The cached response body is returned verbatim on retry. JSONB (not TEXT) allows:
  - Efficient storage (binary, deduplicated keys).
  - Querying into the response body for debugging (`response_body->>'orderId'`).
  - Postgres-native JSON operators for monitoring queries.

  The response body typically contains the created order's ID, order number, order token, status, and total.

  Example:
  ```json
  {
    "orderId": "order_001",
    "orderNumber": "ORD-000001",
    "orderToken": "kj7m2np9x4wq8bv3tz6a",
    "status": "SUBMITTED",
    "totalCents": 350,
    "currency": "USD"
  }
  ```

### `created_at` — TIMESTAMP(3) NOT NULL

- **Nullable:** No
- **Default:** `CURRENT_TIMESTAMP`
- **Purpose:** When this idempotency key was first used.
- **Constraints:** None.
- **Why:** Audit timestamp. Also used to determine the age of the cache entry. Although `expires_at` is the primary TTL mechanism, `created_at` allows monitoring: "how old is the average idempotency key at cleanup time?"

### `expires_at` — TIMESTAMP(3) NOT NULL

- **Nullable:** No
- **Default:** None (set by the application to `NOW() + 24 hours`)
- **Purpose:** When this cache entry should be deleted by the cleanup job.
- **Constraints:** Indexed.
- **Why:** Keys have a 24-hour TTL. After expiration, the cleanup job deletes the row, and the key can be reused (though in practice, clients always generate new keys). The 24-hour window is generous -- most retries happen within seconds. The long TTL accounts for:
  - Customers who close the app and reopen it hours later, triggering a retry.
  - Background sync mechanisms that retry failed requests on the next app foreground.
  - Edge cases where a request is queued in a service worker and sent much later.

  The cleanup function (C4) runs hourly via BullMQ:
  ```sql
  CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys() RETURNS INTEGER AS $$
  DECLARE deleted_count INTEGER;
  BEGIN
    DELETE FROM idempotency_keys WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
  END;
  $$ LANGUAGE plpgsql;
  ```

---

## Part 4 — Indexes

### `PRIMARY KEY (id)`

- **What it serves:** Rarely used. The primary access pattern uses the unique constraint, not the PK.
- **Example:** `SELECT * FROM idempotency_keys WHERE id = 'ik_001'`

### `UNIQUE (tenant_id, key, endpoint)`

- **What it serves:** The core idempotency check -- the most important query on this table.
- **Example:**
  ```sql
  -- Check if this request has already been processed
  SELECT response_code, response_body
  FROM idempotency_keys
  WHERE tenant_id = 'tenant_abc'
    AND key = '550e8400-e29b-41d4-a716-446655440000'
    AND endpoint = 'POST /storefront/orders';
  ```
- **Alternative (INSERT ... ON CONFLICT):**
  ```sql
  -- Atomic upsert: insert if new, return existing if duplicate
  INSERT INTO idempotency_keys (id, tenant_id, key, endpoint, response_code, response_body, expires_at)
  VALUES ('ik_new', 'tenant_abc', 'uuid-key', 'POST /storefront/orders', 201, '{"orderId":"..."}', NOW() + INTERVAL '24 hours')
  ON CONFLICT (tenant_id, key, endpoint) DO NOTHING
  RETURNING *;
  ```
  If the INSERT succeeds (new key), the application processes the request normally. If the INSERT hits the conflict (duplicate key), the application queries the existing row and returns its cached response.

### `INDEX ON idempotency_keys (expires_at)`

- **What it serves:** The hourly cleanup job that deletes expired keys.
- **Example:**
  ```sql
  -- Called by BullMQ every hour
  DELETE FROM idempotency_keys WHERE expires_at < NOW();
  ```
- **Why:** Without this index, the cleanup query would full-scan the table. With it, PostgreSQL uses a range scan on the B-tree to find all rows where `expires_at < NOW()`, which is efficient even with millions of rows.

---

## Part 5 — Relationships

### Foreign Keys

| Column | References | On Delete | Why |
|---|---|---|---|
| `tenant_id` | `tenants(id)` | `CASCADE` | Tenant deletion removes all cached responses |

### Incoming References

None. `idempotency_keys` is a standalone leaf table.

### Cross-FK Tenant Parity

No parity triggers are needed. The `tenant_id` is set directly on this table and does not reference a parent row in another tenant-scoped table (unlike `order_items` which references `orders`).

---

## Part 6 — Real-World Usage Scenarios

### Scenario 1: Normal order creation -- key cached, no retry

A customer at "Boba Khmae" places an order. The storefront generates an idempotency key and sends the request. It succeeds on the first try.

```
idempotency_keys:
  id:            'ik_boba_001'
  tenant_id:     'clx_boba_khmae'
  key:           '550e8400-e29b-41d4-a716-446655440000'
  endpoint:      'POST /storefront/orders'
  response_code: 201
  response_body: {"orderId":"order_boba_001","orderNumber":"ORD-000001",
                  "orderToken":"kj7m2np9x4","status":"SUBMITTED",
                  "totalCents":350}
  created_at:    2026-04-09 14:30:00
  expires_at:    2026-04-10 14:30:00    -- 24h TTL
```

The key sits in the table for 24 hours. If no retry occurs, the hourly cleanup job deletes it after expiration.

### Scenario 2: Network retry -- duplicate order prevented

A customer at a noodle stall places an order. The request succeeds on the server (order created, kitchen ticket generated), but the response never reaches the client due to a mobile network drop. The storefront retries with the same idempotency key.

```
First request (succeeds on server, response lost):
  → Server creates order_kt_001
  → Server computes SHA-256(request_body) = '4f2a8b...'
  → Server inserts idempotency_keys row:
      key:                'uuid-abc'
      endpoint:           'POST /storefront/orders'
      request_body_hash:  '4f2a8b...'
      response_code:      201
      response_body:      {...order...}
      actor_type:         'SYSTEM'
      actor_label:        'storefront:anonymous'
      request_id:         'req_a1b2c3...'
  → Response lost in transit

Retry (same key, same body):
  → Server computes SHA-256(request_body) = '4f2a8b...'    (same as cached)
  → Server checks: SELECT FROM idempotency_keys WHERE tenant_id = ? AND key = ? AND endpoint = ?
  → Row found! request_body_hash matches → return cached response_code (201) and response_body
  → Customer sees order confirmation
  → NO second order created
```

Without idempotency, the customer would have two orders (two kitchen tickets, double charge). With it, the retry is transparently handled.

### Scenario 2b: Same key, *different* body — 409 Conflict (security fix, 2026-04-26)

An attacker intercepts a customer's idempotency key from a logged request. They craft a different order body (e.g., adding expensive items) and POST it with the stolen key, hoping to get the original response back as if their malicious order had been processed.

```
Original request from legitimate customer:
  → Stored: request_body_hash = '4f2a8b...'  (1 latte)

Attacker's request with stolen key:
  → Server computes SHA-256(attacker_request_body) = '9c1d3e...'  (3 lattes + steak)
  → Server checks: SELECT FROM idempotency_keys WHERE tenant_id = ? AND key = ? AND endpoint = ?
  → Row found, but request_body_hash MISMATCH
  → Return 409 Conflict: {"error": "idempotency_key_reused_with_different_payload"}
  → Attacker's request is NOT processed
  → No new order created
  → No cached response leaked
```

The mismatch is logged as a `WARNING`-severity audit event. Repeated mismatches from the same `tenant_id` or `user_id` raise it to `ALERT` for security investigation.

### Scenario 3: Cross-tenant attack prevented by C5 scoping

An attacker at Tenant B guesses that Tenant A recently used idempotency key `abc123` for an order creation. The attacker sends a request to `POST /storefront/orders` with key `abc123` from Tenant B's storefront.

```
Tenant A's row:
  tenant_id: 'tenant_A', key: 'abc123', endpoint: 'POST /storefront/orders'
  response_body: {"orderId":"order_A_001","orderNumber":"ORD-000001",...}

Attacker's request from Tenant B:
  → Server checks: WHERE tenant_id = 'tenant_B' AND key = 'abc123' AND endpoint = '...'
  → No match! Tenant B has no row with this key.
  → Request proceeds as normal (creates a new order for Tenant B, or fails validation)
  → Tenant A's cached response is NOT returned to Tenant B
```

Before C5, the unique constraint was `(key, endpoint)` without `tenant_id`. The attacker's request would have matched Tenant A's row and received Tenant A's order data.

---

## Part 7 — Design Decisions

### Why the unique constraint includes `tenant_id` (C5)

The original schema had `UNIQUE (key, endpoint)`. This created a cross-tenant information disclosure vulnerability:
- Idempotency keys are client-generated UUIDs. While UUIDs are hard to guess, they are not secrets -- they appear in request headers, logs, and debugging tools.
- If an attacker discovers a key (e.g., from a shared network log), they can replay it against a different tenant's endpoint and receive the original tenant's cached response.

Adding `tenant_id` to the unique constraint means each tenant has its own keyspace. Tenant A's key `abc123` and Tenant B's key `abc123` are separate cache entries.

### Why `tenant_id` is NOT NULL (C5)

The original schema allowed `tenant_id` to be nullable. This was incorrect for the storefront use case: the tenant is always resolved from the QR token before the request body is composed. There is no legitimate scenario where an idempotency key exists without a tenant. Making it NOT NULL closes the "no tenant = no scoping" hole.

### Why the TTL is 24 hours (not shorter)

Shorter TTLs (1 hour, 5 minutes) would reduce storage but risk missing late retries. In Cambodia, mobile networks can be unreliable (2G/3G in rural areas), and customers may close and reopen the browser hours later. 24 hours is generous enough to cover all realistic retry scenarios while keeping the table small (cleanup runs hourly).

### Why cleanup uses BullMQ, not pg_cron

BullMQ is the standard job runner in the XFOS stack (already used for payments, notifications, and other background work). Using BullMQ for cleanup keeps all scheduled jobs in one system with one monitoring dashboard. pg_cron is an alternative if the extension is available on Railway, but it adds a dependency and a separate monitoring surface.

The cleanup function is a simple `DELETE WHERE expires_at < NOW()` and returns the count of deleted rows for monitoring.

### Why the response body is stored as JSONB

Three alternatives were considered:
1. **Store nothing** -- re-execute the request on retry. Rejected because idempotency means "same response," not "re-process."
2. **Store as TEXT** -- simpler, but no JSON querying or indexing. Wastes space (no key deduplication).
3. **Store as JSONB** (chosen) -- queryable, compact, and Postgres-native. Allows debugging queries like `WHERE response_body->>'orderId' = 'order_001'`.

### Why there is no `updated_at` column

Idempotency keys are write-once. They are created when the first request arrives and deleted when they expire. There is no update path. Adding `updated_at` would imply mutability that does not exist.

### Why `request_body_hash` is NOT NULL (2026-04-26 security fix)

The original design allowed the application to write the row without verifying the request body on retry. A stolen key could be replayed with a different payload and silently hit the cache. Making `request_body_hash` `NOT NULL` and enforcing it at the application's `IdempotencyService.check()` boundary means:

1. Every legitimate insert can compute the hash (the body is right there).
2. Every retry MUST be checked against the stored hash — there is no "fall back to no-check" path.
3. A NULL hash would indicate a corrupt row; the `NOT NULL` constraint prevents that state from ever existing.

This is a correctness fix, not just an enhancement. The pre-2026-04-26 schema had a real (if obscure) cross-tenant cache-confusion vector even after the C5 tenant-scoping fix.

### Why the actor-triad mirror lives on this table too (2026-04-26)

`idempotency_keys` is technically not an append-only audit log — rows are deleted on expiry. But its purpose overlaps with audit logging: it records "this request happened, with this response, at this time, by this actor."

Forensics queries like "all idempotent requests this user made today" or "all webhook-driven retries this hour" are concretely useful for abuse detection. Reusing the same `actor_type` / `actor_label` / `user_id` / `request_id` shape keeps the query surface consistent across all four schema tables that record request-level events: `audit_logs`, `order_status_history`, `kitchen_ticket_events`, and `idempotency_keys`.

---

## Part 8 — Related Tables

| Table | Relationship | Notes |
|---|---|---|
| `tenants` | Parent (FK) | Every idempotency key is tenant-scoped |
| `orders` | Indirect | The primary use case is preventing duplicate order creation |
| `payments` | Indirect | Payment creation may also use idempotency keys (future) |
| `tenant_sequences` | Indirect | The `allocate_order_number()` function runs in the same transaction as the idempotency check, ensuring atomic number allocation |
