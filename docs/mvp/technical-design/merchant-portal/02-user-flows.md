# Merchant Portal — User Flows

## Actors

| Actor | Surface | Goal |
|---|---|---|
| **End Customer** | Storefront (mobile web) | Order food, pay |
| **Kitchen Staff** | Kitchen App (tablet) | Receive and fulfill orders |
| **Merchant Owner** | Tenant Admin Portal | Configure and manage restaurant |
| **Sales/Ops Team** | Platform Admin Portal | Onboard and manage merchants |

---

## Flow 4 — Merchant Owner: Initial Setup Journey

### Setup Checklist Progress (6 steps — source of truth)

```
Step 1: Business Profile ── Name, logo, description ──── ○
Step 2: Service Model    ── Kiosk or Dine-In ─────────── ○
Step 3: Menu             ── Add categories + items ────── ○
Step 4: Translations     ── Khmer + English content ───── ○
Step 5: QR Codes         ── Generate and print ──────────── ○
Step 6: Go Live!         ── All steps complete ──────────── ✓
```

> Note: Payment method configuration (cash / ABA QR) is part of MVP setup. See PRD §1.2.1 and `shared/10-aba-payment.md`.
> See `../shared/11-design-system.md` for the UI specification of this checklist and the Go Live celebration state.

### Setup Flow

```mermaid
flowchart TD
    A([Merchant receives invite email]) --> B[Clicks invite link]
    B --> C[Set password screen]
    C --> D[Admin portal dashboard]
    D --> E[Setup progress widget:\n0/6 complete]

    E --> F[Complete Business Profile]
    F --> G[Set service model: KIOSK or DINE-IN]
    G --> H[Add menu categories]
    H --> I[Add menu items with prices]
    I --> J[Add Khmer translations]
    J --> K[Generate QR codes]
    K --> L{Dine-in?}
    L -->|Yes| M[Generate QR per table]
    L -->|No| N[Generate storefront QR]
    M --> O[Download + print QR codes]
    N --> O
    O --> P[Setup: 6/6 complete]
    P --> Q[Show: storefront is LIVE celebration banner]
    Q --> R[Storefront goes LIVE]
```

---

## Flow 5 — Merchant Owner: Daily Menu Management

```mermaid
flowchart TD
    A([Merchant logs in]) --> B[Dashboard]
    B --> C[Go to Menu section]

    C --> D{Action needed}

    D -->|Mark item sold out| E[Find item]
    E --> F[Toggle availability OFF]
    F --> G[Item shown as SOLD OUT on storefront immediately\ngrayed out, not tappable — see 16-design-system.md]

    D -->|Add new item| H[Click Add Item]
    H --> I[Enter EN name + price]
    I --> J[Enter KH translation]
    J --> K[Add image optional]
    K --> L[Save → Item visible on storefront]

    D -->|Edit price| M[Find item]
    M --> N[Update price]
    N --> O[Save → New price applies to new orders]

    D -->|Change category order| P[Drag categories to reorder]
    P --> Q[Save → Storefront reflects new order]
```

---

## User Journey: Emotions and Pain Points

### Merchant Owner Pain Points

| Pain Point | Our Solution |
|---|---|
| "Setting up is confusing" | Step-by-step setup checklist with progress |
| "I changed a price and broke something" | Validation before save, preview available |
| "I need to mark an item sold out quickly" | One toggle, instant effect |
| "I don't know if my storefront is live" | Dashboard shows storefront status clearly |
