import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate   = new Rate('error_rate');
const latencyP50  = new Trend('latency_p50', true);
const totalReqs   = new Counter('total_requests');

// Configuration via env
const TARGET_RPS  = parseInt(__ENV.TARGET_RPS  || '100');
const DURATION    = __ENV.DURATION             || '30s';
const BASE_URL    = __ENV.BASE_URL             || 'https://api.motionmesh.co.in/v1';
const API_KEY     = __ENV.API_KEY              || '';

export const options = {
  scenarios: {
    constant_rate: {
      executor:        'constant-arrival-rate',
      rate:            TARGET_RPS,
      timeUnit:        '1s',
      duration:        DURATION,
      preAllocatedVUs: Math.min(TARGET_RPS * 2, 5000),
      maxVUs:          Math.min(TARGET_RPS * 4, 20000),
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.05'],   // <5% error rate
    http_req_duration: ['p(95)<2000'],  // p95 < 2s
  },
};

const HEADERS = {
  'Content-Type': 'application/json',
  ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
};

export default function () {
  // Health check — lightweight, public endpoint, ideal for baseline
  const res = http.get(`${BASE_URL}/health`, { headers: HEADERS, timeout: '10s' });

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'latency < 2s': (r) => r.timings.duration < 2000,
  });

  errorRate.add(!ok);
  latencyP50.add(res.timings.duration);
  totalReqs.add(1);
}
