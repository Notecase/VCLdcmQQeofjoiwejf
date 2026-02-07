/**
 * Context Extractor
 *
 * Extracts focused content from target blocks with surrounding context.
 * Adds boundary markers for precise AI editing.
 */

import type { BlockNode, ParsedNote } from './structureParser'

// ============================================================================
// Types
// ============================================================================

export interface ExtractedContext {
  /** Content before the target (for coherence) */
  precedingContext: string
  /** The target content to edit (with markers) */
  targetContent: string
  /** Content after the target (for coherence) */
  followingContext: string
  /** Combined prompt for AI */
  fullPrompt: string
  /** Block IDs being edited */
  targetBlockIds: string[]
  /** Start line of target in original document */
  targetStartLine: number
  /** End line of target in original document */
  targetEndLine: number
  /** For ADD operations - where to insert */
  insertionPoint?: {
    position: 'before' | 'after' | 'start' | 'end'
    referenceBlockId: string
    referenceDescription: string
  }
  /** Section heading text for content-based merge (immune to line number bugs) */
  targetHeading?: string
  /** Section heading level (1-6) for content-based merge */
  targetHeadingLevel?: number
}

export interface ExtractionOptions {
  /** Number of context blocks before target (default: 1) */
  precedingBlocks?: number
  /** Number of context blocks after target (default: 1) */
  followingBlocks?: number
  /** Maximum characters for context (default: 500) */
  maxContextChars?: number
  /** Include document outline for reference (default: true) */
  includeOutline?: boolean
}

// ============================================================================
// Boundary Markers
// ============================================================================

export const EDIT_START_MARKER = '[EDIT_START]'
export const EDIT_END_MARKER = '[EDIT_END]'
export const CONTEXT_BEFORE_MARKER = '[CONTEXT_BEFORE]'
export const CONTEXT_BEFORE_END_MARKER = '[/CONTEXT_BEFORE]'
export const CONTEXT_AFTER_MARKER = '[CONTEXT_AFTER]'
export const CONTEXT_AFTER_END_MARKER = '[/CONTEXT_AFTER]'

// ============================================================================
// Extractor Implementation
// ============================================================================

/**
 * Extract target content with surrounding context for editing
 */
export function extractContext(
  parsed: ParsedNote,
  targetBlocks: BlockNode[],
  options: ExtractionOptions = {}
): ExtractedContext {
  const {
    precedingBlocks = 1,
    followingBlocks = 1,
    maxContextChars = 500,
    includeOutline = true,
  } = options

  if (targetBlocks.length === 0) {
    throw new Error('No target blocks provided')
  }

  // Sort targets by position in document
  const sortedTargets = [...targetBlocks].sort((a, b) => a.startLine - b.startLine)
  const firstTarget = sortedTargets[0]
  const lastTarget = sortedTargets[sortedTargets.length - 1]

  // Find indices in flat block list
  const firstTargetIndex = parsed.blocks.findIndex((b) => b.id === firstTarget.id)
  const lastTargetIndex = parsed.blocks.findIndex((b) => b.id === lastTarget.id)

  if (firstTargetIndex === -1 || lastTargetIndex === -1) {
    throw new Error('Target blocks not found in parsed structure')
  }

  // Extract preceding context
  const precedingStart = Math.max(0, firstTargetIndex - precedingBlocks)
  const precedingContextBlocks = parsed.blocks.slice(precedingStart, firstTargetIndex)
  let precedingContext = precedingContextBlocks.map((b) => b.content).join('\n\n')

  // Truncate if too long
  if (precedingContext.length > maxContextChars) {
    precedingContext = '...' + precedingContext.slice(-maxContextChars)
  }

  // CRITICAL FIX: Filter out section heading blocks from targetContent
  // Section headings should NOT be in the edit region - they should be preserved
  // The AI should only edit content UNDER the heading, not the heading itself
  const contentBlocks = sortedTargets.filter((b) => b.type !== 'section')

  // Use content blocks if available, otherwise fall back to all targets
  // (fallback handles edge case where user explicitly targets just a heading)
  const blocksForContent = contentBlocks.length > 0 ? contentBlocks : sortedTargets
  const targetContent = blocksForContent.map((b) => b.content).join('\n\n')

  console.log('[extractContext] Content extraction:', {
    totalTargets: sortedTargets.length,
    contentBlocksOnly: contentBlocks.length,
    excludedSections: sortedTargets.filter((b) => b.type === 'section').map((b) => b.metadata?.heading),
  })

  // Extract following context
  const followingEnd = Math.min(parsed.blocks.length, lastTargetIndex + 1 + followingBlocks)
  const followingContextBlocks = parsed.blocks.slice(lastTargetIndex + 1, followingEnd)
  let followingContext = followingContextBlocks.map((b) => b.content).join('\n\n')

  // Truncate if too long
  if (followingContext.length > maxContextChars) {
    followingContext = followingContext.slice(0, maxContextChars) + '...'
  }

  // Build outline string if requested
  let outlineStr = ''
  if (includeOutline && parsed.outline.length > 0) {
    outlineStr = 'Document structure:\n' + parsed.outline
      .map((o) => '  '.repeat(o.level - 1) + `- ${o.heading} (line ${o.line})`)
      .join('\n')
  }

  // Build full prompt
  const fullPrompt = buildEditPrompt(
    precedingContext,
    targetContent,
    followingContext,
    outlineStr
  )

  // Extract heading info for heading-based merge (immune to line number bugs)
  // If first target is a section, use its heading directly
  // Otherwise, find the parent section by looking backwards in the block list
  let targetHeading: string | undefined
  let targetHeadingLevel: number | undefined

  if (firstTarget.type === 'section' && firstTarget.metadata?.heading) {
    // First target IS a section - use its heading
    targetHeading = firstTarget.metadata.heading
    targetHeadingLevel = firstTarget.level || 2
    console.log('[extractContext] Section heading extracted from target:', {
      targetHeading,
      targetHeadingLevel,
    })
  } else {
    // First target is NOT a section (e.g., a paragraph)
    // Find the section that contains this block by looking backwards
    for (let i = firstTargetIndex - 1; i >= 0; i--) {
      const block = parsed.blocks[i]
      if (block.type === 'section' && block.metadata?.heading) {
        targetHeading = block.metadata.heading
        targetHeadingLevel = block.level || 2
        console.log('[extractContext] Found parent section:', {
          targetHeading,
          targetHeadingLevel,
          searchedFromIndex: firstTargetIndex,
          foundAtIndex: i,
        })
        break
      }
    }
  }

  // Calculate start line for the edit region
  // If we filtered out sections, use the first content block's line, not the heading line
  const firstContentBlock = contentBlocks.length > 0 ? contentBlocks[0] : firstTarget
  const lastContentBlock = contentBlocks.length > 0 ? contentBlocks[contentBlocks.length - 1] : lastTarget

  return {
    precedingContext,
    targetContent,
    followingContext,
    fullPrompt,
    targetBlockIds: sortedTargets.map((b) => b.id),
    targetStartLine: firstContentBlock.startLine,
    targetEndLine: lastContentBlock.endLine,
    targetHeading,
    targetHeadingLevel,
  }
}

/**
 * Extract context for ADD/INSERT operations
 */
export function extractInsertionContext(
  parsed: ParsedNote,
  position: 'before' | 'after' | 'start' | 'end',
  referenceBlockId?: string,
  options: ExtractionOptions = {}
): ExtractedContext {
  const {
    precedingBlocks = 2,
    followingBlocks = 2,
    maxContextChars = 500,
    includeOutline = true,
  } = options

  let insertionPoint: ExtractedContext['insertionPoint']
  let contextBlocks: BlockNode[] = []
  let targetStartLine: number
  let targetEndLine: number

  if (position === 'start') {
    // Insert at document start
    contextBlocks = parsed.blocks.slice(0, Math.min(followingBlocks, parsed.blocks.length))
    insertionPoint = {
      position: 'start',
      referenceBlockId: parsed.blocks[0]?.id || '',
      referenceDescription: 'beginning of document',
    }
    targetStartLine = 1
    targetEndLine = 1
  } else if (position === 'end') {
    // Insert at document end
    const startIdx = Math.max(0, parsed.blocks.length - precedingBlocks)
    contextBlocks = parsed.blocks.slice(startIdx)
    insertionPoint = {
      position: 'end',
      referenceBlockId: parsed.blocks[parsed.blocks.length - 1]?.id || '',
      referenceDescription: 'end of document',
    }
    targetStartLine = parsed.lineCount
    targetEndLine = parsed.lineCount
  } else if (referenceBlockId) {
    // Insert before/after specific block
    const refIndex = parsed.blocks.findIndex((b) => b.id === referenceBlockId)
    if (refIndex === -1) {
      throw new Error('Reference block not found')
    }

    const refBlock = parsed.blocks[refIndex]
    const refDesc = refBlock.type === 'section' && refBlock.metadata?.heading
      ? `section "${refBlock.metadata.heading}"`
      : `${refBlock.type} at line ${refBlock.startLine}`

    if (position === 'before') {
      const start = Math.max(0, refIndex - precedingBlocks)
      const end = Math.min(parsed.blocks.length, refIndex + followingBlocks + 1)
      contextBlocks = parsed.blocks.slice(start, end)
      insertionPoint = {
        position: 'before',
        referenceBlockId,
        referenceDescription: refDesc,
      }
      targetStartLine = refBlock.startLine
      targetEndLine = refBlock.startLine
    } else {
      const start = Math.max(0, refIndex - precedingBlocks + 1)
      const end = Math.min(parsed.blocks.length, refIndex + followingBlocks + 1)
      contextBlocks = parsed.blocks.slice(start, end)
      insertionPoint = {
        position: 'after',
        referenceBlockId,
        referenceDescription: refDesc,
      }
      targetStartLine = refBlock.endLine
      targetEndLine = refBlock.endLine
    }
  } else {
    throw new Error('Reference block ID required for before/after position')
  }

  // Build context strings
  let contextStr = contextBlocks.map((b) => b.content).join('\n\n')
  if (contextStr.length > maxContextChars * 2) {
    contextStr = contextStr.slice(0, maxContextChars) + '\n...\n' + contextStr.slice(-maxContextChars)
  }

  // Build outline string if requested
  let outlineStr = ''
  if (includeOutline && parsed.outline.length > 0) {
    outlineStr = 'Document structure:\n' + parsed.outline
      .map((o) => '  '.repeat(o.level - 1) + `- ${o.heading} (line ${o.line})`)
      .join('\n')
  }

  // insertionPoint is always defined by the code paths above
  if (!insertionPoint) {
    throw new Error('insertionPoint should be defined')
  }

  // Build full prompt for insertion
  const fullPrompt = buildInsertPrompt(
    contextStr,
    insertionPoint.position,
    insertionPoint.referenceDescription,
    outlineStr
  )

  return {
    precedingContext: '',
    targetContent: '',
    followingContext: contextStr,
    fullPrompt,
    targetBlockIds: [],
    targetStartLine,
    targetEndLine,
    insertionPoint,
  }
}

/**
 * Build the edit prompt with markers
 */
function buildEditPrompt(
  precedingContext: string,
  targetContent: string,
  followingContext: string,
  outline: string
): string {
  const parts: string[] = []

  if (outline) {
    parts.push(outline)
    parts.push('')
  }

  if (precedingContext) {
    parts.push(CONTEXT_BEFORE_MARKER)
    parts.push(precedingContext)
    parts.push(CONTEXT_BEFORE_END_MARKER)
    parts.push('')
  }

  parts.push(EDIT_START_MARKER)
  parts.push(targetContent)
  parts.push(EDIT_END_MARKER)

  if (followingContext) {
    parts.push('')
    parts.push(CONTEXT_AFTER_MARKER)
    parts.push(followingContext)
    parts.push(CONTEXT_AFTER_END_MARKER)
  }

  return parts.join('\n')
}

/**
 * Build the insertion prompt
 */
function buildInsertPrompt(
  context: string,
  position: 'before' | 'after' | 'start' | 'end',
  referenceDesc: string,
  outline: string
): string {
  const parts: string[] = []

  if (outline) {
    parts.push(outline)
    parts.push('')
  }

  parts.push(`Insertion point: ${position} ${referenceDesc}`)
  parts.push('')
  parts.push('Surrounding context:')
  parts.push(context)

  return parts.join('\n')
}

/**
 * Extract the edited content from AI response
 * Handles responses that may or may not include markers
 */
export function extractEditedContent(aiResponse: string): string {
  // Check if response includes our markers
  const startMarkerIndex = aiResponse.indexOf(EDIT_START_MARKER)
  const endMarkerIndex = aiResponse.indexOf(EDIT_END_MARKER)

  if (startMarkerIndex !== -1 && endMarkerIndex !== -1 && endMarkerIndex > startMarkerIndex) {
    // Extract content between markers
    return aiResponse
      .slice(startMarkerIndex + EDIT_START_MARKER.length, endMarkerIndex)
      .trim()
  }

  // No markers found - assume entire response is the edited content
  // But strip any context markers if present
  let content = aiResponse

  // Remove context before block if present
  const contextBeforeStart = content.indexOf(CONTEXT_BEFORE_MARKER)
  const contextBeforeEnd = content.indexOf(CONTEXT_BEFORE_END_MARKER)
  if (contextBeforeStart !== -1 && contextBeforeEnd !== -1) {
    content = content.slice(0, contextBeforeStart) + content.slice(contextBeforeEnd + CONTEXT_BEFORE_END_MARKER.length)
  }

  // Remove context after block if present
  const contextAfterStart = content.indexOf(CONTEXT_AFTER_MARKER)
  const contextAfterEnd = content.indexOf(CONTEXT_AFTER_END_MARKER)
  if (contextAfterStart !== -1 && contextAfterEnd !== -1) {
    content = content.slice(0, contextAfterStart) + content.slice(contextAfterEnd + CONTEXT_AFTER_END_MARKER.length)
  }

  return content.trim()
}

/**
 * Validate that the edited content only modifies the target section
 * Returns true if edit appears to be contained, false if it seems to modify other areas
 */
export function validateEditScope(
  originalTargetContent: string,
  editedContent: string,
  followingContext: string
): { isValid: boolean; warning?: string } {
  // Check if the edited content seems to include content from following context
  if (followingContext) {
    const followingFirstLine = followingContext.split('\n')[0]?.trim()
    if (followingFirstLine && editedContent.includes(followingFirstLine)) {
      return {
        isValid: false,
        warning: 'Edited content appears to include content from following section',
      }
    }
  }

  // Check for excessive length increase (might indicate scope creep)
  const originalLength = originalTargetContent.length
  const editedLength = editedContent.length
  if (editedLength > originalLength * 3 && editedLength > 1000) {
    return {
      isValid: true,
      warning: 'Edited content is significantly longer than original - please verify scope',
    }
  }

  return { isValid: true }
}
