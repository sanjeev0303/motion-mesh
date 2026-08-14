package postgres

import (
	"context"
	"errors"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/motionmesh/server/shared/models"
	"github.com/motionmesh/server/shared/outbox"
	"github.com/motionmesh/server/shared/pagination"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) ListByAccount(ctx context.Context, accountID string, externalUserID *string, limit int, cursor string) ([]*models.Video, error) {
	if limit == 0 {
		limit = 20
	}

	query := `SELECT id, account_id, bucket_id, transcode_bucket_id, object_key, thumbnail_key, sprite_key, preview_key, title, status, captions_status, duration, size_bytes, external_user_id, created_at, updated_at
		 FROM videos
		 WHERE account_id = $1 AND deleted_at IS NULL`
	
	args := []interface{}{accountID}
	argIdx := 2

	if externalUserID != nil {
		query += ` AND external_user_id = $` + strconv.Itoa(argIdx)
		args = append(args, *externalUserID)
		argIdx++
	}

	if cursor != "" {
		c, err := pagination.DecodeCursor[pagination.VideoCursor](cursor)
		if err != nil {
			return nil, err
		}
		query += ` AND (created_at, id) < ($` + strconv.Itoa(argIdx) + `, $` + strconv.Itoa(argIdx+1) + `)`
		args = append(args, c.CreatedAt, c.ID)
		argIdx += 2
	}

	query += ` ORDER BY created_at DESC, id DESC LIMIT $` + strconv.Itoa(argIdx)
	args = append(args, limit)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var videos []*models.Video
	for rows.Next() {
		var v models.Video
		if err := rows.Scan(&v.ID, &v.AccountID, &v.BucketID, &v.TranscodeBucketID, &v.ObjectKey, &v.ThumbnailKey, &v.SpriteKey, &v.PreviewKey, &v.Title, &v.Status, &v.CaptionsStatus, &v.Duration, &v.SizeBytes, &v.ExternalUserID, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, err
		}
		videos = append(videos, &v)
	}
	return videos, rows.Err()
}

func (r *Repository) GetByID(ctx context.Context, id, accountID string) (*models.Video, error) {
	var v models.Video
	err := r.db.QueryRow(ctx,
		`SELECT id, account_id, bucket_id, transcode_bucket_id, object_key, thumbnail_key, sprite_key, preview_key, title, status, captions_status, duration, size_bytes, external_user_id, created_at, updated_at
		 FROM videos
		 WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL`,
		id, accountID,
	).Scan(&v.ID, &v.AccountID, &v.BucketID, &v.TranscodeBucketID, &v.ObjectKey, &v.ThumbnailKey, &v.SpriteKey, &v.PreviewKey, &v.Title, &v.Status, &v.CaptionsStatus, &v.Duration, &v.SizeBytes, &v.ExternalUserID, &v.CreatedAt, &v.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &v, err
}

func (r *Repository) GetPublicByID(ctx context.Context, id string) (*models.Video, error) {
	var v models.Video
	err := r.db.QueryRow(ctx,
		`SELECT id, account_id, bucket_id, transcode_bucket_id, object_key, thumbnail_key, sprite_key, preview_key, title, status, captions_status, duration, size_bytes, external_user_id, created_at, updated_at
		 FROM videos
		 WHERE id = $1 AND deleted_at IS NULL`,
		id,
	).Scan(&v.ID, &v.AccountID, &v.BucketID, &v.TranscodeBucketID, &v.ObjectKey, &v.ThumbnailKey, &v.SpriteKey, &v.PreviewKey, &v.Title, &v.Status, &v.CaptionsStatus, &v.Duration, &v.SizeBytes, &v.ExternalUserID, &v.CreatedAt, &v.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &v, err
}

func (r *Repository) Delete(ctx context.Context, id, accountID string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var video models.Video
	err = tx.QueryRow(ctx,
		`SELECT object_key, thumbnail_key, sprite_key, preview_key FROM videos WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL`,
		id, accountID,
	).Scan(&video.ObjectKey, &video.ThumbnailKey, &video.SpriteKey, &video.PreviewKey)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errors.New("video not found or unauthorized")
		}
		return err
	}

	_, err = tx.Exec(ctx,
		`UPDATE videos SET deleted_at = NOW() WHERE id = $1 AND account_id = $2`,
		id, accountID,
	)
	if err != nil {
		return err
	}

	payload := map[string]interface{}{
		"video_id":      id,
		"object_key":    video.ObjectKey,
		"thumbnail_key": video.ThumbnailKey,
		"sprite_key":    video.SpriteKey,
		"preview_key":   video.PreviewKey,
	}
	eventID := uuid.New().String()
	if err := outbox.InsertEvent(ctx, tx, eventID, "video.cleanup", payload); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *Repository) Create(ctx context.Context, video *models.Video) (*models.Video, error) {
	err := r.db.QueryRow(ctx,
		`INSERT INTO videos (id, account_id, bucket_id, transcode_bucket_id, object_key, title, status, duration, size_bytes, external_user_id)
		 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, created_at, updated_at`,
		video.AccountID, video.BucketID, video.TranscodeBucketID, video.ObjectKey, video.Title, video.Status, video.Duration, video.SizeBytes, video.ExternalUserID,
	).Scan(&video.ID, &video.CreatedAt, &video.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return video, nil
}

func (r *Repository) UpdateStatus(ctx context.Context, id, accountID string, status models.VideoStatus) error {
	_, err := r.db.Exec(ctx,
		`UPDATE videos SET status = $1, updated_at = now() WHERE id = $2 AND account_id = $3`,
		status, id, accountID,
	)
	return err
}

func (r *Repository) SetThumbnailKeys(ctx context.Context, id, accountID string, thumbnail, sprite, preview *string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE videos SET thumbnail_key = $1, sprite_key = $2, preview_key = $3, updated_at = now() WHERE id = $4 AND account_id = $5`,
		thumbnail, sprite, preview, id, accountID,
	)
	return err
}
