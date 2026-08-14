/**
 * NATS Publish Throughput Benchmark
 * Measures raw message publication speed (API ingress proxy)
 */
const { connect } = require('nats');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const DURATION_SEC = parseInt(process.env.DURATION_SEC || '10');
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '100');

// Reservoir Sampling for Bounded Memory Latency Tracking
class ReservoirSampler {
  constructor(capacity = 5000) {
    this.capacity = capacity;
    this.reservoir = [];
    this.count = 0;
  }
  
  add(value) {
    this.count++;
    if (this.reservoir.length < this.capacity) {
      this.reservoir.push(value);
    } else {
      const j = Math.floor(Math.random() * this.count);
      if (j < this.capacity) {
        this.reservoir[j] = value;
      }
    }
  }

  getPercentile(p) {
    if (this.reservoir.length === 0) return 0;
    this.reservoir.sort((a, b) => a - b);
    return this.reservoir[Math.floor(this.reservoir.length * p)];
  }
}

async function runBenchmark() {
  // Load real data to avoid synthetic fallbacks
  const dataPath = path.join(__dirname, '../k6/data.json');
  let accountId = "";
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    if (!data.account_ids || data.account_ids.length === 0) {
      throw new Error("Missing account_ids");
    }
    accountId = data.account_ids[0];
  } catch (e) {
    console.error("data.json not found or invalid JSON. Real data required.");
    process.exit(1);
  }

  console.log(`Connecting to NATS at ${NATS_URL}...`);
  const nc = await connect({ servers: NATS_URL });
  const js = nc.jetstream();

  console.log(`Starting Publish Benchmark for ${DURATION_SEC} seconds (Concurrency: ${CONCURRENCY})...`);

  let published = 0;
  let errors = 0;
  const latencies = new ReservoirSampler(5000);
  
  const startTime = performance.now();
  const endTime = startTime + (DURATION_SEC * 1000);

  const workers = Array.from({ length: CONCURRENCY }).map(async () => {
    while (performance.now() < endTime) {
      const reqStart = performance.now();
      const payload = {
        video_id: uuidv4(),
        account_id: accountId, // Required REAL account ID
        source_url: "s3://motionmesh-uploads/mock-benchmark-video.mp4",
        webhook_url: "https://example.com/webhook",
        created_at: new Date().toISOString()
      };
      
      try {
        await js.publish("jobs.transcode.pending", Buffer.from(JSON.stringify(payload)));
        latencies.add(performance.now() - reqStart);
        published++;
      } catch (e) {
        errors++;
      }
    }
  });

  await Promise.all(workers);
  const totalTimeSec = (performance.now() - startTime) / 1000;
  const rps = published / totalTimeSec;

  const p50 = latencies.getPercentile(0.50);
  const p95 = latencies.getPercentile(0.95);
  const p99 = latencies.getPercentile(0.99);

  console.log(`\n--- NATS PUBLISH RESULTS ---`);
  console.log(`Total Published: ${published}`);
  console.log(`Errors:          ${errors}`);
  console.log(`Time Elapsed:    ${totalTimeSec.toFixed(2)}s`);
  console.log(`Actual RPS:      ${rps.toFixed(2)} msgs/sec`);
  console.log(`Latency p50:     ${p50.toFixed(2)} ms`);
  console.log(`Latency p95:     ${p95.toFixed(2)} ms`);
  console.log(`Latency p99:     ${p99.toFixed(2)} ms`);
  
  const outDir = path.join(__dirname, '../../../docs/benchmarks');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const report = {
    timestamp: new Date().toISOString(),
    benchmark_type: "nats_publish",
    duration_s: totalTimeSec,
    concurrency: CONCURRENCY,
    requests: {
      success: published,
      failed: errors
    },
    actual_rps: rps,
    latency_ms: {
      p50, p95, p99
    }
  };

  const outFile = path.join(outDir, `nats-publish-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\nArtifact saved to: ${outFile}`);

  await nc.close();
}

runBenchmark().catch(console.error);
