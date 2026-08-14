package config

import (
	"errors"
	"strings"
)

// Validate ensures that the loaded configuration is safe and correct for the environment.
// In particular, it prevents local-development defaults from slipping into production.
func Validate(cfg *Config) error {
	if cfg.Environment == "production" || cfg.Environment == "benchmark" || cfg.BenchmarkMode {
		if strings.Contains(cfg.DatabaseURL, "localhost") {
			return errors.New("DATABASE_URL cannot contain localhost in production/benchmark")
		}
		if strings.Contains(cfg.RedisURL, "localhost") {
			return errors.New("REDIS_URL cannot contain localhost in production/benchmark")
		}
		if strings.Contains(cfg.QueueURL, "localhost") {
			return errors.New("QUEUE_URL cannot contain localhost in production/benchmark")
		}
		if strings.Contains(strings.ToLower(cfg.StorageEndpoint), "backblaze") || strings.Contains(strings.ToLower(cfg.StorageEndpoint), "b2") {
			return errors.New("STORAGE_ENDPOINT cannot point to B2 in production/benchmark")
		}
		if cfg.StorageRegion == "us-east-005" {
			return errors.New("STORAGE_REGION cannot be us-east-005 (B2) in production/benchmark")
		}
		if cfg.MediaProxyMode {
			return errors.New("MEDIA_PROXY_MODE must be false in production/benchmark")
		}
		if cfg.CloudFrontMediaDomain == "" {
			return errors.New("CLOUDFRONT_MEDIA_DOMAIN must be set in production/benchmark")
		}
		if cfg.CookieDomain == "" {
			return errors.New("COOKIE_DOMAIN must be set in production/benchmark")
		}
		if cfg.CloudFrontKeyID == "" {
			return errors.New("CLOUDFRONT_KEY_ID must be set in production/benchmark")
		}
	}
	return nil
}
