# modules/ — BFF layer (one per browser frontend)

This folder contains the **BFF modules**: one NestJS module per browser
frontend. See ADR-008 in
`docs/playbook/technical-design/shared/09-decisions-adrs.md`.

## Layout

```
modules/
├── storefront/         BFF for frontend/storefront     → /api/v1/storefront/*
├── kitchen/            BFF for frontend/kitchen        → /api/v1/kitchen/*
├── admin/              BFF for frontend/admin          → /api/v1/admin/*
└── platform-admin/     BFF for frontend/platform-admin → /api/v1/platform-admin/*
```

Each BFF module follows the same shape:

```
modules/<bff>/
├── api/<bff>.controller.ts        Thin HTTP layer — validate, call use case, return
├── application/use-cases/         BFF orchestration use cases
└── <bff>.module.ts                Wires the controller, use cases, and imports the
                                   domain modules whose use cases it calls
```

## Two non-negotiable rules

1. **BFF modules own NO entities or business rules.** They are pure
   orchestration. Real business logic lives in `domains/<X>/core/` and is
   exposed via `domains/<X>/application/use-cases/`. The BFF use case calls
   the domain use case via DI — never via HTTP.

2. **Browser frontends call ONLY their BFF.** The frontend never imports
   `@xfos/contracts-{order,catalog,billing,...}` — only
   `@xfos/contracts-bff-<app>`. Enforced by ESLint in each frontend's
   `.eslintrc.cjs`.

## Why one BFF per frontend?

Each browser surface has different needs:

- **storefront** is mobile-first, customer-facing, no accounts. Endpoints
  return UI-projected data (no merchant cost/margin fields).
- **kitchen** is a tablet PWA. Endpoints return ticket projections (item
  names + quantities + special requests, not pricing).
- **admin** is the merchant portal. Endpoints return dense merchant data
  (cost, margin, audit fields).
- **platform-admin** is internal ops. Endpoints span tenants.

Sharing one BFF would force all four UIs into the same shape, which is
how UI bloat starts. Four BFFs = four independent contracts that can
evolve at different speeds.

## How a BFF use case calls a domain use case

```ts
// modules/storefront/application/use-cases/submit-storefront-order.use-case.ts
@Injectable()
export class SubmitStorefrontOrderUseCase {
  constructor(
    // ↓ Imported from OrderModule via StorefrontModule.imports
    private readonly submitOrderUseCase: SubmitOrderUseCase,
  ) {}

  async execute(input: StorefrontSubmitOrderRequest): Promise<StorefrontSubmitOrderResponse> {
    const order = await this.submitOrderUseCase.execute({
      tenantId: ...,
      items: ...,
    });
    return projectToCustomerShape(order);
  }
}
```

The same `SubmitOrderUseCase` is also called by `OrderController`
(`/api/v1/internal/order/*`) for internal tools. Both go through the
**same** use case — same invariants, same events, same audit trail.
The only difference is the HTTP envelope and the auth model.

## Adding a new BFF use case

1. Add the request/response Zod schemas to
   `contracts/bff-<bff>/<endpoint>.schema.ts` and re-export from `index.ts`.
2. Create the BFF use case in
   `modules/<bff>/application/use-cases/<name>.use-case.ts`. Inject the
   domain use cases it needs via constructor.
3. Add a controller route in `modules/<bff>/api/<bff>.controller.ts` that
   validates with `ZodValidationPipe`, calls the use case, and returns.
4. Provide the use case in `modules/<bff>/<bff>.module.ts`.
5. Update the frontend's `lib/api/<bff>.ts` to add the new typed call.
