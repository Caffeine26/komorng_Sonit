# Task: Tenant Domain Initialization
**Date**: 2026-05-07 16:27
**Status**: ✅ COMPLETED
**Step**: Task Finished

## 🎯 Objective
Establish the **Tenant Domain** (Merchant management) using the **v2.0 Hexagonal Standard**. This provides the source of truth for row-level isolation and platform-wide multi-tenancy.

## 🛤️ The 7-Step Path (v2.0 Compliant)

### Phase 1: The Core (Business Rules)
- [x] **Step 1: Contracts** — Define `tenant.schema.ts` (Zod) in `@xfos/contracts-tenant`. (COMPLETED)
- [x] **Step 2: Core Entity** — Define rich `Tenant` entity in `domains/tenant/core/entities/`. (COMPLETED)
- [x] **Step 3: Core Port** — Define `ITenantRepository` in `domains/tenant/core/ports/`. (COMPLETED)

### Phase 2: The Logic (Use Cases)
- [x] **Step 4: Infra Adapter** — Implement `PrismaTenantRepository` in `domains/tenant/infra/repositories/`. (COMPLETED)
- [x] **Step 5: Domain Use Case** — Implement `CreateTenantUseCase` in `domains/tenant/application/use-cases/`. (COMPLETED)

### Phase 3: The Surface (API & BFF)
- [x] **Step 6: BFF Use Case** — Orchestrate in `modules/platform-admin/application/`. (COMPLETED)
- [x] **Step 7: API Controller** — Define HTTP routes in `modules/platform-admin/api/`. (COMPLETED)

## 🛡️ Invariant Guardrails
- [ ] Layer 1: No NestJS or Prisma imports in `core/`.
- [ ] Layer 3: Mappers used to transform Prisma -> Entity.
- [ ] Multi-tenancy: Composite PK `(tenant_id, id)` verified in Step 4.

---
*Verification: [Manager] Signed. [Code-Architect] Signed.*
