package auth

import (
	"context"
	"errors"
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

	// Atomic Lua merge operation to ensure we only update the active buffer
	// if the temporary timestamp is strictly greater than the active timestamp.
	lastUsedMergeScript = redis.NewScript(`
local ts = redis.call("HGET", KEYS[1], ARGV[1])
if not ts or tonumber(ARGV[2]) > tonumber(ts) then
    redis.call("HSET", KEYS[1], ARGV[1], ARGV[2])
end
return 1
`)
)

func startLastUsedWorker(rdb *redis.Client) {
	workerOnce.Do(func() {
		ctx := context.Background()
		if err := lastUsedScript.Load(ctx, rdb).Err(); err != nil {
			logger.New().Error("last-used: failed to load lastUsedScript: %v", err)
		}
		if err := lastUsedMergeScript.Load(ctx, rdb).Err(); err != nil {
			logger.New().Error("last-used: failed to load lastUsedMergeScript: %v", err)
		}

		go func() {
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
					// If we get NOSCRIPT, attempt to reload for next time
					if hasNoScriptError(commands) {
						lastUsedScript.Load(ctx, rdb)
					}
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

func hasNoScriptError(commands []*redis.Cmd) bool {
	for _, cmd := range commands {
		if err := cmd.Err(); err != nil {
			if err.Error() == "NOSCRIPT No matching script. Please use EVAL." {
				return true
			}
		}
	}
	return false
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
			tempKey := lastUsedHashKey + ":flushing"

			// Atomic swap: move the active buffer to a temporary key
			err := rdb.Rename(ctx, lastUsedHashKey, tempKey).Err()
			if err != nil {
				if err.Error() == "ERR no such key" || errors.Is(err, redis.Nil) {
					continue // Buffer was empty
				}
				log.Error("last-used flush: rename buffer: %v", err)
				continue
			}

			entries, err := rdb.HGetAll(ctx, tempKey).Result()
			if err != nil {
				log.Error("last-used flush: HGetAll from temp buffer: %v", err)
				// If we failed to read, try to merge it back to avoid losing data
				mergeBackFailedBuffer(ctx, rdb, tempKey, lastUsedHashKey, log)
				continue
			}

			if len(entries) == 0 {
				rdb.Del(ctx, tempKey)
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
				log.Error("last-used flush: batch update failed: %v — merging buffer back for next tick", err)
				mergeBackFailedBuffer(ctx, rdb, tempKey, lastUsedHashKey, log)
				continue
			}

			if err := rdb.Del(ctx, tempKey).Err(); err != nil {
				log.Error("last-used flush: del temp buffer: %v", err)
			}
		}
	}
}

// mergeBackFailedBuffer writes the temporary buffer back into the active buffer
// using an atomic Lua script to ensure we take max(active[key], temporary[key]).
func mergeBackFailedBuffer(ctx context.Context, rdb *redis.Client, tempKey, activeKey string, log *logger.Logger) {
	entries, err := rdb.HGetAll(ctx, tempKey).Result()
	if err != nil {
		log.Error("merge-back: failed to read temp buffer: %v", err)
		return
	}
	
	if len(entries) == 0 {
		return
	}

	pipe := rdb.Pipeline()
	commands := make([]*redis.Cmd, 0, len(entries))
	for k, v := range entries {
		cmd := lastUsedMergeScript.Run(ctx, pipe, []string{activeKey}, k, v)
		commands = append(commands, cmd)
	}
	
	if _, err := pipe.Exec(ctx); err != nil {
		log.Error("merge-back: failed to merge to active buffer: %v", err)
		if hasNoScriptError(commands) {
			lastUsedMergeScript.Load(ctx, rdb)
		}
	} else {
		rdb.Del(ctx, tempKey)
	}
}
