# XFOS — Reference GitHub Repos for DDD + Hexagonal Architecture

**Audience:** XFOS engineers.
**Purpose:** External reference implementations to study while learning the XFOS target structure (see [`folder_structure_and_decision.md`](./folder_structure_and_decision.md)).
**How to use this list:** Read Tier 1 first. Don't copy code — copy **patterns**. The exact persistence, framework, and scope choices in these repos differ from XFOS.

---

## 🥇 Tier 1 — Study these first (direct NestJS + TypeScript match)

| Repo | Why it matters |
|---|---|
| **[Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon)** | The de-facto reference for DDD + hexagonal in NestJS/TS. Includes a full written guide (folder layout, naming, anti-patterns). Best single thing to read. ~12k+ stars. |
| **[CodelyTV/typescript-ddd-example](https://github.com/CodelyTV/typescript-ddd-example)** | Canonical TS DDD example from the Codely team (they teach DDD courses professionally). Pure TypeScript — no NestJS — so good for understanding **patterns without framework noise**. |
| **[CodelyTV/typescript-ddd-skeleton](https://github.com/CodelyTV/typescript-ddd-skeleton)** | Starter / skeleton version of the above. Useful for seeing the bare-bones layout. |

---

## 🥈 Tier 2 — Smaller, approachable NestJS examples

| Repo | Notes |
|---|---|
| **[dasaco/nestjs-ddd-clean-architecture-example](https://github.com/dasaco/nestjs-ddd-clean-architecture-example)** | Companion repo to a conference talk. Good first read — smaller scope than Sairyss. |
| **[alexgrabulosapuertasdev/hexagonal-architecture-ddd-nest](https://github.com/alexgrabulosapuertasdev/hexagonal-architecture-ddd-nest)** | Compact NestJS hexagonal example. |
| **[ecaminero/nestjs-ddd](https://github.com/ecaminero/nestjs-ddd/tree/hexagonal-architecture)** | Check the `hexagonal-architecture` branch specifically. MongoDB integration; small enough to read in one sitting. |
| **[tim-hub/nestjs-hexagonal-example](https://github.com/tim-hub/nestjs-hexagonal-example)** | Ports/adapters in NestJS with explanatory README. |
| **[ogranada/nestjs-hex](https://github.com/ogranada/nestjs-hex)** | DDD + Ports & Adapters base project for NestJS. |

---

## 🥉 Tier 3 — Other languages, same ideas (concepts only — don't copy code)

| Repo | Language | Why |
|---|---|---|
| **[ivanpaulovich/hexagonal-architecture-acerola](https://github.com/ivanpaulovich/hexagonal-architecture-acerola)** | .NET Core | Exceptionally well-documented. Best *explanation* of the pattern regardless of language. |
| **[JonathanM2ndoza/Hexagonal-Architecture-DDD](https://github.com/JonathanM2ndoza/Hexagonal-Architecture-DDD)** | Spring Boot (Java) | Clear layer separation, worth a glance. |
| **[dahromy/symfony-hexagonal-architecture](https://github.com/dahromy/symfony-hexagonal-architecture)** | PHP / Symfony | Keeps it deliberately simple — useful counter-example against over-engineering. |
| **[jkonowitch/hex-effect](https://github.com/jkonowitch/hex-effect)** | TypeScript + Effect | Functional-programming flavor of hexagonal. Interesting but *different paradigm* — do not copy into XFOS. |

---

## ⚠️ Warnings before you copy anything

Two of the most-starred repos will tempt you to over-engineer XFOS MVP. Read them for concepts, **not for scope**.

1. **[bitloops/ddd-hexagonal-cqrs-es-eda](https://github.com/bitloops/ddd-hexagonal-cqrs-es-eda)** — adds **CQRS + Event Sourcing + Event-Driven Architecture** on top of DDD. Useful as advanced reading, but XFOS MVP does **not** need CQRS or event sourcing. A single `OrderRepository` backed by Prisma is fine. Look at the layer split; ignore the CQRS/ES parts.

2. **[Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon)** — uses **Slonik** (raw SQL), not Prisma. The *architecture* translates cleanly; the *persistence code* does not. Adapt, don't copy verbatim. XFOS uses Prisma as the single source of truth for DB schema.

---

## 🎯 Suggested reading path (≈ 3 hours)

1. **Sairyss/domain-driven-hexagon** — README + folder tree. (~1 hour)
   - Focus: the four layers, naming conventions, domain event pattern.
   - Skip: Slonik-specific persistence code.
2. **dasaco/nestjs-ddd-clean-architecture-example** — code walk-through. (~30 min)
   - Focus: seeing the pattern at a smaller, digestible scale.
3. **CodelyTV/typescript-ddd-example** — full repo skim. (~1 hour)
   - Focus: the patterns without NestJS noise. Value objects, aggregates, repositories.
4. Open `xfos/backend/api/src/domains/` scaffold.
   - After the above, the XFOS structure should look obvious.
5. Read [`folder_structure_and_decision.md`](./folder_structure_and_decision.md) §1, §12, §12.3a.
6. Then start the audit of `xfos/backend/api/src/domains/` against §12.3a.

---

## What XFOS adapts vs. what XFOS skips

When you see a pattern in these repos, use this table to decide whether to apply it to XFOS MVP:

| Pattern | XFOS MVP stance |
|---|---|
| Four hexagonal layers (`core/application/infra/api`) | **Yes — mandatory** |
| Aggregates + value objects | **Yes** where it clarifies domain invariants (Order, Bill, Ticket) |
| Repositories abstracted behind interfaces | **Yes** — Prisma lives only in `infra/` |
| Domain events for cross-aggregate effects | **Yes** (in-process event emitter, not a message bus) |
| Use-case per business action | **Yes** — `SubmitOrderUseCase`, `AcceptTicketUseCase`, etc. |
| CQRS (separate read and write models) | **No** at MVP — YAGNI |
| Event Sourcing | **No** at MVP — we persist state, not events (except for audit/status history tables) |
| Message bus / Kafka / external broker | **No** — BullMQ covers our queue needs |
| Multiple bounded contexts in separate services | **No** — single NestJS monolith, modules only |
| Full CI DDD tactical patterns (specifications, factories, domain services) | **Only where they pay off.** Don't build abstractions ahead of need. |

---

## External reading (not required, helpful)

- [Domain-Driven Hexagon — guide (DEV article)](https://dev.to/sairyss/domain-driven-hexagon-18g5) — the written companion to the Sairyss repo.
- [Hexagonal Architecture and Domain Driven Design (DEV article)](https://dev.to/onepoint/hexagonal-architecture-and-domain-driven-design-fio)
- [`hexagonal-architecture` topic on GitHub](https://github.com/topics/hexagonal-architecture) — browse for more examples if curious.

---

## Cross-references

- [`folder_structure_and_decision.md`](./folder_structure_and_decision.md) — authoritative XFOS structure (wins over anything here).
- [`technical-design/shared/09-decisions-adrs.md`](./technical-design/shared/09-decisions-adrs.md) — why we chose hexagonal + modular monolith over alternatives.
- [`ARCHITECTURE-RATIONALE.md`](./ARCHITECTURE-RATIONALE.md) — why DDD + Hexagonal is the right architecture for XFOS specifically.
