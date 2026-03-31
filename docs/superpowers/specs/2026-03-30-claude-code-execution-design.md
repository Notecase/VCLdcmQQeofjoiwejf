# Claude Code Integration — Execution Design

> **Date**: 2026-03-30
> **Parent**: [Claude Code Integration Masterplan](./2026-03-30-claude-code-integration-masterplan.md)
> **Status**: Design approved, ready for implementation planning
> **Approach**: Capability Milestones — 6 milestones, additive on main branch

---

## 1. Executive Summary

This document is the **execution blueprint** for the Claude Code integration masterplan. It takes the masterplan's 7 conceptual phases and reorganizes them into 6 implementable milestones, each with a clear verification step.

### Key Findings from Codebase Audit

| Area                  | Finding                                                                                 | Impact                                                       |
| --------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| MCP Server            | **Already built** (`packages/mcp/`, 43 tools, v0.4.0)                                   | Phase 1 is ~70% done                                         |
| Missing MCP tools     | 3 critical surgical editing tools absent                                                | Must build `edit_note`, `append_to_note`, `remove_from_note` |
| WebSocket             | **Zero infrastructure** — API is 100% HTTP + SSE                                        | Need `@hono/node-ws` + full WS route                         |
| Frontend              | 4-tab sidebar (not 3 as masterplan assumes)                                             | "Claude" replaces "agent" tab's default mode                 |
| `isCompoundRequest()` | **Deleted** — no longer exists                                                          | Masterplan references stale architecture                     |
| Aspira reference      | **Not accessible** at specified path                                                    | Must work from masterplan descriptions only                  |
| Shared utilities      | `parseMarkdownStructure` in `@inkdown/ai`, `spliceAtBlockIndex` internal to editor-deep | Must move both to `@inkdown/shared` for MCP access           |

### Approach: Additive on Main

No branch switching. All new code is additive alongside the existing system:

- New files: WebSocket route, process manager, event normalizer, store, service, Vue components
- Modified files: Only `AISidebar.vue` (add Claude tab) and bridge to existing diff/artifact stores
- EditorDeep removed only in final milestone after full validation

### Deferred to Future Work

- `get_editor_context` MCP tool — replaced by context injection at message send
- `database_query` MCP tool — niche, not critical for core integration
- Artifact Templates (masterplan Phase 6) — separate feature cycle
- Component System (masterplan Phase 7) — conditional on template validation

---

## 2. Architecture & Data Flow

### Target System Diagram

```
Browser (Vue SPA)
  ├── AISidebar
  │   ├── Claude tab ← NEW (WebSocket)
  │   │   ├── ClaudeCodePanel.vue
  │   │   ├── MessageBubble.vue
  │   │   ├── ToolCallCard.vue
  │   │   ├── EditPreviewCard.vue
  │   │   ├── ArtifactPreviewCard.vue
  │   │   └── ThinkingIndicator.vue
  │   ├── Research tab (SSE, unchanged)
  │   ├── Recommend tab (unchanged)
  │   ├── Workflows tab (unchanged)
  │   └── Resources tab (unchanged)
  ├── claude-code.service.ts (WebSocket client)
  ├── claude-code.ts (Pinia store)
  └── Existing: ai.ts store, useDiffBlocks, EditorArea artifact watcher
         ↑ receives PendingEdit and PendingArtifact from claude-code store

                    │ WebSocket │
                    ▼           ▲

Hono API Server (apps/api)
  ├── GET /ws/claude-code ← NEW (WebSocket upgrade)
  │   ├── claude-process.ts (spawn + lifecycle)
  │   ├── event-normalizer.ts (stream-json → NoteshellEvent)
  │   └── Domain event detection (edit_note result → note.edited)
  ├── POST /api/secretary/chat (SSE, unchanged)
  ├── POST /api/research/chat (SSE, unchanged)
  └── Other routes (unchanged)

                    │ stdio │
                    ▼       ▲

Claude Code CLI Process
  ├── --output-format=stream-json
  ├── --input-format=stream-json
  ├── --verbose --include-partial-messages
  ├── --permission-mode=auto
  └── --mcp-server noteshell:/path/to/mcp

                    │ MCP (stdio) │
                    ▼              ▲

Noteshell MCP Server (packages/mcp)
  ├── Note tools (read, edit, append, remove, create, list, search)
  ├── Artifact tools (create, list)
  ├── Secretary tools (memory, plans, tasks, analytics)
  ├── Context/Soul tools
  ├── Calendar tools
  └── Search tools
```

### Event Flow: User Asks Claude Code to Edit a Note

```
1. User types message in ClaudeCodePanel
2. claude-code.service.ts sends via WebSocket: { type: 'message', content: '...', context: { noteId, selectedText } }
3. WebSocket route receives → writes to Claude Code stdin as JSON
4. Claude Code processes → calls read_note via MCP → gets note content
5. Claude Code decides to edit → calls edit_note(noteId, oldText, newText) via MCP
6. MCP server: validates oldText exists, performs string replacement, updates Supabase, returns { success, editId }
7. Claude Code stdout emits:
   a. stream_event (content_block_delta, text_delta) — streaming "I'll fix that typo..."
   b. assistant message with tool_use block (edit_note call)
   c. user message with tool_result block (success)
   d. stream_event (text_delta) — streaming "Done! I've fixed..."
8. event-normalizer.ts parses each line:
   a. text_delta → { type: 'content.delta', text: '...' }
   b. tool_use → { type: 'tool.started', name: 'edit_note', input: {...} }
   c. tool_result → { type: 'tool.completed', output: {...} }
      ALSO detects tool name is 'edit_note' → emits: { type: 'note.edited', noteId, oldText, newText, editId }
   d. text_delta → { type: 'content.delta', text: '...' }
9. All events forwarded via WebSocket to browser
10. claude-code.service.ts dispatches:
    - content.delta → claude-code store → MessageBubble streams text
    - tool.started → claude-code store → ToolCallCard shows "Reading note..."
    - tool.completed → claude-code store → ToolCallCard shows success
    - note.edited → ai store → computeDiffHunks(oldText, newText) → addPendingEdit
      → useDiffBlocks injects diff blocks into Muya editor
11. User sees diff in editor, accepts → muya.setMarkdown(proposed) → saveDocument()
```

---

## 3. Prerequisite: Shared Utilities Migration

**Before Milestone 1**, move pure markdown utilities from `@inkdown/ai` to `@inkdown/shared` so both `@inkdown/ai` and `packages/mcp` can use them.

### Task P.1: Move `parseMarkdownStructure` to `@inkdown/shared`

**From**: `packages/ai/src/utils/structureParser.ts`
**To**: `packages/shared/src/utils/structureParser.ts`

Move the following exports:

- `parseMarkdownStructure()` function
- Types: `BlockNode`, `BlockType`, `ParsedNote`, `OutlineItem`
- Helper functions: `getBlockById`, `getBlocksByLineRange`, `getSectionAtLine`, `findBlocksByHeading`, `findBlocksByContent`, `getBlockByPosition`, `getParagraphsInSection`

Update `packages/ai/src/utils/index.ts` to re-export from `@inkdown/shared` (no breaking change for existing consumers).

### Task P.2: Move `spliceAtBlockIndex` to `@inkdown/shared`

**From**: `packages/ai/src/agents/editor-deep/tools.ts` (line 68, internal)
**To**: `packages/shared/src/utils/structureParser.ts` (alongside parseMarkdownStructure)

This is a pure string-surgery function that depends only on `parseMarkdownStructure`. It belongs in shared.

Update `editor-deep/tools.ts` to import from `@inkdown/shared`.

### Task P.3: Verify builds

```bash
pnpm build && pnpm typecheck && pnpm test:run
```

**Verification**: All packages build, all tests pass, no broken imports.

---

## 4. Milestone 1: MCP Tool Completion

**Goal**: The MCP server has all tools Claude Code needs for note editing, with proper contracts.
**Effort**: 2-3 days

### Task 1.1: Add `edit_note` Tool

**File**: `packages/mcp/src/tools/notes.ts`

```typescript
// Schema
{
  noteId: z.string().uuid(),
  oldText: z.string().describe('Exact text to find and replace'),
  newText: z.string().describe('Replacement text')
}
```

**Implementation**:

1. Read note content from Supabase (save as `original`)
2. Validate `oldText` exists in content (exact match)
3. If multiple occurrences, return error asking for more context
4. Replace first occurrence of `oldText` with `newText` (save as `proposed`)
5. Update note in Supabase with `proposed` content
6. Return `{ success: true, editId: uuid(), noteId, oldText, newText, original, proposed }`

**Why return original/proposed**: The process manager needs full content to emit the `note.edited` domain event. The frontend's `computeDiffHunks(original, proposed)` needs complete document text, not just the changed fragment.

### Task 1.2: Add `append_to_note` Tool

**File**: `packages/mcp/src/tools/notes.ts`

```typescript
{
  noteId: z.string().uuid(),
  content: z.string().describe('Markdown content to insert'),
  afterHeading: z.string().optional().describe('Insert after this heading text'),
  afterBlockIndex: z.number().optional().describe('Insert after block at this index')
}
```

**Implementation**:

1. Read note content
2. Call `parseMarkdownStructure()` (from `@inkdown/shared`)
3. Determine insertion point:
   - If `afterHeading`: find block matching heading text via `findBlocksByHeading()`
   - If `afterBlockIndex`: use block at that index
   - If neither: append to end of note
4. Call `spliceAtBlockIndex(original, targetIndex, 'insert-after', content)` (from `@inkdown/shared`)
5. Update note in Supabase
6. Return `{ success: true, noteId, original: oldContent, proposed: newContent }`

### Task 1.3: Add `remove_from_note` Tool

**File**: `packages/mcp/src/tools/notes.ts`

```typescript
{
  noteId: z.string().uuid(),
  textToRemove: z.string().describe('Exact text to remove from the note')
}
```

**Implementation**:

1. Read note content
2. Validate `textToRemove` exists
3. Remove first occurrence (replace with empty string, clean up double newlines)
4. Update note in Supabase
5. Return `{ success: true, noteId, original: oldContent, proposed: newContent }`

### Task 1.4: Fix `read_note` — Add Block Structure

**File**: `packages/mcp/src/tools/notes.ts` (modify existing `notes_get`)

Add a `includeStructure` boolean parameter (default `true`). When true, append a structured block index to the output:

```
## Block Structure
| Index | Type      | Heading          | Lines   |
| 0     | section   | Introduction     | 1-5     |
| 1     | paragraph |                  | 7-10    |
| 2     | code      |                  | 12-18   |
...
```

Uses `parseMarkdownStructure()` to generate the block list.

### Task 1.5: Deduplicate Search Tools

**Action**: Remove `notes_search` from `notes.ts` (it duplicates `search_notes` in `search.ts`). Keep the `search.ts` version as the canonical search tool.

### Task 1.6: Fix `artifacts_create` — Make `noteId` Required

**File**: `packages/mcp/src/tools/notes.ts`

Change `note_id` from optional to required in the Zod schema. Artifacts must always be associated with a note.

### Task 1.7: Fix `list_artifacts` — Add Global Listing

**Files**:

- `packages/mcp/src/db/artifacts.ts` — add `listAll(userId)` method
- `packages/mcp/src/tools/notes.ts` — make `note_id` optional in `notes_get_artifacts`

When `note_id` is omitted, call `ArtifactsDb.listAll()` instead of `listByNote()`.

### Task 1.8: Fix `calendar_add` — Add `endTime`

**File**: `packages/mcp/src/tools/calendar.ts`

Add `end_time: z.string().optional()` to schema. Format the calendar entry as `time - end_time | title` when end time is provided.

### Task 1.9: Add `@inkdown/shared` as Dependency

**File**: `packages/mcp/package.json`

Add `"@inkdown/shared": "workspace:*"` to dependencies. This is needed for the shared `parseMarkdownStructure` and `spliceAtBlockIndex` utilities.

### Verification

```bash
# Build MCP package
pnpm build --filter @noteshell/mcp...

# Test independently from terminal
claude -p --mcp-server "node packages/mcp/dist/index.js" \
  "Read my latest note and show me its block structure"

claude -p --mcp-server "node packages/mcp/dist/index.js" \
  "In note X, replace 'old text' with 'new text'"
```

---

## 5. Milestone 2: Backend Bridge

**Goal**: Claude Code process management + WebSocket bridge, all events flowing from CLI to browser.
**Effort**: 3-4 days

### Task 2.0: Define NoteshellEvent Types

**File**: `packages/shared/src/types/claude-code.ts` (new)

```typescript
// Base event
interface NoteshellEventBase {
  id: string // unique event ID
  sessionId: string
  timestamp: number
}

// Session events
interface SessionStartedEvent extends NoteshellEventBase {
  type: 'session.started'
  model: string
  tools: string[]
  mcpServers: { name: string; status: string }[]
}

interface SessionStateEvent extends NoteshellEventBase {
  type: 'session.state'
  state: 'starting' | 'running' | 'idle' | 'stopped' | 'error'
}

// Content events
interface ContentDeltaEvent extends NoteshellEventBase {
  type: 'content.delta'
  text: string
}

interface ContentDoneEvent extends NoteshellEventBase {
  type: 'content.done'
  text: string
}

// Thinking events
interface ThinkingDeltaEvent extends NoteshellEventBase {
  type: 'thinking.delta'
  text: string
}

// Tool events
interface ToolStartedEvent extends NoteshellEventBase {
  type: 'tool.started'
  toolUseId: string
  name: string
  input: Record<string, unknown>
}

interface ToolCompletedEvent extends NoteshellEventBase {
  type: 'tool.completed'
  toolUseId: string
  name: string
  output: unknown
  isError: boolean
}

// Domain events (detected from MCP tool results)
interface NoteEditedEvent extends NoteshellEventBase {
  type: 'note.edited'
  noteId: string
  oldText: string
  newText: string
  editId: string
  // For append/remove: full content for diff computation
  original?: string
  proposed?: string
}

interface NoteCreatedEvent extends NoteshellEventBase {
  type: 'note.created'
  noteId: string
  title: string
}

interface ArtifactCreatedEvent extends NoteshellEventBase {
  type: 'artifact.created'
  artifactId: string
  noteId: string
  title: string
  html: string
  css?: string
  javascript?: string
}

// Turn events
interface TurnCompletedEvent extends NoteshellEventBase {
  type: 'turn.completed'
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheCreationTokens: number
  }
  costUsd: number
  numTurns: number
  durationMs: number
}

// Error events
interface ErrorEvent extends NoteshellEventBase {
  type: 'error'
  message: string
  code?: string
}

type NoteshellEvent =
  | SessionStartedEvent
  | SessionStateEvent
  | ContentDeltaEvent
  | ContentDoneEvent
  | ThinkingDeltaEvent
  | ToolStartedEvent
  | ToolCompletedEvent
  | NoteEditedEvent
  | NoteCreatedEvent
  | ArtifactCreatedEvent
  | TurnCompletedEvent
  | ErrorEvent
```

### Task 2.1: Install `@hono/node-ws`

```bash
pnpm add @hono/node-ws --filter @inkdown/api
```

Bump declared `@hono/node-server` version in `package.json` from `^1.13.0` to `^1.19.2` (peer requirement).

### Task 2.2: Build Event Normalizer

**File**: `apps/api/src/services/event-normalizer.ts`

Parses Claude Code's `stream-json` NDJSON output into `NoteshellEvent` objects.

**Input**: One line of NDJSON from Claude Code stdout
**Output**: Zero or more `NoteshellEvent` objects (some raw events produce multiple normalized events)

**Mapping logic**:

| Claude Code Event                                                                                       | Condition           | NoteshellEvent(s)                                                 |
| ------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------- |
| `{ type: 'system', subtype: 'init' }`                                                                   | Always              | `session.started`                                                 |
| `{ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta' } } }`       | Always              | `content.delta`                                                   |
| `{ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta' } } }`   | Always              | `thinking.delta`                                                  |
| `{ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use' } } }` | Always              | `tool.started`                                                    |
| `{ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'input_json_delta' } } }` | Accumulate          | (buffered — accumulate partial JSON for tool input)               |
| `{ type: 'assistant' }`                                                                                 | Has tool_use blocks | `tool.started` for each (if not already emitted via stream_event) |
| `{ type: 'user', message: { content: [{ type: 'tool_result' }] } }`                                     | Always              | `tool.completed` + domain events (see below)                      |
| `{ type: 'result', subtype: 'success' }`                                                                | Always              | `turn.completed`                                                  |
| `{ type: 'result', subtype: 'error_*' }`                                                                | Always              | `error`                                                           |

**Domain event detection** (on `tool.completed`):

| Tool Name                              | Domain Event       | Data Extraction                                                   |
| -------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| `edit_note`                            | `note.edited`      | Extract `noteId`, `oldText`, `newText`, `editId` from tool result |
| `append_to_note`                       | `note.edited`      | Extract `noteId`, `original`, `proposed` from tool result         |
| `remove_from_note`                     | `note.edited`      | Extract `noteId`, `original`, `proposed` from tool result         |
| `create_note` / `notes_create`         | `note.created`     | Extract `noteId`, `title` from tool result                        |
| `create_artifact` / `artifacts_create` | `artifact.created` | Extract all fields from tool result                               |

**Stateful**: The normalizer maintains per-turn state for:

- Accumulated tool input JSON (from `input_json_delta` events)
- Current content block index
- Full text accumulation (for `content.done`)

### Task 2.3: Build Process Manager

**File**: `apps/api/src/services/claude-process.ts`

```typescript
interface ClaudeProcessOptions {
  mcpServerPath: string
  permissionMode: 'auto' | 'default'
  maxTurns?: number
  model?: string
  cwd?: string
  systemPrompt?: string // injected via --append-system-prompt
}

interface ClaudeSession {
  id: string
  userId: string
  process: ChildProcess
  normalizer: EventNormalizer
  state: 'starting' | 'running' | 'idle' | 'stopped'
  createdAt: number
  lastActivityAt: number
}

class ClaudeProcessManager {
  // Session lifecycle
  createSession(userId: string, options: ClaudeProcessOptions): ClaudeSession
  getSession(sessionId: string): ClaudeSession | undefined
  destroySession(sessionId: string): void

  // Message flow
  sendMessage(sessionId: string, content: string, context?: EditorContext): void
  interrupt(sessionId: string): void

  // Event streaming
  onEvent(sessionId: string, callback: (event: NoteshellEvent) => void): void

  // Cleanup
  startIdleTimer(sessionId: string): void
  destroyAllSessions(): void // for graceful shutdown
}
```

**Spawn command**:

```bash
claude -p \
  --output-format stream-json \
  --input-format stream-json \
  --verbose \
  --include-partial-messages \
  --permission-mode auto \
  --mcp-server "noteshell:node /path/to/packages/mcp/dist/index.js" \
  --append-system-prompt "$(cat .claude/noteshell-context.md)"
```

**Lifecycle**:

1. `createSession()`: Spawn process, pipe stdout through readline → normalizer → event callbacks
2. `sendMessage()`: Write JSON to stdin: `{ type: 'user', message: { role: 'user', content: [...] } }`
3. Process stdout: Read line-by-line, parse JSON, feed to `EventNormalizer`, emit `NoteshellEvent`s
4. Idle timeout: After 5 min of no activity, kill process. Configurable via `CLAUDE_CODE_IDLE_TIMEOUT`.
5. On process exit: Emit `session.state: 'stopped'`, clean up resources.
6. Max sessions: Configurable via `CLAUDE_CODE_MAX_SESSIONS` (default 50). Reject new sessions when at limit.

**Editor context injection**: When `sendMessage()` receives `context: { noteId, selectedText, cursorPosition }`, prepend to the user message:

```
[Editor Context]
Current note: {noteTitle} (id: {noteId})
Selected text: "{selectedText}"
Cursor at line {line}, block {blockIndex}
---
{userMessage}
```

This replaces the need for a `get_editor_context` MCP tool.

### Task 2.4: Build WebSocket Route

**File**: `apps/api/src/routes/claude-code.ts`

```typescript
// WebSocket route
app.get(
  '/ws/claude-code',
  upgradeWebSocket((c) => {
    // Auth: extract JWT from query param or first message
    // (WebSocket doesn't support Authorization header in browsers)
    const token = c.req.query('token')

    let session: ClaudeSession | null = null
    let userId: string | null = null

    return {
      async onOpen(evt, ws) {
        // Validate token
        const auth = await verifyToken(token)
        if (!auth) {
          ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }))
          ws.close(4001, 'Unauthorized')
          return
        }
        userId = auth.userId

        // Create Claude Code session
        session = processManager.createSession(userId, {
          mcpServerPath: config.mcpServerPath,
          permissionMode: 'auto',
        })

        // Forward all events to WebSocket
        processManager.onEvent(session.id, (event) => {
          if (ws.readyState === 1) {
            // OPEN
            ws.send(JSON.stringify(event))
          }
        })

        ws.send(
          JSON.stringify({
            type: 'session.state',
            state: 'starting',
            sessionId: session.id,
          })
        )
      },

      onMessage(evt, ws) {
        const msg = JSON.parse(evt.data as string)

        if (msg.type === 'message' && session) {
          processManager.sendMessage(session.id, msg.content, msg.context)
        } else if (msg.type === 'interrupt' && session) {
          processManager.interrupt(session.id)
        }
      },

      onClose(evt, ws) {
        if (session) {
          processManager.startIdleTimer(session.id)
        }
      },
    }
  })
)
```

### Task 2.5: Wire into Server

**File**: `apps/api/src/index.ts` (modify)

Changes:

1. Import `createNodeWebSocket` from `@hono/node-ws`
2. Call `createNodeWebSocket({ app })` after app creation
3. Export `upgradeWebSocket` for route files
4. Call `injectWebSocket(server)` after `serve()`
5. Handle CORS caveat: exclude WebSocket upgrade path from CORS middleware

### Task 2.6: Add Environment Variables

**File**: `apps/api/src/config.ts` (modify)

```typescript
claudeCode: {
  path: process.env.CLAUDE_CODE_PATH || 'claude',
  maxSessions: Number(process.env.CLAUDE_CODE_MAX_SESSIONS) || 50,
  idleTimeout: Number(process.env.CLAUDE_CODE_IDLE_TIMEOUT) || 300_000, // 5 min
  permissionMode: process.env.CLAUDE_CODE_PERMISSION_MODE || 'auto',
  mcpServerPath: process.env.CLAUDE_CODE_MCP_SERVER_PATH ||
    path.resolve(__dirname, '../../../packages/mcp/dist/index.js')
}
```

### Verification

```bash
# Start API server
pnpm dev --filter @inkdown/api

# Test with wscat (install: npm i -g wscat)
wscat -c "ws://localhost:3001/ws/claude-code?token=YOUR_JWT"

# Send message
> {"type":"message","content":"What notes do I have?"}

# Should see stream of NoteshellEvent JSON objects:
# {"type":"session.started","model":"claude-sonnet-4-6",...}
# {"type":"content.delta","text":"Let me "}
# {"type":"tool.started","name":"notes_list",...}
# {"type":"tool.completed","name":"notes_list",...}
# {"type":"content.delta","text":"You have..."}
# {"type":"turn.completed","usage":{...},"costUsd":0.003}
```

---

## 6. Milestone 3: Chat Panel Live

**Goal**: Working chat UI in the sidebar — streaming text, tool cards, thinking indicator.
**Effort**: 3-4 days

### Task 3.1: Build Pinia Store

**File**: `apps/web/src/stores/claude-code.ts` (new)

```typescript
interface ClaudeCodeState {
  // Connection
  sessionId: string | null
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'

  // Session info
  model: string | null
  tools: string[]

  // Messages
  messages: ClaudeCodeMessage[]

  // Active state
  isStreaming: boolean
  isThinking: boolean
  activeToolCall: { id: string; name: string; input: unknown } | null

  // Usage
  totalTokens: { input: number; output: number }
  totalCostUsd: number

  // Settings
  autoApplyEdits: boolean // Review mode (false) vs Auto mode (true)
}

interface ClaudeCodeMessage {
  id: string
  role: 'user' | 'assistant'
  content: string // accumulated text
  toolCalls: ToolCallInfo[]
  thinkingContent: string // accumulated thinking
  timestamp: number
}

interface ToolCallInfo {
  id: string
  name: string
  input: Record<string, unknown>
  output: unknown | null
  status: 'running' | 'completed' | 'error'
  startedAt: number
  completedAt: number | null
}
```

**Key actions**:

- `handleEvent(event: NoteshellEvent)` — dispatcher that updates state based on event type
- `sendMessage(content: string)` — sends via WebSocket service, adds user message to list
- `interrupt()` — sends interrupt signal
- `clearHistory()` — resets messages for a fresh conversation

### Task 3.2: Build WebSocket Client Service

**File**: `apps/web/src/services/claude-code.service.ts` (new)

```typescript
class ClaudeCodeService {
  private ws: WebSocket | null = null
  private store: ReturnType<typeof useClaudeCodeStore>
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5

  connect(token: string): void
  disconnect(): void
  sendMessage(content: string, context?: EditorContext): void
  interrupt(): void

  // Internal
  private handleMessage(event: MessageEvent): void // parse JSON → store.handleEvent()
  private handleClose(): void // reconnection logic
  private handleError(): void
}
```

**Throttling**: Apply same 50ms batch pattern as existing `ai.service.ts` for `content.delta` events to prevent excessive reactivity updates.

**Reconnection**: On disconnect, attempt reconnection with exponential backoff (1s, 2s, 4s, 8s, 16s). After 5 failures, show "Connection lost" with manual retry button.

### Task 3.3: Build ClaudeCodePanel.vue

**File**: `apps/web/src/components/claude-code/ClaudeCodePanel.vue`

Main container component:

- Scrollable message list (`messages` from store)
- Auto-scroll to bottom on new messages
- Connection status banner (connecting, error, reconnecting)
- Token usage footer (input/output tokens, cost)
- Inherits sizing/styling from existing AISidebar patterns

### Task 3.4: Build MessageBubble.vue

**File**: `apps/web/src/components/claude-code/MessageBubble.vue`

- User messages: simple styled bubble
- Assistant messages: streaming markdown via `renderMathMarkdown()` (reuse existing utility)
- Thinking content: collapsible section with dimmed text (like existing ActivityStream)
- Timestamp display

### Task 3.5: Build ToolCallCard.vue

**File**: `apps/web/src/components/claude-code/ToolCallCard.vue`

Generic tool execution card:

- Tool name (human-readable mapping: `edit_note` → "Editing note", `notes_list` → "Listing notes")
- Status indicator (spinner while running, checkmark/x when done)
- Duration
- Expandable input/output sections (collapsed by default)
- Special styling for MCP tools vs built-in Claude Code tools

### Task 3.6: Build ThinkingIndicator.vue

**File**: `apps/web/src/components/claude-code/ThinkingIndicator.vue`

- Animated dots/pulse indicator
- Optional hint text ("Reading your note...", "Thinking...")
- Auto-hide when streaming starts

### Task 3.7: Wire into AISidebar

**File**: `apps/web/src/components/ai/AISidebar.vue` (modify)

Changes:

- Add "Claude" tab (replaces "agent" default mode, or as additional option)
- When Claude tab is active:
  - Input box routes to `claudeCodeService.sendMessage()`
  - Message list renders `ClaudeCodePanel`
  - Interrupt button calls `claudeCodeService.interrupt()`
- Research mode toggle still works (switches to existing deepAgent flow)
- Auto-connect to WebSocket when Claude tab is first activated

### Verification

1. Start dev server: `pnpm dev`
2. Open app in browser, navigate to a note
3. Switch to Claude tab in AI sidebar
4. Type "What notes do I have?"
5. See: thinking indicator → tool card (notes_list) → streaming text response
6. Type "Read the first note and summarize it"
7. See: tool card (notes_get) → streaming summary

---

## 7. Milestone 4: Editor Integration

**Goal**: Claude Code edits produce diff blocks in Muya, artifacts appear in editor.
**Effort**: 3-4 days

### Task 4.1: Build EditPreviewCard.vue

**File**: `apps/web/src/components/claude-code/EditPreviewCard.vue`

Side-by-side diff preview card (shown in chat alongside the ToolCallCard for edit_note):

- Old text (red) and new text (green)
- Line numbers
- Accept / Reject buttons
- Collapse/expand

### Task 4.2: Build ArtifactPreviewCard.vue

**File**: `apps/web/src/components/claude-code/ArtifactPreviewCard.vue`

- Title and metadata
- Live iframe preview (reuse `buildSrcDoc()` from existing artifact system)
- "Open in editor" link

### Task 4.3: Wire note.edited → Diff Pipeline

**File**: `apps/web/src/services/claude-code.service.ts` (modify)

When the service receives a `note.edited` event:

```typescript
case 'note.edited': {
  const { noteId, original, proposed, editId } = event
  // All MCP edit tools return full original/proposed content
  // Process manager extracts these and includes them in the event

  // Use existing computeDiffHunks (same as current EditorDeep pipeline)
  const hunks = computeDiffHunks(original, proposed)

  // Push to existing ai store (the BRIDGE — reuses entire diff pipeline)
  const aiStore = useAIStore()
  aiStore.addPendingEdit({
    id: editId,
    noteId,
    original,
    proposed,
    diffHunks: hunks,
    status: 'pending',
    messageId: currentMessageId  // link to Claude Code message for UI
  })
}
```

**Key design decision**: The `note.edited` event MUST include `original` (full note content before edit) and `proposed` (full note content after edit) — not just `oldText`/`newText`. This is because `computeDiffHunks()` needs the full content to generate proper diff hunks.

**Implementation**: The process manager reads the full content from the MCP tool result (the MCP tools `edit_note`, `append_to_note`, `remove_from_note` all return `{ original, proposed }` in their response).

### Task 4.4: Wire artifact.created → Artifact Pipeline

When service receives `artifact.created`:

```typescript
case 'artifact.created': {
  const aiStore = useAIStore()
  await aiStore.addPendingArtifact(event.noteId, {
    title: event.title,
    html: event.html,
    css: event.css,
    javascript: event.javascript
  }, { userId: authStore.userId })
}
```

This triggers the existing `EditorArea` watcher that inserts artifact blocks into Muya.

### Task 4.5: Wire note.created → Navigation

```typescript
case 'note.created': {
  const editorStore = useEditorStore()
  await editorStore.loadDocument(event.noteId)
  await editorStore.loadDocuments()  // refresh sidebar
}
```

### Task 4.6: Accept/Reject Bridge

Reuse the existing `editActionRequest` pattern:

- `EditPreviewCard.vue` calls `aiStore.requestEditAction(editId, 'accept')`
- `EditorView.vue` watches `editActionRequest` → calls `editorAreaRef.acceptSingleEdit(editId)`
- `useDiffBlocks` handles the DOM manipulation

No new code needed here — the existing bridge works because we push edits to the same `aiStore.pendingEdits`.

### Task 4.7: Review Mode vs Auto Mode

**File**: `apps/web/src/stores/claude-code.ts` (modify)

Add `autoApplyEdits: boolean` toggle (default `false`).

When `autoApplyEdits === true`:

- `note.edited` events skip the diff preview
- Call `aiStore.addPendingEdit()` with immediate status `'accepted'`
- `useDiffBlocks` applies the edit directly via `muya.setMarkdown(proposed)`
- Show "Undo" button on each auto-applied edit (sets markdown back to `original`)

Toggle button in `ClaudeCodePanel.vue` header.

### Verification

1. Open a note with some content
2. In Claude tab: "Fix the typo in the second paragraph"
3. See: tool card (edit_note) → `EditPreviewCard` shows diff → diff blocks appear in Muya editor
4. Click Accept in either the chat card or the editor diff block
5. Content updates, document saved
6. Test artifact: "Create an interactive chart of monthly sales data"
7. See: artifact preview in chat + artifact block inserted in editor

---

## 8. Milestone 5: Skills & Context

**Goal**: Claude Code understands Noteshell's domain and follows editing guidelines.
**Effort**: 1-2 days

### Task 5.1: Write CLAUDE.md

**File**: `.claude/noteshell-context.md` (or injected via `--append-system-prompt`)

Contents:

- What Noteshell is (note-taking app with AI features)
- Available MCP tools and when to use each
- Note format: Markdown, organized by projects, can contain artifacts
- Editing guidelines: always read before editing, surgical edits, respect user's writing style
- Artifact guidelines: interactive only, React 18 (global via CDN), Tailwind, dark theme, no localStorage
- Interaction style: concise, show work in tool calls, ask when ambiguous

### Task 5.2: Write `create-component.md` Skill

**File**: `.claude/skills/create-component.md`

Self-contained React function component creation:

- No imports (React 18 global, Tailwind CDN)
- PascalCase naming, props with defaults
- Theme-aware Tailwind classes (dark backgrounds, light text)
- Template and 2-3 examples

### Task 5.3: Write `edit-note.md` Skill

**File**: `.claude/skills/edit-note.md`

Editing process:

1. Always `read_note` first
2. Use `edit_note` for targeted changes
3. Use `append_to_note` for insertions
4. Use `remove_from_note` for deletions
5. Verify result by reading the note after editing
6. Describe changes to the user

### Task 5.4: Write `research-and-write.md` Skill

**File**: `.claude/skills/research-and-write.md`

Research and note creation process:

1. Web search for current information
2. Search existing notes for context
3. Create structured note with headings
4. Add citations and sources
5. Optionally create visualization artifacts
6. Review and polish

### Verification

1. Start a new Claude Code session
2. Verify system init shows loaded skills
3. Ask "Edit my note to improve the introduction" — Claude should read first, then edit surgically
4. Ask "Create an interactive budget calculator" — Claude should follow component guidelines

---

## 9. Milestone 6: Polish & Deprecation

**Goal**: Remove EditorDeep, clean up, harden error handling.
**Effort**: 2-3 days

### Task 6.1: Remove EditorDeep from AISidebar

**File**: `apps/web/src/components/ai/AISidebar.vue`

Remove the "agent" tab's default mode routing to `/api/agent/secretary`. Claude tab is now the primary AI interface.

### Task 6.2: Delete EditorDeep Agent

**Files to delete**:

- `packages/ai/src/agents/editor-deep/agent.ts`
- `packages/ai/src/agents/editor-deep/tools.ts`
- `packages/ai/src/agents/editor-deep/ai-sdk-stream-adapter.ts`
- `packages/ai/src/agents/editor-deep/types.ts`
- `packages/ai/src/agents/editor-deep/memory.ts`
- `packages/ai/src/agents/editor-deep/history.ts`
- `packages/ai/src/agents/editor-deep/prompts.ts`

Keep the `packages/ai/src/agents/editor-deep/` directory deleted (not just emptied).

### Task 6.3: Remove Agent API Route

**File**: `apps/api/src/routes/agent.ts`

Remove `POST /api/agent/secretary` handler. Keep the route file if it has other endpoints, or delete entirely.

Update `apps/api/src/routes/index.ts` to remove the agent route mount.

### Task 6.4: Clean Up AI Store

**File**: `apps/web/src/stores/ai.ts`

Remove EditorDeep-specific state that is no longer needed:

- `sessions` (EditorDeep chat sessions — Claude Code has its own store)
- `activeSessionId`
- `thinkingSteps` (if only used by EditorDeep)

Keep: `pendingEdits`, `diffBlocks`, `pendingArtifacts`, `completedArtifacts`, `editActionRequest`, and all diff-related state (still used by Claude Code integration via the bridge).

### Task 6.5: WebSocket Reconnection + Error Recovery

**File**: `apps/web/src/services/claude-code.service.ts` (modify)

- Exponential backoff reconnection (1s → 2s → 4s → 8s → 16s)
- Max 5 attempts, then show manual retry
- "Reconnecting..." banner in ClaudeCodePanel
- Preserve message history across reconnections
- Handle stale sessions (server killed the process while client was disconnected)

### Task 6.6: Token Usage Display

**File**: `apps/web/src/components/claude-code/ClaudeCodePanel.vue` (modify)

Footer bar showing:

- Session totals: input tokens / output tokens
- Estimated cost (from `turn.completed` events)
- Per-turn breakdown on hover

### Task 6.7: Session Idle Indicator

Show when the Claude Code process has been idle and might be killed:

- "Session active" / "Session idle (will disconnect in X min)" indicator
- "Session expired — send a message to reconnect" when process was killed

### Task 6.8: Regression Test

Full manual regression:

- [ ] Claude tab: send message, see streaming response
- [ ] Claude tab: tool calls display correctly
- [ ] Claude tab: edit note → diff blocks in editor → accept → saved
- [ ] Claude tab: create artifact → iframe in editor
- [ ] Claude tab: create note → navigates to new note
- [ ] Claude tab: interrupt mid-stream
- [ ] Claude tab: reconnection after disconnect
- [ ] Research tab: still works via SSE
- [ ] Secretary routes: still work via SSE
- [ ] Keyboard shortcuts: Cmd+Shift+Enter (accept all), Cmd+Shift+Escape (reject all)
- [ ] DiffActionBar: appears/disappears correctly
- [ ] NotePreviewPanel: works with Claude Code edits

### Verification

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test:run
```

All tests pass, no TypeScript errors, no dead imports.

---

## 10. Risk Register

| Risk                                                                     | Severity     | Mitigation                                                                                           |
| ------------------------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------- |
| Claude Code CLI not installed on Railway server                          | **Critical** | Add `claude` to Railway build or use npm package. Verify in M2.                                      |
| Process memory: 50-100MB per session x 50 = 5GB                          | High         | Set `CLAUDE_CODE_MAX_SESSIONS` conservatively. Monitor Railway memory. Idle timeout kills processes. |
| WebSocket + CORS conflict in Hono                                        | Medium       | Exclude WS path from CORS middleware or test thoroughly in M2.                                       |
| `edit_note` oldText ambiguity (multiple occurrences)                     | Medium       | Return error with context. Claude Code will self-correct with more specific text.                    |
| Stream-json format changes in Claude Code updates                        | Medium       | Pin Claude Code version. Event normalizer has fallback for unknown events.                           |
| ANTHROPIC_API_KEY needed for Claude Code on Railway                      | **Critical** | Ensure env var is set. Claude Code reads from environment.                                           |
| Auth for WebSocket (no Authorization header in browsers)                 | Medium       | Pass JWT as query param `?token=xxx`. Validate on connection open.                                   |
| MCP server auth (how does it get user's Supabase token?)                 | High         | Process manager passes user's access token via env var to MCP process. See MCP config.ts auth modes. |
| Race condition: user sends message while Claude Code is still processing | Low          | Queue messages or reject with "busy" state. Claude Code handles multi-turn naturally.                |

---

## 11. Decision Log

| Decision                                                       | Rationale                                                                               | Alternatives Considered                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Option A: Process manager bridges events (MCP stays pure data) | Clean separation. MCP testable independently. Single communication channel.             | Option B: MCP tools emit WebSocket events directly (couples MCP to transport).                           |
| Additive on main (no separate branch)                          | New code doesn't conflict with old. Git revert as safety net. No branch drift.          | Separate branch (merge conflicts, stale fast).                                                           |
| Capability Milestones execution approach                       | Every milestone is testable. Integration issues surface early. Natural review points.   | Vertical slice (too much rework). Layer-by-layer (nothing works until late).                             |
| Move `parseMarkdownStructure` to `@inkdown/shared`             | Both `@inkdown/ai` and `packages/mcp` need it. Pure utility with no AI deps.            | Import from `@inkdown/ai` (adds unnecessary dep to MCP). Copy (code duplication).                        |
| Context injection instead of `get_editor_context` MCP tool     | Simpler. Frontend sends context with each message. No live browser bridge needed.       | MCP tool reads from temp file (complex IPC). MCP tool with WebSocket callback (architectural violation). |
| Defer `database_query` MCP tool                                | Niche feature, not critical for core integration. Can add later.                        | Build now (delays M1 by 1-2 days for questionable value).                                                |
| JWT in WebSocket query param                                   | Browser WebSocket API doesn't support custom headers. Industry standard pattern.        | First message auth (delays session start). Cookie auth (CSRF concerns).                                  |
| `note.edited` carries full original/proposed                   | `computeDiffHunks()` needs full content. Process manager extracts from MCP tool result. | Frontend fetches note content separately (race condition risk, extra network call).                      |
| Surgical MCP tools (edit/append/remove) over full-overwrite    | Cleaner diffs. Matches Claude Code's mental model. Self-correction on failure.          | Single `notes_update` with process manager diffing (loses edit intent, worse diffs).                     |

---

## File Inventory: All New and Modified Files

### New Files

```
packages/shared/src/utils/structureParser.ts    ← moved from packages/ai
packages/shared/src/types/claude-code.ts         ← NoteshellEvent types

packages/mcp/src/tools/notes.ts                  ← modified (add edit_note, append_to_note, remove_from_note)

apps/api/src/routes/claude-code.ts               ← WebSocket route
apps/api/src/services/claude-process.ts          ← Process lifecycle manager
apps/api/src/services/event-normalizer.ts        ← stream-json parser

apps/web/src/stores/claude-code.ts               ← Pinia store
apps/web/src/services/claude-code.service.ts     ← WebSocket client
apps/web/src/components/claude-code/
  ClaudeCodePanel.vue                            ← Main panel
  MessageBubble.vue                              ← Text display
  ToolCallCard.vue                               ← Tool execution card
  EditPreviewCard.vue                            ← Edit diff preview
  ArtifactPreviewCard.vue                        ← Artifact preview
  ThinkingIndicator.vue                          ← Loading state

.claude/noteshell-context.md                     ← CLAUDE.md for Claude Code
.claude/skills/create-component.md               ← Component creation skill
.claude/skills/edit-note.md                      ← Note editing skill
.claude/skills/research-and-write.md             ← Research + write skill
```

### Modified Files

```
packages/ai/src/utils/index.ts                   ← re-export from @inkdown/shared
packages/ai/src/utils/structureParser.ts         ← deleted (moved to shared)
packages/ai/src/agents/editor-deep/tools.ts      ← import spliceAtBlockIndex from shared
packages/mcp/package.json                        ← add @inkdown/shared dependency
packages/mcp/src/tools/notes.ts                  ← add/fix tools
packages/mcp/src/tools/calendar.ts               ← add endTime
packages/mcp/src/db/artifacts.ts                 ← add listAll()

apps/api/package.json                            ← add @hono/node-ws
apps/api/src/index.ts                            ← WebSocket setup
apps/api/src/config.ts                           ← add claude code env vars
apps/api/src/routes/index.ts                     ← mount claude-code route

apps/web/src/components/ai/AISidebar.vue         ← add Claude tab
```

### Deleted Files (Milestone 6 only)

```
packages/ai/src/agents/editor-deep/agent.ts
packages/ai/src/agents/editor-deep/tools.ts
packages/ai/src/agents/editor-deep/ai-sdk-stream-adapter.ts
packages/ai/src/agents/editor-deep/types.ts
packages/ai/src/agents/editor-deep/memory.ts
packages/ai/src/agents/editor-deep/history.ts
packages/ai/src/agents/editor-deep/prompts.ts
apps/api/src/routes/agent.ts                     ← or just remove the handler
```
