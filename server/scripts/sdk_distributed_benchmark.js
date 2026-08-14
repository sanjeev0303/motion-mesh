/**
 * MotionMesh official Node SDK benchmark (DISTRIBUTED-IDENTITY).
 *
 * This benchmark randomly selects an API key from a pool of 100K valid identities
 * on every request to measure authentication cache behavior, Redis load, and
 * concurrent distributed RPS throughput.
 * The SDK constructor intentionally accepts ONLY the API key:
 *
 *   new MotionMeshClient(apiKey)
 *
 * The production API endpoint is owned by the SDK package and is not a
 * per-client configuration option. Raw HTTP benchmarking is intentionally
 * kept in a separate benchmark.
 *
 * For 1M RPM, run this benchmark through the distributed load-generator
 * wrapper so each process contributes a bounded portion of the target rate.
 */
const { MotionMeshClient } = require("@motionmesh/sdk");
const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const DATA_PATH = path.join(__dirname, "../../tests/load/k6/data.json");
const TIERS = (process.env.RPS_TIERS || "1000,5000,10000,16667,20000")
  .split(",")
  .map(Number)
  .filter(Number.isFinite);

const DURATION_SEC = Math.max(1, parseInt(process.env.DURATION_SEC || "30", 10));
const MAX_CONCURRENCY = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENCY || "2000", 10)
);
const CLIENT_TYPE = "sdk";

class ReservoirSampler {
  constructor(capacity = 4096) {
    this.capacity = capacity;
    this.reservoir = [];
    this.count = 0;
  }

  add(value) {
    this.count++;
    if (this.reservoir.length < this.capacity) {
      this.reservoir.push(value);
      return;
    }

    const j = Math.floor(Math.random() * this.count);
    if (j < this.capacity) this.reservoir[j] = value;
  }

  getPercentile(p) {
    if (!this.reservoir.length) return 0;
    const sorted = [...this.reservoir].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  }
}

function loadAndValidateData() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch (err) {
    throw new Error(`data.json not found or invalid JSON: ${err.message}`);
  }

  const required = [
    ["api_keys", 1],
    ["video_ids", 1],
  ];

  if (process.env.BENCHMARK_MODE === "true") {
    required.push(
      ["account_ids", 100000],
      ["api_keys", 100000],
      ["bucket_ids", 100000],
      ["video_ids", 100000]
    );
  }

  for (const [field, minimum] of required) {
    if (!Array.isArray(data[field]) || data[field].length < minimum) {
      throw new Error(
        `Invalid benchmark dataset: ${field} requires >= ${minimum}; found ${
          Array.isArray(data[field]) ? data[field].length : 0
        }`
      );
    }
  }

  return data;
}

const data = loadAndValidateData();
const clients = data.api_keys.slice(0, 100000).map(key => new MotionMeshClient(key));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOperation() {
  const op = Math.random();
  const client = clients[Math.floor(Math.random() * clients.length)];

  if (op < 0.4) {
    return client.videos.list({ limit: 10 });
  }

  if (op < 0.6) {
    return client.buckets.list();
  }

  const videoId =
    data.video_ids[Math.floor(Math.random() * data.video_ids.length)];

  if (op < 0.8) {
    return client.videos.get(videoId);
  }

  if (op < 0.9) {
    return client.videos.playback(videoId);
  }

  return client.mediaConverter.listJobs({ limit: 10 });
}

async function runTier(targetRPS) {
  console.log(`\n==============================================`);
  console.log(`Starting DISTRIBUTED-IDENTITY SDK Benchmark Tier: ${targetRPS} RPS`);
  console.log(`==============================================`);

  const totalRequests = targetRPS * DURATION_SEC;
  const tickMs = 10;
  const requestsPerTick = Math.max(
    1,
    Math.round((targetRPS * tickMs) / 1000)
  );

  let requested = 0;
  let sent = 0;
  let successful = 0;
  let failed = 0;
  let dropped = 0;
  let inFlight = 0;

  const latencies = new ReservoirSampler();
  const startedAt = performance.now();

  while (requested < totalRequests) {
    const tickStart = performance.now();

    const remaining = totalRequests - requested;
    const batchSize = Math.min(requestsPerTick, remaining);

    for (let i = 0; i < batchSize; i++) {
      requested++;

      if (inFlight >= MAX_CONCURRENCY) {
        dropped++;
        continue;
      }

      inFlight++;
      sent++;

      const requestStart = performance.now();

      runOperation()
        .then(() => {
          successful++;
          latencies.add(performance.now() - requestStart);
        })
        .catch(() => {
          failed++;
        })
        .finally(() => {
          inFlight--;
        });
    }

    const elapsed = performance.now() - tickStart;
    if (elapsed < tickMs) {
      await sleep(tickMs - elapsed);
    } else {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  // Drain outstanding SDK requests before calculating completion metrics.
  while (inFlight > 0) {
    await sleep(5);
  }

  const durationSec = (performance.now() - startedAt) / 1000;
  const offeredRPS = sent / durationSec;
  const completed = successful + failed;
  const completedRPS = completed / durationSec;
  const successfulRPS = successful / durationSec;

  const report = {
    timestamp: new Date().toISOString(),
    benchmark_type: "official_sdk_distributed",
    client_type: CLIENT_TYPE,
    target_rps: targetRPS,
    duration_s: durationSec,
    requests: {
      requested,
      sent,
      completed,
      success: successful,
      failed,
      dropped,
    },
    offered_rps: offeredRPS,
    completed_rps: completedRPS,
    successful_rps: successfulRPS,
    latency_ms: {
      p50: latencies.getPercentile(0.5),
      p95: latencies.getPercentile(0.95),
      p99: latencies.getPercentile(0.99),
    },
    load_generator: {
      max_concurrency: MAX_CONCURRENCY,
      cpu_usage: process.cpuUsage(),
      memory_usage: process.memoryUsage(),
    },
  };

  console.log(`Requested:       ${requested}`);
  console.log(`Sent:            ${sent}`);
  console.log(`Completed:       ${completed}`);
  console.log(`Successful:      ${successful}`);
  console.log(`Failed:          ${failed}`);
  console.log(`Dropped:         ${dropped}`);
  console.log(`Offered RPS:     ${offeredRPS.toFixed(2)}`);
  console.log(`Completed RPS:   ${completedRPS.toFixed(2)}`);
  console.log(`Successful RPS:  ${successfulRPS.toFixed(2)}`);
  console.log(`Latency p50:     ${report.latency_ms.p50.toFixed(2)} ms`);
  console.log(`Latency p95:     ${report.latency_ms.p95.toFixed(2)} ms`);
  console.log(`Latency p99:     ${report.latency_ms.p99.toFixed(2)} ms`);

  if (dropped > 0) {
    console.warn(
      `[WARNING] Load generator dropped ${dropped} requests because MAX_CONCURRENCY=${MAX_CONCURRENCY}`
    );
  }

  if (sent > 0 && dropped / sent > 0.01) {
    console.warn(
      "[WARNING] Load generator saturation exceeded 1%; this run must not be used as server capacity evidence."
    );
  }

  const outDir = path.join(__dirname, "../../docs/benchmarks");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(
    outDir,
    `sdk-benchmark-${targetRPS}-${Date.now()}.json`
  );

  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`Artifact saved to: ${outFile}`);
}

async function main() {
  // Preflight uses the SDK itself; no URL is supplied.
  await clients[0].videos.list({ limit: 1 });
  console.log("SDK pre-flight OK.");

  for (const tier of TIERS) {
    await runTier(tier);
    await sleep(5000);
  }
}

main().catch((err) => {
  console.error("SDK benchmark failed:", err);
  process.exit(1);
});
