import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

// Phase 28 — SDK vs Direct HTTP Comparison
// Uses the MotionMeshClient (SDK) path vs raw HTTP to measure SDK overhead.
// SDK overhead = SDK p99 - HTTP p99
//
// IMPORTANT: MotionMeshClient uses the SDK's internal routing.
// This test simulates the HTTP path only (SDK path measured via SDK test runner).
// Run both tests against the same cluster at the same RPS.

const RPS_TARGET = parseInt(__ENV.RPS_TARGET || '1000');
const TEST_MODE = __ENV.TEST_MODE || 'http'; // 'http' or 'sdk-simulated'

export const options = {
  scenarios: {
    direct_http: {
      executor: 'constant-arrival-rate',
      rate: RPS_TARGET,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: Math.ceil(RPS_TARGET * 0.1),
      maxVUs: RPS_TARGET * 2,
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
  if (res.status !== 200) throw new Error(`Health check: ${res.status}`);
  return { api_keys: data.api_keys, video_ids: data.video_ids };
}

export default function (testData) {
  const idx = exec.scenario.iterationInTest % testData.api_keys.length;
  const token = testData.api_keys[idx];
  const vid = testData.video_ids[exec.scenario.iterationInTest % testData.video_ids.length];

  // Simulate what MotionMeshClient.videos.list() does internally
  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Client': TEST_MODE === 'sdk-simulated' ? 'motionmesh-sdk/1.0' : 'direct-http',
    },
  };

  const res = http.get(`${BASE_URL}/v1/videos?limit=10`, params);
  check(res, {
    [`${TEST_MODE} GET /v1/videos 200`]: (r) => r.status === 200,
  });
}

// HOW TO COMPARE:
// 1. Run: TEST_MODE=http RPS_TARGET=5000 k6 run sdk-http.js --summary-export=http-baseline.json
// 2. Run SDK test via Node.js using MotionMeshClient (separate runner):
//    node tests/load/sdk-runner.js --rps=5000 --duration=5m --output=sdk-results.json
// 3. Compare p50/p95/p99 between http-baseline.json and sdk-results.json
// 4. SDK overhead = SDK p99 - HTTP p99
