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
import type { SharedContextService } from '../services/shared-context.service'
import { selectModel } from '../providers/model-registry'
import { createOpenAIClient } from '../providers/client-factory'
import { trackOpenAIStream, trackOpenAIResponse } from '../providers/token-tracker'
import {
  EDIT_START_MARKER,
  EDIT_END_MARKER,
  CONTEXT_BEFORE_MARKER,
  CONTEXT_BEFORE_END_MARKER,
  CONTEXT_AFTER_MARKER,
  CONTEXT_AFTER_END_MARKER,
  extractEditedContent,
} from '../utils/contextExtractor'

// ============================================================================
// Types
// ============================================================================

export interface NoteAgentConfig {
  supabase: SupabaseClient
  userId: string
  openaiApiKey: string
  model?: string
  sharedContextService?: SharedContextService
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

// Formatting instructions to include in all prompts
const FORMAT_INSTRUCTIONS = `
IMPORTANT formatting rules:
- Do NOT use horizontal rules (--- or ***) to separate sections. Use headings instead.
- When writing mathematical content, use Markdown-compatible formats:
  - Inline math: $x + y = z$ (single dollar signs)
  - Display/block math:
$$
equation here
$$
  - Do NOT use \\[...\\] or [...] brackets for display math.`

const ACTION_PROMPTS: Record<NoteAction, string> = {
  create: `You are a note creation assistant. Based on the user's input, create a well-structured note.
Include:
- A clear, descriptive title
- Well-organized content with appropriate headings
- Bullet points or numbered lists where appropriate
${FORMAT_INSTRUCTIONS}

Output ONLY the note content in Markdown format. Start with # Title on the first line.`,

  update: `You are a note editing assistant. The user wants to update their note based on their instructions.
Preserve the note's core structure unless specifically asked to change it.
Make the requested changes clearly and cleanly.
${FORMAT_INSTRUCTIONS}

Output ONLY the updated note content in Markdown format.`,

  organize: `You are a note organization assistant. Restructure the provided note to be clearer and better organized.
- Improve heading structure
- Group related content
- Add bullet points where appropriate
- Fix formatting issues
${FORMAT_INSTRUCTIONS}

Output ONLY the reorganized note content in Markdown format.`,

  summarize: `You are a summarization assistant. Create a concise summary of the provided note.
- Capture the key points
- Maintain clarity and accuracy
- Use bullet points for main ideas
- Keep it under 200 words unless the source is very long
${FORMAT_INSTRUCTIONS}

Output ONLY the summary in Markdown format.`,

  expand: `You are a content expansion assistant. Expand on the provided note with more detail.
- Add explanations where concepts are unclear
- Provide examples where helpful
- Expand bullet points into full paragraphs if appropriate
- Add related information that would be valuable
${FORMAT_INSTRUCTIONS}

Output ONLY the expanded note content in Markdown format.`,
}

// ============================================================================
// Surgical Editing Prompts (for targeted section editing)
// ============================================================================

/**
 * Build the surgical edit system prompt
 * This prompt instructs the AI to only edit content between markers
 */
export function buildSurgicalEditPrompt(instruction: string): string {
  return `You are a precise note editing assistant.

CRITICAL RULES - YOU MUST FOLLOW THESE EXACTLY:
1. Edit ONLY the content between ${EDIT_START_MARKER} and ${EDIT_END_MARKER} markers
2. Do NOT modify, add, or remove ANY content outside these markers
3. Do NOT include the markers themselves in your output

PRESERVATION RULES - DO NOT CHANGE THESE STRUCTURAL ELEMENTS:
4. PRESERVE all existing headings exactly as written (do NOT rename, reorder, or remove section headings)
5. PRESERVE all tables - keep their structure, headers, columns, and data intact (you may add rows but not restructure)
6. PRESERVE all code blocks - keep them exactly as they are unless specifically asked to modify code
7. PRESERVE the overall document hierarchy and structure

MODIFICATION RULES - WHAT YOU CAN CHANGE:
8. You may ADD new paragraphs or expand existing paragraph text
9. You may IMPROVE wording, clarity, or detail within existing paragraphs
10. You may ADD bullet points or numbered lists to elaborate on content
11. If the user asks to "make X more detailed" or "expand X", ADD detail to existing content - do NOT replace, reorganize, or remove existing content

The content between ${CONTEXT_BEFORE_MARKER} and ${CONTEXT_BEFORE_END_MARKER} is for context only - DO NOT modify it.
The content between ${CONTEXT_AFTER_MARKER} and ${CONTEXT_AFTER_END_MARKER} is for context only - DO NOT modify it.

User instruction: ${instruction}
${FORMAT_INSTRUCTIONS}

Return ONLY the edited content that should replace the ${EDIT_START_MARKER}...${EDIT_END_MARKER} section.
Keep ALL headings, tables, and structural elements from the original content.
Do not include the markers in your response.`
}

/**
 * Build the insertion prompt for ADD operations
 */
export function buildInsertionPrompt(
  instruction: string,
  position: 'before' | 'after' | 'start' | 'end',
  referenceDescription: string
): string {
  return `You are a precise note editing assistant.

TASK: Generate NEW content to be inserted into the note.

CRITICAL RULES:
1. Generate ONLY the new content to be inserted
2. The content will be inserted ${position} ${referenceDescription}
3. Match the formatting style of the existing note
4. Do not include any meta-commentary or explanations - just the content

User instruction: ${instruction}
${FORMAT_INSTRUCTIONS}

Generate the new content to insert:`
}

// ============================================================================
// Note Agent Class
// ============================================================================

export class NoteAgent {
  private supabase: SupabaseClient
  private userId: string
  private openaiApiKey: string
  private model: string
  private sharedContextService?: SharedContextService
  private state: NoteAgentState
  private client: import('openai').default

  constructor(config: NoteAgentConfig) {
    this.supabase = config.supabase
    this.userId = config.userId
    this.openaiApiKey = config.openaiApiKey
    this.model = config.model ?? selectModel('note-agent').id
    this.sharedContextService = config.sharedContextService
    this.client = createOpenAIClient(selectModel('note-agent'))
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
    let systemPrompt: string = ACTION_PROMPTS[action] ?? ACTION_PROMPTS.update

    // Ensure input.input is a string (not null/undefined)
    const inputText = input.input
    const safeInput: string =
      typeof inputText === 'string' && inputText.trim() ? inputText : 'Please process this note'

    let userContent: string

    if (existingContent && action !== 'create') {
      userContent = `Current note content:\n\n${existingContent}\n\nUser instructions: ${safeInput}`
    } else if (existingContent) {
      userContent = existingContent
    } else {
      userContent = safeInput
    }

    // Enrich system prompt with shared cross-agent context
    if (this.sharedContextService) {
      try {
        const sharedCtx = await this.sharedContextService.read({
          relevantTypes: ['active_plan', 'research_done', 'note_created'],
        })
        if (sharedCtx) {
          systemPrompt += '\n\n' + sharedCtx
        }
      } catch {
        // Graceful degradation
      }
    }

    // Final validation - explicit string check with strict null coalescing
    // This is critical because OpenAI SDK throws 400 error if content is null/undefined
    const validatedSystemPrompt: string =
      typeof systemPrompt === 'string' && systemPrompt.trim() ? systemPrompt : ACTION_PROMPTS.update
    const validatedUserContent: string =
      typeof userContent === 'string' && userContent.trim() ? userContent : safeInput

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
    yield { type: 'thinking', data: 'Generating content...' }

    let stream
    try {
      stream = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: validatedSystemPrompt },
          { role: 'user', content: validatedUserContent },
        ],
        temperature: 0.7,
        max_completion_tokens: 4000,
        stream: true,
        stream_options: { include_usage: true },
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

    for await (const chunk of trackOpenAIStream(stream, {
      model: this.model, taskType: 'note-agent',
    })) {
      // Log chunk structure for debugging GPT-5.2 format
      console.log('[NoteAgent.stream] Chunk:', JSON.stringify(chunk).slice(0, 200))

      // Try multiple delta paths for GPT-5.2 compatibility
      const delta =
        chunk.choices?.[0]?.delta?.content ??
        (chunk.choices?.[0]?.delta as { text?: string })?.text ??
        (chunk.choices?.[0] as { text?: string })?.text ??
        (chunk.choices?.[0] as { content?: string })?.content

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
      } else if (chunk.choices?.[0]?.finish_reason !== 'stop') {
        console.warn('[NoteAgent.stream] No delta content in chunk:', chunk)
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

    // Write shared context entry for significant actions
    if (this.sharedContextService) {
      try {
        if (action === 'create') {
          await this.sharedContextService.write({
            agent: 'note',
            type: 'note_created',
            summary: `Created note: ${title}`,
            payload: { noteId, title },
          })
        } else if (['update', 'organize', 'expand'].includes(action)) {
          await this.sharedContextService.write({
            agent: 'note',
            type: 'note_edited',
            summary: `${action.charAt(0).toUpperCase() + action.slice(1)}d note: ${title}`,
            payload: { noteId, title, action },
          })
        }
      } catch {
        // Best-effort — swallow errors
      }
    }

    yield { type: 'finish', data: { success: true, noteId, title } }
  }

  /**
   * Stream a surgical edit (targeted section only)
   * Used by the section-aware editing pipeline
   */
  async *streamSurgicalEdit(config: {
    instruction: string
    focusedContent: string // Content with [EDIT_START]/[EDIT_END] markers
    isInsertion?: boolean
    insertionPosition?: 'before' | 'after' | 'start' | 'end'
    insertionReference?: string
  }): AsyncGenerator<{
    type: 'text-delta' | 'thinking' | 'finish'
    data: string | { success: boolean; editedContent?: string }
  }> {
    yield { type: 'thinking', data: 'Preparing targeted edit...' }

    // Build appropriate prompt based on operation type
    let systemPrompt: string
    if (config.isInsertion && config.insertionPosition && config.insertionReference) {
      systemPrompt = buildInsertionPrompt(
        config.instruction,
        config.insertionPosition,
        config.insertionReference
      )
    } else {
      systemPrompt = buildSurgicalEditPrompt(config.instruction)
    }

    yield { type: 'thinking', data: 'Generating targeted changes...' }

    let stream
    try {
      stream = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: config.focusedContent },
        ],
        temperature: 0.7,
        max_completion_tokens: 4000,
        stream: true,
        stream_options: { include_usage: true },
      })
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error('[NoteAgent] Surgical edit error:', errMsg)
      yield { type: 'finish', data: { success: false } }
      return
    }

    let fullContent = ''

    for await (const chunk of trackOpenAIStream(stream, {
      model: this.model, taskType: 'note-agent',
    })) {
      // Log chunk structure for debugging GPT-5.2 format
      console.log('[NoteAgent.streamSurgicalEdit] Chunk:', JSON.stringify(chunk).slice(0, 200))

      // Try multiple delta paths for GPT-5.2 compatibility
      const delta =
        chunk.choices?.[0]?.delta?.content ??
        (chunk.choices?.[0]?.delta as { text?: string })?.text ??
        (chunk.choices?.[0] as { text?: string })?.text ??
        (chunk.choices?.[0] as { content?: string })?.content

      if (delta) {
        fullContent += delta
        yield { type: 'text-delta', data: delta }
      } else if (chunk.choices?.[0]?.finish_reason !== 'stop') {
        console.warn('[NoteAgent.streamSurgicalEdit] No delta content in chunk:', chunk)
      }
    }

    // Extract the edited content (handles cases where AI includes markers)
    const editedContent = extractEditedContent(fullContent)

    yield {
      type: 'finish',
      data: {
        success: true,
        editedContent,
      },
    }
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
    const prompt = `Current note:\n\n${existingContent}\n\nUpdate instructions: ${input.input}`

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

    const prompt = `${(existingNote as { content: string }).content || ''}\n\nExpansion focus: ${input.input}`
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
    // Ensure inputs are valid strings
    const validSystemPrompt = systemPrompt || 'You are a helpful assistant.'
    const validUserInput = userInput || 'Please help with this note.'

    const startTime = Date.now()
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: validSystemPrompt },
        { role: 'user', content: validUserInput },
      ],
      temperature: 0.7,
      max_completion_tokens: 4000,
    })

    trackOpenAIResponse(response, { model: this.model, taskType: 'note-agent', startTime })

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
