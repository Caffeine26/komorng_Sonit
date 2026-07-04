# Table Reference: `payments`

**Domain:** Billing
**Tenant-scoped:** Yes (composite PK `(tenant_id, id)`)
**Last upgrade:** 2026-04-25 (composite PK; `version` OCC; `provider`; lifecycle transitions; failure detail; refund tracking; webhook integrity via `gateway_event_id` + `gateway_signature`; `confirmed_by_id` for cash)

---

## Part 1 — Overview

The `payments` table records every payment attempt made against a bill. The key word is **attempt** — a single bill can have multiple payment rows because:

- An ABA QR code expires after 5 minutes. The customer taps "Try Again" and a new QR (and a new `payments` row) is generated.
- A payment fails (network issue, insufficient funds). The customer retries.
- A customer switches methods (tries ABA QR first, gives up, pays cash).

Each `payments` row represents one discrete attempt with its own lifecycle: `INITIATED` (record created, not yet submitted to gateway) -> `PENDING` (submitted to gateway, awaiting confirmation) -> `SUCCEEDED` | `FAILED` | `CANCELLED` | `EXPIRED`. A successful payment can later move to `REFUNDED` (full refund processed). The bill's status is derived from its payment attempts — when payments cover the full bill amount, the bill moves to `PAID`.

ABA PayWay KHQR is the primary digital payment method. The `reference` column stores ABA's `tran_id`, and `gateway_data` stores the full raw response from ABA for audit and dispute resolution. Cash payments are also recorded here (method `CASH`, confirmed immediately by kitchen staff).

The `REFUNDED` status covers full refunds processed through the payment gateway. Partial refunds are not supported at MVP — a full refund moves the payment to `REFUNDED` and the bill may need to be re-evaluated or voided.

---

## Part 2 — CREATE TABLE

```sql
CREATE TABLE payments (
  tenant_id              TEXT NOT NULL,
  id                     TEXT NOT NULL,
  bill_id                TEXT NOT NULL,
  method                 "PaymentMethod" NOT NULL,
  provider               TEXT,                                    -- 'aba' | 'wing' | 'cash' | NULL for cash
  status                 "PaymentStatus" NOT NULL DEFAULT 'INITIATED',

  amount_cents           INTEGER NOT NULL CHECK (amount_cents > 0),
  refunded_amount_cents  INTEGER NOT NULL DEFAULT 0 CHECK (refunded_amount_cents >= 0),
  currency               "Currency" NOT NULL DEFAULT 'USD',

  -- Gateway integration
  reference              TEXT,                                    -- gateway tran_id (the merchant's reference)
  idempotency_key        TEXT,                                    -- request-side dedup key sent to gateway
  gateway_event_id       TEXT,                                    -- gateway-supplied event id (for webhook dedup)
  gateway_signature      TEXT,                                    -- HMAC of webhook payload (verified against shared secret)
  gateway_data           JSONB,                                   -- raw gateway response

  -- Optimistic concurrency
  version                INTEGER NOT NULL DEFAULT 1,

  -- Lifecycle transition timestamps
  initiated_at           TIMESTAMP(3),
  pending_at             TIMESTAMP(3),
  succeeded_at           TIMESTAMP(3),
  failed_at              TIMESTAMP(3),
  expires_at             TIMESTAMP(3),                            -- e.g. ABA QR auto-expires after 5 min

  -- Failure detail
  failure_code           TEXT,
  failure_message        TEXT,

  -- Confirmation accountability (cash, manual confirm)
  confirmed_at           TIMESTAMP(3),
  confirmed_by_id        TEXT REFERENCES users(id),               -- single-column FK: users is global

  -- Refund accountability
  refunded_at            TIMESTAMP(3),
  refunded_by_id         TEXT REFERENCES users(id),
  refund_reason          TEXT,

  created_at             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP(3) NOT NULL,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, bill_id) REFERENCES bills(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT payments_refund_le_amount
    CHECK (refunded_amount_cents <= amount_cents),
  CONSTRAINT payments_refund_status_matches
    CHECK ((status != 'REFUNDED') OR (refunded_amount_cents > 0 AND refunded_at IS NOT NULL)),
  CONSTRAINT payments_succeeded_at_when_succeeded
    CHECK ((status != 'SUCCEEDED') OR (succeeded_at IS NOT NULL)),
  CONSTRAINT payments_cash_no_provider_required
    CHECK ((method != 'CASH') OR (provider IS NULL OR provider = 'cash'))
);

CREATE INDEX ON payments (tenant_id, bill_id);
CREATE INDEX ON payments (tenant_id, status);
CREATE INDEX ON payments (reference)         WHERE reference IS NOT NULL;
CREATE UNIQUE INDEX payments_gateway_event_unique
  ON payments (tenant_id, gateway_event_id)  WHERE gateway_event_id IS NOT NULL;
CREATE INDEX ON payments (expires_at)        WHERE status IN ('INITIATED', 'PENDING');
```

### Notes on the 2026-04-25 enterprise upgrade

- **Composite-PK + composite FK** to `bills(tenant_id, id)`. The old
  `payments_bill_tenant_parity` trigger is gone — the FK enforces it.
- **`provider`.** Cleanly split from `method` so the same `ABA_QR` method
  can be served by different processors over time. Analytics can now
  segment "ABA QR via aba.com.kh" vs "ABA QR via Wing".
- **Lifecycle transition timestamps.** `initiated_at`/`pending_at`/
  `succeeded_at`/`failed_at` denormalize the state machine for cheap
  analytics ("avg time-to-success", "QR expiry rate"). The
  `payments_succeeded_at_when_succeeded` CHECK prevents drift.
- **`expires_at`.** ABA QR codes expire after 5 minutes. Persisting the
  expiry locally (rather than re-deriving from `created_at + 5 min`)
  lets the UI show a real countdown and lets the cleanup job find
  expired-but-still-PENDING records to roll forward to `EXPIRED`.
- **Failure detail.** `failure_code` (mapped from gateway error codes)
  + `failure_message` (gateway-supplied human-readable text) drive the
  customer-facing retry UI ("Insufficient balance — try another method")
  and feed merchant analytics ("which failure type dominates today?").
- **Refund tracking.** `refunded_amount_cents` allows partial refunds
  (post-MVP path); `refunded_at`/`refunded_by_id`/`refund_reason`
  capture accountability. `payments_refund_le_amount` and
  `payments_refund_status_matches` CHECKs guard the math and the status.
- **Webhook integrity.** `gateway_event_id` (UNIQUE per tenant) makes
  webhook dedup trivial — replayed callbacks `INSERT … ON CONFLICT DO
  NOTHING`. `gateway_signature` records the HMAC verified against the
  shared secret; if a dispute arises, we have proof of authenticity.
- **`confirmed_by_id`.** Cash payments require a staff member to tap
  "Confirm Cash". This column records who. Combined with `bills.closed_by_id`,
  end-of-day cash reconciliation has a full audit trail.
- **`version` OCC.** Webhook arrives at the same time as a manual
  confirm, two writers, last-write-wins would corrupt the status.
  OCC prevents this.

---

## Part 3 — Column-by-Column

| Column | Type | Nullable | Default | Purpose | Constraints | Why |
|--------|------|----------|---------|---------|-------------|-----|
| `id` | `TEXT` | No | App-generated cuid | Primary key. System-internal identifier. For ABA payments, the `reference` column is used for gateway correlation, not this id. | `PRIMARY KEY` | Cuid generated by the application layer. |
| `tenant_id` | `TEXT` | No | None | Links this payment to the owning tenant. Must match the bill's `tenant_id`. | `NOT NULL`, `REFERENCES tenants(id) ON DELETE CASCADE`, parity trigger | Application-layer tenant isolation. The parity trigger against `bills` prevents a payment from being attached to another tenant's bill. |
| `bill_id` | `TEXT` | No | None | The bill this payment attempt is for. A bill can have multiple payments (retry scenario). | `NOT NULL`, `REFERENCES bills(id) ON DELETE CASCADE` | Payments exist only in the context of a bill. When a bill is deleted (tenant cleanup), its payment records go with it. |
| `method` | `"PaymentMethod"` | No | None | How the customer is paying. Enum values: `CASH`, `ABA_QR`, `CARD`. | `NOT NULL` | `ABA_QR` is the primary digital method (generates a KHQR code scannable by 30+ Cambodian banks). `CASH` is confirmed manually by staff. `CARD` is defined in the enum but not implemented at MVP — included for schema stability so adding card support later does not require an enum migration. |
| `status` | `"PaymentStatus"` | No | `'INITIATED'` | Current lifecycle state. Enum values: `INITIATED`, `PENDING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `EXPIRED`, `REFUNDED`. | `NOT NULL`, `DEFAULT 'INITIATED'` | State machine: `INITIATED` (record created, not yet submitted to gateway — e.g., payment row exists but QR has not been generated yet) -> `PENDING` (submitted to gateway, awaiting confirmation — e.g., ABA QR displayed to customer) -> `SUCCEEDED` (payment confirmed by gateway callback or staff) / `FAILED` (gateway reported failure) / `CANCELLED` (customer actively cancelled the payment attempt) / `EXPIRED` (ABA QR timed out after 5 minutes). From `SUCCEEDED`: -> `REFUNDED` (full refund processed through gateway). Terminal states: `SUCCEEDED`, `FAILED`, `CANCELLED`, `EXPIRED`, `REFUNDED`. |
| `amount_cents` | `INTEGER` | No | None | The amount of this payment attempt, in cents. For a full payment, this equals `bills.total_cents`. | `NOT NULL`, `CHECK (amount_cents > 0)` | Stored as integer cents (never float). A $6.50 payment is `650`. The CHECK constraint prevents zero-amount payments, which would be nonsensical. Note: the constraint is `> 0`, not `>= 0`, because a payment of $0.00 should never exist. |
| `currency` | `"Currency"` | No | `'USD'` | ISO 4217 currency code for this payment. Should match the bill's currency. | `NOT NULL`, `DEFAULT 'USD'`, Postgres `"Currency"` enum | Snapshotted at payment creation. Cambodia uses USD for most food transactions. Some tenants operating in rural areas or local markets may use KHR (riel). The ABA PayWay API accepts both USD and KHR. |
| `reference` | `TEXT` | Yes | `NULL` | Gateway transaction identifier. For ABA QR payments, this is the `tran_id` sent to ABA PayWay during QR generation. For cash payments, this is NULL. | None | Used to match incoming ABA webhook callbacks: the webhook POST includes `tran_id`, and the system looks up `payments WHERE reference = tran_id AND status IN ('INITIATED', 'PENDING')`. Also used when calling ABA's Check Transaction API for verification (see `10-aba-payment.md` section 3.1). Format: `PA-{12-char-id}`, max 20 characters per ABA constraint. |
| `gateway_data` | `JSONB` | Yes | `NULL` | Raw response payload from the payment gateway. For ABA, this includes fields like `status`, `apv` (approval code), `payer_account`, and the full check-transaction response. For cash, this is NULL. | None | Stored for audit trail and dispute resolution. If a merchant claims they were not paid, platform support can inspect `gateway_data` to see the exact ABA response. JSONB (not JSON) allows indexed queries if needed. Never exposed in customer-facing APIs — internal/admin use only. |
| `confirmed_at` | `TIMESTAMP(3)` | Yes | `NULL` | Timestamp when the payment was confirmed (status moved to `SUCCEEDED`). For ABA payments, this is set when the webhook callback is verified. For cash, set when staff taps "Confirm Cash". | None | NULL until payment succeeds. Used for financial reconciliation ("payments confirmed between 6:00 AM and 10:00 PM today"), revenue reporting, and as evidence in disputes. Separate from `updated_at` because `updated_at` changes on any modification, while `confirmed_at` only records the moment of successful payment. |
| `created_at` | `TIMESTAMP(3)` | No | `CURRENT_TIMESTAMP` | Row creation time. For ABA payments, this is when the QR code was generated. For cash, when the staff initiated the cash payment flow. | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | Audit trail and debugging. Combined with `confirmed_at`, you can calculate payment latency ("how long between QR display and payment confirmation?"). |
| `updated_at` | `TIMESTAMP(3)` | No | None (Prisma-managed) | Last modification time. Maintained by Prisma's `@updatedAt`. | `NOT NULL` | Standard Prisma audit field. Changes on every status transition. |

---

## Part 4 — Indexes

| Index | Columns | Type | Query it serves | Example SQL |
|-------|---------|------|-----------------|-------------|
| `payments_bill_id_idx` | `(bill_id)` | B-tree | Find all payment attempts for a bill. Primary access pattern for the payment status screen (storefront polls this) and for the merchant portal's bill detail view. | `SELECT * FROM payments WHERE bill_id = $1 ORDER BY created_at DESC;` |
| `payments_tenant_id_status_idx` | `(tenant_id, status)` | B-tree | Find all pending payments for a tenant (monitoring), all succeeded payments (revenue reporting), or all expired payments (analytics). | `SELECT * FROM payments WHERE tenant_id = $1 AND status = 'SUCCEEDED' AND confirmed_at >= $2 AND confirmed_at < $3;` |

**Index not present but potentially useful:**

A partial index on `(reference) WHERE status IN ('INITIATED', 'PENDING')` would speed up ABA webhook matching, which queries `WHERE reference = $tran_id AND status IN ('INITIATED', 'PENDING')`. At MVP scale this is unnecessary — the `bill_id` index plus the small number of in-flight payments per bill makes the lookup fast enough.

---

## Part 5 — Relationships

| FK Column | References | Cascade Behavior | Notes |
|-----------|------------|-------------------|-------|
| `tenant_id` | `tenants(id)` | `ON DELETE CASCADE` | Tenant deletion removes all payments. |
| `bill_id` | `bills(id)` | `ON DELETE CASCADE` | Bill deletion removes all its payment attempts. The `payments_bill_tenant_parity` trigger ensures the bill belongs to the same tenant. |

**No reverse relationships.** No other table has a foreign key pointing to `payments`. Payments are leaf nodes in the data model.

---

## Part 6 — Real-World Usage Scenarios

### Scenario 1: Successful ABA QR payment (boba tea shop, BKK1 Phnom Penh)

A customer orders a Brown Sugar Boba ($3.50). A bill (`BILL-000012`) is created with `total_cents = 350`. The system:

1. Creates a `payments` row: `method = 'ABA_QR'`, `status = 'INITIATED'`, `amount_cents = 350`, `reference = 'PA-clx1abc2def3'`, `gateway_data = NULL`.
2. Calls ABA PayWay's QR generation API with the platform's credentials, `amount = 3.50`, `currency = USD`, and `tran_id = 'PA-clx1abc2def3'`. Payment status moves to `PENDING`.
3. Storefront displays the KHQR code. Customer scans with ABA Mobile.
4. ABA POSTs to `/webhooks/aba/callback` with `tran_id = 'PA-clx1abc2def3'` and `status = '00'`.
5. Backend verifies by calling ABA Check Transaction API (outbound HMAC-SHA512 signed request).
6. ABA confirms. Payment row updated: `status = 'SUCCEEDED'`, `confirmed_at = NOW()`, `gateway_data = { full ABA response }`.
7. Bill moves to `PAID`. Kitchen ticket fires.

### Scenario 2: QR expires, customer retries (num banh chok cart, Russian Market)

A customer orders Khmer noodles ($1.50). Bill `BILL-000077`, first payment attempt:

| Payment | Status | Reference | Created | Confirmed |
|---------|--------|-----------|---------|-----------|
| pay_001 | EXPIRED | PA-clx4ghi5jkl6 | 08:32:00 | NULL |

The customer was checking their phone and missed the 5-minute window. The storefront shows "QR expired - Try Again". They tap retry:

| Payment | Status | Reference | Created | Confirmed |
|---------|--------|-----------|---------|-----------|
| pay_001 | EXPIRED | PA-clx4ghi5jkl6 | 08:32:00 | NULL |
| pay_002 | SUCCEEDED | PA-clx7mno8pqr9 | 08:37:15 | 08:37:48 |

A new `payments` row is created with a fresh `tran_id`. The bill moves to `PAID` when the second attempt succeeds. Both rows remain in the database for the audit trail.

### Scenario 3: Cash payment (fried rice stall, Battambang night market)

A customer orders fried rice ($2.00). The stall only accepts cash (`tenant_settings.payment_aba_qr = false`). A bill is created, and the system creates a `payments` row:

```
method       = 'CASH'
status       = 'INITIATED'
amount_cents = 200
reference    = NULL      -- no gateway
gateway_data = NULL      -- no gateway
```

The kitchen staff sees the order. The customer pays in physical USD bills. Staff taps "Confirm Cash Payment" in the merchant portal or kitchen app. The system updates the payment to `SUCCEEDED`, sets `confirmed_at`, and moves the bill to `PAID`.

---

## Part 7 — Design Decisions

1. **Multiple payments per bill, not one.** A 1:1 bill-to-payment design would require either deleting failed attempts (losing audit data) or updating the same row for retries (losing the history of each attempt). The 1:N design preserves the full payment history: every QR generated, every expiry, every failure.

2. **`REFUNDED` covers full refunds only.** The `PaymentStatus` enum now includes `REFUNDED` for full refunds processed through the payment gateway. Partial refunds are not supported at MVP — if a partial refund is needed, the bill should be voided and a new bill created for the correct amount. A dedicated `refund_logs` table may be added post-MVP for detailed refund audit trails.

3. **`reference` stores the platform-generated `tran_id`, not ABA's.** The `tran_id` sent to ABA is generated by the platform (format: `PA-{12chars}`). This is because ABA's QR generation API requires you to supply the `tran_id`, not the other way around. The same value is used to match incoming webhook callbacks.

4. **`gateway_data` is JSONB, not a typed column set.** ABA's response schema may change, and future gateway integrations (e.g., Wing, Canadia QR) will have different fields. JSONB absorbs any shape without schema changes. It is never exposed in public APIs.

5. **`amount_cents > 0`, not `>= 0`.** A zero-dollar payment is never legitimate. The strict positive check prevents edge cases where a bug creates a $0.00 payment that would auto-succeed and mark the bill as paid.

6. **Cash payments go through the same table.** Rather than having a separate "cash confirmation" mechanism, cash payments create a `payments` row with `method = 'CASH'`. This unifies the data model: every bill is paid by one or more payment attempts, regardless of method. Revenue reports query one table, not two.

7. **Tenant-parity trigger on `bill_id`.** The trigger verifies that the payment's `tenant_id` matches the bill's `tenant_id`. This prevents a scenario where a bug attaches a payment to the wrong tenant's bill.

---

## Part 8 — Related Tables

| Table | Relationship | Purpose |
|-------|-------------|---------|
| `tenants` | Parent (N:1) | Tenant that owns this payment attempt. |
| `bills` | Parent (N:1) | The bill this payment is for. Multiple payments can exist per bill (retry pattern). See `bills.md`. |
| `bill_orders` | Indirect (via `bills`) | To trace a payment back to orders: `payments` -> `bills` -> `bill_orders` -> `orders`. |
| `audit_logs` | Loose reference via `entity_type = 'Payment'` | Records payment lifecycle events (`payment.created`, `payment.succeeded`, `payment.expired`). See `audit-logs.md`. |
| `tenant_settings` | Indirect (via `tenant_id`) | Determines which payment methods are enabled (`payment_cash`, `payment_aba_qr`, `payment_card`) and holds ABA account details (`aba_account_number`, `aba_is_enabled`). |
