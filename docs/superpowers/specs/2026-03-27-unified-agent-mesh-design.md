# Unified Agent Mesh — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Author:** Quang + Claude (brainstorming session)

---

## Problem

Inkdown has 9 AI agents that operate as isolated islands. Each has its own tools, memory, and UI surface. No agent can call another. The user is the only "router" between them — if they want research results in their study plan, they must manually copy between surfaces.

Key symptoms:

- **Secretary can't read notes or search the web** — "Based on my ML notes, plan my week" is impossible
- **EditorDeep can't check the schedule** — "What's on my plan today?" from the editor gets no answer
- **ResearchAgent can't save findings as notes** — results live in a virtual file explorer, disconnected from the note system
- **ChatAgent is completely unused** — its RAG pipeline (the only semantic search across notes) is locked away
- **NoteAgent is dead code** — EditorDeep does everything it does
- **PlannerAgent is rarely used** — could be a tool Secretary calls, not a standalone agent

## Solution

The **Agent Mesh** — a peer network of specialized agents connected through a capability registry, built on AI SDK v6 subagent delegation.

### Core Principles

1. **Peer network, not hierarchy** — Any agent can call any other agent's capabilities
2. **Transparent delegation** — Users see when agents collaborate ("Checking your schedule...", "Searching your notes...")
3. **Two surfaces, one mode toggle** — Editor Sidebar + Secretary Panel are the primary UIs; Research is a mode toggle, not a separate page
4. **AI SDK v6 native** — All delegation uses the tool-wrapping-agent pattern (subagents as tools)
5. **Capability registry** — Agents don't call each other by name; they call capabilities. The registry routes to the right agent.

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                       USER SURFACES                        │
│                                                            │
│   ┌───────────────┐  ┌───────────────┐  ┌──────────────┐ │
│   │  Home Page     │  │Editor Sidebar │  │  Secretary   │ │
│   │  Chat          │  │  Chat         │  │  Panel       │ │
│   │ [Ask][Research] │  │[Ask][Research] │  │  Chat        │ │
│   └───────┬────────┘  └───────┬───────┘  └──────┬───────┘ │
│           │                   │                  │         │
│      EditorDeep          EditorDeep         Secretary     │
│      or Research         or Research                      │
└───────────┼───────────────────┼──────────────────┼────────┘
            │                   │                  │
      ┌─────▼───────────────────▼──────────────────▼─────┐
      │              CAPABILITY REGISTRY                  │
      │                                                   │
      │  notes.search    → KnowledgeEngine (RAG)          │
      │  notes.read      → executeTool('read_note')       │
      │  notes.create    → executeTool('create_note')     │
      │  schedule.read   → Secretary MemoryService        │
      │  research.quick  → ResearchAgent simple mode      │
      │  research.deep   → ResearchAgent deep mode        │
      │  planning.decompose → PlannerAgent                │
      │  context.time    → timezone-aware date/time       │
      │                                                   │
      └───────────────────────┬──────────────────────────┘
                              │
                       SharedContext Bus
                     (post-action writes)
```

---

## Agent Consolidation

| Agent                  | Current State        | After                                                     | Action                               |
| ---------------------- | -------------------- | --------------------------------------------------------- | ------------------------------------ |
| **EditorDeepAgent**    | Active, 13 tools     | Keep + enhance with 5 delegation tools                    | Primary agent for editor + home page |
| **SecretaryAgent**     | Active, 15 tools     | Keep + enhance with 4 delegation tools                    | Primary agent for planning           |
| **ResearchAgent**      | Active, own page     | Keep as agent, lose dedicated page                        | Accessible via Research mode toggle  |
| **ChatAgent**          | Unused               | Delete class — RAG extracted as `notes.search` capability | Pipeline lives on, wrapper dies      |
| **NoteAgent**          | Dead code            | Delete                                                    | EditorDeep does everything           |
| **PlannerAgent**       | Rarely used          | Downgrade to `planning.decompose` capability              | No own route                         |
| **ExplainAgent**       | Deferred 8 months    | Keep code, don't wire                                     | No change                            |
| **CourseOrchestrator** | Deferred 8 months    | Keep code, don't wire                                     | No change                            |
| **InboxAgent**         | Internal (heartbeat) | No change                                                 | Runs in Supabase Edge Function       |

**Result:** 9 agents → 3 active agents + 8 shared capabilities + 2 deferred

---

## Capability Registry

### Interface

```typescript
// packages/ai/src/registry/types.ts

interface Capability {
  name: string // e.g., 'notes.search'
  description: string // LLM sees this as tool description
  inputSchema: ZodSchema // Zod schema for type-safe input
  execute: (input: unknown, context: ToolContext) => Promise<string>
}

interface DelegationLog {
  parentAgent: string // who called
  capability: string // what was called
  inputSummary: string // truncated input
  outputSummary: string // truncated output
  durationMs: number
  tokensUsed: number
  timestamp: string
}
```

### Agent → Capability Wiring

| Agent          | Gets these delegation tools                                                        |
| -------------- | ---------------------------------------------------------------------------------- |
| **EditorDeep** | `notes.search`, `schedule.read`, `research.quick`, `research.deep`, `context.time` |
| **Secretary**  | `notes.search`, `notes.read`, `research.quick`, `context.time`                     |
| **Research**   | `notes.search`, `schedule.read`, `notes.create`, `context.time`                    |

### The 8 Capabilities

**1. `notes.search`** (extracted from ChatAgent RAG)

- Input: `{ query: string, maxResults?: number }`
- Embeds query → vector search `note_embeddings` → returns chunks with note titles + similarity scores
- No LLM call. Cheapest capability.

**2. `notes.read`** (existing core tool)

- Input: `{ noteId: string }`
- Reads note content from Supabase
- Pure DB read.

**3. `notes.create`** (existing EditorDeep tool, extracted)

- Input: `{ title: string, content: string, projectId?: string }`
- Inserts note → emits `note-navigate` event
- Used by Research to save findings as notes.

**4. `schedule.read`** (from SecretaryAgent)

- Input: `{ include?: ('today' | 'tomorrow' | 'plans' | 'preferences')[] }`
- Calls `MemoryService.getFullContext()` or reads specific memory files
- Returns formatted markdown of schedule/plans.

**5. `research.quick`** (ResearchAgent simple mode)

- Input: `{ query: string, maxSources?: number }`
- Web search via Serper → synthesize brief answer with sources
- Single LLM call + web search.

**6. `research.deep`** (ResearchAgent as subagent)

- Input: `{ query: string }`
- Full ResearchAgent run — multi-step, subagents, synthesis
- Streams progress back via `toModelOutput` summary. Most expensive capability.

**7. `planning.decompose`** (from PlannerAgent)

- Input: `{ goal: string, constraints?: string[] }`
- Decomposes goal into structured steps
- Single `generateText` call.

**8. `context.time`** (new, shared)

- Input: `{}`
- Returns timezone-aware current date, time, day of week
- Reads from user preferences or request header. Zero LLM cost.

---

## UI Changes

### Home Page (`HomePage.vue`)

- **Before:** Dedicated research chat with file explorer, todos, interrupts
- **After:** General AI chat (like Claude's main chat) with mode toggle
  - Default mode → EditorDeepAgent (general Q&A, note creation, quick tasks)
  - Research mode toggle → ResearchAgent (deep research with multi-step progress)
  - Both modes access all capabilities via registry

### Editor Sidebar (`AISidebar.vue`)

- **Before:** EditorDeepAgent only
- **After:** EditorDeepAgent with mode toggle
  - Default mode → EditorDeepAgent with note context (same as today)
  - Research mode toggle → ResearchAgent with current note context injected
  - EditorDeep gains delegation tools (search notes, check schedule, quick research)

### Secretary Panel

- **Before:** SecretaryAgent with no cross-agent access
- **After:** SecretaryAgent with delegation tools (search notes, read notes, quick research, time)
- No UI change to the surface itself

### Delegation UI (all surfaces)

- When an agent delegates, a thinking step appears:
  - "Searching your notes..." (notes.search)
  - "Checking your schedule..." (schedule.read)
  - "Researching online..." (research.quick)
  - "Deep researching..." (research.deep)
- Collapsed by default, expandable to see delegation result
- Uses existing `ThinkingStepsAccordion` component

---

## What Gets Deleted

### Files to delete:

- `packages/ai/src/agents/chat.agent.ts` + `chat.agent.test.ts`
- `packages/ai/src/agents/note.agent.ts`

### Routes to remove:

- `POST /api/agent/chat` (from `apps/api/src/routes/agent.ts`)
- `POST /api/agent/note/action` (from `apps/api/src/routes/agent.ts`)

### Frontend to clean:

- `sendToChat()` from `ai.service.ts`
- `sendToNoteAgent()` from `ai.service.ts`
- PlannerAgent standalone route (`POST /api/agent/planner/plan` — becomes internal capability only)

---

## Implementation Phases

### Phase 1: Capability Registry + Core Capabilities

Build the registry infrastructure. Extract `notes.search` from ChatAgent RAG. Create `context.time`. Wire `notes.read` and `notes.create` as capabilities. No agent changes yet.

### Phase 2: Agent Delegation

Give EditorDeep, Secretary, and Research their delegation tools via the registry. Add delegation logging. Add transparent thinking steps for delegations.

### Phase 3: UI Consolidation

Add Research mode toggle to Home Page + Editor Sidebar. Refactor Home Page from research-only to general AI chat with mode toggle. Refactor `deepAgent.store.ts` to support mode switching.

### Phase 4: Dead Code Cleanup

Delete ChatAgent, NoteAgent. Remove their routes and service functions. Downgrade PlannerAgent to capability-only. Update all documentation.

---

## Cost Analysis

Each delegation = one subagent call. For gemini-2.5-pro:

- `notes.search`: $0 (no LLM, just embedding + vector search)
- `notes.read`: $0 (pure DB read)
- `schedule.read`: $0 (pure DB read)
- `context.time`: $0 (pure function)
- `research.quick`: ~$0.003 (web search + one synthesize call)
- `research.deep`: ~$0.01-0.05 (multi-step research)
- `planning.decompose`: ~$0.002 (one generateText call)
- `notes.create`: $0 (DB insert)

At 50 delegations/day/user (heavy usage): ~$0.05-0.15/day. Negligible with BYOK.

---

## Success Criteria

1. User can say "based on my notes about X, update my study plan" in Secretary panel — and it works
2. User can say "what's on my schedule today?" in Editor sidebar — and it works
3. User can toggle Research mode in Editor sidebar and get deep research with sources
4. All delegation is visible as thinking steps
5. ChatAgent, NoteAgent deleted with zero functionality loss
6. No new dependencies — built entirely on AI SDK v6 + existing Supabase
