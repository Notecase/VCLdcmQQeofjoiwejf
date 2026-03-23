/**
 * Research Agent
 *
 * Deep research agent using AI SDK v6 ToolLoopAgent.
 * Supports virtual file system, todo tracking, web search, and human-in-the-loop interrupts.
 */

import { ToolLoopAgent, stepCountIs, streamText, generateText } from 'ai'
import { SupabaseClient } from '@supabase/supabase-js'
import type {
  ResearchStreamEvent,
  ResearchNoteDraft,
  VirtualFile,
  TodoItem,
  InterruptData,
  InterruptResponse,
} from '@inkdown/shared/types'
import {
  getResearchSystemPrompt,
  RESEARCH_SUBAGENT_PROMPT,
  WRITER_SUBAGENT_PROMPT,
} from './prompts'
import { createResearchTools, type ResearchToolContext } from './tools'
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
import { selectModel } from '../../providers/model-registry'
import { resolveModelsForTask, getModelsForTask, isTransientError } from '../../providers/ai-sdk-factory'
import { trackAISDKUsage } from '../../providers/ai-sdk-usage'

// =============================================================================
// Types
// =============================================================================

import type { SharedContextService } from '../../services/shared-context.service'

export interface ResearchAgentConfig {
  supabase: SupabaseClient
  userId: string
  model?: string
  noteDraftModel?: string
  artifactModel?: string
  artifactFallbackModel?: string
  ollamaBaseUrl?: string
  ollamaApiKey?: string
  tavilyApiKey?: string
  sharedContextService?: SharedContextService
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

  /**
   * Stream a research interaction via AI SDK v6
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
    const { primary, fallback } = resolveModelsForTask('research')

    for (const modelOption of [primary, fallback]) {
      if (!modelOption) continue
      try {
        const result = streamText({
          model: modelOption.model,
          system: 'You are a concise and helpful assistant for note-taking and learning.',
          prompt: message,
          temperature: 0.5,
          maxOutputTokens: 4000,
          onFinish: trackAISDKUsage({ model: modelOption.entry.id, taskType: 'research' }),
        })

        for await (const chunk of result.textStream) {
          yield { event: 'text', data: chunk, isDelta: true }
        }
        return
      } catch (err) {
        if (isTransientError(err) && modelOption === primary && fallback) {
          console.warn(`[ResearchAgent] ${modelOption.entry.id} unavailable, falling back to ${fallback.entry.id}`)
          continue
        }
        throw err
      }
    }
  }

  private async *streamNoteCreate(message: string): AsyncGenerator<ResearchStreamEvent> {
    const { NoteAgent } = await import('../note.agent')

    const noteAgent = new NoteAgent({
      supabase: this.config.supabase,
      userId: this.config.userId,
      model: selectModel('research').id,
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
    threadId: string
  ): AsyncGenerator<ResearchStreamEvent> {
    const { primary: draftModel } = resolveModelsForTask('research')

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

    const result = streamText({
      model: draftModel.model,
      system: [
        'You are an expert note-writing assistant.',
        'Return markdown only with a clear H1 title on the first line.',
        'Include markdown tables when the user requests ranked/tabular data.',
        'Use concise headings and actionable bullet points.',
        includeStudyTimerArtifact
          ? 'When a timer artifact is requested, keep timer description to at most 1-2 short lines.'
          : '',
      ].join(' '),
      prompt,
      temperature: 0.5,
      maxOutputTokens: 4000,
      onFinish: trackAISDKUsage({ model: draftModel.entry.id, taskType: 'research' }),
    })

    let generated = ''
    let firstTitle = existingDraft?.title || 'Untitled Draft'
    let lastSnapshotAt = 0
    const snapshotIntervalMs = 1500

    for await (const chunk of result.textStream) {
      generated += chunk
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
        delta: chunk,
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
          data: `Generating artifact with ${selectModel('artifact').displayName}...`,
        }
        const payload = await this.generateStudyTimerArtifact(artifactPrompt, 'artifact')
        finalizedContent = appendArtifactToDraft(
          finalizedContent,
          payload,
          buildStudyTimerIntroLines()
        )
        artifactAdded = true
      } catch (primaryError) {
        yield {
          event: 'thinking',
          data: `Artifact generation failed. Falling back to ${selectModel('research').displayName}...`,
        }

        try {
          const payload = await this.generateStudyTimerArtifact(artifactPrompt, 'research')
          finalizedContent = appendArtifactToDraft(
            finalizedContent,
            payload,
            buildStudyTimerIntroLines()
          )
          artifactAdded = true
        } catch (fallbackError) {
          const primaryMessage =
            primaryError instanceof Error ? primaryError.message : String(primaryError)
          const fallbackMessage =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          yield {
            event: 'error',
            data: `Artifact generation failed (${selectModel('artifact').displayName} + ${selectModel('research').displayName}): ${primaryMessage}; ${fallbackMessage}`,
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
          delta: finalizedContent.startsWith(generated)
            ? finalizedContent.slice(generated.length)
            : '',
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

  /**
   * Generate study timer artifact using AI SDK generateText
   * Replaces both generateStudyTimerArtifactWithOllama and generateStudyTimerArtifactWithOpenAI
   */
  private async generateStudyTimerArtifact(
    prompt: string,
    taskType: string
  ) {
    const { primary: artModel } = resolveModelsForTask(taskType as any)
    const model = artModel.model
    const entry = artModel.entry

    const systemPrompt = `You are an interactive artifact generator. Create engaging, self-contained web components.

IMPORTANT: Your response MUST be valid JSON with this exact structure:
{
  "title": "Short descriptive title for the artifact",
  "html": "HTML content (without doctype, html, head, body tags - just the inner content)",
  "css": "CSS styles (will be placed in a style tag)",
  "javascript": "JavaScript code (React and ReactDOM are available, use JSX syntax)"
}

Guidelines:
- Use Tailwind CSS classes for styling (available via CDN)
- React 18 and ReactDOM are available globally
- Use Babel for JSX transformation (available)
- Keep code clean, well-organized, and self-contained
- The artifact should be interactive and visually appealing
- Handle errors gracefully in JavaScript

Create a complete, polished component with rich HTML structure, beautiful CSS styling, and interactive JavaScript.`

    const { text } = await generateText({
      model,
      system: systemPrompt,
      prompt,
      temperature: 0.3,
      maxOutputTokens: 20000,
      onFinish: trackAISDKUsage({ model: entry.id, taskType: 'artifact' }),
    })

    const parsed = parseArtifactPayload(text, 'Study Timer')
    if (!parsed) {
      throw new Error('Unable to parse artifact payload')
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
    const { primary: mdPrimary, fallback: mdFallback } = resolveModelsForTask('research')
    let text = ''

    for (const modelOption of [mdPrimary, mdFallback]) {
      if (!modelOption) continue
      try {
        const result = await generateText({
          model: modelOption.model,
          system: [
            'You write complete long-form markdown deliverables.',
            'Return markdown only (no code fences, no prose outside markdown).',
            'Use clear headings and actionable detail.',
          ].join(' '),
          prompt: message,
          temperature: 0.4,
          maxOutputTokens: 3000,
          onFinish: trackAISDKUsage({ model: modelOption.entry.id, taskType: 'research' }),
        })
        text = result.text
        break
      } catch (err) {
        if (isTransientError(err) && modelOption === mdPrimary && mdFallback) {
          console.warn(`[ResearchAgent] ${modelOption.entry.id} unavailable, falling back to ${mdFallback.entry.id}`)
          continue
        }
        throw err
      }
    }

    const markdown = text.trim() || '# Final Report\n\nUnable to generate report content.'
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
    outputPreference?: ResearchOutputPreference
  ): AsyncGenerator<ResearchStreamEvent> {
    const allowFileWrites = shouldEnableResearchFiles(message, outputPreference)
    const sharedCtx = this.config.sharedContextService
      ? await this.config.sharedContextService.read({
          relevantTypes: ['active_plan', 'soul_updated'],
        })
      : ''
    const basePrompt = getResearchSystemPrompt({ allowFileWrites })
    const systemPrompt = sharedCtx ? `${basePrompt}\n\n${sharedCtx}` : basePrompt

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

    // Create AI SDK v6 ToolLoopAgent with fallback
    const { primary: resPrimary, fallback: resFallback } = getModelsForTask('research')
    let result: Awaited<ReturnType<ToolLoopAgent['stream']>> | undefined

    for (const modelOption of [resPrimary, resFallback]) {
      if (!modelOption) continue
      try {
        const agent = new ToolLoopAgent({
          model: modelOption.model,
          instructions: systemPrompt,
          tools,
          stopWhen: stepCountIs(30),
          onFinish: trackAISDKUsage({ model: modelOption.entry.id, taskType: 'research' }),
        })
        result = await agent.stream({
          messages: [{ role: 'user', content: message }],
        })
        break
      } catch (err) {
        if (isTransientError(err) && modelOption === resPrimary && resFallback) {
          console.warn(`[ResearchAgent] ${modelOption.entry.id} unavailable, falling back to ${resFallback.entry.id}`)
          yield { event: 'thinking', data: `Switching to ${resFallback.entry.displayName}...` }
          continue
        }
        throw err
      }
    }

    if (!result) throw new Error('[ResearchAgent] All models unavailable')

    const subagentLifecycle = new SubagentLifecycle(['researcher', 'writer'])
    const subagentOutputs = new Map<string, string>()
    let seq = 0
    let fullText = ''

    for await (const part of result.fullStream) {
      // Drain any events emitted by tools during execution
      yield* this.drainPendingEvents()

      switch (part.type) {
        case 'text-delta': {
          fullText += part.text
          yield { event: 'text', data: part.text, isDelta: true, seq: seq++ }
          break
        }

        case 'tool-call': {
          yield {
            event: 'tool_call',
            data: JSON.stringify({
              id: part.toolCallId,
              toolName: part.toolName,
              arguments: part.input,
            }),
            seq: seq++,
          }
          break
        }

        case 'tool-result': {
          yield {
            event: 'tool_result',
            data: JSON.stringify({
              id: part.toolCallId,
              toolName: part.toolName,
              result: part.output,
            }),
            seq: seq++,
          }

          // Drain side-channel events from tool execution
          yield* this.drainPendingEvents()
          break
        }

        case 'tool-error': {
          yield {
            event: 'error',
            data: `Tool "${part.toolName}" failed: ${part.error}`,
            seq: seq++,
          }
          break
        }

        case 'reasoning-delta': {
          yield {
            event: 'thinking',
            data: part.text,
            isDelta: true,
            seq: seq++,
          }
          break
        }

        default:
          break
      }
    }

    // Complete subagent lifecycle tracking
    for (const lifecycleResult of subagentLifecycle.completeAll(subagentOutputs)) {
      yield {
        event: 'subagent-result',
        data: JSON.stringify(lifecycleResult),
        seq: seq++,
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

    yield { event: 'done', data: '', seq: seq++ }

    // Write shared context entry for completed research
    if (this.config.sharedContextService) {
      await this.config.sharedContextService.write({
        agent: 'research',
        type: 'research_done',
        summary: `Researched: ${message.slice(0, 80)}`,
        payload: { threadId, message: message.slice(0, 200) },
      })
    }
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
