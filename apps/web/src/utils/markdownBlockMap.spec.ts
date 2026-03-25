import { describe, it, expect } from 'vitest'
import { mapLineToBlockIndex } from './markdownBlockMap'

describe('mapLineToBlockIndex', () => {
  it('maps line numbers to the correct block index', () => {
    const markdown = [
      '## Overview',
      '',
      'Overview paragraph line 1.',
      '',
      '## Location',
      '',
      '- Continent: South America',
      '- Countries: Brazil',
      '',
      'Trailing paragraph.',
    ].join('\n')

    expect(mapLineToBlockIndex(markdown, 1)).toBe(0) // heading
    expect(mapLineToBlockIndex(markdown, 3)).toBe(1) // paragraph
    expect(mapLineToBlockIndex(markdown, 5)).toBe(2) // heading
    expect(mapLineToBlockIndex(markdown, 7)).toBe(3) // list
    expect(mapLineToBlockIndex(markdown, 8)).toBe(3) // list (second item)
    expect(mapLineToBlockIndex(markdown, 10)).toBe(4) // trailing paragraph
  })

  it('falls back to the nearest previous block for blank lines', () => {
    const markdown = ['## Overview', '', 'Overview paragraph line 1.', '', '## Location'].join('\n')

    // Line 2 is blank; should map to the Overview heading block
    expect(mapLineToBlockIndex(markdown, 2)).toBe(0)
  })

  it('handles math blocks as a single block', () => {
    const markdown = ['## Title', '', '$$', 'E = mc^2', '$$', '', 'After math.'].join('\n')

    expect(mapLineToBlockIndex(markdown, 1)).toBe(0) // heading
    expect(mapLineToBlockIndex(markdown, 3)).toBe(1) // math block start
    expect(mapLineToBlockIndex(markdown, 4)).toBe(1) // math block content
    expect(mapLineToBlockIndex(markdown, 5)).toBe(1) // math block end
    expect(mapLineToBlockIndex(markdown, 7)).toBe(2) // paragraph after math
  })

  it('handles code blocks as a single block', () => {
    const markdown = [
      '## Code Example',
      '',
      '```typescript',
      'const x = 1',
      'const y = 2',
      '```',
      '',
      'After code.',
    ].join('\n')

    expect(mapLineToBlockIndex(markdown, 1)).toBe(0) // heading
    expect(mapLineToBlockIndex(markdown, 3)).toBe(1) // code block start
    expect(mapLineToBlockIndex(markdown, 5)).toBe(1) // code block content
    expect(mapLineToBlockIndex(markdown, 6)).toBe(1) // code block end
    expect(mapLineToBlockIndex(markdown, 8)).toBe(2) // paragraph after code
  })

  it('handles frontmatter as block 0', () => {
    const markdown = ['---', 'title: My Note', '---', '', '## First Heading', '', 'Content.'].join(
      '\n'
    )

    expect(mapLineToBlockIndex(markdown, 1)).toBe(0) // frontmatter start
    expect(mapLineToBlockIndex(markdown, 2)).toBe(0) // frontmatter content
    expect(mapLineToBlockIndex(markdown, 3)).toBe(0) // frontmatter end
    expect(mapLineToBlockIndex(markdown, 5)).toBe(1) // heading
    expect(mapLineToBlockIndex(markdown, 7)).toBe(2) // paragraph
  })

  it('handles lists with multiple items as a single block', () => {
    const markdown = [
      '## Items',
      '',
      '- Item one',
      '- Item two',
      '- Item three',
      '',
      '## Next Section',
    ].join('\n')

    expect(mapLineToBlockIndex(markdown, 1)).toBe(0) // heading
    expect(mapLineToBlockIndex(markdown, 3)).toBe(1) // list item 1
    expect(mapLineToBlockIndex(markdown, 4)).toBe(1) // list item 2
    expect(mapLineToBlockIndex(markdown, 5)).toBe(1) // list item 3
    expect(mapLineToBlockIndex(markdown, 7)).toBe(2) // next heading
  })

  it('handles single block documents', () => {
    expect(mapLineToBlockIndex('Just a paragraph.', 1)).toBe(0)
    expect(mapLineToBlockIndex('## Solo heading', 1)).toBe(0)
  })

  it('clamps out-of-range line numbers', () => {
    const markdown = ['## Heading', '', 'Paragraph.'].join('\n')

    expect(mapLineToBlockIndex(markdown, 0)).toBe(0) // below range
    expect(mapLineToBlockIndex(markdown, -1)).toBe(0) // negative
    expect(mapLineToBlockIndex(markdown, 100)).toBe(1) // above range
  })
})
