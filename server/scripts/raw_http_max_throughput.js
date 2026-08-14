/**
 * Motionmesh Raw HTTP Max Throughput Benchmark
 * 
 * Simulates high-throughput raw HTTP usage with connection pooling
 * to find the absolute maximum capacity (headroom) of the API.
 */

const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

const DURATION_SEC = parseInt(process.env.DURATION_SEC) || 10;
const BASE_URL = process.env.BASE_URL || (process.env.AWS_MODE === 'true'
  ? 'https://api.motionmesh.co.in'
  : 'http://localhost:8080');
const CONCURRENCY = parseInt(process.env.CONCURRENCY) || 500;
const API_KEY = process.env.API_KEY || 'test_benchmark_token';
if (process.env.AWS_MODE === 'true' && !process.env.API_KEY) {
  console.error('ABORT: API_KEY is required in AWS_MODE');
  process.exit(1);
}

// Reservoir Sampling for Bounded Memory Latency Tracking
class ReservoirSampler {
  constructor(capacity = 1000) {
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

class MotionmeshClient {
  constructor(baseURL) {
    this.baseURL = new URL(baseURL);
    this.isHttps = this.baseURL.protocol === 'https:';
    
    // Connection pooling
    const agentOpts = {
      keepAlive: true,
      maxSockets: CONCURRENCY, 
      maxFreeSockets: CONCURRENCY,
      timeout: 5000,
    };
    
    this.agent = this.isHttps ? new https.Agent(agentOpts) : new http.Agent(agentOpts);
  }

  async request(path) {
    return new Promise((resolve, reject) => {
      const req = (this.isHttps ? https : http).request(new URL(path, this.baseURL), {
        method: 'GET',
        agent: this.agent,
        headers: {
          'User-Agent': 'motionmesh-node-benchmark/1.0',
          'Authorization': `Bearer ${API_KEY}`
        }
      }, (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.statusCode);
          } else {
            reject(new Error(`Status: ${res.statusCode}`));
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }
}

async function runBenchmark() {
  console.log(`Starting Raw HTTP Max Throughput Benchmark`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Duration: ${DURATION_SEC} seconds`);
  console.log(`Concurrency: ${CONCURRENCY}`);

  const client = new MotionmeshClient(BASE_URL);

  // Preflight Health Check
  try {
    console.log('Running pre-flight health check (/health)...');
    await client.request('/health');
  } catch (err) {
    console.error(`ABORT: /health failed: ${err.message}`);
    process.exit(1);
  }

  // Preflight Auth Check
  try {
    console.log('Running pre-flight auth check (/v1/videos?limit=1)...');
    await client.request('/v1/videos?limit=1');
  } catch (err) {
    console.error(`ABORT: /v1/videos auth check failed: ${err.message}`);
    process.exit(1);
  }

  console.log(`\nPre-flight passed. Blasting for ${DURATION_SEC} seconds...`);

  let successCount = 0;
  let errorCount = 0;
  const latencies = new ReservoirSampler(1000);
  
  const startTime = performance.now();
  const endTime = startTime + (DURATION_SEC * 1000);
  
  // Flood workers
  const workers = Array.from({ length: CONCURRENCY }).map(async () => {
    while (performance.now() < endTime) {
      const reqStart = performance.now();
      try {
        await client.request('/v1/videos?limit=10'); // Same realistic payload as SDK benchmark
        latencies.add(performance.now() - reqStart);
        successCount++;
      } catch (err) {
        errorCount++;
      }
    }
  });

  await Promise.all(workers);

  const totalTimeSec = (performance.now() - startTime) / 1000;
  const actualRps = (successCount + errorCount) / totalTimeSec;
  const p50 = latencies.getPercentile(0.50);
  const p95 = latencies.getPercentile(0.95);
  const p99 = latencies.getPercentile(0.99);

  console.log(`\n--- MAX THROUGHPUT RESULTS ---`);
  console.log(`Total Requests:    ${successCount + errorCount}`);
  console.log(`Successful:        ${successCount}`);
  console.log(`Failed:            ${errorCount}`);
  console.log(`Time Elapsed:      ${totalTimeSec.toFixed(2)}s`);
  console.log(`Actual RPS (Max):  ${actualRps.toFixed(2)} req/sec`);
  console.log(`Latency p50:       ${p50.toFixed(2)} ms`);
  console.log(`Latency p95:       ${p95.toFixed(2)} ms`);
  console.log(`Latency p99:       ${p99.toFixed(2)} ms`);

  // Write Artifact
  const outDir = path.join(__dirname, '../../docs/benchmarks');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  
  const report = {
    timestamp: new Date().toISOString(),
    benchmark_type: "raw_http_max_throughput",
    duration_s: totalTimeSec,
    concurrency: CONCURRENCY,
    requests: {
      total: successCount + errorCount,
      success: successCount,
      failed: errorCount
    },
    actual_rps: actualRps,
    latency_ms: {
      p50, p95, p99
    }
  };

  const outFile = path.join(outDir, `raw-http-throughput-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\nArtifact saved to: ${outFile}`);
  
  process.exit(0);
}

runBenchmark().catch(console.error);
