/**
 * Inbox Agent
 *
 * A ToolLoopAgent that classifies AND executes inbox messages in a single call.
 * Uses the same proven pattern as the Secretary agent (ToolLoopAgent + streamText + tools).
 *
 * Replaces the separate classify → execute pipeline that failed with Gemini.
 */

import { ToolLoopAgent, stepCountIs, tool } from 'ai'
import { z } from 'zod'
import { getServiceClient } from '../lib/supabase'
import { getModelsForTask, isTransientError, trackAISDKUsage } from '@inkdown/ai/providers'

// ============================================================================
// Types
// ============================================================================

export interface InboxAgentResult {
  actionType: string
  success: boolean
  message: string
  category: string
  targetFile: string
  noteId?: string
  updatedFile?: string
  error?: string
}

// ============================================================================
// System Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are an inbox assistant for Inkdown, a personal knowledge management app.
The user sends quick messages from Telegram. Your job: understand what they want and call the right tool.

Rules:
- "make a note about X", "write about X", "note on X" → create_note
- Tasks, to-dos, reminders, imperative sentences → add_task
- Events with dates/times → add_calendar_event
- "word - definition", vocabulary → add_vocabulary
- URLs, articles, "read about X" → add_reading
- Anything else → add_thought

Call exactly ONE tool. Do not respond with text before calling a tool.`

// ============================================================================
// Tools Builder
// ============================================================================

function buildInboxTools(userId: string) {
  const db = getServiceClient()

  return {
    create_note: tool({
      description:
        'Create a full note about a topic. Use when the user wants to write about something substantial.',
      inputSchema: z.object({
        title: z.string().describe('Note title'),
        content: z.string().describe('Note content or outline to expand on'),
      }),
      execute: async ({ title, content }) => {
        try {
          const { createNoteAgent } = await import('@inkdown/ai/agents')
          const agent = createNoteAgent({ supabase: db, userId })
          const result = await agent.run({
            action: 'create',
            input: `Create a note titled "${title}":\n\n${content}`,
          })

          if (result?.noteId) {
            return {
              success: true,
              message: `✅ Created note '${result.title || title}'`,
              noteId: result.noteId,
            }
          }
          return {
            success: false,
            message: `Failed to create note '${title}'`,
            error: result?.error || 'NoteAgent returned no noteId',
          }
        } catch (err) {
          return {
            success: false,
            message: `Failed to create note '${title}'`,
            error: String(err),
          }
        }
      },
    }),

    add_task: tool({
      description:
        'Add a task or to-do item. Use for action items, reminders, imperative sentences.',
      inputSchema: z.object({
        taskLine: z.string().describe('The task formatted as "- [ ] Task description"'),
        targetFile: z
          .enum(['Today.md', 'Tomorrow.md'])
          .describe('Today.md for now, Tomorrow.md if explicitly future'),
      }),
      execute: async ({ taskLine, targetFile }) => {
        return await appendToFile(db, userId, targetFile, taskLine)
      },
    }),

    add_calendar_event: tool({
      description: 'Add a calendar event. Use when the message mentions dates, times, or meetings.',
      inputSchema: z.object({
        eventTitle: z.string().describe('Event title'),
        dateTime: z.string().describe('When the event occurs'),
        description: z.string().describe('Brief description of the event'),
      }),
      execute: async ({ eventTitle, dateTime, description }) => {
        const content = `- **${eventTitle}** — ${dateTime}${description ? `\n  ${description}` : ''}`
        return await appendToFile(db, userId, 'Calendar.md', content)
      },
    }),

    add_vocabulary: tool({
      description: 'Add a vocabulary word with its definition. Use for language learning content.',
      inputSchema: z.object({
        word: z.string().describe('The word'),
        definition: z.string().describe('The definition'),
      }),
      execute: async ({ word, definition }) => {
        const content = `- **${word}** — ${definition}`
        return await appendToFile(db, userId, 'Vocabulary.md', content)
      },
    }),

    add_reading: tool({
      description: 'Add a reading item — URLs, articles, papers, books.',
      inputSchema: z.object({
        title: z.string().describe('Title of the article/paper/book'),
        url: z.string().describe('URL if available, or empty string'),
        description: z.string().describe('Brief description'),
      }),
      execute: async ({ title, url, description }) => {
        const link = url ? `[${title}](${url})` : `**${title}**`
        const content = `- ${link}${description ? ` — ${description}` : ''}`
        return await appendToFile(db, userId, 'Reading.md', content)
      },
    }),

    add_thought: tool({
      description: "Capture a thought, idea, or anything that doesn't fit other categories.",
      inputSchema: z.object({
        text: z.string().describe('The thought or idea to capture'),
      }),
      execute: async ({ text }) => {
        const content = `- ${text}`
        return await appendToFile(db, userId, 'Inbox.md', content)
      },
    }),
  }
}

// ============================================================================
// File Append Helper (reuses pattern from executor.ts)
// ============================================================================

async function appendToFile(
  db: ReturnType<typeof getServiceClient>,
  userId: string,
  filename: string,
  content: string
): Promise<{ success: boolean; message: string; updatedFile?: string; error?: string }> {
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
    return { success: false, message: `Failed to update ${filename}`, error: String(error) }
  }
  return { success: true, message: `✅ Added to ${filename}`, updatedFile: filename }
}

// ============================================================================
// Main Agent Runner
// ============================================================================

/**
 * Run the inbox agent — classifies AND executes in a single ToolLoopAgent call.
 * Uses the same pattern as the Secretary agent (proven working with Gemini).
 */
export async function runInboxAgent(
  userId: string,
  messageText: string,
  source: string
): Promise<InboxAgentResult> {
  const tools = buildInboxTools(userId)
  const { primary, fallback } = getModelsForTask('inbox-classifier')

  for (const modelOption of [primary, fallback]) {
    if (!modelOption) continue

    const agent = new ToolLoopAgent({
      model: modelOption.model,
      instructions: SYSTEM_PROMPT,
      tools,
      stopWhen: stepCountIs(2),
      onFinish: trackAISDKUsage({ model: modelOption.entry.id, taskType: 'inbox-classifier' }),
    })

    try {
      const result = await agent.generate({
        messages: [
          {
            role: 'user',
            content: `From ${source}: "${messageText}"`,
          },
        ],
      })

      // Extract tool results from the agent result
      if (result.toolResults.length > 0) {
        const lastTool = result.toolResults[result.toolResults.length - 1]
        const toolOutput = lastTool.output as Record<string, unknown>

        // Map tool name → action type and category
        const actionType = lastTool.toolName
        const category = toolNameToCategory(actionType)
        const targetFile = (toolOutput.updatedFile as string) || toolNameToFile(actionType)

        return {
          actionType,
          success: (toolOutput.success as boolean) ?? false,
          message: (toolOutput.message as string) || 'Done',
          category,
          targetFile,
          noteId: toolOutput.noteId as string | undefined,
          updatedFile: toolOutput.updatedFile as string | undefined,
          error: toolOutput.error as string | undefined,
        }
      }

      // Agent responded with text but no tool call — treat as thought
      return {
        actionType: 'add_thought',
        success: false,
        message: result.text || 'Could not process your message.',
        category: 'thought',
        targetFile: 'Inbox.md',
        error: 'Agent did not call any tool',
      }
    } catch (err) {
      if (isTransientError(err) && fallback) continue
      console.error('[inbox-agent] Agent failed:', err)
      return {
        actionType: 'add_thought',
        success: false,
        message: 'Failed to process your message.',
        category: 'thought',
        targetFile: 'Inbox.md',
        error: String(err),
      }
    }
  }

  // All models failed
  return {
    actionType: 'add_thought',
    success: false,
    message: 'Failed to process your message.',
    category: 'thought',
    targetFile: 'Inbox.md',
    error: 'All models failed',
  }
}

// ============================================================================
// Helpers
// ============================================================================

function toolNameToCategory(toolName: string): string {
  const map: Record<string, string> = {
    create_note: 'note',
    add_task: 'task',
    add_calendar_event: 'calendar',
    add_vocabulary: 'vocabulary',
    add_reading: 'reading',
    add_thought: 'thought',
  }
  return map[toolName] || 'thought'
}

function toolNameToFile(toolName: string): string {
  const map: Record<string, string> = {
    create_note: '',
    add_task: 'Today.md',
    add_calendar_event: 'Calendar.md',
    add_vocabulary: 'Vocabulary.md',
    add_reading: 'Reading.md',
    add_thought: 'Inbox.md',
  }
  return map[toolName] || 'Inbox.md'
}
