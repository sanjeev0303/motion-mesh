import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

// This benchmark measures orchestration/queue throughput directly
// by pushing events to the API which pushes to NATS, and we expect 
// the worker to process them.
export const options = {
  scenarios: {
    worker_queue: {
      executor: 'constant-arrival-rate',
      rate: 1000, // 1000 jobs per second target
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 100,
      maxVUs: 500,
    },
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const MOCK_FFMPEG = __ENV.MOCK_FFMPEG || 'true'; // Configurable for orchestration tests

let data = {};
try {
  data = JSON.parse(open('./data.json'));
} catch (e) {
  throw new Error("data.json not found or invalid JSON");
}

if (!data.api_keys || data.api_keys.length === 0) throw new Error("Missing api_keys in data.json");
const apiKeys = data.api_keys;

export default function () {
  const vuApiKey = apiKeys[exec.scenario.iterationInTest % apiKeys.length];
  const params = {
    headers: {
      'Authorization': `Bearer ${vuApiKey}`,
      'Content-Type': 'application/json',
      'X-Mock-FFmpeg': MOCK_FFMPEG // Passing mock signal if supported by API/Worker
    },
  };

  const payload = JSON.stringify({
    title: `Worker Load Test Job ${exec.scenario.iterationInTest}`,
    description: 'Triggering transcode orchestration'
  });

  const res = http.post(`${BASE_URL}/v1/videos`, payload, params);
  check(res, { 'POST video triggers job 201': (r) => r.status === 201 });
}
