import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ChatMessage } from '@/stores/ai'

const { mockStore, resetStore } = vi.hoisted(() => {
  const state = {
    activeSession: { messages: [] as ChatMessage[] },
    isProcessing: false,
    getCompletedArtifactsForMessage: vi.fn(() => []),
    getThinkingStepsForMessage: vi.fn(() => []),
  }

  return {
    mockStore: state,
    resetStore: () => {
      state.activeSession = { messages: [] }
      state.isProcessing = false
      state.getCompletedArtifactsForMessage.mockClear()
      state.getThinkingStepsForMessage.mockClear()
    },
  }
})

vi.mock('@/stores/ai', () => ({
  useAIStore: () => mockStore,
}))

import ChatMessageComponent from './ChatMessage.vue'

function buildMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: '',
    createdAt: new Date('2026-02-09T01:00:00.000Z'),
    ...overrides,
  }
}

function mountMessage(message: ChatMessage) {
  mockStore.activeSession = { messages: [message] }
  return mount(ChatMessageComponent, {
    props: { message },
    global: {
      stubs: {
        StreamingCursor: true,
        ToolCallCard: true,
        ArtifactSummaryCard: true,
        MessageThinkingSteps: true,
      },
    },
  })
}

describe('ChatMessage', () => {
  beforeEach(() => {
    resetStore()
  })

  it('renders assistant markdown with semantic headings and lists', () => {
    const message = buildMessage({
      role: 'assistant',
      content: '## Sun Layers\n\n- Core\n- Corona',
    })

    const wrapper = mountMessage(message)

    expect(wrapper.find('.prose h2').exists()).toBe(true)
    expect(wrapper.findAll('.prose li')).toHaveLength(2)
    expect(wrapper.find('.user-text').exists()).toBe(false)
  })

  it('renders assistant latex expressions through katex', () => {
    const message = buildMessage({
      role: 'assistant',
      content: 'Inline $x^2$ and $$\\int_0^1 x\\,dx$$',
    })

    const wrapper = mountMessage(message)

    expect(wrapper.find('.prose .katex').exists()).toBe(true)
    expect(wrapper.find('.prose .math-display').exists()).toBe(true)
  })

  it('renders user content as plain text without HTML injection', () => {
    const message = buildMessage({
      role: 'user',
      content: '<img src=x onerror=alert(1)> **bold**',
    })

    const wrapper = mountMessage(message)
    const userText = wrapper.find('.user-text')

    expect(wrapper.find('.prose').exists()).toBe(false)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(userText.exists()).toBe(true)
    expect(userText.text()).toContain('<img src=x onerror=alert(1)> **bold**')
  })
})
