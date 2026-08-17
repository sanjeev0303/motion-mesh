-- 004_indexes.sql

-- api_keys
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_account_id ON api_keys(account_id);

-- buckets
CREATE INDEX IF NOT EXISTS idx_buckets_account_id ON buckets(account_id);


-- videos
CREATE INDEX IF NOT EXISTS idx_videos_account_id_created_at ON videos(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);

-- transcode_jobs
CREATE INDEX IF NOT EXISTS idx_transcode_jobs_video_id ON transcode_jobs(video_id);
CREATE INDEX IF NOT EXISTS idx_transcode_jobs_status_created_at ON transcode_jobs(status, created_at);

-- renditions
CREATE INDEX IF NOT EXISTS idx_renditions_video_id ON renditions(video_id);

-- caption_tracks
CREATE INDEX IF NOT EXISTS idx_caption_tracks_video_id ON caption_tracks(video_id);

-- watermark_metadata (partial index for active watermarks)
CREATE INDEX IF NOT EXISTS idx_watermark_metadata_active_account ON watermark_metadata(account_id) WHERE is_active = true;

-- usage_events
CREATE INDEX IF NOT EXISTS idx_usage_events_account_type_created ON usage_events(account_id, event_type, created_at);

