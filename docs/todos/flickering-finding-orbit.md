# User Credit System & Usage Tracking

**Created:** 2026-03-19
**Status:** Plan

---

## Context

Inkdown needs a production billing system to distribute free credits to first users and track per-user AI token consumption. The existing codebase has a **60% complete foundation**: an in-memory `TokenTracker` with accurate cost computation, a `MODEL_REGISTRY` with per-model pricing, and an `ai_usage` DB table (migration 005) that was defined but never written to. The missing pieces are: DB persistence, userId attribution, a credit balance system, enforcement middleware, and a usage UI.

**User's requirement:** $15/month plan with $12 actual token budget. Admin can grant free credits to first users. All AI features blocked when credits exhausted. No Stripe yet — just credit infrastructure + admin grant.

**Key decision:** No BYOK bypass. All users consume platform credits regardless of API key setup.

---

## Architecture Overview

```
User sends AI request
  → authMiddleware: extracts userId from JWT
  → creditGuard: checks user_credits.balance_cents > 0
  → If no balance: return 402 { code: 'CREDITS_EXHAUSTED' }
  → If balance OK: wrap in requestContext.run({ userId })
  → Agent executes, tracking wrappers capture tokens
  → tokenTracker.record() fires → onRecord hook triggers:
      1. INSERT INTO ai_usage (persists the usage event)
      2. deduct_credits(userId, costCents) (atomic balance update)
  → Response streamed to user
```

---

## Phase 1: Database Migration

**File:** `supabase/migrations/027_user_credits.sql`

### Tables

**`user_credits`** — One row per user, fast balance lookups:
```sql
CREATE TABLE user_credits (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_cents    NUMERIC(12,4) NOT NULL DEFAULT 0,
  lifetime_granted NUMERIC(12,4) NOT NULL DEFAULT 0,
  lifetime_used    NUMERIC(12,4) NOT NULL DEFAULT 0,
  plan_type        TEXT DEFAULT 'none',        -- 'none', 'trial', 'starter', 'pro'
  plan_expires_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
-- RLS: auth.uid() = user_id
```

**`credit_transactions`** — Append-only audit ledger:
```sql
CREATE TABLE credit_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('grant','deduction','refund','expiry')),
  amount_cents    NUMERIC(12,4) NOT NULL,  -- positive for grant/refund, negative for deduction
  balance_after   NUMERIC(12,4) NOT NULL,
  description     TEXT,
  ai_usage_id     UUID REFERENCES ai_usage(id),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
-- Index: (user_id, created_at DESC)
-- RLS: auth.uid() = user_id (SELECT only, service role writes)
```

### Functions

**`deduct_credits()`** — Atomic deduction with `FOR UPDATE` row lock (prevents concurrent overdraft):
- Locks user's credit row
- Checks balance >= amount
- Updates balance, lifetime_used
- Inserts credit_transaction record
- Returns `(success, new_balance)`

**`grant_credits()`** — Admin grant with upsert:
- Uses `ON CONFLICT (user_id) DO UPDATE` to add to existing balance
- Inserts 'grant' transaction
- Returns new balance

**Existing `ai_usage` table** — Already defined in migration 005. No schema changes needed. Just start writing to it.

**Existing `get_monthly_ai_usage()` / `get_daily_ai_usage()`** — Already defined. Will work once `ai_usage` has rows.

---

## Phase 2: Backend — userId Propagation + DB Persistence

### 2A. Request Context (AsyncLocalStorage)

**New file:** `packages/ai/src/providers/request-context.ts`

Uses Node.js `AsyncLocalStorage` to propagate userId through the call stack without modifying every agent's function signatures. API routes call `requestContext.run({ userId }, callback)` and any downstream code can read `getCurrentUserId()`.

**Why this approach:** There are 35+ call sites where `trackOpenAIStream`, `trackGeminiStream`, etc. are called without userId. Modifying each agent to thread userId through constructors → methods → tracking wrappers would touch 15+ files. AsyncLocalStorage achieves the same result with 1 line per API route.

### 2B. TokenTracker Modification

**Modify:** `packages/ai/src/providers/token-tracker.ts`

Minimal changes:
1. In `record()`: if `event.userId` is missing, fill from `getCurrentUserId()`
2. Add `onRecord?: (event: TokenUsageEvent) => void` callback property
3. Call `this.onRecord?.(event)` after pushing to in-memory array

### 2C. Usage Persister

**New file:** `packages/ai/src/providers/usage-persister.ts`

Exports `initUsagePersister(supabaseClient)` that:
1. Sets `tokenTracker.onRecord` to a function that:
   - INSERTs into `ai_usage` table (finally activating the existing schema)
   - Calls `deduct_credits()` RPC if userId present and costCents > 0
2. Fire-and-forget (don't block the stream on DB write)
3. Graceful error handling (log failures, don't crash the agent)

### 2D. Exports

**Modify:** `packages/ai/src/providers/index.ts` — export new modules
**Modify:** `packages/ai/src/index.ts` — export `requestContext`, `initUsagePersister`

### 2E. API Startup

**Modify:** `apps/api/src/index.ts` (or wherever the Hono app initializes)
- Call `initUsagePersister(getServiceClient())` once at startup

---

## Phase 3: Backend — Credit Guard Middleware

### 3A. Credit Guard

**New file:** `apps/api/src/middleware/credits.ts`

Hono middleware that:
1. Reads `auth.userId` from context
2. Queries `user_credits.balance_cents` for that user
3. If no row or balance <= 0: throw `HTTPException(402)` with `CREDITS_EXHAUSTED` code
4. If plan_expires_at is set and past: same 402

Pattern follows existing `authMiddleware` in `apps/api/src/middleware/auth.ts`.

### 3B. Apply to AI Routes

**Modify these files** — add `creditGuard` after `authMiddleware`, wrap agent calls in `requestContext.run()`:

| Route File | Pattern |
|---|---|
| `apps/api/src/routes/agent.ts` | `agent.use('*', creditGuard)` after line 17 |
| `apps/api/src/routes/secretary.ts` | Same pattern |
| `apps/api/src/routes/research.ts` | Same pattern |
| `apps/api/src/routes/course.ts` | Same pattern |
| `apps/api/src/routes/explain.ts` | Same pattern |
| `apps/api/src/routes/slides.ts` | Same pattern |
| `apps/api/src/routes/orchestration.ts` | Same pattern |
| `apps/api/src/routes/recommend.ts` | Same pattern |
| `apps/api/src/routes/chat.ts` | Same pattern |

**Routes that do NOT get creditGuard** (no AI token consumption):
- `settings.ts`, `context.ts`, `inbox.ts`, `integrations.ts`, `search.ts`, `embed.ts`, `sources.ts`, `cli-auth.ts`, `health.ts`

### 3C. requestContext Wrapping

In each AI route handler, wrap the agent call:
```typescript
import { requestContext } from '@inkdown/ai'

// Inside route handler, before calling agent:
return requestContext.run({ userId: auth.userId }, async () => {
  // ... existing agent call ...
})
```

This is ~1 line change per route handler. All downstream tracking calls automatically get userId.

---

## Phase 4: Backend — Usage & Credit API Endpoints

**Modify:** `apps/api/src/routes/settings.ts`

New endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/settings/credits` | Current balance, plan info, lifetime stats |
| `GET` | `/api/settings/usage` | Monthly usage (calls existing `get_monthly_ai_usage` RPC) |
| `GET` | `/api/settings/usage/daily` | Daily breakdown (calls existing `get_daily_ai_usage` RPC) |
| `GET` | `/api/settings/transactions` | Credit transaction history (paginated, limit 50) |
| `POST` | `/api/settings/credits/grant` | Admin-only: grant credits (service key auth check) |

The admin grant endpoint checks for a hardcoded admin user list via env var `ADMIN_USER_IDS` or validates `role = 'admin'` in user metadata.

---

## Phase 5: Frontend — Pinia Store + 402 Handling

### 5A. Credits Store

**New file:** `apps/web/src/stores/credits.ts`

```typescript
State:
  balance: number           // cents
  lifetimeGranted: number
  lifetimeUsed: number
  planType: string
  planExpiresAt: string | null
  monthlyUsage: MonthlyUsage | null
  dailyUsage: DailyUsageEntry[]
  transactions: CreditTransaction[]

Computed:
  isExhausted: boolean      // balance <= 0
  balanceDollars: string    // formatted "$X.XX"
  usagePercent: number      // lifetimeUsed / lifetimeGranted * 100

Actions:
  fetchCredits()            // GET /api/settings/credits
  fetchUsage()              // GET /api/settings/usage
  fetchDailyUsage()         // GET /api/settings/usage/daily
  fetchTransactions(page)   // GET /api/settings/transactions
```

### 5B. 402 Error Handling

**Modify:** `apps/web/src/services/ai.service.ts` (or `apps/web/src/utils/api.ts`)

In the SSE/fetch error handling, detect `response.status === 402`:
- Set `creditsStore.balance = 0`
- Emit a special error state that the UI can detect
- Don't throw — handle gracefully with a user-visible banner

### 5C. Credit Exhaustion Banners

Add inline banners in AI input areas when `creditsStore.isExhausted`:

| Component | Banner Location |
|---|---|
| `EditorArea.vue` | Above/replacing the AI prompt input |
| `SecretaryView.vue` | In the secretary chat area |
| `CourseGeneratorView.vue` | At the top of the generator |

Message: "You've used all your AI credits. [View Usage →]"

---

## Phase 6: Frontend — Usage UI (Claude-inspired)

### 6A. UsageSection Component

**New file:** `apps/web/src/components/settings/UsageSection.vue`

**Modify:** `apps/web/src/views/SettingsView.vue` — add `<UsageSection />` at the top, above Capture Tokens

### 6B. Design (inspired by Claude's Usage page)

Three sections, minimal boxes, following existing SettingsView CSS patterns:

**Section 1: Credit Balance**
- Plan badge: "Trial Plan" / "No Plan" with subtle border
- Balance display: "$X.XX remaining" in large text + "of $12.00" in secondary
- Progress bar: green (#22c55e) > 30%, amber (#f59e0b) 10-30%, red (#ef4444) < 10%
- Expiry: "Expires Apr 18" in secondary text
- Clean horizontal layout, no card/box wrapper (matches Claude's flat style)

**Section 2: Monthly Usage**
- "This month" header with reset date ("Resets Apr 1")
- Total spent: "$X.XX" prominent
- Breakdown by agent type as simple rows (not cards):
  ```
  Editor        $2.34  ████████░░  47%
  Secretary     $1.12  ████░░░░░░  22%
  Research      $0.89  ███░░░░░░░  18%
  Chat          $0.65  ██░░░░░░░░  13%
  ```
- Inline progress bars with agent type labels

**Section 3: Recent Activity** (collapsible via `<details>`)
- Simple table/list of last 20 transactions
- Columns: Date, Type (grant/deduction), Description, Amount
- Grant rows in green text, deduction rows in secondary text
- No pagination needed for MVP — just last 20

### 6C. Color Palette

- Background: `var(--app-bg)` (existing dark bg)
- Text: `var(--text-color)` / `var(--text-color-secondary)` (existing)
- Progress bars: green → amber → red gradient based on remaining %
- Grant amounts: `#4ade80` (green)
- No deep blue anywhere (per user preference)
- Reuse existing `.btn`, `.btn-primary`, `.btn-ghost` classes from SettingsView

---

## Implementation Order

| Step | Files | What | Dependency |
|------|-------|------|------------|
| 1 | `027_user_credits.sql` | DB migration: tables + functions | None |
| 2 | `request-context.ts` | AsyncLocalStorage userId propagation | None |
| 3 | `token-tracker.ts` (modify) | Add onRecord hook + userId fallback | Step 2 |
| 4 | `usage-persister.ts` | DB persistence bridge | Steps 1, 3 |
| 5 | `providers/index.ts`, `ai/index.ts` | Export new modules | Steps 2, 4 |
| 6 | API startup file | Initialize persister | Step 5 |
| 7 | `credits.ts` middleware | Credit guard (402) | Step 1 |
| 8 | AI route files (9 files) | Apply creditGuard + requestContext.run | Steps 6, 7 |
| 9 | `settings.ts` routes | Usage/credits API endpoints | Step 1 |
| 10 | `credits.ts` store | Pinia store | Step 9 |
| 11 | `ai.service.ts` | 402 error handling | Step 10 |
| 12 | `UsageSection.vue` | Usage UI component | Step 10 |
| 13 | `SettingsView.vue` | Mount UsageSection | Step 12 |
| 14 | AI input areas (3 files) | Credit exhaustion banners | Step 11 |

**Phase checkpoints:**
- After Step 6: Every AI call writes to `ai_usage` + deducts credits. Verify with manual SQL grant.
- After Step 8: AI blocked for users with 0 credits. Verify 402 response.
- After Step 9: Usage data queryable via API. Verify with curl.
- After Step 14: Full end-to-end flow visible in UI.

---

## Files Summary

**New files (6):**
| File | Purpose |
|------|---------|
| `supabase/migrations/027_user_credits.sql` | Credit tables, atomic functions, RLS |
| `packages/ai/src/providers/request-context.ts` | AsyncLocalStorage for userId propagation |
| `packages/ai/src/providers/usage-persister.ts` | TokenTracker → DB + credit deduction bridge |
| `apps/api/src/middleware/credits.ts` | Pre-request credit guard middleware |
| `apps/web/src/stores/credits.ts` | Credits/usage Pinia store |
| `apps/web/src/components/settings/UsageSection.vue` | Usage dashboard UI |

**Modified files (~15):**
| File | Change |
|------|--------|
| `packages/ai/src/providers/token-tracker.ts` | Add `onRecord` hook + userId fallback |
| `packages/ai/src/providers/index.ts` | Export new modules |
| `packages/ai/src/index.ts` | Export `requestContext`, `initUsagePersister` |
| `apps/api/src/index.ts` | Call `initUsagePersister()` at startup |
| `apps/api/src/routes/agent.ts` | creditGuard + requestContext.run |
| `apps/api/src/routes/secretary.ts` | creditGuard + requestContext.run |
| `apps/api/src/routes/research.ts` | creditGuard + requestContext.run |
| `apps/api/src/routes/course.ts` | creditGuard + requestContext.run |
| `apps/api/src/routes/explain.ts` | creditGuard + requestContext.run |
| `apps/api/src/routes/slides.ts` | creditGuard + requestContext.run |
| `apps/api/src/routes/orchestration.ts` | creditGuard + requestContext.run |
| `apps/api/src/routes/recommend.ts` | creditGuard + requestContext.run |
| `apps/api/src/routes/chat.ts` | creditGuard + requestContext.run |
| `apps/api/src/routes/settings.ts` | Add credits/usage endpoints |
| `apps/web/src/views/SettingsView.vue` | Mount UsageSection |
| `apps/web/src/services/ai.service.ts` | 402 detection |
| `apps/web/src/components/editor/EditorArea.vue` | Credit exhaustion banner |

---

## Edge Cases & Production Notes

1. **Concurrent requests:** `FOR UPDATE` row lock in `deduct_credits()` serializes concurrent requests per-user at the Postgres level.
2. **Slight overdraft:** Pre-check is balance > 0, deduction happens post-request. A single expensive call could push balance slightly negative. Acceptable — next request blocked.
3. **Streaming failures:** If stream fails mid-way, tracker still fires with partial token count. If server crashes before `onRecord`, deduction is lost. Acceptable at $12/month scale.
4. **New user with no credits row:** `creditGuard` treats missing row as balance = 0 → 402.
5. **Token counting accuracy:** Uses provider-reported tokens (Gemini `usageMetadata`, OpenAI `usage`). These are exact — no estimation.
6. **Cost precision:** `NUMERIC(12,4)` in DB matches `computeCost()` 3-decimal rounding. Sub-cent accuracy for individual calls.

---

## Verification Plan

1. **Migration:** Run `supabase db push` → verify tables exist via `\dt` in psql
2. **Grant credits:** Run `SELECT grant_credits('test-user-uuid', 1200, 'Test grant')` → verify `user_credits` row
3. **Usage persistence:** Make an AI call → verify row appears in `ai_usage` table
4. **Credit deduction:** After AI call → verify `user_credits.balance_cents` decreased by exact cost
5. **Credit guard:** Set balance to 0 → make AI call → verify 402 response
6. **API endpoints:** `curl /api/settings/credits` → verify JSON response with balance
7. **Frontend:** Navigate to Settings → verify Usage section renders with correct data
8. **Exhaustion banner:** Deplete credits → verify banner appears in editor AI input
