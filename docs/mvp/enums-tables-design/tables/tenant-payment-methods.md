# `tenant_payment_methods`

| Attribute | Value |
|---|---|
| **Domain** | Tenant |
| **Tenant-scoped?** | Yes |
| **Prisma model** | `TenantPaymentMethod` |
| **Mapped name** | `@@map("tenant_payment_methods")` |

---

## Part 1: Overview

The `tenant_payment_methods` table stores which payment methods a tenant
has enabled, which provider backs each method, and any provider-specific
configuration. Each row represents one method + provider combination.

This replaces the original `payment_methods "PaymentMethod"[]` enum array
on `tenant_settings`. The array only stored WHICH methods were enabled.
This table also stores:
- **Which provider** — ABA for QR vs Wing for QR (different tenants,
  different providers)
- **Provider config** — merchant ID, display name, payout account
- **Per-method state** — enabled/disabled independently
- **Audit trail** — when each method was configured

**What goes in `config` vs environment variables:**

| Data | Where | Why |
|---|---|---|
| Platform ABA API key, secret | Environment variables | One set for the whole platform. Never in DB. |
| Platform Stripe secret key | Environment variables | Same |
| Tenant's ABA merchant ID | `config JSONB` | Per-tenant, different for each restaurant |
| Tenant's payout bank account | `config JSONB` | Per-tenant |
| Display name on QR receipt | `config JSONB` | Per-tenant branding |
| QR code expiry override | `config JSONB` | Per-tenant preference |

---

## Part 2: CREATE TABLE

> **2026-04-25:** composite-PK refresh.

```sql
CREATE TABLE tenant_payment_methods (
  tenant_id   TEXT NOT NULL,
  id          TEXT NOT NULL,
  method      "PaymentMethod" NOT NULL,    -- CASH, ABA_QR, CARD
  provider    TEXT,                         -- 'aba', 'wing', 'stripe', NULL for cash
  is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  config      JSONB,                        -- provider-specific config (NOT secrets)
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id, method, provider)
);
```

Referenced enum:

```sql
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'ABA_QR', 'CARD');
```

---

## Part 3: Column-by-Column

### `id` — TEXT PRIMARY KEY

- **Nullable:** No
- **Default:** `cuid()` (application-generated)
- **Purpose:** Surrogate primary key.

### `tenant_id` — TEXT NOT NULL

- **Nullable:** No
- **Constraints:** `REFERENCES tenants(id) ON DELETE CASCADE`. Indexed.
- **Purpose:** Which tenant this payment method belongs to. One tenant can
  have multiple rows (one per method+provider).
- **Why CASCADE:** If a tenant is deleted, their payment methods are cleaned up.

### `method` — "PaymentMethod" NOT NULL

- **Purpose:** The payment method type.
- **Values:**
  - `CASH` — physical cash, staff attestation
  - `ABA_QR` — ABA PayWay KHQR code
  - `CARD` — credit/debit card (future)
- **Why enum:** Type-checked. Adding a new method (Wing, Pi Pay) = add an
  enum value, which is a deliberate decision.

### `provider` — TEXT (nullable)

- **Nullable:** Yes — `CASH` has no provider.
- **Purpose:** Which payment provider backs this method.
- **Examples:**
  - `CASH` → `NULL` (no provider, staff attestation)
  - `ABA_QR` → `'aba'` (ABA PayWay)
  - `ABA_QR` → `'wing'` (Wing QR — future, same method, different provider)
  - `CARD` → `'stripe'` (Stripe — future)
- **Why TEXT not enum:** Providers change more frequently than methods.
  Adding a new provider shouldn't require a migration — it's a config
  decision, not a schema decision.

### `is_enabled` — BOOLEAN NOT NULL DEFAULT TRUE

- **Purpose:** Whether this method is currently active for the tenant.
- **Why not just delete the row?** The merchant might temporarily disable
  ABA QR (maintenance, account issue) and re-enable later. Disabling
  preserves the config; deleting loses it.

### `config` — JSONB (nullable)

- **Nullable:** Yes — `CASH` needs no config.
- **Purpose:** Provider-specific configuration. **NEVER** store API keys
  or secrets here — those belong in environment variables.
- **Examples per method:**

  **Cash:**
  ```json
  null
  ```

  **ABA QR:**
  ```json
  {
    "merchant_id": "MER-123456",
    "display_name": "Lucky Burger",
    "qr_expiry_seconds": 300
  }
  ```

  **Card (future, Stripe):**
  ```json
  {
    "stripe_account_id": "acct_xxx",
    "statement_descriptor": "LUCKY BURGER"
  }
  ```

### `created_at` — TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

- **Purpose:** When this payment method was configured for the tenant.

### `updated_at` — TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

- **Purpose:** Last modification. Managed by Prisma `@updatedAt`.

---

## Part 4: Indexes

### `UNIQUE (tenant_id, method, provider)`

- **Purpose:** One row per tenant + method + provider combination. A tenant
  can't have two ABA QR entries with the same provider.
- **Allows:** Same tenant, same method, different providers (ABA QR + Wing
  QR = two rows, both `method = ABA_QR` but different `provider`).

### `INDEX ON tenant_payment_methods (tenant_id)`

- **Query served:** "Which payment methods does this tenant accept?"
  ```sql
  SELECT method, provider, config
  FROM tenant_payment_methods
  WHERE tenant_id = 'x' AND is_enabled = TRUE;
  ```

---

## Part 5: Relationships

### Outgoing FK

| Target table | FK column | Cascade | Why |
|---|---|---|---|
| `tenants` | `tenant_id` | `ON DELETE CASCADE` | Payment methods belong to the tenant |

### Incoming references

None. `tenant_payment_methods` is a leaf table. The `payments` table
references `PaymentMethod` enum directly (method used for that specific
payment attempt), not this config table.

---

## Part 6: Real-World Usage Scenarios

### Scenario 1: New stall enables ABA QR

"Lucky Noodles" has been cash-only. They sign up for ABA PayWay and want
to accept QR payments.

```sql
-- Already has cash (created during onboarding)
-- tenant_payment_methods: { method: CASH, provider: NULL, is_enabled: true }

-- Add ABA QR
INSERT INTO tenant_payment_methods (id, tenant_id, method, provider, config)
VALUES ('clx_tpm_002', 'lucky_noodles_id', 'ABA_QR', 'aba', '{
  "merchant_id": "MER-789012",
  "display_name": "Lucky Noodles",
  "qr_expiry_seconds": 300
}');
```

The storefront checkout immediately shows ABA QR alongside cash.

### Scenario 2: Temporarily disable ABA QR

ABA PayWay is having maintenance. The merchant disables QR temporarily:

```sql
UPDATE tenant_payment_methods
SET    is_enabled = FALSE, updated_at = NOW()
WHERE  tenant_id = 'lucky_noodles_id' AND method = 'ABA_QR';
```

The storefront hides the QR option. When ABA is back, flip `is_enabled = TRUE`.
Config is preserved — no need to re-enter merchant ID.

### Scenario 3: Platform analytics — payment adoption

```sql
-- How many active tenants accept ABA QR?
SELECT COUNT(DISTINCT tpm.tenant_id)
FROM tenant_payment_methods tpm
JOIN tenants t ON t.id = tpm.tenant_id
WHERE t.status = 'ACTIVE'
  AND tpm.method = 'ABA_QR'
  AND tpm.is_enabled = TRUE;

-- Which tenants are cash-only? (no other enabled methods)
SELECT t.slug, t.name_en
FROM tenants t
WHERE t.status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM tenant_payment_methods tpm
    WHERE tpm.tenant_id = t.id
      AND tpm.method != 'CASH'
      AND tpm.is_enabled = TRUE
  );
```

---

## Part 7: Design Decisions

### Why a table, not an enum array on tenant_settings

The original design used `payment_methods "PaymentMethod"[] DEFAULT '{CASH}'`
on `tenant_settings`. This was replaced because:

| Need | Array | Table |
|---|---|---|
| Which methods are enabled | Yes | Yes |
| Which provider per method | No | Yes (`provider` column) |
| Per-method config (merchant ID) | No | Yes (`config JSONB`) |
| Enable/disable individually | No (remove/add from array) | Yes (`is_enabled` toggle) |
| Audit (when was QR configured?) | No | Yes (`created_at`, `updated_at`) |
| Multiple providers for same method | No | Yes (ABA QR + Wing QR) |

### Why `provider` is TEXT, not an enum

Providers change more frequently than methods. A new method (crypto) is a
product decision that requires code changes — deserves an enum value. A new
provider (Wing QR alongside ABA QR) is an integration/config decision —
TEXT is sufficient.

### Why `config` doesn't store secrets

API keys and secrets belong in environment variables (or a secrets manager
like AWS Secrets Manager / Vault), never in the database. Reasons:
- DB backups would contain plaintext secrets.
- DB access ≠ secrets access (principle of least privilege).
- Secrets rotation doesn't require a DB migration.
- Platform-level keys (one ABA account for all tenants) are not per-tenant.

The `config` JSONB stores non-sensitive, tenant-specific settings: merchant
IDs, display names, preference overrides.

### Why CASH has a row (not implicit)

Cash could be implicit ("every tenant accepts cash"). But having an explicit
row means:
- A tenant can disable cash (rare but possible — QR-only restaurant).
- Consistent query: "SELECT enabled methods" works for all methods.
- `setup_progress.payments_configured` = `EXISTS (SELECT 1 FROM tenant_payment_methods WHERE tenant_id = x AND is_enabled = TRUE)`.

---

## Part 8: Related Tables

| Table | Relationship | Purpose |
|---|---|---|
| `tenants` | Parent (N:1) | The tenant this payment method belongs to |
| `tenant_settings` | Sibling | Other tenant config (currency, tax, branding) — payment methods moved OUT of this table |
| `payments` | Indirect | Each `payments` row has a `method` column (PaymentMethod enum) recording which method was used. The payments table doesn't FK to this config table — it just records the method used at payment time. |
| `setup_progress` | Sibling | `payments_configured = TRUE` when at least one enabled row exists here |
| `bills` | Indirect | The storefront reads enabled methods from here to show payment options at checkout |
