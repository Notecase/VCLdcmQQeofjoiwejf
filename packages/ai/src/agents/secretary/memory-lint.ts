import { parseDailyPlanMarkdown, parsePlanMarkdown, getTodayDate } from '@inkdown/shared/secretary'
import type { MemoryFile, ParserWarning } from '@inkdown/shared/types'

export interface SecretaryMemoryLintResult {
  warnings: ParserWarning[]
  activePlansParsed: number
  todayPlanParsed: boolean
}

/**
 * Lint core secretary memory markdown files for parseability.
 * This is intentionally lightweight and safe for debug endpoints.
 */
export function lintSecretaryMemoryFiles(files: MemoryFile[]): SecretaryMemoryLintResult {
  const byName = new Map(files.map(f => [f.filename, f]))
  const planContent = byName.get('Plan.md')?.content || ''
  const todayContent = byName.get('Today.md')?.content || ''
  const todayDate = getTodayDate()

  const planParsed = parsePlanMarkdown(planContent)
  const todayParsed = parseDailyPlanMarkdown(todayContent, todayDate, 'Today.md')

  return {
    warnings: [...planParsed.warnings, ...todayParsed.warnings],
    activePlansParsed: planParsed.activePlans.length,
    todayPlanParsed: Boolean(todayParsed.plan && todayParsed.plan.tasks.length > 0),
  }
}
