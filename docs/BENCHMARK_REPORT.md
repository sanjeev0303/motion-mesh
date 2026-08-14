# Scalability Benchmark Report

## Target Infrastructure
**Environment:** AWS EKS / ECS + RDS PostgreSQL (Neon) + ElastiCache Redis + MSK/NATS JetStream + S3/B2

## Executive Summary
This report defines the parameters and expected outcomes for the Motionmesh scalability baseline validation. All load tests are to be executed using K6 from a dedicated EC2 instance cluster to simulate global traffic patterns.

### Target Benchmarks
- **1,000,000 requests/minute (1M RPM)**
- **~16,667 requests/second (RPS)**
- **20,000+ RPS headroom**
- **100,000 concurrent users/connections**

## Test Scenarios

### 1. Baseline Performance (`tests/load/k6/baseline.js`)
* **Objective:** Validate system functionality and baseline latency.
* **VUs:** 100
* **Duration:** 1 minute
* **Success Criteria:** `p(95) < 500ms`, `0% error rate`

### 2. Smoke Test (`tests/load/k6/smoke.js`)
* **Objective:** Quick validation of the critical path (API Key Auth + DB Read).
* **VUs:** 10
* **Duration:** 30 seconds
* **Success Criteria:** `0% error rate`

### 3. Ramp Test (`tests/load/k6/ramp.js`)
* **Objective:** Observe system degradation during gradual load increases.
* **VUs:** 0 to 10,000 over 2 minutes, hold 1 minute, scale down.
* **Success Criteria:** Linear CPU scaling, stable memory footprint.

### 4. Stress Test (`tests/load/k6/stress.js`)
* **Objective:** Push the system to absolute limits to find breaking points.
* **VUs:** Up to 20,000
* **Success Criteria:** Identify bottlenecks (e.g., DB pool exhaustion, Redis memory).

### 5. Spike Test (`tests/load/k6/spike.js`)
* **Objective:** Test autoscaling and recovery.
* **VUs:** Sudden spike to 10,000 VUs.
* **Success Criteria:** No cascaded failures, fast recovery.

### 6. Soak Test (`tests/load/k6/soak.js`)
* **Objective:** Discover memory leaks over a long period.
* **VUs:** 5,000
* **Duration:** 2 hours
* **Success Criteria:** Flat memory graph after initial allocation.

### 7. Concurrency Test (`tests/load/k6/concurrency-100k.js`)
* **Objective:** Test massive parallel open connections (C100K problem).
* **VUs:** 100,000
* **Success Criteria:** Node/Pod limits handle FD limits without `connection refused`.

## Results Summary (To be populated after AWS execution)
* **Date:** 
* **Environment Configuration:**
* **Max RPS Achieved:**
* **P95 Latency @ Max RPS:**
* **Identified Bottlenecks:**
