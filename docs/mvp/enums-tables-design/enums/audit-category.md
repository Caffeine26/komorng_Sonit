# Enum Reference: `AuditCategory`

| Property | Value |
|---|---|
| **Used by** | `audit_logs.category` |
| **Domain** | Admin / Platform |
| **Pattern** | Coarse axis paired with free-form `action` text |
| **Introduced** | 2026-04-26 |

---

## Part 1 — What this enum is

`AuditCategory` is the **coarse** domain axis of every audit event. The
`action` column stays free-form TEXT (`'bill.paid'`, `'order.created'`,
`'menu_item.price_changed'`) for richness, but coarse axis filtering
("show me all billing events", "all auth events from this IP") demands
a typed first-class column.

Application code derives `category` from the action prefix at write time:

```ts
function deriveCategory(action: string): AuditCategory {
  const prefix = action.split('.')[0];
  switch (prefix) {
    case 'order': case 'cart': case 'session': case 'qr':
      return 'ORDER';
    case 'bill': case 'payment': case 'refund':
      return 'BILLING';
    case 'ticket':
      return 'KITCHEN';
    case 'menu_item': case 'menu_category':
      return 'CATALOG';
    case 'user': case 'auth': case 'invitation': case 'role':
      return 'AUTH';
    case 'tenant': case 'tenant_settings': case 'floor_plan': case 'table':
      return 'TENANT';
    case 'plan': case 'subscription': case 'platform':
      return 'PLATFORM';
    case 'system': case 'cleanup': case 'cron': case 'webhook':
      return 'SYSTEM';
    default:
      throw new Error(`Unknown action prefix: ${prefix}`);
  }
}
```

The mapping is intentional — adding a new feature with its own action
prefix requires a one-line addition to the mapping function.

---

## Part 2 — Values

```sql
CREATE TYPE "AuditCategory" AS ENUM (
  'ORDER', 'BILLING', 'KITCHEN', 'CATALOG', 'AUTH',
  'TENANT', 'PLATFORM', 'SYSTEM'
);
```

### `ORDER`
Customer-facing flow: cart, session, order placement, QR resolution.

**Action prefixes:** `order.*`, `cart.*`, `session.*`, `qr.*`
**Examples:** `order.created`, `order.cancelled`, `cart.abandoned`,
`session.opened`, `session.closed`, `qr.regenerated`, `qr.expired_auto`

### `BILLING`
Money path: bills, payments, refunds.

**Action prefixes:** `bill.*`, `payment.*`, `refund.*`
**Examples:** `bill.created`, `bill.paid`, `bill.voided`,
`payment.initiated`, `payment.succeeded`, `payment.failed`,
`payment.refunded`

### `KITCHEN`
Real-time kitchen flow.

**Action prefixes:** `ticket.*`
**Examples:** `ticket.created`, `ticket.status_changed`,
`ticket.expedited`, `ticket.printed`

### `CATALOG`
Menu and modifier management.

**Action prefixes:** `menu_item.*`, `menu_category.*`, `menu_item_variant.*`,
`menu_item_option.*`
**Examples:** `menu_item.created`, `menu_item.updated`,
`menu_item.deleted`, `menu_item.price_changed`,
`menu_category.reordered`

### `AUTH`
Identity and access.

**Action prefixes:** `user.*`, `auth.*`, `invitation.*`, `role.*`
**Examples:** `user.invited`, `user.role_changed`, `user.suspended`,
`auth.session_created`, `auth.session_revoked`,
`auth.compromised_detected`

### `TENANT`
Tenant administration: settings, floor plans, tables.

**Action prefixes:** `tenant.*`, `tenant_settings.*`, `floor_plan.*`,
`table.*`
**Examples:** `tenant.created`, `tenant.activated`, `tenant.suspended`,
`tenant_settings.updated`, `floor_plan.created`, `table.added`,
`table.removed`

### `PLATFORM`
Platform-level (cross-tenant) events.

**Action prefixes:** `plan.*`, `subscription.*`, `platform.*`
**Examples:** `plan.created`, `plan.published`, `subscription.created`,
`subscription.cancelled`, `platform.maintenance_started`

### `SYSTEM`
Background processes, cleanup jobs, webhook receipts.

**Action prefixes:** `system.*`, `cleanup.*`, `cron.*`, `webhook.*`
**Examples:** `system.startup`, `cleanup.idempotency_keys_purged`,
`cleanup.audit_logs_retention_purged`, `cron.session_timeout_24h`,
`webhook.received`, `webhook.signature_invalid`

---

## Part 3 — Design decisions

### Why coarse, not detailed

The `action` column already does fine-grained categorization. The
coarse `category` enum exists for two specific patterns:

1. **Dashboard filter chips** — the merchant portal audit page renders
   "Order | Billing | Kitchen | Catalog | All" tabs. A `WHERE
   category = 'BILLING'` query is one B-tree lookup. A
   `WHERE action LIKE 'bill.%' OR action LIKE 'payment.%' OR
   action LIKE 'refund.%'` query is a sequential scan.

2. **Compound indexes** — `(category, created_at DESC)` is a useful
   index. `(action, created_at DESC)` is too — but the category index
   answers more queries with one B-tree.

### Why these 8 categories, not more or fewer

The categories map cleanly to the schema's domain folders
(`ORDER`/`BILLING`/`KITCHEN`/`CATALOG`/`AUTH`/`TENANT` from
`postgresql-schema.md`'s domain organization, plus `PLATFORM` for
cross-tenant and `SYSTEM` for background jobs).

**Considered and rejected:**
- `SECURITY` as a separate category for `auth.compromised_*` events.
  Folded into `AUTH` — keep the category list aligned with the domain
  folders, use `severity = ALERT` to surface security-critical rows.
- `ANALYTICS`, `REPORTING` — these are read paths; audit_logs records
  writes, so these wouldn't have audit events.

### Why application code does the mapping (not a DB trigger)

A trigger would couple the database to the action vocabulary. Adding a
new action prefix would require a trigger update. The application's
`AuditService.write()` is the natural place to enforce the mapping:
it's already where the `entity.verb` action string is constructed.

---

## Part 4 — Related

| Doc | Relationship |
|---|---|
| `tables/audit-logs.md` | The host table |
| `enums/audit-severity.md` | Sibling axis: how concerning is the event? |
| `enums/audit-actor-type.md` | Sibling axis: who triggered the event? |
