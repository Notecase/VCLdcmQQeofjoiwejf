-- ============================================================
-- RESEARCH TABLES — supabase/migrations/012_research.sql
-- ============================================================

-- Research threads (top-level container for a research conversation)
CREATE TABLE IF NOT EXISTS research_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  status TEXT DEFAULT 'idle',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Research messages (individual turns within a thread)
CREATE TABLE IF NOT EXISTS research_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES research_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  subagents JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Research thread state (virtual files + todos snapshot)
CREATE TABLE IF NOT EXISTS research_thread_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID UNIQUE NOT NULL REFERENCES research_threads(id) ON DELETE CASCADE,
  files JSONB DEFAULT '[]',
  todos JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE research_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_thread_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own research threads"
  ON research_threads FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own research messages"
  ON research_messages FOR ALL
  USING (thread_id IN (SELECT id FROM research_threads WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage their own research thread state"
  ON research_thread_state FOR ALL
  USING (thread_id IN (SELECT id FROM research_threads WHERE user_id = auth.uid()));

-- Indexes
CREATE INDEX idx_research_threads_user ON research_threads(user_id);
CREATE INDEX idx_research_threads_updated ON research_threads(user_id, updated_at DESC);
CREATE INDEX idx_research_messages_thread ON research_messages(thread_id);
CREATE INDEX idx_research_thread_state_thread ON research_thread_state(thread_id);
