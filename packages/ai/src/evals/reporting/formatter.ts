/**
 * AI Eval Framework — CLI Scorecard Formatter
 *
 * Produces a human-readable scorecard from an EvalSuiteReport
 * for terminal output.
 */

import type { EvalSuiteReport, CategoryReport } from '../types'

const CATEGORY_LABELS: Record<string, string> = {
  'note-creation': 'Note Creation',
  'edit-proposals': 'Edit Proposals',
  artifacts: 'Artifacts',
  tables: 'Tables',
  'tool-selection': 'Tool Selection',
  'citation-heavy': 'Citation Heavy',
}

export function formatScorecard(report: EvalSuiteReport): string {
  const lines: string[] = []

  // Header
  lines.push('NOTESHELL AI EVAL \u2014 Launch Readiness Report')
  lines.push('============================================')

  const date = report.timestamp.slice(0, 10)
  lines.push(`Date: ${date} | Model: ${report.model} | Judge: ${report.judgeModel}`)
  lines.push(
    `Cases: ${report.totalCases} | Passed: ${report.passedCases} | Failed: ${report.failedCases}`
  )
  lines.push('')

  // Overall score
  const overallIndicator = report.launchReady ? '\u2705 LAUNCH-READY' : '\u274C NOT LAUNCH-READY'
  lines.push(
    `OVERALL: ${report.compositeAverage.toFixed(1)} / 5.0  ${overallIndicator} (threshold: ${report.launchThreshold})`
  )
  lines.push('')

  // Per-category breakdown
  lines.push('BY CATEGORY:')
  for (const cat of report.categories) {
    lines.push(formatCategoryLine(cat))
  }
  lines.push('')

  // Top issues
  if (report.topIssues.length > 0) {
    lines.push('TOP ISSUES:')
    for (let i = 0; i < report.topIssues.length; i++) {
      const issue = report.topIssues[i]
      const fixDesc = `${issue.suggestedFix.component}: ${issue.suggestedFix.suggestion}`
      lines.push(
        `  ${i + 1}. ${issue.dimension} (affects ${issue.affectedCases} cases) \u2192 ${fixDesc}`
      )
    }
    lines.push('')
  }

  // Cost / metrics summary
  const costDollars = (report.metrics.totalCostCents / 100).toFixed(2)
  const tokenCount = report.metrics.totalInputTokens + report.metrics.totalOutputTokens
  const duration = formatDuration(report.metrics.totalDurationMs)
  lines.push(`COST: $${costDollars} | Tokens: ${formatNumber(tokenCount)} | Duration: ${duration}`)

  return lines.join('\n')
}

function formatCategoryLine(cat: CategoryReport): string {
  const label = CATEGORY_LABELS[cat.category] ?? cat.category
  const padded = (label + ':').padEnd(20)
  const indicator = cat.averageScore >= 3.5 ? '\u2705' : '\u274C'
  return `  ${padded} ${cat.averageScore.toFixed(1)} / 5.0  ${indicator}  (${cat.passCount}/${cat.caseCount} passed)`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }

  const totalSeconds = Math.floor(ms / 1000)

  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`
  }
  return `${hours}h`
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}
