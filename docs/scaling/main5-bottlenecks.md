# MotionMesh Main (5) Bottlenecks

## Stripe Unbounded Goroutines
- **Location**: Billing event consumer/handler.
- **Issue**: Stripe API calls are executed inside unconstrained `go func()` blocks for every billing event.
- **Risk**: At high throughput (e.g., 1M RPM / 16.6k RPS), this spawns thousands of unbounded goroutines, saturating memory and TCP sockets, leading to app crashes and rate limits from Stripe.

## Outbox Stranded Events
- **Location**: Outbox relay worker.
- **Issue**: Events failing `maxAttempts` times are ignored by queries but lack a clear `dead_letter` state or observability.
- **Risk**: Events become permanently invisible, leading to silent data inconsistency.
- **Additional Issue**: Retries currently lack exponential backoff, hammering NATS during partial outages.

## Outbox Publish Concurrency
- **Location**: Outbox relay publisher.
- **Issue**: Relays publish asynchronously without explicit bounding on in-flight requests or publish timeouts.
- **Risk**: Can overwhelm the NATS client or memory if the database yields events faster than they can be published.

## Multipart S3 Upload Lifecycle
- **Location**: API storage handler.
- **Issue**: Only simple presigned PUTs are supported; missing complete multipart upload lifecycle APIs.
- **Risk**: Large video uploads (GBs) are unreliable, timeout frequently, and consume excessive memory on clients.

## Transcode Job Idempotency
- **Location**: Worker job handler.
- **Issue**: Idempotency is loosely based on output existence (e.g., `master.m3u8`), rather than an atomic DB state transition.
- **Risk**: NATS redeliveries or overlapping workers could start multiple expensive FFmpeg processes for the same video.

## Cleanup Idempotency & Batching
- **Location**: Cleanup worker.
- **Issue**: Objects are deleted individually or retried identically on partial failures.
- **Risk**: High latency and API rate-limiting against S3 when cleaning up thousands of HLS segments. Repeated cleanup messages might fail if partially completed previously.

## Billing Account Cache Contention
- **Location**: Billing worker.
- **Issue**: `GetAccountByID()` is called per billing event against the primary database.
- **Risk**: High database CPU utilization due to constant lookups of account/Stripe mappings at scale.

## AWS SDK Credentials
- **Location**: Shared storage adapter.
- **Issue**: Assuming static credentials rather than IRSA (IAM Roles for Service Accounts). Path-style addressing is used by default instead of virtual-hosted.
- **Risk**: Reduced security in EKS, potential routing inefficiencies in production AWS environments.
