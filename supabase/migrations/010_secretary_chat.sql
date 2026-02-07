-- Secretary Chat Messages
CREATE TABLE IF NOT EXISTS secretary_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES secretary_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL DEFAULT '',
  tool_calls JSONB,
  thinking_steps JSONB,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE secretary_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own chat messages"
  ON secretary_chat_messages FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_secretary_chat_messages_thread ON secretary_chat_messages(thread_id);
CREATE INDEX idx_secretary_chat_messages_user ON secretary_chat_messages(user_id);
