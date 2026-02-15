# Getting Started

This guide covers building and running the flash sale system in local development, staging, and production environments.

---

## Table of Contents

1. [Local Development](#1-local-development)
2. [Staging Environment](#2-staging-environment)
3. [Production Environment](#3-production-environment)

---

## 1. Local Development

### 1.1 Prerequisites

| Tool                                               | Version   | Purpose                                        |
| -------------------------------------------------- | --------- | ---------------------------------------------- |
| [Node.js](https://nodejs.org/)                     | 22+ (LTS) | JavaScript runtime                             |
| [pnpm](https://pnpm.io/)                           | 9.15+     | Package manager (workspace support)            |
| [Docker](https://www.docker.com/)                  | 24+       | Container runtime for Redis, PostgreSQL, Nginx |
| [Docker Compose](https://docs.docker.com/compose/) | v2+       | Multi-container orchestration                  |

Optional tools:

| Tool                                         | Version | Purpose                                             |
| -------------------------------------------- | ------- | --------------------------------------------------- |
| [k6](https://k6.io/)                         | Latest  | Stress testing (can also run via Docker)            |
| [rimba](https://github.com/lugassawan/rimba) | Latest  | Git worktree management for parallel PR development |

### 1.2 Clone and Install

```bash
git clone <repository-url>
cd flash-sale

# Install all workspace dependencies
pnpm install
```

### 1.3 Environment Setup

Copy the example environment files and adjust as needed:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

The defaults work for local development with Docker Compose. Key variables in `apps/backend/.env`:

```bash
NODE_ENV=development
PORT=3000
REDIS_HOST=localhost
REDIS_PORT=6379
DATABASE_URL=postgresql://flashsale:flashsale@localhost:5432/flashsale
ADMIN_API_KEY=dev-admin-key-12345678
```

### 1.4 Start Docker Services

Start Redis and PostgreSQL (the API and Nginx are started separately for local development):

```bash
cd infrastructure/docker
docker compose up -d redis postgresql
```

Verify services are healthy:

```bash
docker compose ps
```

Both services should show `(healthy)` status. PostgreSQL initializes its schema automatically from `postgresql/init.sql`.

> **Note**: The full `docker compose up -d` starts all services including the API and Nginx. For local development, start only `redis postgresql` to avoid port conflicts with the local dev server.

### 1.5 Start the Backend

```bash
pnpm --filter backend start:dev
```

This starts NestJS with file watching. The API server runs on `http://localhost:3000`.

Verify the backend is running:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 5,
    "checks": {
      "redis": { "status": "up", "latencyMs": 1 },
      "postgresql": { "status": "up", "latencyMs": 3 }
    }
  }
}
```

### 1.6 Start the Frontend

```bash
pnpm --filter frontend dev
```

The Vite dev server starts on `http://localhost:5173` with API proxy to `http://localhost:3000`.

### 1.7 Create a Test Sale

Use the admin API to create a flash sale product:

```bash
curl -X POST http://localhost:3000/api/v1/products \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: dev-admin-key-12345678" \
  -d '{
    "sku": "WIDGET-001",
    "productName": "Limited Edition Widget",
    "initialStock": 100,
    "startTime": "2026-02-15T10:00:00.000Z",
    "endTime": "2026-02-15T10:30:00.000Z"
  }'
```

> **Tip**: Set `startTime` to a few seconds in the future to watch the `UPCOMING → ACTIVE` transition live in the frontend.

### 1.8 Running Tests

**All tests** (unit + integration — integration tests require Docker for Testcontainers):

```bash
pnpm turbo test
```

> To run only unit tests during development (no Docker required):
>
> ```bash
> pnpm --filter backend test -- --testPathPatterns="test/unit"
> ```

**Integration tests only** (requires Docker — Testcontainers starts its own Redis/PostgreSQL):

```bash
pnpm --filter backend test -- --testPathPatterns="test/integration"
```

> **Note**: Integration tests use [Testcontainers](https://testcontainers.com/) which automatically spins up ephemeral Redis and PostgreSQL containers. Docker must be running.

**E2E tests** (requires running backend + frontend + Docker services):

```bash
# Start infrastructure + backend + frontend first, then:
pnpm --filter frontend exec playwright test
```

For headed mode (see the browser):

```bash
pnpm --filter frontend test:e2e:headed
```

**Stress tests** (requires running Docker services + backend):

```bash
./apps/backend/test/stress/scripts/run-stress.sh
```

See [Stress Testing Guide](./05_stress_testing.md) for detailed instructions.

### 1.9 Code Quality

```bash
# Lint all workspaces
pnpm turbo lint

# Auto-fix lint issues
pnpm turbo lint:fix

# Check formatting
pnpm format

# Fix formatting
pnpm format:fix
```

Pre-commit hooks automatically run ESLint and Prettier on staged files via Husky + lint-staged.

### 1.10 Worktree Development with Rimba

For parallel development on multiple PRs, the project supports [rimba](https://github.com/lugassawan/rimba) for Git worktree management. See the [PR Roadmap](../tmp/tasks.md#3-worktree-workflow-rimba) for the worktree workflow.

```bash
# Create a worktree for a feature branch
rimba add feature-name

# List active worktrees
rimba list

# Switch between worktrees
cd ../flash-sale--feature-name
```

---

## 2. Staging Environment

### 2.1 Docker Compose Deployment

The entire stack can be deployed via Docker Compose:

```bash
cd infrastructure/docker
docker compose up -d
```

This starts all services:

- **Redis** (port 6379): AOF persistence, 256MB memory, `noeviction` policy
- **PostgreSQL** (port 5432): Initialized with schema from `init.sql`
- **Nginx** (port 80): Reverse proxy with rate limiting (100 req/s per IP)
- **API** (port 3000): NestJS backend

### 2.2 Environment Configuration

Configure the API service via environment variables in `docker-compose.yml` or a `.env` file:

| Variable                       | Default                                                      | Description                                      |
| ------------------------------ | ------------------------------------------------------------ | ------------------------------------------------ |
| `NODE_ENV`                     | `development`                                                | Set to `production` for staging/prod             |
| `PORT`                         | `3000`                                                       | API server port                                  |
| `REDIS_HOST`                   | `redis`                                                      | Redis hostname (Docker service name)             |
| `REDIS_PORT`                   | `6379`                                                       | Redis port                                       |
| `DATABASE_URL`                 | `postgresql://flashsale:flashsale@postgresql:5432/flashsale` | PostgreSQL connection string                     |
| `ADMIN_API_KEY`                | —                                                            | Admin API secret (min 16 chars)                  |
| `RATE_LIMIT_PER_IP`            | `100`                                                        | Nginx rate limit per IP per second               |
| `RATE_LIMIT_PURCHASE_PER_USER` | `1`                                                          | Purchase attempts per user per second            |
| `LOG_LEVEL`                    | `debug`                                                      | Log verbosity (`debug`, `info`, `warn`, `error`) |
| `CRON_STATE_INTERVAL_MS`       | `100`                                                        | State transition polling interval (ms)           |
| `CRON_RECONCILIATION_SCHEDULE` | `*/5 * * * *`                                                | Redis↔PostgreSQL reconciliation schedule         |

### 2.3 Health Check Verification

```bash
curl http://localhost/health
```

The response should show all infrastructure checks passing. If Nginx is fronting the API, use port 80 (Nginx) rather than port 3000 (API direct).

### 2.4 Smoke Test

Create a sale and make a purchase to verify end-to-end functionality:

```bash
# 1. Create a product
curl -X POST http://localhost/api/v1/products \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: <your-admin-key>" \
  -d '{
    "sku": "SMOKE-TEST",
    "productName": "Smoke Test Product",
    "initialStock": 5,
    "startTime": "2026-02-15T00:00:00.000Z",
    "endTime": "2026-12-31T23:59:59.000Z"
  }'

# 2. Wait for the sale to become ACTIVE (state cron polls every 100ms)
sleep 1

# 3. Check sale status
curl http://localhost/api/v1/sales

# 4. Make a purchase
curl -X POST http://localhost/api/v1/purchases \
  -H "Content-Type: application/json" \
  -H "X-User-Id: smoke-test-user" \
  -d '{"sku": "SMOKE-TEST", "qty": 1}'

# 5. Verify purchase
curl -H "X-User-Id: smoke-test-user" http://localhost/api/v1/purchases
```

---

## 3. Production Environment

> **Note**: This project is designed as a single-server assessment system. The guidance below covers production considerations for a real deployment.

### 3.1 Container Orchestration

The Docker images use multi-stage builds for minimal production images:

- **Backend**: 4-stage build (base → deps → builder → production), runs as non-root `nestjs` user (UID 1001)
- **Frontend**: Multi-stage build (deps → builder → Nginx alpine), serves static assets with SPA fallback

```bash
# Build production images
docker build -t flash-sale-api -f apps/backend/Dockerfile .
docker build -t flash-sale-frontend -f apps/frontend/Dockerfile .
```

For Kubernetes deployments, use the Docker images with appropriate resource limits, liveness/readiness probes pointing to `/health`, and Kubernetes secrets for environment variables.

### 3.2 Secrets Management

Production secrets that must be externalized:

| Secret           | Where Used      | Guidance                                    |
| ---------------- | --------------- | ------------------------------------------- |
| `ADMIN_API_KEY`  | Backend         | Minimum 16 characters, rotate regularly     |
| `DATABASE_URL`   | Backend         | Include credentials, use connection pooling |
| `REDIS_PASSWORD` | Backend + Redis | Uncomment in env, set in Redis config       |

Use Docker secrets, Kubernetes secrets, or a vault service (HashiCorp Vault, AWS Secrets Manager) — never commit secrets to version control.

### 3.3 CDN and Nginx Setup

**Static assets** (frontend SPA):

- Deploy the frontend Nginx container behind a CDN (CloudFront, Cloudflare)
- Assets use content-hash filenames → cache with `immutable, max-age=31536000`
- HTML files: `no-cache` to ensure latest version on deploy

**API responses**:

- Sale status endpoint (`GET /api/v1/sales`): CDN-cacheable with `Cache-Control: public, max-age=1`
- Purchase endpoint (`POST /api/v1/purchases`): Not cached
- SSE endpoint (`GET /api/v1/sales/events`): Streaming, not cacheable

**Nginx rate limiting** (already configured in `infrastructure/docker/nginx/nginx.conf`):

- 100 req/s per IP with burst=10 (`nodelay`)
- 5 concurrent connections per IP
- SSE support: `proxy_buffering off`, 1-hour timeouts

### 3.4 Monitoring

The backend exposes Prometheus metrics at the default metrics endpoint:

- **Request rate**: HTTP requests per second by method, path, and status
- **Error rate**: 4xx and 5xx responses
- **Duration**: Request latency histograms (p50, p95, p99)
- **Infrastructure**: Redis and PostgreSQL health check latencies

Connect Prometheus to scrape metrics and Grafana for dashboards. Key alerts to configure:

| Metric                 | Threshold    | Action                             |
| ---------------------- | ------------ | ---------------------------------- |
| HTTP 5xx rate          | > 1%         | Investigate infrastructure health  |
| p95 latency            | > 2s         | Check Redis/PostgreSQL performance |
| Redis memory           | > 80% of max | Investigate memory usage           |
| PostgreSQL connections | > 80% of max | Tune connection pool               |

### 3.5 Scaling Considerations

**Redis**:

- **High availability**: Redis Sentinel for automatic failover (3-node minimum)
- **Horizontal scale**: Redis Cluster for sharding (not needed for single-sale scenario)
- **Persistence**: AOF with `appendfsync everysec` (at most 1 second of data loss)
- **Memory**: `noeviction` policy is critical — Redis must reject new writes rather than evict sale data

**NestJS API**:

- **Horizontal scale**: Run multiple instances behind a load balancer
- **Session affinity**: Not needed — the API is stateless (all state in Redis/PostgreSQL)
- **SSE connections**: Each instance manages its own SSE connections via Redis Pub/Sub fan-out

**PostgreSQL**:

- **Read replicas**: Useful for reconciliation queries that don't need to hit the primary
- **Connection pooling**: Use PgBouncer in production for connection multiplexing
- **Backups**: pg_dump or continuous archiving with WAL shipping

### 3.6 Backup and Recovery

**Redis**:

- AOF file provides point-in-time recovery (at most 1 second data loss with `everysec`)
- For zero data loss: `appendfsync always` (significant performance impact)
- Backup strategy: Copy AOF file during low-traffic periods

**PostgreSQL**:

- `pg_dump` for logical backups (daily)
- WAL archiving for continuous backup and point-in-time recovery
- Test restore procedures regularly

**Recovery priority**:

1. Redis is the authoritative state store — restore Redis first
2. PostgreSQL is the audit trail — restore from last backup
3. Run reconciliation to sync Redis ↔ PostgreSQL after recovery
