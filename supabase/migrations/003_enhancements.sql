-- =============================================
-- Migration 003: Enhancements
-- Adds missing columns and improves existing schema
-- =============================================

-- =============================================
-- STEP 1: Add Missing Columns to Projects
-- =============================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;

-- =============================================
-- STEP 2: Add Missing Columns to Notes
-- =============================================

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS reading_time_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS link_count INTEGER DEFAULT 0;

-- =============================================
-- STEP 3: Add Missing Columns to Attachments
-- =============================================

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS original_filename TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS extracted_metadata JSONB,
  ADD COLUMN IF NOT EXISTS processing_error TEXT,
  ADD COLUMN IF NOT EXISTS file_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Backfill original_filename from filename
UPDATE attachments
SET original_filename = filename
WHERE original_filename IS NULL;

-- =============================================
-- STEP 4: Create Attachment Embeddings Table
-- (Separate from note_embeddings for better organization)
-- =============================================

CREATE TABLE IF NOT EXISTS attachment_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id UUID NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  chunk_index INTEGER NOT NULL DEFAULT 0,
  chunk_text TEXT NOT NULL,
  chunk_start INTEGER NOT NULL,
  chunk_end INTEGER NOT NULL,
  page_number INTEGER,

  embedding vector(1536) NOT NULL,

  model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  token_count INTEGER,
  content_hash TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_attachment_chunk UNIQUE (attachment_id, chunk_index)
);

-- Indexes for attachment_embeddings
CREATE INDEX IF NOT EXISTS idx_attachment_embeddings_attachment
  ON attachment_embeddings(attachment_id);

CREATE INDEX IF NOT EXISTS idx_attachment_embeddings_user
  ON attachment_embeddings(user_id);

-- HNSW index for vector search
CREATE INDEX IF NOT EXISTS idx_attachment_embeddings_vector
  ON attachment_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RLS for attachment_embeddings
ALTER TABLE attachment_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_attachment_embeddings" ON attachment_embeddings;
CREATE POLICY "own_attachment_embeddings" ON attachment_embeddings
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- STEP 5: Additional Indexes for Performance
-- =============================================

-- Notes favorites index
CREATE INDEX IF NOT EXISTS idx_notes_favorites
  ON notes(user_id, updated_at DESC)
  WHERE is_favorite = TRUE AND is_deleted = FALSE;

-- Notes recent views index
CREATE INDEX IF NOT EXISTS idx_notes_recent
  ON notes(user_id, last_viewed_at DESC NULLS LAST)
  WHERE is_deleted = FALSE;

-- Notes tags index (GIN for array search)
CREATE INDEX IF NOT EXISTS idx_notes_tags
  ON notes USING gin(tags)
  WHERE is_deleted = FALSE;

-- Projects favorites index
CREATE INDEX IF NOT EXISTS idx_projects_favorites
  ON projects(user_id, updated_at DESC)
  WHERE is_favorite = TRUE AND is_deleted = FALSE;

-- Attachments deleted index
CREATE INDEX IF NOT EXISTS idx_attachments_deleted
  ON attachments(user_id, deleted_at)
  WHERE is_deleted = TRUE;

-- =============================================
-- STEP 6: Improve Existing Functions
-- =============================================

-- Drop and recreate move_note with better validation
DROP FUNCTION IF EXISTS move_note(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION move_note(
  p_note_id UUID,
  p_new_project_id UUID DEFAULT NULL,
  p_new_parent_note_id UUID DEFAULT NULL,
  p_new_sort_order INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  current_user_id UUID;
BEGIN
  -- Get current user
  current_user_id := auth.uid();

  -- Validation: User must own the note
  IF NOT EXISTS (
    SELECT 1 FROM notes WHERE id = p_note_id AND user_id = current_user_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Note not found or access denied'
    );
  END IF;

  -- Validation: Can't be both in project and have parent note simultaneously
  IF p_new_project_id IS NOT NULL AND p_new_parent_note_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Note cannot be in project and have parent note simultaneously'
    );
  END IF;

  -- Validation: Check for circular reference
  IF p_new_parent_note_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM notes
      WHERE id = p_new_parent_note_id
        AND (
          path LIKE (SELECT path || '%' FROM notes WHERE id = p_note_id)
          OR id = p_note_id
        )
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Circular reference detected: cannot move note to its own descendant'
      );
    END IF;

    -- Check parent exists and user owns it
    IF NOT EXISTS (
      SELECT 1 FROM notes WHERE id = p_new_parent_note_id AND user_id = current_user_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Parent note not found or access denied'
      );
    END IF;
  END IF;

  -- Validation: Check project ownership
  IF p_new_project_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM projects WHERE id = p_new_project_id AND user_id = current_user_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Project not found or access denied'
      );
    END IF;
  END IF;

  -- Perform the move
  UPDATE notes
  SET
    project_id = p_new_project_id,
    parent_note_id = p_new_parent_note_id,
    sort_order = COALESCE(p_new_sort_order, sort_order),
    updated_at = NOW()
  WHERE id = p_note_id;

  -- Update descendants' project_id if needed
  IF p_new_project_id IS NOT NULL THEN
    WITH RECURSIVE descendants AS (
      SELECT id FROM notes WHERE parent_note_id = p_note_id
      UNION ALL
      SELECT n.id FROM notes n JOIN descendants d ON n.parent_note_id = d.id
    )
    UPDATE notes
    SET project_id = p_new_project_id, updated_at = NOW()
    WHERE id IN (SELECT id FROM descendants);
  END IF;

  -- Return success with updated note
  SELECT jsonb_build_object(
    'success', true,
    'note', row_to_json(n.*)
  )
  INTO result
  FROM notes n
  WHERE n.id = p_note_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create move_project function if it doesn't exist
CREATE OR REPLACE FUNCTION move_project(
  p_project_id UUID,
  p_new_parent_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();

  -- Validation: User must own the project
  IF NOT EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id AND user_id = current_user_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Project not found or access denied'
    );
  END IF;

  -- Validation: Check for circular reference
  IF p_new_parent_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM projects
      WHERE id = p_new_parent_id
        AND (
          path LIKE (SELECT path || '%' FROM projects WHERE id = p_project_id)
          OR id = p_project_id
        )
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Circular reference detected: cannot move project to its own descendant'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM projects WHERE id = p_new_parent_id AND user_id = current_user_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Parent project not found or access denied'
      );
    END IF;
  END IF;

  -- Perform the move
  UPDATE projects
  SET
    parent_id = p_new_parent_id,
    updated_at = NOW()
  WHERE id = p_project_id;

  -- Return success
  SELECT jsonb_build_object(
    'success', true,
    'project', row_to_json(p.*)
  )
  INTO result
  FROM projects p
  WHERE p.id = p_project_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- STEP 7: Add Search Functions
-- =============================================

-- Function: Search notes by semantic similarity
CREATE OR REPLACE FUNCTION search_notes_semantic(
  p_user_id UUID,
  p_query_embedding vector(1536),
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  note_id UUID,
  title TEXT,
  chunk_text TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ne.note_id,
    n.title,
    ne.chunk_text,
    (1 - (ne.embedding <=> p_query_embedding))::FLOAT AS similarity
  FROM note_embeddings ne
  JOIN notes n ON ne.note_id = n.id
  WHERE ne.user_id = p_user_id
    AND (1 - (ne.embedding <=> p_query_embedding)) > p_match_threshold
    AND n.is_deleted = FALSE
  ORDER BY ne.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Search attachments by semantic similarity
CREATE OR REPLACE FUNCTION search_attachments_semantic(
  p_user_id UUID,
  p_query_embedding vector(1536),
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  attachment_id UUID,
  filename TEXT,
  chunk_text TEXT,
  page_number INTEGER,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ae.attachment_id,
    a.filename,
    ae.chunk_text,
    ae.page_number,
    (1 - (ae.embedding <=> p_query_embedding))::FLOAT AS similarity
  FROM attachment_embeddings ae
  JOIN attachments a ON ae.attachment_id = a.id
  WHERE ae.user_id = p_user_id
    AND (1 - (ae.embedding <=> p_query_embedding)) > p_match_threshold
    AND a.is_deleted = FALSE
  ORDER BY ae.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Hybrid search (keyword + semantic)
CREATE OR REPLACE FUNCTION search_notes_hybrid(
  p_user_id UUID,
  p_query TEXT,
  p_query_embedding vector(1536),
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  snippet TEXT,
  keyword_score FLOAT,
  semantic_score FLOAT,
  combined_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH keyword_results AS (
    SELECT
      n.id,
      ts_rank(
        to_tsvector('english', n.title || ' ' || n.content),
        plainto_tsquery('english', p_query)
      )::FLOAT AS score,
      ts_headline(
        'english',
        n.content,
        plainto_tsquery('english', p_query),
        'MaxWords=30, MinWords=15'
      ) AS snippet
    FROM notes n
    WHERE n.user_id = p_user_id
      AND n.is_deleted = FALSE
      AND to_tsvector('english', n.title || ' ' || n.content) @@ plainto_tsquery('english', p_query)
  ),
  semantic_results AS (
    SELECT
      ne.note_id AS id,
      MAX(1 - (ne.embedding <=> p_query_embedding))::FLOAT AS score,
      MAX(ne.chunk_text) AS snippet
    FROM note_embeddings ne
    WHERE ne.user_id = p_user_id
    GROUP BY ne.note_id
    ORDER BY MAX(ne.embedding <=> p_query_embedding)
    LIMIT 20
  )
  SELECT
    n.id,
    n.title,
    COALESCE(k.snippet, s.snippet, left(n.content, 150))::TEXT AS snippet,
    COALESCE(k.score, 0)::FLOAT AS keyword_score,
    COALESCE(s.score, 0)::FLOAT AS semantic_score,
    (COALESCE(k.score, 0) * 0.4 + COALESCE(s.score, 0) * 0.6)::FLOAT AS combined_score
  FROM notes n
  LEFT JOIN keyword_results k ON n.id = k.id
  LEFT JOIN semantic_results s ON n.id = s.id
  WHERE (k.id IS NOT NULL OR s.id IS NOT NULL)
    AND n.user_id = p_user_id
    AND n.is_deleted = FALSE
  ORDER BY (COALESCE(k.score, 0) * 0.4 + COALESCE(s.score, 0) * 0.6) DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================
-- STEP 8: Add Version Increment Triggers
-- =============================================

-- Automatic version increment trigger for notes
CREATE OR REPLACE FUNCTION increment_note_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Only increment version on content or title updates
  IF NEW.content IS DISTINCT FROM OLD.content OR
     NEW.title IS DISTINCT FROM OLD.title THEN
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_auto_increment_version ON notes;
CREATE TRIGGER notes_auto_increment_version
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION increment_note_version();

-- Automatic version increment trigger for projects
CREATE OR REPLACE FUNCTION increment_project_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name OR
     NEW.description IS DISTINCT FROM OLD.description THEN
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add version column to projects if not exists
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

DROP TRIGGER IF EXISTS projects_auto_increment_version ON projects;
CREATE TRIGGER projects_auto_increment_version
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION increment_project_version();

-- =============================================
-- STEP 9: Add Triggers for Note Metadata
-- =============================================

-- Trigger to update note metadata
CREATE OR REPLACE FUNCTION update_note_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- Update word count
  NEW.word_count := array_length(regexp_split_to_array(NEW.content, '\s+'), 1);

  -- Update character count
  NEW.character_count := length(NEW.content);

  -- Update reading time (average 200 words per minute)
  NEW.reading_time_minutes := GREATEST(1, CEIL(NEW.word_count::float / 200));

  -- Update content hash
  NEW.content_hash := encode(digest(NEW.content, 'sha256'), 'hex');

  -- Update link count (count [[wikilinks]])
  NEW.link_count := (
    SELECT COUNT(*)
    FROM regexp_matches(NEW.content, '\[\[([^\]]+)\]\]', 'g')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_note_metadata ON notes;
CREATE TRIGGER tr_note_metadata
  BEFORE INSERT OR UPDATE OF content ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_note_metadata();

-- =============================================
-- STEP 10: Grant Permissions
-- =============================================

GRANT EXECUTE ON FUNCTION move_note TO authenticated;
GRANT EXECUTE ON FUNCTION move_project TO authenticated;
GRANT EXECUTE ON FUNCTION search_notes_semantic TO authenticated;
GRANT EXECUTE ON FUNCTION search_attachments_semantic TO authenticated;
GRANT EXECUTE ON FUNCTION search_notes_hybrid TO authenticated;

-- =============================================
-- COMPLETE
-- =============================================
