import { describe, expect, it } from 'vitest'
import { ResearchAgent } from './agent'

describe('ResearchAgent state hydration', () => {
  it('hydrates persisted files and todos for follow-up turns', () => {
    const agent = new ResearchAgent({
      supabase: {} as any,
      userId: 'user-1',
    })

    agent.hydrateState({
      files: [
        {
          name: 'final_report.md',
          content: '# Report\n\nWeek 1 plan',
          createdAt: '2026-02-08T00:00:00.000Z',
          updatedAt: '2026-02-08T00:00:00.000Z',
        },
      ],
      todos: [
        {
          id: 'todo-1',
          content: 'Gather sources',
          status: 'completed',
        },
      ],
    })

    const state = agent.getState()
    expect(state.files).toHaveLength(1)
    expect(state.files[0].name).toBe('final_report.md')
    expect(state.todos).toHaveLength(1)
    expect(state.todos[0].content).toBe('Gather sources')
  })

  it('hydrates persisted note draft state', () => {
    const agent = new ResearchAgent({
      supabase: {} as any,
      userId: 'user-1',
    })

    agent.hydrateState({
      noteDraft: {
        draftId: 'draft-1',
        title: 'Black Holes',
        originalContent: '',
        proposedContent: '# Black Holes',
        currentContent: '# Black Holes',
        updatedAt: '2026-02-08T00:00:00.000Z',
      },
    })

    const state = agent.getState()
    expect(state.noteDraft).toBeTruthy()
    expect(state.noteDraft?.draftId).toBe('draft-1')
    expect(state.noteDraft?.title).toBe('Black Holes')
  })
})
