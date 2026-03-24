-- Channel Links: pairing-based account linking for messaging platforms
-- (Telegram, Discord, WhatsApp). Separate from OAuth-based user_integrations.

CREATE TABLE IF NOT EXISTS user_channel_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel           TEXT NOT NULL CHECK (channel IN ('telegram', 'discord', 'whatsapp')),
  external_id       TEXT NOT NULL,          -- Telegram chat_id, Discord user_id, etc.
  display_name      TEXT,                    -- "@username" or display name
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'revoked')),
  pairing_code      TEXT,                    -- 6-digit code for linking
  pairing_expires_at TIMESTAMPTZ,
  config            JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(channel, external_id),
  UNIQUE(user_id, channel)
);

ALTER TABLE user_channel_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own channel links"
  ON user_channel_links FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_channel_links_lookup
  ON user_channel_links(channel, external_id) WHERE status = 'active';
CREATE INDEX idx_channel_links_pairing
  ON user_channel_links(pairing_code) WHERE status = 'pending';
