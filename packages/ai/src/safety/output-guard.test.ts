import { describe, it, expect } from 'vitest'
import { sanitizeOutput } from './output-guard'

describe('sanitizeOutput', () => {
  it('returns clean text unchanged', () => {
    const input = 'Here is a summary of your notes about machine learning.'
    const { text, stripped } = sanitizeOutput(input)
    expect(text).toBe(input)
    expect(stripped).toEqual([])
  })

  it('strips <script> tags', () => {
    const { text, stripped } = sanitizeOutput('Hello <script>alert("xss")</script> world')
    expect(text).not.toContain('<script>')
    expect(text).toContain('Hello')
    expect(text).toContain('world')
    expect(stripped).toContain('dangerous-html-tags')
  })

  it('strips <iframe> tags', () => {
    const { text, stripped } = sanitizeOutput(
      'Content <iframe src="https://evil.com"></iframe> more'
    )
    expect(text).not.toContain('<iframe')
    expect(stripped).toContain('dangerous-html-tags')
  })

  it('strips self-closing dangerous tags', () => {
    const { text, stripped } = sanitizeOutput('Text <script src="evil.js"/> more')
    expect(text).not.toContain('<script')
    expect(stripped).toContain('self-closing-dangerous-tags')
  })

  it('strips javascript: URLs', () => {
    const { text, stripped } = sanitizeOutput('Click [here](javascript:alert("xss"))')
    expect(text).not.toContain('javascript:')
    expect(stripped).toContain('javascript-urls')
  })

  it('redacts OpenAI API keys (sk-...)', () => {
    const { text, stripped } = sanitizeOutput('Your key is sk-abc123def456ghi789jkl012mno')
    expect(text).toContain('[REDACTED]')
    expect(text).not.toContain('sk-abc123')
    expect(stripped).toContain('potential-secret')
  })

  it('redacts GitHub PATs (ghp_...)', () => {
    const { text, stripped } = sanitizeOutput('Token: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345678901')
    expect(text).toContain('[REDACTED]')
    expect(text).not.toContain('ghp_')
    expect(stripped).toContain('potential-secret')
  })

  it('detects prompt leakage markers', () => {
    const { stripped } = sanitizeOutput('As stated in the rules: YOU ARE THE DEEP EDITOR AGENT')
    expect(stripped).toContain('prompt-leakage-detected')
  })

  it('handles empty input', () => {
    const { text, stripped } = sanitizeOutput('')
    expect(text).toBe('')
    expect(stripped).toEqual([])
  })

  it('handles null input gracefully', () => {
    const { text, stripped } = sanitizeOutput(null as unknown as string)
    expect(text).toBe('')
    expect(stripped).toEqual([])
  })

  it('strips on* event handlers', () => {
    const { text, stripped } = sanitizeOutput('<div onmouseover="alert(1)">hover me</div>')
    expect(text).not.toContain('onmouseover')
    expect(stripped).toContain('event-handlers')
  })

  it('handles multiple issues in one text', () => {
    const { text, stripped } = sanitizeOutput(
      '<script>x</script> key: sk-abcdefghijklmnopqrstuvwxyz javascript:void(0)'
    )
    expect(text).not.toContain('<script>')
    expect(text).not.toContain('sk-abcdef')
    expect(text).not.toContain('javascript:')
    expect(stripped.length).toBeGreaterThanOrEqual(3)
  })
})
