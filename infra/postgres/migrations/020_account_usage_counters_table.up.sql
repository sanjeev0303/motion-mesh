CREATE TABLE IF NOT EXISTS account_usage_counters (
    account_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    total BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, event_type)
);

-- Trigger function to update the counter
CREATE OR REPLACE FUNCTION update_account_usage_counter()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO account_usage_counters (account_id, event_type, total, updated_at)
    VALUES (NEW.account_id, NEW.event_type, NEW.quantity, NOW())
    ON CONFLICT (account_id, event_type)
    DO UPDATE SET 
        total = account_usage_counters.total + EXCLUDED.total,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to usage_events
DROP TRIGGER IF EXISTS trg_update_account_usage_counter ON usage_events;
CREATE TRIGGER trg_update_account_usage_counter
AFTER INSERT ON usage_events
FOR EACH ROW
EXECUTE FUNCTION update_account_usage_counter();
