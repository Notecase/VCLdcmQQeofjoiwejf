/**
 * Structure Parser — re-exported from @inkdown/shared
 *
 * This module re-exports the canonical implementation from @inkdown/shared.
 * All consumers within @inkdown/ai continue to work without changes.
 */

export {
  parseMarkdownStructure,
  getBlockById,
  getBlocksByLineRange,
  getSectionAtLine,
  findBlocksByHeading,
  findBlocksByContent,
  getBlockByPosition,
  getParagraphsInSection,
  spliceAtBlockIndex,
  resolveAfterHeadingIndex,
} from '@inkdown/shared/utils'

export type { BlockType, BlockNode, OutlineItem, ParsedNote } from '@inkdown/shared/utils'
