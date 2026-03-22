-- =============================================================================
-- 021: Heartbeat Infrastructure
-- State tracking and logging for the autonomous agent heartbeat daemon.
-- pg_cron invokes edge functions every 30 minutes; these tables track what
-- has been done and what needs to happen next.
-- =============================================================================

-- agent_heartbeat_state: Per-user heartbeat configuration and timing
CREATE TABLE IF NOT EXISTS agent_heartbeat_state (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_heartbeat_at TIMESTAMPTZ,
  last_morning_at  TIMESTAMPTZ,
  last_evening_at  TIMESTAMPTZ,
  last_weekly_at   TIMESTAMPTZ,
  next_action      TEXT,        -- 'morning' | 'evening' | 'weekly' | 'idle'
  next_action_at   TIMESTAMPTZ,
  config           JSONB DEFAULT '{}'::jsonb, -- timezone, morning_hour, evening_hour
  enabled          BOOLEAN DEFAULT false,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_heartbeat_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own heartbeat state"
  ON agent_heartbeat_state FOR ALL
  USING (auth.uid() = user_id);

-- agent_heartbeat_log: Audit trail for heartbeat actions
CREATE TABLE IF NOT EXISTS agent_heartbeat_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,      -- 'morning' | 'evening' | 'weekly' | 'archive' | 'notify'
  result      TEXT NOT NULL,      -- 'success' | 'skipped' | 'error'
  tokens_used INTEGER DEFAULT 0,
  cost_usd    NUMERIC(10,6) DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  error_message TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_heartbeat_log_user    ON agent_heartbeat_log(user_id, created_at DESC);
CREATE INDEX idx_heartbeat_log_action  ON agent_heartbeat_log(user_id, action, created_at DESC);

ALTER TABLE agent_heartbeat_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own heartbeat logs"
  ON agent_heartbeat_log FOR SELECT
  USING (auth.uid() = user_id);

-- Only the service role can INSERT heartbeat logs (edge function uses service key)
CREATE POLICY "Service inserts heartbeat logs"
  ON agent_heartbeat_log FOR INSERT
  WITH CHECK (true);
