import http from 'k6/http';
import { check, group } from 'k6';
import exec from 'k6/execution';

// Phase 16 — Worker Concurrency Benchmark
// Tests concurrency levels: 4, 8, 16, 32
// Measures: jobs/sec, NATS lag, job latency
// The API endpoint POST /v1/videos triggers job ingestion.
// Worker metrics are collected externally via Prometheus.

export const options = {
  scenarios: {
    conc_4: {
      executor: 'constant-arrival-rate',
      rate: 4,
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 10,
      maxVUs: 50,
      startTime: '0s',
    },
    conc_8: {
      executor: 'constant-arrival-rate',
      rate: 8,
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 20,
      maxVUs: 100,
      startTime: '4m',
    },
    conc_16: {
      executor: 'constant-arrival-rate',
      rate: 16,
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 40,
      maxVUs: 200,
      startTime: '8m',
    },
    conc_32: {
      executor: 'constant-arrival-rate',
      rate: 32,
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 80,
      maxVUs: 400,
      startTime: '12m',
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: false }],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

let data = {};
try {
  data = JSON.parse(open('./data.json'));
} catch (e) {
  throw new Error('data.json missing');
}

export function setup() {
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) throw new Error(`Health check failed: ${res.status}`);
  return { api_keys: data.api_keys };
}

export default function (testData) {
  const idx = exec.scenario.iterationInTest % testData.api_keys.length;
  const token = testData.api_keys[idx];
  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  // Submit ingestion job — triggers NATS + worker processing pipeline
  const payload = JSON.stringify({
    title: `Concurrency Bench ${exec.scenario.name} iter=${exec.scenario.iterationInTest}`,
    description: 'worker concurrency benchmark',
    source_url: `https://storage.example.com/test-${exec.scenario.iterationInTest}.mp4`,
  });

  const res = http.post(`${BASE_URL}/v1/videos`, payload, params);
  check(res, {
    [`${exec.scenario.name} POST 201`]: (r) => r.status === 201,
  });
}

// NOTE: After each concurrency level completes, collect:
//   - motionmesh_worker_jobs_processed_total (rate)
//   - motionmesh_worker_job_phase_duration_seconds (all phases)
//   - motionmesh_worker_jobs_active
//   - NATS consumer pending messages (JetStream)
//   - Worker pod CPU / memory via kubectl top
// Compare across all four concurrency levels.
