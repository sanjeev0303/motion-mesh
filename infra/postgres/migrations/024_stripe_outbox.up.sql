-- Migration: 024_stripe_outbox
-- Adds a durable outbox table specifically for reliable Stripe billing event delivery

CREATE TABLE IF NOT EXISTS stripe_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id VARCHAR(255) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    quantity BIGINT NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_outbox_process ON stripe_outbox(status, next_attempt_at) WHERE status IN ('pending', 'failed');
