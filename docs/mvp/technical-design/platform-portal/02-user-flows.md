# Platform Portal — User Flows

## Actors

| Actor | Surface | Goal |
|---|---|---|
| **End Customer** | Storefront (mobile web) | Order food, pay |
| **Kitchen Staff** | Kitchen App (tablet) | Receive and fulfill orders |
| **Merchant Owner** | Tenant Admin Portal | Configure and manage restaurant |
| **Sales/Ops Team** | Platform Admin Portal | Onboard and manage merchants |

---

## Flow 6 — Sales Team: Merchant Onboarding

```mermaid
flowchart TD
    A([Sales team closes deal]) --> B[Open Platform Admin]
    B --> C[Create merchant record:\nname, email, plan]
    C --> D[Confirm commercial agreement]
    D --> E[Click Provision Tenant]
    E --> F{Provisioning succeeds?}

    F -->|Yes| G[Tenant created in DRAFT status]
    G --> H[Click Invite Merchant Owner]
    H --> I[Merchant receives email invite]
    I --> J[Merchant sets up account]
    J --> K[Merchant completes setup steps]
    K --> L[Tenant goes ACTIVE]
    L --> M[Merchant is live ✓]

    F -->|Error| N[Show provisioning error]
    N --> O[Internal team investigates]
    O --> E
```
