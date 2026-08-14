import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

export const options = {
  stages: [
    { duration: '1m', target: 500 },
    { duration: '3m', target: 500 },
    { duration: '1m', target: 0 },
  ],
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

const apiKeys = new SharedArray('api keys', function () {
  return JSON.parse(open('./data.json')).api_keys;
});

export function setup() {
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`API is not healthy, status: ${res.status}`);
  }
}

export default function () {
  const apiKey = apiKeys[exec.vu.idInTest % apiKeys.length];
  const params = {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  };

  const rand = Math.random();
  if (rand < 0.30) {
    const res = http.get(`${BASE_URL}/v1/videos`, params);
    check(res, { 'status is 200': (r) => r.status === 200 });
  } else if (rand < 0.50) {
    const res = http.get(`${BASE_URL}/v1/videos/123`, params);
    check(res, { 'status is 200 or 404': (r) => r.status === 200 || r.status === 404 });
  } else if (rand < 0.65) {
    const res = http.get(`${BASE_URL}/v1/videos/123/playback`, params);
    check(res, { 'status is 200 or 404': (r) => r.status === 200 || r.status === 404 });
  } else if (rand < 0.75) {
    const res = http.get(`${BASE_URL}/v1/jobs`, params);
    check(res, { 'status is 200': (r) => r.status === 200 });
  } else if (rand < 0.85) {
    const res = http.get(`${BASE_URL}/v1/buckets`, params);
    check(res, { 'status is 200': (r) => r.status === 200 });
  } else if (rand < 0.90) {
    const res = http.get(`${BASE_URL}/v1/buckets/123/objects`, params);
    check(res, { 'status is 200 or 404': (r) => r.status === 200 || r.status === 404 });
  } else if (rand < 0.95) {
    const res = http.get(`${BASE_URL}/v1/billing`, params);
    check(res, { 'status is 200': (r) => r.status === 200 });
  } else {
    const res = http.get(`${BASE_URL}/health`);
    check(res, { 'status is 200': (r) => r.status === 200 });
  }
  
  sleep(1);
}
