-- Capture tokens for quick inbox captures from mobile devices
-- Users generate tokens to authenticate lightweight POST requests (Apple Shortcuts, PWA)

CREATE TABLE IF NOT EXISTS user_capture_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,           -- SHA-256 hash of the raw token
  token_hint   TEXT NOT NULL,           -- last 4 chars for display
  label        TEXT DEFAULT 'default',  -- user-assigned name ("My iPhone", "Work Mac")
  is_active    BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, token_hash)
);

ALTER TABLE user_capture_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own capture tokens"
  ON user_capture_tokens FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_capture_tokens_hash
  ON user_capture_tokens(token_hash) WHERE is_active = true;
