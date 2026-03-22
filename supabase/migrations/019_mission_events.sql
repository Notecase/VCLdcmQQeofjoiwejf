-- =============================================================================
-- 019: Mission events (durable timeline + replay continuity)
-- Adds append-only event log and per-mission sequence counters.
-- =============================================================================

CREATE TABLE IF NOT EXISTS mission_event_counters (
  mission_id UUID PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE,
  last_seq BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  step_id UUID REFERENCES mission_steps(id) ON DELETE SET NULL,
  seq BIGINT NOT NULL,
  type TEXT NOT NULL CHECK (
    type IN (
      'mission-start',
      'step-start',
      'handoff-created',
      'approval-required',
      'approval-resolved',
      'step-complete',
      'mission-complete',
      'mission-error'
    )
  ),
  agent TEXT NOT NULL CHECK (
    agent IN ('mission-orchestrator', 'research', 'course', 'secretary', 'editor', 'system')
  ),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mission_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_mission_events_mission_seq ON mission_events(mission_id, seq);
CREATE INDEX IF NOT EXISTS idx_mission_events_mission_ts ON mission_events(mission_id, ts DESC);

ALTER TABLE mission_event_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own mission event counters"
  ON mission_event_counters FOR ALL
  USING (mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own mission events"
  ON mission_events FOR ALL
  USING (mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION next_mission_event_seq(p_mission_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_next BIGINT;
BEGIN
  INSERT INTO mission_event_counters (mission_id, last_seq)
  VALUES (p_mission_id, 1)
  ON CONFLICT (mission_id)
  DO UPDATE SET last_seq = mission_event_counters.last_seq + 1
  RETURNING last_seq INTO v_next;

  RETURN v_next;
END;
$$;
