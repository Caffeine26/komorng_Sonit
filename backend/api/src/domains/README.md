# Domains

Each folder here is a bounded context organized as **four hexagonal layers**:

```
<domain>/
├── core/            ← pure TypeScript, no framework, no ORM, no transport
│   ├── entities/
│   ├── value-objects/
│   ├── services/
│   ├── events/
│   ├── ports/       ← interfaces the use cases depend on
│   └── errors/
├── application/     ← use cases — orchestrators only
│   ├── use-cases/
│   ├── queries/
│   └── handlers/    ← event → use case (translators, no logic)
├── infra/           ← adapters — Prisma, Redis, Socket.io, HTTP clients
│   ├── repositories/
│   ├── gateways/
│   └── mappers/
└── api/             ← NestJS controllers, DTOs, the ONE module exported to app.module.ts
    ├── controllers/
    ├── dto/
    └── <domain>.module.ts
```

See `order/README.md` for the fully expanded reference. Scaffold new domains with:

```bash
pnpm create-domain <name>
```

The four invariants from `docs/mvp/folder_structure_and_decision.md` §1 are
enforced by the per-layer ESLint rules in `backend/api/.eslintrc.cjs`.
