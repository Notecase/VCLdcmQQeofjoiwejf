import { describe, it, expect } from 'vitest'
import { verifyCitations } from './citation-verifier'

describe('verifyCitations', () => {
  it('keeps valid citations', () => {
    const { text, strippedCitations, totalCitations } = verifyCitations(
      'According to [1] and [2], the data shows growth.',
      3
    )
    expect(text).toContain('[1]')
    expect(text).toContain('[2]')
    expect(strippedCitations).toEqual([])
    expect(totalCitations).toBe(2)
  })

  it('strips out-of-bounds citations', () => {
    const { text, strippedCitations, totalCitations } = verifyCitations(
      'Source [1] is valid but [5] is not when max is 3.',
      3
    )
    expect(text).toContain('[1]')
    expect(text).not.toContain('[5]')
    expect(strippedCitations).toContain(5)
    expect(totalCitations).toBe(2)
  })

  it('strips zero-index citations', () => {
    const { text, strippedCitations } = verifyCitations('Citation [0] is invalid.', 3)
    expect(text).not.toContain('[0]')
    expect(strippedCitations).toContain(0)
  })

  it('passes through text with no citations', () => {
    const { text, strippedCitations, totalCitations } = verifyCitations(
      'This text has no citations at all.',
      5
    )
    expect(text).toBe('This text has no citations at all.')
    expect(strippedCitations).toEqual([])
    expect(totalCitations).toBe(0)
  })

  it('cleans up double spaces after stripping', () => {
    const { text } = verifyCitations('Before [99] after.', 3)
    // [99] is stripped, leaving potential double space
    expect(text).not.toContain('  ')
  })

  it('handles empty text', () => {
    const { text, strippedCitations, totalCitations } = verifyCitations('', 5)
    expect(text).toBe('')
    expect(strippedCitations).toEqual([])
    expect(totalCitations).toBe(0)
  })

  it('handles negative maxCitations', () => {
    const { text, strippedCitations } = verifyCitations('Citation [1] here.', -1)
    // With negative max, all citations are invalid — text returned as-is
    expect(text).toBe('Citation [1] here.')
    expect(strippedCitations).toEqual([])
  })

  it('strips multiple invalid citations', () => {
    const { text, strippedCitations, totalCitations } = verifyCitations(
      'See [1], [4], [2], [10] for details.',
      2
    )
    expect(text).toContain('[1]')
    expect(text).toContain('[2]')
    expect(text).not.toContain('[4]')
    expect(text).not.toContain('[10]')
    expect(strippedCitations).toEqual([4, 10])
    expect(totalCitations).toBe(4)
  })
})
