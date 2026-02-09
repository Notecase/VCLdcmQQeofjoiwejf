-- ============================================================
-- EDITOR DEEP AGENT TABLES — supabase/migrations/015_editor_deep_agent.sql
-- ============================================================

-- Editor threads (one row per conversation thread in normal editor AI)
CREATE TABLE IF NOT EXISTS editor_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  runtime TEXT NOT NULL DEFAULT 'editor-deep',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Editor messages (user/assistant turns for each thread)
CREATE TABLE IF NOT EXISTS editor_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES editor_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL DEFAULT '',
  tool_calls JSONB,
  tool_results JSONB,
  runtime TEXT NOT NULL DEFAULT 'editor-deep',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Editor thread state (deep-agent run state + editor context snapshot)
CREATE TABLE IF NOT EXISTS editor_thread_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID UNIQUE NOT NULL REFERENCES editor_threads(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  editor_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Editor long-term memory (key/value facts and preferences)
CREATE TABLE IF NOT EXISTS editor_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  memory_type TEXT NOT NULL DEFAULT 'preference',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, key)
);

-- Row Level Security
ALTER TABLE editor_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE editor_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE editor_thread_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE editor_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own editor threads"
  ON editor_threads FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own editor messages"
  ON editor_messages FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own editor thread state"
  ON editor_thread_state FOR ALL
  USING (thread_id IN (SELECT id FROM editor_threads WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage their own editor memories"
  ON editor_memories FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_editor_threads_user ON editor_threads(user_id);
CREATE INDEX idx_editor_threads_updated ON editor_threads(user_id, updated_at DESC);
CREATE INDEX idx_editor_messages_thread ON editor_messages(thread_id);
CREATE INDEX idx_editor_messages_user ON editor_messages(user_id);
CREATE INDEX idx_editor_thread_state_thread ON editor_thread_state(thread_id);
CREATE INDEX idx_editor_memories_user ON editor_memories(user_id);
CREATE INDEX idx_editor_memories_key ON editor_memories(user_id, key);
