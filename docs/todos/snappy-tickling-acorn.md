# Track 5: Infrastructure Hardening — Implementation Plan

## Context

This plan covers 3 targeted fixes for the infrastructure layer, identified during the pre-launch AI system testing (see original testing matrix). These fixes ensure cost tracking is accurate, credit deduction is reliable, and memory doesn't grow unboundedly. All other Track 5 scenarios (INFRA-01, INFRA-03, INFRA-04, INFRA-05) were verified safe during exploration and need no code changes.

**Deployment:** Single Railway instance, 500 users at launch.

---

## Fix 1: Web Search Tool Cost Tracking

**Problem:** Tavily web search costs ~$0.005-0.01 per call but is completely invisible to the credit system. At 500 users this could be $70-135/month of untracked costs.

**Approach:** After a successful Tavily API call, record a synthetic usage event via `tokenTracker.record()` with a fixed cost and zero tokens.

### Files to modify

**`packages/ai/src/providers/usage-persister.ts` (line 32)**

- Current: `if (event.inputTokens === 0 && event.outputTokens === 0) return`
- Change to: `if (event.inputTokens === 0 && event.outputTokens === 0 && event.costCents <= 0) return`
- Reason: Tool call events have zero tokens but non-zero cost. Without this change, they'd be silently skipped.

**`packages/ai/src/tools/web-search.ts` (after line 63, inside the execute callback)**

- After the Tavily `fetch()` succeeds, add:

```typescript
import { tokenTracker } from '../providers/token-tracker'

// Track web search cost (1 cent per search)
const searchDurationMs = Date.now() - startTime // add startTime before fetch
tokenTracker.record({
  model: 'tavily-search',
  provider: 'external',
  taskType: 'tool-call',
  inputTokens: 0,
  outputTokens: 0,
  costCents: 1.0,
  durationMs: searchDurationMs,
  timestamp: Date.now(),
})
```

- Need to add `const startTime = Date.now()` before the fetch call
- The `provider` and `taskType` fields may need type widening — check if `ModelProvider` and `AITaskType` accept these values. If not, add `'external'` to `ModelProvider` and `'tool-call'` to `AITaskType` in `packages/shared/src/types/ai.ts`.

### Type changes needed

**`packages/shared/src/types/ai.ts`**

- Add `'external'` to `AIProvider` type (currently `'openai' | 'anthropic' | 'google' | 'ollama'`)
- Add `'tool-call'` to `AIActionType` type (currently `'chat' | 'complete' | 'embed' | 'agent'`)

---

## Fix 2: Credit Deduction Retry

**Problem:** If `deduct_credits` RPC fails (transient DB timeout), the user gets free service with no retry. Silent `console.error` and move on.

**Approach:** Add a single retry with 500ms delay on the `deduct_credits` RPC call. This covers 99.9% of transient failures without complex reconciliation.

### File to modify

**`packages/ai/src/providers/usage-persister.ts` (lines 57-68)**

Replace the single `deduct_credits` call with a retry wrapper:

```typescript
// 2. Deduct credits if userId present and cost > 0
if (event.userId && event.costCents > 0) {
  let deductError = await tryDeductCredits(supabase, event, usageRow?.id)

  // Retry once on failure (covers transient DB timeouts)
  if (deductError) {
    console.warn('[UsagePersister] deduct_credits failed, retrying in 500ms:', deductError.message)
    await new Promise((r) => setTimeout(r, 500))
    deductError = await tryDeductCredits(supabase, event, usageRow?.id)
    if (deductError) {
      console.error('[UsagePersister] deduct_credits retry failed:', deductError.message)
    }
  }
}
```

Add helper function:

```typescript
async function tryDeductCredits(
  supabase: SupabaseClient,
  event: TokenUsageEvent,
  aiUsageId: string | null
): Promise<{ message: string } | null> {
  const { error } = await supabase.rpc('deduct_credits', {
    p_user_id: event.userId,
    p_amount: event.costCents,
    p_description: `${event.taskType} (${event.model})`,
    p_ai_usage_id: aiUsageId,
  })
  return error
}
```

---

## Fix 3: Token Tracker Memory Cap

**Problem:** The `events[]` array grows unboundedly. At 500 users x 10 req/day x 30 days = 150K events (~30MB). The `getTotalUsage()` method iterates the entire array (O(n)).

**Approach:** Add FIFO eviction when events exceed 10,000 entries.

### File to modify

**`packages/ai/src/providers/token-tracker.ts` (line 70, inside `record()`)**

Before `this.events.push(event)`, add:

```typescript
const MAX_EVENTS = 10_000
if (this.events.length >= MAX_EVENTS) {
  // Evict oldest 20% to avoid frequent shifts
  this.events = this.events.slice(Math.floor(MAX_EVENTS * 0.2))
}
```

This caps memory at ~2MB and prevents O(n) degradation. The 20% batch eviction avoids shifting on every single insert.

---

## Files Summary

| File                                           | Change                                                         |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `packages/ai/src/providers/usage-persister.ts` | Fix skip condition for zero-token events + add deduction retry |
| `packages/ai/src/tools/web-search.ts`          | Add cost tracking after Tavily fetch                           |
| `packages/ai/src/providers/token-tracker.ts`   | Add MAX_EVENTS cap with FIFO eviction                          |
| `packages/shared/src/types/ai.ts`              | Add 'external' to AIProvider, 'tool-call' to AIActionType      |

## Verification

1. **Build + typecheck + tests:** `pnpm build && pnpm typecheck && pnpm test:run`
2. **Web search cost tracking test:**
   ```typescript
   // After a web search tool execution, verify:
   // - ai_usage table has a row with model='tavily-search', cost_cents=1.0
   // - user's balance_cents decreased by 1.0
   ```
3. **Deduction retry test:**
   ```typescript
   // Simulate deduct_credits failure, verify retry fires after 500ms
   // Check console output for "retrying" then "retry failed" or success
   ```
4. **Memory cap test:**
   ```typescript
   // Record 15,000 events, verify events.length <= 10,000
   ```
