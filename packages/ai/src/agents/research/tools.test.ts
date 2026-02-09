import { describe, expect, it, vi } from 'vitest'
import { createResearchTools } from './tools'

describe('research todo tools', () => {
  it('mutates shared todo array in place for alias integrity', async () => {
    const backingTodos: Array<{
      id: string
      content: string
      status: 'pending' | 'in_progress' | 'completed'
    }> = []
    const emitEvent = vi.fn()

    const ctx = {
      files: new Map(),
      todos: backingTodos,
      emitEvent,
    }

    const tools = createResearchTools(ctx as any)
    const writeTodos = tools.find((t) => t.name === 'write_todos')
    expect(writeTodos).toBeDefined()

    await writeTodos!.invoke({
      todos: [{ content: 'Week 1: Basics' }, { content: 'Week 2: MDPs' }],
    })

    expect(ctx.todos).toBe(backingTodos)
    expect(backingTodos).toHaveLength(2)
    expect(emitEvent).toHaveBeenCalled()
  })

  it('rejects write_todos input above 7 items', async () => {
    const emitEvent = vi.fn()
    const ctx = {
      files: new Map(),
      todos: [] as Array<{
        id: string
        content: string
        status: 'pending' | 'in_progress' | 'completed'
      }>,
      emitEvent,
    }

    const tools = createResearchTools(ctx as any)
    const writeTodos = tools.find((t) => t.name === 'write_todos')
    expect(writeTodos).toBeDefined()

    await expect(
      writeTodos!.invoke({
        todos: Array.from({ length: 9 }, (_, i) => ({
          content: `Task ${i + 1}`,
        })),
      })
    ).rejects.toThrow()
    expect(ctx.todos).toHaveLength(0)
    expect(emitEvent).not.toHaveBeenCalled()
  })
})
