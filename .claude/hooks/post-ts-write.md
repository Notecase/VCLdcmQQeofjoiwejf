# Post-TypeScript Write Verification Hook

After writing/editing this TypeScript file, verify:

## Quick Checks

1. **File compiles** - Would `pnpm typecheck` pass for this file?
   - Check for obvious type errors
   - Verify imports resolve correctly

2. **Exports are correct** - If this is a module entry point:
   - Are all public APIs exported?
   - Is the export in the package's index.ts?

3. **Error handling complete** - If async code was added:
   - Are errors handled with try/catch or tryCatch utility?
   - Is handleError called in catch blocks?

## Pattern Verification

4. **No banned patterns introduced**:
   - `throw new Error()` - should be AppError
   - `console.error()` without handleError
   - Duplicate type definitions

5. **Imports are optimal**:
   - Using `@inkdown/shared/types` for shared types
   - Using `@inkdown/shared/errors` for error handling
   - No circular imports

## Recommendations

If issues are found:
1. Note them in the response
2. Suggest specific fixes
3. Offer to apply corrections

## Silent Pass

If all checks pass, no output needed - proceed silently.
