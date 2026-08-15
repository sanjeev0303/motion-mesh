-- Add transcode_bucket_id to videos table
-- buckets.id is VARCHAR(255), so the FK column must match that type.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS transcode_bucket_id VARCHAR(255) REFERENCES buckets(id);
