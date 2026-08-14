CREATE INDEX IF NOT EXISTS idx_objects_keyset 
ON objects (bucket_id, uploaded_at DESC, id DESC);
