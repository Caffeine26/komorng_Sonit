# Key Product Decisions — Storefront

This document records the important product and UX decisions made during design, with the rationale behind each. Junior engineers should read this before asking "why is it done this way?" — many answers are here.

---

## Decision 1: No App Installation

**Decision:** The Storefront is a mobile web app, not a native app. There is no install prompt and no manifest.

**Why:** This platform serves many merchants. A customer scans Sok's Kitchen today and Mekong Kitchen tomorrow. Installing a specific restaurant app would lock the customer to one merchant. The QR scan is the right entry point every time — no install required.

**Implication for engineers:** Do not add a `manifest.json` or trigger the "Add to Home Screen" prompt. The native-app feel is achieved through CSS and layout only.

---

## Decision 2: Cart is In-Memory Only

**Decision:** The cart is held in React state and is NOT saved to the browser's local storage. If the page is refreshed, the cart is lost.

**Why:** Ordering sessions at food stalls are short. Persisting the cart adds complexity for a rare edge case. The accepted trade-off is: if you refresh the page, you re-add your items. This was a deliberate scope decision for MVP.

**Implication for engineers:** Do not write cart data to `localStorage`. Only order references (order ID, order number, submitted timestamp) are saved to local storage after a successful submission.

---

## Decision 3: Menu Layout is Auto-Detected

**Decision:** The menu layout (flat grid vs category tabs) is chosen automatically based on how many categories the merchant has. Merchants do not configure this.

**Why:** Merchants shouldn't have to think about layout. The rules are:
- 0–1 categories → flat 2-column grid, no category navigation
- 2+ categories → category tabs at the top

**Implication for engineers:** The layout component reads the category count from the menu response and switches automatically.

---

## Decision 4: Search is Client-Side Only

**Decision:** The search bar filters menu items in the browser, against the data already loaded on app start. There is no search API call.

**Why:** Menu sizes are small enough (typically 10–80 items) that a client-side filter is instant and simpler to build. Server-side search remains deferred (not in MVP scope).

**Technical detail:** `GET /storefront/{tenantId}/menu` returns all items including both `name_km` and `name_en`. The filter runs `.includes()` against the name field for the active locale. There is no `?search=` query param on the menu endpoint.

**Scope rules for client-side search:**
- Searches the active locale only (if the customer is in Khmer mode, the filter runs against Khmer names)
- Typing "Beef" in Khmer mode will NOT match "Beef Lok Lak" — only the Khmer name is searched in that mode

---

## Decision 5: Two Tap Targets on Item Cards

**Decision:** Each item card has two distinct tap zones — the **+** button (quick-add) and the item image (opens detail sheet).

**Why:** Food stall customers don't need to read descriptions for every item — they scan quickly and tap +. But some customers want to see a larger photo or the full description. Both needs are addressed without extra navigation.

**Rules:**
- Tap **+** → item added immediately, no detail sheet
- Tap image → detail sheet slides up
- Tap name or price (for items with no image) → same as tapping the image
- After first add: card shows `− N +` inline controls. Decrement to 0 removes item.

---

## Decision 6: Item Options and Modifiers Are Deferred

**Decision:** The MVP does not support structured item options (size, spice level, add-ons). The workaround is a free-text **notes** field in the cart.

**Why:** Adding options requires changes to: the menu item data model, cart line items, order creation, and the kitchen display. It touches every layer of the system. The free-text notes field is the honest MVP solution.

**Technical gap:** The current schema has no `item_option_groups`, no `item_option_values`, no `cart_items.option_selections`, and `POST /storefront/orders` accepts only `{ menuItemId, quantity, notes }`. There is nowhere yet to store a structured selection like "Spice Level: Medium".

**MVP scope update:** Item options and modifiers are in MVP scope (see PRD §1.3). The engineer must design and add the `item_option_groups`, `item_option_values`, and `cart_items.option_selections` schema before implementing the options picker. See the TODO in `../shared/02-database-schema.md`. The notes field remains as a free-text fallback for requests that don't map to a structured option.

---

## Decision 7: Grid / Browse-All Layout Is Deferred

**Decision:** There is no toggle between a "grid all dishes" view and a category view. The category layout is the only MVP layout.

**Why:** There was no evidence in the scenarios that this solves a real customer pain. Category navigation is a restaurant convention customers already know. Adding two layouts adds maintenance, design, and test surface for no clear benefit at MVP.

---

## Decision 8: Telegram Prompt — Timing Is Fixed

**Decision:** The Telegram opt-in prompt is shown ONLY on the order confirmation screen, NEVER during checkout, cart review, or payment.

**Why:** Showing it during payment creates anxiety and distraction. The confirmation screen is the right moment — the customer has just ordered, they're relieved, and they have a clear reason to want updates.

**Implementation rule:** If the customer has already connected Telegram, do NOT show a browser push notification prompt. They have their notification channel. Avoid double-notifying.

---

## Decision 9: Dine-In Multi-Device — Each Phone Gets Its Own Cart

**Decision:** When two people scan the same table QR, each phone gets its own independent cart and creates its own kitchen ticket. Both orders attach to the same table bill.

**Why:** Shared/merged carts require conflict resolution UX (what if two people add the same item at the same time?), real-time sync, and significant complexity. For MVP, each device orders independently. The bill is shared.

**Implication for engineers:** There is no shared cart state between devices. Each `POST /storefront/orders` creates a separate kitchen ticket but references the same table bill.

---

## Decision 10: Notification Permission — Ask After Order Submission

**Decision:** Do not ask for notification permission on first page load. Ask only after the customer has submitted an order.

**Why:** Browsers suppress permission prompts that fire immediately on page load — users almost always decline. The right moment is after submission, when the customer has a concrete reason: they want to know when their food is ready.

---

## Open Questions (Unresolved at MVP)

These were identified during design review and remain open questions for MVP:

| # | Question | Impact |
|---|---|---|
| 1 | For the Call Staff feature at open-tab stalls (no table number), is "Counter customer" enough context for staff, or should we ask the customer for their name? | Kitchen app UX |
| 2 | Should the My Orders tab show orders only from the current merchant, or from all merchants visited on this device? | Scope of session recovery |
| 3 | Should the onboarding guide show once ever (permanent flag), or once per session at each new merchant visit? | localStorage TTL decision |
