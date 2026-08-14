package pool

import (
	"context"
	"fmt"
	"runtime/debug"

	"github.com/motionmesh/server/shared/logger"
	"github.com/motionmesh/server/shared/metrics"
	"golang.org/x/sync/semaphore"
)

type WorkerPool struct {
	sem *semaphore.Weighted
	log *logger.Logger
}

func NewWorkerPool(concurrency int, log *logger.Logger) *WorkerPool {
	if concurrency <= 0 {
		concurrency = 1
	}
	return &WorkerPool{
		sem: semaphore.NewWeighted(int64(concurrency)),
		log: log,
	}
}

// Submit blocks until a worker slot is available, then executes the job in a goroutine.
func (p *WorkerPool) Submit(ctx context.Context, job func()) error {
	if err := p.sem.Acquire(ctx, 1); err != nil {
		return fmt.Errorf("failed to acquire worker slot: %w", err)
	}

	metrics.WorkerJobsActive.Inc()

	go func() {
		defer p.sem.Release(1)
		defer metrics.WorkerJobsActive.Dec()
		defer func() {
			if r := recover(); r != nil {
				p.log.Error("Worker panic: %v\nStack: %s", r, debug.Stack())
			}
		}()

		job()
	}()

	return nil
}
