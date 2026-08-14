const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');

// A script to benchmark 1M RPM using Node.js worker threads
// Usage: node tests/load/worker/benchmark.js

if (isMainThread) {
  const dataPath = path.join(__dirname, '../k6/data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('Data file not found. Run generate-load-data first.');
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const apiKeys = data.api_keys;

  const numWorkers = require('os').cpus().length;
  const targetRPM = 1000000;
  const targetRPS = Math.ceil(targetRPM / 60);
  const rpsPerWorker = Math.ceil(targetRPS / numWorkers);

  console.log(`Starting Node.js 1M RPM Benchmark (${targetRPS} total RPS)`);
  console.log(`Spawning ${numWorkers} workers, each targeting ${rpsPerWorker} RPS`);

  let totalRequests = 0;
  let totalErrors = 0;
  let startTime = Date.now();

  for (let i = 0; i < numWorkers; i++) {
    // Partition API keys
    const keysPerWorker = Math.floor(apiKeys.length / numWorkers);
    const workerKeys = apiKeys.slice(i * keysPerWorker, (i + 1) * keysPerWorker);

    const worker = new Worker(__filename, {
      workerData: {
        apiKeys: workerKeys,
        targetRPS: rpsPerWorker,
        baseUrl: process.env.BASE_URL || 'http://localhost:8080'
      }
    });

    worker.on('message', (msg) => {
      if (msg.type === 'metrics') {
        totalRequests += msg.requests;
        totalErrors += msg.errors;
      }
    });
  }

  // Monitor metrics every second
  setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const currentRPS = totalRequests / elapsed;
    console.log(`Elapsed: ${elapsed.toFixed(1)}s | Total Req: ${totalRequests} | Current RPS: ${currentRPS.toFixed(0)} | Errors: ${totalErrors}`);
  }, 1000);

} else {
  // Worker Thread
  const { apiKeys, targetRPS, baseUrl } = workerData;
  let requests = 0;
  let errors = 0;

  // Since the frontend SDK expects a Next.js /api endpoint, in raw benchmarks
  // against the Go API we simulate the network conditions using fetch directly,
  // or we could import the SDK if the environment matches Next.js.
  // For maximum node throughput testing, raw fetch is used to bypass React-specific logic.

  async function makeRequest() {
    const key = apiKeys[Math.floor(Math.random() * apiKeys.length)];
    try {
      const res = await fetch(`${baseUrl}/v1/videos?limit=10`, {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      if (!res.ok) {
        errors++;
      }
    } catch (e) {
      errors++;
    }
    requests++;
  }

  // Interval-based constant arrival rate
  const intervalMs = 1000 / targetRPS;
  setInterval(() => {
    makeRequest();
  }, intervalMs);

  // Report metrics back to main thread periodically
  setInterval(() => {
    parentPort.postMessage({ type: 'metrics', requests, errors });
    requests = 0;
    errors = 0;
  }, 1000);
}
