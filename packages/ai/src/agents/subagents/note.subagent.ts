/**
 * Note Subagent
 *
 * Specialized subagent for note creation and editing operations.
 * Used by the DeepAgent orchestrator for edit_note tasks.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { NoteAgent } from '../note.agent'

// ============================================================================
// Types
// ============================================================================

export interface NoteSubagentConfig {
  supabase: SupabaseClient
  userId: string
  openaiApiKey: string
  model?: string
}

export interface NoteSubagentContext {
  currentNoteId?: string
  projectId?: string
}

export interface NoteSubagentResult {
  success: boolean
  noteId?: string
  content?: string
  error?: string
}

// ============================================================================
// System Prompt
// ============================================================================

export const NOTE_SUBAGENT_PROMPT = `You are a note editing specialist. Your job is to create or edit markdown content in notes.

Rules:
- Output clean, well-structured markdown
- Use appropriate headings (# ## ###)
- Include bullet points where appropriate
- When writing mathematical content, use $$ for display math and $ for inline math
- Do NOT use horizontal rules (--- or ***) to separate sections

Output ONLY the markdown content, no explanations.`

// ============================================================================
// Note Subagent
// ============================================================================

export class NoteSubagent {
  private noteAgent: NoteAgent
  private context: NoteSubagentContext = {}

  constructor(config: NoteSubagentConfig) {
    this.noteAgent = new NoteAgent({
      supabase: config.supabase,
      userId: config.userId,
      openaiApiKey: config.openaiApiKey,
      model: config.model,
    })
  }

  /**
   * Set the context for note operations
   */
  setContext(context: NoteSubagentContext): void {
    this.context = { ...this.context, ...context }
  }

  /**
   * Execute a note task with streaming
   */
  async *execute(taskDescription: string): AsyncGenerator<{
    type: 'thinking' | 'progress' | 'content' | 'edit-proposal' | 'complete'
    data: unknown
  }> {
    yield { type: 'thinking', data: 'Creating note content...' }

    const isCreate = !this.context.currentNoteId

    const stream = this.noteAgent.stream({
      action: isCreate ? 'create' : 'update',
      input: taskDescription,
      noteId: this.context.currentNoteId,
      projectId: this.context.projectId,
      options: { skipAutoSave: !isCreate },
    })

    let fullContent = ''
    let result: NoteSubagentResult = { success: false }

    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        fullContent += chunk.data as string
        yield {
          type: 'progress',
          data: { progress: Math.min(90, fullContent.length / 20), message: 'Generating content...' },
        }
        yield { type: 'content', data: chunk.data }
      } else if (chunk.type === 'thinking') {
        yield { type: 'thinking', data: chunk.data }
      } else if (chunk.type === 'finish') {
        const finishData = chunk.data as { success: boolean; noteId?: string }
        result = {
          success: finishData.success,
          noteId: finishData.noteId,
          content: fullContent,
        }
      }
    }

    yield { type: 'complete', data: result }
  }

  /**
   * Get the underlying note agent for direct operations
   */
  getNoteAgent(): NoteAgent {
    return this.noteAgent
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createNoteSubagent(config: NoteSubagentConfig): NoteSubagent {
  return new NoteSubagent(config)
}
