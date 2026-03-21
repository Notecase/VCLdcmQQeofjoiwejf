-- =============================================================================
-- 018: Mission Hub core tables
-- Deterministic cross-agent mission orchestration state.
-- =============================================================================

CREATE TABLE IF NOT EXISTS missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'suggest_approve'
    CHECK (mode IN ('suggest_approve', 'guardrailed_auto', 'full_auto')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'awaiting_approval', 'blocked', 'completed', 'error', 'cancelled')),
  current_stage TEXT
    CHECK (current_stage IN ('research', 'course_draft', 'daily_plan', 'note_pack')),
  constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mission_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('research', 'course_draft', 'daily_plan', 'note_pack')),
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'in_progress', 'completed', 'blocked', 'error')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  input_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mission_id, stage)
);

CREATE TABLE IF NOT EXISTS mission_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  step_id UUID REFERENCES mission_steps(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('research_brief', 'course_outline', 'daily_plan_patch', 'note_draft_set')),
  summary TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mission_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  step_id UUID REFERENCES mission_steps(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_level TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  expires_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mission_run_locks (
  mission_id UUID PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE,
  lock_token TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_missions_user ON missions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_missions_user_status ON missions(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_steps_mission ON mission_steps(mission_id, stage);
CREATE INDEX IF NOT EXISTS idx_mission_handoffs_mission ON mission_handoffs(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_approvals_mission ON mission_approvals(mission_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_locks_expiry ON mission_run_locks(expires_at);

ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_run_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own missions"
  ON missions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage own mission steps"
  ON mission_steps FOR ALL
  USING (mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own mission handoffs"
  ON mission_handoffs FOR ALL
  USING (mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own mission approvals"
  ON mission_approvals FOR ALL
  USING (mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own mission run locks"
  ON mission_run_locks FOR ALL
  USING (mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid()));
