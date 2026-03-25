import { MarkdownToState } from '@inkdown/muya/state/markdownToState'
import ExportMarkdown from '@inkdown/muya/state/stateToMarkdown'

/**
 * Map a 1-indexed line number in markdown to a Muya block index.
 *
 * Uses Muya's own MarkdownToState parser so the block count matches
 * the DOM blocks Muya creates (fixes math blocks, diagrams, frontmatter, etc.).
 */
export function mapLineToBlockIndex(markdown: string, lineNumber: number): number {
  const safeLine = Math.max(1, lineNumber)

  // Parse using Muya's own parser — same one that creates DOM blocks
  const parser = new MarkdownToState({
    math: true,
    isGitlabCompatibilityEnabled: true,
    frontMatter: true,
    footnote: false,
    trimUnnecessaryCodeBlockEmptyLines: false,
  })
  const states = parser.generate(markdown)

  if (states.length <= 1) return 0

  // Build line ranges by serializing each block individually
  const blockRanges: Array<{ start: number; end: number }> = []
  let cursor = 1

  for (let i = 0; i < states.length; i++) {
    const blockMd = new ExportMarkdown().generate([states[i]])
    const lines = blockMd.split('\n')
    // Trailing empty string from split means the block ended with \n
    const lineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length

    blockRanges.push({ start: cursor, end: cursor + lineCount - 1 })
    cursor += lineCount + 1 // +1 for blank separator line between blocks
  }

  // Scale if re-serialized total differs from original line count
  const origTotal = markdown.split('\n').length
  const reserTotal = blockRanges[blockRanges.length - 1].end
  let target = safeLine
  if (origTotal !== reserTotal && reserTotal > 0) {
    target = Math.max(1, Math.round((safeLine / origTotal) * reserTotal))
  }

  // Find containing block (gap lines between blocks map to preceding block)
  for (let i = 0; i < blockRanges.length; i++) {
    if (target >= blockRanges[i].start && target <= blockRanges[i].end) return i
    // Target is in the gap before this block — belongs to previous block
    if (target < blockRanges[i].start && i > 0) return i - 1
  }
  return blockRanges.length - 1
}
