#!/usr/bin/env bash
# =============================================================================
# scripts/collect-metrics.sh
#
# Snapshot CloudWatch + Prometheus + Kubernetes metrics for a benchmark test.
# Must be run DURING or immediately AFTER a k6 load test.
#
# Usage:
#   TEST_ID=test-001 \
#   NAMESPACE=motionmesh \
#   PROMETHEUS_URL=http://prometheus.monitoring.svc:9090 \
#   AWS_REGION=us-east-1 \
#   ALB_ARN=arn:aws:... \
#   REDIS_CLUSTER_ID=motionmesh-redis \
#   AURORA_CLUSTER_ID=motionmesh-aurora \
#   WINDOW_START="2026-08-14T10:00:00" \
#   WINDOW_END="2026-08-14T10:30:00" \
#   bash scripts/collect-metrics.sh
# =============================================================================
set -euo pipefail

TEST_ID="${TEST_ID:?TEST_ID required}"
NAMESPACE="${NAMESPACE:-motionmesh}"
PROMETHEUS_URL="${PROMETHEUS_URL:?PROMETHEUS_URL required}"
AWS_REGION="${AWS_REGION:?AWS_REGION required}"
ALB_ARN="${ALB_ARN:?ALB_ARN required}"
REDIS_CLUSTER_ID="${REDIS_CLUSTER_ID:?REDIS_CLUSTER_ID required}"
AURORA_CLUSTER_ID="${AURORA_CLUSTER_ID:?AURORA_CLUSTER_ID required}"
WINDOW_START="${WINDOW_START:?WINDOW_START required (ISO8601)}"
WINDOW_END="${WINDOW_END:?WINDOW_END required (ISO8601)}"

OUT_DIR="benchmark-results/${TEST_ID}"
mkdir -p "${OUT_DIR}"

echo "==> Collecting metrics for ${TEST_ID} into ${OUT_DIR}"

# ─── Helpers ──────────────────────────────────────────────────────────────────

cw_stat() {
  # cw_stat NAMESPACE METRIC_NAME STAT DIMENSIONS_JSON
  local ns="$1" metric="$2" stat="$3" dims="$4"
  aws cloudwatch get-metric-statistics \
    --region "${AWS_REGION}" \
    --namespace "${ns}" \
    --metric-name "${metric}" \
    --start-time "${WINDOW_START}" \
    --end-time "${WINDOW_END}" \
    --period 60 \
    --statistics "${stat}" \
    --dimensions "${dims}" \
    --output json 2>/dev/null | jq -r '.Datapoints | sort_by(.Timestamp) | last | .'"${stat}"' // "NOT_MEASURED"'
}

prom_query() {
  # prom_query PROMQL
  local query="$1"
  curl -sf "${PROMETHEUS_URL}/api/v1/query_range" \
    --data-urlencode "query=${query}" \
    --data-urlencode "start=${WINDOW_START}" \
    --data-urlencode "end=${WINDOW_END}" \
    --data-urlencode "step=60s" \
    2>/dev/null | jq -r '.data.result[0].values | last | .[1] // "NOT_MEASURED"'
}

ALB_SUFFIX=$(echo "${ALB_ARN}" | sed 's|.*loadbalancer/||')

# ─── 1. CloudWatch — ALB ──────────────────────────────────────────────────────
echo "  -> CloudWatch ALB"
ALB_DIMS="Name=LoadBalancer,Value=${ALB_SUFFIX}"

ALB_REQUEST_COUNT=$(cw_stat "AWS/ApplicationELB" "RequestCount" "Sum" "${ALB_DIMS}")
ALB_TARGET_RESP_P95=$(cw_stat "AWS/ApplicationELB" "TargetResponseTime" "p95" "${ALB_DIMS}")
ALB_TARGET_RESP_P99=$(cw_stat "AWS/ApplicationELB" "TargetResponseTime" "p99" "${ALB_DIMS}")
ALB_2XX=$(cw_stat "AWS/ApplicationELB" "HTTPCode_Target_2XX_Count" "Sum" "${ALB_DIMS}")
ALB_4XX=$(cw_stat "AWS/ApplicationELB" "HTTPCode_Target_4XX_Count" "Sum" "${ALB_DIMS}")
ALB_5XX=$(cw_stat "AWS/ApplicationELB" "HTTPCode_Target_5XX_Count" "Sum" "${ALB_DIMS}")
ALB_REJECTED=$(cw_stat "AWS/ApplicationELB" "RejectedConnectionCount" "Sum" "${ALB_DIMS}")
ALB_ACTIVE_CONN=$(cw_stat "AWS/ApplicationELB" "ActiveConnectionCount" "Average" "${ALB_DIMS}")
ALB_NEW_CONN=$(cw_stat "AWS/ApplicationELB" "NewConnectionCount" "Sum" "${ALB_DIMS}")
ALB_BYTES=$(cw_stat "AWS/ApplicationELB" "ProcessedBytes" "Sum" "${ALB_DIMS}")

# ─── 2. CloudWatch — ElastiCache Redis ────────────────────────────────────────
echo "  -> CloudWatch ElastiCache Redis"
REDIS_DIMS="Name=CacheClusterId,Value=${REDIS_CLUSTER_ID}"

REDIS_CPU=$(cw_stat "AWS/ElastiCache" "CPUUtilization" "Average" "${REDIS_DIMS}")
REDIS_ENGINE_CPU=$(cw_stat "AWS/ElastiCache" "EngineCPUUtilization" "Average" "${REDIS_DIMS}")
REDIS_MEM=$(cw_stat "AWS/ElastiCache" "FreeableMemory" "Average" "${REDIS_DIMS}")
REDIS_CURR_CONN=$(cw_stat "AWS/ElastiCache" "CurrConnections" "Average" "${REDIS_DIMS}")
REDIS_NEW_CONN=$(cw_stat "AWS/ElastiCache" "NewConnections" "Sum" "${REDIS_DIMS}")
REDIS_HITS=$(cw_stat "AWS/ElastiCache" "CacheHits" "Sum" "${REDIS_DIMS}")
REDIS_MISSES=$(cw_stat "AWS/ElastiCache" "CacheMisses" "Sum" "${REDIS_DIMS}")
REDIS_NET_IN=$(cw_stat "AWS/ElastiCache" "NetworkBytesIn" "Sum" "${REDIS_DIMS}")
REDIS_NET_OUT=$(cw_stat "AWS/ElastiCache" "NetworkBytesOut" "Sum" "${REDIS_DIMS}")
REDIS_EVICTIONS=$(cw_stat "AWS/ElastiCache" "Evictions" "Sum" "${REDIS_DIMS}")
REDIS_REPLICATION_LAG=$(cw_stat "AWS/ElastiCache" "ReplicationLag" "Average" "${REDIS_DIMS}")
REDIS_SWAP=$(cw_stat "AWS/ElastiCache" "SwapUsage" "Average" "${REDIS_DIMS}")

# Hit rate
if [[ "${REDIS_HITS}" != "NOT_MEASURED" && "${REDIS_MISSES}" != "NOT_MEASURED" ]]; then
  TOTAL_REDIS=$((REDIS_HITS + REDIS_MISSES))
  if [[ "${TOTAL_REDIS}" -gt 0 ]]; then
    REDIS_HIT_RATE=$(echo "scale=2; ${REDIS_HITS} * 100 / ${TOTAL_REDIS}" | bc)
  else
    REDIS_HIT_RATE="NOT_MEASURED"
  fi
else
  REDIS_HIT_RATE="NOT_MEASURED"
fi

# ─── 3. CloudWatch — Aurora ───────────────────────────────────────────────────
echo "  -> CloudWatch Aurora PostgreSQL"
AURORA_DIMS="Name=DBClusterIdentifier,Value=${AURORA_CLUSTER_ID}"

AURORA_CPU=$(cw_stat "AWS/RDS" "CPUUtilization" "Average" "${AURORA_DIMS}")
AURORA_CONNS=$(cw_stat "AWS/RDS" "DatabaseConnections" "Maximum" "${AURORA_DIMS}")
AURORA_MEM=$(cw_stat "AWS/RDS" "FreeableMemory" "Average" "${AURORA_DIMS}")
AURORA_READ_IOPS=$(cw_stat "AWS/RDS" "ReadIOPS" "Average" "${AURORA_DIMS}")
AURORA_WRITE_IOPS=$(cw_stat "AWS/RDS" "WriteIOPS" "Average" "${AURORA_DIMS}")
AURORA_READ_LAT=$(cw_stat "AWS/RDS" "ReadLatency" "Average" "${AURORA_DIMS}")
AURORA_WRITE_LAT=$(cw_stat "AWS/RDS" "WriteLatency" "Average" "${AURORA_DIMS}")
AURORA_COMMIT_LAT=$(cw_stat "AWS/RDS" "CommitLatency" "Average" "${AURORA_DIMS}")
AURORA_NET=$(cw_stat "AWS/RDS" "NetworkThroughput" "Average" "${AURORA_DIMS}")

# ─── 4. Prometheus — Application ──────────────────────────────────────────────
echo "  -> Prometheus application metrics"

PROM_RPS=$(prom_query "sum(rate(motionmesh_api_requests_total{namespace=\"${NAMESPACE}\"}[1m]))")
PROM_ERROR_RATE=$(prom_query "sum(rate(motionmesh_api_requests_total{namespace=\"${NAMESPACE}\",status=~\"5..\"}[1m])) / sum(rate(motionmesh_api_requests_total{namespace=\"${NAMESPACE}\"}[1m]))")
PROM_P99=$(prom_query "histogram_quantile(0.99, sum(rate(motionmesh_api_request_duration_seconds_bucket{namespace=\"${NAMESPACE}\"}[1m])) by (le))")
PROM_P95=$(prom_query "histogram_quantile(0.95, sum(rate(motionmesh_api_request_duration_seconds_bucket{namespace=\"${NAMESPACE}\"}[1m])) by (le))")
PROM_P50=$(prom_query "histogram_quantile(0.50, sum(rate(motionmesh_api_request_duration_seconds_bucket{namespace=\"${NAMESPACE}\"}[1m])) by (le))")

PROM_AUTH_LOCAL=$(prom_query "sum(rate(motionmesh_auth_local_hit_total{namespace=\"${NAMESPACE}\"}[1m]))")
PROM_AUTH_REDIS=$(prom_query "sum(rate(motionmesh_auth_redis_hit_total{namespace=\"${NAMESPACE}\"}[1m]))")
PROM_AUTH_DB=$(prom_query "sum(rate(motionmesh_auth_db_fallback_total{namespace=\"${NAMESPACE}\"}[1m]))")
PROM_AUTH_FAIL=$(prom_query "sum(rate(motionmesh_auth_failure_total{namespace=\"${NAMESPACE}\"}[1m]))")

PROM_LU_DEPTH=$(prom_query "avg(motionmesh_last_used_queue_depth{namespace=\"${NAMESPACE}\"})")
PROM_LU_DROPPED=$(prom_query "sum(rate(motionmesh_last_used_dropped_total{namespace=\"${NAMESPACE}\"}[1m]))")

PROM_GOROUTINES=$(prom_query "avg(go_goroutines{namespace=\"${NAMESPACE}\",app=\"api\"})")
PROM_GC_PAUSE=$(prom_query "histogram_quantile(0.99, rate(go_gc_duration_seconds_bucket{namespace=\"${NAMESPACE}\",app=\"api\"}[1m]))")
PROM_HEAP=$(prom_query "avg(go_memstats_heap_alloc_bytes{namespace=\"${NAMESPACE}\",app=\"api\"})")

# ─── 5. Kubernetes ────────────────────────────────────────────────────────────
echo "  -> Kubernetes metrics"
API_PODS=$(kubectl get pods -n "${NAMESPACE}" -l app=api --no-headers 2>/dev/null | wc -l)
API_READY=$(kubectl get pods -n "${NAMESPACE}" -l app=api --no-headers 2>/dev/null | grep -c "Running" || echo "NOT_MEASURED")
API_RESTARTS=$(kubectl get pods -n "${NAMESPACE}" -l app=api -o jsonpath='{range .items[*]}{.status.containerStatuses[0].restartCount}{"\n"}{end}' 2>/dev/null | paste -sd+ | bc || echo "NOT_MEASURED")

HPA_DESIRED=$(kubectl get hpa api-hpa -n "${NAMESPACE}" -o jsonpath='{.status.desiredReplicas}' 2>/dev/null || echo "NOT_MEASURED")
HPA_CURRENT=$(kubectl get hpa api-hpa -n "${NAMESPACE}" -o jsonpath='{.status.currentReplicas}' 2>/dev/null || echo "NOT_MEASURED")

CPU_THROTTLE=$(kubectl top pod -n "${NAMESPACE}" -l app=api --no-headers 2>/dev/null || echo "NOT_MEASURED")

# ─── 6. Write cloudwatch.json ─────────────────────────────────────────────────
echo "  -> Writing cloudwatch.json"
cat > "${OUT_DIR}/cloudwatch.json" <<EOF
{
  "_schema": "motionmesh-cloudwatch-v1",
  "test_id": "${TEST_ID}",
  "timestamp_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "window_start_utc": "${WINDOW_START}",
  "window_end_utc": "${WINDOW_END}",

  "alb": {
    "RequestCount": "${ALB_REQUEST_COUNT}",
    "TargetResponseTime_p95": "${ALB_TARGET_RESP_P95}",
    "TargetResponseTime_p99": "${ALB_TARGET_RESP_P99}",
    "HTTPCode_Target_2XX_Count": "${ALB_2XX}",
    "HTTPCode_Target_4XX_Count": "${ALB_4XX}",
    "HTTPCode_Target_5XX_Count": "${ALB_5XX}",
    "RejectedConnectionCount": "${ALB_REJECTED}",
    "ActiveConnectionCount": "${ALB_ACTIVE_CONN}",
    "NewConnectionCount": "${ALB_NEW_CONN}",
    "ProcessedBytes": "${ALB_BYTES}"
  },

  "elasticache_redis": {
    "CPUUtilization_avg_pct": "${REDIS_CPU}",
    "EngineCPUUtilization_avg_pct": "${REDIS_ENGINE_CPU}",
    "FreeableMemory_bytes": "${REDIS_MEM}",
    "CurrConnections": "${REDIS_CURR_CONN}",
    "NewConnections": "${REDIS_NEW_CONN}",
    "CacheHits": "${REDIS_HITS}",
    "CacheMisses": "${REDIS_MISSES}",
    "CacheHitRate_pct": "${REDIS_HIT_RATE}",
    "NetworkBytesIn": "${REDIS_NET_IN}",
    "NetworkBytesOut": "${REDIS_NET_OUT}",
    "Evictions": "${REDIS_EVICTIONS}",
    "ReplicationLag_ms": "${REDIS_REPLICATION_LAG}",
    "SwapUsage_bytes": "${REDIS_SWAP}"
  },

  "aurora_postgres": {
    "CPUUtilization_avg_pct": "${AURORA_CPU}",
    "DatabaseConnections_max": "${AURORA_CONNS}",
    "FreeableMemory_bytes": "${AURORA_MEM}",
    "ReadIOPS_avg": "${AURORA_READ_IOPS}",
    "WriteIOPS_avg": "${AURORA_WRITE_IOPS}",
    "ReadLatency_avg_ms": "${AURORA_READ_LAT}",
    "WriteLatency_avg_ms": "${AURORA_WRITE_LAT}",
    "CommitLatency_avg_ms": "${AURORA_COMMIT_LAT}",
    "NetworkThroughput_bytes": "${AURORA_NET}"
  }
}
EOF

# ─── 7. Write prometheus.json ─────────────────────────────────────────────────
echo "  -> Writing prometheus.json"
cat > "${OUT_DIR}/prometheus.json" <<EOF
{
  "_schema": "motionmesh-prometheus-v1",
  "test_id": "${TEST_ID}",
  "timestamp_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "window_start_utc": "${WINDOW_START}",
  "window_end_utc": "${WINDOW_END}",

  "request_metrics": {
    "rps_avg": "${PROM_RPS}",
    "error_rate": "${PROM_ERROR_RATE}",
    "p50_ms": "${PROM_P50}",
    "p95_ms": "${PROM_P95}",
    "p99_ms": "${PROM_P99}"
  },

  "auth": {
    "local_cache_rps": "${PROM_AUTH_LOCAL}",
    "redis_hit_rps": "${PROM_AUTH_REDIS}",
    "db_fallback_rps": "${PROM_AUTH_DB}",
    "failure_rps": "${PROM_AUTH_FAIL}"
  },

  "last_used": {
    "queue_depth_avg": "${PROM_LU_DEPTH}",
    "dropped_rps": "${PROM_LU_DROPPED}"
  },

  "go_runtime": {
    "goroutines_avg": "${PROM_GOROUTINES}",
    "gc_pause_p99_s": "${PROM_GC_PAUSE}",
    "heap_alloc_bytes": "${PROM_HEAP}"
  }
}
EOF

# ─── 8. Write kubernetes.json ─────────────────────────────────────────────────
echo "  -> Writing kubernetes.json"
cat > "${OUT_DIR}/kubernetes.json" <<EOF
{
  "_schema": "motionmesh-kubernetes-v1",
  "test_id": "${TEST_ID}",
  "timestamp_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",

  "api_pods": {
    "total": "${API_PODS}",
    "ready": "${API_READY}",
    "restarts_total": "${API_RESTARTS}"
  },

  "hpa": {
    "api": {
      "desired_replicas": "${HPA_DESIRED}",
      "current_replicas": "${HPA_CURRENT}"
    }
  }
}
EOF

echo ""
echo "✓ Metrics snapshot complete: ${OUT_DIR}/"
echo "  cloudwatch.json   — ALB, Redis, Aurora"
echo "  prometheus.json   — App metrics, auth, runtime"
echo "  kubernetes.json   — Pods, HPA"
echo ""
echo "Next: run tests/load/k6/baseline-rps-sweep.js and save output to ${OUT_DIR}/k6-summary.json"
