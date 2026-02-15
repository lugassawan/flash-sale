#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# run-stability.sh — Run stress tests N consecutive times to prove stability
#
# Proves the "5+ consecutive runs" success criterion by aggregating pass/fail
# results across multiple runs.
#
# Usage:
#   ./run-stability.sh [runs] [test]
#
# Arguments:
#   runs — number of consecutive runs (default: 5)
#   test — which test to run (default: purchase-load)
#
# All environment variables from run-stress.sh are forwarded automatically.
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RUNS="${1:-5}"
TEST="${2:-purchase-load}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { echo "[stability] $*"; }

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  log "========================================="
  log "  Flash Sale Stability Test"
  log "========================================="
  log ""
  log "Test:  ${TEST}"
  log "Runs:  ${RUNS}"
  log ""

  local passed=0
  local failed=0
  local results=()

  for i in $(seq 1 "${RUNS}"); do
    log "=== Run ${i}/${RUNS} ==="

    if bash "${SCRIPT_DIR}/run-stress.sh" "${TEST}"; then
      passed=$((passed + 1))
      results+=("PASS")
      log "=== Run ${i}/${RUNS}: PASSED ==="
    else
      failed=$((failed + 1))
      results+=("FAIL")
      log "=== Run ${i}/${RUNS}: FAILED ==="
    fi

    # Cooldown between runs to let resources settle
    local cooldown="${COOLDOWN:-5}"
    if [[ ${i} -lt ${RUNS} && ${cooldown} -gt 0 ]]; then
      log "Cooling down for ${cooldown}s..."
      sleep "${cooldown}"
    fi

    log ""
  done

  # Print summary
  log "========================================="
  log "  Stability Results"
  log "========================================="
  log ""

  for i in $(seq 0 $((RUNS - 1))); do
    log "  Run $((i + 1)): ${results[$i]}"
  done

  log ""
  log "  Passed: ${passed}/${RUNS}"
  log "  Failed: ${failed}/${RUNS}"
  log ""

  if [[ ${failed} -eq 0 ]]; then
    log "ALL ${RUNS} RUNS PASSED — stability verified"
  else
    log "STABILITY CHECK FAILED — ${failed} run(s) failed"
  fi

  log "========================================="

  exit "${failed}"
}

main "$@"
