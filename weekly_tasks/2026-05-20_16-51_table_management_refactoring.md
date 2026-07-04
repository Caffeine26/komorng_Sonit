# Task: Table Management Refactoring (Hexagonal & DDD Isolation)
**Date**: 2026-05-20 16:51
**Squad Role**: [Manager]
**Status**: COMPLETED

## 🎯 Objective
Migrate the newly built Table & FloorPlan capabilities from direct controllers into a dedicated, isolated domain `domains/table` on the NestJS backend, conforming strictly to Hexagonal layers, Domain-Driven Design (DDD) aggregates, and the 7-Step Implementation Path, while correcting the S3 image upload path.

---

## 🗺️ High-Level Roadmap & Architectural Brief

### 1. The Root Cause of the 404 Upload Error
The S3 upload controller in NestJS is located at `@Controller('admin/menu/media')` with the endpoint `@Post('upload')`. We were trying to call `admin/catalog/upload` (which doesn't exist).

* **The Fix**: We will update the S3 upload destination in `TableFormModal.tsx` to the correct path:
  `/api/v1/admin/menu/media/upload`

### 2. Architectural Restructuring to `domains/table/`
To meet the strict Hexagonal Architecture and Domain-Driven Design (DDD) standards, we will move all core business operations into a brand new dedicated backend folder: `/backend/api/src/domains/table/`.

This folder will house:
* 🏛️ **`core/entities/table.entity.ts`**: Pure domain entity containing seating, status, and photo validations.
* 🔌 **`core/ports/table.repository.ts`**: Port interface describing standard table queries.
* 📦 **`infra/adapters/prisma-table.repository.ts`**: Prisma data repository implementing composite key operations.
* ⚙️ **`application/use-cases/`**: Six highly isolated, atomic business use cases:
  * `get-tables.use-case.ts` (with built-in dynamic self-healing)
  * `create-table.use-case.ts` (with auto-provisioned floor plan & unguessable QR tokens)
  * `update-table.use-case.ts`
  * `delete-table.use-case.ts` (safe soft-deletes)
  * `track-print.use-case.ts` (increments database layout prints counters)
* 🧩 **`table.module.ts`**: NestJS domain module wiring up ports, use cases, and repositories.
* ⚡ **`table.controller.ts`**: Reduced to a thin gateway that delegates incoming HTTP requests directly to our clean application use cases.

---

## 🏛️ [Code-Architect] Schema & Purity Audit
- [x] Maintain pure TS only (no NestJS/Prisma imports) inside `domains/table/core/entities/table.entity.ts`.
- [x] Define repository port interfaces strictly inside `domains/table/core/ports/table.repository.ts`.
- [x] Verify composite key `(tenantId, id)` mapping in `prisma-table.repository.ts`.

## 🛤️ [Code-Producer] 7-Step Backend Path
- [x] **Step 1: Contracts (Zod validation schemas)**
- [x] **Step 2: Core Entity (`table.entity.ts` pure business logic)**
- [x] **Step 3: Core Port (`table.repository.ts` repository interface)**
- [x] **Step 4: Infra Adapter (`prisma-table.repository.ts` Prisma adapter)**
- [x] **Step 5: Domain Use Cases**:
    - [x] `get-tables.use-case.ts` (with built-in self-healing QR checks)
    - [x] `create-table.use-case.ts` (with auto-provisioned floor plan & unguessable QR tokens)
    - [x] `update-table.use-case.ts` (mapping photo banners to `area` column)
    - [x] `delete-table.use-case.ts` (soft-deleting tables & deactivating QRs with `MERCHANT_DISABLED` deactivation reason)
    - [x] `track-print.use-case.ts` (incrementing printed placard counters)
- [x] **Step 6: BFF/NestJS Domain Module Integration (`table.module.ts`)**
- [x] **Step 7: API Controller (`table.controller.ts` reduced to a thin HTTP router)**

## 🔗 [Code-Producer] Frontend Integration
- [x] Correct the S3 upload endpoint inside `TableFormModal.tsx` to call the active route: `/api/v1/admin/menu/media/upload`.

## ✅ [Tester] Final Checklist
- [x] Multi-tenant isolation verified (each Prisma query strictly scoped to `tenantId`).
- [x] Flawless NestJS compile-build check passed.
- [x] Flawless Next.js static page compilation passed.
- [x] S3 image upload successfully tested.
