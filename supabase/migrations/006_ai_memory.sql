-- =============================================
-- Migration 006: AI Memory & Agent State
-- Adds tables for AI memory (replaces file-based), roadmaps, and agent sessions
-- Required for Note3 AI system migration
-- =============================================

-- =============================================
-- SECTION 1: AI Memory
-- Replaces file-based memory (AI.md, Plan.md, Daily.md, etc.)
-- =============================================

CREATE TABLE IF NOT EXISTS ai_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Memory type (replaces file names)
  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'preferences',    -- AI.md: User preferences (focus time, learning style)
    'plan_index',     -- Plan.md: Multi-roadmap index
    'daily',          -- Daily.md: Legacy daily plan
    'today',          -- Today.md: Current day's tasks
    'tomorrow',       -- Tomorrow.md: Next day's tasks
    'context'         -- General context storage
  )),
  
  -- Memory content (markdown or structured text)
  content TEXT NOT NULL DEFAULT '',
  
  -- Metadata for additional structure
  metadata JSONB DEFAULT '{}',
  
  -- Version for conflict resolution
  version INTEGER DEFAULT 1,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One memory of each type per user
  UNIQUE(user_id, memory_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_memory_user ON ai_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_memory_type ON ai_memory(user_id, memory_type);

-- RLS
ALTER TABLE ai_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_ai_memory" ON ai_memory;
CREATE POLICY "own_ai_memory" ON ai_memory FOR ALL USING (auth.uid() = user_id);

-- Updated at trigger
DROP TRIGGER IF EXISTS ai_memory_updated ON ai_memory;
CREATE TRIGGER ai_memory_updated
  BEFORE UPDATE ON ai_memory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- SECTION 2: Learning Roadmaps
-- Structured learning plans from Secretary agent
-- =============================================

CREATE TABLE IF NOT EXISTS learning_roadmaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Roadmap metadata
  title TEXT NOT NULL,
  description TEXT,
  topic TEXT,                        -- Learning topic
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived', 'paused')),
  
  -- Progress tracking
  current_week INTEGER DEFAULT 1,
  total_weeks INTEGER NOT NULL,
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  
  -- Roadmap content (JSON structure)
  content JSONB NOT NULL,
  -- Format: {
  --   phases: [{ 
  --     name, weeks, themes: [{ week, focus, topics, resources }] 
  --   }],
  --   milestones: [...],
  --   preferences: { hoursPerDay, focusTime, breakFrequency }
  -- }
  
  -- Weekly auto-expansion tracking
  last_expanded_week INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_roadmaps_user ON learning_roadmaps(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_roadmaps_active ON learning_roadmaps(user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_roadmaps_topic ON learning_roadmaps(user_id, topic);

-- RLS
ALTER TABLE learning_roadmaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_roadmaps" ON learning_roadmaps;
CREATE POLICY "own_roadmaps" ON learning_roadmaps FOR ALL USING (auth.uid() = user_id);

-- Updated at trigger
DROP TRIGGER IF EXISTS roadmaps_updated ON learning_roadmaps;
CREATE TRIGGER roadmaps_updated
  BEFORE UPDATE ON learning_roadmaps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- SECTION 3: Agent Sessions
-- LangGraph state persistence for stateful agents
-- =============================================

CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Agent identification
  agent_type TEXT NOT NULL CHECK (agent_type IN (
    'chat',           -- Chat agent with RAG
    'note',           -- Note manipulation agent
    'planner',        -- Secretary/Planner agent
    'course',         -- Course generation agent
    'slides',         -- Slides generation agent
    'research'        -- Deep research agent
  )),
  
  -- Thread ID for LangGraph (allows multiple conversations per agent)
  thread_id TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  
  -- Serialized LangGraph state
  state JSONB NOT NULL DEFAULT '{}',
  
  -- LangGraph checkpoint ID for state restoration
  checkpoint_id TEXT,
  
  -- Context references
  context_note_ids UUID[] DEFAULT '{}',
  context_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique thread per user per agent
  UNIQUE(user_id, agent_type, thread_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user ON agent_sessions(user_id, agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_thread ON agent_sessions(thread_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_active ON agent_sessions(user_id) WHERE is_active = TRUE;

-- RLS
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_agent_sessions" ON agent_sessions;
CREATE POLICY "own_agent_sessions" ON agent_sessions FOR ALL USING (auth.uid() = user_id);

-- Updated at trigger
DROP TRIGGER IF EXISTS agent_sessions_updated ON agent_sessions;
CREATE TRIGGER agent_sessions_updated
  BEFORE UPDATE ON agent_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- SECTION 4: Thinking Steps (For UI Display)
-- Stores AI reasoning steps for display
-- =============================================

CREATE TABLE IF NOT EXISTS thinking_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  
  -- Step details
  step_type TEXT NOT NULL CHECK (step_type IN (
    'thought',     -- General reasoning
    'search',      -- Web/note search
    'read',        -- Reading blocks/notes
    'write',       -- Writing/editing
    'create',      -- Creating databases/artifacts
    'tool',        -- Other tool execution
    'analyze',     -- Analysis operations
    'explore',     -- Exploration
    'reasoning'    -- Extended reasoning
  )),
  
  description TEXT NOT NULL,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'complete', 'error')),
  
  -- Performance
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Error info if failed
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_thinking_steps_session ON thinking_steps(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_thinking_steps_message ON thinking_steps(message_id);

-- RLS
ALTER TABLE thinking_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_thinking_steps" ON thinking_steps;
CREATE POLICY "own_thinking_steps" ON thinking_steps FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- SECTION 5: Secretary Intent History
-- Track intent classifications for learning/debugging
-- =============================================

CREATE TABLE IF NOT EXISTS secretary_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  
  -- User input
  user_message TEXT NOT NULL,
  
  -- Classified intent (8 types from Note3)
  intent TEXT NOT NULL CHECK (intent IN (
    'create_roadmap',     -- Create learning plan
    'save_roadmap',       -- Save pending roadmap
    'modify_roadmap',     -- Change existing plan
    'calendar',           -- Meeting/vacation handling
    'daily_plan',         -- Today's schedule
    'preferences',        -- Update AI preferences
    'query',              -- Show plans/progress
    'general'             -- Fallback
  )),
  
  -- Confidence score (0-1)
  confidence DECIMAL(3,2) DEFAULT 1.0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_secretary_intents_user ON secretary_intents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_secretary_intents_intent ON secretary_intents(intent);

-- RLS
ALTER TABLE secretary_intents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_secretary_intents" ON secretary_intents;
CREATE POLICY "own_secretary_intents" ON secretary_intents FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- SECTION 6: Memory Access Functions
-- Functions to read/write AI memory (replaces file I/O)
-- =============================================

-- Get memory content by type
CREATE OR REPLACE FUNCTION get_ai_memory(
  p_user_id UUID,
  p_memory_type TEXT
)
RETURNS TABLE (
  content TEXT,
  metadata JSONB,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT m.content, m.metadata, m.updated_at
  FROM ai_memory m
  WHERE m.user_id = p_user_id AND m.memory_type = p_memory_type;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Set memory content (upsert)
CREATE OR REPLACE FUNCTION set_ai_memory(
  p_user_id UUID,
  p_memory_type TEXT,
  p_content TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO ai_memory (user_id, memory_type, content, metadata)
  VALUES (p_user_id, p_memory_type, p_content, p_metadata)
  ON CONFLICT (user_id, memory_type)
  DO UPDATE SET
    content = EXCLUDED.content,
    metadata = EXCLUDED.metadata,
    version = ai_memory.version + 1,
    updated_at = NOW()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- List all memory types for a user
CREATE OR REPLACE FUNCTION list_ai_memory_types(p_user_id UUID)
RETURNS TABLE (
  memory_type TEXT,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT m.memory_type, m.updated_at
  FROM ai_memory m
  WHERE m.user_id = p_user_id
  ORDER BY m.updated_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Delete memory by type
CREATE OR REPLACE FUNCTION delete_ai_memory(
  p_user_id UUID,
  p_memory_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_deleted BOOLEAN;
BEGIN
  DELETE FROM ai_memory
  WHERE user_id = p_user_id AND memory_type = p_memory_type;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SECTION 7: Grant Permissions
-- =============================================

GRANT EXECUTE ON FUNCTION get_ai_memory TO authenticated;
GRANT EXECUTE ON FUNCTION set_ai_memory TO authenticated;
GRANT EXECUTE ON FUNCTION list_ai_memory_types TO authenticated;
GRANT EXECUTE ON FUNCTION delete_ai_memory TO authenticated;

-- =============================================
-- SECTION 8: Comments
-- =============================================

COMMENT ON TABLE ai_memory IS 'AI memory storage (replaces file-based AI.md, Plan.md, etc.)';
COMMENT ON TABLE learning_roadmaps IS 'Structured learning plans from Secretary agent';
COMMENT ON TABLE agent_sessions IS 'LangGraph state persistence for stateful agents';
COMMENT ON TABLE thinking_steps IS 'AI reasoning steps for UI display';
COMMENT ON TABLE secretary_intents IS 'Intent classification history for Secretary agent';

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
