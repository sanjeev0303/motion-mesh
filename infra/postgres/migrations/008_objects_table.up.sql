-- 008_objects_table.sql
-- Tracks every file written to object storage so the Bucket UI can display
-- real file counts, per-file metadata, and accurate storage-used totals.
-- The unique index on (bucket_id, key) was defined in 004_indexes.sql;
-- we guard with IF NOT EXISTS so the migration is idempotent.

CREATE TABLE IF NOT EXISTS objects (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id    uuid        NOT NULL REFERENCES buckets(id) ON DELETE CASCADE,
  key          text        NOT NULL,
  size_bytes   bigint      NOT NULL DEFAULT 0,
  content_type text        NOT NULL DEFAULT 'application/octet-stream',
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_objects_bucket_id_key ON objects(bucket_id, key);

-- Index to power the per-bucket usage aggregate query efficiently.
CREATE INDEX IF NOT EXISTS idx_objects_bucket_id ON objects(bucket_id);
