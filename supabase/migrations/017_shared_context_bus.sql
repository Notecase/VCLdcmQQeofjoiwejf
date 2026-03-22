-- =============================================================================
-- 017: Shared Context Bus
-- Provides cross-agent context sharing via an append-only logbook
-- and user preference storage (SOUL).
-- =============================================================================

-- user_context_entries: The shared logbook
-- Each agent appends entries when it does something significant.
-- Other agents read recent entries to enrich their prompts.
CREATE TABLE IF NOT EXISTS user_context_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent        TEXT NOT NULL,
  type         TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary      TEXT NOT NULL DEFAULT '',
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ctx_user_type    ON user_context_entries(user_id, type, created_at DESC);
CREATE INDEX idx_ctx_user_created ON user_context_entries(user_id, created_at DESC);

ALTER TABLE user_context_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own context"
  ON user_context_entries FOR ALL
  USING (auth.uid() = user_id);

-- user_soul: User-authored preferences and goals (SOUL.md equivalent)
CREATE TABLE IF NOT EXISTS user_soul (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_soul ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own soul"
  ON user_soul FOR ALL
  USING (auth.uid() = user_id);
