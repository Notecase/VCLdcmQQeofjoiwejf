# Plan Automation Engine — Phases B1 + B2

Phase A (execution pipeline) is complete and working. This plan covers:

- **B1**: Streaming progress during "Run now" (inline in schedule card)
- **B2**: API cron endpoint for unattended automated execution

Phase A: Execution Pipeline (COMPLETED)

## Context

The plan dashboard has Repeats (scheduled automations) UI and a heartbeat that creates pending missions — but **nothing actually executes them**. The note pack adapter uses simple `generateText` without tools. We need a full execution pipeline: schedule fires → layered context → ToolLoopAgent with tools → note saved to plan project.

Inspired by Cowork's pattern: one trigger, one context assembly, one agent run, one output.

## Current State (what exists)

| Layer                                   | Status           | Location                                                          |
| --------------------------------------- | ---------------- | ----------------------------------------------------------------- |
| Schedule CRUD (UI + API + DB)           | Working          | `PlanSchedule.vue`, `secretary.ts` routes, `plan_schedules` table |
| Heartbeat checks due schedules          | Working          | `supabase/functions/heartbeat/checks.ts:225`                      |
| Heartbeat creates pending missions      | Working          | `supabase/functions/heartbeat/actions.ts:697`                     |
| Mission orchestrator (4-stage pipeline) | Working          | `packages/ai/src/services/mission-orchestrator.ts`                |
| Note pack adapter (simple generateText) | Working but weak | `packages/ai/src/services/mission-adapters.ts:273`                |
| Per-schedule "Run now" button           | Missing          | —                                                                 |
| Agent execution when heartbeat fires    | Missing          | —                                                                 |
| ToolLoopAgent with web search/tables    | Missing          | —                                                                 |
| Layered context assembly                | Missing          | —                                                                 |

## Architecture

### Execution flow (Cowork pattern)

```
Schedule fires (heartbeat or "Run now" click)
  │
  ▼
POST /api/secretary/plan/:planId/schedules/:scheduleId/run
  │
  ├─ Load PlanWorkspaceState (plan + instructions + roadmap + recent notes)
  ├─ Assemble layered context:
  │    Layer 1: Agent identity + capabilities
  │    Layer 2: Plan instructions (from Instructions box)
  │    Layer 3: Roadmap position (phase, lesson, topic)
  │    Layer 4: Previous 2-3 generated note titles (continuity)
  │    Layer 5: Schedule task prompt (from schedule.instructions)
  │
  ▼
AutomationAgent (ToolLoopAgent)
  ├─ tools: web_search, save_note, advance_progress
  ├─ Reasons about what to generate
  ├─ Uses web_search if needed
  ├─ Generates content with tables, code, math, etc.
  ├─ Calls save_note → inserts into Supabase notes table
  ├─ Calls advance_progress → increments completedLessons
  │
  ▼
Update schedule state (lastRunAt, nextRunAt, runCount, lastRunStatus)
Return { noteId, title }
```

### Why NOT use the mission system for this

The 4-stage mission pipeline (research → course → daily_plan → note_pack) is designed for complex multi-step workflows with approvals. For scheduled automation, we want: one trigger → one agent → one note. Using missions adds 4 stages of overhead and doesn't align with the Cowork "single context window" pattern. We can add mission integration later if needed.

## Files to Create

### 1. `packages/ai/src/agents/automation/agent.ts` — AutomationAgent

ToolLoopAgent that generates plan content with tools.

```typescript
import { ToolLoopAgent, stepCountIs } from 'ai'

interface AutomationInput {
  systemPrompt: string // Assembled layers 1-4
  taskPrompt: string // Layer 5 (schedule instructions)
  planId: string
  projectId?: string
  supabase: SupabaseClient
  userId: string
  currentLesson: number
}

interface AutomationResult {
  noteId: string
  title: string
  advancedProgress: boolean
}
```

- Model: reuse `resolveModelsForTask('automation')` — falls back to existing model routing
- Tools: `web_search`, `save_note`, `advance_progress` (see tools.ts)
- `stopWhen: stepCountIs(12)` — enough steps for research + generation
- Non-streaming (`agent.generate()`) — background execution

### 2. `packages/ai/src/agents/automation/tools.ts` — Automation tools

Three tools:

**`web_search`** — Reuse `createWebSearchTool()` from `packages/ai/src/tools/web-search.ts`

**`save_note`** — Creates a note in the plan's linked project

```typescript
inputSchema: z.object({
  title: z.string().describe('Note title, format: "Mar 28 — Lesson 25: Topic Name"'),
  content: z.string().describe('Full markdown content'),
})
execute: async ({ title, content }) => {
  // Insert into Supabase notes table with projectId from context
  // Return noteId
}
```

**`advance_progress`** — Increments completedLessons in Plan.md

```typescript
inputSchema: z.object({
  lessonNumber: z.number().describe('The lesson number just completed'),
})
execute: async ({ lessonNumber }) => {
  // Call MemoryService.incrementPlanProgress(planId)
  // Return confirmation
}
```

### 3. `packages/ai/src/agents/automation/context.ts` — Context assembly

Builds the 5-layer system prompt:

```typescript
export function buildAutomationContext(input: {
  plan: LearningRoadmap
  instructions: string
  roadmapContent: string
  previousNotes: Array<{ title: string; updatedAt: string }>
  scheduleTitle: string
  scheduleInstructions?: string
}): { systemPrompt: string; taskPrompt: string }
```

**Layer 1 (identity):**

```
You are an autonomous learning content generator for Inkdown.
You create comprehensive study notes with research, code examples, tables, and exercises.
You have tools: web_search (research), save_note (create notes), advance_progress (track completion).
Always call save_note exactly once with the final note content. Then call advance_progress.
```

**Layer 2 (instructions):** User's instructions from the Instructions box (verbatim)

**Layer 3 (roadmap position):**

```
Plan: {plan.name}
Phase: {active phase name} (Lessons {start}-{end})
Current lesson: {completedLessons + 1} of {totalLessons}
Topic: {plan.currentTopic}
Schedule: {plan.schedule.studyDays} · {plan.schedule.hoursPerDay}h/day
```

**Layer 4 (continuity):**

```
Previously generated notes:
- Mar 27: Lesson 24 — Logistic Regression
- Mar 26: Lesson 23 — Linear Regression
Build on what came before. Reference earlier concepts where relevant.
```

**Layer 5 (task — becomes user message):**

```
{schedule.title}: {schedule.instructions}
```

If no schedule instructions, default: "Generate today's lesson for the current topic."

### 4. `packages/ai/src/agents/automation/index.ts` — Barrel export

```typescript
export { runAutomation } from './agent'
export type { AutomationInput, AutomationResult } from './agent'
```

## Files to Modify

### 5. `apps/api/src/routes/secretary.ts` — New execution endpoint

Rewrite `POST /plan/:planId/run` (currently dead code at line 1007) to:

**`POST /plan/:planId/schedules/:scheduleId/run`** — Run a specific schedule now

```typescript
// 1. Load plan workspace (plan, instructions, roadmap, recent notes)
// 2. Load schedule by ID
// 3. Assemble context via buildAutomationContext()
// 4. Run AutomationAgent
// 5. Update schedule: lastRunAt, nextRunAt, runCount++, lastRunStatus
// 6. Return { noteId, title, status: 'success' }
```

Also keep a simpler `POST /plan/:planId/run` for running without a schedule (from PlanHeader ▶ button) — uses plan defaults.

### 6. `apps/web/src/components/secretary/plan/PlanSchedule.vue`

Add "Run now" (▶) button per schedule card.

- New emit: `run: [scheduleId: string]`
- Button in card-header row, next to the toggle switch
- Loading state: show spinner while running
- Play icon from lucide-vue-next

### 7. `apps/web/src/views/PlanWorkspaceView.vue`

Wire up `@run` event from PlanSchedule:

```typescript
async function handleRunSchedule(scheduleId: string) {
  await store.runScheduleNow(planId.value, scheduleId)
}
```

### 8. `apps/web/src/stores/secretary.ts`

New `runScheduleNow` method:

```typescript
async function runScheduleNow(planId: string, scheduleId: string) {
  try {
    const res = await authFetch(`/api/secretary/plan/${planId}/schedules/${scheduleId}/run`, {
      method: 'POST',
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    notifications.success(`Note created: ${data.title}`)
    // Reload workspace to show new note in artifacts
    await loadPlanWorkspace(planId)
  } catch (err) {
    notifications.error(err instanceof Error ? err.message : 'Automation failed')
  }
}
```

### 9. `packages/ai/src/agents/index.ts` — Export automation agent

Add to barrel exports.

## Reused code

| What                      | From                                               | How                                 |
| ------------------------- | -------------------------------------------------- | ----------------------------------- |
| `createWebSearchTool()`   | `packages/ai/src/tools/web-search.ts`              | Direct import                       |
| `resolveModelsForTask()`  | `packages/ai/src/providers/ai-sdk-factory.ts`      | For model selection                 |
| `MemoryService`           | `packages/ai/src/agents/secretary/memory.ts`       | Read plan files, increment progress |
| `parsePlanMarkdown()`     | `packages/shared/src/secretary/markdown-parser.ts` | Parse plan state                    |
| `buildSystemPrompt()`     | `packages/ai/src/safety/content-policy.ts`         | Wrap system prompt                  |
| `trackAISDKUsage()`       | `packages/ai/src/providers/ai-sdk-usage.ts`        | Cost tracking                       |
| `PlanScheduleItem` type   | `packages/shared/src/types/secretary.ts`           | Schedule data                       |
| `PlanWorkspaceState` type | `packages/shared/src/types/secretary.ts`           | Workspace data                      |

## Note title format

`Mar 28 — Lesson 25: Gradient Descent`

The agent is instructed to use this format in Layer 1. The date comes from `new Date()`, lesson number from `completedLessons + 1`, topic from the roadmap.

## Progress auto-advance

After generating a note, the agent calls `advance_progress` tool which calls `MemoryService.incrementPlanProgress(planId)`. This bumps `completedLessons` by 1 in Plan.md. There's no manual UI for this — the automation handles it.

## Verification

1. `pnpm typecheck && pnpm build` — all packages compile
2. Create a test schedule in the Repeats UI
3. Click ▶ "Run now" on the schedule
4. Verify: note appears in plan's project Notes section
5. Verify: schedule shows updated run count and last run time
6. Verify: plan progress increments by 1
7. Verify: note title follows "Mar 28 — Lesson 25: Topic" format
8. Verify: note content respects plan instructions (style, depth, etc.)
9. Verify: web_search is called when the prompt requires research

---

# Phase B1: Streaming Progress (Inline in Schedule Card)

## Context

"Run now" currently fires-and-forgets with a single toast on completion. The user can't see what the agent is doing during the 30-60 second run. We need SSE streaming so progress steps appear inline in the schedule card.

## Architecture

```
POST /plan/:planId/schedules/:scheduleId/run
  │
  ▼ SSE stream
streamAutomation() — async generator yielding events:
  │
  ├─ { type: 'status', data: { step: 'Assembling context...' } }
  ├─ { type: 'status', data: { step: 'Running automation agent...' } }
  ├─ { type: 'tool-call', data: { name: 'web_search', args: { query: '...' } } }
  ├─ { type: 'tool-result', data: { name: 'web_search', summary: '8 results' } }
  ├─ { type: 'tool-call', data: { name: 'save_note', args: { title: '...' } } }
  ├─ { type: 'tool-result', data: { name: 'save_note', summary: 'Saved' } }
  ├─ { type: 'tool-call', data: { name: 'advance_progress' } }
  └─ { type: 'done', data: { noteId, title, advancedProgress } }
      or { type: 'error', data: { message } }
```

## Files to modify

### 1. `packages/ai/src/agents/automation/agent.ts`

Add `streamAutomation()` — async generator version of `runAutomation()`.

Key difference: uses `agent.stream()` instead of `agent.generate()`, iterates `result.fullStream`, yields progress events.

```typescript
export type AutomationEvent =
  | { type: 'status'; data: { step: string } }
  | { type: 'tool-call'; data: { name: string; query?: string } }
  | { type: 'tool-result'; data: { name: string; summary: string } }
  | { type: 'done'; data: AutomationResult }
  | { type: 'error'; data: { message: string } }

export async function* streamAutomation(input: AutomationInput): AsyncGenerator<AutomationEvent> {
  yield { type: 'status', data: { step: 'Assembling context...' } }
  // ... build context, tools ...
  yield { type: 'status', data: { step: 'Running automation agent...' } }

  const result = await agent.stream({ messages: [...] })

  for await (const part of result.fullStream) {
    if (part.type === 'tool-call') {
      yield { type: 'tool-call', data: { name: part.toolName, query: part.args?.query } }
    } else if (part.type === 'tool-result') {
      yield { type: 'tool-result', data: { name: part.toolName, summary: truncate(part.result) } }
    }
  }

  yield { type: 'done', data: { noteId: toolResult.noteId, ... } }
}
```

Keep `runAutomation()` for Phase B2 (cron runs don't need streaming).

### 2. `apps/api/src/routes/secretary.ts`

Convert `POST /plan/:planId/schedules/:id/run` to SSE streaming:

```typescript
import { streamSSE } from 'hono/streaming'

secretary.post('/plan/:planId/schedules/:id/run', async (c) => {
  // ... load schedule, plan, context (same as before) ...

  return streamSSE(c, async (stream) => {
    const { streamAutomation } = await import('@inkdown/ai/agents')

    for await (const event of streamAutomation(input)) {
      await stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event.data),
      })
    }

    // Update schedule state after stream completes
    await updateScheduleState(...)
  })
})
```

### 3. `apps/web/src/stores/secretary.ts`

Change `runScheduleNow()` from `authFetch` to `authFetchSSE` + `parseSSEStream`:

```typescript
async function runScheduleNow(planId: string, scheduleId: string) {
  runningScheduleSteps.value = []
  runningScheduleId.value = scheduleId

  const res = await authFetchSSE(
    `${API_URL}/api/secretary/plan/${planId}/schedules/${scheduleId}/run`,
    {
      method: 'POST',
    }
  )

  await parseSSEStream(res, {
    onEvent: (sseEvent) => {
      const eventType = sseEvent.event || sseEvent.data?.type
      const data = sseEvent.data

      switch (eventType) {
        case 'status':
          addRunStep(data.step, 'active')
          break
        case 'tool-call':
          addRunStep(
            `${friendlyToolName(data.name)}${data.query ? `: "${data.query}"` : ''}`,
            'active'
          )
          break
        case 'tool-result':
          markLastStepDone()
          break
        case 'done':
          notifications.success(`Note created: ${data.title}`)
          break
        case 'error':
          notifications.error(data.message)
          break
      }
    },
  })

  runningScheduleId.value = null
  runningScheduleSteps.value = []
  await loadPlanWorkspace(planId)
}
```

New reactive state:

```typescript
const runningScheduleId = ref<string | null>(null)
const runningScheduleSteps = ref<Array<{ text: string; status: 'active' | 'done' }>>([])
```

### 4. `apps/web/src/components/secretary/plan/PlanSchedule.vue`

Add inline progress area below the card when running:

```html
<!-- Inline progress (during run) -->
<div v-if="runningId === schedule.id && steps.length" class="run-progress">
  <div v-for="(step, i) in steps" :key="i" class="progress-step" :class="step.status">
    <span class="step-icon">{{ step.status === 'done' ? '✓' : '●' }}</span>
    <span class="step-text">{{ step.text }}</span>
  </div>
</div>
```

Props: receive `runningSteps` and `runningScheduleId` from parent.

CSS: `.run-progress` with compact vertical list, `.step-done` dimmed green ✓, `.step-active` pulsing accent ●.

### 5. `apps/web/src/views/PlanWorkspaceView.vue`

Pass streaming state to PlanSchedule:

```html
<PlanSchedule
  :running-schedule-id="store.runningScheduleId"
  :running-steps="store.runningScheduleSteps"
  ...
/>
```

## Reused patterns

- `streamSSE` from `hono/streaming` (same as secretary chat, EditorDeep)
- `parseSSEStream` from `apps/web/src/utils/sse-parser.ts`
- `authFetchSSE` from `apps/web/src/utils/api.ts`
- `agent.stream()` from AI SDK v6 (same as EditorDeep uses `agent.stream()`)

---

# Phase B2: API Cron Endpoint (Unattended Execution)

## Context

Schedules have `next_run_at` timestamps but nothing executes them automatically. The heartbeat creates dead missions. We add a Railway cron that calls our API every 5 minutes to process due schedules.

## Architecture

```
Railway Cron (every 5 min)
  │
  ▼
GET /api/cron/automations
  ├─ Verify CRON_SECRET header
  ├─ Create Supabase service-role client (bypasses RLS)
  ├─ Query plan_schedules: enabled=true AND next_run_at <= now()
  ├─ LIMIT 3 (prevent timeout — each run takes ~30-60s)
  │
  ├─ For each due schedule:
  │  ├─ Load plan workspace (plan, instructions, roadmap, recent notes)
  │  ├─ runAutomation(input) (non-streaming)
  │  └─ Update schedule state (lastRunAt, nextRunAt, runCount, status)
  │
  └─ Return { processed: N, results: [...] }
```

## Files to modify

### 1. `apps/api/src/routes/secretary.ts` — New cron endpoint

```typescript
secretary.get('/cron/automations', async (c) => {
  // 1. Auth: verify CRON_SECRET
  const secret = c.req.header('x-cron-secret') || c.req.query('secret')
  if (secret !== process.env.CRON_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // 2. Service-role Supabase client (bypasses RLS for cross-user queries)
  const { createClient } = await import('@supabase/supabase-js')
  const adminSupabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 3. Query all due schedules (max 3 per run)
  const now = new Date().toISOString()
  const { data: dueSchedules } = await adminSupabase
    .from('plan_schedules')
    .select('*')
    .eq('enabled', true)
    .lte('next_run_at', now)
    .order('next_run_at', { ascending: true })
    .limit(3)

  if (!dueSchedules?.length) {
    return c.json({ processed: 0 })
  }

  // 4. Process each schedule
  const results = []
  for (const schedule of dueSchedules) {
    try {
      // Load plan + context using service client
      // ... (same context assembly as Run Now endpoint)

      const { runAutomation } = await import('@inkdown/ai/agents')
      const result = await runAutomation({ ...input, supabase: adminSupabase })

      // Update schedule state + compute next_run_at
      // ...

      results.push({ scheduleId: schedule.id, status: 'success', noteTitle: result.noteTitle })
    } catch (err) {
      // Mark schedule as errored, continue to next
      results.push({ scheduleId: schedule.id, status: 'error', message: err.message })
    }
  }

  return c.json({ processed: results.length, results })
})
```

### 2. Environment variables

Add to `.env`:

```
CRON_SECRET=<random-secret>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

The service role key is needed to query/write across users. Already used by the heartbeat edge function.

### 3. Railway cron configuration

In Railway dashboard → project → service → Settings → Cron:

```
*/5 * * * *  GET https://api.noteshell.io/api/secretary/cron/automations
Header: x-cron-secret: <CRON_SECRET>
```

### 4. `computeNextRunAt` utility

Extract from `supabase/functions/heartbeat/actions.ts:806-845` into a shared utility in `packages/shared/src/secretary/schedule-utils.ts`. Both the cron endpoint and the "Run now" endpoint need it.

## Edge cases handled

| Scenario                        | Handling                                                        |
| ------------------------------- | --------------------------------------------------------------- |
| Concurrent cron invocations     | LIMIT 3 + `next_run_at` immediately updated to prevent re-pick  |
| Schedule with no linked project | Note created without project_id (still works)                   |
| LLM rate limit                  | `isTransientError` → fallback model → error status if both fail |
| Cron timeout (5 min budget)     | LIMIT 3 schedules × ~60s each = ~3 min max                      |
| Missing TAVILY_API_KEY          | Agent skips web search, generates from knowledge                |
| User deleted plan               | Plan not found → schedule marked as error                       |

## Verification

### B1 (Streaming):

1. Click ▶ on a schedule
2. See inline progress: "Assembling context..." → "Web search: ..." → "Saving note..." → "✓ Note created"
3. Schedule card shows updated run count after completion
4. Error case: disconnect mid-stream → schedule card resets, no crash

### B2 (Cron):

1. Create a schedule with daily frequency
2. Manually set `next_run_at` to past via Supabase SQL
3. `curl -H "x-cron-secret: ..." http://localhost:3001/api/secretary/cron/automations`
4. Verify: note created, schedule state updated, `next_run_at` advanced
5. Run again → should find nothing due (0 processed)

## Out of scope (Phase C)

- Secretary conversational flow for setting up instructions + automations
- Adaptive content based on engagement metrics
- Per-user spending caps for cron runs
- BYOK (bring your own key) per user
