---
name: pre-commit-check
description: Full validation suite to run before committing changes
---

# Pre-Commit Check

Comprehensive validation suite that must pass before committing changes to the Inkdown repository.

## Quick Run

This skill runs all validation checks in sequence and reports results.

## Validation Pipeline

### Stage 1: Code Quality

```bash
# TypeScript compilation check
pnpm typecheck

# Linting
pnpm lint

# Formatting (if configured)
pnpm format:check
```

### Stage 2: Build Verification

```bash
# Build all packages
pnpm build
```

### Stage 3: Version Consistency

Run the `version-validator` agent to check:
- No unintentional version conflicts
- Known version splits are documented
- Dependencies are properly declared

### Stage 4: Type Consistency

Run the `type-sync-checker` agent to check:
- No duplicate type definitions introduced
- Types imported from correct locations
- Shared types are in @inkdown/shared

### Stage 5: Error Handling

Run the `error-pattern-auditor` agent to check:
- No raw `throw new Error()`
- No `console.error` without `handleError`
- No custom error classes outside shared

### Stage 6: Test Suite (if available)

```bash
pnpm test --passWithNoTests
```

## Report Format

```markdown
## Pre-Commit Validation Report

### Summary
| Stage | Status | Details |
|-------|--------|---------|
| TypeCheck | ✅/❌ | X errors |
| Lint | ✅/❌ | X errors, Y warnings |
| Build | ✅/❌ | All packages built |
| Versions | ✅/❌ | No conflicts |
| Types | ✅/❌ | No duplicates |
| Errors | ✅/❌ | Patterns OK |
| Tests | ✅/❌ | X passed |

### Overall: ✅ READY TO COMMIT / ❌ NEEDS FIXES

---

### Stage Details

#### TypeCheck
[output or "Passed"]

#### Lint
[output or "Passed"]

#### Build
[output or "Passed"]

#### Version Check
[agent report summary]

#### Type Check
[agent report summary]

#### Error Pattern Check
[agent report summary]

#### Tests
[output or "Passed"]

---

### Blocking Issues
1. [must fix before commit]

### Warnings
1. [should consider fixing]

### Commit Readiness
[✅ Ready to commit / ❌ Fix issues first]
```

## Failure Handling

### If TypeCheck Fails
1. Read the error messages
2. Fix type issues
3. Re-run `pnpm typecheck`

### If Lint Fails
1. Run `pnpm lint:fix` for auto-fixable issues
2. Manually fix remaining issues
3. Re-run `pnpm lint`

### If Build Fails
1. Check for circular dependencies
2. Verify build order
3. Check for missing exports
4. Re-run `pnpm build`

### If Version Check Fails
1. Use `/sync-versions` skill
2. Follow interactive resolution
3. Re-run pre-commit check

### If Type Check Fails
1. Consolidate duplicate types
2. Fix import paths
3. Re-run pre-commit check

### If Error Pattern Fails
1. Replace raw Error with AppError
2. Add handleError to catch blocks
3. Re-run pre-commit check

## Quick Fix Commands

```bash
# Auto-fix lint issues
pnpm lint:fix

# Clean and rebuild
pnpm clean && pnpm build

# Regenerate types
pnpm typecheck

# Full clean slate
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm build
```

## CI/CD Alignment

This check mirrors what CI will run:
1. `pnpm install`
2. `pnpm build`
3. `pnpm typecheck`
4. `pnpm lint`
5. `pnpm test`

Passing locally means CI should also pass.

## Commit Message Guidance

After validation passes, create a commit with:
- Clear, descriptive message
- Reference any issues fixed
- Note any version updates

Example:
```
feat(ai): add Claude provider support

- Add ClaudeProvider to @inkdown/ai
- Use AppError for API error handling
- Export types from @inkdown/shared

Closes #123
```
