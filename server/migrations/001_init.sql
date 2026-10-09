-- 001_init.sql

CREATE TABLE IF NOT EXISTS metric_points (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL,
  name TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  session_id TEXT,
  model TEXT,
  token_type TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_metric_points_name_ts ON metric_points (name, ts);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL,
  event_name TEXT NOT NULL,
  session_id TEXT,
  prompt_id TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  model TEXT,
  tool_name TEXT,
  duration_ms DOUBLE PRECISION,
  success BOOLEAN,
  cost_usd DOUBLE PRECISION,
  input_tokens INTEGER,
  output_tokens INTEGER,
  error TEXT,
  dedup_key TEXT UNIQUE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_event_name_ts ON events (event_name, ts);
CREATE INDEX IF NOT EXISTS idx_events_session_id_ts ON events (session_id, ts);

CREATE OR REPLACE VIEW sessions AS
SELECT
  session_id,
  MIN(ts) AS started_at,
  MAX(ts) AS last_seen,
  COALESCE(SUM(cost_usd), 0)::double precision AS total_cost,
  COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0)::integer AS total_tokens,
  COUNT(*) FILTER (WHERE event_name = 'tool_result')::integer AS tool_calls,
  COUNT(*) FILTER (WHERE event_name = 'api_error' OR (event_name = 'tool_result' AND success = false))::integer AS errors
FROM events
WHERE session_id IS NOT NULL
GROUP BY session_id;
