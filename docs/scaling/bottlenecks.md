# Known Bottlenecks and Mitigations

This document outlines bottlenecks that were identified and mitigated during the MotionMesh scaling journey.

## 1. Synchronous Event Publishing
**Bottleneck**: Publishing to NATS during HTTP requests added latency and risked data loss if NATS was unavailable or the request timed out.
**Mitigation**: Implemented the Transactional Outbox pattern. The API inserts an event into the `outbox_events` table within the same transaction as the business logic. A background relay securely picks these up using `SKIP LOCKED` and publishes to NATS.

## 2. Heavy Aggregate Queries
**Bottleneck**: Dashboard requests required calculating totals for videos and storage per account, resulting in slow `SELECT COUNT(*)` queries on the large `videos` table.
**Mitigation**: Added database triggers (`017`, `018`) to maintain denormalized counters on the `accounts` and `buckets` tables, making reads instant ($O(1)$).

## 3. Stripe API Rate Limits
**Bottleneck**: Calling Stripe synchronously on every video upload for metered billing caused excessive latency and hit Stripe rate limits quickly.
**Mitigation**: Shifted billing updates to an async worker that consumes from a JetStream queue. Grouped updates and implemented `STRIPE_MOCK_MODE` for load testing without hitting external limits.

## 4. Connection Exhaustion
**Bottleneck**: High RPS exhausted database connections.
**Mitigation**: Leveraged `pgxpool` with optimized max/min connection counts and updated K8s HPA to scale out the API pods dynamically.

## 5. Idempotency Failures
**Bottleneck**: When NATS redelivered messages due to timeouts, billing usage was double-counted.
**Mitigation**: Added unique constraints to the usage events table and modified inserts to use `ON CONFLICT DO NOTHING`.
