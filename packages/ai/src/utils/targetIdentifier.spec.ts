import { describe, it, expect } from 'vitest'
import { parseMarkdownStructure } from './structureParser'
import { identifyTargets } from './targetIdentifier'

describe('identifyTargets - section label fallback', () => {
  it('matches a bolded list label when no heading exists', () => {
    const markdown = [
      '## Key Takeaways',
      '',
      '- **Why It Matters:** The Amazon stores vast amounts of carbon.',
      '- Biodiversity: Home to millions of species.',
      '',
      '## Next Section',
      'More content here.',
    ].join('\n')

    const parsed = parseMarkdownStructure(markdown)
    const result = identifyTargets('make the why it matters section more detailed', parsed)

    expect(result.needsClarification).toBe(false)
    expect(result.matchType).toBe('content')
    expect(result.targets.length).toBeGreaterThan(0)
    expect(result.targets.some((b) => /why it matters/i.test(b.content))).toBe(true)
  })
})

describe('identifyTargets - section intro targeting', () => {
  it('targets only intro content when section contains subheadings', () => {
    const markdown = [
      '## Wildlife Highlights',
      '',
      'Intro paragraph about wildlife.',
      '',
      '### Top 5 Biggest Animals in the Amazon Rainforest',
      '',
      '| Animal | Size |',
      '|---|---|',
      '| Jaguar | 80–120 kg |',
      '',
      'More content after table.',
    ].join('\n')

    const parsed = parseMarkdownStructure(markdown)
    const result = identifyTargets('make the wildlife highlights section longer content', parsed)

    expect(result.needsClarification).toBe(false)
    expect(result.targets.length).toBeGreaterThan(0)
    expect(result.targets.some((b) => /intro paragraph/i.test(b.content))).toBe(true)
    expect(result.targets.some((b) => /top 5 biggest animals/i.test(b.content))).toBe(false)
    expect(result.targets.some((b) => b.type === 'table')).toBe(false)
  })
})
