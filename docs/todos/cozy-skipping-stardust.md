# Token Tracking: Complete Coverage Across All Models & Agents

## Context

Token tracking was partially implemented — `trackOpenAIStream` and `trackOpenAIResponse` exist in `packages/ai/src/providers/token-tracker.ts` and are wired into 4 agents (editor, note, deep, chat) and the OpenAI provider. However, ~30+ LLM call sites remain untracked across agents, services, workflows, and the Gemini native SDK. This plan completes coverage so every LLM call in the system records token usage.

**Currently tracked (already done):**

- `packages/ai/src/providers/openai.ts` — 6 methods (complete, rewrite, chat, summarize, chatWithTools, streamChatWithTools)
- `packages/ai/src/agents/editor.agent.ts` — 4 calls (L449, L867, L918, L1377)
- `packages/ai/src/agents/note.agent.ts` — 3 calls
- `packages/ai/src/agents/deep-agent.ts` — 5 calls
- `packages/ai/src/agents/chat.agent.ts` — 2 calls

---

## Step 1: Add Gemini Native SDK Tracking

**File:** `packages/ai/src/providers/token-tracker.ts`

The Gemini native SDK (`@google/generative-ai`) returns usage in `response.usageMetadata` with `{ promptTokenCount, candidatesTokenCount, totalTokenCount }`. Add two new helpers:

### 1a. `trackGeminiResponse(result, meta)` — for non-streaming calls

- Extract `result.response.usageMetadata.promptTokenCount` and `candidatesTokenCount`
- Record via `tokenTracker.record()`

### 1b. `trackGeminiStream(streamResult, meta)` — async generator wrapper for streaming calls

- Wraps the `.stream` iterable, yields chunks unchanged
- After stream ends, reads `streamResult.response.usageMetadata` (available after stream completion on the `GenerateContentStreamResult` object)
- Records usage

**Key detail:** The Gemini SDK's `generateContentStream()` returns `{ stream, response }` where `response` is a `Promise<GenerateContentResponse>` that resolves after streaming finishes. The `usageMetadata` is on this resolved response.

### 1c. Add `'gemini-native'` as valid source in types (optional, for distinguishing from OpenAI-compat Gemini calls)

---

## Step 2: Wire Gemini Provider

**File:** `packages/ai/src/providers/gemini.ts`

Add tracking to all 8 Gemini native SDK calls:

| Method                       | Line | Type          | TaskType                                                                                           |
| ---------------------------- | ---- | ------------- | -------------------------------------------------------------------------------------------------- |
| `complete()`                 | ~106 | streaming     | `'completion'`                                                                                     |
| `rewrite()`                  | ~146 | streaming     | `'rewrite'`                                                                                        |
| `chat()`                     | ~172 | streaming     | `'chat'`                                                                                           |
| `summarize()`                | ~198 | streaming     | `'summarize'`                                                                                      |
| `generateSlideOutline()`     | ~262 | non-streaming | `'slides'`                                                                                         |
| `deepResearch()`             | ~335 | streaming     | `'deep-research'`                                                                                  |
| `generateCourseCurriculum()` | ~414 | non-streaming | `'course'`                                                                                         |
| `generateSingleSlideImage()` | ~581 | non-streaming | `'slides'` (image gen, uses different SDK `@google/genai` — check if `usageMetadata` is available) |

**Pattern for streaming methods:**

```
const result = await this.model.generateContentStream({...})
// Wrap: for await (const chunk of trackGeminiStream(result, { model: this.modelName, taskType: '...' }))
```

**Pattern for non-streaming:**

```
const result = await this.slidesModel.generateContent({...})
trackGeminiResponse(result, { model: this.slidesModelName, taskType: '...', startTime })
```

---

## Step 3: Wire Remaining OpenAI SDK Agents

These all use `client.chat.completions.create()` (OpenAI SDK) and just need `trackOpenAIStream`/`trackOpenAIResponse` + `stream_options: { include_usage: true }` for streaming calls.

### 3a. `packages/ai/src/agents/editor.agent.ts` — 5 remaining calls

| Method                                          | Line  | Type          | TaskType     |
| ----------------------------------------------- | ----- | ------------- | ------------ |
| `createArtifactCompletion()` stream=true        | ~2056 | streaming     | `'artifact'` |
| `createArtifactCompletion()` stream=true retry  | ~2063 | streaming     | `'artifact'` |
| `createArtifactCompletion()` stream=false       | ~2071 | non-streaming | `'artifact'` |
| `createArtifactCompletion()` stream=false retry | ~2078 | non-streaming | `'artifact'` |
| `generateTableData()`                           | ~2139 | non-streaming | `'table'`    |

**Note:** `createArtifactCompletion` returns the raw stream/response to the caller. The tracking must be applied at the consumption site OR the method should wrap the return. Best approach: wrap within the method since it's a private helper. For streaming, add `stream_options` and wrap with `trackOpenAIStream`. For non-streaming, add `trackOpenAIResponse` after the call.

### 3b. `packages/ai/src/agents/planner.agent.ts` — 3 calls

| Method | Line | Type          | TaskType    |
| ------ | ---- | ------------- | ----------- |
| Call 1 | ~179 | non-streaming | `'planner'` |
| Call 2 | ~283 | non-streaming | `'planner'` |
| Call 3 | ~426 | non-streaming | `'planner'` |

Import `trackOpenAIResponse` from `../../providers/token-tracker`.

### 3c. `packages/ai/src/agents/agentic.agent.ts` — 1 call

| Method           | Line | Type          | TaskType |
| ---------------- | ---- | ------------- | -------- |
| `chatCompletion` | ~638 | non-streaming | `'chat'` |

### 3d. `packages/ai/src/agents/explain/index.ts` — 1 call

| Method         | Line | Type      | TaskType    |
| -------------- | ---- | --------- | ----------- |
| streaming call | ~146 | streaming | `'explain'` |

Add `stream_options: { include_usage: true }` and wrap with `trackOpenAIStream`.

### 3e. `packages/ai/src/agents/subagents/artifact.subagent.ts` — 2 calls

| Method      | Line | Type          | TaskType     |
| ----------- | ---- | ------------- | ------------ |
| `execute()` | ~90  | streaming     | `'artifact'` |
| retry       | ~145 | non-streaming | `'artifact'` |

### 3f. `packages/ai/src/agents/subagents/table.subagent.ts` — 2 calls

| Method      | Line | Type          | TaskType  |
| ----------- | ---- | ------------- | --------- |
| `execute()` | ~99  | non-streaming | `'table'` |
| second call | ~201 | non-streaming | `'table'` |

### 3g. `packages/ai/src/agents/research/agent.ts` — 5 calls

| Method                                   | Line | Type          | TaskType     |
| ---------------------------------------- | ---- | ------------- | ------------ |
| `streamSimpleChat()`                     | ~158 | streaming     | `'research'` |
| `streamNoteDraft()`                      | ~237 | streaming     | `'research'` |
| artifact Ollama call                     | ~418 | streaming     | `'artifact'` |
| `generateStudyTimerArtifactWithOpenAI()` | ~445 | non-streaming | `'artifact'` |
| `streamMarkdownFile()`                   | ~488 | non-streaming | `'research'` |

---

## Step 4: Wire Services & Workflows

### 4a. `packages/ai/src/services/recommendations.ts` — 1 call

| Method             | Line | Type          | TaskType                                    |
| ------------------ | ---- | ------------- | ------------------------------------------- |
| recommendation gen | ~265 | non-streaming | `'chat'` (add new type `'recommendation'`?) |

### 4b. `packages/ai/src/services/orchestration.ts` — 2 calls

| Method | Line | Type          | TaskType    |
| ------ | ---- | ------------- | ----------- |
| Call 1 | ~627 | non-streaming | `'planner'` |
| Call 2 | ~759 | non-streaming | `'planner'` |

### 4c. `packages/ai/src/workflows/actions.ts` — 1 shared call

| Method                  | Line | Type          | TaskType     |
| ----------------------- | ---- | ------------- | ------------ |
| `callOpenAI()` internal | ~749 | non-streaming | `'research'` |

This is a centralized helper used by all 8 workflow actions — adding tracking here covers all of them at once.

---

## Step 5: LangChain/deepagents Tracking via Callbacks

**Files affected:**

- `packages/ai/src/agents/secretary/agent.ts`
- `packages/ai/src/agents/research/agent.ts` (the `streamResearchMode` path)
- `packages/ai/src/agents/editor-deep/agent.ts`
- `packages/ai/src/agents/course/orchestrator.ts`

**Approach:** LangChain models support `callbacks` in their config. Use a custom `BaseCallbackHandler` that records token usage to the `tokenTracker`.

### 5a. Create `packages/ai/src/providers/langchain-token-callback.ts`

```typescript
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { tokenTracker, computeCost } from './token-tracker'
import { MODEL_REGISTRY, type AITaskType } from './model-registry'

export class TokenTrackingCallback extends BaseCallbackHandler {
  name = 'TokenTrackingCallback'
  private model: string
  private taskType: AITaskType
  private startTime: number

  constructor(meta: { model: string; taskType: AITaskType }) {
    super()
    this.model = meta.model
    this.taskType = meta.taskType
    this.startTime = Date.now()
  }

  async handleLLMEnd(output: any) {
    const usage = output?.llmOutput?.tokenUsage || output?.llmOutput?.usage
    if (usage) {
      const inputTokens = usage.promptTokens ?? usage.prompt_tokens ?? 0
      const outputTokens = usage.completionTokens ?? usage.completion_tokens ?? 0
      tokenTracker.record({
        model: this.model,
        provider: MODEL_REGISTRY[this.model]?.provider ?? 'gemini',
        taskType: this.taskType,
        inputTokens,
        outputTokens,
        costCents: computeCost(this.model, { inputTokens, outputTokens }),
        durationMs: Date.now() - this.startTime,
        timestamp: Date.now(),
      })
      this.startTime = Date.now() // Reset for next call in same agent run
    }
  }
}
```

### 5b. Wire into `createLangChainModel()`

**File:** `packages/ai/src/providers/client-factory.ts`

Add optional `callbacks` parameter to `createLangChainModel()`. Each agent passes a `TokenTrackingCallback` instance:

```typescript
const callback = new TokenTrackingCallback({ model: model.id, taskType: 'secretary' })
const llm = await createLangChainModel(model, { temperature: 0.5, callbacks: [callback] })
```

### 5c. Wire each deepagents agent

- **secretary/agent.ts** (L61): Add callback with taskType `'secretary'`
- **research/agent.ts** (L529): Add callback with taskType `'research'`
- **editor-deep/agent.ts** (L125): Add callback with taskType `'editor-deep'`
- **course/orchestrator.ts** (L218 area): Add callback with taskType `'course'`

---

## Step 6: Add Missing Task Types to Model Registry

**File:** `packages/ai/src/providers/model-registry.ts`

Current `AITaskType` has 18 types. Verify no new types are needed. The current list covers all agents. If recommendations need their own type, optionally add `'recommendation'` — otherwise use `'chat'`.

---

## Step 7: Export New Utilities

**File:** `packages/ai/src/providers/index.ts`

Export new functions:

- `trackGeminiResponse`
- `trackGeminiStream`
- `TokenTrackingCallback` (from new langchain-token-callback.ts)

---

## Execution Order

1. **Step 1** — Add `trackGeminiResponse` + `trackGeminiStream` to `token-tracker.ts`
2. **Step 5a** — Create `langchain-token-callback.ts`
3. **Step 7** — Update exports in `providers/index.ts`
4. **Step 2** — Wire Gemini provider (8 calls)
5. **Step 3a–3g** — Wire remaining OpenAI SDK agents (19 calls)
6. **Step 4a–4c** — Wire services & workflows (4 calls)
7. **Step 5b–5c** — Wire LangChain agents via callbacks (4 agents)
8. **Step 6** — Verify task types complete
9. **Verify** — Build, typecheck, run tests

---

## Verification

1. `pnpm build && pnpm typecheck` — no compile errors
2. `pnpm test:run` — existing tests pass
3. Manual smoke test: trigger each agent type and check console for `[TokenTracker]` log lines showing token counts
4. Verify Gemini calls show real token counts (not 0/0)
5. Verify LangChain/deepagents calls show real token counts

---

## Critical Files

| File                                                    | Action                                        |
| ------------------------------------------------------- | --------------------------------------------- |
| `packages/ai/src/providers/token-tracker.ts`            | Add Gemini tracking helpers                   |
| `packages/ai/src/providers/langchain-token-callback.ts` | **NEW** — LangChain callback handler          |
| `packages/ai/src/providers/client-factory.ts`           | Add callbacks param to `createLangChainModel` |
| `packages/ai/src/providers/gemini.ts`                   | Wire 8 calls                                  |
| `packages/ai/src/providers/index.ts`                    | Export new utilities                          |
| `packages/ai/src/agents/editor.agent.ts`                | Wire 5 remaining calls                        |
| `packages/ai/src/agents/planner.agent.ts`               | Wire 3 calls                                  |
| `packages/ai/src/agents/agentic.agent.ts`               | Wire 1 call                                   |
| `packages/ai/src/agents/explain/index.ts`               | Wire 1 call                                   |
| `packages/ai/src/agents/subagents/artifact.subagent.ts` | Wire 2 calls                                  |
| `packages/ai/src/agents/subagents/table.subagent.ts`    | Wire 2 calls                                  |
| `packages/ai/src/agents/research/agent.ts`              | Wire 5 OpenAI calls                           |
| `packages/ai/src/services/recommendations.ts`           | Wire 1 call                                   |
| `packages/ai/src/services/orchestration.ts`             | Wire 2 calls                                  |
| `packages/ai/src/workflows/actions.ts`                  | Wire 1 centralized call                       |
| `packages/ai/src/agents/secretary/agent.ts`             | Add LangChain callback                        |
| `packages/ai/src/agents/editor-deep/agent.ts`           | Add LangChain callback                        |
| `packages/ai/src/agents/course/orchestrator.ts`         | Add LangChain callback                        |

**Total: ~35 call sites to wire, 1 new file, 18 files modified**
