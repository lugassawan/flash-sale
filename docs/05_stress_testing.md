# Stress Testing Guide

This guide covers running stress tests against the flash sale system to verify concurrency guarantees, performance thresholds, and data integrity invariants.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Running Stress Tests](#2-running-stress-tests)
3. [Expected Results](#3-expected-results)
4. [Verifying Invariants](#4-verifying-invariants)
5. [Interpreting k6 Output](#5-interpreting-k6-output)
6. [Troubleshooting](#6-troubleshooting)
7. [Architecture Notes](#7-architecture-notes)

---

## 1. Prerequisites

### 1.1 Required Software

| Tool      | Required                   | Installation                                                           |
| --------- | -------------------------- | ---------------------------------------------------------------------- |
| Docker    | Yes                        | [docker.com](https://www.docker.com/)                                  |
| k6        | Recommended                | [k6.io/docs/get-started](https://k6.io/docs/get-started/installation/) |
| redis-cli | For invariant verification | Bundled with Redis or via `brew install redis`                         |
| psql      | For invariant verification | Bundled with PostgreSQL or via `brew install libpq`                    |

> **Note**: If k6 is not installed locally, the test runner automatically falls back to running k6 via Docker (`grafana/k6:latest`).

### 1.2 Start Infrastructure

Ensure Docker services (Redis, PostgreSQL, Nginx, API) are running:

```bash
cd infrastructure/docker
docker compose up -d --build --wait
```

Verify the API is healthy:

```bash
curl http://localhost:3000/health
```

> **Important**: For clean test results, start from fresh volumes (`docker compose down -v && docker compose up -d --build --wait`). The product deletion API does not cascade-delete PostgreSQL purchase records, so repeated runs against the same environment can accumulate stale data in PG (see [Section 7.3](#73-pg-data-accumulation-across-runs)).

---

## 2. Running Stress Tests

### 2.1 Quick Start

Run the default purchase load test (1,000 virtual users, 100 stock):

```bash
./apps/backend/test/stress/scripts/run-stress.sh
```

### 2.2 Available Tests

| Test           | Command                          | Description                                              | Proves           |
| -------------- | -------------------------------- | -------------------------------------------------------- | ---------------- |
| Purchase load  | `./run-stress.sh purchase-load`  | 1,000 VUs each attempt one purchase (default)            | NF-7, NF-2       |
| Duplicate user | `./run-stress.sh duplicate-user` | 10 users × 100 concurrent requests — tests deduplication | PR-5, PR-6, NF-8 |
| Status polling | `./run-stress.sh status-polling` | Concurrent status endpoint polling (read-only)           | NF-2             |
| Mixed workload | `./run-stress.sh mixed-workload` | Combined purchases + polling under contention            | NF-2, NF-7       |
| All tests      | `./run-stress.sh all`            | Run all four sequentially                                | All              |

### 2.3 Configuration

All configuration is via environment variables:

```bash
# Custom stock and VU count
INITIAL_STOCK=100 VUS=1000 ./apps/backend/test/stress/scripts/run-stress.sh

# Against a different API host
BASE_URL=http://staging:3000 ./apps/backend/test/stress/scripts/run-stress.sh

# Specify k6 binary path
K6_CMD=/usr/local/bin/k6 ./apps/backend/test/stress/scripts/run-stress.sh
```

| Variable        | Default                  | Description                                             |
| --------------- | ------------------------ | ------------------------------------------------------- |
| `BASE_URL`      | `http://localhost:3000`  | API base URL                                            |
| `ADMIN_API_KEY` | `dev-admin-key-12345678` | Admin API key for sale setup                            |
| `INITIAL_STOCK` | `100`                    | Stock count for the test sale                           |
| `VUS`           | `1000`                   | Number of virtual users (concurrent purchasers)         |
| `K6_CMD`        | Auto-detect              | Path to k6 binary (falls back to Docker)                |
| `TEST_SKU`      | `STRESS-LOAD-TEST`       | SKU used for the test sale                              |
| `DEDUP_USERS`   | `10`                     | Number of unique users for duplicate-user test          |
| `DRAIN_WAIT`    | `15`                     | Seconds to wait for BullMQ to drain before verification |
| `COOLDOWN`      | `5`                      | Seconds between consecutive stability runs              |

### 2.4 What the Test Does

The purchase load test follows this sequence:

1. **Setup** (runs once):
   - Cleans up any leftover sale from a previous run
   - Creates a new product with `INITIAL_STOCK` units
   - Waits for the state cron to transition the sale to `ACTIVE`

2. **Test** (runs per VU):
   - Each of the 1,000 VUs sends exactly one `POST /api/v1/purchases` request
   - Each VU uses a unique user ID (`stress-user-00001` through `stress-user-01000`)
   - All VUs fire simultaneously (burst pattern)

3. **Teardown** (runs once):
   - Verifies invariants via the admin API
   - Prints a summary report

4. **Drain wait**:
   - Waits `DRAIN_WAIT` seconds (default 15) for BullMQ to persist all purchases to PostgreSQL

5. **Post-test verification**:
   - `verify-invariants.sh` independently queries Redis and PostgreSQL
   - Checks all 6 data integrity invariants

### 2.5 Duplicate User Test

The duplicate-user test stress-tests per-user deduplication under concurrent load:

- **10 unique users** each send **100 concurrent requests** (1,000 total)
- Stock is set high (100) so it's never the bottleneck — only dedup logic limits purchases
- Expected: exactly 10 successful purchases (one per unique user)
- The remaining 990 requests are rejected by the system's two-layer dedup defense:
  - **Rate limiter** (first layer): Most requests get HTTP 429 via the per-user sliding window (1 req/s)
  - **Lua script dedup** (second layer): Requests that pass the rate limiter but arrive after the first success get `ALREADY_PURCHASED`

```bash
# Default: 10 users × 100 concurrent requests
./apps/backend/test/stress/scripts/run-stress.sh duplicate-user

# Custom user count (e.g., for CI with reduced load)
DEDUP_USERS=5 VUS=50 ./apps/backend/test/stress/scripts/run-stress.sh duplicate-user
```

### 2.6 Stability Testing

Run a test N consecutive times to prove the "5+ consecutive runs" stability criterion:

```bash
# Run purchase-load 5 times (default)
./apps/backend/test/stress/scripts/run-stability.sh

# Run duplicate-user 3 times
./apps/backend/test/stress/scripts/run-stability.sh 3 duplicate-user
```

The exit code equals the number of failed runs (0 = all passed). A configurable `COOLDOWN` (default 5s) pauses between runs to let resources settle.

---

## 3. Expected Results

### 3.1 Purchase Load Outcomes

With default settings (100 stock, 1,000 VUs, each VU has a unique user ID):

| Metric                                | Expected Value | Meaning                          |
| ------------------------------------- | -------------- | -------------------------------- |
| `purchase_success`                    | Exactly 100    | 100 users successfully purchased |
| `purchase_rejected_not_active`        | ~900           | 900 users rejected (sale ended)  |
| `purchase_rejected_already_purchased` | 0              | No false duplicate detections    |
| `purchase_error`                      | 0              | No unexpected errors             |
| `http_errors`                         | 0              | No HTTP-level failures (5xx)     |

> **Note**: The 900 rejected VUs typically see `SALE_NOT_ACTIVE` rather than `SOLD_OUT`. This happens because the state cron transitions the sale to `ENDED` very quickly after stock depletes — most late-arriving VUs see the sale as ended rather than sold out. Both outcomes are correct; the key invariant is `purchase_success == INITIAL_STOCK`.

### 3.2 Duplicate User Outcomes

With default settings (100 stock, 1,000 VUs, 10 unique users):

| Metric                  | Expected Value | Meaning                                 |
| ----------------------- | -------------- | --------------------------------------- |
| `purchase_success`      | Exactly 10     | One purchase per unique user            |
| `purchase_rate_limited` | ~990           | Rate limiter blocked duplicate attempts |
| `purchase_error`        | 0              | No unexpected errors                    |
| `http_errors`           | 0              | No server errors (5xx)                  |

### 3.3 Performance Thresholds

These thresholds are enforced by k6. They are derived from requirement NF-2 ("sub-second median response time under 1,000 concurrent users"):

**Purchase tests** (purchase-load, duplicate-user, mixed-workload):

| Metric                    | Threshold | Description             |
| ------------------------- | --------- | ----------------------- |
| `http_req_duration` p(50) | < 500ms   | Median response time    |
| `http_req_duration` p(95) | < 1,000ms | 95th percentile latency |
| `http_req_duration` p(99) | < 2,000ms | 99th percentile latency |

**Status polling test:**

| Metric                    | Threshold | Description             |
| ------------------------- | --------- | ----------------------- |
| `http_req_duration` p(50) | < 200ms   | Median response time    |
| `http_req_duration` p(95) | < 500ms   | 95th percentile latency |
| `http_req_duration` p(99) | < 1,000ms | 99th percentile latency |

> **Note**: Status polling thresholds are tighter because the endpoint is read-only (Redis GET, no Lua script execution).

### 3.4 Data Integrity Invariants

After the test completes, these invariants must hold:

| #   | Invariant                     | Verification                             |
| --- | ----------------------------- | ---------------------------------------- |
| 1   | No overselling                | `purchases <= initial_stock`             |
| 2   | No duplicate purchases        | Each user has at most 1 purchase         |
| 3   | Unique users = purchase count | No duplicates by any measure             |
| 4   | Redis/PG consistency          | Redis buyer count = PG purchase count    |
| 5   | Stock consistency             | `current_stock = initial_stock - buyers` |
| 6   | Stock non-negative            | `current_stock >= 0`                     |

Additionally, the k6 teardown can check an optional invariant:

| #   | Invariant                     | Verification                            |
| --- | ----------------------------- | --------------------------------------- |
| 7   | No dedup violation (optional) | `totalPurchases <= expectedUniqueUsers` |

Invariant 7 is only checked by the duplicate-user test, where `expectedUniqueUsers` equals `DEDUP_USERS`.

### 3.5 Manual Verification Commands

You can verify invariants directly against Redis and PostgreSQL:

```bash
# Redis: Count buyers (should equal INITIAL_STOCK)
redis-cli SCARD "sale:STRESS-LOAD-TEST:buyers"

# Redis: Check remaining stock (should be 0)
redis-cli GET "sale:STRESS-LOAD-TEST:stock"

# PostgreSQL: Count purchases (should equal INITIAL_STOCK)
PGPASSWORD=flashsale psql -h localhost -U flashsale -d flashsale \
  -c "SELECT COUNT(*) FROM purchases p JOIN products pr ON p.product_id = pr.id WHERE pr.sku = 'STRESS-LOAD-TEST'"

# PostgreSQL: Check for duplicate purchases (should be 0)
PGPASSWORD=flashsale psql -h localhost -U flashsale -d flashsale \
  -c "SELECT user_id, COUNT(*) FROM purchases p JOIN products pr ON p.product_id = pr.id WHERE pr.sku = 'STRESS-LOAD-TEST' GROUP BY user_id HAVING COUNT(*) > 1"
```

---

## 4. Verifying Invariants

### 4.1 Automatic Verification

The `run-stress.sh` script automatically waits for BullMQ to drain (`DRAIN_WAIT` seconds), then runs `verify-invariants.sh` after any test that makes purchases. You can also run it manually:

```bash
./apps/backend/test/stress/scripts/verify-invariants.sh
```

### 4.2 Dual Verification Strategy

The system uses two independent verification layers:

1. **k6 teardown** (in-process, fast): Queries the admin API immediately after the test run. Checks stock math invariants via the `verifyInvariants()` helper. This provides fast feedback but only sees the admin API's view of the data.

2. **`verify-invariants.sh`** (independent, source-of-truth): Directly queries Redis (`SCARD`, `GET`, `HGET`) and PostgreSQL (`SELECT COUNT(*)`) after the drain wait. This is the authoritative check because it bypasses the application layer entirely.

The drain wait between these two layers is critical — purchases are accepted atomically in Redis but persisted to PostgreSQL asynchronously via BullMQ.

### 4.3 Configuration

| Variable      | Default       | Description                           |
| ------------- | ------------- | ------------------------------------- |
| `REDIS_HOST`  | `localhost`   | Redis hostname                        |
| `REDIS_PORT`  | `6379`        | Redis port                            |
| `PG_HOST`     | `localhost`   | PostgreSQL hostname                   |
| `PG_PORT`     | `5432`        | PostgreSQL port                       |
| `PG_USER`     | `flashsale`   | PostgreSQL username                   |
| `PG_PASSWORD` | `flashsale`   | PostgreSQL password                   |
| `PG_DB`       | `flashsale`   | PostgreSQL database                   |
| `TEST_SKU`    | Auto-discover | Specific SKU to verify (or check all) |

### 4.4 Sample Output

```
[verify] ╔══════════════════════════════════════════════╗
[verify] ║     POST-TEST INVARIANT VERIFICATION        ║
[verify] ╚══════════════════════════════════════════════╝

[verify] Redis:      localhost:6379
[verify] PostgreSQL: localhost:5432/flashsale

[verify] ═══════════════════════════════════════
[verify]   Verifying SKU: STRESS-LOAD-TEST
[verify] ═══════════════════════════════════════
[verify]   Redis buyers (SCARD):     100
[verify]   Redis current stock:      0
[verify]   Redis initial stock:      100
[verify]   PG total purchases:       100
[verify]   PG initial stock:         100
[verify]   PG unique users:          100
[verify]   PG duplicate user count:  0

[verify] PASS: No overselling: purchases (100) <= initial stock (100)
[verify] PASS: No duplicate purchases: 0 users with multiple purchases
[verify] PASS: All purchases unique: 100 unique users = 100 purchases
[verify] PASS: Redis/PG consistent: Redis buyers (100) = PG purchases (100)
[verify] PASS: Stock consistent: current (0) = initial (100) - buyers (100)
[verify] PASS: Stock non-negative: 0

[verify] ═══════════════════════════════════════
[verify]   ALL INVARIANTS PASSED
[verify] ═══════════════════════════════════════
```

---

## 5. Interpreting k6 Output

### 5.1 Sample Purchase Load Summary

```
  █ THRESHOLDS

    http_errors
    ✓ 'count==0' count=0

    http_req_duration
    ✓ 'p(50)<500' p(50)=79.33ms
    ✓ 'p(95)<1000' p(95)=104.98ms
    ✓ 'p(99)<2000' p(99)=109.18ms

    http_req_failed
    ✓ 'rate<0.001' rate=0.00%

    purchase_error
    ✓ 'count==0' count=0

    purchase_rejected_already_purchased
    ✓ 'count==0' count=0

    purchase_success
    ✓ 'count==100' count=100
```

### 5.2 Sample Duplicate User Summary

```
  █ THRESHOLDS

    http_errors
    ✓ 'count==0' count=0

    http_req_duration
    ✓ 'p(50)<500' p(50)=20.29ms
    ✓ 'p(95)<1000' p(95)=31.99ms
    ✓ 'p(99)<2000' p(99)=32.86ms

    purchase_error
    ✓ 'count==0' count=0

    purchase_success
    ✓ 'count==5' count=5

  CUSTOM
    purchase_rate_limited..........: 45     42.219072/s
    purchase_success...............: 5      4.691008/s
```

### 5.3 Key Metrics to Watch

| Metric                    | What It Tells You                                                   |
| ------------------------- | ------------------------------------------------------------------- |
| `purchase_success`        | Must equal `INITIAL_STOCK` (or `DEDUP_USERS`) — any more = oversell |
| `purchase_error`          | Must be 0 — any value means unexpected failures                     |
| `http_errors`             | Must be 0 — any value means 5xx or connection errors                |
| `http_req_duration` p(50) | Must be < 500ms — median response time under load                   |
| `http_req_duration` p(95) | Must be < 1,000ms — tail latency under load                         |
| `purchase_rate_limited`   | Duplicate-user test only — expected, not an error                   |
| `checks`                  | Must be 100% — all assertions passed                                |

### 5.4 Threshold Failures

If a threshold is violated, k6 marks it with `✗` and exits with a non-zero code:

```
     ✗ purchase_success...............: 101     (threshold: count==100)
```

This would indicate an overselling bug — more purchases succeeded than available stock.

---

## 6. Troubleshooting

### 6.1 Common Issues

| Issue                                     | Cause                                   | Fix                                               |
| ----------------------------------------- | --------------------------------------- | ------------------------------------------------- |
| `API did not become healthy`              | Docker services not running             | Run `docker compose up -d --wait`                 |
| `k6: command not found`                   | k6 not installed                        | Install k6 or let the script use Docker fallback  |
| `Cannot connect to Redis`                 | redis-cli not installed                 | Install via `brew install redis` or check Docker  |
| All purchases fail with `SALE_NOT_ACTIVE` | State cron hasn't transitioned sale yet | The script waits up to 30s; check cron interval   |
| More than INITIAL_STOCK successes         | Overselling bug                         | Investigate Lua script atomicity                  |
| Redis/PG mismatch after test              | BullMQ hasn't finished processing       | Increase `DRAIN_WAIT` (default 15s) and re-run    |
| PG shows more purchases than expected     | Stale data from prior runs              | Restart with `docker compose down -v && up -d`    |
| `purchase_rate_limited` is very high      | Expected in duplicate-user test         | Not a bug — rate limiter is the first dedup layer |
| p(95) slightly exceeds threshold locally  | 1,000 VUs on a single machine           | Reduce `VUS` or run in CI (uses VUS=100)          |

### 6.2 Running with Reduced Load

For faster iteration during development:

```bash
INITIAL_STOCK=10 VUS=50 ./apps/backend/test/stress/scripts/run-stress.sh
```

### 6.3 CI Environment

In CI (GitHub Actions), the stress tests run with reduced load to fit within CI resource constraints:

```bash
# Purchase load test
VUS=100 INITIAL_STOCK=100 ./apps/backend/test/stress/scripts/run-stress.sh purchase-load

# Duplicate user test
VUS=50 DEDUP_USERS=5 INITIAL_STOCK=100 ./apps/backend/test/stress/scripts/run-stress.sh duplicate-user
```

> **Note**: Stability testing (`run-stability.sh`) is not included in CI due to execution time. It is intended for manual or nightly runs to prove the "5+ consecutive runs" criterion.

---

## 7. Architecture Notes

### 7.1 Two-Layer Dedup Defense

The system uses two independent layers to prevent duplicate purchases:

1. **Rate limiter** (infrastructure layer): A Redis-backed sliding window strategy limits each user to 1 request per second. Under concurrent burst load, this is the first line of defense — most duplicate requests are rejected with HTTP 429 before reaching the purchase logic.

2. **Lua script SADD** (domain layer): The atomic purchase Lua script uses `SADD` on a per-SKU buyers set. If the user ID is already in the set, the script returns `ALREADY_PURCHASED`. This is the authoritative dedup check.

3. **PostgreSQL unique constraint** (persistence layer): The `purchases` table has a `UNIQUE (product_id, user_id)` constraint as a final defense-in-depth. Even if both Redis layers fail, PG prevents duplicate records.

The duplicate-user stress test proves all three layers work correctly under concurrent load. With 100 concurrent requests per user, the rate limiter blocks ~99, the Lua script catches any that slip through, and PG enforces the constraint for persisted records.

### 7.2 Async Persistence and the Drain Wait

Purchases follow a CQRS-like pattern:

```
Client → API → Redis Lua (atomic accept/reject) → BullMQ queue → PostgreSQL (async persist)
```

The response to the client is sent after the Redis Lua script completes (~5ms). PostgreSQL persistence happens asynchronously via BullMQ workers. This means:

- **During the test**: Redis is the source of truth. k6 thresholds validate against Redis-backed admin API responses.
- **After the test**: `verify-invariants.sh` checks Redis/PG consistency. Without `DRAIN_WAIT`, this check may see fewer PG rows than Redis buyers (false mismatch).

The default `DRAIN_WAIT=15` seconds is sufficient for typical loads. Increase it for very large stock counts or slow environments.

### 7.3 PG Data Accumulation Across Runs

The `DELETE /api/v1/products/{sku}` endpoint deletes the product from PostgreSQL, but the `purchases` table FK (`REFERENCES products(id)`) has no `ON DELETE CASCADE`. This means:

- If purchases exist for a product, the PG delete may fail silently
- On retry, `createSale()` upserts the same product row (same `product_id`)
- Old purchase records remain, accumulating across test runs

**Impact**: `verify-invariants.sh` will see inflated PG purchase counts on repeated runs.

**Workaround**: Always start from fresh volumes for clean verification:

```bash
docker compose -f infrastructure/docker/docker-compose.yml down -v
docker compose -f infrastructure/docker/docker-compose.yml up -d --build --wait
```

In CI, this is handled automatically — `docker compose down -v` runs after every test job.

### 7.4 SALE_NOT_ACTIVE vs SOLD_OUT

When 1,000 VUs burst-purchase against 100 stock, the 900 rejected VUs typically see `SALE_NOT_ACTIVE` rather than `SOLD_OUT`. This is because:

1. The first ~100 VUs consume all stock via the Lua script
2. The state cron detects stock = 0 and transitions the sale to `ENDED`
3. The remaining VUs arrive after the state transition — the Lua script checks state first and returns `NOT_ACTIVE`

This is correct behavior. The k6 test tracks both rejection types separately but only asserts on `purchase_success == INITIAL_STOCK` and `purchase_error == 0`.
