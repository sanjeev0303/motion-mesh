CREATE OR REPLACE FUNCTION update_account_metrics()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        -- Only count if not deleted
        IF NEW.deleted_at IS NULL THEN
            UPDATE accounts
            SET total_videos = total_videos + 1,
                total_storage_bytes = total_storage_bytes + NEW.size_bytes
            WHERE id = NEW.account_id;
        END IF;
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Handle soft delete
        IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
            UPDATE accounts
            SET total_videos = total_videos - 1,
                total_storage_bytes = total_storage_bytes - OLD.size_bytes
            WHERE id = NEW.account_id;
        -- Handle restore (if any)
        ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
            UPDATE accounts
            SET total_videos = total_videos + 1,
                total_storage_bytes = total_storage_bytes + NEW.size_bytes
            WHERE id = NEW.account_id;
        -- Normal size update
        ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL THEN
            IF OLD.size_bytes != NEW.size_bytes THEN
                UPDATE accounts
                SET total_storage_bytes = total_storage_bytes - OLD.size_bytes + NEW.size_bytes
                WHERE id = NEW.account_id;
            END IF;
        END IF;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        -- Hard delete
        IF OLD.deleted_at IS NULL THEN
            UPDATE accounts
            SET total_videos = total_videos - 1,
                total_storage_bytes = total_storage_bytes - OLD.size_bytes
            WHERE id = OLD.account_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_account_metrics ON videos;
CREATE TRIGGER trg_update_account_metrics
AFTER INSERT OR UPDATE OR DELETE ON videos
FOR EACH ROW
EXECUTE FUNCTION update_account_metrics();

-- Add non-negative constraints
ALTER TABLE accounts ADD CONSTRAINT accounts_total_videos_check CHECK (total_videos >= 0);
ALTER TABLE accounts ADD CONSTRAINT accounts_total_storage_bytes_check CHECK (total_storage_bytes >= 0);
