-- 005_analytics_indexes.sql
-- Targeted index for fast aggregation of daily analytics scoped to an account.

CREATE INDEX IF NOT EXISTS idx_analytics_daily_account_id_day 
ON analytics_daily (account_id, day DESC);
