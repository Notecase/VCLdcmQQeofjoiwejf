/**
 * Structure Parser Tests
 *
 * Verifies that parseMarkdownStructure produces accurate startChar/endChar
 * offsets, which are critical for spliceAtBlockIndex in editor-deep/tools.ts.
 */

import { describe, it, expect } from 'vitest'
import { parseMarkdownStructure, findBlocksByHeading } from './structureParser'

describe('parseMarkdownStructure — startChar/endChar accuracy', () => {
  it('single paragraph', () => {
    const md = 'Hello world'
    const parsed = parseMarkdownStructure(md)
    expect(parsed.blocks).toHaveLength(1)
    const block = parsed.blocks[0]
    expect(block.type).toBe('paragraph')
    expect(md.slice(block.startChar, block.endChar)).toBe('Hello world')
  })

  it('two paragraphs separated by blank line', () => {
    const md = 'First paragraph\n\nSecond paragraph'
    const parsed = parseMarkdownStructure(md)
    expect(parsed.blocks).toHaveLength(2)
    for (const block of parsed.blocks) {
      expect(md.slice(block.startChar, block.endChar)).toBe(block.content)
    }
  })

  it('heading followed by paragraph', () => {
    const md = '# Title\n\nSome body text here'
    const parsed = parseMarkdownStructure(md)
    expect(parsed.blocks).toHaveLength(2)
    expect(parsed.blocks[0].type).toBe('section')
    expect(parsed.blocks[1].type).toBe('paragraph')
    for (const block of parsed.blocks) {
      expect(md.slice(block.startChar, block.endChar)).toBe(block.content)
    }
  })

  it('multiple headings and paragraphs', () => {
    const md = [
      '# Introduction',
      '',
      'This is the intro.',
      '',
      '## Methods',
      '',
      'We used method X.',
      '',
      '## Results',
      '',
      'The results show...',
    ].join('\n')
    const parsed = parseMarkdownStructure(md)
    expect(parsed.blocks).toHaveLength(6)
    for (const block of parsed.blocks) {
      expect(md.slice(block.startChar, block.endChar)).toBe(block.content)
    }
  })

  it('code block', () => {
    const md = '```python\nprint("hello")\n```'
    const parsed = parseMarkdownStructure(md)
    expect(parsed.blocks).toHaveLength(1)
    const block = parsed.blocks[0]
    expect(block.type).toBe('code')
    expect(md.slice(block.startChar, block.endChar)).toBe(block.content)
  })

  it('code block surrounded by paragraphs', () => {
    const md = 'Before\n\n```js\nconst x = 1\n```\n\nAfter'
    const parsed = parseMarkdownStructure(md)
    expect(parsed.blocks).toHaveLength(3)
    for (const block of parsed.blocks) {
      expect(md.slice(block.startChar, block.endChar)).toBe(block.content)
    }
  })

  it('bullet list', () => {
    const md = '- Item 1\n- Item 2\n- Item 3'
    const parsed = parseMarkdownStructure(md)
    expect(parsed.blocks).toHaveLength(1)
    const block = parsed.blocks[0]
    expect(block.type).toBe('list')
    expect(md.slice(block.startChar, block.endChar)).toBe(block.content)
  })

  it('numbered list', () => {
    const md = '1. First\n2. Second\n3. Third'
    const parsed = parseMarkdownStructure(md)
    expect(parsed.blocks).toHaveLength(1)
    const block = parsed.blocks[0]
    expect(block.type).toBe('list')
    expect(md.slice(block.startChar, block.endChar)).toBe(block.content)
  })

  it('table', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    const parsed = parseMarkdownStructure(md)
    expect(parsed.blocks).toHaveLength(1)
    const block = parsed.blocks[0]
    expect(block.type).toBe('table')
    expect(md.slice(block.startChar, block.endChar)).toBe(block.content)
  })

  it('blockquote', () => {
    const md = '> This is a quote\n> with two lines'
    const parsed = parseMarkdownStructure(md)
    expect(parsed.blocks).toHaveLength(1)
    const block = parsed.blocks[0]
    expect(block.type).toBe('blockquote')
    expect(md.slice(block.startChar, block.endChar)).toBe(block.content)
  })

  it('thematic break', () => {
    const md = 'Before\n\n---\n\nAfter'
    const parsed = parseMarkdownStructure(md)
    expect(parsed.blocks).toHaveLength(3)
    for (const block of parsed.blocks) {
      expect(md.slice(block.startChar, block.endChar)).toBe(block.content)
    }
  })

  it('multi-line paragraph', () => {
    const md = 'Line one\nline two\nline three'
    const parsed = parseMarkdownStructure(md)
    expect(parsed.blocks).toHaveLength(1)
    const block = parsed.blocks[0]
    expect(md.slice(block.startChar, block.endChar)).toBe(block.content)
  })

  it('triple newlines between blocks are tracked correctly', () => {
    const md = 'Block A\n\n\nBlock B'
    const parsed = parseMarkdownStructure(md)
    // The parser should produce 2 blocks; the extra blank line is just separator
    expect(parsed.blocks).toHaveLength(2)
    for (const block of parsed.blocks) {
      expect(md.slice(block.startChar, block.endChar)).toBe(block.content)
    }
  })

  it('content with trailing newline', () => {
    const md = 'Hello\n\nWorld\n'
    const parsed = parseMarkdownStructure(md)
    expect(parsed.blocks).toHaveLength(2)
    for (const block of parsed.blocks) {
      expect(md.slice(block.startChar, block.endChar)).toBe(block.content)
    }
  })

  it('complex document with all block types', () => {
    const md = [
      '# Main Title',
      '',
      'Intro paragraph.',
      '',
      '## Section One',
      '',
      '- List item 1',
      '- List item 2',
      '',
      '```typescript',
      'const x = 42',
      '```',
      '',
      '| Col A | Col B |',
      '| --- | --- |',
      '| val1 | val2 |',
      '',
      '> A blockquote',
      '',
      '---',
      '',
      'Final paragraph.',
    ].join('\n')

    const parsed = parseMarkdownStructure(md)
    for (const block of parsed.blocks) {
      const sliced = md.slice(block.startChar, block.endChar)
      expect(sliced).toBe(block.content)
    }
  })
})

describe('findBlocksByHeading', () => {
  it('finds heading by exact text', () => {
    const md = '# Title\n\nContent\n\n## Methods\n\nMore'
    const parsed = parseMarkdownStructure(md)
    const matches = findBlocksByHeading(parsed, 'Methods')
    expect(matches).toHaveLength(1)
    expect(matches[0].metadata?.heading).toBe('Methods')
  })

  it('finds heading by partial text', () => {
    const md = '# Introduction to ML\n\nContent'
    const parsed = parseMarkdownStructure(md)
    const matches = findBlocksByHeading(parsed, 'Introduction')
    expect(matches).toHaveLength(1)
  })

  it('case-insensitive match', () => {
    const md = '## RESULTS\n\nContent'
    const parsed = parseMarkdownStructure(md)
    const matches = findBlocksByHeading(parsed, 'results')
    expect(matches).toHaveLength(1)
  })
})
