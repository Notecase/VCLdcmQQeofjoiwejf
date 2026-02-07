/**
 * Insertion Position Inferrer
 *
 * Infers the appropriate insertion position for ADD operations
 * based on the type of content being added.
 */

// ============================================================================
// Types
// ============================================================================

export type InsertionPosition = 'start' | 'end'

// ============================================================================
// Pattern Definitions
// ============================================================================

/**
 * Patterns for content that typically goes at the START of a document
 * (introductions, overviews, outlines, table of contents)
 */
const START_PATTERNS = [
  /\b(intro|introduction)\b/i,
  /\b(overview)\b/i,
  /\b(outline)\b/i,
  /\b(table of contents|toc)\b/i,
  /\b(abstract)\b/i,
  /\b(preface)\b/i,
  /\b(preamble)\b/i,
  /\bprepend\b/i,
  /\bat the (start|beginning|top)\b/i,
]

/**
 * Patterns for content that typically goes at the END of a document
 * (summaries, conclusions, appendices)
 */
const END_PATTERNS = [
  /\b(summary|summarize|summarizing|summarizes)\b/i,
  /\b(conclusion|conclusions|concluding)\b/i,
  /\b(takeaway|takeaways|key points)\b/i,
  /\b(recap|recaps|recapping)\b/i,
  /\b(review|reviewing)\b/i,
  /\b(appendix|appendices)\b/i,
  /\b(references|bibliography)\b/i,
  /\b(glossary)\b/i,
  /\bappend\b/i,
  /\bat the (end|bottom)\b/i,
]

// ============================================================================
// Implementation
// ============================================================================

/**
 * Infer the appropriate insertion position based on the instruction content.
 *
 * @param instruction - The user's instruction for adding content
 * @returns 'start' if content should go at beginning, 'end' otherwise
 *
 * @example
 * inferInsertionPosition("add a table summarizing this note") // 'end'
 * inferInsertionPosition("add an introduction paragraph") // 'start'
 * inferInsertionPosition("add a code example") // 'end' (default)
 */
export function inferInsertionPosition(instruction: string): InsertionPosition {
  const normalized = instruction.toLowerCase()

  // Check for explicit start patterns first
  for (const pattern of START_PATTERNS) {
    if (pattern.test(normalized)) {
      return 'start'
    }
  }

  // Check for explicit end patterns
  for (const pattern of END_PATTERNS) {
    if (pattern.test(normalized)) {
      return 'end'
    }
  }

  // Default to END for general ADD operations
  // This is safer as most added content (tables, examples, etc.)
  // is more natural at the end of a document
  return 'end'
}

/**
 * Get a human-readable description of the insertion position
 * for use in prompts and user feedback
 */
export function getPositionDescription(position: InsertionPosition): string {
  return position === 'start' ? 'beginning of document' : 'end of document'
}
