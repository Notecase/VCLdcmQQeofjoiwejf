/**
 * AI Eval Framework — Results Aggregation
 *
 * Aggregates individual EvalResults into a full EvalSuiteReport with
 * per-category breakdowns, top issues detection, and launch readiness.
 */

import type {
  EvalResult,
  EvalSuiteReport,
  CategoryReport,
  TestCategory,
  DimensionName,
  FixSignal,
  CalibrationCheck,
} from '../types'
import { LAUNCH_THRESHOLD } from '../types'

export function aggregateResults(
  results: EvalResult[],
  options: {
    model: string
    judgeModel: string
    calibration: CalibrationCheck[]
    baseline?: EvalSuiteReport
  }
): EvalSuiteReport {
  const categories = aggregateByCategory(results)
  const topIssues = detectTopIssues(results)
  const metrics = computeTotalMetrics(results)

  const compositeAverage =
    results.length > 0 ? results.reduce((sum, r) => sum + r.compositeScore, 0) / results.length : 0

  const passedCases = results.filter((r) => r.passed).length
  const failedCases = results.length - passedCases

  return {
    timestamp: new Date().toISOString(),
    model: options.model,
    judgeModel: options.judgeModel,
    totalCases: results.length,
    passedCases,
    failedCases,
    compositeAverage: round(compositeAverage, 2),
    launchReady: compositeAverage >= LAUNCH_THRESHOLD,
    launchThreshold: LAUNCH_THRESHOLD,
    categories,
    topIssues,
    calibration: options.calibration,
    results,
    metrics,
  }
}

// ---------------------------------------------------------------------------
// Per-category aggregation
// ---------------------------------------------------------------------------

function aggregateByCategory(results: EvalResult[]): CategoryReport[] {
  const grouped = new Map<TestCategory, EvalResult[]>()

  for (const result of results) {
    const category = result.testCase.category
    const list = grouped.get(category) ?? []
    list.push(result)
    grouped.set(category, list)
  }

  const reports: CategoryReport[] = []

  for (const [category, categoryResults] of grouped) {
    const caseCount = categoryResults.length
    const passCount = categoryResults.filter((r) => r.passed).length
    const failCount = caseCount - passCount

    const averageScore =
      caseCount > 0 ? categoryResults.reduce((sum, r) => sum + r.compositeScore, 0) / caseCount : 0

    const dimensionAverages = computeDimensionAverages(categoryResults)

    reports.push({
      category,
      caseCount,
      passCount,
      failCount,
      averageScore: round(averageScore, 2),
      dimensionAverages,
    })
  }

  return reports
}

function computeDimensionAverages(results: EvalResult[]): Record<string, number> {
  const dimensionSums = new Map<string, { total: number; count: number }>()

  for (const result of results) {
    for (const dim of result.dimensions) {
      const entry = dimensionSums.get(dim.dimension) ?? { total: 0, count: 0 }
      entry.total += dim.score
      entry.count += 1
      dimensionSums.set(dim.dimension, entry)
    }
  }

  const averages: Record<string, number> = {}
  for (const [dimension, { total, count }] of dimensionSums) {
    averages[dimension] = round(total / count, 2)
  }

  return averages
}

// ---------------------------------------------------------------------------
// Top issues detection
// ---------------------------------------------------------------------------

function detectTopIssues(results: EvalResult[]): EvalSuiteReport['topIssues'] {
  // Collect all failed dimensions across all results
  const dimensionFailures = new Map<
    DimensionName,
    { scores: number[]; fixSignals: FixSignal[]; caseIds: Set<string> }
  >()

  for (const result of results) {
    for (const dim of result.dimensions) {
      if (!dim.passed) {
        const entry = dimensionFailures.get(dim.dimension) ?? {
          scores: [],
          fixSignals: [],
          caseIds: new Set<string>(),
        }
        entry.scores.push(dim.score)
        entry.caseIds.add(result.testCaseId)
        if (dim.fixSignal) {
          entry.fixSignals.push(dim.fixSignal)
        }
        dimensionFailures.set(dim.dimension, entry)
      }
    }
  }

  // Convert to sorted array, most affected cases first
  const issues: EvalSuiteReport['topIssues'] = []

  for (const [dimension, { scores, fixSignals, caseIds }] of dimensionFailures) {
    const averageScore =
      scores.length > 0 ? round(scores.reduce((a, b) => a + b, 0) / scores.length, 2) : 0

    const suggestedFix = pickMostCommonFix(fixSignals) ?? {
      component: 'system-prompt' as const,
      suggestion: `Investigate ${dimension} failures across ${caseIds.size} test cases`,
      priority: 'medium' as const,
    }

    issues.push({
      dimension,
      affectedCases: caseIds.size,
      averageScore,
      suggestedFix,
    })
  }

  // Sort by affected cases descending, then by average score ascending (worst first)
  issues.sort((a, b) => {
    if (b.affectedCases !== a.affectedCases) {
      return b.affectedCases - a.affectedCases
    }
    return a.averageScore - b.averageScore
  })

  return issues
}

/**
 * Find the most frequently suggested fix signal from a list.
 * Groups by component + suggestion text, returns the most common one.
 */
function pickMostCommonFix(signals: FixSignal[]): FixSignal | undefined {
  if (signals.length === 0) return undefined

  const counts = new Map<string, { signal: FixSignal; count: number }>()

  for (const signal of signals) {
    const key = `${signal.component}::${signal.suggestion}`
    const entry = counts.get(key) ?? { signal, count: 0 }
    entry.count += 1
    counts.set(key, entry)
  }

  let best: { signal: FixSignal; count: number } | undefined
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) {
      best = entry
    }
  }

  return best?.signal
}

// ---------------------------------------------------------------------------
// Total metrics
// ---------------------------------------------------------------------------

function computeTotalMetrics(results: EvalResult[]): EvalSuiteReport['metrics'] {
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCostCents = 0
  let totalDurationMs = 0

  for (const result of results) {
    const m = result.output.metrics
    totalInputTokens += m.inputTokens
    totalOutputTokens += m.outputTokens
    totalCostCents += m.costCents
    totalDurationMs += m.latencyMs
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCostCents,
    totalDurationMs,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}
