import { describe, expect, it } from 'vitest'
import { EditorDeepStreamNormalizer } from './stream-normalizer'

describe('EditorDeepStreamNormalizer', () => {
  it('emits assistant start + delta with snapshot dedupe', () => {
    const normalizer = new EditorDeepStreamNormalizer()

    const first = normalizer.normalizeText('agent', {
      role: 'assistant',
      content: 'Hello',
    })
    const second = normalizer.normalizeText('agent', {
      role: 'assistant',
      content: 'Hello world',
    })
    const replay = normalizer.normalizeText('agent', {
      role: 'assistant',
      content: 'Hello world',
    })

    expect(first.map((e) => e.type)).toEqual(['assistant-start', 'assistant-delta'])
    expect(first[1].data).toBe('Hello')
    expect(second.map((e) => e.type)).toEqual(['assistant-delta'])
    expect(second[0].data).toBe(' world')
    expect(replay).toHaveLength(0)
  })

  it('deduplicates identical first snapshots emitted by different nodes', () => {
    const normalizer = new EditorDeepStreamNormalizer()

    const first = normalizer.normalizeText('nodeA', {
      role: 'assistant',
      content: 'Created a Study Timer artifact linked to your current note.',
    })
    const duplicate = normalizer.normalizeText('nodeB', {
      role: 'assistant',
      content: 'Created a Study Timer artifact linked to your current note.',
    })

    expect(first.map((e) => e.type)).toEqual(['assistant-start', 'assistant-delta'])
    expect(duplicate).toHaveLength(0)
    expect(normalizer.getAssistantText()).toBe('Created a Study Timer artifact linked to your current note.')
  })

  it('emits only suffix when a new node snapshot is a superset of accumulated text', () => {
    const normalizer = new EditorDeepStreamNormalizer()

    normalizer.normalizeText('nodeA', {
      role: 'assistant',
      content: 'Created a Study Timer',
    })
    const suffixOnly = normalizer.normalizeText('nodeB', {
      role: 'assistant',
      content: 'Created a Study Timer artifact linked to your current note.',
    })

    expect(suffixOnly.map((e) => e.type)).toEqual(['assistant-delta'])
    expect(suffixOnly[0].data).toBe(' artifact linked to your current note.')
    expect(normalizer.getAssistantText()).toBe('Created a Study Timer artifact linked to your current note.')
  })

  it('uses message id as stable source key across node changes', () => {
    const normalizer = new EditorDeepStreamNormalizer()

    const first = normalizer.normalizeText('nodeA', {
      id: 'm-1',
      role: 'assistant',
      content: 'Hello world',
    })
    const duplicate = normalizer.normalizeText('nodeB', {
      id: 'm-1',
      role: 'assistant',
      content: 'Hello world',
    })
    const extension = normalizer.normalizeText('nodeC', {
      id: 'm-1',
      role: 'assistant',
      content: 'Hello world!',
    })

    expect(first.map((e) => e.type)).toEqual(['assistant-start', 'assistant-delta'])
    expect(duplicate).toHaveLength(0)
    expect(extension.map((e) => e.type)).toEqual(['assistant-delta'])
    expect(extension[0].data).toBe('!')
  })

  it('deduplicates repeated tool calls and results', () => {
    const normalizer = new EditorDeepStreamNormalizer()
    const calls = {
      tool_calls: [{ id: 'c1', name: 'add_paragraph', args: { paragraph: 'test' } }],
    }

    const firstCall = normalizer.normalizeToolCalls('agent', calls)
    const duplicateCall = normalizer.normalizeToolCalls('agent', calls)

    expect(firstCall).toHaveLength(1)
    expect(duplicateCall).toHaveLength(0)

    const firstResult = normalizer.normalizeToolResult('tools', {
      type: 'tool',
      name: 'add_paragraph',
      content: 'ok',
    })
    const duplicateResult = normalizer.normalizeToolResult('tools', {
      type: 'tool',
      name: 'add_paragraph',
      content: 'ok',
    })

    expect(firstResult).toHaveLength(1)
    expect(duplicateResult).toHaveLength(0)
  })

  it('emits assistant-final before done', () => {
    const normalizer = new EditorDeepStreamNormalizer()
    normalizer.normalizeText('agent', {
      role: 'assistant',
      content: 'Summary ready',
    })

    const terminal = normalizer.finalize()
    expect(terminal.map((e) => e.type)).toEqual(['assistant-final', 'done'])
    expect(terminal[0].data).toBe('Summary ready')
  })

  it('uses fallback text when stream produced no assistant text', () => {
    const normalizer = new EditorDeepStreamNormalizer()
    const terminal = normalizer.finalize('fallback response')
    expect(terminal.map((e) => e.type)).toEqual(['assistant-start', 'assistant-final', 'done'])
    expect(terminal[1].data).toBe('fallback response')
  })
})
