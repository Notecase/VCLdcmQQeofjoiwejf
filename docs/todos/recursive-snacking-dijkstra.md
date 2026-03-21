# Noteshell AI System Redesign — Executable Implementation Plan

**Date:** 2026-03-18
**Status:** Ready for Implementation
**Scope:** Phases 1-6 (Model Routing → Token Tracking → BaseAgent → Guardrails → Billing Infra → Prompts)
**Deferred:** Stripe integration (no keys yet), Quality testing (Phase 7), Launch prep (Phase 8)

---

## Context

All 10 AI agents hardcode `gemini-3.1-pro-preview` ($2/$12 per 1M tokens) regardless of task complexity. No cost tracking (token counts always 0), no user tiers, no credit system. Two SDK patterns exist — both call Google AI via different SDKs:

- **Pattern A (6 agents):** OpenAI SDK → `generativelanguage.googleapis.com/v1beta/openai/` (Chat, Note, Editor, Planner, Deep, Explain)
- **Pattern B (4 agents):** `@langchain/google-genai` via deepagents (Secretary, Research, EditorDeep, Course)

Both patterns accept the same model name strings (e.g., `gemini-2.5-flash`). The model SELECTION can be unified even though model INVOCATION differs.

**Goal:** Unified model selection, 60-80% cost savings, token tracking, credit system, guardrails.

---

## Phase 1: Model Routing & Types

### 1.1 New Types — `packages/shared/src/types/ai.ts`

Add to existing file:

```typescript
export type UserTier = 'free' | 'pro' | 'team'
export type TaskComplexity = 'simple' | 'moderate' | 'complex'

export interface ModelSelection {
  provider: 'google' | 'ollama' | 'openai'
  model: string
  inputCostPer1M: number // USD
  outputCostPer1M: number // USD
}

export interface ModelPricing {
  model: string
  inputCostPer1M: number
  outputCostPer1M: number
}
```

Export from `packages/shared/src/types/index.ts`.

### 1.2 Model Routing — `packages/ai/src/providers/factory.ts`

Add `selectModel()` function and `MODEL_PRICING` constant map:

```typescript
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'gemma-3-27b-it': { model: 'gemma-3-27b-it', inputCostPer1M: 0.1, outputCostPer1M: 0.3 },
  'gemini-2.5-flash-lite-preview-06-17': {
    model: 'gemini-2.5-flash-lite-preview-06-17',
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
  },
  'gemini-2.5-flash': { model: 'gemini-2.5-flash', inputCostPer1M: 0.3, outputCostPer1M: 2.5 },
  'gemini-2.5-pro': { model: 'gemini-2.5-pro', inputCostPer1M: 1.25, outputCostPer1M: 10.0 },
  'gemini-3.1-pro-preview': {
    model: 'gemini-3.1-pro-preview',
    inputCostPer1M: 2.0,
    outputCostPer1M: 12.0,
  },
  'kimi-k2.5': { model: 'kimi-k2.5', inputCostPer1M: 0, outputCostPer1M: 0 },
  'deep-research-pro-preview-12-2025': {
    model: 'deep-research-pro-preview-12-2025',
    inputCostPer1M: 2.0,
    outputCostPer1M: 8.0,
  },
}

export function selectModel(
  taskType: AITaskType,
  userTier: UserTier,
  complexity?: TaskComplexity
): ModelSelection {
  // Artifacts/code: always kimi-k2.5
  if (['artifact', 'code', 'html', 'css', 'javascript'].includes(taskType))
    return { provider: 'ollama', model: 'kimi-k2.5', ...MODEL_PRICING['kimi-k2.5'] }

  // Embeddings: always OpenAI
  if (taskType === 'embedding')
    return {
      provider: 'openai',
      model: 'text-embedding-3-large',
      inputCostPer1M: 0.13,
      outputCostPer1M: 0,
    }

  // Deep research: keep current model
  if (taskType === 'deep-research')
    return {
      provider: 'google',
      model: 'deep-research-pro-preview-12-2025',
      ...MODEL_PRICING['deep-research-pro-preview-12-2025'],
    }

  // Free tier → Gemma 3 27B for everything
  if (userTier === 'free')
    return { provider: 'google', model: 'gemma-3-27b-it', ...MODEL_PRICING['gemma-3-27b-it'] }

  // Paid tiers → route by complexity
  const effectiveComplexity = complexity ?? getDefaultComplexity(taskType)
  if (effectiveComplexity === 'complex')
    return { provider: 'google', model: 'gemini-2.5-pro', ...MODEL_PRICING['gemini-2.5-pro'] }

  return { provider: 'google', model: 'gemini-2.5-flash', ...MODEL_PRICING['gemini-2.5-flash'] }
}

function getDefaultComplexity(taskType: AITaskType): TaskComplexity {
  switch (taskType) {
    case 'chat':
    case 'completion':
    case 'summarize':
    case 'secretary':
    case 'planner':
      return 'simple'
    case 'note-agent':
    case 'rewrite':
      return 'moderate'
    case 'research':
    case 'course':
    case 'slides':
      return 'complex'
    default:
      return 'simple'
  }
}
```

Keep existing `createProvider()` working (backward compat). Update `getModelNameForTask()` to use `selectModel()` internally with `userTier: 'pro'` as default (preserves current behavior).

### 1.3 User Tier Lookup — `packages/ai/src/services/user-tier.ts` (NEW)

```typescript
export async function getUserTier(supabase: SupabaseClient, userId: string): Promise<UserTier> {
  const { data } = await supabase
    .from('credit_balances')
    .select('tier')
    .eq('user_id', userId)
    .single()
  return (data?.tier as UserTier) ?? 'free'
}
```

Falls back to `'free'` if table doesn't exist yet (Phase 2 creates it).

### 1.4 Update All Agent Constructors

Every agent config interface already has `model?: string`. The change is in the **routes** — they call `selectModel()` and pass the result:

**`apps/api/src/routes/agent.ts`** — Main entry point (6 agents created here):

```typescript
// At top of each route handler, after requireAuth:
const userTier = await getUserTier(auth.supabase, auth.userId)
const modelSelection = selectModel('chat', userTier) // or 'note-agent', etc.

// Pass to agent:
const chatAgent = new ChatAgent({
  supabase: auth.supabase,
  userId: auth.userId,
  openaiApiKey,
  model: modelSelection.model, // ← NEW
  sharedContextService,
})
```

**Agents to update (add `model` pass-through):**

| Route File                                | Agent              | taskType param            |
| ----------------------------------------- | ------------------ | ------------------------- |
| `agent.ts` POST `/api/agent/secretary`    | EditorDeepAgent    | `'note-agent'` (moderate) |
| `agent.ts` POST `/api/agent/chat`         | ChatAgent          | `'chat'` (simple)         |
| `agent.ts` POST `/api/agent/note/:action` | NoteAgent          | `'note-agent'` (moderate) |
| `agent.ts` POST `/api/agent/planner/plan` | PlannerAgent       | `'planner'` (simple)      |
| `agent.ts` compound fallback              | InkdownDeepAgent   | `'note-agent'` (moderate) |
| `secretary.ts` POST `/api/secretary/chat` | SecretaryAgent     | `'secretary'` (simple)    |
| `research.ts` POST `/api/research/chat`   | ResearchAgent      | `'research'` (complex)    |
| `course.ts`                               | CourseOrchestrator | `'course'` (complex)      |

### 1.5 Agent Internal Changes (minimal)

Each agent currently hardcodes the model. Change default to use passed-in value:

**Pattern A agents** (OpenAI compat) — e.g., `chat.agent.ts` line 108:

```typescript
// BEFORE: this.model = config.model ?? 'gemini-3.1-pro-preview'
// AFTER:  this.model = config.model ?? 'gemini-2.5-flash'  // safe fallback
```

**Pattern B agents** (deepagents/LangChain) — e.g., `secretary/agent.ts` line 62:

```typescript
// BEFORE: model: this.config.model ?? 'gemini-3.1-pro-preview'
// AFTER:  model: this.config.model ?? 'gemini-2.5-flash'
```

**Also update constants** in `gemini.ts`:

```typescript
// BEFORE: export const DEFAULT_MODEL = 'gemini-3.1-pro-preview'
// AFTER:  export const DEFAULT_MODEL = 'gemini-2.5-flash'
```

---

## Phase 2: Token Tracking & Cost Infrastructure

### 2.1 Database Migration — `supabase/migrations/027_usage_tracking.sql`

```sql
-- Usage events (append-only)
CREATE TABLE usage_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  agent_id TEXT NOT NULL,
  session_id UUID,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  credits_used NUMERIC(10,4) NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_usage_events_user ON usage_events(user_id, created_at DESC);

-- Credit balances
CREATE TABLE credit_balances (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  balance NUMERIC(10,4) NOT NULL DEFAULT 50,
  tier TEXT NOT NULL DEFAULT 'free',
  monthly_allocation INTEGER NOT NULL DEFAULT 50,
  overage_enabled BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create balance row on new user signup
CREATE OR REPLACE FUNCTION create_credit_balance_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO credit_balances (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_credit_balance_for_user();

-- Atomic credit debit
CREATE OR REPLACE FUNCTION debit_credits(
  p_user_id UUID, p_amount NUMERIC, p_source TEXT, p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB AS $$
DECLARE v_balance NUMERIC; v_overage BOOLEAN;
BEGIN
  SELECT balance, overage_enabled INTO v_balance, v_overage
  FROM credit_balances WHERE user_id = p_user_id FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO credit_balances (user_id) VALUES (p_user_id);
    v_balance := 50; v_overage := false;
  END IF;

  IF v_balance < p_amount AND NOT v_overage THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_credits', 'balance', v_balance);
  END IF;

  UPDATE credit_balances SET balance = balance - p_amount, updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'balance', v_balance - p_amount);
END; $$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_events_user ON usage_events FOR ALL USING (user_id = auth.uid());
CREATE POLICY credit_balances_user ON credit_balances FOR ALL USING (user_id = auth.uid());
```

### 2.2 Cost Calculator — `packages/ai/src/services/cost-calculator.ts` (NEW)

```typescript
import { MODEL_PRICING } from '../providers/factory'

export function calculateCost(model: string, inputTokens: number, outputTokens: number) {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return { costUsd: 0, credits: 0 }
  const costUsd =
    (inputTokens * pricing.inputCostPer1M + outputTokens * pricing.outputCostPer1M) / 1_000_000
  const credits = Math.ceil(costUsd * 100) // 1 credit ≈ $0.01
  return { costUsd, credits }
}
```

### 2.3 Token Tracker — `packages/ai/src/services/token-tracker.ts` (NEW)

```typescript
export class TokenTracker {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  async record(params: {
    agentId: string
    sessionId?: string
    model: string
    inputTokens: number
    outputTokens: number
  }) {
    const { costUsd, credits } = calculateCost(
      params.model,
      params.inputTokens,
      params.outputTokens
    )
    // Write usage event
    await this.supabase.from('usage_events').insert({
      user_id: this.userId,
      agent_id: params.agentId,
      session_id: params.sessionId,
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      credits_used: credits,
      cost_usd: costUsd,
    })
    // Debit credits
    await this.supabase.rpc('debit_credits', {
      p_user_id: this.userId,
      p_amount: credits,
      p_source: `agent:${params.agentId}`,
    })
  }
}
```

### 2.4 Integrate into Routes

After agent streaming completes, call `tokenTracker.record()` with the usage data from the stream. For Pattern A agents, capture `response.usage` from the final OpenAI stream chunk. For Pattern B agents (deepagents), usage comes from LangChain's `usage_metadata`.

**Key files to modify:**

- `apps/api/src/routes/agent.ts` — Add tracker after each agent stream loop
- `apps/api/src/routes/secretary.ts` — Same
- `apps/api/src/routes/research.ts` — Same
- `apps/api/src/routes/course.ts` — Same

---

## Phase 3: BaseAgent Abstraction

### 3.1 Unified Event Types — `packages/ai/src/agents/types.ts` (NEW)

```typescript
export interface AgentEvent {
  type:
    | 'thinking'
    | 'text-delta'
    | 'text'
    | 'tool-call'
    | 'tool-result'
    | 'artifact'
    | 'edit-proposal'
    | 'stage-update'
    | 'interrupt'
    | 'cost-update'
    | 'done'
    | 'error'
    // Existing event types for backward compat:
    | 'citation'
    | 'finish'
    | 'title'
    | 'decomposition'
    | 'subtask-start'
    | 'subtask-progress'
    | 'subtask-complete'
    | 'note-navigate'
  agentId: string
  timestamp: number
  data: unknown
  tokenUsage?: { input: number; output: number; model: string }
}

export interface AgentInput {
  message: string
  context?: Record<string, unknown>
  sessionId?: string
}

export interface AgentContext {
  supabase: SupabaseClient
  userId: string
  userTier: UserTier
  model: string
  tokenTracker?: TokenTracker
}
```

### 3.2 BaseAgent — `packages/ai/src/agents/base.ts` (NEW)

```typescript
export abstract class BaseAgent {
  abstract readonly id: string
  abstract readonly name: string
  abstract readonly defaultComplexity: TaskComplexity

  abstract execute(input: AgentInput, context: AgentContext): AsyncGenerator<AgentEvent>

  async *stream(input: AgentInput, context: AgentContext): AsyncGenerator<AgentEvent> {
    // 1. Check credits (future: guardrails here)
    // 2. Delegate to execute()
    let totalInput = 0,
      totalOutput = 0
    for await (const event of this.execute(input, context)) {
      if (event.tokenUsage) {
        totalInput += event.tokenUsage.input
        totalOutput += event.tokenUsage.output
      }
      yield event
    }
    // 3. Track usage
    if (context.tokenTracker && totalInput + totalOutput > 0) {
      await context.tokenTracker.record({
        agentId: this.id,
        sessionId: input.sessionId,
        model: context.model,
        inputTokens: totalInput,
        outputTokens: totalOutput,
      })
    }
  }
}
```

### 3.3 Migration Strategy

Do NOT rewrite existing agents. Instead, routes evolve to use BaseAgent wrappers **gradually**. The BaseAgent abstraction is available for NEW agents and for when we touch existing agents for other reasons.

---

## Phase 4: Guardrails Layer

### 4.1 Rate Limiter — `packages/ai/src/guardrails/rate-limiter.ts` (NEW)

In-memory token bucket per user. Limits:

- Free: 20 req/min
- Pro: 60 req/min
- Team: 120 req/min

### 4.2 Budget Check — `packages/ai/src/guardrails/budget-check.ts` (NEW)

Check `credit_balances` before agent execution. Return `{ allowed, balance, reason }`.

### 4.3 Token Budget — `packages/ai/src/guardrails/token-budget.ts` (NEW)

Per-agent max token limits. Enforced via `max_completion_tokens` / `maxOutputTokens` params passed to LLM.

### 4.4 GuardrailChain — `packages/ai/src/guardrails/index.ts` (NEW)

Composes all guards. Called in `BaseAgent.stream()` before and after execution.

---

## Phase 5: Credit Ledger (No Stripe)

### 5.1 Credit Ledger Service — `packages/ai/src/services/credit-ledger.ts` (NEW)

Wraps Supabase RPCs: `debit()`, `grant()`, `getBalance()`, `getTransactions()`.

### 5.2 Database Migration — `supabase/migrations/028_credit_transactions.sql`

```sql
CREATE TABLE credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('grant','debit','refund','expire','purchase')),
  amount NUMERIC(10,4) NOT NULL,
  balance_after NUMERIC(10,4) NOT NULL,
  source TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_credit_tx_user ON credit_transactions(user_id, created_at DESC);
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_tx_user ON credit_transactions FOR ALL USING (user_id = auth.uid());
```

### 5.3 Billing API Route — `apps/api/src/routes/billing.ts` (NEW)

- GET `/api/billing/balance` — Current credits + tier
- GET `/api/billing/usage` — Usage history (last 30 days)
- GET `/api/billing/transactions` — Credit transaction ledger

Stripe webhook handlers added later when keys are available.

### 5.4 Frontend — `apps/web/src/stores/billing.ts` + `CreditBar.vue`

Pinia store for balance/usage state. CreditBar component shows remaining credits in the UI.

---

## Phase 6: Prompt System

### 6.1 Shared Prompts — `packages/ai/src/prompts/` (NEW directory)

- `base.ts` — "You are Noteshell AI, an intelligent assistant for notes, learning, and productivity."
- `safety.ts` — Content policy, refusal guidelines, output constraints
- `formatting.ts` — Markdown formatting rules (headings, lists, code blocks)
- `index.ts` — `composePrompt({ base, safety, formatting, agent, context, userTier })` function

### 6.2 Agent Prompt Integration

Each agent's existing prompt file gets wrapped:

```typescript
// e.g., secretary/prompts.ts
import { composePrompt } from '../../prompts'

export function getSecretarySystemPrompt(opts) {
  return composePrompt({
    base: true,
    safety: true,
    formatting: true,
    agent: buildSecretaryPrompt(opts), // existing logic
    userTier: opts.userTier,
  })
}
```

---

## Files Summary

### New Files (13)

| File                                          | Phase | Purpose                                      |
| --------------------------------------------- | ----- | -------------------------------------------- |
| `packages/ai/src/services/user-tier.ts`       | 1     | Look up user tier from credit_balances       |
| `packages/ai/src/services/cost-calculator.ts` | 2     | (model, tokens) → credits/USD                |
| `packages/ai/src/services/token-tracker.ts`   | 2     | Record usage events + debit credits          |
| `packages/ai/src/agents/types.ts`             | 3     | Unified AgentEvent, AgentInput, AgentContext |
| `packages/ai/src/agents/base.ts`              | 3     | Abstract BaseAgent class                     |
| `packages/ai/src/guardrails/rate-limiter.ts`  | 4     | Token bucket per user                        |
| `packages/ai/src/guardrails/budget-check.ts`  | 4     | Credit balance check                         |
| `packages/ai/src/guardrails/token-budget.ts`  | 4     | Max tokens per agent type                    |
| `packages/ai/src/guardrails/index.ts`         | 4     | GuardrailChain composition                   |
| `packages/ai/src/services/credit-ledger.ts`   | 5     | Credit operations wrapper                    |
| `packages/ai/src/prompts/base.ts`             | 6     | Shared identity prompt                       |
| `packages/ai/src/prompts/safety.ts`           | 6     | Content policy                               |
| `packages/ai/src/prompts/formatting.ts`       | 6     | Markdown output rules                        |
| `packages/ai/src/prompts/index.ts`            | 6     | composePrompt() function                     |

### Modified Files (12)

| File                                        | Phase | Change                                                   |
| ------------------------------------------- | ----- | -------------------------------------------------------- |
| `packages/shared/src/types/ai.ts`           | 1     | Add UserTier, TaskComplexity, ModelSelection types       |
| `packages/shared/src/types/index.ts`        | 1     | Export new types                                         |
| `packages/ai/src/providers/factory.ts`      | 1     | Add selectModel(), MODEL_PRICING, getDefaultComplexity() |
| `packages/ai/src/providers/gemini.ts`       | 1     | Change DEFAULT_MODEL to gemini-2.5-flash                 |
| `apps/api/src/routes/agent.ts`              | 1+2   | getUserTier + selectModel + tokenTracker in each handler |
| `apps/api/src/routes/secretary.ts`          | 1+2   | Same                                                     |
| `apps/api/src/routes/research.ts`           | 1+2   | Same                                                     |
| `apps/api/src/routes/course.ts`             | 1+2   | Same                                                     |
| `packages/ai/src/agents/chat.agent.ts`      | 1     | Fallback model → gemini-2.5-flash                        |
| `packages/ai/src/agents/secretary/agent.ts` | 1     | Fallback model → gemini-2.5-flash                        |
| `packages/ai/src/agents/deep-agent.ts`      | 1     | Fallback model → gemini-2.5-flash                        |
| `packages/ai/src/services/index.ts`         | 2     | Export new services                                      |

### New Migrations (2)

| File                                              | Phase | Tables                                         |
| ------------------------------------------------- | ----- | ---------------------------------------------- |
| `supabase/migrations/027_usage_tracking.sql`      | 2     | usage_events, credit_balances, debit_credits() |
| `supabase/migrations/028_credit_transactions.sql` | 5     | credit_transactions                            |

---

## Verification

### Phase 1

- `pnpm typecheck` passes
- `pnpm test:run` passes (no behavioral changes)
- `selectModel('chat', 'free')` → returns `gemma-3-27b-it`
- `selectModel('research', 'pro')` → returns `gemini-2.5-pro`
- `selectModel('artifact', 'free')` → returns `kimi-k2.5`
- Manually test: send a chat message, verify it uses the selected model (check API response headers or logs)

### Phase 2

- Apply migration 027 to Supabase
- Send a request, verify `usage_events` row appears with correct model + token counts
- Verify `credit_balances` row exists and balance decrements

### Phase 3

- `pnpm typecheck` passes with new AgentEvent types
- Existing agent tests still pass (no breaking changes)

### Phase 4

- Test rate limiter: 25 rapid requests as free user → last 5 rejected
- Test budget check: user with 0 credits → rejected with reason

### Phase 5

- GET `/api/billing/balance` returns `{ balance: 50, tier: 'free' }`
- After using credits, balance decreases

### Phase 6

- Compare agent output before/after prompt composition — quality same or better
- `pnpm test:run` still passes
