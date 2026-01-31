# TypeScript File Validation Hook

Before creating or modifying this TypeScript file, verify:

## Import Checks

1. **Type imports** - Are types imported from `@inkdown/shared/types`?
   - ChatMessage, ChatSession, AIProvider, etc. should come from shared
   - Do NOT define duplicate types locally

2. **Error imports** - If error handling is present, is it from `@inkdown/shared/errors`?
   - AppError, ErrorCode, handleError, tryCatch should come from shared

## Pattern Checks

3. **Error throwing** - Is `throw new Error()` used?
   - ❌ BANNED: `throw new Error('message')`
   - ✅ CORRECT: `throw new AppError(ErrorCode.X, 'message')`

4. **Console.error** - Is `console.error()` used without handleError?
   - ❌ BANNED: `console.error(error)`
   - ✅ CORRECT: `handleError(error, { context: '...' })`

## Location Checks

5. **Type definitions** - Is this file defining shared types?
   - Types that could be shared should go in `@inkdown/shared/types`
   - Local types are OK if package-specific

6. **Error classes** - Is this file defining custom error classes?
   - ❌ BANNED outside `@inkdown/shared/errors`

## Proceed?

If any checks fail, warn before proceeding and suggest corrections.
