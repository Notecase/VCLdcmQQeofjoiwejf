-- =============================================
-- Migration 007: Note Learning Resources
-- Attached learning resources for notes (flashcards, mindmaps, Q&A, etc.)
-- Keeps AI-generated content separate from note content
-- =============================================

-- =============================================
-- SECTION 1: Learning Resources Table
-- AI-generated learning materials attached to notes
-- =============================================

CREATE TABLE IF NOT EXISTS note_learning_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Resource type
  type TEXT NOT NULL CHECK (type IN (
    'flashcards',     -- { cards: [{ question, answer }] }
    'mindmap',        -- { center, nodes: [...] }
    'key_terms',      -- { terms: [{ term, definition, source }] }
    'qa',             -- { questions: [{ question, answer, source }] }
    'summary',        -- { content, keyPoints: [] }
    'exercises',      -- { exercises: [{ title, description, difficulty }] }
    'resources',      -- { resources: [{ type, title, url }] }
    'study_note',     -- { content }
    'timeline',       -- { events: [{ date, event, source }] }
    'comparison'      -- { agreements, differences }
  )),

  -- The actual resource data (JSON)
  data JSONB NOT NULL,

  -- Metadata
  item_count INTEGER DEFAULT 0,    -- Number of cards/questions/terms/etc.
  source_content_hash TEXT,        -- Hash of note content when generated

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One resource per type per note (regenerating replaces existing)
CREATE UNIQUE INDEX IF NOT EXISTS idx_note_resources_unique
  ON note_learning_resources(note_id, type);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_note_resources_user
  ON note_learning_resources(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_resources_note
  ON note_learning_resources(note_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_resources_type
  ON note_learning_resources(user_id, type);

-- =============================================
-- SECTION 2: Row Level Security
-- =============================================

ALTER TABLE note_learning_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_learning_resources" ON note_learning_resources;
CREATE POLICY "own_learning_resources" ON note_learning_resources
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- SECTION 3: Triggers
-- =============================================

-- Updated at trigger
DROP TRIGGER IF EXISTS learning_resources_updated ON note_learning_resources;
CREATE TRIGGER learning_resources_updated
  BEFORE UPDATE ON note_learning_resources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- SECTION 4: Helper Functions
-- =============================================

-- Get all resources for a note
CREATE OR REPLACE FUNCTION get_note_learning_resources(
  p_user_id UUID,
  p_note_id UUID
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  data JSONB,
  item_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.type,
    r.data,
    r.item_count,
    r.created_at,
    r.updated_at
  FROM note_learning_resources r
  WHERE r.user_id = p_user_id
    AND r.note_id = p_note_id
  ORDER BY r.updated_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Save/update a learning resource (upsert)
CREATE OR REPLACE FUNCTION save_learning_resource(
  p_user_id UUID,
  p_note_id UUID,
  p_type TEXT,
  p_data JSONB,
  p_item_count INTEGER DEFAULT 0,
  p_content_hash TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO note_learning_resources (user_id, note_id, type, data, item_count, source_content_hash)
  VALUES (p_user_id, p_note_id, p_type, p_data, p_item_count, p_content_hash)
  ON CONFLICT (note_id, type)
  DO UPDATE SET
    data = EXCLUDED.data,
    item_count = EXCLUDED.item_count,
    source_content_hash = EXCLUDED.source_content_hash,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get a specific resource by type
CREATE OR REPLACE FUNCTION get_learning_resource(
  p_user_id UUID,
  p_note_id UUID,
  p_type TEXT
)
RETURNS TABLE (
  id UUID,
  data JSONB,
  item_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.data,
    r.item_count,
    r.created_at,
    r.updated_at
  FROM note_learning_resources r
  WHERE r.user_id = p_user_id
    AND r.note_id = p_note_id
    AND r.type = p_type;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Delete a learning resource
CREATE OR REPLACE FUNCTION delete_learning_resource(
  p_user_id UUID,
  p_resource_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_deleted BOOLEAN;
BEGIN
  DELETE FROM note_learning_resources
  WHERE id = p_resource_id AND user_id = p_user_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Count resources for a note
CREATE OR REPLACE FUNCTION count_note_resources(
  p_user_id UUID,
  p_note_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM note_learning_resources
  WHERE user_id = p_user_id AND note_id = p_note_id;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================
-- SECTION 5: Grant Permissions
-- =============================================

GRANT EXECUTE ON FUNCTION get_note_learning_resources TO authenticated;
GRANT EXECUTE ON FUNCTION save_learning_resource TO authenticated;
GRANT EXECUTE ON FUNCTION get_learning_resource TO authenticated;
GRANT EXECUTE ON FUNCTION delete_learning_resource TO authenticated;
GRANT EXECUTE ON FUNCTION count_note_resources TO authenticated;

-- =============================================
-- SECTION 6: Comments
-- =============================================

COMMENT ON TABLE note_learning_resources IS 'AI-generated learning resources attached to notes (flashcards, mindmaps, Q&A, etc.)';
COMMENT ON COLUMN note_learning_resources.type IS 'Type of learning resource (flashcards, mindmap, key_terms, qa, summary, exercises, resources, study_note, timeline, comparison)';
COMMENT ON COLUMN note_learning_resources.data IS 'JSONB data containing the resource content, structure varies by type';
COMMENT ON COLUMN note_learning_resources.item_count IS 'Number of items in the resource (cards, questions, terms, etc.)';
COMMENT ON COLUMN note_learning_resources.source_content_hash IS 'Hash of note content when resource was generated, for staleness detection';

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
