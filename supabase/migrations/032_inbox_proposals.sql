-- Inbox Proposals: AI-categorized items from messaging channels, shortcuts, etc.
-- Items flow: pending (raw capture) → categorized (AI) → approved/rejected (user) → applied

CREATE TABLE IF NOT EXISTS inbox_proposals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source           TEXT NOT NULL DEFAULT 'manual',  -- 'telegram', 'discord', 'whatsapp', 'shortcut', 'web'
  raw_text         TEXT NOT NULL,
  category         TEXT,            -- 'task', 'vocabulary', 'calendar', 'note', 'reading', 'thought'
  target_file      TEXT,            -- 'Today.md', 'Vocabulary.md', etc.
  proposed_content TEXT,            -- Formatted content to insert
  confidence       REAL DEFAULT 0,  -- AI confidence 0-1
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  batch_id         UUID,            -- Groups items categorized together
  metadata         JSONB DEFAULT '{}',  -- { detectedTime, tags, links }
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inbox_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own proposals"
  ON inbox_proposals FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_proposals_pending
  ON inbox_proposals(user_id, status) WHERE status = 'pending';
