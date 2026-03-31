/**
 * Eval Runner — Orchestrates the full evaluation suite
 *
 * Loads test cases, runs agent, evaluates output across all dimensions,
 * and aggregates results into a launch-readiness report.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { OutputCapture } from './capture'
import {
  evaluateBulletRatio,
  evaluateCitationPlacement,
  evaluateFormattingCompliance,
  evaluateWordCount,
  evaluateEditMinimality,
  evaluateContentPreservation,
  evaluateToolBehavior,
} from './evaluators/structural'
import { evaluateWithJudge } from './evaluators/llm-judge'
import { evaluateArtifactRendering, evaluateTableValidity } from './evaluators/functional'
import { runCalibrationCheck } from './judge/calibration'
import { aggregateResults } from './reporting/reporter'
import { formatScorecard } from './reporting/formatter'
import type {
  EvalTestCase,
  TestCategory,
  DimensionResult,
  DimensionName,
  FixSignal,
  EvalResult,
  EvalSuiteReport,
  CalibrationCheck,
  CompositeWeights,
} from './types'
import { DEFAULT_WEIGHTS, EDIT_PROPOSAL_WEIGHTS, ARTIFACT_WEIGHTS, LAUNCH_THRESHOLD } from './types'

// =============================================================================
// Configuration
// =============================================================================

export interface EvalRunnerConfig {
  supabase: SupabaseClient
  userId: string
  generatorModel?: string
  judgeModel?: string
  mode: 'live' | 'mocked'
  baselinePath?: string
  outputPath?: string
  timeoutPerCaseMs?: number
}

// =============================================================================
// Test Case Loading
// =============================================================================

const TEST_CASE_FILES: Record<TestCategory, string> = {
  'note-creation': 'note-creation.json',
  'edit-proposals': 'edit-proposals.json',
  artifacts: 'artifacts.json',
  tables: 'tables.json',
  'tool-selection': 'tool-selection.json',
  'citation-heavy': 'citation-heavy.json',
}

function loadTestCases(categories?: TestCategory[], tags?: string[]): EvalTestCase[] {
  const testCasesDir = join(dirname(new URL(import.meta.url).pathname), 'test-cases')
  const allCases: EvalTestCase[] = []

  const categoriesToLoad = categories ?? (Object.keys(TEST_CASE_FILES) as TestCategory[])

  for (const category of categoriesToLoad) {
    const filePath = join(testCasesDir, TEST_CASE_FILES[category])
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const cases: EvalTestCase[] = JSON.parse(raw)
      allCases.push(...cases)
    } catch {
      console.warn(`[EvalRunner] Could not load test cases from ${filePath}`)
    }
  }

  // Filter by tags if specified
  if (tags && tags.length > 0) {
    return allCases.filter((tc) => tc.tags?.some((t) => tags.includes(t)))
  }

  return allCases
}

// =============================================================================
// Composite Score Computation
// =============================================================================

function selectWeights(category: TestCategory): CompositeWeights {
  switch (category) {
    case 'edit-proposals':
      return EDIT_PROPOSAL_WEIGHTS
    case 'artifacts':
      return ARTIFACT_WEIGHTS
    default:
      return DEFAULT_WEIGHTS
  }
}

function computeCompositeScore(dimensions: DimensionResult[], weights: CompositeWeights): number {
  let weightedSum = 0
  let totalWeight = 0

  for (const dim of dimensions) {
    const weight = weights[dim.dimension] ?? 0
    if (weight > 0) {
      weightedSum += dim.score * weight
      totalWeight += weight
    }
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0
}

// =============================================================================
// Per-Case Evaluation
// =============================================================================

async function evaluateCase(
  testCase: EvalTestCase,
  capture: OutputCapture,
  judgeModel?: string
): Promise<EvalResult> {
  const timestamp = new Date().toISOString()

  // 1. Capture agent output
  let output
  try {
    output = await capture.capture(testCase)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return {
      testCaseId: testCase.id,
      testCase,
      output: {
        finalText: '',
        generatedContent: '',
        toolCalls: [],
        editProposals: [],
        artifacts: [],
        events: [],
        metrics: { inputTokens: 0, outputTokens: 0, totalTokens: 0, latencyMs: 0, costCents: 0 },
      },
      dimensions: [],
      compositeScore: 0,
      passed: false,
      fixSignals: [],
      timestamp,
      error: `Capture failed: ${msg}`,
    }
  }

  const content = output.generatedContent || output.finalText
  const dimensions: DimensionResult[] = []
  const exp = testCase.expectations

  // 2. Structural evaluators — always run
  dimensions.push(evaluateBulletRatio(content, exp.maxBulletRatio))
  dimensions.push(evaluateCitationPlacement(content))
  dimensions.push(evaluateFormattingCompliance(content))
  dimensions.push(evaluateWordCount(content, exp.minWordCount, exp.maxWordCount))

  // Edit-specific evaluators
  if (testCase.category === 'edit-proposals' && output.editProposals.length > 0) {
    const proposal = output.editProposals[0]
    if (proposal.original && exp.editMinimality) {
      dimensions.push(
        evaluateEditMinimality(proposal.original, proposal.proposed, exp.editMinimality)
      )
    }
    if (proposal.original && proposal.blockIndex !== undefined) {
      dimensions.push(
        evaluateContentPreservation(proposal.original, proposal.proposed, proposal.blockIndex)
      )
    }
  }

  // Tool behavior evaluator
  if (exp.behavior) {
    dimensions.push(evaluateToolBehavior(output.toolCalls, exp.behavior))
  }

  // 3. Functional evaluators
  if (testCase.category === 'artifacts' && output.artifacts.length > 0) {
    dimensions.push(evaluateArtifactRendering(output.artifacts[0]))
  }

  if (testCase.category === 'tables') {
    dimensions.push(evaluateTableValidity(content))
  }

  // 4. LLM judge evaluators — for applicable dimensions
  const judgeDimensions: DimensionName[] = ['depth', 'structure', 'intent-alignment']

  // Add synthesis for non-edit cases
  if (testCase.category !== 'edit-proposals') {
    judgeDimensions.push('synthesis')
  }

  // Add citation-integrity for cases with sources
  if (exp.requireSourcesSection) {
    judgeDimensions.push('citation-integrity')
  }

  // Add voice-preservation for edit proposals
  if (testCase.category === 'edit-proposals') {
    judgeDimensions.push('voice-preservation')
  }

  // Add design-quality for artifacts
  if (testCase.category === 'artifacts') {
    judgeDimensions.push('design-quality')
  }

  // Run LLM judge evaluations in parallel
  const judgePromises = judgeDimensions.map((dim) =>
    evaluateWithJudge(dim, testCase.prompt, content, 3, { model: judgeModel }).catch(
      (error): DimensionResult => ({
        dimension: dim,
        evaluator: 'llm-judge',
        score: 0,
        passed: false,
        threshold: 3,
        evidence: `Judge error: ${error instanceof Error ? error.message : String(error)}`,
      })
    )
  )

  const judgeResults = await Promise.all(judgePromises)
  dimensions.push(...judgeResults)

  // 5. Compute composite score
  const weights = selectWeights(testCase.category)
  const compositeScore = computeCompositeScore(dimensions, weights)

  // 6. Collect fix signals
  const fixSignals: FixSignal[] = dimensions
    .filter((d) => d.fixSignal && !d.passed)
    .map((d) => d.fixSignal!)

  return {
    testCaseId: testCase.id,
    testCase,
    output,
    dimensions,
    compositeScore,
    passed: compositeScore >= LAUNCH_THRESHOLD,
    fixSignals,
    timestamp,
  }
}

// =============================================================================
// EvalRunner Class
// =============================================================================

export class EvalRunner {
  private config: EvalRunnerConfig
  private capture: OutputCapture

  constructor(config: EvalRunnerConfig) {
    this.config = config
    this.capture = new OutputCapture({
      supabase: config.supabase,
      userId: config.userId,
      model: config.generatorModel,
      timeoutMs: config.timeoutPerCaseMs,
    })
  }

  async runSuite(options?: {
    categories?: TestCategory[]
    tags?: string[]
  }): Promise<EvalSuiteReport> {
    const testCases = loadTestCases(options?.categories, options?.tags)
    console.log(`[EvalRunner] Running ${testCases.length} test cases...`)

    // Run calibration checks
    const calibrationDimensions: DimensionName[] = [
      'depth',
      'structure',
      'citation-integrity',
      'synthesis',
      'intent-alignment',
      'voice-preservation',
      'design-quality',
    ]
    const calibration: CalibrationCheck[] = []

    console.log('[EvalRunner] Running judge calibration...')
    for (const dim of calibrationDimensions) {
      try {
        const check = await runCalibrationCheck(dim, { model: this.config.judgeModel })
        calibration.push(check)
        const status = check.calibrated ? 'PASS' : 'WARN'
        console.log(`  ${status}: ${dim} (deviation: ${check.meanDeviation.toFixed(2)})`)
      } catch {
        console.warn(`  SKIP: ${dim} calibration failed`)
      }
    }

    // Run test cases sequentially to avoid rate limiting
    const results: EvalResult[] = []
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i]
      console.log(`[EvalRunner] (${i + 1}/${testCases.length}) ${tc.id}: ${tc.title}`)
      const result = await evaluateCase(tc, this.capture, this.config.judgeModel)
      results.push(result)
      const status = result.passed ? 'PASS' : 'FAIL'
      console.log(`  ${status}: ${result.compositeScore.toFixed(2)} / 5.0`)
    }

    // Load baseline for regression detection
    let baseline: EvalSuiteReport | undefined
    if (this.config.baselinePath) {
      try {
        const raw = readFileSync(this.config.baselinePath, 'utf-8')
        baseline = JSON.parse(raw)
      } catch {
        console.warn('[EvalRunner] Could not load baseline')
      }
    }

    // Aggregate results
    const report = aggregateResults(results, {
      model: this.config.generatorModel ?? 'gemini-2.5-pro',
      judgeModel: this.config.judgeModel ?? 'gemini-3-flash-preview',
      calibration,
      baseline,
    })

    // Print scorecard
    console.log('\n' + formatScorecard(report))

    // Save results if outputPath specified
    if (this.config.outputPath) {
      try {
        mkdirSync(dirname(this.config.outputPath), { recursive: true })
        writeFileSync(this.config.outputPath, JSON.stringify(report, null, 2))
        console.log(`[EvalRunner] Results saved to ${this.config.outputPath}`)
      } catch (error) {
        console.error(`[EvalRunner] Failed to save results: ${error}`)
      }
    }

    return report
  }

  async runSingleCase(testCaseId: string): Promise<EvalResult> {
    const allCases = loadTestCases()
    const testCase = allCases.find((tc) => tc.id === testCaseId)

    if (!testCase) {
      throw new Error(`Test case "${testCaseId}" not found`)
    }

    console.log(`[EvalRunner] Running single case: ${testCase.id}: ${testCase.title}`)
    const result = await evaluateCase(testCase, this.capture, this.config.judgeModel)
    const status = result.passed ? 'PASS' : 'FAIL'
    console.log(`  ${status}: ${result.compositeScore.toFixed(2)} / 5.0`)

    // Print dimension breakdown
    for (const dim of result.dimensions) {
      const dimStatus = dim.passed ? 'PASS' : 'FAIL'
      console.log(`  ${dimStatus}: ${dim.dimension} = ${dim.score}/5 — ${dim.evidence}`)
    }

    return result
  }
}

// =============================================================================
// Convenience Exports
// =============================================================================

export async function runEvalSuite(config: EvalRunnerConfig): Promise<EvalSuiteReport> {
  const runner = new EvalRunner(config)
  return runner.runSuite()
}

export async function runSingleCase(
  config: EvalRunnerConfig,
  testCaseId: string
): Promise<EvalResult> {
  const runner = new EvalRunner(config)
  return runner.runSingleCase(testCaseId)
}
