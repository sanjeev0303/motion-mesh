# Motionmesh k6 Load Testing

This directory contains the k6 load testing scripts used to benchmark the Motionmesh platform.

## Test Scripts

- `production-mixed.js`: Real-world simulation of traffic. 90% read requests (fetching videos, jobs, billing) and 10% write requests (creating new videos). Use this to measure steady-state production performance.
- `api-1m-rpm.js`: Target script for the 1,000,000 RPM (16,667 RPS) throughput test.
- `concurrency-100k.js`: Script to test the system's ability to handle 100,000 concurrent virtual users.

## Environment Variables

When running the scripts, you can customize their behavior using the following environment variables:

- `BASE_URL`: The base URL of the API. (Default: `http://localhost:8080`)
- `API_KEY`: The authorization token to use for the requests. (Default: `test_benchmark_token`)

## Token Bypass (Benchmark Token)

To support high-throughput load testing without overwhelming the database with authentication queries, the API middleware supports a **Token Bypass** mechanism.

When the server is run with `LOAD_TEST_MODE=true` in the environment (`server/.env`), the system will automatically accept the token `test_benchmark_token`. This token bypasses cryptographic verification and assigns the request to a mock `pro` account.

**How to run a test with token bypass:**

1. Ensure the API is running with `LOAD_TEST_MODE=true`.
2. Run k6, overriding the API_KEY environment variable (or let it default to `test_benchmark_token`):

```bash
k6 run -e API_KEY=test_benchmark_token -e BASE_URL=http://localhost:8080 production-mixed.js
```

## Running Tests

To run the production-mixed test:

```bash
k6 run production-mixed.js
```

To run the 1M RPM benchmark test:

```bash
k6 run api-1m-rpm.js
```
