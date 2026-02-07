-- =============================================
-- Migration 008: Artifacts Storage
-- Persists AI-generated artifacts (HTML/CSS/JS) for later retrieval
-- Author: Inkdown AI MVP
-- =============================================

-- =============================================
-- SECTION 1: Artifacts Table
-- Store AI-generated artifacts with content and metadata
-- =============================================

CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Context references (all optional)
  note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,

  -- Artifact content
  title TEXT NOT NULL DEFAULT 'Untitled Artifact',
  html TEXT NOT NULL DEFAULT '',
  css TEXT NOT NULL DEFAULT '',
  javascript TEXT NOT NULL DEFAULT '',

  -- Status tracking
  -- 'created': Just generated, not yet associated with insertion
  -- 'pending': Waiting to be inserted into a note
  -- 'inserted': Successfully inserted into a note
  -- 'archived': User removed from note but kept for history
  status TEXT DEFAULT 'pending' CHECK (status IN ('created', 'pending', 'inserted', 'archived')),

  -- Flexible metadata storage
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_at TIMESTAMPTZ  -- When artifact was inserted into a note
);

-- =============================================
-- SECTION 2: Indexes
-- =============================================

-- User's artifacts, sorted by most recent
CREATE INDEX IF NOT EXISTS idx_artifacts_user
  ON artifacts(user_id, updated_at DESC);

-- Artifacts for a specific note
CREATE INDEX IF NOT EXISTS idx_artifacts_note
  ON artifacts(note_id)
  WHERE note_id IS NOT NULL;

-- Artifacts for a specific session
CREATE INDEX IF NOT EXISTS idx_artifacts_session
  ON artifacts(session_id)
  WHERE session_id IS NOT NULL;

-- Pending artifacts for a user (for loading on app init)
CREATE INDEX IF NOT EXISTS idx_artifacts_pending
  ON artifacts(user_id, status, created_at DESC)
  WHERE status = 'pending';

-- =============================================
-- SECTION 3: Row Level Security
-- =============================================

ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_artifacts" ON artifacts;
CREATE POLICY "own_artifacts" ON artifacts
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- SECTION 4: Updated At Trigger
-- =============================================

DROP TRIGGER IF EXISTS artifacts_updated ON artifacts;
CREATE TRIGGER artifacts_updated
  BEFORE UPDATE ON artifacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- SECTION 5: Comments for Documentation
-- =============================================

COMMENT ON TABLE artifacts IS 'AI-generated artifacts (HTML/CSS/JS) that persist across sessions';
COMMENT ON COLUMN artifacts.status IS 'Lifecycle: created -> pending -> inserted or archived';
COMMENT ON COLUMN artifacts.inserted_at IS 'Timestamp when artifact was inserted into a note';

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
