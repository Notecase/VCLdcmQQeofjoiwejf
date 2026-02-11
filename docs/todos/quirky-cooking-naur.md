# Fix AI Tool-Calling Reliability

## Context

GPT models (GPT-5.2 and GPT-4o-mini) frequently fail to select the correct tool when interacting with our agents. The root causes are architectural, not model-level:

1. **Framework tool leakage**: `deepagents@1.7.0` auto-injects 7 phantom tools (`edit_file`, `read_file`, `write_file`, `ls`, `glob`, `grep`, `write_todos`) via `filesystemMiddleware` and `todoListMiddleware`. These tools connect to an in-memory `StateBackend` with no Supabase integration — calling them always fails. The Secretary prompt wastes ~15 lines warning the model "NEVER use these" (lines 97-111 of `prompts.ts`), but the model still sees them in the schema.

2. **Secretary prompt overload**: ~520-line system prompt with 15 real tools + 7 phantom tools (22 total in the schema). The model must simultaneously classify intent AND select from 22 tools.

3. **No `tool_choice` forcing**: All tool selection is `"auto"`. For obvious intents like "read my plan", we should force `read_memory_file`.

4. **Single-pass architecture**: Secretary does intent classification + tool execution in one LLM call. Industry standard is to separate these.

**Goal**: Make tool calling reliable by eliminating phantom tools, splitting intent classification from execution, reducing per-agent tool counts, and forcing tool selection where intent is clear.

**Constraint**: Zero frontend changes. SSE event contract must remain identical.

**Scope**: Secretary agent only (Phases 1-2). EditorDeepAgent will use the same proven pattern in a follow-up.

---

## Phase 1: Eliminate Framework Tool Leakage (Secretary)

Replace `createDeepAgent` (which injects phantom middleware) with a simple reactive agent loop using `ChatOpenAI` directly. This gives us full control over the tool list.

### File: `packages/ai/src/agents/secretary/agent.ts`

**Current** (line 55-56, 95-112):
```typescript
const { createDeepAgent } = await import('deepagents')
// ...
const agent = createDeepAgent({ model: llm, systemPrompt, tools, subagents: [...] })
```

**Replace with** a self-contained reactive loop:

```typescript
// New method: reactiveAgentLoop(llm, tools, systemPrompt, userMessage)
// 1. Build messages: [system, user]
// 2. Call llm.bindTools(tools).invoke(messages)
// 3. If response has tool_calls → execute each tool → append tool results → goto 2
// 4. If response has text content → yield text events → done
// Max 8 iterations to prevent infinite loops
```

**Key**: The `SecretaryStreamNormalizer` already handles raw LangGraph message formats. Our custom loop emits the same message shapes, so the normalizer works unchanged.

**Subagent impact**: The planner and researcher subagents (`subagents.ts`) are already invoked as direct LLM calls from inside the `create_roadmap` tool handler (lines 236-259 of `tools.ts`). They do NOT depend on the deepagents subagent delegation system. Removing `createDeepAgent` does not break them.

### File: `packages/ai/src/agents/secretary/prompts.ts`

**Remove** the "FORBIDDEN TOOLS" section (lines 97-111). With the custom loop, phantom tools simply don't exist in the tool list.

---

## Phase 2: Split Intent Classification from Tool Execution (Secretary)

### New File: `packages/ai/src/agents/secretary/intent-classifier.ts`

Lightweight LLM call (GPT-4o-mini, temp 0.1, max 200 tokens, zero tools) that classifies user message into one intent:

```typescript
export type SecretaryIntent =
  | 'create_roadmap'      // "I want to learn X"
  | 'save_roadmap'        // "yes save it" (confirming pending roadmap)
  | 'activate_roadmap'    // "activate my optics plan"
  | 'modify_roadmap'      // "change day 5 of my DL plan"
  | 'daily_plan'          // "what should I study today", "generate tomorrow"
  | 'modify_schedule'     // "move my 10am task to 2pm"
  | 'schedule_disruption' // "push everything back 30 min", "meeting at 2pm"
  | 'carry_over'          // "carry over unfinished tasks"
  | 'recurring'           // "I always have standup at 9:30"
  | 'activity_log'        // "log 30min Rust study at 3pm"
  | 'reflection'          // "mood: good, studied well"
  | 'read_info'           // "what's my plan?", "show today's schedule"
  | 'update_preferences'  // "change my focus time to 8am"
  | 'general_chat'        // Everything else

export async function classifyIntent(
  message: string,
  context: { todayDate: string; hasPendingRoadmap: boolean; activePlanCount: number },
  config: { openaiApiKey: string }
): Promise<{ intent: SecretaryIntent; confidence: number }>
```

**Classifier prompt** (~30 lines, no tools, just returns JSON):
```
Classify the user's message into exactly one intent. Return JSON: {"intent":"...","confidence":0.0-1.0}
Today: {date}. Has pending roadmap: {bool}. Active plans: {count}.
```

**Fallback**: If confidence < 0.4, fall through to the full 15-tool agent (current behavior).

### New File: `packages/ai/src/agents/secretary/tool-groups.ts`

Map each intent to only the tools it needs:

```typescript
export const TOOL_GROUPS: Record<SecretaryIntent, string[]> = {
  create_roadmap:      ['create_roadmap'],
  save_roadmap:        ['save_roadmap', 'read_memory_file'],
  activate_roadmap:    ['activate_roadmap', 'list_memory_files', 'read_memory_file'],
  modify_roadmap:      ['read_memory_file', 'write_memory_file', 'list_memory_files'],
  daily_plan:          ['generate_daily_plan', 'read_memory_file', 'activate_roadmap'],
  modify_schedule:     ['modify_plan', 'read_memory_file'],
  schedule_disruption: ['bulk_modify_plan', 'read_memory_file'],
  carry_over:          ['carry_over_tasks', 'read_memory_file'],
  recurring:           ['manage_recurring_blocks'],
  activity_log:        ['log_activity'],
  reflection:          ['save_reflection', 'read_memory_file'],
  read_info:           ['read_memory_file', 'list_memory_files'],
  update_preferences:  ['read_memory_file', 'write_memory_file'],
  general_chat:        [],
}

// Force first tool call for unambiguous intents
export const FORCED_FIRST_TOOL: Partial<Record<SecretaryIntent, string>> = {
  create_roadmap: 'create_roadmap',
  save_roadmap:   'save_roadmap',
  reflection:     'save_reflection',
  read_info:      'read_memory_file',
}
```

### File: `packages/ai/src/agents/secretary/agent.ts` — Refactor `stream()`

```
stream(input) {
  1. Load context (existing code, unchanged)
  2. classifyIntent(input.message, context) → { intent, confidence }
  3. If confidence < 0.4 → fallback to full 15-tool reactive loop
  4. Otherwise:
     a. Filter tools to TOOL_GROUPS[intent]
     b. Set tool_choice = FORCED_FIRST_TOOL[intent] if exists
     c. Build focused system prompt (only the relevant section)
     d. Run reactive loop with filtered tools
  5. Stream events through existing SecretaryStreamNormalizer
}
```

### File: `packages/ai/src/agents/secretary/prompts.ts` — Per-intent prompt builders

Split the monolithic 520-line prompt into focused builders:

```typescript
export function getPromptForIntent(intent: SecretaryIntent, vars: PromptVars): string {
  const base = getBasePrompt(vars)          // ~30 lines: role + date + response style
  const section = INTENT_PROMPTS[intent]    // ~20-80 lines per intent
  return base + '\n\n' + section
}
```

Each intent gets only its relevant rules. For example:
- `read_info`: 20 lines (file structure + read instructions)
- `daily_plan`: 80 lines (scheduling rules + plan format + This Week calculation)
- `create_roadmap`: 30 lines (roadmap workflow)
- `general_chat`: 15 lines (just the base prompt)

---

## Phase 3: Apply Same Pattern to EditorDeepAgent

### File: `packages/ai/src/agents/editor-deep/agent.ts`

Same changes: replace `createDeepAgent` (line 86, 138) with reactive agent loop. The `EditorDeepStreamNormalizer` already handles the message format.

### New File: `packages/ai/src/agents/editor-deep/intent-classifier.ts`

```typescript
export type EditorIntent =
  | 'answer_question'   // "what is this note about?"
  | 'edit_content'      // "shorten the intro", "add a section about X"
  | 'create_note'       // "create a note about Y"
  | 'insert_table'      // "add a table comparing X and Y"
  | 'create_artifact'   // "make a timer", "create a calculator"
  | 'database_action'   // "query the data", "add rows"
  | 'memory_operation'  // "remember that I prefer...", "what do you know about me?"
  | 'general_chat'      // Everything else
```

### New File: `packages/ai/src/agents/editor-deep/tool-groups.ts`

```typescript
export const TOOL_GROUPS: Record<EditorIntent, string[]> = {
  answer_question: ['answer_question_about_note'],
  edit_content:    ['add_paragraph', 'edit_paragraph', 'remove_paragraph'],
  create_note:     ['create_note'],
  insert_table:    ['insert_table'],
  create_artifact: ['create_artifact_from_note'],
  database_action: ['database_action'],
  memory_operation:['read_memory', 'write_memory'],
  general_chat:    [],
}

export const FORCED_FIRST_TOOL: Partial<Record<EditorIntent, string>> = {
  answer_question: 'answer_question_about_note',
  create_note:     'create_note',
  create_artifact: 'create_artifact_from_note',
  insert_table:    'insert_table',
}
```

---

## Phase 4: Wire `tool_choice` in the Reactive Loop

### File: `packages/ai/src/agents/secretary/agent.ts` (and editor-deep/agent.ts)

In the reactive agent loop, when `FORCED_FIRST_TOOL[intent]` is set:

```typescript
const toolChoice = isFirstIteration && forcedTool
  ? { type: 'function' as const, function: { name: forcedTool } }
  : 'auto' as const

const response = await llm.invoke(messages, {
  tools: toolSchemas,
  tool_choice: toolChoice,
})
```

After the first forced call, subsequent iterations use `'auto'` so the model can chain additional tool calls if needed (e.g., `read_memory_file` → process → `write_memory_file`).

---

## Files to Create

| File | Purpose |
|------|---------|
| `packages/ai/src/agents/secretary/intent-classifier.ts` | Secretary intent classification |
| `packages/ai/src/agents/secretary/tool-groups.ts` | Intent → tool mapping + forced tool_choice |
| `packages/ai/src/agents/editor-deep/intent-classifier.ts` | Editor intent classification |
| `packages/ai/src/agents/editor-deep/tool-groups.ts` | Intent → tool mapping + forced tool_choice |

## Files to Modify

| File | Change |
|------|--------|
| `packages/ai/src/agents/secretary/agent.ts` | Replace `createDeepAgent` with reactive loop + two-pass architecture |
| `packages/ai/src/agents/secretary/prompts.ts` | Remove "FORBIDDEN TOOLS" section, split into per-intent prompt builders |
| `packages/ai/src/agents/editor-deep/agent.ts` | Replace `createDeepAgent` with reactive loop + two-pass architecture |
| `packages/ai/src/agents/editor-deep/prompts.ts` | Minor cleanup (already concise at ~77 lines) |

## Files NOT Changed (Frontend)

- `apps/web/src/services/ai.service.ts` — No changes (SSE events identical)
- `apps/web/src/stores/ai.ts` — No changes
- `apps/web/src/composables/useDiffBlocks.ts` — No changes
- `apps/api/src/routes/agent.ts` — No changes (routing logic untouched)
- `apps/api/src/routes/secretary.ts` — No changes

---

## Implementation Order

1. **Phase 1** (Secretary: remove deepagents) — lowest risk, immediate improvement
2. **Phase 2** (Secretary: intent classifier + tool groups) — significant reliability boost
3. **Phase 3** (EditorDeep: same treatment) — applies proven pattern
4. **Phase 4** (tool_choice forcing) — optimization on top of classifier

Each phase is independently deployable and testable.

---

## Verification

### Unit Tests

```bash
# New test files:
packages/ai/src/agents/secretary/intent-classifier.test.ts
packages/ai/src/agents/secretary/tool-groups.test.ts
packages/ai/src/agents/editor-deep/intent-classifier.test.ts
```

**Intent classifier test matrix** (sample):
- "read my plan" → `read_info` (NOT `modify_roadmap`)
- "what's today?" → `read_info` (NOT `daily_plan`)
- "generate tomorrow" → `daily_plan`
- "push everything back 30 min" → `schedule_disruption` (NOT `modify_schedule`)
- "I have standup every day at 9:30" → `recurring`
- "yes save it" (with pending roadmap) → `save_roadmap`
- "make the intro shorter" → `edit_content`
- "create a timer" → `create_artifact`

### Regression Tests

```bash
# Existing tests must still pass:
pnpm test:run packages/ai/src/agents/secretary/
pnpm test:run packages/ai/src/agents/editor-deep/
```

### Integration Smoke Test

1. Start dev servers: `pnpm dev`
2. Secretary: Send "read my plan" → should call `read_memory_file` immediately (not ask for content)
3. Secretary: Send "create a 2-week RL roadmap" → should call `create_roadmap` tool
4. Editor: Send "what is this note about?" → should call `answer_question_about_note`
5. Editor: Send "add a section about testing" → should call `add_paragraph`
6. Verify no `edit_file` or `read_file` phantom tool calls in SSE stream
