/**
 * Note Creator Utility
 *
 * Lightweight replacement for NoteAgent's `create` action.
 * Provides both streaming and non-streaming variants for creating notes
 * via LLM generation + Supabase insert.
 */

import { streamText, generateText } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError, ErrorCode } from '@inkdown/shared'

import { resolveModelsForTask, isTransientError } from '../providers/ai-sdk-factory'
import { trackAISDKUsage, recordAISDKUsage } from '../providers/ai-sdk-usage'
import { getGoogleProviderOptions } from '../providers/safety'
import { buildSystemPrompt } from '../safety/content-policy'

export interface CreateNoteOptions {
  prompt: string
  supabase: SupabaseClient
  userId: string
  projectId?: string
  model?: string
}

export interface CreateNoteResult {
  noteId: string
  title: string
  content: string
}

export type NoteStreamEvent =
  | { type: 'thinking'; data: string }
  | { type: 'text-delta'; data: string }
  | { type: 'title'; data: string }
  | { type: 'finish'; data: { success: boolean; noteId?: string; title?: string } }

const CREATE_SYSTEM_PROMPT = `You are a note creation assistant. Based on the user's input, create a well-structured note.
Include:
- A clear, descriptive title
- Well-organized content with appropriate headings
- Bullet points or numbered lists where appropriate

IMPORTANT formatting rules:
- Do NOT use horizontal rules (--- or ***) to separate sections. Use headings instead.
- When writing mathematical content, use Markdown-compatible formats:
  - Inline math: $x + y = z$ (single dollar signs)
  - Display/block math:
$$
equation here
$$
  - Do NOT use \\[...\\] or [...] brackets for display math.

Output ONLY the note content in Markdown format. Start with # Title on the first line.`

export async function createNoteFromPrompt(opts: CreateNoteOptions): Promise<CreateNoteResult> {
  const { prompt, supabase, userId, projectId, model } = opts
  const { primary, fallback } = resolveModelsForTask('note-agent', model)

  let content = ''

  for (const modelOption of [primary, fallback]) {
    if (!modelOption) continue
    try {
      const startTime = Date.now()
      const result = await generateText({
        model: modelOption.model,
        system: buildSystemPrompt(CREATE_SYSTEM_PROMPT),
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        maxOutputTokens: 4000,
        providerOptions: getGoogleProviderOptions(),
      })
      recordAISDKUsage(
        result.usage,
        { model: modelOption.entry.id, taskType: 'note-agent' },
        startTime
      )
      content = result.text || ''
      break
    } catch (err) {
      if (isTransientError(err) && modelOption === primary && fallback) {
        console.warn(
          `[note-creator] ${modelOption.entry.id} unavailable, falling back to ${fallback.entry.id}`
        )
        continue
      }
      throw err
    }
  }

  if (!content) {
    throw new AppError('All models unavailable for note creation', ErrorCode.AI_PROVIDER_ERROR)
  }

  const title = extractTitle(content) || 'Untitled Note'

  const { data: newNote, error } = await supabase
    .from('notes')
    .insert({ user_id: userId, project_id: projectId, title, content })
    .select('id')
    .single()

  if (error) {
    throw new AppError(`Failed to insert note: ${error.message}`, ErrorCode.INTERNAL)
  }

  return { noteId: newNote.id, title, content }
}

export async function* streamCreateNote(opts: CreateNoteOptions): AsyncGenerator<NoteStreamEvent> {
  const { prompt, supabase, userId, projectId, model } = opts
  const { primary, fallback } = resolveModelsForTask('note-agent', model)

  yield { type: 'thinking', data: 'Writing the note...' }

  let aiStream
  for (const modelOption of [primary, fallback]) {
    if (!modelOption) continue
    try {
      aiStream = streamText({
        model: modelOption.model,
        system: buildSystemPrompt(CREATE_SYSTEM_PROMPT),
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        maxOutputTokens: 4000,
        providerOptions: getGoogleProviderOptions(),
        onFinish: trackAISDKUsage({ model: modelOption.entry.id, taskType: 'note-agent' }),
      })
      break
    } catch (error) {
      if (isTransientError(error) && modelOption === primary && fallback) {
        console.warn(
          `[note-creator] ${modelOption.entry.id} unavailable, falling back to ${fallback.entry.id}`
        )
        continue
      }
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error('[note-creator] AI SDK error:', errMsg)
      yield { type: 'text-delta', data: `AI processing error: ${errMsg}` }
      yield { type: 'finish', data: { success: false } }
      return
    }
  }

  if (!aiStream) {
    yield { type: 'text-delta', data: 'AI processing error: All models unavailable' }
    yield { type: 'finish', data: { success: false } }
    return
  }

  let fullContent = ''
  let extractedTitle = ''

  for await (const chunk of aiStream.textStream) {
    if (!chunk) continue

    fullContent += chunk
    yield { type: 'text-delta', data: chunk }

    if (!extractedTitle && fullContent.includes('\n')) {
      extractedTitle = extractTitle(fullContent) || ''
      if (extractedTitle) {
        yield { type: 'title', data: extractedTitle }
      }
    }
  }

  const title = extractedTitle || 'Untitled Note'

  const { data: newNote, error } = await supabase
    .from('notes')
    .insert({ user_id: userId, project_id: projectId, title, content: fullContent })
    .select('id')
    .single()

  if (error) {
    console.error('[note-creator] Failed to insert note:', error.message)
    yield { type: 'finish', data: { success: false } }
    return
  }

  yield { type: 'finish', data: { success: true, noteId: newNote.id, title } }
}

function extractTitle(content: string): string | undefined {
  const firstLine = content.split('\n')[0]
  if (firstLine.startsWith('# ')) {
    return firstLine.slice(2).trim()
  }
  return undefined
}
