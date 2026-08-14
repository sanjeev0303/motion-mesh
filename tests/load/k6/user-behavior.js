import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

export const options = {
  stages: [
    { duration: '30s', target: 5000 },
    { duration: '2m', target: 5000 },
    { duration: '30s', target: 0 },
  ],
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

let data;
try {
  data = JSON.parse(open('./data.json'));
} catch (e) {
  data = { api_keys: ['test_token'], video_ids: ['vid_123'] };
}

const apiKeys = data.api_keys && data.api_keys.length > 0 ? data.api_keys : ['test_token'];
const videoIds = data.video_ids && data.video_ids.length > 0 ? data.video_ids : ['vid_123'];

export default function () {
  const vuApiKey = apiKeys[exec.vu.idInTest % apiKeys.length];
  const params = {
    headers: {
      'Authorization': `Bearer ${vuApiKey}`,
      'Content-Type': 'application/json',
    },
  };

  // Step 1: User logs in and lists videos
  let res = http.get(`${BASE_URL}/v1/videos`, params);
  check(res, { 'GET videos status 200': (r) => r.status === 200 });
  sleep(Math.random() * 2 + 1); // Think time 1-3s

  // Step 2: User clicks a specific video
  const vid = videoIds[exec.vu.idInTest % videoIds.length];
  res = http.get(`${BASE_URL}/v1/videos/${vid}`, params);
  check(res, { 'GET video detail 200': (r) => r.status === 200 });
  sleep(Math.random() * 1 + 0.5); // Think time 0.5-1.5s

  // Step 3: Player fetches playback auth
  res = http.get(`${BASE_URL}/v1/videos/${vid}/playback`, params);
  check(res, { 'GET video playback 200': (r) => r.status === 200 });
  sleep(5); // Watch video for 5 seconds
}
