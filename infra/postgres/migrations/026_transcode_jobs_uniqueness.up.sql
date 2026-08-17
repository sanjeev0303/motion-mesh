-- Migration: 026_transcode_jobs_uniqueness
-- Ensures strict one-job-per-video constraint at the database layer

-- First remove any duplicate transcode jobs, keeping only the canonical oldest one per video
WITH ranked_jobs AS (
    SELECT id,
           ROW_NUMBER() OVER(PARTITION BY video_id ORDER BY created_at ASC, id ASC) as rn
    FROM transcode_jobs
)
DELETE FROM transcode_jobs
WHERE id IN (
    SELECT id FROM ranked_jobs WHERE rn > 1
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_transcode_jobs_video_id'
    ) THEN
        ALTER TABLE transcode_jobs ADD CONSTRAINT uq_transcode_jobs_video_id UNIQUE (video_id);
    END IF;
END $$;
