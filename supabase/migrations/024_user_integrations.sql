-- External integrations (Google Calendar, Notion, Obsidian)
-- Stores OAuth tokens and sync state per user per provider

CREATE TABLE IF NOT EXISTS user_integrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('gcal', 'notion', 'obsidian')),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'error', 'revoked')),
  access_token     TEXT,              -- Encrypted at rest via Supabase
  refresh_token    TEXT,              -- Encrypted at rest
  token_expires_at TIMESTAMPTZ,
  scopes           TEXT[] DEFAULT '{}',
  external_id      TEXT,              -- Google calendar ID, Notion database ID
  config           JSONB DEFAULT '{}', -- Provider-specific: {calendarId, syncToken, ...}
  last_sync_at     TIMESTAMPTZ,
  sync_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own integrations"
  ON user_integrations FOR ALL USING (auth.uid() = user_id);
