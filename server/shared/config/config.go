package config

import (
	"os"
	"strconv"
)

type Config struct {
	Environment string

	// Core infrastructure
	DatabaseURL string
	RedisURL    string
	QueueURL    string

	// Object storage — one code path, different values per environment
	StorageEndpoint     string
	StorageBucket       string
	StorageRegion       string
	StorageUseSSL       bool
	StorageUsePathStyle bool

	// Auth
	ClerkSecretKey string
	ClerkJWKSURL   string
	JWTSecret      string

	// Billing
	StripeSecretKey     string
	StripeWebhookSecret string

	// Worker / Sidecar
	CaptionsSidecarURL string
	AnthropicAPIKey    string

	// Scalability & Performance
	BenchmarkMode                bool
	StripeMode                   string
	AIMode                       string
	LoadTestMode                 bool
	WorkerConcurrency            int
	MediaProxyMode               bool
	AllowedOrigins               string
	CloudFrontDistributionDomain string
	CloudFrontKeyID              string
	CloudFrontPrivateKey         string
	CloudFrontMediaDomain        string
	CloudFrontPlaybackTTL        string
	CookieDomain                 string
	DBMaxConns                   int
	DBMinConns                   int
	RateLimitEnabled             bool
	CleanupConcurrency           int
	OutboxBatchSize              int
	OutboxMaxAttempts            int
	OutboxPollIntervalMs         int
	LogSampleRate                float64
}

func Load() *Config {
	cd := getEnv("CLOUDFRONT_DISTRIBUTION_DOMAIN", "")
	cmd := getEnv("CLOUDFRONT_MEDIA_DOMAIN", "")
	if cmd == "" {
		cmd = cd
	}

	return &Config{
		Environment: getEnv("ENVIRONMENT", "development"),

		DatabaseURL: getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/motionmesh?sslmode=disable"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379/0"),
		QueueURL:    getEnv("QUEUE_URL", "nats://localhost:4222"),

		StorageEndpoint:     getEnv("STORAGE_ENDPOINT", ""),
		StorageBucket:       getEnv("STORAGE_BUCKET", "motionmesh-dev"),
		StorageRegion:       getEnv("STORAGE_REGION", "us-east-005"),
		StorageUseSSL:       getEnv("STORAGE_USE_SSL", "true") == "true",
		StorageUsePathStyle: getEnv("STORAGE_USE_PATH_STYLE", "false") == "true",

		ClerkSecretKey: getEnv("CLERK_SECRET_KEY", ""),
		ClerkJWKSURL:   getEnv("CLERK_JWKS_URL", ""),
		JWTSecret:      getEnv("JWT_SECRET", ""),

		StripeSecretKey:     getEnv("STRIPE_SECRET_KEY", ""),
		StripeWebhookSecret: getEnv("STRIPE_WEBHOOK_SECRET", ""),

		CaptionsSidecarURL: getEnv("CAPTIONS_SIDECAR_URL", "http://localhost:8000"),
		AnthropicAPIKey:    getEnv("ANTHROPIC_API_KEY", ""),

		BenchmarkMode:                getEnvBool("BENCHMARK_MODE", false),
		StripeMode:                   getEnv("STRIPE_MODE", "live"),
		AIMode:                       getEnv("AI_MODE", "live"),
		LoadTestMode:                 getEnvBool("LOAD_TEST_MODE", false),
		WorkerConcurrency:            getEnvInt("WORKER_CONCURRENCY", 8),
		MediaProxyMode:               getEnvBool("MEDIA_PROXY_MODE", false),
		AllowedOrigins:               getEnv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001"),
		CloudFrontDistributionDomain: cd,
		CloudFrontKeyID:              getEnv("CLOUDFRONT_KEY_ID", ""),
		CloudFrontPrivateKey:         getEnv("CLOUDFRONT_PRIVATE_KEY", ""),
		CloudFrontMediaDomain:        cmd,
		CloudFrontPlaybackTTL:        getEnv("CLOUDFRONT_PLAYBACK_TTL", "15m"),
		CookieDomain:                 getEnv("COOKIE_DOMAIN", ""),
		DBMaxConns:                   getEnvInt("DB_MAX_CONNS", 200),
		DBMinConns:                   getEnvInt("DB_MIN_CONNS", 20),
		RateLimitEnabled:             getEnvBool("RATE_LIMIT_ENABLED", true),
		CleanupConcurrency:           getEnvInt("CLEANUP_CONCURRENCY", 8),
		OutboxBatchSize:              getEnvInt("OUTBOX_BATCH_SIZE", 100),
		OutboxMaxAttempts:            getEnvInt("OUTBOX_MAX_ATTEMPTS", 5),
		OutboxPollIntervalMs:         getEnvInt("OUTBOX_POLL_INTERVAL_MS", 1000),
		LogSampleRate:                getEnvFloat("LOG_SAMPLE_RATE", 0.05),
	}
}

func getEnvFloat(key string, fallback float64) float64 {
	if value, ok := os.LookupEnv(key); ok {
		if f, err := strconv.ParseFloat(value, 64); err == nil {
			return f
		}
	}
	return fallback
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if value, ok := os.LookupEnv(key); ok {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if value, ok := os.LookupEnv(key); ok {
		return value == "true" || value == "1"
	}
	return fallback
}
