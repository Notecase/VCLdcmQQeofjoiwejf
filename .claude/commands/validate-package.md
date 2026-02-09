---
name: validate-package
description: Deep validation of a specific package in the Inkdown monorepo
args: package_name
---

# Validate Package

Deep validation workflow for a specific package in the Inkdown monorepo.

## Usage

```
/validate-package [package-name]
```

Examples:

- `/validate-package shared`
- `/validate-package ai`
- `/validate-package web`

## Validation Checks

### 1. Package Structure

**Required files:**

- `package.json` - Package manifest
- `tsconfig.json` - TypeScript configuration
- `src/index.ts` - Entry point
- `README.md` - Documentation (optional but recommended)

**Check structure:**

```
packages/[name]/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   └── ...
└── dist/           # Built output
```

### 2. Package.json Validation

**Required fields:**

```json
{
  "name": "@inkdown/[name]",
  "version": "x.y.z",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ... }
}
```

**Dependency rules:**

- `@inkdown/shared`: No internal @inkdown/\* deps
- Other packages: Only @inkdown/shared as peerDependency
- No circular dependencies

### 3. TypeScript Validation

**tsconfig.json requirements:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "strict": true
  }
}
```

**Run typecheck:**

```bash
pnpm --filter @inkdown/[name] typecheck
```

### 4. Build Validation

```bash
# Build the specific package
pnpm --filter @inkdown/[name] build

# Verify output exists
ls -la packages/[name]/dist/
```

### 5. Export Validation

Verify all exports are accessible:

```typescript
// Check that main exports work
import { ... } from '@inkdown/[name]'
```

### 6. Error Handling Audit

Check that the package uses centralized error handling:

```
Run error-pattern-auditor agent focused on this package
```

### 7. Type Consistency

Check for duplicate type definitions:

```
Run type-sync-checker agent focused on this package
```

## Validation Report Template

```markdown
## Package Validation: @inkdown/[name]

### Summary

| Check            | Status |
| ---------------- | ------ |
| Structure        | ✅/❌  |
| Package.json     | ✅/❌  |
| TypeScript       | ✅/❌  |
| Build            | ✅/❌  |
| Exports          | ✅/❌  |
| Error Handling   | ✅/❌  |
| Type Consistency | ✅/❌  |

### Structure Check

- [x] package.json exists
- [x] tsconfig.json exists
- [x] src/index.ts exists
- [ ] README.md exists

### Dependency Analysis

**Dependencies:**

- [list of dependencies]

**PeerDependencies:**

- [list of peer dependencies]

**Violations:**

- [any dependency rule violations]

### Build Output
```

[build command output]

```

### Issues Found
1. [issue description]
   - **Severity:** High/Medium/Low
   - **Fix:** [how to fix]

### Recommendations
1. [recommendations for improvement]
```

## Quick Commands

```bash
# Package-specific commands
pnpm --filter @inkdown/[name] build
pnpm --filter @inkdown/[name] typecheck
pnpm --filter @inkdown/[name] lint
pnpm --filter @inkdown/[name] test

# Check dependencies
pnpm why @inkdown/[name]

# List package exports
cat packages/[name]/package.json | jq '.exports'
```

## Package-Specific Notes

### @inkdown/shared

- Must have ZERO internal dependencies
- All shared types go here
- Error handling system lives here

### @inkdown/ai

- Only @inkdown/shared as peerDependency
- AI provider implementations
- Must use AppError for API errors

### @inkdown/editor

- UI components for editing
- Vue 3 Composition API

### @inkdown/muya

- Markdown editor engine
- Complex internal state management
