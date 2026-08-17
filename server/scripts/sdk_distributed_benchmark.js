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
console.log("\nInitializing 100K clients...");
const initStartMem = process.memoryUsage();
const clients = data.api_keys.slice(0, 100000).map(key => new MotionMeshClient(key));
const initEndMem = process.memoryUsage();
console.log(`Initialized ${clients.length} clients.`);
console.log(`Memory growth: ${Math.round((initEndMem.heapUsed - initStartMem.heapUsed)/1024/1024)} MB`);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOperation() {
  const op = Math.random();
  const clientIdx = Math.floor(Math.random() * clients.length);
  const client = clients[clientIdx];

  if (op < 0.4) {
    return client.videos.list({ limit: 10 });
  }

  if (op < 0.6) {
    return client.buckets.list();
  }

  const videoId = data.video_ids[clientIdx];

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
  const requestsPerTick = (targetRPS * tickMs) / 1000;
  let accumulatedRequests = 0;

  let requested = 0;
  let sent = 0;
  let successful = 0;
  let failed = 0;
  let dropped = 0;
  let inFlight = 0;

  const latencies = new ReservoirSampler();
  const startedAt = performance.now();
  const elHistogram = require('perf_hooks').monitorEventLoopDelay({ resolution: 10 });
  elHistogram.enable();

  // Progress reporting every 10s
  const { exec } = require('child_process');
  const instanceId = process.env.INSTANCE_ID || "local";
  const progressInterval = setInterval(() => {
    const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
    const pct = totalRequests > 0 ? ((requested / totalRequests) * 100).toFixed(1) : 0;
    console.log(`[${elapsed}s] Progress: ${requested}/${totalRequests} dispatched (${pct}%) | in-flight: ${inFlight} | ok: ${successful} | fail: ${failed}`);
    
    // Push custom metrics to CloudWatch (JSON format - required by AWS CLI v2 Python for nested Dimensions)
    const p50 = latencies.getPercentile(0.5) || 0;
    const p95 = latencies.getPercentile(0.95) || 0;
    const dims = JSON.stringify([{ Name: 'InstanceId', Value: instanceId }]);
    const metricData = JSON.stringify([
      { MetricName: 'SuccessfulRequests', Dimensions: [{ Name: 'InstanceId', Value: instanceId }], Value: successful, Unit: 'Count', StorageResolution: 1 },
      { MetricName: 'FailedRequests',     Dimensions: [{ Name: 'InstanceId', Value: instanceId }], Value: failed,     Unit: 'Count', StorageResolution: 1 },
      { MetricName: 'InFlightRequests',   Dimensions: [{ Name: 'InstanceId', Value: instanceId }], Value: inFlight,   Unit: 'Count', StorageResolution: 1 },
      { MetricName: 'P50Latency',         Dimensions: [{ Name: 'InstanceId', Value: instanceId }], Value: p50,        Unit: 'Milliseconds', StorageResolution: 1 },
      { MetricName: 'P95Latency',         Dimensions: [{ Name: 'InstanceId', Value: instanceId }], Value: p95,        Unit: 'Milliseconds', StorageResolution: 1 },
    ]);
    const region = process.env.AWS_REGION || 'ap-south-1';
    const cmd = `aws cloudwatch put-metric-data --namespace "MotionMesh/Benchmark" --metric-data '${metricData}' --region ${region}`;

    exec(cmd, (err) => {
      if (err) console.error(`[WARN] Failed to push CloudWatch metrics: ${err.message}`);
    });
  }, 10000);

  while (requested < totalRequests) {
    const tickStart = performance.now();

    accumulatedRequests += requestsPerTick;
    let batchSize = Math.floor(accumulatedRequests);
    
    if (batchSize > 0) {
      accumulatedRequests -= batchSize;
      const remaining = totalRequests - requested;
      batchSize = Math.min(batchSize, remaining);

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
          if (successful <= 5 || successful % 1000 === 0) {
            console.log(`[SUCCESS Sample] Request succeeded.`);
          }
        })
        .catch((err) => {
          failed++;
          if (failed <= 50 || failed % 100 === 0) {
            console.error(`[ERROR Sample] Request failed: ${err.message || err.code || err}`);
          }
        })
        .finally(() => {
          inFlight--;
        });
    }
    }

    const elapsed = performance.now() - tickStart;
    if (elapsed < tickMs) {
      await sleep(tickMs - elapsed);
    } else {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  // Record dispatch-phase duration BEFORE drain (this is the "test duration")
  const dispatchEndedAt = performance.now();
  const durationSec = (dispatchEndedAt - startedAt) / 1000;

  clearInterval(progressInterval);
  console.log(`\n[Dispatch complete] ${durationSec.toFixed(1)}s active | draining ${inFlight} in-flight requests...`);

  // Drain with a max timeout of 2× DURATION_SEC to avoid hanging forever
  const drainDeadline = performance.now() + DURATION_SEC * 2 * 1000;
  while (inFlight > 0 && performance.now() < drainDeadline) {
    await sleep(50);
  }
  if (inFlight > 0) {
    console.warn(`[WARN] ${inFlight} requests still in-flight after drain timeout; treating as failed.`);
    failed += inFlight;
    inFlight = 0;
  }
  const drainSec = ((performance.now() - dispatchEndedAt) / 1000).toFixed(1);
  console.log(`[Drain complete] ${drainSec}s drain time.`);

  elHistogram.disable();
  const offeredRPS = sent / durationSec;
  const completed = successful + failed;
  const completedRPS = completed / durationSec;
  const successfulRPS = successful / durationSec;

  const report = {
    test_id: `test-${Date.now()}`,
    instance_id: process.env.INSTANCE_ID || "local",
    target_rps: targetRPS,
    actual_rps: completedRPS,
    successful: successful,
    failed: failed,
    dropped: dropped,
    duration_seconds: durationSec,        // active dispatch window only
    drain_seconds: parseFloat(drainSec),  // time waiting for in-flight to settle
    p50_ms: latencies.getPercentile(0.5),
    p95_ms: latencies.getPercentile(0.95),
    p99_ms: latencies.getPercentile(0.99),
    cpu: process.cpuUsage(),
    memory: process.memoryUsage(),
    network: {},
    event_loop_delay: elHistogram.percentile(99) / 1e6
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

  if (dropped > 0) {
    console.warn(`[WARNING] Load generator dropped ${dropped} requests`);
  }

  const outFile = path.join(__dirname, "result.json");
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
