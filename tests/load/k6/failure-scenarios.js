import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '1m',
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export default function () {
  const res1 = http.get(`${BASE_URL}/api/v1/invalid_route`);
  check(res1, { 'status is 404': (r) => r.status === 404 });
  
  const res2 = http.post(`${BASE_URL}/api/v1/videos`, JSON.stringify({}), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res2, { 'status is 401 or 403': (r) => r.status === 401 || r.status === 403 });

  sleep(1);
}
