-- Backfill existing metrics
UPDATE buckets b
SET object_count = COALESCE((SELECT COUNT(*) FROM objects o WHERE o.bucket_id = b.id), 0),
    storage_used_bytes = COALESCE((SELECT SUM(size_bytes) FROM objects o WHERE o.bucket_id = b.id), 0);

-- Create trigger function to maintain bucket metrics
CREATE OR REPLACE FUNCTION update_bucket_metrics()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE buckets
        SET object_count = object_count + 1,
            storage_used_bytes = storage_used_bytes + NEW.size_bytes
        WHERE id = NEW.bucket_id;
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE buckets
        SET storage_used_bytes = storage_used_bytes - OLD.size_bytes + NEW.size_bytes
        WHERE id = NEW.bucket_id;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE buckets
        SET object_count = object_count - 1,
            storage_used_bytes = storage_used_bytes - OLD.size_bytes
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
