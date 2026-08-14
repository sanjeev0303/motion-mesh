package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type RateLimiter struct {
	rdb *redis.Client
}

func NewRateLimiter(rdb *redis.Client) *RateLimiter {
	return &RateLimiter{
		rdb: rdb,
	}
}

// Allow applies a sliding window rate limit.
// It returns true if the request is allowed, false if the limit is exceeded.
func (rl *RateLimiter) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	now := time.Now().UnixNano()
	windowStart := now - window.Nanoseconds()

	redisKey := fmt.Sprintf("ratelimit:%s", key)

	// We use a pipeline to execute the Redis commands atomically.
	pipe := rl.rdb.TxPipeline()
	
	// Remove older elements
	pipe.ZRemRangeByScore(ctx, redisKey, "-inf", fmt.Sprintf("%d", windowStart))
	// Add current element
	pipe.ZAdd(ctx, redisKey, redis.Z{Score: float64(now), Member: now})
	// Count elements
	countCmd := pipe.ZCard(ctx, redisKey)
	// Set expiry to keep redis clean
	pipe.Expire(ctx, redisKey, window)

	_, err := pipe.Exec(ctx)
	if err != nil {
		return false, err
	}

	count := countCmd.Val()
	return count <= int64(limit), nil
}
