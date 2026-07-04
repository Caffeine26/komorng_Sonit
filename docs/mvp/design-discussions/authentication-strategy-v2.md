# Authentication Strategy v2 — MVP Simplification

**Date:** 2026-04-23
**Status:** ✅ Decided & schema applied
**Supersedes:** [`authentication-strategy.md`](authentication-strategy.md) (2026-04-09)
**Affects:** `users`, `user_auth_providers`, `AuthProvider` enum, **new `phone_otp_attempts` table**, `invitations.channel`, merchant portal onboarding UX, kitchen & counter tablet login, customer storefront notification opt-in

**Schema applied 2026-04-23:**
- [`tables/users.md`](tables/users.md) — added `phone`, `phone_verified`, `phone_verified_at`; updated `email` / `password_hash` rationale to reserved
- [`tables/user-auth-providers.md`](tables/user-auth-providers.md) — MVP vs reserved split, `PHONE` provider docs, "2+ linked" invariant, "Why PIN is not here"
- [`tables/phone-otp-attempts.md`](tables/phone-otp-attempts.md) — **new table** (rate limiting + audit for SMS OTP)
- [`tables/invitations.md`](tables/invitations.md) — default `channel = 'telegram'`; email marked reserved
- [`enums/ENUMS_REFERENCE.md`](enums/ENUMS_REFERENCE.md) — new `AuthProvider` section
- [`tables/postgresql-schema.md`](tables/postgresql-schema.md) — all DDLs updated, inventory 33 → 34 tables

---

## Why a v2

The original `authentication-strategy.md` landed four auth providers (FACEBOOK, TELEGRAM, GOOGLE, EMAIL) to cover every scenario. After a senior-architect review, three things came out:

1. **Google Sign-In has no realistic user base in Cambodian SMBs** — added maintenance, negligible coverage.
2. **Email is the wrong recovery channel for this market.** Cambodian small-business owners rarely monitor email. "Recovery via email" becomes "forgot email password → stuck."
3. **Phone numbers are universal in Cambodia** (tied to ID by law, used by ABA / Wing / every local banking flow). SMS OTP is the recovery channel that actually works here.

v2 simplifies to **three auth methods — Telegram, Facebook, and Phone-OTP — all in MVP.**

---

## Updated requirements (from the user)

### Customers
- **No login required.** The QR-based ordering flow is fully anonymous.
- **Optional Telegram opt-in** for order-status notifications, with the simplest possible UX to subscribe and unsubscribe.
- Zero persistent `users` row for anonymous customers.

### Merchants and their staff
- Register & log in via **Telegram or Facebook** (OAuth — or OAuth-equivalent as long as it is secure).
- Must have a recovery path if the primary provider is lost (FB account locked, Telegram account lost).
- UX must be simple — a merchant can onboard and get to "Go Live" without going through email verification hoops.

### Recovery
- Designed in from day one (not deferred).
- Needs to work for users who do not check email.

### Frontline staff (kitchen cook, counter cashier)
- Work on **shared tablets** bound to a tenant.
- Fast shift-start (a few seconds, not a full OAuth flow per day).
- Turnover is high — minimal personal credential exposure.

---

## The three-layer auth model

| Layer | Who | Mechanism | Schema touch |
|---|---|---|---|
| **Customer** | Any person who scans a QR | **No auth.** Optional Telegram subscribe to a bot for notifications. | None (no `users` row at MVP). Optional `customer_telegram_subscriptions` table post-MVP if needed. |
| **Merchant & Manager** | `TENANT_OWNER`, `TENANT_MANAGER`; also `PLATFORM_ADMIN`, `PLATFORM_STAFF` | **Telegram or Facebook** as primary. **Phone-OTP** as recovery. Must link **at least two of the three** during onboarding. | `user_auth_providers` with `AuthProvider ∈ {TELEGRAM, FACEBOOK, PHONE}`. |
| **Frontline staff** | `KITCHEN_STAFF`, `SERVICE_STAFF` | **4-6 digit PIN** on a tenant-bound shared tablet. | `user_pins` (future, tenant-scoped). Not an `AuthProvider` value — scoped to tenant devices, not user-global identity. |

The two-of-three rule gives every merchant/staff account **two independent recovery paths** from day one. Losing one provider never locks a user out.

---

## Use cases (detailed)

### UC-1: Customer places an order, wants Telegram status updates

**Actors:** Dara (customer), "Phnom Penh Fried Rice" (tenant).

1. Dara scans the stall's QR. Storefront opens — anonymous. No login prompt.
2. Dara browses the menu (Khmer by default), adds 2× fried rice and an iced coffee, pays via ABA QR. No account needed.
3. Status page opens: `xfos.app/s/{order_token}`. Shows `PPN-042 — PREPARING — ready in ~5 min`.
4. Below the status: a single button — **"🔔 Get updates on Telegram"**.
5. Dara taps it. The button triggers a `tg://resolve?domain=XfosBot&start={order_token}` deep link.
6. Telegram opens at `@XfosBot`. The bot says: *"Hi! You'll get notifications for order PPN-042. Reply /stop anytime to unsubscribe."* Dara taps *Start*.
7. When the order moves to `READY`, the bot sends: *"✅ PPN-042 is ready at Phnom Penh Fried Rice."*
8. Dara picks up the food. Later, the bot sends no more notifications.
9. If Dara ever wants to unsubscribe: one `/stop` in the chat, done.

**What the schema needs:** the `@XfosBot` links an order-scoped subscription (order_token → Telegram chat_id) keyed by the order, not by a user. **No `users` row for Dara.** This is a one-shot subscription tied to an order's lifetime.

**No login, no account, no password.** Customer UX is one tap to subscribe, one command to stop.

### UC-2: Merchant signs up with Telegram

**Actors:** Sokha (owner of "Street 99 Noodles"), XFOS onboarding flow.

1. Sokha opens the XFOS signup page. Sees **three buttons: "Continue with Telegram", "Continue with Facebook", "Use phone number"**.
2. Taps **Telegram**. Telegram Login Widget opens, Sokha confirms. Telegram returns signed payload (user ID, first_name, username).
3. App verifies signature against the bot token (see `authentication-strategy.md` Risk 2 handling).
4. System creates a `users` row (`full_name` from Telegram's `first_name`+`last_name`), a `user_auth_providers` row (`provider=TELEGRAM`, `provider_id=<Telegram user ID>`, `metadata=<raw payload>`), and issues a JWT.
5. Sokha lands on the tenant-creation form. She enters her business details, picks `code_prefix = 'S99'`, confirms.
6. **Before the tenant finishes setup**, the onboarding flow requires Sokha to link a **second method**. Two options:
   - **"Link Facebook"** — second OAuth flow, adds a FACEBOOK row.
   - **"Add phone number for recovery"** — user enters `+855 12 345 678`, gets an SMS OTP, enters it, adds a PHONE row.
7. Once two methods are linked, `setup_progress.profile_completed_at` can be set. Before that, the "Go Live" button is disabled.

**Result:** Sokha has two independent auth paths from day one. If her Facebook gets locked or her Telegram account is lost, she can always get back in with the other.

### UC-3: Merchant signs up with Facebook, then adds phone

**Actors:** Chenda (manager at "Boba Queen"), invited by owner.

1. Chenda receives an invitation link via Facebook Messenger (from the tenant owner).
2. Opens the link on her phone. XFOS invitation page loads with **three buttons** — picks **Facebook**.
3. Facebook OAuth flow, Chenda approves. Row created: `provider=FACEBOOK, provider_id=<FB user ID>`.
4. Invitation is accepted: `user_roles` row created with `role=TENANT_MANAGER, tenant_id=<Boba Queen's id>`.
5. Onboarding prompts: **"Add a backup login — phone or Telegram"**. Chenda enters her phone number, receives SMS OTP, enters it. Row created: `provider=PHONE, provider_id=<normalized phone>`.
6. Chenda now has Facebook + Phone. Done.

### UC-4: Merchant loses Facebook access (the critical recovery case)

**Actors:** Sokha, whose Facebook was locked for a Khmer-name policy violation.

1. Sokha tries to log in — taps **Facebook**. Facebook says account unavailable.
2. Sokha taps **Telegram** instead. Telegram Login Widget opens. Confirms. Back in the system.
3. From **Account Settings → Login methods**, she sees Facebook is linked but unusable. Can unlink it, can re-link later if Facebook recovers her account.
4. No support call. No data loss. Business continues.

**This works because onboarding required two linked methods.** Without that rule, Sokha would be stuck.

### UC-5: Merchant loses Telegram access (the rare case)

**Actors:** Rith, who switched phones and didn't transfer Telegram.

1. Rith tries Telegram login — fails, account is gone.
2. Taps **Facebook**. Works. Logs in.
3. Same recovery as UC-4 — unlink Telegram, re-link if desired.

### UC-6: Merchant loses BOTH (very rare) — phone-OTP recovery

**Actors:** Bopha, whose Facebook is locked AND whose Telegram account is on a phone that was stolen.

1. Bopha taps **"Use phone number"** on the login page.
2. Enters her phone number. System sends SMS OTP via the configured SMS gateway (see "SMS provider" below).
3. Bopha enters the OTP within 5 minutes. System verifies, finds the matching `user_auth_providers` row (`provider=PHONE, provider_id=<phone>`), logs her in.
4. She is back in the system. Can now update her Facebook / Telegram once she recovers those accounts (e.g. Telegram on a new SIM).

**Phone-OTP is the unconditional recovery path** — works even when every social provider is gone, as long as the tenant still has their phone number.

### UC-7: Losing all three methods — the last-resort case

Losing Telegram AND Facebook AND the phone number simultaneously is statistically very rare (different providers, different accounts, different devices).

- **First 100 tenants:** support-driven recovery. Support staff verify identity out-of-band (video call, in-person, known-customer photo ID) and manually re-link a fresh provider.
- **Later scale:** add identity-verification vendor or stricter business-account recovery. Out of scope for MVP.

### UC-8: Kitchen cook starts a shift

**Actors:** Vanna, kitchen staff at "Malis Restaurant."

1. Vanna walks into the kitchen. The kitchen tablet is already on the login PIN screen. The tablet is pre-configured with `tenant_id=malis, device_role=KITCHEN`.
2. Vanna taps in her 4-digit PIN: `4729`.
3. Backend looks up: `user_pins WHERE tenant_id='malis' AND pin_hash=hash('4729')` → finds Vanna's user row.
4. Verifies Vanna has `KITCHEN_STAFF` role for this tenant.
5. Issues a short-lived JWT scoped to this tenant+role.
6. Vanna is in. Total time: ~3 seconds.
7. **No OAuth, no personal credentials, no Telegram, no Facebook.** The tablet identifies the tenant; the PIN identifies the person.

### UC-9: Counter cashier starts a shift

Same as UC-8, but `device_role=SERVICE` and `role=SERVICE_STAFF`. Same PIN → different tablet → different authorizations. If Vanna also works the counter sometimes, she has two `user_roles` rows (KITCHEN_STAFF + SERVICE_STAFF), same user, same PIN.

### UC-10: Platform admin logs in

`PLATFORM_ADMIN` and `PLATFORM_STAFF` accounts follow the same merchant/staff rules — Telegram or Facebook + one other method (Phone or the other OAuth). IP-restricted admin portal adds a second layer of defense.

---

## Auth provider summary

| Provider | Role | Recovery? | Notes |
|---|---|---|---|
| `TELEGRAM` | Primary login | Yes (alternate to FB/Phone) | Login Widget + bot token signature verify |
| `FACEBOOK` | Primary login | Yes (alternate to TG/Phone) | OAuth 2.0. Guard against FB lockouts |
| `PHONE` | Recovery + standalone login | Yes | SMS OTP via SMS gateway. Phone stored on `users.phone` and mirrored on the PHONE row's `provider_id` |

### `AuthProvider` enum

```sql
CREATE TYPE "AuthProvider" AS ENUM (
  'TELEGRAM',    -- primary
  'FACEBOOK',    -- primary
  'PHONE'        -- recovery + login
);
```

Only three values. Email and Google are **not supported** — see "Why a v2"
above. If either becomes a real need later, adding an enum value is a
single migration.

---

## The "link at least two methods" rule

### Why it is mandatory, not suggested

A soft "please link a backup" prompt during onboarding gets dismissed by 40–60% of users in practice (typical SaaS data). Then when one provider fails, the user is stuck and support absorbs the cost. Enforcing the rule costs ~30 seconds of onboarding friction in exchange for a real recovery path.

### Valid pairs at MVP

- Telegram + Facebook
- Telegram + Phone
- Facebook + Phone

### UX shape

- The onboarding wizard ends with a page titled **"One more step — protect your account."**
- Shows the currently-linked method (`✅ Telegram connected`) and two large buttons for the remaining options (`🔗 Add Facebook`, `📱 Add phone number`).
- The tenant cannot mark `setup_progress.profile_completed_at` until at least two methods are linked. "Go Live" gate is downstream of that.
- Later, from Account Settings, the user can add or remove methods — but the system always requires **at least two linked** at any time. Attempting to unlink the second-to-last is rejected with an explanation.

---

## SMS provider (new dependency)

Phone-OTP at MVP requires an SMS gateway. Candidates for Cambodia:

| Provider | Pros | Cons |
|---|---|---|
| **Twilio** | Global, reliable, well-documented SDK | ~$0.04–0.06/SMS to Cambodia; international origin — some carriers mark as spam |
| **Local gateway** (Smart, Metfone, Cellcard partners) | Lower per-SMS cost (~$0.01–0.02), local sender ID | Integration complexity, per-carrier coverage gaps |
| **MessageBird / Vonage** | Middle ground on both axes | Similar international concerns to Twilio |

**MVP choice:** start with Twilio for engineering simplicity, switch to a local gateway at scale if SMS volume makes the cost material. Rate limit: 1 OTP per phone per 60 seconds, 5 per hour, to prevent abuse.

**Security:** OTP is 6 digits, 5-minute validity, single-use. After 5 failed attempts → 15-minute lockout per phone.

---

## Comparison — v1 vs v2

| Aspect | v1 (2026-04-09) | v2 (2026-04-23) |
|---|---|---|
| Primary methods for merchants | Facebook, Telegram | Facebook, Telegram |
| Recovery channel | Email + password | **Phone-OTP** |
| Google Sign-In | Supported | **Dropped** |
| Email+password | Supported as fallback | **Dropped** |
| Min methods linked at onboarding | "Should link 2+" (soft) | **"Must link 2+" (hard gate)** |
| Frontline staff | PIN on shared tablet (planned) | **Same — unchanged** |
| Customer auth | Anonymous | **Anonymous + Telegram opt-in for notifications** |
| SMS gateway | Not required | **Required at MVP** |

---

## Schema impact summary

| File | Change | Priority |
|---|---|---|
| `tables/users.md` | `email` column stays nullable; rationale shifts from "for email login" to "captured opportunistically from Facebook if the user grants email scope." Add optional `phone` column (nullable, normalized international format). | Part of applying v2 |
| `tables/user-auth-providers.md` | Update Part 3 `provider` value table (remove GOOGLE, EMAIL as active values; flag them reserved). Update Part 6 Scenarios 2 and 3 (email fallback flow → phone-OTP flow). Add "Why PIN is not here" note. Document the "2+ linked" invariant. | Part of applying v2 |
| `enums/ENUMS_REFERENCE.md` | Reflect the reserved-values change on `AuthProvider`. | Minor |
| `tables/postgresql-schema.md` | `AuthProvider` enum ordering (TELEGRAM, FACEBOOK, PHONE first). Possibly `users.phone` column. | Part of applying v2 |
| `tables/invitations.md` | `channel` values — confirm `'telegram'` and `'facebook_messenger'` are primary; `'email'` can stay but should mark "reserved" too. | Minor |
| **New table (post-MVP, not required at MVP):** `customer_telegram_subscriptions` | For UC-1 notification opt-in. Design deferred until the MVP launches with a working bot. | Deferred |
| **New table (post-MVP):** `user_pins` | Already planned in v1 for kitchen/service tablet login. No change. | Unchanged |
| **New table (post-MVP or with phone-OTP):** `phone_otp_attempts` | Rate-limiting + audit for OTP sends and verifications. Small, ephemeral. | New |

---

## Open items / follow-up decisions

1. **Pick the MVP SMS provider.** Twilio vs local gateway. Costs vs complexity vs deliverability.
2. **Phone number format.** Require E.164 (`+855...`)? Accept local format and normalize server-side? Recommendation: accept local input, normalize + store E.164.
3. **Phone as a secondary display hint** — e.g., show partial phone (`+855 12 *** 678`) on the login page during OTP flow so users know which number will receive the OTP.
4. **Invitation channel vs actual login method.** An invitation can arrive via any channel (Messenger / Telegram / link shared in person). The channel hints but does not constrain which auth method the invitee uses. Keep them decoupled.
5. **Customer Telegram opt-in — storage design.** Decide between: (a) a row on `orders` (`telegram_chat_id` column, nullable) for single-order subscriptions, (b) a `customer_telegram_subscriptions` table with `(order_token, chat_id)` pairs, (c) a `customer_identities` table for repeat-customer recognition later. Design when post-MVP chatbot work lands.
6. **`users.phone` column** — add now or on-demand? Recommend **add now** with `nullable`, so the PHONE provider has a stable home for the phone number alongside the rest of user identity.
7. **Apply the schema changes** — run through the affected tables and update. Not done in this doc — ready when the team confirms.

---

## Decisions locked

- ✅ MVP auth providers: **Telegram, Facebook, Phone-OTP**.
- ✅ Email and Google: **dropped entirely** — not in the enum, not in the onboarding flow, not reserved.
- ✅ Minimum two methods linked per account, enforced at onboarding (hard gate, not soft prompt).
- ✅ Customer flow: **anonymous QR ordering + optional Telegram opt-in for status notifications**. No persistent customer account at MVP.
- ✅ Frontline staff: **PIN on tenant-bound shared tablet**. Unchanged from v1.
- ✅ SMS gateway is an MVP dependency. Provider selection deferred to implementation.
