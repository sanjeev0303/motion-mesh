-- Replace trigger function to handle bucket_id changes
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
        IF OLD.bucket_id != NEW.bucket_id THEN
            -- Decrement old bucket
            UPDATE buckets
            SET object_count = object_count - 1,
                storage_used_bytes = storage_used_bytes - OLD.size_bytes
            WHERE id = OLD.bucket_id;
            
            -- Increment new bucket
            UPDATE buckets
            SET object_count = object_count + 1,
                storage_used_bytes = storage_used_bytes + NEW.size_bytes
            WHERE id = NEW.bucket_id;
        ELSE
            -- Same bucket, just update bytes if changed
            IF OLD.size_bytes != NEW.size_bytes THEN
                UPDATE buckets
                SET storage_used_bytes = storage_used_bytes - OLD.size_bytes + NEW.size_bytes
                WHERE id = NEW.bucket_id;
            END IF;
        END IF;
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

-- Add non-negative constraints
ALTER TABLE buckets ADD CONSTRAINT buckets_total_objects_check CHECK (object_count >= 0);
ALTER TABLE buckets ADD CONSTRAINT buckets_total_bytes_check CHECK (storage_used_bytes >= 0);
