# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
# Development
pnpm install              # Install all dependencies
pnpm dev                  # Start all dev servers (web on :5173, api on :3001)
pnpm build                # Build all packages (respects dependency order via Turbo)
pnpm typecheck            # TypeScript validation across all packages
pnpm lint                 # ESLint check
pnpm lint:fix             # Auto-fix lint issues

# Testing (Vitest, happy-dom environment)
pnpm test                 # Watch mode
pnpm test:run             # Single run
pnpm test:run <path>      # Single file: pnpm test:run packages/shared/src/errors.test.ts
pnpm test:coverage        # With v8 coverage report

# Pre-commit validation
pnpm build && pnpm typecheck && pnpm lint && pnpm test:run
```

## Architecture Overview

**Monorepo** managed by pnpm workspaces + Turborepo. Two apps, four packages.

### Apps

- **apps/api** — Hono HTTP server (port 3001). Routes in `src/routes/`. Streams AI responses via SSE. Key routes: `agent.ts` (main AI endpoint, checks `isCompoundRequest()` before routing), `secretary.ts`, `course.ts`, `research.ts`.
- **apps/web** — Vue 3 SPA with Vite 7, Pinia stores, Vue Router, Element Plus. Routes defined in `src/main.ts`. Path alias: `@` → `src/`.

### Packages (build order matters)

1. **packages/shared** — Foundation: types (`src/types/`), errors (`AppError`, `ErrorCode`), utilities. ZERO internal deps.
2. **packages/ai** — AI provider abstraction (OpenAI, Anthropic, Google, Ollama) via `providers/factory.ts`. **Unified Agent Mesh**: 3 active agents (EditorDeep, Secretary, Research) + Capability Registry (`registry/`) with 7 shared capabilities. Agents in `agents/`: `editor-deep/` (compound requests), `secretary/` (planning), `research/` (deep research), `planner.agent.ts` (kept for `planning.decompose` capability). Note creation extracted to `utils/note-creator.ts`.
3. **packages/editor** — Shared editor types and assets. Exports raw TypeScript (no compilation step).
4. **packages/muya** — Local fork of Muya markdown editor. DOM-based, NOT a Vue component. **Read `packages/muya/MUYA.md` before touching Muya code.**

### Key Data Flow: AI Edit Proposals

1. Backend agent emits `edit-proposal` event via SSE
2. Frontend `ai.service.ts` receives chunk, calls `computeDiffHunks()` (jsdiff)
3. `useDiffBlocks.ts` injects diff blocks into Muya DOM
4. User accepts → `muya.setMarkdown()` with proposed content → `saveDocument()`

### Key Pinia Stores (apps/web/src/stores/)

- `ai.ts` — AI sessions, edits, artifacts, diff blocks (largest store)
- `editor.ts` — Current document state
- `deepAgent.ts` — Deep agent state management
- `course.ts` — Course generation workflow
- `secretary.ts` — Calendar/scheduling

### Module Aliases (vitest.config.ts & tsconfig)

- `@` → `apps/web/src`
- `@inkdown/shared` → `packages/shared/src`
- `@inkdown/ai` → `packages/ai/src`
- `@inkdown/editor` → `packages/editor/src`
- `@inkdown/muya` → `packages/muya/src`

### Environment Variables

Copy `.env.example` to `.env`. Key vars:

- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` — AI provider keys
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase connection
- `VITE_PROVIDER` — `supabase` or `local`
- `VITE_API_URL` — API server base URL (empty in dev → Vite proxy, `https://api.noteshell.io` in prod)
- `API_PORT` — API server port (default 3001)

### Database

Supabase with migrations in `supabase/migrations/` (16+ migration files). Key tables: `projects`, `notes`, `chat_sessions`, `chat_messages`, `ai_edits`, `artifacts`, `courses`, `research_sessions`, `secretary_events`.

---

## Workflow - MUST FOLLOW FOR EVERY TASK

1. **Read before acting**: Think through the problem first. Read the codebase for all relevant files before proposing any changes. Never speculate about code you have not opened. If the user references a specific file, you MUST read it before answering. Give grounded, hallucination-free answers only.
2. **Ask clarifying questions FIRST**: Before starting any non-trivial task, ask clarifying questions to ensure 100% understanding. See "Question-First Protocol" below - this is mandatory, not optional.
3. **Check in before major changes**: Before making any significant changes, present the plan to the user and wait for approval.
4. **Explain changes at a high level**: At every step, provide a brief high-level explanation of what changes were made and why.
5. **Keep changes minimal and simple**: Every task and code change should be as simple as possible. Avoid massive or complex changes. Each change should impact as little code as possible. Simplicity above all.
6. **Maintain architecture documentation**: Keep `docs/ARCHITECTURE.md` up to date. After completing any task that adds/removes/renames packages, changes the dependency graph, adds new routes or stores, modifies the database schema, changes the build system, or alters how major subsystems interact, update the relevant section of `docs/ARCHITECTURE.md` before considering the task done.
7. **Investigate before answering**: Never make claims about code before reading the relevant files. When asked about the codebase, search and read files first, then answer.

## Question-First Protocol - ALWAYS ASK BEFORE DOING

**Default assumption:** The user ALWAYS wants clarifying questions before Claude starts working. Never assume you understand the full picture. Ask first, act second.

### When to Ask (ALWAYS unless trivial)

Ask clarifying questions for ANY task that involves:

- Writing or modifying more than a few lines of code
- Architectural decisions or design choices
- Multiple valid approaches or trade-offs
- Unclear scope, requirements, or success criteria
- New features, refactoring, or significant changes
- Anything where you're making assumptions

**Only skip questions for truly trivial tasks:** fixing a typo, adding a single obvious line, or when the user has given extremely detailed step-by-step instructions.

### How to Ask

1. **Read first, then ask**: Explore the codebase to understand context before asking. This leads to better, more specific questions.
2. **Batch questions together**: Don't ask one question at a time. Gather all your uncertainties and ask them in one message.
3. **Show your thinking**: Explain what you've understood so far, then ask about the gaps.
4. **Propose a plan with your questions**: Don't just ask questions - also share how you'd approach the task so the user can correct your understanding.

### Anti-Patterns (NEVER do these)

- **Assume and proceed**: Making assumptions instead of asking leads to wasted work
- **Ask permission to ask**: Just ask the questions directly
- **Ask obvious questions**: Don't ask things you can figure out by reading the code
- **Ask one at a time**: Batch your questions to be efficient

## Living Documentation Protocol

Documentation files are living documents that MUST stay synchronized with code. Inaccurate documentation causes compounding errors.

### Documentation Files

| File                    | Scope                    | Update Trigger                                            |
| ----------------------- | ------------------------ | --------------------------------------------------------- |
| `docs/ARCHITECTURE.md`  | System-wide architecture | Package/route/store/schema/dependency changes             |
| `docs/todos/*.md`       | Plan-mode archives       | Every plan-mode session                                   |
| `packages/muya/MUYA.md` | Muya editor patterns     | New Muya discoveries, integration patterns, anti-patterns |

### Verification Requirements (MANDATORY before any doc update)

1. **Read the relevant code first** - Never update documentation from memory or assumption.
2. **Verify through multiple sources** - Check at least 2 files that reference the pattern. Run grep to find all usages.
3. **Test claims empirically when possible** - Concrete evidence for "X doesn't work", working code for "Y is the pattern".
4. **Use conservative language** - Prefer "currently" over "always". Distinguish "tested" from "expected".
5. **Include evidence references** - File paths with line numbers for code examples.

## Plan Archive Protocol

When working in Plan mode, save the final plan to `docs/todos/YYYY-MM-DD-<short-kebab-case-topic>.md` before calling `ExitPlanMode`.

## Tech Stack Versions

| Package    | Version  | Notes               |
| ---------- | -------- | ------------------- |
| Node.js    | >=20.0.0 | Pinned in `.nvmrc`  |
| pnpm       | 9.15.0   | Workspace manager   |
| Vue        | 3.5.24   | UI framework        |
| Vite       | 7.2.4    | Build tool          |
| TypeScript | ~5.7.0   | Strict mode enabled |

## Known Version Conflicts - CRITICAL

### @vitejs/plugin-vue Split

- **Root/packages**: Use `@vitejs/plugin-vue@^5.0.0`
- **apps/web**: Uses `@vitejs/plugin-vue@^6.0.0`
- **Reason**: apps/web has specific Vite 7 requirements
- **Rule**: Do NOT unify these versions - the split is intentional

### TypeScript Target

- **Always use**: `"target": "ES2022"`
- **Never use**: `ES2023` (causes compatibility issues with some dependencies)
- **Check**: All `tsconfig.json` files must use ES2022

## Dependency Rules

1. **@inkdown/shared**: ZERO internal `@inkdown/*` dependencies — foundation package, all others depend on it
2. **@inkdown/ai**: Only `@inkdown/shared` as peerDependency — must not depend on editor, desktop, or web packages
3. **Circular Dependencies**: FORBIDDEN — Run `pnpm why <package>` to verify

## Muya Editor Guardrails

When working with the Muya editor engine (`packages/muya/` or integrating with it in `apps/web/`), **read `packages/muya/MUYA.md` first**. Critical rules:

- DOM elements have `__MUYA_BLOCK__` property — use `markRaw()` to avoid Vue proxy issues
- Custom UI must be CHILDREN of blocks, not overlays (overlay positioning fails due to scroll drift)
- Use Muya's Selection API, not native DOM selection
- See `useDiffBlocks.ts` for the correct integration pattern

## Error Handling Standard - MANDATORY

All error handling MUST use the centralized system from `@inkdown/shared/errors`.

```typescript
// ✅ CORRECT
import { AppError, ErrorCode, handleError, tryCatch } from '@inkdown/shared/errors'
throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid input', { field: 'email' })

// ✅ CORRECT - Using tryCatch utility
const [result, error] = await tryCatch(riskyOperation())

// ❌ BANNED - Never use raw Error or console.error without handleError
throw new Error('Something went wrong')
```

Error codes: `VALIDATION_ERROR`, `AI_PROVIDER_ERROR`, `FILE_SYSTEM_ERROR`, `NETWORK_ERROR`, `AUTH_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`.

## Type Consistency - Single Source of Truth

All shared types MUST be defined in `@inkdown/shared/types/` (`chat.ts`, `ai.ts`, `document.ts`, `common.ts`). When you encounter duplicate type definitions, consolidate to `@inkdown/shared/types/`.

```typescript
// ✅ CORRECT
import type { ChatMessage, ChatSession } from '@inkdown/shared/types'

// ❌ BANNED - Local type definitions that duplicate shared types
```

## ESLint Configuration

- Config: `eslint.config.js` (flat config with `@eslint/js`, `typescript-eslint`, `eslint-plugin-vue`, `prettier`)
- Unused vars: warn (prefix with `_` to suppress)
- `no-explicit-any`: warn (off in test files)
- Vue: `vue3-recommended` rules, `multi-word-component-names` off
- Import order: Node built-ins → external packages → `@inkdown/*` → relative imports

## Build Order

Packages must build in dependency order: `@inkdown/shared` → `@inkdown/ai` → `@inkdown/editor` → `@inkdown/muya` → Apps. Turbo handles this automatically via `"dependsOn": ["^build"]`.

## Agent Usage

Use these specialized agents via the Task tool:

| Agent                        | When to Use                                         |
| ---------------------------- | --------------------------------------------------- |
| `version-validator`          | After modifying package.json or adding dependencies |
| `type-sync-checker`          | After adding/modifying type definitions             |
| `error-pattern-auditor`      | After adding error handling code                    |
| `build-validator`            | Before commits, after significant changes           |
| `pre-implementation-checker` | Before starting any implementation                  |

## Skills (Slash Commands)

| Command             | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `/sync-versions`    | Interactive version conflict resolution          |
| `/debug-mismatch`   | Systematic debugging for logic/system mismatches |
| `/validate-package` | Deep validation of a specific package            |
| `/pre-commit-check` | Full validation suite before commits             |
