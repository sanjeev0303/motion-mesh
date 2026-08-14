package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/motionmesh/server/shared/models"
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

func (r *Repository) GetAccountByStripeCustomerID(ctx context.Context, customerID string) (*models.Account, error) {
	// Not explicitly in schema yet, but usually clerk_user_id or we need to add stripe_customer_id to accounts.
	// Wait, is there a stripe_customer_id in accounts? Let's check models.Account.
	var acc models.Account
	err := r.db.QueryRow(ctx,
		`SELECT id, email, clerk_user_id, clerk_org_id, stripe_customer_id, plan, status, balance, created_at, updated_at, total_storage_bytes, total_videos
		 FROM accounts WHERE stripe_customer_id = $1`,
		customerID,
	).Scan(&acc.ID, &acc.Email, &acc.ClerkUserID, &acc.ClerkOrgID, &acc.StripeCustomerID, &acc.Plan, &acc.Status, &acc.Balance, &acc.CreatedAt, &acc.UpdatedAt, &acc.TotalStorageBytes, &acc.TotalVideos)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &acc, err
}

func (r *Repository) UpdatePlan(ctx context.Context, accountID, plan, status string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE accounts SET plan = $1, status = $2, updated_at = now() WHERE id = $3`,
		plan, status, accountID,
	)
	return err
}

func (r *Repository) RecordUsageEvent(ctx context.Context, event *models.UsageEvent) error {
	var id *string
	if event.ID != "" {
		id = &event.ID
	}

	var createdAt *time.Time
	if !event.CreatedAt.IsZero() {
		createdAt = &event.CreatedAt
	}

	var eventID *string
	if event.EventID != "" {
		eventID = &event.EventID
	}

	_, err := r.db.Exec(ctx,
		`INSERT INTO usage_events (id, account_id, event_type, quantity, metadata, created_at, event_id)
		 VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, COALESCE($6, now()), $7)
		 ON CONFLICT (event_id) DO NOTHING`,
		id, event.AccountID, event.EventType, event.Quantity, event.Metadata, createdAt, eventID,
	)
	return err
}

func (r *Repository) GetAggregatedUsage(ctx context.Context, accountID, eventType string) (int64, error) {
	var total int64
	
	if eventType == "storage" {
		err := r.db.QueryRow(ctx, `SELECT COALESCE(total_storage_bytes, 0) FROM accounts WHERE id = $1`, accountID).Scan(&total)
		return total, err
	}
	
	if eventType == "videos" {
		var videosCount int
		err := r.db.QueryRow(ctx, `SELECT COALESCE(total_videos, 0) FROM accounts WHERE id = $1`, accountID).Scan(&videosCount)
		return int64(videosCount), err
	}

	err := r.db.QueryRow(ctx,
		`SELECT COALESCE(total, 0) FROM account_usage_counters
		 WHERE account_id = $1 AND event_type = $2`,
		accountID, eventType,
	).Scan(&total)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	return total, err
}

func (r *Repository) AddFunds(ctx context.Context, accountID string, amount int64) (int64, error) {
	var newBalance int64
	err := r.db.QueryRow(ctx,
		`UPDATE accounts SET balance = balance + $1, updated_at = now() WHERE id = $2 RETURNING balance`,
		amount, accountID,
	).Scan(&newBalance)
	return newBalance, err
}

func (r *Repository) UpdateStripeCustomerID(ctx context.Context, accountID, customerID string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE accounts SET stripe_customer_id = $1, updated_at = now() WHERE id = $2`,
		customerID, accountID,
	)
	return err
}
