/**
 * Muya Markdown Parser Utility
 *
 * Parses markdown content into Muya block states without rebuilding the entire document.
 * Uses Muya's MarkdownToState class to properly convert markdown syntax into
 * correct block types (atx-heading, table, code-block, etc.).
 */

import { MarkdownToState } from '@inkdown/muya/state/markdownToState'
import type { TState } from '@inkdown/muya'

interface MuyaOptions {
  math?: boolean
  isGitlabCompatibilityEnabled?: boolean
  frontMatter?: boolean
  footnote?: boolean
  trimUnnecessaryCodeBlockEmptyLines?: boolean
}

interface MuyaInstance {
  options: MuyaOptions
}

/**
 * Parse markdown content to Muya block states.
 *
 * This is useful for creating proper block types (headings, tables, code blocks, etc.)
 * from markdown text, without using setMarkdown() which rebuilds the entire document.
 *
 * @param muya - The Muya instance (used to read parsing options)
 * @param markdown - The markdown content to parse
 * @returns Array of TState objects representing the parsed blocks
 *
 * @example
 * ```typescript
 * const states = parseMarkdownToStates(muya, '## Heading\n\n| A | B |\n|---|---|\n| 1 | 2 |')
 * // Returns: [
 * //   { name: 'atx-heading', meta: { level: 2 }, text: '## Heading' },
 * //   { name: 'table', children: [...] }
 * // ]
 * ```
 */
export function parseMarkdownToStates(muya: MuyaInstance, markdown: string): TState[] {
  const {
    math = true,
    isGitlabCompatibilityEnabled = true,
    frontMatter = true,
    footnote = false,
    trimUnnecessaryCodeBlockEmptyLines = false,
  } = muya.options

  const parser = new MarkdownToState({
    math,
    isGitlabCompatibilityEnabled,
    frontMatter,
    footnote,
    trimUnnecessaryCodeBlockEmptyLines,
  })

  return parser.generate(markdown)
}

/**
 * Check if a parsed state represents a simple paragraph
 * (used to determine if we need special handling)
 */
export function isSimpleParagraph(state: TState): boolean {
  return state.name === 'paragraph'
}

/**
 * Get the block name for a state (for display/debugging purposes)
 */
export function getBlockTypeName(state: TState): string {
  switch (state.name) {
    case 'atx-heading':
    case 'setext-heading':
      return 'heading'
    case 'code-block':
      return 'code'
    case 'table':
      return 'table'
    case 'bullet-list':
    case 'order-list':
    case 'task-list':
      return 'list'
    case 'block-quote':
      return 'quote'
    case 'thematic-break':
      return 'divider'
    case 'math-block':
      return 'math'
    case 'diagram':
      return 'diagram'
    case 'html-block':
      return 'html'
    case 'frontmatter':
      return 'frontmatter'
    default:
      return state.name
  }
}
