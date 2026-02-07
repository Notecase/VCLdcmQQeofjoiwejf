/**
 * Structure Parser
 *
 * Parses markdown into a hierarchical block tree with positions.
 * Used for targeted editing - enables AI to identify and edit specific sections.
 */

// ============================================================================
// Types
// ============================================================================

export type BlockType =
  | 'section'
  | 'paragraph'
  | 'list'
  | 'list-item'
  | 'code'
  | 'table'
  | 'blockquote'
  | 'thematic-break'

export interface BlockNode {
  /** Unique block ID */
  id: string
  /** Block type */
  type: BlockType
  /** Heading level (1-6) for sections */
  level?: number
  /** Raw markdown content */
  content: string
  /** Line number in source (1-indexed) */
  startLine: number
  /** End line number in source (1-indexed) */
  endLine: number
  /** Character offset from start of document */
  startChar: number
  /** End character offset */
  endChar: number
  /** Nested blocks (list items, subsections) */
  children: BlockNode[]
  /** Additional metadata */
  metadata?: {
    /** Heading text for sections */
    heading?: string
    /** Language for code blocks */
    language?: string
    /** List type (bullet or numbered) */
    listType?: 'bullet' | 'numbered'
    /** Whether this is the first block in document */
    isFirst?: boolean
    /** Whether this is the last block in document */
    isLast?: boolean
  }
}

export interface OutlineItem {
  /** Block ID reference */
  id: string
  /** Heading text */
  heading: string
  /** Heading level (1-6) */
  level: number
  /** Line number */
  line: number
}

export interface ParsedNote {
  /** Flat list of all blocks in document order */
  blocks: BlockNode[]
  /** Hierarchical tree (sections with nested content) */
  tree: BlockNode[]
  /** Quick reference for sections/headings */
  outline: OutlineItem[]
  /** Total line count */
  lineCount: number
  /** Total character count */
  charCount: number
}

// ============================================================================
// Parser Implementation
// ============================================================================

/**
 * Generate a unique block ID
 */
function generateBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Detect if a line is a heading and return its level
 */
function getHeadingLevel(line: string): number | null {
  const match = line.match(/^(#{1,6})\s/)
  return match ? match[1].length : null
}

/**
 * Detect if a line starts a fenced code block
 */
function isCodeFenceStart(line: string): { language: string } | null {
  const match = line.match(/^```(\w*)/)
  if (match) {
    return { language: match[1] || '' }
  }
  return null
}

/**
 * Detect if a line ends a fenced code block
 */
function isCodeFenceEnd(line: string): boolean {
  return line.trim() === '```'
}

/**
 * Detect if a line is a list item (bullet or numbered)
 */
function getListItemInfo(line: string): { type: 'bullet' | 'numbered'; indent: number } | null {
  // Bullet list: - item, * item, + item
  const bulletMatch = line.match(/^(\s*)([-*+])\s/)
  if (bulletMatch) {
    return { type: 'bullet', indent: bulletMatch[1].length }
  }

  // Numbered list: 1. item, 2) item
  const numberedMatch = line.match(/^(\s*)\d+[.)]\s/)
  if (numberedMatch) {
    return { type: 'numbered', indent: numberedMatch[1].length }
  }

  return null
}

/**
 * Detect if a line is a blockquote
 */
function isBlockquote(line: string): boolean {
  return line.trimStart().startsWith('>')
}

/**
 * Detect if a line is a table row
 */
function isTableRow(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('|') && trimmed.endsWith('|')
}

/**
 * Detect if a line is a thematic break (---, ***, ___)
 */
function isThematicBreak(line: string): boolean {
  const trimmed = line.trim()
  return /^[-*_]{3,}$/.test(trimmed)
}

/**
 * Check if a line is blank
 */
function isBlankLine(line: string): boolean {
  return line.trim() === ''
}

/**
 * Parse markdown content into a structured block tree
 */
export function parseMarkdownStructure(markdown: string): ParsedNote {
  const lines = markdown.split('\n')
  const blocks: BlockNode[] = []
  const outline: OutlineItem[] = []

  let currentCharOffset = 0
  let lineIndex = 0

  // State for multi-line blocks
  let inCodeBlock = false
  let codeBlockStart = 0
  let codeBlockLanguage = ''
  let codeBlockContent: string[] = []
  let codeBlockStartChar = 0

  let inTable = false
  let tableStart = 0
  let tableContent: string[] = []
  let tableStartChar = 0

  let inBlockquote = false
  let blockquoteStart = 0
  let blockquoteContent: string[] = []
  let blockquoteStartChar = 0

  let inList = false
  let listStart = 0
  let listContent: string[] = []
  let listStartChar = 0
  let listType: 'bullet' | 'numbered' = 'bullet'
  let currentListIndent = 0

  // Track paragraphs
  let paragraphStart = -1
  let paragraphContent: string[] = []
  let paragraphStartChar = 0

  /**
   * Flush pending paragraph if any
   */
  function flushParagraph() {
    if (paragraphContent.length > 0) {
      const content = paragraphContent.join('\n')
      const endLine = lineIndex // Previous line
      const endChar = currentCharOffset - 1 // Before current line

      blocks.push({
        id: generateBlockId(),
        type: 'paragraph',
        content,
        startLine: paragraphStart + 1, // 1-indexed
        endLine,
        startChar: paragraphStartChar,
        endChar,
        children: [],
      })

      paragraphContent = []
      paragraphStart = -1
    }
  }

  /**
   * Flush pending list if any
   */
  function flushList() {
    if (listContent.length > 0) {
      const content = listContent.join('\n')
      const endLine = lineIndex
      const endChar = currentCharOffset - 1

      const listBlock: BlockNode = {
        id: generateBlockId(),
        type: 'list',
        content,
        startLine: listStart + 1,
        endLine,
        startChar: listStartChar,
        endChar,
        children: [],
        metadata: { listType },
      }

      // Parse list items as children
      let itemLines: string[] = []
      let itemStartLine = listStart

      for (let i = 0; i < listContent.length; i++) {
        const line = listContent[i]
        const itemInfo = getListItemInfo(line)

        if (itemInfo && itemInfo.indent === 0) {
          // New top-level item
          if (itemLines.length > 0) {
            listBlock.children.push({
              id: generateBlockId(),
              type: 'list-item',
              content: itemLines.join('\n'),
              startLine: itemStartLine + 1,
              endLine: listStart + i,
              startChar: 0,
              endChar: 0,
              children: [],
            })
          }
          itemLines = [line]
          itemStartLine = listStart + i
        } else {
          itemLines.push(line)
        }
      }

      // Flush last item
      if (itemLines.length > 0) {
        listBlock.children.push({
          id: generateBlockId(),
          type: 'list-item',
          content: itemLines.join('\n'),
          startLine: itemStartLine + 1,
          endLine: listStart + listContent.length,
          startChar: 0,
          endChar: 0,
          children: [],
        })
      }

      blocks.push(listBlock)
      listContent = []
      inList = false
    }
  }

  /**
   * Flush pending blockquote if any
   */
  function flushBlockquote() {
    if (blockquoteContent.length > 0) {
      const content = blockquoteContent.join('\n')
      const endLine = lineIndex
      const endChar = currentCharOffset - 1

      blocks.push({
        id: generateBlockId(),
        type: 'blockquote',
        content,
        startLine: blockquoteStart + 1,
        endLine,
        startChar: blockquoteStartChar,
        endChar,
        children: [],
      })

      blockquoteContent = []
      inBlockquote = false
    }
  }

  /**
   * Flush pending table if any
   */
  function flushTable() {
    if (tableContent.length > 0) {
      const content = tableContent.join('\n')
      const endLine = lineIndex
      const endChar = currentCharOffset - 1

      blocks.push({
        id: generateBlockId(),
        type: 'table',
        content,
        startLine: tableStart + 1,
        endLine,
        startChar: tableStartChar,
        endChar,
        children: [],
      })

      tableContent = []
      inTable = false
    }
  }

  // Process each line
  while (lineIndex < lines.length) {
    const line = lines[lineIndex]
    const lineStartChar = currentCharOffset
    const lineLength = line.length

    // Handle code blocks (highest priority)
    if (inCodeBlock) {
      if (isCodeFenceEnd(line)) {
        codeBlockContent.push(line)
        const content = codeBlockContent.join('\n')

        blocks.push({
          id: generateBlockId(),
          type: 'code',
          content,
          startLine: codeBlockStart + 1,
          endLine: lineIndex + 1,
          startChar: codeBlockStartChar,
          endChar: currentCharOffset + lineLength,
          children: [],
          metadata: { language: codeBlockLanguage },
        })

        inCodeBlock = false
        codeBlockContent = []
      } else {
        codeBlockContent.push(line)
      }
      currentCharOffset += lineLength + 1 // +1 for newline
      lineIndex++
      continue
    }

    const codeFence = isCodeFenceStart(line)
    if (codeFence) {
      flushParagraph()
      flushList()
      flushBlockquote()
      flushTable()

      inCodeBlock = true
      codeBlockStart = lineIndex
      codeBlockLanguage = codeFence.language
      codeBlockContent = [line]
      codeBlockStartChar = lineStartChar
      currentCharOffset += lineLength + 1
      lineIndex++
      continue
    }

    // Handle thematic breaks
    if (isThematicBreak(line)) {
      flushParagraph()
      flushList()
      flushBlockquote()
      flushTable()

      blocks.push({
        id: generateBlockId(),
        type: 'thematic-break',
        content: line,
        startLine: lineIndex + 1,
        endLine: lineIndex + 1,
        startChar: lineStartChar,
        endChar: currentCharOffset + lineLength,
        children: [],
      })

      currentCharOffset += lineLength + 1
      lineIndex++
      continue
    }

    // Handle headings
    const headingLevel = getHeadingLevel(line)
    if (headingLevel !== null) {
      flushParagraph()
      flushList()
      flushBlockquote()
      flushTable()

      const headingText = line.replace(/^#{1,6}\s+/, '').trim()
      const sectionBlock: BlockNode = {
        id: generateBlockId(),
        type: 'section',
        level: headingLevel,
        content: line,
        startLine: lineIndex + 1,
        endLine: lineIndex + 1,
        startChar: lineStartChar,
        endChar: currentCharOffset + lineLength,
        children: [],
        metadata: { heading: headingText },
      }

      blocks.push(sectionBlock)
      outline.push({
        id: sectionBlock.id,
        heading: headingText,
        level: headingLevel,
        line: lineIndex + 1,
      })

      currentCharOffset += lineLength + 1
      lineIndex++
      continue
    }

    // Handle tables
    if (isTableRow(line)) {
      flushParagraph()
      flushList()
      flushBlockquote()

      if (!inTable) {
        inTable = true
        tableStart = lineIndex
        tableStartChar = lineStartChar
        tableContent = []
      }
      tableContent.push(line)
      currentCharOffset += lineLength + 1
      lineIndex++
      continue
    } else if (inTable) {
      flushTable()
    }

    // Handle blockquotes
    if (isBlockquote(line)) {
      flushParagraph()
      flushList()
      flushTable()

      if (!inBlockquote) {
        inBlockquote = true
        blockquoteStart = lineIndex
        blockquoteStartChar = lineStartChar
        blockquoteContent = []
      }
      blockquoteContent.push(line)
      currentCharOffset += lineLength + 1
      lineIndex++
      continue
    } else if (inBlockquote) {
      flushBlockquote()
    }

    // Handle lists
    const listItemInfo = getListItemInfo(line)
    if (listItemInfo) {
      flushParagraph()
      flushBlockquote()
      flushTable()

      if (!inList) {
        inList = true
        listStart = lineIndex
        listStartChar = lineStartChar
        listContent = []
        listType = listItemInfo.type
        currentListIndent = listItemInfo.indent
      }
      listContent.push(line)
      currentCharOffset += lineLength + 1
      lineIndex++
      continue
    } else if (inList) {
      // Check if this is a continuation line (indented content)
      const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length || 0
      if (leadingSpaces > currentListIndent && !isBlankLine(line)) {
        listContent.push(line)
        currentCharOffset += lineLength + 1
        lineIndex++
        continue
      } else if (isBlankLine(line)) {
        // Blank line might continue list or end it
        listContent.push(line)
        currentCharOffset += lineLength + 1
        lineIndex++
        continue
      } else {
        flushList()
      }
    }

    // Handle blank lines
    if (isBlankLine(line)) {
      flushParagraph()
      currentCharOffset += lineLength + 1
      lineIndex++
      continue
    }

    // Default: paragraph
    if (paragraphStart === -1) {
      paragraphStart = lineIndex
      paragraphStartChar = lineStartChar
    }
    paragraphContent.push(line)
    currentCharOffset += lineLength + 1
    lineIndex++
  }

  // Flush any remaining blocks
  flushParagraph()
  flushList()
  flushBlockquote()
  flushTable()

  if (inCodeBlock && codeBlockContent.length > 0) {
    // Unclosed code block
    blocks.push({
      id: generateBlockId(),
      type: 'code',
      content: codeBlockContent.join('\n'),
      startLine: codeBlockStart + 1,
      endLine: lines.length,
      startChar: codeBlockStartChar,
      endChar: currentCharOffset,
      children: [],
      metadata: { language: codeBlockLanguage },
    })
  }

  // Mark first and last blocks
  if (blocks.length > 0) {
    blocks[0].metadata = { ...blocks[0].metadata, isFirst: true }
    blocks[blocks.length - 1].metadata = { ...blocks[blocks.length - 1].metadata, isLast: true }
  }

  // Build hierarchical tree from flat blocks
  const tree = buildTree(blocks)

  return {
    blocks,
    tree,
    outline,
    lineCount: lines.length,
    charCount: markdown.length,
  }
}

/**
 * Build a hierarchical tree from flat blocks
 * Sections contain subsequent content until next section of same or higher level
 */
function buildTree(blocks: BlockNode[]): BlockNode[] {
  const tree: BlockNode[] = []
  const stack: { node: BlockNode; level: number }[] = []

  for (const block of blocks) {
    if (block.type === 'section' && block.level !== undefined) {
      // Pop stack until we find a parent with lower level
      while (stack.length > 0 && stack[stack.length - 1].level >= block.level) {
        stack.pop()
      }

      if (stack.length === 0) {
        // Top-level section
        tree.push(block)
      } else {
        // Nested section
        stack[stack.length - 1].node.children.push(block)
      }

      stack.push({ node: block, level: block.level })
    } else {
      // Non-section block
      if (stack.length === 0) {
        // No parent section, add to tree root
        tree.push(block)
      } else {
        // Add to current section
        stack[stack.length - 1].node.children.push(block)
      }
    }
  }

  return tree
}

/**
 * Get a block by its ID
 */
export function getBlockById(parsed: ParsedNote, id: string): BlockNode | null {
  return parsed.blocks.find((b) => b.id === id) || null
}

/**
 * Get blocks by line range (inclusive)
 */
export function getBlocksByLineRange(
  parsed: ParsedNote,
  startLine: number,
  endLine: number
): BlockNode[] {
  return parsed.blocks.filter(
    (b) =>
      (b.startLine >= startLine && b.startLine <= endLine) ||
      (b.endLine >= startLine && b.endLine <= endLine) ||
      (b.startLine <= startLine && b.endLine >= endLine)
  )
}

/**
 * Get the section containing a specific line
 */
export function getSectionAtLine(parsed: ParsedNote, line: number): BlockNode | null {
  const sections = parsed.blocks.filter((b) => b.type === 'section')

  // Find the last section that starts before or at this line
  let containingSection: BlockNode | null = null
  for (const section of sections) {
    if (section.startLine <= line) {
      containingSection = section
    } else {
      break
    }
  }

  return containingSection
}

/**
 * Find blocks by heading text (fuzzy match)
 */
export function findBlocksByHeading(parsed: ParsedNote, searchText: string): BlockNode[] {
  const normalized = searchText.toLowerCase().trim()
  return parsed.blocks.filter((b) => {
    if (b.type !== 'section' || !b.metadata?.heading) return false
    const heading = b.metadata.heading.toLowerCase()
    return heading.includes(normalized) || normalized.includes(heading)
  })
}

/**
 * Find blocks by content (text search)
 */
export function findBlocksByContent(parsed: ParsedNote, searchText: string): BlockNode[] {
  const normalized = searchText.toLowerCase()
  return parsed.blocks.filter((b) => b.content.toLowerCase().includes(normalized))
}

/**
 * Get block at a specific position (for "first paragraph", "third bullet", etc.)
 */
export function getBlockByPosition(
  parsed: ParsedNote,
  position: number,
  type?: BlockType
): BlockNode | null {
  const filtered = type ? parsed.blocks.filter((b) => b.type === type) : parsed.blocks
  return filtered[position - 1] || null // 1-indexed
}

/**
 * Get all paragraphs in a section (including nested)
 */
export function getParagraphsInSection(section: BlockNode): BlockNode[] {
  const paragraphs: BlockNode[] = []

  function collect(node: BlockNode) {
    if (node.type === 'paragraph') {
      paragraphs.push(node)
    }
    for (const child of node.children) {
      collect(child)
    }
  }

  for (const child of section.children) {
    collect(child)
  }

  return paragraphs
}
