# MotionMesh Main (5) Current State

## API Flow
- **Ingress**: Traffic enters via ALB/WAF and is routed to the EKS cluster running the API pods.
- **Authentication & Rate Limiting**: Requests pass through middleware for API-key verification (cached locally and in Redis with negative caching) and rate limiting using bucket/account counters and token buckets.
- **Routing**: API requests are handled by standard Go HTTP mux, processing RESTful operations.
- **Response**: Pagination uses keyset cursors for efficient list queries, validated per request. Responses include object authorization for secure access.

## Database Flow
- **Connection**: `pgxpool` manages connections to Amazon Aurora PostgreSQL (with optional RDS Proxy).
- **Mutations**: Write operations utilize transactional guarantees. Trigger-based counters maintain `total_objects` and `total_bytes` accurately.
- **Relay**: Significant state changes (like completed transcodes) utilize the Outbox pattern (inserted transactionally) instead of direct publish.

## Redis Flow
- **Usage**: Used for distributed caching of API keys, negative caching, and potentially session/plan data.
- **Resilience**: Features singleflight to prevent cache stampedes on expiration, backed by Amazon ElastiCache.

## Outbox Flow
- **Creation**: Events are saved to an `outbox_events` table as part of application transactions.
- **Relay**: An outbox relay worker polls/listens to the table, claiming leases.
- **Delivery**: The relay publishes events to NATS JetStream and updates the database row status (attempts, next retry).

## NATS Flow
- **Cluster**: A HA NATS cluster with JetStream persistence is deployed via Kubernetes manifests.
- **Durability**: Persistent volumes and pod disruption budgets ensure stream data (like billing and transcode queues) is resilient to node failure.
- **Streams**: Segregated into distinct subjects: transcode jobs, billing events, cleanup tasks.

## Worker Flow
- **Queueing**: The worker pulls jobs from NATS JetStream.
- **Processing**: Features a bounded goroutine pool to manage concurrency without overwhelming pod resources.
- **Execution**: Claims the job atomically in the DB, downloads media, runs FFmpeg, creates HLS outputs, and publishes to the outbox on completion.

## Billing Flow
- **Consumer**: A dedicated JetStream consumer reads billing events from the outbox relay.
- **Idempotency**: Uses the NATS sequence or a dedicated `event_id` to deduplicate inserts into `usage_events` via `ON CONFLICT (event_id) DO NOTHING`.
- **Sync**: Reconciles usage state internally before making asynchronous calls to external billing providers (Stripe).

## Storage Flow
- **Upload**: Clients receive presigned S3 URLs from the API to upload source media directly to the bucket.
- **Processing**: Workers download objects, process them locally, and upload the generated assets (HLS, thumbnails).
- **Abstraction**: Uses an `ObjectStorage` interface (via AWS SDK) avoiding hardcoded credentials by leveraging IRSA.

## CloudFront Flow
- **Delivery**: Processed media (HLS streams, thumbnails) are served to end-users via CloudFront distributions backed by S3.
- **Security**: Can leverage signed cookies/URLs if media privacy is enforced.

## SDK Flow
- **Integration**: JS and Python SDKs provide idiomatic wrappers over the REST API.
- **Resilience**: Implement retries, backoff, and connection reuse for high-throughput environments.
