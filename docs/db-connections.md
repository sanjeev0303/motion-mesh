# PostgreSQL Connection Architecture & Budgeting

To support our benchmark target of 1,000,000 RPM (≈16,667 RPS) and a burst headroom of 20,000 RPS without starving the database or causing connection saturation, Motionmesh implements a multi-tier connection strategy relying heavily on `pgbouncer` (transaction pooling) and tuned local `pgxpool` instances.

## 1. Connection Pooling Strategy

At 20,000 RPS, direct Postgres connections (one per request) would immediately exhaust available memory and CPU (connection fork overhead). Therefore, all services connect through **PgBouncer** configured in `transaction` pooling mode.

### PgBouncer Settings (Infrastructure Layer)

- **Mode**: `transaction`
- **Max Client Connections** (`max_client_conn`): `10000` (High allowance to absorb TCP backpressure from API pods)
- **Default Pool Size** (`default_pool_size`): `200` to `400`
- **Max DB Connections** (`max_db_connections`): `500` (PostgreSQL server `max_connections` should be set to ~600 to leave headroom for admin access and replication).

## 2. Application-Level Budget (pgxpool)

Each instance of the Motionmesh API and Worker manages a local connection pool using `pgxpool`. These pools must be correctly sized to avoid queueing within the pod while preventing PgBouncer starvation.

### Target Environment (1,000,000 RPM / 20k RPS)
Assuming 50 API Pods and 10 Worker Pods in Kubernetes:

**API Pods (`motionmesh-api`)**
- `DB_MAX_CONNS`: `15`
- `DB_MIN_CONNS`: `5`
- *Rationale*: 50 pods × 15 conns = 750 max client connections to PgBouncer. This easily fits within PgBouncer's `max_client_conn` limit while multiplexing efficiently down to the 200-400 physical DB connections.

**Worker Pods (`motionmesh-worker`)**
- `DB_MAX_CONNS`: `20`
- `DB_MIN_CONNS`: `5`
- *Rationale*: 10 pods × 20 conns = 200 client connections to PgBouncer. Workers hold connections slightly longer due to complex transactions (e.g., job completion and outbox publishing).

## 3. LRU Caching Offload

To achieve 20,000 RPS within this connection budget, heavy read paths bypass the database entirely:
1. **API Keys & Authentication**: 99.9% cache hit rate via 3-tier architecture (In-memory LRU → Redis → DB).
2. **Account Plan & Usage Checks**: Bounded in-process LRU cache falling back to Redis.

Without this caching layer, the 20,000 RPS would translate to at least 20,000 queries per second (QPS) just for authentication, completely overwhelming the connection pools.

## 4. Timeout and Lifecycle Hygiene

The application pool (`pgxpool`) enforcing strict lifecycles to prevent stalled connections:
- `MaxConnLifetime`: `5m` (Ensures connections are recycled to prevent slow memory leaks)
- `MaxConnIdleTime`: `2m` (Scales down unused connections during low traffic)
- `HealthCheckPeriod`: `30s` (Detects network partitions quickly)

## Summary

| Component          | Parameter            | Recommended Value | Notes |
|--------------------|----------------------|-------------------|-------|
| PostgreSQL Server  | `max_connections`    | `600`             | Absolute hard limit |
| PgBouncer          | `default_pool_size`  | `400`             | Max physical DB conns used |
| PgBouncer          | `max_client_conn`    | `10000`           | Max TCP conns from pods |
| API Pod (x50)      | `DB_MAX_CONNS`       | `15`              | 750 total client conns |
| Worker Pod (x10)   | `DB_MAX_CONNS`       | `20`              | 200 total client conns |
