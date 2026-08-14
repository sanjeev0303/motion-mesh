package job

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"time"

	"github.com/motionmesh/server/shared/logger"
	"github.com/motionmesh/server/shared/metrics"
	"github.com/motionmesh/server/worker/internal/pool"
	"github.com/nats-io/nats.go"
)

type Consumer struct {
	nc          *nats.Conn
	handler     *Handler
	log         *logger.Logger
	concurrency int
}


func NewConsumer(nc *nats.Conn, handler *Handler, log *logger.Logger, concurrency int) *Consumer {
	return &Consumer{
		nc:          nc,
		handler:     handler,
		log:         log,
		concurrency: concurrency,
	}
}


type TranscodeJobMessage struct {
	VideoID           string  `json:"video_id"`
	SourceObjectKey   string  `json:"source_object_key"`
	TranscodeBucketID *string `json:"transcode_bucket_id,omitempty"`
}

func (c *Consumer) Start(ctx context.Context) error {
	js, err := c.nc.JetStream()
	if err != nil {
		return fmt.Errorf("failed to get jetstream context: %w", err)
	}

	sub, err := js.PullSubscribe("transcode.jobs", "transcode_worker")
	if err != nil {
		return fmt.Errorf("failed to pull subscribe: %w", err)
	}

	c.log.Info("Started NATS consumer for transcode.jobs with concurrency %d", c.concurrency)
	batchSize := c.concurrency * 2

	pool := pool.NewWorkerPool(c.concurrency, c.log)

	for {
		select {
		case <-ctx.Done():
			c.log.Info("Consumer shutting down")
			return nil
		default:
			msgs, err := sub.Fetch(batchSize, nats.MaxWait(5*time.Second))
			if err != nil {
				if err != nats.ErrTimeout {
					c.log.Error("fetch error: %v", err)
				}
				continue
			}

			for _, msg := range msgs {
				m := msg // capture for goroutine
				// Submit blocks until a worker slot is available.
				// This acts as backpressure on Fetch.
				err := pool.Submit(ctx, func() {
					c.handleMessage(ctx, m)
				})
				if err != nil {
					// ctx canceled while waiting for slot
					m.Nak()
					return err
				}
			}
		}
	}
}


func (c *Consumer) handleMessage(ctx context.Context, msg *nats.Msg) {
	var payload TranscodeJobMessage
	if err := json.Unmarshal(msg.Data, &payload); err != nil {
		c.log.Error("failed to unmarshal message: %v", err)
		msg.Term() // Terminal error, don't retry
		return
	}

	c.log.Info("Processing job for video %s", payload.VideoID)

	jobCtx, cancel := context.WithTimeout(ctx, 2*time.Hour)
	defer cancel()

	err := c.handler.Process(jobCtx, payload.VideoID, payload.SourceObjectKey, payload.TranscodeBucketID)
	if err != nil {
		c.log.Error("job failed for video %s: %v", payload.VideoID, err)
		msg.NakWithDelay(1 * time.Minute) // Transient/retryable error
		metrics.WorkerJobsFailedTotal.Inc()
		return
	}

	if rand.Intn(100) == 0 {
		c.log.Info("Job completed successfully for video %s (sampled)", payload.VideoID)
	}
	msg.Ack()
	metrics.WorkerJobsProcessedTotal.Inc()
}
