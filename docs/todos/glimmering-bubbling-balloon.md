# AI SDK v6 Migration — Final Cleanup Plan (Phases 5-7)

## Context

**Branch:** `feature/ai-sdk-migration`
**Date:** 2026-03-21
**Prerequisite plans:** `cuddly-seeking-waffle.md` (master plan, Phases 0-7)

### What's DONE

| Phase | Status | What was done |
|-------|--------|---------------|
| Phase 0: Dead code cleanup | ✅ | `agent.legacy.ts` deleted, phantom deps removed |
| Phase 1: AI SDK provider layer | ✅ | `ai-sdk-factory.ts`, `ai-sdk-usage.ts` created with tests |
| Phase 2: Simple agents (8) | ✅ | ExplainAgent, PlannerAgent, ChatAgent, NoteAgent, ArtifactSubagent, TableSubagent, NoteSubagent |
| Phase 3: EditorDeepAgent | ✅ | `ToolLoopAgent` + 12 tools + stream adapter |
| Phase 4a: SecretaryAgent | ✅ | `ToolLoopAgent` + 15 tools, subagents.ts + stream-normalizer.ts deleted |
| Phase 4b: ResearchAgent | ✅ | `ToolLoopAgent` for deep research, `streamText()` for simple modes |
| Phase 4c: CourseOrchestrator | ✅ | `ToolLoopAgent` with merged subagent tools, slide-generator.ts migrated |
| Route cleanup (partial) | ✅ | `openaiApiKey` removed from all routes |
| Dep removal (partial) | ✅ | `deepagents`, `langchain`, `@langchain/*` removed from package.json |
| Dead file deletion (partial) | ✅ | `deep-agent.ts`, `editor.agent.ts`, `langchain-token-callback.ts`, `base-stream-normalizer.ts`, stream normalizers deleted |

### What REMAINS (this plan)

5 service files still import `createOpenAIClient()` from the legacy `client-factory.ts`. The `openai` npm package can't be removed until these are migrated. Legacy provider files (`openai.ts`, `factory.ts`, `interface.ts`) are still exported. The frontend duplicates SSE parsing logic in 9 locations.

### What We're SKIPPING (justified)

**API Route UIMessageStream (master plan Phase 5)** — SKIP.
The backend emits 17+ custom event types (`edit-proposal`, `artifact`, `thinking`, `note-navigate`, `clarification-requested`, `pre-action-question`, etc.). Wrapping them as `data-custom` UIMessageStream parts adds complexity with zero benefit. The current Hono `streamSSE()` + JSON events is clean and tested.

**@ai-sdk/vue Frontend Migration (master plan Phase 6)** — SKIP.
The Vue frontend uses custom SSE parsers tailored to Inkdown's event types. Replacing with `@ai-sdk/vue` Chat class would require wrapping/unwrapping all custom events. Negative ROI. Instead: consolidate 9 duplicate parsers into 1 shared utility.

---

## Phase 5: Migrate Remaining Legacy Services (~1 day)

### Goal

Remove ALL `createOpenAIClient()` callers so `client-factory.ts` becomes dead code and the `openai` package can be uninstalled.

### Step 5.1 — `packages/ai/src/services/recommendations.ts`

**Current:** All 6 generators funnel through `chatWithAI()` (line 260-290):
```typescript
const model = selectModel('chat')
const client = createOpenAIClient(model)
const response = await client.chat.completions.create({ model: model.id, messages, temperature: 0.7 })
trackOpenAIResponse(response, { model: model.id, taskType: 'chat', startTime })
return response.choices[0]?.message?.content || ''
```

**After:**
```typescript
const { model, entry } = resolveModel('chat')
const { text } = await generateText({
  model,
  prompt: userInput,
  temperature: 0.7,
  maxOutputTokens: 4000,
  onFinish: trackAISDKUsage({ model: entry.id, taskType: 'chat' }),
})
return text
```

**Import changes:**
- Remove: `createOpenAIClient` from `../providers/client-factory`, `trackOpenAIResponse` from `../providers/token-tracker`, `selectModel` from `../providers/model-registry`
- Add: `generateText` from `ai`, `resolveModel` from `../providers/ai-sdk-factory`, `trackAISDKUsage` from `../providers/ai-sdk-usage`

**KEEP:** `createGeminiProvider()` import — still needed for native slide image generation (Gemini SDK features not available via AI SDK).

### Step 5.2 — `packages/ai/src/services/orchestration.ts`

Two methods to migrate: `generateCustomTemplate()` (line ~597) and `aiGenerate()` (line ~758).

Same pattern as 5.1 — replace `createOpenAIClient() + client.chat.completions.create()` with `resolveModel() + generateText()`.

Remove the `openaiApiKey` constructor parameter (marked `_` or deleted).

### Step 5.3 — `packages/ai/src/workflows/actions.ts`

Single `callOpenAI()` private method (line ~742) used by all 8 action types.

Same pattern — replace with `resolveModel() + generateText()`.

Remove the `openaiApiKey` constructor parameter.

### Step 5.4 — `packages/ai/src/agents/course/research/rag-indexer.ts`

`embedText()` function uses `createOpenAIClient()` for OpenAI embeddings.

**After:**
```typescript
import { embed } from 'ai'
import { getEmbeddingModel } from '../../../providers/ai-sdk-factory'

async function embedText(text: string): Promise<number[]> {
  const embeddingModel = getEmbeddingModel()
  const { embedding } = await embed({ model: embeddingModel, value: text })
  return embedding
}
```

**NOTE:** Use context7 to verify `embed()` API from `ai` package before implementing. The `getEmbeddingModel()` already exists in `ai-sdk-factory.ts`.

### Step 5.5 — Delete `packages/ai/src/agents/agentic.agent.ts` + `agentic.types.ts`

These are stubs with mock implementations. Not exported from `agents/index.ts`. No route references them. Delete both files.

### Verify Phase 5

```bash
# Zero remaining callers of createOpenAIClient (excluding client-factory itself and barrel exports)
grep -r "createOpenAIClient" packages/ai/src --include='*.ts' | grep -v 'client-factory' | grep -v '/index.ts'
# Should return 0 matches

pnpm build && pnpm typecheck && pnpm test:run
```

---

## Phase 6: Legacy Provider Cleanup + Dependency Removal (~0.5 day)

### Goal

Delete all dead provider files, remove the `openai` npm package, and clean barrel exports.

### Step 6.1 — Clean `gemini.ts` before deleting `interface.ts`

`gemini.ts` implements `AIProvider` from `interface.ts`. Before deleting `interface.ts`:

1. Remove `implements AIProvider` from `GeminiProvider` class
2. Remove import of `AIProvider`, `AIContext`, `AICompletionOptions`, `ChatMessage`, `AIUsage` from `./interface`
3. Define any still-needed types locally (or import from `@inkdown/shared/types`)
4. Remove dead `AIProvider` methods (`complete`, `rewrite`, `chat`, `summarize`, `getUsage`) — only keep the specialized methods used by slides route: `generateSlideOutline()`, `generateSlideImages()`, `generateCourseCurriculum()`, `deepResearch()`

### Step 6.2 — Delete legacy provider files

```
DELETE: packages/ai/src/providers/client-factory.ts    (127 lines)
DELETE: packages/ai/src/providers/openai.ts            (OpenAIProvider class)
DELETE: packages/ai/src/providers/interface.ts          (AIProvider interface)
DELETE: packages/ai/src/providers/factory.ts            (legacy provider factory)
```

### Step 6.3 — Clean `token-tracker.ts`

Remove `trackOpenAIStream()` and `trackOpenAIResponse()` — zero production callers after Phase 5.
This also removes the `import type { ChatCompletionChunk } from 'openai/...'` dependency.

Keep: `tokenTracker`, `computeCost`, `trackGeminiResponse`, `trackGeminiStream` (still used by `gemini.ts`).

### Step 6.4 — Clean barrel exports

**`packages/ai/src/providers/index.ts`** — Remove:
- `createOpenAIClient` (from deleted client-factory)
- `OpenAIProvider`, `createOpenAIProvider`, `getDefaultOpenAIProvider` (from deleted openai.ts)
- `createProvider`, `getOpenAI`, `getGemini`, `getProviderNameForTask`, `getModelNameForTask` (from deleted factory.ts)
- `AIProvider` type export (from deleted interface.ts)
- `trackOpenAIStream`, `trackOpenAIResponse` (removed from token-tracker)

Keep: model-registry exports, token-tracker (trimmed), gemini exports, ai-sdk-factory exports, ai-sdk-usage exports, request-context, usage-persister.

**`packages/ai/src/index.ts`** — Remove:
- `AIProvider`, `AIContext`, `ChatMessage`, `AICompletionOptions`, `AIActionType`, `AIUsage` type exports
- `createOpenAIClient` export
- `trackOpenAIStream`, `trackOpenAIResponse` exports
- `OpenAIProvider`, `createOpenAIProvider`, `getDefaultOpenAIProvider` exports
- `createProvider`, `getOpenAI`, `getGemini`, `getProviderNameForTask`, `getModelNameForTask` exports
- `AITaskType`, `ProviderFactoryConfig` type exports

Keep: `GeminiProvider`, `createGeminiProvider` exports (used by slides route).

### Step 6.5 — Remove `openai` from `packages/ai/package.json`

```json
// REMOVE:
"openai": "^4.80.0"

// KEEP (still needed by gemini.ts for native SDK):
"@google/generative-ai": "^0.21.0"
"@google/genai": "^1.0.0"
```

### Verify Phase 6

```bash
# No remaining imports from deleted files
grep -r "from.*client-factory\|from.*providers/openai\|from.*providers/interface\|from.*providers/factory" packages/ai/src --include='*.ts'
# Should return 0

# No remaining import from 'openai'
grep -r "from 'openai'" packages/ai/src --include='*.ts'
# Should return 0

pnpm install && pnpm build && pnpm typecheck && pnpm test:run
```

---

## Phase 7: Frontend SSE Consolidation + Documentation (~1 day)

### Goal

Extract 9 duplicated SSE parser implementations into a shared utility. Update architecture docs.

### Step 7.1 — Create shared SSE parser

**File:** `apps/web/src/utils/sse-parser.ts`

The pattern duplicated across 9 files is:
1. `response.body.getReader()`
2. `new TextDecoder()`
3. Accumulate buffer
4. Split on `\n`
5. Parse `data:` prefix (some files also parse `event:`)
6. Handle `[DONE]`, empty lines, heartbeats
7. `JSON.parse(data)`
8. Dispatch to callback

Extract steps 1-7 into a shared function:

```typescript
export interface SSEEvent {
  event?: string   // from "event:" line
  data: unknown    // JSON-parsed payload
}

export async function parseSSEStream(
  response: Response,
  options: {
    onEvent: (event: SSEEvent) => void
    onError?: (error: Error) => void
    onDone?: () => void
    signal?: AbortSignal
  }
): Promise<void>
```

### Step 7.2 — Refactor primary consumers (3 services)

1. **`apps/web/src/services/ai.service.ts`** — `processSSEResponse()` → use `parseSSEStream()`, keep the `switch(chunk.type)` dispatch
2. **`apps/web/src/services/course.service.ts`** — `streamGenerationProgress()` → use `parseSSEStream()`, keep callback dispatch
3. **`apps/web/src/services/missions.service.ts`** — `streamMission()` → use `parseSSEStream()`, keep callback dispatch

The 6 other locations (5 stores + 1 component) can be refactored in follow-up PRs since they're more tightly coupled to store state.

### Step 7.3 — Update `docs/ARCHITECTURE.md`

Update the following sections:
- **Provider infrastructure:** "All agents use AI SDK v6 (`streamText`/`generateText`/`embed`/`ToolLoopAgent`). Legacy OpenAI SDK removed. Gemini native SDK retained for slide image generation."
- **Dependencies:** Remove references to LangChain, deepagents, openai
- **AI agents list:** Update to reflect current state (all on AI SDK v6)
- **Key data flow:** Note the stream adapter pattern (`ai-sdk-stream-adapter.ts`)
- **SSE architecture:** Document the shared `parseSSEStream()` utility

### Step 7.4 — Final full verification

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test:run

# Verify ZERO legacy framework imports remain:
grep -r "@langchain\|deepagents\|createLangChainModel\|createDeepAgent\|TokenTrackingCallback" packages/ai/src/ --include='*.ts' | grep -v node_modules
# Should return 0

grep -r "from 'openai'" packages/ai/src/ --include='*.ts' | grep -v node_modules
# Should return 0

grep -r "createOpenAIClient" packages/ai/src/ --include='*.ts' | grep -v node_modules
# Should return 0

# Manual e2e regression:
# 1. AI Editor Sidebar — edit request → diff blocks appear
# 2. AI Chat — message → streaming response
# 3. Secretary — planning request → memory + daily plan
# 4. Research — deep research → web search + todos + interrupt
# 5. Course — generate course → outline approval → lessons → save
# 6. Explain — question → explanation
# 7. Artifacts — code artifact → preview + insertion
# 8. Recommendations — generate mindmap/flashcards from note
```

---

## Files Inventory

### Phase 5 (modify)
- `packages/ai/src/services/recommendations.ts` — Replace `chatWithAI()` with `generateText()`
- `packages/ai/src/services/orchestration.ts` — Replace `generateCustomTemplate()` + `aiGenerate()`
- `packages/ai/src/workflows/actions.ts` — Replace `callOpenAI()` helper
- `packages/ai/src/agents/course/research/rag-indexer.ts` — Replace `embedText()` with `embed()`

### Phase 5 (delete)
- `packages/ai/src/agents/agentic.agent.ts`
- `packages/ai/src/agents/agentic.types.ts`

### Phase 6 (modify)
- `packages/ai/src/providers/gemini.ts` — Remove `implements AIProvider`, prune dead methods
- `packages/ai/src/providers/token-tracker.ts` — Remove `trackOpenAIStream/Response`
- `packages/ai/src/providers/index.ts` — Clean exports
- `packages/ai/src/index.ts` — Clean exports
- `packages/ai/package.json` — Remove `openai`

### Phase 6 (delete)
- `packages/ai/src/providers/client-factory.ts`
- `packages/ai/src/providers/openai.ts`
- `packages/ai/src/providers/interface.ts`
- `packages/ai/src/providers/factory.ts`

### Phase 7 (create)
- `apps/web/src/utils/sse-parser.ts` — Shared SSE parsing utility

### Phase 7 (modify)
- `apps/web/src/services/ai.service.ts` — Use shared parser
- `apps/web/src/services/course.service.ts` — Use shared parser
- `apps/web/src/services/missions.service.ts` — Use shared parser
- `docs/ARCHITECTURE.md` — Update provider + agent sections

---

## Implementation Notes

### AI SDK v6 API Reference (verified from working code + context7)

Use context7 (`resolve-library-id` → `query-docs`) to verify these APIs before implementing:

```typescript
// Non-streaming text generation (services)
import { generateText } from 'ai'
const { text } = await generateText({ model, system, prompt, temperature, maxOutputTokens, onFinish })

// Embeddings (rag-indexer)
import { embed } from 'ai'
const { embedding } = await embed({ model: embeddingModel, value: text })

// Streaming (agents — already done)
import { streamText } from 'ai'
const result = streamText({ model, system, messages, tools, stopWhen, onFinish })

// Tool loop agent (agents — already done)
import { ToolLoopAgent, stepCountIs, tool } from 'ai'
const agent = new ToolLoopAgent({ model, instructions, tools, stopWhen: stepCountIs(N), onFinish })
```

### Inkdown's established pattern (proven in 14 migrated agents)

```typescript
import { resolveModel } from '../../providers/ai-sdk-factory'
import { trackAISDKUsage } from '../../providers/ai-sdk-usage'

const { model, entry } = resolveModel('task-type')
// ... generateText/streamText/embed with model ...
// ... onFinish: trackAISDKUsage({ model: entry.id, taskType: 'task-type' })
```

---

## Estimated Timeline

| Phase | Description | Time | Risk |
|-------|-------------|------|------|
| 5 | Migrate 4 services + delete agentic | 4-6 hours | Low |
| 6 | Delete legacy providers + remove openai dep | 2-3 hours | Medium |
| 7 | SSE parser + docs + final verification | 4-6 hours | Low |
| **Total** | | **~2 days** | |
