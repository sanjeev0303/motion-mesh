# Database Connection Budget

When running MotionMesh at scale, you must carefully manage PostgreSQL connections to prevent exhausting Aurora's connection pool limits.

## Aurora Maximum Connections
For Aurora PostgreSQL, the maximum connection limit is determined by the instance size:

`LEAST({DBInstanceClassMemory/9531392}, 5000)`

Example Instance Limits:
- `db.t4g.medium` (4GB): ~400 connections
- `db.r6g.large` (16GB): ~1700 connections
- `db.r6g.4xlarge` (128GB): 5000 connections (Max)

## Connection Budget Formula
Your total configured maximum connections across all Kubernetes pods MUST NOT exceed the Aurora connection limit:

```
(API_PODS * API_DB_MAX_CONNS) + (WORKER_PODS * WORKER_DB_MAX_CONNS) <= AURORA_MAX_CONNECTIONS
```

## Example: 100K VU Benchmark Configuration
Suppose you are running 50 API pods and 100 Worker pods on a `db.r6g.xlarge` (Aurora max connections ≈ 3400):

1. **API Nodes (Heavy Read/Write, Quick transactions):**
   - Max Pods: 50
   - `DB_MAX_CONNS` per pod: 40
   - API Total: 2000 connections

2. **Worker Nodes (Long-running transcodes, Low DB frequency):**
   - Max Pods: 100
   - `DB_MAX_CONNS` per pod: 10
   - Worker Total: 1000 connections

**Total Budget = 3000** (Safely under the 3400 limit).

### Important Considerations
1. Leave at least a 10-15% buffer for RDS administrative connections and sidecar connections.
2. If `DB_MAX_CONNS` is set too high on a large number of pods, EKS scaling events will crash the database due to connection saturation (`FATAL: sorry, too many clients already`).
3. If `DB_MAX_CONNS` is set too low, the application layer will experience connection pooling latency (waiting for a free connection). Ensure it aligns with your application's concurrency model (e.g., Goroutine count).
