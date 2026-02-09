import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authFetchSSEMock, authFetchMock } = vi.hoisted(() => ({
  authFetchSSEMock: vi.fn(),
  authFetchMock: vi.fn(),
}))

interface MockMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface MockSession {
  id: string
  agentType: 'chat' | 'secretary' | null
  contextNoteIds?: string[]
  messages: MockMessage[]
}

const mockStore = vi.hoisted(() => {
  let sequence = 0
  const sessions: Record<string, MockSession> = {}
  let activeSessionId: string | null = null
  let error: string | null = null

  const nextId = () => {
    sequence += 1
    return `session-${sequence}`
  }

  const getOrCreateSession = vi.fn(
    (sessionId?: string, config?: { agentType?: MockSession['agentType'] }) => {
      if (sessionId && sessions[sessionId]) {
        activeSessionId = sessionId
        return sessions[sessionId]
      }

      const id = nextId()
      const session: MockSession = {
        id,
        agentType: config?.agentType || null,
        contextNoteIds: [],
        messages: [],
      }
      sessions[id] = session
      activeSessionId = id
      return session
    }
  )

  const addMessage = vi.fn((sessionId: string, message: { role: 'user' | 'assistant'; content: string }) => {
    const session = sessions[sessionId]
    if (!session) throw new Error(`missing session ${sessionId}`)
    session.messages.push({
      id: `m-${session.messages.length + 1}`,
      role: message.role,
      content: message.content,
    })
  })

  const appendToLastMessage = vi.fn((sessionId: string, text: string) => {
    const session = sessions[sessionId]
    if (!session || session.messages.length === 0) return
    session.messages[session.messages.length - 1].content += text
  })

  const store = {
    sessions,
    get activeSessionId() {
      return activeSessionId
    },
    get error() {
      return error
    },
    status: 'idle',
    isProcessing: false,
    activeSession: null,
    pendingEdits: [] as Array<{ noteId?: string; status?: string }>,
    hasPendingClarification: false,
    thinkingSteps: [] as Array<{ id: string; status: string; type?: string }>,
    getOrCreateSession,
    setActiveSession: vi.fn((sessionId: string | null) => {
      activeSessionId = sessionId
    }),
    addMessage,
    appendToLastMessage,
    setStatus: vi.fn(),
    setError: vi.fn((msg: string) => {
      error = msg
    }),
    clearError: vi.fn(() => {
      error = null
    }),
    clearThinkingSteps: vi.fn(),
    completeThinkingStep: vi.fn(),
    addThinkingStep: vi.fn(),
    setClarificationRequest: vi.fn(),
    updateCodePreview: vi.fn(),
    clearCodePreview: vi.fn(),
    addPendingArtifact: vi.fn(),
    addCompletedArtifact: vi.fn(),
    openNotePreview: vi.fn(),
    setSubTasks: vi.fn(),
    updateSubTask: vi.fn(),
    updateSubTaskProgress: vi.fn(),
    addPendingEdit: vi.fn(() => ({ id: 'edit-1' })),
    setActiveEdit: vi.fn(),
    reset: vi.fn(),
  }

  const reset = () => {
    for (const key of Object.keys(sessions)) {
      delete sessions[key]
    }
    activeSessionId = null
    error = null
    sequence = 0
    getOrCreateSession.mockClear()
    addMessage.mockClear()
    appendToLastMessage.mockClear()
  }

  return { store, reset }
})

vi.mock('@/stores/ai', () => ({
  useAIStore: () => mockStore.store,
}))

vi.mock('@/utils/api', () => ({
  authFetch: authFetchMock,
  authFetchSSE: authFetchSSEMock,
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'u1' },
  }),
}))

import { useAIChat } from './ai.service'

function buildSseResponse(events: Array<{ type: string; data: unknown }>): Response {
  const encoder = new TextEncoder()
  const payload =
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.close()
    },
  })

  return new Response(stream, { status: 200 })
}

describe('useAIChat threading', () => {
  beforeEach(() => {
    mockStore.reset()
    authFetchSSEMock.mockReset()
    authFetchMock.mockReset()

    authFetchSSEMock.mockResolvedValue(
      buildSseResponse([
        { type: 'assistant-start', data: { sourceNode: 'test' } },
        { type: 'assistant-final', data: 'ok' },
        { type: 'done', data: { threadId: 'server-thread' } },
      ])
    )
  })

  it('reuses the active chat thread id across consecutive sends', async () => {
    const chat = useAIChat()
    const context = {
      currentNoteId: '11111111-1111-4111-8111-111111111111',
    }

    await chat.sendMessage('first question', 'secretary', context)
    await chat.sendMessage('follow-up question', 'secretary', context)

    expect(authFetchSSEMock).toHaveBeenCalledTimes(2)

    const firstBody = JSON.parse(String(authFetchSSEMock.mock.calls[0]?.[1]?.body || '{}')) as {
      threadId?: string
    }
    const secondBody = JSON.parse(String(authFetchSSEMock.mock.calls[1]?.[1]?.body || '{}')) as {
      threadId?: string
    }

    expect(firstBody.threadId).toBeTruthy()
    expect(secondBody.threadId).toBe(firstBody.threadId)
  })
})
