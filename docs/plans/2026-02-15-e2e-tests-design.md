# PR13: E2E Tests (Playwright) — Design

## Overview

End-to-end browser tests using Playwright that exercise the full user flow through the flash sale frontend, verifying all FE acceptance criteria (FE-1 through FE-7).

## Approach

Tests run against the Docker Compose stack (Redis + PostgreSQL + API + Frontend). Playwright config includes a `webServer` directive to start the frontend dev server. Each test uses admin API fixtures to create/reset sale state deterministically.

## Test Scenarios

| Spec File                      | Covers     | Description                                                      |
| ------------------------------ | ---------- | ---------------------------------------------------------------- |
| `purchase-flow.spec.ts`        | FE-4, FE-6 | Happy path: create sale → ACTIVE → enter user ID → buy → confirm |
| `sold-out.spec.ts`             | FE-4       | Stock=2 → 2 purchases → third sees "sold out"                    |
| `sale-lifecycle.spec.ts`       | FE-1, FE-3 | UPCOMING → ACTIVE → ENDED transitions in UI                      |
| `validation.spec.ts`           | FE-5       | Empty/whitespace user ID rejected client-side                    |
| `real-time-updates.spec.ts`    | FE-2, FE-7 | Purchase via API → stock decrements in browser                   |
| `duplicate-prevention.spec.ts` | FE-6       | Purchase → reload → state restored → button disabled             |

## Fixture Design

- `sale-api.ts`: Admin API helpers (create sale, delete sale, make purchase)
- Each test resets via `DELETE /api/v1/products/:sku`
- Short time windows (sale starts in 1-2 seconds)
- Admin key: `dev-admin-key-12345678`

## File Structure

```
apps/frontend/
├── playwright.config.ts
├── e2e/
│   ├── fixtures/
│   │   └── sale-api.ts
│   ├── purchase-flow.spec.ts
│   ├── sold-out.spec.ts
│   ├── sale-lifecycle.spec.ts
│   ├── validation.spec.ts
│   ├── real-time-updates.spec.ts
│   └── duplicate-prevention.spec.ts
└── package.json  (+ @playwright/test)
```
