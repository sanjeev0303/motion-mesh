package job

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/motionmesh/server/shared/branding"
	"github.com/motionmesh/server/shared/logger"
	"github.com/motionmesh/server/shared/metrics"
	"github.com/motionmesh/server/shared/models"
	"github.com/motionmesh/server/shared/outbox"
	"github.com/motionmesh/server/shared/storage"
	"github.com/motionmesh/server/worker/internal/captions"
	"github.com/motionmesh/server/worker/internal/packaging"
	"github.com/motionmesh/server/worker/internal/transcode"
	"github.com/motionmesh/server/worker/internal/uploader"
	"github.com/nats-io/nats.go"
)

type Handler struct {
	db           *pgxpool.Pool
	store        storage.ObjectStorage
	uploader     *uploader.Uploader
	captions     captions.Provider
	brandingRepo branding.BrandingRepository
	log          *logger.Logger
	// nc is kept for backwards-compatible construction but billing events are
	// now written to the outbox table for durable delivery.
	nc           *nats.Conn
}

func NewHandler(db *pgxpool.Pool, store storage.ObjectStorage, up *uploader.Uploader, capClient captions.Provider, brandingRepo branding.BrandingRepository, log *logger.Logger, nc *nats.Conn) *Handler {
	return &Handler{
		db:           db,
		store:        store,
		uploader:     up,
		captions:     capClient,
		brandingRepo: brandingRepo,
		log:          log,
		nc:           nc,
	}
}

func (h *Handler) Process(ctx context.Context, videoID string, sourceObjectKey string, transcodeBucketID *string) error {
	defer func() {
		var vStatus, cStatus *string
		err := h.db.QueryRow(context.Background(), "SELECT status, captions_status FROM videos WHERE id = $1::uuid", videoID).Scan(&vStatus, &cStatus)
		if err != nil {
			h.log.Error("Failed to query final status for video %s: %v", videoID, err)
			return
		}
		
		statusStr := "unknown"
		if vStatus != nil {
			statusStr = *vStatus
		}
		cStatusStr := "unknown"
		if cStatus != nil {
			cStatusStr = *cStatus
		}
		
		if statusStr == "ready" && cStatusStr == "ready" {
			if rand.Intn(100) == 0 {
				h.log.Info("Job terminated for video %s: status=%s, captions_status=%s (sampled)", videoID, statusStr, cStatusStr)
			}
		} else {
			h.log.Info("Job terminated for video %s: status=%s, captions_status=%s", videoID, statusStr, cStatusStr)
		}
	}()

	h.log.Info("Starting processing for video: %s", videoID)
	// 1. Atomic job claim to ensure exclusivity
	if err := h.claimJob(ctx, videoID); err != nil {
		return fmt.Errorf("claim job: %w", err)
	}

	var bucketID string
	if err := h.db.QueryRow(ctx, "SELECT bucket_id FROM videos WHERE id = $1::uuid", videoID).Scan(&bucketID); err != nil {
		return fmt.Errorf("query bucket_id: %w", err)
	}
	targetBucketID := bucketID
	if transcodeBucketID != nil && *transcodeBucketID != "" {
		targetBucketID = *transcodeBucketID
	}

	var uploadedObjects []uploader.UploadedFile
	var objMu sync.Mutex

	// Make sure we have a temp dir
	tmpDir, err := os.MkdirTemp("", "motionmesh-job-"+videoID+"-*")
	if err != nil {
		return fmt.Errorf("mkdir temp: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	h.log.Info("Downloading source for video: %s", videoID)
	// 2. Download source
	downloadStart := time.Now()
	sourcePath := filepath.Join(tmpDir, "source.mp4")
	if err := h.downloadSource(ctx, sourceObjectKey, sourcePath, &bucketID); err != nil {
		return h.failJob(ctx, videoID, fmt.Errorf("download source: %w", err))
	}
	metrics.WorkerJobPhaseDuration.WithLabelValues("download").Observe(time.Since(downloadStart).Seconds())

	// Run Probe, getAccountID, and idempotency check concurrently — all are
	// independent reads that can overlap while the disk is warm from the download.
	var (
		probeRes      *transcode.ProbeResult
		accountID     string
		alreadyEncoded bool
	)
	probeStart := time.Now()
	{
		pg, pgCtx := errgroup.WithContext(ctx)
		pg.Go(func() error {
			h.log.Info("Probing source for video: %s", videoID)
			var e error
			probeRes, e = transcode.Probe(pgCtx, sourcePath)
			return e
		})
		pg.Go(func() error {
			var e error
			accountID, e = h.getAccountIDWithRetry(pgCtx, videoID)
			return e
		})
		pg.Go(func() error {
			masterKey := fmt.Sprintf("videos/%s/hls/master.m3u8", videoID)
			_, e := h.store.GetObject(pgCtx, masterKey)
			alreadyEncoded = (e == nil)
			return nil
		})
		if err := pg.Wait(); err != nil {
			return h.failJob(ctx, videoID, fmt.Errorf("probe/account/idempotency: %w", err))
		}
	}
	metrics.WorkerJobPhaseDuration.WithLabelValues("probe").Observe(time.Since(probeStart).Seconds())

	// 4. ABR Ladder
	renditions := transcode.BuildLadder(probeRes.Height)

	var watermark *models.WatermarkMetadata
	if !alreadyEncoded {
		h.log.Info("Checking for watermark for video: %s", videoID)
		watermark, _ = h.brandingRepo.GetActiveWatermark(ctx, accountID)
		if watermark != nil {
			h.log.Info("Downloading watermark for video: %s", videoID)
			wmPath := filepath.Join(tmpDir, "watermark.png")
			if err := h.downloadSource(ctx, watermark.AssetObjectKey, wmPath, &bucketID); err == nil {
				watermark.AssetObjectKey = wmPath
			} else {
				h.log.Error("failed to download watermark %s: %v", watermark.AssetObjectKey, err)
				watermark = nil
			}
		}
	}

	eg, egCtx := errgroup.WithContext(ctx)

	// Concurrency 1: Encode and upload HLS
	if !alreadyEncoded {
		eg.Go(func() error {
			encodeStart := time.Now()
			h.log.Info("Starting HLS encode for video: %s", videoID)
			_, err := transcode.Encode(egCtx, sourcePath, probeRes, renditions, watermark, tmpDir, func(percent int) {
				h.updateJobProgress(egCtx, videoID, percent)
			})
			if err != nil {
				return fmt.Errorf("encode: %w", err)
			}
			metrics.WorkerJobPhaseDuration.WithLabelValues("transcode_hls").Observe(time.Since(encodeStart).Seconds())

			h.log.Info("Saving renditions for video: %s", videoID)
			if err := h.saveRenditions(egCtx, videoID, renditions); err != nil {
				return fmt.Errorf("save renditions: %w", err)
			}

			// Generate Master Playlist
			_, err = packaging.GenerateMasterPlaylist(egCtx, renditions, []string{"en"}, tmpDir) // stub for english
			if err != nil {
				return fmt.Errorf("master playlist: %w", err)
			}

			uploadStart := time.Now()
			h.log.Info("Uploading HLS for video: %s", videoID)
			// Upload entire HLS directory
			files, err := h.uploader.UploadHLS(egCtx, videoID, tmpDir, transcodeBucketID)
			if err != nil {
				return fmt.Errorf("upload HLS: %w", err)
			}
			metrics.WorkerJobPhaseDuration.WithLabelValues("upload_hls").Observe(time.Since(uploadStart).Seconds())
			objMu.Lock()
			uploadedObjects = append(uploadedObjects, files...)
			objMu.Unlock()

			return nil
		})
	}

	// Concurrency 2: Captions (Extract audio + Transcribe + VTT + Chapters)
	// Runs concurrently with HLS encode but uses minimal CPU (mostly I/O wait on sidecar).
	eg.Go(func() error {
		captionsStart := time.Now()
		defer func() {
			metrics.WorkerJobPhaseDuration.WithLabelValues("captions").Observe(time.Since(captionsStart).Seconds())
		}()
		h.log.Info("Starting captions processing for video: %s", videoID)
		if err := h.updateCaptionsStatus(egCtx, videoID, "processing"); err != nil {
			h.log.Error("failed to set captions_status processing: %v", err)
		}

		h.log.Info("Extracting audio for video: %s", videoID)
		// Extract audio
		audioPath := filepath.Join(tmpDir, "audio.mp3")
		if err := extractAudio(egCtx, sourcePath, audioPath); err != nil {
			_ = h.updateCaptionsStatus(egCtx, videoID, "failed")
			h.log.Error("extract audio: %v", err)
			return nil
		}

		includeChapters := probeRes.Duration > 10.0

		h.log.Info("Transcribing audio for video: %s", videoID)
		// Call Sidecar
		transcribeRes, err := h.captions.Transcribe(egCtx, captions.TranscribeRequest{
			AudioPath:       audioPath,
			IncludeChapters: includeChapters,
		})
		if err != nil {
			_ = h.updateCaptionsStatus(egCtx, videoID, "failed")
			h.log.Error("transcribe: %v", err)
			return nil
		}

		h.log.Info("Uploading VTT for video: %s", videoID)
		// Upload VTT
		vttFile, err := h.uploader.UploadCaption(egCtx, videoID, "en", transcribeRes.VTT, transcodeBucketID)
		if err != nil {
			_ = h.updateCaptionsStatus(egCtx, videoID, "failed")
			h.log.Error("upload vtt: %v", err)
			return nil
		}
		vttKey := vttFile.Key
		objMu.Lock()
		uploadedObjects = append(uploadedObjects, vttFile)
		objMu.Unlock()

		h.log.Info("Saving captions and chapters to DB for video: %s", videoID)
		// Save caption track to db
		if err := h.saveCaptionTrack(egCtx, videoID, "en", vttKey); err != nil {
			_ = h.updateCaptionsStatus(egCtx, videoID, "failed")
			h.log.Error("save caption track: %v", err)
			return nil
		}

		// Save chapters to db
		if includeChapters && len(transcribeRes.Chapters) > 0 {
			if err := h.saveChapters(egCtx, videoID, transcribeRes.Chapters); err != nil {
				_ = h.updateCaptionsStatus(egCtx, videoID, "failed")
				h.log.Error("save chapters: %v", err)
				return nil
			}
		}

		if err := h.updateCaptionsStatus(egCtx, videoID, "ready"); err != nil {
			h.log.Error("failed to set captions_status ready: %v", err)
		}

		return nil
	})

	// Wait for HLS encode + captions before running thumbnails.
	// Thumbnails also spawn FFmpeg processes; running them concurrently with the
	// multi-rendition encode caused OOM kills (signal: killed).
	h.log.Info("Waiting for encode and captions to finish for video: %s", videoID)
	if err := eg.Wait(); err != nil {
		return h.failJob(ctx, videoID, err)
	}

	h.log.Info("Generating thumbnails and previews for video: %s", videoID)
	// Sprite, Poster, Preview are independent FFmpeg processes — run all 3 concurrently.
	var (
		spriteKey  string
		posterKey  string
		previewKey string
		thumbMu    sync.Mutex
	)
	{
		thumbnailsStart := time.Now()
		tg, tgCtx := errgroup.WithContext(ctx)
		tg.Go(func() error {
			sp, err := packaging.GenerateSprite(tgCtx, sourcePath, probeRes.Duration, tmpDir)
			if err != nil {
				h.log.Error("generate sprite: %v", err)
				return nil
			}
			f, err := h.uploader.UploadSprite(tgCtx, videoID, sp, transcodeBucketID)
			if err != nil {
				h.log.Error("upload sprite: %v", err)
				return nil
			}
			thumbMu.Lock(); spriteKey = f.Key; thumbMu.Unlock()
			objMu.Lock(); uploadedObjects = append(uploadedObjects, f); objMu.Unlock()
			return nil
		})
		tg.Go(func() error {
			po, err := packaging.GeneratePoster(tgCtx, sourcePath, probeRes.Duration, tmpDir)
			if err != nil {
				h.log.Error("generate poster: %v", err)
				return nil
			}
			f, err := h.uploader.UploadPoster(tgCtx, videoID, po, transcodeBucketID)
			if err != nil {
				h.log.Error("upload poster: %v", err)
				return nil
			}
			thumbMu.Lock(); posterKey = f.Key; thumbMu.Unlock()
			objMu.Lock(); uploadedObjects = append(uploadedObjects, f); objMu.Unlock()
			return nil
		})
		tg.Go(func() error {
			pr, err := packaging.GeneratePreview(tgCtx, sourcePath, probeRes.Duration, tmpDir)
			if err != nil {
				h.log.Error("generate preview: %v", err)
				return nil
			}
			f, err := h.uploader.UploadPreview(tgCtx, videoID, pr, transcodeBucketID)
			if err != nil {
				h.log.Error("upload preview: %v", err)
				return nil
			}
			thumbMu.Lock(); previewKey = f.Key; thumbMu.Unlock()
			objMu.Lock(); uploadedObjects = append(uploadedObjects, f); objMu.Unlock()
			return nil
		})
		_ = tg.Wait() // errors are logged above; never fatal
		metrics.WorkerJobPhaseDuration.WithLabelValues("thumbnails").Observe(time.Since(thumbnailsStart).Seconds())
	}

	h.log.Info("Saving tracked objects for video: %s", videoID)
	if err := h.saveObjectsForJob(ctx, targetBucketID, uploadedObjects); err != nil {
		h.log.Error("failed to save tracked objects: %v", err)
	}

	h.log.Info("Finalizing video for video: %s", videoID)
	// 12. Finalize Video Status & Complete Job & Write Billing Event Transactionally
	if err := h.completeJobWithBilling(ctx, videoID, accountID, probeRes.Duration, posterKey, spriteKey, previewKey); err != nil {
		return h.failJob(ctx, videoID, fmt.Errorf("complete job transaction: %w", err))
	}

	// This was originally logged on every job completion, let's leave it up to the defer block to log success or just sample it here as well.
	if rand.Intn(100) == 0 {
		h.log.Info("Completed processing for video: %s (sampled)", videoID)
	}
	return nil
}

type usageEvent struct {
	EventID   string  `json:"event_id"`
	AccountID string  `json:"account_id"`
	VideoID   string  `json:"video_id"`
	Duration  float64 `json:"duration"`
}

// completeJobWithBilling atomically marks the video as ready, the job as completed,
// and inserts the billing outbox event inside a single transaction.
func (h *Handler) completeJobWithBilling(ctx context.Context, videoID string, accountID string, duration float64, thumbnail, sprite, preview string) error {
	var t, s, p *string
	if thumbnail != "" { t = &thumbnail }
	if sprite != "" { s = &sprite }
	if preview != "" { p = &preview }

	tx, err := h.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Finalize Video Status
	_, err = tx.Exec(ctx,
		`UPDATE videos SET status = $1, duration = $2, thumbnail_key = $3, sprite_key = $4, preview_key = $5, updated_at = now() WHERE id = $6`,
		models.VideoStatusReady, duration, t, s, p, videoID,
	)
	if err != nil {
		return fmt.Errorf("update videos: %w", err)
	}

	// Set job status to complete and progress to 100
	_, err = tx.Exec(ctx,
		`UPDATE transcode_jobs SET status = $1, progress = 100, updated_at = now() WHERE video_id = $2`,
		models.JobStatusCompleted, videoID,
	)
	if err != nil {
		return fmt.Errorf("update transcode_jobs: %w", err)
	}

	// Insert billing event if accountID is present
	if accountID != "" {
		eventID := uuid.New().String()
		event := usageEvent{
			EventID:   eventID,
			AccountID: accountID,
			VideoID:   videoID,
			Duration:  duration,
		}
		if err := outbox.InsertEvent(ctx, tx, eventID, "motionmesh.billing.usage", event); err != nil {
			return fmt.Errorf("insert outbox event: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}

	if accountID != "" {
		h.log.Info("Queued usage event outbox for video %s, duration %.2f", videoID, duration)
	}
	return nil
}

func (h *Handler) downloadSource(ctx context.Context, objectKey, outPath string, bucketID *string) error {
	_ = bucketID
	dlCtx, cancel := context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()

	store := h.store

	maxRetries := 5
	var lastErr error
	for i := 0; i < maxRetries; i++ {
		if i > 0 {
			h.log.Info("downloadSource: retrying download (%d/%d) after: %v", i+1, maxRetries, lastErr)
			select {
			case <-dlCtx.Done():
				return dlCtx.Err()
			case <-time.After(2 * time.Second):
			}
		}

		body, err := store.GetObjectStream(dlCtx, objectKey)
		if err != nil {
			lastErr = err
			h.log.Info("downloadSource: GetObjectStream failed (%d/%d): %v", i+1, maxRetries, err)
			continue
		}

		f, err := os.Create(outPath)
		if err != nil {
			body.Close()
			return fmt.Errorf("create file: %w", err)
		}

		h.log.Info("downloadSource: streaming object %s (attempt %d/%d)", objectKey, i+1, maxRetries)

		// Run io.Copy in a goroutine so dlCtx cancellation can interrupt it.
		// Closing body forces the underlying TCP read to return immediately.
		type copyResult struct {
			n   int64
			err error
		}
		done := make(chan copyResult, 1)

		// Progress counter written to by the copy goroutine via a counting writer.
		var bytesWritten int64
		cw := &countingWriter{dst: f, n: &bytesWritten}

		go func() {
			n, err := io.Copy(cw, body)
			done <- copyResult{n, err}
		}()

		// Ticker for periodic progress logs every 30 seconds.
		ticker := time.NewTicker(30 * time.Second)
		var copyErr error
		outer:
		for {
			select {
			case res := <-done:
				copyErr = res.err
				break outer
			case <-ticker.C:
				h.log.Info("downloadSource: in progress for %s — %d bytes written so far", objectKey, bytesWritten)
			case <-dlCtx.Done():
				// Force-close body to unblock the Read inside io.Copy.
				body.Close()
				<-done // wait for goroutine exit
				ticker.Stop()
				return fmt.Errorf("download timed out: %w", dlCtx.Err())
			}
		}
		ticker.Stop()
		body.Close()
		f.Close()

		if copyErr != nil {
			lastErr = copyErr
			h.log.Info("downloadSource: copy stream failed (%d/%d): %v", i+1, maxRetries, copyErr)
			os.Remove(outPath)
			continue
		}

		h.log.Info("downloadSource: completed %s — %d bytes", objectKey, bytesWritten)
		return nil
	}

	return fmt.Errorf("failed after %d retries: %w", maxRetries, lastErr)
}

// countingWriter wraps an io.Writer and counts bytes written.
type countingWriter struct {
	dst io.Writer
	n   *int64
}

func (cw *countingWriter) Write(p []byte) (int, error) {
	n, err := cw.dst.Write(p)
	*cw.n += int64(n)
	return n, err
}

func (h *Handler) getAccountID(ctx context.Context, videoID string) (string, error) {
	var accountID string
	err := h.db.QueryRow(ctx, "SELECT account_id FROM videos WHERE id = $1", videoID).Scan(&accountID)
	return accountID, err
}

// getAccountIDWithRetry retries the account lookup with exponential back-off.
// This guards against the race where the NATS message is delivered before the
// API's INSERT transaction has been committed to the DB.
func (h *Handler) getAccountIDWithRetry(ctx context.Context, videoID string) (string, error) {
	const maxAttempts = 5
	delay := 500 * time.Millisecond
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		accountID, err := h.getAccountID(ctx, videoID)
		if err == nil {
			return accountID, nil
		}
		if attempt == maxAttempts {
			return "", fmt.Errorf("getAccountID after %d attempts: %w", maxAttempts, err)
		}
		h.log.Info("getAccountID: video %s not found (attempt %d/%d), retrying in %v", videoID, attempt, maxAttempts, delay)
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(delay):
		}
		delay *= 2
	}
	return "", fmt.Errorf("unreachable")
}

func (h *Handler) saveObjectsForJob(ctx context.Context, bucketID string, objects []uploader.UploadedFile) error {
	if len(objects) == 0 {
		return nil
	}
	query := `
		INSERT INTO objects (bucket_id, key, size_bytes, content_type)
		SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::bigint[], $4::text[])
		ON CONFLICT (bucket_id, key) DO UPDATE 
		SET size_bytes = EXCLUDED.size_bytes,
		    content_type = EXCLUDED.content_type
	`
	var bucketIDs []string
	var keys []string
	var sizes []int64
	var contentTypes []string

	for _, obj := range objects {
		bucketIDs = append(bucketIDs, bucketID)
		keys = append(keys, obj.Key)
		sizes = append(sizes, obj.SizeBytes)
		contentTypes = append(contentTypes, obj.ContentType)
	}
	_, err := h.db.Exec(ctx, query, bucketIDs, keys, sizes, contentTypes)
	return err
}

func (h *Handler) claimJob(ctx context.Context, videoID string) error {
	var jobID string
	err := h.db.QueryRow(ctx, "UPDATE transcode_jobs SET status = $1::text, updated_at = now() WHERE video_id = $2::uuid AND status = $3::text RETURNING id", models.JobStatusProcessing, videoID, models.JobStatusQueued).Scan(&jobID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("job not found in pending state or already claimed")
		}
		return err
	}
	_, err = h.db.Exec(ctx, "UPDATE videos SET status = $1::text, updated_at = now() WHERE id = $2::uuid", models.VideoStatusProcessing, videoID)
	return err
}

func (h *Handler) updateJobProgress(ctx context.Context, videoID string, percent int) error {
	_, err := h.db.Exec(ctx, "UPDATE transcode_jobs SET progress_percent = $1::integer, updated_at = now() WHERE video_id = $2::uuid", percent, videoID)
	return err
}

func (h *Handler) updateCaptionsStatus(ctx context.Context, videoID, status string) error {
	_, err := h.db.Exec(ctx, "UPDATE videos SET captions_status = $1::text, updated_at = now() WHERE id = $2::uuid", status, videoID)
	return err
}

func (h *Handler) failJob(ctx context.Context, videoID string, err error) error {
	errStr := err.Error()
	h.db.Exec(ctx, "UPDATE transcode_jobs SET status = $1::text, error_msg = $2::text, updated_at = now() WHERE video_id = $3::uuid", models.JobStatusFailed, errStr, videoID)
	h.db.Exec(ctx, "UPDATE videos SET status = $1::text, captions_status = CASE WHEN captions_status = 'processing' THEN 'failed' ELSE captions_status END, updated_at = now() WHERE id = $2::uuid", models.VideoStatusFailed, videoID)
	return err
}


// saveRenditions batches all rendition rows into a single INSERT, avoiding N round-trips.
func (h *Handler) saveRenditions(ctx context.Context, videoID string, renditions []transcode.Rendition) error {
	if len(renditions) == 0 {
		return nil
	}
	placeholders := make([]string, len(renditions))
	args := make([]any, 0, len(renditions)*3)
	for i, r := range renditions {
		base := i * 3
		placeholders[i] = fmt.Sprintf("(gen_random_uuid(), $%d::uuid, $%d::text, $%d::text)", base+1, base+2, base+3)
		args = append(args, videoID, r.Label, fmt.Sprintf("videos/%s/hls/stream_%s.m3u8", videoID, r.Label))
	}
	_, err := h.db.Exec(ctx,
		"INSERT INTO renditions (id, video_id, resolution, object_key) VALUES "+strings.Join(placeholders, ",")+
			" ON CONFLICT (video_id, resolution) DO NOTHING",
		args...,
	)
	return err
}

func (h *Handler) saveCaptionTrack(ctx context.Context, videoID, lang, objectKey string) error {
	_, err := h.db.Exec(ctx,
		`INSERT INTO caption_tracks (id, video_id, language, object_key) VALUES (gen_random_uuid(), $1::uuid, $2::text, $3::text)`,
		videoID, lang, objectKey,
	)
	return err
}

// saveChapters batches all chapter rows into a single INSERT.
func (h *Handler) saveChapters(ctx context.Context, videoID string, chapters []models.Chapter) error {
	if len(chapters) == 0 {
		return nil
	}
	placeholders := make([]string, len(chapters))
	args := make([]any, 0, len(chapters)*4)
	for i, c := range chapters {
		base := i * 4
		placeholders[i] = fmt.Sprintf("(gen_random_uuid(), $%d::uuid, $%d::float4, $%d::text, $%d::int)", base+1, base+2, base+3, base+4)
		args = append(args, videoID, c.StartTimeSeconds, c.Title, i)
	}
	_, err := h.db.Exec(ctx,
		"INSERT INTO chapters (id, video_id, start_time_seconds, title, position) VALUES "+strings.Join(placeholders, ","),
		args...,
	)
	return err
}


// extractAudio demuxes audio from the source into an mp3 for transcription.
// Uses 2 threads: enough for fast demux without starving the concurrent HLS encode.
func extractAudio(ctx context.Context, inputPath, outputPath string) error {
	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-y",
		"-threads", "2",
		"-i", inputPath,
		"-vn",
		"-acodec", "libmp3lame",
		"-q:a", "2",
		outputPath,
	)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ffmpeg extract audio: %w", err)
	}
	return nil
}
