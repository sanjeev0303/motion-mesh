-- 023_outbox_backoff_status.sql
ALTER TABLE outbox_events ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'pending';
ALTER TABLE outbox_events ADD COLUMN next_attempt_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE INDEX idx_outbox_events_status_next_attempt ON outbox_events(status, next_attempt_at) WHERE status = 'pending' OR status = 'failed';
