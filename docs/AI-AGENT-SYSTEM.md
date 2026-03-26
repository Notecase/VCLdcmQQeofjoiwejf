# AI Agent System Reference

Quick-reference for every AI agent in the Inkdown/Noteshell system. Covers routing, tools, events, memory, and shared infrastructure.

**Last verified:** 2026-03-26

---

## Agent Inventory

| #   | Agent                  | Status   | AI SDK Pattern                                 | API Route                                       | UI Surface                          | File Path                                       |
| --- | ---------------------- | -------- | ---------------------------------------------- | ----------------------------------------------- | ----------------------------------- | ----------------------------------------------- |
| 1   | **EditorDeepAgent**    | ACTIVE   | `ToolLoopAgent` + stream adapter               | `POST /api/agent/secretary`                     | AISidebar (editor)                  | `packages/ai/src/agents/editor-deep/agent.ts`   |
| 2   | **SecretaryAgent**     | ACTIVE   | `ToolLoopAgent`                                | `POST /api/secretary/chat`                      | SecretaryChat                       | `packages/ai/src/agents/secretary/agent.ts`     |
| 3   | **NoteAgent**          | ACTIVE   | `streamText` / `generateText`                  | `POST /api/agent/note/action`                   | AISidebar (actions)                 | `packages/ai/src/agents/note.agent.ts`          |
| 4   | **PlannerAgent**       | ACTIVE   | `generateText` (structured)                    | `POST /api/agent/planner/plan`                  | AISidebar (plan tab)                | `packages/ai/src/agents/planner.agent.ts`       |
| 5   | **ResearchAgent**      | ACTIVE   | `ToolLoopAgent` (deep) / `streamText` (simple) | `POST /api/research/*`                          | ResearchView                        | `packages/ai/src/agents/research/agent.ts`      |
| 6   | **ChatAgent**          | UNUSED   | `streamText` + RAG                             | `POST /api/agent/chat`                          | None (route exists, no UI calls it) | `packages/ai/src/agents/chat.agent.ts`          |
| 7   | **ExplainAgent**       | DEFERRED | `streamText`                                   | `POST /api/course/explain`                      | —                                   | `packages/ai/src/agents/explain/index.ts`       |
| 8   | **CourseOrchestrator** | DEFERRED | `ToolLoopAgent`                                | `POST /api/agent/course/generate` (placeholder) | —                                   | `packages/ai/src/agents/course/orchestrator.ts` |
| 9   | **InboxAgent**         | INTERNAL | `ToolLoopAgent`                                | Heartbeat Edge Function                         | No direct UI                        | `supabase/functions/heartbeat/`                 |

---

## Naming Gotcha

**`/api/agent/secretary` ≠ SecretaryAgent**

The route `POST /api/agent/secretary` goes to **EditorDeepAgent** (the main editor AI). The actual **SecretaryAgent** (daily planner/roadmap) lives at `POST /api/secretary/chat`. This naming is historical — the editor route was originally the Secretary intent router before EditorDeepAgent took over.

```
POST /api/agent/secretary  →  EditorDeepAgent   (editor AI, compound requests)
POST /api/secretary/chat   →  SecretaryAgent     (daily planner, roadmap manager)
```

---

## ChatAgent Status (Dead Code)

ChatAgent (`chat.agent.ts`) has a working API route (`POST /api/agent/chat`) but **no frontend calls it**. The `sendToChat()` function exists in `ai.service.ts` but is never invoked from any Vue component. All chat goes through either EditorDeepAgent (editor sidebar) or SecretaryAgent (secretary panel).

**Wiring that exists but is unused:**

- `apps/api/src/routes/agent.ts` lines 562-638 — full route handler
- `apps/web/src/services/ai.service.ts:179` — `sendToChat()` function
- `packages/ai/src/agents/chat.agent.ts` — full agent class with RAG

---

## UI → Agent Routing

### Editor Sidebar (AISidebar.vue)

```
User types in AISidebar input
  → ai.service.ts: sendToSecretary(options)
  → POST /api/agent/secretary
  → agent.ts: EditorDeepAgent.stream()
  → 12 tools + ToolLoopAgent
  → SSE events back to frontend
```

### Secretary Panel (SecretaryChat.vue)

```
User types in SecretaryChat
  → secretary store: sendMessage()
  → POST /api/secretary/chat
  → secretary.ts: SecretaryAgent.stream()
  → 15 tools + ToolLoopAgent
  → SSE events back to frontend
```

### Note Actions (context menu)

```
User triggers note action (summarize, expand, etc.)
  → ai.service.ts: sendToNoteAgent(action, input)
  → POST /api/agent/note/action
  → agent.ts: NoteAgent.stream()
  → streamText / generateText
  → SSE events back to frontend
```

### Research (ResearchView)

```
User submits research query
  → POST /api/research/start
  → research.ts: ResearchAgent.stream()
  → ToolLoopAgent (deep) or streamText (simple)
  → SSE events back to frontend
```

---

## Agent Details

### 1. EditorDeepAgent (12 tools)

**Tools:**
`answer_question_about_note`, `read_note_structure`, `create_note`, `add_paragraph`, `remove_paragraph`, `edit_paragraph`, `create_artifact_from_note`, `insert_table`, `database_action`, `read_memory`, `write_memory`, `ask_user_preference`

**SSE Events:** `assistant-start`, `assistant-delta`, `assistant-final`, `tool-call`, `tool-result`, `thinking`, `clarification-requested`, `custom-progress`, `note-navigate`, `edit-proposal`, `artifact`, `error`, `done`

**Memory:** Per-thread state in `editor_thread_state` table. Long-term memory in `editor_memories` (scoped by note/project/global). Conversation history in `editor_messages`.

**Model:** `gemini-2.5-pro` (fallback: `gemini-3-flash`)

### 2. SecretaryAgent (15 tools)

**Tools:**
`readMemoryFile`, `writeMemoryFile`, `listMemoryFiles`, `deleteMemoryFile`, `renameMemoryFile`, `createRoadmap`, `saveRoadmap`, `activateRoadmap`, `generateDailyPlan`, `saveReflection`, `modifyPlan`, `bulkModifyPlan`, `carryOverTasks`, `manageRecurringBlocks`, `logActivity`

**SSE Events:** `thinking`, `text`, `tool_call`, `tool_result`, `roadmap_preview`, `done`, `error`

**Memory:** Markdown files in `secretary_memory` table (Plan.md, Today.md, Tomorrow.md, AI.md, Plans/_.md, History/_.md). Chat threads in `secretary_threads`.

**Model:** `gemini-2.5-pro` (fallback: `gemini-3-flash`)

### 3. NoteAgent (0 tools — direct streamText)

**Actions:** `create`, `update`, `organize`, `summarize`, `expand`

**SSE Events:** `text-delta`, `edit-proposal`, `finish`, `error`

**Memory:** None (stateless, operates on note content passed in)

**Model:** `gemini-2.5-pro` (fallback: `gemini-3-flash`)

### 4. PlannerAgent (0 tools — structured output)

**SSE Events:** `text-delta`, `finish`, `error`

**Memory:** None (stateless)

**Model:** `gemini-2.5-pro`

### 5. ResearchAgent (tools in deep mode)

**SSE Events:** `web-search-start`, `web-search-result`, `text-delta`, `citation`, `finish`, `error`

**Memory:** Research sessions in `research_sessions` table

**Model:** `gemini-2.5-pro` (simple), `deep-research-pro-preview` (deep mode)

### 6. ChatAgent (UNUSED — RAG with embeddings)

**SSE Events:** `text-delta`, `citation`, `finish`, `error`

**Memory:** Chat sessions in `chat_sessions`, messages in `chat_messages`

**Model:** `gemini-2.5-pro`

---

## Shared Infrastructure

All active agents share these systems:

| System                                          | What it does                                                                                | Used by                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Model Routing** (`ai-sdk-factory.ts`)         | `getModelsForTask()` returns primary + fallback models; `isTransientError()` triggers retry | All agents                              |
| **Usage Tracking** (`ai-sdk-usage.ts`)          | `trackAISDKUsage()` wraps streamText/generateText to record token counts + costs            | All agents                              |
| **Input Guard** (`input-guard.ts`)              | `detectInjection()` checks for prompt injection patterns before agent execution             | EditorDeep, Chat, Note (at route level) |
| **Output Guard** (`output-guard.ts`)            | `sanitizeOutput()` removes PII, harmful content from agent responses                        | EditorDeep, Chat                        |
| **Content Policy** (`content-policy.ts`)        | `buildSystemPrompt()` wraps agent system prompts with safety preamble                       | EditorDeep, Chat, Secretary             |
| **SharedContext** (`shared-context.service.ts`) | Cross-agent context bus — reads/writes `user_context_entries` table                         | EditorDeep, Secretary, Research, Course |
| **Credit Guard** (`credits.ts` middleware)      | Checks user credit balance before allowing agent execution                                  | All routes                              |
| **Google Safety** (`safety.ts`)                 | `getGoogleProviderOptions()` sets Gemini safety settings (BLOCK_NONE for all categories)    | All Gemini-using agents                 |

### What's NOT Shared (Agent-Isolated)

| System                  | Scope                                           | Agent                |
| ----------------------- | ----------------------------------------------- | -------------------- |
| `editor_memories` table | Per-note/project long-term memory               | EditorDeep only      |
| `editor_thread_state`   | Rolling summary, editor context snapshot        | EditorDeep only      |
| `secretary_memory`      | Markdown memory files (Plan.md, Today.md, etc.) | Secretary only       |
| `secretary_threads`     | Secretary chat history                          | Secretary only       |
| `research_sessions`     | Research session state                          | Research only        |
| Web search tool         | `search_web` via Serper API                     | EditorDeep, Research |
| Thread history replay   | `historyWindowTurns` (default 12)               | EditorDeep only      |

---

## SSE Event Types (Complete)

Which agent emits what, and what the frontend does with it:

| Event                     | Emitted by                               | Frontend handler                                              |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `assistant-start`         | EditorDeep                               | Resets message state                                          |
| `assistant-delta`         | EditorDeep                               | Appends to live message                                       |
| `assistant-final`         | EditorDeep                               | Sets final message text                                       |
| `text-delta`              | Secretary, Note, Planner, Chat, Research | Appends to live message                                       |
| `text`                    | Secretary                                | Appends to secretary message                                  |
| `thinking`                | EditorDeep, Secretary                    | Shows thinking accordion                                      |
| `tool-call`               | EditorDeep                               | Shows tool call card                                          |
| `tool-result`             | EditorDeep                               | Updates tool call card with result                            |
| `tool_call`               | Secretary                                | Shows tool indicator in secretary                             |
| `tool_result`             | Secretary                                | Updates tool indicator                                        |
| `edit-proposal`           | EditorDeep, Note                         | Triggers `computeDiffHunks()` → `useDiffBlocks` DOM injection |
| `artifact`                | EditorDeep                               | Adds to `pendingArtifacts` → EditorArea inserts block         |
| `citation`                | Chat, Research                           | Adds source chip to message                                   |
| `clarification-requested` | EditorDeep                               | Opens clarification dialog                                    |
| `note-navigate`           | EditorDeep                               | Frontend navigates to newly created note                      |
| `custom-progress`         | EditorDeep                               | Shows progress indicator                                      |
| `web-search-start`        | EditorDeep, Research                     | Shows search indicator                                        |
| `web-search-result`       | EditorDeep, Research                     | Shows search result chips                                     |
| `roadmap_preview`         | Secretary                                | Opens roadmap approval modal                                  |
| `done`                    | All                                      | Marks streaming complete, refreshes credits                   |
| `error`                   | All                                      | Shows error notification                                      |

---

## Provider Routing Summary

```
gemini-2.5-pro (PRIMARY)
  → chat, note-agent, planner, secretary, editor, editor-deep,
    completion, rewrite, summarize, explain, table, research, course, tool-call
  → Fallback: gemini-3-flash-preview

gemini-3.1-pro-preview
  → slides

gemini-3-flash-preview
  → inbox-agent

deep-research-pro-preview
  → deep-research

kimi-k2.5 (Ollama Cloud)
  → artifact, code

text-embedding-3-large (OpenAI)
  → embedding
```
