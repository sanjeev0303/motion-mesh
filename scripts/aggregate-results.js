const fs = require('fs');
const path = require('path');

const resultsDir = process.argv[2];

if (!resultsDir) {
    console.error("Usage: node scripts/aggregate-results.js <results_dir>");
    process.exit(1);
}

const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('-result.json'));

if (files.length === 0) {
    console.error(`No result files found in ${resultsDir}`);
    process.exit(1);
}

const aggregate = {
    test_id: null,
    target_rps: 0,
    actual_rps: 0,
    successful: 0,
    failed: 0,
    dropped: 0,
    duration_seconds: 0,
    p50_ms: 0,
    p95_ms: 0,
    p99_ms: 0
};

let p50Sum = 0;
let p95Sum = 0;
let p99Sum = 0;

for (const file of files) {
    const raw = fs.readFileSync(path.join(resultsDir, file), 'utf8');
    try {
        const payload = JSON.parse(raw);
        aggregate.test_id = aggregate.test_id || payload.test_id;
        aggregate.target_rps += payload.target_rps;
        aggregate.successful += payload.successful;
        aggregate.failed += payload.failed;
        aggregate.dropped += payload.dropped;
        
        // Use the maximum duration across all nodes as the concurrent wall-clock duration
        if (payload.duration_seconds > aggregate.duration_seconds) {
            aggregate.duration_seconds = payload.duration_seconds;
        }

        p50Sum += payload.p50_ms;
        p95Sum += payload.p95_ms;
        p99Sum += payload.p99_ms;

    } catch (e) {
        console.error(`Failed to parse ${file}: ${e.message}`);
        console.error(`Raw content was:\n${raw}`);
        process.exit(1);
    }
}

// Average the percentiles roughly since we don't have the raw histograms
aggregate.p50_ms = p50Sum / files.length;
aggregate.p95_ms = p95Sum / files.length;
aggregate.p99_ms = p99Sum / files.length;

// Compute actual aggregate RPS strictly based on the max coordinated wall-clock duration
const completed = aggregate.successful + aggregate.failed;
if (aggregate.duration_seconds > 0) {
    aggregate.actual_rps = completed / aggregate.duration_seconds;
}

const outFile = path.join(resultsDir, 'workload.json');
fs.writeFileSync(outFile, JSON.stringify(aggregate, null, 2));

console.log("=== AGGREGATED BENCHMARK RESULT ===");
console.log(`Target RPS:        ${aggregate.target_rps}`);
console.log(`Actual RPS:        ${aggregate.actual_rps.toFixed(2)}`);
console.log(`Successful:        ${aggregate.successful}`);
console.log(`Failed:            ${aggregate.failed}`);
console.log(`Dropped:           ${aggregate.dropped}`);
console.log(`Wall Duration:     ${aggregate.duration_seconds.toFixed(2)}s`);
console.log(`Latency p95:       ${aggregate.p95_ms.toFixed(2)}ms`);
console.log(`Output saved to:   ${outFile}`);
