#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# run-stress.sh — Orchestrate k6 stress tests against the flash-sale system
#
# Usage:
#   ./run-stress.sh [test]
#
# Arguments:
#   test  — which test to run: purchase-load (default), status-polling, mixed-workload, all
#
# Environment variables (all optional):
#   BASE_URL       — API base URL            (default: http://localhost:3000)
#   ADMIN_API_KEY  — Admin API key           (default: dev-admin-key-12345678)
#   INITIAL_STOCK  — Stock for purchase test (default: 100)
#   VUS            — Virtual users           (default: 1000)
#   K6_CMD         — k6 binary path          (default: auto-detect)
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K6_DIR="$(cd "${SCRIPT_DIR}/../k6" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/../../../../../infrastructure/docker" && pwd)"

TEST="${1:-purchase-load}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_API_KEY="${ADMIN_API_KEY:-dev-admin-key-12345678}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log()  { echo "[run-stress] $*"; }
fail() { echo "[run-stress] ERROR: $*" >&2; exit 1; }

find_k6() {
  if [[ -n "${K6_CMD:-}" ]]; then
    echo "${K6_CMD}"
    return
  fi

  if command -v k6 &>/dev/null; then
    echo "k6"
    return
  fi

  # Fallback: run via Docker
  echo "docker"
}

run_k6() {
  local test_file="$1"
  local k6_bin
  k6_bin="$(find_k6)"

  local env_args=(
    "-e" "BASE_URL=${BASE_URL}"
    "-e" "ADMIN_API_KEY=${ADMIN_API_KEY}"
  )

  # Forward optional env vars if set
  [[ -n "${INITIAL_STOCK:-}" ]] && env_args+=("-e" "INITIAL_STOCK=${INITIAL_STOCK}")
  [[ -n "${VUS:-}" ]]           && env_args+=("-e" "VUS=${VUS}")
  [[ -n "${TEST_SKU:-}" ]]      && env_args+=("-e" "TEST_SKU=${TEST_SKU}")
  [[ -n "${PURCHASE_VUS:-}" ]]  && env_args+=("-e" "PURCHASE_VUS=${PURCHASE_VUS}")
  [[ -n "${POLL_VUS:-}" ]]      && env_args+=("-e" "POLL_VUS=${POLL_VUS}")

  if [[ "${k6_bin}" == "docker" ]]; then
    log "Running k6 via Docker..."
    docker run --rm \
      --network host \
      -v "${K6_DIR}:/scripts:ro" \
      grafana/k6:latest run \
      "${env_args[@]}" \
      "/scripts/${test_file}"
  else
    log "Running k6 (${k6_bin})..."
    "${k6_bin}" run "${env_args[@]}" "${K6_DIR}/${test_file}"
  fi
}

# ---------------------------------------------------------------------------
# Wait for API health
# ---------------------------------------------------------------------------

wait_for_api() {
  local url="${BASE_URL}/health"
  local max_retries=30
  local retry=0

  log "Waiting for API at ${url}..."

  while [[ ${retry} -lt ${max_retries} ]]; do
    if curl -sf "${url}" >/dev/null 2>&1; then
      log "API is healthy"
      return 0
    fi
    retry=$((retry + 1))
    sleep 2
  done

  fail "API did not become healthy within ${max_retries} retries"
}

# ---------------------------------------------------------------------------
# Docker services
# ---------------------------------------------------------------------------

ensure_services() {
  if curl -sf "${BASE_URL}/health" >/dev/null 2>&1; then
    log "API already running at ${BASE_URL}"
    return 0
  fi

  log "Starting Docker services..."
  docker compose -f "${INFRA_DIR}/docker-compose.yml" up -d --build --wait

  wait_for_api
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  log "========================================="
  log "  Flash Sale Stress Test Runner"
  log "========================================="
  log ""
  log "Test:     ${TEST}"
  log "Base URL: ${BASE_URL}"
  log ""

  ensure_services

  local exit_code=0
  local has_purchases=false

  case "${TEST}" in
    purchase-load)
      run_k6 "purchase-load.test.js" || exit_code=$((exit_code | $?))
      has_purchases=true
      ;;
    status-polling)
      run_k6 "status-polling.test.js" || exit_code=$((exit_code | $?))
      ;;
    mixed-workload)
      run_k6 "mixed-workload.test.js" || exit_code=$((exit_code | $?))
      has_purchases=true
      ;;
    all)
      log "--- Running purchase-load test ---"
      run_k6 "purchase-load.test.js" || exit_code=$((exit_code | $?))

      log "--- Running status-polling test ---"
      run_k6 "status-polling.test.js" || exit_code=$((exit_code | $?))

      log "--- Running mixed-workload test ---"
      run_k6 "mixed-workload.test.js" || exit_code=$((exit_code | $?))

      has_purchases=true
      ;;
    *)
      fail "Unknown test: ${TEST}. Valid: purchase-load, status-polling, mixed-workload, all"
      ;;
  esac

  # Run invariant verification only for tests that make purchases
  if ${has_purchases}; then
    log ""
    log "--- Running post-test invariant checks ---"
    bash "${SCRIPT_DIR}/verify-invariants.sh" || exit_code=$((exit_code | $?))
  fi

  log ""
  if [[ ${exit_code} -eq 0 ]]; then
    log "ALL TESTS PASSED"
  else
    log "SOME TESTS FAILED (exit code: ${exit_code})"
  fi

  return ${exit_code}
}

main "$@"
