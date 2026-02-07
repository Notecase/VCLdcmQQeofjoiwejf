import { parseMarkdownStructure, type ParsedNote } from '@inkdown/ai/utils/structureParser'

function findBlockIndexByLine(parsed: ParsedNote, lineNumber: number): number {
  const { blocks } = parsed
  if (blocks.length === 0) return 0

  const directIndex = blocks.findIndex(
    (block) => lineNumber >= block.startLine && lineNumber <= block.endLine
  )
  if (directIndex !== -1) return directIndex

  let fallbackIndex = -1
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].startLine <= lineNumber) {
      fallbackIndex = i
    } else {
      break
    }
  }

  if (fallbackIndex !== -1) return fallbackIndex
  return 0
}

/**
 * Map a 1-indexed line number in markdown to a block index
 * based on the same block parsing used by the AI pipeline.
 */
export function mapLineToBlockIndex(markdown: string, lineNumber: number): number {
  const safeLine = Math.max(1, lineNumber)
  const parsed = parseMarkdownStructure(markdown)

  const blockIndex = findBlockIndexByLine(parsed, safeLine)
  return Math.min(blockIndex, parsed.blocks.length - 1)
}
