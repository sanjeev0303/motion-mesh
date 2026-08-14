#!/usr/bin/env bash
# =============================================================================
# scripts/generate-report.sh
#
# Assembles docs/investor/scalability-report.md from benchmark-results/.
# Every number in this report MUST come from a benchmark-results/test-NNN/ file.
# If a metric is NOT in a results file, it is written as "NOT_MEASURED".
#
# NEVER estimate a performance number.
# NEVER use "approximately" for investor benchmark results.
#
# Usage:
#   bash scripts/generate-report.sh
# =============================================================================
set -euo pipefail

RESULTS_DIR="benchmark-results"
OUT="docs/investor/scalability-report.md"

mkdir -p "$(dirname "${OUT}")"

jqf() { jq -r "$1" "$2" 2>/dev/null || echo "NOT_MEASURED"; }

# Collect all test IDs in order
TESTS=($(ls -d "${RESULTS_DIR}"/test-* 2>/dev/null | sort || echo ""))

if [[ ${#TESTS[@]} -eq 0 ]]; then
  echo "ERROR: No benchmark-results/test-NNN/ directories found." >&2
  echo "Run 'bash scripts/run-benchmark.sh' first." >&2
  exit 1
fi

echo "==> Generating investor scalability report from ${#TESTS[@]} test(s)"

cat > "${OUT}" <<'HEADER'
# MotionMesh — Scalability Report

> **Data integrity policy**: Every number in this report was produced from
> CloudWatch, Prometheus, k6, or Kubernetes metrics.  
> No estimates. No approximations.  
> Unrecorded metrics are marked **NOT_MEASURED**.

---

## System Under Test

| Component | Value |
|---|---|
| API Runtime | Go |
| Load Balancer | AWS ALB |
| Compute | AWS EKS |
| Database | AWS Aurora PostgreSQL |
| Cache | AWS ElastiCache Redis |
| Queue | NATS JetStream |
| Object Storage | AWS S3 |
| CDN | AWS CloudFront |

---
HEADER

# ─── Phase 0 Baseline table (aggregate all RPS-sweep tests) ──────────────────
echo "" >> "${OUT}"
echo "## Phase 0 — Baseline RPS Sweep Results" >> "${OUT}"
echo "" >> "${OUT}"
echo "| Test ID | Git SHA | RPS Target | RPS Actual | Error Rate | p50 (ms) | p95 (ms) | p99 (ms) | Duration |" >> "${OUT}"
echo "|---|---|---|---|---|---|---|---|---|" >> "${OUT}"

for test_dir in "${TESTS[@]}"; do
  test_id=$(basename "${test_dir}")
  git_sha=$(jqf '.git_sha' "${test_dir}/workload.json")
  rps_target=$(jqf '.workload.rps_target // "NOT_MEASURED"' "${test_dir}/workload.json")
  rps_actual=$(jqf '.metrics.http_reqs.rate // "NOT_MEASURED"' "${test_dir}/k6-summary.json")
  error_rate=$(jqf '.metrics.http_req_failed.rate // "NOT_MEASURED"' "${test_dir}/k6-summary.json")
  p50=$(jqf '.metrics.http_req_duration.med // "NOT_MEASURED"' "${test_dir}/k6-summary.json")
  p95=$(jqf '.metrics.http_req_duration["p(95)"] // "NOT_MEASURED"' "${test_dir}/k6-summary.json")
  p99=$(jqf '.metrics.http_req_duration["p(99)"] // "NOT_MEASURED"' "${test_dir}/k6-summary.json")
  duration=$(jqf '.duration_seconds // "NOT_MEASURED"' "${test_dir}/workload.json")
  
  echo "| ${test_id} | ${git_sha:0:8} | ${rps_target} | ${rps_actual} | ${error_rate} | ${p50} | ${p95} | ${p99} | ${duration}s |" >> "${OUT}"
done

# ─── Per-test optimization entries ───────────────────────────────────────────
for test_dir in "${TESTS[@]}"; do
  test_id=$(basename "${test_dir}")
  
  # Skip if analysis.md doesn't exist
  [[ -f "${test_dir}/analysis.md" ]] || continue
  
  git_sha=$(jqf '.git_sha' "${test_dir}/workload.json")
  tf_ver=$(jqf '.terraform_version' "${test_dir}/workload.json")
  aws_region=$(jqf '.aws_region' "${test_dir}/workload.json")
  timestamp=$(jqf '.timestamp_utc' "${test_dir}/workload.json")
  workload=$(jqf '.workload.type // "NOT_MEASURED"' "${test_dir}/workload.json")
  duration=$(jqf '.duration_seconds // "NOT_MEASURED"' "${test_dir}/workload.json")

  rps_actual=$(jqf '.metrics.http_reqs.rate // "NOT_MEASURED"' "${test_dir}/k6-summary.json")
  error_rate=$(jqf '.metrics.http_req_failed.rate // "NOT_MEASURED"' "${test_dir}/k6-summary.json")
  p50=$(jqf '.metrics.http_req_duration.med // "NOT_MEASURED"' "${test_dir}/k6-summary.json")
  p95=$(jqf '.metrics.http_req_duration["p(95)"] // "NOT_MEASURED"' "${test_dir}/k6-summary.json")
  p99=$(jqf '.metrics.http_req_duration["p(99)"] // "NOT_MEASURED"' "${test_dir}/k6-summary.json")

  api_cpu=$(jqf '.api_pods.cpu_throttled_pct // "NOT_MEASURED"' "${test_dir}/kubernetes.json")
  redis_cpu=$(jqf '.elasticache_redis.EngineCPUUtilization_avg_pct // "NOT_MEASURED"' "${test_dir}/cloudwatch.json")
  aurora_cpu=$(jqf '.aurora_postgres.CPUUtilization_avg_pct // "NOT_MEASURED"' "${test_dir}/cloudwatch.json")
  
  bottleneck=$(grep "Primary Bottleneck:" "${test_dir}/analysis.md" 2>/dev/null | tail -1 | sed 's/.*: //' || echo "NOT_MEASURED")
  fix=$(grep "Fix Applied" "${test_dir}/analysis.md" 2>/dev/null -A2 | grep "Change:" | sed 's/.*Change: //' || echo "NOT_MEASURED")
  accept=$(grep "Accept / Revert:" "${test_dir}/analysis.md" 2>/dev/null | sed 's/.*: //' || echo "NOT_MEASURED")

  cat >> "${OUT}" <<EOF

---

## Optimization — ${test_id}

| Field | Value |
|---|---|
| Test ID | ${test_id} |
| Git SHA | ${git_sha} |
| Terraform Version | ${tf_ver} |
| AWS Region | ${aws_region} |
| Timestamp | ${timestamp} |
| Workload | ${workload} |
| Duration | ${duration}s |

### BEFORE

| Metric | Value |
|---|---|
| RPS (actual) | ${rps_actual} |
| p50 (ms) | ${p50} |
| p95 (ms) | ${p95} |
| p99 (ms) | ${p99} |
| Error rate | ${error_rate} |
| API CPU throttle % | ${api_cpu} |
| Redis engine CPU % | ${redis_cpu} |
| Aurora CPU % | ${aurora_cpu} |
| NATS consumer lag | NOT_MEASURED |

### BOTTLENECK

| Field | Value |
|---|---|
| Component | ${bottleneck} |
| Evidence | See ${test_id}/analysis.md |
| Root Cause | NOT_MEASURED |

### FIX

**${fix}**

### AFTER

> Populate from the following test run after the fix is applied and verified.

| Metric | Before | After | Δ |
|---|---|---|---|
| RPS | ${rps_actual} | NOT_MEASURED | NOT_MEASURED |
| p95 (ms) | ${p95} | NOT_MEASURED | NOT_MEASURED |
| p99 (ms) | ${p99} | NOT_MEASURED | NOT_MEASURED |
| Error rate | ${error_rate} | NOT_MEASURED | NOT_MEASURED |
| API CPU throttle | ${api_cpu} | NOT_MEASURED | NOT_MEASURED |
| Redis CPU | ${redis_cpu} | NOT_MEASURED | NOT_MEASURED |
| Aurora CPU | ${aurora_cpu} | NOT_MEASURED | NOT_MEASURED |

**Decision: ${accept}**

EOF
done

# ─── 1M RPM Validation section ────────────────────────────────────────────────
cat >> "${OUT}" <<'FOOTER'

---

## Phase 26 — 1M RPM Validation (16,667 RPS)

> Acceptance criteria:
> - Actual RPS ≥ 16,667
> - Error rate < 1%
> - Load generator NOT saturated
> - ALB healthy (0 rejected connections, 5xx < 0.1%)
> - Aurora CPU < 80%
> - Redis engine CPU < 80%
> - No continuously growing queue (NATS / last-used)

| Duration | RPS Target | RPS Actual | Error Rate | p95 (ms) | p99 (ms) | Load Gen Saturated |
|---|---|---|---|---|---|---|
| 10 min | 16,667 | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED |
| 30 min | 16,667 | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED |
| 60 min | 16,667 | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED |

---

## Phase 27 — 100K Concurrent Users

> Note: 100K VUs ≠ 100K RPS. Both are reported separately.

| VU Count | RPS Actual | p95 (ms) | p99 (ms) | Error Rate |
|---|---|---|---|---|
| 50,000 | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED |
| 100,000 | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED |

---

## Phase 28 — SDK vs Direct HTTP

| Metric | Direct HTTP | MotionMesh SDK | SDK Overhead |
|---|---|---|---|
| p50 (ms) | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED |
| p95 (ms) | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED |
| p99 (ms) | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED |
| Max RPS | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED |

---

*Report generated by `scripts/generate-report.sh`.*  
*All data sourced from CloudWatch, Prometheus, k6, and Kubernetes metrics.*
FOOTER

echo "✓ Report written to ${OUT}"
echo "  Tests included: ${#TESTS[@]}"
