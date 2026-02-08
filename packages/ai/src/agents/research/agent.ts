/**
 * Research Agent
 *
 * Deep research agent using the deepagents framework (LangGraph-based).
 * Supports virtual file system, todo tracking, web search, and human-in-the-loop interrupts.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type {
  ResearchStreamEvent,
  ResearchNoteDraft,
  VirtualFile,
  TodoItem,
  InterruptData,
  InterruptResponse,
} from '@inkdown/shared/types'
import { getResearchSystemPrompt, RESEARCH_SUBAGENT_PROMPT, WRITER_SUBAGENT_PROMPT } from './prompts'
import { createResearchTools, type ResearchToolContext } from './tools'
import { ResearchStreamNormalizer } from './stream-normalizer'
import {
  classifyResearchRequest,
  shouldEnableResearchFiles,
  type ResearchOutputPreference,
} from './routing'
import { SubagentLifecycle } from './subagent-lifecycle'
import {
  appendArtifactToDraft,
  buildStudyTimerIntroLines,
  condenseStudyTimerNarrative,
  hasArtifactBlock,
  hasStudyTimerIntent,
  parseArtifactPayload,
  ensureHeading,
  extractDraftTitle,
} from './note-draft-artifacts'

// =============================================================================
// Types
// =============================================================================

export interface ResearchAgentConfig {
  supabase: SupabaseClient
  userId: string
  openaiApiKey: string
  model?: string
  noteDraftModel?: string
  artifactModel?: string
  artifactFallbackModel?: string
  ollamaBaseUrl?: string
  ollamaApiKey?: string
  tavilyApiKey?: string
}

export interface ResearchThreadState {
  files: Map<string, VirtualFile>
  todos: TodoItem[]
  noteDraft: ResearchNoteDraft | null
  pendingInterrupt: InterruptData | null
  interruptResolver: ((response: InterruptResponse) => void) | null
}

// =============================================================================
// Research Agent
// =============================================================================

export class ResearchAgent {
  private config: ResearchAgentConfig
  private state: ResearchThreadState
  private pendingEvents: ResearchStreamEvent[] = []

  constructor(config: ResearchAgentConfig) {
    this.config = config
    this.state = {
      files: new Map(),
      todos: [],
      noteDraft: null,
      pendingInterrupt: null,
      interruptResolver: null,
    }
  }

  private get defaultModel(): string {
    return this.config.model ?? process.env.RESEARCH_MODEL ?? 'gpt-4o-mini'
  }

  private get noteDraftModel(): string {
    return this.config.noteDraftModel ?? process.env.RESEARCH_NOTE_DRAFT_MODEL ?? 'gpt-5.2'
  }

  private get artifactModel(): string {
    return this.config.artifactModel ?? process.env.RESEARCH_ARTIFACT_MODEL ?? 'kimi-k2.5'
  }

  private get artifactFallbackModel(): string {
    return this.config.artifactFallbackModel ?? process.env.RESEARCH_ARTIFACT_FALLBACK_MODEL ?? 'gpt-5.2'
  }

  /**
   * Stream a research interaction via the deepagents framework
   */
  async *stream(input: {
    message: string
    threadId?: string
    outputPreference?: ResearchOutputPreference
  }): AsyncGenerator<ResearchStreamEvent> {
    yield { event: 'thinking', data: 'Starting research agent...' }
    yield { event: 'thread-status', data: JSON.stringify({ status: 'busy' }) }

    const threadId = input.threadId || crypto.randomUUID()
    const mode = classifyResearchRequest(input.message, input.outputPreference)

    try {
      if (mode === 'chat') {
        yield { event: 'thinking', data: 'Using chat mode for a direct response...' }
        yield* this.streamSimpleChat(input.message)
        yield { event: 'thread-status', data: JSON.stringify({ status: 'idle' }) }
        yield { event: 'thread-id', data: JSON.stringify({ threadId }) }
        yield { event: 'done', data: '' }
        return
      }

      if (mode === 'note') {
        const noteDraftEnabled = process.env.RESEARCH_NOTE_DRAFT_ENABLED !== 'false'
        if (noteDraftEnabled) {
          yield { event: 'thinking', data: 'Using note mode to create a draft note preview...' }
          yield* this.streamNoteDraft(input.message, threadId)
        } else {
          yield { event: 'thinking', data: 'Using note mode to create a real note...' }
          yield* this.streamNoteCreate(input.message)
        }
        yield { event: 'thread-status', data: JSON.stringify({ status: 'idle' }) }
        yield { event: 'thread-id', data: JSON.stringify({ threadId }) }
        yield { event: 'done', data: '' }
        return
      }

      if (mode === 'markdown') {
        yield { event: 'thinking', data: 'Using markdown mode for a long-form file deliverable...' }
        yield* this.streamMarkdownFile(input.message)
        yield { event: 'thread-status', data: JSON.stringify({ status: 'idle' }) }
        yield { event: 'thread-id', data: JSON.stringify({ threadId }) }
        yield { event: 'done', data: '' }
        return
      }

      yield { event: 'thinking', data: 'Using deep research mode...' }
      yield* this.streamResearchMode(input.message, threadId, input.outputPreference)
    } catch (error) {
      yield {
        event: 'thread-status',
        data: JSON.stringify({ status: 'error' }),
      }
      const errorMsg = error instanceof Error ? error.message : String(error)
      yield { event: 'error', data: errorMsg }
    }
  }

  private async *streamSimpleChat(message: string): AsyncGenerator<ResearchStreamEvent> {
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: this.config.openaiApiKey })

    const stream = await client.chat.completions.create({
      model: this.defaultModel,
      messages: [
        {
          role: 'system',
          content: 'You are a concise and helpful assistant for note-taking and learning.',
        },
        { role: 'user', content: message },
      ],
      temperature: 0.5,
      max_completion_tokens: 4000,
      stream: true,
    })

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        yield { event: 'text', data: delta, isDelta: true }
      }
    }
  }

  private async *streamNoteCreate(message: string): AsyncGenerator<ResearchStreamEvent> {
    const { NoteAgent } = await import('../note.agent')

    const noteAgent = new NoteAgent({
      supabase: this.config.supabase,
      userId: this.config.userId,
      openaiApiKey: this.config.openaiApiKey,
      model: this.defaultModel,
    })

    let createdNoteId: string | undefined

    for await (const chunk of noteAgent.stream({
      action: 'create',
      input: message,
    })) {
      if (chunk.type === 'thinking') {
        yield { event: 'thinking', data: chunk.data as string }
      } else if (chunk.type === 'text-delta') {
        yield { event: 'text', data: chunk.data as string, isDelta: true }
      } else if (chunk.type === 'finish') {
        const finish = chunk.data as { success: boolean; noteId?: string }
        if (finish.success && finish.noteId) {
          createdNoteId = finish.noteId
        }
      }
    }

    if (createdNoteId) {
      yield {
        event: 'note-navigate',
        data: JSON.stringify({ noteId: createdNoteId }),
      }
    }
  }

  private async *streamNoteDraft(
    message: string,
    threadId: string,
  ): AsyncGenerator<ResearchStreamEvent> {
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: this.config.openaiApiKey })

    const existingDraft = this.state.noteDraft
    const originalContent = existingDraft?.currentContent || ''
    const draftId = existingDraft?.draftId || `draft-${threadId}`
    const includeStudyTimerArtifact = hasStudyTimerIntent(message)

    const prompt = originalContent
      ? [
        'You are editing an existing note draft in markdown format.',
        'Return updated markdown only (no fences). Keep it structured and concise.',
        `Current draft:\n${originalContent}`,
        `User request:\n${message}`,
      ].join('\n\n')
      : message

    const stream = await client.chat.completions.create({
      model: this.noteDraftModel,
      messages: [
        {
          role: 'system',
          content: [
            'You are an expert note-writing assistant.',
            'Return markdown only with a clear H1 title on the first line.',
            'Include markdown tables when the user requests ranked/tabular data.',
            'Use concise headings and actionable bullet points.',
            includeStudyTimerArtifact
              ? 'When a timer artifact is requested, keep timer description to at most 1-2 short lines.'
              : '',
          ].join(' '),
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_completion_tokens: 4000,
      stream: true,
    })

    let generated = ''
    let firstTitle = existingDraft?.title || 'Untitled Draft'
    let lastSnapshotAt = 0
    const snapshotIntervalMs = 1500

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (!delta) continue
      generated += delta
      firstTitle = extractDraftTitle(generated, message)
      const now = Date.now()
      const includeSnapshot = lastSnapshotAt === 0 || now - lastSnapshotAt >= snapshotIntervalMs
      if (includeSnapshot) {
        lastSnapshotAt = now
      }

      const payload: Record<string, unknown> = {
        draftId,
        title: firstTitle,
        originalContent,
        delta,
        noteId: existingDraft?.noteId,
      }
      if (includeSnapshot) {
        payload.currentContent = generated
      }

      yield {
        event: 'note-draft-delta',
        data: JSON.stringify(payload),
      }
    }

    const normalized = ensureHeading(generated, firstTitle)
    let finalizedContent = normalized

    if (includeStudyTimerArtifact && !hasArtifactBlock(normalized)) {
      finalizedContent = condenseStudyTimerNarrative(normalized)
      const artifactPrompt = this.buildStudyTimerArtifactPrompt(message, finalizedContent)
      let artifactAdded = false

      try {
        yield {
          event: 'thinking',
          data: `Generating artifact with Ollama ${this.artifactModel}...`,
        }
        const payload = await this.generateStudyTimerArtifactWithOllama(artifactPrompt)
        finalizedContent = appendArtifactToDraft(finalizedContent, payload, buildStudyTimerIntroLines())
        artifactAdded = true
      } catch (ollamaError) {
        yield {
          event: 'thinking',
          data: `Ollama artifact generation failed. Falling back to ${this.artifactFallbackModel}...`,
        }

        try {
          const payload = await this.generateStudyTimerArtifactWithOpenAI(artifactPrompt)
          finalizedContent = appendArtifactToDraft(finalizedContent, payload, buildStudyTimerIntroLines())
          artifactAdded = true
        } catch (fallbackError) {
          const ollamaMessage = ollamaError instanceof Error ? ollamaError.message : String(ollamaError)
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          yield {
            event: 'error',
            data: `Artifact generation failed (Ollama + ${this.artifactFallbackModel}): ${ollamaMessage}; ${fallbackMessage}`,
          }
        }
      }

      if (!artifactAdded) {
        finalizedContent = finalizedContent.trim()
      }
    }

    if (finalizedContent !== generated) {
      yield {
        event: 'note-draft-delta',
        data: JSON.stringify({
          draftId,
          title: firstTitle,
          originalContent,
          currentContent: finalizedContent,
          delta: finalizedContent.startsWith(generated) ? finalizedContent.slice(generated.length) : '',
          noteId: existingDraft?.noteId,
        }),
      }
    }

    const noteDraft: ResearchNoteDraft = {
      draftId,
      title: firstTitle,
      originalContent,
      proposedContent: finalizedContent,
      currentContent: finalizedContent,
      noteId: existingDraft?.noteId,
      savedAt: existingDraft?.savedAt,
      updatedAt: new Date().toISOString(),
    }

    this.state.noteDraft = noteDraft

    yield {
      event: 'note-draft',
      data: JSON.stringify(noteDraft),
    }

    yield {
      event: 'text',
      data: 'Prepared a note draft preview. Review the diff, then click Save when ready.',
      isDelta: false,
    }
  }

  private buildStudyTimerArtifactPrompt(message: string, draftMarkdown: string): string {
    return [
      'Create a polished interactive study timer artifact for this note.',
      'Return ONLY a JSON object with keys: title, html, css, javascript.',
      'Do not include markdown fences or extra explanation.',
      `User request: ${message}`,
      `Current note draft context:\n${draftMarkdown}`,
    ].join('\n\n')
  }

  private async generateStudyTimerArtifactWithOllama(prompt: string) {
    const { getOllamaCloud } = await import('../../providers/factory')
    const provider = getOllamaCloud({
      baseURL: this.config.ollamaBaseUrl || process.env.OLLAMA_CLOUD_URL || 'https://ollama.com',
      apiKey: this.config.ollamaApiKey || process.env.OLLAMA_API_KEY,
      model: this.artifactModel,
    })

    let raw = ''
    for await (const chunk of provider.generateArtifact(prompt, 'full')) {
      raw += chunk
    }

    const parsed = parseArtifactPayload(raw, 'Study Timer')
    if (!parsed) {
      throw new Error('Unable to parse Ollama artifact payload')
    }
    return parsed
  }

  private async generateStudyTimerArtifactWithOpenAI(prompt: string) {
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: this.config.openaiApiKey })
    const completion = await client.chat.completions.create({
      model: this.artifactFallbackModel,
      messages: [
        {
          role: 'system',
          content: [
            'You generate web artifacts for markdown editors.',
            'Return ONLY valid JSON with keys: title, html, css, javascript.',
            'No markdown fences, no extra text.',
          ].join(' '),
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_completion_tokens: 6000,
      stream: false,
    })

    const raw = completion.choices?.[0]?.message?.content ?? ''
    const parsed = parseArtifactPayload(raw, 'Study Timer')
    if (!parsed) {
      throw new Error('Unable to parse fallback artifact payload')
    }
    return parsed
  }

  private upsertVirtualFile(filename: string, content: string): VirtualFile {
    const now = new Date().toISOString()
    const existing = this.state.files.get(filename)
    const file: VirtualFile = {
      name: filename,
      content,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }
    this.state.files.set(filename, file)
    return file
  }

  private async *streamMarkdownFile(message: string): AsyncGenerator<ResearchStreamEvent> {
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: this.config.openaiApiKey })

    const completion = await client.chat.completions.create({
      model: this.defaultModel,
      messages: [
        {
          role: 'system',
          content: [
            'You write complete long-form markdown deliverables.',
            'Return markdown only (no code fences, no prose outside markdown).',
            'Use clear headings and actionable detail.',
          ].join(' '),
        },
        { role: 'user', content: message },
      ],
      temperature: 0.4,
      max_completion_tokens: 3000,
      stream: false,
    })

    const raw = completion.choices?.[0]?.message?.content ?? ''
    const markdown = raw.trim() || '# Final Report\n\nUnable to generate report content.'
    const file = this.upsertVirtualFile('final_report.md', markdown)

    yield {
      event: 'file-write',
      data: JSON.stringify(file),
    }

    yield {
      event: 'text',
      data: 'Created `final_report.md` with your detailed roadmap. I can revise any section if you want.',
      isDelta: false,
    }
  }

  private async *streamResearchMode(
    message: string,
    threadId: string,
    outputPreference?: ResearchOutputPreference,
  ): AsyncGenerator<ResearchStreamEvent> {
    const { createDeepAgent } = await import('deepagents')
    const { ChatOpenAI } = await import('@langchain/openai')

    const llm = new ChatOpenAI({
      openAIApiKey: this.config.openaiApiKey,
      modelName: this.defaultModel,
      temperature: 0.3,
    })

    const allowFileWrites = shouldEnableResearchFiles(message, outputPreference)
    const systemPrompt = getResearchSystemPrompt({ allowFileWrites })

    // Create tool context that lets tools emit events back to the stream
    const toolContext: ResearchToolContext = {
      files: this.state.files,
      todos: this.state.todos,
      tavilyApiKey: this.config.tavilyApiKey,
      supabase: this.config.supabase,
      userId: this.config.userId,
      emitEvent: (event) => {
        this.pendingEvents.push({
          event: event.type as ResearchStreamEvent['event'],
          data: typeof event.data === 'string' ? event.data : JSON.stringify(event.data),
        })
      },
      requestApproval: async (interrupt) => {
        return new Promise<InterruptResponse>((resolve) => {
          this.state.pendingInterrupt = interrupt
          this.state.interruptResolver = resolve
          this.pendingEvents.push({
            event: 'interrupt',
            data: JSON.stringify(interrupt),
          })
        })
      },
    }

    const tools = createResearchTools(toolContext, { includeFileTools: allowFileWrites })

    const agent = createDeepAgent({
      model: llm,
      systemPrompt,
      tools,
      subagents: [
        {
          name: 'researcher',
          description: 'Searches the web and gathers information on a specific sub-topic',
          systemPrompt: RESEARCH_SUBAGENT_PROMPT,
        },
        {
          name: 'writer',
          description: 'Synthesizes research findings into well-structured prose',
          systemPrompt: WRITER_SUBAGENT_PROMPT,
        },
      ],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamResult = await (agent as any).stream(
      { messages: [{ role: 'user', content: message }] },
      { configurable: { thread_id: threadId } },
    ) as AsyncIterable<Record<string, { messages?: unknown[] }>>

    const normalizer = new ResearchStreamNormalizer()
    const subagentLifecycle = new SubagentLifecycle(['researcher', 'writer'])
    const subagentOutputs = new Map<string, string>()

    for await (const chunk of streamResult) {
      // Drain any events emitted by tools during execution
      yield* this.drainPendingEvents()

      for (const [nodeKey, nodeValue] of Object.entries(chunk)) {
        const nodeData = nodeValue as { messages?: unknown[] }
        if (!nodeData?.messages) continue

        const messages = Array.isArray(nodeData.messages) ? nodeData.messages : []

        for (const msg of messages) {
          if (!msg || typeof msg !== 'object') continue

          const msgObj = msg as {
            id?: string
            content?: string | unknown[]
            tool_calls?: Array<{ name: string; args: Record<string, unknown> }>
            name?: string
            type?: string
            role?: string
          }

          if (nodeKey === 'tools' || msgObj.type === 'tool') {
            const toolEvents = normalizer.normalizeToolResult(nodeKey, msgObj)
            for (const event of toolEvents) {
              yield event
            }
          } else {
            if (subagentLifecycle.isVisibleNode(nodeKey)) {
              const startInfo = subagentLifecycle.start(nodeKey)
              if (startInfo) {
                yield {
                  event: 'subagent-start',
                  data: JSON.stringify(startInfo),
                  seq: normalizer.getSeq(),
                }
              }
            }

            const textEvents = normalizer.normalizeText(nodeKey, msgObj)
            for (const event of textEvents) {
              yield event
              if (subagentLifecycle.isVisibleNode(nodeKey) && typeof event.data === 'string') {
                subagentOutputs.set(nodeKey, `${subagentOutputs.get(nodeKey) || ''}${event.data}`)
              }
            }

            const toolCallEvents = normalizer.normalizeToolCalls(nodeKey, msgObj)
            for (const event of toolCallEvents) {
              yield event
            }
          }

          // Drain tool-emitted events after processing each message
          yield* this.drainPendingEvents()
        }
      }
    }

    for (const result of subagentLifecycle.completeAll(subagentOutputs)) {
      yield {
        event: 'subagent-result',
        data: JSON.stringify(result),
        seq: normalizer.getSeq(),
      }
    }

    // Final drain
    yield* this.drainPendingEvents()

    yield {
      event: 'thread-status',
      data: JSON.stringify({ status: 'idle' }),
    }

    yield {
      event: 'thread-id',
      data: JSON.stringify({ threadId }),
    }

    yield normalizer.done()
  }

  /**
   * Drain pending events emitted by tools
   */
  private *drainPendingEvents(): Generator<ResearchStreamEvent> {
    while (this.pendingEvents.length > 0) {
      yield this.pendingEvents.shift()!
    }
  }

  /**
   * Resolve a pending interrupt with the user's response
   */
  resolveInterrupt(response: InterruptResponse): boolean {
    if (this.state.interruptResolver) {
      this.state.interruptResolver(response)
      this.state.pendingInterrupt = null
      this.state.interruptResolver = null
      return true
    }
    return false
  }

  /**
   * Get current thread state (files, todos)
   */
  getState(): { files: VirtualFile[]; todos: TodoItem[]; noteDraft: ResearchNoteDraft | null } {
    return {
      files: Array.from(this.state.files.values()),
      todos: [...this.state.todos],
      noteDraft: this.state.noteDraft ? { ...this.state.noteDraft } : null,
    }
  }

  /**
   * Hydrate in-memory thread state for follow-up turns in the same thread.
   */
  hydrateState(state: {
    files?: VirtualFile[] | null
    todos?: TodoItem[] | null
    noteDraft?: ResearchNoteDraft | null
  }): void {
    if (Array.isArray(state.files)) {
      this.state.files.clear()
      for (const file of state.files) {
        if (!file?.name || typeof file.content !== 'string') continue
        this.state.files.set(file.name, file)
      }
    }

    if (Array.isArray(state.todos)) {
      this.state.todos.splice(0, this.state.todos.length, ...state.todos)
    }

    if (state.noteDraft === null) {
      this.state.noteDraft = null
    } else if (state.noteDraft && typeof state.noteDraft === 'object') {
      this.state.noteDraft = state.noteDraft
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createResearchAgent(config: ResearchAgentConfig): ResearchAgent {
  return new ResearchAgent(config)
}
