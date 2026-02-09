# Inkdown Development Guardrails

This document defines conventions, constraints, and guardrails for Claude Code when working on the Inkdown monorepo.

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

### What to Ask About

| Category             | Example Questions                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Scope**            | "Should this only affect X, or also Y and Z?"                                                                       |
| **Approach**         | "I see two ways to do this: A (simpler but less flexible) or B (more complex but extensible). Which do you prefer?" |
| **Requirements**     | "What should happen when [edge case]?"                                                                              |
| **Constraints**      | "Are there performance/compatibility/timeline constraints I should know about?"                                     |
| **Success criteria** | "How will we know this is working correctly? What does 'done' look like?"                                           |
| **Preferences**      | "Do you have a preferred pattern/style for this kind of thing in the codebase?"                                     |
| **Dependencies**     | "This might affect [related system]. Should I consider that, or keep this change isolated?"                         |
| **Existing code**    | "I found [existing pattern]. Should I follow this, or is this an opportunity to improve it?"                        |

### How to Ask

1. **Read first, then ask**: Explore the codebase to understand context before asking. This leads to better, more specific questions.

2. **Batch questions together**: Don't ask one question at a time. Gather all your uncertainties and ask them in one message.

3. **Show your thinking**: Explain what you've understood so far, then ask about the gaps. Example:

   > "I understand you want X. I've looked at the codebase and see we currently do Y. My plan would be to do Z. Before I start:
   >
   > - Should I also handle [edge case]?
   > - Do you prefer approach A or B for [specific decision]?
   > - What's the expected behavior when [scenario]?"

4. **Propose a plan with your questions**: Don't just ask questions - also share how you'd approach the task so the user can correct your understanding.

### Anti-Patterns (NEVER do these)

- **Assume and proceed**: Making assumptions instead of asking leads to wasted work
- **Ask permission to ask**: Just ask the questions directly, don't say "Can I ask some questions?"
- **Ask obvious questions**: Don't ask things you can figure out by reading the code
- **Ask one at a time**: Batch your questions to be efficient
- **Skip questions to seem fast**: Taking 5 minutes to clarify saves hours of rework

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

2. **Verify through multiple sources:**
   - Check at least 2 files that reference the pattern
   - Run `grep` to find all usages
   - Review recent commits touching the area (if relevant)

3. **Test claims empirically when possible:**
   - If documenting "X doesn't work", have concrete evidence (error message, failed attempt)
   - If documenting "Y is the pattern", show working code from the actual codebase

4. **Use conservative language:**
   - Prefer "currently" over "always"
   - Note when patterns are evolving
   - Distinguish between "tested" and "expected"

5. **Include evidence references:**
   - File paths with line numbers for code examples
   - Commit hashes for recent changes (when documenting new patterns)

### Anti-Patterns (NEVER do these)

- Update documentation based on assumptions about how code should work
- Document patterns from other projects without verifying they apply to Inkdown
- Use a single observation without cross-verification
- Claim something "doesn't work" without having attempted it and failed
- Remove documentation about deprecated patterns without adding migration notes

## Plan Archive Protocol

When working in Plan mode, the final plan MUST be saved to `docs/todos/` before exiting plan mode.

### Rules

1. **Save every plan**: Before calling `ExitPlanMode`, copy the plan content to `docs/todos/YYYY-MM-DD-<topic>.md`
2. **Naming convention**: `YYYY-MM-DD-<short-kebab-case-topic>.md` (e.g., `2026-02-06-add-plan-archive.md`)
3. **Topic**: Derive from the plan's main subject — keep it to 3-5 words in kebab-case
4. **Content**: The full plan as written in the plan file — no modifications needed

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

## Package Architecture

```
inkdown/
├── packages/           # Shared libraries
│   ├── shared/        # Types, errors, utilities (NO internal deps)
│   ├── ai/            # AI providers (peerDep: @inkdown/shared)
│   ├── editor/        # Editor components
│   └── muya/          # Markdown editor engine (see packages/muya/MUYA.md)
├── apps/
│   ├── api/           # Backend API services
│   └── web/           # Web app (Vite 7)
```

### Muya Editor Guardrails

When working with the Muya editor engine (`packages/muya/` or integrating with it in `apps/web/`), **read `packages/muya/MUYA.md` first**. It contains critical rules for:

- DOM ownership (`__MUYA_BLOCK__` property)
- Why overlay positioning patterns fail
- Block creation and state management
- Working integration patterns from `useDiffBlocks.ts`
- Vue reactivity warnings (`markRaw()` requirement)

### Dependency Rules

1. **@inkdown/shared**: ZERO internal `@inkdown/*` dependencies
   - This is the foundation package
   - All other packages depend on it
   - Breaking this rule creates circular dependencies

2. **@inkdown/ai**: Only `@inkdown/shared` as peerDependency
   - Must not depend on editor, desktop, or web packages

3. **Circular Dependencies**: FORBIDDEN
   - Run `pnpm why <package>` to verify dependency chains
   - Use the `version-validator` agent to detect issues

## Error Handling Standard - MANDATORY

All error handling MUST use the centralized system from `@inkdown/shared/errors`.

### Required Import

```typescript
import { AppError, ErrorCode, handleError, tryCatch, isAppError } from '@inkdown/shared/errors'
```

### Creating Errors

```typescript
// ✅ CORRECT
throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid input', { field: 'email' })
throw new AppError(ErrorCode.AI_PROVIDER_ERROR, 'API call failed', { provider: 'openai' })

// ❌ BANNED - Never use raw Error
throw new Error('Something went wrong')
throw new TypeError('Invalid type')
```

### Handling Errors

```typescript
// ✅ CORRECT
try {
  await riskyOperation()
} catch (error) {
  handleError(error, { context: 'riskyOperation' })
}

// ✅ CORRECT - Using tryCatch utility
const [result, error] = await tryCatch(riskyOperation())
if (error) {
  handleError(error)
  return
}

// ❌ BANNED - Raw console.error
try {
  await riskyOperation()
} catch (error) {
  console.error(error) // Missing handleError wrapper
}
```

### Error Codes

Always use predefined `ErrorCode` enum values:

- `ErrorCode.VALIDATION_ERROR` - Input validation failures
- `ErrorCode.AI_PROVIDER_ERROR` - AI API issues
- `ErrorCode.FILE_SYSTEM_ERROR` - File operations
- `ErrorCode.NETWORK_ERROR` - HTTP/network issues
- `ErrorCode.AUTH_ERROR` - Authentication/authorization
- `ErrorCode.NOT_FOUND` - Resource not found
- `ErrorCode.INTERNAL_ERROR` - Unexpected internal errors

## Type Consistency - Single Source of Truth

### Core Types Location

All shared types MUST be defined in `@inkdown/shared/types/`:

```
packages/shared/src/types/
├── index.ts           # Re-exports all types
├── chat.ts            # ChatMessage, ChatSession, etc.
├── ai.ts              # AIProvider, AIModel, etc.
├── document.ts        # Project, Note, Attachment
└── common.ts          # Shared utilities
```

### Known Type Duplication Issues (TO FIX)

The following types are defined in multiple locations and need consolidation:

| Type        | Locations   | Canonical Location              |
| ----------- | ----------- | ------------------------------- |
| ChatMessage | 4 locations | `@inkdown/shared/types/chat.ts` |
| AIProvider  | 3 locations | `@inkdown/shared/types/ai.ts`   |

**Rule**: When you encounter duplicate type definitions, consolidate to `@inkdown/shared/types/`.

### Importing Types

```typescript
// ✅ CORRECT - Import from shared
import type { ChatMessage, ChatSession } from '@inkdown/shared/types'
import type { AIProvider, AIModel } from '@inkdown/shared/types'

// ❌ BANNED - Local type definitions that duplicate shared types
interface ChatMessage {
  // Don't define locally
  id: string
  content: string
}
```

## Build Requirements

### Before Any Commit

Run the full validation suite:

```bash
pnpm build        # Build all packages
pnpm typecheck    # TypeScript validation
pnpm lint         # ESLint + Prettier
pnpm test         # Run tests (if available)
```

### Build Order

Packages must build in dependency order:

1. `@inkdown/shared` (first, no deps)
2. `@inkdown/ai` (depends on shared)
3. `@inkdown/editor` (depends on shared)
4. `@inkdown/muya` (depends on shared, editor)
5. Apps (depend on all packages)

### TypeScript Configuration

All packages must extend the root tsconfig:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "strict": true
  }
}
```

## Lint Rules

### ESLint Configuration

- Extends: `@antfu/eslint-config`
- Vue-specific rules enabled for .vue files
- No unused variables allowed
- Prefer `const` over `let`

### Import Order

```typescript
// 1. Node built-ins
import { readFile } from 'node:fs/promises'

// 2. External packages
import { ref, computed } from 'vue'

// 3. Internal packages (@inkdown/*)
import { AppError } from '@inkdown/shared/errors'

// 4. Relative imports
import { useStore } from '../stores'
```

## Known Issues Tracker

### Active Issues

| Issue                            | Severity | Status      | Notes                          |
| -------------------------------- | -------- | ----------- | ------------------------------ |
| ChatMessage type duplication     | High     | Open        | 4 locations need consolidation |
| @vitejs/plugin-vue version split | Medium   | Intentional | Document in code comments      |

### Resolved Issues

| Issue | Resolution Date | Solution |
| ----- | --------------- | -------- |
| -     | -               | -        |

## Pre-Implementation Checklist

Before making changes, verify:

1. [ ] Read existing code in the target files
2. [ ] Check for existing type definitions in `@inkdown/shared/types`
3. [ ] Verify error handling uses `AppError`
4. [ ] Confirm no circular dependencies will be introduced
5. [ ] Check version compatibility for new dependencies

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
