# Inkdown AI Agent-First MVP Master Plan (TypeScript Edition)

> **Last Updated**: Phase 0 Infrastructure Ready
> **Stack**: Full TypeScript (Vue + Hono + LangGraph.js)
> **Target**: AI-first MVP scalable to 10M+ users

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Tech Stack Decisions](#tech-stack-decisions)
4. [Architecture Overview](#architecture-overview)
5. [Phase 0: Infrastructure Setup](#phase-0-infrastructure-setup)
6. [Phase 1: AI Provider Foundation](#phase-1-ai-provider-foundation)
7. [Phase 2: RAG Pipeline](#phase-2-rag-pipeline)
8. [Phase 3: LangGraph Agents](#phase-3-langgraph-agents)
9. [Phase 4: Frontend Integration](#phase-4-frontend-integration)
10. [Phase 5: Background Processing](#phase-5-background-processing)
11. [Scalability Roadmap](#scalability-roadmap)
12. [Environment Variables](#environment-variables)
13. [Verification Checklist](#verification-checklist)

---

## Executive Summary

This plan transforms Inkdown into an AI agent-first note-taking application using a **unified TypeScript stack**:

- **Frontend**: Vue 3 + Vite + Vercel AI SDK
- **Backend API**: Hono (edge-compatible, TypeScript-native)
- **AI Agents**: @langchain/langgraph (TypeScript)
- **Database**: Supabase PostgreSQL + pgvector
- **Deployment**: Vercel (frontend) + Vercel/Railway (API)

### Why Full TypeScript?

| Benefit | Impact |
|---------|--------|
| Single language | Faster development, easier hiring |
| Shared types | Type safety across entire stack |
| Vercel AI SDK | Native TypeScript streaming |
| LangGraph.js | Production-ready agent framework |
| Monorepo synergy | `@inkdown/*` packages work seamlessly |
| Edge deployment | Hono runs on Vercel Edge, Cloudflare Workers |

---

## Current State Analysis

### Existing Infrastructure (Verified)

| Component | Status | Location |
|-----------|--------|----------|
| **Vue 3 Frontend** | ✅ Ready | `apps/web/` |
| **Supabase PostgreSQL** | ✅ Ready | 4 migrations applied |
| **pgvector (1536 dims)** | ✅ Ready | `001_initial_schema.sql` |
| **Semantic Search Functions** | ✅ Ready | `003_enhancements.sql` |
| **AI Package Structure** | ⚠️ Interface only | `packages/ai/` |
| **Shared Types** | ✅ Ready | `packages/shared/` |
| **Embeddings Tables** | ✅ Ready | `note_embeddings`, `attachment_embeddings` |

### What Needs to Be Built

| Component | Priority | Phase |
|-----------|----------|-------|
| **AI Backend (Hono)** | Critical | 0 |
| **AI Usage Tables** | Critical | 0 |
| **Provider Implementations** | High | 1 |
| **Embedding Service** | High | 1 |
| **RAG Pipeline** | High | 2 |
| **LangGraph Agents** | High | 3 |
| **Vercel AI SDK Integration** | High | 4 |
| **Background Workers** | Medium | 5 |

---

## Tech Stack Decisions

### TIER 1: Core Infrastructure (Hard to Change)

| Layer | Decision | Rationale |
|-------|----------|-----------|
| **Database** | Supabase PostgreSQL | Already configured, RLS works, scales to 1M users |
| **Vector Store** | pgvector → Pinecone | Start with pgvector, migrate at 500K vectors |
| **Auth** | Supabase Auth | Already integrated, JWT works with API |
| **API Framework** | Hono | Edge-compatible, TypeScript-native, lightweight |
| **Agent Framework** | LangGraph.js | TypeScript-native, production-ready |

### TIER 2: Flexible Components (Can Evolve)

| Layer | MVP Choice | Scale Option |
|-------|-----------|--------------|
| **Chat Model (General)** | OpenAI GPT-4o | Claude Sonnet, local Llama |
| **Chat Model (Specialized)** | Google Gemini Pro/Flash | Claude Opus for complex reasoning |
| **Embeddings** | OpenAI text-embedding-3-large | Cohere, Mixedbread |
| **Frontend AI** | Vercel AI SDK | Same |
| **Caching** | None | Upstash Redis |
| **Background Jobs** | Simple polling | BullMQ + Redis |

### TIER 3: Scale-Only (Add When Needed)

| Trigger | Solution |
|---------|----------|
| Query latency > 100ms | Pinecone for vectors |
| Repeated queries > 30% | Upstash Redis cache |
| AI cost > $10K/month | Local models via Modal |
| Global users | Cloudflare Workers |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           INKDOWN AI ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    FRONTEND (apps/web)                              │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │   Vue 3      │  │ Vercel AI SDK│  │   Muya       │              │ │
│  │  │   + Pinia    │  │  useChat()   │  │   Editor     │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    API BACKEND (apps/api)                           │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │   Hono       │  │ LangGraph.js │  │  AI Service  │              │ │
│  │  │   Routes     │  │   Agents     │  │   (RAG)      │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                 SHARED PACKAGES (packages/*)                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │ @inkdown/ai  │  │@inkdown/shared│ │@inkdown/editor│             │ │
│  │  │  providers   │  │    types     │  │    muya      │              │ │
│  │  │  agents      │  │    utils     │  │              │              │ │
│  │  │  tools       │  │              │  │              │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    AI PROVIDERS (External)                          │ │
│  │  ┌──────────────────────────┐  ┌──────────────────────────┐        │ │
│  │  │   OpenAI (Primary)       │  │   Google Gemini          │        │ │
│  │  │  - GPT-4o (chat)         │  │   (Specialized)          │        │ │
│  │  │  - text-embed-3-large    │  │  - Slides generation     │        │ │
│  │  │  - General agents        │  │  - Deep research         │        │ │
│  │  │                          │  │  - Course generation     │        │ │
│  │  └──────────────────────────┘  └──────────────────────────┘        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      SUPABASE                                       │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │  PostgreSQL  │  │   pgvector   │  │   Storage    │              │ │
│  │  │   (data)     │  │ (embeddings) │  │   (files)    │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Directory Structure (Target State)

```
inkdown/
├── apps/
│   ├── web/                          # Vue frontend (existing)
│   │   └── src/
│   │       ├── composables/
│   │       │   ├── useAIChat.ts      # NEW: Chat composable
│   │       │   └── useAICompletion.ts# NEW: Completion composable
│   │       └── components/
│   │           └── ai/
│   │               ├── AIChatPanel.vue
│   │               └── AICompletionPopover.vue
│   │
│   └── api/                          # NEW: Hono API backend
│       ├── src/
│       │   ├── index.ts              # Hono app entry
│       │   ├── config.ts             # Environment config
│       │   ├── routes/
│       │   │   ├── chat.ts           # POST /api/chat
│       │   │   ├── complete.ts       # POST /api/complete
│       │   │   ├── embed.ts          # POST /api/embed
│       │   │   ├── search.ts         # POST /api/search
│       │   │   └── agent.ts          # POST /api/agent/:name
│       │   ├── middleware/
│       │   │   ├── auth.ts           # Supabase JWT verification
│       │   │   ├── cors.ts           # CORS configuration
│       │   │   └── rateLimit.ts      # Rate limiting
│       │   └── lib/
│       │       └── supabase.ts       # Supabase client
│       ├── package.json
│       ├── tsconfig.json
│       └── wrangler.toml             # Cloudflare Workers config (optional)
│
├── packages/
│   ├── ai/                           # AI package (ENHANCED)
│   │   └── src/
│   │       ├── index.ts
│   │       ├── providers/
│   │       │   ├── interface.ts      # Existing
│   │       │   ├── openai.ts         # NEW: OpenAI provider
│   │       │   ├── anthropic.ts      # NEW: Anthropic provider
│   │       │   ├── gemini.ts         # NEW: Gemini provider
│   │       │   └── factory.ts        # NEW: Provider factory
│   │       ├── agents/
│   │       │   ├── types.ts          # Agent state types
│   │       │   ├── chat.agent.ts     # Chat with RAG
│   │       │   ├── note.agent.ts     # Note manipulation
│   │       │   ├── planner.agent.ts  # Task planning
│   │       │   └── course.agent.ts   # Course generation
│   │       ├── tools/
│   │       │   ├── types.ts          # Tool interfaces
│   │       │   ├── search.tool.ts    # Semantic search
│   │       │   ├── note.tools.ts     # Note CRUD
│   │       │   └── web.tool.ts       # Web search
│   │       └── services/
│   │           ├── embedding.ts      # Embedding generation
│   │           ├── rag.ts            # RAG retrieval
│   │           └── chunking.ts       # Text chunking
│   │
│   ├── shared/                       # Shared types (existing)
│   │   └── src/
│   │       └── types/
│   │           ├── index.ts
│   │           ├── document.ts
│   │           ├── user.ts
│   │           ├── preferences.ts
│   │           └── ai.ts             # NEW: AI-specific types
│   │
│   └── editor/                       # Muya editor (existing)
│
└── supabase/
    └── migrations/
        ├── 001_initial_schema.sql    # Existing
        ├── 002_storage_policies.sql  # Existing
        ├── 003_enhancements.sql      # Existing
        ├── 004_path_triggers.sql     # Existing
        └── 005_ai_features.sql       # NEW: AI tables
```

---

## Phase 0: Infrastructure Setup

### Overview

Phase 0 establishes the foundational infrastructure for AI features:
1. Database tables for AI (usage tracking, chat sessions, embedding queue)
2. API backend with Hono
3. Updated packages with AI dependencies
4. Monorepo configuration for new packages

### Step 0.1: Database Migration (005_ai_features.sql)

Create the AI-specific tables in Supabase.

**File**: `supabase/migrations/005_ai_features.sql`

```sql
-- =============================================
-- Migration 005: AI Features Infrastructure
-- Adds tables for AI usage, chat sessions, and embedding queue
-- =============================================

-- =============================================
-- SECTION 1: AI Usage Tracking
-- Track all AI API calls for billing and analytics
-- =============================================

CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Provider and model info
  provider TEXT NOT NULL,          -- 'openai', 'anthropic', 'google'
  model TEXT NOT NULL,             -- 'gpt-4o', 'claude-sonnet-4-20250514', etc.

  -- Action type
  action_type TEXT NOT NULL,       -- 'chat', 'complete', 'embed', 'agent'
  agent_name TEXT,                 -- For agent actions: 'note', 'planner', 'course'

  -- Token usage
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,

  -- Cost tracking (in cents for precision)
  cost_cents DECIMAL(10,4) DEFAULT 0,

  -- Context
  note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  session_id UUID,                 -- Group related requests

  -- Performance
  latency_ms INTEGER,

  -- Status
  success BOOLEAN DEFAULT TRUE,
  error_code TEXT,
  error_message TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for ai_usage
CREATE INDEX idx_ai_usage_user_date ON ai_usage(user_id, created_at DESC);
CREATE INDEX idx_ai_usage_user_month ON ai_usage(user_id, date_trunc('month', created_at));
CREATE INDEX idx_ai_usage_billing ON ai_usage(user_id, created_at) WHERE cost_cents > 0;
CREATE INDEX idx_ai_usage_errors ON ai_usage(user_id, created_at) WHERE success = FALSE;
CREATE INDEX idx_ai_usage_session ON ai_usage(session_id) WHERE session_id IS NOT NULL;

-- RLS for ai_usage
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_ai_usage" ON ai_usage;
CREATE POLICY "own_ai_usage" ON ai_usage FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- SECTION 2: Chat Sessions
-- Store conversation history for AI chat
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

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for chat_sessions
CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id, updated_at DESC)
  WHERE is_archived = FALSE;
CREATE INDEX idx_chat_sessions_project ON chat_sessions(context_project_id)
  WHERE context_project_id IS NOT NULL;

-- RLS for chat_sessions
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_chat_sessions" ON chat_sessions;
CREATE POLICY "own_chat_sessions" ON chat_sessions FOR ALL USING (auth.uid() = user_id);

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

  -- For assistant/tool messages
  model TEXT,
  provider TEXT,

  -- Token tracking
  input_tokens INTEGER,
  output_tokens INTEGER,

  -- RAG context (what was retrieved)
  retrieved_chunks JSONB DEFAULT '[]',
  -- Format: [{ note_id, chunk_text, similarity, title }]

  -- Tool calls (for function calling)
  tool_calls JSONB DEFAULT '[]',
  -- Format: [{ tool_name, arguments, result }]

  -- For tool messages, reference the tool call
  tool_call_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for chat_messages
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at);
CREATE INDEX idx_chat_messages_user ON chat_messages(user_id, created_at DESC);

-- RLS for chat_messages
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_chat_messages" ON chat_messages;
CREATE POLICY "own_chat_messages" ON chat_messages FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- SECTION 4: Embedding Queue
-- Queue for background embedding generation
-- =============================================

CREATE TABLE IF NOT EXISTS embedding_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source (either note or attachment)
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  attachment_id UUID REFERENCES attachments(id) ON DELETE CASCADE,

  -- Queue status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  priority INTEGER DEFAULT 0,      -- Higher = more urgent

  -- Processing info
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Ensure source is provided
  CONSTRAINT queue_source_required CHECK (
    note_id IS NOT NULL OR attachment_id IS NOT NULL
  ),

  -- Prevent duplicate queue entries
  CONSTRAINT unique_pending_note UNIQUE (note_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT unique_pending_attachment UNIQUE (attachment_id)
    DEFERRABLE INITIALLY DEFERRED
);

-- Indexes for embedding_queue
CREATE INDEX idx_embedding_queue_pending ON embedding_queue(priority DESC, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_embedding_queue_processing ON embedding_queue(started_at)
  WHERE status = 'processing';
CREATE INDEX idx_embedding_queue_failed ON embedding_queue(user_id, created_at)
  WHERE status = 'failed';

-- RLS for embedding_queue
ALTER TABLE embedding_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_embedding_queue" ON embedding_queue;
CREATE POLICY "own_embedding_queue" ON embedding_queue FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- SECTION 5: Auto-Queue Embedding Trigger
-- Automatically queue notes for embedding when saved
-- =============================================

CREATE OR REPLACE FUNCTION queue_note_for_embedding()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue if content actually changed
  IF TG_OP = 'INSERT' OR
     (TG_OP = 'UPDATE' AND NEW.content IS DISTINCT FROM OLD.content) THEN

    -- Insert or update queue entry (upsert)
    INSERT INTO embedding_queue (user_id, note_id, priority, status)
    VALUES (NEW.user_id, NEW.id, 0, 'pending')
    ON CONFLICT (note_id)
    DO UPDATE SET
      status = 'pending',
      priority = EXCLUDED.priority,
      attempts = 0,
      last_error = NULL,
      created_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger (disabled by default, enable when worker is ready)
DROP TRIGGER IF EXISTS tr_queue_note_embedding ON notes;
CREATE TRIGGER tr_queue_note_embedding
  AFTER INSERT OR UPDATE OF content ON notes
  FOR EACH ROW
  EXECUTE FUNCTION queue_note_for_embedding();

-- Disable by default (enable when embedding worker is running)
ALTER TABLE notes DISABLE TRIGGER tr_queue_note_embedding;

-- =============================================
-- SECTION 6: Usage Statistics Functions
-- Functions to query AI usage for billing/analytics
-- =============================================

-- Get user's AI usage for current month
CREATE OR REPLACE FUNCTION get_monthly_ai_usage(p_user_id UUID)
RETURNS TABLE (
  total_requests BIGINT,
  total_tokens BIGINT,
  total_cost_cents DECIMAL,
  by_provider JSONB,
  by_action JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_requests,
    COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens,
    COALESCE(SUM(cost_cents), 0) AS total_cost_cents,
    jsonb_object_agg(
      COALESCE(provider, 'unknown'),
      jsonb_build_object(
        'requests', provider_count,
        'tokens', provider_tokens,
        'cost', provider_cost
      )
    ) AS by_provider,
    jsonb_object_agg(
      COALESCE(action_type, 'unknown'),
      jsonb_build_object(
        'requests', action_count,
        'tokens', action_tokens,
        'cost', action_cost
      )
    ) AS by_action
  FROM (
    SELECT
      provider,
      action_type,
      COUNT(*) AS provider_count,
      SUM(total_tokens) AS provider_tokens,
      SUM(cost_cents) AS provider_cost,
      COUNT(*) AS action_count,
      SUM(total_tokens) AS action_tokens,
      SUM(cost_cents) AS action_cost
    FROM ai_usage
    WHERE user_id = p_user_id
      AND created_at >= date_trunc('month', NOW())
    GROUP BY provider, action_type
  ) stats;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get next items from embedding queue
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

-- Mark embedding job as completed
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

-- =============================================
-- SECTION 7: Grant Permissions
-- =============================================

GRANT EXECUTE ON FUNCTION get_monthly_ai_usage TO authenticated;
GRANT EXECUTE ON FUNCTION get_embedding_queue_batch TO service_role;
GRANT EXECUTE ON FUNCTION complete_embedding_job TO service_role;

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
```

### Step 0.2: Create API Backend Structure

Create the Hono-based API backend in `apps/api/`.

**Directory Structure**:
```
apps/api/
├── src/
│   ├── index.ts          # Main entry point
│   ├── config.ts         # Environment configuration
│   ├── routes/
│   │   ├── index.ts      # Route aggregator
│   │   ├── health.ts     # Health check endpoint
│   │   ├── chat.ts       # Chat endpoints
│   │   ├── complete.ts   # Completion endpoints
│   │   ├── embed.ts      # Embedding endpoints
│   │   ├── search.ts     # Search endpoints
│   │   └── agent.ts      # Agent endpoints
│   ├── middleware/
│   │   ├── auth.ts       # JWT verification
│   │   ├── cors.ts       # CORS handling
│   │   └── error.ts      # Error handling
│   └── lib/
│       ├── supabase.ts   # Supabase clients
│       └── types.ts      # API-specific types
├── package.json
├── tsconfig.json
└── .env.example
```

### Step 0.3: Update AI Package Dependencies

Update `packages/ai/package.json` with LangGraph.js and provider SDKs.

### Step 0.4: Add Shared AI Types

Add AI-specific types to `packages/shared/src/types/ai.ts`.

### Step 0.5: Update Monorepo Configuration

Update `turbo.json` and root `package.json` for the new API package.

---

## Phase 1: AI Provider Foundation

### Provider Strategy

**OpenAI (Primary)**:
- General chat and conversation
- Agent capabilities (note manipulation, planning)
- Embedding generation (text-embedding-3-large)
- Function calling for tool use

**Google Gemini (Specialized)**:
- Slides generation (long-form structured content)
- Deep research (large context window - 1M tokens)
- Course generation (curriculum and content creation)
- Complex document analysis

### Step 1.1: OpenAI Provider (Priority 1 - REQUIRED)
- **Chat completions**: GPT-4o for general conversation
- **Embeddings**: text-embedding-3-large (1536 dimensions)
- **Function calling**: Tool use support for agents
- **Streaming**: Real-time response streaming
- **Cost tracking**: Token usage and billing

**Implementation**:
```typescript
// packages/ai/src/providers/openai.ts
export class OpenAIProvider implements AIProvider {
  // Vercel AI SDK integration for streaming
  async chat(messages, context) { ... }

  // LangChain integration for agents
  async createChatModel() { ... }

  // Embeddings for RAG
  async generateEmbeddings(texts) { ... }
}
```

### Step 1.2: Gemini Provider (Priority 2 - REQUIRED)
- **Specialized models**: Gemini Pro for complex tasks, Flash for speed
- **Long context**: Up to 1M tokens for research
- **Structured output**: JSON mode for slides/courses
- **Streaming**: Real-time generation
- **Multimodal**: Future support for images

**Implementation**:
```typescript
// packages/ai/src/providers/gemini.ts
export class GeminiProvider implements AIProvider {
  // Specialized for complex generation tasks
  async generateSlides(topic, notes) { ... }
  async deepResearch(query, context) { ... }
  async generateCourse(topic, curriculum) { ... }
}
```

### Step 1.3: Provider Factory with Intelligent Routing
- **Task-based routing**: Automatically select provider based on task type
- **Model selection**: Choose optimal model per use case
- **Fallback logic**: Handle provider failures gracefully
- **Cost optimization**: Route to cost-effective models

**Implementation**:
```typescript
// packages/ai/src/providers/factory.ts
export function createProvider(taskType: TaskType) {
  switch (taskType) {
    case 'chat':
    case 'note-agent':
    case 'planner':
      return new OpenAIProvider() // General purpose

    case 'slides':
    case 'research':
    case 'course':
      return new GeminiProvider() // Specialized

    default:
      return new OpenAIProvider() // Default fallback
  }
}
```

### Step 1.4: Unified Provider Interface
- Consistent API across all providers
- Type-safe method signatures
- Error handling and retry logic
- Usage tracking middleware

---

## Phase 2: RAG Pipeline

### Step 2.1: Text Chunking Service
- Sentence-boundary aware chunking
- Overlap for context preservation
- Token counting

### Step 2.2: Embedding Service
- Batch embedding generation
- Hash-based deduplication
- Queue integration

### Step 2.3: RAG Retrieval
- Semantic search wrapper
- Hybrid search support
- Context formatting

---

## Phase 3: LangGraph Agents

### Agent Architecture

```typescript
// Agent State Pattern
interface AgentState {
  messages: BaseMessage[]
  context: DocumentContext
  tools: ToolDefinition[]
  output: AgentOutput
  provider: 'openai' | 'gemini' // Provider selection
}

// Graph Pattern with Provider Routing
const workflow = new StateGraph(AgentState)
  .addNode('analyze', analyzeNode)
  .addNode('retrieve', retrieveNode)
  .addNode('generate', generateNode)
  .addNode('tools', toolNode)
  .addEdge('__start__', 'analyze')
  .addConditionalEdges('analyze', router)
  .compile()
```

### Agent-to-Provider Mapping

| Agent Type | Provider | Model | Rationale |
|------------|----------|-------|-----------|
| **Chat Agent** | OpenAI | GPT-4o | Fast general conversation, good tool use |
| **Note Agent** | OpenAI | GPT-4o | Precise CRUD operations, function calling |
| **Planner Agent** | OpenAI | GPT-4o | Structured thinking, reliable output |
| **Writing Assistant** | OpenAI | GPT-4o | Quick inline completions |
| **Course Agent** | Gemini | Pro/Flash | Long-form content generation, structure |
| **Research Agent** | Gemini | Pro | 1M token context, deep analysis |
| **Slides Agent** | Gemini | Pro | Structured output, creative content |

### Step 3.1: Chat Agent (OpenAI)
- **Purpose**: General conversation with document context
- **Provider**: OpenAI GPT-4o
- **Features**:
  - Document-aware conversation
  - RAG integration for context retrieval
  - Citation support with source references
  - Streaming responses
- **Tools**: Search tool, note read tool

### Step 3.2: Note Agent (OpenAI)
- **Purpose**: Create, update, organize notes
- **Provider**: OpenAI GPT-4o
- **Features**:
  - Tool-based CRUD operations
  - Validation and error handling
  - Batch operations support
  - Conflict resolution
- **Tools**: Note create, update, delete, move

### Step 3.3: Planner Agent (OpenAI)
- **Purpose**: Task decomposition and planning
- **Provider**: OpenAI GPT-4o
- **Features**:
  - Multi-step planning
  - Progress tracking
  - Dependency management
  - Adaptive replanning
- **Tools**: Note read, project analysis

### Step 3.4: Course Generation Agent (Gemini)
- **Purpose**: Create structured courses from notes
- **Provider**: Google Gemini Pro
- **Features**:
  - Note analysis and synthesis
  - Curriculum generation
  - Module content creation
  - Long-form structured output
- **Tools**: Note search, web search for supplementary content
- **Why Gemini**:
  - Large context window for analyzing many notes
  - Excellent at structured content generation
  - Strong at educational content

### Step 3.5: Deep Research Agent (Gemini)
- **Purpose**: Comprehensive research and analysis
- **Provider**: Google Gemini Pro
- **Features**:
  - Multi-source information synthesis
  - Long document analysis (1M tokens)
  - Citation and reference tracking
  - Iterative refinement
- **Tools**: Web search, note search, document analysis
- **Why Gemini**:
  - Massive context window (1M tokens)
  - Strong research capabilities
  - Good at synthesizing diverse sources

### Step 3.6: Slides Generation Agent (Gemini)
- **Purpose**: Create presentation slides from notes
- **Provider**: Google Gemini Pro/Flash
- **Features**:
  - Content extraction and summarization
  - Slide structure generation
  - Visual element suggestions
  - Speaker notes generation
- **Tools**: Note read, image suggestions
- **Why Gemini**:
  - Creative content generation
  - Structured output (JSON mode)
  - Good at visual/presentation formatting

---

## Phase 4: Frontend Integration

### Step 4.1: Vercel AI SDK Setup
```typescript
// Install
pnpm add ai @ai-sdk/vue @ai-sdk/openai @ai-sdk/anthropic
```

### Step 4.2: Chat Composable
```typescript
import { useChat } from '@ai-sdk/vue'

export function useAIChat(options: ChatOptions) {
  return useChat({
    api: `${API_URL}/api/chat`,
    headers: () => ({
      Authorization: `Bearer ${token}`,
    }),
    ...options,
  })
}
```

### Step 4.3: Completion Composable
```typescript
import { useCompletion } from '@ai-sdk/vue'

export function useAICompletion() {
  return useCompletion({
    api: `${API_URL}/api/complete`,
  })
}
```

### Step 4.4: UI Components
- AIChatPanel.vue
- AICompletionPopover.vue
- AIAgentStatus.vue

---

## Phase 5: Background Processing

### Step 5.1: Embedding Worker
- Poll-based queue processing
- Batch operations
- Error handling and retries

### Step 5.2: Enable Auto-Embedding
- Enable database trigger
- Monitor queue health

### Step 5.3: Monitoring
- Queue depth metrics
- Error rate tracking
- Cost monitoring

---

## Scalability Roadmap

### Stage 1: 0 → 100K Users (~$500/month)
- Supabase Pro
- Vercel Hobby
- Railway Basic
- pgvector for embeddings

### Stage 2: 100K → 1M Users (~$3,500/month)
- Pinecone for vectors
- Upstash Redis cache
- Railway Pro
- Vercel Pro

### Stage 3: 1M → 10M Users (~$25,000/month)
- Pinecone Enterprise
- Multi-region deployment
- Custom model fine-tuning
- Dedicated infrastructure

---

## Environment Variables

### Frontend (`apps/web/.env`)
```bash
# Supabase
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx

# API
VITE_API_URL=http://localhost:3001

# Feature flags
VITE_ENABLE_AI=true
```

### API Backend (`apps/api/.env`)
```bash
# Server
PORT=3001
NODE_ENV=development

# Supabase (service role for backend operations)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx

# AI Providers
OPENAI_API_KEY=sk-xxx              # Required: General chat + embeddings
GOOGLE_AI_API_KEY=xxx              # Required: Specialized tasks (slides, research, courses)
ANTHROPIC_API_KEY=sk-ant-xxx       # Optional: Fallback provider

# Model Defaults
DEFAULT_CHAT_MODEL=gpt-4o                      # OpenAI for general chat
DEFAULT_SPECIALIZED_MODEL=gemini-2.0-flash-exp # Gemini for specialized tasks
DEFAULT_EMBEDDING_MODEL=text-embedding-3-large # OpenAI embeddings
EMBEDDING_DIMENSIONS=1536

# Rate Limiting
RATE_LIMIT_REQUESTS_PER_MINUTE=60
RATE_LIMIT_TOKENS_PER_DAY=100000

# CORS
CORS_ORIGIN=http://localhost:5173
```

---

## Verification Checklist

### Phase 0 Verification
- [ ] Migration 005 applied successfully
- [ ] All new tables exist: ai_usage, chat_sessions, chat_messages, embedding_queue
- [ ] RLS policies active on all tables
- [ ] Functions created: get_monthly_ai_usage, get_embedding_queue_batch, complete_embedding_job
- [ ] API backend starts without errors
- [ ] Health endpoint returns 200
- [ ] Auth middleware verifies JWT correctly
- [ ] CORS configured correctly
- [ ] Packages install without errors
- [ ] TypeScript compiles without errors
- [ ] Turbo tasks work: dev, build, lint

### Phase 1 Verification
- [ ] OpenAI provider streams responses
- [ ] Anthropic provider streams responses
- [ ] Embedding service generates vectors
- [ ] Provider factory selects correct provider

### Phase 2 Verification
- [ ] Text chunking produces valid chunks
- [ ] Embeddings stored in database
- [ ] Semantic search returns results
- [ ] Hybrid search combines scores correctly

### Phase 3 Verification
- [ ] Chat agent responds with context
- [ ] Note agent creates/updates notes
- [ ] Planner agent generates plans
- [ ] Course agent creates curriculum

### Phase 4 Verification
- [ ] useChat streams to UI
- [ ] useCompletion provides suggestions
- [ ] Chat panel displays messages
- [ ] Error states handled gracefully

### Phase 5 Verification
- [ ] Worker processes queue
- [ ] Auto-embedding trigger works
- [ ] Failed jobs retry correctly
- [ ] Monitoring dashboards functional

---

## Quick Commands

```bash
# Development
pnpm dev                    # Start all services
pnpm --filter @inkdown/api dev  # Start API only
pnpm --filter @inkdown/web dev  # Start frontend only

# Build
pnpm build                  # Build all packages
pnpm --filter @inkdown/ai build # Build AI package only

# Database
supabase migration new ai_features  # Create new migration
supabase db push            # Apply migrations (local)
supabase db reset           # Reset database (local)

# Testing
pnpm test                   # Run all tests
curl http://localhost:3001/health  # Check API health
```

---

## Next Steps After Phase 0

1. **Get API Keys**: OpenAI (required), Anthropic (required), Google (optional)
2. **Deploy API**: Railway or Vercel Functions
3. **Enable AI Features**: Start with chat, then agents
4. **Monitor Usage**: Track costs from day 1
5. **Iterate**: Add features based on user feedback
