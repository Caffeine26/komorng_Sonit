# Task: Tenant Settings Management & Frontend Sync
**Date**: 2026-05-08 09:04
**Status**: ✅ COMPLETED
**Step**: Final Audit Finished

## 🎯 Objective
Expand the Tenant Domain to be **"Admin-Ready"** by synchronizing all operational and branding attributes with the Admin Frontend. Implement the Merchant Settings Update flow.

## 🛤️ The Sync Path

### Phase 1: Requirement Parity
- [x] **Audit** — Reverse-engineered requirements from `frontend/admin/src/app/[locale]/settings/page.tsx`.
- [x] **Contracts** — Upgraded `TenantSettingsSchema` with 11 new fields (Tax, Currency, Localization).
- [x] **Entity** — Updated `Tenant` entity with `updateSettings()` logic.
- [x] **Mapper** — Updated `TenantMapper` to support full field translation.

### Phase 2: The Update Flow
- [x] **Use Case** — Implemented `UpdateTenantSettingsUseCase` (Domain).
- [x] **Use Case** — Implemented `AdminUpdateSettingsUseCase` (BFF).
- [x] **Controller** — Added `PATCH /api/v1/admin/settings` to the `AdminController`.
- [x] **Wiring** — Connected `TenantModule` to `AdminModule`.

## 🛡️ Invariant Check
- [x] Hexagonal Purity: No Prisma/NestJS in `core/`.
- [x] Security: `tenantId` extracted from JWT context in `PATCH` route.
- [x] Database: Verified `TenantSettings` Prisma table parity.

---
*Verification: [Manager] Signed. [Code-Architect] Signed. [Tester] Signed.*
