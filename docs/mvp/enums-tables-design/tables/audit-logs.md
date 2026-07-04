# Table Reference: `audit_logs`

**Domain:** Admin / Platform
**Tenant-scoped:** Partially (`tenant_id` is nullable — NULL for platform-level events). Single-column `id` PK retained per the composite-PK convention's exception list.
**Last upgrade:** 2026-04-26 (typed `category`/`severity`/`actor_type` enums; `actor_label`; correlation IDs `request_id`/`auth_session_id`/`idempotency_key`; first-class `previous_state`/`new_state` diff; `user_agent`; `retention_until`; CHECK suite; 5 new indexes; partitioning deferred)

---

## Part 1 — Overview

`audit_logs` is the platform-wide, append-only event journal. Every significant action in the system — whether performed by a human user, a system process, or a webhook — produces a row in this table. It is cross-tenant by design: a single query can retrieve all events across all tenants (for platform admins) or filter to a single tenant (for merchant-facing audit views).

Unlike domain-specific history tables (`order_status_history`, `kitchen_ticket_events`), which record state transitions for a single entity type, `audit_logs` is a generic catch-all. Its `action` column is free-form TEXT (not an enum), because the vocabulary of auditable actions grows over time as features are added. Documented action conventions include:

- `order.created`, `order.confirmed`, `order.cancelled`
- `bill.created`, `bill.paid`, `bill.voided`
- `payment.created`, `payment.succeeded`, `payment.expired`
- `ticket.status_changed`
- `user.role_changed`, `user.invited`, `user.suspended`
- `tenant.created`, `tenant.activated`, `tenant.suspended`
- `menu_item.created`, `menu_item.updated`, `menu_item.deleted`

The `tenant_id` is nullable because some events are platform-level (e.g., `tenant.created` by a platform admin, `plan.updated`). For tenant-scoped events, `tenant_id` is always populated.

The `metadata` JSONB column carries action-specific context — it is the "what changed" payload that varies per action type. For example, a `menu_item.updated` event might store `{ "field": "base_price_cents", "old": 300, "new": 350 }`.

---

## Part 2 — CREATE TABLE

```sql
CREATE TABLE audit_logs (
  id              TEXT PRIMARY KEY,

  -- Tenant scope (nullable for platform-level events)
  tenant_id       TEXT REFERENCES tenants(id) ON DELETE SET NULL,

  -- Categorization
  category        "AuditCategory" NOT NULL,                  -- ORDER | BILLING | KITCHEN | CATALOG | AUTH | TENANT | PLATFORM | SYSTEM
  severity        "AuditSeverity" NOT NULL DEFAULT 'INFO',   -- INFO | NOTICE | WARNING | ALERT
  action          TEXT NOT NULL,                             -- free-form 'entity.verb'

  -- Actor
  actor_type      "AuditActorType" NOT NULL,                 -- USER | SYSTEM | WEBHOOK | CRON | API_KEY
  actor_label     TEXT,                                      -- required when actor_type != USER ('BullMQ:idempotency-cleanup', 'ABA-webhook', etc.)
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,

  -- Subject
  entity_type     TEXT,
  entity_id       TEXT,

  -- State diff (first-class for the common shape)
  previous_state  JSONB,
  new_state       JSONB,
  metadata        JSONB,                                     -- everything else that doesn't fit prev/new

  -- Correlation
  request_id      TEXT,                                      -- API request ID / BullMQ job ID
  auth_session_id TEXT,                                      -- JWT session that authorized USER actions
  idempotency_key TEXT,                                      -- request idempotency-key when applicable

  -- Provenance
  ip_address      INET,
  user_agent      TEXT,

  -- Lifecycle
  retention_until TIMESTAMP(3),                              -- NULL = retain forever; otherwise cleanup-eligible after this time
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT audit_logs_user_actor_has_user_id
    CHECK ((actor_type = 'USER') = (user_id IS NOT NULL)),
  CONSTRAINT audit_logs_system_actors_have_label
    CHECK ((actor_type = 'USER') OR (actor_label IS NOT NULL)),
  CONSTRAINT audit_logs_entity_id_requires_type
    CHECK (entity_id IS NULL OR entity_type IS NOT NULL)
);

CREATE INDEX ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX ON audit_logs (entity_type, entity_id);
CREATE INDEX ON audit_logs (action, created_at DESC);
CREATE INDEX ON audit_logs (category, created_at DESC);
CREATE INDEX audit_logs_user_id_created_at_idx
  ON audit_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX audit_logs_severity_alert_idx
  ON audit_logs (severity, created_at DESC)
  WHERE severity IN ('WARNING', 'ALERT');
CREATE INDEX audit_logs_request_id_idx
  ON audit_logs (request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX audit_logs_retention_idx
  ON audit_logs (retention_until)
  WHERE retention_until IS NOT NULL;
```

### Notes on the 2026-04-26 enterprise upgrade

- **`category` enum** — coarse domain axis (`ORDER`/`BILLING`/`KITCHEN`/
  `CATALOG`/`AUTH`/`TENANT`/`PLATFORM`/`SYSTEM`). The `action` text was
  the only filterable axis before; "show me all billing events" required
  `WHERE action LIKE 'bill.%' OR action LIKE 'payment.%'`. Now it's
  `WHERE category = 'BILLING'`. Application code derives category from
  the action prefix at write time.
- **`severity` enum** — `INFO` (default, the firehose), `NOTICE` (notable
  but not concerning), `WARNING` (something to watch), `ALERT` (page
  someone). Drives the platform-admin "anything concerning today?"
  feed via the partial `severity_alert_idx`.
- **`actor_type` enum** — disambiguates the previous "user_id is NULL"
  ambiguity. `USER` (a real human, with `user_id` set), `SYSTEM`
  (background daemon), `WEBHOOK` (incoming third-party callback),
  `CRON` (scheduled job), `API_KEY` (future: programmatic access).
- **`actor_label`** — when `actor_type != USER`, names the system actor:
  `"BullMQ:idempotency-cleanup"`, `"ABA-webhook"`,
  `"cron:tenant-deactivate"`. CHECK enforces it's set for non-USER
  actors.
- **`request_id`** — correlation ID that every API request and every
  BullMQ job carries. The single most useful column when investigating
  "what happened during this incident?": pull all rows with the same
  `request_id` to see every audit event triggered by one originating
  request.
- **`auth_session_id`** — the JWT session that authorized a USER action.
  Lets us mass-flag everything done with a session that was later
  revoked for compromise.
- **`idempotency_key`** — for events triggered by an idempotent API
  request, store the request's key so audit re-emission on retry is
  detectable.
- **`previous_state` + `new_state` JSONB** — the *de facto* `metadata.{
  field, old, new }` pattern was used everywhere; promoting to
  first-class columns lets a generic diff renderer in the merchant
  portal show before/after without parsing `metadata`. `metadata`
  remains for everything that doesn't fit the diff shape (e.g.,
  `bill.paid` carries `{paymentId, method, amountCents}` which isn't
  a state diff).
- **`user_agent`** — paired with `ip_address`. Forensics: "all events
  from this Kitchen App PWA install" or "all events from `curl`".
- **`retention_until`** — per-row retention deadline. NULL means "retain
  forever." A generic cleanup job runs `WHERE retention_until IS NOT NULL
  AND retention_until < NOW()` and deletes. Lets per-region
  GDPR / per-tenant retention policies plug in without schema changes.
  Partial index on this column makes the cleanup query cheap.
- **CHECK constraints**:
  - `audit_logs_user_actor_has_user_id` — `actor_type = USER` ⇔
    `user_id` is set. Prevents drift between the two ways of saying
    "a human did this."
  - `audit_logs_system_actors_have_label` — non-USER actors must name
    themselves.
  - `audit_logs_entity_id_requires_type` — orphan `entity_id` without
    `entity_type` is meaningless. (Class-wide events with
    `entity_type = 'Order', entity_id = NULL` remain legal: "bulk
    action across all orders.")

### Partitioning (deferred)

The table grows unboundedly in principle. At ~100k events/day per tenant
and 100 tenants, that's ~10M rows/year — Postgres handles that fine in
a single table. We will **revisit partitioning when:**

1. The table exceeds 100M rows, OR
2. The retention cleanup query consistently runs >5s, OR
3. A region-specific retention policy demands per-partition detach-and-drop.

The likely implementation when triggered: monthly RANGE partitions on
`created_at`. The migration is non-trivial (rebuild the table with
`CREATE TABLE … PARTITION BY RANGE (created_at)`, copy rows, swap), but
the application layer requires no changes — Postgres routes inserts and
queries transparently.

---

## Part 3 — Column-by-Column

| Column | Type | Nullable | Default | Purpose | Constraints | Why |
|--------|------|----------|---------|---------|-------------|-----|
| `id` | `TEXT` | No | App-generated cuid | Primary key. | `PRIMARY KEY` | Standard cuid. Single-column PK retained per the composite-PK convention's exception list (junction-style, nullable tenant_id). |
| `tenant_id` | `TEXT` | Yes | `NULL` | Tenant this event belongs to; NULL for platform-level events. | `REFERENCES tenants(id) ON DELETE SET NULL` | `SET NULL` on tenant deletion preserves the audit trail for compliance — the only table in the schema with that behavior. |
| `category` | `"AuditCategory"` | No | None | Coarse domain axis: `ORDER`, `BILLING`, `KITCHEN`, `CATALOG`, `AUTH`, `TENANT`, `PLATFORM`, `SYSTEM`. | `NOT NULL`, indexed | Lets dashboards and platform-admin queries filter by domain without parsing the `action` string. Application code derives this from the action prefix at write time. **Added 2026-04-26.** |
| `severity` | `"AuditSeverity"` | No | `'INFO'` | `INFO`, `NOTICE`, `WARNING`, `ALERT`. | `NOT NULL` | Drives the alerting feed (partial index over `WARNING`/`ALERT`). Most rows are `INFO`. **Added 2026-04-26.** |
| `action` | `TEXT` | No | None | Free-form `entity.verb`. | `NOT NULL` | TEXT instead of enum; action types grow as features ship. Enum would require migration for every new action. The `entity.verb` convention is enforced by code review, not the database. |
| `actor_type` | `"AuditActorType"` | No | None | `USER`, `SYSTEM`, `WEBHOOK`, `CRON`, `API_KEY`. | `NOT NULL` + CHECK with `user_id` | Disambiguates "user_id is NULL" — was it a webhook, a cron, or a system daemon? **Added 2026-04-26.** |
| `actor_label` | `TEXT` | Yes (only when `actor_type = USER`) | `NULL` | When non-USER, names the system actor: `"BullMQ:idempotency-cleanup"`, `"ABA-webhook"`, etc. | CHECK `actor_type = USER OR actor_label IS NOT NULL` | Specifically identifies the system caller for forensics and rate analysis. **Added 2026-04-26.** |
| `user_id` | `TEXT` | Yes (only when `actor_type = USER`) | `NULL` | The human actor. | `REFERENCES users(id) ON DELETE SET NULL` + CHECK with `actor_type` | Tightly paired with `actor_type` via CHECK: `actor_type = USER` ⇔ `user_id IS NOT NULL`. |
| `entity_type` | `TEXT` | Yes | `NULL` | PascalCase model name (`'Order'`, `'Bill'`, `'User'`). | CHECK `entity_id IS NULL OR entity_type IS NOT NULL` | Subject's class. Class-wide events (`entity_type='Order', entity_id=NULL`) are legal. |
| `entity_id` | `TEXT` | Yes | `NULL` | The cuid of the subject. | CHECK pairs with `entity_type` | NULL for class-wide / system events. CHECK forbids orphan `entity_id` without `entity_type`. |
| `previous_state` | `JSONB` | Yes | `NULL` | Pre-action snapshot (or partial: just changed fields). | None | Promotes the *de facto* "old/new" pattern to first-class. Drives a generic diff renderer in the merchant-portal audit page. **Added 2026-04-26.** |
| `new_state` | `JSONB` | Yes | `NULL` | Post-action snapshot (or partial: just changed fields). | None | Mirror of `previous_state`. **Added 2026-04-26.** |
| `metadata` | `JSONB` | Yes | `NULL` | Everything that doesn't fit the prev/new shape (e.g., `bill.paid` payment refs, free context). | None | JSONB for flexibility. With prev/new now first-class, `metadata` is leaner — just non-diff context. |
| `request_id` | `TEXT` | Yes | `NULL` | Correlation ID. Every API request and every BullMQ job has one. | Indexed (partial) | The single most useful column for incident response: pull all rows with the same `request_id` to see every audit event triggered by one originating request. **Added 2026-04-26.** |
| `auth_session_id` | `TEXT` | Yes | `NULL` | The JWT session that authorized a USER action. | None | Lets us mass-flag everything done with a session that was later revoked for compromise. **Added 2026-04-26.** |
| `idempotency_key` | `TEXT` | Yes | `NULL` | The request's idempotency-key when applicable. | None | Detect audit re-emission on retry of an idempotent request. **Added 2026-04-26.** |
| `ip_address` | `INET` | Yes | `NULL` | Client IP. | None | `INET` is compact and supports subnet queries. NULL for system events. |
| `user_agent` | `TEXT` | Yes | `NULL` | Client UA string. | None | Forensics: was this Chrome on Android, the Kitchen App PWA, or `curl`? **Added 2026-04-26.** |
| `retention_until` | `TIMESTAMP(3)` | Yes | `NULL` | Cleanup deadline; NULL = retain forever. | Indexed (partial) | Lets a generic cleanup job handle GDPR / per-region retention without schema changes. **Added 2026-04-26.** |
| `created_at` | `TIMESTAMP(3)` | No | `CURRENT_TIMESTAMP` | Event timestamp. | `NOT NULL` | Primary sort key for timelines. Millisecond precision. |

---

## Part 4 — Indexes

| Index | Columns | Type | Query it serves |
|-------|---------|------|-----------------|
| `audit_logs_tenant_id_created_at_idx` | `(tenant_id, created_at DESC)` | B-tree | Tenant timeline. Primary access pattern for the Merchant Portal audit page and platform-admin per-tenant investigations. |
| `audit_logs_entity_type_entity_id_idx` | `(entity_type, entity_id)` | B-tree | Entity history: "show me all events for this specific order / bill / user." |
| `audit_logs_action_created_at_idx` *(2026-04-26)* | `(action, created_at DESC)` | B-tree | Action-pattern queries: "all `bill.voided` this week", "all `payment.failed` today" — concrete platform-admin queries. |
| `audit_logs_category_created_at_idx` *(2026-04-26)* | `(category, created_at DESC)` | B-tree | Category-scoped dashboards: "all BILLING events today." |
| `audit_logs_user_id_created_at_idx` *(2026-04-26)* | `(user_id, created_at DESC) WHERE user_id IS NOT NULL` | Partial | "Show me everything this user did" — investigation pattern for compromised or rogue accounts. |
| `audit_logs_severity_alert_idx` *(2026-04-26)* | `(severity, created_at DESC) WHERE severity IN ('WARNING','ALERT')` | Partial | The alerting feed query — only scans rows that need attention. |
| `audit_logs_request_id_idx` *(2026-04-26)* | `(request_id) WHERE request_id IS NOT NULL` | Partial | Correlation lookups: pull every event that came from one originating request or BullMQ job. |
| `audit_logs_retention_idx` *(2026-04-26)* | `(retention_until) WHERE retention_until IS NOT NULL` | Partial | Retention cleanup job: `WHERE retention_until < NOW()`. |

Example queries:

```sql
-- Tenant timeline (Merchant Portal audit page)
SELECT * FROM audit_logs WHERE tenant_id = $1
ORDER BY created_at DESC LIMIT 50;

-- "What did this user do?" (compromised-account investigation)
SELECT * FROM audit_logs WHERE user_id = $1
ORDER BY created_at DESC LIMIT 200;

-- Alert feed (platform-admin "anything concerning today?")
SELECT * FROM audit_logs
WHERE severity IN ('WARNING','ALERT')
  AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Correlation lookup (what did this incident's originating request do?)
SELECT * FROM audit_logs WHERE request_id = $1 ORDER BY created_at ASC;

-- Action-pattern query (fraud-detection dashboard)
SELECT tenant_id, COUNT(*)
FROM audit_logs
WHERE action = 'bill.voided'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY tenant_id
HAVING COUNT(*) > 20
ORDER BY COUNT(*) DESC;
```

---

## Part 5 — Relationships

| FK Column | References | Cascade Behavior | Notes |
|-----------|------------|-------------------|-------|
| `tenant_id` | `tenants(id)` | `ON DELETE SET NULL` | Tenant deletion nulls the `tenant_id` but **preserves the audit log row**. This is the only table in the schema with `SET NULL` on tenant deletion (all others use `CASCADE`). The audit trail must survive tenant removal for compliance. |
| `user_id` | `users(id)` | `ON DELETE SET NULL` | User deletion nulls the `user_id` but preserves the audit log row. Same reasoning: the event happened even if the actor no longer exists. |

**No reverse relationships.** No other table has a foreign key pointing to `audit_logs`. Audit logs are terminal leaf nodes.

---

## Part 6 — Real-World Usage Scenarios

### Scenario 1: Merchant reviews today's activity (dessert shop, BKK1 Phnom Penh)

The shop owner opens the Merchant Portal at 9:00 PM to review the day. The audit log page shows:

| Time | Action | Entity | User | Details |
|------|--------|--------|------|---------|
| 20:45 | bill.paid | Bill BILL-000089 | (system) | `{"method":"ABA_QR","amountCents":450}` |
| 20:44 | payment.succeeded | Payment pay_078 | (system) | `{"reference":"PA-clx9mno0pqr1"}` |
| 20:30 | menu_item.updated | MenuItem (Mango Sticky Rice) | staff_dara | `{"field":"is_available","old":true,"new":false}` |
| 19:15 | bill.voided | Bill BILL-000085 | owner_srey | `{"reason":"Customer changed mind"}` |
| 18:00 | order.created | Order ORD-000112 | (system) | `{"totalCents":350,"items":["Coconut Ice Cream"]}` |

The owner notices the 19:15 void and remembers the customer who decided not to stay. Everything checks out.

### Scenario 2: Platform admin investigates tenant suspension (XFOS ops team)

A platform admin receives a report that a tenant might be involved in fraudulent activity. They query the audit log:

```sql
SELECT action, entity_type, entity_id, metadata, ip_address, created_at
FROM audit_logs
WHERE tenant_id = 'clx_suspicious_tenant'
  AND action IN ('bill.voided', 'bill.paid', 'payment.succeeded')
  AND created_at >= '2026-04-01'
ORDER BY created_at DESC;
```

They find 47 voided bills in one week and multiple payments from the same IP address with suspiciously round amounts. The platform admin suspends the tenant:

```sql
-- This INSERT is performed by the application layer after the suspension action
INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, metadata, ip_address, created_at)
VALUES (
  'clx_audit_12345',
  'clx_suspicious_tenant',
  'clx_platform_admin_01',
  'tenant.suspended',
  'Tenant',
  'clx_suspicious_tenant',
  '{"reason": "Suspected fraudulent void pattern", "voidCount": 47, "period": "2026-04-01 to 2026-04-09"}',
  '10.0.1.15',
  NOW()
);
```

### Scenario 3: Deleted tenant audit trail preserved

A tenant (a small stall that closed) is deleted via `permanent_delete_tenant()`. All the tenant's data is removed from `orders`, `bills`, `payments`, etc. But the `audit_logs` rows survive with `tenant_id = NULL` (set by `ON DELETE SET NULL`). Six months later, when the platform undergoes a financial audit, the auditor can still see that the tenant existed, when it was created, when it was activated, and when it was deleted:

```sql
SELECT * FROM audit_logs
WHERE entity_type = 'Tenant' AND entity_id = 'clx_deleted_tenant'
ORDER BY created_at ASC;
```

| Action | created_at | metadata |
|--------|------------|----------|
| tenant.created | 2026-01-15 | `{"name":"Sokha's Fried Rice"}` |
| tenant.activated | 2026-01-16 | `{"activatedBy":"platform_admin_01"}` |
| tenant.deleted | 2026-04-01 | `{"reason":"Business closed","deletedBy":"platform_admin_01"}` |

---

## Part 7 — Design Decisions

1. **`action` is free-form TEXT, not an enum (still true).** An action enum would require a Prisma migration for every new feature event. The free-form `entity.verb` convention is enforced by the application audit service, not the database. **2026-04-26 refinement:** the new `category` enum gives us the *coarse* axis as a typed first-class column while leaving `action` free-form for richness. Application code derives `category` from the action prefix at write time (e.g., `'bill.paid'` → `BILLING`).

2. **`ON DELETE SET NULL`, not `ON DELETE CASCADE`.** This is unique among all tables in the schema. Every other tenant-scoped table uses `CASCADE` (delete the tenant, delete the data). Audit logs are the exception because they serve a compliance function: the record of what happened must outlive the entities it describes. If a tenant is deleted, their audit trail becomes "orphaned" (tenant_id = NULL) but remains queryable via `entity_type`/`entity_id`.

3. **No `updated_at` column.** Audit logs are append-only. They are never modified after creation. Adding `updated_at` would suggest mutability, which contradicts the table's purpose.

4. **`metadata` is JSONB, not typed columns.** Each action type carries different context. A `bill.paid` event needs `paymentId` and `method`; a `user.role_changed` event needs `from` and `to` roles; a `menu_item.updated` event needs the field name and old/new values. JSONB absorbs all shapes without schema changes. The alternative (a wide table with nullable columns for every possible detail) would be unmaintainable.

5. **`ip_address` uses the `INET` type.** PostgreSQL's native `INET` type is more compact than TEXT for IP storage and supports network-specific queries (subnet matching, ordering). This is useful for security investigations ("all events from this IP range").

6. **Cross-tenant by design.** Unlike every other table where `tenant_id` is NOT NULL (or part of a unique constraint), `audit_logs` allows NULL `tenant_id`. This enables platform-level event logging in the same table, avoiding a separate `platform_audit_logs` table that would duplicate the schema.

7. **No bill/payment-specific history table at MVP.** The `SCHEMA_EVALUATION_GUIDE.md` notes that bills and payments lack dedicated history tables (unlike orders and kitchen tickets). At MVP, `audit_logs` covers bill and payment lifecycle events — augmented 2026-04-25 by denormalized lifecycle timestamps directly on `bills` and `payments` (e.g. `bills.paid_at`, `payments.succeeded_at`).

8. **2026-04-26: typed coarse axes (`category`, `severity`, `actor_type`) alongside free-form `action`.** The original design relied entirely on the free-form `action` for filtering. This worked for entity timelines but failed for two real query patterns: (a) "anything alarming today?" needed parsing the action string to find error events; (b) "all billing events" needed `LIKE 'bill.%' OR LIKE 'payment.%'`. The three new enums give first-class indexable axes without losing the richness of free-form actions. Application code maps from action prefix to category at write time.

9. **2026-04-26: actor disambiguation (`actor_type` + `actor_label`).** Previously `user_id IS NULL` could mean "system daemon," "incoming webhook," "scheduled cron," or "future API key" — all collapsed to one ambiguous absence. The new `actor_type` enum and `actor_label` text fully identify the non-human actor. CHECK constraints enforce: USER actors have `user_id`; non-USER actors have `actor_label`.

10. **2026-04-26: correlation IDs (`request_id`, `auth_session_id`, `idempotency_key`).** Cross-event correlation is the single most useful capability when investigating an incident. `request_id` ties together every audit event triggered by one originating API request or BullMQ job. `auth_session_id` ties events to a specific JWT session — useful for mass-flagging events when a session is later revoked. `idempotency_key` detects audit re-emission on retry.

11. **2026-04-26: state diff promoted to `previous_state` + `new_state`.** The original `metadata.{field, old, new}` shape was used by every "X.updated" action. Promoting to first-class columns lets a generic diff renderer in the merchant portal work without parsing JSONB. `metadata` remains for non-diff context.

12. **2026-04-26: `retention_until` for cleanup pluggability.** Per-row retention deadline. NULL means "retain forever" (the default). Lets a generic cleanup job handle GDPR / per-region / per-tenant retention without schema changes — just write the cleanup job once and pass appropriate values when inserting events. Partial index on this column makes the cleanup query cheap.

13. **2026-04-26: partitioning explicitly deferred.** The table grows unboundedly in principle. At MVP scale (likely <10M rows in year 1), Postgres handles single-table queries fine. Partitioning by `created_at` (monthly RANGE) is the right answer when row counts force it but adds operational complexity that isn't justified yet. Trigger conditions documented in Part 2.

---

## Part 8 — Related Tables

| Table | Relationship | Purpose |
|-------|-------------|---------|
| `tenants` | Optional parent (N:1, SET NULL) | Tenant this event belongs to. NULL for platform events. Preserved on tenant deletion. |
| `users` | Optional parent (N:1, SET NULL) | User who performed the action. NULL for system events. Preserved on user deletion. |
| `orders` | Loose reference via `entity_type = 'Order'` | Order-related audit events. Not a FK — the reference is logical, not enforced. |
| `bills` | Loose reference via `entity_type = 'Bill'` | Bill-related audit events. See `bills.md`. |
| `payments` | Loose reference via `entity_type = 'Payment'` | Payment-related audit events. See `payments.md`. |
| `kitchen_tickets` | Loose reference via `entity_type = 'KitchenTicket'` | Kitchen ticket audit events. See `kitchen-tickets.md`. |
| `order_status_history` | Parallel pattern | Orders have both `order_status_history` (domain-specific, typed transitions) and `audit_logs` entries. The two serve different purposes: domain history is for operational queries, audit logs are for compliance. |
| `kitchen_ticket_events` | Parallel pattern | Kitchen tickets have both `kitchen_ticket_events` (domain-specific, typed transitions) and `audit_logs` entries. Same dual-purpose pattern. See `kitchen-ticket-events.md`. |
