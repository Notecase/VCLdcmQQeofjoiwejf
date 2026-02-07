import { describe, it, expect } from 'vitest'
import ExportMarkdown from './stateToMarkdown'
import type { TState } from './types'

describe('ExportMarkdown - order list defaults', () => {
  it('defaults missing start to 1 to avoid undefined/NaN markers', () => {
    const states: TState[] = [
      {
        name: 'order-list',
        meta: {
          start: undefined as unknown as number, // Intentionally test missing start
          loose: true,
          delimiter: '.',
        },
        children: [
          {
            name: 'list-item',
            children: [
              { name: 'paragraph', text: 'Biodiversity' },
            ],
          },
          {
            name: 'list-item',
            children: [
              { name: 'paragraph', text: 'Climate influence' },
            ],
          },
        ],
      },
    ]

    const markdown = new ExportMarkdown().generate(states)

    expect(markdown).toContain('1. Biodiversity')
    expect(markdown).toContain('2. Climate influence')
    expect(markdown).not.toContain('undefined.')
    expect(markdown).not.toContain('NaN.')
  })
})
