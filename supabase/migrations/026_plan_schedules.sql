-- Plan Schedules: recurring automations attached to learning plans
-- Used by the Plan Workspace to define daily/weekly automated content generation

CREATE TABLE IF NOT EXISTS plan_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT,
  workflow TEXT NOT NULL CHECK (workflow IN (
    'make_note_from_task', 'research_topic_from_task', 'make_course_from_plan'
  )),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'custom')),
  time TEXT NOT NULL,           -- "HH:MM"
  days TEXT[],                  -- For weekly/custom
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'error')),
  last_run_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plan_schedules_user ON plan_schedules(user_id, plan_id);
CREATE INDEX idx_plan_schedules_due ON plan_schedules(user_id, enabled, next_run_at);

ALTER TABLE plan_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own plan schedules"
  ON plan_schedules FOR ALL
  USING (auth.uid() = user_id);
