# AI Eval Framework — Implementation Plan

## Context

Noteshell's AI system (Stage 9 in the 12-stage plan) has no formal evaluation framework. The two primary quality problems are:

1. **Shallow notes** — EditorDeep creates bullet-point lists instead of deep prose
2. **Scattered citations** — URLs appear inline instead of gathered in a `## Sources` section

This plan implements the eval framework designed in `docs/superpowers/specs/2026-03-29-ai-eval-framework-design.md`. The framework evaluates EditorDeep agent output across 6 dimensions using 3 evaluator types (automated structural checks, LLM-as-judge, functional tests) with 40 test cases, producing a launch-readiness scorecard with actionable fix signals.

## Critical Files

### To Create

```
packages/ai/src/evals/
  types.ts                        # All eval types (TestCase, CapturedOutput, DimensionResult, etc.)
  runner.ts                       # EvalRunner class — orchestrates full suite
  capture.ts                      # OutputCapture — runs agent, collects all events
  evaluators/
    structural.ts                 # Automated checks (bullet ratio, citations, formatting)
    llm-judge.ts                  # LLM-as-judge with rubric scoring + calibration
    functional.ts                 # Artifact rendering checks (headless browser)
  judge/
    prompts.ts                    # Judge system prompts per dimension (depth, structure, etc.)
    calibration.ts                # Calibration examples + validation logic
  test-cases/
    note-creation.json            # 15 test cases
    edit-proposals.json           # 8 test cases
    artifacts.json                # 5 test cases
    tables.json                   # 5 test cases
    tool-selection.json           # 4 test cases
    citation-heavy.json           # 3 test cases
  reporting/
    reporter.ts                   # Aggregates results → EvalSuiteReport
    formatter.ts                  # CLI output (scorecard format)
  index.ts                        # Public API: runEvalSuite(), runSingleCase()
```

### To Modify

```
packages/ai/package.json          # Add eval script
package.json (root)               # Add pnpm eval command
vitest.config.ts                  # Exclude evals/ from normal test runs
```

### To Reuse (existing code)

```
packages/ai/src/agents/editor-deep/agent.ts           # EditorDeepAgent class (run/stream)
packages/ai/src/agents/editor-deep/tools.ts            # createEditorDeepTools()
packages/ai/src/agents/editor-deep/prompts.ts          # System prompt (reference for rubrics)
packages/ai/src/providers/ai-sdk-factory.ts            # createAIModel(), getModelsForTask()
packages/ai/src/providers/model-registry.ts            # MODEL_REGISTRY, ModelEntry
packages/ai/src/providers/ai-sdk-usage.ts              # trackAISDKUsage()
packages/ai/src/safety/citation-verifier.ts            # verifyCitations() — reuse for citation eval
packages/ai/src/safety/output-guard.ts                 # sanitizeOutput() — reuse for output checks
packages/ai/src/safety/input-guard.ts                  # detectInjection() — reference pattern
packages/shared/src/types/ai.ts                        # AIUsageRecord, ToolCall types
packages/shared/src/errors.ts                          # AppError, ErrorCode, tryCatch
```

---

## Implementation Steps

### Step 1: Types & Schema Foundation

**Files:** `packages/ai/src/evals/types.ts`

Define all TypeScript types from the design spec:

- `EvalTestCase`, `AgentContext`, `QualityExpectations`
- `CapturedOutput`, `ToolCallRecord`, `EditProposalRecord`, `ArtifactRecord`
- `DimensionResult`, `FixSignal`, `EvaluatorType`
- `CalibrationExample`, `CalibrationCheck`
- `EvalResult`, `EvalSuiteReport`, `CategoryReport`
- `TestCategory`, `Difficulty` union types
- Composite weight configs per output type

Import shared types from `@inkdown/shared/types` where applicable (e.g., `ToolCall`).

---

### Step 2: Output Capture Layer

**Files:** `packages/ai/src/evals/capture.ts`

Build `OutputCapture` class that:

1. Creates an `EditorDeepAgent` instance with eval-specific config
2. Runs `agent.stream(input)` and collects ALL events into `CapturedOutput`
3. Extracts:
   - `finalText` from `assistant-final` events
   - `generatedContent` from `edit-proposal` events (the `proposed` field)
   - `toolCalls` array from `tool-call` + `tool-result` events (paired by id)
   - `editProposals` from `edit-proposal` events
   - `artifacts` from `artifact` events
   - Full `events` array (raw log)
4. Records metrics: token counts, latency, cost (from `onFinish` callback)
5. Handles errors gracefully — captures error events, doesn't crash the suite

**Key decisions:**

- Use `stream()` not `run()` — we need the full event trace for behavioral evaluation
- Each test case gets a fresh agent instance (no state leakage)
- Use a unique `threadId` per test case (no conversation history interference)
- Pass `historyWindowTurns: 0` to disable history loading (eval runs are isolated)

**Supabase handling:**

- Evals need a real Supabase client for tool execution (notes, memory, etc.)
- Use a dedicated `eval-user` with pre-seeded test notes in a test project
- Or mock Supabase for pure prompt-quality evals (faster, no DB dependency)
- **Recommendation:** Support both modes via config flag `{ mode: 'live' | 'mocked' }`

---

### Step 3: Structural Evaluators

**Files:** `packages/ai/src/evals/evaluators/structural.ts`

Implement deterministic checks that run instantly with zero cost:

**3a. `evaluateBulletRatio(content: string): DimensionResult`**

- Parse markdown, identify list blocks vs paragraph blocks
- Count words in each category
- Return ratio + pass/fail against threshold
- Evidence: "X% of content is bullet lists (threshold: Y%)"

**3b. `evaluateCitationPlacement(content: string): DimensionResult`**

- Regex: find all `[...](https://...)` patterns
- Check if they appear inside a `## Sources` or `## References` section
- Flag any inline citations outside that section
- Reuse `verifyCitations()` from `packages/ai/src/safety/citation-verifier.ts`
- Evidence: "Found N inline citations outside Sources section at lines X, Y, Z"

**3c. `evaluateFormattingCompliance(content: string): DimensionResult`**

- Check: no `---` or `***` horizontal rules
- Check: math notation uses `$...$` and `$$...$$` (not `\[...\]`)
- Check: heading hierarchy (no H4 under H2 without H3)
- Check: no empty sections (heading followed by heading)
- Check: valid parseable markdown
- Return checklist of pass/fail per rule
- Evidence: "Violation: horizontal rule at line 45"

**3d. `evaluateWordCount(content: string, min?: number, max?: number): DimensionResult`**

- Simple word count against thresholds
- Evidence: "Word count: X (expected: Y-Z)"

**3e. `evaluateEditMinimality(original: string, proposed: string, expectation: 'small' | 'medium' | 'large'): DimensionResult`**

- Compute edit distance (Levenshtein or character diff)
- Calculate `changedChars / totalChars` ratio
- Flag if ratio > threshold for the expectation level
- Evidence: "Changed 85% of content for a typo-fix request"

**3f. `evaluateContentPreservation(original: string, proposed: string, targetBlockIndex: number): DimensionResult`**

- Split both into blocks
- Verify all blocks EXCEPT targetBlockIndex are identical
- Evidence: "Block 4 was modified but should have been preserved"

**3g. `evaluateToolBehavior(toolCalls: ToolCallRecord[], expectations: BehaviorExpectations): DimensionResult`**

- Check mustCallTools: were required tools called?
- Check mustNotCallTools: were forbidden tools avoided?
- Check mustReadBeforeEdit: was read_note_structure called before edit_paragraph?
- Check web search when needed: was web_search called when prompt contains time-sensitive keywords?
- Evidence: "Agent did not call web_search despite 'latest' keyword in prompt"

---

### Step 4: LLM Judge Evaluator

**Files:** `packages/ai/src/evals/evaluators/llm-judge.ts`, `packages/ai/src/evals/judge/prompts.ts`

**4a. Judge prompt templates** (`judge/prompts.ts`)

For each dimension (depth, structure, citation integrity, synthesis, intent alignment, voice preservation, design quality), create a prompt template:

```typescript
export function buildJudgePrompt(
  dimension: string,
  rubric: RubricDefinition,
  calibrationExamples: CalibrationExample[],
  userPrompt: string,
  agentOutput: string
): string
```

Structure:

1. Role: "You are a strict editor evaluating AI-generated content"
2. Rubric: The 1-5 scale with anchored descriptions for this dimension
3. Calibration: 2-3 few-shot examples with pre-scored outputs
4. Context: The user's original prompt
5. Output to evaluate: The agent's content
6. Format: JSON `{ score: number, evidence: string, diagnosis: string, suggestion: string }`

**4b. Judge invocation** (`evaluators/llm-judge.ts`)

```typescript
export async function evaluateWithJudge(
  dimension: string,
  userPrompt: string,
  agentOutput: string,
  threshold: number,
  options?: { model?: string }
): Promise<DimensionResult>
```

- Use a different model family than the generator (if generating with Gemini, judge with Claude Sonnet via AI Gateway or direct provider)
- Parse JSON response, extract score + evidence + diagnosis
- Generate FixSignal based on diagnosis (map common failure patterns to components)
- Handle judge errors gracefully (return score: 0 with error diagnosis)

**4c. FixSignal generation logic**

Map diagnosis patterns to fix signals:

- "shallow/surface-level" → `{ component: 'system-prompt', suggestion: 'Add depth examples to prompt' }`
- "citations inline" → `{ component: 'system-prompt', suggestion: 'Strengthen citation placement rule' }`
- "wrong tool" → `{ component: 'tool-definition', suggestion: 'Improve tool description clarity' }`
- "no web search" → `{ component: 'system-prompt', suggestion: 'Strengthen web search mandate' }`
- etc.

---

### Step 5: Judge Calibration

**Files:** `packages/ai/src/evals/judge/calibration.ts`

**5a. Calibration dataset** — Hand-scored examples per dimension

Create 2-3 golden examples per LLM-judge dimension (depth, structure, citation integrity, synthesis, intent alignment, voice preservation, design quality = 7 dimensions × 2-3 examples = ~18 examples total).

Each example:

```typescript
{
  dimension: "depth",
  score: 2,  // Human-assigned
  output: "Plants use photosynthesis. They absorb CO2...",  // Short, shallow
  reasoning: "Only states facts, no explanation of mechanisms"
}
```

**5b. Calibration check function**

```typescript
export async function runCalibrationCheck(
  dimension: string,
  examples: CalibrationExample[],
  judgeModel: string
): Promise<CalibrationCheck>
```

- Run judge on each calibration example
- Compute mean |judgeScore - humanScore|
- Return `calibrated: true` if mean deviation <= 0.5
- If not calibrated, the eval run for this dimension is marked INVALID

**5c. Run calibration before eval suite** — if any dimension fails calibration, warn but continue (don't block the entire run; mark that dimension's scores as unreliable)

---

### Step 6: Functional Evaluators (Artifacts)

**Files:** `packages/ai/src/evals/evaluators/functional.ts`

**6a. Artifact rendering check**

```typescript
export async function evaluateArtifactRendering(artifact: ArtifactRecord): Promise<DimensionResult>
```

- Construct full HTML from artifact's `html`, `css`, `javascript`
- Use a simple approach: write to temp file, check for syntax errors
- **Sandbox compliance check:** regex scan for banned patterns:
  - `localStorage`, `sessionStorage`, `IndexedDB`, `document.cookie`
  - `window.parent`, `window.top`, `postMessage`
  - `<html>`, `<head>`, `<body>`, `<script>` tags
- For JS execution: use `vm` module or simple AST parse to detect obvious errors
- **Note:** Full headless browser rendering (Playwright) is a stretch goal — start with static analysis

**6b. Table markdown validity**

```typescript
export function evaluateTableValidity(content: string): DimensionResult
```

- Extract markdown table blocks from content
- Verify: consistent column count, aligned pipes, header row present
- Simple regex-based parsing

---

### Step 7: Test Cases Dataset

**Files:** `packages/ai/src/evals/test-cases/*.json`

Write 40 test cases across 6 JSON files. Each file is an array of `EvalTestCase` objects.

**note-creation.json (15 cases):**

- 5 basic: "photosynthesis", "French Revolution", "how TCP/IP works", "the water cycle", "intro to machine learning"
- 5 research: "latest nuclear fusion developments", "AI regulation in 2026", "recent SpaceX milestones", "current state of quantum computing", "new findings in Alzheimer's research"
- 5 technical: "Fourier Transform with formulas", "React Server Components architecture", "how B-trees work with code", "TLS handshake protocol", "CRISPR gene editing mechanism"

**edit-proposals.json (8 cases):**

- 3 simple: typo fix, add missing period, fix broken link
- 5 complex: rewrite introduction, add limitations section, restructure for clarity, change tone to formal, expand conclusion

Each includes `preloadedContent` with realistic note markdown.

**artifacts.json (5 cases):**

- Calculator, unit converter, interactive timeline, quiz widget, data chart

**tables.json (5 cases):**

- Programming language comparison, historical events timeline, nutrient comparison, API endpoint reference, pros/cons analysis

**tool-selection.json (4 cases):**

- Ambiguous "help me with this note", "add something about X" (should use add_paragraph not edit), "what happened recently with Y" (must search), "make this better" (must read first)

**citation-heavy.json (3 cases):**

- "Research and write about the latest developments in X" with explicit citation expectations

---

### Step 8: Composite Scoring & Reporting

**Files:** `packages/ai/src/evals/reporting/reporter.ts`, `packages/ai/src/evals/reporting/formatter.ts`

**8a. Reporter**

```typescript
export function aggregateResults(results: EvalResult[]): EvalSuiteReport
```

- Compute composite scores per test case (weighted by output type)
- Aggregate by category, dimension, difficulty
- Detect regressions (compare to previous run stored in `evals/baseline.json`)
- Identify top issues (cluster failed dimensions, count affected cases)
- Determine launch readiness against thresholds

**8b. Formatter**

```typescript
export function formatScorecard(report: EvalSuiteReport): string
```

Output a CLI-friendly scorecard:

```
NOTESHELL AI EVAL — Launch Readiness Report
============================================
Date: 2026-03-29 | Model: gemini-2.5-pro
Cases: 40 | Passed: 34 | Failed: 6

OVERALL: 4.1 / 5.0  ✅ LAUNCH-READY (threshold: 3.5)

BY CATEGORY:
  Note Creation:     4.2 / 5.0  ✅  (12/15)
  Edit Proposals:    4.0 / 5.0  ✅  (7/8)
  ...

TOP ISSUES:
  1. Citation placement (affects 4 cases) → system-prompt fix
  2. Bullet ratio too high (affects 3 cases) → system-prompt fix
```

---

### Step 9: Eval Runner (Orchestrator)

**Files:** `packages/ai/src/evals/runner.ts`, `packages/ai/src/evals/index.ts`

**9a. EvalRunner class**

```typescript
export class EvalRunner {
  constructor(config: EvalRunnerConfig)
  async runSuite(options?: {
    categories?: TestCategory[]
    tags?: string[]
  }): Promise<EvalSuiteReport>
  async runSingleCase(testCaseId: string): Promise<EvalResult>
}

interface EvalRunnerConfig {
  supabase: SupabaseClient
  userId: string
  generatorModel?: string // Override agent model
  judgeModel?: string // Override judge model
  mode: 'live' | 'mocked' // DB mode
  baselinePath?: string // Path to previous results for regression detection
  outputPath?: string // Where to save results JSON
}
```

Orchestration flow:

1. Load test cases from JSON files
2. Run calibration check on judge (for each LLM-judge dimension)
3. For each test case:
   a. Create OutputCapture → run agent → collect CapturedOutput
   b. Run structural evaluators
   c. Run LLM judge evaluators (for applicable dimensions)
   d. Run functional evaluators (for artifacts)
   e. Compute composite score
   f. Build EvalResult with diagnostics + fix signals
4. Aggregate all results → EvalSuiteReport
5. Print scorecard to console
6. Save results JSON to outputPath

**9b. Public API** (`index.ts`)

```typescript
export { EvalRunner } from './runner'
export { runEvalSuite, runSingleCase } from './runner'
export type * from './types'
```

---

### Step 10: Script Integration & Configuration

**Files:** `packages/ai/package.json`, root `package.json`, `vitest.config.ts`

**10a. Add eval script to `packages/ai/package.json`:**

```json
{
  "scripts": {
    "eval": "tsx src/evals/cli.ts",
    "eval:single": "tsx src/evals/cli.ts --case"
  }
}
```

**10b. Create CLI entry point** (`packages/ai/src/evals/cli.ts`):

- Parse args: `--category`, `--case`, `--model`, `--judge-model`, `--mode`, `--output`
- Instantiate EvalRunner
- Run suite or single case
- Print scorecard
- Exit with code 1 if launch threshold not met

**10c. Add root-level script:**

```json
{
  "scripts": {
    "eval": "pnpm --filter @inkdown/ai eval"
  }
}
```

**10d. Exclude evals from normal test runs** — update `vitest.config.ts`:

```typescript
exclude: [...configDefaults.exclude, '**/evals/**']
```

---

## Verification

### After each step:

1. `pnpm typecheck` — types compile without errors
2. `pnpm build` — build succeeds
3. `pnpm test:run` — existing tests still pass (evals excluded)

### After Step 10 (full integration):

1. **Run single case:** `pnpm eval --case nc-001 --mode mocked`
   - Verify: agent runs, events captured, structural checks execute, scores printed
2. **Run full suite:** `pnpm eval --mode mocked`
   - Verify: all 40 cases run, scorecard printed, results JSON saved
3. **Run with live DB:** `pnpm eval --mode live`
   - Verify: agent uses real Supabase, tools execute against test data
4. **Verify calibration:** Check that judge calibration passes (mean deviation ≤ 0.5)
5. **Verify regression detection:** Run twice, change a prompt, verify delta reported

### End-to-end smoke test:

```bash
# Full eval suite with scorecard output
cd packages/ai
pnpm eval --output results/eval-$(date +%Y%m%d).json

# Verify output file exists and contains valid JSON
cat results/eval-*.json | jq '.compositeAverage'
```

## Implementation Order & Dependencies

```
Step 1 (types)          ← no dependencies, foundation
Step 2 (capture)        ← depends on Step 1
Step 3 (structural)     ← depends on Step 1
Step 4 (llm-judge)      ← depends on Step 1
Step 5 (calibration)    ← depends on Step 4
Step 6 (functional)     ← depends on Step 1
Step 7 (test cases)     ← depends on Step 1 (uses types for validation)
Step 8 (reporting)      ← depends on Step 1
Step 9 (runner)         ← depends on Steps 2-8 (orchestrates everything)
Step 10 (integration)   ← depends on Step 9

Parallelizable: Steps 3, 4, 6, 7, 8 can be built in parallel after Step 1
```
