-- =============================================
-- Migration 005: AI Features Infrastructure
-- Adds tables for AI usage tracking, chat sessions, and embedding queue
-- Author: Inkdown AI MVP
-- =============================================

-- =============================================
-- SECTION 1: AI Usage Tracking
-- Track all AI API calls for billing, analytics, and cost management
-- =============================================

CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Provider and model info
  provider TEXT NOT NULL,          -- 'openai', 'anthropic', 'google'
  model TEXT NOT NULL,             -- 'gpt-4o', 'claude-sonnet-4-20250514', etc.

  -- Action type
  action_type TEXT NOT NULL,       -- 'chat', 'complete', 'embed', 'agent'
  agent_name TEXT,                 -- For agent actions: 'note', 'planner', 'course', 'chat'

  -- Token usage
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,

  -- Cost tracking (in cents for precision, supports fractional cents)
  cost_cents DECIMAL(10,4) DEFAULT 0,

  -- Context references
  note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  session_id UUID,                 -- Group related requests in a conversation

  -- Performance metrics
  latency_ms INTEGER,

  -- Status and error tracking
  success BOOLEAN DEFAULT TRUE,
  error_code TEXT,
  error_message TEXT,

  -- Flexible metadata storage
  metadata JSONB DEFAULT '{}',

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for ai_usage queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date
  ON ai_usage(user_id, created_at DESC);

-- Note: For monthly queries, use the user_date index with WHERE clause
-- e.g., WHERE created_at >= date_trunc('month', NOW())

CREATE INDEX IF NOT EXISTS idx_ai_usage_billing
  ON ai_usage(user_id, created_at)
  WHERE cost_cents > 0;

CREATE INDEX IF NOT EXISTS idx_ai_usage_errors
  ON ai_usage(user_id, created_at)
  WHERE success = FALSE;

CREATE INDEX IF NOT EXISTS idx_ai_usage_session
  ON ai_usage(session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_provider
  ON ai_usage(provider, created_at DESC);

-- RLS for ai_usage
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_ai_usage" ON ai_usage;
CREATE POLICY "own_ai_usage" ON ai_usage
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- SECTION 2: Chat Sessions
-- Store conversation history for AI chat interactions
-- =============================================

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Session metadata
  title TEXT DEFAULT 'New Chat',

  -- Context: which notes/projects this chat is about
  context_note_ids UUID[] DEFAULT '{}',
  context_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Agent type (if this session uses a specific agent)
  agent_type TEXT,                 -- NULL for general chat, or 'note', 'planner', 'course'

  -- Status
  is_archived BOOLEAN DEFAULT FALSE,
  is_pinned BOOLEAN DEFAULT FALSE,

  -- Message count (denormalized for performance)
  message_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for chat_sessions
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user
  ON chat_sessions(user_id, updated_at DESC)
  WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_project
  ON chat_sessions(context_project_id)
  WHERE context_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent
  ON chat_sessions(user_id, agent_type)
  WHERE agent_type IS NOT NULL;

-- RLS for chat_sessions
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_chat_sessions" ON chat_sessions;
CREATE POLICY "own_chat_sessions" ON chat_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Updated at trigger for chat_sessions
DROP TRIGGER IF EXISTS chat_sessions_updated ON chat_sessions;
CREATE TRIGGER chat_sessions_updated
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- SECTION 3: Chat Messages
-- Individual messages within chat sessions
-- =============================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,

  -- For assistant/tool messages: which model generated this
  model TEXT,
  provider TEXT,

  -- Token tracking (for assistant messages)
  input_tokens INTEGER,
  output_tokens INTEGER,

  -- RAG context: what was retrieved to generate this response
  retrieved_chunks JSONB DEFAULT '[]',
  -- Format: [{ note_id, chunk_text, similarity, title }]

  -- Tool calls (for function calling / agent actions)
  tool_calls JSONB DEFAULT '[]',
  -- Format: [{ id, tool_name, arguments, result }]

  -- For tool result messages, reference the original tool call
  tool_call_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON chat_messages(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user
  ON chat_messages(user_id, created_at DESC);

-- RLS for chat_messages
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_chat_messages" ON chat_messages;
CREATE POLICY "own_chat_messages" ON chat_messages
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- SECTION 4: Message Count Trigger
-- Keep chat_sessions.message_count in sync
-- =============================================

CREATE OR REPLACE FUNCTION update_chat_session_message_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE chat_sessions
    SET message_count = message_count + 1,
        updated_at = NOW()
    WHERE id = NEW.session_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE chat_sessions
    SET message_count = GREATEST(message_count - 1, 0),
        updated_at = NOW()
    WHERE id = OLD.session_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_chat_message_count ON chat_messages;
CREATE TRIGGER tr_chat_message_count
  AFTER INSERT OR DELETE ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_session_message_count();

-- =============================================
-- SECTION 5: Embedding Queue
-- Queue for background embedding generation
-- =============================================

CREATE TABLE IF NOT EXISTS embedding_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source: either note or attachment (one must be set)
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  attachment_id UUID REFERENCES attachments(id) ON DELETE CASCADE,

  -- Queue status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Priority: higher values processed first
  priority INTEGER DEFAULT 0,

  -- Processing info
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Ensure exactly one source is provided
  CONSTRAINT queue_source_required CHECK (
    (note_id IS NOT NULL AND attachment_id IS NULL) OR
    (note_id IS NULL AND attachment_id IS NOT NULL)
  )
);

-- Indexes for embedding_queue
CREATE INDEX IF NOT EXISTS idx_embedding_queue_pending
  ON embedding_queue(priority DESC, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_embedding_queue_processing
  ON embedding_queue(started_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_embedding_queue_failed
  ON embedding_queue(user_id, created_at)
  WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS idx_embedding_queue_note
  ON embedding_queue(note_id)
  WHERE note_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_embedding_queue_attachment
  ON embedding_queue(attachment_id)
  WHERE attachment_id IS NOT NULL;

-- RLS for embedding_queue
ALTER TABLE embedding_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_embedding_queue" ON embedding_queue;
CREATE POLICY "own_embedding_queue" ON embedding_queue
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- SECTION 6: Auto-Queue Embedding Trigger
-- Automatically queue notes for embedding when content changes
-- =============================================

CREATE OR REPLACE FUNCTION queue_note_for_embedding()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue if content actually changed (or new insert)
  IF TG_OP = 'INSERT' OR
     (TG_OP = 'UPDATE' AND NEW.content IS DISTINCT FROM OLD.content) THEN

    -- Delete any existing queue entry for this note (to reset state)
    DELETE FROM embedding_queue WHERE note_id = NEW.id;

    -- Insert new queue entry
    INSERT INTO embedding_queue (user_id, note_id, priority, status)
    VALUES (NEW.user_id, NEW.id, 0, 'pending');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger (disabled by default - enable when embedding worker is running)
DROP TRIGGER IF EXISTS tr_queue_note_embedding ON notes;
CREATE TRIGGER tr_queue_note_embedding
  AFTER INSERT OR UPDATE OF content ON notes
  FOR EACH ROW
  EXECUTE FUNCTION queue_note_for_embedding();

-- IMPORTANT: Disable by default until embedding worker is deployed
ALTER TABLE notes DISABLE TRIGGER tr_queue_note_embedding;

-- =============================================
-- SECTION 7: Usage Statistics Functions
-- Functions to query AI usage for billing/analytics
-- =============================================

-- Get user's AI usage for current month (aggregated)
CREATE OR REPLACE FUNCTION get_monthly_ai_usage(p_user_id UUID)
RETURNS TABLE (
  total_requests BIGINT,
  total_tokens BIGINT,
  total_cost_cents DECIMAL,
  requests_by_provider JSONB,
  requests_by_action JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH provider_stats AS (
    SELECT
      au.provider,
      COUNT(*)::BIGINT AS request_count,
      COALESCE(SUM(au.total_tokens), 0)::BIGINT AS token_count,
      COALESCE(SUM(au.cost_cents), 0) AS cost
    FROM ai_usage au
    WHERE au.user_id = p_user_id
      AND au.created_at >= date_trunc('month', NOW())
    GROUP BY au.provider
  ),
  action_stats AS (
    SELECT
      au.action_type,
      COUNT(*)::BIGINT AS request_count,
      COALESCE(SUM(au.total_tokens), 0)::BIGINT AS token_count,
      COALESCE(SUM(au.cost_cents), 0) AS cost
    FROM ai_usage au
    WHERE au.user_id = p_user_id
      AND au.created_at >= date_trunc('month', NOW())
    GROUP BY au.action_type
  ),
  totals AS (
    SELECT
      COUNT(*)::BIGINT AS total_req,
      COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tok,
      COALESCE(SUM(cost_cents), 0) AS total_cost
    FROM ai_usage
    WHERE user_id = p_user_id
      AND created_at >= date_trunc('month', NOW())
  )
  SELECT
    t.total_req,
    t.total_tok,
    t.total_cost,
    COALESCE(
      (SELECT jsonb_object_agg(provider, jsonb_build_object(
        'requests', request_count,
        'tokens', token_count,
        'cost', cost
      )) FROM provider_stats),
      '{}'::JSONB
    ),
    COALESCE(
      (SELECT jsonb_object_agg(action_type, jsonb_build_object(
        'requests', request_count,
        'tokens', token_count,
        'cost', cost
      )) FROM action_stats),
      '{}'::JSONB
    )
  FROM totals t;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get daily usage breakdown for the current month
CREATE OR REPLACE FUNCTION get_daily_ai_usage(p_user_id UUID)
RETURNS TABLE (
  usage_date DATE,
  request_count BIGINT,
  token_count BIGINT,
  cost_cents DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(created_at) AS usage_date,
    COUNT(*)::BIGINT AS request_count,
    COALESCE(SUM(total_tokens), 0)::BIGINT AS token_count,
    COALESCE(SUM(au.cost_cents), 0) AS cost_cents
  FROM ai_usage au
  WHERE au.user_id = p_user_id
    AND au.created_at >= date_trunc('month', NOW())
  GROUP BY DATE(created_at)
  ORDER BY DATE(created_at);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================
-- SECTION 8: Embedding Queue Worker Functions
-- Functions for the background worker to process embeddings
-- =============================================

-- Get next batch of items from embedding queue (for workers)
CREATE OR REPLACE FUNCTION get_embedding_queue_batch(
  p_batch_size INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  note_id UUID,
  attachment_id UUID,
  attempts INTEGER
) AS $$
BEGIN
  RETURN QUERY
  UPDATE embedding_queue eq
  SET
    status = 'processing',
    started_at = NOW()
  WHERE eq.id IN (
    SELECT eq2.id
    FROM embedding_queue eq2
    WHERE eq2.status = 'pending'
      AND eq2.attempts < eq2.max_attempts
    ORDER BY eq2.priority DESC, eq2.created_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING eq.id, eq.user_id, eq.note_id, eq.attachment_id, eq.attempts;
END;
$$ LANGUAGE plpgsql;

-- Mark embedding job as completed or failed
CREATE OR REPLACE FUNCTION complete_embedding_job(
  p_job_id UUID,
  p_success BOOLEAN DEFAULT TRUE,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF p_success THEN
    UPDATE embedding_queue
    SET
      status = 'completed',
      completed_at = NOW()
    WHERE id = p_job_id;
  ELSE
    UPDATE embedding_queue
    SET
      status = CASE
        WHEN attempts + 1 >= max_attempts THEN 'failed'
        ELSE 'pending'
      END,
      attempts = attempts + 1,
      last_error = p_error,
      started_at = NULL
    WHERE id = p_job_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Reset stuck jobs (processing for too long)
CREATE OR REPLACE FUNCTION reset_stuck_embedding_jobs(
  p_timeout_minutes INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
  reset_count INTEGER;
BEGIN
  UPDATE embedding_queue
  SET
    status = 'pending',
    started_at = NULL,
    attempts = attempts + 1,
    last_error = 'Job timed out'
  WHERE status = 'processing'
    AND started_at < NOW() - (p_timeout_minutes || ' minutes')::INTERVAL;

  GET DIAGNOSTICS reset_count = ROW_COUNT;
  RETURN reset_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SECTION 9: Grant Permissions
-- =============================================

-- User-accessible functions
GRANT EXECUTE ON FUNCTION get_monthly_ai_usage TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_ai_usage TO authenticated;

-- Worker functions (service role only)
GRANT EXECUTE ON FUNCTION get_embedding_queue_batch TO service_role;
GRANT EXECUTE ON FUNCTION complete_embedding_job TO service_role;
GRANT EXECUTE ON FUNCTION reset_stuck_embedding_jobs TO service_role;

-- =============================================
-- SECTION 10: Comments for Documentation
-- =============================================

COMMENT ON TABLE ai_usage IS 'Tracks all AI API calls for billing and analytics';
COMMENT ON TABLE chat_sessions IS 'Stores AI chat conversation sessions';
COMMENT ON TABLE chat_messages IS 'Individual messages within chat sessions';
COMMENT ON TABLE embedding_queue IS 'Queue for background embedding generation';

COMMENT ON FUNCTION get_monthly_ai_usage IS 'Get aggregated AI usage for current month';
COMMENT ON FUNCTION get_daily_ai_usage IS 'Get daily AI usage breakdown';
COMMENT ON FUNCTION get_embedding_queue_batch IS 'Get batch of pending embedding jobs (worker use)';
COMMENT ON FUNCTION complete_embedding_job IS 'Mark embedding job as complete/failed (worker use)';
COMMENT ON FUNCTION reset_stuck_embedding_jobs IS 'Reset jobs stuck in processing state';

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
