import type { SupabaseClient } from '@supabase/supabase-js'
import { ToolLoopAgent, stepCountIs } from 'ai'
import { EDITOR_DEEP_SYSTEM_PROMPT } from './prompts'
import { createEditorDeepTools } from './tools'
import { adaptAISDKStream } from './ai-sdk-stream-adapter'
import { EditorLongTermMemory } from './memory'
import { EditorConversationHistoryService, type EditorThreadMessage } from './history'
import type { EditorDeepAgentEvent, EditorDeepAgentRequest, EditorRunState } from './types'
import { executeTool } from '../../tools'
import { selectModel } from '../../providers/model-registry'
import { getModelForTask } from '../../providers/ai-sdk-factory'
import { trackAISDKUsage } from '../../providers/ai-sdk-usage'
import type { SharedContextService } from '../../services/shared-context.service'

export interface EditorDeepAgentConfig {
  supabase: SupabaseClient
  userId: string
  model?: string
  sharedContextService?: SharedContextService
}

export class EditorDeepAgent {
  private config: EditorDeepAgentConfig
  private pendingEvents: EditorDeepAgentEvent[] = []
  private state: EditorRunState = {
    threadId: '',
    assistantText: '',
    toolCalls: [],
    toolResults: [],
    updatedAt: new Date().toISOString(),
    historyTurnsLoaded: 0,
    longTermMemoriesLoaded: 0,
  }

  constructor(config: EditorDeepAgentConfig) {
    this.config = config
  }

  getState(): EditorRunState {
    return {
      ...this.state,
      toolCalls: [...this.state.toolCalls],
      toolResults: [...this.state.toolResults],
    }
  }

  async run(input: EditorDeepAgentRequest): Promise<{ response: string; threadId: string }> {
    let finalText = ''
    let threadId = input.threadId || crypto.randomUUID()

    for await (const event of this.stream(input)) {
      if (event.type === 'assistant-delta' && typeof event.data === 'string') {
        finalText += event.data
      } else if (event.type === 'assistant-final' && typeof event.data === 'string') {
        finalText = event.data
      } else if (event.type === 'done' && typeof event.data === 'object' && event.data !== null) {
        const maybeThreadId = (event.data as { threadId?: unknown }).threadId
        if (typeof maybeThreadId === 'string') {
          threadId = maybeThreadId
        }
      }
    }

    return {
      response: finalText.trim(),
      threadId,
    }
  }

  async *stream(input: EditorDeepAgentRequest): AsyncGenerator<EditorDeepAgentEvent> {
    this.pendingEvents = []
    const threadId = input.threadId || crypto.randomUUID()
    this.state = {
      threadId,
      assistantText: '',
      toolCalls: [],
      toolResults: [],
      updatedAt: new Date().toISOString(),
      historyTurnsLoaded: 0,
      longTermMemoriesLoaded: 0,
    }

    yield { type: 'thinking', data: 'Reviewing conversation and loading your notes...' }

    const memoryService = new EditorLongTermMemory(this.config.supabase, this.config.userId)
    if (input.context?.currentNoteId && this.isNoteSummaryRequest(input.message)) {
      yield* this.streamDeterministicNoteSummary(threadId, input, memoryService)
      return
    }

    // Load conversation history, memory, and shared context in parallel
    const historyService = new EditorConversationHistoryService(
      this.config.supabase,
      this.config.userId
    )

    const [historyMessages, memorySummary] = await Promise.all([
      historyService.loadThreadMessages({
        threadId,
        windowTurns: input.historyWindowTurns ?? 12,
        maxChars: 12000,
      }),
      memoryService.buildContextSummary(input.message, {
        currentNoteId: input.context?.currentNoteId,
        workspaceId: input.context?.workspaceId,
      }),
    ])
    this.state.historyTurnsLoaded = historyMessages.length
    this.state.longTermMemoriesLoaded = memorySummary
      ? memorySummary.split('\n').filter(Boolean).length
      : 0
    const noteLabel = input.context?.currentNoteId ? 'with active note' : 'no note open'
    yield { type: 'thinking', data: `Context ready (${noteLabel}, ${historyMessages.length} prior messages)` }

    console.info('editor_deep_agent.context', {
      threadId,
      currentNoteId: input.context?.currentNoteId || null,
      historyTurnsLoaded: this.state.historyTurnsLoaded,
      longTermMemoriesLoaded: this.state.longTermMemoriesLoaded,
    })

    // Build tools with editor context
    const tools = createEditorDeepTools(
      {
        userId: this.config.userId,
        supabase: this.config.supabase,
        editorContext: input.context || {},
        emitEvent: (event) => this.pendingEvents.push(event),
      },
      memoryService
    )

    // Build system prompt with context, memory, and shared context
    const selectedModel = selectModel('editor-deep')
    const contextSummary = this.buildContextSummary(input.context)
    const memorySection = memorySummary
      ? `\n\n### Long-term Memory\n${memorySummary}`
      : '\n\n### Long-term Memory\n(no stored memory yet)'
    const sharedCtx = this.config.sharedContextService
      ? await this.config.sharedContextService.read({
          relevantTypes: ['active_plan', 'research_done', 'course_saved', 'note_created'],
        })
      : ''
    const sharedCtxSection = sharedCtx ? `\n\n${sharedCtx}` : ''
    const systemPrompt = `${EDITOR_DEEP_SYSTEM_PROMPT}\n\n${contextSummary}${memorySection}${sharedCtxSection}`

    // Create ToolLoopAgent with AI SDK v6
    const agent = new ToolLoopAgent({
      model: getModelForTask('editor-deep'),
      instructions: systemPrompt,
      tools,
      temperature: 0.3,
      stopWhen: stepCountIs(20),
      onFinish: trackAISDKUsage({ model: selectedModel.id, taskType: 'editor-deep' }),
    })

    // Build messages from conversation history (structured, preserves turn roles)
    const invocationMessages = this.buildInvocationMessages(historyMessages, input.message)

    try {
      const result = await agent.stream({
        messages: invocationMessages,
      })

      // Adapt AI SDK stream to our event format
      for await (const event of adaptAISDKStream(
        result.fullStream,
        this.pendingEvents,
        threadId
      )) {
        this.consumeEvent(event)
        yield event
      }

      this.state.updatedAt = new Date().toISOString()

      // Distill and store the conversation turn
      const assistantText = this.state.assistantText.trim()
      if (assistantText) {
        await memoryService.distillAndStoreTurn({
          threadId,
          userMessage: input.message,
          assistantMessage: assistantText,
          context: {
            currentNoteId: input.context?.currentNoteId,
            workspaceId: input.context?.workspaceId,
          },
        })
      }

      // Write shared context entry if note operations were detected
      if (this.config.sharedContextService && this.state.toolCalls.length > 0) {
        const noteTools = this.state.toolCalls.filter(
          (tc) =>
            tc.toolName.includes('note') ||
            tc.toolName.includes('write') ||
            tc.toolName.includes('create') ||
            tc.toolName.includes('update')
        )
        if (noteTools.length > 0) {
          const action = noteTools.map((tc) => tc.toolName).join(', ')
          await this.config.sharedContextService.write({
            agent: 'editor',
            type: 'note_edited',
            summary: `Editor used ${action}`,
            payload: {
              threadId,
              noteId: input.context?.currentNoteId,
              toolNames: noteTools.map((tc) => tc.toolName),
            },
          })
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const fallbackText =
        this.state.assistantText.trim() ||
        (await this.buildFallbackText(input.context, input.message))

      yield { type: 'error', data: message }
      if (!this.state.assistantText.trim()) {
        const start: EditorDeepAgentEvent = {
          type: 'assistant-start',
          data: { sourceNode: 'error-fallback' },
        }
        this.consumeEvent(start)
        yield start
      }
      const final: EditorDeepAgentEvent = {
        type: 'assistant-final',
        data: fallbackText,
      }
      this.consumeEvent(final)
      yield final
      this.state.assistantText = fallbackText
      this.state.updatedAt = new Date().toISOString()
      yield { type: 'done', data: { threadId } }
    }
  }

  private buildContextSummary(context: EditorDeepAgentRequest['context']): string {
    if (!context) return '### Editor Context\n(no editor context provided)'
    const lines = ['### Editor Context']
    if (context.workspaceId) lines.push(`- Workspace: ${context.workspaceId}`)
    if (context.currentNoteId) lines.push(`- Current note: ${context.currentNoteId}`)
    if (context.currentBlockId) lines.push(`- Current block: ${context.currentBlockId}`)
    if (context.selectedText) lines.push(`- Selected text: ${context.selectedText.slice(0, 200)}`)
    if (context.selectedBlockIds?.length) {
      lines.push(`- Selected blocks: ${context.selectedBlockIds.join(', ')}`)
    }
    return lines.join('\n')
  }

  private buildInvocationMessages(
    historyMessages: EditorThreadMessage[],
    currentMessage: string
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const cleanedHistory = historyMessages
      .map((message) => ({
        role: message.role,
        content: message.content.trim(),
      }))
      .filter((message) => message.content.length > 0)

    const currentNormalized = currentMessage.trim()
    const lastMessage = cleanedHistory[cleanedHistory.length - 1]
    const hasCurrentAlready =
      Boolean(lastMessage) &&
      lastMessage.role === 'user' &&
      lastMessage.content === currentNormalized

    if (hasCurrentAlready) {
      return cleanedHistory
    }

    return [...cleanedHistory, { role: 'user', content: currentNormalized }]
  }

  private async *streamDeterministicNoteSummary(
    threadId: string,
    input: EditorDeepAgentRequest,
    memoryService: EditorLongTermMemory
  ): AsyncGenerator<EditorDeepAgentEvent> {
    const noteId = input.context?.currentNoteId
    if (!noteId) {
      const clarification =
        'I need an open note to answer that. Please open a note or tell me which note to use.'
      const assistantStart: EditorDeepAgentEvent = {
        type: 'assistant-start',
        data: { sourceNode: 'fast-path' },
      }
      const assistantFinal: EditorDeepAgentEvent = { type: 'assistant-final', data: clarification }
      const done: EditorDeepAgentEvent = { type: 'done', data: { threadId } }

      this.consumeEvent(assistantStart)
      yield assistantStart
      this.consumeEvent(assistantFinal)
      yield assistantFinal
      this.consumeEvent(done)
      yield done
      this.state.assistantText = clarification
      this.state.updatedAt = new Date().toISOString()
      return
    }

    yield { type: 'thinking', data: 'Reading note content...' }
    const toolCallId = crypto.randomUUID()
    const toolCall: EditorDeepAgentEvent = {
      type: 'tool-call',
      data: {
        id: toolCallId,
        toolName: 'read_note',
        arguments: { noteId, includeMetadata: true },
      },
    }
    this.consumeEvent(toolCall)
    yield toolCall

    const result = await executeTool(
      'read_note',
      {
        noteId,
        includeMetadata: true,
      },
      {
        userId: this.config.userId,
        supabase: this.config.supabase,
      }
    )

    const toolResult: EditorDeepAgentEvent = {
      type: 'tool-result',
      data: {
        id: toolCallId,
        toolName: 'read_note',
        result,
      },
    }
    this.consumeEvent(toolResult)
    yield toolResult

    let finalText = 'I could not load the current note. Please open it again and retry.'
    if (result.success && result.data) {
      const data = result.data as { title?: string; content?: string }
      finalText = this.summarizeNoteContent(data.title || 'Untitled', data.content || '')
    }

    const assistantStart: EditorDeepAgentEvent = {
      type: 'assistant-start',
      data: { sourceNode: 'fast-path' },
    }
    const assistantFinal: EditorDeepAgentEvent = { type: 'assistant-final', data: finalText }
    const done: EditorDeepAgentEvent = { type: 'done', data: { threadId } }

    this.consumeEvent(assistantStart)
    yield assistantStart
    this.consumeEvent(assistantFinal)
    yield assistantFinal
    this.consumeEvent(done)
    yield done

    this.state.assistantText = finalText
    this.state.updatedAt = new Date().toISOString()
    await memoryService.distillAndStoreTurn({
      threadId,
      userMessage: input.message,
      assistantMessage: finalText,
      context: {
        currentNoteId: input.context?.currentNoteId,
        workspaceId: input.context?.workspaceId,
      },
    })
  }

  private normalizeMessageForIntent(message: string): string {
    return message
      .toLowerCase()
      .replace(/[''`]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private isNoteSummaryRequest(message: string): boolean {
    const lower = this.normalizeMessageForIntent(message)
    return (
      lower.includes('whats this note about') ||
      lower.includes("what's this note about") ||
      lower.includes('what is this note about') ||
      lower.includes('summarize this note') ||
      lower.includes('summary of this note') ||
      lower.includes('about this note')
    )
  }

  private summarizeNoteContent(title: string, content: string): string {
    const paragraphs = content
      .split(/\n\n+/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .slice(0, 3)

    if (paragraphs.length === 0) {
      return `The note "${title}" is currently empty.`
    }

    const bullets = paragraphs
      .map((paragraph) => {
        const oneLine = paragraph.replace(/\s+/g, ' ')
        return `- ${oneLine.slice(0, 180)}${oneLine.length > 180 ? '...' : ''}`
      })
      .join('\n')

    return `This note "${title}" is mainly about:\n${bullets}`
  }

  private async buildFallbackText(
    context: EditorDeepAgentRequest['context'] | undefined,
    message: string
  ): Promise<string> {
    if (context?.currentNoteId && this.isNoteSummaryRequest(message)) {
      const result = await executeTool(
        'read_note',
        {
          noteId: context.currentNoteId,
          includeMetadata: true,
        },
        {
          userId: this.config.userId,
          supabase: this.config.supabase,
        }
      )

      if (result.success && result.data) {
        const data = result.data as { title?: string; content?: string }
        return this.summarizeNoteContent(data.title || 'Untitled', data.content || '')
      }
    }

    if (context?.currentNoteId) {
      return 'I could not generate a response from the current note yet. Try asking for a short summary, key points, or next actions.'
    }
    return 'I need an open note to answer that. Please open a note or tell me which note to use.'
  }

  private consumeEvent(event: EditorDeepAgentEvent): void {
    if (event.type === 'assistant-delta' && typeof event.data === 'string') {
      this.state.assistantText += event.data
      return
    }

    if (event.type === 'assistant-final' && typeof event.data === 'string') {
      this.state.assistantText = event.data
      return
    }

    if (event.type === 'tool-call') {
      const payload = event.data as {
        id?: unknown
        toolName?: unknown
        arguments?: unknown
      }
      const toolName = typeof payload?.toolName === 'string' ? payload.toolName : undefined
      const id = typeof payload?.id === 'string' ? payload.id : crypto.randomUUID()
      if (toolName && payload.arguments && typeof payload.arguments === 'object') {
        this.state.toolCalls.push({
          id,
          toolName,
          arguments: payload.arguments as Record<string, unknown>,
        })
      }
      return
    }

    if (event.type === 'tool-result') {
      const payload = event.data as {
        id?: unknown
        tool?: unknown
        toolName?: unknown
        result?: unknown
      }
      const toolName = typeof payload?.toolName === 'string'
        ? payload.toolName
        : typeof payload?.tool === 'string'
          ? payload.tool
          : undefined
      const id = typeof payload?.id === 'string' ? payload.id : crypto.randomUUID()
      if (toolName) {
        this.state.toolResults.push({
          id,
          toolName,
          result: payload.result,
        })
      }
    }
  }
}

export function createEditorDeepAgent(config: EditorDeepAgentConfig): EditorDeepAgent {
  return new EditorDeepAgent(config)
}
