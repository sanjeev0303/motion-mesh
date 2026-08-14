#!/usr/bin/env bash
# =============================================================================
# scripts/compare-results.sh
#
# Compare two test runs side-by-side. Prints a before/after table and
# appends a regression row to comparison.csv.
#
# Usage:
#   bash scripts/compare-results.sh test-001 test-002
# =============================================================================
set -euo pipefail

BEFORE="${1:?Usage: compare-results.sh <before-test-id> <after-test-id>}"
AFTER="${2:?Usage: compare-results.sh <before-test-id> <after-test-id>}"

BEFORE_DIR="benchmark-results/${BEFORE}"
AFTER_DIR="benchmark-results/${AFTER}"

for d in "${BEFORE_DIR}" "${AFTER_DIR}"; do
  if [[ ! -d "${d}" ]]; then
    echo "ERROR: ${d} does not exist" >&2
    exit 1
  fi
done

jqf() { jq -r "$1" "${2}" 2>/dev/null || echo "NOT_MEASURED"; }

# ─── Extract values ───────────────────────────────────────────────────────────
B_RPS=$(jqf '.metrics.http_reqs.rate' "${BEFORE_DIR}/k6-summary.json")
A_RPS=$(jqf '.metrics.http_reqs.rate' "${AFTER_DIR}/k6-summary.json")

B_P50=$(jqf '.metrics.http_req_duration.med' "${BEFORE_DIR}/k6-summary.json")
A_P50=$(jqf '.metrics.http_req_duration.med' "${AFTER_DIR}/k6-summary.json")

B_P95=$(jqf '.metrics.http_req_duration["p(95)"]' "${BEFORE_DIR}/k6-summary.json")
A_P95=$(jqf '.metrics.http_req_duration["p(95)"]' "${AFTER_DIR}/k6-summary.json")

B_P99=$(jqf '.metrics.http_req_duration["p(99)"]' "${BEFORE_DIR}/k6-summary.json")
A_P99=$(jqf '.metrics.http_req_duration["p(99)"]' "${AFTER_DIR}/k6-summary.json")

B_ERR=$(jqf '.metrics.http_req_failed.rate' "${BEFORE_DIR}/k6-summary.json")
A_ERR=$(jqf '.metrics.http_req_failed.rate' "${AFTER_DIR}/k6-summary.json")

B_REDIS_CPU=$(jqf '.elasticache_redis.EngineCPUUtilization_avg_pct' "${BEFORE_DIR}/cloudwatch.json")
A_REDIS_CPU=$(jqf '.elasticache_redis.EngineCPUUtilization_avg_pct' "${AFTER_DIR}/cloudwatch.json")

B_AURORA_CPU=$(jqf '.aurora_postgres.CPUUtilization_avg_pct' "${BEFORE_DIR}/cloudwatch.json")
A_AURORA_CPU=$(jqf '.aurora_postgres.CPUUtilization_avg_pct' "${AFTER_DIR}/cloudwatch.json")

B_GOROUTINES=$(jqf '.go_runtime.goroutines_avg' "${BEFORE_DIR}/prometheus.json")
A_GOROUTINES=$(jqf '.go_runtime.goroutines_avg' "${AFTER_DIR}/prometheus.json")

B_HEAP=$(jqf '.go_runtime.heap_alloc_bytes' "${BEFORE_DIR}/prometheus.json")
A_HEAP=$(jqf '.go_runtime.heap_alloc_bytes' "${AFTER_DIR}/prometheus.json")

B_BOTTLENECK=$(grep "Primary Bottleneck:" "${BEFORE_DIR}/analysis.md" 2>/dev/null | tail -1 | awk '{print $NF}' || echo "NOT_MEASURED")
A_BOTTLENECK=$(grep "Primary Bottleneck:" "${AFTER_DIR}/analysis.md" 2>/dev/null | tail -1 | awk '{print $NF}' || echo "NOT_MEASURED")

# ─── Delta calculation ────────────────────────────────────────────────────────
delta() {
  local before="$1" after="$2" direction="$3"  # direction: higher_better | lower_better
  if [[ "${before}" == "NOT_MEASURED" || "${after}" == "NOT_MEASURED" ]]; then
    echo "NOT_MEASURED"
    return
  fi
  local diff pct
  diff=$(echo "${after} - ${before}" | bc 2>/dev/null || echo "0")
  if (( $(echo "${before} != 0" | bc -l 2>/dev/null || echo 0) )); then
    pct=$(echo "scale=1; ${diff} * 100 / ${before}" | bc 2>/dev/null || echo "?")
  else
    pct="inf"
  fi
  
  if [[ "${direction}" == "higher_better" ]]; then
    (( $(echo "${diff} > 0" | bc -l 2>/dev/null || echo 0) )) && echo "+${pct}% ✓" || echo "${pct}% ✗"
  else
    (( $(echo "${diff} < 0" | bc -l 2>/dev/null || echo 0) )) && echo "${pct}% ✓" || echo "+${pct}% ✗"
  fi
}

# ─── Print comparison table ───────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  BEFORE/AFTER COMPARISON"
echo "║  BEFORE: ${BEFORE}   AFTER: ${AFTER}"
echo "╠════════════════════╦═════════════════╦═════════════════╦════════════╣"
printf "║ %-18s ║ %-15s ║ %-15s ║ %-10s ║\n" "METRIC" "${BEFORE}" "${AFTER}" "DELTA"
echo "╠════════════════════╬═════════════════╬═════════════════╬════════════╣"
printf "║ %-18s ║ %-15s ║ %-15s ║ %-10s ║\n" "RPS" "${B_RPS}" "${A_RPS}" "$(delta "${B_RPS}" "${A_RPS}" higher_better)"
printf "║ %-18s ║ %-15s ║ %-15s ║ %-10s ║\n" "p50 (ms)" "${B_P50}" "${A_P50}" "$(delta "${B_P50}" "${A_P50}" lower_better)"
printf "║ %-18s ║ %-15s ║ %-15s ║ %-10s ║\n" "p95 (ms)" "${B_P95}" "${A_P95}" "$(delta "${B_P95}" "${A_P95}" lower_better)"
printf "║ %-18s ║ %-15s ║ %-15s ║ %-10s ║\n" "p99 (ms)" "${B_P99}" "${A_P99}" "$(delta "${B_P99}" "${A_P99}" lower_better)"
printf "║ %-18s ║ %-15s ║ %-15s ║ %-10s ║\n" "Error rate" "${B_ERR}" "${A_ERR}" "$(delta "${B_ERR}" "${A_ERR}" lower_better)"
printf "║ %-18s ║ %-15s ║ %-15s ║ %-10s ║\n" "Redis engine CPU%" "${B_REDIS_CPU}" "${A_REDIS_CPU}" "$(delta "${B_REDIS_CPU}" "${A_REDIS_CPU}" lower_better)"
printf "║ %-18s ║ %-15s ║ %-15s ║ %-10s ║\n" "Aurora CPU%" "${B_AURORA_CPU}" "${A_AURORA_CPU}" "$(delta "${B_AURORA_CPU}" "${A_AURORA_CPU}" lower_better)"
printf "║ %-18s ║ %-15s ║ %-15s ║ %-10s ║\n" "Goroutines" "${B_GOROUTINES}" "${A_GOROUTINES}" "$(delta "${B_GOROUTINES}" "${A_GOROUTINES}" lower_better)"
printf "║ %-18s ║ %-15s ║ %-15s ║ %-10s ║\n" "Heap (bytes)" "${B_HEAP}" "${A_HEAP}" "$(delta "${B_HEAP}" "${A_HEAP}" lower_better)"
echo "╠════════════════════╩═════════════════╩═════════════════╩════════════╣"
printf "║ %-18s   %-15s → %-15s %s\n" "BOTTLENECK" "${B_BOTTLENECK}" "${A_BOTTLENECK}" "║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "ACCEPT or REVERT? Improvement requires:"
echo "  - Higher RPS OR lower p95 OR lower p99 OR lower error rate"
echo "  - Without significantly degrading another subsystem"
echo ""
echo "Record decision in benchmark-results/${AFTER}/analysis.md → 'Accept / Revert'"
