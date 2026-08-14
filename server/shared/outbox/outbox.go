package outbox

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/motionmesh/server/shared/logger"
	"github.com/nats-io/nats.go"
)

// InsertEvent saves an event into the outbox table using a provided transaction.
func InsertEvent(ctx context.Context, tx pgx.Tx, eventID string, subject string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal outbox payload: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO outbox_events (id, subject, payload, status)
		VALUES ($1, $2, $3, 'pending')
	`, eventID, subject, data)
	if err != nil {
		return fmt.Errorf("failed to insert outbox event: %w", err)
	}

	return nil
}

// Relay handles polling the outbox table and publishing to NATS.
type Relay struct {
	db                 *pgxpool.Pool
	js                 nats.JetStreamContext
	log                *logger.Logger
	batchSize          int
	maxAttempts        int
	publishConcurrency int
}

func NewRelay(db *pgxpool.Pool, nc *nats.Conn, batchSize, maxAttempts int, log *logger.Logger) (*Relay, error) {
	js, err := nc.JetStream()
	if err != nil {
		return nil, fmt.Errorf("failed to get jetstream context: %w", err)
	}
	if batchSize <= 0 {
		batchSize = 100
	}
	if maxAttempts <= 0 {
		maxAttempts = 5
	}
	
	concurrency := 50
	if val := os.Getenv("OUTBOX_PUBLISH_CONCURRENCY"); val != "" {
		if c, err := strconv.Atoi(val); err == nil && c > 0 {
			concurrency = c
		}
	}
	
	return &Relay{
		db:                 db,
		js:                 js,
		log:                log,
		batchSize:          batchSize,
		maxAttempts:        maxAttempts,
		publishConcurrency: concurrency,
	}, nil
}

func (r *Relay) Start(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			r.log.Info("Outbox relay shutting down")
			return
		case <-ticker.C:
			r.processOutbox(ctx)
		}
	}
}

func (r *Relay) processOutbox(ctx context.Context) {
	query := fmt.Sprintf(`
		UPDATE outbox_events
		SET claimed_until = NOW() + INTERVAL '1 minute', status = 'publishing', claim_token = gen_random_uuid()
		WHERE id IN (
			SELECT id
			FROM outbox_events
			WHERE (
			    (status IN ('pending', 'failed') AND (claimed_until IS NULL OR claimed_until < NOW()))
			    OR (status = 'publishing' AND claimed_until < NOW())
			)
			  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
			  AND attempts < %d
			ORDER BY created_at ASC
			FOR UPDATE SKIP LOCKED
			LIMIT %d
		)
		RETURNING id, subject, payload, attempts, claim_token
	`, r.maxAttempts, r.batchSize)

	rows, err := r.db.Query(ctx, query)
	if err != nil {
		r.log.Error("Failed to claim outbox events: %v", err)
		return
	}

	type event struct {
		id         string
		subject    string
		payload    []byte
		attempts   int
		claimToken string
	}

	var events []event
	for rows.Next() {
		var e event
		if err := rows.Scan(&e.id, &e.subject, &e.payload, &e.attempts, &e.claimToken); err != nil {
			r.log.Error("Failed to scan outbox event: %v", err)
			rows.Close()
			return
		}
		events = append(events, e)
	}
	rows.Close()

	if len(events) == 0 {
		return
	}

	var (
		mu              sync.Mutex
		publishedEvents []event
		failedEvents    []event
		errorMap        = make(map[string]string)
	)

	// Bounded concurrency pool for publishing
	sem := make(chan struct{}, r.publishConcurrency)
	var wg sync.WaitGroup

	for _, e := range events {
		wg.Add(1)
		sem <- struct{}{} // acquire
		
		go func(ev event) {
			defer wg.Done()
			defer func() { <-sem }() // release

			timeoutDuration := 5 * time.Second
			if val := os.Getenv("OUTBOX_PUBLISH_TIMEOUT"); val != "" {
				if d, err := time.ParseDuration(val); err == nil {
					timeoutDuration = d
				}
			}
			pubCtx, cancel := context.WithTimeout(ctx, timeoutDuration)
			defer cancel()
			
			future, err := r.js.PublishAsync(ev.subject, ev.payload)
			var pubErr error
			if err != nil {
				pubErr = err
			} else {
				select {
				case <-future.Ok():
					pubErr = nil
				case e := <-future.Err():
					pubErr = e
				case <-pubCtx.Done():
					pubErr = pubCtx.Err()
				}
			}
			
			mu.Lock()
			defer mu.Unlock()
			if pubErr != nil {
				r.log.Error("Failed to publish outbox event (id: %s, subject: %s): %v", ev.id, ev.subject, pubErr)
				failedEvents = append(failedEvents, ev)
				errorMap[ev.id] = pubErr.Error()
			} else {
				publishedEvents = append(publishedEvents, ev)
			}
		}(e)
	}
	
	wg.Wait()

	// 1. Mark published
	if len(publishedEvents) > 0 {
		ids := make([]string, len(publishedEvents))
		tokens := make([]string, len(publishedEvents))
		for i, e := range publishedEvents {
			ids[i] = e.id
			tokens[i] = e.claimToken
		}
		_, err = r.db.Exec(ctx,
			`UPDATE outbox_events AS t
			 SET status = 'published', published_at = NOW(), claim_token = NULL
			 FROM unnest($1::text[], $2::uuid[]) AS u(id, token)
			 WHERE t.id = u.id AND t.claim_token = u.token`,
			ids, tokens,
		)
		if err != nil {
			r.log.Error("Failed to bulk mark outbox events as published: %v", err)
		}
	}

	// 2. Handle failures with exponential backoff & dead letter
	if len(failedEvents) > 0 {
		for _, ev := range failedEvents {
			newAttempts := ev.attempts + 1
			status := "failed"
			if newAttempts >= r.maxAttempts {
				status = "dead_letter"
			}
			
			// Exponential backoff: 2^attempts seconds
			backoffSeconds := 1 << ev.attempts
			
			_, ferr := r.db.Exec(ctx,
				`UPDATE outbox_events 
				 SET attempts = $1, status = $2, next_attempt_at = NOW() + INTERVAL '1 second' * $3, last_error = $4, claim_token = NULL
				 WHERE id = $5 AND claim_token = $6`,
				newAttempts, status, backoffSeconds, errorMap[ev.id], ev.id, ev.claimToken,
			)
			if ferr != nil {
				r.log.Error("Failed to update failed outbox event %s: %v", ev.id, ferr)
			}
		}
	}
}
