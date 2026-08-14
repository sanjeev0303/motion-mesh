CREATE INDEX IF NOT EXISTS idx_videos_keyset 
ON videos (account_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_videos_keyset_external 
ON videos (account_id, external_user_id, created_at DESC, id DESC);
