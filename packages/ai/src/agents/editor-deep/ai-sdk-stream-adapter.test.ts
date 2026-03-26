import { describe, expect, it, vi } from 'vitest'
import type { TextStreamPart, ToolSet } from 'ai'
import { adaptAISDKStream } from './ai-sdk-stream-adapter'
import type { EditorDeepAgentEvent } from './types'

vi.mock('../../safety/output-guard', () => ({
  sanitizeOutput: vi.fn((text: string) => ({ text, stripped: [] })),
}))

vi.mock('../../observability/logger', () => ({
  aiSafetyLog: vi.fn(),
}))

/**
 * Helper: create an async iterable from an array of AI SDK stream parts.
 * Uses `any` cast because test fixtures intentionally omit optional provider metadata fields.
 */
function fakeStream(parts: Record<string, unknown>[]): AsyncIterable<TextStreamPart<ToolSet>> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const part of parts) {
        yield part as TextStreamPart<ToolSet>
      }
    },
  }
}

async function collectEvents(
  stream: AsyncGenerator<EditorDeepAgentEvent>
): Promise<EditorDeepAgentEvent[]> {
  const events: EditorDeepAgentEvent[] = []
  for await (const event of stream) {
    events.push(event)
  }
  return events
}

describe('adaptAISDKStream', () => {
  it('emits assistant-start once then assistant-delta for each text-delta', async () => {
    const parts = [
      { type: 'text-delta' as const, text: 'Hello ' },
      { type: 'text-delta' as const, text: 'world!' },
    ]

    const events = await collectEvents(adaptAISDKStream(fakeStream(parts), [], 'thread-1'))

    const starts = events.filter((e) => e.type === 'assistant-start')
    const deltas = events.filter((e) => e.type === 'assistant-delta')
    expect(starts).toHaveLength(1)
    expect(deltas).toHaveLength(2)
    expect(deltas[0].data).toBe('Hello ')
    expect(deltas[1].data).toBe('world!')
  })

  it('emits tool-call with id, toolName, and arguments from input', async () => {
    const parts = [
      {
        type: 'tool-call' as const,
        toolCallId: 'tc-1',
        toolName: 'add_paragraph',
        input: { paragraph: 'new text' },
      },
    ]

    const events = await collectEvents(adaptAISDKStream(fakeStream(parts), [], 'thread-1'))

    const toolCall = events.find((e) => e.type === 'tool-call')
    expect(toolCall).toBeTruthy()
    const data = toolCall!.data as { id: string; toolName: string; arguments: unknown }
    expect(data.id).toBe('tc-1')
    expect(data.toolName).toBe('add_paragraph')
    expect(data.arguments).toEqual({ paragraph: 'new text' })
  })

  it('emits tool-result with output field mapped', async () => {
    const parts = [
      {
        type: 'tool-result' as const,
        toolCallId: 'tc-1',
        toolName: 'read_note',
        output: { content: 'note body' },
      },
    ]

    const events = await collectEvents(adaptAISDKStream(fakeStream(parts), [], 'thread-1'))

    const toolResult = events.find((e) => e.type === 'tool-result')
    expect(toolResult).toBeTruthy()
    const data = toolResult!.data as { id: string; toolName: string; result: unknown }
    expect(data.id).toBe('tc-1')
    expect(data.result).toEqual({ content: 'note body' })
  })

  it('drains pendingEvents AFTER tool-result', async () => {
    const pendingEvents: EditorDeepAgentEvent[] = []

    // Simulate tool execution pushing events to pendingEvents array
    // We need to add them before the tool-result is yielded
    const editProposal: EditorDeepAgentEvent = {
      type: 'edit-proposal',
      data: { noteId: 'n1', original: '', proposed: 'new' },
    }
    const noteNavigate: EditorDeepAgentEvent = {
      type: 'note-navigate',
      data: { noteId: 'n1' },
    }

    // Pre-populate pending events (as if tool execution pushed them)
    pendingEvents.push(noteNavigate, editProposal)

    const parts = [
      {
        type: 'tool-result' as const,
        toolCallId: 'tc-1',
        toolName: 'create_note',
        output: 'created',
      },
    ]

    const events = await collectEvents(
      adaptAISDKStream(fakeStream(parts), pendingEvents, 'thread-1')
    )

    const toolResultIdx = events.findIndex((e) => e.type === 'tool-result')
    const navigateIdx = events.findIndex((e) => e.type === 'note-navigate')
    const proposalIdx = events.findIndex((e) => e.type === 'edit-proposal')

    // Both pending events should come after tool-result
    expect(navigateIdx).toBeGreaterThan(toolResultIdx)
    expect(proposalIdx).toBeGreaterThan(toolResultIdx)
    // Navigate was pushed first, so it drains first
    expect(navigateIdx).toBeLessThan(proposalIdx)
    // Pending array should be drained
    expect(pendingEvents).toHaveLength(0)
  })

  it('emits error event on tool-error', async () => {
    const parts = [
      {
        type: 'tool-error' as const,
        toolName: 'read_note',
        toolCallId: 'tc-err',
        error: 'Note not found',
      },
    ]

    const events = await collectEvents(adaptAISDKStream(fakeStream(parts), [], 'thread-1'))

    const errorEvent = events.find((e) => e.type === 'error')
    expect(errorEvent).toBeTruthy()
    expect(String(errorEvent!.data)).toContain('read_note')
  })

  it('emits assistant-final with sanitized text at end of stream', async () => {
    const { sanitizeOutput } = await import('../../safety/output-guard')
    const mockSanitize = vi.mocked(sanitizeOutput)
    mockSanitize.mockReturnValue({ text: 'sanitized result', stripped: ['xss'] })

    const parts = [
      { type: 'text-delta' as const, text: 'Hello ' },
      { type: 'text-delta' as const, text: 'world!' },
    ]

    const events = await collectEvents(adaptAISDKStream(fakeStream(parts), [], 'thread-1'))

    const final = events.find((e) => e.type === 'assistant-final')
    expect(final).toBeTruthy()
    expect(final!.data).toBe('sanitized result')

    // Restore default mock behavior
    mockSanitize.mockImplementation((text: string) => ({ text, stripped: [] }))
  })

  it('drains remaining pendingEvents at end of stream', async () => {
    const pendingEvents: EditorDeepAgentEvent[] = [
      { type: 'action-summary', data: { action: 'test' } },
    ]

    const parts = [{ type: 'text-delta' as const, text: 'Done.' }]

    const events = await collectEvents(
      adaptAISDKStream(fakeStream(parts), pendingEvents, 'thread-1')
    )

    const summaryEvent = events.find((e) => e.type === 'action-summary')
    expect(summaryEvent).toBeTruthy()
    expect(pendingEvents).toHaveLength(0)
  })

  it('emits done with threadId at end of stream', async () => {
    const events = await collectEvents(adaptAISDKStream(fakeStream([]), [], 'my-thread'))

    const done = events.find((e) => e.type === 'done')
    expect(done).toBeTruthy()
    expect((done!.data as { threadId: string }).threadId).toBe('my-thread')
  })

  it('does not emit assistant-final when no text was accumulated', async () => {
    const parts = [
      {
        type: 'tool-call' as const,
        toolCallId: 'tc-1',
        toolName: 'read_note',
        input: {},
      },
      {
        type: 'tool-result' as const,
        toolCallId: 'tc-1',
        toolName: 'read_note',
        output: 'content',
      },
    ]

    const events = await collectEvents(adaptAISDKStream(fakeStream(parts), [], 'thread-1'))

    const final = events.find((e) => e.type === 'assistant-final')
    expect(final).toBeUndefined()
    // Still emits done
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })

  it('emits thinking event for reasoning-delta', async () => {
    const parts = [{ type: 'reasoning-delta' as const, text: 'Let me think...' }]

    const events = await collectEvents(adaptAISDKStream(fakeStream(parts), [], 'thread-1'))

    const thinking = events.find((e) => e.type === 'thinking')
    expect(thinking).toBeTruthy()
    expect(thinking!.data).toBe('Let me think...')
    expect(thinking!.isDelta).toBe(true)
  })

  it('assigns monotonically increasing seq numbers', async () => {
    const parts = [
      { type: 'text-delta' as const, text: 'A' },
      { type: 'text-delta' as const, text: 'B' },
    ]

    const events = await collectEvents(adaptAISDKStream(fakeStream(parts), [], 'thread-1'))

    const seqs = events.map((e) => e.seq).filter((s) => s !== undefined)
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]!)
    }
  })
})
