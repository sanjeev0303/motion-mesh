const http = require('http');
const https = require('https');
const axios = require('axios');

// Configure global agents for connection pooling
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 500 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 500 });

const API_URL = process.env.API_URL || 'http://localhost:8080';
const API_KEY = process.env.API_KEY || 'test_api_key';
const RPS_TARGET = parseInt(process.env.RPS_TARGET || '1000', 10);
const DURATION_SECONDS = parseInt(process.env.DURATION_SECONDS || '10', 10);

const client = axios.create({
  baseURL: API_URL,
  httpAgent,
  httpsAgent,
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  }
});

let successCount = 0;
let errorCount = 0;
let latencies = [];

async function makeRequest() {
  const start = process.hrtime.bigint();
  try {
    // A standard high-volume endpoint
    await client.get('/v1/jobs?limit=5');
    successCount++;
  } catch (err) {
    errorCount++;
  } finally {
    const end = process.hrtime.bigint();
    latencies.push(Number(end - start) / 1000000); // ms
  }
}

async function runBenchmark() {
  console.log(`Starting SDK Benchmark targeting ${RPS_TARGET} RPS for ${DURATION_SECONDS} seconds...`);
  const intervalMs = 1000 / RPS_TARGET;
  let running = true;
  
  setTimeout(() => {
    running = false;
  }, DURATION_SECONDS * 1000);

  const promises = [];
  
  while (running) {
    const batch = [];
    // Dispatch roughly 10% of RPS target per 100ms
    for (let i = 0; i < RPS_TARGET / 10; i++) {
      batch.push(makeRequest());
    }
    promises.push(...batch);
    await new Promise(resolve => setTimeout(resolve, 100)); // sleep 100ms
  }

  console.log("Waiting for requests to finish...");
  await Promise.all(promises);

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length || 0;

  console.log('--- Benchmark Results ---');
  console.log(`Total Requests: ${successCount + errorCount}`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Avg Latency: ${avg.toFixed(2)}ms`);
  console.log(`p50 Latency: ${p50.toFixed(2)}ms`);
  console.log(`p95 Latency: ${p95.toFixed(2)}ms`);
  console.log(`p99 Latency: ${p99.toFixed(2)}ms`);
}

runBenchmark().catch(console.error);
