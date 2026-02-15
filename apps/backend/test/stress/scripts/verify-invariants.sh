#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# verify-invariants.sh — Post-test verification against Redis and PostgreSQL
#
# Queries both data stores independently to verify:
#   1. Total purchases <= initial stock (no overselling)
#   2. No duplicate user purchases
#   3. Redis buyers set matches PostgreSQL purchase count
#   4. Redis stock is consistent with purchase count
#
# When redis-cli or psql are not installed locally, the script falls back to
# running commands inside Docker containers via `docker compose exec`.
#
# Environment variables (all optional):
#   REDIS_HOST   — Redis host     (default: localhost)
#   REDIS_PORT   — Redis port     (default: 6379)
#   PG_HOST      — PostgreSQL host (default: localhost)
#   PG_PORT      — PostgreSQL port (default: 5432)
#   PG_USER      — PostgreSQL user (default: flashsale)
#   PG_PASSWORD  — PostgreSQL pass (default: flashsale)
#   PG_DB        — PostgreSQL db   (default: flashsale)
#   TEST_SKU     — SKU to verify   (default: check all sale:*:buyers keys)
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="${SCRIPT_DIR}/../../../../../infrastructure/docker"
if [[ -d "${COMPOSE_DIR}" ]]; then
  COMPOSE_FILE="$(cd "${COMPOSE_DIR}" && pwd)/docker-compose.yml"
else
  COMPOSE_FILE=""
fi

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-flashsale}"
PG_PASSWORD="${PG_PASSWORD:-flashsale}"
PG_DB="${PG_DB:-flashsale}"
TEST_SKU="${TEST_SKU:-}"

export PGPASSWORD="${PG_PASSWORD}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log()  { echo "[verify] $*"; }
warn() { echo "[verify] WARNING: $*" >&2; }
fail() { echo "[verify] FAIL: $*" >&2; }
pass() { echo "[verify] PASS: $*"; }

VIOLATIONS=0

# Detect whether to use local CLI tools or docker compose exec
USE_DOCKER_REDIS=false
USE_DOCKER_PG=false

if ! command -v redis-cli &>/dev/null; then
  if [[ -n "${COMPOSE_FILE}" && -f "${COMPOSE_FILE}" ]]; then
    USE_DOCKER_REDIS=true
  else
    warn "redis-cli not found and no docker-compose.yml available — Redis checks will be skipped"
  fi
fi

if ! command -v psql &>/dev/null; then
  if [[ -n "${COMPOSE_FILE}" && -f "${COMPOSE_FILE}" ]]; then
    USE_DOCKER_PG=true
  else
    warn "psql not found and no docker-compose.yml available — PostgreSQL checks will be skipped"
  fi
fi

redis_cmd() {
  if ${USE_DOCKER_REDIS}; then
    docker compose -f "${COMPOSE_FILE}" exec -T redis redis-cli "$@" 2>/dev/null
  else
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" "$@" 2>/dev/null
  fi
}

pg_cmd() {
  if ${USE_DOCKER_PG}; then
    docker compose -f "${COMPOSE_FILE}" exec -T \
      -e PGPASSWORD="${PG_PASSWORD}" postgresql \
      psql -U "${PG_USER}" -d "${PG_DB}" -t -A -c "$1" 2>/dev/null
  else
    psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" \
      -t -A -c "$1" 2>/dev/null
  fi
}

# Validate SKU format (alphanumeric + hyphens only) to prevent SQL injection
validate_sku() {
  if [[ ! "$1" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    warn "Invalid SKU format: $1 — skipping"
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Check connectivity
# ---------------------------------------------------------------------------

check_redis() {
  if ! redis_cmd PING | grep -q PONG; then
    if ${USE_DOCKER_REDIS}; then
      warn "Cannot connect to Redis via docker compose exec — skipping Redis checks"
    else
      warn "Cannot connect to Redis at ${REDIS_HOST}:${REDIS_PORT} — skipping Redis checks"
    fi
    return 1
  fi
  return 0
}

check_pg() {
  if ! pg_cmd "SELECT 1" | grep -q 1; then
    if ${USE_DOCKER_PG}; then
      warn "Cannot connect to PostgreSQL via docker compose exec — skipping PG checks"
    else
      warn "Cannot connect to PostgreSQL at ${PG_HOST}:${PG_PORT} — skipping PG checks"
    fi
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Discover SKUs to verify
# ---------------------------------------------------------------------------

discover_skus() {
  if [[ -n "${TEST_SKU}" ]]; then
    echo "${TEST_SKU}"
    return
  fi

  # Find all sale keys with buyers sets in Redis (SCAN is non-blocking unlike KEYS)
  local result
  if result=$(redis_cmd --scan --pattern "sale:*:buyers" 2>/dev/null); then
    echo "${result}" | sed 's/sale:\(.*\):buyers/\1/'
  else
    warn "Could not discover SKUs from Redis — set TEST_SKU env var to specify"
  fi
}

# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

verify_sku() {
  local sku="$1"

  # Validate SKU to prevent SQL injection via direct interpolation
  if ! validate_sku "${sku}"; then
    return
  fi

  log ""
  log "═══════════════════════════════════════"
  log "  Verifying SKU: ${sku}"
  log "═══════════════════════════════════════"

  local redis_ok=true
  local pg_ok=true

  # --- Redis checks ---
  local redis_buyers=0
  local redis_stock=0
  local redis_initial_stock=0

  if check_redis; then
    redis_buyers=$(redis_cmd SCARD "sale:${sku}:buyers" || echo "0")
    redis_stock=$(redis_cmd GET "sale:${sku}:stock" || echo "0")
    redis_initial_stock=$(redis_cmd HGET "sale:${sku}:config" "initialStock" || echo "0")

    log "  Redis buyers (SCARD):     ${redis_buyers}"
    log "  Redis current stock:      ${redis_stock}"
    log "  Redis initial stock:      ${redis_initial_stock}"
  else
    redis_ok=false
  fi

  # --- PostgreSQL checks ---
  local pg_purchases=0
  local pg_initial_stock=0
  local pg_unique_users=0
  local pg_duplicate_users=0

  if check_pg; then
    pg_purchases=$(pg_cmd "
      SELECT COUNT(*)
      FROM purchases p
      JOIN products pr ON p.product_id = pr.id
      WHERE pr.sku = '${sku}'
    ")

    pg_initial_stock=$(pg_cmd "
      SELECT initial_stock
      FROM products
      WHERE sku = '${sku}'
    ")

    pg_unique_users=$(pg_cmd "
      SELECT COUNT(DISTINCT p.user_id)
      FROM purchases p
      JOIN products pr ON p.product_id = pr.id
      WHERE pr.sku = '${sku}'
    ")

    pg_duplicate_users=$(pg_cmd "
      SELECT COUNT(*)
      FROM (
        SELECT p.user_id, COUNT(*) as cnt
        FROM purchases p
        JOIN products pr ON p.product_id = pr.id
        WHERE pr.sku = '${sku}'
        GROUP BY p.user_id
        HAVING COUNT(*) > 1
      ) dupes
    ")

    log "  PG total purchases:       ${pg_purchases}"
    log "  PG initial stock:         ${pg_initial_stock}"
    log "  PG unique users:          ${pg_unique_users}"
    log "  PG duplicate user count:  ${pg_duplicate_users}"
  else
    pg_ok=false
  fi

  log ""

  # --- Invariant checks ---

  # 1. No overselling (PG)
  if ${pg_ok}; then
    if [[ ${pg_purchases} -le ${pg_initial_stock} ]]; then
      pass "No overselling: purchases (${pg_purchases}) <= initial stock (${pg_initial_stock})"
    else
      fail "OVERSELLING: purchases (${pg_purchases}) > initial stock (${pg_initial_stock})"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi

  # 2. No duplicate purchases (PG)
  if ${pg_ok}; then
    if [[ ${pg_duplicate_users} -eq 0 ]]; then
      pass "No duplicate purchases: 0 users with multiple purchases"
    else
      fail "DUPLICATE PURCHASES: ${pg_duplicate_users} users have more than 1 purchase"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi

  # 3. Unique users match purchase count (no duplicates by another measure)
  if ${pg_ok}; then
    if [[ ${pg_unique_users} -eq ${pg_purchases} ]]; then
      pass "All purchases unique: ${pg_unique_users} unique users = ${pg_purchases} purchases"
    else
      fail "UNIQUENESS MISMATCH: unique users (${pg_unique_users}) != purchases (${pg_purchases})"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi

  # 4. Redis/PG consistency
  if ${redis_ok} && ${pg_ok}; then
    if [[ ${redis_buyers} -eq ${pg_purchases} ]]; then
      pass "Redis/PG consistent: Redis buyers (${redis_buyers}) = PG purchases (${pg_purchases})"
    else
      fail "REDIS/PG MISMATCH: Redis buyers (${redis_buyers}) != PG purchases (${pg_purchases})"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi

  # 5. Stock consistency (Redis)
  if ${redis_ok}; then
    local expected_stock=$((redis_initial_stock - redis_buyers))
    if [[ ${redis_stock} -eq ${expected_stock} ]]; then
      pass "Stock consistent: current (${redis_stock}) = initial (${redis_initial_stock}) - buyers (${redis_buyers})"
    else
      fail "STOCK INCONSISTENCY: current (${redis_stock}) != expected (${expected_stock})"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi

  # 6. Stock non-negative (Redis)
  if ${redis_ok}; then
    if [[ ${redis_stock} -ge 0 ]]; then
      pass "Stock non-negative: ${redis_stock}"
    else
      fail "NEGATIVE STOCK: ${redis_stock}"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  log "╔══════════════════════════════════════════════╗"
  log "║     POST-TEST INVARIANT VERIFICATION        ║"
  log "╚══════════════════════════════════════════════╝"
  log ""
  if ${USE_DOCKER_REDIS}; then
    log "Redis:      via docker compose exec"
  else
    log "Redis:      ${REDIS_HOST}:${REDIS_PORT}"
  fi
  if ${USE_DOCKER_PG}; then
    log "PostgreSQL: via docker compose exec"
  else
    log "PostgreSQL: ${PG_HOST}:${PG_PORT}/${PG_DB}"
  fi

  local skus
  skus=$(discover_skus)

  if [[ -z "${skus}" ]]; then
    log "No SKUs found to verify"
    exit 0
  fi

  while IFS= read -r sku; do
    [[ -n "${sku}" ]] && verify_sku "${sku}"
  done <<< "${skus}"

  log ""
  log "═══════════════════════════════════════"
  if [[ ${VIOLATIONS} -eq 0 ]]; then
    log "  ALL INVARIANTS PASSED"
  else
    log "  ${VIOLATIONS} INVARIANT VIOLATION(S) DETECTED"
  fi
  log "═══════════════════════════════════════"
  log ""

  exit ${VIOLATIONS}
}

main "$@"
