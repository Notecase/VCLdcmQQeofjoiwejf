/**
 * Target Identifier
 *
 * Analyzes user instructions to identify target blocks for editing.
 * Uses multiple matching strategies with confidence scoring.
 */

import type { BlockNode, ParsedNote } from './structureParser'
import {
  findBlocksByHeading,
  findBlocksByContent,
} from './structureParser'

// ============================================================================
// Types
// ============================================================================

export type MatchType = 'heading' | 'position' | 'content' | 'inferred' | 'all'

export interface TargetResult {
  /** Matched target blocks */
  targets: BlockNode[]
  /** Confidence score 0-1 */
  confidence: number
  /** How the target was identified */
  matchType: MatchType
  /** Whether clarification from user is needed */
  needsClarification: boolean
  /** Options to present if clarification needed */
  clarificationOptions?: ClarificationOption[]
  /** Reason for the match or need for clarification */
  reason: string
}

export interface ClarificationOption {
  /** Block ID */
  id: string
  /** Display label (e.g., "Section: Introduction") */
  label: string
  /** Preview of content (first 80 chars) */
  preview: string
  /** Line number for reference */
  line: number
}

export interface IdentifyOptions {
  /** Minimum confidence to proceed without clarification (default: 0.8) */
  confidenceThreshold?: number
  /** Maximum number of targets to accept without clarification (default: 3) */
  maxTargets?: number
  /** Whether to include all content when no specific target found (default: false) */
  fallbackToAll?: boolean
}

// ============================================================================
// Position Pattern Matching
// ============================================================================

/**
 * Ordinal words to numbers
 */
const ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  last: -1,
}

/**
 * Block type aliases from natural language
 */
const TYPE_ALIASES: Record<string, string[]> = {
  section: ['section', 'part', 'chapter', 'heading'],
  paragraph: ['paragraph', 'para', 'text', 'content'],
  'list-item': ['bullet', 'item', 'point', 'list item'],
  list: ['list', 'bullets', 'points'],
  code: ['code', 'code block', 'snippet', 'example'],
  table: ['table', 'grid'],
  blockquote: ['quote', 'blockquote', 'quotation'],
}

/**
 * Parse position reference from instruction
 * Examples: "first paragraph", "part 1", "second section", "last bullet"
 */
function parsePositionReference(
  instruction: string
): { position: number; type: string } | null {
  const lower = instruction.toLowerCase()

  // Check for ordinal + type patterns
  for (const [ordinal, num] of Object.entries(ORDINALS)) {
    for (const [type, aliases] of Object.entries(TYPE_ALIASES)) {
      for (const alias of aliases) {
        // "first paragraph", "second section", etc.
        if (lower.includes(`${ordinal} ${alias}`)) {
          return { position: num, type }
        }
        // "paragraph 1", "section 2", etc.
        const numPattern = new RegExp(`${alias}\\s*(\\d+)`, 'i')
        const match = lower.match(numPattern)
        if (match) {
          return { position: parseInt(match[1]), type }
        }
        // "part 1", "bullet 2"
        const altPattern = new RegExp(`${alias}\\s*#?\\s*(\\d+)`, 'i')
        const altMatch = lower.match(altPattern)
        if (altMatch) {
          return { position: parseInt(altMatch[1]), type }
        }
      }
    }
  }

  return null
}

/**
 * Extract quoted section names from instruction
 * Examples: 'edit "Introduction"', 'modify the "Setup" section'
 */
function extractQuotedReferences(instruction: string): string[] {
  const quotes: string[] = []

  // Match double quotes
  const doubleQuotes = instruction.match(/"([^"]+)"/g)
  if (doubleQuotes) {
    quotes.push(...doubleQuotes.map((q) => q.slice(1, -1)))
  }

  // Match single quotes
  const singleQuotes = instruction.match(/'([^']+)'/g)
  if (singleQuotes) {
    quotes.push(...singleQuotes.map((q) => q.slice(1, -1)))
  }

  return quotes
}

/**
 * Extract section name references from instruction
 * Examples: "the introduction", "summary section", "about X"
 */
function extractSectionReferences(instruction: string): string[] {
  const lower = instruction.toLowerCase()
  const refs: string[] = []

  // "the X section", "the X part" - capture up to 5 words for longer section names
  // e.g., "the why it matters section" should capture "why it matters"
  // Use greedy quantifier {0,4} instead of non-greedy {0,4}? to capture full phrase
  const sectionPattern = /the\s+(\w+(?:\s+\w+){0,4})\s+(?:section|part|heading)/gi
  let match
  while ((match = sectionPattern.exec(lower)) !== null) {
    refs.push(match[1].trim())
  }

  // Also try without "the": "edit why it matters section"
  // Use greedy quantifier for full phrase capture
  const directPattern = /(?:edit|update|change|modify|expand|improve|make)\s+(\w+(?:\s+\w+){0,4})\s+section/gi
  while ((match = directPattern.exec(lower)) !== null) {
    const candidate = match[1].trim()
    if (!refs.includes(candidate)) {
      refs.push(candidate)
    }
  }

  // "in X", "about X" (if X looks like a section name)
  const aboutPattern = /(?:in|about|regarding)\s+(?:the\s+)?(\w+(?:\s+\w+)?)/gi
  while ((match = aboutPattern.exec(lower)) !== null) {
    const candidate = match[1]
    // Skip common non-section words
    if (!['this', 'that', 'the', 'a', 'an', 'it', 'note', 'document'].includes(candidate)) {
      if (!refs.includes(candidate)) {
        refs.push(candidate)
      }
    }
  }

  return refs
}

/**
 * Determine if the user explicitly wants the entire section edited.
 */
function shouldEditFullSection(instruction: string): boolean {
  const lower = instruction.toLowerCase()
  return /\b(whole|entire|all|everything|complete|full|throughout|overall)\b/.test(lower)
}

/**
 * Detect if a block's content looks like a markdown heading.
 * This helps treat malformed/indented headings as section boundaries.
 */
function looksLikeHeading(content: string): boolean {
  return /^\s*#{1,6}\s+/.test(content)
}

/**
 * Get only the intro blocks of a section (content before any subheading).
 * Returns paragraph blocks if present; otherwise returns all intro blocks.
 */
function getSectionIntroTargets(
  parsed: ParsedNote,
  sectionId: string
): BlockNode[] {
  const section = parsed.blocks.find((b) => b.id === sectionId)
  if (!section || section.type !== 'section') return []

  const sectionIndex = parsed.blocks.indexOf(section)
  const introBlocks: BlockNode[] = []

  for (let i = sectionIndex + 1; i < parsed.blocks.length; i++) {
    const block = parsed.blocks[i]

    if (block.type === 'section') break
    if (looksLikeHeading(block.content)) break

    introBlocks.push(block)
  }

  if (introBlocks.length === 0) return []

  const paragraphBlocks = introBlocks.filter((b) => b.type === 'paragraph')
  if (paragraphBlocks.length > 0) return paragraphBlocks

  return introBlocks
}

/**
 * Escape regex special characters
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Find blocks that contain a section label (e.g., "**Why It Matters:**")
 * Useful when the user refers to a section that is formatted as a bold label
 * or list item rather than a markdown heading.
 */
function findBlocksBySectionLabel(parsed: ParsedNote, sectionRefs: string[]): BlockNode[] {
  const matches: BlockNode[] = []
  const seenIds = new Set<string>()

  for (const ref of sectionRefs) {
    const normalizedRef = ref.trim()
    if (!normalizedRef) continue

    const escaped = escapeRegex(normalizedRef)
    const labelPattern = new RegExp(
      `(^|\\n)\\s*(?:[-*+]|\\d+[.)])?\\s*(?:\\*\\*|__)?${escaped}:?(?:\\*\\*|__)?\\s*(?:\\:)?(\\s|$)`,
      'i'
    )

    for (const block of parsed.blocks) {
      if (labelPattern.test(block.content) && !seenIds.has(block.id)) {
        seenIds.add(block.id)
        matches.push(block)
      }
    }
  }

  return matches
}

/**
 * Detect if instruction targets the whole document
 */
function isWholeDocumentEdit(instruction: string): boolean {
  const lower = instruction.toLowerCase()
  const wholeDocPatterns = [
    /\b(whole|entire|full|all)\s*(note|document|content)/,
    /\beverywhere\b/,
    /\ball\s*of\s*(it|this)/,
    /\boverall\b/,
    /\bcompletely\b/,
  ]
  return wholeDocPatterns.some((p) => p.test(lower))
}

// ============================================================================
// Exact Phrase Matching
// ============================================================================

/**
 * Try to find a section heading match in the instruction
 * Uses both exact matching and fuzzy word-based matching
 *
 * Example: "make the why it matters section more detailed"
 * If there's a section with heading "Why It Matters", this matches with 0.95 confidence
 */
function tryExactPhraseMatch(instruction: string, parsed: ParsedNote): TargetResult | null {
  const lower = instruction.toLowerCase()
  const extractedSection = extractSectionNameFromInstruction(lower)

  console.log('[tryExactPhraseMatch] Analyzing:', {
    instruction: lower.slice(0, 100),
    extractedSection,
  })

  // Collect all section headings
  const sections = parsed.blocks.filter(
    (b) => b.type === 'section' && b.metadata?.heading
  )

  // Track best match for fuzzy matching fallback
  let bestMatch: { block: typeof sections[0]; score: number } | null = null

  for (const block of sections) {
    const heading = (block.metadata?.heading || '').toLowerCase()
    if (!heading) continue

    // Calculate match score
    let score = 0

    // EXACT MATCHES (highest priority)
    // 1. Instruction contains exact heading: "edit the Introduction" matches "Introduction"
    if (lower.includes(heading)) {
      score = 1.0
    }
    // 2. Heading contains extracted section name exactly
    else if (extractedSection && heading.includes(extractedSection)) {
      score = 0.9
    }
    // 3. Extracted section contains heading exactly
    else if (extractedSection && extractedSection.includes(heading)) {
      score = 0.85
    }
    // FUZZY MATCH: Word overlap for partial matches
    else if (extractedSection) {
      const extractedWords = extractedSection.split(/\s+/).filter(w => w.length > 2)
      const headingWords = heading.split(/\s+/).filter(w => w.length > 2)

      if (extractedWords.length > 0 && headingWords.length > 0) {
        // Count how many extracted words appear in heading
        const overlap = extractedWords.filter(w => headingWords.includes(w)).length
        const overlapScore = overlap / Math.max(extractedWords.length, 1)

        // Require at least 50% word overlap for fuzzy match
        if (overlapScore >= 0.5) {
          score = 0.3 + (overlapScore * 0.4) // 0.5 to 0.7 range
        }
      }
    }

    // Track best match
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { block, score }
    }

    // For high-confidence exact matches, return immediately
    if (score >= 0.85) {
      const useFullSection = shouldEditFullSection(instruction)
      const sectionIntro = getSectionIntroTargets(parsed, block.id)
      const sectionWithContent = getSectionWithContent(parsed, block.id)
      const targets = useFullSection || sectionIntro.length === 0
        ? sectionWithContent
        : sectionIntro

      console.log('[tryExactPhraseMatch] High-confidence match:', {
        heading: block.metadata?.heading,
        score,
        targetCount: targets.length,
      })

      return {
        targets,
        confidence: Math.min(0.95, 0.5 + score * 0.5), // 0.85 to 0.95 range
        matchType: 'heading',
        needsClarification: false,
        reason: `Matched section: "${block.metadata?.heading}"`,
      }
    }
  }

  // Return best fuzzy match if score is reasonable (>= 0.5)
  if (bestMatch && bestMatch.score >= 0.5) {
    const useFullSection = shouldEditFullSection(instruction)
    const sectionIntro = getSectionIntroTargets(parsed, bestMatch.block.id)
    const sectionWithContent = getSectionWithContent(parsed, bestMatch.block.id)
    const targets = useFullSection || sectionIntro.length === 0
      ? sectionWithContent
      : sectionIntro

    console.log('[tryExactPhraseMatch] Fuzzy match:', {
      heading: bestMatch.block.metadata?.heading,
      score: bestMatch.score,
      targetCount: targets.length,
    })

    return {
      targets,
      confidence: Math.min(0.85, 0.5 + bestMatch.score * 0.35), // 0.5 to 0.85 range
      matchType: 'heading',
      needsClarification: false,
      reason: `Matched section: "${bestMatch.block.metadata?.heading}"`,
    }
  }

  return null
}

// ============================================================================
// Main Identifier
// ============================================================================

/**
 * Identify target blocks from user instruction
 */
export function identifyTargets(
  instruction: string,
  parsed: ParsedNote,
  options: IdentifyOptions = {}
): TargetResult {
  const {
    maxTargets = 3,
    fallbackToAll = false,
  } = options

  // Debug logging for troubleshooting
  console.log('[identifyTargets] Input:', {
    instruction,
    sectionHeadings: parsed.blocks
      .filter(b => b.type === 'section')
      .map(b => ({ heading: b.metadata?.heading, line: b.startLine })),
  })

  // Check for whole document edit
  if (isWholeDocumentEdit(instruction)) {
    return {
      targets: parsed.blocks,
      confidence: 1.0,
      matchType: 'all',
      needsClarification: false,
      reason: 'Instruction targets entire document',
    }
  }

  // Strategy 0: Exact phrase match (highest priority)
  // If user mentions an exact section heading, match it directly with high confidence
  const exactMatch = tryExactPhraseMatch(instruction, parsed)
  if (exactMatch) {
    console.log('[identifyTargets] Exact match result:', {
      matchType: exactMatch.matchType,
      targetCount: exactMatch.targets.length,
      targetLines: exactMatch.targets.map(t => ({
        type: t.type,
        start: t.startLine,
        end: t.endLine,
        heading: t.metadata?.heading
      })),
      reason: exactMatch.reason,
    })
    return exactMatch
  }

  // Strategy 1: Quoted references (highest confidence)
  const quotedRefs = extractQuotedReferences(instruction)
  if (quotedRefs.length > 0) {
    let matches: BlockNode[] = []
    for (const ref of quotedRefs) {
      const found = findBlocksByHeading(parsed, ref)
      matches.push(...found)
    }

    if (matches.length > 0) {
      const sectionBlocks = matches.filter((m) => m.type === 'section')
      const sectionCount = sectionBlocks.length

      // Expand sections based on instruction intent
      matches = expandSectionTargetsForInstruction(parsed, matches, instruction)

      return {
        targets: matches,
        confidence: 0.95,
        matchType: 'heading',
        needsClarification: sectionCount > maxTargets,
        clarificationOptions: sectionCount > maxTargets
          ? buildClarificationOptions(sectionBlocks)
          : undefined,
        reason: `Found section(s) matching quoted reference`,
      }
    }
  }

  // Strategy 2: Position reference ("first paragraph", "part 1")
  const posRef = parsePositionReference(instruction)
  if (posRef) {
    const blockType = posRef.type as BlockNode['type']
    const filteredBlocks = parsed.blocks.filter((b) => b.type === blockType ||
      (blockType === 'section' && b.type === 'section'))

    let position = posRef.position
    if (position === -1) {
      // "last" means the final one
      position = filteredBlocks.length
    }

    const target = filteredBlocks[position - 1]
    if (target) {
      return {
        targets: [target],
        confidence: 0.9,
        matchType: 'position',
        needsClarification: false,
        reason: `Found ${posRef.type} at position ${position}`,
      }
    }
  }

  // Strategy 3: Section name references
  const sectionRefs = extractSectionReferences(instruction)
  if (sectionRefs.length > 0) {
    let matches: BlockNode[] = []
    for (const ref of sectionRefs) {
      const found = findBlocksByHeading(parsed, ref)
      matches.push(...found)
    }

    if (matches.length > 0) {
      const sectionBlocks = matches.filter((m) => m.type === 'section')
      const sectionCount = sectionBlocks.length

      // Expand sections based on instruction intent
      matches = expandSectionTargetsForInstruction(parsed, matches, instruction)

      if (sectionCount === 1) {
        return {
          targets: matches,
          confidence: 0.85,
          matchType: 'heading',
          needsClarification: false,
          reason: `Found section matching "${sectionRefs[0]}"`,
        }
      }

      if (sectionCount > 1) {
        return {
          targets: matches,
          confidence: 0.6,
          matchType: 'heading',
          needsClarification: true,
          clarificationOptions: buildClarificationOptions(
            sectionBlocks
          ),
          reason: `Found ${sectionCount} possible sections - clarification needed`,
        }
      }
    }

    // Fallback: match section labels embedded in content (bold labels, list items, etc.)
    const labelMatches = findBlocksBySectionLabel(parsed, sectionRefs)
    if (labelMatches.length > 0) {
      if (labelMatches.length === 1) {
        return {
          targets: labelMatches,
          confidence: 0.75,
          matchType: 'content',
          needsClarification: false,
          reason: `Found content label matching "${sectionRefs[0]}"`,
        }
      }

      if (labelMatches.length <= maxTargets) {
        return {
          targets: labelMatches,
          confidence: 0.6,
          matchType: 'content',
          needsClarification: true,
          clarificationOptions: buildClarificationOptions(labelMatches),
          reason: `Found ${labelMatches.length} blocks matching section label - clarification needed`,
        }
      }
    }
  }

  // Strategy 4: Content search (look for quoted content or specific phrases)
  const contentMatches = searchContentForTargets(instruction, parsed)
  if (contentMatches.length > 0) {
    if (contentMatches.length === 1) {
      return {
        targets: contentMatches,
        confidence: 0.75,
        matchType: 'content',
        needsClarification: false,
        reason: 'Found block matching content reference',
      }
    }

    if (contentMatches.length <= maxTargets) {
      return {
        targets: contentMatches,
        confidence: 0.65,
        matchType: 'content',
        needsClarification: contentMatches.length > 1,
        clarificationOptions: contentMatches.length > 1
          ? buildClarificationOptions(contentMatches)
          : undefined,
        reason: `Found ${contentMatches.length} blocks with matching content`,
      }
    }
  }

  // Strategy 5: Infer from instruction context
  const inferredTarget = inferTargetFromContext(instruction, parsed)
  if (inferredTarget) {
    return {
      targets: [inferredTarget],
      confidence: 0.5,
      matchType: 'inferred',
      needsClarification: true,
      clarificationOptions: buildClarificationOptions(parsed.blocks.slice(0, 5)),
      reason: 'Target inferred from context - please confirm',
    }
  }

  // No match found
  if (fallbackToAll) {
    return {
      targets: parsed.blocks,
      confidence: 0.3,
      matchType: 'all',
      needsClarification: true,
      clarificationOptions: buildClarificationOptions(
        parsed.blocks.filter((b) => b.type === 'section').slice(0, 5)
      ),
      reason: 'No specific target found - will edit entire document. Please confirm or select a specific section.',
    }
  }

  const result: TargetResult = {
    targets: [],
    confidence: 0,
    matchType: 'inferred',
    needsClarification: true,
    clarificationOptions: buildClarificationOptions(
      parsed.blocks.filter((b) => b.type === 'section').length > 0
        ? parsed.blocks.filter((b) => b.type === 'section').slice(0, 5)
        : parsed.blocks.slice(0, 5)
    ),
    reason: 'Could not identify specific target - please select which section to edit',
  }

  // Debug logging for result
  console.log('[identifyTargets] Result:', {
    matchType: result.matchType,
    targetCount: result.targets.length,
    targetLines: result.targets.map(t => ({
      type: t.type,
      start: t.startLine,
      end: t.endLine,
      heading: t.metadata?.heading
    })),
    needsClarification: result.needsClarification,
    reason: result.reason,
  })

  return result
}

/**
 * Search content for potential targets based on instruction
 */
function searchContentForTargets(instruction: string, parsed: ParsedNote): BlockNode[] {
  // Extract potential content references (phrases after "about", "with", "containing")
  const contentPatterns = [
    /about\s+"([^"]+)"/i,
    /containing\s+"([^"]+)"/i,
    /with\s+"([^"]+)"/i,
    /mentions?\s+"([^"]+)"/i,
    /talks?\s+about\s+(\w+(?:\s+\w+)?)/i,
    /the\s+part\s+(?:about|with|on)\s+(\w+(?:\s+\w+)?)/i,
  ]

  for (const pattern of contentPatterns) {
    const match = instruction.match(pattern)
    if (match) {
      const searchTerm = match[1]
      return findBlocksByContent(parsed, searchTerm)
    }
  }

  return []
}

/**
 * Try to infer target from instruction context
 */
function inferTargetFromContext(instruction: string, parsed: ParsedNote): BlockNode | null {
  const lower = instruction.toLowerCase()

  // If instruction mentions "introduction", "intro", "beginning"
  if (/\b(intro|introduction|beginning|start)\b/.test(lower)) {
    const firstSection = parsed.blocks.find((b) => b.type === 'section')
    if (firstSection) return firstSection
    return parsed.blocks[0] || null
  }

  // If instruction mentions "conclusion", "end", "summary"
  if (/\b(conclusion|ending|end|summary|wrap.?up)\b/.test(lower)) {
    const sections = parsed.blocks.filter((b) => b.type === 'section')
    if (sections.length > 0) return sections[sections.length - 1]
    return parsed.blocks[parsed.blocks.length - 1] || null
  }

  return null
}

/**
 * Build clarification options from blocks
 */
function buildClarificationOptions(blocks: BlockNode[]): ClarificationOption[] {
  return blocks.map((block) => {
    let label: string
    if (block.type === 'section' && block.metadata?.heading) {
      label = `Section: ${block.metadata.heading}`
    } else if (block.type === 'list') {
      const itemCount = block.children.length
      label = `List (${itemCount} items)`
    } else if (block.type === 'code') {
      const lang = block.metadata?.language || 'code'
      label = `Code block (${lang})`
    } else {
      label = `${block.type.charAt(0).toUpperCase() + block.type.slice(1)} at line ${block.startLine}`
    }

    // Get preview (first 80 chars, cleaned up)
    const preview = block.content
      .replace(/^#+\s*/, '') // Remove heading markers
      .replace(/\n/g, ' ')
      .slice(0, 80)
      .trim()

    return {
      id: block.id,
      label,
      preview: preview + (block.content.length > 80 ? '...' : ''),
      line: block.startLine,
    }
  })
}

/**
 * Re-identify targets with explicit block selection
 * Called after user selects from clarification options
 *
 * NOTE: This function matches by UUID which can fail if the document
 * was re-parsed between clarification request and resolution.
 * Prefer selectTargetsByLineNumber() for stable matching.
 */
export function selectTargetsById(
  parsed: ParsedNote,
  blockIds: string[]
): TargetResult {
  const targets = parsed.blocks.filter((b) => blockIds.includes(b.id))

  if (targets.length === 0) {
    return {
      targets: [],
      confidence: 0,
      matchType: 'inferred',
      needsClarification: true,
      reason: 'Selected blocks not found',
    }
  }

  return {
    targets,
    confidence: 1.0,
    matchType: 'heading', // User explicitly selected
    needsClarification: false,
    reason: `User selected ${targets.length} block(s)`,
  }
}

/**
 * Re-identify targets by line numbers (stable across re-parsing)
 *
 * When a document is re-parsed, block IDs are regenerated with new UUIDs.
 * However, line numbers remain stable. This function matches blocks by
 * their startLine property, which is reliable for clarification resolution.
 *
 * @param parsed - The freshly parsed note structure
 * @param lineNumbers - Line numbers from the original clarification options
 * @returns TargetResult with matched blocks
 */
export function selectTargetsByLineNumber(
  parsed: ParsedNote,
  lineNumbers: number[]
): TargetResult {
  // Find blocks where startLine matches one of the requested line numbers
  const targets = parsed.blocks.filter((b) => lineNumbers.includes(b.startLine))

  if (targets.length === 0) {
    // If exact match fails, try to find blocks near the requested lines
    // This handles edge cases where minor content changes shifted lines
    const tolerance = 3
    const nearbyTargets = parsed.blocks.filter((block) =>
      lineNumbers.some((line) => Math.abs(block.startLine - line) <= tolerance)
    )

    if (nearbyTargets.length > 0) {
      console.log('[selectTargetsByLineNumber] Used tolerance matching:', {
        requested: lineNumbers,
        found: nearbyTargets.map((b) => b.startLine),
      })
      return {
        targets: nearbyTargets,
        confidence: 0.85, // Slightly lower confidence for tolerance match
        matchType: 'position',
        needsClarification: false,
        reason: `Found ${nearbyTargets.length} block(s) near requested lines`,
      }
    }

    return {
      targets: [],
      confidence: 0,
      matchType: 'inferred',
      needsClarification: true,
      reason: 'Blocks at selected lines not found - content may have changed',
    }
  }

  return {
    targets,
    confidence: 1.0,
    matchType: 'position', // Matched by line position
    needsClarification: false,
    reason: `Matched ${targets.length} block(s) by line number`,
  }
}

/**
 * Get section and all its content blocks
 * Useful for editing a whole section including paragraphs, lists, etc.
 */
export function getSectionWithContent(
  parsed: ParsedNote,
  sectionId: string
): BlockNode[] {
  const section = parsed.blocks.find((b) => b.id === sectionId)
  if (!section || section.type !== 'section') {
    return section ? [section] : []
  }

  const sectionLevel = section.level || 1
  const sectionIndex = parsed.blocks.indexOf(section)
  const result: BlockNode[] = [section]

  // Include all blocks until next section heading (ANY level)
  // This ensures section edits are isolated and don't bleed into adjacent sections
  for (let i = sectionIndex + 1; i < parsed.blocks.length; i++) {
    const block = parsed.blocks[i]
    if (block.type === 'section') {
      // Stop at ANY section heading to prevent content from adjacent sections
      // appearing in the edit region
      console.log('[getSectionWithContent] Stopping at section:', {
        heading: block.metadata?.heading,
        level: block.level,
      })
      break
    }
    result.push(block)
  }

  console.log('[getSectionWithContent] Result:', {
    sectionHeading: section.metadata?.heading,
    sectionLevel,
    blocksIncluded: result.length,
    blockTypes: result.map(b => b.type),
  })

  return result
}

// ============================================================================
// Section Expansion Helper
// ============================================================================

/**
 * Expand section blocks to include their content
 * Non-section blocks are returned as-is
 *
 * When a section block is matched by heading, it only contains the heading line.
 * This helper expands each section to include all content blocks under it.
 */
function expandSectionTargets(
  parsed: ParsedNote,
  blocks: BlockNode[]
): BlockNode[] {
  const result: BlockNode[] = []
  const seenIds = new Set<string>()

  for (const block of blocks) {
    if (block.type === 'section') {
      const expanded = getSectionWithContent(parsed, block.id)
      for (const b of expanded) {
        if (!seenIds.has(b.id)) {
          seenIds.add(b.id)
          result.push(b)
        }
      }
    } else {
      if (!seenIds.has(block.id)) {
        seenIds.add(block.id)
        result.push(block)
      }
    }
  }

  return result
}

/**
 * Expand section targets based on instruction intent (full section vs intro only).
 */
function expandSectionTargetsForInstruction(
  parsed: ParsedNote,
  blocks: BlockNode[],
  instruction: string
): BlockNode[] {
  const useFullSection = shouldEditFullSection(instruction)
  const result: BlockNode[] = []
  const seenIds = new Set<string>()

  for (const block of blocks) {
    if (block.type === 'section') {
      const introTargets = getSectionIntroTargets(parsed, block.id)
      const expanded = useFullSection || introTargets.length === 0
        ? getSectionWithContent(parsed, block.id)
        : introTargets

      for (const b of expanded) {
        if (!seenIds.has(b.id)) {
          seenIds.add(b.id)
          result.push(b)
        }
      }
    } else {
      if (!seenIds.has(block.id)) {
        seenIds.add(block.id)
        result.push(block)
      }
    }
  }

  return result
}

/**
 * Extract the section name mentioned in an instruction
 * e.g., "make the why it matters section more detailed" -> "why it matters"
 */
function extractSectionNameFromInstruction(instruction: string): string {
  const lower = instruction.toLowerCase()

  // Pattern: "the X section" or "X section"
  // Use a more specific pattern that captures up to common stop words
  // Stop before: more, less, better, shorter, longer, detailed, concise
  const sectionPattern = /(?:the\s+)?([^,]+?)\s+section(?:\s|$|,)/i
  const match = lower.match(sectionPattern)
  if (match) {
    // Clean up the extracted section name - remove trailing modifiers
    let extracted = match[1].trim()
    // Remove trailing words like "more", "less", "better" if they got captured
    extracted = extracted.replace(/\s+(more|less|better|shorter|longer)$/i, '')
    return extracted
  }

  // Pattern: "in X", "to X" followed by common edit words
  const inPattern = /(?:in|to|of)\s+(?:the\s+)?([^,]+?)(?:\s+(?:more|less|better|section|part))/i
  const inMatch = lower.match(inPattern)
  if (inMatch) {
    return inMatch[1].trim()
  }

  return ''
}
