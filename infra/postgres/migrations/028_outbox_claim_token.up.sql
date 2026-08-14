-- 028_outbox_claim_token.sql
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claim_token UUID;
