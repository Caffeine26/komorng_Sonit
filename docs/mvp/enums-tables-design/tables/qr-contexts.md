# Table Reference: `qr_contexts`

| Property | Value |
|---|---|
| **Domain** | Order |
| **Tenant-scoped** | Yes (composite PK `(tenant_id, id)`) |
| **Prisma model** | `QrContext` |
| **Table #** | 25 of 38 |
| **Last upgrade** | 2026-04-25 (`version` OCC; deactivation accountability triad + `QrDeactivationReason` enum; `created_by_id`; `replaces_id` regen chain; scan/print analytics counters; merchant `notes`; full CHECK suite) |

---

## Part 1 — Overview

The `qr_contexts` table is the entry point to every customer interaction in XFOS. Each row represents a single QR code that a merchant has generated and placed somewhere in their business -- on a counter, on a table, or as a generic storefront link.

When a customer scans a QR code, the system resolves the `token` to determine:
1. **Which tenant** (restaurant/stall) this QR belongs to.
2. **What physical context** the customer is in -- are they at a specific table, at a counter, or just browsing a storefront link?

This resolution drives everything downstream: whether a session is created, which `tables` row the customer is anchored to (and therefore what `table_ref` snapshot lands on the order), and what the kitchen ticket displays. Without `qr_contexts`, the platform has no way to connect an anonymous phone scan to a specific tenant and location.

The table is intentionally simple. A QR code is a stable, long-lived reference -- it does not carry order state or session state. It just says "this token belongs to this tenant, and here is the physical context."

---

## Part 2 — CREATE TABLE

```sql
CREATE TABLE qr_contexts (
  tenant_id    TEXT NOT NULL,
  id           TEXT NOT NULL,

  -- Provenance
  table_id     TEXT,                                          -- composite FK; required when context_type='TABLE'
  replaces_id  TEXT,                                          -- composite self-FK; points to QR this row supersedes (regen chain)

  -- Public identity
  token        TEXT UNIQUE NOT NULL,                          -- globally unique URL slug
  label        TEXT,                                          -- merchant-facing label
  notes        TEXT,                                          -- merchant-facing free-form notes
  context_type "QrContextType" NOT NULL DEFAULT 'STOREFRONT',

  -- Lifecycle
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at   TIMESTAMP(3),

  -- Optimistic concurrency
  version      INTEGER NOT NULL DEFAULT 1,

  -- Lifecycle accountability
  created_by_id        TEXT REFERENCES users(id),             -- single-column FK: users is global; NULL when auto-provisioned
  deactivated_at       TIMESTAMP(3),
  deactivated_by_id    TEXT REFERENCES users(id),             -- NULL for system actor (EXPIRED_AUTO, TENANT_DEACTIVATED)
  deactivation_reason  "QrDeactivationReason",

  -- Analytics counters
  scan_count           INTEGER NOT NULL DEFAULT 0,
  last_scanned_at      TIMESTAMP(3),
  print_count          INTEGER NOT NULL DEFAULT 0,
  last_printed_at      TIMESTAMP(3),

  -- Timestamps
  created_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP(3) NOT NULL,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, table_id)    REFERENCES tables(tenant_id, id),
  FOREIGN KEY (tenant_id, replaces_id) REFERENCES qr_contexts(tenant_id, id),

  -- Context type vs table_id pairing
  CONSTRAINT qr_contexts_table_kind_requires_table_id
    CHECK ((context_type != 'TABLE') OR (table_id IS NOT NULL)),
  CONSTRAINT qr_contexts_storefront_kind_has_no_table_id
    CHECK ((context_type != 'STOREFRONT') OR (table_id IS NULL)),

  -- Sanity
  CONSTRAINT qr_contexts_expires_after_created
    CHECK (expires_at IS NULL OR expires_at > created_at),
  CONSTRAINT qr_contexts_replaces_not_self
    CHECK (replaces_id IS NULL OR replaces_id != id),
  CONSTRAINT qr_contexts_scan_count_nonneg     CHECK (scan_count  >= 0),
  CONSTRAINT qr_contexts_print_count_nonneg    CHECK (print_count >= 0),

  -- Lifecycle/accountability gating
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
);

CREATE INDEX ON qr_contexts (tenant_id) WHERE is_active = TRUE;

-- At most ONE active QR per table (regeneration deactivates the old one
-- before creating the new one, in a single transaction).
CREATE UNIQUE INDEX qr_contexts_one_active_per_table
  ON qr_contexts (tenant_id, table_id)
  WHERE is_active = TRUE AND table_id IS NOT NULL;

-- Stale-QR cleanup nudge ("hasn't been scanned in 6 months")
CREATE INDEX ON qr_contexts (tenant_id, last_scanned_at)
  WHERE is_active = TRUE;

-- Regen chain walk
CREATE INDEX ON qr_contexts (tenant_id, replaces_id)
  WHERE replaces_id IS NOT NULL;
```

### Notes on the 2026-04-25 enterprise upgrade

- **`version` OCC.** A merchant can edit a QR's label, expiry, or
  active flag from the merchant portal while another staff session is
  also editing. Without OCC, last-write-wins silently overwrites. With
  OCC, the second writer's update fails with a version mismatch and
  the application can re-read.
- **Deactivation accountability triad
  (`deactivated_at`/`deactivated_by_id`/`deactivation_reason`).** The
  old `is_active` boolean told you *whether* a QR was disabled but
  nothing about *when*, *who*, or *why*. The triad fills all three. The
  CHECK constraints enforce them as an atomic unit: active ⇔ all three
  NULL; inactive ⇔ at least `deactivated_at` and `deactivation_reason`
  set.
- **`deactivation_reason` is a sibling enum** (`QrDeactivationReason`)
  with 6 values: `REGENERATED`, `MERCHANT_DISABLED`, `LOST_OR_DAMAGED`,
  `EXPIRED_AUTO`, `TABLE_REMOVED`, `TENANT_DEACTIVATED`. Same pattern
  as `OrderCancellationReason`/`CartAbandonedReason`/`OrderSessionCloseReason`.
  See `enums/qr-deactivation-reason.md`.
- **System-actor exception.** `EXPIRED_AUTO` and `TENANT_DEACTIVATED`
  are written by background jobs, not humans. The `human_reasons_have_actor`
  CHECK allows `deactivated_by_id = NULL` for these two reasons only —
  any other reason requires a human FK.
- **`replaces_id` regen chain.** When a placard is reprinted, the new
  row's `replaces_id` points at the old row. Walking the chain
  (`SELECT … WHERE replaces_id = ?` recursively) reconstructs the full
  history of QR rotations for a given table. Combined with
  `deactivation_reason = 'REGENERATED'` on the predecessor, the audit
  story is complete: "this QR replaced QR X on date Y because the
  placard was reprinted."
- **`created_by_id`.** Records who generated the QR. NULL when the
  system auto-provisions during onboarding (e.g., one default
  storefront QR per tenant).
- **Scan analytics (`scan_count` + `last_scanned_at`).** Updated on
  every storefront scan. MVP volume is trivial DB load (a tenant with
  50 tables × 30 scans/day = 1500 row-updates/day, which is nothing
  for Postgres). Drives the merchant analytics view ("Table 5 was
  scanned 23 times today") and the stale-QR cleanup nudge ("this QR
  hasn't been scanned in 6 months — would you like to deactivate it?").
- **Print analytics (`print_count` + `last_printed_at`).** Updated
  when the merchant downloads the printable PDF. Drives onboarding
  completion ("you've printed all your table QRs once" check) and
  reprint history.
- **`notes`.** Merchant-facing free-form text — distinct from `label`.
  `label` is the public/printed name ("Table 5 QR"), while `notes` is
  internal context ("blue table by window", "next to kitchen door",
  "use only on weekends").

**Migration note (2026-04-24):** `table_ref TEXT` was replaced with `table_id TEXT` (composite FK to `tables`). The free-text label that used to live on `qr_contexts.table_ref` now lives on `tables.label`. Order/session snapshots (`orders.table_ref`, `order_sessions.table_ref`) keep the historical label for receipts.

---

## Part 3 — Column-by-Column

### `id` — TEXT PRIMARY KEY

- **Nullable:** No
- **Default:** None (app-generated cuid)
- **Purpose:** Unique identifier for this QR context record.
- **Constraints:** Primary key.
- **Why:** Standard cuid pattern used across all XFOS tables. System-internal, never exposed in URLs or QR payloads -- the `token` column is what gets embedded in QR codes.

### `tenant_id` — TEXT NOT NULL

- **Nullable:** No
- **Default:** None
- **Purpose:** The tenant (restaurant/stall) that owns this QR code.
- **Constraints:** `REFERENCES tenants(id) ON DELETE CASCADE`. Indexed.
- **Why:** Every QR code belongs to exactly one tenant. When a customer scans a QR, the system joins through `token` to get `tenant_id`, which sets the tenant context for the entire storefront session. CASCADE ensures that when a tenant is deleted, all their QR codes go with it.

### `token` — TEXT UNIQUE NOT NULL

- **Nullable:** No
- **Default:** None (app-generated, unguessable)
- **Purpose:** The value embedded in the QR code URL. When a customer scans a QR, this token is the lookup key.
- **Constraints:** `UNIQUE` across the entire table (not just per-tenant).
- **Why:** Global uniqueness is critical. The token appears in URLs like `xfos.com/q/{token}` and must resolve to exactly one tenant + context without ambiguity. The token must be unguessable -- if someone could enumerate tokens, they could discover which tenants exist and what tables they have. The app generates this as a cryptographically random string (not a sequential ID, not a slug).

### `label` — TEXT

- **Nullable:** Yes
- **Default:** None
- **Purpose:** A human-readable name for the merchant to identify this QR code in the merchant portal.
- **Constraints:** None.
- **Why:** Merchants may generate dozens of QR codes. Without a label, the merchant portal would show a list of opaque tokens. Labels like "Front counter", "Table 5 - window", or "Grab driver pickup" make management possible. Nullable because auto-generated QR codes (e.g., during onboarding) may not have a label yet.

### `context_type` — "QrContextType" NOT NULL

- **Nullable:** No
- **Default:** `'STOREFRONT'`
- **Purpose:** Declares the physical context that this QR code represents.
- **Constraints:** Must be one of: `STOREFRONT`, `TABLE`.
- **Why:** This value, combined with `tenant_settings.service_model` and `tenant_settings.pay_timing`, determines the downstream behavior:
  - `STOREFRONT` — generic entry point. No table context. Used by stalls that post one QR on their signage or social media. If the stall has multiple pickup points, use the `label` field (e.g., "Counter A") — no separate COUNTER type needed.
  - `TABLE` — anchored to a physical table. The `table_id` column MUST be set (FK to a `tables` row). Triggers table-aware session and kitchen ticket behavior.

  The enum values map to `QrContextType`:
  ```sql
  CREATE TYPE "QrContextType" AS ENUM ('STOREFRONT', 'TABLE');
  ```

  Note: `COUNTER` was removed from this enum. Every counter scenario is
  covered by `STOREFRONT` + `label`. Keeping COUNTER confused merchants
  during QR setup ("am I a storefront or a counter?").

### `table_id` — TEXT (nullable)

> **Replaces `table_ref TEXT` as of 2026-04-24.** The free-text table label is now stored on `tables.label`; this column is the FK to that row.

- **Nullable:** Yes
- **Default:** `NULL`
- **Purpose:** Composite FK to the `tables` row this QR is anchored to.
- **Constraints:** `FOREIGN KEY (tenant_id, table_id) REFERENCES tables(tenant_id, id)`. Two CHECKs enforce the pairing with `context_type`:
  - `TABLE` QRs MUST have a `table_id` (`qr_contexts_table_kind_requires_table_id`).
  - `STOREFRONT` QRs MUST NOT have a `table_id` (`qr_contexts_storefront_kind_has_no_table_id`).
  Plus the partial unique index `qr_contexts_one_active_per_table` ensures **at most one active QR per table**.
- **Why:** Tables are now first-class entities (see [`tables/tables.md`](tables.md)) with their own metadata (capacity, area, position on a floor plan, current status). Linking via FK gives:
  - One source of truth for the table's label — renaming "Table 5" updates `tables.label` once and the merchant portal sees the change everywhere.
  - Multiple historical QRs per table (regeneration creates a new active row; old rows stay for audit).
  - The "at most one active QR per table" rule enforced at the DB level, not by the application.

  The label that customers see on receipts and kitchen tickets is **snapshotted onto `orders.table_ref` and `order_sessions.table_ref` at order/session creation time** — so renaming the table tomorrow doesn't rewrite yesterday's receipts.

### `is_active` — BOOLEAN NOT NULL

- **Nullable:** No
- **Default:** `TRUE`
- **Purpose:** Soft toggle for disabling a QR code without deleting it.
- **Constraints:** None.
- **Why:** A merchant may want to temporarily disable a table's QR code (table is broken, under maintenance, reserved for an event) without losing the record. The storefront should check `is_active` on scan and show an appropriate error ("This QR code is not currently active") rather than a 404. Also used for rotation -- when a merchant regenerates QR codes, old ones are set to `is_active = false` rather than deleted, so audit trails remain intact.

### `expires_at` — TIMESTAMP(3)

- **Nullable:** Yes
- **Default:** None
- **Purpose:** Optional expiration timestamp for time-limited QR codes.
- **Constraints:** None.
- **Why:** Most QR codes are permanent (sticker on the table, printed on the menu). But some use cases require expiration: promotional QR codes for a weekend event, temporary outdoor seating, or security rotation policies. When set, the storefront should treat a scan after `expires_at` the same as `is_active = false`. NULL means "never expires."

### `created_at` — TIMESTAMP(3) NOT NULL

- **Nullable:** No
- **Default:** `CURRENT_TIMESTAMP`
- **Purpose:** When this QR context was created.
- **Constraints:** None.
- **Why:** Standard audit timestamp. Useful for tracking when QR codes were provisioned, especially during onboarding ("this merchant created their first QR code on day 3").

### `updated_at` — TIMESTAMP(3) NOT NULL

- **Nullable:** No
- **Default:** Maintained by Prisma (`@updatedAt`).
- **Purpose:** When this row was last modified.
- **Constraints:** None.
- **Why:** Standard Prisma convention. Tracks when a QR code was relabeled, deactivated, or had its expiry changed.

---

## Part 4 — Indexes

### `PRIMARY KEY (id)`

- **What it serves:** Direct lookups by ID from the application layer.
- **Example:** `SELECT * FROM qr_contexts WHERE id = 'clxyz...'`

### `UNIQUE (token)`

- **What it serves:** The core QR resolution query. Every customer scan hits this index.
- **Example:**
  ```sql
  SELECT qc.tenant_id, qc.context_type, qc.table_id,
         tb.label AS table_label,                          -- live label from tables row
         t.slug
  FROM qr_contexts qc
  JOIN tenants t ON t.id = qc.tenant_id
  LEFT JOIN tables tb
    ON tb.tenant_id = qc.tenant_id AND tb.id = qc.table_id
  WHERE qc.token = 'abc123def456'
    AND qc.is_active = true
    AND (qc.expires_at IS NULL OR qc.expires_at > NOW());
  ```
- **Why unique globally:** A token must resolve to exactly one result worldwide, not just within a tenant. The customer does not supply a tenant ID when scanning.

### `INDEX ON qr_contexts (tenant_id)`

- **What it serves:** Merchant portal listing all QR codes for a tenant.
- **Example:**
  ```sql
  SELECT qc.id, qc.token, qc.label, qc.context_type,
         tb.label AS table_label,
         qc.is_active
  FROM qr_contexts qc
  LEFT JOIN tables tb
    ON tb.tenant_id = qc.tenant_id AND tb.id = qc.table_id
  WHERE qc.tenant_id = 'tenant_abc'
  ORDER BY qc.context_type, tb.label NULLS FIRST;
  ```
- **Why:** The merchant portal needs to show "all your QR codes" efficiently. Without this index, the query would full-scan `qr_contexts` across all tenants.

---

## Part 5 — Relationships

### Foreign Keys (composite since 2026-04-24)

| Column(s) | References | On Delete | Why |
|---|---|---|---|
| `(tenant_id)` | `tenants(id)` | `CASCADE` | Tenant deletion removes all QRs |
| `(tenant_id, table_id)` | `tables(tenant_id, id)` | No cascade — QRs are historical, table soft-delete preserves audit trail |
| `(tenant_id, replaces_id)` | `qr_contexts(tenant_id, id)` (self) | No cascade — chain walking | Composite self-FK, since 2026-04-25; points at the predecessor QR in a regeneration chain |
| `created_by_id` | `users(id)` | (no action) | Single-column FK because `users` is global; NULL when system-auto-provisioned |
| `deactivated_by_id` | `users(id)` | (no action) | Single-column FK; NULL allowed for `EXPIRED_AUTO`/`TENANT_DEACTIVATED` (system actor) |

### Incoming References

| Table | Column(s) | Relationship | On Delete |
|---|---|---|---|
| `order_sessions` | `(tenant_id, qr_context_id)` | Many sessions can reference one QR context | No cascade (nullable composite FK) |
| `orders` | `(tenant_id, qr_context_id)` | Many orders can reference one QR context (since 2026-04-24) | No cascade |

### Cross-FK Tenant Parity

**None needed since 2026-04-24.** The composite PK pattern adopted schema-wide makes cross-tenant references impossible by FK shape alone — the database refuses to link a `qr_contexts` row in tenant A to a `tables` row in tenant B because the composite key `(B, table_x)` simply isn't present in `tables` for tenant A. Parity triggers retired:

- ❌ `order_sessions_qr_tenant_parity` — removed
- ❌ `orders_qr_tenant_parity` — removed (was added earlier on 2026-04-24, removed in the composite-PK sweep later that day)

---

## Part 6 — Real-World Usage Scenarios

### Scenario 1: Noodle stall with one QR code (Phnom Penh)

A noodle stall owner ("Mee Kola") prints one QR code on a laminated card taped to the counter. The QR encodes `xfos.com/q/nk7x9m2p`.

```
qr_contexts row:
  id:           'clx_qr_001'
  tenant_id:    'clx_mee_kola'
  token:        'nk7x9m2p'
  label:        'Counter QR'
  context_type: STOREFRONT
  table_id:     NULL                      -- STOREFRONT QRs forbid table_id (CHECK)
  is_active:    true
  expires_at:   NULL
```

Every customer who scans this QR lands on the same storefront. Since the stall is `STALL_KIOSK`, there is no table context. The token resolves the tenant, the menu loads, and the customer orders.

### Scenario 2: BBQ restaurant with 20 tables (Siem Reap)

A Cambodian BBQ restaurant ("Sach Ko Ang") draws 20 tables on its "Main Floor" floor plan. Each table is a `tables` row with a label, capacity, and floor-plan position. The merchant generates one active QR per table:

```
tables rows (in floor_plans 'fp_main'):
  (id: 'tbl_t1',  label: 'Table 1',  capacity: 4,  position_x: 80,  position_y: 80)
  (id: 'tbl_t2',  label: 'Table 2',  capacity: 4,  position_x: 220, position_y: 80)
  ...
  (id: 'tbl_t20', label: 'Table 20', capacity: 8,  position_x: 800, position_y: 600)

qr_contexts rows (one active per table — partial unique index enforces this):
  { token: 'bbq_t1_x9k',  label: 'Table 1 QR',  context_type: TABLE, table_id: 'tbl_t1'  }
  { token: 'bbq_t2_m3j',  label: 'Table 2 QR',  context_type: TABLE, table_id: 'tbl_t2'  }
  ...
  { token: 'bbq_t20_p7w', label: 'Table 20 QR', context_type: TABLE, table_id: 'tbl_t20' }
```

When a group scans the Table 5 QR, the storefront resolves the token, joins to `tables` for the live label and capacity, then shows "Table 5" in the header. The order session is created with `table_id = 'tbl_t5'` AND `table_ref = 'Table 5'` (snapshot of the label at session-open time). Every kitchen ticket displays the snapshot so renaming the table tomorrow doesn't change yesterday's tickets.

### Scenario 3: QR regeneration after a placard rips

The QR sticker on Table 5 rips. Borey (tenant manager) opens Table 5 in the merchant portal and taps "Regenerate QR." In a single transaction:

```
-- 1) Deactivate the old QR with full accountability
UPDATE qr_contexts
   SET is_active            = FALSE,
       deactivated_at       = NOW(),
       deactivated_by_id    = 'usr_borey',
       deactivation_reason  = 'REGENERATED',
       version              = version + 1
 WHERE tenant_id = 'clx_sach_ko'
   AND id        = 'qr_old_table5'
   AND version   = $expected_version;

-- 2) Insert the new QR pointing back at the old one
INSERT INTO qr_contexts (
  tenant_id, id, table_id, replaces_id, token, label, context_type,
  is_active, created_by_id
)
VALUES (
  'clx_sach_ko', 'qr_new_table5', 'tbl_t5', 'qr_old_table5',
  'bbq_t5_v2_q4r', 'Table 5 QR (regen 2026-04-25)', 'TABLE',
  TRUE, 'usr_borey'
);
```

What the schema enforces:

- **`order_sessions_one_active_per_table` partial unique index** —
  the new INSERT would fail with a unique violation if step 1 didn't
  flip `is_active` first. The two-statement transaction is correct by
  construction.
- **CHECK `qr_contexts_inactive_has_reason`** — step 1's UPDATE must
  set both `deactivated_at` and `deactivation_reason`; otherwise the
  row violates the CHECK and the transaction rolls back.
- **CHECK `qr_contexts_human_reasons_have_actor`** — `REGENERATED` is
  human-driven, so `deactivated_by_id` is required.
- **`version` OCC** — if another staff session also clicked
  "Regenerate" 50ms earlier, this UPDATE's `version = $expected_version`
  predicate matches zero rows, the application sees `0 rows updated`,
  and reports the conflict to the user.

The old row stays in the database forever (audit: orders that came
from the old sticker still resolve correctly via `qr_context_id`).
The new QR is the only one that produces an active session on the
next scan, and the `replaces_id` link makes the regen chain walkable
in both audit reports and merchant-portal "QR history for Table 5"
views.

### Scenario 4: Storefront QR with expiry (weekend promo)

A food court stall ("Boba Time") creates a limited-time QR code for a weekend promotion. The QR expires Monday at midnight.

```
qr_contexts row:
  token:        'promo_weekend_2026'
  label:        'Weekend Promo - 20% off'
  context_type: STOREFRONT             -- STOREFRONT, not COUNTER (which doesn't exist)
  table_id:     NULL
  is_active:    true
  expires_at:   '2026-04-14T00:00:00.000Z'
```

After Monday, customers who scan the printed flyer see "This QR code has expired." The merchant does not need to manually deactivate it.

---

## Part 7 — Design Decisions

### Why `token` is globally unique (not per-tenant)

The QR code URL `xfos.com/q/{token}` does not include a tenant slug. The customer scans a QR code and the system must figure out everything from the token alone. If tokens were only unique per-tenant, the URL would need `xfos.com/t/{slug}/q/{token}`, which is longer, harder to fit in a QR code, and leaks the tenant slug to anyone who photographs the QR.

### Why `table_id` (FK) replaced `table_ref` (TEXT) on 2026-04-24

The free-text `table_ref` worked while tables were not first-class entities. With the new `tables` table, the label is now stored once on `tables.label` and referenced by FK. Benefits:

- One place to rename a table (the `tables` row); the merchant portal sees the change everywhere.
- One place to enforce label uniqueness, capacity, area, floor-plan position, current status.
- Multiple historical QR codes per table (regeneration creates new active row, old stays for audit).
- "At most one active QR per table" enforced at the DB level (partial unique index).

The label that lands on receipts and kitchen tickets is **snapshotted onto `orders.table_ref` and `order_sessions.table_ref` at order/session creation time** — this preserves historical accuracy across renames.

### Why `table_ref` (TEXT) survives on orders and sessions

Even though `qr_contexts` no longer carries `table_ref`, `orders.table_ref` and `order_sessions.table_ref` are still TEXT snapshots. Reasons:

- **Receipt accuracy.** Renaming "Table 5" to "VIP Booth" must not retroactively rewrite yesterday's receipts.
- **Kitchen-ticket render performance.** Reading the snapshot from the order row avoids a join to `tables` on every kitchen-display poll.
- **Survives table soft-delete.** If a table is deactivated, the order still knows what it was called.

The pattern is: **live FK + historical snapshot**, the same shape used for `service_model` (snapshot on order) and `pay_timing` (snapshot on order).

### Why `context_type` defaults to STOREFRONT

Most merchants start with a single QR code for their entire business. `STOREFRONT` is the simplest context: no table, no counter designation. Only merchants who configure `DINE_IN_TABLE` need `TABLE` type QR codes. The default minimizes onboarding friction.

### Why there is no `deleted_at` column

QR codes are deactivated via `is_active = false`, not soft-deleted. The record must survive for audit trails and for `order_sessions` that reference it. Hard deletion happens only when the tenant itself is deleted (via CASCADE).

**Since 2026-04-25**, deactivation carries full accountability: `deactivated_at` (when), `deactivated_by_id` (who, NULL for system actor), and `deactivation_reason` (why, from the `QrDeactivationReason` enum). A separate `deleted_at` would be redundant — `deactivated_at` already captures the "when did this row stop being active" timestamp, and the reason enum is richer than a single soft-delete flag.

---

## Part 8 — Related Tables

| Table | Relationship | Notes |
|---|---|---|
| `tenants` | Parent (FK) | Every QR code belongs to one tenant |
| `tenant_settings` | Sibling (same tenant) | `service_model` + `pay_timing` determine what happens after a QR scan resolves |
| `order_sessions` | Child (FK `qr_context_id`) | Sessions optionally link back to the QR context that initiated them |
| `orders` | Child (FK `qr_context_id`, since 2026-04-24) | Orders also denormalize the QR origin so attribution survives even for sessionless `STALL_KIOSK + PAY_BEFORE` orders. `table_ref` is also denormalized onto orders. |
| `tables` | Reference (composite FK `(tenant_id, table_id)`) | The table this QR is anchored to (nullable; required for `context_type = 'TABLE'`) |
| `kitchen_tickets` | Indirect | Kitchen tickets display the `table_ref` snapshot stored on the order, originally derived from `tables.label` at order time |
