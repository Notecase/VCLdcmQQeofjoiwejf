import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { executeToolMock } = vi.hoisted(() => ({
  executeToolMock: vi.fn(),
}))

vi.mock('../../tools', () => {
  return {
    executeTool: executeToolMock,
  }
})

import { createEditorDeepTools } from './tools'

function createSupabaseStub(): SupabaseClient {
  return {
    from: vi.fn(),
  } as unknown as SupabaseClient
}

describe('createEditorDeepTools', () => {
  beforeEach(() => {
    executeToolMock.mockReset()
  })

  it('defaults noteId to current editor context for answer_question_about_note', async () => {
    executeToolMock.mockResolvedValue({
      success: true,
      data: {
        title: 'Networks',
        content: 'This note explains OSI layers.',
      },
    })

    const events: Array<{ type: string; data: unknown }> = []
    const tools = createEditorDeepTools(
      {
        userId: 'u1',
        supabase: createSupabaseStub(),
        editorContext: {
          currentNoteId: '11111111-1111-4111-8111-111111111111',
        },
        emitEvent: (event) => events.push(event),
      },
      {
        read: vi.fn(),
        write: vi.fn(),
      } as any
    )

    const qaTool = tools.find((tool) => tool.name === 'answer_question_about_note')
    expect(qaTool).toBeTruthy()

    const output = await qaTool!.invoke({
      question: "what's this note about?",
    })

    expect(executeToolMock).toHaveBeenCalledWith(
      'read_note',
      {
        noteId: '11111111-1111-4111-8111-111111111111',
        includeMetadata: true,
      },
      expect.any(Object)
    )
    expect(String(output)).toContain('Question:')
    expect(events).toHaveLength(0)
  })

  it('emits clarification-requested when add_paragraph is called without an active note', async () => {
    const events: Array<{ type: string; data: unknown }> = []

    const tools = createEditorDeepTools(
      {
        userId: 'u1',
        supabase: createSupabaseStub(),
        editorContext: {},
        emitEvent: (event) => events.push(event),
      },
      {
        read: vi.fn(),
        write: vi.fn(),
      } as any
    )

    const addTool = tools.find((tool) => tool.name === 'add_paragraph')
    expect(addTool).toBeTruthy()

    const output = await addTool!.invoke({
      paragraph: 'A new paragraph.',
    })

    expect(executeToolMock).not.toHaveBeenCalled()
    expect(events.some((event) => event.type === 'clarification-requested')).toBe(true)
    expect(String(output)).toContain('No note selected')
  })
})
