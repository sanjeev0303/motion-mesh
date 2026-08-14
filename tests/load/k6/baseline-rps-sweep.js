import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

// Phase 0 — Baseline RPS Sweep
// Targets: 1K 5K 10K 12.5K 15K 16,667 18K 20K
// Each step runs for 2 minutes to reach steady state.
// Use constant-arrival-rate (open model) so dropped iterations are visible.

export const options = {
  scenarios: {
    rps_1k: {
      executor: 'constant-arrival-rate',
      rate: 1000,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 100,
      maxVUs: 2000,
      startTime: '0s',
    },
    rps_5k: {
      executor: 'constant-arrival-rate',
      rate: 5000,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 500,
      maxVUs: 5000,
      startTime: '3m',
    },
    rps_10k: {
      executor: 'constant-arrival-rate',
      rate: 10000,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 1000,
      maxVUs: 8000,
      startTime: '6m',
    },
    rps_12500: {
      executor: 'constant-arrival-rate',
      rate: 12500,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 1500,
      maxVUs: 10000,
      startTime: '9m',
    },
    rps_15k: {
      executor: 'constant-arrival-rate',
      rate: 15000,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 2000,
      maxVUs: 12000,
      startTime: '12m',
    },
    rps_16667: {
      executor: 'constant-arrival-rate',
      rate: 16667,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 2500,
      maxVUs: 15000,
      startTime: '15m',
    },
    rps_18k: {
      executor: 'constant-arrival-rate',
      rate: 18000,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 3000,
      maxVUs: 15000,
      startTime: '18m',
    },
    rps_20k: {
      executor: 'constant-arrival-rate',
      rate: 20000,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 3500,
      maxVUs: 20000,
      startTime: '21m',
    },
  },

  // Thresholds are informational for the sweep — do not abort.
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: false }],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

let data = {};
try {
  data = JSON.parse(open('./data.json'));
} catch (e) {
  throw new Error('data.json missing. Run validate-data.js first.');
}

if (!data.api_keys || data.api_keys.length === 0) throw new Error('Missing api_keys in data.json');
if (!data.video_ids || data.video_ids.length === 0) throw new Error('Missing video_ids in data.json');
if (!data.bucket_ids || data.bucket_ids.length === 0) throw new Error('Missing bucket_ids in data.json');

export function setup() {
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Pre-flight health check failed: ${res.status}`);
  }
  const authRes = http.get(`${BASE_URL}/v1/videos?limit=1`, {
    headers: { Authorization: `Bearer ${data.api_keys[0]}` },
  });
  if (authRes.status !== 200) {
    throw new Error(`Auth pre-flight failed: ${authRes.status}`);
  }
  return { api_keys: data.api_keys, video_ids: data.video_ids, bucket_ids: data.bucket_ids };
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

  // Realistic route mix — matches api-1m-rpm-sustained.js
  const rand = Math.random();
  let res;
  let tag;

  if (rand < 0.30) {
    res = http.get(`${BASE_URL}/v1/videos`, params);
    tag = 'GET /v1/videos';
  } else if (rand < 0.50) {
    const vid = testData.video_ids[exec.scenario.iterationInTest % testData.video_ids.length];
    res = http.get(`${BASE_URL}/v1/videos/${vid}`, params);
    tag = 'GET /v1/videos/:id';
  } else if (rand < 0.65) {
    const vid = testData.video_ids[exec.scenario.iterationInTest % testData.video_ids.length];
    res = http.get(`${BASE_URL}/v1/videos/${vid}/playback`, params);
    tag = 'GET /v1/videos/:id/playback';
  } else if (rand < 0.75) {
    res = http.get(`${BASE_URL}/v1/jobs`, params);
    tag = 'GET /v1/jobs';
  } else if (rand < 0.85) {
    res = http.get(`${BASE_URL}/v1/buckets`, params);
    tag = 'GET /v1/buckets';
  } else if (rand < 0.90) {
    const bid = testData.bucket_ids[exec.scenario.iterationInTest % testData.bucket_ids.length];
    res = http.get(`${BASE_URL}/v1/buckets/${bid}/objects`, params);
    tag = 'GET /v1/buckets/:id/objects';
  } else if (rand < 0.95) {
    res = http.get(`${BASE_URL}/v1/branding`, params);
    tag = 'GET /v1/branding';
  } else {
    const payload = JSON.stringify({
      title: `Sweep Test ${exec.scenario.iterationInTest}`,
      description: 'k6 baseline sweep',
    });
    res = http.post(`${BASE_URL}/v1/videos`, payload, params);
    tag = 'POST /v1/videos';
  }

  check(res, {
    [`${tag} 2xx`]: (r) => r.status >= 200 && r.status < 300,
  });
}
