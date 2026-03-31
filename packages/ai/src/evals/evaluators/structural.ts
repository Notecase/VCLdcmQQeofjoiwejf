/**
 * Structural Evaluators — Deterministic, zero-cost quality checks
 *
 * These run instantly against agent output with no LLM calls.
 */

import type { DimensionResult, ToolCallRecord, BehaviorExpectations } from '../types'

// =============================================================================
// Bullet Ratio
// =============================================================================

/**
 * Measures what fraction of content is bullet/numbered lists vs prose paragraphs.
 * High bullet ratio indicates shallow "listicle" output.
 */
export function evaluateBulletRatio(content: string, maxRatio: number = 0.4): DimensionResult {
  if (!content.trim()) {
    return {
      dimension: 'bullet-ratio',
      evaluator: 'structural',
      score: 1,
      passed: false,
      threshold: maxRatio,
      evidence: 'Empty content',
    }
  }

  const lines = content.split('\n').filter((l) => l.trim())
  let bulletWords = 0
  let totalWords = 0

  for (const line of lines) {
    const words = line.trim().split(/\s+/).length
    totalWords += words
    // Matches: - item, * item, 1. item, 1) item
    if (/^\s*(?:[-*+]|\d+[.)]) /.test(line)) {
      bulletWords += words
    }
  }

  const ratio = totalWords > 0 ? bulletWords / totalWords : 0
  const passed = ratio <= maxRatio
  const score = passed
    ? Math.round((1 - ratio / maxRatio) * 4 + 1)
    : Math.max(1, Math.round((1 - ratio) * 3))

  return {
    dimension: 'bullet-ratio',
    evaluator: 'structural',
    score: Math.min(5, Math.max(1, score)),
    passed,
    threshold: maxRatio,
    evidence: `${(ratio * 100).toFixed(1)}% of content is bullet lists (threshold: ${(maxRatio * 100).toFixed(0)}%)`,
    diagnosis: passed
      ? undefined
      : 'Content is too heavily reliant on bullet lists instead of prose',
    fixSignal: passed
      ? undefined
      : {
          component: 'system-prompt',
          suggestion: 'Strengthen prose requirement; add examples of paragraph-style explanations',
          priority: 'high',
        },
  }
}

// =============================================================================
// Citation Placement
// =============================================================================

/**
 * Checks that URLs/citations appear in a Sources/References section
 * rather than scattered inline throughout the text.
 */
export function evaluateCitationPlacement(content: string): DimensionResult {
  if (!content.trim()) {
    return {
      dimension: 'citation-placement',
      evaluator: 'structural',
      score: 5,
      passed: true,
      threshold: 3,
      evidence: 'No content to check',
    }
  }

  // Find all markdown links with http(s) URLs
  const urlPattern = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g
  const allLinks: Array<{ text: string; url: string; line: number }> = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    let match: RegExpExecArray | null
    const linePattern = new RegExp(urlPattern.source, 'g')
    while ((match = linePattern.exec(lines[i])) !== null) {
      allLinks.push({ text: match[1], url: match[2], line: i + 1 })
    }
  }

  // Also find bare URLs
  const bareUrlPattern = /(?<!\()(https?:\/\/[^\s)<>]+)/g
  for (let i = 0; i < lines.length; i++) {
    // Skip lines that are inside markdown link syntax
    const strippedLine = lines[i].replace(/\[[^\]]*\]\([^)]+\)/g, '')
    let match: RegExpExecArray | null
    const linePattern = new RegExp(bareUrlPattern.source, 'g')
    while ((match = linePattern.exec(strippedLine)) !== null) {
      allLinks.push({ text: '', url: match[1], line: i + 1 })
    }
  }

  if (allLinks.length === 0) {
    return {
      dimension: 'citation-placement',
      evaluator: 'structural',
      score: 5,
      passed: true,
      threshold: 3,
      evidence: 'No citations found in content',
    }
  }

  // Find the Sources/References section start
  const sourceSectionPattern = /^#{1,3}\s*(Sources|References|Bibliography|Works Cited)/im
  let sourceSectionLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (sourceSectionPattern.test(lines[i])) {
      sourceSectionLine = i + 1
      break
    }
  }

  const inlineCitations =
    sourceSectionLine > 0 ? allLinks.filter((l) => l.line < sourceSectionLine) : allLinks // No sources section means all are inline

  const inlineCount = inlineCitations.length
  const totalCount = allLinks.length

  if (sourceSectionLine < 0 && totalCount > 0) {
    return {
      dimension: 'citation-placement',
      evaluator: 'structural',
      score: 2,
      passed: false,
      threshold: 3,
      evidence: `Found ${totalCount} citations but no Sources/References section`,
      diagnosis: 'Citations exist but are not gathered into a dedicated section',
      fixSignal: {
        component: 'system-prompt',
        suggestion: 'Add explicit instruction to gather all URLs in a ## Sources section',
        priority: 'high',
      },
    }
  }

  if (inlineCount === 0) {
    return {
      dimension: 'citation-placement',
      evaluator: 'structural',
      score: 5,
      passed: true,
      threshold: 3,
      evidence: `All ${totalCount} citations properly placed in Sources section`,
    }
  }

  const inlineRatio = inlineCount / totalCount
  const score = Math.max(1, Math.round((1 - inlineRatio) * 4 + 1))
  const inlineLines = inlineCitations.map((c) => c.line).join(', ')

  return {
    dimension: 'citation-placement',
    evaluator: 'structural',
    score,
    passed: score >= 3,
    threshold: 3,
    evidence: `Found ${inlineCount} inline citations outside Sources section at lines ${inlineLines}`,
    diagnosis: 'Some citations appear inline instead of in the Sources section',
    fixSignal: {
      component: 'system-prompt',
      suggestion: 'Strengthen citation placement rule in system prompt',
      priority: 'medium',
    },
  }
}

// =============================================================================
// Formatting Compliance
// =============================================================================

/**
 * Checks for formatting rule violations:
 * - No horizontal rules (--- or ***)
 * - Math uses $...$ and $$...$$ (not backslash-bracket)
 * - Heading hierarchy (no H4 under H2 without H3)
 * - No empty sections (heading followed immediately by heading)
 */
export function evaluateFormattingCompliance(content: string): DimensionResult {
  if (!content.trim()) {
    return {
      dimension: 'formatting-compliance',
      evaluator: 'structural',
      score: 5,
      passed: true,
      threshold: 3,
      evidence: 'No content to check',
    }
  }

  const violations: string[] = []
  const lines = content.split('\n')

  // Check horizontal rules
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (/^[-*_]{3,}$/.test(trimmed)) {
      violations.push(`Horizontal rule at line ${i + 1}`)
    }
  }

  // Check math notation — backslash-bracket instead of dollar signs
  const displayMathPattern = /\\\[[\s\S]*?\\\]/
  if (displayMathPattern.test(content)) {
    violations.push('Uses backslash-bracket instead of $$ for display math')
  }
  const inlineMathPattern = /\\\([\s\S]*?\\\)/
  if (inlineMathPattern.test(content)) {
    violations.push('Uses backslash-paren instead of $ for inline math')
  }

  // Check heading hierarchy
  let lastHeadingLevel = 0
  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(/^(#{1,6})\s/)
    if (headingMatch) {
      const level = headingMatch[1].length
      if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
        violations.push(
          `Heading hierarchy skip: H${lastHeadingLevel} to H${level} at line ${i + 1}`
        )
      }
      lastHeadingLevel = level
    }
  }

  // Check empty sections (heading followed by another heading)
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^#{1,6}\s/.test(lines[i].trim())) {
      // Look ahead for next non-empty line
      let nextContentLine = -1
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim()) {
          nextContentLine = j
          break
        }
      }
      if (nextContentLine >= 0 && /^#{1,6}\s/.test(lines[nextContentLine].trim())) {
        violations.push(`Empty section at line ${i + 1}: "${lines[i].trim()}"`)
      }
    }
  }

  const score = Math.max(1, 5 - violations.length)
  const passed = violations.length === 0

  return {
    dimension: 'formatting-compliance',
    evaluator: 'structural',
    score,
    passed,
    threshold: 3,
    evidence: passed
      ? 'All formatting rules passed'
      : `${violations.length} violation(s): ${violations.join('; ')}`,
    diagnosis: passed ? undefined : 'Formatting violations detected',
    fixSignal: passed
      ? undefined
      : {
          component: 'system-prompt',
          suggestion: `Fix formatting rules: ${violations[0]}`,
          priority: 'low',
        },
  }
}

// =============================================================================
// Word Count
// =============================================================================

/**
 * Checks word count against min/max thresholds.
 */
export function evaluateWordCount(content: string, min?: number, max?: number): DimensionResult {
  const words = content.trim().split(/\s+/).filter(Boolean).length

  const minThreshold = min ?? 200
  const maxThreshold = max ?? 5000

  let score = 5
  let passed = true
  let diagnosis: string | undefined

  if (words < minThreshold) {
    const ratio = words / minThreshold
    score = Math.max(1, Math.round(ratio * 4 + 1))
    passed = false
    diagnosis = 'Content is too short for the topic'
  } else if (words > maxThreshold) {
    const overRatio = words / maxThreshold
    score = Math.max(1, Math.round((2 - overRatio) * 4 + 1))
    passed = false
    diagnosis = 'Content is excessively long'
  }

  return {
    dimension: 'word-count',
    evaluator: 'structural',
    score: Math.min(5, Math.max(1, score)),
    passed,
    threshold: 3,
    evidence: `Word count: ${words} (expected: ${minThreshold}-${maxThreshold})`,
    diagnosis,
    fixSignal: passed
      ? undefined
      : {
          component: 'system-prompt',
          suggestion:
            words < minThreshold
              ? 'Add minimum depth/length guidance to system prompt'
              : 'Add conciseness guidance to system prompt',
          priority: 'medium',
        },
  }
}

// =============================================================================
// Edit Minimality
// =============================================================================

/**
 * For edit proposals: measures how much of the original was changed.
 * A typo fix should have minimal changes; a rewrite is expected to change more.
 */
export function evaluateEditMinimality(
  original: string,
  proposed: string,
  expectation: 'small' | 'medium' | 'large'
): DimensionResult {
  if (!original || !proposed) {
    return {
      dimension: 'edit-minimality',
      evaluator: 'structural',
      score: 3,
      passed: true,
      threshold: 3,
      evidence: 'Missing original or proposed content for comparison',
    }
  }

  // Simple character-level diff ratio
  const maxLen = Math.max(original.length, proposed.length)
  let changedChars = 0

  // Count differing characters (simple approach)
  const minLen = Math.min(original.length, proposed.length)
  for (let i = 0; i < minLen; i++) {
    if (original[i] !== proposed[i]) changedChars++
  }
  changedChars += Math.abs(original.length - proposed.length)

  const changeRatio = maxLen > 0 ? changedChars / maxLen : 0

  const thresholds: Record<string, number> = {
    small: 0.15, // Typo fixes: <15% change
    medium: 0.5, // Section rewrites: <50% change
    large: 1.0, // Full rewrites: any amount
  }

  const maxExpectedChange = thresholds[expectation]
  const passed = changeRatio <= maxExpectedChange

  let score: number
  if (passed) {
    score = Math.round((1 - changeRatio / maxExpectedChange) * 3 + 2)
  } else {
    score = Math.max(1, Math.round((1 - changeRatio) * 3))
  }

  return {
    dimension: 'edit-minimality',
    evaluator: 'structural',
    score: Math.min(5, Math.max(1, score)),
    passed,
    threshold: 3,
    evidence: `Changed ${(changeRatio * 100).toFixed(1)}% of content (expectation: ${expectation}, max: ${(maxExpectedChange * 100).toFixed(0)}%)`,
    diagnosis: passed ? undefined : `Edit changed too much for a "${expectation}" edit`,
    fixSignal: passed
      ? undefined
      : {
          component: 'system-prompt',
          suggestion: 'Strengthen instruction to make minimal, targeted edits',
          priority: 'high',
        },
  }
}

// =============================================================================
// Content Preservation
// =============================================================================

/**
 * For edit proposals: verifies that blocks outside the target remain unchanged.
 */
export function evaluateContentPreservation(
  original: string,
  proposed: string,
  targetBlockIndex: number
): DimensionResult {
  const originalBlocks = original.split(/\n\n+/).filter((b) => b.trim())
  const proposedBlocks = proposed.split(/\n\n+/).filter((b) => b.trim())

  const modifiedBlocks: number[] = []

  const maxBlocks = Math.max(originalBlocks.length, proposedBlocks.length)

  for (let i = 0; i < maxBlocks; i++) {
    if (i === targetBlockIndex) continue // Skip the target block

    const orig = originalBlocks[i]?.trim() ?? ''
    const prop = proposedBlocks[i]?.trim() ?? ''

    if (orig !== prop) {
      modifiedBlocks.push(i)
    }
  }

  const passed = modifiedBlocks.length === 0
  const score = passed ? 5 : Math.max(1, 5 - modifiedBlocks.length)

  return {
    dimension: 'content-preservation',
    evaluator: 'structural',
    score,
    passed,
    threshold: 3,
    evidence: passed
      ? `All ${originalBlocks.length - 1} non-target blocks preserved`
      : `Blocks ${modifiedBlocks.join(', ')} were modified but should have been preserved`,
    diagnosis: passed ? undefined : 'Agent modified content outside the target area',
    fixSignal: passed
      ? undefined
      : {
          component: 'system-prompt',
          suggestion: 'Add explicit instruction to only modify the targeted section',
          priority: 'high',
        },
  }
}

// =============================================================================
// Tool Behavior
// =============================================================================

/**
 * Checks tool usage patterns against behavioral expectations.
 */
export function evaluateToolBehavior(
  toolCalls: ToolCallRecord[],
  expectations: BehaviorExpectations
): DimensionResult {
  const violations: string[] = []
  const passes: string[] = []
  const toolNames = toolCalls.map((tc) => tc.toolName)

  // Check mustCallTools
  if (expectations.mustCallTools) {
    for (const required of expectations.mustCallTools) {
      if (toolNames.includes(required)) {
        passes.push(`Called required tool: ${required}`)
      } else {
        violations.push(`Did not call required tool: ${required}`)
      }
    }
  }

  // Check mustNotCallTools
  if (expectations.mustNotCallTools) {
    for (const forbidden of expectations.mustNotCallTools) {
      if (toolNames.includes(forbidden)) {
        violations.push(`Called forbidden tool: ${forbidden}`)
      } else {
        passes.push(`Avoided forbidden tool: ${forbidden}`)
      }
    }
  }

  // Check mustReadBeforeEdit
  if (expectations.mustReadBeforeEdit) {
    const readIndex = toolNames.findIndex((n) => n === 'read_note' || n === 'read_note_structure')
    const editIndex = toolNames.findIndex(
      (n) => n === 'edit_paragraph' || n === 'replace_paragraph' || n === 'add_paragraph'
    )

    if (editIndex >= 0 && (readIndex < 0 || readIndex > editIndex)) {
      violations.push('Edited without reading note first')
    } else if (readIndex >= 0 && editIndex >= 0 && readIndex < editIndex) {
      passes.push('Read note before editing')
    }
  }

  // Check mustSearchWhenTimeSensitive
  if (expectations.mustSearchWhenTimeSensitive) {
    const hasSearch = toolNames.some((n) => n === 'web_search' || n === 'search_web')
    if (!hasSearch) {
      violations.push('Did not call web_search despite time-sensitive prompt')
    } else {
      passes.push('Called web_search for time-sensitive content')
    }
  }

  const totalChecks = violations.length + passes.length
  const passRatio = totalChecks > 0 ? passes.length / totalChecks : 1
  const score = Math.max(1, Math.round(passRatio * 4 + 1))
  const passed = violations.length === 0

  return {
    dimension: 'tool-behavior',
    evaluator: 'structural',
    score: Math.min(5, score),
    passed,
    threshold: 3,
    evidence: passed
      ? `All ${passes.length} behavior checks passed`
      : `${violations.length} violation(s): ${violations.join('; ')}`,
    diagnosis: passed ? undefined : violations[0],
    fixSignal: passed
      ? undefined
      : {
          component: violations[0]?.includes('web_search') ? 'system-prompt' : 'tool-definition',
          suggestion: violations[0]?.includes('web_search')
            ? 'Strengthen web search mandate for time-sensitive keywords'
            : 'Improve tool description clarity',
          priority: 'high',
        },
  }
}
