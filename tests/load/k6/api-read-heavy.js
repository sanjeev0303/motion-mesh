import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

// 100K Concurrent VU Read-Heavy Simulation
export const options = {
  scenarios: {
    read_heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20000 }, // Ramp up to 20k VUs
        { duration: '30s', target: 20000 }, // Hold 20k VUs
        { duration: '10s', target: 0 },     // Ramp down
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], 
    http_req_duration: ['p(95)<100', 'p(99)<250'], 
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

const data = new SharedArray('benchmark data', function () {
  return [JSON.parse(open('./data.json'))];
});

export function setup() {
  const d = data[0];
  if (!d.api_keys || d.api_keys.length < 1000) {
    throw new Error('Insufficient API keys in data.json. Run generate-data.js first.');
  }
  if (!d.video_ids || d.video_ids.length < 1000) {
    throw new Error('Insufficient video_ids in data.json. Run generate-data.js first.');
  }

  // Pre-flight check
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Pre-flight health check failed: ${res.status}`);
  }
}

export default function () {
  const d = data[0];
  const idx = (__VU + __ITER) % d.api_keys.length;
  const token = d.api_keys[idx];
  
  // Read-heavy: 90% List, 10% Get Single Video
  const isList = Math.random() < 0.9;
  
  const params = {
    headers: {
      'Authorization': `Bearer ${token}`
    },
  };

  let res;
  if (isList) {
    res = http.get(`${BASE_URL}/v1/videos?limit=10`, params);
  } else {
    const vIdx = (__VU + __ITER) % d.video_ids.length;
    res = http.get(`${BASE_URL}/v1/videos/${d.video_ids[vIdx]}`, params);
  }
  
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  
  // Simulate user think time
  sleep(1);
}
