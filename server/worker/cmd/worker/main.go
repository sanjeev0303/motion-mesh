package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"

	brandingpostgres "github.com/motionmesh/server/shared/branding/postgres"
	"github.com/motionmesh/server/shared/config"
	"github.com/motionmesh/server/shared/logger"
	"github.com/motionmesh/server/shared/metrics"
	"github.com/motionmesh/server/shared/storage"
	"github.com/motionmesh/server/worker/internal/billing"
	billingpostgres "github.com/motionmesh/server/worker/internal/billing/postgres"
	"github.com/motionmesh/server/worker/internal/captions"
	"github.com/motionmesh/server/worker/internal/cleanup"
	"github.com/motionmesh/server/worker/internal/job"
	"github.com/motionmesh/server/worker/internal/uploader"
)

func main() {
	cfg := config.Load()
	log := logger.New()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	log.Info("Starting Worker on Queue: %s", cfg.QueueURL)

	// ── Database ─────────────────────────────────────────────────────────────
	poolConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Error("failed to parse db config: %v", err)
		os.Exit(1)
	}
	poolConfig.MaxConns = int32(cfg.DBMaxConns)
	poolConfig.MinConns = int32(cfg.DBMinConns)
	poolConfig.MaxConnLifetime = 5 * time.Minute
	poolConfig.MaxConnIdleTime = 2 * time.Minute
	poolConfig.HealthCheckPeriod = 30 * time.Second

	db, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		log.Error("database connect: %v", err)
		os.Exit(1)
	}
	defer db.Close()
	
	if err := db.Ping(ctx); err != nil {
		log.Error("database ping: %v", err)
		os.Exit(1)
	}

	// ── Metrics Server ───────────────────────────────────────────────────────
	go func() {
		http.Handle("/metrics", metrics.Handler())
		log.Info("Starting Prometheus metrics server on :9090")
		if err := http.ListenAndServe(":9090", nil); err != nil {
			log.Error("metrics server failed: %v", err)
		}
	}()

	// ── NATS ─────────────────────────────────────────────────────────────────
	nc, err := nats.Connect(cfg.QueueURL)
	if err != nil {
		log.Error("nats connect: %v", err)
		os.Exit(1)
	}
	defer nc.Drain()

	// ── Object Storage ───────────────────────────────────────────────────────
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
		log.Error("storage bucket unreachable: %v", err)
		os.Exit(1)
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

	// ── Components ───────────────────────────────────────────────────────────
	brandingRepo := brandingpostgres.NewRepository(db)
	billingRepo := billingpostgres.NewRepository(db)
	billingConsumer := billing.NewConsumer(billingRepo, cfg.StripeSecretKey, log)
	
	up := uploader.NewUploader(storageAdapter)
	var capClient captions.Provider
	if cfg.AIMode == "mock" {
		capClient = captions.NewMockProvider()
	} else {
		capClient = captions.NewClient(cfg.CaptionsSidecarURL, &http.Client{Timeout: 30 * time.Minute})
	}
	
	jobHandler := job.NewHandler(db, storageAdapter, up, capClient, brandingRepo, log, nc)
	
	concurrency := cfg.WorkerConcurrency
	if concurrency <= 0 {
		concurrency = 4
	}
	consumer := job.NewConsumer(nc, jobHandler, log, concurrency)

	// ── Start Consumers ──────────────────────────────────────────────────────
	cleanupConsumer := cleanup.NewConsumer(nc, storageAdapter, log, cfg.CleanupConcurrency)
	go func() {
		if err := cleanupConsumer.Start(ctx); err != nil {
			log.Error("cleanup consumer failed: %v", err)
		}
	}()
	
	go func() {
		billingConsumer.StartStripeRelay(ctx, 5*time.Second)
	}()

	go func() {
		if err := billingConsumer.ConsumeUsageEvents(ctx, nc); err != nil {
			log.Error("billing consumer failed: %v", err)
		}
	}()

	if err := consumer.Start(ctx); err != nil {
		log.Error("consumer failed: %v", err)
	}

	log.Info("shutting down...")
}
