#!/bin/bash
set -euo pipefail

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mGenerating Benchmark Report (aws-report.sh)\e[0m"
echo -e "\e[32m====================================================================\e[0m"

REPORT_DIR="docs/investor"
REPORT_FILE="${REPORT_DIR}/scalability-report.md"

mkdir -p "${REPORT_DIR}"

# Find the latest benchmark test dir
LATEST_TEST=$(ls -td benchmark-results/test-* 2>/dev/null | head -1 || echo "")
if [ -z "$LATEST_TEST" ] || [ ! -f "${LATEST_TEST}/workload.json" ]; then
    echo -e "\e[32mERROR: No workload.json found in benchmark-results. Run aws-benchmark.sh first.\e[0m"
    exit 1
fi

echo -e "\e[32mVerifying Prometheus Metrics...\e[0m"
PROMETHEUS_URL=$(cd infra/terraform/envs/benchmark && terraform output -raw prometheus_url || echo "")
if [ -z "$PROMETHEUS_URL" ]; then
    echo -e "\e[32mERROR: PROMETHEUS_URL not found in terraform outputs.\e[0m"
    exit 1
fi

# Query Prometheus
for metric in "motionmesh_api_requests_total" "motionmesh_auth_local_hit_total" "motionmesh_auth_redis_hit_total" "motionmesh_auth_db_fallback_total" "motionmesh_last_used_queue_depth" "motionmesh_last_used_dropped_total"; do
    STATUS=$(curl -s "${PROMETHEUS_URL}/api/v1/query?query=${metric}" | node -e "const stdin = require('fs').readFileSync('/dev/stdin'); try { console.log(JSON.parse(stdin).status); } catch(e) { console.log('error'); }" || echo "error")
    if [ "$STATUS" != "success" ]; then
        echo -e "\e[32mERROR: Failed to query Prometheus for ${metric}. Benchmark failed verification.\e[0m"
        exit 1
    fi
done

echo -e "\e[32mPrometheus metrics verified successfully.\e[0m"

cat << 'EOF' > "${REPORT_FILE}"
# MotionMesh AWS Scalability Report

> **Note**: This report clearly distinguishes between VERIFIED AWS test data and TARGET/ESTIMATED data.

## 1M RPM Progression
| Target RPS | Actual RPS | Error Rate | P50 (ms) | P95 (ms) | P99 (ms) | Status |
|------------|------------|------------|----------|----------|----------|--------|
EOF

# Append dynamic results
for workload_file in benchmark-results/test-*/workload.json; do
    if [ -f "$workload_file" ]; then
        TARGET=$(grep -oP '"target_rps": \K[0-9]+' "${workload_file}")
        ACTUAL=$(grep -oP '"actual_rps": \K[0-9.]+' "${workload_file}")
        ERRORS=$(grep -oP '"dropped": \K[0-9]+' "${workload_file}")
        FAILED=$(grep -oP '"failed": \K[0-9]+' "${workload_file}")
        SUCCESSFUL=$(grep -oP '"successful": \K[0-9]+' "${workload_file}")
        P50=$(grep -oP '"p50_ms": \K[0-9.]+' "${workload_file}")
        P95=$(grep -oP '"p95_ms": \K[0-9.]+' "${workload_file}")
        P99=$(grep -oP '"p99_ms": \K[0-9.]+' "${workload_file}")
        
        TOTAL=$((SUCCESSFUL + FAILED + ERRORS))
        
        # Calculate error rate accurately with Node
        if [ "$TOTAL" -gt 0 ]; then
            ERR_RATE=$(node -e "console.log((($FAILED + $ERRORS) / $TOTAL * 100).toFixed(2))")
        else
            ERR_RATE="0.00"
        fi
        
        # Format P50, P95, P99 safely
        P50_F=$(node -e "console.log(parseFloat(${P50:-0}).toFixed(2))")
        P95_F=$(node -e "console.log(parseFloat(${P95:-0}).toFixed(2))")
        P99_F=$(node -e "console.log(parseFloat(${P99:-0}).toFixed(2))")
        
        sed -i "/|------------|/a | ${TARGET} | ${ACTUAL} | ${ERR_RATE}% | ${P50_F} | ${P95_F} | ${P99_F} | VERIFIED |" "${REPORT_FILE}"
    fi
done

cat << 'EOF' >> "${REPORT_FILE}"

## Current Known Bottlenecks
- NOT_MEASURED

## Infrastructure Health
- **EKS API Nodes**: NOT_MEASURED
- **EKS Worker Nodes**: NOT_MEASURED
- **Aurora PostgreSQL**: NOT_MEASURED
- **ElastiCache Redis**: NOT_MEASURED
- **NATS JetStream**: NOT_MEASURED
- **Load Generators**: NOT_MEASURED
EOF

echo -e "\e[32mReport generated at ${REPORT_FILE}\e[0m"
