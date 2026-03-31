/**
 * Functional Evaluators — Artifact rendering & table validity checks
 *
 * Static analysis checks for artifact sandbox compliance
 * and markdown table structural validity.
 */

import type { DimensionResult, ArtifactRecord } from '../types'

// =============================================================================
// Artifact Rendering
// =============================================================================

/** Patterns banned in sandboxed artifacts */
const SANDBOX_BANNED_PATTERNS = [
  { pattern: /\blocalStorage\b/, label: 'localStorage access' },
  { pattern: /\bsessionStorage\b/, label: 'sessionStorage access' },
  { pattern: /\bIndexedDB\b/i, label: 'IndexedDB access' },
  { pattern: /\bdocument\.cookie\b/, label: 'document.cookie access' },
  { pattern: /\bwindow\.parent\b/, label: 'window.parent access' },
  { pattern: /\bwindow\.top\b/, label: 'window.top access' },
  { pattern: /\bpostMessage\b/, label: 'postMessage usage' },
  { pattern: /<html[\s>]/i, label: '<html> tag' },
  { pattern: /<head[\s>]/i, label: '<head> tag' },
  { pattern: /<body[\s>]/i, label: '<body> tag' },
  { pattern: /<script[\s>]/i, label: '<script> tag in HTML' },
]

/**
 * Checks artifact for sandbox compliance and basic structural validity.
 * Uses static analysis (no headless browser).
 */
export function evaluateArtifactRendering(artifact: ArtifactRecord): DimensionResult {
  const violations: string[] = []
  const passes: string[] = []

  // Check HTML exists and is non-empty
  if (!artifact.html?.trim()) {
    return {
      dimension: 'artifact-rendering',
      evaluator: 'functional',
      score: 1,
      passed: false,
      threshold: 3,
      evidence: 'Artifact has no HTML content',
      diagnosis: 'Empty artifact HTML',
      fixSignal: {
        component: 'agent-logic',
        suggestion: 'Ensure artifact tool always generates HTML content',
        priority: 'high',
      },
    }
  }

  // Check sandbox compliance across all artifact parts
  const fullContent = [artifact.html, artifact.css ?? '', artifact.javascript ?? ''].join('\n')

  for (const banned of SANDBOX_BANNED_PATTERNS) {
    if (banned.pattern.test(fullContent)) {
      violations.push(`Sandbox violation: ${banned.label}`)
    }
  }

  // Check CSS validity (basic — no syntax errors)
  if (artifact.css) {
    // Check for unclosed braces
    const openBraces = (artifact.css.match(/{/g) || []).length
    const closeBraces = (artifact.css.match(/}/g) || []).length
    if (openBraces !== closeBraces) {
      violations.push(`CSS has unmatched braces: ${openBraces} open, ${closeBraces} close`)
    } else {
      passes.push('CSS braces balanced')
    }
  }

  // Check JavaScript for obvious syntax issues
  if (artifact.javascript) {
    // Check for unclosed braces/brackets/parens
    const js = artifact.javascript
    const openBraces = (js.match(/{/g) || []).length
    const closeBraces = (js.match(/}/g) || []).length
    const openParens = (js.match(/\(/g) || []).length
    const closeParens = (js.match(/\)/g) || []).length
    const openBrackets = (js.match(/\[/g) || []).length
    const closeBrackets = (js.match(/]/g) || []).length

    if (openBraces !== closeBraces) {
      violations.push(`JS has unmatched braces: ${openBraces} open, ${closeBraces} close`)
    }
    if (openParens !== closeParens) {
      violations.push(`JS has unmatched parentheses: ${openParens} open, ${closeParens} close`)
    }
    if (openBrackets !== closeBrackets) {
      violations.push(`JS has unmatched brackets: ${openBrackets} open, ${closeBrackets} close`)
    }

    if (
      openBraces === closeBraces &&
      openParens === closeParens &&
      openBrackets === closeBrackets
    ) {
      passes.push('JS bracket matching OK')
    }
  }

  // Check HTML has some interactive elements (for artifacts that should be interactive)
  const hasInteractive = /<(button|input|select|textarea|a\s)/i.test(artifact.html)
  if (hasInteractive) {
    passes.push('Contains interactive elements')
  }

  // Score calculation
  const sandboxViolations = violations.filter((v) => v.startsWith('Sandbox')).length
  const syntaxViolations = violations.length - sandboxViolations

  let score: number
  if (sandboxViolations > 0) {
    score = Math.max(1, 3 - sandboxViolations) // Sandbox violations are severe
  } else if (syntaxViolations > 0) {
    score = Math.max(2, 4 - syntaxViolations)
  } else {
    score = passes.length >= 2 ? 5 : 4
  }

  const passed = violations.length === 0

  return {
    dimension: 'artifact-rendering',
    evaluator: 'functional',
    score,
    passed,
    threshold: 3,
    evidence: passed
      ? `Artifact passes all checks: ${passes.join('; ')}`
      : `${violations.length} issue(s): ${violations.join('; ')}`,
    diagnosis: passed ? undefined : violations[0],
    fixSignal: passed
      ? undefined
      : {
          component: sandboxViolations > 0 ? 'post-processing' : 'agent-logic',
          suggestion:
            sandboxViolations > 0
              ? 'Add sandbox compliance check to artifact output guard'
              : 'Fix syntax generation in artifact tool',
          priority: sandboxViolations > 0 ? 'high' : 'medium',
        },
  }
}

// =============================================================================
// Table Validity
// =============================================================================

/**
 * Extracts and validates markdown table blocks from content.
 * Checks: consistent column count, header row present, aligned pipes.
 */
export function evaluateTableValidity(content: string): DimensionResult {
  if (!content.trim()) {
    return {
      dimension: 'table-validity',
      evaluator: 'functional',
      score: 1,
      passed: false,
      threshold: 3,
      evidence: 'No content to check',
    }
  }

  // Extract table blocks (consecutive lines starting with |)
  const lines = content.split('\n')
  const tables: string[][] = []
  let currentTable: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      currentTable.push(trimmed)
    } else {
      if (currentTable.length > 0) {
        tables.push(currentTable)
        currentTable = []
      }
    }
  }
  if (currentTable.length > 0) {
    tables.push(currentTable)
  }

  if (tables.length === 0) {
    return {
      dimension: 'table-validity',
      evaluator: 'functional',
      score: 2,
      passed: false,
      threshold: 3,
      evidence: 'No markdown tables found in content',
      diagnosis: 'Expected table content but none was generated',
      fixSignal: {
        component: 'system-prompt',
        suggestion: 'Ensure table generation instructions are followed',
        priority: 'medium',
      },
    }
  }

  const violations: string[] = []
  const passes: string[] = []

  for (let t = 0; t < tables.length; t++) {
    const table = tables[t]
    const tableLabel = `Table ${t + 1}`

    // Check minimum rows (header + separator + at least 1 data row)
    if (table.length < 3) {
      violations.push(`${tableLabel}: Too few rows (${table.length}, need at least 3)`)
      continue
    }

    // Check separator row (row 2 should be |---|---|...|)
    const separatorRow = table[1]
    if (!/^\|[\s-:|]+\|$/.test(separatorRow)) {
      violations.push(`${tableLabel}: Missing or invalid separator row`)
    } else {
      passes.push(`${tableLabel}: Valid separator row`)
    }

    // Check consistent column count
    const columnCounts = table.map((row) => row.split('|').length - 2) // Subtract leading/trailing empty
    const expectedCols = columnCounts[0]
    const inconsistent = columnCounts.filter((c) => c !== expectedCols)
    if (inconsistent.length > 0) {
      violations.push(
        `${tableLabel}: Inconsistent column count (expected ${expectedCols}, found variations)`
      )
    } else {
      passes.push(`${tableLabel}: Consistent ${expectedCols} columns`)
    }

    // Check header row is not empty
    const headerCells = table[0]
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim())
    const emptyHeaders = headerCells.filter((c) => !c)
    if (emptyHeaders.length > 0) {
      violations.push(`${tableLabel}: ${emptyHeaders.length} empty header cell(s)`)
    } else {
      passes.push(`${tableLabel}: All headers populated`)
    }
  }

  const score = violations.length === 0 ? 5 : Math.max(1, 5 - violations.length)
  const passed = violations.length === 0

  return {
    dimension: 'table-validity',
    evaluator: 'functional',
    score,
    passed,
    threshold: 3,
    evidence: passed
      ? `${tables.length} table(s) valid: ${passes.join('; ')}`
      : `${violations.length} issue(s): ${violations.join('; ')}`,
    diagnosis: passed ? undefined : violations[0],
    fixSignal: passed
      ? undefined
      : {
          component: 'system-prompt',
          suggestion: 'Add explicit markdown table formatting rules to system prompt',
          priority: 'medium',
        },
  }
}
