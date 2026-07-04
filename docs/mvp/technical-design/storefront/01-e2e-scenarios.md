# Customer Journey Scenarios

These are the full step-by-step journeys for each service model, written from the customer's perspective. They describe what the customer does, what they see on screen, and what can go wrong.

> **For technical implementation details** (API calls, database state, webhooks), see `06-api-contracts.md` and the backend architecture docs.

---

## Actors

| Actor | Where They Are |
|---|---|
| **Customer** | Storefront app on their phone |
| **Kitchen Staff** | Kitchen app on a tablet at the stall or restaurant |

---

## Scenario A: Kiosk Order — Cash Payment

**Situation:** A customer at a food kiosk stall. They want to pay cash.

**Starting conditions:**
- A QR code is displayed at the stall
- The menu has items in both Khmer and English
- Both cash and ABA QR are available as payment options

### Steps

1. Customer scans the QR code with their phone camera.  
   → App loads in under 2 seconds. Customer sees the menu with category tabs and a collapsible search bar.

   > `[SYS]` `GET /storefront/context/{qrToken}` → `{ tenantId, serviceModel: STALL_KIOSK, payTiming: PAY_PER_ORDER, defaultLocale: km, paymentMethods: ["ABA_QR", "CASH"] }`. Then `GET /storefront/{tenantId}/menu` served from Redis (5-min TTL). Cart initialised as empty in-memory state.

2. Customer browses the menu. Taps a category. Sees item cards with photo, name, and price.

3. Customer adds items. Two ways to do this:

   **Quick-add:** Tap the **+** button on a card.
   - Item is added instantly.
   - Card switches to show `− 1 +` inline controls.
   - Floating cart button badge updates with the count.

   **Detail view:** Tap the item image.
   - A detail sheet slides up from the bottom: full photo, name in both languages, description, and price.
   - Customer taps **Add to Cart** on the sheet.
   - Sheet dismisses. Cart badge updates.

4. Customer adjusts quantities directly from the menu cards:
   - Tap **+** to add more. Tap **−** to reduce.
   - Reducing to 0 removes the item from the cart.

5. Customer taps the floating cart button.  
   → Cart summary sheet slides up showing all items, quantities, and a subtotal.

6. Customer reviews the cart:
   - To remove an item: tap **−** until quantity reaches 0.
   - If the cart becomes empty: "Your cart is empty." Checkout button is hidden until items are added.

7. Customer taps **Checkout**.  
   → Payment method screen. Two options: **ABA Pay** and **Cash**. Total is shown.

8. Customer selects **Cash**.  
   → Order is submitted. Customer sees:
   *"Order received! ORD-0043. Pay $19.00 at the counter when you pick up."*  
   Order number is shown prominently. Status bar shows: Received → Preparing → Ready.

   > `[SYS]` `POST /storefront/orders` → `order: SUBMITTED`, `bill: UNPAID`. Kitchen ticket created `{ status: NEW }`. WebSocket emits `ticket.new` → room `tenant_{id}` → kitchen app. Order reference stored in `localStorage["orders:{tenantId}"]` with 5h TTL: `{ orderId, orderNumber: "ORD-0043", submittedAt }`.

9. *(Optional — Telegram opt-in)*  
   Below the confirmation: *"Want to receive order updates on Telegram?"*
   - **Yes:** Button opens Telegram. Customer taps START (2 taps total). Connected. Future status updates arrive as Telegram messages.
   - **No:** Prompt dismissed. Not shown again this session.

10. Kitchen receives the ticket and starts preparing.  
    Customer sees status update to **Preparing**.

    > `[SYS]` `PATCH /kitchen/tickets/{id}/status { status: PREPARING }`. Customer polls `GET /storefront/orders/status/{orderId}` every 15–20s and sees the new state on the next tick.

11. Kitchen marks the ticket Ready.  
    Customer sees: **"Your order is ready!"** banner. Device vibrates if supported.  
    **[My Orders]** tab shows a red badge.

    > `[SYS]` `PATCH /kitchen/tickets/{id}/status { status: READY }`. Polling stops after READY is received.

12. Customer approaches the counter, picks up food, and pays the cash amount.  
    Staff confirms cash received in the kitchen app.  
    → Status changes to **Completed**.

    > `[SYS]` `POST /billing/bills/{billId}/confirm-cash` → `bill: PAID`, `kitchen_ticket: COMPLETED`.

**End state:** `order: SUBMITTED` | `bill: PAID` | `kitchen_ticket: COMPLETED`

### What Can Go Wrong

| Situation | What the Customer Sees |
|---|---|
| QR code is invalid or expired | "This QR code is not valid." Full-page error. |
| Restaurant is suspended | "This restaurant is currently unavailable." |
| An item became unavailable after being added to cart | "Sorry, [item] is no longer available. Remove it to continue." Customer must remove the item before proceeding. |
| Connection drops during order submission | "Connection lost. Your order was not sent." Banner shown. Cart stays in memory — but is lost if the page is refreshed. |
| Customer taps Checkout twice (slow connection) | Only one order is created — the system prevents duplicates. |
| Staff tries to confirm cash twice | "This order has already been confirmed." The first confirmation stands. |

---

## Scenario B: Kiosk Order — ABA QR Payment

**Situation:** Same kiosk stall. Customer pays digitally using ABA.

**Starting conditions:** Same as Scenario A.

### Steps

Steps 1–7 are identical to Scenario A (browse, add to cart, tap Checkout).

8. Customer selects **ABA Pay**.  
   → Screen shows:
   - An ABA KHQR payment code
   - An **Open ABA Pay** button (deep link to the banking app)
   - A 5-minute countdown timer

   > `[SYS]` `POST /storefront/orders` → `order: PENDING_PAYMENT`, `bill: UNPAID`. Billing service calls ABA PayWay QR generation API using the platform's merchant credentials. `payment_attempt` created: `{ status: PENDING }`. ABA returns the QR code and a 5-min `expiresAt`.

9. Customer opens their ABA banking app and scans the QR. Confirms payment.  
   → The app checks for payment confirmation every 2 seconds (up to 90 seconds max).  
   → Once confirmed: *"Order confirmed! ORD-0042. Your order is being prepared."*  
   → Order number shown. Link: **Track your order**.

   > `[SYS]` ABA sends `POST /webhooks/aba/callback`. Platform verifies via ABA Check Transaction API. `payment_attempt → SUCCEEDED`, `bill → PAID`, `order → CONFIRMED`. Kitchen ticket created `{ status: NEW }`. WebSocket emits `ticket.new`. Storefront detects confirmation via `GET /billing/bills/{billId}/payment-status` poll.

10. Customer taps **Track your order**.  
    → Order status page shows the progress bar: Received → Preparing → Ready.

11. Kitchen prepares the food. Status advances through each stage.

12. Kitchen marks the ticket Ready.  
    → Customer sees: **"Your order is ready!"** banner + vibration.

13. Customer picks up their order.  
    Staff marks it complete in the kitchen app.

**End state:** `order: CONFIRMED` | `bill: PAID` | `payment_attempt: SUCCEEDED` | `kitchen_ticket: COMPLETED`

### What Can Go Wrong

| Situation | What the Customer Sees |
|---|---|
| ABA QR expires (5 minutes passed without scanning) | "QR code expired." + **Try Again** button. A new QR is generated. |
| ABA payment declined | "Payment failed. Try a different method." Customer can retry or switch to cash. |
| Connection drops during ABA payment | App shows "Checking payment…" and silently retries. Resolves when connectivity returns. |
| ABA check times out (90 seconds) | "QR expired, try again." A new QR is generated. |
| Customer searches for an item and nothing matches | "No items found for '[query]'." + a button to clear the search. |

---

## Scenario C: Dine-In Table — Multiple Rounds, Pay After (Cash)

**Situation:** A group dining at a restaurant table. They'll order in rounds and pay at the end.

**Starting conditions:**
- A printed QR code is on the table
- Service model is dine-in: order freely, pay later

### Steps

1. Customer 1 scans the Table 5 QR code.  
   → App loads. Menu appears with **"Table 5"** shown at the top.

2. Customer 1 adds items and taps **Submit Order**.  
   → No payment screen. Confirmation: *"Order submitted! Kitchen is preparing your food."*

3. Customer 2 scans the same QR from their own phone.  
   → They see the same menu with Table 5 context. They have their own empty cart. They can order independently.

4. Kitchen prepares and serves the first round.

5. Group wants a second round.  
   Customer 1 taps **Order More** on the confirmation screen, or rescans the same QR.  
   → Menu appears. They add new items and tap **Submit Order**.  
   → A second ticket goes to the kitchen.

6. End of meal. Customer taps **View Bill**.  
   → An itemised bill shows every order placed at Table 5 — from all phones — combined into one total.

7. Customer tells staff they're paying cash. Staff collects payment and confirms.  
   → Customer sees: *"Thank you! Payment received."*

**End state:** Multiple rounds completed, single bill paid.

### What Can Go Wrong

| Situation | What Happens |
|---|---|
| A different group scans the same table QR after 4 hours | Previous session has expired. New session and new bill start fresh. |
| Two customers at the same table submit orders at the exact same time | Both orders go through. Separate kitchen tickets. Same bill. No conflict. |
| An item became unavailable between adding and submitting | Error shown. Customer removes the item and resubmits. |
| Connection drops during submit | Offline banner. Cart stays in memory but is lost if the page is refreshed. |
| Staff tries to confirm cash twice | "This bill has already been paid." First confirmation stands. |

---

## Scenario D: Dine-In Table — Pay After with ABA

**Situation:** Same dine-in setup, but customer pays digitally with ABA at the end.

### Steps

Steps 1–5 are identical to Scenario C (scan QR, order in rounds, eat).

6. End of meal. Customer taps **View Bill**.  
   → Bill shows all orders for the table. Two buttons: **Pay with ABA** and **Pay with Cash**.

7. Customer taps **Pay with ABA**.  
   → ABA QR code displayed. 5-minute countdown.

8. Customer scans the QR in their ABA app and confirms.  
   → App detects payment. Shows: *"Payment received. Thank you!"*

**End state:** Meal complete, paid digitally.

### What Can Go Wrong

Same ABA errors as Scenario B, plus:

| Situation | What Happens |
|---|---|
| Two people try to pay the same bill at the same time | The first payment goes through. The second sees "This bill has already been paid." |

---

## Scenario I: Open-Tab Stall — Multiple Rounds, Pay After

**Situation:** Customer at a Cambodian food stall. No formal table number. They order across multiple rounds and pay once at the end.

**Starting conditions:**
- One QR code at the stall entrance or counter
- Cash payment only (in this scenario)

### Steps

1. Customer scans the stall QR.  
   → App loads. Menu appears. No table number shown (this is a counter stall, not a table).

2. Customer browses and adds items.

3. Customer taps **Submit Order**.  
   → No payment screen — payment is deferred to the end of the visit.  
   → Customer sees: *"Order sent to kitchen!"* with the order number.

4. *(Optional)* Telegram opt-in prompt appears below the confirmation. Customer connects or skips.

5. Kitchen prepares and serves the first round.

6. Customer wants another round.  
   Taps **Order More** (on the confirmation screen) or rescans the same QR.  
   → Same tab, same running bill. Adds items and submits again.

7. End of visit. Customer taps **View Bill**.  
   → Itemised bill shows all rounds combined. Total shown. *"Pay at the counter"* instruction.

8. Customer approaches the counter and pays cash. Staff confirms.  
   → Customer sees: *"Thank you! Payment received."*

**End state:** All rounds complete, single bill paid.

### What Can Go Wrong

| Situation | What the Customer Sees |
|---|---|
| Session expires (5 hours) before paying | Rescanning starts a new session and a new bill. Staff handles the old outstanding bill manually. |
| Customer closes the browser mid-session | Rescanning shows "Recent Orders" with previous rounds listed. Customer can tap in to check status. |
| Connection drops during submit | Offline banner. Cart stays in memory but is lost if the page is refreshed. |

---

## Notes That Apply to All Scenarios

**Cart is always in-memory.** It is not saved if the page is refreshed. This is a known MVP trade-off — ordering sessions are short, and most customers won't refresh mid-session.

**Session recovery.** If the customer closes the browser and rescans within the session window (4–5 hours), their recent orders appear at the top of the menu. They can tap into any order to check its live status.

**Telegram.** Once connected after any order, all future status updates for that visit are pushed to the customer's Telegram chat. Customers who have Telegram connected rarely need to check the app for status.

---

## State Machine Reference

Key entity states across all scenarios. Terminal states are the final resting state after a session completes.

| Entity | States | Terminal |
|---|---|---|
| `order` | `PENDING_PAYMENT → CONFIRMED` (ABA) or `SUBMITTED` (cash/dine-in) or `CANCELLED` | `CONFIRMED` / `CANCELLED` |
| `bill` | `UNPAID → PENDING_PAYMENT → PAID` | `PAID` / `VOIDED` |
| `kitchen_ticket` | `NEW → PREPARING → READY → COMPLETED` | `COMPLETED` / `CANCELLED` |
| `payment_attempt` | `PENDING → SUCCEEDED / FAILED / EXPIRED` | `SUCCEEDED` / `FAILED` |
| `order_session` | `ACTIVE → CLOSED` (on bill payment or 4–5h TTL expiry) | `CLOSED` |
| `customer_telegram` | `PENDING_CONNECT → CONNECTED → OPTED_OUT` | `OPTED_OUT` |

## Real-Time Connections

| Event | How the update travels |
|---|---|
| Customer submits order | WebSocket `ticket.new` → kitchen app (< 2s) |
| Kitchen marks READY | Polling on customer status page picks it up within 15–20s |
| ABA webhook fires | Platform verifies → customer payment-status poll resolves (within 2s poll cycle) |
| Merchant toggles item off | Customer sees item greyed out after menu cache expires (max 5 min) |
| Telegram connected | Bot message pushed in parallel to status page poll |
