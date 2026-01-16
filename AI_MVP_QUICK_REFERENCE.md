# AI MVP Quick Reference

## Key Decisions Summary

### Core Stack (Hard to Change)

| Layer | MVP Choice | Scale Migration | Why |
|-------|-----------|-----------------|-----|
| **Database** | Supabase PostgreSQL | Same + Read replicas | Already set up, RLS works |
| **Vector Store** | pgvector (1536 dims) | Pinecone at 500K vectors | Monitor query latency |
| **Auth** | Supabase Auth | Same (add Clerk for SSO if needed) | Already integrated |
| **AI Backend** | Hono (TypeScript) + Railway/Vercel | Modal (auto-scaling + GPUs) | Native TypeScript, edge-compatible |

### Flexible Stack (Can Swap)

| Layer | MVP Choice | Scale Options |
|-------|-----------|---------------|
| **Chat Model** | OpenAI GPT-4o | Claude Sonnet, local Llama |
| **Specialized Tasks Model** | Google Gemini Pro | Claude Opus (for complex reasoning) |
| **Embeddings** | OpenAI text-embedding-3-large | Cohere, local Mixedbread |
| **Frontend AI** | Vercel AI SDK | Same |
| **Caching** | None | Upstash Redis |
| **Background Jobs** | Simple polling worker | BullMQ + Redis |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Vue App    │  │ Vercel AI SDK│  │   Editor     │          │
│  │   (Vercel)   │  │  useChat()   │  │   (Muya)     │          │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘          │
└─────────┼─────────────────┼─────────────────────────────────────┘
          │                 │
          ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI BACKEND (Railway)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   FastAPI    │  │  LangGraph   │  │  RAG Service │          │
│  │   Routes     │  │   Agents     │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼─────────────────┼─────────────────┼───────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       AI PROVIDERS                               │
│  ┌──────────────┐  ┌──────────────┐                             │
│  │   OpenAI     │  │   Gemini     │                             │
│  │ (chat+embed) │  │  (special)   │                             │
│  │ GPT-4o       │  │  Pro/Flash   │                             │
│  └──────────────┘  └──────────────┘                             │
│  General chat,      Slides, research,                            │
│  agents, embeds     courses, deep analysis                       │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PostgreSQL  │  │   pgvector   │  │   Storage    │          │
│  │   (data)     │  │ (embeddings) │  │   (files)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Immediate Next Steps (Priority Order)

### Week 1: AI Backend Setup

```bash
# 1. Create API directory
mkdir -p apps/api/src/{routes,services,agents,workers}

# 2. Initialize Python project
cd apps/api
python -m venv venv
source venv/bin/activate
pip install fastapi uvicorn langgraph langchain-openai langchain-anthropic supabase python-dotenv

# 3. Create basic structure
touch src/__init__.py
touch src/main.py
touch src/config.py
```

**Files to Create:**
1. `apps/api/src/main.py` - FastAPI app
2. `apps/api/src/config.py` - Environment config
3. `apps/api/requirements.txt` - Dependencies
4. `apps/api/Dockerfile` - For Railway

### Week 2: Provider Implementation

**Order of implementation:**
1. `packages/ai/src/providers/openai.ts` - For embeddings (REQUIRED)
2. `packages/ai/src/providers/anthropic.ts` - For chat (PRIMARY)
3. `packages/ai/src/services/embedding.service.ts` - Document processing

### Week 3: RAG Pipeline

**Order:**
1. Document chunking logic
2. Embedding generation endpoint
3. Semantic search integration
4. RAG retrieval + generation

### Week 4: LangGraph Agents

**Start with:**
1. Research agent (query → retrieve → generate)
2. Writing assistant (context → generate → refine)

### Week 5: Frontend Integration

**Order:**
1. Install Vercel AI SDK
2. `useAIChat` composable
3. Chat panel component
4. Inline completion

---

## Environment Variables Needed

```bash
# Create apps/api/.env with:

# AI Providers (GET THESE KEYS)
OPENAI_API_KEY=sk-...          # Required for chat + embeddings
GOOGLE_AI_API_KEY=...          # Required for specialized tasks (slides, research, courses)
ANTHROPIC_API_KEY=sk-ant-...   # Optional fallback

# Database (ALREADY HAVE)
SUPABASE_URL=https://lxjxoxwaesqxpgfdwkir.supabase.co
SUPABASE_SERVICE_KEY=...       # Get from Supabase dashboard (service_role key)

# Config
ENVIRONMENT=development
```

---

## Database Migrations to Run

Create and apply this migration for AI features:

```bash
# supabase/migrations/005_ai_features.sql
```

Key tables added:
- `ai_usage` - Track API costs
- `embedding_queue` - Background processing
- `chat_sessions` - Conversation history
- `chat_messages` - Individual messages

---

## Cost Estimates (MVP)

| Service | Monthly Cost |
|---------|-------------|
| Supabase Pro | $25 |
| Railway (AI Backend) | $20 |
| Vercel (Frontend) | $20 |
| OpenAI API | ~$50-200 (usage) |
| Anthropic API | ~$50-200 (usage) |
| **Total MVP** | **~$165-465/month** |

---

## Key Files to Create

```
apps/
├── api/                          # NEW: AI Backend
│   ├── src/
│   │   ├── main.py              # FastAPI entry
│   │   ├── config.py            # Environment config
│   │   ├── routes/
│   │   │   ├── chat.py          # /api/chat endpoint
│   │   │   ├── complete.py      # /api/complete endpoint
│   │   │   ├── embed.py         # /api/embed endpoint
│   │   │   └── agent.py         # /api/agent endpoint
│   │   ├── services/
│   │   │   ├── ai_service.py    # Provider orchestration
│   │   │   ├── rag_service.py   # RAG pipeline
│   │   │   └── embedding_service.py
│   │   ├── agents/
│   │   │   ├── research.py      # Research agent
│   │   │   └── writing.py       # Writing assistant
│   │   └── workers/
│   │       └── embedding_worker.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env
│
├── web/
│   └── src/
│       └── composables/
│           ├── useAIChat.ts     # NEW: Chat composable
│           └── useAICompletion.ts # NEW: Completion composable

packages/
└── ai/
    └── src/
        ├── providers/
        │   ├── interface.ts     # EXISTS
        │   ├── openai.ts        # NEW: OpenAI implementation
        │   ├── anthropic.ts     # NEW: Anthropic implementation
        │   ├── gemini.ts        # NEW: Gemini implementation
        │   └── factory.ts       # NEW: Provider factory
        └── services/
            └── embedding.service.ts # NEW
```

---

## Questions to Answer Before Starting

1. **Which AI provider do you want as primary for chat?**
   - Recommended: Anthropic Claude (better agent performance)

2. **Do you need the AI backend in Python or Node.js?**
   - Recommended: Python (native LangGraph)
   - Alternative: Node.js with @langchain/langgraph

3. **Do you already have API keys for OpenAI/Anthropic/Gemini?**
   - OpenAI is REQUIRED for embeddings
   - At least one chat provider needed

4. **Railway or Modal for deployment?**
   - Recommended: Railway for MVP (simpler)
   - Modal for scale (auto-scaling, GPUs)

---

## Success Metrics for MVP

- [ ] Chat with document context working
- [ ] Semantic search returning relevant results
- [ ] Auto-embedding on note save
- [ ] < 2 second response time for simple queries
- [ ] < 5 second response time for agent tasks
- [ ] Cost tracking per user implemented
