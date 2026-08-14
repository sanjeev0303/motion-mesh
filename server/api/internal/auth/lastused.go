package auth

import (
	"context"
	"strconv"
	"sync"
	"time"

	"github.com/motionmesh/server/shared/logger"
	"github.com/motionmesh/server/shared/metrics"
	"github.com/redis/go-redis/v9"
)

const (
	lastUsedDebounce  = 30 * time.Second
	lastUsedHashKey   = "mot:api_key:last_used_buffer"
	lastUsedQueueSize = 10000
	lastUsedBatchSize = 128
	lastUsedBatchWait = 10 * time.Millisecond
)

var (
	lastUsedQueue = make(chan string, lastUsedQueueSize)
	workerOnce    sync.Once
	localDebounce sync.Map

	// Atomic Redis operation:
	// acquire a short-lived per-key lock and write the timestamp only when
	// the lock was acquired. This avoids SETNX + HSET round trips per request.
	lastUsedScript = redis.NewScript(`
if redis.call("SET", KEYS[1], "1", "NX", "EX", ARGV[1]) then
    redis.call("HSET", KEYS[2], ARGV[2], ARGV[3])
    return 1
end
return 0
`)
)

func startLastUsedWorker(rdb *redis.Client) {
	workerOnce.Do(func() {
		go func() {
			ctx := context.Background()

			for {
				firstKeyID := <-lastUsedQueue
				batch := make(map[string]struct{}, lastUsedBatchSize)
				batch[firstKeyID] = struct{}{}

				timer := time.NewTimer(lastUsedBatchWait)
				collect := true

				for collect && len(batch) < lastUsedBatchSize {
					select {
					case keyID := <-lastUsedQueue:
						batch[keyID] = struct{}{}
					case <-timer.C:
						collect = false
					}
				}

				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}

				start := time.Now()
				pipe := rdb.Pipeline()
				commands := make([]*redis.Cmd, 0, len(batch))
				timestamp := strconv.FormatInt(time.Now().Unix(), 10)

				for keyID := range batch {
					lockKey := "mot:api_key:last_used_lock:" + keyID
					cmd := lastUsedScript.Run(
						ctx,
						pipe,
						[]string{lockKey, lastUsedHashKey},
						int(lastUsedDebounce/time.Second),
						keyID,
						timestamp,
					)
					commands = append(commands, cmd)
				}

				_, err := pipe.Exec(ctx)
				metrics.LastUsedRedisBatchesTotal.Inc()

				if err != nil {
					logger.New().Error("last-used batch: redis pipeline failed: %v", err)
				}

				for _, cmd := range commands {
					if cmd.Err() != nil {
						logger.New().Error("last-used batch: redis command failed: %v", cmd.Err())
					}
				}

				metrics.LastUsedWorkerLatency.Observe(time.Since(start).Seconds())
				metrics.LastUsedQueueDepth.Set(float64(len(lastUsedQueue)))
			}
		}()

		// Periodic cleanup for local debounce map to prevent memory retention.
		go func() {
			ticker := time.NewTicker(5 * time.Minute)
			defer ticker.Stop()

			for range ticker.C {
				now := time.Now()
				localDebounce.Range(func(key, value any) bool {
					if ts, ok := value.(time.Time); ok && now.Sub(ts) > lastUsedDebounce {
						localDebounce.Delete(key)
					}
					return true
				})
			}
		}()
	})
}

// trackLastUsed is deliberately non-blocking on the request hot path.
// It locally debounces repeated updates and uses a bounded queue so a slow
// Redis connection can never create unbounded goroutine growth.
func trackLastUsed(rdb *redis.Client, keyID string) {
	startLastUsedWorker(rdb)

	now := time.Now()
	if lastSeen, ok := localDebounce.Load(keyID); ok {
		if ts, valid := lastSeen.(time.Time); valid && now.Sub(ts) < lastUsedDebounce {
			return
		}
	}

	localDebounce.Store(keyID, now)

	select {
	case lastUsedQueue <- keyID:
		metrics.LastUsedEnqueueTotal.Inc()
		metrics.LastUsedQueueDepth.Set(float64(len(lastUsedQueue)))
	default:
		// Request correctness is unaffected. Last-used is asynchronous telemetry.
		metrics.LastUsedDroppedTotal.Inc()
	}
}

// FlushLastUsedLoop drains the Redis buffer and persists the latest timestamps
// to PostgreSQL in one batch. The Redis buffer is only deleted after a successful
// database update, so a failed DB write is retried on the next interval.
func FlushLastUsedLoop(ctx context.Context, rdb *redis.Client, repo AccountRepository, interval time.Duration) {
	log := logger.New()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return

		case <-ticker.C:
			entries, err := rdb.HGetAll(ctx, lastUsedHashKey).Result()
			if err != nil {
				log.Error("last-used flush: HGetAll: %v", err)
				continue
			}

			if len(entries) == 0 {
				continue
			}

			updates := make(map[string]time.Time, len(entries))
			for keyID, tsStr := range entries {
				ts, err := strconv.ParseInt(tsStr, 10, 64)
				if err != nil {
					log.Error("last-used flush: parse ts for key %s: %v", keyID, err)
					continue
				}
				updates[keyID] = time.Unix(ts, 0)
			}

			if err := repo.BatchUpdateLastUsed(ctx, updates); err != nil {
				log.Error("last-used flush: batch update failed: %v — buffer preserved for next tick", err)
				continue
			}

			if err := rdb.Del(ctx, lastUsedHashKey).Err(); err != nil {
				log.Error("last-used flush: del buffer: %v", err)
			}
		}
	}
}
