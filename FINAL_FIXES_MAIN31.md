# Main 31 Final Fixes

## SDK
- `MotionMeshClient` now accepts only the API key: `new MotionMeshClient(apiKey)`.
- Production API endpoint is internal to the SDK: `https://api.motionmesh.co.in/v1`.
- Removed public `baseURL` configuration from the JavaScript SDK client.
- Added API-key format validation for `mot_live_` / `mot_test_`.
- Kept `motionmesh` as a backwards-compatible alias.
- Python SDK now also accepts only an API key and uses the production endpoint internally.
- Official SDK benchmark now uses the real `MotionMeshClient` and no longer passes a base URL.

## Authentication / performance
- Last-used tracking remains asynchronous and non-blocking.
- Replaced per-key Redis `SETNX + HSET` round trips with a batched Redis Lua-script pipeline.
- Added last-used queue depth and Redis batch metrics.
- Kept bounded queue and local debounce.
- Redis auth cache reads use `HMGET` for only the required fields instead of `HGETALL`.
- Worker concurrency default reduced from 100 to 8; Kubernetes benchmark config already uses 8.

## Benchmark correctness
- Canonical benchmark generator exports every generated video ID.
- Benchmark data remains gitignored.
- Official SDK benchmark validates the 100K dataset in benchmark mode.
- SDK benchmark reports offered, completed, successful, failed and dropped RPS separately.
- Raw HTTP benchmark requires an API key in AWS mode and uses the AWS API endpoint.

## Important
These fixes have been applied to the source tree in this archive. AWS deployment and 1M-RPM performance are not claimed as verified by this source-only pass. Run tests and the progressive AWS benchmark before publishing investor metrics.
