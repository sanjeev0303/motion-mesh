CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_unpublished ON outbox_events(created_at) WHERE published_at IS NULL;

ALTER TABLE transcode_jobs ADD COLUMN IF NOT EXISTS attempt INT NOT NULL DEFAULT 0;
