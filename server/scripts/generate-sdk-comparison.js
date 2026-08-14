const fs = require('fs');
const path = require('path');

const benchmarksDir = path.join(__dirname, '../../docs/benchmarks');

if (!fs.existsSync(benchmarksDir)) {
  console.error("No benchmarks directory found.");
  process.exit(1);
}

const files = fs.readdirSync(benchmarksDir);

let latestRawHttp = null;
let sdkRuns = [];

files.forEach(f => {
  if (f.startsWith('raw-http-throughput-') && f.endsWith('.json')) {
    const fullPath = path.join(benchmarksDir, f);
    const stat = fs.statSync(fullPath);
    if (!latestRawHttp || stat.mtimeMs > latestRawHttp.mtimeMs) {
      latestRawHttp = { path: fullPath, mtimeMs: stat.mtimeMs };
    }
  } else if (f.startsWith('sdk-benchmark-') && f.endsWith('.json')) {
    sdkRuns.push(path.join(benchmarksDir, f));
  }
});

if (!latestRawHttp) {
  console.error("No raw HTTP benchmark found. Run raw_http_max_throughput.js first.");
  process.exit(1);
}

if (sdkRuns.length === 0) {
  console.error("No SDK benchmark runs found. Run official_sdk_benchmark.js first.");
  process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(latestRawHttp.path, 'utf8'));

const sdkData = sdkRuns.map(p => JSON.parse(fs.readFileSync(p, 'utf8')));
sdkData.sort((a, b) => a.target_rps - b.target_rps);

const comparisonData = {
  timestamp: new Date().toISOString(),
  raw_http_max: rawData,
  sdk_tiers: sdkData
};

fs.writeFileSync(path.join(benchmarksDir, 'sdk-comparison.json'), JSON.stringify(comparisonData, null, 2));

// Generate Markdown
let md = `# SDK vs Raw HTTP Benchmark Comparison\n\n`;
md += `Generated: ${comparisonData.timestamp}\n\n`;

md += `## Raw HTTP Max Throughput (Baseline)\n`;
md += `- **Max Capacity Achieved**: ${rawData.actual_rps.toFixed(2)} RPS\n`;
md += `- **p50 Latency**: ${rawData.latency_ms.p50.toFixed(2)} ms\n`;
md += `- **p95 Latency**: ${rawData.latency_ms.p95.toFixed(2)} ms\n`;
md += `- **p99 Latency**: ${rawData.latency_ms.p99.toFixed(2)} ms\n\n`;

md += `## Official SDK Overload Testing\n\n`;
md += `| Target RPS | Actual RPS | Success Rate | p50 (ms) | p95 (ms) | p99 (ms) | Overhead (% of Baseline RPS) |\n`;
md += `|---|---|---|---|---|---|---|\n`;

sdkData.forEach(sdk => {
  const successRate = (sdk.requests.success / sdk.requests.requested) * 100;
  const overhead = (100 - ((sdk.actual_rps / rawData.actual_rps) * 100)).toFixed(2);
  const actualStr = sdk.actual_rps.toFixed(2);
  const overheadStr = overhead > 0 ? `${overhead}%` : 'N/A (Saturated Baseline)';
  
  md += `| ${sdk.target_rps} | ${actualStr} | ${successRate.toFixed(2)}% | ${sdk.latency_ms.p50.toFixed(2)} | ${sdk.latency_ms.p95.toFixed(2)} | ${sdk.latency_ms.p99.toFixed(2)} | ${overheadStr} |\n`;
});

md += `\n*Note: Connection reuse is automatically enabled in the SDK via standard Node.js HTTP Keep-Alive agents.*`;

fs.writeFileSync(path.join(benchmarksDir, 'sdk-comparison.md'), md);
console.log("Comparison report generated: docs/benchmarks/sdk-comparison.md");
