# Noteshell AI System Redesign — CTO Architecture Document

**Author:** AI Architecture Review
**Date:** March 17, 2026
**Status:** RFC (Request for Comments)
**Scope:** Unified Agent Framework, Model Strategy, Billing & Credits System

---

## Table of Contents

1. [Current State Audit](#1-current-state-audit)
2. [Problems with the Current Architecture](#2-problems-with-the-current-architecture)
3. [Unified Agent Framework Design](#3-unified-agent-framework-design)
4. [Agent Catalog & Routing](#4-agent-catalog--routing)
5. [Model Strategy & Cost Optimization](#5-model-strategy--cost-optimization)
6. [Guardrails & Safety Layer](#6-guardrails--safety-layer)
7. [Unified Prompt Engineering System](#7-unified-prompt-engineering-system)
8. [Billing System Architecture](#8-billing-system-architecture)
9. [Token Tracking & Usage Monitoring](#9-token-tracking--usage-monitoring)
10. [Free Credits & Onboarding Strategy](#10-free-credits--onboarding-strategy)
11. [Database Schema Changes](#11-database-schema-changes)
12. [Implementation Roadmap](#12-implementation-roadmap)
13. [Cost Projections](#13-cost-projections)

---

## 1. Current State Audit

### What We Have Today (9+ Agents, No Unified Framework)

| Agent | File | What It Does | Model Used | Framework |
|-------|------|-------------|------------|-----------|
| **Deep Agent** | `deep-agent.ts` (987 lines) | Compound request decomposition → subtasks (edit, create artifact, save) | Gemini 3.1 Pro + kimi-k2.5 (Ollama) | Custom async generators |
| **Secretary** | `secretary/agent.ts` (330 lines) | Daily planning, roadmaps, calendar sync, preferences | Gemini 3.1 Pro | deepagents (LangGraph) |
| **Research** | `research/agent.ts` (600+ lines) | Deep research with virtual files, web search, note drafts | Gemini 3.1 Pro + kimi-k2.5 | Custom async generators |
| **Course Orchestrator** | `course/orchestrator.ts` (520+ lines) | End-to-end course generation (research → outline → lessons → quizzes → slides) | Gemini (configurable) | AsyncEventQueue pipeline |
| **Planner** | `planner.agent.ts` (515 lines) | Goal decomposition into steps with dependency tracking | OpenAI/Gemini (configurable) | Custom stateful |
| **Note Agent** | `note.agent.ts` | Note CRUD operations | Configurable | Custom |
| **Chat Agent** | `chat.agent.ts` | Conversational chat with thread history | Configurable | Custom |
| **Editor Agent** | `editor.agent.ts` | Inline markdown editing with diff proposals | Configurable | Custom |
| **Mission Orchestrator** | `missions.ts` (route-level) | Goal-to-execution mission workflow with approval gates | N/A (delegates) | SSE state machine |

### Current Streaming Pattern

All agents use async generators yielding events over SSE. Events follow this lifecycle: `thinking` → `[action-specific events]` → `text-delta` → `done | error`. The Deep Agent emits `decomposition`, `subtask-start/progress/complete`, `edit-proposal`, `artifact`. Research emits `note-draft`, `file-updated`, `todo-list`, `interrupt`. Course emits `stage-start/complete`, `outline-preview`, `lesson-progress`.

### Current Inter-Agent Communication

`SharedContextService` acts as a loose bus — agents write entries like `research_done`, `course_saved`, `note_created`, and other agents read them to enrich their prompts. This is a good foundation but lacks structured handoffs.

### Current Rate Limiting (Config Only)

Environment variables set `RATE_LIMIT_REQUESTS_PER_MINUTE=60` and `RATE_LIMIT_TOKENS_PER_DAY=100000`. No billing. No credits. No per-model tracking. No user-facing usage dashboard.

---

## 2. Problems with the Current Architecture

### 2.1 No Unified Agent Framework

Each agent is built differently. Secretary uses LangGraph/deepagents. Deep Agent uses custom task decomposition. Course uses AsyncEventQueue pipelines. Research uses mode-based routing. This means every new agent requires learning a different pattern, error handling varies per agent, and testing is inconsistent.

### 2.2 Model Coupling

Agents are hardcoded to specific models (mostly `gemini-3.1-pro-preview`). There's no model routing layer that could swap models based on task complexity, user tier, or cost constraints. Artifacts are tied to kimi-k2.5 via Ollama Cloud with manual Gemini fallback.

### 2.3 No Cost Awareness

No agent knows how much it's spending. There's no token counting, no per-request cost estimation, no budget enforcement. The rate limiter counts requests, not actual token consumption.

### 2.4 No Guardrails

No input validation beyond basic schema. No output safety filters. No PII detection. No content policy enforcement. No hallucination checks on research output. No citation verification.

### 2.5 Prompt Engineering is Ad-Hoc

System prompts are embedded inline in each agent file. No shared prompt library. No versioning. No A/B testing infrastructure. No prompt templates for common patterns (summarization, extraction, generation).

### 2.6 No Billing Infrastructure

No Stripe integration. No credit system. No usage metering. No way to monetize the AI features that are the core value proposition.

---

## 3. Unified Agent Framework Design

### 3.1 Architecture: LangGraph Core with Custom Orchestration Layer

After analyzing the current codebase and the 2026 framework landscape, the recommendation is to standardize on a **LangGraph-based core** with a thin custom orchestration layer on top. Here's why:

**Why LangGraph (not CrewAI or raw custom):**

- We already use `deepagents` (LangGraph-based) for Secretary — partial adoption exists
- LangGraph gives us graph-based control flow (nodes, edges, conditional routing) which maps perfectly to our task decomposition pattern in Deep Agent and Course Orchestrator
- Built-in checkpointing for long-running workflows (course generation can take minutes)
- Model-agnostic — works with any provider
- Production-grade: used by enterprises for stateful, high-stakes deployments
- Supports human-in-the-loop interrupts natively (we already need this for course outlines and research approval)

**Why NOT pure CrewAI:** CrewAI's role-based metaphor doesn't fit our domain. Our agents aren't "team members" — they're specialized pipelines (research → synthesize → generate). CrewAI is better for "marketing team" style orchestration, not our sequential/DAG workflows.

### 3.2 The Unified Agent Base Class

```
┌─────────────────────────────────────────────────────────────────┐
│                     BaseAgent (Abstract)                        │
│─────────────────────────────────────────────────────────────────│
│  - id: string                                                   │
│  - name: string                                                 │
│  - version: string                                              │
│  - modelConfig: ModelConfig (tier-aware)                        │
│  - guardrails: GuardrailChain                                   │
│  - promptTemplate: PromptTemplate                               │
│  - tools: Tool[]                                                │
│  - costTracker: CostTracker                                     │
│  - streamEvents(): AsyncGenerator<AgentEvent>                   │
│  - validateInput(input): ValidationResult                       │
│  - validateOutput(output): ValidationResult                     │
│  - estimateCost(input): CostEstimate                            │
│  - getUsageReport(): UsageReport                                │
│  - onError(error): ErrorRecoveryAction                          │
└─────────────────────────────────────────────────────────────────┘
         ▲              ▲               ▲              ▲
         │              │               │              │
   ┌─────┴──┐    ┌──────┴───┐    ┌─────┴──┐    ┌─────┴──────┐
   │ChatAgent│    │WriteAgent │    │Research │    │Orchestrator│
   │         │    │(edit/note)│    │Agent    │    │Agent       │
   └─────────┘    └──────────┘    └─────────┘    └────────────┘
```

### 3.3 The Orchestrator Pattern (Sub-Agent Delegation)

For complex workflows, we introduce `OrchestratorAgent` — a special agent that decomposes tasks and delegates to sub-agents via a LangGraph state graph:

```
User Request
     │
     ▼
┌─────────────┐
│  Router      │  ← Classifies: simple chat? editing? research? compound?
│  (fast, cheap)│
└──────┬──────┘
       │
       ├─── Simple → ChatAgent (direct response)
       │
       ├─── Edit → WriteAgent (single note edit)
       │
       ├─── Research → ResearchOrchestrator
       │         │
       │         ├── WebSearchAgent (gather sources)
       │         ├── SynthesisAgent (analyze & combine)
       │         ├── WriterAgent (generate note/report)
       │         └── CitationAgent (verify & cite)
       │
       ├─── Course → CourseOrchestrator
       │         │
       │         ├── ResearchOrchestrator (reuse!)
       │         ├── OutlineAgent (structure)
       │         ├── LessonWriterAgent (content per lesson)
       │         ├── QuizGeneratorAgent (assessments)
       │         └── SlideGeneratorAgent (presentations)
       │
       ├─── Secretary → SecretaryOrchestrator
       │         │
       │         ├── PlannerAgent (daily/weekly plans)
       │         ├── CalendarAgent (sync & schedule)
       │         ├── RoadmapAgent (learning roadmaps)
       │         └── AnalyticsAgent (performance tracking)
       │
       └─── Compound → DeepOrchestrator
                 │
                 ├── TaskDecomposer (break into subtasks)
                 ├── [Delegates to above agents per subtask]
                 └── ResultAggregator (combine outputs)
```

### 3.4 Key Design Principles

**Composability:** Every agent can be used standalone OR as a sub-agent. ResearchOrchestrator is used directly from the `/research` route AND as a sub-agent inside CourseOrchestrator. This eliminates the duplicated research logic that currently exists across research/agent.ts and course/orchestrator.ts.

**Streaming First:** Every agent implements `streamEvents()` returning `AsyncGenerator<AgentEvent>`. The unified event type replaces the current per-agent event schemas:

```typescript
interface AgentEvent {
  type: 'thinking' | 'text-delta' | 'tool-call' | 'tool-result' |
        'artifact' | 'edit-proposal' | 'stage-update' | 'interrupt' |
        'cost-update' | 'done' | 'error'
  agentId: string
  parentAgentId?: string  // for sub-agent tracking
  timestamp: number
  data: Record<string, unknown>
  tokenUsage?: { input: number; output: number; model: string }
}
```

**Budget-Aware Execution:** Every agent call receives a `CostBudget` — the maximum tokens/cost it can spend. Orchestrators distribute budget across sub-agents. If a sub-agent approaches its budget, it gracefully degrades (shorter response, skip optional steps) rather than failing.

---

## 4. Agent Catalog & Routing

### 4.1 Final Agent Inventory

**Tier 1 — Core Agents (always available):**

| Agent | Purpose | Default Model | Fallback Model |
|-------|---------|---------------|----------------|
| **ChatAgent** | Conversational Q&A, general chat | Gemini 2.5 Flash | DeepSeek V3 |
| **WriteAgent** | Note creation, inline editing, markdown generation | Gemini 2.5 Pro | Claude Haiku 4.5 |
| **SummaryAgent** | Summarize documents, conversations, research | Gemini 2.5 Flash | DeepSeek V3 |

**Tier 2 — Orchestrator Agents (compound workflows):**

| Agent | Purpose | Orchestration Model | Sub-Agent Models |
|-------|---------|-------------------|-----------------|
| **ResearchOrchestrator** | Multi-step research with sources, synthesis, report | Gemini 2.5 Pro (planning) | Flash (search), Pro (synthesis) |
| **CourseOrchestrator** | Full course generation pipeline | Gemini 2.5 Pro (planning) | Flash (lessons), Pro (quizzes) |
| **SecretaryOrchestrator** | Daily planning, roadmaps, calendar | Gemini 2.5 Flash (fast) | Flash (all sub-tasks) |
| **DeepOrchestrator** | Compound request decomposition | Gemini 2.5 Pro | Delegates to other agents |

**Tier 3 — Specialized Sub-Agents:**

| Agent | Purpose | Model | Notes |
|-------|---------|-------|-------|
| **WebSearchAgent** | Tavily search + result processing | Gemini 2.5 Flash | Cheapest possible |
| **SynthesisAgent** | Combine multiple sources into coherent analysis | Gemini 2.5 Pro | Needs reasoning |
| **CitationAgent** | Verify claims, add citations | Gemini 2.5 Flash | Verification task |
| **OutlineAgent** | Generate structured outlines | Gemini 2.5 Flash | Planning task |
| **QuizGeneratorAgent** | Generate assessments from content | Gemini 2.5 Flash | Template-based |
| **SlideGeneratorAgent** | Create slide content | Gemini 2.5 Flash | Structured output |
| **ArtifactAgent** | Generate interactive components (HTML/React) | Gemini 2.5 Pro | Needs code quality |
| **PlannerAgent** | Goal decomposition, daily/weekly plans | Gemini 2.5 Flash | Fast planning |
| **CalendarAgent** | Google Calendar sync & scheduling | Gemini 2.5 Flash | Tool-heavy |
| **VisionAgent** | OCR, image understanding | Gemini 2.5 Flash | Native multimodal |
| **ImageGenAgent** | Generate images for notes/slides | Imagen 4 Fast | $0.02/image |

### 4.2 The Router

The Router is the entry point for all AI requests. It replaces the current `isCompoundRequest()` check in `agent.ts`:

```typescript
// Router classification (runs on cheapest model)
interface RouteDecision {
  agent: string           // which agent handles this
  complexity: 'simple' | 'moderate' | 'complex'
  estimatedTokens: number // rough estimate for budget
  modelTier: 'flash' | 'pro' | 'premium'  // based on task + user tier
}
```

The Router itself uses Gemini 2.5 Flash (cheapest: $0.30/$2.50 per 1M tokens) with a structured output schema. Classification adds ~200 tokens of overhead (~$0.0005 per request — negligible).

### 4.3 Model Routing by User Tier

| User Tier | Simple Tasks | Complex Tasks | Research/Course | Image Gen |
|-----------|-------------|---------------|-----------------|-----------|
| **Free** | DeepSeek V3 ($0.15/$0.75) | Gemini 2.5 Flash ($0.30/$2.50) | Gemini Flash (capped) | Imagen 4 Fast ($0.02) |
| **Pro ($12/mo)** | Gemini 2.5 Flash | Gemini 2.5 Pro ($1.25/$10) | Pro (full) | Imagen 4 Fast |
| **Team ($20/mo/seat)** | Gemini 2.5 Flash | Gemini 2.5 Pro | Pro (full) + longer sessions | Imagen 4 Standard ($0.04) |

---

## 5. Model Strategy & Cost Optimization

### 5.1 Model Pricing Matrix (March 2026 Verified)

| Model | Input/1M | Output/1M | Best For | Speed |
|-------|----------|-----------|----------|-------|
| **Gemini 2.5 Flash** | $0.30 | $2.50 | Routing, summaries, simple generation, planning | Very fast |
| **Gemini 2.5 Pro** | $1.25 | $10.00 | Complex writing, synthesis, code gen, artifacts | Fast |
| **Gemini 2.5 Pro (batch)** | $0.625 | $5.00 | Async course gen, bulk research | Delayed |
| **DeepSeek V3.1** | $0.15 | $0.75 | Free tier chat, simple Q&A | Fast |
| **DeepSeek R1** | $0.55 | $2.19 | Reasoning tasks (outline planning) | Medium |
| **Claude Haiku 4.5** | $1.00 | $5.00 | Fallback for writing quality | Fast |
| **Claude Sonnet 4.5** | $3.00 | $15.00 | Premium writing (Team tier) | Medium |
| **GPT-4o mini** | $0.15 | $0.60 | Embeddings context, structured extraction | Very fast |
| **Imagen 4 Fast** | — | $0.02/img | Note illustrations, slide images | Fast |
| **Imagen 4 Standard** | — | $0.04/img | Higher quality images (Team tier) | Medium |

### 5.2 Cost Per Feature (Estimated)

| Feature | Avg Tokens (in+out) | Model | Cost/Use | Monthly (100 uses) |
|---------|---------------------|-------|----------|---------------------|
| **Chat message** | 1K in + 500 out | Flash | $0.0016 | $0.16 |
| **Note generation** | 2K in + 2K out | Flash | $0.0056 | $0.56 |
| **Inline edit** | 3K in + 1K out | Flash | $0.0034 | $0.34 |
| **Research session** | 15K in + 8K out | Pro | $0.099 | $9.90 |
| **Course generation** | 50K in + 30K out | Pro (batch) | $0.181 | $18.10 |
| **Daily plan** | 3K in + 2K out | Flash | $0.0059 | $0.59 |
| **Image generation** | — | Imagen Fast | $0.02 | $2.00 |
| **OCR/Vision** | 1K in + 500 out | Flash | $0.0016 | $0.16 |

### 5.3 Cost Optimization Strategies

**Strategy 1 — Tiered Model Routing:** Use Flash ($0.30/$2.50) for 80% of requests, Pro ($1.25/$10) for complex tasks. This alone reduces average cost by 60% vs using Pro for everything.

**Strategy 2 — Batch API for Async Work:** Course generation and bulk research can use Gemini Batch API at 50% discount. A course that costs $0.18 in real-time costs $0.09 in batch mode. Queue non-urgent work.

**Strategy 3 — Prompt Caching:** Gemini and Anthropic both offer prompt caching (up to 90% savings on Anthropic). Cache system prompts, common context, and repeated document content. For a 5K-token system prompt used 1000 times/day, caching saves ~$1.50/day.

**Strategy 4 — Smart Context Windowing:** Don't send full conversation history. Use a sliding window of last 10 messages + a summary of older messages. Research shows 3K tokens of summary + 5K recent context performs within 5% of full history at 50% the cost.

**Strategy 5 — Early Termination:** If the Router classifies a request as "simple chat" and the Flash model handles it well, don't escalate. Only route to Pro when Flash confidence is low (via a confidence check on the first response).

**Strategy 6 — DeepSeek for Free Tier:** At $0.15/$0.75 per 1M tokens, DeepSeek V3.1 is 2x cheaper than Gemini Flash. Quality is sufficient for basic chat and simple note generation. Reserve Gemini Flash/Pro for paid tiers.

### 5.4 Build vs. Host Decision

**Verdict: Use APIs, not self-hosted models.** Here's the math:

Self-hosting a 70B model on A100s costs ~$3,000-5,000/month. You break even at ~70M tokens/day. At launch with 100-1000 users, you'll process maybe 1-5M tokens/day. Self-hosting would cost 10-50x more than API calls at this scale.

**Revisit self-hosting when:** Daily token volume exceeds 50M tokens/day consistently (roughly 10,000+ daily active users with heavy usage). At that point, self-hosting DeepSeek or Llama on reserved GPU instances becomes cost-effective.

---

## 6. Guardrails & Safety Layer

### 6.1 Guardrail Chain Architecture

Every agent request passes through a guardrail chain before and after LLM execution:

```
User Input
    │
    ▼
┌──────────────────┐
│  INPUT GUARDRAILS │
│──────────────────│
│  1. Rate Limiter  │ ← Token bucket per user
│  2. Budget Check  │ ← Does user have credits?
│  3. Input Sanitize│ ← Strip injection attempts
│  4. PII Detector  │ ← Flag/redact personal info
│  5. Content Policy│ ← Block prohibited requests
│  6. Context Size  │ ← Trim if over model limit
└────────┬─────────┘
         │
         ▼
    [LLM Execution]
         │
         ▼
┌───────────────────┐
│  OUTPUT GUARDRAILS │
│───────────────────│
│  1. Token Counter  │ ← Track actual usage
│  2. Cost Calculator│ ← Compute real cost
│  3. PII Scanner    │ ← Catch leaked PII
│  4. Hallucination  │ ← Check citations (research)
│  5. Format Validate│ ← Ensure valid markdown/JSON
│  6. Safety Filter  │ ← Content safety check
└────────┬──────────┘
         │
         ▼
    Response to User
```

### 6.2 Guardrail Implementations

**Rate Limiter:** Token bucket algorithm per user. Free tier: 20 requests/minute, 50K tokens/day. Pro tier: 60 requests/minute, 500K tokens/day. Team tier: 120 requests/minute, 2M tokens/day.

**Budget Check:** Before executing, estimate cost. If user's remaining credits can't cover the estimate, return a "credits low" warning with the option to proceed (spending remaining credits) or upgrade.

**Input Sanitization:** Strip prompt injection patterns. Detect attempts to override system prompts. Log suspicious patterns for review.

**PII Detector:** Regex + lightweight model scan for emails, phone numbers, SSNs, credit card numbers in both input and output. Flag for user awareness but don't block (user's own data).

**Hallucination Check (Research):** For research output, verify that cited URLs are real (HEAD request), that quoted text actually appears in source material, and that statistical claims are consistent across the document.

**Format Validation:** Ensure markdown output is valid, JSON artifacts parse correctly, and edit proposals produce valid diffs.

### 6.3 Safety Configuration

```typescript
interface GuardrailConfig {
  maxInputTokens: number      // Per-request input limit
  maxOutputTokens: number     // Per-request output limit
  maxSessionTokens: number    // Total session budget
  enablePIIDetection: boolean
  enableContentFilter: boolean
  enableCitationCheck: boolean // For research agents only
  costWarningThreshold: number // Warn when cost exceeds this
  blockedTopics: string[]     // Content policy
}
```

---

## 7. Unified Prompt Engineering System

### 7.1 Prompt Template Architecture

Replace inline prompts with a structured template system:

```
packages/ai/src/prompts/
├── base/
│   ├── system.ts          # Core identity, capabilities, constraints
│   ├── safety.ts          # Safety instructions (shared across all agents)
│   └── formatting.ts      # Output format instructions
├── agents/
│   ├── chat.ts            # Chat-specific instructions
│   ├── write.ts           # Writing/editing instructions
│   ├── research.ts        # Research methodology instructions
│   ├── course.ts          # Course generation instructions
│   ├── secretary.ts       # Planning/scheduling instructions
│   └── artifact.ts        # Code/component generation instructions
├── templates/
│   ├── summarize.ts       # Reusable summarization template
│   ├── extract.ts         # Information extraction template
│   ├── synthesize.ts      # Multi-source synthesis template
│   ├── outline.ts         # Outline generation template
│   └── evaluate.ts        # Quality evaluation template
└── index.ts               # Prompt builder with composition
```

### 7.2 Prompt Composition

```typescript
class PromptBuilder {
  private parts: PromptPart[] = []

  withBase(): this              // Add system identity
  withSafety(): this            // Add safety instructions
  withAgent(agent: string): this // Add agent-specific instructions
  withContext(ctx: AgentContext): this  // Add dynamic context
  withTemplate(template: string, vars: Record<string, string>): this
  withUserTier(tier: UserTier): this   // Adjust instructions per tier
  build(): string
}

// Usage in agents:
const prompt = new PromptBuilder()
  .withBase()
  .withSafety()
  .withAgent('research')
  .withTemplate('synthesize', { sourceCount: '5', format: 'markdown' })
  .withContext(sharedContext)
  .withUserTier(user.tier)
  .build()
```

### 7.3 Prompt Versioning

Every prompt template has a version. When we change a prompt, we create a new version. The system tracks which prompt version produced which output, enabling A/B testing and regression detection.

```typescript
interface PromptVersion {
  id: string
  agent: string
  version: string       // semver
  template: string
  createdAt: Date
  metrics?: {
    avgQuality: number  // From user feedback
    avgTokens: number   // Cost tracking
    errorRate: number   // Failure rate
  }
}
```

---

## 8. Billing System Architecture

### 8.1 Credit-Based Pricing Model

**Why credits (not raw token pricing):**

- Users don't understand tokens. "You have 500 credits" is clearer than "You have 2.5M tokens remaining."
- Credits abstract away model-specific pricing. If we switch models, credit costs stay stable for users.
- Credits enable bundling. A "research session" costs 10 credits whether it uses 15K or 25K tokens internally — we absorb the variance.

### 8.2 Credit Definition

**1 credit = approximately $0.01 of AI compute cost to us.** This gives us room for a healthy margin while keeping credits easy to reason about.

| Action | Credits | Our Cost | Margin |
|--------|---------|----------|--------|
| Chat message (simple) | 1 | ~$0.002 | 80% |
| Note generation | 2 | ~$0.006 | 70% |
| Inline edit | 2 | ~$0.004 | 80% |
| Summary | 2 | ~$0.005 | 75% |
| Research session | 15 | ~$0.10 | 33% |
| Course generation | 30 | ~$0.18 | 40% |
| Daily plan | 2 | ~$0.006 | 70% |
| Image generation | 3 | ~$0.02 | 33% |
| OCR/Vision | 1 | ~$0.002 | 80% |

**Average blended margin: ~60%.** This is healthy for a SaaS AI product and accounts for infrastructure overhead, Supabase costs, and occasional expensive edge cases.

### 8.3 Pricing Tiers

| Tier | Monthly Price | Credits/Month | Overage | Target User |
|------|-------------|---------------|---------|-------------|
| **Free** | $0 | 50 credits | Not available (hard cap) | Trial users, students |
| **Pro** | $12/month | 1,000 credits | $0.02/credit | Individual power users |
| **Team** | $25/seat/month | 2,000 credits/seat | $0.015/credit | Teams, organizations |
| **Enterprise** | Custom | Custom | Custom | Large orgs |

**What 50 free credits gets you:** ~25 chat messages + 5 note generations + 2 research sessions. Enough to experience the core value in a single session.

**What 1,000 Pro credits gets you:** ~200 chat messages + 50 note generations + 20 research sessions + 5 course generations + daily planning all month. Covers a heavy individual user.

### 8.4 Stripe Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Billing Architecture                       │
│─────────────────────────────────────────────────────────────│
│                                                               │
│  User Action ──► Guardrail (budget check) ──► Agent Executes │
│                         │                          │          │
│                    ┌────┴────┐              ┌──────┴──────┐  │
│                    │ Credits  │              │ Token Counter│  │
│                    │ Ledger   │◄─────────────│ (real usage) │  │
│                    │ (Supabase)│              └─────────────┘  │
│                    └────┬────┘                                │
│                         │                                     │
│                    ┌────┴────┐                                │
│                    │  Stripe  │                                │
│                    │  Meter   │ ← Report usage hourly         │
│                    └────┬────┘                                │
│                         │                                     │
│                    ┌────┴────────────┐                        │
│                    │ Stripe Billing   │                        │
│                    │ - Subscriptions  │                        │
│                    │ - Usage metering │                        │
│                    │ - Overage charges│                        │
│                    │ - Invoicing      │                        │
│                    └─────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

**Implementation approach using Stripe:**

1. **Stripe Products:** One product per tier (Free, Pro, Team)
2. **Stripe Prices:** Base subscription price + metered component for overage
3. **Stripe Meters:** Report credit usage events to Stripe's metering API
4. **Stripe Checkout:** For subscription signup
5. **Stripe Customer Portal:** For self-service plan management
6. **Webhooks:** `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted` to sync state

### 8.5 Credit Ledger Design

The credit ledger is the source of truth for how many credits a user has. It's an append-only log (like a bank account):

```typescript
interface CreditTransaction {
  id: string
  userId: string
  type: 'grant' | 'debit' | 'refund' | 'expire' | 'purchase'
  amount: number          // positive for grants, negative for debits
  balance: number         // running balance after this transaction
  source: string          // 'subscription_renewal' | 'agent:research' | 'admin_grant' | 'purchase'
  metadata: {
    agentId?: string
    sessionId?: string
    model?: string
    tokensUsed?: number
    stripePriceId?: string
  }
  createdAt: Date
  expiresAt?: Date        // Credits expire after 30 days (free) or billing cycle (paid)
}
```

---

## 9. Token Tracking & Usage Monitoring

### 9.1 Real-Time Token Tracking

Every LLM call goes through a `TokenTracker` middleware that wraps provider calls:

```typescript
class TokenTracker {
  async trackCall(params: {
    userId: string
    agentId: string
    sessionId: string
    model: string
    inputTokens: number
    outputTokens: number
  }): Promise<void> {
    // 1. Write to usage_events table (append-only, high write throughput)
    // 2. Update user's daily/monthly aggregates (materialized view)
    // 3. Compute credit cost: credits = costFunction(model, inputTokens, outputTokens)
    // 4. Debit from credit ledger
    // 5. Check if approaching limit → emit warning event
    // 6. Report to Stripe meter (batched, hourly)
  }
}
```

### 9.2 Usage Analytics Tables

```sql
-- Raw usage events (append-only, partitioned by month)
CREATE TABLE usage_events (
  id UUID DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  agent_id TEXT NOT NULL,
  session_id UUID,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  credits_used NUMERIC(10,4) NOT NULL,
  cost_usd NUMERIC(10,6) NOT NULL,  -- Our actual cost
  created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Daily aggregates (materialized, refreshed every hour)
CREATE MATERIALIZED VIEW usage_daily AS
SELECT
  user_id,
  DATE(created_at) as date,
  agent_id,
  model,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(credits_used) as total_credits,
  SUM(cost_usd) as total_cost,
  COUNT(*) as request_count
FROM usage_events
GROUP BY user_id, DATE(created_at), agent_id, model;

-- User credit balance (real-time)
CREATE TABLE credit_balances (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  balance NUMERIC(10,4) NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'free',
  monthly_allocation INTEGER NOT NULL DEFAULT 50,
  overage_enabled BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 9.3 Admin Dashboard Metrics

The admin dashboard should show:

- **Revenue metrics:** MRR, credit purchase revenue, overage revenue
- **Cost metrics:** Total API spend by model, cost per user, margin per feature
- **Usage metrics:** DAU/MAU, requests per user, most-used agents, token consumption trends
- **Health metrics:** Error rates per agent, average latency, model fallback frequency
- **Conversion metrics:** Free-to-Pro conversion rate, credit exhaustion rate (how many free users hit their limit)

### 9.4 User-Facing Usage Dashboard

Users see:

- Credits remaining (with visual bar)
- Credits used today/this week/this month
- Breakdown by feature (chat, research, courses, etc.)
- Estimated credits needed for planned tasks
- Upgrade prompt when credits are low

---

## 10. Free Credits & Onboarding Strategy

### 10.1 First 100 Users Launch Strategy

| Incentive | Credits | Cost to Us | Purpose |
|-----------|---------|-----------|---------|
| **Signup bonus** | 50 credits | ~$0.50/user | Let them try everything |
| **First 100 users bonus** | +100 credits (total 150) | ~$1.50/user | Reward early adopters |
| **Referral bonus** | +50 credits per referral | ~$0.50/referral | Growth loop |
| **Feedback bonus** | +25 credits for survey | ~$0.25/user | Collect product feedback |

**Total cost for 100 early users at max:** 100 × (150 + 50 referral + 25 feedback) × $0.01 = **$225 maximum.** This is negligible for a launch budget.

### 10.2 Credit Expiration

- **Free tier credits:** Expire after 30 days of inactivity (not from grant date). This keeps engaged users happy while preventing dormant account accumulation.
- **Paid tier credits:** Reset each billing cycle. Unused credits do NOT roll over (industry standard). This simplifies accounting and encourages usage.
- **Bonus credits:** Expire 90 days from grant. Creates gentle urgency without pressure.

### 10.3 Managing Token/Credit Abuse

**Anti-abuse measures:**

1. **Request rate limiting:** Hard cap even within credit balance (prevents burst abuse)
2. **Session length limits:** Research sessions capped at 30 minutes, courses at 60 minutes
3. **Output length limits:** Single generation capped at 4K tokens (free) / 8K tokens (Pro) / 16K tokens (Team)
4. **IP-based deduplication:** Prevent multiple free accounts from same IP
5. **Phone verification:** Required after consuming 50% of free credits (reduces bot signups)
6. **Anomaly detection:** Flag users consuming 10x average credits for manual review

---

## 11. Database Schema Changes

### 11.1 New Tables Required

```sql
-- User subscription and billing
CREATE TABLE subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  tier TEXT NOT NULL DEFAULT 'free',  -- free | pro | team | enterprise
  status TEXT NOT NULL DEFAULT 'active',  -- active | canceled | past_due
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit ledger (append-only)
CREATE TABLE credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL,  -- grant | debit | refund | expire | purchase
  amount NUMERIC(10,4) NOT NULL,
  balance_after NUMERIC(10,4) NOT NULL,
  source TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage events (high-volume, partitioned)
CREATE TABLE usage_events (
  id UUID DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  session_id UUID,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  credits_used NUMERIC(10,4) NOT NULL,
  cost_usd NUMERIC(10,6) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Credit balances (real-time, updated via triggers)
CREATE TABLE credit_balances (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  balance NUMERIC(10,4) NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'free',
  monthly_allocation INTEGER NOT NULL DEFAULT 50,
  overage_enabled BOOLEAN DEFAULT FALSE,
  total_credits_used NUMERIC(10,4) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prompt versions (for A/B testing)
CREATE TABLE prompt_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL,
  version TEXT NOT NULL,
  template TEXT NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  avg_quality NUMERIC(3,2),
  avg_tokens INTEGER,
  error_rate NUMERIC(5,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent configurations (model routing)
CREATE TABLE agent_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL UNIQUE,
  default_model TEXT NOT NULL,
  fallback_model TEXT,
  max_tokens INTEGER,
  temperature NUMERIC(3,2),
  tier_overrides JSONB DEFAULT '{}',  -- { "free": { "model": "deepseek-v3" } }
  guardrails JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 11.2 Supabase RPC Functions

```sql
-- Debit credits atomically
CREATE OR REPLACE FUNCTION debit_credits(
  p_user_id UUID,
  p_amount NUMERIC,
  p_source TEXT,
  p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB AS $$
DECLARE
  v_balance NUMERIC;
  v_tier TEXT;
  v_overage BOOLEAN;
BEGIN
  -- Lock row for update
  SELECT balance, tier, overage_enabled
  INTO v_balance, v_tier, v_overage
  FROM credit_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Check if user can afford this
  IF v_balance < p_amount AND NOT v_overage THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_credits', 'balance', v_balance);
  END IF;

  -- Debit
  UPDATE credit_balances
  SET balance = balance - p_amount,
      total_credits_used = total_credits_used + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Log transaction
  INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, metadata)
  VALUES (p_user_id, 'debit', -p_amount, v_balance - p_amount, p_source, p_metadata);

  RETURN jsonb_build_object('success', true, 'balance', v_balance - p_amount);
END;
$$ LANGUAGE plpgsql;
```

---

## 12. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-3)

**Goal:** Unified agent base class, model routing, token tracking.

- Implement `BaseAgent` abstract class with standardized `streamEvents()`, `estimateCost()`, `validateInput/Output()`
- Implement `ModelRouter` service that selects model based on task + user tier
- Implement `TokenTracker` middleware that wraps all LLM calls
- Implement `PromptBuilder` with base/safety/agent template composition
- Migrate `ChatAgent` and `WriteAgent` (simplest agents) to new framework
- Create `usage_events` and `credit_balances` tables
- Write tests for all new infrastructure

### Phase 2: Agent Migration (Weeks 4-6)

**Goal:** Migrate all existing agents to unified framework.

- Migrate `ResearchAgent` → `ResearchOrchestrator` with sub-agents (WebSearch, Synthesis, Writer, Citation)
- Migrate `SecretaryAgent` → `SecretaryOrchestrator` (already LangGraph-based, lighter migration)
- Migrate `CourseOrchestrator` to use `ResearchOrchestrator` as sub-agent (eliminate duplicated research logic)
- Migrate `DeepAgent` → `DeepOrchestrator` that delegates to other agents
- Migrate `EditorAgent`, `NoteAgent`, `PlannerAgent`
- Implement `Router` agent for request classification
- Remove old agent implementations

### Phase 3: Guardrails & Safety (Weeks 7-8)

**Goal:** Input/output guardrail chain on all agents.

- Implement `GuardrailChain` with rate limiter, budget check, input sanitization
- Implement output guardrails: token counting, cost calculation, format validation
- Implement PII detection (regex + pattern matching, no extra model cost)
- Implement citation verification for research output
- Add safety configuration per agent
- Load testing and guardrail tuning

### Phase 4: Billing & Credits (Weeks 9-11)

**Goal:** Stripe integration, credit system, user dashboard.

- Set up Stripe Products, Prices, and Meters
- Implement `CreditLedger` service with atomic debit/grant operations
- Implement Stripe webhook handlers (subscription events)
- Implement credit purchase flow (Stripe Checkout)
- Build user-facing usage dashboard (Vue component in web app)
- Build admin billing dashboard
- Implement free tier credit grants (signup bonus, early adopter bonus)
- End-to-end testing of billing flow

### Phase 5: Launch Prep (Weeks 12-13)

**Goal:** Production readiness.

- Implement anti-abuse measures (rate limiting, phone verification, anomaly detection)
- Load testing at 10x expected launch traffic
- Set up monitoring and alerting (cost anomalies, error rates, latency)
- Set up Stripe test mode end-to-end
- Documentation for MCP/Skills integration path (Claude Code/Codex connection)
- Soft launch to first 100 users with bonus credits

---

## 13. Cost Projections

### 13.1 Launch Scenario (100 Users, Month 1)

**Assumptions:** 100 users, 60% free / 30% Pro / 10% Team. Average 20 sessions/user/month.

| Segment | Users | Avg Credits/User/Month | Total Credits | Our Cost |
|---------|-------|----------------------|---------------|----------|
| Free | 60 | 40 (of 50) | 2,400 | $24 |
| Pro | 30 | 600 (of 1,000) | 18,000 | $180 |
| Team | 10 | 1,200 (of 2,000) | 12,000 | $120 |
| **Total** | **100** | — | **32,400** | **$324** |

**Revenue:** (30 × $12) + (10 × $25) = $360 + $250 = **$610/month**

**Gross Margin: 47% at launch.** This is healthy for early stage. Margins improve further as we optimize model routing and leverage batch APIs. Target is 60%+ at scale.

### 13.2 Growth Scenario (1,000 Users, Month 6)

| Segment | Users | Total Credits | Our Cost | Revenue |
|---------|-------|---------------|----------|---------|
| Free | 500 | 15,000 | $150 | $0 |
| Pro | 350 | 210,000 | $2,100 | $4,200 |
| Team | 150 | 300,000 | $3,000 | $3,750 |
| Overage | — | 50,000 | $500 | $850 |
| **Total** | **1,000** | **575,000** | **$5,750** | **$8,800** |

**Gross Margin at 1K users: ~35%.** With corrected Team pricing ($25/seat, 2,000 credits), margins are healthier. Further optimization through model routing and batch API can push this to 45%+.

### 13.3 Key Financial Levers

1. **Model routing efficiency:** Moving 10% more traffic from Pro to Flash saves ~$200/month at 1K users
2. **Batch API adoption:** Using Gemini batch for course generation (50% discount) saves ~$300/month
3. **Prompt caching:** Reduces repeated context costs by 30-50%
4. **Free tier conversion:** Every 1% improvement in free-to-Pro conversion = +$12 MRR per 100 free users
5. **Credit expiration:** ~15-20% of granted credits typically expire unused, reducing real cost

---

## Appendix A: MCP/Skills Integration Path

For users connecting through Claude Code or Codex via MCP/Skills, the AI features of the platform become tools that Claude Code can invoke. This is a separate distribution channel that doesn't require billing (users pay Anthropic for Claude Code). However, if users want to use AI features directly in the web platform without Claude Code, that's when our billing system kicks in.

The two paths coexist: MCP tools expose our agents as external capabilities (no billing needed — the LLM provider pays), and the web platform provides the same capabilities with our billing layer on top.

## Appendix B: Dual-Channel Architecture

```
Channel 1: Web Platform (our billing)
  User → Web UI → API → [Budget Check] → Agent → [Token Track] → Response

Channel 2: MCP/Skills (external LLM billing)
  Claude Code → MCP Server → API → Agent → Response
  (No budget check — the MCP consumer handles their own costs)
```

The agents themselves are identical. Only the middleware layer (budget check, token tracking, credit debit) differs based on the entry channel.

---

*This document should be reviewed and iterated on before implementation begins. Key decisions that need stakeholder input: final pricing tiers, free credit amounts, and Phase 1 team allocation.*
