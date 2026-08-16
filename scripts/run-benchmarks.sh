#!/bin/bash
# MotionMesh Multi-Configuration Benchmark Runner
# Usage: ./scripts/run-benchmarks.sh [API_KEY]
# Runs all duration × RPM combinations and generates a report.
set -euo pipefail

API_KEY="${1:-}"
BASE_URL="https://api.motionmesh.co.in/v1"
RESULTS_DIR="tests/load/k6/benchmark-results/$(date +%Y%m%d-%H%M%S)"
K6_SCRIPT="tests/load/k6/benchmark.js"
REPORT_FILE="${RESULTS_DIR}/report.md"

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mMotionMesh Multi-Config Benchmark\e[0m"
echo -e "\e[32mTarget: ${BASE_URL}\e[0m"
echo -e "\e[32m====================================================================\e[0m"

# Pre-flight: ensure ALB is up
echo -e "\e[32mChecking API reachability...\e[0m"
if ! curl -sf --max-time 10 "${BASE_URL}/health" > /dev/null 2>&1; then
    echo -e "\e[31mERROR: API unreachable at ${BASE_URL}/health\e[0m"
    echo -e "\e[31mCheck ACM cert status and ALB provisioning before running benchmarks.\e[0m"
    exit 1
fi
echo -e "\e[32m[OK] API is reachable\e[0m"

# Benchmark matrix
DURATIONS=("10s" "30s" "1m")
# RPM → RPS conversion: 100rpm=2, 1000rpm=17, 10000rpm=167, 100000rpm=1667, 1000000rpm=16667
declare -A RPS_MAP
RPS_MAP["100rpm"]=2
RPS_MAP["1000rpm"]=17
RPS_MAP["10000rpm"]=167
RPS_MAP["100000rpm"]=1667
RPS_MAP["1000000rpm"]=16667

mkdir -p "${RESULTS_DIR}"

# JSON array to collect all results
echo "[]" > "${RESULTS_DIR}/all-results.json"

run_test() {
    local duration=$1
    local rpm_label=$2
    local rps=${RPS_MAP[$rpm_label]}
    local test_name="${rpm_label}_${duration}"
    local out_json="${RESULTS_DIR}/${test_name}.json"

    echo -e "\e[36m--------------------------------------------------------------------\e[0m"
    echo -e "\e[36mRunning: ${rpm_label} (${rps} RPS) for ${duration}\e[0m"
    echo -e "\e[36m--------------------------------------------------------------------\e[0m"

    # k6 outputs summary JSON; capture it
    if k6 run \
        --env TARGET_RPS="${rps}" \
        --env DURATION="${duration}" \
        --env BASE_URL="${BASE_URL}" \
        --env API_KEY="${API_KEY}" \
        --out json="${out_json}.raw.json" \
        --summary-export="${out_json}" \
        --no-color \
        "${K6_SCRIPT}" 2>&1; then
        STATUS="PASSED"
    else
        STATUS="FAILED"
    fi

    # Extract key metrics from summary JSON
    if [ -f "${out_json}" ]; then
        local p50 p95 p99 err_rate actual_rps total
        p50=$(jq -r '.metrics.http_req_duration.values.med // 0' "${out_json}" 2>/dev/null || echo "0")
        p95=$(jq -r '.metrics.http_req_duration.values["p(95)"] // 0' "${out_json}" 2>/dev/null || echo "0")
        p99=$(jq -r '.metrics.http_req_duration.values["p(99)"] // 0' "${out_json}" 2>/dev/null || echo "0")
        total=$(jq -r '.metrics.http_reqs.values.count // 0' "${out_json}" 2>/dev/null || echo "0")
        err_rate=$(jq -r '(.metrics.http_req_failed.values.rate // 0) * 100' "${out_json}" 2>/dev/null | awk '{printf "%.2f", $1}' || echo "0")
        actual_rps=$(jq -r '.metrics.http_reqs.values.rate // 0' "${out_json}" 2>/dev/null | awk '{printf "%.1f", $1}' || echo "0")

        # Append to results array
        local entry
        entry=$(jq -n \
            --arg name "${test_name}" \
            --arg rpm "${rpm_label}" \
            --arg dur "${duration}" \
            --argjson target_rps "${rps}" \
            --arg actual_rps "${actual_rps}" \
            --arg p50 "${p50}" \
            --arg p95 "${p95}" \
            --arg p99 "${p99}" \
            --arg err "${err_rate}" \
            --argjson total "${total}" \
            --arg status "${STATUS}" \
            '{name:$name, rpm:$rpm, duration:$dur, target_rps:$target_rps, actual_rps:$actual_rps, p50_ms:$p50, p95_ms:$p95, p99_ms:$p99, error_rate_pct:$err, total_requests:$total, status:$status}')
        
        # Merge into all-results.json
        jq ". += [${entry}]" "${RESULTS_DIR}/all-results.json" > /tmp/merged.json && mv /tmp/merged.json "${RESULTS_DIR}/all-results.json"

        echo -e "\e[32mResult: ${STATUS} | RPS: ${actual_rps} | p50: ${p50}ms | p95: ${p95}ms | p99: ${p99}ms | Errors: ${err_rate}%\e[0m"
    fi

    # Brief cooldown between tests
    sleep 5
}

# Run all combinations
for duration in "${DURATIONS[@]}"; do
    for rpm_label in "100rpm" "1000rpm" "10000rpm" "100000rpm" "1000000rpm"; do
        rps=${RPS_MAP[$rpm_label]}
        # Skip 1M RPM for short durations if not feasible from single machine
        if [ "${rps}" -ge 10000 ] && [ "${duration}" = "10s" ]; then
            echo -e "\e[33mSkipping ${rpm_label} @ ${duration} — insufficient warmup for high-RPS on single host\e[0m"
            continue
        fi
        run_test "${duration}" "${rpm_label}"
    done
done

# Generate Markdown Report
echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mGenerating report: ${REPORT_FILE}\e[0m"
echo -e "\e[32m====================================================================\e[0m"

node - <<'NODESCRIPT'
const fs   = require('fs');
const path = require('path');
const dir  = process.env.RESULTS_DIR;
const results = JSON.parse(fs.readFileSync(path.join(dir, 'all-results.json'), 'utf8'));

const statusIcon = (s) => s === 'PASSED' ? '✅' : '❌';
const ms = (v) => parseFloat(v).toFixed(1) + 'ms';

// Group by duration
const byDuration = {};
for (const r of results) {
    byDuration[r.duration] = byDuration[r.duration] || [];
    byDuration[r.duration].push(r);
}

let md = `# MotionMesh Benchmark Report\n\n`;
md += `> Generated: ${new Date().toISOString()}\n`;
md += `> Target: https://api.motionmesh.co.in/v1/health\n\n`;

for (const [dur, rows] of Object.entries(byDuration)) {
    md += `## Duration: ${dur}\n\n`;
    md += `| RPM Target | Actual RPS | Requests | Error Rate | p50 | p95 | p99 | Status |\n`;
    md += `|------------|-----------|---------|-----------|-----|-----|-----|--------|\n`;
    for (const r of rows) {
        md += `| ${r.rpm} | ${r.actual_rps} | ${r.total_requests} | ${r.error_rate_pct}% | ${ms(r.p50_ms)} | ${ms(r.p95_ms)} | ${ms(r.p99_ms)} | ${statusIcon(r.status)} ${r.status} |\n`;
    }
    md += '\n';
}

md += `## Summary\n\n`;
const passed = results.filter(r => r.status === 'PASSED').length;
const total  = results.length;
md += `- Tests run: **${total}**\n`;
md += `- Passed: **${passed}**\n`;
md += `- Failed: **${total - passed}**\n`;

const rOut = path.join(dir, 'report.md');
fs.writeFileSync(rOut, md);
console.log(`Report written to ${rOut}`);
console.log('\n' + md);
NODESCRIPT

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mBenchmark Complete. Report: ${REPORT_FILE}\e[0m"
echo -e "\e[32m====================================================================\e[0m"
