# Error Handling Validation Hook

⚠️ **Potential banned pattern detected in content**

The code being written contains one of these patterns:
- `throw new Error` - Raw error throwing
- `console.error` - Direct console error logging

## Required Changes

### If `throw new Error(...)` is present:

Replace with AppError:

```typescript
// ❌ BEFORE
throw new Error('Something went wrong')

// ✅ AFTER
import { AppError, ErrorCode } from '@inkdown/shared/errors'
throw new AppError(ErrorCode.INTERNAL_ERROR, 'Something went wrong')
```

Choose the appropriate ErrorCode:
- `ErrorCode.VALIDATION_ERROR` - Input validation failures
- `ErrorCode.AI_PROVIDER_ERROR` - AI API issues
- `ErrorCode.FILE_SYSTEM_ERROR` - File operations
- `ErrorCode.NETWORK_ERROR` - HTTP/network issues
- `ErrorCode.AUTH_ERROR` - Authentication/authorization
- `ErrorCode.NOT_FOUND` - Resource not found
- `ErrorCode.INTERNAL_ERROR` - Unexpected internal errors

### If `console.error(...)` is present:

Replace with handleError:

```typescript
// ❌ BEFORE
catch (error) {
  console.error(error)
}

// ✅ AFTER
import { handleError } from '@inkdown/shared/errors'
catch (error) {
  handleError(error, { context: 'operationName' })
}
```

Or use the tryCatch utility:

```typescript
import { tryCatch } from '@inkdown/shared/errors'

const [result, error] = await tryCatch(asyncOperation())
if (error) {
  // error is already handled/logged
  return fallbackValue
}
```

## Exceptions

These patterns are OK:
- In test files (*.test.ts, *.spec.ts)
- In @inkdown/shared/errors.ts (the canonical location)
- When console.error is used WITH handleError for additional context

## Action Required

Before proceeding, modify the code to use the correct error handling patterns.
