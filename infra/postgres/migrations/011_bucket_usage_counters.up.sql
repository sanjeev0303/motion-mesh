-- Add denormalized metric columns
ALTER TABLE buckets ADD COLUMN IF NOT EXISTS total_objects INTEGER NOT NULL DEFAULT 0;
ALTER TABLE buckets ADD COLUMN IF NOT EXISTS total_bytes BIGINT NOT NULL DEFAULT 0;

-- Backfill existing metrics
UPDATE buckets b
SET total_objects = COALESCE((SELECT COUNT(*) FROM objects o WHERE o.bucket_id = b.id), 0),
    total_bytes = COALESCE((SELECT SUM(size_bytes) FROM objects o WHERE o.bucket_id = b.id), 0);

-- Create trigger function to maintain bucket metrics
CREATE OR REPLACE FUNCTION update_bucket_metrics()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE buckets
        SET total_objects = total_objects + 1,
            total_bytes = total_bytes + NEW.size_bytes
        WHERE id = NEW.bucket_id;
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE buckets
        SET total_bytes = total_bytes - OLD.size_bytes + NEW.size_bytes
        WHERE id = NEW.bucket_id;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE buckets
        SET total_objects = total_objects - 1,
            total_bytes = total_bytes - OLD.size_bytes
        WHERE id = OLD.bucket_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to objects table
DROP TRIGGER IF EXISTS trg_update_bucket_metrics ON objects;
CREATE TRIGGER trg_update_bucket_metrics
AFTER INSERT OR UPDATE OR DELETE ON objects
FOR EACH ROW
EXECUTE FUNCTION update_bucket_metrics();
