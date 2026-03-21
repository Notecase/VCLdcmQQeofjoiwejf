# Inkdown AI System → Vercel AI SDK v6 Full Migration Plan

## Context

Inkdown's AI system has accumulated significant technical debt from rapid iteration. It currently runs **two parallel AI paradigms** (OpenAI SDK direct + LangChain/deepagents), **6 phantom dependencies** with zero imports, **~2000 lines of dead code**, **3 independent SSE parsers** on the frontend, and **3 duplicated stream normalizers** on the backend. The goal is to unify the entire AI stack on Vercel AI SDK v6, enabling production-grade multi-agent patterns (subagent delegation, orchestrator-workers, supervisor, swarm/handoffs, HITL approval) while removing ~25MB of unused dependencies and ~3000 lines of dead/duplicated code.

**Branch:** `feature/ai-sdk-migration`

---

## AI Features Inventory (14 agents to migrate)

| Agent | File | Framework | LOC | Tools | Subagents | Complexity |
|-------|------|-----------|-----|-------|-----------|------------|
| ExplainAgent | `packages/ai/src/agents/explain/index.ts` | OpenAI SDK | ~300 | None | None | Trivial |
| PlannerAgent | `packages/ai/src/agents/planner.agent.ts` | OpenAI SDK | ~500 | None | None | Low |
| ChatAgent | `packages/ai/src/agents/chat.agent.ts` | OpenAI SDK | ~800 | RAG (no LLM tools) | None | Low |
| ArtifactSubagent | `packages/ai/src/agents/subagents/artifact.subagent.ts` | OpenAI SDK | ~300 | None | None | Low |
| TableSubagent | `packages/ai/src/agents/subagents/table.subagent.ts` | OpenAI SDK | ~300 | executeTool() | None | Low |
| NoteAgent | `packages/ai/src/agents/note.agent.ts` | OpenAI SDK | ~794 | Supabase writes | None | Medium |
| EditorAgent | `packages/ai/src/agents/editor.agent.ts` | OpenAI SDK | ~800 | Intent classify + executeTool | None | Medium |
| DeepAgent | `packages/ai/src/agents/deep-agent.ts` | OpenAI SDK | ~1029 | Task decomposition | NoteAgent, ArtifactSubagent, TableSubagent | Medium |
| SlideGenerator | `packages/ai/src/agents/course/slide-generator.ts` | LangChain | ~112 | None | None | Low |
| EditorDeepAgent | `packages/ai/src/agents/editor-deep/agent.ts` | deepagents | ~2000 | 12 LangChain tools | QA, Edit, Artifact, Data, Memory subagents | High |
| SecretaryAgent | `packages/ai/src/agents/secretary/agent.ts` | deepagents | ~2000 | 6+ LangChain tools | Planner, Researcher subagents | High |
| ResearchAgent | `packages/ai/src/agents/research/agent.ts` | deepagents | ~2500 | LangChain tools | Researcher, Writer subagents | High |
| CourseOrchestrator | `packages/ai/src/agents/course/orchestrator.ts` | deepagents | ~1500 | LangChain tools | Lesson, Quiz, Slides writers | High |
| AgenticAgent | `packages/ai/src/agents/agentic.agent.ts` | OpenAI SDK | ~600 | Stubs only | None | **DELETE** |

---

## Phase 0: Branch Setup + Dead Code Cleanup (1 day)

### Goal
Create migration branch, remove dead code and phantom dependencies to reduce noise.

### Steps

1. **Create branch**
   ```bash
   git checkout -b feature/ai-sdk-migration
   ```

2. **Delete dead files**
   - `packages/ai/src/providers/factory.ts` — entire file, `createProvider()` has zero callers
   - `packages/ai/src/agents/agentic.agent.ts` — stub with mock implementations
   - `packages/ai/src/agents/agentic.types.ts` — types for the stub
   - `packages/ai/src/agents/course/agent.legacy.ts` — explicitly named legacy

3. **Remove phantom dependencies from `packages/ai/package.json`**
   - `@anthropic-ai/sdk` ^0.30.0 — zero imports anywhere
   - `deepagents` ^1.7.0 — keep for now (used by 4 agents, removed in Phase 7)

4. **Clean exports**
   - `packages/ai/src/index.ts` — remove AgenticAgent exports
   - `packages/ai/src/providers/index.ts` — remove factory.ts exports

5. **Remove dead model registry entries**
   - `packages/ai/src/providers/model-registry.ts` — remove `qwen3.5` and `deepseek-r1` (unreachable via `selectModel()`)

### Verify
```bash
pnpm build && pnpm typecheck && pnpm test:run
```

---

## Phase 1: AI SDK Provider Layer (2-3 days)

### Goal
Create AI SDK v6 provider infrastructure that coexists with the old `client-factory.ts` during migration.

### Steps

1. **Update dependencies in `packages/ai/package.json`**
   ```
   Remove: "ai" ^3.4.0 (phantom, reinstall as v6)
   Add:    "ai" ^6.x
   Update: "@ai-sdk/google" to latest v6-compatible
   Update: "@ai-sdk/openai" to latest v6-compatible
   Remove: "@ai-sdk/anthropic" (not currently used by any agent)
   ```
   Also install in `apps/web/package.json`:
   ```
   Add: "@ai-sdk/vue" latest
   Add: "ai" ^6.x
   ```

2. **Create `packages/ai/src/providers/ai-sdk-factory.ts`**
   - Export `createAIModel(model: ModelEntry): LanguageModelV1`
   - Maps `model.provider` to AI SDK provider:
     - `'gemini'` → `google(model.id)` from `@ai-sdk/google`
     - `'openai'` → `openai(model.id)` from `@ai-sdk/openai`
     - `'ollama-cloud'` → `createOpenAI({ baseURL: process.env.OLLAMA_CLOUD_URL || 'https://ollama.com/v1/' })(model.id)`
     - `'ollama-local'` → `createOpenAI({ baseURL: process.env.OLLAMA_LOCAL_URL || 'http://localhost:11434/v1/' })(model.id)`
   - Export `getModelForTask(taskType: AITaskType): LanguageModelV1` — convenience wrapper combining `selectModel()` + `createAIModel()`

3. **Create `packages/ai/src/providers/ai-sdk-usage.ts`**
   - Export `trackAISDKUsage(result, meta)` — reads `result.usage` or `await result.usage` and calls `tokenTracker.record()`
   - Export `wrapStreamWithUsageTracking(result, meta)` — for streaming results, reads usage from `onFinish` callback
   - Replaces: `trackOpenAIStream()`, `trackOpenAIResponse()`, `trackGeminiStream()`, `trackGeminiResponse()`, `TokenTrackingCallback`

4. **Update `packages/ai/src/providers/index.ts`**
   - Add new exports alongside old ones (both coexist)

### Key files
- Create: `packages/ai/src/providers/ai-sdk-factory.ts`
- Create: `packages/ai/src/providers/ai-sdk-usage.ts`
- Modify: `packages/ai/package.json`, `apps/web/package.json`
- Modify: `packages/ai/src/providers/index.ts`

### Verify
```bash
pnpm install && pnpm build && pnpm typecheck
# Write unit tests for ai-sdk-factory.ts and ai-sdk-usage.ts
```

---

## Phase 2: Simple Agent Migration — No Tools (2-3 days)

### Goal
Migrate the 5 simplest agents (Pattern A, no LLM tool calling) to AI SDK v6.

### Migration order
1. **ExplainAgent** — simplest, pure text streaming, proves the pattern
2. **PlannerAgent** — `generateText()` + `Output.object()` for JSON plan output
3. **ChatAgent** — `streamText()` for chat, keep embedding via existing OpenAI client for now
4. **ArtifactSubagent** — `streamText()` with JSON streaming
5. **TableSubagent** — `generateText()` non-streaming

### Pattern (ExplainAgent example)

**Before** (`packages/ai/src/agents/explain/index.ts`):
```typescript
import { createOpenAIClient } from '../../providers/client-factory'
import { trackOpenAIStream } from '../../providers/token-tracker'
// ...
this.client = createOpenAIClient(selectModel('explain'))
const rawStream = await this.client.chat.completions.create({ model, messages, stream: true })
for await (const chunk of trackOpenAIStream(rawStream, meta)) {
  const delta = chunk.choices[0]?.delta?.content
  if (delta) yield { event: 'text', data: delta, seq: seq++ }
}
```

**After**:
```typescript
import { streamText } from 'ai'
import { getModelForTask } from '../../providers/ai-sdk-factory'
// ...
const result = streamText({
  model: getModelForTask('explain'),
  system: EXPLAIN_SYSTEM_PROMPT,
  messages,
  temperature: 0.7,
  maxTokens: 4000,
  onFinish: ({ usage }) => { trackUsage(usage, { taskType: 'explain' }) },
})
for await (const chunk of result.textStream) {
  yield { event: 'text', data: chunk, seq: seq++ }
}
```

### Key files to modify
- `packages/ai/src/agents/explain/index.ts`
- `packages/ai/src/agents/planner.agent.ts`
- `packages/ai/src/agents/chat.agent.ts`
- `packages/ai/src/agents/subagents/artifact.subagent.ts`
- `packages/ai/src/agents/subagents/table.subagent.ts`

### What stays unchanged
- AsyncGenerator interface (routes consume it identically)
- SSE event types (frontend unchanged)
- API routes (no changes needed)

### Verify
```bash
pnpm build && pnpm typecheck && pnpm test:run
# Manual: curl each endpoint, verify SSE events match existing format
```

---

## Phase 3: Tool-Using Agent Migration — Pattern A (2-3 days)

### Goal
Migrate NoteAgent, EditorAgent, and DeepAgent which use manual tool dispatch (not LLM tool calling).

### Agents

1. **NoteAgent** (`packages/ai/src/agents/note.agent.ts`)
   - Replace all `client.chat.completions.create()` with `streamText()` / `generateText()`
   - Keep: Zod validation, action routing, Supabase writes, contextExtractor utils

2. **EditorAgent** (`packages/ai/src/agents/editor.agent.ts`)
   - Intent classification: Replace with `generateText()` + `Output.object()` (structured Zod schema)
   - Tool dispatch: Keep `executeTool()` as-is (not LLM tool calling)
   - Streaming paths: Replace per-intent OpenAI streams with `streamText()`

3. **DeepAgent** (`packages/ai/src/agents/deep-agent.ts`)
   - Task decomposition: Replace with `generateText()` + `Output.object()` for structured task list
   - Subagent delegation: Already delegates to migrated NoteAgent/ArtifactSubagent/TableSubagent
   - Streaming: Replace OpenAI stream patterns with `streamText()`

### Key files
- `packages/ai/src/agents/note.agent.ts`
- `packages/ai/src/agents/editor.agent.ts`
- `packages/ai/src/agents/deep-agent.ts`

### Verify
```bash
pnpm build && pnpm typecheck
pnpm test:run packages/ai/src/agents/editor.agent.regression.test.ts
# Manual: Test all 8 EditorAgent intent types via /api/agent/secretary
```

---

## Phase 4: Complex Agent Migration — deepagents → AI SDK ToolLoopAgent (5-7 days)

### Goal
Replace the `deepagents` (LangGraph) framework in all 4 Pattern B agents with AI SDK v6 `ToolLoopAgent` or `streamText()` with tools.

### Strategy per agent

#### 4a. EditorDeepAgent (most tested, highest value)

**Current pattern:**
```typescript
const { createDeepAgent } = await import('deepagents')
const llm = await createLangChainModel(editorDeepModel, { callbacks: [tokenCallback] })
const agent = createDeepAgent({ model: llm, systemPrompt, tools: langchainTools, subagents })
for await (const chunk of agent.stream(messages, { streamMode: ['updates', 'custom'], subgraphs: true })) { ... }
```

**New pattern:**
```typescript
import { streamText, tool } from 'ai'
const result = streamText({
  model: getModelForTask('editor-deep'),
  system: EDITOR_DEEP_SYSTEM_PROMPT,
  messages,
  tools: {
    read_note_structure: tool({ inputSchema: z.object({...}), execute: async (args) => { ... } }),
    edit_paragraph: tool({ inputSchema: z.object({...}), execute: async (args) => { ... } }),
    // ... all 12 tools converted from LangChain format
  },
  stopWhen: stepCountIs(20),
  onStepFinish: ({ toolCalls, toolResults, usage }) => { ... },
})
```

**Files:**
- Modify: `packages/ai/src/agents/editor-deep/agent.ts` — replace `stream()` method
- Modify: `packages/ai/src/agents/editor-deep/tools.ts` — convert from `@langchain/core/tools` `tool()` to AI SDK `tool()` from `'ai'`
- Modify: `packages/ai/src/agents/editor-deep/subagents.ts` — convert to AI SDK subagent-as-tool pattern
- Delete: `packages/ai/src/agents/editor-deep/stream-normalizer.ts`
- Delete: `packages/ai/src/agents/editor-deep/stream-normalizer.test.ts`

**Tool conversion pattern (LangChain → AI SDK):**
```typescript
// Before (LangChain)
import { tool } from '@langchain/core/tools'
const readNote = tool(async (args, config) => { ... }, {
  name: 'read_note_structure', description: '...', schema: z.object({...})
})

// After (AI SDK)
import { tool } from 'ai'
const readNote = tool({
  description: '...',
  inputSchema: z.object({...}),
  execute: async (args) => { ... },
})
```

#### 4b. SecretaryAgent

**Files:**
- Modify: `packages/ai/src/agents/secretary/agent.ts`
- Modify: `packages/ai/src/agents/secretary/tools.ts` — convert 6+ tools
- Modify: `packages/ai/src/agents/secretary/subagents.ts` — planner/researcher become `generateText()` calls inside tools
- Delete: `packages/ai/src/agents/secretary/stream-normalizer.ts`

#### 4c. ResearchAgent

**Dual-mode strategy:**
- Simple modes (chat, note, markdown): already use OpenAI SDK → migrate like Phase 2
- Deep research mode (`streamResearchMode()`): replace `createDeepAgent()` with `streamText()` + tools
- Interrupts: tool `execute` awaits a Promise that resolves when user responds

**Files:**
- Modify: `packages/ai/src/agents/research/agent.ts`
- Modify: `packages/ai/src/agents/research/tools.ts`
- Modify: `packages/ai/src/agents/research/subagent-lifecycle.ts`
- Delete: `packages/ai/src/agents/research/stream-normalizer.ts`

#### 4d. CourseOrchestrator

**Files:**
- Modify: `packages/ai/src/agents/course/orchestrator.ts`
- Modify: `packages/ai/src/agents/course/course-tools.ts`
- Modify: `packages/ai/src/agents/course/slide-generator.ts` — replace `createLangChainModel().invoke()` with `generateText()`

### Verify
```bash
pnpm build && pnpm typecheck
pnpm test:run packages/ai/src/agents/editor-deep/
pnpm test:run packages/ai/src/agents/secretary/
pnpm test:run packages/ai/src/agents/research/
# Manual: Full e2e test of each agent feature
```

---

## Phase 5: API Route Migration — Hono SSE → AI SDK UIMessageStream (2-3 days)

### Goal
Transition API routes from manual Hono `streamSSE()` to AI SDK v6 `createUIMessageStreamResponse()`.

### Strategy: Bridge pattern

Since agents still yield AsyncGenerator events (custom event types like `edit-proposal`, `artifact`, `thinking`), we use `createUIMessageStream()` with a writer that maps Inkdown events to UIMessageStream protocol:

```typescript
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'

app.post('/api/agent/secretary', async (c) => {
  const agent = new EditorDeepAgent(config)
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      for await (const event of agent.stream(input)) {
        switch (event.type) {
          case 'assistant-delta':
          case 'text-delta':
            writer.write({ type: 'text-delta', textDelta: event.data })
            break
          case 'tool-call':
          case 'tool-result':
          case 'thinking':
          case 'edit-proposal':
          case 'artifact':
          case 'note-navigate':
          default:
            writer.write({ type: 'data-custom', data: { inkdownType: event.type, ...event } })
            break
        }
      }
    },
  })
  return createUIMessageStreamResponse({ stream })
})
```

### Files to modify
- `apps/api/src/routes/agent.ts`
- `apps/api/src/routes/secretary.ts`
- `apps/api/src/routes/research.ts`
- `apps/api/src/routes/course.ts`
- `apps/api/src/routes/explain.ts`
- `apps/api/src/routes/orchestration.ts`
- `apps/api/src/routes/slides.ts`

### Create shared utility
- Create: `apps/api/src/utils/ai-sdk-stream.ts` — shared `mapInkdownEventToStreamPart()` function

### Verify
```bash
pnpm build && pnpm typecheck
# curl each endpoint, verify UIMessageStream protocol output
```

---

## Phase 6: Frontend Migration — Vue AI SDK Integration (3-4 days)

### Goal
Replace 3 manual SSE parsers with `@ai-sdk/vue` `Chat` class + custom data handling.

### Step 6a: Create shared transport

Create `apps/web/src/services/ai-sdk-transport.ts`:
```typescript
import { DefaultChatTransport } from 'ai'
// Custom transport with Supabase auth headers
export function createAuthTransport(endpoint: string) {
  return new DefaultChatTransport({
    api: endpoint,
    headers: async () => ({
      Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  })
}
```

### Step 6b: Migrate AI service SSE parser

Refactor `apps/web/src/services/ai.service.ts`:
- Replace manual `ReadableStream` + `TextDecoder` parsing with `Chat` class from `@ai-sdk/vue`
- Process `data-custom` parts via callback for Inkdown-specific events (edit-proposal, artifact, thinking, etc.)
- Keep: `computeDiffHunks()` logic (operates on content, not stream format)

### Step 6c: Migrate stores

- `apps/web/src/stores/ai.ts` — Replace manual message accumulation; use `Chat.messages` for text, keep Inkdown-specific state (diffs, artifacts, thinking steps)
- `apps/web/src/stores/secretary.ts` — Replace `sendChatMessage()` SSE parsing with Chat class
- `apps/web/src/stores/missions.ts` — If unused (confirmed orphaned), delete entirely

### Step 6d: Update components

Components that directly reference old event types:
- `apps/web/src/components/ai/AISidebar.vue`
- `apps/web/src/components/ai/ThinkingStepsAccordion.vue`
- `apps/web/src/views/HomePage.vue`
- `apps/web/src/components/secretary/SecretaryPanel.vue`

### Step 6e: Delete dead frontend code
- Merge `SubagentCard.vue` + `SubagentProgressCard.vue` into one component
- Remove non-functional AISidebar buttons (Attach, Search, Mention)
- Remove `searchQuery` ref (bound but unused)
- Remove `currentAgentType` from AI store (set but never read)

### Verify
```bash
pnpm build && pnpm typecheck && pnpm lint
# Manual: Full UI regression test of all chat interfaces
# Verify: Edit proposals, artifacts, diff blocks, tool calls render correctly
# Verify: Secretary chat, research chat, course generation stream correctly
```

---

## Phase 7: Final Cleanup — Remove Legacy Dependencies (1-2 days)

### Goal
Remove all old AI framework code and dependencies.

### Delete files
- `packages/ai/src/providers/client-factory.ts`
- `packages/ai/src/providers/factory.ts` (if not deleted in Phase 0)
- `packages/ai/src/providers/langchain-token-callback.ts`
- `packages/ai/src/providers/interface.ts` (AIProvider interface)
- `packages/ai/src/providers/openai.ts` (OpenAIProvider class)
- `packages/ai/src/providers/gemini.ts` (GeminiProvider class)
- `packages/ai/src/agents/shared/base-stream-normalizer.ts`
- Any remaining `*stream-normalizer*` files

### Remove dependencies from `packages/ai/package.json`
```
Remove: "openai"
Remove: "deepagents"
Remove: "langchain", "@langchain/core", "@langchain/anthropic"
Remove: "@langchain/google-genai", "@langchain/langgraph"
Remove: "@langchain/ollama", "@langchain/openai"
Remove: "@google/generative-ai", "@google/genai"
```

### Keep
```
"ai" ^6.x, "@ai-sdk/google", "@ai-sdk/openai"
"@supabase/supabase-js", "zod", "pdf-parse"
```

### Update exports and documentation
- `packages/ai/src/providers/index.ts` — only AI SDK exports
- `packages/ai/src/index.ts` — clean up barrel exports
- `docs/ARCHITECTURE.md` — update provider infrastructure section

### Final verify
```bash
pnpm install  # lockfile should shrink significantly (~25MB fewer deps)
pnpm build && pnpm typecheck && pnpm lint && pnpm test:run
# Full regression test of all features
```

---

## What We Keep (competitive advantage, no changes)

- **Supabase persistence** — sessions, threads, messages, memory files, credits
- **Secretary memory system** — Plan.md, Today.md, Tomorrow.md, markdown parser/renderer
- **Mission orchestrator** — multi-stage pipeline with approval gates
- **SharedContextService** — cross-agent context bus
- **Token tracking + credit system** — `tokenTracker` singleton + `usagePersister`
- **Diff system** — `useDiffBlocks.ts` + `computeDiffHunks()` (jsdiff)
- **Model registry** — `selectModel()` task-to-model mapping

## What We Delete (commodity plumbing replaced by AI SDK)

| Deleted | Replaced By | LOC Removed |
|---------|-------------|-------------|
| `client-factory.ts` (createOpenAIClient + createLangChainModel) | `ai-sdk-factory.ts` (createAIModel) | ~200 |
| `factory.ts` (legacy provider factory) | Deleted | ~150 |
| `openai.ts` (OpenAIProvider class) | `streamText()` / `generateText()` | ~400 |
| `gemini.ts` (GeminiProvider class) | AI SDK google provider | ~600 |
| `langchain-token-callback.ts` | `ai-sdk-usage.ts` | ~80 |
| 3 stream normalizers | AI SDK built-in dedup | ~600 |
| `base-stream-normalizer.ts` | AI SDK built-in | ~200 |
| `agentic.agent.ts` + types | Deleted (stub) | ~700 |
| 3 manual SSE parsers (frontend) | `@ai-sdk/vue` Chat class | ~900 |
| **Total** | | **~3,830 LOC** |

## Dependencies Removed

| Package | Size | Reason |
|---------|------|--------|
| `openai` | ~2MB | Replaced by AI SDK providers |
| `deepagents` | ~1MB | Replaced by ToolLoopAgent |
| `langchain` | ~5MB | Replaced by AI SDK |
| `@langchain/core` | ~3MB | Replaced by AI SDK `tool()` |
| `@langchain/google-genai` | ~1MB | Replaced by `@ai-sdk/google` |
| `@langchain/openai` | ~1MB | Replaced by `@ai-sdk/openai` |
| `@langchain/ollama` | ~500KB | Replaced by OpenAI-compat provider |
| `@langchain/anthropic` | ~1MB | Not used |
| `@langchain/langgraph` | ~2MB | Replaced by ToolLoopAgent |
| `@google/generative-ai` | ~1MB | Replaced by `@ai-sdk/google` |
| `@google/genai` | ~1MB | Replaced by `@ai-sdk/google` |
| `@anthropic-ai/sdk` | ~1MB | Not used |
| **Total** | **~20MB** | |

---

## Verification Checklist (run after each phase)

```bash
# Build & type safety
pnpm build && pnpm typecheck && pnpm lint

# Unit tests
pnpm test:run

# Integration: verify each AI feature end-to-end
# 1. AI Editor Sidebar — send edit request, verify diff blocks appear
# 2. AI Chat — send message, verify streaming response
# 3. Secretary — send planning request, verify memory updates
# 4. Research — start deep research, verify subagent progress
# 5. Course — generate course, verify outline approval flow
# 6. Explain — ask question about lesson, verify explanation
# 7. Artifacts — request code artifact, verify preview + insertion
# 8. Tables — request data table, verify creation
```

---

## Estimated Timeline

| Phase | Description | Days | Risk | Deps |
|-------|-------------|------|------|------|
| 0 | Dead code cleanup | 1 | Very Low | None |
| 1 | AI SDK provider layer | 2-3 | Medium | Phase 0 |
| 2 | Simple agents (5) | 2-3 | Low | Phase 1 |
| 3 | Tool agents (3) | 2-3 | Medium | Phase 2 |
| 4 | Complex agents (4) | 5-7 | High | Phase 3 |
| 5 | API route migration | 2-3 | Medium | Phase 4 |
| 6 | Frontend migration | 3-4 | Medium-High | Phase 5 |
| 7 | Final cleanup | 1-2 | Low | Phase 6 |
| **Total** | | **18-26 days** | | |
