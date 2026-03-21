# Inkdown Architecture

This document describes the architecture of the Inkdown application. It is the single source of truth for how the system is structured and how its components interact. **This file must be kept up to date when architectural changes are made.**

---

## Table of Contents

1. [Overview](#overview)
2. [Monorepo Structure](#monorepo-structure)
3. [Dependency Graph](#dependency-graph)
4. [Build System](#build-system)
5. [packages/shared](#packagesshared)
6. [packages/ai](#packagesai)
7. [packages/editor](#packageseditor)
8. [packages/muya](#packagesmuya)
9. [apps/api](#appsapi)
10. [apps/web](#appsweb)
11. [Data Flow](#data-flow)
12. [Database Schema](#database-schema)
13. [Authentication](#authentication)
14. [AI Architecture](#ai-architecture)
15. [Mission Hub](#mission-hub)
16. [Editor Architecture](#editor-architecture)
17. [Environment Configuration](#environment-configuration)

---

## Overview

Inkdown is an AI-enhanced markdown editor built as a pnpm monorepo. It combines a rich WYSIWYG editor (Muya engine) with multi-provider AI capabilities (OpenAI, Anthropic, Google Gemini) for chat, content generation, learning resources, and autonomous agents.

**Key technologies:** Vue 3, Hono, Supabase, Vercel AI SDK, LangChain, TypeScript.

---

## Monorepo Structure

```
inkdown/
├── packages/
│   ├── shared/         # Foundation: types, errors, utilities (zero internal deps)
│   ├── ai/             # AI providers, agents, tools, services
│   ├── editor/         # Editor type definitions and UI assets
│   └── muya/           # Core markdown editor engine (forked)
├── apps/
│   ├── api/            # Hono backend server (AI gateway, CRUD, streaming)
│   └── web/            # Vue 3 + Vite 7 SPA (editor, AI sidebar, learning)
├── supabase/           # Database migrations and edge functions
├── docs/               # Architecture and planning docs
└── .claude/            # Claude Code agent configuration
```

**Workspace configuration:** `pnpm-workspace.yaml` includes `packages/*` and `apps/*`.

---

## Dependency Graph

```
@inkdown/shared  (foundation - zero internal deps)
    ^        ^
    |        |
@inkdown/ai  @inkdown/editor  @inkdown/muya  (all standalone from each other)
    ^              ^                ^
    |              |                |
    +--------------+----------------+
    |              |                |
apps/api       apps/web         apps/web
(shared, ai)   (shared, ai, editor, muya)
```

**Rules:**

- `@inkdown/shared` has ZERO `@inkdown/*` dependencies
- `@inkdown/ai` only depends on `@inkdown/shared` (peer dependency)
- `@inkdown/editor` and `@inkdown/muya` have no `@inkdown/*` dependencies
- Circular dependencies are forbidden
- All internal references use `workspace:*` syntax

---

## Build System

**Orchestrator:** Turborepo (`turbo.json`)

**Build order** (dependency-first):

1. `@inkdown/shared` (tsc)
2. `@inkdown/ai` (tsc)
3. `@inkdown/editor` (tsc, noEmit)
4. `@inkdown/muya` (tsc, noEmit)
5. `apps/api` (tsc)
6. `apps/web` (vite build)

**Key commands:**
| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start all dev servers (Turbo parallelized) |
| `pnpm build` | Build all packages in dependency order |
| `pnpm typecheck` | TypeScript validation across all packages |
| `pnpm lint` | ESLint all packages |
| `pnpm test` | Vitest with happy-dom |
| `pnpm format` | Prettier formatting |

**TypeScript:** All packages target ES2022, strict mode, ESNext modules, bundler resolution.

**Testing:** Vitest with happy-dom, coverage via v8. Module aliases map `@inkdown/*` to source directories.

**CI/CD:** GitHub Actions on push/PR to main/develop. Jobs: build, lint+typecheck, test+coverage.

---

## packages/shared

**Purpose:** Foundation package providing types, error handling, and utilities for all other packages.

**Zero runtime dependencies.** Built with `tsc`.

### Exports

| Path      | Content                             |
| --------- | ----------------------------------- |
| `.`       | Everything (types + utils + errors) |
| `./types` | Type definitions only               |
| `./utils` | Utility functions only              |

### Error System (`errors.ts`)

Central error handling with `AppError` class:

- **17 error codes** organized by category: Auth (3), Database (4), Validation (2), Storage (3), AI (3), Network (2), General (2)
- `AppError` extends `Error` with: `code`, `userMessage`, `timestamp`, `context`
- `handleError()` converts unknown errors to AppError
- `tryCatch()` / `tryCatchSync()` wrappers return `Result<T>` type
- `Result<T>` = `{ success: true; data: T }` | `{ success: false; error: AppError }`

### Type Definitions (`types/`)

| File             | Key Types                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.ts`    | `Project`, `Note`, `Attachment`, `NoteEmbedding`, `SearchResult`, `ProjectTreeNode`, `NoteTreeNode` + DTOs                                                          |
| `user.ts`        | `User`, `UserProfile`, `Session`, `AuthResult`, `UserPlan` (free/pro/team/enterprise)                                                                               |
| `preferences.ts` | `UserPreferences` (theme, editor behavior, markdown settings, AI settings), `ThemeName` (7 themes), `DEFAULT_PREFERENCES`                                           |
| `ai.ts`          | `AIUsageRecord`, `ChatSession`, `ChatMessage`, `AgentType` (chat/note/planner/course), `ChatModelConfig`, `EmbeddingModelConfig`, `CHAT_MODELS`, `EMBEDDING_MODELS` |

### Utilities (`utils/`)

| Module          | Functions                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validation.ts` | `isValidEmail`, `isValidPassword`, `isValidDocumentTitle`, `sanitizeFilename`, `slugify`, `truncate`                                                                        |
| `date.ts`       | `formatDate`, `formatDateTime`, `formatRelativeTime`, `isToday`, `isYesterday`                                                                                              |
| `platform.ts`   | `clipboard` (read/write), `path` (join/dirname/basename), `platform` (isMac/isWindows/isLinux), `openExternal`, image/file dialog helpers, `downloadFile`, `exportMarkdown` |
| `tree.ts`       | `buildProjectTree`, `buildNoteTree`, `flattenProjectTree`, `findProjectNode`, `getProjectPath`, `wouldCreateCircular` (11 functions total)                                  |

---

## packages/ai

**Purpose:** AI provider abstraction, agent implementations, tool definitions, recommendation services.

**Peer dependency:** `@inkdown/shared`

### Provider System (3 providers, task-based routing)

| Provider         | Models                                     | Routed Tasks                                                                    |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| **OpenAI**       | GPT-5.2 (chat), text-embedding-3-large     | chat, note-agent, planner, secretary, completion, rewrite, summarize, embedding |
| **Gemini**       | gemini-2.0-flash-exp, gemini-3-pro-preview | slides, research, course, deep-research                                         |
| **Ollama Cloud** | kimi-k2.5:cloud                            | artifact, code, html, css, javascript                                           |

`createProvider(taskType)` returns the optimal provider. Providers are cached as singletons.

All providers support streaming via `AsyncGenerator`.

### Agent System (6 LangGraph-based agents)

| Agent              | Purpose                           | Key Capability                                                                                                          |
| ------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **SecretaryAgent** | Intent classification and routing | Routes to 8 intents: chat, edit_note, follow_up, open_note, create_artifact, database_action, read_memory, write_memory |
| **ChatAgent**      | Conversational AI with RAG        | Document context, citations, session management                                                                         |
| **NoteAgent**      | Note manipulation                 | create, update, organize, summarize, expand                                                                             |
| **PlannerAgent**   | Goal decomposition                | Step-by-step plan generation                                                                                            |
| **AgenticAgent**   | Autonomous task execution         | Research, extraction, creation, validation, reflection (max 20 steps)                                                   |
| **DeepAgent**      | Compound request orchestration    | Task decomposition, subagent delegation, multi-output requests                                                          |

### DeepAgent Architecture (Compound Requests)

The `InkdownDeepAgent` handles requests with multiple intents (e.g., "make a note about X, add a table, and create a timer"):

```
User Request → isCompoundRequest() check
     |
     ├── Simple request → SecretaryAgent (existing flow)
     |
     └── Compound request → DeepAgent
           |
           ├── decomposeRequest() → SubTask[]
           |     (LLM-based task identification)
           |
           └── For each SubTask:
                 ├── edit_note → NoteSubagent
                 ├── create_artifact → ArtifactSubagent
                 ├── database_action → TableSubagent
                 └── chat → Direct LLM call
```

**Subagents** (`packages/ai/src/agents/subagents/`):

- `NoteSubagent` - Wraps NoteAgent for note creation/editing
- `ArtifactSubagent` - Creates interactive HTML/CSS/JS widgets
- `TableSubagent` - Creates and populates database tables

**Streaming Events** (new types for DeepAgent):

- `decomposition` - Task breakdown from orchestrator
- `subtask-start` - Subagent beginning work
- `subtask-progress` - Progress updates (0-100%)
- `subtask-complete` - Subagent finished

**Frontend Integration** (`apps/web/src/stores/ai.ts`):

- `subTasks` state tracks all decomposed tasks
- `setSubTasks()`, `updateSubTask()`, `updateSubTaskProgress()` actions
- `activeSubTasks`, `completedSubTaskCount`, `allSubTasksCompleted` computed

### Tool System (26 tools across 4 categories)

| Category         | Count | Examples                                                                                    |
| ---------------- | ----- | ------------------------------------------------------------------------------------------- |
| **Core Editing** | 8     | read_block, read_note, edit_block, search_web, create_artifact, read/write_memory           |
| **Database**     | 10    | db_add_row, db_query_rows, db_aggregate, db_group_by, db_create_chart_data                  |
| **Artifact**     | 10    | artifact_modify_html/css/js, artifact_parse_structure, artifact_validate, artifact_optimize |
| **Secretary**    | 7     | create_roadmap, save_roadmap, get_current_week_tasks, list_memory_files                     |

### Section-Aware Editing Pipeline (utils/)

Precision editing utilities for targeted section editing:

| Utility                 | Purpose                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **structureParser.ts**  | Parses markdown into BlockNode tree with positions (sections, paragraphs, lists, code, tables, blockquotes)       |
| **targetIdentifier.ts** | Analyzes user instruction to identify target blocks via heading/position/content matching with confidence scoring |
| **contextExtractor.ts** | Extracts target blocks with surrounding context and [EDIT_START]/[EDIT_END] markers for AI                        |
| **surgicalMerger.ts**   | Merges edited section back into document, preserving non-targeted content exactly                                 |

**Flow:**

1. `parseMarkdownStructure()` → BlockNode[] tree with line positions
2. `identifyTargets()` → confidence-scored matches or clarification request
3. `extractContext()` → focused content with boundary markers
4. NoteAgent.streamSurgicalEdit() → AI edits only between markers
5. `mergeEditedSection()` → surgical replacement in original document

### Services

| Service                   | Purpose                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| **RecommendationService** | 6 generators (mindmap, flashcards, concepts, exercises, resources, slides) with 5-min cache |
| **OrchestrationService**  | Workflow templates (course creation, study plan, research project, knowledge base)          |
| **SourceProcessor**       | PDF/link/text processing pipeline with chunking and embedding                               |

### Workflows (8 quick actions)

generate_study_note, create_summary, extract_key_terms, compare_sources, generate_qa, find_conflicts, extract_citations, build_timeline

---

## packages/editor

**Purpose:** Editor type definitions, UI assets, and abstraction layer over Muya.

**Status:** Transitional. The actual editor implementation lives in `@inkdown/muya`. This package provides:

- `EditorOptions` interface (markdown settings, themes, diagram configs)
- `EditorEventMap` type (change, selection-change, stateChange, toc-change)
- Icon assets (50+ SVG icons for editor toolbar)
- Stylesheets (main editor CSS, export styles, sequence diagram CSS)

**No internal `@inkdown/*` dependencies.**

---

## packages/muya

**Purpose:** Core markdown editor engine. Local fork of the Muya project.

### Architecture Overview

```
User Input --> Editor --> Selection --> Block Handler --> Format/Content Update
                                                              |
                                                    JSONState (OT operations)
                                                              |
DOM Updates <-- InlineRenderer <-- MarkdownToState        Render Pipeline
```

### Block System (tree-based)

All document content is represented as a tree of blocks:

```
TreeNode (base: prev/next pointers, DOM node, attributes)
  |
  +-- Parent (container: children as LinkedList)
  |     +-- ScrollPage (root)
  |     +-- Paragraph, AtxHeading, SetextHeading
  |     +-- BlockQuote, BulletList, OrderList, TaskList
  |     +-- ListItem, TaskListItem
  |     +-- CodeBlock, Table, HTMLBlock, DiagramBlock, MathBlock, ArtifactBlock
  |     +-- Frontmatter
  |
  +-- Content (leaf: holds editable text in contenteditable span)
        +-- ParagraphContent, AtxHeadingContent, CodeBlockContent
        +-- TableCellContent, ThematicBreakContent, LangInputContent
```

Blocks are registered dynamically via `ScrollPage.register()`. 40+ block types total.

### State Management (Operational Transformation)

- `JSONState` class uses `ot-json1` for JSON OT and `ot-text-unicode` for text edits
- Changes computed via `fast-diff`, composed as OT operations, batched via requestAnimationFrame
- State types: `TState` union (IParagraphState, IAtxHeadingState, ICodeBlockState, IBlockQuoteState, ITableState, etc.)
- Bidirectional conversion: `markdownToState` <-> `stateToMarkdown`

### Rendering Pipeline (dual rendering)

1. **Block rendering:** TState[] -> Block tree -> DOM nodes
2. **Inline rendering:** Text content -> Lexer (regex tokenization) -> 31+ renderers -> Snabbdom VNodes -> HTML

### Key Subsystems

| System          | Purpose                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------- |
| **Selection**   | Cursor tracking, range management, DOM selection mapping                                      |
| **History**     | Undo/redo via OT operation stack                                                              |
| **EventCenter** | Custom pub/sub + DOM event management                                                         |
| **Clipboard**   | Copy/paste with markdown/HTML conversion                                                      |
| **Search**      | Find/replace within document                                                                  |
| **I18n**        | Internationalization (en, zh, ja)                                                             |
| **UI**          | 13 floating panels (format toolbar, quick insert, link tools, image tools, table tools, etc.) |

### Supported Syntax

- **CommonMark:** Paragraphs, headings (ATX/Setext), block quotes, lists, code blocks, thematic breaks, HTML
- **GFM:** Tables, task lists
- **Extensions:** Math (KaTeX), diagrams (Mermaid, PlantUML, Vega), frontmatter, footnotes, super/subscript, emoji, artifacts

### Artifact Block System

Interactive HTML/CSS/JS artifacts rendered in sandboxed iframes. Created via AI `create_artifact` tool or manually via fenced code block with `artifact` language.

**Structure:**

```
ArtifactBlock (figure.mu-artifact-block)
├── ArtifactPreview (sandboxed iframe with CDN support)
└── ArtifactContainer (code editor for JSON content)
```

**Security:** Uses `sandbox="allow-scripts"` WITHOUT `allow-same-origin` to prevent access to parent DOM/storage.

**CDN Support:** Tailwind CSS, React 18, ReactDOM, Babel for JSX transformation.

**JSON Format:**

```json
{
  "title": "Artifact Title",
  "html": "HTML content",
  "css": "CSS styles",
  "javascript": "JS code (supports JSX)"
}
```

**Components (apps/web):**

- `ArtifactToolbar.vue` - Glassmorphic floating toolbar (edit, fullscreen, delete)
- `ArtifactCodeModal.vue` - Tabbed code editor modal (HTML/CSS/JS tabs)

### Plugin System

```typescript
Muya.use(Plugin, options) // Register before instantiation
```

Plugins receive the Muya instance and can hook into events and extend UI.

---

## apps/api

**Purpose:** Hono-based backend server. AI gateway, CRUD operations, streaming.

### Stack

- **Framework:** Hono 4.6.0 with @hono/node-server
- **Database:** Supabase (PostgreSQL with RLS)
- **Validation:** Zod + @hono/zod-validator
- **AI:** Vercel AI SDK + LangChain + direct provider SDKs

### Middleware Pipeline

1. `secureHeaders()` - Security headers
2. `logger()` - Request logging
3. `timing()` - Request timing
4. CORS (configurable origins, credentials enabled)
5. Route-specific: `authMiddleware` (JWT validation, user-scoped Supabase client)
6. Global error handler (HTTPException, ZodError, AI provider errors, rate limits)

### API Routes

| Route                                   | Auth  | Purpose                                                    |
| --------------------------------------- | ----- | ---------------------------------------------------------- |
| `GET /health/*`                         | No    | Health, readiness, liveness checks                         |
| `POST /api/agent/secretary`             | Yes   | Secretary agent (intent routing) - SSE                     |
| `POST /api/agent/chat`                  | Yes   | Chat agent with RAG - SSE                                  |
| `POST /api/agent/note/action`           | Yes   | Note manipulation - SSE                                    |
| `POST /api/agent/planner/*`             | Yes   | Goal planning - SSE                                        |
| `POST /api/agent/agentic/*`             | Yes   | Autonomous tasks - SSE                                     |
| `GET /api/agent/capabilities`           | Yes   | Available agents metadata                                  |
| `POST /api/chat/sessions`               | Yes   | Chat session CRUD                                          |
| `POST /api/search/semantic`             | Yes   | Vector search (embedding-based)                            |
| `POST /api/search/hybrid`               | Yes   | Full-text + semantic search                                |
| `POST /api/embed/note`                  | Yes   | Queue note for embedding                                   |
| `POST /api/recommend/*`                 | Yes   | Generate recommendations (mindmap, flashcards, etc.) - SSE |
| `POST /api/orchestration/execute`       | Yes   | Execute workflow - SSE                                     |
| `POST /api/slides/generate`             | Yes   | Slide generation via Gemini - SSE                          |
| `POST /api/sources/upload`              | Yes   | Upload file source - SSE                                   |
| `POST /api/sources/link`                | Yes   | Add link source - SSE                                      |
| `POST /api/sources/action`              | Yes   | Execute workflow on sources - SSE                          |
| `POST /api/learning-resources/save`     | Yes   | Save learning resource                                     |
| `GET /api/learning-resources/note/:id`  | Yes   | Get resources for note                                     |
| `GET /api/settings/api-keys`            | Yes   | List BYOK API keys (hints only)                            |
| `POST /api/settings/api-keys`           | Yes   | Add/update BYOK API key                                    |
| `DELETE /api/settings/api-keys/:p`      | Yes   | Remove BYOK API key                                        |
| `GET /api/settings/ai-preferences`      | Yes   | Get AI model preferences                                   |
| `PUT /api/settings/ai-preferences`      | Yes   | Update AI model preferences                                |
| `GET /api/settings/heartbeat`           | Yes   | Get heartbeat state/config                                 |
| `PUT /api/settings/heartbeat`           | Yes   | Update heartbeat config                                    |
| `GET /api/settings/heartbeat/logs`      | Yes   | Get heartbeat action logs                                  |
| `POST /api/inbox/capture`               | Token | Quick capture via X-Capture-Token (Apple Shortcuts, PWA)   |
| `GET /api/inbox`                        | Yes   | Read Inbox.md content                                      |
| `DELETE /api/inbox`                     | Yes   | Clear Inbox.md                                             |
| `POST /api/inbox/tokens`                | Yes   | Generate capture token (raw token returned once)           |
| `GET /api/inbox/tokens`                 | Yes   | List capture tokens (hints only)                           |
| `DELETE /api/inbox/tokens/:id`          | Yes   | Revoke a capture token                                     |
| `GET /api/integrations`                 | Yes   | List connected integrations                                |
| `POST /api/integrations/gcal/connect`   | Yes   | Get Google OAuth authorization URL                         |
| `GET /api/integrations/gcal/callback`   | Yes   | Handle Google OAuth callback                               |
| `POST /api/integrations/gcal/sync`      | Yes   | Manual Google Calendar sync → Calendar.md                  |
| `DELETE /api/integrations/:provider`    | Yes   | Disconnect an integration                                  |
| `POST /api/integrations/notion/connect` | Yes   | Save Notion BYOK token                                     |

### Services

| Service                 | Purpose                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| **MemoryService**       | AI memory persistence (preferences, plans, context) via Supabase RPC |
| **RoadmapService**      | Learning roadmap CRUD and week advancement                           |
| **AgentSessionService** | LangGraph state persistence for multi-turn conversations             |

### Streaming

Multiple endpoints support SSE (`text/event-stream`). Chunk types: `text-delta`, `thinking`, `tool-call`, `tool-result`, `citation`, `edit-proposal`, `clarification-request`, `finish`, `error`.

---

## apps/web

**Purpose:** Vue 3 + Vite 7 single-page application. The main user interface.

### Stack

- **Framework:** Vue 3.5.24 (Composition API)
- **Router:** vue-router 4.6.4
- **State:** Pinia 3.0.4
- **UI:** Element Plus 2.13.1, Lucide icons
- **Build:** Vite 7.2.4 with @vitejs/plugin-vue 6.0.1 + vite-plugin-pwa
- **Editor:** @inkdown/muya (WYSIWYG) + CodeMirror 6 (source mode)

### Routes

| Path        | View         | Purpose                                  |
| ----------- | ------------ | ---------------------------------------- |
| `/`         | EditorView   | Main editor with tabs, sidebar, AI panel |
| `/auth`     | AuthView     | Login/signup (email, OAuth, guest)       |
| `/ai`       | AIChat       | Full-page AI chat interface              |
| `/capture`  | CaptureView  | PWA quick-capture page (mobile-friendly) |
| `/settings` | SettingsView | Capture tokens, integrations management  |

### Pinia Stores

| Store                 | Key State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **auth**              | `user`, `isAuthenticated`. Actions: signIn, signUp, signInWithOAuth, signOut                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **editor**            | `currentDocument`, `tabs`, `documents`, `wordCount`, `toc`. Actions: loadDocuments, createDocument, openDocument, updateContent, saveDocument, close/switchTab                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **ai**                | `sessions`, `status` (idle/streaming/tool-calling/thinking/clarifying/error), `thinkingSteps`, `citations`, `pendingEdits` (hunk-level), `pendingClarification` (target selection), `diffBlockPairs` (block-pair tracking), `diffBlocks` (per-block accept/reject), `pendingArtifacts` (AI-created artifacts awaiting insertion), `subTasks` (DeepAgent task decomposition). Actions: createSession, addMessage, appendToLastMessage, addPendingEdit, acceptHunk/rejectHunk, addDiffBlockPair, updateDiffBlockPair, getDiffBlockPairsForNote, clearDiffBlockPairs, addDiffBlock, updateDiffBlock, getDiffBlock, getDiffBlocksForNote, getDiffBlocksForHunk, areAllBlocksResolved, clearDiffBlocks, setClarificationRequest, resolveClarification, cancelClarification, addPendingArtifact, markArtifactInserted, getPendingArtifactsForNote, clearPendingArtifacts, setSubTasks, updateSubTask, updateSubTaskProgress, clearSubTasks |
| **project**           | `folders`, `expandedFolderIds`. Actions: loadFolders, create/rename/deleteFolder, moveProject                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **preferences**       | All user preferences (theme, editor, markdown, AI). Syncs to Supabase or LocalForage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **layout**            | `sidebarVisible`, `editorMode` (wysiwyg/source), `isFullscreen`, `isFocusMode`, `isZenMode`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **notifications**     | Toast notification queue (info/success/warning/error)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **sources**           | Source management per note (PDF, link, text). Upload with SSE progress. Workflow action execution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **recommendations**   | AI-generated content per note (mindmap, flashcards, concepts, exercises, resources, slides)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **learningResources** | Persistent storage of generated learning resources attached to notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Service Layer

| Service                          | Purpose                                                       |
| -------------------------------- | ------------------------------------------------------------- |
| **factory.ts**                   | Provider-agnostic initialization (Supabase or local adapters) |
| **notes.service.ts**             | Note CRUD via database provider                               |
| **projects.service.ts**          | Project/folder CRUD                                           |
| **ai.service.ts**                | Agent communication with SSE streaming                        |
| **learningResources.service.ts** | Learning resource persistence                                 |
| **attachments.service.ts**       | File attachment management                                    |
| **subscriptions.service.ts**     | Realtime database subscriptions                               |
| **supabase.ts**                  | Supabase client + auth/database/storage adapters              |
| **local/**                       | Offline fallback adapters (LocalForage)                       |

### Composables

| Composable           | Purpose                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **useDiffBlocks.ts** | True inline diff system via DOM injection. Injects real blocks into Muya's DOM structure, handles per-block accept/reject, manages diff styling |

### Utilities (apps/web/src/utils/)

| Utility                   | Purpose                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **markdownBlockMap.ts**   | Maps markdown line numbers to block indices using the AI structure parser (used for inline diff placement) |
| **muyaMarkdownParser.ts** | Parses markdown to Muya block states using MarkdownToState class                                           |
| **muyaBlockMapper.ts**    | Maps line numbers to Muya DOM blocks for positioning                                                       |
| **api.ts**                | API client utilities                                                                                       |
| **platform.ts**           | Platform detection utilities                                                                               |
| **mathRenderer.ts**       | Math rendering utilities                                                                                   |

### Component Architecture

```
App.vue
├── EditorView.vue
│   ├── SideBar.vue (project tree, document list, user menu)
│   ├── EditorArea.vue (Muya wrapper, auto-save, word count, inline diffs)
│   ├── SourceCodeEditor.vue (CodeMirror 6)
│   ├── AISidebar.vue (3 tabs: Agent, Recommend, Workflows)
│   │   ├── ChatMessage.vue (markdown rendering, citations, tool calls)
│   │   ├── ThinkingStepsAccordion.vue
│   │   ├── ToolCallCard.vue
│   │   ├── SuggestionCard.vue
│   │   ├── DiffActionBar.vue (bulk accept/reject controls)
│   │   ├── ClarificationDialog.vue (target selection for ambiguous edits)
│   ├── artifact/
│   │   ├── ArtifactToolbar.vue (glassmorphic edit/fullscreen/delete toolbar)
│   │   └── ArtifactCodeModal.vue (tabbed HTML/CSS/JS code editor)
│   │   ├── _deprecated/ (InlineDiffOverlay.vue, InlineDiffHunk.vue - overlay approach abandoned)
│   │   ├── RecommendTab.vue (mindmap, flashcards, concepts, etc.)
│   │   ├── WorkflowsTab.vue
│   │   └── LearningResourcesTab.vue
│   ├── NoteOutline.vue / TableOfContents.vue
│   ├── SearchPanel.vue
│   └── FormatToolbar.vue
├── AuthView.vue (email/OAuth/guest login)
├── AIChat.vue (full-page chat)
├── CommandPalette.vue
├── NotificationToast.vue
└── NavigationDock.vue
```

### PWA Support

Configured via vite-plugin-pwa. Auto-updating service worker, standalone display mode.

### Vite Configuration

- Dev proxy: `/api` -> `http://localhost:3001`
- Aliases: `@` -> `./src`, `@inkdown/muya` -> source, `@inkdown/ai` -> AI utils source, polyfills for `path` and `zlib`
- **Note:** Uses `@vitejs/plugin-vue@^6.0.0` (different from root @5.0.0 - intentional for Vite 7)

---

## Data Flow

### Document Editing Flow

```
User types in editor
  -> Muya Content block detects change
  -> fast-diff computes delta
  -> OT operation created (ot-json1)
  -> JSONState._operationCache (batched)
  -> RAF: compose operations -> emit 'json-change'
  -> Editor.updateContents() applies to DOM
  -> InlineRenderer re-renders affected content
  -> Auto-save triggers (debounced) -> Supabase update
```

### AI Chat Flow

```
User sends message (AISidebar input)
  -> ai.service.ts: streamFromAgent(agentType, options)
  -> POST /api/agent/secretary (SSE)
  -> SecretaryAgent classifies intent
  -> Routes to appropriate handler (ChatAgent, NoteAgent, tools, etc.)
  -> SSE chunks streamed back: text-delta, thinking, tool-call, citation, edit-proposal, clarification-request
  -> AI store updates in real-time (messages, thinkingSteps, pendingEdits, pendingClarification)
  -> UI renders streaming response
```

### Section-Aware Edit Flow (edit_note intent)

```
User requests edit (e.g., "shorten the introduction")
  -> SecretaryAgent detects edit_note intent
  -> parseMarkdownStructure() creates BlockNode tree
  -> identifyTargets() matches instruction to blocks:
     - confidence >= 0.8: proceed with surgical edit
     - confidence < 0.8: emit clarification-request, await user selection
     - section matches default to intro-only blocks when subsections exist, unless the user requests the full section
  -> extractContext() creates focused prompt with [EDIT_START]/[EDIT_END] markers
  -> NoteAgent.streamSurgicalEdit() generates targeted changes
  -> mergeEditedSection() replaces only target blocks in original
  -> Emit edit-proposal with full document diff for inline visualization
```

### Pending Edit Flow (AI -> Editor)

```
AI proposes edit via edit-proposal SSE chunk
  -> AI store: addPendingEdit() with DiffHunks
  -> useDiffBlocks injects diff blocks into Muya DOM (see Editor Architecture)
  -> User accepts/rejects per-block or bulk via action buttons
  -> acceptBlock/rejectBlock updates block status in AI store
  -> When all blocks resolved: clearAllDiffs, syncEditorContent
  -> Editor store: updateContent with final content, persist to database
```

---

## Database Schema

### Key Supabase Tables

| Table                     | Purpose                                                                          |
| ------------------------- | -------------------------------------------------------------------------------- |
| `notes`                   | User notes (id, user_id, title, content, project_id, tags, version, etc.)        |
| `projects`                | Folder hierarchy (id, user_id, parent_id, name, path, depth, sort_order)         |
| `attachments`             | File attachments (storage_path, content_type, processing_status, extracted_text) |
| `chat_sessions`           | AI chat sessions (title, context_note_ids, agent_type)                           |
| `chat_messages`           | Messages in sessions (role, content, tool_calls, retrieved_chunks)               |
| `note_embeddings`         | Vector embeddings (chunk_text, embedding[], model, content_hash)                 |
| `embedding_queue`         | Async embedding jobs (status, priority, attempts)                                |
| `note_learning_resources` | Saved learning materials (type, data, item_count)                                |
| `learning_roadmaps`       | Learning roadmaps (topic, status, current_week, content)                         |
| `agent_sessions`          | LangGraph state persistence (thread_id, state, checkpoint_id)                    |
| `ai_memory`               | AI memory storage (memory_type, content, metadata) - accessed via RPC            |
| `user_profiles`           | User profile data (display_name, plan, storage_used)                             |
| `user_context_entries`    | Shared context bus logbook (agent, type, summary, payload, expires_at)           |
| `user_soul`               | User preferences/goals for cross-agent personalization (content text)            |
| `user_api_keys`           | BYOK encrypted API keys (provider, encrypted_key, key_hint, is_valid)            |
| `user_ai_preferences`     | AI model preferences (preferred_provider, preferred_model, max_daily_cost)       |
| `agent_heartbeat_state`   | Per-user heartbeat config (enabled, timezone, last_morning/evening/weekly_at)    |
| `agent_heartbeat_log`     | Audit trail for heartbeat actions (action, result, tokens_used, cost_usd)        |

**Security:** Row-Level Security (RLS) enforced. User-scoped Supabase client created per request.

---

## Authentication

- **Methods:** Email/password, GitHub OAuth, Google OAuth, guest/offline mode
- **Backend:** Supabase Auth with JWT tokens
- **API:** `Authorization: Bearer <token>` header on all authenticated requests
- **Middleware:** `authMiddleware` verifies JWT, creates user-scoped Supabase client
- **Ownership:** `verifyNoteOwnership(auth, noteId)` checks note belongs to user
- **Offline:** Local adapters (LocalForage) provide fallback when Supabase is unavailable

---

## AI Architecture

### Provider Routing

The `createProvider(taskType)` factory routes to the optimal provider:

```
chat/note-agent/planner/secretary -> Gemini (gemini-3.1-pro-preview)
slides/research/course             -> Gemini (gemini-2.0-flash-exp / deep-research-pro)
artifact/code/html/css/js          -> Ollama Cloud (kimi-k2.5)
embedding                          -> OpenAI (text-embedding-3-large, 1536 dims)
heartbeat (BYOK)                   -> User's preferred provider via createBYOKProvider()
```

### Agent Execution Model

1. **Secretary** receives all user messages, classifies intent
2. Routes to specialized agent or tool execution
3. Agents use LangGraph for state management
4. Tools execute against Supabase via `ToolContext` (userId + supabase client)
5. All responses support SSE streaming

### Shared Context Bus

Cross-agent context sharing via a Supabase-backed logbook. Every agent reads recent entries at prompt-build time and writes entries after significant actions.

**Tables:**

- `user_context_entries` — Append-only logbook (agent, type, summary, payload, expires_at)
- `user_soul` — User-authored preferences and goals (plain text)

**Service:** `SharedContextService` (`packages/ai/src/services/shared-context.service.ts`)

- `read(options?)` — Returns formatted markdown for prompt injection
- `write(entry)` — Appends a context entry (best-effort, never blocks)
- `readSoul()` / `writeSoul(content)` — User preference CRUD

**Entry types:** `active_plan`, `research_done`, `course_saved`, `note_created`, `note_edited`, `goal_set`, `soul_updated`

**Agent wiring:**
| Agent | Reads | Writes |
|-------|-------|--------|
| EditorDeep | All types | `note_edited` (after tool calls) |
| Secretary | `research_done`, `course_saved`, `note_created`, `goal_set` | `active_plan` (after roadmap/plan tools) |
| Research | `active_plan`, `soul_updated` | `research_done` (after session) |
| Course | `active_plan`, `soul_updated` | `course_saved` (after pipeline) |
| Chat | `active_plan`, `soul_updated`, `research_done` | None (read-only) |
| Heartbeat | All types | `active_plan` (after morning/evening/weekly routines) |

### Autonomous Heartbeat System

A Supabase Edge Function (`supabase/functions/heartbeat/`) invoked by pg_cron every 30 minutes. Processes users with heartbeat enabled using cheap-first checks:

1. **Cheap checks** (zero LLM cost): timezone-aware time windows, date math, DB reads
2. **Actions** (BYOK LLM cost): morning routine, evening reflection, weekly review
3. **Deterministic** (zero cost): Today.md stale detection + auto-archive

**Tables:** `agent_heartbeat_state` (config), `agent_heartbeat_log` (audit trail)
**Cost model:** ~$0.02-0.04/user/month (user's own API key via BYOK)
**BYOK:** Users bring own API keys (Google/OpenAI/Anthropic), stored encrypted in `user_api_keys`

### MCP Skills (packages/mcp/skills/)

Orchestrated workflows shipped with `@noteshell/mcp`:

| Skill              | File                    | Purpose                                                                |
| ------------------ | ----------------------- | ---------------------------------------------------------------------- |
| Morning Routine    | `morning-routine.md`    | Full daily planning: gather context, archive, focus, generate Today.md |
| Evening Reflection | `evening-reflection.md` | End-of-day review, reflection, carry over, prepare tomorrow            |
| Weekly Review      | `weekly-review.md`      | Weekly analysis, patterns, plan progress, soul updates                 |
| Study Planning     | `study-planning.md`     | Creating roadmaps, daily plans, progress tracking                      |
| Note Organization  | `note-organization.md`  | Structuring projects, rich notes                                       |
| Research to Notes  | `research-to-notes.md`  | Capturing research as structured notes                                 |
| Daily Workflow     | `daily-workflow.md`     | Mid-day activity logging, quick task updates                           |

**API routes:** `apps/api/src/routes/context.ts`

- `GET /api/context/soul` — Read soul content
- `PUT /api/context/soul` — Update soul content
- `GET /api/context/entries` — List recent entries

**Frontend:** `SoulEditor.vue` in Secretary panel — textarea for user goals/preferences with debounced auto-save.

### RAG (Retrieval-Augmented Generation)

1. Notes are chunked and embedded (text-embedding-3-large)
2. Chat queries trigger semantic search against embeddings
3. Top-k chunks injected as context
4. Citations tracked and returned to frontend

---

## Mission Hub

The Mission Hub is an autonomous learning orchestration system. A user enters a high-level goal, and the system orchestrates multiple agents through a four-stage pipeline with approval gates.

### Core Flow

```
User Goal → Research → Course Draft → Daily Plan → Note Pack → Done
                 ↓            ↓              ↓            ↓
            ResearchAgent  CourseOrch.   SecretaryAgent  NoteAgent
                 ↓            ↓              ↓            ↓
              Handoff      Approval       Approval      Approval
                          Gate (UI)      Gate (UI)     Gate (UI)
```

### Key Components

| Component            | Location                                             | Role                                                                     |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Mission types        | `packages/shared/src/types/mission.ts`               | All mission types (Mission, MissionStep, MissionApproval, etc.)          |
| MissionOrchestrator  | `packages/ai/src/services/mission-orchestrator.ts`   | Core engine: stage execution, lock management, approval gates, event log |
| Mission Adapters     | `packages/ai/src/services/mission-adapters.ts`       | Real agent wrappers that consume streaming output for structured results |
| SharedContextService | `packages/ai/src/services/shared-context.service.ts` | Cross-agent context bus (logbook pattern)                                |
| API Routes           | `apps/api/src/routes/missions.ts`                    | REST + SSE endpoints for mission CRUD and streaming                      |
| Mission Store        | `apps/web/src/stores/missions.ts`                    | Pinia store: SSE streaming, dedup, reconnect, state replay               |
| MissionHubView       | `apps/web/src/views/MissionHubView.vue`              | Goal entry + mode selection                                              |
| MissionDetailView    | `apps/web/src/views/MissionDetailView.vue`           | 5-panel live dashboard                                                   |

### Shared Context Bus

Agents coordinate via a Supabase-backed logbook (`user_context_entries` table). Each agent reads relevant context types at prompt-build time and writes entries after significant actions.

Context entry types: `active_plan`, `research_done`, `course_saved`, `note_created`, `note_edited`, `goal_set`, `soul_updated`.

### Database Tables

| Table                  | Purpose                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `missions`             | Goal, mode, status, current stage                                |
| `mission_steps`        | Per-stage status, retry count, timing                            |
| `mission_handoffs`     | Inter-stage data transfer (research brief, course outline, etc.) |
| `mission_approvals`    | Approval gates with risk level, expiry, resolution               |
| `mission_events`       | Sequenced event log for SSE streaming                            |
| `mission_run_locks`    | Distributed lock preventing concurrent execution                 |
| `user_context_entries` | Cross-agent context bus                                          |
| `user_soul`            | User learning preferences                                        |

### API Routes

| Method | Path                                              | Purpose                                           |
| ------ | ------------------------------------------------- | ------------------------------------------------- |
| POST   | `/api/missions/start`                             | Create mission + 4 steps, start background run    |
| GET    | `/api/missions/:id/state`                         | Full state snapshot                               |
| GET    | `/api/missions/:id/stream`                        | SSE stream (supports `?afterSeq=n` for reconnect) |
| POST   | `/api/missions/:id/approvals/:approvalId/approve` | Approve gate                                      |
| POST   | `/api/missions/:id/approvals/:approvalId/reject`  | Reject gate                                       |
| POST   | `/api/missions/:id/resume`                        | Resume blocked/errored mission                    |

### Feature Flags

Mission Hub is gated behind `VITE_MISSION_HUB_V1` (frontend) and `MISSION_HUB_V1` (API). All entry points and routes are hidden when disabled.

---

## Editor Architecture

### Muya Integration in apps/web

```
EditorArea.vue
  -> Creates Muya instance on mount
  -> Passes EditorOptions from preferences store
  -> Listens to Muya events:
     - 'json-change' -> update content in store
     - 'selection-change' -> update cursor
     - 'toc-change' -> update table of contents
  -> useDiffBlocks composable handles inline diff visualization
  -> Auto-save: debounced save to Supabase
```

### Inline Diff Visualization Pattern

AI-proposed edits are visualized directly in the editor using DOM injection (NOT overlays - see MUYA.md for why overlays fail):

```
AI proposes edit via edit-proposal SSE chunk
  -> AI store: addPendingEdit() with DiffHunks
  -> useDiffBlocks watches pendingEdits
  -> For each hunk:
     1. Parse markdown -> TState[] (via muyaMarkdownParser.ts)
     2. Create real Muya blocks via ScrollPage.loadBlock()
     3. Style original block as deletion (coral background)
     4. Insert new blocks after, style as addition (green background)
     5. Add action buttons (+/-) as children inside blocks
     6. Track each block in AI store via addDiffBlock()
  -> User clicks accept/reject per-block or bulk
  -> On resolution: sync editor content, persist to database
```

**Key insight:** Injected blocks scroll naturally with the document because they ARE part of the document, unlike overlays which require complex scroll synchronization.

### Editor Modes

| Mode       | Implementation                         |
| ---------- | -------------------------------------- |
| WYSIWYG    | Muya engine (contenteditable)          |
| Source     | CodeMirror 6 (textarea-based)          |
| Focus      | Highlight active paragraph, dim others |
| Typewriter | Keep cursor vertically centered        |
| Zen        | Hide all UI except editor              |

---

## Environment Configuration

### Required Variables

| Variable                    | Package  | Purpose                  |
| --------------------------- | -------- | ------------------------ |
| `VITE_SUPABASE_URL`         | web, api | Supabase project URL     |
| `VITE_SUPABASE_ANON_KEY`    | web, api | Supabase anonymous key   |
| `SUPABASE_SERVICE_ROLE_KEY` | api      | Admin key (bypasses RLS) |
| `OPENAI_API_KEY`            | api      | Required for embeddings  |

### Optional Variables

| Variable            | Purpose                             |
| ------------------- | ----------------------------------- |
| `ANTHROPIC_API_KEY` | Claude chat (default model)         |
| `GOOGLE_AI_API_KEY` | Gemini slides/research              |
| `API_PORT`          | Backend port (default 3001)         |
| `CORS_ORIGIN`       | Allowed frontend origin             |
| `VITE_PROVIDER`     | Service provider: supabase or local |

### Version Constraints

- **Node.js:** >=20.0.0 (pinned in `.nvmrc`)
- **pnpm:** 9.15.0
- **TypeScript:** ~5.7.0, target ES2022 (never ES2023)
- **@vitejs/plugin-vue:** ^5.0.0 at root, ^6.0.0 in apps/web (intentional split for Vite 7)

---

## Secretary Architecture

### Overview

The Secretary is an AI daily planner, roadmap manager, and learning assistant built with the deepagents framework. It manages study schedules, learning roadmaps, and daily plans through a markdown-based memory system backed by Supabase.

### Backend (`packages/ai/src/agents/secretary/`)

| File           | Purpose                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent.ts`     | `SecretaryAgent` — deepagents-based agent with `createDeepAgent()`, streaming support                                                                                    |
| `tools.ts`     | 8 tools: `create_roadmap`, `save_roadmap`, `modify_roadmap`, `get_current_week_tasks`, `update_today_plan`, `list_memory_files`, `read_memory_file`, `write_memory_file` |
| `memory.ts`    | `MemoryService` — Supabase CRUD for `secretary_memory` table, plus lifecycle automation (day transition, weekly expansion)                                               |
| `prompts.ts`   | System prompts for the secretary agent and subagents                                                                                                                     |
| `subagents.ts` | Planner and Researcher subagents for complex tasks                                                                                                                       |
| `index.ts`     | Barrel exports                                                                                                                                                           |

### Memory Files

| File           | Purpose                                                            |
| -------------- | ------------------------------------------------------------------ |
| `Plan.md`      | Active learning roadmaps, "This Week" schedule                     |
| `AI.md`        | User study preferences (focus time, break frequency, availability) |
| `Today.md`     | Today's time-blocked task schedule                                 |
| `Tomorrow.md`  | Generated tomorrow plan (pending approval)                         |
| `Plans/*.md`   | Individual roadmap archives                                        |
| `History/*.md` | Archived daily plans (auto-archived by day transition)             |

### Lifecycle Automation

- **Day transition** (`performDayTransition()`): Runs on every `getFullContext()` call. Archives stale Today.md to `History/YYYY-MM-DD.md`, promotes Tomorrow.md if it matches today's date.
- **Weekly expansion** (`checkAndExpandWeek()`): Checks if a new week has started, regenerates the "This Week" section in Plan.md based on active plans.

### API Endpoints (`apps/api/src/routes/secretary.ts`)

| Method | Path                                     | Purpose                            |
| ------ | ---------------------------------------- | ---------------------------------- |
| POST   | `/api/secretary/chat`                    | Streaming chat via SSE             |
| GET    | `/api/secretary/memory`                  | List all memory files              |
| GET    | `/api/secretary/memory/:filename`        | Get specific memory file           |
| PUT    | `/api/secretary/memory/:filename`        | Update memory file                 |
| POST   | `/api/secretary/initialize`              | Create default memory files        |
| POST   | `/api/secretary/prepare-tomorrow`        | AI generates tomorrow's plan (SSE) |
| POST   | `/api/secretary/approve-tomorrow`        | Move Tomorrow.md → Today.md        |
| POST   | `/api/secretary/day-transition`          | Trigger day transition manually    |
| GET    | `/api/secretary/history`                 | List archived daily plans          |
| GET    | `/api/secretary/plan-links`              | All plan-project links for user    |
| POST   | `/api/secretary/plan/:id/link-project`   | Create folder + link for plan      |
| DELETE | `/api/secretary/plan/:id/unlink-project` | Remove plan-project link           |
| GET    | `/api/context/soul`                      | Read user soul/preferences         |
| PUT    | `/api/context/soul`                      | Update user soul/preferences       |
| GET    | `/api/context/entries`                   | List recent context entries        |

### Frontend

**Route:** `/calendar` → `SecretaryView.vue` (3-column dashboard)

**Components** (`apps/web/src/components/secretary/`):

| Component                  | Purpose                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| `SecretaryChat.vue`        | Chat interface with ChatComposer + SecretaryMessageCard                |
| `SecretaryMessageCard.vue` | Rich message rendering (markdown, tool calls, thinking steps)          |
| `TodayPlan.vue`            | Today's task list with status toggles                                  |
| `TomorrowPlan.vue`         | Tomorrow plan preview with Edit and Approve buttons                    |
| `WeekCalendar.vue`         | 7-day grid with plan dots parsed from "This Week" section              |
| `MemoryFileEditor.vue`     | Edit/preview toggle for memory files (raw markdown + rendered preview) |
| `ActivePlans.vue`          | List of active learning roadmaps                                       |
| `PlanCard.vue`             | Individual plan card with progress                                     |
| `SoulEditor.vue`           | Textarea for user goals/preferences (auto-save to /api/context/soul)   |

**Store:** `apps/web/src/stores/secretary.ts` — Pinia store managing memory files, daily plans, active roadmaps, and chat state. Handles full SSE event discrimination (`text`, `tool_call`, `tool_result`, `thinking`, `done`, `error`).

### Database

| Table                 | Purpose                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `secretary_memory`    | Markdown memory files per user (unique on `user_id, filename`). Includes `Inbox.md` (captures) and `Calendar.md` (synced events)                                  |
| `secretary_threads`   | Chat thread persistence for conversation continuity                                                                                                               |
| `plan_schedules`      | Recurring automations per plan (workflow, frequency, time, instructions)                                                                                          |
| `plan_project_links`  | Junction table mapping plan IDs (text) to project/folder UUIDs. Enables "smart folders" — each plan auto-creates an editor folder, and generated notes land there |
| `user_capture_tokens` | Hashed capture tokens for mobile/shortcut inbox capture (token auth, not JWT)                                                                                     |
| `user_integrations`   | Connected external services (Google Calendar, Notion) with OAuth tokens and sync state                                                                            |
