import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';

// Realistic 1M RPM (16,667 RPS) Load Profile
export const options = {
  scenarios: {
    // Stage 1: Warmup
    warmup: {
      executor: 'constant-arrival-rate',
      rate: 1000,
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 50,
      maxVUs: 1000,
    },
    // Stage 2: 1M RPM Peak
    peak: {
      executor: 'constant-arrival-rate',
      rate: 16667,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 500,
      maxVUs: 5000,
      startTime: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], // strict 99% success rate
    http_req_duration: ['p(95)<100', 'p(99)<250'], // strict latency limits
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

// SharedArray prevents loading the 100k data file into every VU's memory independently
const data = new SharedArray('benchmark data', function () {
  return [JSON.parse(open('./data.json'))];
});

export function setup() {
  const d = data[0];
  if (!d.api_keys || d.api_keys.length < 1000) {
    throw new Error('Insufficient API keys in data.json. Run generate-data.js first (requires at least 1000).');
  }

  // Pre-flight check
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Pre-flight health check failed: ${res.status}`);
  }
}

export default function () {
  const d = data[0];
  
  // Deterministic pseudo-random key to ensure cache hits & simulate real-world distribution
  const idx = (__VU + __ITER) % d.api_keys.length;
  const token = d.api_keys[idx];

  const params = {
    headers: {
      'Authorization': `Bearer ${token}`,
      // X-Mock-Billing is REMOVED. The server must be run with LOAD_TEST_MODE=true to bypass billing.
    },
  };

  const res = http.get(`${BASE_URL}/v1/videos?limit=10`, params);
  
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
