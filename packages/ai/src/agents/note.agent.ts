/**
 * Note Agent
 *
 * AI agent for note manipulation: create, update, organize, summarize, expand.
 * Uses GPT-5.2 with tool calling for structured operations.
 *
 * Compatible with:
 * - Vercel AI SDK for streaming
 * - Hono for API routing
 * - LangGraph for state management
 */

import { z } from 'zod'
import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// Types
// ============================================================================

export interface NoteAgentConfig {
  supabase: SupabaseClient
  userId: string
  openaiApiKey: string
  model?: string
}

export type NoteAction = 'create' | 'update' | 'organize' | 'summarize' | 'expand'

export interface NoteAgentState {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  action: NoteAction
  noteId?: string
  projectId?: string
  result?: {
    success: boolean
    noteId?: string
    content?: string
    error?: string
  }
}

export interface NoteAgentResponse {
  success: boolean
  action: NoteAction
  noteId?: string
  content?: string
  title?: string
  error?: string
  metadata?: Record<string, unknown>
}

// ============================================================================
// Input Schemas
// ============================================================================

export const NoteAgentInputSchema = z.object({
  action: z.enum(['create', 'update', 'organize', 'summarize', 'expand']),
  input: z.string().min(1).max(50000),
  noteId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  options: z
    .object({
      style: z.enum(['concise', 'detailed', 'bullet-points', 'academic']).optional(),
      language: z.string().optional(),
      preserveFormat: z.boolean().optional(),
      // When true, skip auto-saving - let frontend handle saving after user approves diff
      skipAutoSave: z.boolean().optional(),
    })
    .optional(),
})

export type NoteAgentInput = z.infer<typeof NoteAgentInputSchema>

// ============================================================================
// Action Prompts
// ============================================================================

const ACTION_PROMPTS: Record<NoteAction, string> = {
  create: `You are a note creation assistant. Based on the user's input, create a well-structured note.
Include:
- A clear, descriptive title
- Well-organized content with appropriate headings
- Bullet points or numbered lists where appropriate

Output ONLY the note content in Markdown format. Start with # Title on the first line.`,

  update: `You are a note editing assistant. The user wants to update their note based on their instructions.
Preserve the note's core structure unless specifically asked to change it.
Make the requested changes clearly and cleanly.

Output ONLY the updated note content in Markdown format.`,

  organize: `You are a note organization assistant. Restructure the provided note to be clearer and better organized.
- Improve heading structure
- Group related content
- Add bullet points where appropriate
- Fix formatting issues

Output ONLY the reorganized note content in Markdown format.`,

  summarize: `You are a summarization assistant. Create a concise summary of the provided note.
- Capture the key points
- Maintain clarity and accuracy
- Use bullet points for main ideas
- Keep it under 200 words unless the source is very long

Output ONLY the summary in Markdown format.`,

  expand: `You are a content expansion assistant. Expand on the provided note with more detail.
- Add explanations where concepts are unclear
- Provide examples where helpful
- Expand bullet points into full paragraphs if appropriate
- Add related information that would be valuable

Output ONLY the expanded note content in Markdown format.`,
}

// ============================================================================
// Note Agent Class
// ============================================================================

export class NoteAgent {
  private supabase: SupabaseClient
  private userId: string
  private openaiApiKey: string
  private model: string
  private state: NoteAgentState

  constructor(config: NoteAgentConfig) {
    this.supabase = config.supabase
    this.userId = config.userId
    this.openaiApiKey = config.openaiApiKey
    this.model = config.model ?? 'gpt-5.2'
    this.state = {
      messages: [],
      action: 'create',
    }
  }

  /**
   * Run the note agent (non-streaming)
   */
  async run(input: NoteAgentInput): Promise<NoteAgentResponse> {
    this.state.action = input.action
    this.state.noteId = input.noteId
    this.state.projectId = input.projectId

    try {
      switch (input.action) {
        case 'create':
          return await this.handleCreate(input)
        case 'update':
          return await this.handleUpdate(input)
        case 'organize':
          return await this.handleOrganize(input)
        case 'summarize':
          return await this.handleSummarize(input)
        case 'expand':
          return await this.handleExpand(input)
        default:
          return { success: false, action: input.action, error: `Unknown action: ${input.action}` }
      }
    } catch (err) {
      return {
        success: false,
        action: input.action,
        error: String(err),
      }
    }
  }

  /**
   * Stream the note agent response
   */
  async *stream(rawInput: NoteAgentInput): AsyncGenerator<{
    type: 'text-delta' | 'thinking' | 'title' | 'finish'
    data: string | { title?: string; noteId?: string; success: boolean }
  }> {
    // Runtime validation - ensure input is valid before processing
    const parseResult = NoteAgentInputSchema.safeParse(rawInput)
    if (!parseResult.success) {
      console.error('[NoteAgent] Invalid input:', parseResult.error.flatten())
      yield { type: 'text-delta', data: 'Error: Invalid input for note processing.' }
      yield { type: 'finish', data: { success: false } }
      return
    }
    const input = parseResult.data

    // Validate and normalize action
    const validActions: NoteAction[] = ['create', 'update', 'organize', 'summarize', 'expand']
    const action: NoteAction = validActions.includes(input.action) ? input.action : 'update'

    this.state.action = action
    this.state.noteId = input.noteId
    this.state.projectId = input.projectId

    yield { type: 'thinking', data: `Processing ${action} action...` }

    // Get existing note content if needed
    let existingContent = ''
    let existingTitle = ''

    if (input.noteId && ['update', 'organize', 'summarize', 'expand'].includes(action)) {
      yield { type: 'thinking', data: 'Loading note content...' }

      const { data: note, error } = await this.supabase
        .from('notes')
        .select('title, content')
        .eq('id', input.noteId)
        .eq('user_id', this.userId)
        .single()

      if (error || !note) {
        yield { type: 'finish', data: { success: false } }
        return
      }

      existingContent = (note as { title: string; content: string }).content || ''
      existingTitle = (note as { title: string; content: string }).title || ''
    }

    // Build prompt with EXPLICIT null checks
    const systemPrompt: string = ACTION_PROMPTS[action] ?? ACTION_PROMPTS.update

    // Ensure input.input is a string (not null/undefined)
    const inputText = input.input
    const safeInput: string =
      typeof inputText === 'string' && inputText.trim() ? inputText : 'Please process this note'

    let userContent: string

    if (existingContent && action !== 'create') {
      userContent = `Current note content:\n\n${existingContent}\n\n---\n\nUser instructions: ${safeInput}`
    } else if (existingContent) {
      userContent = existingContent
    } else {
      userContent = safeInput
    }

    // Final validation - explicit string check with strict null coalescing
    // This is critical because OpenAI SDK throws 400 error if content is null/undefined
    const validatedSystemPrompt: string = (typeof systemPrompt === 'string' && systemPrompt.trim())
      ? systemPrompt
      : ACTION_PROMPTS.update
    const validatedUserContent: string = (typeof userContent === 'string' && userContent.trim())
      ? userContent
      : safeInput

    if (!validatedSystemPrompt || !validatedUserContent) {
      console.error('[NoteAgent] Content validation failed after fallback:', {
        systemPromptEmpty: !validatedSystemPrompt,
        userContentEmpty: !validatedUserContent,
      })
      yield { type: 'text-delta', data: 'Error: Unable to process note - no valid content.' }
      yield { type: 'finish', data: { success: false } }
      return
    }

    // Debug logging (can be removed after verification)
    console.log('[NoteAgent] OpenAI call params:', {
      model: this.model,
      systemPromptLength: validatedSystemPrompt.length,
      userContentLength: validatedUserContent.length,
      systemPromptType: typeof validatedSystemPrompt,
      userContentType: typeof validatedUserContent,
    })

    // Stream response with try-catch for error handling
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: this.openaiApiKey })

    yield { type: 'thinking', data: 'Generating content...' }

    let stream
    try {
      stream = await client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: validatedSystemPrompt },
          { role: 'user', content: validatedUserContent },
        ],
        temperature: 0.7,
        max_completion_tokens: 4000,
        stream: true,
      })
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error('[NoteAgent] OpenAI API error:', errMsg)
      yield { type: 'text-delta', data: `AI processing error: ${errMsg}` }
      yield { type: 'finish', data: { success: false } }
      return
    }

    let fullContent = ''
    let extractedTitle = ''

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        fullContent += delta
        yield { type: 'text-delta', data: delta }

        // Extract title from first line if it's a heading
        if (!extractedTitle && fullContent.includes('\n')) {
          const firstLine = fullContent.split('\n')[0]
          if (firstLine.startsWith('# ')) {
            extractedTitle = firstLine.replace('# ', '').trim()
            yield { type: 'title', data: extractedTitle }
          }
        }
      }
    }

    // Save the note (unless skipAutoSave is true for update actions)
    let noteId = input.noteId
    const title = extractedTitle || existingTitle || 'Untitled Note'
    const skipAutoSave = input.options?.skipAutoSave === true

    if (action === 'create') {
      // Always save for create action
      const { data: newNote, error } = await this.supabase
        .from('notes')
        .insert({
          user_id: this.userId,
          project_id: input.projectId,
          title,
          content: fullContent,
        })
        .select('id')
        .single()

      if (error) {
        yield { type: 'finish', data: { success: false } }
        return
      }

      noteId = (newNote as { id: string }).id
    } else if (noteId && !skipAutoSave) {
      // Only save for update/organize/expand if skipAutoSave is not set
      // When skipAutoSave is true, the frontend will handle saving after user approves diff
      await this.supabase
        .from('notes')
        .update({
          content: fullContent,
          title: extractedTitle || undefined,
        })
        .eq('id', noteId)
        .eq('user_id', this.userId)
    }

    yield { type: 'finish', data: { success: true, noteId, title } }
  }

  /**
   * Get current state
   */
  getState(): NoteAgentState {
    return { ...this.state }
  }

  // =========================================================================
  // Private Action Handlers
  // =========================================================================

  private async handleCreate(input: NoteAgentInput): Promise<NoteAgentResponse> {
    const content = await this.generateContent(ACTION_PROMPTS.create, input.input)
    const title = this.extractTitle(content) || 'Untitled Note'

    const { data: note, error } = await this.supabase
      .from('notes')
      .insert({
        user_id: this.userId,
        project_id: input.projectId,
        title,
        content,
      })
      .select('id')
      .single()

    if (error) {
      return { success: false, action: 'create', error: error.message }
    }

    return {
      success: true,
      action: 'create',
      noteId: (note as { id: string }).id,
      title,
      content,
    }
  }

  private async handleUpdate(input: NoteAgentInput): Promise<NoteAgentResponse> {
    if (!input.noteId) {
      return { success: false, action: 'update', error: 'Note ID required for update' }
    }

    const { data: existingNote, error: fetchError } = await this.supabase
      .from('notes')
      .select('content')
      .eq('id', input.noteId)
      .eq('user_id', this.userId)
      .single()

    if (fetchError) {
      return { success: false, action: 'update', error: 'Note not found' }
    }

    const existingContent = (existingNote as { content: string }).content || ''
    const prompt = `Current note:\n\n${existingContent}\n\n---\n\nUpdate instructions: ${input.input}`

    const content = await this.generateContent(ACTION_PROMPTS.update, prompt)
    const title = this.extractTitle(content)


    const updateData: Record<string, string> = { content }
    if (title) updateData.title = title

    const { error: updateError } = await this.supabase
      .from('notes')
      .update(updateData)
      .eq('id', input.noteId)
      .eq('user_id', this.userId)

    if (updateError) {
      return { success: false, action: 'update', error: updateError.message }
    }

    return { success: true, action: 'update', noteId: input.noteId, content, title }
  }

  private async handleOrganize(input: NoteAgentInput): Promise<NoteAgentResponse> {
    if (!input.noteId) {
      return { success: false, action: 'organize', error: 'Note ID required for organize' }
    }

    const { data: existingNote, error: fetchError } = await this.supabase
      .from('notes')
      .select('content')
      .eq('id', input.noteId)
      .eq('user_id', this.userId)
      .single()

    if (fetchError) {
      return { success: false, action: 'organize', error: 'Note not found' }
    }

    const content = await this.generateContent(
      ACTION_PROMPTS.organize,
      (existingNote as { content: string }).content || ''
    )

    const { error: updateError } = await this.supabase
      .from('notes')
      .update({ content })
      .eq('id', input.noteId)
      .eq('user_id', this.userId)

    if (updateError) {
      return { success: false, action: 'organize', error: updateError.message }
    }

    return { success: true, action: 'organize', noteId: input.noteId, content }
  }

  private async handleSummarize(input: NoteAgentInput): Promise<NoteAgentResponse> {
    // Can work on provided text or existing note
    let textToSummarize = input.input

    if (input.noteId) {
      const { data: note, error } = await this.supabase
        .from('notes')
        .select('content')
        .eq('id', input.noteId)
        .eq('user_id', this.userId)
        .single()

      if (!error && note) {
        textToSummarize = (note as { content: string }).content || input.input
      }
    }

    const content = await this.generateContent(ACTION_PROMPTS.summarize, textToSummarize)

    return {
      success: true,
      action: 'summarize',
      noteId: input.noteId,
      content,
    }
  }

  private async handleExpand(input: NoteAgentInput): Promise<NoteAgentResponse> {
    if (!input.noteId) {
      return { success: false, action: 'expand', error: 'Note ID required for expand' }
    }

    const { data: existingNote, error: fetchError } = await this.supabase
      .from('notes')
      .select('content')
      .eq('id', input.noteId)
      .eq('user_id', this.userId)
      .single()

    if (fetchError) {
      return { success: false, action: 'expand', error: 'Note not found' }
    }

    const prompt = `${(existingNote as { content: string }).content || ''}\n\n---\n\nExpansion focus: ${input.input}`
    const content = await this.generateContent(ACTION_PROMPTS.expand, prompt)

    const { error: updateError } = await this.supabase
      .from('notes')
      .update({ content })
      .eq('id', input.noteId)
      .eq('user_id', this.userId)

    if (updateError) {
      return { success: false, action: 'expand', error: updateError.message }
    }

    return { success: true, action: 'expand', noteId: input.noteId, content }
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private async generateContent(systemPrompt: string, userInput: string): Promise<string> {
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: this.openaiApiKey })

    // Ensure inputs are valid strings
    const validSystemPrompt = systemPrompt || 'You are a helpful assistant.'
    const validUserInput = userInput || 'Please help with this note.'

    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: validSystemPrompt },
        { role: 'user', content: validUserInput },
      ],
      temperature: 0.7,
      max_completion_tokens: 4000,
    })

    return response.choices[0]?.message?.content || ''
  }

  private extractTitle(content: string): string | undefined {
    const firstLine = content.split('\n')[0]
    if (firstLine.startsWith('# ')) {
      return firstLine.replace('# ', '').trim()
    }
    return undefined
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createNoteAgent(config: NoteAgentConfig): NoteAgent {
  return new NoteAgent(config)
}
