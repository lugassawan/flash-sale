# Design Decisions & Trade-offs

This document captures key design decisions made during implementation, deviations from the original plan, and the rationale behind each choice.

---

## Table of Contents

1. [PR Roadmap: Plan vs Reality](#1-pr-roadmap-plan-vs-reality)
2. [Architectural Decisions](#2-architectural-decisions)
3. [Technology Choices](#3-technology-choices)
4. [Testing Strategy Trade-offs](#4-testing-strategy-trade-offs)
5. [Bottleneck Mitigations](#5-bottleneck-mitigations)
6. [Security & Traffic Management](#6-security--traffic-management)

---

## 1. PR Roadmap: Plan vs Reality

The original plan specified 16 PRs. The actual implementation required 19 PRs due to additional tooling and configuration work discovered during development.

### Planned vs Actual PR Mapping

| Planned PR | Planned Title                        | Actual PR | Actual Title                                           | Notes                                                                         |
| ---------- | ------------------------------------ | --------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| PR1        | Monorepo scaffold + tooling          | PR#1      | Technical documentation                                | Docs shipped first to establish shared understanding                          |
| —          | —                                    | PR#2      | Monorepo scaffold + tooling + shared types             | Original PR1 scope, renumbered                                                |
| PR2        | Docker infrastructure                | PR#4      | Docker infrastructure + env config                     | Aligned with plan                                                             |
| PR3        | NestJS app shell + shared HTTP infra | PR#5      | NestJS app shell + config + health + shared HTTP infra | Shared HTTP infra (filters, interceptors, middleware) bundled here as planned |
| PR4        | Domain layer                         | PR#6      | Domain layer (entities, VOs, events, services, errors) | Single monolithic PR as planned                                               |
| PR5        | Application layer                    | PR#7      | Application layer (use cases, ports, DTOs)             | Aligned with plan                                                             |
| PR6        | Redis infrastructure + Lua scripts   | PR#8      | Redis infrastructure + Lua scripts                     | Aligned with plan                                                             |
| PR7        | PostgreSQL + BullMQ                  | PR#9      | PostgreSQL + BullMQ infrastructure                     | Combined as planned                                                           |
| PR8        | Public API endpoints                 | PR#10     | Public API endpoints (sale + purchase)                 | Aligned with plan                                                             |
| PR9        | Admin endpoints + auth guard         | PR#11     | Admin endpoints + auth guard                           | Aligned with plan                                                             |
| PR10       | SSE + cron + reconciliation          | PR#12     | SSE events + state cron + reconciliation wiring        | Grouped as planned                                                            |
| PR11       | Cross-cutting concerns               | PR#13     | Cross-cutting: rate limiting, logging, observability   | Aligned with plan                                                             |
| PR12       | Frontend SPA                         | PR#15     | Frontend SPA                                           | Aligned with plan                                                             |
| PR13       | E2E tests (Playwright)               | PR#16     | E2E tests (Playwright)                                 | Aligned with plan                                                             |
| PR14       | Stress tests (k6)                    | PR#14     | Stress tests (k6)                                      | Shipped before frontend (order swap)                                          |
| PR15       | CI/CD pipeline                       | PR#19     | CI/CD pipeline                                         | Aligned with plan                                                             |
| PR16       | Documentation + README               | This PR   | Documentation + README                                 | —                                                                             |
| —          | —                                    | PR#3      | Add .romba.toml to .gitignore                          | Unplanned chore                                                               |
| —          | —                                    | PR#17     | .env.example files + configurable Vite                 | Unplanned chore                                                               |
| —          | —                                    | PR#18     | Migrate ESLint 8 → 9 flat config                       | Unplanned chore                                                               |

### Key Deviations

**1. Documentation-first approach (PR#1)**

The plan assumed code-first. In practice, shipping technical documentation (requirements + system design + implementation plan) as the very first PR established a shared reference for all subsequent work. This meant every subsequent PR could reference concrete design decisions rather than ad hoc conversations.

**2. Stress tests shipped before frontend (PR#14 before PR#15)**

The plan had frontend (PR12) before stress tests (PR14). In practice, stress tests only depend on the backend API, not the frontend. Shipping them earlier validated the concurrency guarantees before investing in the UI. The frontend then shipped with confidence that the backend was proven.

**3. Three additional chore PRs (#3, #17, #18)**

- **PR#3**: `.romba.toml` gitignore — minor tooling hygiene
- **PR#17**: `.env.example` files — developer onboarding improvement discovered during integration testing
- **PR#18**: ESLint 8 → 9 migration — ESLint 8 reached EOL; migrating to flat config ensured long-term maintainability

These chores represent the reality that a 16-PR plan always underestimates tooling friction. Each was small, focused, and non-disruptive.

---

## 2. Architectural Decisions

### 2.1 Shared HTTP Infrastructure in NestJS Shell (PR#5)

**What was planned**: Shared HTTP infrastructure (exception filters, response interceptors, middleware) could have been a separate PR or deferred to the API endpoint PRs.

**What was implemented**: Bundled into the NestJS app shell PR alongside config, health checks, and module wiring.

**Rationale**: These cross-cutting HTTP concerns (global exception filter, response wrapper interceptor, correlation ID middleware, user ID middleware) are needed by every controller. Shipping them early meant all subsequent API PRs could focus purely on business logic without reimplementing error handling or response formatting. This was a parallelization enabler — PR#10 (public API) and PR#11 (admin API) both depended on this foundation.

### 2.2 Domain Layer as Single PR (PR#6)

**What was planned**: The domain layer was sized as "L" (600–800 lines) — the largest single PR in the plan.

**What was implemented**: Delivered as a single PR containing all entities, value objects, domain events, domain services, domain errors, and repository interfaces.

**Rationale**: Domain concepts are deeply intertwined. The `Sale` entity references `Stock`, `Sku`, `SaleState`, and `TimeRange` value objects. The `SaleStateMachine` service orchestrates state transitions that emit `SaleStarted`, `PurchaseConfirmed`, and `StockDepleted` events. Splitting these across PRs would have created artificial boundaries within a single bounded context, requiring forward references or placeholder types. The cohesion argument won: a domain layer that compiles and tests as a unit is more valuable than artificially small PRs with broken dependencies.

### 2.3 PostgreSQL + BullMQ Combined (PR#9)

**What was planned**: PostgreSQL and BullMQ in a single PR.

**What was implemented**: Combined as planned — TypeORM entities, PostgreSQL repositories, BullMQ module/processor, circuit breaker, and reconciliation service.

**Rationale**: BullMQ's sole purpose in this system is to persist purchase records from Redis to PostgreSQL. The producer (Redis purchase) → queue (BullMQ) → consumer (PostgreSQL INSERT) pipeline is a single data flow. Separating them would have required a producer PR with no consumer (untestable) or a consumer PR with no producer (dead code). The circuit breaker pattern was included because it directly protects the PostgreSQL write path that BullMQ jobs use.

### 2.4 SSE + Cron + Reconciliation Grouped (PR#12)

**What was planned**: These three concerns grouped in a single PR.

**What was implemented**: Grouped as planned — SSE event streaming, state transition cron, and Redis↔PostgreSQL reconciliation cron.

**Rationale**: All three share a common theme: state synchronization over time. The state cron triggers `UPCOMING → ACTIVE → ENDED` transitions. SSE broadcasts these transitions to connected clients. Reconciliation ensures Redis and PostgreSQL agree on purchase counts. They share infrastructure (Redis Pub/Sub, scheduling module) and testing patterns (Testcontainers with time manipulation). Grouping them avoided duplicate setup in multiple PRs.

### 2.5 Clean Architecture with 4 Layers

**Decision**: Strict 4-layer architecture (Domain → Application → Infrastructure → Presentation) with inward-only dependency flow.

**Trade-off**: More boilerplate (interfaces, DI tokens, adapters) vs. clear separation of concerns and testability.

**Outcome**: The domain layer has zero external dependencies — it can be tested with plain unit tests. Infrastructure implementations (Redis, PostgreSQL) are swappable via DI tokens. This pays off in integration tests where Testcontainers replace real services transparently.

### 2.6 Dual Persistence (Redis + PostgreSQL)

**Decision**: Redis as the authoritative hot-path store, PostgreSQL as the durable audit trail. Purchases are confirmed in Redis (~0.5ms), then asynchronously persisted to PostgreSQL via BullMQ.

**Trade-off**: Eventual consistency between Redis and PostgreSQL vs. the simplicity of a single database.

**Mitigation**: The reconciliation cron job (every 5 minutes) detects and corrects drift. PostgreSQL's `UNIQUE(product_id, user_id)` constraint provides defense-in-depth against duplicates even if Redis state is corrupted.

---

## 3. Technology Choices

### 3.1 NestJS + Fastify (not Express)

**Choice**: Fastify adapter instead of the default Express adapter.

**Rationale**: Fastify provides ~2x throughput over Express for JSON serialization workloads. In a flash sale system handling 1,000+ concurrent requests, this throughput difference directly impacts tail latency. NestJS's adapter pattern makes this a one-line change with no API differences.

**Alternative considered**: Raw Fastify without NestJS. Rejected because NestJS provides dependency injection, module system, guards, interceptors, and decorators that significantly reduce boilerplate for a system of this complexity.

### 3.2 Redis Lua Scripts (not Transactions)

**Choice**: Lua scripts for atomic purchase operations instead of Redis `MULTI/EXEC` transactions.

**Rationale**: `MULTI/EXEC` cannot read-then-write atomically — the read happens before the transaction starts, creating a TOCTOU race condition. Lua scripts execute atomically on the Redis server, enabling check-state → check-stock → decrement → record-buyer → publish-event as a single uninterruptible operation. The entire purchase decision happens in ~0.5ms within Redis.

### 3.3 BullMQ (not Custom Queue)

**Choice**: BullMQ for async persistence queue.

**Rationale**: BullMQ provides retry with exponential backoff, dead letter queues, concurrency control, and Redis-backed persistence — all required for reliable purchase persistence. Building a custom queue would duplicate this functionality without the battle-tested reliability. BullMQ also integrates natively with NestJS via `@nestjs/bullmq`.

### 3.4 TypeORM with Manual Schema (not Migrations)

**Choice**: `synchronize: false` with schema managed by `init.sql` in Docker entrypoint, not TypeORM migrations.

**Rationale**: For a system with exactly 2 tables (`products`, `purchases`) that won't change schema during the assessment, migrations add unnecessary complexity. The `init.sql` approach gives full control over indexes, constraints, and initial schema with plain SQL that's version-controlled and reproducible.

**Trade-off**: No migration history for schema evolution. Acceptable for an assessment project; a production system would use migrations.

### 3.5 Testcontainers (not Mocking)

**Choice**: Integration tests use Testcontainers to spin up real Redis and PostgreSQL instances.

**Rationale**: Mocking Redis Lua script behavior or PostgreSQL constraint checking would test the mock, not the system. Testcontainers provide real infrastructure with deterministic startup/teardown. The tradeoff is slower test execution (~10s container startup), mitigated by reusing containers across test suites within a single Jest run.

**Alternative considered**: Docker Compose for test infrastructure. Rejected because Testcontainers are self-contained — no external `docker compose up` step needed, and tests are truly isolated (fresh database per suite).

### 3.6 k6 (not Artillery/JMeter)

**Choice**: k6 for stress testing.

**Rationale**: k6 scripts are JavaScript — consistent with the TypeScript codebase. k6 uses a Go runtime for high concurrency without Node.js event loop limitations. The `per-vu-iterations` executor model maps perfectly to the flash sale scenario (1,000 users, each attempting exactly one purchase). Built-in threshold assertions (`p(95)<2000`) integrate with CI/CD pass/fail decisions.

### 3.7 Playwright (not Cypress)

**Choice**: Playwright for E2E testing.

**Rationale**: Playwright's multi-browser support, auto-waiting, and network interception are stronger than Cypress for testing SSE-dependent UIs. Playwright also runs in CI without a display server (headless Chromium), simplifying the GitHub Actions pipeline.

---

## 4. Testing Strategy Trade-offs

### 4.1 Test Pyramid

| Layer             | Count      | Speed        | Confidence                 | Infrastructure      |
| ----------------- | ---------- | ------------ | -------------------------- | ------------------- |
| Unit tests        | High       | Fast (ms)    | Business logic correctness | None                |
| Integration tests | Medium     | Moderate (s) | Infrastructure wiring      | Testcontainers      |
| E2E tests         | Low        | Slow (10s+)  | Full user flow             | Docker Compose      |
| Stress tests      | 1 scenario | Slow (min)   | Concurrency guarantees     | Docker Compose + k6 |

### 4.2 What We Test vs What We Don't

**We test**: Domain invariants (no overselling, no duplicates, state machine transitions), Lua script atomicity, PostgreSQL constraint enforcement, full purchase flow, 1,000-user concurrency.

**We don't test**: CDN caching behavior (requires real CDN), Redis Sentinel failover (single-instance for assessment), horizontal scaling (single-server assumption per D-3).

### 4.3 Jest 30

**Decision**: Upgraded to Jest 30 (latest major).

**Impact**: The `--testPathPattern` flag was replaced with `--testPathPatterns` (plural). This caused initial CI failures until the configuration was updated. Jest 30 also improved ESM support and test isolation, which benefited Testcontainer-based integration tests.

---

## 5. Bottleneck Mitigations

Six bottlenecks were identified in the system design. Here's how each was addressed:

| #   | Bottleneck                    | Mitigation                                                                  | Implemented In                          |
| --- | ----------------------------- | --------------------------------------------------------------------------- | --------------------------------------- |
| 1   | Redis single-threaded         | Lua scripts kept under 0.5ms; minimal key operations                        | PR#8 (Lua scripts)                      |
| 2   | SSE connection limits         | Heartbeat cleanup, OS fd limit guidance                                     | PR#12 (SSE module)                      |
| 3   | Thundering herd at sale start | Multi-layer rate limiting + Redis serialization + frontend jitter (0-500ms) | PR#13 (rate limiting), PR#15 (frontend) |
| 4   | Dual-write inconsistency      | BullMQ retries + reconciliation cron (every 5 min)                          | PR#9 (BullMQ), PR#12 (reconciliation)   |
| 5   | Redis SPOF                    | AOF persistence (`appendfsync everysec`) + Sentinel guidance (production)   | PR#4 (Redis config)                     |
| 6   | Rate limiting false positives | Tiered limits: Nginx per-IP (100/s) → NestJS per-user (1/s)                 | PR#4 (Nginx), PR#13 (NestJS)            |

---

## 6. Security & Traffic Management

### 6.1 Multi-Layer Defense

```
CDN Bot Detection → Nginx Rate Limiting (100 req/s per IP)
    → NestJS Throttle (1 req/s per user) → Lua Business Logic
```

Each layer handles a different threat:

- **Nginx**: Stops volumetric attacks before they reach the application
- **NestJS sliding window**: Prevents individual users from flooding the purchase endpoint
- **Lua script**: Enforces business rules (one purchase per user, valid sale state)

### 6.2 DDoS Mitigation

- **Connection limiting**: Nginx limits 5 concurrent connections per IP
- **Rate limiting**: Token bucket at 100 req/s per IP with burst=10
- **SSE timeout**: 1-hour max connection prevents connection exhaustion
- **Redis noeviction**: Memory policy rejects new writes rather than evicting sale data under pressure

### 6.3 CDN Placement

- Static assets (React SPA bundle): Cached indefinitely with content-hash filenames (`immutable`)
- Sale status endpoint: CDN-cached with 1s TTL (`Cache-Control: public, max-age=1`)
- Purchase endpoint: Not cached (`no-store`) — every request must reach the origin
- SSE endpoint: Not cacheable (streaming connection)

This placement means 99% of status polling traffic is absorbed by CDN edge nodes, leaving the origin server focused on the critical purchase write path.
