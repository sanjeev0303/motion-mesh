ALTER TABLE videos ADD COLUMN IF NOT EXISTS external_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_videos_external_user_id ON videos(external_user_id, created_at DESC);
