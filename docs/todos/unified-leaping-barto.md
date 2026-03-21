# Phase 1: Unified Model Selection & Token Tracking

**Date:** 2026-03-18
**Status:** In Progress
**Scope:** Centralize all model selection, add Gemini embedding support, add proper Ollama (local+cloud) support, add real token tracking

---

## Context

Every AI agent in the codebase creates its own LLM client with hardcoded model names — there are **40+ direct instantiations** scattered across 20+ files. All agents already use Gemini models (migrated previously), but the code is messy:
- Types still say `provider: 'openai'` with `displayName: 'GPT-4o'` for what is actually `gemini-3.1-pro-preview`
- Factory comments say "OpenAI GPT-5.2" but the code routes to Gemini
- Token usage is always `{ inputTokens: 0, outputTokens: 0 }` — zero tracking
- Ollama Cloud integration is a custom HTTP client when it could use OpenAI-compatible API
- No way to swap models by task complexity, user tier, or provider preference

This plan makes every AI call go through a central model registry and client factory, adds real token tracking, and properly integrates Ollama (local + cloud).

---

## Current State: Complete Inventory

### Two SDK patterns (both stay — LangGraph agents require LangChain):

**Pattern A — OpenAI SDK via Gemini compat endpoint (26 instances):**
All use: `new OpenAI({ apiKey: process.env.GOOGLE_AI_API_KEY || '', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' })`

| File | Lines | Methods |
|------|-------|---------|
| `agents/chat.agent.ts` | 178, 268, 363 | `streamWithTools`, `generateEmbedding`, `streamWithRecommendations` |
| `agents/note.agent.ts` | 375, 522, 754 | `executeCreate`, `executeUpdate`, `executeOrganize` |
| `agents/editor.agent.ts` | 411, 827, 876, 1355, 2038, 2119 | `processEditRequest`, `generateRewrite`, `summarize`, `complete`, `chat`, `explain` |
| `agents/deep-agent.ts` | 414, 692, 796 | `decompose`, `executeSubtask`, `synthesize` |
| `agents/planner.agent.ts` | 152, 257, 428 | `decompose`, `executeStep`, `summarize` |
| `agents/explain/index.ts` | 142 | `stream` |
| `agents/subagents/table.subagent.ts` | 95, 200 | `generateTable`, `improveTable` |
| `agents/subagents/artifact.subagent.ts` | 85 | `generateArtifact` |
| `agents/research/agent.ts` | 169, 234, 429, 471 | `planResearch`, `executeSearch`, `synthesize`, `generateNoteDraft` |

**Pattern B — LangChain ChatGoogleGenerativeAI (14 instances):**
All use: `new ChatGoogleGenerativeAI({ apiKey, model, temperature })`

| File | Lines | Context |
|------|-------|---------|
| `agents/secretary/agent.ts` | 60 | Main secretary LLM |
| `agents/secretary/tools.ts` | 445 | Subagent tool LLM |
| `agents/secretary/subagents.ts` | 47, 88 | Planner + Calendar subagents |
| `agents/editor-deep/agent.ts` | 124 | Editor deep agent LLM |
| `agents/course/orchestrator.ts` | 219, 289, 294 | Orchestrator + Flash + Pro subagent LLMs |
| `agents/course/course-tools.ts` | 285, 744, 960, 1175 | Lesson/quiz/slides tool LLMs |
| `agents/course/slide-generator.ts` | 18 | Slide gen LLM |
| `agents/research/agent.ts` | 515 | Deep research graph LLM |

**Pattern C — Direct OpenAI for embeddings (1 instance):**
| File | Line | Context |
|------|------|---------|
| `agents/course/research/rag-indexer.ts` | 26 | `new OpenAI({ apiKey: openaiApiKey })` for `text-embedding-3-small` |

### Hardcoded model strings (all locations):

| Model | Count | Used By |
|-------|-------|---------|
| `gemini-3.1-pro-preview` | 20+ | Almost everything (chat, edit, note, planner, secretary, etc.) |
| `gemini-3-flash-preview` | 4 | Course tools (lessons, quizzes, slides) |
| `gemini-3-pro-preview` | 2 | Course slides writer |
| `deep-research-pro-preview-12-2025` | 2 | Gemini Deep Research API |
| `kimi-k2.5` | 2 | Ollama Cloud artifacts |
| `text-embedding-3-large` | 3 | OpenAI embeddings |
| `text-embedding-3-small` | 1 | RAG indexer embeddings |

---

## Implementation Steps

### Step 1: Model Registry (`packages/ai/src/providers/model-registry.ts`) — NEW FILE

Central catalog of every model the system can use. Single source of truth for model names, endpoints, pricing, and capabilities.

```typescript
// packages/ai/src/providers/model-registry.ts

export type ModelProvider = 'gemini' | 'ollama-cloud' | 'ollama-local'
export type ModelCapability = 'chat' | 'tool-calling' | 'vision' | 'embedding' | 'research' | 'image-gen'

export interface ModelEntry {
  id: string                    // e.g. 'gemini-3.1-pro-preview'
  provider: ModelProvider
  displayName: string           // e.g. 'Gemini 3.1 Pro'
  contextWindow: number
  capabilities: ModelCapability[]
  costPer1kInput: number        // USD cents
  costPer1kOutput: number       // USD cents
  maxOutputTokens: number
  supportsToolChoice: boolean   // Ollama doesn't support tool_choice
}

// The actual catalog — edit this to add/remove models
export const MODEL_REGISTRY: Record<string, ModelEntry> = { ... }

// Task-to-model mapping (replaces factory.ts getModelNameForTask)
export type AITaskType = 'chat' | 'note-agent' | 'planner' | 'secretary' | 'editor' |
  'editor-deep' | 'completion' | 'rewrite' | 'summarize' | 'explain' |
  'artifact' | 'code' | 'slides' | 'research' | 'deep-research' | 'course' |
  'embedding' | 'table'

export function selectModel(taskType: AITaskType): ModelEntry { ... }
```

**Model Catalog Contents:**

| id | provider | displayName | contextWindow | costPer1kInput | costPer1kOutput | capabilities |
|----|----------|-------------|---------------|----------------|-----------------|--------------|
| `gemini-3.1-pro-preview` | gemini | Gemini 3.1 Pro | 2000000 | 0.125 | 1.0 | chat, tool-calling, vision |
| `gemini-3-flash-preview` | gemini | Gemini 3 Flash | 1000000 | 0.03 | 0.25 | chat, tool-calling, vision |
| `gemini-3-pro-preview` | gemini | Gemini 3 Pro | 1000000 | 0.125 | 1.0 | chat, tool-calling, vision, image-gen |
| `deep-research-pro-preview-12-2025` | gemini | Gemini Deep Research | N/A | 0 | 0 | research |
| `text-embedding-004` | gemini | Gemini Embedding | 2048 | 0 | 0 | embedding |
| `kimi-k2.5` | ollama-cloud | Kimi K2.5 | 131072 | 0 | 0 | chat, tool-calling |
| `qwen3.5` | ollama-cloud | Qwen 3.5 | 131072 | 0 | 0 | chat, tool-calling, vision |
| `deepseek-r1` | ollama-cloud | DeepSeek R1 | 131072 | 0 | 0 | chat |

**Gemini Embedding note:** Google provides `text-embedding-004` (free with API key, 768 dimensions, 2048 token limit). This replaces `text-embedding-3-large` from OpenAI, removing the OpenAI API key dependency entirely. Current Supabase pgvector uses 1536 dimensions — we'll keep using OpenAI embeddings for now and plan the migration in a later phase, but the registry should include the Gemini embedding model.

**selectModel() task mapping:**

| Task Type | Model | Rationale |
|-----------|-------|-----------|
| chat, note-agent, planner, secretary, editor, editor-deep, explain | `gemini-3.1-pro-preview` | Best quality for general tasks |
| completion, rewrite, summarize, table | `gemini-3.1-pro-preview` | Same — quality matters |
| artifact, code | `kimi-k2.5` (Ollama Cloud) | Free, good at code |
| slides | `gemini-3-pro-preview` | Image generation capability |
| course | `gemini-3-flash-preview` | Fast, cheap for course sub-tools; orchestrator uses pro |
| research | `gemini-3.1-pro-preview` | Quality reasoning |
| deep-research | `deep-research-pro-preview-12-2025` | Google's research API |
| embedding | `text-embedding-3-large` | Keep OpenAI for now (dimension compat) |

---

### Step 2: Client Factory (`packages/ai/src/providers/client-factory.ts`) — NEW FILE

Two factory functions — one for each SDK pattern. Every agent calls these instead of creating clients directly.

```typescript
// packages/ai/src/providers/client-factory.ts

import OpenAI from 'openai'
import type { ModelEntry } from './model-registry'

/**
 * For Pattern A agents (OpenAI SDK).
 * Returns an OpenAI client configured for the right provider endpoint.
 */
export function createOpenAIClient(model: ModelEntry): OpenAI { ... }

/**
 * For Pattern B agents (LangChain/deepagents).
 * Returns a ChatGoogleGenerativeAI or ChatOllama instance.
 */
export async function createLangChainModel(
  model: ModelEntry,
  options?: { temperature?: number }
): Promise<BaseChatModel> { ... }
```

**Endpoint routing logic:**

| Provider | OpenAI SDK baseURL | API Key env var |
|----------|-------------------|-----------------|
| `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai/` | `GOOGLE_AI_API_KEY` |
| `ollama-cloud` | `https://ollama.com/v1/` | `OLLAMA_API_KEY` |
| `ollama-local` | `http://localhost:11434/v1/` | none (use `'ollama'` as apiKey) |

Key insight from Ollama Cloud docs: Ollama exposes **full OpenAI-compatible endpoints** at `/v1/chat/completions`, `/v1/embeddings`, etc. So Ollama models work through the standard OpenAI SDK — no custom HTTP client needed. This means we can **delete the entire custom `ollama.ts` provider** (423 lines) and replace it with a 3-line config in the client factory.

**LangChain model routing:**

| Provider | LangChain Class | Package |
|----------|-----------------|---------|
| `gemini` | `ChatGoogleGenerativeAI` | `@langchain/google-genai` (already installed) |
| `ollama-cloud` / `ollama-local` | `ChatOllama` | `@langchain/ollama` (needs install) |

**Critical: Ollama limitations to handle in factory:**
- Strip `tool_choice` from requests (Ollama doesn't support it)
- Force base64 encoding for images (no URL support in Ollama)
- Ollama Cloud auth: `Authorization: Bearer $OLLAMA_API_KEY`

---

### Step 3: Token Tracker (`packages/ai/src/providers/token-tracker.ts`) — NEW FILE

Wraps every LLM call to capture real token usage. Currently all agents report `{ inputTokens: 0, outputTokens: 0 }`.

```typescript
// packages/ai/src/providers/token-tracker.ts

export interface TokenUsageEvent {
  model: string
  provider: ModelProvider
  taskType: AITaskType
  inputTokens: number
  outputTokens: number
  costCents: number          // Computed from model pricing
  durationMs: number
  userId?: string
  sessionId?: string
  timestamp: number
}

// In-memory accumulator (DB writes come in Phase 4)
class TokenTracker {
  private events: TokenUsageEvent[] = []

  record(event: TokenUsageEvent): void { ... }
  getSessionUsage(sessionId: string): { totalInput: number; totalOutput: number; totalCostCents: number } { ... }
  getRecentEvents(limit?: number): TokenUsageEvent[] { ... }
  clear(): void { ... }
}

export const tokenTracker = new TokenTracker()
```

**How token counts are captured per SDK:**

| SDK | How to get token counts |
|-----|------------------------|
| OpenAI SDK (streaming) | `chunk.usage` on final chunk (already exists in openai.ts, just not propagated) |
| OpenAI SDK (non-streaming) | `response.usage.prompt_tokens` / `completion_tokens` |
| Gemini compat via OpenAI SDK | Same as OpenAI SDK — Gemini compat endpoint returns `usage` in same format |
| Ollama via OpenAI SDK | Returns `usage` in OpenAI format at `/v1/chat/completions` |
| LangChain ChatGoogleGenerativeAI | `result.lc_kwargs?.response_metadata?.usage_metadata` → `{ promptTokenCount, candidatesTokenCount }` |
| LangChain ChatOllama | `result.response_metadata?.eval_count` (output tokens), `result.response_metadata?.prompt_eval_count` (input tokens) |
| Gemini native SDK (slides, image gen) | `result.response.usageMetadata` → `{ promptTokenCount, candidatesTokenCount }` |
| Deep Research API | No token counts available (Google doesn't expose them for the interactions API) |

**Integration approach — wrapper functions:**

Create `trackOpenAIStream()` and `trackLangChainCall()` utility wrappers:

```typescript
// Wraps OpenAI streaming to capture usage from final chunk
export async function* trackOpenAIStream(
  stream: AsyncIterable<OpenAI.ChatCompletionChunk>,
  meta: { model: string; taskType: AITaskType; userId?: string; sessionId?: string }
): AsyncGenerator<OpenAI.ChatCompletionChunk> {
  let usage = { inputTokens: 0, outputTokens: 0 }
  const start = Date.now()
  for await (const chunk of stream) {
    if (chunk.usage) {
      usage.inputTokens = chunk.usage.prompt_tokens
      usage.outputTokens = chunk.usage.completion_tokens
    }
    yield chunk
  }
  tokenTracker.record({ ...meta, ...usage, costCents: computeCost(meta.model, usage), durationMs: Date.now() - start, timestamp: Date.now() })
}
```

---

### Step 4: Replace All Agent Instantiations

This is the bulk of the work. Every hardcoded `new OpenAI(...)` and `new ChatGoogleGenerativeAI(...)` call gets replaced with a call to the client factory.

#### Step 4a: Create shared helper in each agent base

Add to each agent's constructor or top of file:
```typescript
import { selectModel } from '../providers/model-registry'
import { createOpenAIClient } from '../providers/client-factory'

// Before: new OpenAI({ apiKey: process.env.GOOGLE_AI_API_KEY || '', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' })
// After:
const modelEntry = selectModel('chat')
const client = createOpenAIClient(modelEntry)
```

#### Step 4b: Files to modify (Pattern A — OpenAI SDK agents)

Each file below has the inline `new OpenAI({ apiKey: process.env.GOOGLE_AI_API_KEY || '', baseURL: '...' })` pattern. Replace with `createOpenAIClient(selectModel(taskType))`.

**Strategy:** Most agents create the client in every method call. Instead, create it once in the constructor/class field and reuse. The client is stateless — safe to share.

| File | Current instances | Change |
|------|-------------------|--------|
| `agents/chat.agent.ts` | 3 (lines 178, 268, 363) | Add `private client: OpenAI` field, init in constructor via `createOpenAIClient(selectModel('chat'))`. Replace all 3 inline creations. For embedding at line 268: use separate `createOpenAIClient(selectModel('embedding'))`. |
| `agents/note.agent.ts` | 3 (lines 375, 522, 754) | Add `private client: OpenAI` field, init via `createOpenAIClient(selectModel('note-agent'))`. Replace all 3. |
| `agents/editor.agent.ts` | 6 (lines 411, 827, 876, 1355, 2038, 2119) | Add `private client: OpenAI` field, init via `createOpenAIClient(selectModel('editor'))`. Replace all 6. |
| `agents/deep-agent.ts` | 3 (lines 414, 692, 796) | Add `private client: OpenAI` field. For artifact (line ~574), use `selectModel('artifact')` → Ollama. For decompose/synthesize, use `selectModel('chat')`. |
| `agents/planner.agent.ts` | 3 (lines 152, 257, 428) | Add `private client: OpenAI` field, init via `createOpenAIClient(selectModel('planner'))`. |
| `agents/explain/index.ts` | 1 (line 142) | Add client field, init via `createOpenAIClient(selectModel('explain'))`. |
| `agents/subagents/table.subagent.ts` | 2 (lines 95, 200) | Add client field, init via `createOpenAIClient(selectModel('table'))`. |
| `agents/subagents/artifact.subagent.ts` | 1 (line 85) | Init via `createOpenAIClient(selectModel('artifact'))` → routes to Ollama or Gemini. |
| `agents/research/agent.ts` | 4 (lines 169, 234, 429, 471) | Add client field, init via `createOpenAIClient(selectModel('research'))`. |

#### Step 4c: Files to modify (Pattern B — LangChain agents)

Each file below has inline `new ChatGoogleGenerativeAI(...)`. Replace with `createLangChainModel(selectModel(taskType))`.

| File | Current instances | Change |
|------|-------------------|--------|
| `agents/secretary/agent.ts` | 1 (line 60) | Replace with `await createLangChainModel(selectModel('secretary'), { temperature: 0.5 })` |
| `agents/secretary/tools.ts` | 1 (line 445) | Replace with `await createLangChainModel(selectModel('secretary'), { temperature: 0.5 })` |
| `agents/secretary/subagents.ts` | 2 (lines 47, 88) | Replace both with `await createLangChainModel(selectModel('secretary'))` |
| `agents/editor-deep/agent.ts` | 1 (line 124) | Replace with `await createLangChainModel(selectModel('editor-deep'), { temperature: 0.3 })` |
| `agents/course/orchestrator.ts` | 3 (lines 219, 289, 294) | Line 219: `selectModel('course')`. Lines 289-294: `selectModel('course')` for flash, `selectModel('slides')` for pro. |
| `agents/course/course-tools.ts` | 4 (lines 285, 744, 960, 1175) | Lines 285/744/960: `selectModel('course')` (flash). Line 1175: `selectModel('slides')` (pro). |
| `agents/course/slide-generator.ts` | 1 (line 18) | Replace with `await createLangChainModel(selectModel('slides'))` |
| `agents/research/agent.ts` | 1 (line 515) | Replace with `await createLangChainModel(selectModel('research'))` |

#### Step 4d: Embedding client (Pattern C)

| File | Change |
|------|--------|
| `agents/course/research/rag-indexer.ts` | Replace `new OpenAI({ apiKey: openaiApiKey })` with `createOpenAIClient(selectModel('embedding'))` |

---

### Step 5: Rewrite Ollama Provider

**Delete:** `packages/ai/src/providers/ollama.ts` (423 lines of custom HTTP client)

**Why:** Ollama Cloud provides full OpenAI-compatible API at `/v1/`. The client factory handles Ollama by creating a standard OpenAI SDK client with the right base URL. All the streaming, tool calling, and chat methods work identically — no custom implementation needed.

The current `ollama.ts` duplicates every method (complete, rewrite, chat, summarize, generateArtifact, generateCode) with hand-rolled HTTP streaming. Deleting it and using OpenAI SDK removes 423 lines of code and potential bugs.

**What stays:** The artifact generation prompts from `ollama.ts` (lines 190-227) should be extracted to a prompts file if they're not already elsewhere. Check `deep-agent.ts` which also has artifact prompts.

---

### Step 6: Fix Type Definitions

**File:** `packages/shared/src/types/ai.ts` (lines 319-389)

Current `CHAT_MODELS` has incorrect entries:
```typescript
// WRONG: says provider 'openai' with model 'gemini-3.1-pro-preview' labeled 'GPT-4o'
{ provider: 'openai', model: 'gemini-3.1-pro-preview', displayName: 'GPT-4o' }
```

**Replace with accurate model list:**
```typescript
export const CHAT_MODELS: ChatModelConfig[] = [
  {
    provider: 'google',
    model: 'gemini-3.1-pro-preview',
    displayName: 'Gemini 3.1 Pro',
    contextWindow: 2000000,
    supportsStreaming: true,
    supportsTools: true,
    costPer1kInput: 0.125,
    costPer1kOutput: 1.0,
  },
  {
    provider: 'google',
    model: 'gemini-3-flash-preview',
    displayName: 'Gemini 3 Flash',
    contextWindow: 1000000,
    supportsStreaming: true,
    supportsTools: true,
    costPer1kInput: 0.03,
    costPer1kOutput: 0.25,
  },
  {
    provider: 'ollama',
    model: 'kimi-k2.5',
    displayName: 'Kimi K2.5 (Ollama)',
    contextWindow: 131072,
    supportsStreaming: true,
    supportsTools: true,
    costPer1kInput: 0,
    costPer1kOutput: 0,
  },
]
```

Also update:
- `DEFAULT_CHAT_MODEL` from `'claude-sonnet-4-20250514'` → `'gemini-3.1-pro-preview'`
- `AIProvider` type: add `'ollama'` to the union `'openai' | 'anthropic' | 'google' | 'ollama'`

---

### Step 7: Update Factory & Clean Up Exports

**File:** `packages/ai/src/providers/factory.ts`

The factory becomes a thin wrapper around the new model registry + client factory:

- `createProvider(taskType)` → uses `selectModel(taskType)` + creates the right provider instance
- `getModelNameForTask(taskType)` → delegates to `selectModel(taskType).id`
- `getProviderNameForTask(taskType)` → delegates to `selectModel(taskType).provider`
- Remove `getOpenAIProvider()`, `getOllamaCloudProvider()`, `getGeminiProvider()` (replaced by client factory)
- Keep `createBYOKProvider()` but update to use client factory
- Keep `clearProviderCache()` for testing

**File:** `packages/ai/src/providers/gemini-compat.ts`

Can be simplified or deleted — the client factory handles Gemini compat endpoint creation. If any code imports `createGeminiCompatClient()`, replace those imports.

**File:** `packages/ai/src/providers/openai.ts`

Keep for now — it's used by agents that need the full `OpenAIProvider` class interface (especially `generateEmbedding`, `chatWithTools`, `streamChatWithTools`). But fix:
- `DEFAULT_CHAT_MODEL`: change from `'gemini-3.1-pro-preview'` to import from model registry
- Comments: remove misleading "GPT-5.2" references

**File:** `packages/ai/src/providers/gemini.ts`

Keep — it's used for slides (native Gemini SDK for image generation), deep research, and course curriculum. These features use Gemini-specific APIs not available through OpenAI compat.

Fix:
- Import model names from registry instead of hardcoding
- Comments: clean up "Note3" references

---

### Step 8: Update API Config

**File:** `apps/api/src/config.ts`

- `DEFAULT_CHAT_MODEL`: change from `'claude-sonnet-4-20250514'` → `'gemini-3.1-pro-preview'`
- Add `OLLAMA_CLOUD_URL` and `OLLAMA_API_KEY` to optional env validation
- Remove hard requirement for `OPENAI_API_KEY` (only needed for embeddings, which we may migrate later)

---

### Step 9: Add `@langchain/ollama` Dependency

**File:** `packages/ai/package.json`

Add `@langchain/ollama` as a dependency for LangChain agents that need to use Ollama models:

```bash
cd packages/ai && pnpm add @langchain/ollama
```

This enables `ChatOllama` in `createLangChainModel()` for Ollama Cloud/local models in Pattern B agents.

---

## Files Summary

### New files (3):
| File | Purpose | ~Lines |
|------|---------|--------|
| `packages/ai/src/providers/model-registry.ts` | Model catalog + `selectModel()` | ~120 |
| `packages/ai/src/providers/client-factory.ts` | `createOpenAIClient()` + `createLangChainModel()` | ~80 |
| `packages/ai/src/providers/token-tracker.ts` | Token tracking accumulator + wrapper utils | ~100 |

### Files to delete (1):
| File | Reason | Lines removed |
|------|--------|---------------|
| `packages/ai/src/providers/ollama.ts` | Replaced by OpenAI SDK via client factory | 423 |

### Files to modify (22):
| File | Change scope |
|------|-------------|
| `packages/ai/src/providers/factory.ts` | Rewrite to delegate to model-registry + client-factory |
| `packages/ai/src/providers/openai.ts` | Fix DEFAULT_CHAT_MODEL, clean comments |
| `packages/ai/src/providers/gemini.ts` | Import model names from registry |
| `packages/ai/src/providers/gemini-compat.ts` | Simplify or delete (factory handles this) |
| `packages/ai/src/providers/interface.ts` | Add `provider` field to AIUsage |
| `packages/shared/src/types/ai.ts` | Fix CHAT_MODELS, DEFAULT_CHAT_MODEL, AIProvider type |
| `packages/ai/src/agents/chat.agent.ts` | Replace 3 inline clients |
| `packages/ai/src/agents/note.agent.ts` | Replace 3 inline clients |
| `packages/ai/src/agents/editor.agent.ts` | Replace 6 inline clients |
| `packages/ai/src/agents/deep-agent.ts` | Replace 3 inline clients |
| `packages/ai/src/agents/planner.agent.ts` | Replace 3 inline clients |
| `packages/ai/src/agents/explain/index.ts` | Replace 1 inline client |
| `packages/ai/src/agents/subagents/table.subagent.ts` | Replace 2 inline clients |
| `packages/ai/src/agents/subagents/artifact.subagent.ts` | Replace 1 inline client |
| `packages/ai/src/agents/research/agent.ts` | Replace 5 inline clients (4 OpenAI + 1 LangChain) |
| `packages/ai/src/agents/secretary/agent.ts` | Replace 1 LangChain client |
| `packages/ai/src/agents/secretary/tools.ts` | Replace 1 LangChain client |
| `packages/ai/src/agents/secretary/subagents.ts` | Replace 2 LangChain clients |
| `packages/ai/src/agents/editor-deep/agent.ts` | Replace 1 LangChain client |
| `packages/ai/src/agents/course/orchestrator.ts` | Replace 3 LangChain clients |
| `packages/ai/src/agents/course/course-tools.ts` | Replace 4 LangChain clients |
| `packages/ai/src/agents/course/slide-generator.ts` | Replace 1 LangChain client |
| `packages/ai/src/agents/course/research/rag-indexer.ts` | Replace 1 OpenAI embedding client |
| `apps/api/src/config.ts` | Fix defaults, add Ollama env vars |

---

## Execution Order

1. **Create `model-registry.ts`** — no deps on existing code, pure data + `selectModel()`
2. **Create `client-factory.ts`** — depends on model-registry only
3. **Create `token-tracker.ts`** — standalone utility
4. **Install `@langchain/ollama`** — `pnpm add` in packages/ai
5. **Fix `shared/types/ai.ts`** — update CHAT_MODELS, defaults, AIProvider type
6. **Update `factory.ts`** — rewrite to use model-registry
7. **Fix `openai.ts` + `gemini.ts`** — import from registry, clean comments
8. **Delete `ollama.ts`** — check no imports remain
9. **Replace Pattern A agents** (OpenAI SDK) — 9 files, 26 instances. Do one at a time, test after each.
10. **Replace Pattern B agents** (LangChain) — 8 files, 14 instances. Do one at a time, test after each.
11. **Replace Pattern C** (rag-indexer embedding) — 1 file
12. **Delete `gemini-compat.ts`** if no remaining imports
13. **Update `apps/api/src/config.ts`**
14. **Update `packages/ai/src/index.ts` exports** — export new modules

---

## Ollama Cloud / Local Integration Details

### How Ollama Cloud works (from docs research):

- **API compatibility:** Full OpenAI-compatible REST API at `/v1/`
- **Endpoints:** `/v1/chat/completions`, `/v1/completions`, `/v1/models`, `/v1/embeddings`
- **Auth:** `Authorization: Bearer $OLLAMA_API_KEY` (keys from ollama.com/settings/keys)
- **Local:** `http://localhost:11434/v1/` with `api_key='ollama'` (dummy, no real auth)
- **Streaming:** Enabled by default, standard SSE format (same as OpenAI)
- **Pricing:** GPU-time based. Free: 1 concurrent model. Pro ($20/mo): 3. Max ($100/mo): 10.

### Tool calling support:
- Supported by: qwen3.5, qwen3-vl, nemotron-3-super, devstral-small-2, ministral-3, kimi-k2.5
- Uses OpenAI-format tool definitions
- **`tool_choice` is NOT supported** — cannot force tool use. Client factory must strip this param.
- Supports parallel tool calls and multi-turn agent loops

### Vision support:
- Supported by: qwen3.5, qwen3-vl, devstral-small-2, gemma3
- **Only base64-encoded images** — no URL-based images
- Client factory should convert image URLs to base64 if needed

### Environment variables:
```
OLLAMA_CLOUD_URL=https://ollama.com    # Ollama Cloud base URL
OLLAMA_API_KEY=...                      # API key for cloud
OLLAMA_LOCAL_URL=http://localhost:11434  # Local Ollama (optional, for dev)
```

---

## Verification Plan

### Unit tests:
1. `model-registry.test.ts` — verify `selectModel()` returns correct models for each task type
2. `client-factory.test.ts` — verify correct endpoint/auth for each provider
3. `token-tracker.test.ts` — verify accumulation and cost calculation

### Integration tests:
1. Run `pnpm typecheck` — zero TypeScript errors
2. Run `pnpm build` — successful build
3. Run `pnpm test:run` — all existing tests pass
4. Manual: Start `pnpm dev`, send a chat message → verify response streams correctly
5. Manual: Create a note via AI → verify note agent works
6. Manual: Check server logs for `TokenTracker` output showing real token counts
7. Manual: Test artifact generation → verify Ollama Cloud routing works

### What NOT to change:
- Don't touch prompt content in any agent
- Don't change streaming event types
- Don't change API route signatures
- Don't modify the Gemini native SDK usage in `gemini.ts` (slides/image gen) — those use Gemini-specific APIs
- Don't change `deep-research.ts` — it uses Google's interactions API directly, not a standard LLM endpoint
- Keep `text-embedding-3-large` for embeddings (Supabase pgvector dimension compatibility) — migrate in later phase

---

## Phase 1.5: Post-Migration Bug Fixes

**Date:** 2026-03-18
**Status:** Implementation-ready
**Scope:** Fix 4 runtime bugs discovered after Phase 1 testing

### Context

After implementing Phase 1 (model registry + client factory), real-world testing revealed 4 bugs:

1. **Recommendations 404** — `recommendations.ts` was NOT migrated. It still uses `createOpenAIProvider({ apiKey })` which points to `api.openai.com`, not Gemini compat endpoint. Result: `gemini-3.1-pro-preview` 404 because that model doesn't exist on OpenAI.
2. **Editor-deep 400 (tool schema)** — Gemini's native API rejects `type: ["string", "null"]` arrays produced by Zod's `.nullish()`. Also rejects nested arrays and `z.record(z.unknown())`.
3. **`gemini-3-pro-preview` SHUT DOWN** — Google shut down this model on March 9, 2026. Our model registry still maps `slides` → this dead model.
4. **Other unmigrated files** — `workflows/actions.ts` uses hardcoded raw fetch. Agent `this.model` fallbacks are cosmetic but should reference registry.

---

### Fix 1: Model Registry — Remove Dead Model

**File:** `packages/ai/src/providers/model-registry.ts`

The `gemini-3-pro-preview` model was shut down on March 9, 2026. Remove it from `MODEL_REGISTRY` and update the `slides` task mapping.

**Changes:**
- Remove `'gemini-3-pro-preview'` entry from `MODEL_REGISTRY` (lines 50-60)
- Update `TASK_MODEL_MAP`: change `'slides': 'gemini-3-pro-preview'` → `'slides': 'gemini-3.1-pro-preview'`

**Also update:** `packages/shared/src/types/ai.ts`
- Remove `gemini-3-pro-preview` from `CHAT_MODELS` array (the entry at ~line 342)

**Also update:** `packages/ai/src/providers/gemini.ts`
- Update `SLIDES_MODEL` constant if it references `gemini-3-pro-preview`

**Also update:** `packages/ai/src/agents/course/orchestrator.ts:315`
- Fix the comment string referencing `gemini-3-pro-preview`

---

### Fix 2: Editor-Deep Tool Schemas — Gemini Compatibility

**File:** `packages/ai/src/agents/editor-deep/tools.ts`

Gemini's native API function declarations require `type` to be a scalar string (e.g. `"STRING"`), NOT an array like `["STRING", "NULL"]`. The LangChain `@langchain/google-genai` package converts Zod schemas to JSON Schema and passes them to Gemini, but:

- `z.string().nullish()` → `type: ["string", "null"]` → **Gemini rejects** ("Proto field is not repeating, cannot start list")
- `z.array(z.array(z.string()))` → nested array type → **Gemini rejects**
- `z.record(z.unknown())` → unknown additionalProperties → **Gemini rejects**

**Affected tools (by error tool indices):**

| Index | Tool | Property[1] | Issue | Fix |
|-------|------|-------------|-------|-----|
| 6 | `insertTable` | `title` | `.nullish()` → array type | Change to `.optional()` |
| 6 | `insertTable` | `rows` | `z.array(z.array(z.string()))` → nested array | Flatten to `z.string()` (pipe-delimited rows) |
| 6 | `insertTable` | `noteId` | `.nullish()` | Change to `.optional()` |
| 7 | `databaseAction` | `args` | `z.record(z.unknown())` | Change to `z.string().default('{}')` (JSON string) |
| 7 | `databaseAction` | `noteId`, `databaseId` | `.nullish()` | Change to `.optional()` |
| 8 | `readMemory` | `key` | `.nullish()` → array type | Change to `.optional()` |
| 9 | `writeMemory` | `key` | `.nullish()` → array type | Change to `.optional()` |

**Also scan ALL other tools in this file** for `.nullish()` usage — replace ALL with `.optional()`.

**For `insertTable.rows`:**
```typescript
// BEFORE:
rows: z.array(z.array(z.string())).default([]).describe('Table data rows...')

// AFTER:
rows: z.string().default('').describe('Table data rows as JSON array of arrays, e.g. [["Alice","25"],["Bob","30"]]. Each inner array = one row matching the headers.')
```

Then in the function body, parse: `const parsedRows = rows ? JSON.parse(rows) : []`

**For `databaseAction.args`:**
```typescript
// BEFORE:
args: z.record(z.unknown()).default({}).describe('Operation-specific arguments...')

// AFTER:
args: z.string().default('{}').describe('JSON-serialized operation arguments (e.g. row data, query filters)')
```

Then in the function body, parse: `const parsedArgs = JSON.parse(args)`

---

### Fix 3: Migrate `recommendations.ts` — Fix 404

**File:** `packages/ai/src/services/recommendations.ts`

**Root cause:** Line 261: `createOpenAIProvider({ apiKey })` creates an OpenAI client with NO baseURL, so it defaults to `api.openai.com`. The model `gemini-3.1-pro-preview` doesn't exist on OpenAI → 404.

**Fix:** Replace the `chatWithAI` function to use the centralized client-factory:

```typescript
// BEFORE (line 10):
import { createOpenAIProvider } from '../providers/openai'

// AFTER:
import { selectModel } from '../providers/model-registry'
import { createOpenAIClient } from '../providers/client-factory'
```

```typescript
// BEFORE (chatWithAI function, lines 258-281):
async function chatWithAI(prompt: string, apiKey: string): Promise<string> {
  const provider = createOpenAIProvider({ apiKey })
  let result = ''
  for await (const chunk of provider.chat([{ role: 'user', content: prompt }])) {
    result += chunk
  }
  return result
}

// AFTER:
async function chatWithAI(prompt: string, _apiKey?: string): Promise<string> {
  const model = selectModel('chat')
  const client = createOpenAIClient(model)

  const response = await client.chat.completions.create({
    model: model.id,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_completion_tokens: 4000,
  })

  return response.choices[0]?.message?.content || ''
}
```

**Note:** The `apiKey` parameter becomes unused since the client-factory reads env vars directly. Keep as `_apiKey` for backward compat with all callers (15+ call sites pass apiKey).

**Also fix line 649:** `createGeminiProvider({ apiKey: geminiApiKey })` — check if this still works or needs migration too.

---

### Fix 4: Migrate `workflows/actions.ts` — Remove Hardcoded Fetch

**File:** `packages/ai/src/workflows/actions.ts`

**Root cause:** Line 744: Raw `fetch()` call to `generativelanguage.googleapis.com/v1beta/openai/chat/completions` with hardcoded model `gemini-3.1-pro-preview` and env var `GOOGLE_AI_API_KEY`.

**Fix:** Replace the raw fetch with the centralized client-factory:

```typescript
// BEFORE (lines 739-764):
const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GOOGLE_AI_API_KEY || ''}` },
  body: JSON.stringify({ model: 'gemini-3.1-pro-preview', messages: [...], temperature: 0.3, max_completion_tokens: 4000 }),
})

// AFTER:
import { selectModel } from '../providers/model-registry'
import { createOpenAIClient } from '../providers/client-factory'

const model = selectModel('chat')
const client = createOpenAIClient(model)
const response = await client.chat.completions.create({
  model: model.id,
  messages: [...],
  temperature: 0.3,
  max_completion_tokens: 4000,
})
```

---

### Fix 5: Clean Up Agent Model Fallbacks

**Files:** 4 agent files have `this.model = config.model ?? 'gemini-3.1-pro-preview'` — these should reference the registry instead.

| File | Line | Change |
|------|------|--------|
| `agents/chat.agent.ts` | 111 | `this.model = config.model ?? selectModel('chat').id` |
| `agents/note.agent.ts` | 228 | `this.model = config.model ?? selectModel('note-agent').id` |
| `agents/editor.agent.ts` | 217 | `this.model = config.model ?? selectModel('editor').id` |
| `agents/deep-agent.ts` | 207 | `this.model = config.model ?? selectModel('chat').id` |

---

### Fix 6: Rebuild

After all fixes, run:
```bash
pnpm build && pnpm typecheck && pnpm test:run
```

The `dist/` folder (where the runtime error originated) is rebuilt by `pnpm build`.

---

### Execution Order

1. **Fix model registry** (remove dead `gemini-3-pro-preview`, update slides mapping)
2. **Fix tool schemas** in `editor-deep/tools.ts` (replace `.nullish()` → `.optional()`, flatten nested types)
3. **Migrate `recommendations.ts`** (replace `createOpenAIProvider` → `createOpenAIClient`)
4. **Migrate `workflows/actions.ts`** (replace raw fetch → `createOpenAIClient`)
5. **Clean agent model fallbacks** (reference registry instead of hardcoded string)
6. **Rebuild + typecheck + test**
7. **Manual test:** Start `pnpm dev`, test flashcard generation + editor-deep agent

### Verification

1. `pnpm build` — 7/7 tasks pass
2. `pnpm typecheck` — 10/10 packages pass
3. `pnpm test:run` — all tests pass (except pre-existing `mission-orchestrator.test.ts`)
4. **Manual: Editor-deep agent** — send a message in the editor, verify no 400 error
5. **Manual: Flashcards** — click "Memory" or "Practice" on a note, verify no 404 error
6. **Manual: Slide generation** — generate slides in a course, verify no 404 from dead model
