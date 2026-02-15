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

---

## 2. Running Stress Tests

### 2.1 Quick Start

Run the default purchase load test (1,000 virtual users, 100 stock):

```bash
./apps/backend/test/stress/scripts/run-stress.sh
```

### 2.2 Available Tests

| Test           | Command                          | Description                                   |
| -------------- | -------------------------------- | --------------------------------------------- |
| Purchase load  | `./run-stress.sh purchase-load`  | 1,000 VUs each attempt one purchase (default) |
| Status polling | `./run-stress.sh status-polling` | Concurrent status endpoint polling            |
| Mixed workload | `./run-stress.sh mixed-workload` | Combined purchases + polling                  |
| All tests      | `./run-stress.sh all`            | Run all three sequentially                    |

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

| Variable        | Default                  | Description                                     |
| --------------- | ------------------------ | ----------------------------------------------- |
| `BASE_URL`      | `http://localhost:3000`  | API base URL                                    |
| `ADMIN_API_KEY` | `dev-admin-key-12345678` | Admin API key for sale setup                    |
| `INITIAL_STOCK` | `100`                    | Stock count for the test sale                   |
| `VUS`           | `1000`                   | Number of virtual users (concurrent purchasers) |
| `K6_CMD`        | Auto-detect              | Path to k6 binary (falls back to Docker)        |
| `TEST_SKU`      | `STRESS-LOAD-TEST`       | SKU used for the test sale                      |

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

4. **Post-test verification**:
   - `verify-invariants.sh` independently queries Redis and PostgreSQL
   - Checks all 6 data integrity invariants

---

## 3. Expected Results

### 3.1 Purchase Outcomes

With default settings (100 stock, 1,000 VUs):

| Metric                       | Expected Value | Meaning                          |
| ---------------------------- | -------------- | -------------------------------- |
| `purchase_success`           | Exactly 100    | 100 users successfully purchased |
| `purchase_rejected_sold_out` | ~900           | 900 users rejected (sold out)    |
| `purchase_error`             | 0              | No unexpected errors             |
| `http_errors`                | 0              | No HTTP-level failures (5xx)     |

### 3.2 Performance Thresholds

| Metric                    | Threshold | Description             |
| ------------------------- | --------- | ----------------------- |
| `http_req_duration` p(50) | < 1,000ms | Median response time    |
| `http_req_duration` p(95) | < 2,000ms | 95th percentile latency |
| `http_req_duration` p(99) | < 3,000ms | 99th percentile latency |
| `http_req_failed`         | < 0.1%    | HTTP failure rate       |

### 3.3 Data Integrity Invariants

After the test completes, these invariants must hold:

| #   | Invariant                     | Verification                             |
| --- | ----------------------------- | ---------------------------------------- |
| 1   | No overselling                | `purchases <= initial_stock`             |
| 2   | No duplicate purchases        | Each user has at most 1 purchase         |
| 3   | Unique users = purchase count | No duplicates by any measure             |
| 4   | Redis/PG consistency          | Redis buyer count = PG purchase count    |
| 5   | Stock consistency             | `current_stock = initial_stock - buyers` |
| 6   | Stock non-negative            | `current_stock >= 0`                     |

### 3.4 Manual Verification Commands

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

The `run-stress.sh` script automatically runs `verify-invariants.sh` after purchase tests. You can also run it manually:

```bash
./apps/backend/test/stress/scripts/verify-invariants.sh
```

### 4.2 Configuration

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

### 4.3 Sample Output

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

### 5.1 Sample k6 Summary

After the test run, k6 prints a summary like this:

```
     ✓ status is 200
     ✓ has purchaseNo
     ✓ has purchasedAt

     checks.........................: 100.00% ✓ 1200  ✗ 0
     data_received..................: 285 kB  2.4 kB/s
     data_sent......................: 198 kB  1.6 kB/s
     http_errors....................: 0       0/s
     http_req_blocked...............: avg=1.2ms   min=0s      med=1µs    max=52ms   p(90)=2µs    p(95)=15ms
     http_req_duration..............: avg=245ms   min=12ms    med=198ms  max=1.8s   p(90)=520ms  p(95)=780ms
       { expected_response:true }...: avg=245ms   min=12ms    med=198ms  max=1.8s   p(90)=520ms  p(95)=780ms
     http_req_failed................: 0.00%   ✓ 0     ✗ 1000
     http_reqs......................: 1000    8.3/s
     purchase_error.................: 0       0/s
     purchase_rejected_sold_out.....: 900     7.5/s
     purchase_success...............: 100     0.83/s
```

### 5.2 Key Metrics to Watch

| Metric                    | What It Tells You                                       |
| ------------------------- | ------------------------------------------------------- |
| `purchase_success`        | Must equal `INITIAL_STOCK` — any more means overselling |
| `purchase_error`          | Must be 0 — any value means unexpected failures         |
| `http_errors`             | Must be 0 — any value means 5xx or connection errors    |
| `http_req_duration` p(95) | Must be < 2,000ms — response time under load            |
| `http_req_failed`         | Must be < 0.1% — HTTP-level failure rate                |
| `checks`                  | Must be 100% — all assertions passed                    |

### 5.3 Threshold Failures

If a threshold is violated, k6 marks it with `✗` and exits with a non-zero code:

```
     ✗ purchase_success...............: 101     (threshold: count==100)
```

This would indicate an overselling bug — more purchases succeeded than available stock.

---

## 6. Troubleshooting

### 6.1 Common Issues

| Issue                                     | Cause                                   | Fix                                              |
| ----------------------------------------- | --------------------------------------- | ------------------------------------------------ |
| `API did not become healthy`              | Docker services not running             | Run `docker compose up -d --wait`                |
| `k6: command not found`                   | k6 not installed                        | Install k6 or let the script use Docker fallback |
| `Cannot connect to Redis`                 | redis-cli not installed                 | Install via `brew install redis` or check Docker |
| All purchases fail with `SALE_NOT_ACTIVE` | State cron hasn't transitioned sale yet | The script waits up to 30s; check cron interval  |
| More than INITIAL_STOCK successes         | Overselling bug                         | Investigate Lua script atomicity                 |
| Redis/PG mismatch after test              | BullMQ hasn't finished processing       | Wait 30s and re-run `verify-invariants.sh`       |

### 6.2 Running with Reduced Load

For faster iteration during development:

```bash
INITIAL_STOCK=10 VUS=50 ./apps/backend/test/stress/scripts/run-stress.sh
```

### 6.3 CI Environment

In CI (GitHub Actions), the stress tests run with reduced load to fit within CI resource constraints:

```bash
VUS=100 INITIAL_STOCK=100 ./apps/backend/test/stress/scripts/run-stress.sh purchase-load
```
