/**
 * Surgical Merger
 *
 * Merges edited section back into original document.
 * Preserves all non-targeted content exactly.
 */

import type { ParsedNote } from './structureParser'
import type { ExtractedContext } from './contextExtractor'

// ============================================================================
// Utilities
// ============================================================================

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ============================================================================
// Types
// ============================================================================

export interface MergeResult {
  /** Full document with edit applied */
  content: string
  /** IDs of blocks that were modified */
  changedBlockIds: string[]
  /** IDs of blocks that were preserved */
  unchangedBlockIds: string[]
  /** Whether merge was successful */
  success: boolean
  /** Error or warning message */
  message?: string
}

export interface MergeOptions {
  /** Add blank line between sections if missing (default: true) */
  ensureSectionSpacing?: boolean
}

interface SectionBounds {
  startIndex: number
  endIndex: number
}

// ============================================================================
// Section Finding (Heading-Based)
// ============================================================================

/**
 * Find section boundaries by heading text (immune to line number bugs)
 *
 * This function scans the document for a heading matching the given text and level,
 * then finds where the section ends (at the next heading of same or higher level).
 * Unlike line-number-based approaches, this is robust against parsing discrepancies.
 */
function findSectionByHeading(
  lines: string[],
  headingText: string,
  headingLevel: number
): SectionBounds | null {
  // Build a pattern that matches the heading (case-insensitive)
  // The heading can have varying whitespace around it
  const escapedHeading = escapeRegex(headingText.trim())
  const headingPattern = new RegExp(`^#{${headingLevel}}\\s+${escapedHeading}\\s*$`, 'i')

  // Find the heading line
  let startIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (headingPattern.test(lines[i])) {
      startIndex = i
      break
    }
  }

  if (startIndex === -1) {
    console.log('[findSectionByHeading] Heading not found:', { headingText, headingLevel })
    return null
  }

  // Find end: next heading of ANY level
  // This ensures section boundaries are consistent with targetIdentifier.ts
  // and prevents content from adjacent sections bleeding into the merge
  let endIndex = lines.length - 1
  for (let i = startIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s/)
    if (match) {
      // Stop at ANY heading to isolate section content
      endIndex = i - 1
      console.log('[findSectionByHeading] Stopping at heading:', {
        line: i,
        heading: lines[i],
        headingLevel: match[1].length,
      })
      break
    }
  }

  // Trim trailing blank lines from the section
  while (endIndex > startIndex && lines[endIndex].trim() === '') {
    endIndex--
  }

  console.log('[findSectionByHeading] Found section:', {
    headingText,
    headingLevel,
    startIndex,
    endIndex,
  })

  return { startIndex, endIndex }
}

// ============================================================================
// Merger Implementation
// ============================================================================

/**
 * Merge edited section back into the original document
 *
 * Strategy (preferred - heading-based):
 * 1. If targetHeading is available, find section by heading text
 * 2. Replace that section with the edited content
 * 3. This is immune to line number parsing bugs
 *
 * Fallback (line-based):
 * 1. Split original document by line
 * 2. Identify the line range of target blocks
 * 3. Replace that range with the edited content
 * 4. Preserve everything before and after exactly
 */
export function mergeEditedSection(
  originalContent: string,
  editedSection: string,
  context: ExtractedContext,
  parsed: ParsedNote,
  options: MergeOptions = {}
): MergeResult {
  const { ensureSectionSpacing = true } = options
  const { targetHeading, targetHeadingLevel, targetBlockIds } = context

  // PREFERRED: Use heading-based merge if we have heading info
  if (targetHeading && targetHeadingLevel) {
    console.log('[mergeEditedSection] Using heading-based merge:', {
      targetHeading,
      targetHeadingLevel,
    })

    const headingResult = mergeByHeading(
      originalContent,
      editedSection,
      targetHeading,
      targetHeadingLevel,
      targetBlockIds,
      parsed,
      ensureSectionSpacing
    )

    if (headingResult.success) {
      return headingResult
    }

    console.warn(
      '[mergeEditedSection] Heading-based merge failed, falling back to line-based:',
      headingResult.message
    )
  }

  // FALLBACK: Use line-based merge (original logic)
  return mergeByLineNumbers(originalContent, editedSection, context, parsed, options)
}

/**
 * Merge by finding section via heading text (immune to line number bugs)
 */
function mergeByHeading(
  originalContent: string,
  editedSection: string,
  heading: string,
  level: number,
  targetBlockIds: string[],
  parsed: ParsedNote,
  ensureSectionSpacing: boolean
): MergeResult {
  const lines = originalContent.split('\n')
  const bounds = findSectionByHeading(lines, heading, level)

  if (!bounds) {
    return {
      content: originalContent,
      changedBlockIds: [],
      unchangedBlockIds: parsed.blocks.map((b) => b.id),
      success: false,
      message: `Section "${heading}" not found by heading text`,
    }
  }

  console.log('[mergeByHeading] Found section bounds:', {
    heading,
    startIndex: bounds.startIndex,
    endIndex: bounds.endIndex,
    originalLineCount: bounds.endIndex - bounds.startIndex + 1,
  })

  // Build result - PRESERVE original heading, only replace content after it
  const before = lines.slice(0, bounds.startIndex)
  const originalHeadingLine = lines[bounds.startIndex] // Keep the original heading exactly
  const editedLines = editedSection.split('\n')
  const after = lines.slice(bounds.endIndex + 1)

  // SAFETY NET: Check if AI included a heading in its response - if so, strip it
  // The AI shouldn't modify headings, but if it does, we ignore the AI's heading
  // and keep the original
  const firstEditedLine = editedLines[0]?.trim() || ''
  const aiIncludedHeading = /^#{1,6}\s/.test(firstEditedLine)
  const editStartIndex = aiIncludedHeading ? 1 : 0

  if (aiIncludedHeading) {
    console.log('[mergeByHeading] AI included heading in response - stripping it:', {
      aiHeading: firstEditedLine,
      originalHeading: originalHeadingLine,
    })
  }

  const resultLines: string[] = [...before]

  // Always add the original heading line first (preserved exactly)
  resultLines.push(originalHeadingLine)

  // Handle spacing before edited content (after heading)
  if (ensureSectionSpacing && editedLines.length > editStartIndex) {
    const firstContentLine = editedLines[editStartIndex]

    // Preserve original spacing pattern - don't add extra blank lines
    if (firstContentLine?.trim() !== '' && originalHeadingLine?.trim() !== '') {
      // Check if there was originally a blank line after the heading
      const originalNextLine = lines[bounds.startIndex + 1]
      if (originalNextLine?.trim() === '' && editedLines[editStartIndex]?.trim() !== '') {
        // Original had a blank line after heading, edited content doesn't - add it back
        resultLines.push('')
      }
    }
  }

  // Add edited content (excluding any heading the AI might have included)
  resultLines.push(...editedLines.slice(editStartIndex))

  // Handle spacing after edited section
  if (ensureSectionSpacing && after.length > 0) {
    const lastEdited = editedLines[editedLines.length - 1]
    const firstAfter = after[0]

    // Preserve original spacing - if there was a blank line after, it's in 'after'
    if (
      lastEdited?.trim() !== '' &&
      firstAfter?.trim() !== '' &&
      firstAfter?.trim().startsWith('#')
    ) {
      // Add blank line before next section heading if there isn't one
      // But only if the original had one (which would be in 'after')
    }
  }

  resultLines.push(...after)

  const unchangedBlockIds = parsed.blocks
    .filter((b) => !targetBlockIds.includes(b.id))
    .map((b) => b.id)

  return {
    content: resultLines.join('\n'),
    changedBlockIds: targetBlockIds,
    unchangedBlockIds,
    success: true,
    message: `Merged section "${heading}" by heading anchor`,
  }
}

/**
 * Merge by line numbers (fallback for non-section edits)
 */
function mergeByLineNumbers(
  originalContent: string,
  editedSection: string,
  context: ExtractedContext,
  parsed: ParsedNote,
  options: MergeOptions = {}
): MergeResult {
  const { ensureSectionSpacing = true } = options

  const originalLines = originalContent.split('\n')
  const { targetStartLine, targetEndLine, targetBlockIds } = context

  // Validate line numbers
  if (targetStartLine < 1 || targetEndLine > originalLines.length) {
    return {
      content: originalContent,
      changedBlockIds: [],
      unchangedBlockIds: parsed.blocks.map((b) => b.id),
      success: false,
      message: `Invalid line range: ${targetStartLine}-${targetEndLine} (document has ${originalLines.length} lines)`,
    }
  }

  // Convert to 0-indexed
  const startIndex = targetStartLine - 1
  const endIndex = targetEndLine - 1

  // Build result
  const resultLines: string[] = []

  // Add content before target (preserve exactly)
  for (let i = 0; i < startIndex; i++) {
    resultLines.push(originalLines[i])
  }

  // Handle spacing before edited section
  if (ensureSectionSpacing && resultLines.length > 0) {
    const lastLine = resultLines[resultLines.length - 1]
    const firstEditedLine = editedSection.split('\n')[0]

    // Add blank line if transitioning between content and new content
    if (
      lastLine.trim() !== '' &&
      firstEditedLine.trim() !== '' &&
      !lastLine.trim().startsWith('#')
    ) {
      // Check if there wasn't already a blank line
      if (resultLines.length > 0 && resultLines[resultLines.length - 1].trim() !== '') {
        // Only add if the original didn't have one
        const originalPrevLine = originalLines[startIndex - 1]
        if (originalPrevLine && originalPrevLine.trim() !== '') {
          // Don't add extra spacing - preserve original
        }
      }
    }
  }

  // Add edited content
  const editedLines = editedSection.split('\n')
  resultLines.push(...editedLines)

  // Handle spacing after edited section
  if (ensureSectionSpacing && endIndex + 1 < originalLines.length) {
    const lastEditedLine = editedLines[editedLines.length - 1]
    const nextOriginalLine = originalLines[endIndex + 1]

    // Preserve original spacing patterns
    if (lastEditedLine.trim() !== '' && nextOriginalLine.trim() === '') {
      // There was a blank line after in original - we'll pick it up in the loop
    }
  }

  // Add content after target (preserve exactly)
  for (let i = endIndex + 1; i < originalLines.length; i++) {
    resultLines.push(originalLines[i])
  }

  // Determine which blocks were unchanged
  const unchangedBlockIds = parsed.blocks
    .filter((b) => !targetBlockIds.includes(b.id))
    .map((b) => b.id)

  return {
    content: resultLines.join('\n'),
    changedBlockIds: targetBlockIds,
    unchangedBlockIds,
    success: true,
    message: `Merged ${targetBlockIds.length} block(s) by line numbers`,
  }
}

/**
 * Merge inserted content into the document
 * For ADD operations that insert new content
 */
export function mergeInsertedContent(
  originalContent: string,
  insertedContent: string,
  context: ExtractedContext,
  parsed: ParsedNote,
  options: MergeOptions = {}
): MergeResult {
  const { ensureSectionSpacing = true } = options

  if (!context.insertionPoint) {
    return {
      content: originalContent,
      changedBlockIds: [],
      unchangedBlockIds: parsed.blocks.map((b) => b.id),
      success: false,
      message: 'No insertion point specified',
    }
  }

  const originalLines = originalContent.split('\n')
  const { position, referenceBlockId } = context.insertionPoint
  const insertedLines = insertedContent.split('\n')

  let insertIndex: number

  if (position === 'start') {
    insertIndex = 0
  } else if (position === 'end') {
    insertIndex = originalLines.length
  } else {
    // Find the reference block
    const refBlock = parsed.blocks.find((b) => b.id === referenceBlockId)
    if (!refBlock) {
      return {
        content: originalContent,
        changedBlockIds: [],
        unchangedBlockIds: parsed.blocks.map((b) => b.id),
        success: false,
        message: 'Reference block not found',
      }
    }

    if (position === 'before') {
      insertIndex = refBlock.startLine - 1 // 0-indexed, before the block
    } else {
      insertIndex = refBlock.endLine // 0-indexed, after the block
    }
  }

  // Build result
  const resultLines: string[] = []

  // Add content before insertion point
  for (let i = 0; i < insertIndex; i++) {
    resultLines.push(originalLines[i])
  }

  // Add spacing before inserted content if needed
  if (ensureSectionSpacing && resultLines.length > 0) {
    const lastLine = resultLines[resultLines.length - 1]
    const firstInsertedLine = insertedLines[0]

    if (lastLine.trim() !== '' && firstInsertedLine.trim() !== '') {
      resultLines.push('')
    }
  }

  // Add inserted content
  resultLines.push(...insertedLines)

  // Add spacing after inserted content if needed
  if (ensureSectionSpacing && insertIndex < originalLines.length) {
    const lastInsertedLine = insertedLines[insertedLines.length - 1]
    const nextOriginalLine = originalLines[insertIndex]

    if (lastInsertedLine.trim() !== '' && nextOriginalLine && nextOriginalLine.trim() !== '') {
      resultLines.push('')
    }
  }

  // Add content after insertion point
  for (let i = insertIndex; i < originalLines.length; i++) {
    resultLines.push(originalLines[i])
  }

  return {
    content: resultLines.join('\n'),
    changedBlockIds: [], // New content, no existing blocks changed
    unchangedBlockIds: parsed.blocks.map((b) => b.id),
    success: true,
    message: `Inserted content ${position} ${context.insertionPoint.referenceDescription}`,
  }
}

/**
 * Apply multiple edits to a document in order
 * Handles line number shifts from previous edits
 */
export function applyMultipleEdits(
  originalContent: string,
  edits: Array<{
    context: ExtractedContext
    editedContent: string
  }>,
  parsed: ParsedNote
): MergeResult {
  // Sort edits by start line in reverse order (bottom to top)
  // This way, line numbers don't shift for subsequent edits
  const sortedEdits = [...edits].sort(
    (a, b) => b.context.targetStartLine - a.context.targetStartLine
  )

  let currentContent = originalContent
  const allChangedBlockIds: string[] = []
  const errors: string[] = []

  for (const edit of sortedEdits) {
    // Re-parse to get accurate line numbers after previous edits
    // Note: In a real implementation, we'd update line numbers instead of re-parsing
    const result = mergeEditedSection(currentContent, edit.editedContent, edit.context, parsed)

    if (result.success) {
      currentContent = result.content
      allChangedBlockIds.push(...edit.context.targetBlockIds)
    } else {
      errors.push(result.message || 'Unknown merge error')
    }
  }

  const unchangedBlockIds = parsed.blocks
    .filter((b) => !allChangedBlockIds.includes(b.id))
    .map((b) => b.id)

  return {
    content: currentContent,
    changedBlockIds: allChangedBlockIds,
    unchangedBlockIds,
    success: errors.length === 0,
    message: errors.length > 0 ? errors.join('; ') : `Applied ${edits.length} edit(s)`,
  }
}

/**
 * Validate that merge preserved unchanged content
 * Useful for testing/verification
 */
export function validateMerge(
  originalContent: string,
  mergedContent: string,
  context: ExtractedContext
): { isValid: boolean; issues: string[] } {
  const issues: string[] = []
  const originalLines = originalContent.split('\n')
  const mergedLines = mergedContent.split('\n')

  const { targetStartLine, targetEndLine } = context

  // Check content before target is identical
  for (let i = 0; i < targetStartLine - 1; i++) {
    if (originalLines[i] !== mergedLines[i]) {
      issues.push(
        `Line ${i + 1} differs (before target): expected "${originalLines[i]}", got "${mergedLines[i]}"`
      )
    }
  }

  // Calculate offset from edit
  const originalTargetLines = targetEndLine - targetStartLine + 1
  const originalAfterStart = targetEndLine
  const mergedTargetLines = mergedLines.length - originalLines.length + originalTargetLines
  const mergedAfterStart = targetStartLine - 1 + mergedTargetLines

  // Check content after target is identical (accounting for line shift)
  const originalAfterLines = originalLines.slice(originalAfterStart)
  const mergedAfterLines = mergedLines.slice(mergedAfterStart)

  for (let i = 0; i < originalAfterLines.length; i++) {
    if (originalAfterLines[i] !== mergedAfterLines[i]) {
      issues.push(
        `Line after target differs: expected "${originalAfterLines[i]}", got "${mergedAfterLines[i]}"`
      )
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  }
}
