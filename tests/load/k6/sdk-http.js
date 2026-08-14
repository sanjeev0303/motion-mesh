import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

export const options = {
  scenarios: {
    sdk_simulation: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

const apiKeys = new SharedArray('api keys', function () {
  return JSON.parse(open('./data.json')).api_keys;
});

export default function () {
  const apiKey = apiKeys[exec.vu.idInTest % apiKeys.length];
  const params = {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  };

  // Simulate an SDK fetching videos and a specific video
  let res = http.get(`${BASE_URL}/api/v1/videos?limit=20`, params);
  check(res, { 'status is 200': (r) => r.status === 200 });

  if (res.status === 200) {
    const data = res.json();
    if (data.data && data.data.length > 0) {
      const videoId = data.data[0].id;
      res = http.get(`${BASE_URL}/api/v1/videos/${videoId}`, params);
      check(res, { 'video found': (r) => r.status === 200 });
    }
  }

  sleep(1);
}
