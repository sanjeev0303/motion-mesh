package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"

	"github.com/motionmesh/server/api/internal/auth"
	authpostgres "github.com/motionmesh/server/api/internal/auth/postgres"
	"github.com/motionmesh/server/api/internal/billing"
	billingpostgres "github.com/motionmesh/server/api/internal/billing/postgres"
	"github.com/motionmesh/server/api/internal/branding"
	brandingpostgres "github.com/motionmesh/server/api/internal/branding/postgres"
	"github.com/motionmesh/server/api/internal/buckets"
	bucketspostgres "github.com/motionmesh/server/api/internal/buckets/postgres"
	apimiddleware "github.com/motionmesh/server/api/internal/middleware"

	"github.com/motionmesh/server/shared/storage"
	"github.com/motionmesh/server/api/internal/transcode"
	"github.com/motionmesh/server/api/internal/videos"
	videospostgres "github.com/motionmesh/server/api/internal/videos/postgres"
	sharedbranding "github.com/motionmesh/server/shared/branding"
	"github.com/motionmesh/server/shared/config"
	"github.com/motionmesh/server/shared/logger"
	"github.com/motionmesh/server/shared/models"
	"github.com/motionmesh/server/shared/outbox"
)

func main() {
	cfg := config.Load()
	log := logger.New()

	if err := config.Validate(cfg); err != nil {
		log.Error("configuration validation failed: %v", err)
		os.Exit(1)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	// ── Database ─────────────────────────────────────────────────────────────
	dbConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Error("database parse config: %v", err)
		os.Exit(1)
	}
	dbConfig.MaxConns = int32(cfg.DBMaxConns)
	dbConfig.MinConns = int32(cfg.DBMinConns)
	dbConfig.MaxConnLifetime = 5 * time.Minute
	dbConfig.MaxConnIdleTime = 2 * time.Minute
	dbConfig.HealthCheckPeriod = 30 * time.Second

	db, err := pgxpool.NewWithConfig(ctx, dbConfig)
	if err != nil {
		log.Error("database connect: %v", err)
		os.Exit(1)
	}
	defer db.Close()

	// ── NATS ─────────────────────────────────────────────────────────────────
	nc, err := nats.Connect(cfg.QueueURL)
	if err != nil {
		log.Error("nats connect: %v", err)
		os.Exit(1)
	}
	defer nc.Drain()

	// ── Object Storage (Backblaze B2 via generic S3 API) ─────────────────────
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(cfg.StorageRegion),
	)
	if err != nil {
		log.Error("aws config: %v", err)
		os.Exit(1)
	}
	s3Client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		if cfg.StorageEndpoint != "" {
			o.BaseEndpoint = aws.String(cfg.StorageEndpoint)
		}
		o.UsePathStyle = cfg.StorageUsePathStyle
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	})
	storageAdapter := storage.NewS3Adapter(s3Client, cfg.StorageBucket)
	if err := storageAdapter.CheckACL(ctx); err != nil {
		if os.Getenv("EXPLICIT_DEGRADED_STORAGE_MODE") == "true" {
			log.Error("storage bucket unreachable (continuing in degraded mode): %v", err)
		} else {
			log.Error("storage bucket unreachable, aborting startup. Set EXPLICIT_DEGRADED_STORAGE_MODE=true to bypass: %v", err)
			os.Exit(1)
		}
	}

	// ── Redis ─────────────────────────────────────────────────────────────────
	rdbOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Error("redis config: %v", err)
		os.Exit(1)
	}
	rdb := redis.NewClient(rdbOpts)
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Error("redis connect: %v", err)
		os.Exit(1)
	}
	defer rdb.Close()

	// ── Auth ──────────────────────────────────────────────────────────────────
	authRepo := authpostgres.NewRepository(db)
	authSvc := auth.NewService(authRepo, rdb, cfg.ClerkSecretKey, cfg.ClerkJWKSURL, log)

	// ── Billing ───────────────────────────────────────────────────────────────
	var billingRepo billing.BillingRepository = billingpostgres.NewRepository(db)
	billingSvc := billing.NewService(billingRepo, rdb, cfg.StripeSecretKey, cfg.StripeWebhookSecret, log)
	// ConsumeUsageEvents moved to worker

	// ── Auth last-used flush ───────────────────────────────────────────────────
	// Drains the Redis buffer of api_key last-used timestamps to Postgres every
	// 5 minutes. Runs as a background goroutine; failed flushes are retried on
	// the next tick so no data is silently lost.
	go auth.FlushLastUsedLoop(ctx, rdb, authRepo, 5*time.Minute)

	// ── Buckets ───────────────────────────────────────────────────────────────
	var bucketRepo buckets.BucketRepository = bucketspostgres.NewRepository(db)
	bucketSvc := buckets.NewService(bucketRepo, storageAdapter)

	// ── Branding ──────────────────────────────────────────────────────────────
	var brandingRepo sharedbranding.BrandingRepository = brandingpostgres.NewRepository(db)
	brandingSvc := branding.NewService(brandingRepo, storageAdapter)

	// ── Videos ────────────────────────────────────────────────────────────────
	videosRepo := videospostgres.NewRepository(db)
	videosSvc := videos.NewService(videosRepo)
	transcodeSvc := transcode.NewService(db, nc)

	// ── Outbox ────────────────────────────────────────────────────────────────
	outboxRelay, err := outbox.NewRelay(db, nc, cfg.OutboxBatchSize, cfg.OutboxMaxAttempts, log)
	if err != nil {
		log.Error("outbox relay init: %v", err)
	} else {
		go outboxRelay.Start(ctx, time.Duration(cfg.OutboxPollIntervalMs)*time.Millisecond)
	}

	// ── Router ────────────────────────────────────────────────────────────────
	r := chi.NewRouter()
	
	// Basic CORS setup
	allowedOrigins := strings.Split(cfg.AllowedOrigins, ",")
	for i := range allowedOrigins {
		allowedOrigins[i] = strings.TrimSpace(allowedOrigins[i])
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Use(apimiddleware.SampledLogger(cfg.LogSampleRate, log))
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.StripSlashes)

	// Public endpoints — no auth
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		if err := db.Ping(r.Context()); err != nil {
			http.Error(w, "database unreachable", http.StatusServiceUnavailable)
			return
		}
		if err := rdb.Ping(r.Context()).Err(); err != nil {
			http.Error(w, "redis unreachable", http.StatusServiceUnavailable)
			return
		}
		if !nc.IsConnected() {
			http.Error(w, "nats disconnected", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ready"}`))
	})	// Protected routes — both Clerk JWT and mot_* API key are accepted
	r.Group(func(r chi.Router) {
		r.Use(auth.Middleware(authSvc, cfg.LoadTestMode,
			"/health",
			"/ready",
			"/v1/billing/webhook",
		))
		// Auth / API keys
		r.Route("/v1/api-keys", func(r chi.Router) {
			authHandler := auth.NewHandler(authSvc)
			authHandler.RegisterRoutes(r)
		})

		r.Route("/v1/videos", func(r chi.Router) {
			cfTTL, _ := time.ParseDuration(cfg.CloudFrontPlaybackTTL)
			if cfTTL == 0 {
				cfTTL = 15 * time.Minute
			}
			videosHandler := videos.NewHandler(
				videosSvc, storageAdapter, transcodeSvc, bucketSvc, 
				cfg.StorageBucket, cfg.CloudFrontDistributionDomain, cfg.CloudFrontMediaDomain, 
				cfg.CloudFrontKeyID, cfg.CloudFrontPrivateKey, 
				cfTTL, cfg.CookieDomain, cfg.MediaProxyMode,
			)
			videosHandler.RegisterRoutes(r)
		})

		// Jobs (transcode job status for the Media Converter dashboard)
		r.Get("/v1/jobs", func(w http.ResponseWriter, r *http.Request) {
			acc, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
			if !ok || acc == nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			limitStr := r.URL.Query().Get("limit")
			limit, _ := strconv.Atoi(limitStr)
			jobs, err := transcodeSvc.ListJobs(r.Context(), acc.ID, limit)
			if err != nil {
				log.Error("list jobs: %v", err)
				http.Error(w, "internal server error", http.StatusInternalServerError)
				return
			}
			if jobs == nil {
				jobs = []*models.Job{}
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(jobs)
		})

		// Buckets
		r.Route("/v1/buckets", func(r chi.Router) {
			bucketsHandler := buckets.NewHandler(bucketSvc)
			bucketsHandler.RegisterRoutes(r)
		})

		// Branding (pro tier only)
		r.Route("/v1/branding", func(r chi.Router) {
			r.Use(apimiddleware.RequirePlan("pro", billingSvc))
			brandingHandler := branding.NewHandler(brandingSvc)
			brandingHandler.RegisterRoutes(r)
		})

		// Billing
		r.Route("/v1/billing", func(r chi.Router) {
			billingHandler := billing.NewHandler(billingSvc)
			billingHandler.RegisterRoutes(r)
		})
	})

	// Server timeouts configured for high-concurrency API traffic.
	// Media is handled out-of-band via S3 presigned URLs or CloudFront.
	srv := &http.Server{
		Addr:              ":8080",
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Info("API server starting on :8080")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Info("shutting down...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	srv.Shutdown(shutdownCtx)
}
