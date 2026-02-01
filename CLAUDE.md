# Inkdown Development Guardrails

This document defines conventions, constraints, and guardrails for Claude Code when working on the Inkdown monorepo.

## Tech Stack Versions

| Package | Version | Notes |
|---------|---------|-------|
| Node.js | >=20.0.0 | Pinned in `.nvmrc` |
| pnpm | 9.15.0 | Workspace manager |
| Vue | 3.5.24 | UI framework |
| Vite | 7.2.4 | Build tool |
| TypeScript | ~5.7.0 | Strict mode enabled |

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
│   └── muya/          # Markdown editor engine
├── apps/
│   ├── api/           # Backend API services
│   └── web/           # Web app (Vite 7)
└── extensions/        # Browser extensions
```

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
import {
  AppError,
  ErrorCode,
  handleError,
  tryCatch,
  isAppError
} from '@inkdown/shared/errors'
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
  console.error(error)  // Missing handleError wrapper
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

| Type | Locations | Canonical Location |
|------|-----------|-------------------|
| ChatMessage | 4 locations | `@inkdown/shared/types/chat.ts` |
| AIProvider | 3 locations | `@inkdown/shared/types/ai.ts` |

**Rule**: When you encounter duplicate type definitions, consolidate to `@inkdown/shared/types/`.

### Importing Types
```typescript
// ✅ CORRECT - Import from shared
import type { ChatMessage, ChatSession } from '@inkdown/shared/types'
import type { AIProvider, AIModel } from '@inkdown/shared/types'

// ❌ BANNED - Local type definitions that duplicate shared types
interface ChatMessage {  // Don't define locally
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
| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| ChatMessage type duplication | High | Open | 4 locations need consolidation |
| @vitejs/plugin-vue version split | Medium | Intentional | Document in code comments |

### Resolved Issues
| Issue | Resolution Date | Solution |
|-------|----------------|----------|
| - | - | - |

## Pre-Implementation Checklist

Before making changes, verify:

1. [ ] Read existing code in the target files
2. [ ] Check for existing type definitions in `@inkdown/shared/types`
3. [ ] Verify error handling uses `AppError`
4. [ ] Confirm no circular dependencies will be introduced
5. [ ] Check version compatibility for new dependencies

## Agent Usage

Use these specialized agents via the Task tool:

| Agent | When to Use |
|-------|-------------|
| `version-validator` | After modifying package.json or adding dependencies |
| `type-sync-checker` | After adding/modifying type definitions |
| `error-pattern-auditor` | After adding error handling code |
| `build-validator` | Before commits, after significant changes |
| `pre-implementation-checker` | Before starting any implementation |

## Skills (Slash Commands)

| Command | Purpose |
|---------|---------|
| `/sync-versions` | Interactive version conflict resolution |
| `/debug-mismatch` | Systematic debugging for logic/system mismatches |
| `/validate-package` | Deep validation of a specific package |
| `/pre-commit-check` | Full validation suite before commits |
