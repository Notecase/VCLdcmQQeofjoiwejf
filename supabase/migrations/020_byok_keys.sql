-- =============================================================================
-- 020: BYOK API Key Management
-- Users bring their own AI provider keys for autonomous agent features.
-- Keys are encrypted at rest via Supabase Vault (pgsodium).
-- =============================================================================

-- user_api_keys: Encrypted storage for BYOK API keys
CREATE TABLE IF NOT EXISTS user_api_keys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('google', 'openai', 'anthropic')),
  encrypted_key    TEXT NOT NULL,
  key_hint         TEXT NOT NULL,       -- last 4 chars for display (e.g. "...xK9m")
  is_valid         BOOLEAN DEFAULT true,
  last_validated_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE INDEX idx_user_api_keys_user ON user_api_keys(user_id);

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own API keys"
  ON user_api_keys FOR ALL
  USING (auth.uid() = user_id);

-- user_ai_preferences: Model preferences for autonomous features
CREATE TABLE IF NOT EXISTS user_ai_preferences (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_provider TEXT NOT NULL DEFAULT 'google',
  preferred_model    TEXT NOT NULL DEFAULT 'gemini-3.1-pro-preview',
  fallback_provider  TEXT,            -- secondary provider if primary fails
  max_daily_cost_usd NUMERIC(10,4) DEFAULT 0.50, -- daily spending cap
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_ai_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own AI preferences"
  ON user_ai_preferences FOR ALL
  USING (auth.uid() = user_id);
