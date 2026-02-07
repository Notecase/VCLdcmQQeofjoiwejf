-- Secretary Memory Files
CREATE TABLE IF NOT EXISTS secretary_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,                    -- 'Plan.md', 'AI.md', 'Today.md', 'Tomorrow.md', 'Plans/optics.md'
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, filename)
);

-- Secretary Chat Threads (for conversation continuity)
CREATE TABLE IF NOT EXISTS secretary_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,                   -- LangGraph thread ID
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, thread_id)
);

-- Row Level Security
ALTER TABLE secretary_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE secretary_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own memory files"
  ON secretary_memory FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own threads"
  ON secretary_threads FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_secretary_memory_user ON secretary_memory(user_id);
CREATE INDEX idx_secretary_memory_filename ON secretary_memory(user_id, filename);
CREATE INDEX idx_secretary_threads_user ON secretary_threads(user_id);
