# Enum Reference: `AuditActorType`

| Property | Value |
|---|---|
| **Used by** | `audit_logs.actor_type` |
| **Domain** | Admin / Platform |
| **Pattern** | First-class actor disambiguation |
| **Introduced** | 2026-04-26 |

---

## Part 1 — What this enum is

`AuditActorType` disambiguates **who** triggered an audit event.

Before 2026-04-26, the only signal was `user_id`: if NULL, the actor
was "the system" — but that single absence collapsed four genuinely
different cases:

- A background daemon (e.g., session-cleanup worker)
- An incoming third-party webhook (e.g., ABA payment confirmation)
- A scheduled cron job (e.g., tenant deactivation timer)
- A future programmatic API key user

`actor_type` makes each case first-class. Combined with `actor_label`
(the system-actor's name), forensics queries like "all webhook events
that hit me in the last hour" become trivial.

---

## Part 2 — Values

```sql
CREATE TYPE "AuditActorType" AS ENUM (
  'USER', 'SYSTEM', 'WEBHOOK', 'CRON', 'API_KEY'
);
```

| Value | Meaning | `user_id` | `actor_label` examples |
|---|---|---|---|
| `USER` | A real human acted via the merchant portal, kitchen tablet, or storefront | required | NULL |
| `SYSTEM` | A platform-internal background process | NULL | `"BullMQ:idempotency-cleanup"`, `"BullMQ:notification-dispatcher"` |
| `WEBHOOK` | An incoming third-party callback | NULL | `"ABA-webhook"`, `"Telegram-webhook"` |
| `CRON` | A scheduled job | NULL | `"cron:session-timeout-24h"`, `"cron:audit-retention-cleanup"` |
| `API_KEY` | Programmatic access via API key (future) | NULL | `"apikey:xfos-public-001"`, `"apikey:partner-grab"` |

### `USER`
A real human action. The merchant clicks "Save" in the portal, a
kitchen staff member taps "Mark Ready," a customer scans a QR — all
USER events. `user_id` is set to the authenticated user's ID; for
anonymous customer actions (e.g., scanning a QR), there is no `user_id`
because the customer has no account at MVP, so the event isn't logged
under USER — it's logged under SYSTEM with `actor_label =
"storefront:anonymous"`.

### `SYSTEM`
A platform-internal background daemon or in-process worker. Examples:

- BullMQ workers (`"BullMQ:idempotency-cleanup"`,
  `"BullMQ:notification-dispatcher"`)
- The idempotency-key purge job
- Auto-deactivation cascades (e.g., when a `tables` row is removed,
  the cascading QR deactivation logs as `SYSTEM`)

### `WEBHOOK`
An incoming third-party callback. Examples:

- ABA PayWay payment-status callbacks (`"ABA-webhook"`)
- Telegram bot webhooks (`"Telegram-webhook"`)
- Future: Stripe webhooks, Wing payment webhooks

### `CRON`
A scheduled job firing on a clock. Distinct from `SYSTEM` (in-process
worker) because cron scheduling has different operational semantics
(missed firings, schedule drift, replay).

- `"cron:session-timeout-24h"` — closes inactive sessions
- `"cron:audit-retention-cleanup"` — purges expired audit rows
- `"cron:tenant-deactivate"` — deactivates tenants past grace period

### `API_KEY`
**Reserved for future** programmatic access. MVP has no API key
support, but the enum value is reserved so adding it later is an
additive enum change with no other schema impact.

---

## Part 3 — CHECK constraints

```sql
CONSTRAINT audit_logs_user_actor_has_user_id
  CHECK ((actor_type = 'USER') = (user_id IS NOT NULL))
```

Tightly biconditional: USER actors **must** have `user_id`; non-USER
actors **must not**. No drift possible.

```sql
CONSTRAINT audit_logs_system_actors_have_label
  CHECK ((actor_type = 'USER') OR (actor_label IS NOT NULL))
```

Non-USER actors **must** identify themselves via `actor_label`.
USER actors don't need a label (their identity is already in `user_id`).

---

## Part 4 — Forensics queries

### "What did this user do?"
```sql
SELECT * FROM audit_logs
WHERE actor_type = 'USER' AND user_id = $1
ORDER BY created_at DESC LIMIT 100;
```

### "All ABA webhook events in the last hour"
```sql
SELECT * FROM audit_logs
WHERE actor_type = 'WEBHOOK'
  AND actor_label = 'ABA-webhook'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### "Background-job activity for capacity planning"
```sql
SELECT actor_label, COUNT(*) AS events, DATE_TRUNC('hour', created_at) AS hr
FROM audit_logs
WHERE actor_type IN ('SYSTEM', 'CRON')
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY actor_label, hr
ORDER BY hr DESC, events DESC;
```

### "All non-human events" (broad system-activity audit)
```sql
SELECT * FROM audit_logs
WHERE actor_type != 'USER'
ORDER BY created_at DESC LIMIT 200;
```

---

## Part 5 — Design decisions

### Why first-class instead of stuffing into `metadata`

The pre-2026-04-26 convention was to encode actor type in
`metadata.actor` or similar. This made queries unindexable and
inconsistent across action types. First-class columns with a CHECK
constraint guarantee consistency.

### Why distinguish `SYSTEM`, `WEBHOOK`, `CRON` instead of one `NON_USER`

These three have different operational characteristics:

- **`SYSTEM` rate** is steady (workers run continuously). Spikes
  indicate worker malfunction.
- **`WEBHOOK` rate** correlates with external traffic. Spikes can
  indicate replay attacks or upstream issues.
- **`CRON` rate** is exactly the schedule's frequency. Misses or
  doublings indicate scheduling problems.

Lumping all three as `NON_USER` would erase the operational signal.

### Why reserve `API_KEY` now even though MVP has no API keys

Adding an enum value later is a Postgres `ALTER TYPE` operation that
locks the type briefly. Doing it once now (when no rows use it) is
cheap insurance for a future feature.

### Why anonymous customer scans aren't a separate actor type

A customer scanning a QR has no auth identity at MVP. Logging this
as USER would require `user_id IS NOT NULL`, which is false; logging
it as SYSTEM with `actor_label = "storefront:anonymous"` is the
honest representation. If MVP adds customer accounts, the
storefront flow gets a `user_id` and these events become USER.

---

## Part 6 — Related

| Doc | Relationship |
|---|---|
| `tables/audit-logs.md` | The host table |
| `tables/users.md` | The `user_id` FK target |
| `enums/audit-category.md` | Sibling axis: which domain? |
| `enums/audit-severity.md` | Sibling axis: how concerning? |
