# Masterplan: Claude Code Integration + AI Platform Evolution

> **Date**: 2026-03-30
> **Status**: Design approved, ready for implementation planning
> **Scope**: Replace EditorDeep agent with Claude Code, add artifact templates, evolve toward component system

---

## Executive Summary

Noteshell's current AI agent (EditorDeep) is a single-shot tool-calling agent that feels "dull" compared to Claude Code's multi-step, self-correcting, skill-powered capabilities. This masterplan replaces EditorDeep with Claude Code as the primary AI engine via a structured chat panel (not terminal), connected through an MCP server that gives Claude Code access to Noteshell's data and features. Artifact templates (save/reuse) are added as a lightweight precursor to a full component system.

**Priority order**: Claude Code integration first, then artifact templates, then component system (only if validated).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Phase 1: Noteshell MCP Server](#2-phase-1-noteshell-mcp-server)
3. [Phase 2: Server-Side Process Manager + WebSocket Bridge](#3-phase-2-server-side-process-manager--websocket-bridge)
4. [Phase 3: Frontend Claude Code Chat Panel](#4-phase-3-frontend-claude-code-chat-panel)
5. [Phase 4: Skills + CLAUDE.md](#5-phase-4-skills--claudemd)
6. [Phase 5: Editor Integration (Diffs, Artifacts, Navigation)](#6-phase-5-editor-integration)
7. [Phase 6: Artifact Templates (Save + Reuse)](#7-phase-6-artifact-templates)
8. [Phase 7: Component System (Conditional)](#8-phase-7-component-system-conditional)
9. [What Stays, What Goes](#9-what-stays-what-goes)
10. [Key Technical Decisions](#10-key-technical-decisions)
11. [Reference: EditorDeep Tool Migration Map](#11-reference-editordeep-tool-migration-map)
12. [Reference: Aspira Techniques Adopted](#12-reference-aspira-techniques-adopted)

---

## 1. Architecture Overview

### Current Architecture (EditorDeep)

Browser (Vue SPA) sends requests via SSE to Hono API Server which runs EditorDeepAgent with 18 tools in single-shot mode (no iteration, no self-correction).

### Target Architecture (Claude Code)

Browser connects via WebSocket to Hono API Server, which spawns a Claude Code CLI process per session with `--stream-json` output. Claude Code uses a Noteshell MCP Server (in-process) to read/write notes, create artifacts, access calendar, etc. Secretary and Research agents stay as-is with their own SSE routes.

### Key Architectural Decisions

1. **Structured chat, NOT terminal** -- Claude Code's `--stream-json` output is rendered as a custom chat UI with tool cards, edit previews, and streaming text. No xterm.js. Works on all devices.

2. **MCP server is YOUR system** -- The Noteshell MCP server controls exactly what Claude Code can do. You define the tools, permissions, and guardrails. Claude Code provides intelligence; MCP provides access.

3. **Secretary + Research agents stay** -- They handle focused domain workflows (calendar/planning, deep research). Claude Code handles general-purpose AI (writing, editing, creating, coding).

4. **Edits flow through existing diff system** -- When Claude Code calls `edit_note()` via MCP, the server emits a WebSocket event that the frontend processes through the SAME `computeDiffHunks()` / `useDiffBlocks` pipeline that EditorDeep uses today.

5. **WebSocket for Claude Code, SSE for legacy agents** -- Claude Code uses WebSocket (bidirectional, needed for interactive sessions). Secretary/Research keep SSE (simpler, one-directional).

---

## 2. Phase 1: Noteshell MCP Server

**Goal**: Build an MCP server that exposes Noteshell's data and features as tools Claude Code can call.

**Package**: `packages/mcp/` (new package in the monorepo)

**Dependencies**: `@inkdown/shared` (types, errors), `@modelcontextprotocol/sdk` (MCP SDK)

### MCP Tools to Implement

#### Note Operations

- `read_note(noteId)` -- Returns markdown content, metadata, and block structure (index, type, heading, lineRange)
- `edit_note(noteId, oldText, newText)` -- Surgical find-and-replace edit, returns editId for undo tracking
- `append_to_note(noteId, content, afterHeading?, afterBlockIndex?)` -- Insert content at position
- `remove_from_note(noteId, textToRemove)` -- Delete content from note
- `create_note(title, content, projectId?)` -- Create new note, returns noteId
- `search_notes(query, limit?)` -- Semantic search across all user's notes
- `list_notes(projectId?)` -- List notes in a project
- `get_editor_context()` -- Current note, selected text, cursor position

#### Artifact Operations

- `create_artifact(noteId, title, html, css, javascript)` -- Create interactive widget
- `list_artifacts(noteId?)` -- List user's artifacts

#### Memory Operations

- `read_preference(key)` -- Read user preferences/context
- `write_preference(key, value)` -- Write user preferences/context

#### Schedule Operations (bridges to Secretary data)

- `read_schedule(startDate?, endDate?)` -- Read calendar events
- `create_event(title, startTime, endTime, description?)` -- Create calendar event

#### Database Operations

- `database_query(noteId, databaseId, action, args)` -- Query/manipulate embedded databases

### How MCP Tools Notify the Frontend

When Claude Code calls `edit_note()`:

1. MCP tool receives the edit request
2. Validates the edit (oldText exists in note content)
3. Applies the edit to Supabase
4. Emits a WebSocket event: `{ type: 'note-edit', noteId, oldText, newText, editId }`
5. Frontend receives the event and shows a diff block (or applies immediately in auto-mode)
6. Returns success to Claude Code so it can continue its loop

### Testing Strategy

The MCP server should be testable independently from terminal:

```
claude -p --mcp-server "node packages/mcp/dist/index.js" "Read my latest note"
```

---

## 3. Phase 2: Server-Side Process Manager + WebSocket Bridge

**Goal**: Spawn and manage Claude Code processes per user session, bridge to browser via WebSocket.

### New Files

- `apps/api/src/routes/claude-code.ts` -- WebSocket route
- `apps/api/src/services/claude-process.ts` -- Process lifecycle manager
- `apps/api/src/services/event-normalizer.ts` -- Parse Claude Code's stream-json events

### Process Manager

Spawn command per session:

```
claude -p
  --output-format=stream-json
  --input-format=stream-json
  --verbose
  --permission-mode=auto
  --mcp-server noteshell:/path/to/mcp-server
```

Session lifecycle: spawn process, read stdout line-by-line (JSON events), write to stdin (user messages), idle timeout (5 min kill), cleanup on disconnect.

### Event Normalizer

Claude Code's stream-json emits raw events: `system` (init), `stream_event` (content deltas, tool use), `assistant` (finalized messages), `result` (turn completion with usage).

Normalize into unified NoteshellEvent types:

- `session.started` -- model, tools list
- `session.state` -- starting/running/idle/stopped
- `content.delta` -- streaming text chunk
- `content.done` -- full text
- `tool.started` -- tool name, id, input
- `tool.completed` -- tool id, output
- `turn.completed` -- token usage, cost
- `note.edited` -- noteId, oldText, newText, editId
- `note.created` -- noteId, title
- `artifact.created` -- artifactId, title, noteId
- `error` -- error message

The `note.*` and `artifact.*` events come from the MCP server (triggered by tool calls), while the others come from Claude Code's stream.

### WebSocket Route

Hono WebSocket route at `/ws/claude-code`:

1. Browser opens WebSocket with auth token
2. Server authenticates user
3. Spawns Claude Code process (or reuses existing session)
4. Reads stdout, forwards events via WebSocket
5. Receives browser messages, writes to Claude Code stdin
6. On disconnect: idle timeout starts, then kill process

Browser-to-server messages: `{ type: 'message', content }` and `{ type: 'interrupt' }`
Server-to-browser messages: NoteshellEvent objects

### Scaling

- Each session = one claude process (~50-100MB memory)
- Idle timeout (5 min) keeps resources bounded
- Max concurrent sessions per server: configurable (default 50)
- For <100 concurrent users: fine on single Railway server

---

## 4. Phase 3: Frontend Claude Code Chat Panel

**Goal**: Custom Vue chat panel rendering Claude Code's structured events as rich UI.

### New Files

- `apps/web/src/components/claude-code/ClaudeCodePanel.vue` -- Main panel
- `apps/web/src/components/claude-code/MessageBubble.vue` -- Text display
- `apps/web/src/components/claude-code/ToolCallCard.vue` -- Tool execution card
- `apps/web/src/components/claude-code/EditPreviewCard.vue` -- Note edit preview
- `apps/web/src/components/claude-code/ArtifactPreviewCard.vue` -- Artifact preview
- `apps/web/src/components/claude-code/ThinkingIndicator.vue` -- Loading state
- `apps/web/src/services/claude-code.service.ts` -- WebSocket client
- `apps/web/src/stores/claude-code.ts` -- Pinia store

### Panel Placement

Replaces the current "Agent" tab in the AI sidebar. Tabs become: Claude | Secretary | Research

### Tool Call Card Types

| MCP Tool Called       | Card Type        | Shows                             |
| --------------------- | ---------------- | --------------------------------- |
| `read_note`           | Read Card        | Note title, line count, structure |
| `edit_note`           | Edit Preview     | Side-by-side diff, Accept/Reject  |
| `append_to_note`      | Edit Preview     | New content in green              |
| `remove_from_note`    | Edit Preview     | Removed content in red            |
| `create_note`         | Created Card     | New note title + open link        |
| `search_notes`        | Search Results   | Matching notes with snippets      |
| `create_artifact`     | Artifact Preview | Live iframe preview               |
| web_search (built-in) | Web Search Card  | Query + sources                   |
| `read_schedule`       | Schedule Card    | Events list                       |
| Other                 | Generic Card     | Tool name + status                |

### Edit Approval Flow (Two Modes)

**Review Mode (default)**: Edits appear as diff cards in chat AND diff blocks in Muya. User must Accept before edit finalizes. Reject informs Claude Code.

**Auto Mode**: Edits applied immediately. Chat shows what changed. Undo button on each edit card.

### Pinia Store

Key state: session info, messages array, pendingEdits map, connection status, token usage.
Key actions: connect, sendMessage, interrupt, acceptEdit, rejectEdit, disconnect.

---

## 5. Phase 4: Skills + CLAUDE.md

**Goal**: Teach Claude Code about Noteshell.

### CLAUDE.md (workspace-level, injected at session start)

Tells Claude Code:

- What Noteshell is and what MCP tools are available
- How notes work (markdown, projects, artifacts)
- Editing guidelines (always read first, surgical edits, respect user style)
- Artifact guidelines (interactive only, React 18 global, Tailwind, dark theme, no localStorage)
- Interaction style (concise, show work, ask when ambiguous)

### Custom Skills

1. **create-component.md** -- Self-contained React function components, no imports, theme-aware Tailwind, PascalCase, props with defaults. Includes template and examples.

2. **edit-note.md** -- Process: read note first, surgical edits, verify result, describe changes. Quality guidelines for maintaining style.

3. **research-and-write.md** -- Process: web search, search existing notes, create structured note, add citations, create visualizations, review and polish.

---

## 6. Phase 5: Editor Integration

**Goal**: Wire Claude Code MCP tool calls into existing Muya editor experience.

### Edit Proposals to Diff Blocks

Same pipeline as today: `computeDiffHunks(original, proposed)` from `ai.service.ts`, `useDiffBlocks.ts` injects into Muya DOM, Accept/Reject UI. Only change: event source is WebSocket `note.edited` instead of SSE `edit-proposal`.

### Artifact Creation

Same pipeline: add to `aiStore.pendingArtifacts`, EditorArea watcher creates Muya block, `buildSrcDoc()` renders iframe. Also show preview card in Claude Code panel.

### Note Navigation

`create_note` MCP tool triggers `note.created` WebSocket event, frontend calls `editorStore.loadDocument(noteId)`.

### Error Handling

MCP returns errors to Claude Code, which can self-correct and retry. WebSocket `tool.error` events shown in UI. This is better than EditorDeep -- multi-step self-correction.

---

## 7. Phase 6: Artifact Templates (Save + Reuse)

**Goal**: Save artifacts as reusable templates, insert into any note.

### Why After Claude Code

Claude Code makes this better: skill-guided creation produces high-quality components, save/insert through MCP tools. Without Claude Code you'd need to build all creation UI yourself.

### Database

New `artifact_templates` table: id, user_id, name (unique per user), description, html, css, javascript, category, tags, props_schema (jsonb, future), usage_count, timestamps.

### New MCP Tools

- `save_as_template(artifactId, name, description, category?)` -- Save artifact as reusable template
- `insert_template(templateName, noteId)` -- Insert template copy into note
- `list_templates(category?)` -- Browse saved templates

### Frontend

Template Browser tab/section in AI sidebar. Grid of cards, click to preview, Insert button, Edit button opens artifact code modal. "Save as Template" button added to ArtifactToolbar.vue.

---

## 8. Phase 7: Component System (Conditional)

**Only if Phase 6 shows users save and reuse templates.**

Adds: React function code format, configurable props per instance, new ComponentBlock in Muya (three-part pattern like ArtifactBlock), `buildComponentSrcDoc.ts` that wraps React function + props into iframe HTML, optional Component Studio (/components route with CodeMirror + preview).

Markdown format: triple-backtick component block with JSON `{"name": "SalesChart", "props": {"year": 2026}}`.

---

## 9. What Stays, What Goes

| Component           | Status                                      |
| ------------------- | ------------------------------------------- |
| EditorDeep agent    | DEPRECATED by Phase 5                       |
| Secretary agent     | STAYS                                       |
| Research agent      | STAYS                                       |
| AI sidebar          | STAYS (modified: Claude tab replaces Agent) |
| Muya editor         | STAYS                                       |
| Diff block system   | STAYS (different event source)              |
| Artifact system     | STAYS                                       |
| Capability registry | SIMPLIFIED                                  |
| ArtifactSubagent    | DEPRECATED by Phase 6                       |
| SSE streaming       | STAYS for Secretary/Research                |

---

## 10. Key Technical Decisions

**Structured chat not terminal**: No xterm.js (bad web UX). Rich tool cards are better. Works everywhere.

**WebSocket not SSE**: Bidirectional (send messages + receive events). Interactive sessions. Lower latency.

**MCP not direct API**: Standard protocol Claude Code speaks natively. Testable independently. Extensible.

**Server-side process not client-side**: Web app limitation. API key security. Consistent environment.

**Muya stays**: Excellent markdown editor. TipTap/ProseMirror migration is 6+ month project, only if component system proves essential and users need inline/composed components. Phase 8+ decision.

---

## 11. Reference: EditorDeep Tool Migration Map

| EditorDeep Tool             | MCP Replacement                    | Claude Code Native? |
| --------------------------- | ---------------------------------- | ------------------- |
| answer_question_about_note  | read_note                          | No                  |
| read_note_structure         | read_note (includes structure)     | No                  |
| create_note                 | create_note                        | No                  |
| add_paragraph               | append_to_note                     | No                  |
| edit_paragraph              | edit_note                          | No                  |
| remove_paragraph            | remove_from_note                   | No                  |
| insert_table                | edit_note (Claude writes markdown) | Partially           |
| create_artifact_from_note   | create_artifact                    | No                  |
| database_action             | database_query                     | No                  |
| read_memory                 | read_preference                    | No                  |
| write_memory                | write_preference                   | No                  |
| ask_user_preference         | Claude Code asks naturally         | YES                 |
| web_search                  | Built-in web search                | YES                 |
| delegate_notes_search       | search_notes                       | No                  |
| delegate_schedule_read      | read_schedule                      | No                  |
| delegate_context_time       | Built-in                           | YES                 |
| delegate_research_quick     | Built-in web search + synthesis    | YES                 |
| delegate_planning_decompose | Built-in reasoning                 | YES                 |

Result: 11 MCP tools to build, 5 native, 2 partial.

---

## 12. Reference: Aspira Techniques Adopted

Source: `/Users/quangnguyen/CodingPRJ/aspira/`

| Aspira Pattern                           | How We Adopt It                                 |
| ---------------------------------------- | ----------------------------------------------- |
| claude-adapter.ts -- Parse stream-json   | event-normalizer.ts -- same parsing for Node.js |
| provider/types.ts -- Unified events      | NoteshellEvent type -- adapted for our domain   |
| provider/service.ts -- Session mgmt      | claude-process.ts -- same lifecycle pattern     |
| create-mdx-component.md skill            | create-component.md skill -- same constraints   |
| component-loader.ts -- Runtime eval      | Not adopted (we use iframe + Babel CDN)         |
| mdx-renderer.tsx -- MDX compilation      | Not adopted Phase 1 (future if TipTap)          |
| components-view.tsx -- Component browser | Template Browser in AI sidebar (Phase 6)        |
| --permission-mode=auto                   | Adopted -- MCP tools handle authorization       |

---

## File Structure (All New Files)

```
packages/mcp/                          # NEW PACKAGE
  src/
    index.ts                           # MCP server entry point
    tools/
      notes.ts                         # Note CRUD tools
      artifacts.ts                     # Artifact tools
      templates.ts                     # Template tools (Phase 6)
      memory.ts                        # Preference tools
      schedule.ts                      # Calendar tools
      database.ts                      # Embedded DB tools
    utils/
      supabase.ts                      # Shared DB connection
      websocket-emitter.ts             # Emit events to frontend
  package.json
  tsconfig.json

apps/api/src/
  routes/
    claude-code.ts                     # NEW: WebSocket route
  services/
    claude-process.ts                  # NEW: Process manager
    event-normalizer.ts                # NEW: stream-json parser

apps/web/src/
  components/
    claude-code/
      ClaudeCodePanel.vue              # NEW: Main panel
      MessageBubble.vue                # NEW: Text display
      ToolCallCard.vue                 # NEW: Generic tool card
      EditPreviewCard.vue              # NEW: Edit diff preview
      ArtifactPreviewCard.vue          # NEW: Artifact preview
      ThinkingIndicator.vue            # NEW: Loading state
      TemplateCard.vue                 # NEW Phase 6: Template card
      TemplateBrowser.vue              # NEW Phase 6: Template grid
  services/
    claude-code.service.ts             # NEW: WebSocket client
  stores/
    claude-code.ts                     # NEW: Pinia store

supabase/migrations/
  XXX_artifact_templates.sql           # NEW Phase 6: Templates table

.claude/ or workspace config/
  skills/
    create-component.md                # NEW: Component creation skill
    edit-note.md                       # NEW: Note editing skill
    research-and-write.md              # NEW: Research + write skill
```

### Environment Variables (New)

```
CLAUDE_CODE_PATH=claude
CLAUDE_CODE_MAX_SESSIONS=50
CLAUDE_CODE_IDLE_TIMEOUT=300000
CLAUDE_CODE_PERMISSION_MODE=auto
```
