-- =============================================
-- Inkdown Database Schema v1.0
-- Migration: 001_initial_schema
-- =============================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================
-- PROJECTS TABLE
-- =============================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  parent_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL DEFAULT '',
  depth INTEGER NOT NULL DEFAULT 0,
  
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '📁',
  color TEXT DEFAULT '#6366f1',
  
  note_count INTEGER DEFAULT 0,
  subproject_count INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  
  is_archived BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT max_project_depth CHECK (depth <= 5),
  CONSTRAINT no_project_self_parent CHECK (parent_id != id)
);

CREATE INDEX idx_projects_user_active ON projects(user_id, updated_at DESC) 
  WHERE is_deleted = FALSE;
CREATE INDEX idx_projects_parent ON projects(parent_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_projects_path ON projects(user_id, path text_pattern_ops);

-- =============================================
-- NOTES TABLE
-- =============================================
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  parent_note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  path TEXT NOT NULL DEFAULT '',
  depth INTEGER NOT NULL DEFAULT 0,
  
  title TEXT NOT NULL DEFAULT 'Untitled',
  content TEXT NOT NULL DEFAULT '',
  content_hash TEXT,
  
  word_count INTEGER DEFAULT 0,
  character_count INTEGER DEFAULT 0,
  attachment_count INTEGER DEFAULT 0,
  
  editor_state JSONB DEFAULT '{}',
  
  sort_order INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  version INTEGER DEFAULT 1,
  
  CONSTRAINT max_note_depth CHECK (depth <= 10),
  CONSTRAINT no_note_self_parent CHECK (parent_note_id != id)
);

CREATE INDEX idx_notes_user_project ON notes(user_id, project_id, updated_at DESC)
  WHERE is_deleted = FALSE;
CREATE INDEX idx_notes_general ON notes(user_id, updated_at DESC)
  WHERE project_id IS NULL AND parent_note_id IS NULL AND is_deleted = FALSE;
CREATE INDEX idx_notes_children ON notes(parent_note_id, sort_order)
  WHERE is_deleted = FALSE;
CREATE INDEX idx_notes_path ON notes(user_id, path text_pattern_ops);
CREATE INDEX idx_notes_fts ON notes USING gin(
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
) WHERE is_deleted = FALSE;

-- =============================================
-- ATTACHMENTS TABLE
-- =============================================
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
  
  bucket TEXT NOT NULL DEFAULT 'attachments',
  storage_path TEXT NOT NULL,
  
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  
  width INTEGER,
  height INTEGER,
  page_count INTEGER,
  
  processing_status TEXT DEFAULT 'pending',
  extracted_text TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attachments_note ON attachments(note_id);
CREATE INDEX idx_attachments_user ON attachments(user_id);
CREATE INDEX idx_attachments_status ON attachments(processing_status) 
  WHERE processing_status != 'completed';

-- =============================================
-- EMBEDDINGS TABLE (1536 dims - reduced from 3072 for Supabase index limit)
-- text-embedding-3-large supports dimension reduction via API parameter
-- =============================================
CREATE TABLE note_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  attachment_id UUID REFERENCES attachments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  chunk_index INTEGER NOT NULL DEFAULT 0,
  chunk_text TEXT NOT NULL,
  chunk_start INTEGER NOT NULL,
  chunk_end INTEGER NOT NULL,
  
  embedding vector(1536) NOT NULL,
  
  model TEXT NOT NULL DEFAULT 'text-embedding-3-large',
  token_count INTEGER,
  content_hash TEXT NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT embedding_source_required CHECK (note_id IS NOT NULL OR attachment_id IS NOT NULL)
);

-- HNSW index for vector similarity search (works with 1536 dims)
CREATE INDEX idx_embeddings_hnsw ON note_embeddings 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_embeddings_note ON note_embeddings(note_id);
CREATE INDEX idx_embeddings_attachment ON note_embeddings(attachment_id);

-- =============================================
-- USER TABLES
-- =============================================
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  plan TEXT DEFAULT 'free',
  plan_expires_at TIMESTAMPTZ,
  notes_count INTEGER DEFAULT 0,
  storage_used_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'one-dark',
  settings JSONB DEFAULT '{"fontSize": 16, "autoSave": true, "autoSaveDelay": 3000}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Project path management
CREATE OR REPLACE FUNCTION update_project_path()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path := NEW.id::TEXT;
    NEW.depth := 0;
  ELSE
    SELECT path || '/' || NEW.id::TEXT, depth + 1
    INTO NEW.path, NEW.depth
    FROM projects WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note path management
CREATE OR REPLACE FUNCTION update_note_path()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_note_id IS NULL THEN
    NEW.path := NEW.id::TEXT;
    NEW.depth := 0;
  ELSE
    SELECT path || '/' || NEW.id::TEXT, depth + 1
    INTO NEW.path, NEW.depth
    FROM notes WHERE id = NEW.parent_note_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Move note function
CREATE OR REPLACE FUNCTION move_note(
  p_note_id UUID,
  p_new_project_id UUID DEFAULT NULL,
  p_new_parent_note_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id FROM notes WHERE id = p_note_id;
  
  IF p_new_parent_note_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM notes 
      WHERE id = p_new_parent_note_id 
      AND path LIKE '%' || p_note_id::TEXT || '%'
    ) THEN
      RAISE EXCEPTION 'Cannot move note to its own descendant';
    END IF;
  END IF;
  
  UPDATE notes SET
    project_id = p_new_project_id,
    parent_note_id = p_new_parent_note_id,
    updated_at = NOW()
  WHERE id = p_note_id;
  
  WITH RECURSIVE descendants AS (
    SELECT id FROM notes WHERE parent_note_id = p_note_id
    UNION ALL
    SELECT n.id FROM notes n JOIN descendants d ON n.parent_note_id = d.id
  )
  UPDATE notes SET project_id = p_new_project_id, updated_at = NOW()
  WHERE id IN (SELECT id FROM descendants);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- New user handler
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', 'User'));
  INSERT INTO user_preferences (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Semantic search
CREATE OR REPLACE FUNCTION search_semantic(
  p_user_id UUID,
  p_embedding vector(1536),
  p_limit INTEGER DEFAULT 10,
  p_project_id UUID DEFAULT NULL,
  p_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  note_id UUID,
  attachment_id UUID,
  title TEXT,
  chunk_text TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.note_id,
    e.attachment_id,
    COALESCE(n.title, a.filename) as title,
    e.chunk_text,
    1 - (e.embedding <=> p_embedding) as similarity
  FROM note_embeddings e
  LEFT JOIN notes n ON e.note_id = n.id
  LEFT JOIN attachments a ON e.attachment_id = a.id
  WHERE e.user_id = p_user_id
    AND (n.is_deleted = FALSE OR n.id IS NULL)
    AND (p_project_id IS NULL OR n.project_id = p_project_id)
    AND 1 - (e.embedding <=> p_embedding) >= p_threshold
  ORDER BY e.embedding <=> p_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- TRIGGERS
-- =============================================
CREATE TRIGGER tr_notes_updated BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_projects_updated BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_profiles_updated BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_prefs_updated BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  
CREATE TRIGGER tr_project_path BEFORE INSERT OR UPDATE OF parent_id ON projects
  FOR EACH ROW EXECUTE FUNCTION update_project_path();
CREATE TRIGGER tr_note_path BEFORE INSERT OR UPDATE OF parent_note_id ON notes
  FOR EACH ROW EXECUTE FUNCTION update_note_path();

CREATE TRIGGER on_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_projects" ON projects FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_notes" ON notes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_attachments" ON attachments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_embeddings" ON note_embeddings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_profile" ON user_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_prefs" ON user_preferences FOR ALL USING (auth.uid() = user_id);
