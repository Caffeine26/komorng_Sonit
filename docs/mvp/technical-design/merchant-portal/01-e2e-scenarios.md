# Merchant Portal — End-to-End Scenarios

These scenarios follow the tenant owner (merchant) actor through their complete journey — from first-day onboarding to routine daily operations.

---

## Actors and Surfaces

| Actor                          | Surface                                       | Device                |
| ------------------------------ | --------------------------------------------- | --------------------- |
| **Customer**                   | Storefront App (mobile web, `/store/{token}`) | Phone (Android/iOS)   |
| **Kitchen Staff**              | Kitchen App (PWA, `/kitchen`)                 | Tablet (landscape)    |
| **Tenant Owner (Merchant)**    | Merchant Portal (`/admin`)                    | Laptop, tablet, phone |
| **Platform Admin / Sales Ops** | Platform Portal (`/platform`)                 | Laptop                |

---

## Scenario F: Tenant Owner — First Day (Onboarding)

- **Who:** The restaurant owner, received an invitation email from the platform.
- **Device:** Laptop, Chrome.
- **Pre-conditions:** Platform Admin has created the merchant record, provisioned the tenant (`status: DRAFT`), and sent the invitation email.

### Happy Path

1. **Owner receives invitation email.**
   Email contains: `https://admin.app/invite/{rawToken}`.

2. **Owner clicks the link.**
   - `[SYS]` `POST /auth/accept-invite { token: rawToken, password: "..." }` → token hashed to SHA-256 → looked up in `invitations` table. Status PENDING, not expired → user created, `TENANT_OWNER` role assigned. Tenant status → ACTIVE.
   - Owner sees: "Set your password" form. Enters password. Taps "Create Account".

3. **Owner lands on admin dashboard.**
   Owner sees: Welcome screen + Setup Progress widget — **0/6 complete**.

4. **Owner clicks "Complete Business Profile".**
   - Fills in restaurant name, description. Taps Save.
   - `[SYS]` `PATCH /admin/tenant` → `setup_progress.profile_complete = true`.
   - Owner sees: Step 1 ✓. Progress: **1/6**.

5. **Owner clicks "Choose Service Model".**
   - Selects "Table Service (Dine-In)".
   - `[SYS]` `PATCH /admin/tenant/settings { serviceModel: DINE_IN_TABLE }` → `setup_progress.service_model_set = true`.
   - Owner sees: Step 2 ✓. Progress: **2/6**.

6. **Owner clicks "Build Your Menu".**
   - Creates category "Main Dishes" with Khmer translation "មុខម្ហូបចម្បង". Adds item "Beef Amok", price $9.00, with Khmer name.
   - `[SYS]` First `menu_item` created → `setup_progress.menu_complete = true`.
   - `[SYS]` First `menu_item_translation` with `locale: km` → `setup_progress.translations_complete = true`.
   - Owner sees: Steps 3 and 4 ✓. Progress: **4/6**.
   _(Owner continues adding items and categories.)_

7. **Owner clicks "Generate QR Codes".**
   - Enters "10 tables". Taps "Generate".
   - `[SYS]` `POST /admin/qr` called 10 times → 10 `qr_context` records created. `setup_progress.qr_created = true`.
   - Owner sees: 10 QR codes in a grid. "Download All" button. Step 5 ✓. Progress: **5/6**.

8. **Owner clicks "Download All QR Codes".**
   - `[SYS]` `GET /admin/qr/{id}/download` for each → PNG images.
   - Owner downloads a ZIP for printing.

9. **Owner sees the final core step complete.**
   - `[SYS]` Setup Service detects all 5 flags true → `setup_progress.go_live_ready = true`. Tenant confirmed ACTIVE.
   - Owner sees: "You're live!" banner. Progress: **6/6**. Storefront URL with "Preview" button.

10. **Owner optionally clicks "Connect ABA Payment"** (shown as a bonus step, not required for go-live).
    - Owner enters their ABA account number (or Bakong ID / phone number) and account holder name.
    - `[SYS]` `PATCH /admin/tenant/settings { abaAccountNumber: "...", abaAccountName: "...", abaIsEnabled: true }`.
    - Owner sees: "ABA payments enabled. Customers can now pay by scanning ABA QR." ABA Pay option will now appear on the storefront payment screen.
    > **Note:** This step can also be done later from Settings. Skipping it means the storefront offers Cash only until connected.

11. **Owner clicks "Preview Storefront".**
    New tab opens: storefront with their menu. Owner tests the ordering flow.

**Final state:**
`tenant: ACTIVE` | `setup_progress: 6/6 core flags true` | `10 qr_contexts: ACTIVE` | `user: ACTIVE with TENANT_OWNER role` | `aba_is_enabled: true` (if step 10 completed)

---

### Error Paths — Scenario F

| What goes wrong | What owner sees | What happens |
| --- | --- | --- |
| Invite link already used | "This invitation has already been accepted" | `AUTH_INVITE_USED` (409) |
| Invite link expired (72h TTL) | "This invitation has expired. Contact support." | `AUTH_INVITE_EXPIRED` (410) |
| Invite link garbled | "This invitation link is invalid." | `AUTH_INVITE_INVALID` (400) |
| Owner saves profile but setup flag doesn't update | Support uses `POST /platform/tenants/:id/setup-progress/recalculate` | Platform Admin re-derives all flags from DB (TODO-10) |
| Owner enters wrong ABA account number | ABA payments enabled with incorrect account — payments route to wrong account | MVP includes a micro-transaction verification step: platform sends a 0.01 USD test amount to the supplied account; owner must confirm receipt before ABA payments are enabled for their tenant. |

---

## Scenario G: Tenant Owner — Typical Day (Daily Operations)

- **Who:** Same restaurant owner, now in normal operations.
- **Device:** Laptop or phone.
- **Pre-conditions:** Tenant is ACTIVE, menu is built, at least one table QR is deployed.

### Morning Prep

1. **Owner logs in** to admin portal.
   - `[SYS]` `POST /auth/login` → access token issued.
   - Owner sees: Dashboard — today's order count, revenue summary, active menu items.

2. **Beef just sold out. Owner opens Menu section. Toggles "Beef Amok" availability OFF.**
   - `[SYS]` `PUT /admin/catalog/items/{id}/availability { isAvailable: false }` → `is_available = false`. Redis menu cache invalidated (DEL `menu:{tenantId}`).
   - Owner sees: Item shows "Sold Out" badge.
   - Next customer who loads the menu sees "Beef Amok" greyed out and un-tappable. The + button is hidden on the card.

### Mid-Day: Review Orders

3. **Owner opens Orders section.**
   - `[SYS]` `GET /admin/orders?status=CONFIRMED&sort=created_at&order=desc` → paginated order list.
   - Owner sees: Today's confirmed orders — order number, table, total, timestamp.

4. **Owner clicks an order** for detail.
   - `[SYS]` `GET /admin/orders/{id}` → full order detail including items, bill, payment status.
   - Owner sees: Items ordered, prices, payment method used.

### Afternoon: Invite a New Manager

5. **Owner navigates to Team section. Taps "Invite".**
   - Enters `manager@restaurant.com`, role: Manager.
   - `[SYS]` `POST /admin/team/invite` → invitation created (PENDING, 72h TTL). Email sent.
   - Owner sees: "Invitation sent to manager@restaurant.com."

6. **Manager receives email and accepts.** (Same flow as Scenario F, steps 1–3.)
   - `[SYS]` New user created with `TENANT_MANAGER` role for this tenant.

### Evening: Re-stock

7. **Beef Amok is back. Owner toggles availability ON.**
   - `[SYS]` `is_available = true`. Redis menu cache invalidated.
   - Owner sees: Item shows "Available" again.

**Final state:**
Availability toggled, manager added, orders reviewed — all non-disruptive to live operations.

---

## State Machine — Merchant Portal Entities

| Entity          | States                                                                            | Terminal State            |
| --------------- | --------------------------------------------------------------------------------- | ------------------------- |
| `tenant`        | `DRAFT → ACTIVE → SUSPENDED / ARCHIVED`                                           | `ARCHIVED`                |
| `invitation`    | `PENDING → ACCEPTED / EXPIRED / REVOKED`                                          | `ACCEPTED` / `EXPIRED`    |
| `order_session` | `ACTIVE → CLOSED` (manual, on bill payment, or TTL expiry)                        | `CLOSED`                  |

---

> For the full state machine and cross-actor connections, see `../shared/12-cross-system.md`
