import { describe, it, expect } from 'vitest'
import { SubagentLifecycle } from './subagent-lifecycle'

describe('SubagentLifecycle', () => {
  it('accepts only configured visible subagent node keys', () => {
    const lifecycle = new SubagentLifecycle(['researcher', 'writer'])

    expect(lifecycle.isVisibleNode('researcher')).toBe(true)
    expect(lifecycle.isVisibleNode('writer')).toBe(true)
    expect(lifecycle.isVisibleNode('agent')).toBe(false)
    expect(lifecycle.isVisibleNode('tools')).toBe(false)
    expect(lifecycle.isVisibleNode('patchToolCallsMiddleware.before_agent')).toBe(false)
    expect(lifecycle.isVisibleNode('model_request')).toBe(false)
  })

  it('emits stable start/complete records with matching IDs exactly once', () => {
    const lifecycle = new SubagentLifecycle(['researcher', 'writer'])

    const start = lifecycle.start('researcher')
    expect(start).toBeTruthy()
    expect(start?.id).toContain('subagent-researcher-')
    expect(start?.status).toBe('running')

    const duplicateStart = lifecycle.start('researcher')
    expect(duplicateStart).toBeNull()

    const complete = lifecycle.complete('researcher', 'done')
    expect(complete).toBeTruthy()
    expect(complete?.id).toBe(start?.id)
    expect(complete?.status).toBe('completed')
    expect(complete?.output).toBe('done')

    const duplicateComplete = lifecycle.complete('researcher', 'done again')
    expect(duplicateComplete).toBeNull()
  })
})
