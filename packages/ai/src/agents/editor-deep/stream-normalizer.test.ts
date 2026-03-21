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
    expect(normalizer.getAssistantText()).toBe(
      'Created a Study Timer artifact linked to your current note.'
    )
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
    expect(normalizer.getAssistantText()).toBe(
      'Created a Study Timer artifact linked to your current note.'
    )
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

  describe('history seeding', () => {
    it('skips replayed history assistant messages', () => {
      const normalizer = new EditorDeepStreamNormalizer()
      normalizer.seedHistoryTexts(['Previous answer about trees.'])

      // LangGraph replays the history message through the stream
      const replayed = normalizer.normalizeText('agent', {
        role: 'assistant',
        content: 'Previous answer about trees.',
      })
      expect(replayed).toHaveLength(0)

      // New LLM response should come through
      const fresh = normalizer.normalizeText('agent', {
        role: 'assistant',
        content: 'Here is a new answer.',
      })
      expect(fresh.map((e) => e.type)).toEqual(['assistant-start', 'assistant-delta'])
      expect(fresh[1].data).toBe('Here is a new answer.')
    })

    it('skips history even with leading/trailing whitespace', () => {
      const normalizer = new EditorDeepStreamNormalizer()
      normalizer.seedHistoryTexts(['  Answer with spaces  '])

      const replayed = normalizer.normalizeText('agent', {
        role: 'assistant',
        content: 'Answer with spaces',
      })
      expect(replayed).toHaveLength(0)
    })

    it('does not skip messages that are not in history', () => {
      const normalizer = new EditorDeepStreamNormalizer()
      normalizer.seedHistoryTexts(['Old answer'])

      const fresh = normalizer.normalizeText('agent', {
        role: 'assistant',
        content: 'Completely different answer',
      })
      expect(fresh.map((e) => e.type)).toEqual(['assistant-start', 'assistant-delta'])
    })
  })

  describe('namespace parsing', () => {
    it('identifies root namespace as non-subagent', () => {
      const normalizer = new EditorDeepStreamNormalizer()
      const result = normalizer.parseNamespace([])
      expect(result).toEqual({ isSubagent: false, subagentId: null, subagentName: null })
    })

    it('identifies tools: prefix as subagent', () => {
      const normalizer = new EditorDeepStreamNormalizer()
      const result = normalizer.parseNamespace(['tools:edit_subagent'])
      expect(result).toEqual({
        isSubagent: true,
        subagentId: 'edit_subagent',
        subagentName: 'edit_subagent',
      })
    })

    it('identifies non-root namespace segment as subagent', () => {
      const normalizer = new EditorDeepStreamNormalizer()
      const result = normalizer.parseNamespace(['researcher'])
      expect(result).toEqual({
        isSubagent: true,
        subagentId: 'researcher',
        subagentName: 'researcher',
      })
    })

    it('ignores agent and tools as non-subagent', () => {
      const normalizer = new EditorDeepStreamNormalizer()
      expect(normalizer.parseNamespace(['agent']).isSubagent).toBe(false)
      expect(normalizer.parseNamespace(['tools']).isSubagent).toBe(false)
    })
  })

  describe('multi-mode: updates', () => {
    it('emits subagent-start on first event from a subagent namespace', () => {
      const normalizer = new EditorDeepStreamNormalizer()
      const events = normalizer.normalizeUpdates(['tools:edit_subagent'], 'agent', {
        role: 'assistant',
        content: 'Working on edit...',
      })

      const types = events.map((e) => e.type)
      expect(types).toContain('subagent-start')
      expect(types).toContain('assistant-start')
      expect(types).toContain('assistant-delta')
    })

    it('does not emit duplicate subagent-start for same subagent', () => {
      const normalizer = new EditorDeepStreamNormalizer()

      normalizer.normalizeUpdates(['tools:edit_subagent'], 'agent', {
        role: 'assistant',
        content: 'First',
      })
      const second = normalizer.normalizeUpdates(['tools:edit_subagent'], 'agent', {
        role: 'assistant',
        content: 'First continued',
      })

      const startEvents = second.filter((e) => e.type === 'subagent-start')
      expect(startEvents).toHaveLength(0)
    })

    it('processes tool results from subagent namespace', () => {
      const normalizer = new EditorDeepStreamNormalizer()
      const events = normalizer.normalizeUpdates(['tools:edit_subagent'], 'tools', {
        type: 'tool',
        name: 'read_note',
        content: 'note content here',
      })

      expect(events.some((e) => e.type === 'subagent-start')).toBe(true)
      expect(events.some((e) => e.type === 'tool-result')).toBe(true)
    })
  })

  describe('multi-mode: messages', () => {
    it('emits assistant-delta for main agent tokens', () => {
      const normalizer = new EditorDeepStreamNormalizer()
      const events = normalizer.normalizeMessageChunk([], { text: 'Hello' })

      expect(events.map((e) => e.type)).toEqual(['assistant-start', 'assistant-delta'])
      expect(events[1].data).toBe('Hello')
      expect(normalizer.getAssistantText()).toBe('Hello')
    })

    it('emits subagent-delta for subagent tokens', () => {
      const normalizer = new EditorDeepStreamNormalizer()

      // First trigger subagent-start via updates
      normalizer.normalizeUpdates(['tools:writer'], 'agent', {
        role: 'assistant',
        content: 'start',
      })

      const events = normalizer.normalizeMessageChunk(['tools:writer'], { text: ' more text' })

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('subagent-delta')
      expect(events[0].data).toEqual({ id: 'writer', text: ' more text' })
    })

    it('accumulates main agent tokens without snapshot dedup', () => {
      const normalizer = new EditorDeepStreamNormalizer()

      normalizer.normalizeMessageChunk([], { text: 'Hello' })
      const second = normalizer.normalizeMessageChunk([], { text: ' world' })

      expect(second.map((e) => e.type)).toEqual(['assistant-delta'])
      expect(second[0].data).toBe(' world')
      expect(normalizer.getAssistantText()).toBe('Hello world')
    })

    it('ignores chunks with no text', () => {
      const normalizer = new EditorDeepStreamNormalizer()
      const events = normalizer.normalizeMessageChunk([], { text: '' })
      expect(events).toHaveLength(0)
    })
  })

  describe('multi-mode: custom', () => {
    it('emits custom-progress events', () => {
      const normalizer = new EditorDeepStreamNormalizer()
      const data = { step: 'reading', noteId: 'abc-123' }
      const events = normalizer.normalizeCustomEvent([], data)

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('custom-progress')
      expect(events[0].data).toEqual(data)
    })
  })

  describe('subagent lifecycle', () => {
    it('completes a subagent and emits subagent-complete', () => {
      const normalizer = new EditorDeepStreamNormalizer()

      // Start subagent
      normalizer.normalizeUpdates(['tools:edit_subagent'], 'agent', {
        role: 'assistant',
        content: 'Working...',
      })

      expect(normalizer.getActiveSubagentIds()).toEqual(['edit_subagent'])

      // Complete subagent
      const events = normalizer.completeSubagent('edit_subagent')
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('subagent-complete')

      const data = events[0].data as { id: string; status: string; elapsedMs: number }
      expect(data.id).toBe('edit_subagent')
      expect(data.status).toBe('complete')
      expect(data.elapsedMs).toBeGreaterThanOrEqual(0)
      expect(normalizer.getActiveSubagentIds()).toHaveLength(0)
    })

    it('completeAllSubagents clears all active subagents', () => {
      const normalizer = new EditorDeepStreamNormalizer()

      normalizer.normalizeUpdates(['tools:sub_a'], 'agent', { role: 'assistant', content: 'A' })
      normalizer.normalizeUpdates(['tools:sub_b'], 'agent', { role: 'assistant', content: 'A B' })

      expect(normalizer.getActiveSubagentIds()).toHaveLength(2)

      const events = normalizer.completeAllSubagents()
      expect(events.filter((e) => e.type === 'subagent-complete')).toHaveLength(2)
      expect(normalizer.getActiveSubagentIds()).toHaveLength(0)
    })

    it('finalize emits synthesis-start when subagents were used', () => {
      const normalizer = new EditorDeepStreamNormalizer()

      // Start and complete a subagent
      normalizer.normalizeUpdates(['tools:sub_a'], 'agent', {
        role: 'assistant',
        content: 'Work done',
      })
      normalizer.completeSubagent('sub_a')

      // Now finalize — should include synthesis-start
      const events = normalizer.finalize()
      const types = events.map((e) => e.type)
      expect(types).toContain('synthesis-start')
      expect(types).toContain('assistant-final')
      expect(types).toContain('done')
    })

    it('finalize without subagents does not emit synthesis-start', () => {
      const normalizer = new EditorDeepStreamNormalizer()
      normalizer.normalizeText('agent', { role: 'assistant', content: 'Simple response' })

      const events = normalizer.finalize()
      const types = events.map((e) => e.type)
      expect(types).not.toContain('synthesis-start')
      expect(types).toContain('assistant-final')
      expect(types).toContain('done')
    })
  })

  describe('backward compatibility', () => {
    it('legacy normalizeText still works identically', () => {
      const normalizer = new EditorDeepStreamNormalizer()

      const first = normalizer.normalizeText('agent', {
        role: 'assistant',
        content: 'Legacy text',
      })
      expect(first.map((e) => e.type)).toEqual(['assistant-start', 'assistant-delta'])
      expect(first[1].data).toBe('Legacy text')

      const second = normalizer.normalizeText('agent', {
        role: 'assistant',
        content: 'Legacy text extended',
      })
      expect(second.map((e) => e.type)).toEqual(['assistant-delta'])
      expect(second[0].data).toBe(' extended')
    })

    it('legacy finalize still emits assistant-final + done', () => {
      const normalizer = new EditorDeepStreamNormalizer()
      normalizer.normalizeText('agent', { role: 'assistant', content: 'Done' })
      const events = normalizer.finalize()
      expect(events.map((e) => e.type)).toEqual(['assistant-final', 'done'])
    })
  })
})
