/**
 * Editor Agent
 *
 * Central agent for intent classification and task routing.
 * From Note3: 8 intent types - chat, edit_note, follow_up, open_note,
 * create_artifact, database_action, read_memory, write_memory
 *
 * Compatible with:
 * - Vercel AI SDK for streaming
 * - Hono for API routing
 * - Tool execution system (26 tools)
 */

import { z } from 'zod'
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions'
import type { Stream } from 'openai/streaming'
import { SupabaseClient } from '@supabase/supabase-js'
import { executeTool, ToolContext, ToolResult } from '../tools'
import {
  parseMarkdownStructure,
  identifyTargets,
  selectTargetsByLineNumber,
  extractContext,
  extractInsertionContext,
  mergeEditedSection,
  mergeInsertedContent,
  inferInsertionPosition,
  isCreateOperation,
  type ClarificationOption,
  type ParsedNote,
} from '../utils'
import { buildInsertionPrompt } from './note.agent'
import { selectModel } from '../providers/model-registry'
import { createOpenAIClient } from '../providers/client-factory'
import { trackOpenAIStream, trackOpenAIResponse } from '../providers/token-tracker'

// ============================================================================
// Types
// ============================================================================

export interface EditorAgentConfig {
  supabase: SupabaseClient
  userId: string
  openaiApiKey: string
  model?: string
  planInstructions?: string
}

/**
 * Intent types from Note3
 */
export type IntentType =
  | 'chat' // General conversation, questions
  | 'edit_note' // Create, update, or modify notes
  | 'follow_up' // Continue previous conversation
  | 'open_note' // Navigate to or read a note
  | 'create_artifact' // Generate HTML/CSS/JS visualizations
  | 'database_action' // Manipulate embedded databases
  | 'read_memory' // Read AI preferences/plans/context
  | 'write_memory' // Update AI memory

export interface IntentClassification {
  intent: IntentType
  confidence: number
  parameters: Record<string, unknown>
  reasoning: string
}

export interface EditorAgentState {
  sessionId?: string
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  lastIntent?: IntentClassification
  context?: {
    currentNoteId?: string
    projectId?: string
    recentNoteIds?: string[]
    selectedBlockIds?: string[] // For clarification flow - user-selected targets (deprecated)
    selectedLineNumbers?: number[] // For clarification flow - line numbers are stable across re-parsing
  }
  toolHistory: Array<{
    tool: string
    input: unknown
    result: ToolResult
    timestamp: Date
  }>
}

export interface EditorAgentResponse {
  intent: IntentClassification
  response: string
  toolResults?: ToolResult[]
  suggestedActions?: string[]
}

type ArtifactParseSource = 'json' | 'xml' | 'markdown' | 'script' | 'unknown'

// ============================================================================
// Input Schema
// ============================================================================

export const EditorAgentInputSchema = z.object({
  message: z.string().min(1).max(10000),
  context: z
    .object({
      currentNoteId: z.string().uuid().optional(),
      projectId: z.string().uuid().optional(),
      noteIds: z.array(z.string().uuid()).optional(),
      selectedBlockIds: z.array(z.string()).optional(), // For clarification flow - user-selected targets (deprecated, use selectedLineNumbers)
      selectedLineNumbers: z.array(z.number()).optional(), // For clarification flow - line numbers are stable across re-parsing
    })
    .optional(),
  sessionId: z.string().uuid().optional(),
})

export type EditorAgentInput = z.infer<typeof EditorAgentInputSchema>

// ============================================================================
// Intent Classification
// ============================================================================

const INTENT_CLASSIFICATION_PROMPT = `You are an intent classification system. Analyze the user's message and classify it into exactly one of these intents:

1. **chat** - General questions, discussions, requests for information or help
2. **edit_note** - Creating new notes, updating existing notes, organizing content, writing paragraphs
3. **follow_up** - Continuing a previous conversation, asking for clarification
4. **open_note** - Navigating to a specific note, reading note content
5. **create_artifact** - Creating INTERACTIVE widgets only: timers, calculators, games, animations, interactive visualizations that need JavaScript. NOT for data tables.
6. **database_action** - Creating data tables with rows/columns, lists of items with structured data, tabular information. Use this when user asks to "make a table of X" or "list top N things".
7. **read_memory** - Reading AI preferences, plans, or context
8. **write_memory** - Updating AI preferences, plans, or context

EXAMPLES BY INTENT:

chat:
- "What is quantum entanglement?" → chat
- "Explain the difference between TCP and UDP" → chat
- "Help me understand this concept" → chat

edit_note:
- "Write a paragraph about machine learning" → edit_note
- "Rewrite the introduction section" → edit_note
- "Add a conclusion to this note" → edit_note
- "Write about quantum computing" → edit_note (NOT chat — writing TO the note)

follow_up:
- "Can you elaborate on that?" → follow_up
- "What about the second point?" → follow_up
- "Continue from where you left off" → follow_up

open_note:
- "Open my physics notes" → open_note
- "Go to the project plan" → open_note
- "Show me the meeting notes" → open_note

create_artifact:
- "Create an interactive bird speed visualization" → create_artifact (needs interactivity)
- "Build a stopwatch timer" → create_artifact (interactive widget)
- "Make a calculator" → create_artifact (interactive widget)

database_action:
- "Make a table of fastest birds" → database_action (structured data display)
- "Create a table of top 10 countries" → database_action (data table)
- "List the top 5 programming languages" → database_action (structured list)

read_memory:
- "What are my preferences?" → read_memory
- "What's in my study plan?" → read_memory

write_memory:
- "Remember that I prefer morning study sessions" → write_memory
- "Save this as a preference" → write_memory

CRITICAL DISAMBIGUATION — chat vs edit_note:
- If the user is asking a QUESTION about a topic → chat
- If the user wants content WRITTEN INTO the note → edit_note
- "What is X?" → chat (asking for information)
- "Write about X" → edit_note (wants content added to note)
- "Explain X" → chat (wants an explanation in chat)
- "Add an explanation of X" → edit_note (wants explanation in the note)

CRITICAL DISAMBIGUATION — chat vs open_note:
- "What is this note about?" → open_note (if no note context) or chat (if note is already open)
- "Summarize this note" → chat (if note is already open, answer from context)

CRITICAL DISAMBIGUATION — database_action vs create_artifact:
- Static data table → database_action
- Interactive widget needing JS → create_artifact

Respond with a JSON object:
{
  "intent": "one of the 8 types above",
  "confidence": 0.0-1.0,
  "parameters": { extracted parameters like noteId, action type, etc },
  "reasoning": "brief explanation of why this intent"
}

Only output valid JSON, no markdown.`

// ============================================================================
// Editor Agent Class
// ============================================================================

export class EditorAgent {
  private supabase: SupabaseClient
  private userId: string
  private openaiApiKey: string
  private model: string
  private planInstructions?: string
  private state: EditorAgentState
  private llmClient: import('openai').default

  constructor(config: EditorAgentConfig) {
    this.supabase = config.supabase
    this.userId = config.userId
    this.openaiApiKey = config.openaiApiKey
    this.model = config.model ?? selectModel('editor').id
    this.planInstructions = config.planInstructions
    this.state = {
      messages: [],
      toolHistory: [],
    }
    this.llmClient = createOpenAIClient(selectModel('editor'))
  }

  /**
   * Run the secretary agent (non-streaming)
   */
  async run(input: EditorAgentInput): Promise<EditorAgentResponse> {
    // Ensure message is a valid string
    const message = input.message || ''
    if (!message.trim()) {
      return {
        intent: { intent: 'chat', confidence: 0, parameters: {}, reasoning: 'Empty message' },
        response: 'Please provide a message.',
      }
    }

    // Update context
    if (input.context) {
      this.state.context = {
        ...this.state.context,
        ...input.context,
      }
    }

    // Step 1: Classify intent
    const intent = await this.classifyIntent(message)
    this.state.lastIntent = intent

    // Log intent to database
    await this.logIntent(intent, message)

    // Step 2: Execute based on intent
    const response = await this.executeIntent(intent, message)

    // Add to messages
    this.state.messages.push(
      { role: 'user', content: message },
      { role: 'assistant', content: response.response || '' }
    )

    return response
  }

  /**
   * Stream the secretary agent response
   */
  async *stream(input: EditorAgentInput): AsyncGenerator<{
    type:
      | 'intent'
      | 'thinking'
      | 'tool-call'
      | 'tool-result'
      | 'text-delta'
      | 'edit-proposal'
      | 'clarification-request'
      | 'artifact'
      | 'code-preview'
      | 'finish'
    data: unknown
  }> {
    // Ensure message is a valid string
    const message = input.message || ''
    if (!message.trim()) {
      yield { type: 'text-delta', data: 'Please provide a message.' }
      yield { type: 'finish', data: { intent: 'chat' } }
      return
    }

    // Update context
    if (input.context) {
      this.state.context = {
        ...this.state.context,
        ...input.context,
      }
    }

    yield { type: 'thinking', data: 'Analyzing your request...' }

    // Step 1: Classify intent
    const intent = await this.classifyIntent(message)
    this.state.lastIntent = intent

    yield { type: 'intent', data: intent }

    // Log intent
    await this.logIntent(intent, message)

    yield {
      type: 'thinking',
      data: `Intent: ${intent.intent} (${Math.round(intent.confidence * 100)}% confidence)`,
    }

    // Step 2: Execute based on intent
    let emittedUserVisibleContent = false
    for await (const chunk of this.streamExecution(intent, message)) {
      if (this.isUserVisibleStreamEvent(chunk.type)) {
        emittedUserVisibleContent = true
      }
      yield chunk
    }

    if (!emittedUserVisibleContent) {
      yield {
        type: 'text-delta',
        data: await this.buildNoOutputFallback(intent),
      }
    }

    yield { type: 'finish', data: { intent: intent.intent } }
  }

  /**
   * Get current state
   */
  getState(): EditorAgentState {
    return { ...this.state }
  }

  /**
   * Load session
   */
  async loadSession(sessionId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('agent_sessions')
      .select('state')
      .eq('id', sessionId)
      .eq('user_id', this.userId)
      .eq('agent_type', 'secretary')
      .single()

    if (error || !data) return false

    this.state = data.state as EditorAgentState
    this.state.sessionId = sessionId
    return true
  }

  /**
   * Save session
   */
  async saveSession(): Promise<string> {
    const sessionId = this.state.sessionId || crypto.randomUUID()

    await this.supabase.from('agent_sessions').upsert({
      id: sessionId,
      user_id: this.userId,
      agent_type: 'secretary',
      state: this.state,
      is_active: true,
    })

    this.state.sessionId = sessionId
    return sessionId
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Fetch note content from Supabase
   * Returns title and truncated content (max 4000 chars) to avoid token limits
   */
  private async fetchNoteContent(
    noteId: string
  ): Promise<{ title: string; content: string } | null> {
    try {
      const { data: note, error } = await this.supabase
        .from('notes')
        .select('title, content')
        .eq('id', noteId)
        .eq('user_id', this.userId)
        .single()

      if (error || !note) {
        return null
      }

      // Truncate content to avoid token limits (max 4000 chars)
      const truncatedContent = note.content?.slice(0, 4000) || ''
      const wasTruncated = (note.content?.length || 0) > 4000

      return {
        title: note.title || 'Untitled',
        content: wasTruncated ? `${truncatedContent}...\n[Content truncated]` : truncatedContent,
      }
    } catch {
      return null
    }
  }

  private async classifyIntent(message: string): Promise<IntentClassification> {
    let contextInfo = ''

    // Fetch note content if currentNoteId is provided
    if (this.state.context?.currentNoteId) {
      const noteContext = await this.fetchNoteContent(this.state.context.currentNoteId)
      if (noteContext) {
        contextInfo += `\n[Current note: "${noteContext.title}"]`
        // Include first 500 chars of note content for better classification
        const contentSnippet = noteContext.content.slice(0, 500)
        if (contentSnippet) {
          contextInfo += `\n[Note preview: "${contentSnippet}${noteContext.content.length > 500 ? '...' : ''}"]`
        }
      }
    }

    if (this.state.messages.length > 0) {
      const recentMessages = this.state.messages.slice(-4)
      const historySnippet = recentMessages
        .map((m) => `${m.role}: ${m.content.slice(0, 100)}`)
        .join('\n')
      contextInfo += `\nRecent conversation:\n${historySnippet}`
    }

    const startTime = Date.now()
    const response = await this.llmClient.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: INTENT_CLASSIFICATION_PROMPT },
        { role: 'user', content: `${contextInfo}\n\nUser message: "${message}"` },
      ],
      temperature: 0.3,
      max_completion_tokens: 500,
    })

    trackOpenAIResponse(response, { model: this.model, taskType: 'editor', startTime })

    const content = response.choices[0]?.message?.content || '{}'

    try {
      const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim())
      return {
        intent: parsed.intent || 'chat',
        confidence: parsed.confidence || 0.5,
        parameters: parsed.parameters || {},
        reasoning: parsed.reasoning || '',
      }
    } catch {
      // Default to chat if parsing fails
      return {
        intent: 'chat',
        confidence: 0.5,
        parameters: {},
        reasoning: 'Failed to parse intent, defaulting to chat',
      }
    }
  }

  private async logIntent(intent: IntentClassification, message: string): Promise<void> {
    try {
      await this.supabase.from('secretary_intents').insert({
        user_id: this.userId,
        session_id: this.state.sessionId,
        intent_type: intent.intent,
        confidence: intent.confidence,
        parameters: intent.parameters,
        user_message: message.slice(0, 1000),
      })
    } catch {
      // Ignore logging errors
    }
  }

  private async executeIntent(
    intent: IntentClassification,
    message: string
  ): Promise<EditorAgentResponse> {
    const toolResults: ToolResult[] = []
    const toolContext: ToolContext = {
      userId: this.userId,
      supabase: this.supabase,
    }

    switch (intent.intent) {
      case 'chat':
        return await this.handleChat(message)

      case 'edit_note':
        return await this.handleEditNote(intent, message)

      case 'follow_up':
        return await this.handleFollowUp(message)

      case 'open_note': {
        const requestedNoteId = await this.resolveAuthorizedNoteId(intent.parameters.noteId)
        console.info('editor_agent.open_note.execute', {
          userId: this.userId,
          rawNoteId: intent.parameters.noteId,
          selectedNoteId: requestedNoteId || null,
          hasCurrentNoteContext: Boolean(this.state.context?.currentNoteId),
        })

        if (requestedNoteId) {
          const result = await executeTool(
            'read_note',
            {
              noteId: requestedNoteId,
              includeMetadata: true,
            },
            toolContext
          )
          toolResults.push(result)
          return {
            intent,
            response: toolResults[0]?.success
              ? `Here's the note content:\n\n${JSON.stringify(toolResults[0].data, null, 2)}`
              : 'Could not load the note.',
            toolResults,
          }
        }

        // If no explicit noteId is provided but we do have an active note context,
        // treat this as a question about the current note.
        if (this.state.context?.currentNoteId) {
          return await this.handleChat(message)
        }

        return {
          intent,
          response: 'Please open a note first so I can answer questions about it.',
        }
      }

      case 'create_artifact':
        return await this.handleCreateArtifact(intent, message)

      case 'database_action':
        return await this.handleDatabaseAction(intent, message, toolContext)

      case 'read_memory': {
        const memoryType = (intent.parameters.memoryType as string) || 'preferences'
        const readResult = await executeTool(
          'read_memory_file',
          {
            memoryType,
          },
          toolContext
        )
        toolResults.push(readResult)
        return {
          intent,
          response: readResult.success
            ? `Here's your ${memoryType} memory:\n\n${(readResult.data as { content: string }).content || '(empty)'}`
            : 'Could not read memory.',
          toolResults,
        }
      }

      case 'write_memory':
        return await this.handleWriteMemory(intent, message, toolContext)

      default:
        return await this.handleChat(message)
    }
  }

  private async *streamExecution(
    intent: IntentClassification,
    message: string
  ): AsyncGenerator<{
    type:
      | 'tool-call'
      | 'tool-result'
      | 'text-delta'
      | 'thinking'
      | 'edit-proposal'
      | 'clarification-request'
      | 'artifact'
      | 'code-preview'
    data: unknown
  }> {
    const toolContext: ToolContext = {
      userId: this.userId,
      supabase: this.supabase,
    }

    switch (intent.intent) {
      case 'chat':
      case 'follow_up':
        yield* this.streamChat(message)
        break

      case 'edit_note':
        yield { type: 'thinking', data: 'Processing note edit...' }
        yield { type: 'tool-call', data: { tool: 'edit_note', parameters: intent.parameters } }
        // Stream the actual edit, passing selectedLineNumbers from context if available
        // Line numbers are stable across re-parsing, unlike UUIDs
        yield* this.streamNoteEdit(
          intent,
          message,
          this.state.context?.selectedLineNumbers,
          this.state.context?.selectedBlockIds
        )
        break

      case 'open_note': {
        const requestedNoteId = await this.resolveAuthorizedNoteId(intent.parameters.noteId)
        let emittedChars = 0
        let readSuccess = false

        console.info('editor_agent.open_note.stream.start', {
          userId: this.userId,
          rawNoteId: intent.parameters.noteId,
          selectedNoteId: requestedNoteId || null,
          hasCurrentNoteContext: Boolean(this.state.context?.currentNoteId),
        })

        if (requestedNoteId) {
          yield { type: 'tool-call', data: { tool: 'read_note', noteId: requestedNoteId } }
          const result = await executeTool(
            'read_note',
            {
              noteId: requestedNoteId,
              includeMetadata: true,
            },
            toolContext
          )
          yield { type: 'tool-result', data: result }
          if (result.success) {
            const noteData = result.data as { title: string; content: string }
            const rendered = `## ${noteData.title}\n\n${noteData.content}`
            emittedChars += rendered.length
            readSuccess = true
            yield { type: 'text-delta', data: rendered }
          }
        } else if (this.state.context?.currentNoteId) {
          // Classifier can route "what is this note about?" to open_note without noteId.
          // Fall back to chat path, which injects current note content into the prompt.
          for await (const chunk of this.streamChat(message)) {
            if (chunk.type === 'text-delta' && typeof chunk.data === 'string') {
              emittedChars += chunk.data.length
            }
            yield chunk
          }
        } else {
          const clarification = 'Please open a note first so I can answer what the note is about.'
          emittedChars += clarification.length
          yield {
            type: 'text-delta',
            data: clarification,
          }
        }

        console.info('editor_agent.open_note.stream.finish', {
          userId: this.userId,
          rawNoteId: intent.parameters.noteId,
          selectedNoteId: requestedNoteId || null,
          readSuccess,
          emittedChars,
        })
        break
      }

      case 'create_artifact':
        yield* this.streamArtifactCreation(intent, message)
        break

      case 'database_action': {
        yield* this.streamDatabaseAction(intent, message, toolContext)
        break
      }

      case 'read_memory':
      case 'write_memory': {
        yield {
          type: 'thinking',
          data: `${intent.intent === 'read_memory' ? 'Reading' : 'Writing'} memory...`,
        }
        const memResult = await this.executeIntent(intent, message)
        if (memResult.toolResults) {
          yield { type: 'tool-result', data: memResult.toolResults }
        }
        yield { type: 'text-delta', data: memResult.response }
        break
      }

      default:
        yield* this.streamChat(message)
    }
  }

  private isUserVisibleStreamEvent(
    type:
      | 'tool-call'
      | 'tool-result'
      | 'text-delta'
      | 'thinking'
      | 'edit-proposal'
      | 'clarification-request'
      | 'artifact'
      | 'code-preview'
  ): boolean {
    return (
      type === 'text-delta' ||
      type === 'edit-proposal' ||
      type === 'clarification-request' ||
      type === 'artifact'
    )
  }

  private async buildNoOutputFallback(intent: IntentClassification): Promise<string> {
    if (intent.intent === 'open_note') {
      if (!this.state.context?.currentNoteId) {
        return 'Please open a note first so I can answer what the note is about.'
      }

      const note = await this.fetchNoteContent(this.state.context.currentNoteId)
      if (note) {
        return this.buildDeterministicNoteSummary(note.title, note.content)
      }

      return 'I could not load the current note. Please open it again and retry.'
    }
    return 'I processed your request but need more context to provide a useful response.'
  }

  private isValidUuid(value: string): boolean {
    return z.string().uuid().safeParse(value).success
  }

  private async resolveAuthorizedNoteId(rawNoteId: unknown): Promise<string | undefined> {
    if (typeof rawNoteId !== 'string') return undefined
    const candidate = rawNoteId.trim()
    if (!candidate || !this.isValidUuid(candidate)) return undefined

    const { data, error } = await this.supabase
      .from('notes')
      .select('id')
      .eq('id', candidate)
      .eq('user_id', this.userId)
      .maybeSingle()

    if (error || !data) return undefined
    return candidate
  }

  private buildDeterministicNoteSummary(title: string, content: string): string {
    const paragraphs = content
      .split(/\n\n+/)
      .map((segment) => segment.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 4)

    if (paragraphs.length === 0) {
      return `This note "${title}" is currently empty.`
    }

    const bullets = paragraphs
      .map((paragraph) => `- ${paragraph.slice(0, 180)}${paragraph.length > 180 ? '...' : ''}`)
      .join('\n')

    return `This note "${title}" is mainly about:\n${bullets}`
  }

  private extractStructuredDeltaContent(content: unknown): string {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''

    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (!part || typeof part !== 'object') return ''

        const typedPart = part as {
          text?: unknown
          content?: unknown
        }

        if (typeof typedPart.text === 'string') return typedPart.text
        if (typeof typedPart.content === 'string') return typedPart.content
        if (Array.isArray(typedPart.content)) {
          return this.extractStructuredDeltaContent(typedPart.content)
        }
        return ''
      })
      .join('')
  }

  private extractStreamDelta(chunk: unknown): string {
    const choice = (chunk as { choices?: unknown[] })?.choices?.[0] as
      | {
          delta?: { content?: unknown; text?: unknown }
          text?: unknown
          content?: unknown
          message?: { content?: unknown }
        }
      | undefined

    if (!choice) return ''

    const candidates = [
      choice.delta?.content,
      choice.delta?.text,
      choice.text,
      choice.content,
      choice.message?.content,
    ]

    for (const candidate of candidates) {
      const parsed = this.extractStructuredDeltaContent(candidate)
      if (parsed) return parsed
    }

    return ''
  }

  private async handleChat(message: string): Promise<EditorAgentResponse> {
    // Build system prompt with note context if available
    let systemPrompt = `You are a helpful AI assistant for note-taking and learning.

When writing mathematical content, use these Markdown-compatible formats:
- Inline math: $x + y = z$ (single dollar signs)
- Display/block math:
$$
\\mathcal{L}(\\theta) = -\\sum_{i=1}^N ...
$$

IMPORTANT: Do NOT use \\[...\\] or [...] brackets for display math. Always use $$ delimiters.`

    if (this.planInstructions) {
      systemPrompt += `\n\nFollow these plan-specific instructions:\n${this.planInstructions}`
    }

    if (this.state.context?.currentNoteId) {
      const noteContext = await this.fetchNoteContent(this.state.context.currentNoteId)
      if (noteContext) {
        systemPrompt += `\n\n[Current note: "${noteContext.title}"]\n${noteContext.content}`
      }
    }

    const startTime = Date.now()
    const response = await this.llmClient.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...this.state.messages
          .filter((m) => m.content != null && m.content !== '')
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        { role: 'user', content: message },
      ],
      temperature: 0.7,
      max_completion_tokens: 2000,
    })

    trackOpenAIResponse(response, { model: this.model, taskType: 'chat', startTime })

    return {
      intent: this.state.lastIntent!,
      response:
        response.choices[0]?.message?.content || 'I apologize, I could not generate a response.',
    }
  }

  private async *streamChat(message: string): AsyncGenerator<{
    type: 'text-delta' | 'thinking'
    data: string
  }> {
    // Build system prompt with note context if available
    let systemPrompt = `You are a helpful AI assistant for note-taking and learning.

When writing mathematical content, use these Markdown-compatible formats:
- Inline math: $x + y = z$ (single dollar signs)
- Display/block math:
$$
\\mathcal{L}(\\theta) = -\\sum_{i=1}^N ...
$$

IMPORTANT: Do NOT use \\[...\\] or [...] brackets for display math. Always use $$ delimiters.`

    if (this.state.context?.currentNoteId) {
      yield { type: 'thinking', data: 'Reading note content...' }
      const noteContext = await this.fetchNoteContent(this.state.context.currentNoteId)
      if (noteContext) {
        systemPrompt += `\n\n[Current note: "${noteContext.title}"]\n${noteContext.content}`
      }
    }

    const rawStream = await this.llmClient.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...this.state.messages
          .filter((m) => m.content != null && m.content !== '')
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        { role: 'user', content: message },
      ],
      temperature: 0.7,
      max_completion_tokens: 2000,
      stream: true,
      stream_options: { include_usage: true },
    })

    for await (const chunk of trackOpenAIStream(rawStream, {
      model: this.model,
      taskType: 'chat',
    })) {
      const delta = this.extractStreamDelta(chunk)

      if (delta) {
        yield { type: 'text-delta', data: delta }
      } else if (chunk.choices?.[0]?.finish_reason !== 'stop') {
        console.warn('[streamChat] No delta content in chunk:', chunk)
      }
    }
  }

  private async handleEditNote(
    intent: IntentClassification,
    message: string
  ): Promise<EditorAgentResponse> {
    // Delegate to Note Agent logic
    const { NoteAgent } = await import('./note.agent')
    const noteAgent = new NoteAgent({
      supabase: this.supabase,
      userId: this.userId,
      openaiApiKey: this.openaiApiKey,
      model: this.model,
    })

    // Map intent action to valid NoteAgent action
    const rawAction = (intent.parameters.action as string) || ''
    const validActions = ['create', 'update', 'organize', 'summarize', 'expand']
    const action = validActions.includes(rawAction) ? rawAction : 'update'

    // Use noteId from intent params, falling back to current note context
    const noteId =
      (intent.parameters.noteId as string | undefined) || this.state.context?.currentNoteId
    const result = await noteAgent.run({
      action: action as 'create' | 'update' | 'organize' | 'summarize' | 'expand',
      input: message || 'Please edit this note',
      noteId,
      projectId: this.state.context?.projectId,
    })

    return {
      intent,
      response: result.success
        ? `Successfully ${action}d the note. ${result.noteId ? `Note ID: ${result.noteId}` : ''}`
        : `Failed to ${action} note: ${result.error}`,
    }
  }

  private async *streamNoteEdit(
    intent: IntentClassification,
    message: string,
    selectedLineNumbers?: number[], // For clarification flow - stable line numbers
    selectedBlockIds?: string[] // For clarification flow - legacy UUID-based matching (deprecated)
  ): AsyncGenerator<{
    type: 'text-delta' | 'thinking' | 'edit-proposal' | 'clarification-request'
    data:
      | string
      | { noteId: string; blockId?: string; original: string; proposed: string }
      | { options: ClarificationOption[]; reason: string }
  }> {
    // Use noteId from intent params, falling back to current note context
    const rawNoteId =
      (intent.parameters.noteId as string | undefined) || this.state.context?.currentNoteId
    const hasNoteId = Boolean(rawNoteId && typeof rawNoteId === 'string')

    // Ensure message is a valid non-empty string (needed early for CREATE detection)
    const safeMessage: string =
      typeof message === 'string' && message.trim() ? message : 'Please edit this note'

    // Early CREATE detection - BEFORE trying to fetch note content
    if (isCreateOperation(safeMessage, hasNoteId)) {
      console.log('[EditorAgent] Detected CREATE operation, routing to note creation')
      yield* this.streamNoteCreate(safeMessage)
      return
    }

    if (!hasNoteId || !rawNoteId) {
      console.log('[EditorAgent] Invalid noteId:', { rawNoteId, type: typeof rawNoteId })
      yield { type: 'text-delta', data: 'Please select a note to edit first.' }
      return
    }

    const noteId: string = rawNoteId

    // Fetch original content first
    yield { type: 'thinking', data: 'Reading note content...' }
    const { data: note, error: fetchError } = await this.supabase
      .from('notes')
      .select('title, content')
      .eq('id', noteId)
      .eq('user_id', this.userId)
      .single()

    if (fetchError || !note) {
      yield { type: 'text-delta', data: 'Could not find the note to edit.' }
      return
    }

    const originalContent = (note as { title: string; content: string }).content || ''

    // Handle EMPTY note with create-like instruction
    // If note is empty and user wants to "make a note about X", write to current note
    // This prevents the clarification dialog from appearing for empty notes
    if (!originalContent.trim()) {
      const isCreateLikeInstruction =
        /\b(make|write|create)\s+(a\s+)?(note|content|something)\s+(about|on|for|regarding)\b/i.test(
          safeMessage
        )

      if (isCreateLikeInstruction) {
        console.log(
          '[EditorAgent] Empty note with create-like instruction, using full document edit'
        )
        yield* this.streamFullDocumentEdit(noteId, originalContent, safeMessage, 'update')
        return
      }
    }

    // Map intent action to valid NoteAgent action
    const rawAction = (intent.parameters.action as string) || ''
    const validActions = ['create', 'update', 'organize', 'summarize', 'expand']
    const action = validActions.includes(rawAction) ? rawAction : 'update'

    // =========================================================================
    // SECTION-AWARE EDITING PIPELINE
    // =========================================================================

    // For actions that need whole-document processing, use legacy flow
    if (action === 'organize' || action === 'summarize') {
      yield* this.streamFullDocumentEdit(noteId, originalContent, safeMessage, action)
      return
    }

    // Detect ADD operations that don't need target identification
    // These operations generate new content for the whole document rather than editing specific sections
    const addPatterns =
      /\b(add|insert|create|append|write|generate)\s+(a|an|new|some)?\s*(table|summary|section|list|paragraph|content|diagram|chart|heading|conclusion|introduction)/i
    const isAddOperation =
      addPatterns.test(safeMessage) &&
      !safeMessage.toLowerCase().includes('edit') &&
      !safeMessage.toLowerCase().includes('modify') &&
      !safeMessage.toLowerCase().includes('change') &&
      !safeMessage.toLowerCase().includes('update')

    if (isAddOperation) {
      console.log('[EditorAgent] Detected ADD operation, using intelligent placement')
      const parsed = parseMarkdownStructure(originalContent)
      yield* this.streamAddContent(noteId, originalContent, parsed, safeMessage)
      return
    }

    yield { type: 'thinking', data: 'Analyzing note structure...' }

    // Step 1: Parse the note structure
    const parsed = parseMarkdownStructure(originalContent)
    console.log('[EditorAgent] Parsed structure:', {
      blockCount: parsed.blocks.length,
      outlineCount: parsed.outline.length,
    })

    // Step 2: Identify target blocks
    yield { type: 'thinking', data: 'Identifying target section...' }

    let targetResult
    if (selectedLineNumbers && selectedLineNumbers.length > 0) {
      // User has selected specific blocks from clarification - use stable line numbers
      console.log('[EditorAgent] Using line-number matching:', selectedLineNumbers)
      targetResult = selectTargetsByLineNumber(parsed, selectedLineNumbers)
    } else if (selectedBlockIds && selectedBlockIds.length > 0) {
      // Fallback to UUID-based matching (deprecated, may fail after re-parsing)
      console.log('[EditorAgent] Falling back to UUID matching (may fail):', selectedBlockIds)
      const { selectTargetsById } = await import('../utils')
      targetResult = selectTargetsById(parsed, selectedBlockIds)
    } else {
      // Auto-identify targets from instruction
      targetResult = identifyTargets(safeMessage, parsed, {
        confidenceThreshold: 0.8,
        fallbackToAll: true,
      })
    }

    console.log('[EditorAgent] Target identification:', {
      targetCount: targetResult.targets.length,
      confidence: targetResult.confidence,
      matchType: targetResult.matchType,
      needsClarification: targetResult.needsClarification,
    })

    // Step 3: Handle clarification if needed
    // But first, try to auto-select if there's a clear match among options
    if (targetResult.needsClarification && targetResult.clarificationOptions) {
      const instructionLower = safeMessage.toLowerCase()

      // Try to find the best match among clarification options
      const scoredOptions = targetResult.clarificationOptions
        .map((opt) => {
          const label = opt.label.toLowerCase().replace('section: ', '')
          let score = 0

          // Check if instruction contains the section label
          if (instructionLower.includes(label)) {
            score += 0.6
          }

          // Check word overlap between label and instruction
          const labelWords = label.split(/\s+/).filter((w) => w.length > 2)
          const instructionWords = instructionLower.split(/\s+/).filter((w) => w.length > 2)
          const overlap = labelWords.filter((w) => instructionWords.includes(w)).length
          if (labelWords.length > 0) {
            score += (overlap / labelWords.length) * 0.4
          }

          return { opt, score }
        })
        .sort((a, b) => b.score - a.score)

      console.log('[EditorAgent] Clarification auto-selection scores:', {
        topScore: scoredOptions[0]?.score,
        secondScore: scoredOptions[1]?.score,
        topLabel: scoredOptions[0]?.opt.label,
      })

      // Auto-select if:
      // 1. Top match has significant score (>= 0.5)
      // 2. AND (only one option OR significantly higher than second)
      const shouldAutoSelect =
        scoredOptions[0]?.score >= 0.5 &&
        (scoredOptions.length === 1 ||
          scoredOptions[0].score > (scoredOptions[1]?.score || 0) + 0.2)

      if (shouldAutoSelect) {
        console.log('[EditorAgent] Auto-selecting:', scoredOptions[0].opt.label)
        targetResult = selectTargetsByLineNumber(parsed, [scoredOptions[0].opt.line])
      } else {
        // No clear match - show clarification dialog
        yield {
          type: 'clarification-request',
          data: {
            options: targetResult.clarificationOptions,
            reason: targetResult.reason,
          },
        }
        return
      }
    }

    // Step 4: Handle case where no targets found
    if (targetResult.targets.length === 0) {
      yield {
        type: 'text-delta',
        data: 'Could not identify which section to edit. Please be more specific about which part of the note you want to change.',
      }
      return
    }

    // Step 5: For whole-document edits (matchType === 'all'), use legacy flow
    if (targetResult.matchType === 'all') {
      yield* this.streamFullDocumentEdit(noteId, originalContent, safeMessage, action)
      return
    }

    // Step 6: Extract focused context with markers
    yield {
      type: 'thinking',
      data: `Preparing ${targetResult.targets.length} section(s) for editing...`,
    }

    const context = extractContext(parsed, targetResult.targets, {
      precedingBlocks: 1,
      followingBlocks: 1,
      maxContextChars: 500,
      includeOutline: true,
    })

    // Step 7: Stream surgical edit through NoteAgent
    const { NoteAgent } = await import('./note.agent')
    const noteAgent = new NoteAgent({
      supabase: this.supabase,
      userId: this.userId,
      openaiApiKey: this.openaiApiKey,
      model: this.model,
    })

    yield { type: 'thinking', data: 'Generating targeted changes...' }

    let editedSection = ''
    const surgicalStream = noteAgent.streamSurgicalEdit({
      instruction: safeMessage,
      focusedContent: context.fullPrompt,
    })

    for await (const chunk of surgicalStream) {
      if (chunk.type === 'text-delta') {
        editedSection += chunk.data as string
      } else if (chunk.type === 'thinking') {
        yield { type: 'thinking', data: chunk.data as string }
      } else if (chunk.type === 'finish') {
        const finishData = chunk.data as { success: boolean; editedContent?: string }
        if (finishData.editedContent) {
          editedSection = finishData.editedContent
        }
      }
    }

    if (!editedSection.trim()) {
      yield { type: 'text-delta', data: 'Could not generate the changes. Please try again.' }
      return
    }

    // Step 8: Merge the edited section back into the full document
    yield { type: 'thinking', data: 'Merging changes...' }

    const mergeResult = mergeEditedSection(originalContent, editedSection, context, parsed)

    if (!mergeResult.success) {
      console.error('[EditorAgent] Merge failed:', mergeResult.message)
      yield { type: 'text-delta', data: `Error merging changes: ${mergeResult.message}` }
      return
    }

    const proposedContent = mergeResult.content

    // Step 9: Emit edit-proposal with original and proposed content
    yield {
      type: 'edit-proposal',
      data: {
        noteId,
        original: originalContent,
        proposed: proposedContent,
      },
    }

    // Provide context about what was changed
    const changedSections = targetResult.targets
      .filter((t) => t.type === 'section' && t.metadata?.heading)
      .map((t) => `"${t.metadata!.heading}"`)
      .join(', ')

    if (changedSections) {
      yield {
        type: 'text-delta',
        data: `I've prepared changes to ${changedSections}. Review them in your note and click + to accept or − to reject.`,
      }
    } else {
      yield {
        type: 'text-delta',
        data: "I've prepared the changes. Review them in your note and click + to accept or − to reject.",
      }
    }
  }

  /**
   * Legacy full-document edit flow for organize/summarize or when targeting whole document
   */
  private async *streamFullDocumentEdit(
    noteId: string,
    originalContent: string,
    instruction: string,
    action: string
  ): AsyncGenerator<{
    type: 'text-delta' | 'thinking' | 'edit-proposal'
    data: string | { noteId: string; blockId?: string; original: string; proposed: string }
  }> {
    const { NoteAgent } = await import('./note.agent')
    const noteAgent = new NoteAgent({
      supabase: this.supabase,
      userId: this.userId,
      openaiApiKey: this.openaiApiKey,
      model: this.model,
    })

    let proposedContent = ''

    console.log('[EditorAgent] Full document edit:', { action, noteId })

    const stream = noteAgent.stream({
      action: action as 'create' | 'update' | 'organize' | 'summarize' | 'expand',
      input: instruction,
      noteId,
      projectId: this.state.context?.projectId ?? undefined,
      options: { skipAutoSave: true },
    })

    yield { type: 'thinking', data: 'Generating content...' }

    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        proposedContent += chunk.data as string
      } else if (chunk.type === 'thinking') {
        yield { type: 'thinking', data: chunk.data as string }
      }
    }

    if (proposedContent.trim()) {
      yield {
        type: 'edit-proposal',
        data: {
          noteId,
          original: originalContent,
          proposed: proposedContent,
        },
      }
      yield {
        type: 'text-delta',
        data: "I've prepared the changes. Review them in your note and click + to accept or − to reject.",
      }
    } else {
      yield { type: 'text-delta', data: 'Could not generate the changes. Please try again.' }
    }
  }

  /**
   * Stream ADD content with intelligent placement
   * Inserts new content at the appropriate position (start or end) based on content type
   */
  private async *streamAddContent(
    noteId: string,
    originalContent: string,
    parsed: ParsedNote,
    instruction: string
  ): AsyncGenerator<{
    type: 'text-delta' | 'thinking' | 'edit-proposal'
    data: string | { noteId: string; original: string; proposed: string }
  }> {
    // 1. Infer insertion position from instruction
    const position = inferInsertionPosition(instruction)
    yield { type: 'thinking', data: `Will insert content at ${position} of document...` }

    // 2. Extract insertion context (includes fullPrompt with outline)
    const referenceBlockId =
      position === 'end' ? parsed.blocks[parsed.blocks.length - 1]?.id : parsed.blocks[0]?.id

    const context = extractInsertionContext(parsed, position, referenceBlockId, {
      maxContextChars: 500,
      includeOutline: true,
    })

    // 3. Generate ONLY the new content using the insertion prompt
    yield { type: 'thinking', data: 'Generating new content...' }

    // Build the system prompt for insertion
    const systemPrompt = buildInsertionPrompt(
      instruction,
      position,
      position === 'end' ? 'end of document' : 'beginning of document'
    )

    const startTime = Date.now()
    const response = await this.llmClient.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: context.fullPrompt },
      ],
      temperature: 0.7,
      max_completion_tokens: 2000,
    })

    trackOpenAIResponse(response, { model: this.model, taskType: 'editor', startTime })

    const newContent = response.choices[0]?.message?.content || ''

    if (!newContent.trim()) {
      yield { type: 'text-delta', data: 'Could not generate the content. Please try again.' }
      return
    }

    // 4. Merge at correct position using surgicalMerger
    const mergeResult = mergeInsertedContent(originalContent, newContent.trim(), context, parsed)

    if (!mergeResult.success) {
      yield { type: 'text-delta', data: `Error: ${mergeResult.message}` }
      return
    }

    // 5. Yield edit proposal
    yield {
      type: 'edit-proposal',
      data: {
        noteId,
        original: originalContent,
        proposed: mergeResult.content,
      },
    }

    yield {
      type: 'text-delta',
      data: `I've added new content at the ${position} of your note. Review the changes and click + to accept or \u2212 to reject.`,
    }
  }

  /**
   * Stream CREATE note operation
   * Creates a brand new note without going through edit/section flows
   */
  private async *streamNoteCreate(instruction: string): AsyncGenerator<{
    type: 'text-delta' | 'thinking' | 'edit-proposal' | 'clarification-request'
    data:
      | string
      | { noteId: string; blockId?: string; original: string; proposed: string }
      | { options: ClarificationOption[]; reason: string }
  }> {
    yield { type: 'thinking', data: 'Creating new note...' }

    const { NoteAgent } = await import('./note.agent')
    const noteAgent = new NoteAgent({
      supabase: this.supabase,
      userId: this.userId,
      openaiApiKey: this.openaiApiKey,
      model: this.model,
    })

    // Use NoteAgent's create action directly - no edit proposal needed
    const stream = noteAgent.stream({
      action: 'create',
      input: instruction,
      projectId: this.state.context?.projectId ?? undefined,
      options: { skipAutoSave: false }, // CREATE always saves immediately
    })

    for await (const chunk of stream) {
      // Pass through all chunks from NoteAgent
      if (chunk.type === 'text-delta') {
        yield { type: 'text-delta', data: chunk.data as string }
      } else if (chunk.type === 'thinking') {
        yield { type: 'thinking', data: chunk.data as string }
      } else if (chunk.type === 'title') {
        // Title chunk - pass as text-delta for now
        yield { type: 'thinking', data: `Title: ${chunk.data as string}` }
      } else if (chunk.type === 'finish') {
        const finishData = chunk.data as { success: boolean; noteId?: string; title?: string }
        if (finishData.success && finishData.noteId) {
          yield { type: 'text-delta', data: `\n\nNote created successfully!` }
        }
      }
    }
  }

  /**
   * Stream database/table action
   * For table creation requests, generates table data and inserts markdown
   */
  private async *streamDatabaseAction(
    intent: IntentClassification,
    message: string,
    toolContext: ToolContext
  ): AsyncGenerator<{
    type: 'text-delta' | 'thinking' | 'tool-call' | 'tool-result' | 'edit-proposal'
    data: unknown
  }> {
    const noteId = (intent.parameters.noteId as string) || this.state.context?.currentNoteId
    const databaseId = intent.parameters.databaseId as string

    // Check if this is a table creation request
    if (this.isTableCreationRequest(message, databaseId)) {
      yield { type: 'thinking', data: 'Generating table data...' }
      yield { type: 'tool-call', data: { tool: 'generate_table', parameters: { message } } }

      // Generate table data
      const tableData = await this.generateTableData(message)

      yield { type: 'thinking', data: `Created table with ${tableData.rows.length} rows` }

      if (!noteId) {
        // No note open - return table as text response
        let tableMarkdown = `### ${tableData.title}\n\n`
        tableMarkdown += '| ' + tableData.headers.join(' | ') + ' |\n'
        tableMarkdown += '| ' + tableData.headers.map(() => '---').join(' | ') + ' |\n'
        for (const row of tableData.rows) {
          tableMarkdown += '| ' + row.join(' | ') + ' |\n'
        }

        yield { type: 'text-delta', data: `Here's the table you requested:\n\n${tableMarkdown}` }
        return
      }

      // Get current note content for edit proposal
      const { data: note, error: fetchError } = await this.supabase
        .from('notes')
        .select('content')
        .eq('id', noteId)
        .eq('user_id', this.userId)
        .single()

      if (fetchError || !note) {
        yield { type: 'text-delta', data: 'Could not find the note to add the table to.' }
        return
      }

      const originalContent = (note as { content: string }).content || ''

      // Generate markdown table
      let tableMarkdown = `\n### ${tableData.title}\n\n`
      tableMarkdown += '| ' + tableData.headers.join(' | ') + ' |\n'
      tableMarkdown += '| ' + tableData.headers.map(() => '---').join(' | ') + ' |\n'
      for (const row of tableData.rows) {
        const cells = row.map((cell) => String(cell).replace(/\|/g, '\\|'))
        tableMarkdown += '| ' + cells.join(' | ') + ' |\n'
      }

      const proposedContent = originalContent + tableMarkdown

      // Emit edit-proposal so user can review before accepting
      yield {
        type: 'edit-proposal',
        data: {
          noteId,
          original: originalContent,
          proposed: proposedContent,
        },
      }

      yield {
        type: 'text-delta',
        data: `I've prepared a table "${tableData.title}" with ${tableData.rows.length} rows. Review the changes and click + to accept or − to reject.`,
      }
      return
    }

    // Existing database operation (CRUD on embedded database)
    yield { type: 'thinking', data: 'Processing database operation...' }

    const dbResult = await this.handleDatabaseAction(intent, message, toolContext)
    if (dbResult.toolResults) {
      yield { type: 'tool-result', data: dbResult.toolResults }
    }
    yield { type: 'text-delta', data: dbResult.response }
  }

  private async handleFollowUp(message: string): Promise<EditorAgentResponse> {
    // Use conversation history for context
    return await this.handleChat(message)
  }

  private async handleCreateArtifact(
    intent: IntentClassification,
    message: string
  ): Promise<EditorAgentResponse> {
    const toolContext: ToolContext = {
      userId: this.userId,
      supabase: this.supabase,
    }

    const response = await this.createArtifactCompletion(message)

    const content = response.choices[0]?.message?.content || ''
    const artifact = this.parseArtifactContent(content)
    const title = artifact.title || this.extractArtifactTitle(message)
    const artifactName = title || `Artifact ${new Date().toISOString().split('T')[0]}`

    if (this.shouldDebugArtifacts()) {
      this.logArtifactParseDebug('non-stream', content, artifact)
    }

    const result = await executeTool(
      'create_artifact',
      {
        type: 'full',
        name: artifactName,
        content: JSON.stringify({
          title,
          html: artifact.html,
          css: artifact.css,
          javascript: artifact.javascript,
        }),
        noteId: this.state.context?.currentNoteId,
      },
      toolContext
    )

    const formatted = this.formatArtifactForChat({
      title,
      html: artifact.html,
      css: artifact.css,
      javascript: artifact.javascript,
    })

    return {
      intent,
      response: result.success
        ? `Created artifact!\n\n${formatted}`
        : `Failed to create artifact: ${result.error}`,
      toolResults: [result],
    }
  }

  private async *streamArtifactCreation(
    _intent: IntentClassification,
    message: string
  ): AsyncGenerator<{
    type: 'text-delta' | 'thinking' | 'artifact' | 'code-preview'
    data:
      | string
      | { description: string; type: string }
      | { title: string; html: string; css: string; javascript: string; noteId: string | null }
      | { phase: 'html' | 'css' | 'javascript'; preview: string; totalChars: number }
  }> {
    // Step 1: Analyzing request
    yield { type: 'thinking', data: { description: 'Analyzing your request', type: 'analyze' } }

    const stream = await this.createArtifactCompletion(message, true)

    // Step 2: Generating HTML structure
    yield { type: 'thinking', data: { description: 'Generating HTML structure', type: 'create' } }

    // Accumulate full content to parse code blocks at the end
    let fullContent = ''
    let hasSeenCss = false
    let hasSeenJs = false
    let lastPreviewTime = 0
    const PREVIEW_INTERVAL = 200 // ms

    for await (const chunk of stream) {
      // Try multiple delta paths for GPT-5.2 compatibility
      const delta =
        chunk.choices?.[0]?.delta?.content ??
        (chunk.choices?.[0]?.delta as { text?: string })?.text ??
        (chunk.choices?.[0] as { text?: string })?.text ??
        (chunk.choices?.[0] as { content?: string })?.content

      if (delta) {
        fullContent += delta

        // Detect CSS section and emit thinking step
        if (
          !hasSeenCss &&
          (fullContent.includes('```css') ||
            fullContent.includes('<CSS_CODE>') ||
            fullContent.includes('"css":'))
        ) {
          hasSeenCss = true
          yield { type: 'thinking', data: { description: 'Adding styles', type: 'write' } }
        }

        // Detect JavaScript section and emit thinking step
        if (
          !hasSeenJs &&
          (fullContent.includes('```javascript') ||
            fullContent.includes('```js') ||
            fullContent.includes('<JAVASCRIPT_CODE>') ||
            fullContent.includes('"javascript":'))
        ) {
          hasSeenJs = true
          yield { type: 'thinking', data: { description: 'Adding interactivity', type: 'tool' } }
        }

        // Emit code preview every 200ms
        const now = Date.now()
        if (now - lastPreviewTime > PREVIEW_INTERVAL) {
          lastPreviewTime = now

          // Determine current phase based on content
          const phase = this.detectCurrentPhase(fullContent)
          const preview = this.extractPreviewSnippet(fullContent, phase)

          yield {
            type: 'code-preview',
            data: {
              phase,
              preview,
              totalChars: fullContent.length,
            },
          }
        }
      } else if (chunk.choices?.[0]?.finish_reason !== 'stop') {
        console.warn('[streamArtifactCreation] No delta content in chunk:', chunk)
      }
    }

    // Parse artifact content and emit structured artifact chunk
    const artifact = this.parseArtifactContent(fullContent)
    const title = artifact.title || this.extractArtifactTitle(message)

    if (this.shouldDebugArtifacts()) {
      this.logArtifactParseDebug('stream', fullContent, artifact)
    }

    // Step 5: Artifact ready
    yield { type: 'thinking', data: { description: 'Artifact ready', type: 'create' } }

    // Clean announcement instead of raw code dump
    yield { type: 'text-delta', data: `Created "${title}" artifact.` }

    yield {
      type: 'artifact',
      data: {
        title,
        html: artifact.html,
        css: artifact.css,
        javascript: artifact.javascript,
        noteId: this.state.context?.currentNoteId || null,
      },
    }
  }

  /**
   * Detect the current phase of artifact generation based on content markers
   */
  private detectCurrentPhase(content: string): 'html' | 'css' | 'javascript' {
    // Check what section we're currently in based on markers
    const hasJs =
      content.includes('```javascript') ||
      content.includes('```js') ||
      content.includes('<JAVASCRIPT_CODE>') ||
      content.includes('"javascript":')
    const hasCss =
      content.includes('```css') || content.includes('<CSS_CODE>') || content.includes('"css":')

    if (hasJs) {
      // Check if JS block is still being written (no closing ```)
      const jsStartMarkers = ['```javascript', '```js', '<JAVASCRIPT_CODE>', '"javascript":']
      for (const marker of jsStartMarkers) {
        const jsStart = content.lastIndexOf(marker)
        if (jsStart >= 0) {
          const afterJs = content.slice(jsStart + marker.length)
          // For markdown blocks, check for closing ```
          if (marker.startsWith('```') && !afterJs.includes('```')) return 'javascript'
          // For XML-style, check for closing tag
          if (marker === '<JAVASCRIPT_CODE>' && !afterJs.includes('</JAVASCRIPT_CODE>'))
            return 'javascript'
          // For JSON, check if still in the value (no closing quote + comma/brace)
          if (marker === '"javascript":' && !afterJs.match(/",?\s*[}]/)) return 'javascript'
        }
      }
    }

    if (hasCss) {
      const cssStartMarkers = ['```css', '<CSS_CODE>', '"css":']
      for (const marker of cssStartMarkers) {
        const cssStart = content.lastIndexOf(marker)
        if (cssStart >= 0) {
          const afterCss = content.slice(cssStart + marker.length)
          if (marker === '```css' && !afterCss.includes('```')) return 'css'
          if (marker === '<CSS_CODE>' && !afterCss.includes('</CSS_CODE>')) return 'css'
          if (marker === '"css":' && !afterCss.match(/",?\s*[}]/)) return 'css'
        }
      }
    }

    return 'html'
  }

  /**
   * Extract last ~150 chars of the current code block for preview
   */
  private extractPreviewSnippet(content: string, _phase: string): string {
    // Get the last few lines of content
    const lines = content.split('\n')
    const lastLines = lines.slice(-4).join('\n')
    return lastLines.slice(-150)
  }

  /**
   * Parse artifact content into structured fields.
   *
   * Supported formats (in order):
   * 1. JSON object: { title, html, css, javascript }
   * 2. XML-style delimiters: <HTML_CODE>...</HTML_CODE>
   * 3. Markdown code blocks: ```html ... ```
   * 4. <script> tag extraction from HTML (if JS missing)
   */
  private parseArtifactContent(content: string): {
    title: string
    html: string
    css: string
    javascript: string
    source: ArtifactParseSource
  } {
    const empty: {
      title: string
      html: string
      css: string
      javascript: string
      source: ArtifactParseSource
    } = { title: '', html: '', css: '', javascript: '', source: 'unknown' }

    const jsonParsed = this.tryParseArtifactJson(content)
    if (jsonParsed) {
      return { ...jsonParsed, source: 'json' }
    }

    const result: {
      title: string
      html: string
      css: string
      javascript: string
      source: ArtifactParseSource
    } = { ...empty }

    // === XML-style delimiters ===
    const htmlXmlMatch = content.match(/<HTML_CODE>\s*([\s\S]*?)\s*<\/HTML_CODE>/i)
    const cssXmlMatch = content.match(/<CSS_CODE>\s*([\s\S]*?)\s*<\/CSS_CODE>/i)
    const jsXmlMatch = content.match(/<JS_CODE>\s*([\s\S]*?)\s*<\/JS_CODE>/i)

    if (htmlXmlMatch) result.html = htmlXmlMatch[1].trim()
    if (cssXmlMatch) result.css = cssXmlMatch[1].trim()
    if (jsXmlMatch) result.javascript = jsXmlMatch[1].trim()

    if (result.html || result.css || result.javascript) {
      result.source = 'xml'
    }

    // === Markdown code blocks ===
    if (!result.html || !result.css || !result.javascript) {
      let normalizedContent = content
      normalizedContent = normalizedContent.replace(
        /``(javascript|js|html|css)\s*[\r\n]/gi,
        '```$1\n'
      )
      normalizedContent = normalizedContent.replace(/``(\s*[\r\n]|$)/g, '```$1')

      if (!result.html) {
        const htmlMatch = normalizedContent.match(/```\s*html\s*[\r\n]+([\s\S]*?)```/i)
        if (htmlMatch) result.html = htmlMatch[1].trim()
      }

      if (!result.css) {
        const cssMatch = normalizedContent.match(/```\s*css\s*[\r\n]+([\s\S]*?)```/i)
        if (cssMatch) result.css = cssMatch[1].trim()
      }

      if (!result.javascript) {
        const jsMatch = normalizedContent.match(/```\s*(?:javascript|js)\s*[\r\n]+([\s\S]*?)```/i)
        if (jsMatch) result.javascript = jsMatch[1].trim()
      }

      if (result.html || result.css || result.javascript) {
        result.source = result.source === 'unknown' ? 'markdown' : result.source
      }
    }

    // === Script tag extraction (if JS missing) ===
    if (result.html && !result.javascript) {
      const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
      let scripts = ''
      let match: RegExpExecArray | null

      while ((match = scriptRegex.exec(result.html)) !== null) {
        const snippet = match[1]?.trim()
        if (snippet) {
          scripts += (scripts ? '\n' : '') + snippet
        }
      }

      if (scripts) {
        result.javascript = scripts
        result.html = result.html.replace(scriptRegex, '').trim()
        result.source = result.source === 'unknown' ? 'script' : result.source
      }
    }

    return result
  }

  private tryParseArtifactJson(
    content: string
  ): { title: string; html: string; css: string; javascript: string } | null {
    const toString = (value: unknown): string =>
      typeof value === 'string' ? value : value == null ? '' : String(value)

    const attemptParse = (text: string): Record<string, unknown> | null => {
      try {
        const parsed = JSON.parse(text)
        return typeof parsed === 'object' && parsed !== null
          ? (parsed as Record<string, unknown>)
          : null
      } catch {
        return null
      }
    }

    const trimmed = content.trim()

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fencedMatch) {
      const fencedParsed = attemptParse(fencedMatch[1].trim())
      if (fencedParsed) {
        return {
          title: toString(fencedParsed.title),
          html: toString(fencedParsed.html),
          css: toString(fencedParsed.css),
          javascript: toString(fencedParsed.javascript),
        }
      }
    }

    const directParsed = attemptParse(trimmed)
    if (
      directParsed &&
      (directParsed.html || directParsed.css || directParsed.javascript || directParsed.title)
    ) {
      return {
        title: toString(directParsed.title),
        html: toString(directParsed.html),
        css: toString(directParsed.css),
        javascript: toString(directParsed.javascript),
      }
    }

    const extracted = this.extractFirstJsonObject(content)
    if (extracted) {
      const extractedParsed = attemptParse(extracted)
      if (
        extractedParsed &&
        (extractedParsed.html ||
          extractedParsed.css ||
          extractedParsed.javascript ||
          extractedParsed.title)
      ) {
        return {
          title: toString(extractedParsed.title),
          html: toString(extractedParsed.html),
          css: toString(extractedParsed.css),
          javascript: toString(extractedParsed.javascript),
        }
      }
    }

    return null
  }

  private extractFirstJsonObject(text: string): string | null {
    const start = text.indexOf('{')
    if (start === -1) return null

    let depth = 0
    let inString = false
    let escape = false

    for (let i = start; i < text.length; i += 1) {
      const ch = text[i]

      if (inString) {
        if (escape) {
          escape = false
        } else if (ch === '\\') {
          escape = true
        } else if (ch === '"') {
          inString = false
        }
        continue
      }

      if (ch === '"') {
        inString = true
        continue
      }

      if (ch === '{') {
        depth += 1
      } else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          return text.slice(start, i + 1)
        }
      }
    }

    return null
  }

  private buildArtifactSystemPrompt(): string {
    return `You are an HTML/CSS/JS developer. Generate clean, modern web components.

CRITICAL: Output ONLY valid JSON. Do NOT use markdown, XML, or prose.

Return a JSON object with this exact structure:
{
  "title": "Short descriptive title",
  "html": "Inner HTML only (no <html>, <head>, or <body> tags)",
  "css": "CSS styles as a string",
  "javascript": "JavaScript code as a string (no <script> tags)"
}

Rules:
- The entire response MUST be valid JSON
- All fields must be present (use empty strings if needed)
- Do NOT wrap in backticks or code fences
- Do NOT use localStorage, sessionStorage, IndexedDB, or cookies (sandboxed iframe has no storage)
- Keep all state in memory only`
  }

  private formatArtifactForChat(artifact: {
    title?: string
    html: string
    css: string
    javascript: string
  }): string {
    const titleLine = artifact.title ? `Title: ${artifact.title}\n\n` : ''
    return `${titleLine}\`\`\`html
${artifact.html || ''}
\`\`\`

\`\`\`css
${artifact.css || ''}
\`\`\`

\`\`\`javascript
${artifact.javascript || ''}
\`\`\``
  }

  private shouldDebugArtifacts(): boolean {
    const flag = process.env.AI_ARTIFACT_DEBUG
    return flag === '1' || flag === 'true'
  }

  private logArtifactParseDebug(
    mode: 'stream' | 'non-stream',
    content: string,
    artifact: { title: string; html: string; css: string; javascript: string; source: string }
  ) {
    console.log(
      `[artifact:${mode}] raw=${content.length} source=${artifact.source} html=${artifact.html.length} css=${artifact.css.length} js=${artifact.javascript.length}`
    )
  }

  private async createArtifactCompletion(
    message: string,
    stream: true
  ): Promise<Stream<ChatCompletionChunk>>
  private async createArtifactCompletion(message: string, stream?: false): Promise<ChatCompletion>
  private async createArtifactCompletion(message: string, stream = false) {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: this.buildArtifactSystemPrompt() },
      { role: 'user', content: message },
    ]

    const basePayload = {
      model: this.model,
      messages,
      temperature: 0.4,
      max_completion_tokens: stream ? 30000 : 4000,
    }

    if (stream) {
      try {
        return await this.llmClient.chat.completions.create({
          ...basePayload,
          stream: true,
          stream_options: { include_usage: true },
          response_format: { type: 'json_object' },
        })
      } catch (err) {
        console.warn('[artifact] JSON response_format not supported, retrying without it:', err)
        return await this.llmClient.chat.completions.create({
          ...basePayload,
          stream: true,
          stream_options: { include_usage: true },
        })
      }
    }

    const startTime = Date.now()
    try {
      const response = await this.llmClient.chat.completions.create({
        ...basePayload,
        stream: false,
        response_format: { type: 'json_object' },
      })
      trackOpenAIResponse(response, { model: this.model, taskType: 'artifact', startTime })
      return response
    } catch (err) {
      console.warn('[artifact] JSON response_format not supported, retrying without it:', err)
      const response = await this.llmClient.chat.completions.create({
        ...basePayload,
        stream: false,
      })
      trackOpenAIResponse(response, { model: this.model, taskType: 'artifact', startTime })
      return response
    }
  }

  /**
   * Extract a human-readable title from the artifact creation message
   */
  private extractArtifactTitle(message: string): string {
    const match = message.match(
      /(?:create|make|build)\s+(?:an?\s+)?artifact\s+(?:that\s+)?(?:demonstrates?|shows?)\s+(.+)/i
    )
    if (match) return match[1].slice(0, 50).trim()
    return `Artifact ${new Date().toISOString().split('T')[0]}`
  }

  /**
   * Detect if this is a table creation request vs existing database operation
   */
  private isTableCreationRequest(message: string, databaseId?: string): boolean {
    // If databaseId is provided, it's an operation on existing database
    if (databaseId) return false

    const lower = message.toLowerCase()
    // Patterns that indicate creating a new table
    const createPatterns = [
      /\b(make|create|build|generate)\s+(a\s+)?(table|list)\s+(of|with|showing|containing)/i,
      /\b(list|show)\s+(the\s+)?(top|best|fastest|largest|smallest|biggest)\s+\d+/i,
      /\btable\s+(of|with|containing|showing)\s+/i,
    ]

    return createPatterns.some((p) => p.test(lower))
  }

  /**
   * Generate table data using LLM
   */
  private async generateTableData(
    message: string
  ): Promise<{ title: string; headers: string[]; rows: string[][] }> {
    const TABLE_GENERATION_PROMPT = `You are a data structuring specialist. Generate accurate, well-researched table data based on the user's request.

Output ONLY valid JSON in this exact format:
{
  "title": "Short descriptive title for the table",
  "headers": ["Column1", "Column2", "Column3"],
  "rows": [
    ["row1col1", "row1col2", "row1col3"],
    ["row2col1", "row2col2", "row2col3"]
  ]
}

Rules:
- Provide factually accurate data
- Use appropriate column types (numbers should be strings but formatted correctly)
- Include units where relevant (e.g., "389 km/h" for speed)
- Sort data appropriately (e.g., fastest first, largest first)
- No markdown, no explanations, ONLY the JSON object`

    const startTime = Date.now()
    const response = await this.llmClient.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: TABLE_GENERATION_PROMPT },
        { role: 'user', content: message },
      ],
      temperature: 0.3,
      max_completion_tokens: 2000,
    })
    trackOpenAIResponse(response, { model: this.model, taskType: 'table', startTime })

    const content = response.choices[0]?.message?.content || '{}'

    try {
      const cleaned = content.replace(/```json\n?|\n?```/g, '').trim()
      const parsed = JSON.parse(cleaned)

      return {
        title: parsed.title || 'Table',
        headers: parsed.headers || [],
        rows: parsed.rows || [],
      }
    } catch {
      // Fallback if parsing fails
      return {
        title: 'Table',
        headers: ['Item', 'Value'],
        rows: [['Unable to generate table data', 'Please try again']],
      }
    }
  }

  private async handleDatabaseAction(
    intent: IntentClassification,
    message: string,
    toolContext: ToolContext
  ): Promise<EditorAgentResponse> {
    const noteId = (intent.parameters.noteId as string) || this.state.context?.currentNoteId
    const databaseId = intent.parameters.databaseId as string

    // Check if this is a table creation request
    if (this.isTableCreationRequest(message, databaseId)) {
      // Generate table data and insert as markdown
      const tableData = await this.generateTableData(message)

      if (!noteId) {
        // No note open - return table as text response
        let tableMarkdown = `### ${tableData.title}\n\n`
        tableMarkdown += '| ' + tableData.headers.join(' | ') + ' |\n'
        tableMarkdown += '| ' + tableData.headers.map(() => '---').join(' | ') + ' |\n'
        for (const row of tableData.rows) {
          tableMarkdown += '| ' + row.join(' | ') + ' |\n'
        }

        return {
          intent,
          response: `Here's the table you requested:\n\n${tableMarkdown}`,
        }
      }

      // Insert markdown table into the note
      const result = await executeTool(
        'insert_markdown_table',
        {
          noteId,
          title: tableData.title,
          headers: tableData.headers,
          rows: tableData.rows,
          position: 'end',
        },
        toolContext
      )

      return {
        intent,
        response: result.success
          ? `Created table "${tableData.title}" with ${tableData.rows.length} rows.`
          : `Failed to create table: ${result.error}`,
        toolResults: [result],
      }
    }

    // Existing database operation (CRUD on embedded database)
    const action = (intent.parameters.action as string) || 'query'

    if (!noteId || !databaseId) {
      return {
        intent,
        response: 'Please specify which note and database to work with.',
      }
    }

    const toolName = `db_${action}_rows`
    const result = await executeTool(
      toolName,
      {
        noteId,
        databaseId,
        ...intent.parameters,
      },
      toolContext
    )

    return {
      intent,
      response: result.success
        ? `Database operation successful:\n${JSON.stringify(result.data, null, 2)}`
        : `Database operation failed: ${result.error}`,
      toolResults: [result],
    }
  }

  private async handleWriteMemory(
    intent: IntentClassification,
    message: string,
    toolContext: ToolContext
  ): Promise<EditorAgentResponse> {
    const memoryType = (intent.parameters.memoryType as string) || 'preferences'
    const content = (intent.parameters.content as string) || message

    const result = await executeTool(
      'write_memory_file',
      {
        memoryType,
        content,
      },
      toolContext
    )

    return {
      intent,
      response: result.success
        ? `Successfully updated ${memoryType} memory.`
        : `Failed to update memory: ${result.error}`,
      toolResults: [result],
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createEditorAgent(config: EditorAgentConfig): EditorAgent {
  return new EditorAgent(config)
}
