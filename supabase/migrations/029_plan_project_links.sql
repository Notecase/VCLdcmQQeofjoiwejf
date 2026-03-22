-- Plan-Project Links: Maps secretary plans (text IDs) to editor projects (UUIDs).
-- Each plan gets an auto-created folder in the note editor sidebar.

CREATE TABLE IF NOT EXISTS plan_project_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id    TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, plan_id)
);

CREATE INDEX idx_plan_project_user    ON plan_project_links(user_id, plan_id);
CREATE INDEX idx_plan_project_project ON plan_project_links(project_id);

ALTER TABLE plan_project_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own plan-project links"
  ON plan_project_links FOR ALL USING (auth.uid() = user_id);
