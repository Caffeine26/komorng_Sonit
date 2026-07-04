# Storefront — User Flows

These diagrams cover the main paths a customer takes through the app. Each flow is self-contained.

---

## Flow 1 — Kiosk Order Journey

The core ordering flow: scan QR → browse → cart → pay → confirmation.

```mermaid
flowchart TD
    A([Customer scans QR code]) --> B[App loads]
    B --> C{QR valid?}
    C -->|No| D[Show: QR invalid page]
    C -->|Yes| E[Show: Menu with category tabs]

    E --> F[Customer browses menu]
    F --> G{How to add item?}
    G -->|Tap + on card| H[Item added instantly\nCard shows − 1 + controls]
    G -->|Tap item image| I[Detail sheet slides up\nphoto, name, price]
    I --> J[Customer taps Add to Cart]
    H --> K{More items?}
    J --> K
    K -->|Yes| F
    K -->|No| L[Customer taps floating cart button]

    L --> M[Cart summary sheet]
    M --> N{Edit cart?}
    N -->|Yes| F
    N -->|No| O[Customer taps Checkout]

    O --> P[Show: total + payment options]
    P --> Q{Payment method}

    Q -->|Cash| R[Order submitted]
    R --> S[Kitchen receives ticket]
    R --> T[Show: Order received\norder number + pay at counter]

    Q -->|ABA QR| U[Show ABA QR code\n5-minute countdown]
    U --> V{Customer scans in ABA app}
    V -->|Payment confirmed| W[Order confirmed]
    V -->|QR expired| X[Show: expired — Try Again]
    X --> U
    V -->|Payment failed| Y[Show: failed — Try different method]
    W --> S
    W --> Z[Show: Order confirmed\norder number + Track your order link]

    T --> AA{Telegram opt-in prompt}
    Z --> AA
    AA -->|Yes, connect Telegram| AB[Telegram opens\nCustomer taps START]
    AB --> AC[Connected — status updates sent to Telegram]
    AA -->|No thanks| AD([Done])
    AC --> AD
```

---

## Flow 1b — Session Recovery (Browser Closed → QR Rescan)

Customer closed the browser while waiting. They rescan the QR to check their order.

```mermaid
flowchart TD
    A([Customer closed browser while waiting]) --> B[Food still being prepared]
    B --> C([Customer rescans the same QR])
    C --> D[App loads normally]
    D --> E{Are there recent orders saved on this device\nfrom the same stall — within 5 hours?}

    E -->|Yes| F[Show: Recent Orders banner above menu\nwith order number and live status]
    F --> G{Customer action}
    G -->|Tap order row| H[Navigate to order status page\nStatus polling resumes]
    H --> I[Show: live status — Preparing / Ready]
    G -->|Want to order more| J[Browse menu — new empty cart]

    E -->|No — session expired| K[Menu loads normally\nNo banner shown]
```

> If the customer already connected Telegram: they received Preparing and Ready notifications in their Telegram chat — they may not need to rescan at all.

**What's stored on the device:** After each order submission, a slim reference is appended to `localStorage["orders:{tenantId}"]`. Full order details are always fetched from the server — the device only stores enough to know which orders to look up.

```json
[
  { "orderId": "uuid-0042", "orderNumber": "ORD-0042", "submittedAt": "2026-03-25T12:30:00Z" },
  { "orderId": "uuid-0043", "orderNumber": "ORD-0043", "submittedAt": "2026-03-25T12:55:00Z" }
]
```

Rules: entries expire after 5h · max 20 entries per tenant key · cart is NOT in this list (cart is in-memory React state only).

---

## Flow 1c — Telegram Opt-In

Shown after every successful order submission. Never shown during checkout or payment.

```mermaid
flowchart TD
    A([Order confirmed — confirmation screen shown]) --> B{Telegram opt-in prompt\nWant order updates on Telegram?}

    B -->|Yes, connect Telegram| C[Platform generates a one-time link\nButton opens Telegram on customer phone]
    C --> D[Customer taps START — 2 taps total]
    D --> E[Bot confirms: Connected!\nStatus updates will be sent here]
    E --> F[Preparing → Ready → Paid pushed via Telegram\nas status changes happen]

    B -->|No thanks| G([Dismissed — nothing stored\nnot shown again this session])
```

---

## Flow 2 — Dine-In Table Journey

Order now, pay later. Multiple rounds on a single bill.

```mermaid
flowchart TD
    A([Customer scans table QR]) --> B[App loads with Table context shown]
    B --> C[Show: menu]

    C --> D[Browse and add items to cart]
    D --> E[Tap Submit Order]
    E --> F[Order sent to kitchen — no payment screen]
    F --> G[Show: order received, kitchen preparing]

    G --> H{Want to order more?}
    H -->|Yes| I[Tap Order More on confirmation screen\nor rescan the table QR]
    I --> C
    H -->|No| J[Wait for food]

    J --> K[Kitchen marks Ready]
    K --> L[Staff brings food to table]

    L --> M[Continue dining]
    M --> N{Ready to pay?}
    N -->|Yes| O[Customer taps View Bill or asks staff]
    O --> P[Show: itemised bill — all orders combined\nfor this table]

    P --> Q{Payment method}
    Q -->|Cash| R[Pay staff · Staff confirms payment]
    Q -->|ABA QR| S[ABA QR displayed · Customer pays in app]

    R --> T[Show: Thank you! Payment received.]
    S --> T
```

---

## Flow 2b — Open-Tab Stall Journey

Order multiple rounds, no table number, pay once at the end.

```mermaid
flowchart TD
    A([Customer scans stall QR]) --> B[App loads\nNo table context shown]
    B --> C[Show: menu]

    C --> D[Browse and add items]
    D --> E[Tap Submit Order\nNo payment screen]
    E --> F[Order sent to kitchen immediately]
    F --> G[Show: Order sent! + order number]

    G --> H{Telegram opt-in — see Flow 1c}
    H --> I[Wait for food]

    I --> J[Kitchen prepares and serves round]
    J --> K{Want another round?}
    K -->|Yes| L[Tap Order More or rescan QR]
    L --> M{Active session found?}
    M -->|Yes — within 5 hours| C
    M -->|Session expired| N[New session starts\nStaff handles old bill manually]

    K -->|No| O[Tap View Bill]
    O --> P[Show: itemised bill — all rounds combined]
    P --> Q[Customer approaches counter · pays cash]
    Q --> R[Staff confirms payment]
    R --> S[Show: Thank you! Payment received.]
```

---

## Flow 3 — ABA Payment Failure Recovery

What happens when ABA payment doesn't go through.

```mermaid
flowchart TD
    A([Customer at payment screen]) --> B[Selects ABA QR]
    B --> C[QR code displayed]
    C --> D{Customer scans QR}

    D -->|QR expires — 5 minutes| E[Show: QR expired]
    E --> F[Try Again button]
    F --> B

    D -->|Payment declined| G[Show: Payment failed\nTry a different method]
    G --> H{Customer choice}
    H -->|Retry ABA| B
    H -->|Switch to Cash| I[Customer selects Cash]
    I --> J[Order submitted · Pay at counter]

    D -->|Connection drops| K[Show: Checking payment…]
    K --> L[App polls silently for payment status]
    L --> M{Status?}
    M -->|Payment confirmed| N[Order confirmed]
    M -->|Still pending| L
    M -->|Failed| G
```

---

## Flow 4 — Language Switch

Customer can switch between Khmer and English at any point.

```mermaid
flowchart LR
    A[App loaded in default language\nKhmer on first visit] --> B[Customer taps language toggle]
    B --> C{Select language}
    C -->|English| D[All content renders in English]
    C -->|Khmer| E[All content renders in Khmer]

    D --> F{Missing translation for an item?}
    E --> F
    F -->|Yes| G[Show Khmer name as fallback]
    F -->|No| H[Show translated content]
    G --> H

    H --> I[Cart is unchanged during language switch\nNo data re-fetch needed]
```

---

## Customer Pain Points and How We Address Them

| Pain Point | Our Solution |
|---|---|
| "I can't read the menu" | Khmer + English with a one-tap language toggle |
| "I don't know how to pay" | Clear payment method screen, step-by-step ABA QR flow |
| "Did my order actually go through?" | Immediate confirmation screen with order number |
| "The QR didn't work" | Clear error page — not a blank screen |
| "I don't want to create an account" | Guest ordering — no signup, no login |
| "I closed my browser and lost my order" | Rescan the QR → Recent Orders banner → live status |
| "I don't know when my food is ready" | Telegram push notification + in-app banner + vibration |
| "I need help but don't want to shout" | Call Staff bell → kitchen alert card in under 2 seconds |
