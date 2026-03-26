# Track 2: EditorDeepAgent — Test & Verify Plan

## Context

Inkdown/Noteshell is preparing for public launch (26 beta → 500 users). The AI testing matrix (`docs/todos/snappy-tickling-acorn.md`) defines 6 tracks. Track 1 (Security Audit) is complete (all fixes in uncommitted changes). This plan executes **Track 2: EditorDeepAgent** — the core inline AI editing experience.

**Goal:** Verify all 10 ED scenarios through code review + unit tests, present findings for P0 issues before fixing, and leave permanent test coverage for CI.

---

## Current Test Coverage (Gaps Analysis)

Existing test files:

- `agent.test.ts` — 3 tests (happy path, fast-path summary, error handling)
- `tools.test.ts` — 2 tests (noteId fallback, no-note clarification)
- `memory.test.ts` — 2 tests (scope ranking, distill stores note_summary)
- `history.test.ts` — 2 tests (ascending order, char budget trimming)

**Critical gaps (no tests exist):**

- `spliceAtBlockIndex` — 0 tests (ED-05, used by every edit tool)
- `adaptAISDKStream` — 0 tests (ED-02, entire SSE pipeline)
- `create_note` tool — 0 tests (ED-03, empty-note flow)
- `isNoteSummaryRequest` — only 3/6 phrases tested, no negatives (ED-10)
- `summarizeNoteContent` — 0 tests (ED-10)
- `buildMarkdownTable` — 0 tests (insert_table depends on this)
- `resolveAfterHeadingIndex` — 0 tests (section targeting)
- `isTransientError` — 0 tests (ED-06, model fallback gate)
- Memory preference detection regex — only note_summary tested, not preference path (ED-09)
- `insert_table` JSON parse safety — 0 tests (known risk from plan doc)
- Model fallback loop — 0 tests (ED-06, only error-throw tested)
- `normalizeMessageForIntent` — 0 tests (gate for fast-path)
- `proposeNoteEdit` event shape — 0 tests (ED-02)

---

## Execution Plan

### Phase 1: spliceAtBlockIndex Tests (ED-05) [P1]

**File:** `packages/ai/src/agents/editor-deep/tools.test.ts` (extend existing)

Export `spliceAtBlockIndex` as a named export for testing (it's currently a private function — add a `/* @internal */` export or test via tool execution).

**Decision:** Since `spliceAtBlockIndex` is a private function, test it indirectly through `add_paragraph`, `edit_paragraph`, `remove_paragraph` tools, OR extract to a utility and export. Recommendation: Extract to a small exported helper since it's pure and critical.

Tests to add:

1. `insert-after` with valid blockIndex → content inserted at correct position
2. `insert-after` with blockIndex >= blocks.length → appends to end
3. `insert-after` with blockIndex < 0 → appends to end
4. `insert-after` with blockIndex = undefined → appends to end
5. `replace` with valid blockIndex → block content replaced
6. `replace` with OOB blockIndex → returns original unchanged
7. `remove` with valid blockIndex → block removed, trailing newlines consumed
8. `remove` with OOB blockIndex → returns original unchanged
9. Empty content input → returns newContent or empty string
10. Single-block document → all operations work
11. Multi-block with headings, lists, code → preserves structure
12. Whitespace preservation (the whole reason this function exists)

**Critical files:**

- `packages/ai/src/agents/editor-deep/tools.ts:64-112`
- `packages/ai/src/utils/structureParser.ts` (dependency)

### Phase 2: Stream Adapter Tests (ED-02) [P0]

**File:** `packages/ai/src/agents/editor-deep/ai-sdk-stream-adapter.test.ts` (new)

Tests:

1. text-delta events → emits assistant-start (once) + assistant-delta for each
2. tool-call event → emits tool-call with id, toolName, arguments (input field mapped)
3. tool-result event → emits tool-result + drains pendingEvents
4. Pending events drained AFTER tool-result (not before, not during)
5. Multiple pending events (edit-proposal + note-navigate) drained in order
6. tool-error → emits error event with tool name
7. End of stream → sanitizeOutput called on accumulated text → assistant-final
8. End of stream → remaining pendingEvents drained
9. End of stream → done event with threadId
10. Empty stream (no text) → no assistant-final, still emits done
11. reasoning-delta → emits thinking event

**Mocks needed:** `sanitizeOutput` (mock to return input unchanged for most tests, test sanitization in specific case)

**Critical files:**

- `packages/ai/src/agents/editor-deep/ai-sdk-stream-adapter.ts`
- `packages/ai/src/safety/output-guard.ts` (mock)

### Phase 3: create_note Tool + proposeNoteEdit Event Shape (ED-03) [P0]

**File:** `packages/ai/src/agents/editor-deep/tools.test.ts` (extend)

Tests:

1. `create_note` → Supabase insert called with empty content, title set
2. `create_note` → emits `note-navigate` BEFORE `edit-proposal`
3. `create_note` → edit-proposal has `original: ''`, `proposed: content`, `structure: []`
4. `proposeNoteEdit` event shape → `{noteId, original, proposed, structure}` with correct types
5. `proposeNoteEdit` reads current content when originalContent not provided
6. `add_paragraph` on existing note → emits edit-proposal with correct original/proposed
7. `edit_paragraph` with valid blockIndex → emits edit-proposal with replaced content
8. `remove_paragraph` with valid blockIndex → emits edit-proposal with removed content

**Mocks needed:** `executeTool` (already mocked in existing test), Supabase stub (extend for insert+select+single chain)

**Critical files:**

- `packages/ai/src/agents/editor-deep/tools.ts:124-156` (proposeNoteEdit)
- `packages/ai/src/agents/editor-deep/tools.ts:279-326` (create_note)

### Phase 4: Agent-Level Tests (ED-01, ED-06, ED-10) [P0/P1/P2]

**File:** `packages/ai/src/agents/editor-deep/agent.test.ts` (extend)

Tests to add:

**ED-01 (P0) — Tool loop limit:**

1. Verify ToolLoopAgent constructor receives `stopWhen: stepCountIs(20)` (inspect mock args)
2. Verify 20 tool-result events → stream ends (already partially covered by mock)

**ED-06 (P1) — Model fallback:** 3. Primary throws 429 error → fallback used, "Switching to..." thinking event emitted 4. Primary throws non-transient error → no fallback, error propagated 5. Both models fail → error event + assistant-final + done

**ED-10 (P2) — Deterministic summary:** 6. Add missing phrases: `'summarize this note'`, `'summary of this note'`, `'about this note'` 7. Non-matching phrases: `'edit this note'`, `'what about cats'`, `'summarize cats'` 8. `summarizeNoteContent` with empty content → "is currently empty" 9. `summarizeNoteContent` with 1 paragraph → single bullet 10. `summarizeNoteContent` with 5 paragraphs → only first 3, truncated at 180 chars

**Additional `isTransientError` tests** (in `ai-sdk-factory.test.ts` or inline): 11. `'rate limit exceeded'` → true 12. `'503 Service Unavailable'` → true 13. `'429 Too Many Requests'` → true 14. `'high demand'` → true 15. `'Resource exhausted'` → true 16. `'Invalid API key'` → false 17. `'Network timeout'` → false

**Critical files:**

- `packages/ai/src/agents/editor-deep/agent.ts:160-198` (fallback loop)
- `packages/ai/src/agents/editor-deep/agent.ts:169` (stepCountIs)
- `packages/ai/src/agents/editor-deep/agent.ts:305-420` (summary fast-path)
- `packages/ai/src/providers/ai-sdk-factory.ts:191-194` (isTransientError)

### Phase 5: Memory Tests (ED-09) [P2]

**File:** `packages/ai/src/agents/editor-deep/memory.test.ts` (extend)

Tests to add:

1. Preference regex: `"please always use bullet points"` → triggers write with `preference_*` key
2. Preference regex: `"never use technical jargon"` → triggers write
3. Preference regex: `"avoid long paragraphs"` → triggers write
4. Non-preference: `"what's this note about"` → no preference write (only note_summary)
5. `toKeyFragment` produces valid key from complex input
6. Preference stored with workspace scope when workspaceId present
7. Preference stored with user scope when no workspaceId
8. note_summary memory excludes from buildContextSummary (existing filter at line 147)

**Critical files:**

- `packages/ai/src/agents/editor-deep/memory.ts:170-198`
- `packages/ai/src/agents/editor-deep/memory.ts:186-198` (preference regex)

### Phase 6: Additional Coverage (buildMarkdownTable, insert_table, resolveAfterHeadingIndex)

**File:** `packages/ai/src/agents/editor-deep/tools.test.ts` (extend)

Tests:

1. `buildMarkdownTable` with headers + rows → valid markdown table
2. `buildMarkdownTable` with title → `### title` header above table
3. `buildMarkdownTable` with empty rows → table with headers only
4. `buildMarkdownTable` with mismatched row length → pads with empty strings
5. `insert_table` with invalid JSON rows → empty table (graceful degradation)
6. `insert_table` with valid JSON rows → correct table inserted
7. `resolveAfterHeadingIndex` finds heading → returns correct index
8. `resolveAfterHeadingIndex` no match → returns undefined

### Phase 7: Frontend Code Review (ED-03, ED-04, ED-07, FE overlap)

**No code changes — review only.** Document findings for:

**ED-03: Empty note diff injection** (`useDiffBlocks.ts:168-180`)

- Verify `isEmptyNote` path handles `original: ''`
- Verify `setMarkdown('')` called when editor has content but edit says empty
- Verify blocks inserted sequentially with `insertBefore(head)` then `insertAfter(last)`

**ED-04: Content mismatch guard** (`useDiffBlocks.ts:187-195`)

- Verify returns `false` when editor empty + edit has non-empty original
- Verify skips check when `appliedEditIds.size > 0` (incremental edits)

**ED-07: DOM disconnected guard** (`useDiffBlocks.ts:157-159`)

- Verify `domNode.isConnected` check on scrollPage

**ED-08: Subagent failure handling**

- REVISED: EditorDeepAgent does NOT use subagents. The NoteSubagent/ArtifactSubagent/TableSubagent are used by other agents. For EditorDeepAgent, tool failures are handled by AI SDK's tool-error event → adapter emits error → agent continues.

**Known risks to document:**

- `pendingEvents` shared mutable array (race if tools execute concurrently within a step)
- `appliedEditIds` Set grows unboundedly
- `insert_table` rows parsed from JSON string silently produces empty table on invalid JSON
- `mapLineToBlockIndex` discrepancy between parser and Muya block structure

### Phase 8: Verification

1. `pnpm test:run packages/ai/src/agents/editor-deep/` — all new + existing tests pass
2. `pnpm test:run packages/ai/src/providers/ai-sdk-factory.test.ts` — isTransientError tests pass
3. `pnpm build && pnpm typecheck && pnpm lint` — no regressions
4. `pnpm test:run` — full suite green

---

## Files to Create/Modify

| File                                                               | Action                                                                                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ai/src/agents/editor-deep/tools.ts`                      | Export `spliceAtBlockIndex`, `buildMarkdownTable`, `resolveAfterHeadingIndex` for testing                                                     |
| `packages/ai/src/agents/editor-deep/tools.test.ts`                 | Extend: spliceAtBlockIndex (12), create_note (3), proposeNoteEdit (5), buildMarkdownTable (4), insert_table (2), resolveAfterHeadingIndex (2) |
| `packages/ai/src/agents/editor-deep/ai-sdk-stream-adapter.test.ts` | New: 11 tests                                                                                                                                 |
| `packages/ai/src/agents/editor-deep/agent.test.ts`                 | Extend: ED-01 (2), ED-06 (3), ED-10 (7)                                                                                                       |
| `packages/ai/src/agents/editor-deep/memory.test.ts`                | Extend: ED-09 (8)                                                                                                                             |
| `packages/ai/src/providers/ai-sdk-factory.test.ts`                 | Extend: isTransientError (7)                                                                                                                  |

**Estimated new tests: ~66 tests across 5 files**

---

## Findings Report Format

After each phase, present findings as:

```
### ED-XX: [Scenario Name] — [PASS | BUG | RISK]

**Code path:** file.ts:lines
**Expected:** [what the plan says]
**Actual:** [what the code does]
**Evidence:** [test name or code excerpt]
**Action needed:** [none | fix proposed | discussion needed]
```
