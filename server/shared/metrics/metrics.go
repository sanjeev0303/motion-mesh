package metrics

import (
	"net/http"
	"runtime"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	// Registry is the global Prometheus registry for the application.
	Registry = prometheus.NewRegistry()

	// APIRequestsTotal counts total API requests by endpoint and status code.
	APIRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "motionmesh_api_requests_total",
			Help: "Total number of API requests",
		},
		[]string{"method", "path", "status"},
	)

	// APIRequestDuration tracks the latency of API requests.
	APIRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "motionmesh_api_request_duration_seconds",
			Help:    "API request duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)
	// WorkerJobsActive tracks the number of currently running jobs in the worker pool.
	WorkerJobsActive = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "motionmesh_worker_jobs_active",
			Help: "Number of active jobs in the worker pool",
		},
	)

	// WorkerJobsProcessedTotal counts total completed jobs.
	WorkerJobsProcessedTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "motionmesh_worker_jobs_processed_total",
			Help: "Total number of completed jobs",
		},
	)

	// WorkerJobsFailedTotal counts total failed jobs.
	WorkerJobsFailedTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "motionmesh_worker_jobs_failed_total",
			Help: "Total number of failed jobs",
		},
	)

	// CleanupJobsProcessedTotal counts total completed cleanup jobs.
	CleanupJobsProcessedTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "motionmesh_cleanup_jobs_processed_total",
			Help: "Total number of completed cleanup jobs",
		},
	)

	// CleanupJobsFailedTotal counts total failed cleanup jobs.
	CleanupJobsFailedTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "motionmesh_cleanup_jobs_failed_total",
			Help: "Total number of failed cleanup jobs",
		},
	)

	// WorkerJobPhaseDuration tracks the latency of different phases in the transcode job.
	WorkerJobPhaseDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "motionmesh_worker_job_phase_duration_seconds",
			Help:    "Duration of individual job phases in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"phase"}, // e.g., "download", "probe", "transcode", "upload"
	)

	// StripeAPICallsTotal counts Stripe API calls.
	StripeAPICallsTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "motionmesh_stripe_api_calls_total",
			Help: "Total number of Stripe API calls",
		},
	)

	// AIRequestsTotal counts AI provider requests.
	AIRequestsTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "motionmesh_ai_requests_total",
			Help: "Total number of AI requests",
		},
	)

	// LastUsedEnqueueTotal counts how many last used requests were enqueued.
	LastUsedEnqueueTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "motionmesh_last_used_enqueue_total",
			Help: "Total number of last used updates enqueued",
		},
	)

	// LastUsedDroppedTotal counts how many last used requests were dropped.
	LastUsedDroppedTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "motionmesh_last_used_dropped_total",
			Help: "Total number of last used updates dropped",
		},
	)

	// LastUsedWorkerLatency tracks the latency of the last used worker batch process.
	LastUsedWorkerLatency = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "motionmesh_last_used_worker_latency_seconds",
			Help:    "Latency of the last used worker in seconds",
			Buckets: prometheus.DefBuckets,
		},
	)

	LastUsedQueueDepth = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "motionmesh_last_used_queue_depth",
			Help: "Current number of pending last-used updates in the in-process queue",
		},
	)

	LastUsedRedisBatchesTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "motionmesh_last_used_redis_batches_total",
			Help: "Number of Redis batches used for last-used tracking",
		},
	)

	// AuthLocalHit counts auth local cache hits.
	AuthLocalHit = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "motionmesh_auth_local_hit_total",
			Help: "Total number of auth local cache hits",
		},
	)

	// AuthRedisHit counts auth redis cache hits.
	AuthRedisHit = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "motionmesh_auth_redis_hit_total",
			Help: "Total number of auth redis cache hits",
		},
	)

	// AuthDBFallback counts auth db fallbacks.
	AuthDBFallback = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "motionmesh_auth_db_fallback_total",
			Help: "Total number of auth db fallbacks",
		},
	)

	// AuthFailure counts auth failures.
	AuthFailure = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "motionmesh_auth_failure_total",
			Help: "Total number of auth failures",
		},
	)

	// ─── Phase 2: Route latency decomposition ─────────────────────────────────
	// RequestPhaseLatency tracks per-route, per-phase latency.
	// Labels: route (e.g. GET /v1/videos), phase (auth|redis|postgres|serialization|nats|s3|other)
	RequestPhaseLatency = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "motionmesh_request_phase_latency_seconds",
			Help:    "Per-route, per-phase latency for latency decomposition (Phase 2)",
			Buckets: []float64{.0001, .0005, .001, .005, .01, .025, .05, .1, .25, .5, 1},
		},
		[]string{"route", "phase"},
	)

	// ─── Phase 13: DB connection pool ─────────────────────────────────────────
	DBPoolWaitCount = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "motionmesh_db_pool_wait_count_total",
			Help: "Total number of times a request waited for a DB connection from the pool",
		},
	)

	DBPoolWaitDuration = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "motionmesh_db_pool_wait_duration_seconds",
			Help:    "Duration spent waiting for a DB pool connection",
			Buckets: []float64{.001, .005, .01, .025, .05, .1, .25, .5, 1, 2.5},
		},
	)

	DBPoolAcquiredConns = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "motionmesh_db_pool_acquired_conns",
			Help: "Current number of acquired DB pool connections",
		},
	)

	// ─── Phase 9: Last-used Redis operations ──────────────────────────────────
	LastUsedRedisOperationsTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "motionmesh_last_used_redis_operations_total",
			Help: "Total number of individual Redis operations issued by the last-used worker",
		},
	)

	// ─── Phase 6: Go runtime ──────────────────────────────────────────────────
	GoGoroutines = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "motionmesh_go_goroutines",
			Help: "Current number of goroutines in the API process",
		},
	)

	GoHeapAllocBytes = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "motionmesh_go_heap_alloc_bytes",
			Help: "Heap bytes currently allocated (live objects)",
		},
	)

	GoHeapSysBytes = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "motionmesh_go_heap_sys_bytes",
			Help: "Heap bytes obtained from the OS",
		},
	)

	GoGCDurationSeconds = prometheus.NewSummary(
		prometheus.SummaryOpts{
			Name:       "motionmesh_go_gc_duration_seconds",
			Help:       "GC stop-the-world pause duration",
			Objectives: map[float64]float64{0.5: 0.05, 0.9: 0.01, 0.99: 0.001},
		},
	)
)

func init() {
	// Register standard metrics
	Registry.MustRegister(APIRequestsTotal)
	Registry.MustRegister(APIRequestDuration)
	Registry.MustRegister(WorkerJobsActive)
	Registry.MustRegister(WorkerJobsProcessedTotal)
	Registry.MustRegister(WorkerJobsFailedTotal)
	Registry.MustRegister(CleanupJobsProcessedTotal)
	Registry.MustRegister(CleanupJobsFailedTotal)
	Registry.MustRegister(WorkerJobPhaseDuration)
	Registry.MustRegister(StripeAPICallsTotal)
	Registry.MustRegister(AIRequestsTotal)
	Registry.MustRegister(LastUsedEnqueueTotal)
	Registry.MustRegister(LastUsedDroppedTotal)
	Registry.MustRegister(LastUsedWorkerLatency)
	Registry.MustRegister(LastUsedQueueDepth)
	Registry.MustRegister(LastUsedRedisBatchesTotal)
	Registry.MustRegister(AuthLocalHit)
	Registry.MustRegister(AuthRedisHit)
	Registry.MustRegister(AuthDBFallback)
	Registry.MustRegister(AuthFailure)

	// Phase 2 — Route latency decomposition
	Registry.MustRegister(RequestPhaseLatency)

	// Phase 13 — DB pool
	Registry.MustRegister(DBPoolWaitCount)
	Registry.MustRegister(DBPoolWaitDuration)
	Registry.MustRegister(DBPoolAcquiredConns)

	// Phase 9 — Last-used Redis ops
	Registry.MustRegister(LastUsedRedisOperationsTotal)

	// Phase 6 — Go runtime
	Registry.MustRegister(GoGoroutines)
	Registry.MustRegister(GoHeapAllocBytes)
	Registry.MustRegister(GoHeapSysBytes)
	Registry.MustRegister(GoGCDurationSeconds)
}

// CollectGoRuntimeMetrics samples Go runtime stats into Prometheus gauges.
// Call this periodically (e.g. every 15s) from a background goroutine.
func CollectGoRuntimeMetrics() {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)

	GoGoroutines.Set(float64(runtime.NumGoroutine()))
	GoHeapAllocBytes.Set(float64(ms.HeapAlloc))
	GoHeapSysBytes.Set(float64(ms.HeapSys))

	// Record last GC pause
	if ms.NumGC > 0 {
		// PauseNs is a circular buffer; last GC pause is at index (NumGC+255)%256
		lastPause := ms.PauseNs[(ms.NumGC+255)%256]
		GoGCDurationSeconds.Observe(float64(lastPause) / 1e9)
	}
}

// Handler returns an http.Handler for exposing Prometheus metrics.
func Handler() http.Handler {
	return promhttp.HandlerFor(Registry, promhttp.HandlerOpts{
		Registry: Registry,
	})
}
