-- 027_stripe_claim_token.sql
ALTER TABLE stripe_outbox ADD COLUMN IF NOT EXISTS claim_token UUID;
ALTER TABLE stripe_outbox ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMPTZ;
