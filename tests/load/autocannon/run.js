const autocannon = require('autocannon');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../k6/data.json');
let apiKeys = [];
let videoIds = [];

try {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  apiKeys = data.api_keys;
  videoIds = data.video_ids || ['vid_123'];
} catch (err) {
  console.error('Error reading data.json (run generate-load-data first):', err);
  process.exit(1);
}

const url = process.env.BASE_URL || 'http://localhost:8080';

const instance = autocannon({
  url: url,
  connections: parseInt(process.env.CONNECTIONS) || 1000,
  pipelining: parseInt(process.env.PIPELINING) || 1,
  duration: parseInt(process.env.DURATION) || 30,
  requests: [
    {
      method: 'GET',
      path: '/v1/videos?limit=10',
      setupRequest: (req, context) => {
        const apiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
        req.headers.Authorization = `Bearer ${apiKey}`;
        return req;
      }
    },
    {
      method: 'GET',
      path: '/v1/videos/placeholder',
      setupRequest: (req, context) => {
        const apiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
        const videoId = videoIds[Math.floor(Math.random() * videoIds.length)];
        req.path = `/v1/videos/${videoId}`;
        req.headers.Authorization = `Bearer ${apiKey}`;
        return req;
      }
    },
    {
      method: 'GET',
      path: '/v1/jobs',
      setupRequest: (req, context) => {
        const apiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
        req.headers.Authorization = `Bearer ${apiKey}`;
        return req;
      }
    },
    {
      method: 'GET',
      path: '/v1/buckets',
      setupRequest: (req, context) => {
        const apiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
        req.headers.Authorization = `Bearer ${apiKey}`;
        return req;
      }
    },
    {
      method: 'GET',
      path: '/v1/billing/subscription',
      setupRequest: (req, context) => {
        const apiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
        req.headers.Authorization = `Bearer ${apiKey}`;
        return req;
      }
    }
  ]
}, (err, result) => {
  if (err) {
    console.error('Error running autocannon:', err);
  }
});

autocannon.track(instance, { renderProgressBar: true });
