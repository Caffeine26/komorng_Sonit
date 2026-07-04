# Enum Reference: `QrDeactivationReason`

| Property | Value |
|---|---|
| **Used by** | `qr_contexts.deactivation_reason` |
| **Domain** | Order |
| **Pattern** | Sibling-enum to `qr_contexts.is_active` |
| **Introduced** | 2026-04-25 |

---

## Part 1 — What this enum is

`QrDeactivationReason` records **why** a QR code was deactivated. Paired
with `qr_contexts.is_active`, `deactivated_at`, and `deactivated_by_id`,
it makes the audit trail for every QR deactivation queryable and
trustworthy.

The `is_active` boolean tells the storefront's scan resolver "can this
QR be used right now?" — a single-column predicate. The deactivation
reason carries the analytical detail without forcing every storefront
read to handle a richer enum.

CHECK constraints make the pairing tight:

```sql
CONSTRAINT qr_contexts_active_no_deactivation
  CHECK ((is_active = FALSE)
         OR (deactivated_at IS NULL AND deactivated_by_id IS NULL AND deactivation_reason IS NULL)),
CONSTRAINT qr_contexts_inactive_has_reason
  CHECK ((is_active = TRUE)
         OR (deactivated_at IS NOT NULL AND deactivation_reason IS NOT NULL)),
CONSTRAINT qr_contexts_human_reasons_have_actor
  CHECK ((deactivation_reason IS NULL)
         OR (deactivation_reason IN ('EXPIRED_AUTO', 'TENANT_DEACTIVATED'))
         OR (deactivated_by_id IS NOT NULL))
```

The third CHECK enforces the system-actor exception: only `EXPIRED_AUTO`
and `TENANT_DEACTIVATED` may carry `deactivated_by_id = NULL`. Every
other reason is human-driven and must record the staff member.

---

## Part 2 — Values

```sql
CREATE TYPE "QrDeactivationReason" AS ENUM (
  'REGENERATED',
  'MERCHANT_DISABLED',
  'LOST_OR_DAMAGED',
  'EXPIRED_AUTO',
  'TABLE_REMOVED',
  'TENANT_DEACTIVATED'
);
```

### `REGENERATED`

The QR was replaced by a new one. The successor row's `replaces_id`
points back at the deactivated row, forming a chain that walks the
full regeneration history of a table.

- **Triggered by:** "Regenerate QR" button in the merchant portal.
  Always paired with an INSERT of a new active row in the same
  transaction.
- **`deactivated_by_id`:** required (the staff who clicked
  "Regenerate").
- **Audit query:** "Show me the QR rotation history for Table 5":
  ```sql
  WITH RECURSIVE chain AS (
    SELECT * FROM qr_contexts WHERE id = 'qr_current_table5' AND tenant_id = $1
    UNION ALL
    SELECT prev.* FROM qr_contexts prev
    JOIN chain ON prev.tenant_id = chain.tenant_id AND prev.id = chain.replaces_id
  )
  SELECT * FROM chain ORDER BY created_at DESC;
  ```

### `MERCHANT_DISABLED`

Merchant manually disabled the QR for any reason that isn't a
regeneration, loss, or table removal. Catch-all for operational
housekeeping.

- **Examples:** "table is reserved for a private event tonight",
  "this counter is shut down for renovation", "we don't take
  Sunday-only QR scans anymore".
- **Triggered by:** "Disable QR" button in the merchant portal.
- **`deactivated_by_id`:** required.

### `LOST_OR_DAMAGED`

The physical placard was lost, stolen, or damaged, and the merchant
acknowledged it but didn't immediately regenerate. Distinguishes the
"placard is gone" case from "merchant just disabled it" — useful for
fraud monitoring (high `LOST_OR_DAMAGED` rate at a specific tenant
might indicate theft).

- **Triggered by:** "Mark as lost / damaged" in the merchant portal.
- **`deactivated_by_id`:** required.

### `EXPIRED_AUTO`

The QR's `expires_at` passed and a background cleanup job
auto-deactivated it. Used for time-limited promotional QRs (weekend
event, pop-up booth).

- **Triggered by:** a BullMQ job that runs hourly:
  ```sql
  UPDATE qr_contexts
  SET    is_active           = FALSE,
         deactivated_at      = NOW(),
         deactivation_reason = 'EXPIRED_AUTO',
         version             = version + 1
  WHERE  is_active = TRUE
    AND  expires_at IS NOT NULL
    AND  expires_at < NOW();
  ```
- **`deactivated_by_id`:** NULL (system, not a user). The
  `human_reasons_have_actor` CHECK explicitly allows this.

### `TABLE_REMOVED`

The parent `tables` row was deactivated (the merchant removed Table 5
from the floor plan). The cascading deactivation marks the QR with
this reason so the audit trail shows "this QR went away because the
table did" rather than "merchant disabled it for unknown reasons."

- **Triggered by:** the application layer when a `tables` row is
  flipped to `is_active = FALSE` — a transactional `UPDATE … FROM`
  cascades the deactivation.
- **`deactivated_by_id`:** required (the staff who deactivated the
  table).

### `TENANT_DEACTIVATED`

The tenant itself was suspended or archived. Cascading deactivation
of all the tenant's active QRs.

- **Triggered by:** platform admin tools (or self-service tenant
  deactivation in a future feature).
- **`deactivated_by_id`:** NULL (system actor — the tenant-deactivation
  flow doesn't run as a specific user; it runs as an automated step).

---

## Part 3 — Real-world scenarios

### Scenario 1: Placard ripped, merchant regenerates

Borey at "Sach Ko Ang" notices the Table 5 QR placard has ripped. She
opens Table 5 in the merchant portal and taps "Regenerate QR." See
[`tables/qr-contexts.md` Part 6 Scenario 3](../tables/qr-contexts.md)
for the full transaction.

The old row's `deactivation_reason = 'REGENERATED'`. The new row's
`replaces_id` points at the old row. Six months later, when an
auditor asks "what's the history of QR codes for Table 5?", the chain
walks cleanly.

### Scenario 2: Weekend promo QR auto-expires

A food court stall ("Boba Time") creates a weekend-only QR with
`expires_at = '2026-04-14T00:00:00.000Z'`. At 1 AM on April 14, the
hourly cleanup job runs and flips it to inactive with
`deactivation_reason = 'EXPIRED_AUTO'` and `deactivated_by_id = NULL`.

Customers scanning the printed flyer after that point see "This QR
code has expired" — the storefront resolver checks both `is_active`
and `expires_at`.

### Scenario 3: Table removed from floor plan

A renovation removes Table 12 from the dining room. The merchant
opens the floor plan, drags Table 12 off-canvas, and saves. The
backend transaction:

```sql
-- 1) Deactivate the table
UPDATE tables
SET    is_active = FALSE, ...
WHERE  tenant_id = $1 AND id = 'tbl_t12';

-- 2) Cascade deactivate any active QR pointing at it
UPDATE qr_contexts
SET    is_active           = FALSE,
       deactivated_at      = NOW(),
       deactivated_by_id   = $staff_id,
       deactivation_reason = 'TABLE_REMOVED',
       version             = version + 1
WHERE  tenant_id  = $1
  AND  table_id   = 'tbl_t12'
  AND  is_active  = TRUE;
```

The audit trail says "Table 12 was removed, and as a consequence the
Table 12 QR was deactivated by Borey on 2026-04-25" — clearer than
"merchant disabled the QR" which would obscure the cause.

---

## Part 4 — Design decisions

### Why a sibling enum, not a richer `is_active` (e.g., 3-state enum)

Considered: replacing the `is_active BOOLEAN` with a 3-state enum like
`(ACTIVE, INACTIVE, EXPIRED)`.

Rejected because:

- The storefront's hot-path resolver needs to answer "can this be
  scanned right now?" in one column predicate. `WHERE is_active = TRUE`
  is cheaper and clearer than `WHERE status = 'ACTIVE'`.
- "Expired" is information already encoded in `expires_at` — the
  storefront resolver checks `expires_at` anyway.
- Adding new reasons (`BRANDING_REFRESH`, `LEGAL_REQUEST`) would force
  every storefront query to add new values to the WHERE clause.

The sibling-enum pattern keeps the lifecycle simple while making the
*why* first-class.

### Why `EXPIRED_AUTO` and `TENANT_DEACTIVATED` may carry NULL `deactivated_by_id`

These two reasons fire from background system processes, not from a
specific staff member's click. Forcing `deactivated_by_id` to be set
would require either:
- a synthetic "system" user row in `users` (clutter), or
- a non-NULL FK to a real user (false attribution).

The `human_reasons_have_actor` CHECK formalizes this: human reasons
require a human FK; system reasons are allowed to leave it NULL.

### Why these six values, not more

Started from real operational scenarios in the design conversations:

- Regeneration (`REGENERATED`) — frequent, well-defined, has a
  successor.
- Manual disable (`MERCHANT_DISABLED`) — catch-all human action.
- Physical loss (`LOST_OR_DAMAGED`) — distinct from generic disable
  for fraud / theft monitoring.
- Time expiry (`EXPIRED_AUTO`) — system-driven for promo QRs.
- Cascade from table (`TABLE_REMOVED`) — preserves cause.
- Cascade from tenant (`TENANT_DEACTIVATED`) — preserves cause.

A 7th value `STOLEN_FRAUD` was considered but folded into
`LOST_OR_DAMAGED` — distinguishing accidental loss from theft is a
business detail that doesn't need a separate enum slot.

---

## Part 5 — Related

| Doc | Relationship |
|---|---|
| `tables/qr-contexts.md` | The host table |
| `enums/order-cancellation-reason.md` | Same sibling-enum pattern at the order level |
| `enums/cart-abandoned-reason.md` | Same pattern at the cart level |
| `enums/order-session-close-reason.md` | Same pattern at the session level |
