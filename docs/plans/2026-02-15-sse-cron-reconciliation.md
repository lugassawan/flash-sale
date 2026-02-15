# SSE Events + State Cron + Reconciliation Wiring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up real-time event streaming (SSE), time-based state transitions (cron), and Redis-PG reconciliation for the flash sale system.

**Architecture:** Three services bundled in an EventsModule: (1) SSE controller using NestJS @Sse() returning Observable<MessageEvent> fed by RedisPubSubAdapter; (2) State cron using @Interval() to run TransitionSaleStateUseCase every 100ms; (3) Reconciliation cron using @Cron() to run ReconciliationService every 5 minutes.

**Tech Stack:** NestJS 11, @nestjs/schedule, RxJS, ioredis, Jest + testcontainers

---

## Task 1: Install @nestjs/schedule dependency

**Files:**

- Modify: `apps/backend/package.json`

**Step 1: Install the package**

Run: `pnpm --filter @flash-sale/backend add @nestjs/schedule`

**Step 2: Verify installation**

Run: `pnpm --filter @flash-sale/backend exec -- node -e "require('@nestjs/schedule')"`
Expected: No error

---

## Task 2: Add cron config env vars

**Files:**

- Modify: `apps/backend/src/infrastructure/config/env.validation.ts`

**Step 1: Add env vars to Zod schema**

Add after LOG_LEVEL:

- CRON_STATE_INTERVAL_MS: z.coerce.number().int().positive().default(100)
- CRON_RECONCILIATION_SCHEDULE: z.string().default('_/5 _ \* \* \*')

---

## Task 3: Create SaleEventsController (SSE endpoint)

**Files:**

- Create: `apps/backend/src/presentation/http/rest/sse/sale-events.controller.ts`
- Create: `apps/backend/test/unit/sale-events.controller.spec.ts`

SSE controller at GET /api/v1/sales/events using @Sse() decorator.

- On connect: emits initial event with current sale state via SaleRepository.getSaleStatus()
- Live stream: concat with RedisPubSubAdapter.getEventStream()
- Tracks active connection count (increment on subscribe, decrement on finalize)

---

## Task 4: Create SaleStateCronService

**Files:**

- Create: `apps/backend/src/infrastructure/scheduling/sale-state-cron.service.ts`
- Create: `apps/backend/test/unit/sale-state-cron.service.spec.ts`

Interval service (100ms configurable) that finds sale keys in Redis, skips ENDED sales, runs TransitionSaleStateUseCase for each.

---

## Task 5: Create ReconciliationCronService

**Files:**

- Create: `apps/backend/src/infrastructure/scheduling/reconciliation-cron.service.ts`
- Create: `apps/backend/test/unit/reconciliation-cron.service.spec.ts`

Cron service (_/5 _ \* \* \*) that finds sale keys, skips UPCOMING sales, runs ReconciliationService.reconcile() for ACTIVE and ENDED sales.

---

## Task 6: Create EventsModule and wire into AppModule

**Files:**

- Create: `apps/backend/src/events.module.ts`
- Modify: `apps/backend/src/app.module.ts`

EventsModule imports ScheduleModule.forRoot(), declares SaleEventsController, provides cron services + TransitionSaleStateUseCase. AppModule imports EventsModule and removes standalone ReconciliationService from its providers.

---

## Task 7: Write integration tests

**Files:**

- Create: `apps/backend/test/integration/sale-events.controller.integration.spec.ts`
- Create: `apps/backend/test/integration/sale-state-cron.integration.spec.ts`

Integration tests using testcontainers to verify:

- SSE sends initial event, streams live events
- Cron transitions UPCOMING to ACTIVE and ACTIVE to ENDED based on time

---

## Task 8: Run full test suite and verify

Run all tests and lint to ensure no regressions.
