#!/usr/bin/env bash
# =============================================================================
# scripts/run-benchmark.sh
#
# Orchestrates the full RPS sweep (Phase 0) and sustained tests (Phase 26–27).
# Produces a benchmark-results/test-NNN/ directory for each run.
#
# DO NOT MODIFY production code before running this.
# This is a measurement-only script.
#
# Prerequisites:
#   - k6 installed: https://grafana.com/docs/k6/latest/get-started/installation/
#   - kubectl configured against the target cluster
#   - aws CLI configured
#   - tests/load/k6/data.json present (run validate-data.js first)
#   - env vars set (see REQUIRED VARS below)
#
# Usage:
#   TEST_ID=test-001 \
#   BASE_URL=https://api.motionmesh.io \
#   PROMETHEUS_URL=http://prometheus.monitoring.svc:9090 \
#   AWS_REGION=us-east-1 \
#   ALB_ARN=arn:aws:... \
#   REDIS_CLUSTER_ID=motionmesh-redis \
#   AURORA_CLUSTER_ID=motionmesh-aurora \
#   NAMESPACE=motionmesh \
#   TEST_TYPE=sweep \
#   bash scripts/run-benchmark.sh
#
# TEST_TYPE options:
#   sweep     — Phase 0 RPS sweep (1K,5K,10K,12.5K,15K,16667,18K,20K)
#   sustained — Phase 26 16,667 RPS for 10min, 30min, 60min
#   concurrency — Phase 27 50K/100K VU ramp
#   sdk       — Phase 28 SDK vs HTTP comparison
# =============================================================================
set -euo pipefail

TEST_ID="${TEST_ID:?TEST_ID required}"
BASE_URL="${BASE_URL:?BASE_URL required}"
PROMETHEUS_URL="${PROMETHEUS_URL:?PROMETHEUS_URL required}"
AWS_REGION="${AWS_REGION:?AWS_REGION required}"
ALB_ARN="${ALB_ARN:?ALB_ARN required}"
REDIS_CLUSTER_ID="${REDIS_CLUSTER_ID:?REDIS_CLUSTER_ID required}"
AURORA_CLUSTER_ID="${AURORA_CLUSTER_ID:?AURORA_CLUSTER_ID required}"
NAMESPACE="${NAMESPACE:-motionmesh}"
TEST_TYPE="${TEST_TYPE:-sweep}"
K6_DIR="tests/load/k6"

OUT_DIR="benchmark-results/${TEST_ID}"
mkdir -p "${OUT_DIR}"

GIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "NOT_MEASURED")
TERRAFORM_VERSION=$(terraform version -json 2>/dev/null | jq -r '.terraform_version' || echo "NOT_MEASURED")
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "==================================================================="
echo "  MotionMesh Benchmark Runner"
echo "  Test ID    : ${TEST_ID}"
echo "  Git SHA    : ${GIT_SHA}"
echo "  Type       : ${TEST_TYPE}"
echo "  Target     : ${BASE_URL}"
echo "  Output     : ${OUT_DIR}"
echo "==================================================================="

# Write workload.json stub
cat > "${OUT_DIR}/workload.json" <<EOF
{
  "_schema": "motionmesh-benchmark-workload-v1",
  "test_id": "${TEST_ID}",
  "git_sha": "${GIT_SHA}",
  "terraform_version": "${TERRAFORM_VERSION}",
  "aws_region": "${AWS_REGION}",
  "timestamp_utc": "${TIMESTAMP}",
  "test_type": "${TEST_TYPE}",
  "workload": {
    "load_generator_saturated": false
  }
}
EOF

# ─── Validate load generator ──────────────────────────────────────────────────
echo ""
echo "==> Phase 19 — Load generator health check"
echo "    CPU:    $(top -bn1 | grep '%Cpu' | awk '{print $2}')% used"
echo "    Mem:    $(free -m | awk '/Mem:/{print $3}')MB used"
echo "    Ulimit: $(ulimit -n) open files"

# Check ephemeral port exhaustion
SS_STATS=$(ss -s 2>/dev/null | head -5 || echo "ss not available")
echo "    Sockets: ${SS_STATS}"

# ─── Run tests by type ────────────────────────────────────────────────────────

run_k6() {
  local script="$1"
  local extra_env="$2"
  local suffix="$3"
  local out="${OUT_DIR}/k6-summary${suffix}.json"
  
  WINDOW_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  
  echo ""
  echo "--> Running k6: ${script} ${extra_env}"
  k6 run \
    -e "BASE_URL=${BASE_URL}" \
    ${extra_env} \
    --summary-export "${out}" \
    "${K6_DIR}/${script}" || true
  
  WINDOW_END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  
  echo "--> Collecting metrics for window ${WINDOW_START} → ${WINDOW_END}"
  TEST_ID="${TEST_ID}" \
  NAMESPACE="${NAMESPACE}" \
  PROMETHEUS_URL="${PROMETHEUS_URL}" \
  AWS_REGION="${AWS_REGION}" \
  ALB_ARN="${ALB_ARN}" \
  REDIS_CLUSTER_ID="${REDIS_CLUSTER_ID}" \
  AURORA_CLUSTER_ID="${AURORA_CLUSTER_ID}" \
  WINDOW_START="${WINDOW_START}" \
  WINDOW_END="${WINDOW_END}" \
  bash scripts/collect-metrics.sh
}

case "${TEST_TYPE}" in
  sweep)
    echo ""
    echo "==> Phase 0 — RPS Sweep"
    echo "    Targets: 1K 5K 10K 12.5K 15K 16,667 18K 20K"
    run_k6 "baseline-rps-sweep.js" "" ""
    ;;

  sustained)
    echo ""
    echo "==> Phase 26 — Sustained 1M RPM (16,667 RPS)"
    echo "    Running 10min → 30min → 60min"
    for DURATION in 10m 30m 60m; do
      SUFFIX="_${DURATION}"
      run_k6 "api-1m-rpm-sustained.js" "-e RPS_TARGET=16667 -e DURATION=${DURATION}" "${SUFFIX}"
    done
    ;;

  concurrency)
    echo ""
    echo "==> Phase 27 — Concurrent Users (50K/100K)"
    run_k6 "concurrency-100k.js" "" ""
    ;;

  sdk)
    echo ""
    echo "==> Phase 28 — SDK vs direct HTTP comparison"
    run_k6 "sdk-http.js" "" ""
    ;;

  *)
    echo "ERROR: Unknown TEST_TYPE '${TEST_TYPE}'. Use: sweep|sustained|concurrency|sdk" >&2
    exit 1
    ;;
esac

# ─── Classify bottleneck ──────────────────────────────────────────────────────
echo ""
echo "==> Bottleneck classification"

# Copy template analysis.md if not exists
[[ -f "${OUT_DIR}/analysis.md" ]] || cp benchmark-results/template/analysis.md "${OUT_DIR}/analysis.md"
sed -i "s/{{TEST_ID}}/${TEST_ID}/g" "${OUT_DIR}/analysis.md"

TEST_ID="${TEST_ID}" bash scripts/analyze-bottleneck.sh

# ─── Append to comparison.csv ─────────────────────────────────────────────────
echo ""
echo "==> Appending to comparison.csv"
K6_RPS=$(jq -r '.metrics.http_reqs.rate // "NOT_MEASURED"' "${OUT_DIR}/k6-summary.json" 2>/dev/null || echo "NOT_MEASURED")
K6_ERROR=$(jq -r '.metrics.http_req_failed.rate // "NOT_MEASURED"' "${OUT_DIR}/k6-summary.json" 2>/dev/null || echo "NOT_MEASURED")
K6_P50=$(jq -r '.metrics.http_req_duration.med // "NOT_MEASURED"' "${OUT_DIR}/k6-summary.json" 2>/dev/null || echo "NOT_MEASURED")
K6_P95=$(jq -r '.metrics.http_req_duration["p(95)"] // "NOT_MEASURED"' "${OUT_DIR}/k6-summary.json" 2>/dev/null || echo "NOT_MEASURED")
K6_P99=$(jq -r '.metrics.http_req_duration["p(99)"] // "NOT_MEASURED"' "${OUT_DIR}/k6-summary.json" 2>/dev/null || echo "NOT_MEASURED")
BOTTLENECK=$(grep "Primary Bottleneck:" "${OUT_DIR}/analysis.md" | tail -1 | awk '{print $NF}' || echo "NOT_MEASURED")
AURORA_CPU=$(jq -r '.aurora_postgres.CPUUtilization_avg_pct // "NOT_MEASURED"' "${OUT_DIR}/cloudwatch.json" 2>/dev/null || echo "NOT_MEASURED")
REDIS_CPU=$(jq -r '.elasticache_redis.EngineCPUUtilization_avg_pct // "NOT_MEASURED"' "${OUT_DIR}/cloudwatch.json" 2>/dev/null || echo "NOT_MEASURED")

echo "${TEST_ID},${GIT_SHA},${TIMESTAMP},NOT_MEASURED,${K6_RPS},NOT_MEASURED,NOT_MEASURED,${K6_ERROR},NOT_MEASURED,NOT_MEASURED,${K6_P95},${K6_P99},NOT_MEASURED,NOT_MEASURED,NOT_MEASURED,${REDIS_CPU},${AURORA_CPU},NOT_MEASURED,${BOTTLENECK},NOT_MEASURED,NOT_MEASURED" >> benchmark-results/comparison.csv

echo ""
echo "====================================================================="
echo "  ✓ Benchmark complete"
echo "  Output: ${OUT_DIR}/"
echo "    workload.json"
echo "    k6-summary.json"
echo "    cloudwatch.json"
echo "    prometheus.json"
echo "    kubernetes.json"
echo "    analysis.md"
echo ""
echo "  Next steps:"
echo "    1. Review analysis.md — identify PRIMARY bottleneck"
echo "    2. Make ONE targeted fix"
echo "    3. Re-run: TEST_ID=test-$(printf '%03d' $((${TEST_ID##test-} + 1))) bash scripts/run-benchmark.sh"
echo "    4. Compare: bash scripts/compare-results.sh ${TEST_ID} test-$(printf '%03d' $((${TEST_ID##test-} + 1)))"
echo "====================================================================="
