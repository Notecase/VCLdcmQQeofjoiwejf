-- Create sources table
CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('pdf', 'link', 'file', 'text', 'youtube')),
  original_url TEXT,
  original_filename TEXT,
  content TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
  error TEXT,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create source_chunks table
CREATE TABLE IF NOT EXISTS source_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI embeddings dimension
  page_number INTEGER,
  position INTEGER NOT NULL,
  metadata JSONB
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sources_note_id ON sources(note_id);
CREATE INDEX IF NOT EXISTS idx_sources_user_id ON sources(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
CREATE INDEX IF NOT EXISTS idx_source_chunks_source_id ON source_chunks(source_id);

-- Enable RLS
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_chunks ENABLE ROW LEVEL SECURITY;

-- RLS policies for sources
CREATE POLICY "Users can view their own sources" ON sources
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sources" ON sources
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sources" ON sources
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sources" ON sources
  FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for source_chunks (based on parent source ownership)
CREATE POLICY "Users can view chunks of their sources" ON source_chunks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sources WHERE sources.id = source_chunks.source_id AND sources.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert chunks for their sources" ON source_chunks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sources WHERE sources.id = source_chunks.source_id AND sources.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update chunks of their sources" ON source_chunks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM sources WHERE sources.id = source_chunks.source_id AND sources.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete chunks of their sources" ON source_chunks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM sources WHERE sources.id = source_chunks.source_id AND sources.user_id = auth.uid()
    )
  );

-- Optional: Create function for semantic search (requires pgvector extension)
-- Run this only if you have pgvector enabled:
/*
CREATE OR REPLACE FUNCTION match_source_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_note_id uuid DEFAULT NULL,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source_id uuid,
  content text,
  page_number int,
  position int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.id,
    sc.source_id,
    sc.content,
    sc.page_number,
    sc.position,
    1 - (sc.embedding <=> query_embedding) AS similarity
  FROM source_chunks sc
  JOIN sources s ON s.id = sc.source_id
  WHERE
    sc.embedding IS NOT NULL
    AND (filter_user_id IS NULL OR s.user_id = filter_user_id)
    AND (filter_note_id IS NULL OR s.note_id = filter_note_id)
    AND 1 - (sc.embedding <=> query_embedding) > match_threshold
  ORDER BY sc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
*/
