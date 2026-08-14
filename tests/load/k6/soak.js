import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

export const options = {
  stages: [
    { duration: '2m', target: 400 },
    { duration: '3h', target: 400 },
    { duration: '2m', target: 0 },
  ],
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
  const res = http.get(`${BASE_URL}/api/v1/videos`, params);
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
