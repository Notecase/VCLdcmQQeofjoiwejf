---
name: debug-mismatch
description: Systematic debugging workflow for logic and system mismatches in Inkdown
---

# Debug Mismatch

Systematic debugging workflow for investigating and resolving logic mismatches, type inconsistencies, and system conflicts.

## When to Use

- Runtime behavior doesn't match expected logic
- Type errors at runtime despite TypeScript passing
- Different behavior between packages
- Inconsistent state across the application
- "It works here but not there" scenarios

## Debugging Framework

### Phase 1: Characterize the Mismatch

**Questions to answer:**
1. What is the expected behavior?
2. What is the actual behavior?
3. Where does the mismatch occur? (file, function, line)
4. When does it occur? (always, sometimes, specific conditions)
5. What changed recently?

**Gather evidence:**
```bash
# Check recent commits
git log --oneline -20

# Check what files changed
git diff HEAD~5 --name-only

# Check for type definition changes
git log --oneline -10 -- "**/*.d.ts" "**/types/**"
```

### Phase 2: Isolate the Problem

**Type Mismatch Debugging:**
```
1. Run type-sync-checker agent
2. Look for duplicate type definitions
3. Check import paths
4. Verify types match between:
   - Source definition
   - Import location
   - Runtime usage
```

**Logic Mismatch Debugging:**
```
1. Add logging at key points
2. Trace data flow from source to error
3. Check for:
   - Null/undefined values
   - Type coercion issues
   - Async timing problems
   - State mutation
```

**Build Mismatch Debugging:**
```
1. Run build-validator agent
2. Check for stale builds
3. Verify build order
4. Clean and rebuild:
   pnpm clean && pnpm build
```

### Phase 3: Common Mismatch Patterns

#### Pattern A: Duplicate Type Definitions
**Symptom:** Type works in one file, fails in another
**Diagnosis:**
```
Grep: "interface [TypeName]" or "type [TypeName] ="
Check if multiple definitions exist
```
**Solution:** Consolidate to @inkdown/shared/types

#### Pattern B: Import Path Confusion
**Symptom:** Module not found or wrong module loaded
**Diagnosis:**
```
Check tsconfig paths
Check package.json exports
Verify node_modules symlinks (pnpm)
```
**Solution:** Use correct import path from package exports

#### Pattern C: Stale Build Artifacts
**Symptom:** Changes not reflected at runtime
**Diagnosis:**
```bash
# Check if dist is newer than src
ls -la packages/shared/dist/
ls -la packages/shared/src/

# Force rebuild
pnpm clean && pnpm build
```
**Solution:** Clean rebuild

#### Pattern D: Circular Import
**Symptom:** Undefined at runtime, works in tests
**Diagnosis:**
```bash
# Check for circular deps
pnpm why @inkdown/shared
```
**Solution:** Refactor to break cycle

#### Pattern E: Version Mismatch
**Symptom:** Works locally, fails in other environment
**Diagnosis:**
```
Run version-validator agent
Check .nvmrc matches local Node
Check pnpm-lock.yaml is committed
```
**Solution:** Sync versions and lockfile

### Phase 4: Resolution Workflow

1. **Identify root cause** using patterns above
2. **Create minimal fix** (smallest change that resolves issue)
3. **Verify fix locally:**
   ```bash
   pnpm build && pnpm typecheck && pnpm lint
   ```
4. **Test affected functionality**
5. **Run pre-commit-check skill** before committing

### Phase 5: Prevention

After fixing, consider:
- Should this be caught by a hook?
- Is there a missing guardrail?
- Should type be consolidated?
- Does CLAUDE.md need updating?

## Quick Reference Commands

```bash
# Type checking
pnpm typecheck

# Find type definitions
grep -r "interface ChatMessage" --include="*.ts" .

# Check imports
grep -r "from '@inkdown" --include="*.ts" packages/

# Dependency tree
pnpm why [package-name]

# Clean rebuild
pnpm clean && pnpm install && pnpm build
```

## Output Template

After debugging, document:

```markdown
## Mismatch Report

### Problem
[Description of the mismatch]

### Root Cause
[What caused the issue]

### Pattern
[Which common pattern this matches]

### Solution
[How it was fixed]

### Prevention
[How to prevent recurrence]
```
