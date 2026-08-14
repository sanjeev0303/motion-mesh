#!/usr/bin/env bash
# =============================================================================
# scripts/analyze-bottleneck.sh
#
# Reads benchmark-results/TEST_ID/{cloudwatch,prometheus,kubernetes}.json
# and emits a bottleneck classification to analysis.md.
#
# This script performs CLASSIFICATION only — it never changes code.
# All thresholds are documented. Only measured values trigger classification.
#
# Usage:
#   TEST_ID=test-001 bash scripts/analyze-bottleneck.sh
# =============================================================================
set -euo pipefail

TEST_ID="${TEST_ID:?TEST_ID required}"
OUT_DIR="benchmark-results/${TEST_ID}"

if [[ ! -d "${OUT_DIR}" ]]; then
  echo "ERROR: ${OUT_DIR} does not exist. Run collect-metrics.sh first." >&2
  exit 1
fi

# ─── Parse measured values ───────────────────────────────────────────────────
jqf() { jq -r "$1" "${OUT_DIR}/$2" 2>/dev/null || echo "NOT_MEASURED"; }

# CloudWatch
ALB_5XX=$(jqf '.alb.HTTPCode_Target_5XX_Count' cloudwatch.json)
ALB_REJECTED=$(jqf '.alb.RejectedConnectionCount' cloudwatch.json)
ALB_P99=$(jqf '.alb.TargetResponseTime_p99' cloudwatch.json)
REDIS_CPU=$(jqf '.elasticache_redis.CPUUtilization_avg_pct' cloudwatch.json)
REDIS_ENGINE_CPU=$(jqf '.elasticache_redis.EngineCPUUtilization_avg_pct' cloudwatch.json)
REDIS_EVICTIONS=$(jqf '.elasticache_redis.Evictions' cloudwatch.json)
REDIS_SWAP=$(jqf '.elasticache_redis.SwapUsage_bytes' cloudwatch.json)
AURORA_CPU=$(jqf '.aurora_postgres.CPUUtilization_avg_pct' cloudwatch.json)
AURORA_CONNS=$(jqf '.aurora_postgres.DatabaseConnections_max' cloudwatch.json)

# Prometheus
PROM_ERROR_RATE=$(jqf '.request_metrics.error_rate' prometheus.json)
PROM_P99=$(jqf '.request_metrics.p99_ms' prometheus.json)
AUTH_DB_PCT=$(jqf '.auth.db_fallback_rps' prometheus.json)
LU_DEPTH=$(jqf '.last_used.queue_depth_avg' prometheus.json)
LU_DROPPED=$(jqf '.last_used.dropped_rps' prometheus.json)
GC_PAUSE=$(jqf '.go_runtime.gc_pause_p99_s' prometheus.json)
GOROUTINES=$(jqf '.go_runtime.goroutines_avg' prometheus.json)

# Kubernetes
API_RESTARTS=$(jqf '.api_pods.restarts_total' kubernetes.json)
HPA_DESIRED=$(jqf '.hpa.api.desired_replicas' kubernetes.json)
HPA_CURRENT=$(jqf '.hpa.api.current_replicas' kubernetes.json)

# k6
K6_ERROR_RATE=$(jqf '.metrics.http_req_failed.rate' k6-summary.json)
K6_P99=$(jqf '.metrics.http_req_duration.p99' k6-summary.json)
K6_DROPPED=$(jqf '.metrics.dropped_iterations.count' k6-summary.json)

# ─── Bottleneck classification logic ─────────────────────────────────────────
# Rules (in priority order):
# 1. If load generator is saturated — LOAD_GENERATOR (check workload.json)
# 2. If ALB 5xx or rejected conn > 0 at scale — ALB candidate
# 3. If Aurora CPU > 80% — AURORA_CPU candidate
# 4. If Redis EngineCPU > 80% or Evictions > 0 — REDIS candidate
# 5. If API CPU throttle > 25% — API_CPU candidate
# 6. If HPA desired > current (HPA lag) — HPA candidate
# 7. If GC pause > 50ms p99 — GO_RUNTIME candidate
# 8. If auth DB fallback rate is dominant (>10% of auth) — AUTHENTICATION candidate

PRIMARY="NOT_MEASURED"
EVIDENCE=""

# LOAD_GENERATOR check
LG_SATURATED=$(jqf '.workload.load_generator_saturated' workload.json)
if [[ "${LG_SATURATED}" == "true" ]]; then
  PRIMARY="LOAD_GENERATOR"
  EVIDENCE="load_generator_saturated=true in workload.json. Do NOT optimize MotionMesh. Add load generator nodes."
fi

# ALB
if [[ "${PRIMARY}" == "NOT_MEASURED" && "${ALB_REJECTED}" != "NOT_MEASURED" ]]; then
  if (( $(echo "${ALB_REJECTED} > 0" | bc -l 2>/dev/null || echo 0) )); then
    PRIMARY="ALB"
    EVIDENCE="RejectedConnectionCount=${ALB_REJECTED}. Investigate ALB listener limits."
  fi
fi

# Aurora CPU
if [[ "${PRIMARY}" == "NOT_MEASURED" && "${AURORA_CPU}" != "NOT_MEASURED" ]]; then
  if (( $(echo "${AURORA_CPU} > 80" | bc -l 2>/dev/null || echo 0) )); then
    PRIMARY="AURORA_CPU"
    EVIDENCE="Aurora CPUUtilization=${AURORA_CPU}% (>80%). Run Performance Insights to identify top SQL."
  fi
fi

# Redis
if [[ "${PRIMARY}" == "NOT_MEASURED" && "${REDIS_ENGINE_CPU}" != "NOT_MEASURED" ]]; then
  if (( $(echo "${REDIS_ENGINE_CPU} > 80" | bc -l 2>/dev/null || echo 0) )); then
    PRIMARY="REDIS"
    EVIDENCE="Redis EngineCPUUtilization=${REDIS_ENGINE_CPU}% (>80%). Identify top Redis commands."
  fi
fi

# HPA lag
if [[ "${PRIMARY}" == "NOT_MEASURED" && "${HPA_DESIRED}" != "NOT_MEASURED" && "${HPA_CURRENT}" != "NOT_MEASURED" ]]; then
  HPA_LAG=$(echo "${HPA_DESIRED} - ${HPA_CURRENT}" | bc 2>/dev/null || echo 0)
  if (( $(echo "${HPA_LAG} > 2" | bc -l 2>/dev/null || echo 0) )); then
    PRIMARY="HPA"
    EVIDENCE="HPA desired=${HPA_DESIRED} current=${HPA_CURRENT}. HPA is lagging by ${HPA_LAG} replicas."
  fi
fi

# GO_RUNTIME
if [[ "${PRIMARY}" == "NOT_MEASURED" && "${GC_PAUSE}" != "NOT_MEASURED" ]]; then
  GC_MS=$(echo "${GC_PAUSE} * 1000" | bc 2>/dev/null || echo 0)
  if (( $(echo "${GC_MS} > 50" | bc -l 2>/dev/null || echo 0) )); then
    PRIMARY="GO_RUNTIME"
    EVIDENCE="GC pause p99=${GC_MS}ms (>50ms). Profile allocations before tuning GC."
  fi
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  BOTTLENECK CLASSIFICATION — ${TEST_ID}              "
echo "╠══════════════════════════════════════════════════════╣"
echo "║  PRIMARY BOTTLENECK : ${PRIMARY}"
echo "║  EVIDENCE           : ${EVIDENCE}"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  SUBSYSTEM SUMMARY                                   "
echo "║  ALB            : 5xx=${ALB_5XX} rejected=${ALB_REJECTED}"
echo "║  REDIS          : cpu=${REDIS_CPU}% engine_cpu=${REDIS_ENGINE_CPU}% evictions=${REDIS_EVICTIONS}"
echo "║  AURORA         : cpu=${AURORA_CPU}% conns=${AURORA_CONNS}"
echo "║  HPA            : desired=${HPA_DESIRED} current=${HPA_CURRENT}"
echo "║  GO_RUNTIME     : gc_pause_p99=${GC_PAUSE}s goroutines=${GOROUTINES}"
echo "║  AUTH_DB_FALLBK : ${AUTH_DB_PCT} rps"
echo "║  LAST_USED_QUEUE: depth=${LU_DEPTH} dropped=${LU_DROPPED}"
echo "║  API_RESTARTS   : ${API_RESTARTS}"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  k6 RESULTS                                         "
echo "║  error_rate=${K6_ERROR_RATE} p99=${K6_P99}ms dropped=${K6_DROPPED}"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Append classification to analysis.md
ANALYSIS_FILE="${OUT_DIR}/analysis.md"
if [[ -f "${ANALYSIS_FILE}" ]]; then
  cat >> "${ANALYSIS_FILE}" <<EOF

---
## Auto-Classification Result ($(date -u +%Y-%m-%dT%H:%M:%SZ))

**Primary Bottleneck:** ${PRIMARY}
**Evidence:** ${EVIDENCE}

### Key Metrics at Classification Time
| Subsystem | Metric | Value |
|---|---|---|
| ALB | 5xx | ${ALB_5XX} |
| ALB | RejectedConnections | ${ALB_REJECTED} |
| Redis | EngineCPU | ${REDIS_ENGINE_CPU}% |
| Aurora | CPU | ${AURORA_CPU}% |
| Aurora | Connections | ${AURORA_CONNS} |
| HPA | Desired | ${HPA_DESIRED} |
| HPA | Current | ${HPA_CURRENT} |
| Go Runtime | GC Pause p99 | ${GC_PAUSE}s |
| k6 | Error Rate | ${K6_ERROR_RATE} |
| k6 | p99 | ${K6_P99}ms |
EOF
  echo "✓ Classification appended to ${ANALYSIS_FILE}"
fi
