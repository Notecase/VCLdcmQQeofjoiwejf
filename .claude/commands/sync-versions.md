---
name: sync-versions
description: Interactive version conflict resolution for the Inkdown monorepo
---

# Sync Versions

Interactive workflow for detecting and resolving version conflicts across the Inkdown monorepo.

## Workflow Steps

### Step 1: Scan for Version Conflicts

First, use the `version-validator` agent to scan the codebase:

```
Task: version-validator agent
Prompt: Scan all package.json files and report version conflicts
```

### Step 2: Review Known Constraints

Reference the version constraints from CLAUDE.md:

| Package | Constraint | Notes |
|---------|------------|-------|
| `@vitejs/plugin-vue` | v5 root, v6 apps/web | Intentional split |
| `typescript` | ~5.7.0 | Must match everywhere |
| `vue` | 3.5.24 | Must match everywhere |
| `vite` | 7.2.4 | Must match everywhere |
| `node` | >=20.0.0 | Check .nvmrc |

### Step 3: Interactive Resolution

For each conflict found, present options:

```markdown
## Conflict: [package-name]

**Current state:**
- root: ^1.2.3
- apps/web: ^2.0.0
- packages/shared: ^1.5.0

**Options:**
1. Unify to highest version (^2.0.0)
2. Unify to lowest version (^1.2.3)
3. Keep intentional split (document reason)
4. Specify custom version

**Recommendation:** [based on known constraints]
```

### Step 4: Apply Changes

After user selects resolution:

1. Update all relevant package.json files
2. Run `pnpm install` to regenerate lockfile
3. Run `pnpm build` to verify no breaking changes
4. Run `pnpm typecheck` to verify types

### Step 5: Verify

Run the `build-validator` agent to confirm:
- Build passes
- TypeScript passes
- No new errors introduced

## Automation Commands

```bash
# Find all package.json files
find . -name "package.json" -not -path "./node_modules/*" | head -20

# Check specific package version across repo
grep -r '"typescript":' --include="package.json" .

# Update lockfile after changes
pnpm install

# Verify build
pnpm build && pnpm typecheck
```

## Known Safe Operations

These version unifications are always safe:
- `typescript` - should be identical everywhere
- `vue` - should be identical everywhere
- `@types/*` packages - should be identical everywhere

## Known Dangerous Operations

These require extra care:
- `@vitejs/plugin-vue` - intentional split, do not unify
- `electron` - may have platform-specific requirements
- `electron-builder` - version-sensitive for CI/CD

## Output

After completion, provide:
1. Summary of changes made
2. Verification results
3. Any remaining warnings
