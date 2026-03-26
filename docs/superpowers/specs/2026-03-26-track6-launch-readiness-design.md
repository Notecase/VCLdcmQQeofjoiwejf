# Track 6: Launch Readiness — Design Spec

**Date:** 2026-03-26
**Goal:** Harden the API and frontend for launch (500 users month 1, scaling to 10K)
**Scope:** 8 files modified, 1 new file, ~120 lines total

---

## Context

Tracks 0, 1, 2, 5 are complete. Track 3 (Secretary) is in progress. This track addresses infrastructure gaps that affect ALL agents — graceful shutdown, rate limiting coverage, error handling consistency, frontend resilience, and observability foundations for scale.

**Deployment:** Single Railway instance (API) + Vercel (frontend).

---

## Phase A: Graceful Shutdown (P0)

**Problem:** `serve()` return value is discarded (`index.ts:128`). No SIGTERM/SIGINT handlers exist anywhere in the API. Railway sends SIGTERM on every deploy — active SSE streams die mid-response.

**File:** `apps/api/src/index.ts`

**Change:** Capture server reference from `serve()`, add signal handlers.

```typescript
// Replace line 128-139:
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  /* existing logging */
})

// Add after startServer():
function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received — shutting down gracefully...`)
  server.close(() => {
    console.log('All connections closed. Exiting.')
    process.exit(0)
  })
  // Force exit after 10s if connections don't drain
  setTimeout(() => {
    console.warn('Forced exit after 10s timeout')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
```

**Note:** `server` must be accessible in the `gracefulShutdown` closure. Move it to module scope or restructure `startServer()` to return it.

---

## Phase B: Rate Limiting + Credit Guard on Uncovered Routes (P0)

**Problem:** `search.ts` and `embed.ts` have `authMiddleware` but lack `rateLimitMiddleware`, `creditGuard`, and `requestContextMiddleware`. A user can spam these endpoints without cost tracking or rate limits.

### File: `apps/api/src/routes/search.ts`

**Current imports (lines 1-4):**

```typescript
import { authMiddleware, requireAuth } from '../middleware/auth'
```

**Add imports:**

```typescript
import { creditGuard, requestContextMiddleware } from '../middleware/credits'
import { rateLimitMiddleware } from '../middleware/rate-limit'
```

**Current middleware (line 9):**

```typescript
search.use('*', authMiddleware)
```

**Change to:**

```typescript
search.use('*', authMiddleware)
search.use('*', creditGuard)
search.use('*', requestContextMiddleware)
search.use('*', rateLimitMiddleware())
```

### File: `apps/api/src/routes/embed.ts`

**Same pattern — add identical imports and middleware lines after `embed.use('*', authMiddleware)`.**

---

## Phase C: Replace Raw `throw new Error()` with `handleError()` (P1)

7 instances across 3 files. All follow the pattern: Supabase query error → `throw new Error(error.message)`.

### File: `apps/api/src/routes/search.ts` (2 instances)

**Add import:**

```typescript
import { handleError, ErrorCode } from '@inkdown/shared'
```

**Line 54:** `throw new Error(error.message)` → `throw handleError(error, ErrorCode.INTERNAL)`
**Line 102:** `throw new Error(error.message)` → `throw handleError(error, ErrorCode.INTERNAL)`

### File: `apps/api/src/routes/embed.ts` (4 instances)

**Add import:**

```typescript
import { handleError, ErrorCode } from '@inkdown/shared'
```

**Line 88:** `throw new Error(queueError.message)` → `throw handleError(queueError, ErrorCode.INTERNAL)`
**Line 125:** `throw new Error(embeddingsError.message)` → `throw handleError(embeddingsError, ErrorCode.INTERNAL)`
**Line 167:** `throw new Error(error.message)` → `throw handleError(error, ErrorCode.INTERNAL)`
**Line 208:** `throw new Error(error.message)` → `throw handleError(error, ErrorCode.INTERNAL)`

### File: `apps/api/src/routes/agent.ts` (1 instance)

**Add import (agent.ts currently has NO handleError import):**

```typescript
import { handleError, ErrorCode } from '@inkdown/shared'
```

**Line 822:** `throw new Error(error.message)` → `throw handleError(error, ErrorCode.INTERNAL)`

---

## Phase D: Frontend Global Error Handler (P1)

**Problem:** No global error handling in the Vue app. Unhandled promise rejections and JS errors show nothing to the user. `App.vue` has `NotificationToast` mounted but nothing triggers it on errors.

**File:** `apps/web/src/main.ts`

**After line 151 (`app.use(ElementPlus)`) and before `initApp()`, add:**

```typescript
// Global Vue error handler — catches errors in component lifecycle
app.config.errorHandler = (err, _instance, info) => {
  console.error(`[Vue Error] ${info}:`, err)
  // Lazy-import notification store to avoid circular deps during init
  import('./stores')
    .then(({ useNotificationsStore }) => {
      const notifications = useNotificationsStore()
      notifications.error(err instanceof Error ? err.message : 'An unexpected error occurred')
    })
    .catch(() => {})
}

// Catch unhandled promise rejections (async errors outside Vue)
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Rejection]', event.reason)
  // Don't show toast for network errors (handled by individual services)
  if (event.reason?.name === 'TypeError' && event.reason?.message?.includes('fetch')) return
  import('./stores')
    .then(({ useNotificationsStore }) => {
      const notifications = useNotificationsStore()
      notifications.error('Something went wrong. Please try again.')
    })
    .catch(() => {})
})
```

**Verification:** `useNotificationsStore` is already exported from `apps/web/src/stores/index.ts` — confirmed by the fact that `NotificationToast.vue` uses it.

---

## Phase E: AppError Integration in Error Middleware (P1)

**Problem:** `middleware/error.ts` doesn't recognize `AppError`. All `handleError()` calls produce `AppError` instances that fall through to the generic 500 handler, losing the structured error code and user message.

**File:** `apps/api/src/middleware/error.ts`

**Add import:**

```typescript
import { isAppError, ErrorCode } from '@inkdown/shared'
```

**Add as FIRST check in `errorHandler()`, before HTTPException check (line 23):**

```typescript
// Handle AppError (from handleError() calls throughout the codebase)
if (isAppError(err)) {
  const status = appErrorStatusMap[err.code] ?? 500
  return c.json(
    {
      error: {
        message: err.userMessage,
        code: err.code,
        details: config.isDev ? err.context : undefined,
      },
    } satisfies ErrorResponse,
    status
  )
}
```

**Add status map before the function:**

```typescript
const appErrorStatusMap: Record<string, number> = {
  [ErrorCode.AUTH_REQUIRED]: 401,
  [ErrorCode.AUTH_EXPIRED]: 401,
  [ErrorCode.AUTH_INVALID]: 401,
  [ErrorCode.VALIDATION_FAILED]: 400,
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.DB_NOT_FOUND]: 404,
  [ErrorCode.DB_DUPLICATE]: 409,
  [ErrorCode.AI_PROVIDER_ERROR]: 502,
  [ErrorCode.AI_RATE_LIMIT]: 429,
  [ErrorCode.NETWORK_ERROR]: 502,
  [ErrorCode.TIMEOUT]: 504,
  [ErrorCode.INTERNAL]: 500,
  [ErrorCode.UNKNOWN]: 500,
}
```

---

## Phase F: Structured Logger + Request ID Middleware (P2)

**Problem:** At 10K users, console.log is a firehose. No way to trace a request through logs. Secretary.ts already generates requestId per-request but other routes don't.

### New File: `apps/api/src/middleware/request-id.ts` (~15 lines)

```typescript
import type { Context, Next } from 'hono'
import { randomUUID } from 'node:crypto'

/**
 * Generates a unique request ID and stores it in Hono context.
 * Also sets X-Request-Id response header for client correlation.
 */
export async function requestIdMiddleware(c: Context, next: Next) {
  const id = randomUUID()
  c.set('requestId', id)
  c.header('X-Request-Id', id)
  await next()
}
```

### New File: `apps/api/src/lib/logger.ts` (~25 lines)

```typescript
import type { Context } from 'hono'

type LogLevel = 'info' | 'warn' | 'error'

interface LogEntry {
  ts: string
  level: LogLevel
  msg: string
  requestId?: string
  userId?: string
  [key: string]: unknown
}

/**
 * Structured JSON logger.
 * Writes one JSON line per log event to stdout/stderr.
 */
export function log(level: LogLevel, msg: string, ctx?: Context, extra?: Record<string, unknown>) {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    msg,
    requestId: ctx?.get('requestId'),
    userId: (ctx?.get('auth') as { userId?: string } | undefined)?.userId,
    ...extra,
  }
  const line = JSON.stringify(entry)
  if (level === 'error') {
    process.stderr.write(line + '\n')
  } else {
    process.stdout.write(line + '\n')
  }
}
```

### Wire into `apps/api/src/index.ts`

Add `requestIdMiddleware` to global middleware chain (before routes):

```typescript
import { requestIdMiddleware } from './middleware/request-id'

// After secureHeaders, before logger:
app.use('*', requestIdMiddleware)
```

**Note:** We do NOT replace existing console.logs in this phase. The logger and requestId middleware are foundation — routes can adopt `log()` incrementally. Phase F just adds the infrastructure.

---

## Files Summary

| File                                    | Phase | Change                                                           |
| --------------------------------------- | ----- | ---------------------------------------------------------------- |
| `apps/api/src/index.ts`                 | A, F  | Capture server ref, add SIGTERM/SIGINT, add requestId middleware |
| `apps/api/src/routes/search.ts`         | B, C  | Add creditGuard + rateLimiting + replace 2 raw errors            |
| `apps/api/src/routes/embed.ts`          | B, C  | Add creditGuard + rateLimiting + replace 4 raw errors            |
| `apps/api/src/routes/agent.ts`          | C     | Add handleError import + replace 1 raw error                     |
| `apps/api/src/middleware/error.ts`      | E     | Add AppError handler with status map                             |
| `apps/web/src/main.ts`                  | D     | Add Vue errorHandler + unhandledrejection listener               |
| `apps/api/src/middleware/request-id.ts` | F     | **New** — request ID middleware                                  |
| `apps/api/src/lib/logger.ts`            | F     | **New** — structured JSON logger                                 |

## Known Single-Instance Limitations (document, don't fix)

These work at 500 users but need Redis for multi-instance at 10K+:

- In-memory rate limiter (`middleware/rate-limit.ts`)
- In-memory concurrent request counter (`middleware/credits.ts`)
- In-memory agent interrupt registry (`routes/research.ts`)

## Verification

After all phases:

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test:run
```

Then deploy to Railway and verify:

1. `GET /health` returns 200
2. Kill the Railway instance — logs show "SIGTERM received — shutting down gracefully"
3. Hit `/api/search/semantic` without auth → 401 (existing)
4. Hit `/api/search/semantic` with expired credits → 402 (new: creditGuard)
5. Trigger a Vue component error → toast notification appears
6. Check Railway logs → JSON-structured lines with requestId
