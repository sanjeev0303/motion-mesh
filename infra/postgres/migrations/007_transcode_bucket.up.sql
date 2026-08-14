-- Add transcode_bucket_id to videos table
ALTER TABLE videos ADD COLUMN IF NOT EXISTS transcode_bucket_id UUID REFERENCES buckets(id);
