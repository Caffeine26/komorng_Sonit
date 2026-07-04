# 81 — ABA PayWay Integration: Feasibility Review

**Date:** 2026-03-26
**Reviewed against:** `04-sequence-diagrams.md`, `05-database-schema.md`, `06-api-endpoints.md`, `01-e2e-scenarios.md`
**Research source:** ABA PayWay developer portal (`developer.payway.com.kh`), KHQR NBC guidelines, community integration reports

---

## Executive Summary

**Verdict: Include in MVP from Day 1. It is both feasible and strategically non-negotiable.**

ABA is Cambodia's #1 bank with 4.5 million customers and 200,000+ active merchants. 85% of ABA customers use digital services. The KHQR standard (mandated by the National Bank of Cambodia) means an ABA-generated QR works with all 30+ participating banks — not just ABA users. For food stalls and restaurants in Cambodia, ABA QR is as expected as a cash drawer. Shipping without it creates a product that merchants will reject before they even finish the demo.

The good news: **the architecture already supports ABA end-to-end.** The sequence diagrams, webhook endpoint, billing service, and payment status polling are all designed.

**The updated recommendation is for the platform to hold one ABA PayWay account and use ABA's payout split feature to route funds directly to each merchant's personal ABA account.** This matches how merchants already operate — most simply print their personal QR code and receive payments into their ABA account. Merchants need to give the platform only their ABA account number or Bakong ID (their phone number). No ABA PayWay registration required from them.

There is also a **security correction** in the existing design that must be fixed before code is written.

---

## 1. Market Context — Why ABA Cannot Be Deferred

| Metric | Figure |
|--------|--------|
| ABA Mobile app users | ~4.5 million |
| Merchants accepting ABA Pay | 200,000+ |
| Mobile app growth (H1 2024) | +34% YoY |
| Banks interoperable via KHQR | 30+ (NBC-mandated) |
| QR payment growth in Cambodia (2023) | 7× YoY |
| ABA market position | #1 by assets, deposits, and profitability |

Every Cambodian restaurant owner already has an ABA account. Every customer paying at a food stall expects to see a QR code. Cash is still used, but digital payment adoption is accelerating fast. A food ordering platform that forces customers to pay cash — when they are already used to scanning QR codes at the same stalls — is solving half the problem.

**Without ABA QR, the product offers ordering convenience but not payment convenience. That reduces the value proposition significantly for the merchant.**

---

## 2. What Is Already Designed (Do Not Rebuild)

The existing technical design already covers the core of ABA integration:

| What's designed | Where |
|-----------------|-------|
| Full ABA QR payment flow (customer journey) | `04-sequence-diagrams.md` Flow 1 |
| `POST /billing/bills/{billId}/pay { method: ABA_QR }` | `06-api-endpoints.md` |
| `POST /webhooks/aba/callback` endpoint | `06-api-endpoints.md` |
| Payment status polling (`GET /billing/bills/{billId}/payment-status`) | `06-api-endpoints.md` |
| QR display + deeplink + 5-min countdown | Scenario B, `01-e2e-scenarios.md` |
| QR expiry + "Try Again" retry flow | Scenario B error paths |
| `payment_attempt` state machine (PENDING → SUCCEEDED/FAILED/EXPIRED) | `05-database-schema.md` |
| Idempotency key on order creation | `06-api-endpoints.md` |
| Poll-based confirmation (max 90s, every 2s) | Scenario B |

None of this needs to be redesigned. The integration work is building on top of what's already specified.

---

## 3. Critical Gaps and Corrections

### 3.1 — SECURITY CORRECTION: Webhook Verification Is Wrong

**This is the most important issue to fix before any code is written.**

The current `06-api-endpoints.md` webhook implementation assumes ABA sends an HMAC-SHA256 signature header (`x-webhook-signature`) on the inbound callback:

```typescript
// Current design — INCORRECT for ABA PayWay
const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
  throw new UnauthorizedException('Invalid signature');
}
```

**ABA PayWay does not send an HMAC signature on its webhook callback.** The inbound POST contains `tran_id`, `status`, `apv`, and `payer_account`, but no signed header. A naive implementation that skips the signature check and just reads `status === "00"` would be vulnerable to spoofed webhooks — anyone could POST a fake "payment confirmed" to your endpoint.

**Correct verification pattern for ABA webhooks:**

```
Step 1 — Receive POST /webhooks/aba/callback
Step 2 — Extract tran_id from payload
Step 3 — Look up payment_attempt in DB where external_ref = tran_id AND status = PENDING
         → If not found: return 200 (idempotent, ignore unknown tran_ids silently)
Step 4 — Call ABA Check Transaction API: GET /check-transaction?tran_id={tran_id}
         → This is a signed outbound call using the PLATFORM's merchant_id + api_key
         → ABA confirms payment status from their side
Step 5 — Only if ABA Check Transaction returns status "00": mark payment SUCCEEDED
Step 6 — Return HTTP 200 to ABA (regardless of outcome — ABA retries on non-200)
```

This "verify by calling back" pattern is the correct approach when the provider does not sign its outbound webhooks. It prevents spoofed confirmation attacks entirely.

**Also note:** ABA PayWay uses **HMAC-SHA512**, not HMAC-SHA256, for requests *you send to ABA* (QR generation, check-transaction). The existing design's `SHA256` reference in the HMAC code needs to be updated wherever it describes the outbound signing algorithm.

---

### 3.2 — Use `abapay_khqr`, Not `abapay`

ABA PayWay has two QR payment options:

| Option | What it is |
|--------|-----------|
| `abapay` | ABA's proprietary QR — only scannable from ABA Mobile |
| `abapay_khqr` | NBC-standard KHQR — scannable from any of 30+ participating banks |

The current design uses `ABA_QR` as an internal enum value, which is fine for the platform's own naming. But when making the actual API call to ABA PayWay, the `payment_option` parameter **must be `abapay_khqr`**. This makes the QR scannable by Wing Bank, Canadia Bank, and all other NBC-participating institutions — not just ABA users. There is no reason to use the proprietary `abapay` option for a public storefront.

---

### 3.3 — Schema: Platform Credentials + Per-Tenant ABA Account Number

Under the recommended platform aggregator model, the platform holds one set of ABA PayWay credentials stored as environment variables or platform-level config. What is stored per-tenant is only the merchant's ABA **receiving account** — either their account number or Bakong ID (phone number).

**Per-tenant schema addition** (in `tenant_settings`):

```sql
ALTER TABLE tenant_settings
  ADD COLUMN aba_account_number  VARCHAR(50),   -- merchant's ABA account number or Bakong ID
  ADD COLUMN aba_account_name    VARCHAR(100),  -- merchant's account holder name (for display)
  ADD COLUMN aba_is_enabled      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN aba_currency        VARCHAR(3)     DEFAULT 'USD';
```

**Platform-level credentials** (environment variables — never in the DB):

```env
ABA_MERCHANT_ID=<platform's ABA PayWay merchant ID>
ABA_API_KEY=<platform's ABA PayWay HMAC-SHA512 signing key>
ABA_CALLBACK_URL=https://api.yourplatform.com/webhooks/aba/callback
```

**Security requirement:** `ABA_API_KEY` must never appear in API responses or logs. It lives only in environment variables, decrypted in-process when making outbound ABA API calls.

---

### 3.4 — ABA Setup Step Updated for Merchant Onboarding (Scenario E)

Scenario E (Tenant Owner — First Day) currently has 6 setup steps with no payment connection step. Under the platform aggregator model, this becomes very simple for the merchant:

**Proposed new step: "Connect Your ABA Account" (Step 5 or 6 in the onboarding checklist)**

```
Owner sees: "Enter your ABA account details so customers can pay you directly."
Owner enters: ABA account number (or phone number / Bakong ID) + account holder name.
[SYS] Platform validates format (no live ABA API call needed at this step).
      aba_is_enabled = true. setup_progress.aba_connected = true.
Owner sees: "ABA payments enabled. Customers can now pay with ABA QR."
```

This step should be **optional for go-live**. A merchant who only accepts cash should not be blocked from launching. The `paymentMethods` array in `GET /storefront/context/{token}` dynamically includes `ABA_QR` only if `aba_is_enabled = true`.

---

### 3.5 — `payment_attempts` Table Missing `external_ref` Column

The `payment_attempts` table needs to store ABA's `tran_id` for webhook matching. Without this, the webhook verification pattern in §3.1 cannot perform the tran_id lookup.

```sql
ALTER TABLE payment_attempts
  ADD COLUMN external_ref VARCHAR(100),  -- stores the tran_id sent to ABA
  ADD COLUMN external_metadata JSONB;    -- stores full gateway response for audit
```

`external_ref` is generated by your platform (not ABA) and passed as `tran_id` in the QR generation request. Use a short, URL-safe unique ID (e.g., `PA-{paymentAttemptId:12chars}`). Max 20 characters per ABA's constraint.

---

## 4. The Reality of Merchant Payment Behaviour in Cambodia

Understanding how merchants actually accept payments today is critical to choosing the right architecture.

### How Most Cambodian Merchants Operate Today

The majority of merchants — food stalls, small restaurants, market vendors — do not have ABA PayWay merchant accounts. They use a **static personal QR code** printed on paper or displayed on a phone screen:

```
Customer scans printed QR
        ↓
Customer manually types the amount in ABA app
        ↓
ABA transfers money directly to merchant's personal account
        ↓
Merchant gets a notification on their ABA app
        ↓
Your platform: ← nothing. No signal. No callback. No API.
```

A static QR has no `callback_url`, no `tran_id`, no webhook. It is a peer-to-peer transfer. There is no way for the platform to intercept or confirm that transaction automatically.

### Why Showing the Merchant's Static QR Doesn't Work for the Platform

You *can* display a merchant's static QR image on the storefront screen. The customer scans it and pays. But the platform receives zero confirmation signal. The kitchen cannot be triggered automatically. The flow degrades to:

```
Customer scans QR → pays → shows ABA receipt screen to staff
Staff eyeballs their personal ABA app → manually taps "Confirm" in kitchen app
Kitchen ticket created
```

This is functionally identical to the cash flow — manual, trust-based, and a bottleneck under busy conditions. It is not a reliable payment integration. **It is a QR image holder with a kitchen display.**

---

## 5. The Multi-Tenant Payment Model Decision

Three options exist. The correct choice for the real merchant landscape is Option C.

### Option A: Direct Model (Each Merchant Has Their Own ABA PayWay Account)

```
Customer pays → ABA → Merchant's ABA account directly
Platform is never in the money flow
```

- Each merchant registers for ABA PayWay independently (~$100 one-time, a few weeks approval)
- Platform stores their encrypted `merchant_id` + `api_key`
- Platform calls ABA using that merchant's credentials; confirmation webhook goes to platform's URL
- Money lands in merchant's ABA account; platform charges SaaS fee separately

**Pros:** No financial regulatory exposure. No settlement. Clean money flow.

**Cons:** Most Cambodian merchants do not have ABA PayWay and won't go through the registration process just to use your product. This model gates ABA acceptance on a merchant action that the majority of your target customers have never done.

---

### Option B: Static QR Display + Manual Staff Confirmation

```
Customer scans merchant's printed QR → pays → staff confirms in kitchen app
```

**Pros:** Zero integration work. No merchant setup required.

**Cons:** Not a payment integration — it is manual confirmation, same as cash. Breaks the automated kitchen trigger. Not scalable.

---

### Option C: Platform ABA PayWay Account + Payout Split ✓ Recommended

```
Platform holds ONE ABA PayWay account

Customer pays
        ↓
QR generated by PLATFORM's ABA credentials
        ↓
ABA's payout parameter routes 100% of funds to merchant's ABA account in real time
(or platform takes a fee split: e.g. 98% to merchant, 2% to platform account)
        ↓
Confirmation webhook → YOUR server (callback_url you set)
        ↓
You verify via check-transaction (signed with your api_key)
        ↓
Kitchen ticket fires
```

**What merchant gives you:** Their ABA account number or Bakong ID (phone number). That's it. No PayWay registration. No API keys. No $100 fee.

**What they receive:** Money arrives in their ABA account exactly as it always has — the same way a customer would pay them by scanning their printed QR. The only difference is that the amount is pre-filled and the platform gets a trustable confirmation.

**Pros:**
- Matches real merchant behaviour — they just have an ABA account
- Zero friction for merchant payment onboarding
- Platform gets reliable, tamper-proof confirmation via check-transaction
- Platform can optionally take a transaction fee via the payout split
- One set of ABA credentials to manage (platform-level, not per-tenant)

**Cons:**
- Platform briefly holds the payment before it is routed to the merchant (milliseconds — ABA splits in real time)
- Requires the platform to register for ABA PayWay and negotiate the aggregator/payout arrangement with ABA
- Need to confirm with ABA (`paywaysales@ababank.com`) that the `payout` parameter supports routing 100% to a third-party account

---

### Option Comparison

| | Option A (Direct PayWay) | Option B (Static QR) | Option C (Platform + Payout) |
|--|--|--|--|
| Merchant setup effort | ~$100 + weeks for PayWay | None | Give account number only |
| Automated confirmation | Yes | No — manual | Yes |
| Kitchen auto-trigger | Yes | No | Yes |
| Money goes to merchant | Yes (direct) | Yes (direct) | Yes (real-time split) |
| Platform gets webhook | Yes | No | Yes |
| Matches real merchant behaviour | No | Yes | Yes |
| Platform regulatory exposure | None | None | Brief (milliseconds) |
| Scales to many merchants | Every merchant must register | N/A | Platform manages one account |

---

## 6. How the Platform Confirmation Works (Option C Trust Chain)

This addresses the core question: *"Is the confirmation I get trustable, without merchant action?"*

```
1. Customer initiates ABA payment on storefront
2. Platform calls ABA QR generation API:
      merchant_id:  <PLATFORM's merchant ID>
      tran_id:      "PA-a3f9c1d2"        ← platform-generated, stored in payment_attempts
      amount:       "19.50"
      currency:     "USD"
      callback_url: "https://api.yourplatform.com/webhooks/aba/callback"
      payout:       Base64({ "accounts": [{ "id": "merchant_aba_account", "amount": "19.50" }] })
      payment_option: "abapay_khqr"

3. Customer pays in ABA app
4. ABA debits customer → credits merchant's ABA account (real time)
5. ABA POSTs to YOUR callback_url: { tran_id: "PA-a3f9c1d2", status: "00" }
6. Your platform looks up tran_id → finds PENDING payment_attempt
7. Your platform calls ABA Check Transaction API (signed with YOUR api_key):
      GET /check-transaction?tran_id=PA-a3f9c1d2
      ABA responds: { status: "00", amount: "19.50", currency: "USD" }
8. Confirmed. Platform marks payment SUCCEEDED. Kitchen ticket created.
```

Steps 5–8 are entirely within your server. **The merchant does nothing.** They just see money arrive in their ABA app. The check-transaction call in Step 7 is the source of trust — it's a signed, outbound request from your server to ABA that cannot be spoofed.

---

## 7. Implementation Work Breakdown

| Task | Days |
|------|------|
| Platform ABA PayWay account registration + sandbox setup | 0.5 |
| Schema: add `aba_account_number`, `aba_account_name` to `tenant_settings`; add `external_ref` to `payment_attempts` | 0.5 |
| ABA PayWay API client: QR generation with HMAC-SHA512 signing + payout parameter | 2 |
| ABA PayWay API client: check-transaction for webhook verification | 1 |
| Webhook handler: tran_id lookup + check-transaction confirm (replace existing HMAC pattern) | 1 |
| Merchant onboarding: "Connect ABA" UI step (account number input + validation) | 1 |
| Storefront: QR display, ABA deeplink button, 5-min countdown, polling, retry | 2 |
| `paymentMethods` dynamic gating (only return `ABA_QR` if `aba_is_enabled = true`) | 0.5 |
| Sandbox end-to-end testing | 3 |
| **Total** | **~11.5 engineering days** |

---

## 8. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| ABA rejects aggregator/payout-split model | **High** | Confirm with `paywaysales@ababank.com` before building. This is the only external dependency that could block the entire approach. |
| Production ABA approval takes 4+ weeks | **High** | Register platform account immediately. Use sandbox for all dev/test. Build in parallel. |
| Webhook spoofing (no inbound HMAC from ABA) | **High** | Implement check-transaction verification pattern (§3.1). Never trust the unsigned webhook payload alone. |
| Merchant enters wrong ABA account number | **Medium** | Validate format at input. Consider a test micro-transaction to confirm the account is valid before enabling live payments. |
| `ABA_API_KEY` exposed in logs or responses | **Medium** | Env var only, never in DB. Excluded from all log output. Audit log access only. |
| `tran_id` collision | **Low** | Use `PA-{paymentAttemptId:12chars}` format. Globally unique by design. |
| ABA QR expires while customer fumbles | **Low** | Already handled: "Try Again" generates a new payment attempt. Old attempt expires to EXPIRED state. |
| Webhook delivered twice (ABA retries on non-200) | **Low** | Idempotent: second delivery finds `status ≠ PENDING` and returns 200 silently. No duplicate processing. |
| Currency mismatch (KHR vs USD) | **Low** | Platform operates in USD. ABA supports both. Document clearly; do not mix currencies per-transaction. |

---

## 9. What To Do Next

Ordered by urgency:

1. **Immediately — critical commercial question:** Contact `paywaysales@ababank.com` and confirm that the `payout` parameter supports routing 100% of a transaction to a third-party ABA account (the merchant's), with the platform as the registered PayWay merchant. This is the only question that can change the architecture. If ABA says no, fall back to Option A.

2. **Immediately:** Register for ABA PayWay sandbox credentials at `developer.payway.com.kh`. Self-service, takes 10 minutes. Test the QR generation API with the `payout` parameter to validate the flow before any backend code is written.

3. **This week:** Correct `06-api-endpoints.md` — replace the HMAC-SHA256 webhook verification block with the check-transaction pattern (§3.1). The incorrect code must not be built.

4. **This week:** Update `04-sequence-diagrams.md` Flow 1 — add the check-transaction confirmation step after the webhook is received, and update the QR generation call to show the platform's credentials and the `payout` parameter.

5. **This week:** Add schema migrations for §3.3 and §3.5.

6. **This sprint:** Update Scenario E (Tenant Owner onboarding) to add the simplified "Enter your ABA account number" step.

7. **As soon as possible (in parallel with dev):** Start the production ABA PayWay merchant approval process for the platform account. The few-weeks approval lead time is the one item that cannot be accelerated by engineering effort alone.

---

## 10. Summary

| Dimension | Assessment |
|-----------|------------|
| **Market necessity** | Non-negotiable. ABA is Cambodia's dominant payment rail. |
| **Technical feasibility** | High. Architecture is already designed. ~12 days of engineering. |
| **Recommended model** | Platform holds one ABA PayWay account. Uses `payout` split to send funds to merchant's personal ABA account. |
| **What merchants need to provide** | ABA account number or Bakong ID (phone number). No PayWay registration required. |
| **Platform confirmation trustability** | Yes — check-transaction API call independently verifies every payment from ABA's side. No merchant action needed. |
| **Critical correction** | Webhook security must use check-transaction pattern, not HMAC verification. |
| **Critical pre-build question** | Confirm with ABA that payout-split to third-party accounts is permitted for a SaaS platform. |
| **Main operational risk** | Production merchant approval lead time (a few weeks). Start now. |
| **Blocking for MVP launch?** | No — sandbox works for development. Production approval runs in parallel. |
