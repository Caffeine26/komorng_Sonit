# Enum Reference: `AuditSeverity`

| Property | Value |
|---|---|
| **Used by** | `audit_logs.severity` |
| **Domain** | Admin / Platform |
| **Pattern** | Attention-priority axis |
| **Introduced** | 2026-04-26 |

---

## Part 1 — What this enum is

`AuditSeverity` indicates how attention-worthy an audit event is.
Default is `INFO` — the firehose. The enum drives:

- The platform-admin **alert feed** ("anything concerning today?")
- Sentry / PagerDuty integration for `ALERT` rows
- Merchant-portal **filter chips** ("show only warnings")

A partial index over `WHERE severity IN ('WARNING', 'ALERT')` keeps the
alert-feed query cheap regardless of how many `INFO` rows the table
accumulates.

---

## Part 2 — Values

```sql
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'NOTICE', 'WARNING', 'ALERT');
```

### `INFO` (default)
Normal operations. The default for the vast majority of rows.

**Examples:** `order.created`, `payment.succeeded`, `bill.paid`,
`menu_item.updated`, `user.invited`, `cleanup.idempotency_keys_purged`.

### `NOTICE`
Notable but not concerning. Administrative actions that deserve to
stand out without alerting.

**Examples:** `tenant.suspended` (legitimate platform-admin action),
`bill.voided` (legitimate void with reason),
`user.role_changed` (admin grant/revoke), `qr.regenerated`,
`refund.issued`.

**Why distinct from `INFO`:** A merchant scanning their audit page
should see `NOTICE` rows highlighted (e.g., bold) so they don't miss
"someone changed a role" amid 1000 `order.created` rows.

### `WARNING`
Something to watch. Repeated or unexpected events that may indicate a
pattern worth investigating.

**Examples:** `payment.failed` after 3 retries, `bill.voided` >5x by
same user/day, `auth.session_revoked` due to anomaly,
`webhook.signature_invalid` (single occurrence — rare in healthy
operation).

**Drives:** the platform-admin "watchlist" view; merchant-portal
banner notifications ("3 payments failed today").

### `ALERT`
Page someone. Security-critical or production-breaking events.

**Examples:** `auth.compromised_session_detected`,
`system.database_unavailable`,
`payment.gateway_signature_invalid` (repeated),
`webhook.replay_attack_detected`,
`tenant.massive_void_pattern` (anti-fraud trigger).

**Drives:** Sentry / PagerDuty integration; platform-on-call paging.
Should be rare — rows at this severity are real incidents.

---

## Part 3 — State semantics

`severity` is set at write time by the application's audit service
based on event type. Events don't transition between severities.

The application `AuditService.write()` accepts an explicit `severity`
parameter and falls back to `INFO`. Code review enforces the right
severity for each new action.

```ts
// Examples from a hypothetical audit-service contract
AuditService.write({ action: 'order.created',          severity: 'INFO'    });
AuditService.write({ action: 'tenant.suspended',       severity: 'NOTICE'  });
AuditService.write({ action: 'payment.gateway_signature_invalid', severity: 'WARNING' });
AuditService.write({ action: 'auth.compromised_session_detected', severity: 'ALERT'   });
```

---

## Part 4 — Indexes

```sql
-- Alert feed — partial, only over interesting rows
CREATE INDEX audit_logs_severity_alert_idx
  ON audit_logs (severity, created_at DESC)
  WHERE severity IN ('WARNING', 'ALERT');
```

The full `(severity, created_at)` index would be wasteful — 99%+ of
rows are `INFO`. The partial index covers the alert query without
indexing the firehose.

---

## Part 5 — Design decisions

### Why 4 levels, not 3 or 5

- 3 levels (`INFO/WARN/CRIT`) collapses `NOTICE` (admin-attention) and
  `INFO` (firehose), making the merchant-portal "highlights" view
  noisy.
- 5 levels (e.g., adding `DEBUG`) is overkill — debug-level audit
  events shouldn't be persisted; they belong in application logs.

The 4-level mapping (`INFO/NOTICE/WARNING/ALERT`) cleanly maps to the
three real consumers: firehose feed, merchant-portal highlights,
platform watchlist, on-call paging.

### Why `NOTICE` for legitimate admin actions, not `WARNING`

`tenant.suspended`, `bill.voided` with a reason, `user.role_changed` —
these are **expected** administrative actions that happen every day.
Calling them `WARNING` would normalize warnings ("oh that's just admin
stuff") and erode the alerting signal-to-noise.

`NOTICE` says: "you should know this happened, but nothing's wrong."
`WARNING` says: "this might be wrong, look into it."

### Why severity is set at write, not derived

A trigger could derive severity from action prefix or other columns,
but action-by-action severity policy is a product decision: a merchant
might want `bill.voided` highlighted (NOTICE) on their portal, but the
platform team might raise its severity to WARNING for a tenant under
investigation. Application-layer control gives that flexibility.

---

## Part 6 — Related

| Doc | Relationship |
|---|---|
| `tables/audit-logs.md` | The host table |
| `enums/audit-category.md` | Sibling axis: which domain? |
| `enums/audit-actor-type.md` | Sibling axis: who triggered? |
