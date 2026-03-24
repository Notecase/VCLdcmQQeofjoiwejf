/**
 * Action Executor
 *
 * Executes classified inbox actions autonomously.
 * Extracted from proposals.ts POST /apply for reuse in the channel handler.
 */

import { getServiceClient } from '../lib/supabase'
import type { SmartClassificationResult } from '@inkdown/shared/types'

// ============================================================================
// Types
// ============================================================================

export interface ExecutionResult {
  success: boolean
  status: 'applied' | 'failed'
  resultMessage: string
  noteId?: string
  updatedFile?: string
  error?: string
  durationMs?: number
}

// ============================================================================
// Main Executor
// ============================================================================

/**
 * Execute a classified action immediately.
 * Returns a result — never throws.
 */
export async function executeAction(
  userId: string,
  classification: SmartClassificationResult
): Promise<ExecutionResult> {
  const startTime = Date.now()

  try {
    if (classification.actionType === 'create_note') {
      return await executeNoteCreation(userId, classification, startTime)
    }

    if (classification.actionType === 'needs_clarification') {
      return {
        success: true,
        status: 'applied',
        resultMessage: classification.clarificationQuestion || 'Could you clarify?',
        durationMs: Date.now() - startTime,
      }
    }

    // All other action types: append to memory file
    return await executeFileAppend(userId, classification, startTime)
  } catch (err) {
    return {
      success: false,
      status: 'failed',
      resultMessage: 'Failed to process your message.',
      error: String(err),
      durationMs: Date.now() - startTime,
    }
  }
}

// ============================================================================
// Note Creation (non-streaming)
// ============================================================================

async function executeNoteCreation(
  userId: string,
  classification: SmartClassificationResult,
  startTime: number
): Promise<ExecutionResult> {
  const db = getServiceClient()
  const payload = classification.payload as { title?: string; content?: string }
  const title = payload.title || 'Untitled'
  const content = payload.content || classification.proposedContent || ''

  const { createNoteAgent } = await import('@inkdown/ai/agents')
  const agent = createNoteAgent({ supabase: db, userId })
  const result = await agent.run({
    action: 'create',
    input: `Create a note titled "${title}":\n\n${content}`,
  })

  if (result?.noteId) {
    return {
      success: true,
      status: 'applied',
      resultMessage: `✅ Created note '${result.title || title}'`,
      noteId: result.noteId,
      durationMs: Date.now() - startTime,
    }
  }

  return {
    success: false,
    status: 'failed',
    resultMessage: `Failed to create note '${title}'`,
    error: result?.error || 'NoteAgent returned no noteId',
    durationMs: Date.now() - startTime,
  }
}

// ============================================================================
// Note Creation (streaming variant for Telegram progress updates)
// ============================================================================

/**
 * Execute note creation with streaming progress callbacks.
 * Used by the channel handler to send/edit Telegram messages during creation.
 */
export async function executeNoteCreationStreaming(
  userId: string,
  classification: SmartClassificationResult,
  onProgress: (message: string) => void
): Promise<ExecutionResult> {
  const startTime = Date.now()
  const db = getServiceClient()
  const payload = classification.payload as { title?: string; content?: string }
  const title = payload.title || 'Untitled'
  const content = payload.content || classification.proposedContent || ''

  try {
    const { createNoteAgent } = await import('@inkdown/ai/agents')
    const agent = createNoteAgent({ supabase: db, userId })

    let detectedTitle = title
    let sectionCount = 0

    const stream = agent.stream({
      action: 'create',
      input: `Create a note titled "${title}":\n\n${content}`,
    })

    for await (const event of stream) {
      if (event.type === 'title' && typeof event.data === 'object' && event.data.title) {
        detectedTitle = event.data.title
        onProgress(`Writing '${detectedTitle}'...`)
      } else if (event.type === 'text-delta') {
        // Count section headers in accumulated text
        const text = String(event.data)
        if (text.includes('##')) {
          sectionCount++
          onProgress(`Writing '${detectedTitle}'... (section ${sectionCount})`)
        }
      } else if (event.type === 'finish' && typeof event.data === 'object') {
        const finishData = event.data as { noteId?: string; success?: boolean }
        if (finishData.noteId) {
          return {
            success: true,
            status: 'applied',
            resultMessage: `✅ Created note '${detectedTitle}'`,
            noteId: finishData.noteId,
            durationMs: Date.now() - startTime,
          }
        }
      }
    }

    // If we got through the stream without a finish event with noteId,
    // fall back to non-streaming result
    return {
      success: false,
      status: 'failed',
      resultMessage: `Failed to create note '${detectedTitle}'`,
      error: 'Stream completed without noteId',
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    return {
      success: false,
      status: 'failed',
      resultMessage: `Failed to create note '${title}'`,
      error: String(err),
      durationMs: Date.now() - startTime,
    }
  }
}

// ============================================================================
// File Append (tasks, calendar, vocabulary, reading, thoughts)
// ============================================================================

async function executeFileAppend(
  userId: string,
  classification: SmartClassificationResult,
  startTime: number
): Promise<ExecutionResult> {
  const db = getServiceClient()
  const targetFile = classification.targetFile
  const proposedContent = classification.proposedContent

  if (!targetFile || !proposedContent) {
    // Fallback: save as thought to Inbox.md
    return await appendToFile(
      db,
      userId,
      'Inbox.md',
      `- ${classification.previewText || 'Captured thought'}`,
      startTime
    )
  }

  return await appendToFile(db, userId, targetFile, proposedContent, startTime)
}

async function appendToFile(
  db: ReturnType<typeof getServiceClient>,
  userId: string,
  filename: string,
  content: string,
  startTime: number
): Promise<ExecutionResult> {
  const { data: existing } = await db
    .from('secretary_memory')
    .select('content')
    .eq('user_id', userId)
    .eq('filename', filename)
    .single()

  const currentContent = existing?.content || `# ${filename.replace('.md', '')}\n\n`
  const newContent = currentContent.trimEnd() + '\n' + content + '\n'

  const { error } = await db.from('secretary_memory').upsert(
    {
      user_id: userId,
      filename,
      content: newContent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,filename' }
  )

  if (error) {
    return {
      success: false,
      status: 'failed',
      resultMessage: `Failed to update ${filename}`,
      error: String(error),
      durationMs: Date.now() - startTime,
    }
  }

  return {
    success: true,
    status: 'applied',
    resultMessage: `✅ Added to ${filename}`,
    updatedFile: filename,
    durationMs: Date.now() - startTime,
  }
}
