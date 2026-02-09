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
})
