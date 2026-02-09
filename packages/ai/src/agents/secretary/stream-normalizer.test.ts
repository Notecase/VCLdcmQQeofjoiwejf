import { describe, it, expect } from 'vitest'
import { SecretaryStreamNormalizer } from './stream-normalizer'

describe('SecretaryStreamNormalizer', () => {
  it('emits only delta for growing text snapshots and ignores duplicate replays', () => {
    const normalizer = new SecretaryStreamNormalizer()

    const first = normalizer.normalizeText('agent', {
      id: 'm1',
      type: 'ai',
      content: 'Hello',
    })
    const second = normalizer.normalizeText('agent', {
      id: 'm1',
      type: 'ai',
      content: 'Hello world',
    })
    const replay = normalizer.normalizeText('agent', {
      id: 'm1',
      type: 'ai',
      content: 'Hello world',
    })

    expect(first).toHaveLength(1)
    expect(first[0].data).toBe('Hello')
    expect(first[0].isDelta).toBe(false)

    expect(second).toHaveLength(1)
    expect(second[0].data).toBe(' world')
    expect(second[0].isDelta).toBe(true)

    expect(replay).toHaveLength(0)
  })

  it('deduplicates repeated tool calls and results', () => {
    const normalizer = new SecretaryStreamNormalizer()
    const message = {
      tool_calls: [{ name: 'read_memory_file', args: { filename: 'Plan.md' } }],
    }

    const firstCall = normalizer.normalizeToolCalls('agent', message)
    const dupCall = normalizer.normalizeToolCalls('agent', message)

    expect(firstCall).toHaveLength(1)
    expect(dupCall).toHaveLength(0)

    const firstResult = normalizer.normalizeToolResult('tools', {
      name: 'read_memory_file',
      content: 'content',
      type: 'tool',
    })
    const dupResult = normalizer.normalizeToolResult('tools', {
      name: 'read_memory_file',
      content: 'content',
      type: 'tool',
    })

    expect(firstResult).toHaveLength(1)
    expect(dupResult).toHaveLength(0)
    expect(firstResult[0].data).toContain('read_memory_file')
  })

  it('deduplicates replayed tool calls when IDs churn but name/args are identical', () => {
    const normalizer = new SecretaryStreamNormalizer()

    const firstCall = normalizer.normalizeToolCalls('agent', {
      tool_calls: [
        {
          id: 'call_1',
          name: 'modify_today_plan',
          args: { action: 'reschedule', taskTime: '10:00', newTime: '11:00' },
        },
      ],
    })
    const replayWithNewId = normalizer.normalizeToolCalls('agent', {
      tool_calls: [
        {
          id: 'call_2',
          name: 'modify_today_plan',
          args: { action: 'reschedule', taskTime: '10:00', newTime: '11:00' },
        },
      ],
    })

    expect(firstCall).toHaveLength(1)
    expect(replayWithNewId).toHaveLength(0)
  })

  it('ignores human/user text snapshots even when content is present', () => {
    const normalizer = new SecretaryStreamNormalizer()
    const humanEvents = normalizer.normalizeText('agent', {
      id: 'h1',
      role: 'user',
      content: 'make a plan for me',
    })
    const systemEvents = normalizer.normalizeText('agent', {
      id: 's1',
      type: 'system',
      content: 'system rules',
    })

    expect(humanEvents).toHaveLength(0)
    expect(systemEvents).toHaveLength(0)
  })

  it('tracks text by node/role instead of unstable message id', () => {
    const normalizer = new SecretaryStreamNormalizer()
    const first = normalizer.normalizeText('agent', {
      id: 'm1',
      role: 'assistant',
      content: 'Roadmap summary',
    })
    const second = normalizer.normalizeText('agent', {
      id: 'm2',
      role: 'assistant',
      content: 'Roadmap summary with details',
    })

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(second[0].data).toBe(' with details')
    expect(second[0].isDelta).toBe(true)
  })
})
