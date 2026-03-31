# AI Evaluation Framework — Design Spec

> **Goal:** Launch-gate eval framework for Noteshell's AI system, starting with the EditorDeep note editor agent. Architected to support regression detection and continuous improvement flywheel later.
>
> **Primary pain points:** (1) Notes are shallow bullet-point lists instead of deep prose, (2) Citations are scattered inline instead of gathered in a Sources section at the bottom.

---

## Architecture Overview

```
+-----------------------------------------------------+
|                   EVAL RUNNER                        |
|  (orchestrates suites, collects results, reports)    |
+-----------------------------------------------------+
|  Layer 1: TEST CASES (prompts + context + expected)  |
|  Layer 2: OUTPUT CAPTURE (run agent, capture events) |
|  Layer 3: EVALUATORS (structural + judge + functional)|
|  Layer 4: REPORTING (scores + diagnostics + fixes)   |
+-----------------------------------------------------+
```

**Layer 1 — Test Cases:** Dataset of 40 prompts with simulated editor context and quality expectations.

**Layer 2 — Output Capture:** Runs the actual EditorDeep agent against each test case in isolation. Captures the full event stream — text, tool calls, edit proposals, artifacts, everything.

**Layer 3 — Evaluators:** Three types:

- **Structural** — deterministic regex/parser checks (fast, free)
- **LLM Judge** — rubric-based scoring with calibration (nuanced, ~$0.04/call)
- **Functional** — for artifacts: headless browser render + JS execution check

**Layer 4 — Reporting:** Aggregates into launch-readiness scorecard. Compares against baselines. Flags regressions. Produces actionable fix signals.

---

## Core Principle: Score + Diagnosis + Fix Signal

Every eval failure produces three outputs:

```
Score:      "Depth: 2/5"
Diagnosis:  "Agent skipped web_search despite topic requiring current data.
             Content restates training knowledge, not fresh sources."
Fix Signal: { component: "system-prompt", file: "prompts.ts",
              suggestion: "Strengthen web search mandate with examples",
              confidence: "high" }
```

This is what makes the framework actionable vs. academic.

---

## Schema Types

### Layer 1: Test Cases

```typescript
type TestCategory =
  | 'note-creation'
  | 'note-editing'
  | 'artifact'
  | 'table'
  | 'citation-heavy'
  | 'tool-selection'

type Difficulty = 'basic' | 'intermediate' | 'advanced'

interface EvalTestCase {
  id: string // "nc-001", "ep-003"
  name: string // Human-readable
  category: TestCategory
  difficulty: Difficulty
  prompt: string // The user message
  context: AgentContext // Simulated editor state
  expectations: QualityExpectations // What "good" looks like
  tags: string[] // For filtering
}

interface AgentContext {
  currentNoteId?: string // null = no note open
  preloadedContent?: string // Existing note markdown (for edits)
  projectId?: string
  selectedText?: string
  selectedBlockIds?: string[]
  workspaceNotes?: Array<{
    id: string
    title: string
    snippet: string
  }>
}

interface QualityExpectations {
  outputType: 'note' | 'edit-proposal' | 'artifact' | 'table'

  // Automated thresholds (hard pass/fail)
  structural: {
    minWordCount?: number
    maxWordCount?: number
    maxBulletRatio?: number // 0.20 = 20%
    citationPlacement?: 'bottom-only'
    minCitationCount?: number
    formattingRules?: string[] // ["no-hr", "valid-math", "heading-hierarchy"]
  }

  // Behavioral expectations (tool usage)
  behavior: {
    mustCallTools?: string[] // ["web_search"]
    mustNotCallTools?: string[] // ["create_note"] for edit requests
    mustReadBeforeEdit?: boolean
    expectedToolOrder?: string[]
    maxToolCalls?: number
  }

  // Quality thresholds (LLM judge, 1-5)
  quality: {
    minDepth?: number
    minStructure?: number
    minCitationIntegrity?: number
    minSynthesis?: number
    minIntentAlignment?: number
    minVoicePreservation?: number // For edits
    minDesignQuality?: number // For artifacts
  }
}
```

### Layer 2: Output Capture

```typescript
interface CapturedOutput {
  testCaseId: string
  runId: string
  timestamp: string
  model: string

  // Actual outputs
  finalText: string // Assistant response text
  generatedContent?: string // Note/edit markdown
  toolCalls: ToolCallRecord[]
  editProposals: EditProposalRecord[]
  artifacts: ArtifactRecord[]
  events: StreamEvent[] // Full SSE event log

  // Performance
  metrics: {
    totalTokens: number
    inputTokens: number
    outputTokens: number
    latencyMs: number
    estimatedCost: number
    toolCallCount: number
    stepCount: number
  }
}

interface ToolCallRecord {
  seq: number
  toolName: string
  arguments: Record<string, unknown>
  result: string
  durationMs: number
  success: boolean
}

interface EditProposalRecord {
  noteId: string
  original: string
  proposed: string
  structure: Array<{ type: string; lines: string }>
}

interface ArtifactRecord {
  title: string
  html: string
  css: string
  javascript: string
}
```

### Layer 3: Evaluators

```typescript
type EvaluatorType = 'automated' | 'llm-judge' | 'functional'

interface DimensionResult {
  dimension: string
  evaluatorType: EvaluatorType
  score: number // 1-5 (judge) or 0/1 (pass/fail)
  maxScore: number
  pass: boolean
  evidence: string // "Lines 12-18 are bullet lists"
  diagnosis: string // "Agent skipped web_search"
  fixSignal: FixSignal
}

interface FixSignal {
  component:
    | 'system-prompt'
    | 'tool-definition'
    | 'model-choice'
    | 'temperature'
    | 'tool-schema'
    | 'post-processing'
    | 'context-injection'
    | 'memory-retrieval'
  file?: string
  suggestion: string
  confidence: 'high' | 'medium' | 'low'
}
```

### Layer 3.5: Judge Calibration

```typescript
interface CalibrationExample {
  dimension: string
  score: number // Human-assigned ground truth
  output: string
  reasoning: string
}

// Before each run, judge scores calibration set.
// If |judgeScore - humanScore| > 0.5 average -> run is INVALID
interface CalibrationCheck {
  dimension: string
  examples: CalibrationExample[]
  judgeScores: number[]
  humanScores: number[]
  meanDeviation: number
  calibrated: boolean // meanDeviation <= 0.5
}
```

### Layer 4: Results & Reporting

```typescript
interface EvalResult {
  testCaseId: string
  runId: string
  timestamp: string
  model: string
  output: CapturedOutput
  dimensions: DimensionResult[]
  compositeScore: number
  pass: boolean
  failures: string[]
  diagnostics: {
    toolTrace: string // "web_search -> read_note -> edit_paragraph"
    toolSelectionCorrect: boolean
    readBeforeEdit: boolean | null
    webSearchWhenNeeded: boolean | null
    citationPlacementCorrect: boolean | null
    bulletRatio: number
    wordCount: number
    formattingViolations: string[]
    agentSteps: number
  }
  topFixSignals: FixSignal[]
  previousScore?: number
  delta?: number
}

interface EvalSuiteReport {
  suiteId: string
  runDate: string
  model: string
  totalCases: number
  passed: number
  failed: number
  compositeAverage: number

  byCategory: Record<
    TestCategory,
    {
      count: number
      avgComposite: number
      passRate: number
      weakestDimension: string
      strongestDimension: string
    }
  >

  byDimension: Record<
    string,
    {
      avgScore: number
      passRate: number
      worstCases: string[]
    }
  >

  byDifficulty: Record<
    Difficulty,
    {
      avgScore: number
      passRate: number
    }
  >

  regressions: Array<{
    testCaseId: string
    dimension: string
    previousScore: number
    currentScore: number
    delta: number
  }>

  topIssues: Array<{
    issue: string
    affectedCases: string[]
    fixSignal: FixSignal
    estimatedImpact: string
  }>

  launchReady: boolean
  launchThreshold: number
  blockers: string[]
}
```

---

## Eval Dimensions — Full Rubrics

### Note Creation Dimensions

#### D1: Depth (LLM judge, 1-5)

| Score | Criteria                                                                       |
| ----- | ------------------------------------------------------------------------------ |
| 1     | Surface-level bullet points listing facts with no explanation                  |
| 2     | Facts with brief one-sentence explanations. "What" but no "why"                |
| 3     | Adequate — explains key concepts with some examples                            |
| 4     | Thorough with examples, analogies, connections between ideas                   |
| 5     | Expert-level: multiple perspectives, nuanced understanding, original synthesis |

#### D2: Structural Narrative (LLM judge, 1-5)

| Score | Criteria                                                               |
| ----- | ---------------------------------------------------------------------- |
| 1     | Information dump, no headings, no flow                                 |
| 2     | Has headings but sections could be in any order                        |
| 3     | Reasonable intro + body + end with some transitions                    |
| 4     | Clear progression, each section builds on previous, good transitions   |
| 5     | Compelling narrative arc, reader is pulled through, smooth transitions |

#### D3: Citation Integrity (Automated + LLM judge, 1-5)

| Score | Criteria                                                                                  |
| ----- | ----------------------------------------------------------------------------------------- |
| 1     | No citations despite factual claims, or URLs scattered randomly                           |
| 2     | Some inline `[Title](URL)` but no references section                                      |
| 3     | Mixed — some inline, some at bottom, inconsistent format                                  |
| 4     | References section exists with most citations, 1-2 stragglers inline                      |
| 5     | Clean `## Sources` at bottom, every source has title + URL + context, zero inline clutter |

Automated pre-check: regex for `\[.*?\]\(https?://.*?\)` outside `## Sources`/`## References` section.

#### D4: Synthesis Quality (LLM judge, 1-5)

| Score | Criteria                                                                      |
| ----- | ----------------------------------------------------------------------------- |
| 1     | Direct copy/paraphrase from single source                                     |
| 2     | Paraphrases multiple sources but treats them independently                    |
| 3     | Some connections between ideas from different sources                         |
| 4     | Weaves information from multiple sources into coherent argument               |
| 5     | Original insight beyond any single source, identifies patterns/contradictions |

#### D5: Bullet-to-Prose Ratio (Automated)

- `bulletListWords / totalWords * 100`
- <=15% = excellent, 16-30% = acceptable, 31-50% = warning, >50% = fail
- Skipped if user explicitly requested bullet points

#### D6: Formatting Compliance (Automated, pass/fail checklist)

- No horizontal rules (`---` or `***`)
- Math: `$...$` inline, `$$...$$` display (no `\[...\]`)
- Valid parseable markdown
- Heading hierarchy: H2 -> H3 (no H4 under H2 directly)
- No empty sections (heading immediately followed by another heading)

### Edit Proposal Dimensions

- **E1 Intent Alignment** (LLM judge, 1-5): Does the edit do what was asked?
- **E2 Minimality** (Automated): `changedChars / totalChars` — flag if >60% changed for small edit requests
- **E3 Content Preservation** (Automated): Diff untouched sections — any change is failure
- **E4 Block Targeting** (Automated): Does blockIndex match the referenced section?
- **E5 Voice Preservation** (LLM judge, 1-5): Edited text matches surrounding style

### Artifact Dimensions

- **A1 Functional Correctness** (Functional): Headless browser render — renders? Console errors? Uncaught exceptions?
- **A2 Sandbox Compliance** (Automated, hard fail): No banned tags/APIs (localStorage, sessionStorage, window.parent, etc.)
- **A3 Intent Alignment** (LLM judge, 1-5): Does it do what was asked?
- **A4 Design Quality** (LLM judge, 1-5): Clean, responsive, professional CSS

### Table Dimensions

- **T1 Data Accuracy** (LLM judge, 1-5): Values correct and relevant
- **T2 Structure** (LLM judge, 1-5): Right columns/rows, descriptive headers, logical organization
- **T3 Markdown Validity** (Automated, hard fail): Parses as valid markdown table
- **T4 Intent Alignment** (LLM judge, 1-5): Presents what was asked

### Tool Usage Dimensions (cross-cutting)

- **U1 Tool Selection** (LLM judge, 1-5): Right tool for the task
- **U2 Read-Before-Edit** (Automated, pass/fail): If editing, did it read first?
- **U3 Search-When-Needed** (Automated, pass/fail): Time-sensitive keywords trigger web_search?

---

## Composite Scoring Weights

### Note Creation

| Dimension          | Weight                            |
| ------------------ | --------------------------------- |
| Depth              | 30%                               |
| Structure          | 25%                               |
| Citation Integrity | 20% (0% if no citations expected) |
| Synthesis          | 15%                               |
| Formatting         | 10%                               |

### Edit Proposals

| Dimension            | Weight |
| -------------------- | ------ |
| Intent Alignment     | 35%    |
| Content Preservation | 25%    |
| Minimality           | 20%    |
| Voice Preservation   | 10%    |
| Formatting           | 10%    |

### Artifacts

| Dimension              | Weight          |
| ---------------------- | --------------- |
| Functional Correctness | 35%             |
| Intent Alignment       | 30%             |
| Design Quality         | 20%             |
| Sandbox Compliance     | 15% (hard fail) |

### Tables

| Dimension         | Weight          |
| ----------------- | --------------- |
| Data Accuracy     | 40%             |
| Intent Alignment  | 25%             |
| Structure         | 25%             |
| Markdown Validity | 10% (hard fail) |

---

## Test Case Distribution (40 cases)

| Category                  | Count | Focus                             | Key Dimensions                        |
| ------------------------- | ----- | --------------------------------- | ------------------------------------- |
| Note creation — basic     | 5     | General knowledge topics          | Depth, structure, bullet ratio        |
| Note creation — research  | 5     | Current events + web search       | Citations, synthesis, search behavior |
| Note creation — technical | 5     | Code, math, complex topics        | Formatting, depth, accuracy           |
| Edit proposals — simple   | 3     | Typo fix, small change            | Minimality, preservation, targeting   |
| Edit proposals — complex  | 5     | Section rewrite, restructure      | Intent, voice, structure              |
| Artifacts                 | 5     | Calculator, chart, quiz, timeline | Functional, sandbox, design           |
| Tables                    | 5     | Comparisons, data organization    | Accuracy, structure, validity         |
| Tool selection            | 4     | Ambiguous prompts                 | Behavioral checks                     |
| Citation-heavy            | 3     | "Latest research on X"            | Citation count, placement, diversity  |

---

## Launch Readiness Thresholds

| Metric                         | Threshold  | Rationale                   |
| ------------------------------ | ---------- | --------------------------- |
| Overall composite average      | >= 3.5/5.0 | "Good enough to ship"       |
| Note creation average          | >= 3.5/5.0 | Core product must be strong |
| No single dimension below      | 2.5/5.0    | No catastrophic weakness    |
| Automated checks pass rate     | >= 90%     | Structural basics           |
| Artifact render rate           | 100%       | Every artifact must work    |
| Citation placement correctness | >= 80%     | Bottom-gathered citations   |

---

## Judge Design

### Judge Model Selection

Use a **different model family** than the generator to avoid self-serving bias. If generating with Gemini, judge with Claude Sonnet (or vice versa).

### Judge Prompt Structure

```
1. ROLE: "You are a strict editor evaluating AI-generated content"
2. RUBRIC: The 1-5 scale for this dimension (with anchored descriptions)
3. CALIBRATION: 2-3 golden examples with pre-scored outputs
4. OUTPUT: The content to evaluate
5. FORMAT: Return JSON { score, evidence, diagnosis, suggestion }
```

### Calibration Protocol

Before each eval run:

1. Judge scores 2-3 calibration examples per dimension
2. Compare judge scores to human-assigned ground truth
3. If mean |judge - human| > 0.5 -> eval run is INVALID
4. Re-calibrate by adjusting rubric wording or examples

---

## Cost Estimate

```
40 test cases x agent generation:        ~$1.50  (gemini-2.5-pro)
40 cases x ~4 judge dimensions each:     ~$1.60  (claude-sonnet)
Calibration check (15 examples):         ~$0.20
---------------------------------------------
Total per run:                           ~$3.30
Weekly runs:                             ~$14/month
```

---

## File Structure

```
packages/ai/src/evals/
  types.ts                  # All TypeScript types from this spec
  runner.ts                 # EvalRunner orchestrator
  capture.ts                # Output capture (runs agent, collects events)
  evaluators/
    structural.ts           # Automated checks (bullet ratio, citations, formatting)
    llm-judge.ts            # LLM-as-judge with rubric + calibration
    functional.ts           # Artifact rendering (headless browser)
  judge/
    prompts.ts              # Judge system prompts per dimension
    calibration.ts          # Calibration examples + validation
  test-cases/
    note-creation.json      # 15 test cases
    edit-proposals.json     # 8 test cases
    artifacts.json          # 5 test cases
    tables.json             # 5 test cases
    tool-selection.json     # 4 test cases
    citation-heavy.json     # 3 test cases
  golden/
    calibration.json        # Human-scored golden examples per dimension
  reporting/
    reporter.ts             # Aggregate results into EvalSuiteReport
    formatter.ts            # CLI output formatter (scorecard)
  index.ts                  # Public API: runEvalSuite(), runSingleCase()
```

---

## Future Extensions (not in scope now)

- **Regression CI:** Run eval suite on PR when prompt files change
- **Dashboard:** Web UI for historical score tracking
- **Flywheel pipeline:** Failed cases -> prompt improvement suggestions -> re-eval
- **Human eval mode:** Present outputs to human raters for calibration
- **Secretary/Research/Course evals:** Extend framework to other agents
- **A/B testing:** Compare two prompt versions side by side
