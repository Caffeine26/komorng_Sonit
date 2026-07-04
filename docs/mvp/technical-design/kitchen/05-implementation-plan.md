# KDS Kitchen App — Parallel Implementation Plan

> Co-located with the KDS PRD/UI/API docs so subagents in worktrees can read it from inside the repo.

---

## 1. Context

**Why this plan exists.** The KDS (Kitchen Display System) is one of four XFOS frontends and the linchpin of the MVP "definition of done" — three of the seven required E2E flows depend on it (kiosk order completion, dine-in multi-round, kitchen ticket lifecycle). The PRD (`docs/mvp/technical-design/kitchen/00-prd.md`), UI design (`03-ui-design.md`), and API contracts (`04-api-contracts.md`) are already locked. The monorepo, Prisma schema (`KitchenTicket`, `KitchenTicketEvent`), contracts packages (`contracts/kitchen`, `contracts/bff-kitchen`), and a thin NestJS stub (`backend/api/src/modules/kitchen/`) all exist. **Zero business logic has been written.** This plan turns the locked design into a parallel build by independent subagents using git worktrees, with explicit merge gates so we don't lose throughput to integration thrash.

**Outcome.** A working KDS PWA at `frontend/kitchen` that:
1. Lets `KITCHEN_STAFF` log in (email + password; PIN deferred).
2. Renders a real-time three-column kanban (NEW / PREPARING / READY).
3. Transitions tickets `NEW → PREPARING → READY → COMPLETED|SERVED` via single-tap, with optimistic UI and Socket.io fan-out to all tablets in `tenant_{id}`.
4. Plays a sound on `ticket.new`, escalates card colour by elapsed time, shows reconnect banner on socket loss.
5. Surfaces pending-cash orders for `STALL_KIOSK` and lets staff confirm cash → triggers order `SUBMITTED → PREPARING` chain.
6. Surfaces `staff.callRequested` alerts and lets staff dismiss them.
7. Passes Playwright Scenario E end-to-end against a real Postgres + Redis test stack.

**Non-goals (explicitly deferred).** Multi-station routing, kitchen-manager analytics, PIN login, offline mode, item availability toggles, printer integration, push notifications to customer devices.

---

## 2. Pre-flight (must happen before any track starts)

These are **sequential, single-agent** steps. Do them once on `main`, commit, then fan out.

| # | Action | File(s) |
|---|---|---|
| P1 | Confirm this plan is at `docs/mvp/technical-design/kitchen/05-implementation-plan.md` (it is). | this file |
| P2 | Verify Prisma migrations apply cleanly: `pnpm prisma:migrate dev` against a fresh DB. Confirm `kitchen_tickets`, `kitchen_ticket_events`, `bills`, `payments`, `orders`, `users`, `user_roles` all exist. | `database/prisma/schema.prisma` |
| P3 | Confirm Docker stack boots: `docker compose -f infra/docker-compose.yml up -d postgres redis`. | `infra/docker-compose.yml` |
| P4 | Add a single-line CODEOWNERS entry (or skip) and confirm `pnpm install && pnpm typecheck` is green on `main` before branching. | root |
| P5 | Tag the baseline: `git tag kds-baseline` so worktrees can rebase cleanly. | — |

If P2 reveals schema gaps (e.g. missing `cashConfirmedAt` field on bills), open a tiny PR to fix the schema **before** any track starts. The schema is the contract that blocks everything else.

---

## 3. Track decomposition (parallel-safe)

Each track runs in its own git worktree off `main`. Tracks within the same group can run **fully in parallel**. Groups gate on the previous group's merge.

```
GROUP 1 — Foundations  ──► GROUP 2 — Backend & Frontend  ──► GROUP 3 — Integration
   (A, B serial pair)         (C, D, E, F, G in parallel)         (H, I)
```

### GROUP 1 — Foundations (must merge before Group 2 starts)

#### Track A — Schema hardening & seed data
**Worktree:** `xfos-kds-A-schema`
**Owner subagent:** `everything-claude-code:database-reviewer`
**Inputs:** `database/prisma/schema.prisma`, `docs/mvp/enums-tables-design/tables/postgresql-schema.md`
**Deliverables:**
- Prisma migration adding any missing fields the API contracts require (verify `KitchenTicket.startedAt`/`readyAt`/`completedAt`/`cancelledAt`, `cancellationReason`, all actor FKs already exist — they do per inspection; only add what's truly missing).
- Raw-SQL hardening file `database/prisma/migrations/<ts>_kds_hardening/up.sql` with: partial index for kitchen queue (rush-first FIFO on `status IN ('NEW','PREPARING')`), CHECK constraints for status transitions, partial index on `kitchen_ticket_events(request_id)`.
- Seed script `database/seeds/kds-dev.ts` that creates: 1 tenant, 1 `KITCHEN_STAFF` user, 1 `TENANT_OWNER`, 5 menu items, 3 tables, and 2 in-flight orders with kitchen tickets in different states. **This seed is what every other track tests against.**

**Exit criteria:** `pnpm prisma:migrate dev && pnpm tsx database/seeds/kds-dev.ts` works end-to-end on a fresh DB.

#### Track B — Contracts (Zod schemas)
**Worktree:** `xfos-kds-B-contracts`
**Owner subagent:** `everything-claude-code:typescript-reviewer` + `superpowers:test-driven-development`
**Inputs:** `docs/mvp/technical-design/kitchen/04-api-contracts.md`, existing `contracts/kitchen/index.ts`, `contracts/bff-kitchen/`
**Deliverables (in `contracts/kitchen/index.ts`):**
- `TicketStatus` enum (`NEW | PREPARING | READY | COMPLETED | CANCELLED | SERVED`) — re-export from `contracts/enums`.
- `KitchenTicket` schema (id, tenantId, orderId, ticketNumber, status, serviceModel, tableRef, items, customerNote, createdAt, startedAt, readyAt, completedAt, version).
- `KitchenTicketEvent` schema (append-only).
- Domain commands: `CreateTicketCommand`, `TransitionTicketCommand` (with valid-transition validator), `CancelTicketCommand`.

**Deliverables (in `contracts/bff-kitchen/`):**
- Request/response shapes for every endpoint in `04-api-contracts.md`:
  - `GET /kitchen/tickets?status=…` → `ListTicketsResponse`
  - `PATCH /kitchen/tickets/:id/status` → `TransitionTicketRequest` + `TransitionTicketResponse`
  - `GET /kitchen/pending-cash` → `ListPendingCashResponse`
  - `POST /kitchen/staff-calls/:id/dismiss` → `DismissStaffCallResponse`
  - `GET /auth/me` → `MeResponse`
- Socket event payload schemas: `TicketNewEvent`, `TicketUpdatedEvent`, `StaffCallRequestedEvent`, `CashPendingEvent`, `CashConfirmedEvent`.
- Vitest unit tests proving every Zod schema parses the canonical example from the docs.

**Exit criteria:** `pnpm --filter @xfos/contracts-kitchen build` and `--filter @xfos/contracts-bff-kitchen build` both green; vitest passes.

> **Group 1 merge gate:** A merges first (schema), then B rebases on A and merges. Only then does Group 2 fan out.

---

### GROUP 2 — Build (5 tracks in parallel)

#### Track C — Kitchen domain (hexagonal)
**Worktree:** `xfos-kds-C-domain`
**Owner subagent:** `everything-claude-code:architect` + `superpowers:test-driven-development`
**Inputs:** `docs/mvp/ARCHITECTURE-RATIONALE.md`, `backend/api/src/domains/order/` (mirror its structure)
**Deliverables in `backend/api/src/domains/kitchen/`:**
- `core/entities/kitchen-ticket.entity.ts` — pure TS, Zod-validated, with `transition(to)` method that throws `InvalidStatusTransition` for backward moves. Uses OCC `version`.
- `core/ports/kitchen-ticket.repository.port.ts` — interface only.
- `core/ports/kitchen-event.publisher.port.ts` — `publish(TicketEvent)` interface, infra-agnostic.
- `application/use-cases/`:
  - `list-active-tickets.use-case.ts` (filter by `status IN [NEW,PREPARING,READY]`, ordered by priority desc, createdAt asc)
  - `transition-ticket.use-case.ts` (load → validate transition → persist with optimistic version → write `KitchenTicketEvent` → publish socket event → return new state)
  - `cancel-ticket.use-case.ts`
- `infra/repositories/prisma-kitchen-ticket.repository.ts` — implements port using Prisma; **must** include composite-PK `(tenantId, id)` lookups to enforce tenant isolation.
- `infra/repositories/in-memory-kitchen-ticket.repository.ts` — for unit tests.
- `index.ts` barrel export.

**Tests:** Vitest unit tests for the entity (transition matrix: every valid pair PASS, every invalid pair THROW with the exact error code from `04-api-contracts.md`), use-case tests against in-memory repo.

**Exit criteria:** 100% of transition matrix covered; no Prisma/NestJS/Socket.io imports in `core/`.

#### Track D — Kitchen BFF + WebSocket gateway
**Worktree:** `xfos-kds-D-bff`
**Owner subagent:** `everything-claude-code:typescript-reviewer`
**Inputs:** `docs/mvp/technical-design/kitchen/04-api-contracts.md`, existing `backend/api/src/modules/kitchen/kitchen.module.ts`
**Depends on:** **Reads** Track C's port interfaces from a draft branch (Track D can scaffold against the *port interface* once C lands its core/ folder; no need to wait for full C).
**Deliverables in `backend/api/src/modules/kitchen/`:**
- `api/kitchen.controller.ts` — REST endpoints, all under `/api/v1/kitchen/*`, JWT-guarded with `RolesGuard(['KITCHEN_STAFF', 'TENANT_MANAGER', 'TENANT_OWNER'])`, tenant pulled **only** from JWT (never URL/body). Validates request bodies via `@xfos/contracts-bff-kitchen` Zod schemas.
- `api/kitchen.gateway.ts` — Socket.io `@WebSocketGateway` namespace `/ws`, JWT auth in handshake, joins room `tenant_${tenantId}` on connect. Subscribes to the kitchen domain's `KitchenEventPublisher` and re-emits `ticket.new`, `ticket.updated`, `staff.callRequested`, `cash.pending`, `cash.confirmed`.
- `application/use-cases/list-kitchen-tickets.use-case.ts` (already stubbed — fill in)
- `application/use-cases/get-pending-cash.use-case.ts`
- `application/use-cases/dismiss-staff-call.use-case.ts`
- `infra/socket-event-publisher.ts` — adapter implementing `KitchenEventPublisher` port (Track C) by emitting through the gateway.

**Auth assumptions:** This track **does not** build login itself — it consumes a `JwtAuthGuard` and `RolesGuard` that Track E owns. Stub the guards locally if E hasn't merged yet, then swap in.

**Tests:** Supertest integration tests against an ephemeral NestJS instance + in-memory repos (from Track C) for every REST endpoint. Gateway test: connect with mock JWT, assert room join, assert event re-emit.

**Exit criteria:** `pnpm --filter @xfos/backend-api test` green; manual smoke `curl /api/v1/kitchen/tickets` with seed JWT returns the seeded tickets.

#### Track E — Auth (login, JWT, role guard)
**Worktree:** `xfos-kds-E-auth`
**Owner subagent:** `everything-claude-code:security-reviewer` + `everything-claude-code:typescript-reviewer`
**Inputs:** `docs/mvp/technical-design/kitchen/04-api-contracts.md` §1, `docs/mvp/design-discussions/auth-token-flow.md` (if exists), Prisma `User`, `UserRole`, `RefreshToken`, `UserAuthProvider` models
**Deliverables in `backend/api/src/domains/auth/` and `backend/api/src/modules/auth/`:**
- Domain: `User` aggregate, `verifyPassword(plaintext)` against argon2id hash stored in `UserAuthProvider` (provider=`PASSWORD`).
- BFF endpoints: `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- Issues short-lived (15 min) JWT access tokens carrying `{ sub, tenantId, roles[] }`; refresh token (7d) **stored as SHA-256 hash** in `RefreshToken` table, returned only as `httpOnly` `SameSite=Strict` cookie scoped to `/api/v1/auth/refresh`.
- `JwtAuthGuard` and `RolesGuard` in `backend/api/src/shared/guards/`. RolesGuard checks intersection of `jwt.roles` with required roles.
- Rate limit on `/login`: 5 attempts / 15 min / IP via NestJS Throttler.

**Tests:** Login happy path, wrong password (401 generic), rate-limit 429, refresh rotates token (old hash invalidated), logout deletes refresh hash. Unit + integration.

**Security checklist (must pass):** No raw refresh token in DB; no localStorage on frontend (memory only); generic 401 messages (no user enumeration); argon2id with sane params; tokens signed with `JWT_SECRET` from env, not committed.

**Exit criteria:** `everything-claude-code:security-reviewer` agent passes the changes.

#### Track F — Frontend shell, socket client, design system wiring
**Worktree:** `xfos-kds-F-frontend-shell`
**Owner subagent:** Driven via the `frontend-design:frontend-design` skill, with `everything-claude-code:typescript-reviewer` for review.
**Inputs:** `docs/mvp/technical-design/kitchen/03-ui-design.md`, existing `frontend/kitchen/src/`, `frontend/kitchen/design-system/`
**Deliverables in `frontend/kitchen/`:**
- PWA manifest + service worker (next-pwa) for installability on the tablet.
- `src/lib/api/client.ts` — fetch wrapper with: in-memory access token, automatic 401 → `/api/v1/auth/refresh` retry, Zod-validated responses using `@xfos/contracts-bff-kitchen`.
- `src/lib/realtime/socket.ts` — Socket.io client wrapper that connects on mount, reconnects with exponential backoff, exposes typed `on('ticket.new', …)` etc., and surfaces `connected: boolean` for the banner.
- `src/lib/auth/session-context.tsx` — React context for current user; redirects to `/login` if no session.
- `src/app/[locale]/login/page.tsx` — minimal email + password form per `03-ui-design.md` § Authentication.
- `src/app/[locale]/page.tsx` — board layout shell (header with tenant name + logout, three-column flex container, connection banner mount point).
- Tailwind tokens loaded from `design-system/build-tokens.ts` so the colour system in `03-ui-design.md` is the source of truth.

**No business logic in this track** — empty columns are fine. The next track fills them.

**Exit criteria:** Login → empty board → logout flow works against a running backend; lighthouse PWA score > 90.

#### Track G — Frontend features (board, ticket cards, alerts, sound)
**Worktree:** `xfos-kds-G-frontend-features`
**Owner subagent:** Driven via the `frontend-design:frontend-design` skill.
**Depends on:** **Reads** Track F's `socket.ts` and `client.ts` interfaces. Can scaffold components against typed mocks before F merges.
**Deliverables in `frontend/kitchen/src/features/`:**
- `tickets/TicketBoard.tsx` — three columns (NEW, PREPARING, READY); subscribes to socket events, calls `GET /kitchen/tickets` on mount and on every reconnect.
- `tickets/TicketCard.tsx` — exact anatomy from `03-ui-design.md`: order number, table ref, items list (max 5–6 lines), customer note, elapsed-time chip (re-renders every 30s), action button. Background colour escalates on elapsed time (`<3min` normal, `3-7min` yellow, `>7min` red) **only in NEW column**. READY column has pulse animation.
- `tickets/useTicketTransition.ts` — optimistic transition with rollback on 409 `TICKET_ALREADY_COMPLETED` or 400 `INVALID_STATUS_TRANSITION`.
- Action button label resolves by `serviceModel`: STALL_KIOSK → "Completed", DINE_IN_TABLE → "Served".
- `audio/TicketSoundPlayer.tsx` — plays `/sounds/new-ticket.mp3` on `ticket.new`. Must respect first user-gesture rule (preload on first tap anywhere on board).
- `connection/ConnectionBanner.tsx` — top-fixed red banner shown when socket disconnected.
- `staff-calls/StaffCallAlert.tsx` — modal triggered by `staff.callRequested`; tap to dismiss → `POST /kitchen/staff-calls/:id/dismiss`.
- `i18n/` — Khmer + English bundles for every visible string (next-intl).

**Tests:** Vitest + React Testing Library for TicketCard rendering matrix (status × serviceModel × elapsed-time bucket); Playwright component test for transition optimistic flow.

**Exit criteria:** Manual run with seeded data shows live board updates when a second tab transitions a ticket.

> **Group 2 merge order suggestion:** E first (auth unblocks all guards), then C, then D (depends on C ports, E guards), then F, then G. Tracks C/F can also merge concurrently if they touch disjoint files.

---

### GROUP 3 — Integration & verification

#### Track H — Cash payment confirmation (cross-cutting)
**Worktree:** `xfos-kds-H-cash`
**Owner subagent:** `everything-claude-code:typescript-reviewer`
**Inputs:** `docs/mvp/technical-design/kitchen/04-api-contracts.md` §5 (`POST /billing/bills/:billId/confirm-cash`), Prisma `Bill`, `Payment`
**Deliverables:**
- Backend: `domains/billing/application/use-cases/confirm-cash-payment.use-case.ts` — creates a `Payment` row with `method=CASH`, `status=SUCCEEDED`, transitions bill `OPEN → PAID`, fires `cash.confirmed` socket event, transitions any blocked orders `PENDING_PAYMENT → SUBMITTED` which in turn auto-creates kitchen tickets (reuses Track C's create-ticket use-case).
- BFF: `POST /api/v1/kitchen/bills/:billId/confirm-cash` (lives in kitchen BFF per the doc — convenience for staff at the counter).
- Frontend: `features/cash/PendingCashBar.tsx` — bottom drawer listing `cash.pending` events; tap → confirm dialog → call BFF.

**Tests:** Integration test: `cash.pending` socket → frontend drawer shows order → click confirm → `cash.confirmed` socket fires → backend creates kitchen ticket → ticket appears on the NEW column on a *different* tablet session in the same test.

**Exit criteria:** Full pre-gate cash flow Scenario E error-free.

#### Track I — E2E Playwright suite
**Worktree:** `xfos-kds-I-e2e`
**Owner subagent:** `everything-claude-code:e2e-runner` (or the `superpowers:verification-before-completion` skill)
**Inputs:** `docs/mvp/technical-design/kitchen/01-e2e-scenarios.md` Scenario E
**Deliverables in `frontend/kitchen/tests/e2e/`:**
- `kitchen-ticket-lifecycle.spec.ts` — full Scenario E happy path: storefront submits order → kitchen sees `ticket.new` → tap PREPARING → tap READY → tap Completed/Served → ticket disappears → order auto-transitions to COMPLETED.
- `kitchen-cash-confirm.spec.ts` — Scenario E with `STALL_KIOSK` cash flow (depends on Track H).
- `kitchen-reconnect.spec.ts` — kill socket → banner appears → restore → banner clears → missed `ticket.new` is reflected (rehydrate via `GET /kitchen/tickets`).
- `kitchen-invalid-transition.spec.ts` — backward transition rejected with toast.
- Test fixture spins up Postgres + Redis via testcontainers, seeds with the Track A seed, and starts both backend + kitchen frontend.
- Wire into `.github/workflows/e2e.yml` (or create it) — runs on PR.

**Exit criteria:** Three of the seven MVP E2E flows (kitchen ticket lifecycle, kiosk order completion, dine-in multi-round end-state) pass green in CI.

---

## 4. Subagent dispatch playbook

Run from `main` after Group 1 has merged. One message, multiple `Agent` calls so they go in parallel.

```
Group 2 launch (5 parallel via worktrees):
- Agent(isolation=worktree) C → kitchen domain
- Agent(isolation=worktree) D → kitchen BFF + gateway
- Agent(isolation=worktree) E → auth
- Agent(isolation=worktree) F → frontend shell
- Agent(isolation=worktree) G → frontend features
```

Each subagent prompt **must include**:
1. The path to this plan file (`docs/mvp/technical-design/kitchen/05-implementation-plan.md`) and instructions to read it first plus the relevant section of the KDS doc folder.
2. The track letter, exit criteria, and "do not touch" file globs (e.g. Track C must not edit `frontend/`, Track G must not edit `backend/`).
3. The skills to invoke for that track (listed in §5).
4. A reminder: **TDD-first** for backend tracks (write the contract Zod test or domain entity test before implementation).
5. A reminder: tenant isolation is non-negotiable — `tenantId` always from JWT.
6. Required output: branch name, list of files changed, how to verify locally.

After each track returns, run `everything-claude-code:code-reviewer` (or `code-review:code-review` skill) on its diff before merging to `main`.

---

## 5. Skills to use

| Phase | Skill | Why |
|---|---|---|
| Planning (this step) | `superpowers:writing-plans` | Ensures the plan itself is testable & decomposed. |
| Worktree dispatch | `superpowers:dispatching-parallel-agents` | The orchestration pattern for the 5-track fan-out. |
| Worktree creation | `superpowers:using-git-worktrees` | Each track gets isolated working copy. |
| Backend tracks (C, D, E, H) | `superpowers:test-driven-development` | Domain transitions must have a test matrix written first. |
| Frontend tracks (F, G) | `frontend-design:frontend-design` | Production-grade components matching `03-ui-design.md`. |
| Auth track (E) | `everything-claude-code:security-reviewer` | Token handling, rate limiting, password storage. |
| All backend reviews | `everything-claude-code:typescript-reviewer` | Type safety on the BFF surface. |
| Schema (A) | `everything-claude-code:database-reviewer` | Composite PK, partial indexes, CHECK constraints. |
| E2E (I) | `everything-claude-code:e2e-runner` | Playwright fixtures + CI wiring. |
| Verification before merge | `superpowers:verification-before-completion` | Forces actual test runs, not "should work". |
| Final code review | `code-review:code-review` or `everything-claude-code:code-reviewer` | Independent review per track. |

Optional: `everything-claude-code:claude-devfleet` if you want a single command to spawn the whole Group 2 fleet against the worktrees.

---

## 6. Verification (before declaring KDS done)

Run all of these from `main` after every track merges. **All must pass.**

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test` — all green.
2. `pnpm --filter @xfos/backend-api test:integration` — green against ephemeral Postgres.
3. `docker compose up -d && pnpm tsx database/seeds/kds-dev.ts && pnpm --filter @xfos/frontend-kitchen dev` — manual smoke: log in, board renders, transition tickets, see other tab update via socket.
4. `pnpm --filter @xfos/frontend-kitchen test:e2e` — Track I specs all pass.
5. **Tablet test (real device).** Open the dev URL on an actual Android tablet, install as PWA, run a 30-minute soak: 20 fake orders, all transitions, kill wifi mid-shift, restore. Banner behaves, no double-tickets, no lost transitions.
6. KDS-specific KPIs from the PRD: tap latency < 200ms, sound fires within 500ms of `ticket.new`, board re-renders < 100ms on transition.

If any check fails, fix on a hotfix branch — do not declare done.

---

## 7. Risks & mitigation

| Risk | Mitigation |
|---|---|
| Track D builds against an unstable Track C port | Track C lands its `core/ports/*.ts` interface file as a tiny first PR before filling implementation. D consumes only the interface. |
| Auth track (E) blocks D | D stubs `JwtAuthGuard` locally with a fake user, swaps to E's real guard at merge. |
| Frontend G builds against a backend that isn't deployed | F + G use MSW mocks shaped against `@xfos/contracts-bff-kitchen` until a backend dev stack is up. |
| Worktrees drift from `main` | Each track rebases nightly; merge gates rebase before merging. |
| Khmer rendering breaks on real Android | Tablet test (verification step 5) is non-skippable — it's the only gate that catches it. |
| Sound autoplay blocked by browser policy | Sound player primes on first user gesture (login button click). |
| Cross-tenant ticket leak via socket | Gateway joins ONLY `tenant_${jwt.tenantId}` — tenantId never read from query/body. Add an integration test that connects with tenant A's JWT, attempts to receive tenant B's event, asserts silence. |

---

## 8. Files this plan will create or modify

**Schema (A):**
- `database/prisma/migrations/<ts>_kds_hardening/`
- `database/seeds/kds-dev.ts`

**Contracts (B):**
- `contracts/kitchen/index.ts` (replace stub)
- `contracts/bff-kitchen/index.ts` (replace stub)

**Backend (C, D, E, H):**
- `backend/api/src/domains/kitchen/**`
- `backend/api/src/domains/auth/**`
- `backend/api/src/domains/billing/application/use-cases/confirm-cash-payment.use-case.ts`
- `backend/api/src/modules/kitchen/**` (controller, gateway, use-cases, infra adapter)
- `backend/api/src/modules/auth/**`
- `backend/api/src/shared/guards/{jwt-auth.guard.ts,roles.guard.ts}`
- `backend/api/src/app.module.ts` (wire new modules)

**Frontend (F, G):**
- `frontend/kitchen/src/app/[locale]/{login,page}/**`
- `frontend/kitchen/src/lib/{api,realtime,auth}/**`
- `frontend/kitchen/src/features/{tickets,cash,staff-calls,connection,audio,i18n}/**`
- `frontend/kitchen/public/{manifest.json,sounds/new-ticket.mp3}`

**E2E (I):**
- `frontend/kitchen/tests/e2e/*.spec.ts`
- `.github/workflows/e2e.yml`

---

## 9. Estimated wall-clock (with the recommended parallelism)

- Pre-flight: 30 min
- Group 1 (A + B serial): 2–3 hours
- Group 2 (5 parallel): ~4–6 hours wall-clock (longest track is G/D)
- Group 3 (H + I): 2–3 hours
- Verification + fixes: 1–2 hours

**Total: ~10–14 hours of agent wall-clock**, vs ~30+ hours sequential.
