package postgres

import (
	"context"
	"errors"
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

func (r *Repository) GetActiveWatermark(ctx context.Context, accountID string) (*models.WatermarkMetadata, error) {
	var w models.WatermarkMetadata
	err := r.db.QueryRow(ctx,
		`SELECT id, account_id, asset_object_key, position, opacity, is_active, created_at
		 FROM watermark_metadata
		 WHERE account_id = $1 AND is_active = true`,
		accountID,
	).Scan(&w.ID, &w.AccountID, &w.AssetObjectKey, &w.Position, &w.Opacity, &w.IsActive, &w.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &w, err
}

func (r *Repository) Upsert(ctx context.Context, w *models.WatermarkMetadata) (*models.WatermarkMetadata, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// If the new watermark is active, deactivate the others.
	if w.IsActive {
		_, err = tx.Exec(ctx,
			`UPDATE watermark_metadata SET is_active = false WHERE account_id = $1 AND is_active = true`,
			w.AccountID,
		)
		if err != nil {
			return nil, err
		}
	}

	err = tx.QueryRow(ctx,
		`INSERT INTO watermark_metadata (id, account_id, asset_object_key, position, opacity, is_active)
		 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
		 RETURNING id, account_id, asset_object_key, position, opacity, is_active, created_at`,
		w.AccountID, w.AssetObjectKey, w.Position, w.Opacity, w.IsActive,
	).Scan(&w.ID, &w.AccountID, &w.AssetObjectKey, &w.Position, &w.Opacity, &w.IsActive, &w.CreatedAt)
	if err != nil {
		return nil, err
	}

	return w, tx.Commit(ctx)
}
