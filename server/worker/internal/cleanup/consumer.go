package cleanup

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/motionmesh/server/shared/logger"
	"github.com/motionmesh/server/shared/metrics"
	"github.com/motionmesh/server/shared/storage"
	"github.com/nats-io/nats.go"
)

type Consumer struct {
	nc          *nats.Conn
	storage     storage.ObjectStorage
	log         *logger.Logger
	concurrency int
}

func NewConsumer(nc *nats.Conn, storage storage.ObjectStorage, log *logger.Logger, concurrency int) *Consumer {
	return &Consumer{
		nc:          nc,
		storage:     storage,
		log:         log,
		concurrency: concurrency,
	}
}

type VideoCleanupMessage struct {
	VideoID      string  `json:"video_id"`
	ObjectKey    string  `json:"object_key"`
	ThumbnailKey *string `json:"thumbnail_key"`
	SpriteKey    *string `json:"sprite_key"`
	PreviewKey   *string `json:"preview_key"`
}

func (c *Consumer) Start(ctx context.Context) error {
	js, err := c.nc.JetStream()
	if err != nil {
		return fmt.Errorf("failed to get jetstream context: %w", err)
	}

	sub, err := js.PullSubscribe("video.cleanup", "cleanup_worker")
	if err != nil {
		return fmt.Errorf("failed to pull subscribe cleanup: %w", err)
	}

	c.log.Info("Started NATS consumer for video.cleanup (concurrency: %d)", c.concurrency)

	sem := make(chan struct{}, c.concurrency)
	var wg sync.WaitGroup

	for {
		select {
		case <-ctx.Done():
			c.log.Info("Cleanup consumer shutting down")
			wg.Wait()
			return nil
		default:
			msgs, err := sub.Fetch(10, nats.MaxWait(5*time.Second))
			if err != nil {
				if err != nats.ErrTimeout {
					c.log.Error("cleanup fetch error: %v", err)
				}
				continue
			}

			for _, msg := range msgs {
				sem <- struct{}{}
				wg.Add(1)
				go func(m *nats.Msg) {
					defer wg.Done()
					defer func() { <-sem }()
					c.handleMessage(ctx, m)
				}(msg)
			}
		}
	}
}

func (c *Consumer) handleMessage(ctx context.Context, msg *nats.Msg) {
	var payload VideoCleanupMessage
	if err := json.Unmarshal(msg.Data, &payload); err != nil {
		c.log.Error("failed to unmarshal cleanup message: %v", err)
		msg.Term()
		return
	}

	c.log.Info("Processing cleanup for video %s", payload.VideoID)

	keysToDelete := []string{payload.ObjectKey}
	if payload.ThumbnailKey != nil && *payload.ThumbnailKey != "" {
		keysToDelete = append(keysToDelete, *payload.ThumbnailKey)
	}
	if payload.SpriteKey != nil && *payload.SpriteKey != "" {
		keysToDelete = append(keysToDelete, *payload.SpriteKey)
	}
	if payload.PreviewKey != nil && *payload.PreviewKey != "" {
		keysToDelete = append(keysToDelete, *payload.PreviewKey)
	}

	var validKeys []string
	for _, key := range keysToDelete {
		if key != "" {
			validKeys = append(validKeys, key)
		}
	}

	if len(validKeys) > 0 {
		if err := c.storage.DeleteObjects(ctx, validKeys); err != nil {
			c.log.Error("failed to delete objects for video %s: %v", payload.VideoID, err)
			msg.Nak()
			metrics.CleanupJobsFailedTotal.Inc()
			return
		}
	}

	if rand.Intn(100) == 0 {
		c.log.Info("Cleanup completed successfully for video %s (sampled)", payload.VideoID)
	}
	msg.Ack()
	metrics.CleanupJobsProcessedTotal.Inc()
}
