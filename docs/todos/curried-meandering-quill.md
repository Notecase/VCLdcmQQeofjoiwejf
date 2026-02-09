# Deep Agent System Integration Plan for Inkdown

## Context

**Problem**: The AI homepage (`/home`) currently uses the same EditorAgent/DeepAgent pipeline as the note editor, which is optimized for note editing (edit proposals, diff blocks, artifacts) but lacks the research-oriented capabilities seen in LangGraph deep-agent systems: progressive task tracking, virtual file generation, human-in-the-loop interrupts, and sub-agent transparency.

**Goal**: Transform the `/home` page into a deep-agent research experience inspired by [deep-agents-ui](https://github.com/langchain-ai/deep-agents-ui), make it the **default landing page**, delete the redundant `/ai` (AI Studio) page, and integrate with Inkdown's note system.

**User decisions**:

- `/home` becomes the default route (`/` → editor moves to `/editor`)
- `/ai` (AI Studio) page is deleted — its functionality is absorbed by the enhanced `/home`
- Web search: Tavily API (same as deep-agents-ui)
- Full 7-phase implementation

**Key features to bring from deep-agents-ui**:

1. Files as shared mutable state (agent generates .md reports, user can edit them)
2. Progressive task disclosure (collapsible todo panel showing "Task 3 of 7")
3. Human-in-the-loop interrupts (approve/reject/edit tool calls)
4. Sub-agent transparency (expandable cards showing research sub-agent work)
5. Thread management with status badges

---

## Architecture Overview

```
                          /home (transformed)
                               |
                    useDeepAgentStore (NEW Pinia store)
                               |
              deepAgent.service.ts (NEW SSE client)
                               |
                    POST /api/research/chat (NEW)
                               |
                     ResearchAgent (NEW)
                     /        |       \
              Sub-agents   Tools    Interrupt
              (research,   (file,   mechanism
               writer)     search,  (pause/resume)
                           note)
```

**Key design decisions**:

- **NEW agent** (`ResearchAgent`) rather than enhancing DeepAgent — keeps backward compat
- **Hybrid state**: Backend manages execution state, streams updates to frontend via SSE
- **NEW Pinia store** (`useDeepAgentStore`) — separate from `useAIStore` and `useSecretaryStore`
- **Virtual filesystem with note bridge**: Files in agent state → "Save as Note" creates real Inkdown notes
- **Interrupt via SSE pause + REST resume**: No WebSockets needed

### New SSE Events (additive to existing)

| Event             | Purpose                           |
| ----------------- | --------------------------------- |
| `todo-update`     | Task list state change            |
| `file-write`      | Virtual file created/updated      |
| `file-delete`     | Virtual file removed              |
| `interrupt`       | Agent paused, awaiting user input |
| `subagent-start`  | Named sub-agent beginning work    |
| `subagent-result` | Sub-agent returned result         |
| `thread-status`   | Thread status change              |

### Route Changes

- `/home` → becomes `/` (default landing page)
- `/` (editor) → moves to `/editor`
- `/ai` (AI Studio) → **DELETED**
- `/calendar` (Secretary) → unchanged

### What Stays Unchanged

- Editor sidebar AI (`/editor`, `AISidebar.vue`) — untouched, just re-routed
- Secretary (`/calendar`) — untouched
- All existing SSE events — preserved
- `useAIStore` — not modified (still used by editor sidebar)

---

## Phase 0: Route Cleanup + AI Studio Deletion

**Goal**: Clean routing, make `/home` the default, delete `/ai`, re-route editor.

**Files to modify**:

- `apps/web/src/main.ts` — Change routes:
  - `/` → `HomePage.vue` (was `/home`)
  - `/editor` → `EditorView.vue` (was `/`)
  - DELETE `/ai` route entirely
  - DELETE `/home` route (now at `/`)
- `apps/web/src/components/ui/NavigationDock.vue` — Update navigation targets:
  - Notes button: `/editor` (was `/`)
  - Home button: `/` (was `/home`)
  - Remove LayoutGrid/Dashboard button (was `/ai`)
- `apps/web/src/components/layout/SideBar.vue` — Update route-aware behavior (check `route.path === '/'` instead of `/home`)

**Files to DELETE**:

- `apps/web/src/views/AIChat.vue` — AI Studio page (functionality absorbed by HomePage)
- `apps/web/src/components/ai/AgentConsole.vue` — Only used by AIChat.vue (verify no other consumers first)

**Deliverable**: Clean 4-route app: `/` (deep agent home), `/editor`, `/calendar`, `/auth`.

---

## Phase 1: Shared Types + Backend Agent Shell

**Goal**: ResearchAgent that can stream basic text responses.

**Files to create**:

- `packages/shared/src/types/research.ts` — All new types (ResearchThread, VirtualFile, TodoItem, InterruptData, ResearchStreamEvent)
- `packages/ai/src/agents/research/agent.ts` — ResearchAgent class using `createDeepAgent()` pattern from `packages/ai/src/agents/secretary/agent.ts`
- `packages/ai/src/agents/research/prompts.ts` — System prompts for research workflow
- `packages/ai/src/agents/research/tools.ts` — Empty tools array initially
- `packages/ai/src/agents/research/index.ts` — Barrel exports
- `apps/api/src/routes/research.ts` — Chat SSE endpoint using `streamSSE()` from `apps/api/src/routes/secretary.ts` pattern

**Files to modify**:

- `packages/shared/src/types/index.ts` — Re-export research types
- `packages/ai/src/agents/index.ts` — Add research agent exports
- `apps/api/src/routes/index.ts` — Mount `/api/research` routes

**Deliverable**: `POST /api/research/chat` streams text responses.

---

## Phase 2: Virtual File System + Todo Tracking

**Goal**: Agent can create files and todos during execution, emitting SSE events.

**Files to modify**:

- `packages/ai/src/agents/research/tools.ts` — Add tools: `write_file`, `read_file`, `delete_file`, `list_files`, `write_todo`, `complete_todo`, `web_search` (Tavily), `think` (strategic reflection)
- `packages/ai/src/agents/research/agent.ts` — Wire tools, add file/todo state management

**New dependency**: `@tavily/core` (or Tavily REST API via fetch) — add to `packages/ai/package.json`. Requires `TAVILY_API_KEY` env var.

**Deliverable**: Agent creates files and todos, can search the web, events stream to client.

---

## Phase 3: Interrupt Mechanism

**Goal**: Agent can pause for user approval and resume.

**Files to modify**:

- `packages/ai/src/agents/research/tools.ts` — Add `request_approval` tool
- `packages/ai/src/agents/research/agent.ts` — Promise-based pause/resume
- `apps/api/src/routes/research.ts` — Add `POST /threads/:id/interrupt-response` endpoint
- `packages/shared/src/types/research.ts` — Add InterruptOption type

**Interrupt flow**:

1. Agent calls `request_approval` tool → emits `interrupt` SSE event
2. Backend holds generator suspended (Promise-based)
3. Frontend shows approve/reject/edit UI
4. User responds → `POST .../interrupt-response` → Promise resolves
5. Generator resumes with user's decision

**Deliverable**: Agent pauses mid-execution, user responds, agent resumes.

---

## Phase 4: Frontend Store + Service Layer

**Goal**: Pinia store and SSE service processing all research events.

**Files to create**:

- `apps/web/src/stores/deepAgent.ts` — `useDeepAgentStore` following `stores/secretary.ts` pattern
  - State: threads, chatMessages, todos, files, activeSubagents, pendingInterrupt, threadStatus
  - Actions: sendChatMessage, respondToInterrupt, saveFileAsNote, editFile, thread CRUD
- `apps/web/src/services/deepAgent.service.ts` — SSE client following `services/ai.service.ts` pattern

**Deliverable**: Frontend can stream messages and reactively update all state.

---

## Phase 5: Core UI Components (parallelizable — 2 agents)

**Goal**: Functional deep agent UI on `/home`.

### Agent A: Chat + Interrupt UI

- `apps/web/src/components/deepagent/TaskProgressBar.vue` — Horizontal bar: "Task 3/7: Researching..." Collapsible.
- `apps/web/src/components/deepagent/InterruptBanner.vue` — Full-width banner with approve/reject/edit buttons
- `apps/web/src/components/deepagent/SubagentCard.vue` — Expandable card showing sub-agent input/output

### Agent B: Files + Todos + Right Panel

- `apps/web/src/components/deepagent/FileGrid.vue` — Card grid of virtual files
- `apps/web/src/components/deepagent/FileCard.vue` — Individual file card (icon, name, timestamp)
- `apps/web/src/components/deepagent/FileViewerModal.vue` — 60vw x 80vh modal: rendered markdown, edit mode, copy, download, "Save as Note"
- `apps/web/src/components/deepagent/TodoPanel.vue` — List of todos with status icons + progress
- `apps/web/src/components/deepagent/DeepAgentRightPanel.vue` — Container with Files/Todos/Preview tabs

**Deliverable**: All UI building blocks exist.

---

## Phase 6: HomePage Transformation + Thread Management

**Goal**: Wire everything together on `/home`, add thread persistence.

**Files to modify**:

- `apps/web/src/views/HomePage.vue` — New layout integrating all deep agent components:
  ```
  SideBar | [ThreadListPanel] | ChatMain (with TaskProgressBar, InterruptBanner, SubagentCards) | DeepAgentRightPanel
  ```
- `apps/web/src/components/deepagent/ThreadListPanel.vue` — Thread list with status badges, time grouping

**Files to create/modify**:

- `apps/api/src/routes/research.ts` — Add thread CRUD endpoints (GET/DELETE/PATCH)
- Database migration for `research_threads`, `research_messages`, `research_files` tables

**Deliverable**: Full deep agent experience on `/home` with thread persistence.

---

## Phase 7: Note Integration + Sub-agents

**Goal**: "Save as Note" flow, note reading tools, named research sub-agents.

**Files to modify**:

- `packages/ai/src/agents/research/tools.ts` — Add `read_note`, `search_notes` tools
- `packages/ai/src/agents/research/agent.ts` — Add sub-agent definitions (researcher, writer)
- `packages/ai/src/agents/research/subagents.ts` — Sub-agent prompts
- `apps/web/src/components/deepagent/FileViewerModal.vue` — "Save as Note" button
- `apps/web/src/stores/deepAgent.ts` — `saveFileAsNote()` calling NoteAgent.create()

**Integration flow**:

- Virtual files → "Save as Note" → creates real Inkdown note
- Agent can read existing notes via `read_note` tool
- Saved notes can be edited with existing editor AI (diff system works normally)

**Deliverable**: Complete research workflow with Inkdown note integration.

---

## Critical Pattern Files to Follow

| Pattern               | Source File                                 |
| --------------------- | ------------------------------------------- |
| LangGraph agent class | `packages/ai/src/agents/secretary/agent.ts` |
| Hono SSE route        | `apps/api/src/routes/secretary.ts`          |
| Pinia store with SSE  | `apps/web/src/stores/secretary.ts`          |
| SSE event processing  | `apps/web/src/services/ai.service.ts`       |
| HomePage layout       | `apps/web/src/views/HomePage.vue`           |
| Shared types pattern  | `packages/shared/src/types/index.ts`        |

---

## Verification Plan

### Per-Phase Testing

- **Phase 1**: `curl -X POST /api/research/chat -d '{"message":"hello"}'` → streams text events
- **Phase 2**: Send "research quantum computing" → agent creates files + todos in SSE stream
- **Phase 3**: Agent pauses with interrupt → send interrupt response → agent resumes
- **Phase 4**: Open `/home` → send message → store updates reactively from SSE
- **Phase 5**: Visual inspection of all components rendering correctly
- **Phase 6**: Create thread → send messages → reload page → thread persists
- **Phase 7**: Agent generates report → "Save as Note" → navigate to editor → note exists

### End-to-End Test

1. Navigate to `/home`
2. Type "Research the state of AI in 2026 and create a comprehensive report"
3. Observe: todos appear (plan), sub-agent cards show research progress, files appear (research_request.md, final_report.md)
4. Agent pauses for approval → click "Approve"
5. Agent completes → click final_report.md → see rendered markdown
6. Click "Save as Note" → note appears in sidebar
7. Navigate to editor → open the note → use AISidebar to refine it

---

## Risks & Mitigations

| Risk                                           | Mitigation                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| SSE timeout during long research               | Implement reconnection with `Last-Event-ID` + LangGraph checkpointer       |
| Interrupt state leak (in-memory)               | TTL cache (5 min timeout), auto-reject stale interrupts                    |
| Virtual file size growth                       | Cap at 100KB per file, 20 files per thread                                 |
| Store collision with existing stores           | Dedicated `useDeepAgentStore`, no shared state with `useAIStore`           |
| `deepagents` package already used by Secretary | Both agents share the same package version from `packages/ai/package.json` |

---

## Implementation Notes for Agent Team

- **All agents must use Opus 4.6** as specified
- **8 phases total** (Phase 0-7), each self-contained for one agent
- Phase 5 can be parallelized (2 agents: Chat UI + Files UI)
- Phase 0 should be done FIRST (routing changes affect all subsequent phases)
- Phases 1-3 (backend) can run in parallel with Phase 4 (frontend store) after Phase 0
- Follow existing patterns strictly — the Secretary system is the blueprint
- Use `AppError` from `@inkdown/shared/errors` for all error handling
- Types go in `@inkdown/shared/types` (single source of truth)
- No circular dependencies — `@inkdown/ai` depends only on `@inkdown/shared`

### Parallel Execution Strategy

```
Phase 0 (routing cleanup)
    |
    ├── Phase 1 (types + agent shell) ──→ Phase 2 (tools + Tavily) ──→ Phase 3 (interrupts)
    |                                                                         |
    └── Phase 4 (frontend store) ────────────────────────────────────────────→|
                                                                              |
                                                                     Phase 5A + 5B (UI components, parallel)
                                                                              |
                                                                     Phase 6 (HomePage transformation + threads)
                                                                              |
                                                                     Phase 7 (note integration + sub-agents)
```
