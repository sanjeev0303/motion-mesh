-- Add a stable, caller-provided event_id column so duplicate NATS deliveries
-- are silently discarded. The partial index only covers rows where event_id IS
-- NOT NULL so historical rows (NULL) are unaffected.
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS usage_events_event_id_idx
    ON usage_events (event_id)
    WHERE event_id IS NOT NULL;
