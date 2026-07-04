# Task: Catalog Management System (Backend & API Integration)
**Date**: 2026-05-15 09:11
**Squad Role**: [Manager]
**Status**: IN_PROGRESS

## 🎯 Objective
Implement a robust, normalized backend for Menu Categories and Items (6 tables) and integrate it with the existing Admin UI, strictly following Hexagonal Architecture and the 7-Step Implementation Path.

## 🏛️ [Code-Architect] Schema Audit & Debugging
- [x] Add `icon` and `bannerUrl` to `MenuCategory`.
- [ ] Add `unit` and `costCents` to `MenuItem` (for margin tracking).
- [x] Ensure all 6 tables have `(tenant_id, id)` composite PKs.
- [ ] Implement Custom Icon Registry (Waiting for USER assets).

## 🛤️ [Code-Producer] 7-Step Backend Path
- [x] **Step 1: Contracts (Zod)**
- [x] Step 2-7: MenuItem (Product) Pipeline Implementation
    - [x] Implement MenuItem aggregate entity with image/variant support.
    - [x] Create atomic Prisma repository with nested transaction synchronization.
    - [x] Implement Use Cases: Create, Update, List with category filtering.
    - [x] Wired Admin Catalog UI to real Product API with Liquid Glass aesthetics.
- [x] Custom Icon Registry & Integration
    - [x] Synced all 9 custom 3D icons to the public asset registry.
    - [x] Integrated 3D icons into Category Modal, Manager, and Tabs.
    - [x] Implemented "Toggle" selection logic for better UX.

## 🔗 [Code-Producer] Frontend Integration
- [x] Connect existing `Category` features to the new API.
- [ ] Connect existing `MenuItem` features to the new API.

## ✅ [Tester] Final Checklist
- [ ] Multi-tenant isolation verified.
- [ ] All 6 tables normalized and functional.
- [ ] API Health check passed.
