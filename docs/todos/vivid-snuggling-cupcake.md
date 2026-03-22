# Phase 3: EditorDeepAgent → AI SDK v6 ToolLoopAgent

## Context

Phases 0-2 are complete: dead code removed, AI SDK v6 provider layer built, 5 simple agents migrated to `streamText()`/`generateText()`. Phase 3 is the most significant migration — converting the **production AI agent** from `deepagents` (LangChain) to AI SDK v6 `ToolLoopAgent`.

### Critical Discovery

The API route `/api/agent/secretary` has `shouldUseEditorDeepRuntime()` which **always returns true** (line 49-57 of `agent.ts`). This means:
- **EditorDeepAgent** (`packages/ai/src/agents/editor-deep/`) — the ONLY production runtime
- **EditorAgent** (`editor.agent.ts`) — legacy, never used, deprecate
- **InkdownDeepAgent** (`deep-agent.ts`) — legacy, never used, deprecate
- **NoteAgent** (`note.agent.ts`) — used as delegate by legacy agents, also migrate its OpenAI SDK calls

### What Changes

| Component | Before | After |
|-----------|--------|-------|
| Agent framework | `deepagents` (LangGraph) | AI SDK v6 `ToolLoopAgent` |
| Tool definitions | `@langchain/core/tools` `tool()` | `'ai'` `tool()` |
| Model creation | `createLangChainModel()` + `TokenTrackingCallback` | `getModelForTask()` + `trackAISDKUsage()` |
| Stream processing | `EditorDeepStreamNormalizer` (LangGraph events) | New `AISdkStreamAdapter` (AI SDK `fullStream`) |
| Subagent routing | `createEditorSubagents()` (LangGraph nodes) | Implicit — ToolLoopAgent decides which tools to call |

### What Stays Unchanged

- `EditorDeepAgentEvent` types (17 event types — SSE contract preserved)
- `EditorDeepAgentRequest` interface
- `EditorToolContext` with `emitEvent()` side-channel
- `EditorLongTermMemory` and `EditorConversationHistoryService`
- System prompts in `prompts.ts`
- All 35 tools in `packages/ai/src/tools/` (EditorDeep tools delegate to these)
- API route streaming pattern (Hono SSE)
- Frontend — zero changes

---

## Step 3.1 — Convert 12 LangChain tools to AI SDK tool() format

**File:** `packages/ai/src/agents/editor-deep/tools.ts`

### Conversion pattern

```typescript
// BEFORE (LangChain)
import { tool } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'

const readNoteStructure = tool(
  async (input: { noteId?: string }, config: RunnableConfig) => {
    const ctx = config.configurable as EditorToolContext
    // ... execution logic
    return JSON.stringify(result)
  },
  { name: 'read_note_structure', description: '...', schema: z.object({ noteId: z.string().optional() }) }
)

// AFTER (AI SDK v6)
import { tool } from 'ai'

const readNoteStructure = tool({
  description: '...',
  inputSchema: z.object({ noteId: z.string().optional() }),
  execute: async (input, _options) => {
    // ctx is captured via closure from createEditorDeepTools()
    // ... same execution logic
    return result  // Return object directly, not JSON.stringify
  },
})
```

### Key differences

| LangChain | AI SDK v6 |
|-----------|-----------|
| `tool(executeFn, { name, description, schema })` | `tool({ description, inputSchema, execute })` |
| Tool name in options object | Tool name is the key in the tools record |
| `config.configurable` for context | Closure-captured context |
| `config.writer` for progress events | `ctx.emitEvent()` side-channel (already used by most tools) |
| Returns `JSON.stringify(result)` | Returns object directly |
| `schema: z.object(...)` | `inputSchema: z.object(...)` |

### Tool inventory (12 tools to convert)

| Tool | Input Schema | Side-effects | Notes |
|------|-------------|-------------|-------|
| `read_note_structure` | `{ noteId? }` | None | Reads note + parses markdown structure |
| `answer_question_about_note` | `{ noteId? }` | None | Reads note content for Q&A |
| `create_note` | `{ title, content, projectId? }` | Supabase insert, emits `note-navigate` | Creates new note |
| `add_paragraph` | `{ content, position?, afterHeading? }` | Emits `edit-proposal` | Adds content to note |
| `remove_paragraph` | `{ blockIndex, heading? }` | Emits `edit-proposal` | Removes section/block |
| `edit_paragraph` | `{ instruction, blockIndex?, heading? }` | LLM call + emits `edit-proposal` | Edits specific section |
| `create_artifact_from_note` | `{ description }` | Emits `artifact` | Creates HTML/CSS/JS widget |
| `insert_table` | `{ description, noteId? }` | Emits `edit-proposal` | Generates markdown table |
| `database_action` | `{ action, noteId?, ... }` | Delegates to `executeTool()` | CRUD on embedded databases |
| `read_memory` | `{ memoryType }` | None | Reads AI memory/preferences |
| `write_memory` | `{ memoryType, content }` | Supabase write | Updates AI memory |
| `ask_user_preference` | `{ question, options }` | Emits `pre-action-question` | Asks user before proceeding |

### Function signature change

```typescript
// BEFORE
export function createEditorDeepTools(
  ctx: EditorToolContext,
  memoryService: EditorLongTermMemory
): StructuredToolInterface[]

// AFTER
export function createEditorDeepTools(
  ctx: EditorToolContext,
  memoryService: EditorLongTermMemory
): Record<string, ReturnType<typeof tool>>  // AI SDK tools record
```

The return type changes from LangChain `StructuredToolInterface[]` to AI SDK's tools record (`Record<string, Tool>`).

### emitEvent side-channel

The `ctx.emitEvent()` pattern is already used by most tools to push `edit-proposal`, `note-navigate`, `artifact`, `clarification-requested`, and `pre-action-question` events. This pattern is framework-agnostic and works identically with ToolLoopAgent — the tool execute function captures `ctx` via closure and pushes events to `pendingEvents`.

### config.writer migration

3 tools use `config.writer` from LangChain's `RunnableConfig` for streaming progress:
- `edit_paragraph` — emits "Reading note..." / "Editing section..."
- `create_artifact_from_note` — emits generation progress
- `database_action` — emits action progress

Migrate to `ctx.emitEvent({ type: 'custom-progress', data: { message } })`.

---

## Step 3.2 — Create AI SDK stream adapter

**New file:** `packages/ai/src/agents/editor-deep/ai-sdk-stream-adapter.ts`

Replaces `EditorDeepStreamNormalizer` — maps AI SDK `fullStream` parts to `EditorDeepAgentEvent`.

### Mapping

| AI SDK `fullStream` part | `EditorDeepAgentEvent` |
|-------------------------|----------------------|
| First `text` chunk | `{ type: 'assistant-start' }` + `{ type: 'assistant-delta', data: text }` |
| Subsequent `text` chunks | `{ type: 'assistant-delta', data: text }` |
| `tool-call` | `{ type: 'tool-call', data: { tool: name, arguments } }` |
| `tool-result` | `{ type: 'tool-result', data: output }` + drain `pendingEvents` |
| `finish` | `{ type: 'assistant-final', data: fullText }` + `{ type: 'done' }` |

### pendingEvents drain

After each `tool-result`, drain the `pendingEvents` array (populated by tool execute functions via `ctx.emitEvent()`). This yields Inkdown-specific events: `edit-proposal`, `note-navigate`, `artifact`, `clarification-requested`, `pre-action-question`, `custom-progress`.

```typescript
export async function* adaptAISDKStream(
  fullStream: AsyncIterable<TextStreamPart>,
  pendingEvents: EditorDeepAgentEvent[],
): AsyncGenerator<EditorDeepAgentEvent> {
  let seq = 0
  let assistantStarted = false
  let fullText = ''

  for await (const part of fullStream) {
    switch (part.type) {
      case 'text':
        if (!assistantStarted) {
          yield { type: 'assistant-start', data: null, seq: seq++ }
          assistantStarted = true
        }
        fullText += part.text
        yield { type: 'assistant-delta', data: part.text, seq: seq++ }
        break

      case 'tool-call':
        yield { type: 'tool-call', data: { tool: part.toolName, arguments: part.input }, seq: seq++ }
        break

      case 'tool-result':
        yield { type: 'tool-result', data: part.output, seq: seq++ }
        // Drain side-channel events from tool execution
        while (pendingEvents.length > 0) {
          const event = pendingEvents.shift()!
          yield { ...event, seq: seq++ }
        }
        break

      case 'step-finish':
        // Optional: emit subagent-complete equivalent for multi-step tracking
        break

      case 'finish':
        if (fullText) {
          yield { type: 'assistant-final', data: fullText, seq: seq++ }
        }
        yield { type: 'done', data: { threadId: '' }, seq: seq++ }
        break
    }
  }
}
```

---

## Step 3.3 — Rewrite EditorDeepAgent core

**File:** `packages/ai/src/agents/editor-deep/agent.ts`

### Import changes

```typescript
// REMOVE
import { createLangChainModel } from '../../providers/client-factory'
import { TokenTrackingCallback } from '../../providers/langchain-token-callback'
// (lazy import of 'deepagents' also removed)

// ADD
import { ToolLoopAgent, stepCountIs } from 'ai'
import { getModelForTask } from '../../providers/ai-sdk-factory'
import { trackAISDKUsage } from '../../providers/ai-sdk-usage'
import { adaptAISDKStream } from './ai-sdk-stream-adapter'
```

### Config change

```typescript
// REMOVE openaiApiKey
export interface EditorDeepAgentConfig {
  supabase: SupabaseClient
  userId: string
  model?: string
  sharedContextService?: SharedContextService
}
```

### stream() method rewrite

```typescript
async *stream(input: EditorDeepAgentRequest): AsyncGenerator<EditorDeepAgentEvent> {
  // ... (keep: threadId, state init, thinking yield, memory service, deterministic shortcut)

  // REMOVE: const { createDeepAgent } = await import('deepagents')
  // REMOVE: const llm = await createLangChainModel(...)
  // REMOVE: const agent = createDeepAgent({ model: llm, ... })

  // NEW:
  const selectedModel = selectModel('editor-deep')
  const editorToolCtx: EditorToolContext = {
    userId: this.config.userId,
    supabase: this.config.supabase,
    editorContext: input.context || {},
    emitEvent: (event) => this.pendingEvents.push(event),
  }
  const memoryService = new EditorLongTermMemory(this.config.supabase, this.config.userId)
  const tools = createEditorDeepTools(editorToolCtx, memoryService)

  const agent = new ToolLoopAgent({
    model: getModelForTask('editor-deep'),
    instructions: systemPrompt,  // built from EDITOR_DEEP_SYSTEM_PROMPT + memory + shared context
    tools,
    stopWhen: stepCountIs(20),
    onFinish: trackAISDKUsage({ model: selectedModel.id, taskType: 'editor-deep' }),
  })

  // Build messages from conversation history
  const messages = this.buildInvocationMessages(historyMessages, input.message)

  const result = await agent.stream({ prompt: messages })

  // Adapt AI SDK stream to our event format
  yield* adaptAISDKStream(result.fullStream, this.pendingEvents)
}
```

### What stays

- `isNoteSummaryRequest()` deterministic shortcut
- `streamDeterministicNoteSummary()` — no LLM, just Supabase fetch
- `buildInvocationMessages()` — converts history to `{ role, content }[]` format
- Memory and history service loading
- SharedContextService enrichment of system prompt
- State tracking (`this.state`)

---

## Step 3.4 — Migrate NoteAgent's OpenAI SDK calls

**File:** `packages/ai/src/agents/note.agent.ts`

NoteAgent is still used by EditorDeepAgent tools (specifically `edit_paragraph` and `create_note` tools that may delegate to NoteAgent methods). Migrate its 3 OpenAI SDK calls:

| Method | Before | After |
|--------|--------|-------|
| `stream()` | `client.chat.completions.create({ stream: true })` + `trackOpenAIStream()` | `streamText()` + `trackAISDKUsage()` |
| `streamSurgicalEdit()` | Same OpenAI streaming | `streamText()` + `trackAISDKUsage()` |
| `generateContent()` | `client.chat.completions.create()` + `trackOpenAIResponse()` | `generateText()` + `recordAISDKUsage()` |

Remove `openaiApiKey` from `NoteAgentConfig`. Same pattern as Phase 2 agents.

---

## Step 3.5 — Delete obsolete files and deprecate legacy

### Delete
- `packages/ai/src/agents/editor-deep/stream-normalizer.ts` — replaced by `ai-sdk-stream-adapter.ts`
- `packages/ai/src/agents/editor-deep/stream-normalizer.test.ts` — replaced by adapter tests
- `packages/ai/src/agents/editor-deep/subagents.ts` — LangGraph subagent routing replaced by ToolLoopAgent's implicit routing
- `packages/ai/src/providers/langchain-token-callback.ts` — LangChain-specific, no longer needed

### Deprecate (add `@deprecated` JSDoc, keep functional)
- `packages/ai/src/agents/editor.agent.ts` — legacy intent-classification agent
- `packages/ai/src/agents/deep-agent.ts` — legacy compound-request decomposer

### Remove from `client-factory.ts`
- `createLangChainModel()` function — no longer called after this migration

### Remove `openaiApiKey` from
- `EditorDeepAgentConfig`
- `NoteAgentConfig`
- `EditorAgentConfig` (legacy but clean it)
- `DeepAgentConfig` (legacy but clean it)
- `AgentConfig` in `agents/index.ts`
- All constructors in `apps/api/src/routes/agent.ts`

---

## Step 3.6 — Remove LangChain dependencies

**File:** `packages/ai/package.json`

After verifying no remaining imports, remove:
```
"@langchain/anthropic"
"@langchain/core"
"@langchain/google-genai"
"@langchain/langgraph"
"@langchain/ollama"
"@langchain/openai"
"deepagents"
"langchain"
```

**Verification:** `grep -r "@langchain\|deepagents\|langchain" packages/ai/src/ --include='*.ts' | grep -v '.test.' | grep -v 'node_modules'`

**Note:** SecretaryAgent, ResearchAgent, CourseOrchestrator also use `deepagents`/LangChain (Phase 4 targets). Only remove these deps if ALL agents are migrated. If Phase 3 only migrates EditorDeepAgent, keep the deps for now and remove in Phase 4.

---

## Step 3.7 — Update API route

**File:** `apps/api/src/routes/agent.ts`

1. Remove `openaiApiKey` from EditorDeepAgent constructor
2. Remove `shouldUseEditorDeepRuntime()` conditional — always use EditorDeepAgent
3. Remove the legacy EditorAgent code path (or keep behind explicit `runtime: 'legacy'` flag)
4. Clean up unused `openaiApiKey` variable if no other agents on this route need it

---

## Migration Order

| Step | Files | Risk | Deps |
|------|-------|------|------|
| 3.1 | `editor-deep/tools.ts` | MEDIUM — 12 tool conversions | None |
| 3.2 | `editor-deep/ai-sdk-stream-adapter.ts` (new) | LOW — new file | None |
| 3.3 | `editor-deep/agent.ts` | HIGH — core agent rewrite | 3.1, 3.2 |
| 3.4 | `note.agent.ts` | LOW — same pattern as Phase 2 | None (parallel) |
| 3.5 | Delete files + deprecate legacy | LOW | 3.3 |
| 3.6 | `package.json` deps | MEDIUM — verify no remaining imports | 3.5 |
| 3.7 | `agent.ts` route | LOW | 3.3 |

Steps 3.1, 3.2, and 3.4 can run in parallel. Step 3.3 depends on 3.1 + 3.2.

---

## Verification

```bash
# After each step:
pnpm build && pnpm typecheck

# After all steps:
pnpm build && pnpm typecheck && pnpm lint && pnpm test:run

# Verify no LangChain imports remain in editor-deep:
grep -r "@langchain\|deepagents" packages/ai/src/agents/editor-deep/

# Verify no openaiApiKey in migrated agents:
grep -r "openaiApiKey" packages/ai/src/agents/editor-deep/ packages/ai/src/agents/note.agent.ts

# Manual e2e: Test all 12 tool invocations via /api/agent/secretary
# 1. Ask a question about the current note
# 2. Request a note edit (section-specific)
# 3. Create a new note
# 4. Add a paragraph to existing note
# 5. Create an interactive artifact
# 6. Insert a table
# 7. Read/write AI memory
# 8. Request clarification scenario
```

---

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| ToolLoopAgent API differs from docs | HIGH | Read `node_modules/ai/` source before implementing. Verify `ToolLoopAgent` class exists and has `stream()` method. |
| Tool execute return type changes | MEDIUM | LangChain tools return `string`. AI SDK tools return any value. Tool execute functions must return objects, not `JSON.stringify()`. |
| Side-channel events (emitEvent) timing | MEDIUM | Drain `pendingEvents` after each `tool-result` in the adapter. Test with multi-tool sequences. |
| Subagent events disappear | LOW | `subagent-start/delta/complete` events from LangGraph subgraph tracking have no AI SDK equivalent. Frontend already handles their absence gracefully. |
| LangChain deps still needed by other agents | MEDIUM | Only remove deps after confirming SecretaryAgent/ResearchAgent/CourseOrchestrator are also migrated (Phase 4). |
| NoteAgent still used by legacy EditorAgent | LOW | Legacy EditorAgent is deprecated. NoteAgent's Phase 2-style migration is safe. |

---

## What This Phase Achieves

After Phase 3:
- **Production AI agent uses AI SDK v6 ToolLoopAgent** with real LLM tool calling
- **12 tools defined in AI SDK format** — extensible, type-safe, documented
- **`deepagents` dependency removable** (pending Phase 4 agents)
- **No more LangChain in the hot path** — the main editor AI is pure AI SDK
- **All simple agents (Phase 2) + production agent (Phase 3) on AI SDK v6**
- Remaining: SecretaryAgent, ResearchAgent, CourseOrchestrator (Phase 4)
