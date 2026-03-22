# Wire Token Tracking Into All AI Agents (Phase 1 Gap)

**Date:** 2026-03-18
**Status:** Plan
**Scope:** Wire `trackOpenAIStream` and `trackOpenAIResponse` from `token-tracker.ts` into all OpenAI SDK call sites

---

## Context

The `unified-leaping-barto` plan created `token-tracker.ts` with two wrappers:

- `trackOpenAIStream()` — async generator wrapper for streaming calls
- `trackOpenAIResponse()` — function for non-streaming calls

These wrappers are **exported but never called**. All token counts remain `{ inputTokens: 0, outputTokens: 0 }`. This was supposed to be completed in Phase 1 but was skipped during the agent migration step.

---

## Technical Analysis: `stream_options` Support

For streaming calls, the OpenAI SDK requires `stream_options: { include_usage: true }` to populate `chunk.usage` on the final chunk.

| Provider               | `stream_options` support                | `response.usage` (non-streaming) |
| ---------------------- | --------------------------------------- | -------------------------------- |
| OpenAI native          | Yes                                     | Yes                              |
| Gemini compat endpoint | Likely yes (mirrors OpenAI API)         | Yes                              |
| Ollama Cloud/Local     | Returns usage by default in final chunk | Yes                              |

**Risk**: If Gemini compat silently ignores `stream_options`, `chunk.usage` stays `undefined` → tracker records 0/0. This is the existing behavior, so no regression. If it rejects the parameter with 400, we'll catch it immediately in testing and remove it.

**Non-streaming calls are safe**: `response.usage` is standard OpenAI format returned by all compat endpoints.

---

## Call Site Inventory (42 total OpenAI SDK call sites)

### Group A: `OpenAIProvider` methods (`packages/ai/src/providers/openai.ts`) — 6 sites

| Line | Method                  | Type          | Task Type    |
| ---- | ----------------------- | ------------- | ------------ |
| L66  | `complete()`            | streaming     | `completion` |
| L119 | `rewrite()`             | streaming     | `rewrite`    |
| L148 | `chat()`                | streaming     | `chat`       |
| L196 | `summarize()`           | streaming     | `summarize`  |
| L231 | `chatWithTools()`       | non-streaming | `chat`       |
| L261 | `streamChatWithTools()` | streaming     | `chat`       |

### Group B: Direct agent calls — 30 sites

| File                                    | Streaming              | Non-streaming                    | Task Types                          |
| --------------------------------------- | ---------------------- | -------------------------------- | ----------------------------------- |
| `agents/chat.agent.ts`                  | 1 (L190)               | 1 (L372)                         | `chat`                              |
| `agents/deep-agent.ts`                  | 3 (L582,L652,L824)     | 2 (L425,L723)                    | `chat`,`artifact`,`planner`,`table` |
| `agents/note.agent.ts`                  | 2 (L382,L526)          | 1 (L755)                         | `note-agent`                        |
| `agents/editor.agent.ts`                | ~4 (L893,L2043,L2050+) | ~5 (L437,L846,L1356,L2058,L2126) | `editor`,`artifact`,`table`         |
| `agents/planner.agent.ts`               | 0                      | 3 (L179,L283,L426)               | `planner`                           |
| `agents/explain/index.ts`               | 1 (L146)               | 0                                | `explain`                           |
| `agents/agentic.agent.ts`               | 0                      | 1 (L638)                         | `chat`                              |
| `agents/research/agent.ts`              | 2 (L158,L237)          | 2 (L445,L488)                    | `research`                          |
| `agents/subagents/artifact.subagent.ts` | 1 (L90)                | 1 (L145)                         | `artifact`                          |
| `agents/subagents/table.subagent.ts`    | 0                      | 2 (L99,L201)                     | `table`                             |

### Group C: Services/Workflows — 4 sites

| File                          | Line(s)    | Type          | Task Type   |
| ----------------------------- | ---------- | ------------- | ----------- |
| `services/recommendations.ts` | L265       | non-streaming | `summarize` |
| `services/orchestration.ts`   | L627, L759 | non-streaming | `chat`      |
| `workflows/actions.ts`        | L749       | non-streaming | `planner`   |

### Group D: LangChain (DEFERRED — not in this plan)

LangGraph `agent.stream()` calls in secretary, editor-deep, and course orchestrator abstract away response metadata. Would need LangChain callback system — separate effort.

---

## Implementation

### Transformation Patterns

**Streaming (before):**

```typescript
const stream = await this.client.chat.completions.create({
  model: this.model,
  messages,
  temperature: 0.7,
  max_completion_tokens: 4000,
  stream: true,
})
for await (const chunk of stream) {
  /* ... */
}
```

**Streaming (after):**

```typescript
import { trackOpenAIStream } from '../providers/token-tracker'

const rawStream = await this.client.chat.completions.create({
  model: this.model,
  messages,
  temperature: 0.7,
  max_completion_tokens: 4000,
  stream: true,
  stream_options: { include_usage: true },
})
for await (const chunk of trackOpenAIStream(rawStream, {
  model: this.model,
  taskType: 'chat',
})) {
  /* same body — chunk type unchanged */
}
```

**Non-streaming (before):**

```typescript
const response = await this.client.chat.completions.create({
  model: this.model,
  messages,
  temperature: 0.7,
})
```

**Non-streaming (after):**

```typescript
import { trackOpenAIResponse } from '../providers/token-tracker'

const startTime = Date.now()
const response = await this.client.chat.completions.create({
  model: this.model,
  messages,
  temperature: 0.7,
})
trackOpenAIResponse(response, { model: this.model, taskType: 'chat', startTime })
```

### Execution Order (14 files)

#### Batch 1: Provider + core agents (highest impact)

1. **`packages/ai/src/providers/openai.ts`** — 6 call sites
   - Add import for `trackOpenAIStream`, `trackOpenAIResponse`
   - Wrap 5 streaming methods + 1 non-streaming method
   - Add `stream_options: { include_usage: true }` to all streaming calls
   - Keep existing `this.lastUsage` writes for backward compat

2. **`packages/ai/src/agents/chat.agent.ts`** — 2 call sites
   - L190: wrap streaming with `trackOpenAIStream`, add `stream_options`
   - L372: add `trackOpenAIResponse` after non-streaming call

3. **`packages/ai/src/agents/deep-agent.ts`** — 5 call sites
   - L582, L652, L824: wrap streaming
   - L425, L723: add `trackOpenAIResponse`

4. **`packages/ai/src/agents/note.agent.ts`** — 3 call sites

#### Batch 2: Remaining agents

5. **`packages/ai/src/agents/editor.agent.ts`** — ~9 call sites
6. **`packages/ai/src/agents/planner.agent.ts`** — 3 non-streaming call sites
7. **`packages/ai/src/agents/explain/index.ts`** — 1 streaming call site
8. **`packages/ai/src/agents/research/agent.ts`** — 4 call sites
9. **`packages/ai/src/agents/agentic.agent.ts`** — 1 non-streaming call site
10. **`packages/ai/src/agents/subagents/artifact.subagent.ts`** — 2 call sites
11. **`packages/ai/src/agents/subagents/table.subagent.ts`** — 2 non-streaming call sites

#### Batch 3: Services

12. **`packages/ai/src/services/recommendations.ts`** — 1 non-streaming
13. **`packages/ai/src/services/orchestration.ts`** — 2 non-streaming
14. **`packages/ai/src/workflows/actions.ts`** — 1 non-streaming

### What NOT to change

- LangChain/LangGraph agents (secretary, editor-deep, course) — deferred
- `token-tracker.ts` itself — already correct
- No prompt changes, no streaming event type changes, no API route changes
- No Gemini native SDK calls (`gemini.ts`) — those use Google's SDK, not OpenAI compat

---

## Verification

1. **Build + typecheck**: `pnpm build && pnpm typecheck` — must pass
2. **Tests**: `pnpm test:run` — all existing tests pass
3. **Manual smoke test**: Start `pnpm dev`, send a chat message. Check server console for `[TokenTracker] chat (gemini-3.1-pro-preview): N in / M out ($X.XXXc, Yms)` with non-zero token counts.
4. **If `stream_options` causes 400 on Gemini**: Remove `stream_options` from all streaming calls. Non-streaming tracking still works. File an issue to revisit streaming token tracking.
5. **Non-streaming verification**: Trigger a planner or table generation (non-streaming paths). Confirm `[TokenTracker]` logs appear with real counts from `response.usage`.
