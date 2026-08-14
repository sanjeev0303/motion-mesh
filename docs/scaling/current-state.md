# MotionMesh Scaling: Current State

## Architecture Overview
MotionMesh is designed as a distributed, high-performance video platform.
- **API Server**: Go-based stateless API, horizontally scalable.
- **Workers**: Go-based consumer workers for async jobs (transcoding, cleanup).
- **Messaging**: NATS JetStream for durable event streaming and work queues.
- **Database**: PostgreSQL (Aurora) for relational data and metadata.
- **Cache**: Redis (ElastiCache) for rate limiting and ephemeral state.
- **Storage**: AWS S3 for video assets.

## Recent Scaling Improvements
1. **Outbox Pattern**: Replaced synchronous event publishing with a transactional outbox table and an async relay worker to ensure exactly-once delivery semantics for internal events.
2. **Denormalized Counters**: Replaced heavy `COUNT(*)` queries with database triggers that maintain `total_videos`, `total_storage_bytes`, `total_objects`, and `total_size_bytes` on accounts and buckets.
3. **JetStream Consumers**: Replaced synchronous billing event handling with NATS JetStream consumers for durable retry capabilities and decoupling.
4. **Idempotency**: Implemented `ON CONFLICT DO NOTHING` logic for usage event recording to protect against duplicated NATS deliveries.
5. **Cursor Validation**: Fortified cursor-based pagination to reject malformed or tampered cursors instead of failing open.
6. **Object Authorization**: Secured bucket access so users cannot retrieve objects from buckets they don't own by joining tables during queries.

## Current Capacity Targets
- **Requests per Minute**: 1,000,000 (~16,667 RPS)
- **Concurrency**: 100,000 concurrent users
- **Headroom**: Tested up to 20,000 RPS without degradation
