package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/motionmesh/server/shared/models"
	"github.com/motionmesh/server/worker/internal/billing"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}


func (r *Repository) GetAccountByID(ctx context.Context, id string) (*models.Account, error) {
	var acc models.Account
	err := r.db.QueryRow(ctx,
		`SELECT id, email, clerk_user_id, clerk_org_id, stripe_customer_id, plan, status, balance, created_at, updated_at, total_storage_bytes, total_videos
		 FROM accounts WHERE id = $1`,
		id,
	).Scan(&acc.ID, &acc.Email, &acc.ClerkUserID, &acc.ClerkOrgID, &acc.StripeCustomerID, &acc.Plan, &acc.Status, &acc.Balance, &acc.CreatedAt, &acc.UpdatedAt, &acc.TotalStorageBytes, &acc.TotalVideos)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &acc, err
}

func (r *Repository) RecordUsageAndStripeEvent(ctx context.Context, event *models.UsageEvent, stripeCustomerID string) error {
	var id *string
	if event.ID != "" {
		id = &event.ID
	}
	
	var createdAt *time.Time
	if !event.CreatedAt.IsZero() {
		createdAt = &event.CreatedAt
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`INSERT INTO usage_events (id, event_id, account_id, event_type, quantity, metadata, created_at)
		 VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, COALESCE($7, now()))
		 ON CONFLICT (event_id) DO NOTHING`,
		id, event.EventID, event.AccountID, event.EventType, event.Quantity, event.Metadata, createdAt,
	)
	if err != nil {
		return err
	}

	if stripeCustomerID != "" {
		idempKey := event.EventID
		if idempKey == "" {
			return errors.New("invalid event: missing stable event_id")
		}

		_, err = tx.Exec(ctx,
			`INSERT INTO stripe_outbox (account_id, stripe_customer_id, event_type, quantity, idempotency_key, usage_event_id)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (usage_event_id) DO NOTHING`,
			event.AccountID, stripeCustomerID, event.EventType, event.Quantity, idempKey, event.EventID,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *Repository) ClaimStripeOutboxEvents(ctx context.Context, batchSize, maxAttempts int) ([]billing.StripeOutboxEvent, error) {
	query := `
		UPDATE stripe_outbox
		SET status = 'publishing', claim_token = gen_random_uuid(), claimed_until = NOW() + INTERVAL '30 seconds', updated_at = NOW()
		WHERE id IN (
			SELECT id
			FROM stripe_outbox
			WHERE (
			    (status IN ('pending', 'failed') AND next_attempt_at <= NOW())
			    OR (status = 'publishing' AND claimed_until < NOW())
			)
			  AND attempts < $1
			ORDER BY created_at ASC
			FOR UPDATE SKIP LOCKED
			LIMIT $2
		)
		RETURNING id, account_id, stripe_customer_id, event_type, quantity, idempotency_key, attempts, claim_token
	`

	rows, err := r.db.Query(ctx, query, maxAttempts, batchSize)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []billing.StripeOutboxEvent
	for rows.Next() {
		var e billing.StripeOutboxEvent
		if err := rows.Scan(&e.ID, &e.AccountID, &e.StripeCustomerID, &e.EventType, &e.Quantity, &e.IdempotencyKey, &e.Attempts, &e.ClaimToken); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

func (r *Repository) MarkStripeEventsPublished(ctx context.Context, events []billing.StripeOutboxEvent) error {
	if len(events) == 0 {
		return nil
	}
	ids := make([]string, len(events))
	tokens := make([]string, len(events))
	for i, e := range events {
		ids[i] = e.ID
		tokens[i] = e.ClaimToken
	}
	_, err := r.db.Exec(ctx,
		`UPDATE stripe_outbox AS t 
		 SET status = 'published', updated_at = NOW(), claim_token = NULL 
		 FROM unnest($1::uuid[], $2::uuid[]) AS u(id, token)
		 WHERE t.id = u.id AND t.claim_token = u.token`,
		ids, tokens,
	)
	return err
}

func (r *Repository) MarkStripeEventFailed(ctx context.Context, id, claimToken string, attempts, maxAttempts int, errStr string) error {
	newAttempts := attempts + 1
	status := "failed"
	if newAttempts >= maxAttempts {
		status = "dead_letter"
	}
	
	backoffSeconds := 1 << attempts
	
	_, err := r.db.Exec(ctx,
		`UPDATE stripe_outbox 
		 SET attempts = $1, status = $2, next_attempt_at = NOW() + INTERVAL '1 second' * $3, last_error = $4, updated_at = NOW(), claim_token = NULL
		 WHERE id = $5 AND claim_token = $6`,
		newAttempts, status, backoffSeconds, errStr, id, claimToken,
	)
	return err
}
