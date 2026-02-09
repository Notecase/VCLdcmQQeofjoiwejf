# Fix JWT Expired Error During Course Save

## Context

After course generation completes (outline + approval + content for 4 modules + slides), the final `save_to_supabase` call fails with **"JWT expired"**. The full error chain:

```
[CourseTools] save_to_supabase failed for course ... while persisting 4 modules: Failed to save course: JWT expired
[CourseOrchestrator] agentTask error: Failed to save course: JWT expired
```

Generation succeeds fully (all 4 modules + slides generated), but the course is never persisted to the database because the Supabase JWT baked into the client has expired by the time the save runs (~30-60 minutes after the original HTTP request).

---

## Root Cause

The auth middleware (`apps/api/src/middleware/auth.ts:42-72`) creates a **per-request Supabase client** from the user's JWT:

```typescript
// apps/api/src/lib/supabase.ts:31-47
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,  // JWT baked in once
      },
    },
    auth: {
      autoRefreshToken: false,   // No refresh
      persistSession: false,
    },
  })
}
```

This client is then passed to the orchestrator at creation time:

```typescript
// apps/api/src/routes/course.ts:171-172
const orchestrator = new OrchestratorClass({
  supabase: auth.supabase,  // Static JWT client
  ...
})
```

The orchestrator stores it in `this.config.supabase` and propagates it to `toolContext.supabase` (orchestrator.ts:239), which all tools — including `save_to_supabase` — use for DB operations.

The SSE stream handler (`course.ts:246-444`) also uses `auth.supabase` for deferred DB writes (progress updates, status updates on complete/error) that happen throughout the long generation.

**Timeline**: POST request arrives → JWT captured → generation runs 30-60 min → JWT expires → `save_to_supabase` fails.

---

## Fix

**Use the service-role client** (`getServiceClient()` from `apps/api/src/lib/supabase.ts:10-25`) for all long-running operations. The service client uses `SUPABASE_SERVICE_ROLE_KEY` which never expires.

### Why this is safe

- The user is already authenticated by the auth middleware at request start
- All deferred DB operations use `threadId` or `courseId` that were **verified as belonging to the user** at SSE handler start (line 198-203: `.eq('user_id', auth.userId).single()`)
- These are UUIDs — can't be guessed or collide
- The service client bypasses RLS but the ID-based filtering provides equivalent scoping

### Changes

**File: `apps/api/src/routes/course.ts`**

#### 1. Add import (line 27 area)

```typescript
import { getServiceClient } from '../lib/supabase'
```

#### 2. POST /generate — orchestrator creation (line 172)

```diff
- supabase: auth.supabase,
+ supabase: getServiceClient(),
```

#### 3. GET /stream — orchestrator creation on reconnect (line 220)

```diff
- supabase: auth.supabase,
+ supabase: getServiceClient(),
```

#### 4. GET /stream — all deferred DB writes in SSE handler

After the thread ownership check (after line 232), create a local reference:

```typescript
const serviceDb = getServiceClient()
```

Then replace `auth.supabase` → `serviceDb` for ALL operations inside `streamSSE(c, async (stream) => { ... })`:

| Line | Operation | Current | Change to |
|------|-----------|---------|-----------|
| 292 | progress update | `auth.supabase` | `serviceDb` |
| 310 | interrupt → awaiting_approval | `auth.supabase` | `serviceDb` |
| 328 | complete → thread update | `auth.supabase` | `serviceDb` |
| 333 | complete → course update | `auth.supabase` | `serviceDb` |
| 347 | error → thread update | `auth.supabase` | `serviceDb` |
| 358 | terminal event check query | `auth.supabase` | `serviceDb` |
| 372 | missing terminal → error update | `auth.supabase` | `serviceDb` |
| 429 | outer catch → error update | `auth.supabase` | `serviceDb` |

**Keep `auth.supabase` for** (these are immediate, not at risk):
- Line 198: Thread ownership verification (needs RLS, runs immediately)

**No changes needed in:**
- `packages/ai/src/agents/course/orchestrator.ts` — receives supabase via config, no change needed
- `packages/ai/src/agents/course/tools.ts` — receives supabase as parameter, no change needed
- `packages/ai/src/agents/course/course-tools.ts` — uses `ctx.supabase`, no change needed
- Other HTTP handlers (approve, reject, status, list, etc.) — each gets a fresh token per request

---

## Implementation Order

1. Add `getServiceClient` import to `course.ts`
2. Replace orchestrator `supabase` in both POST /generate and GET /stream
3. Add `const serviceDb = getServiceClient()` in SSE handler
4. Replace 8 `auth.supabase` → `serviceDb` in SSE handler body
5. `pnpm build && pnpm typecheck`

## Verification

1. `pnpm build && pnpm typecheck` — passes
2. Start a course generation end-to-end:
   - Verify outline review works (SSE interrupt + DB update)
   - Approve outline
   - Let content generation complete (all modules + slides)
   - Verify `save_to_supabase` succeeds (no "JWT expired" error)
   - Verify course appears in course list
3. Check server logs: no JWT-related errors at any stage
