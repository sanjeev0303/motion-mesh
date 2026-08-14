-- Migration: 025_stripe_outbox_idempotency
-- Adds usage_event_id for strict Stripe insertion idempotency
-- Adds claimed_until for crash-safe lease expiration

ALTER TABLE stripe_outbox ADD COLUMN IF NOT EXISTS usage_event_id TEXT;
ALTER TABLE stripe_outbox ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS stripe_outbox_usage_event_id_idx 
    ON stripe_outbox (usage_event_id) 
    WHERE usage_event_id IS NOT NULL;
