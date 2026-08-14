UPDATE accounts a
SET total_videos = COALESCE((SELECT COUNT(*) FROM videos v WHERE v.account_id = a.id AND v.deleted_at IS NULL), 0),
    total_storage_bytes = COALESCE((SELECT SUM(size_bytes) FROM videos v WHERE v.account_id = a.id AND v.deleted_at IS NULL), 0);
