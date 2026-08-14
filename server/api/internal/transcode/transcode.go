package transcode

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/motionmesh/server/shared/models"
	"github.com/motionmesh/server/shared/outbox"
	"github.com/nats-io/nats.go"
)

type Service struct {
	db *pgxpool.Pool
	nc *nats.Conn
	js nats.JetStreamContext
}

func NewService(db *pgxpool.Pool, nc *nats.Conn) *Service {
	js, err := nc.JetStream()
	if err != nil {
		panic(fmt.Errorf("failed to initialize JetStream context: %w", err))
	}
	return &Service{db: db, nc: nc, js: js}
}

type TranscodeJobMessage struct {
	VideoID           string  `json:"video_id"`
	SourceObjectKey   string  `json:"source_object_key"`
	TranscodeBucketID *string `json:"transcode_bucket_id,omitempty"`
}

// TriggerJob creates a job in the database and publishes a message to NATS via the outbox pattern.
func (s *Service) TriggerJob(ctx context.Context, video *models.Video) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// 1. Create job in postgres idempotently to prevent race conditions
	var jobID string
	err = tx.QueryRow(ctx,
		`INSERT INTO transcode_jobs (id, video_id, status, attempt)
		 VALUES (gen_random_uuid(), $1, $2, 0)
		 ON CONFLICT (video_id) DO NOTHING
		 RETURNING id`,
		video.ID, models.JobStatusQueued,
	).Scan(&jobID)

	if errors.Is(err, pgx.ErrNoRows) {
		// Job already exists, let's see if we should retry it
		var currentStatus models.JobStatus
		var attempts int
		err = tx.QueryRow(ctx, "SELECT id, status, attempt FROM transcode_jobs WHERE video_id = $1", video.ID).Scan(&jobID, &currentStatus, &attempts)
		if err != nil {
			return fmt.Errorf("failed to fetch existing job: %w", err)
		}

		// Don't restart jobs that are already queued, processing, or completed
		if currentStatus == models.JobStatusQueued || currentStatus == models.JobStatusProcessing || currentStatus == models.JobStatusCompleted {
			return nil
		}

		if attempts >= 3 {
			return fmt.Errorf("max retries exceeded for transcode job %s", jobID)
		}

		// Update to retry
		_, err = tx.Exec(ctx, "UPDATE transcode_jobs SET status = $1, attempt = attempt + 1 WHERE id = $2", models.JobStatusQueued, jobID)
		if err != nil {
			return fmt.Errorf("failed to update existing job for retry: %w", err)
		}
	} else if err != nil {
		return fmt.Errorf("failed to create transcode job: %w", err)
	}

	// 2. Publish to NATS via outbox
	msg := TranscodeJobMessage{
		VideoID:           video.ID,
		SourceObjectKey:   video.ObjectKey,
		TranscodeBucketID: video.TranscodeBucketID,
	}

	eventID := uuid.New().String()
	if err := outbox.InsertEvent(ctx, tx, eventID, "transcode.jobs", msg); err != nil {
		return fmt.Errorf("failed to insert outbox event: %w", err)
	}

	// Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// ListJobs returns the N most recent transcode jobs for the account's videos.
func (s *Service) ListJobs(ctx context.Context, accountID string, limit int) ([]*models.Job, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	rows, err := s.db.Query(ctx, `
		SELECT tj.id, tj.video_id, tj.status, tj.progress_percent, tj.error_msg, tj.created_at, tj.updated_at
		FROM transcode_jobs tj
		JOIN videos v ON v.id = tj.video_id
		WHERE v.account_id = $1
		ORDER BY tj.created_at DESC
		LIMIT $2`, accountID, limit)
	if err != nil {
		return nil, fmt.Errorf("list jobs: %w", err)
	}
	defer rows.Close()

	var jobs []*models.Job
	for rows.Next() {
		j := &models.Job{}
		if err := rows.Scan(&j.ID, &j.VideoID, &j.Status, &j.ProgressPercent, &j.ErrorMsg, &j.CreatedAt, &j.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan job: %w", err)
		}
		jobs = append(jobs, j)
	}
	return jobs, rows.Err()
}
