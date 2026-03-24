/**
 * Inbox Smart Classifier
 *
 * Uses tool-calling instead of Output.object() for reliable structured output.
 * The model picks which "action tool" to call — models are trained for this
 * and it's far more reliable than asking for a specific JSON shape.
 *
 * Cheapest possible AI call — Flash primary, Pro fallback.
 */

import { z } from 'zod'
import { generateText, tool } from 'ai'
import { resolveModelsForTask, isTransientError } from '../providers/ai-sdk-factory'
import { recordAISDKUsage } from '../providers/ai-sdk-usage'
import { selectModel } from '../providers/model-registry'
import type {
  SmartClassificationResult,
  ProposalActionType,
  ProposalCategory,
} from '@inkdown/shared/types'

// ============================================================================
// Input Types
// ============================================================================

export interface ClassifyMessageInput {
  text: string
  source: string
  existingFiles: string[]
}

// ============================================================================
// Tool Definitions (one per action type)
// ============================================================================

const classifierTools = {
  create_note: tool({
    description:
      'Create a full note about a topic. Use when the user says "create a note about X", "write about X", "note on X", "make a note about X", or describes a substantial topic.',
    inputSchema: z.object({
      title: z.string().describe('Note title'),
      content: z.string().describe('Note outline or first draft'),
      previewText: z.string().describe('Short summary for the UI card'),
      botReplyText: z.string().describe("Friendly reply like: ✅ Created note 'Title'"),
      confidence: z.number().min(0).max(1),
    }),
    execute: async (args) => args,
  }),
  add_task: tool({
    description:
      'Add a task or to-do item. Use for action items, reminders, imperative sentences like "buy groceries", "remind me to X".',
    inputSchema: z.object({
      taskLine: z.string().describe('Formatted task like: - [ ] Buy groceries'),
      targetFile: z
        .enum(['Today.md', 'Tomorrow.md'])
        .describe('Today.md by default, Tomorrow.md if explicitly future'),
      previewText: z.string().describe('Short summary for the UI card'),
      botReplyText: z
        .string()
        .describe("Friendly reply like: ✅ Added 'Buy groceries' to Today.md"),
      confidence: z.number().min(0).max(1),
    }),
    execute: async (args) => args,
  }),
  add_calendar_event: tool({
    description:
      'Add a calendar event. Use when the message mentions specific dates, times, meetings, appointments.',
    inputSchema: z.object({
      eventTitle: z.string().describe('Event title'),
      dateTime: z.string().optional().describe('Date/time if mentioned'),
      description: z.string().optional().describe('Event description'),
      previewText: z.string().describe('Short summary for the UI card'),
      botReplyText: z
        .string()
        .describe("Friendly reply like: ✅ Scheduled 'Meeting' for tomorrow 3pm"),
      confidence: z.number().min(0).max(1),
    }),
    execute: async (args) => args,
  }),
  add_vocabulary: tool({
    description:
      'Add a vocabulary word. Use for "word - definition" patterns, language learning content.',
    inputSchema: z.object({
      word: z.string().describe('The word'),
      definition: z.string().describe('The definition'),
      context: z.string().optional().describe('Example sentence or context'),
      previewText: z.string().describe('Short summary for the UI card'),
      botReplyText: z.string().describe("Friendly reply like: ✅ Added 'word' to vocabulary"),
      confidence: z.number().min(0).max(1),
    }),
    execute: async (args) => args,
  }),
  add_reading: tool({
    description:
      'Save a reading link or article. Use for URLs, article references, "read about X".',
    inputSchema: z.object({
      title: z.string().describe('Article/link title'),
      url: z.string().optional().describe('URL if provided'),
      description: z.string().optional().describe('Brief description'),
      previewText: z.string().describe('Short summary for the UI card'),
      botReplyText: z.string().describe('Friendly reply like: ✅ Saved link to reading list'),
      confidence: z.number().min(0).max(1),
    }),
    execute: async (args) => args,
  }),
  add_thought: tool({
    description:
      'Capture a thought, idea, or reflection. Use as a last resort when nothing else fits.',
    inputSchema: z.object({
      text: z.string().describe('The captured thought'),
      previewText: z.string().describe('Short summary for the UI card'),
      botReplyText: z.string().describe('Friendly reply like: 📝 Captured to your Inbox'),
      confidence: z.number().min(0).max(1),
    }),
    execute: async (args) => args,
  }),
  ask_clarification: tool({
    description:
      'Ask a clarifying question when the message is truly ambiguous or missing critical info. Only use when multiple valid interpretations exist.',
    inputSchema: z.object({
      question: z.string().describe('Short question with 2-3 options'),
      confidence: z.number().min(0).max(1),
    }),
    execute: async (args) => args,
  }),
}

type ActionToolName = keyof typeof classifierTools

// ============================================================================
// System Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are a smart inbox classifier for Inkdown, a personal knowledge management system.

Given a message from a messaging channel, call the most appropriate tool to classify it.

## Rules
1. Pick the MOST specific tool. Only use add_thought as a last resort.
2. URLs → add_reading (unless clearly a task).
3. "make a note about X", "write about X", "note on X" → ALWAYS create_note.
4. Date/time mentions → add_calendar_event or add_task.
5. Strip conversational filler ("hey", "remind me to", "can you") from content.
6. Set confidence 0.9+ for clear matches, 0.5-0.8 for ambiguous.
7. Actions execute immediately — use past tense in botReplyText ("Added", "Created", not "I'll add").
8. Only use ask_clarification when truly ambiguous. Most messages should be classified directly.

You MUST call exactly one tool.`

// ============================================================================
// Category + Target File Mapping
// ============================================================================

const ACTION_TO_CATEGORY: Record<ActionToolName, ProposalCategory> = {
  create_note: 'note',
  add_task: 'task',
  add_calendar_event: 'calendar',
  add_vocabulary: 'vocabulary',
  add_reading: 'reading',
  add_thought: 'thought',
  ask_clarification: 'thought',
}

const ACTION_TO_TARGET: Record<ActionToolName, string> = {
  create_note: '',
  add_task: 'Today.md',
  add_calendar_event: 'Calendar.md',
  add_vocabulary: 'Vocabulary.md',
  add_reading: 'Reading.md',
  add_thought: 'Inbox.md',
  ask_clarification: '',
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Classify a single incoming message using AI tool-calling.
 * Returns null on failure (caller should fall back to raw insert).
 */
export async function classifyInboxMessage(
  input: ClassifyMessageInput
): Promise<SmartClassificationResult | null> {
  const userContent = buildUserContent(input)
  const modelId = selectModel('inbox-classifier').id
  const { primary, fallback } = resolveModelsForTask('inbox-classifier', modelId)

  for (const modelOption of [primary, fallback]) {
    if (!modelOption) continue
    try {
      const startTime = Date.now()
      const result = await generateText({
        model: modelOption.model,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user' as const, content: userContent }],
        temperature: 0.3,
        maxOutputTokens: 500,
        tools: classifierTools,
        toolChoice: 'required',
      })
      recordAISDKUsage(
        result.usage,
        { model: modelOption.entry.id, taskType: 'inbox-classifier' },
        startTime
      )

      // Extract tool call result
      const toolCall = result.toolCalls?.[0]
      if (!toolCall) {
        console.warn('[inbox-classifier] No tool call in response, trying fallback')
        continue
      }

      return mapToolCallToResult(
        toolCall.toolName as ActionToolName,
        toolCall.input as Record<string, unknown>
      )
    } catch (err) {
      if (isTransientError(err) && fallback) continue
      console.error('[inbox-classifier] Classification failed:', err)
      return null
    }
  }

  return null
}

// ============================================================================
// Helpers
// ============================================================================

function buildUserContent(input: ClassifyMessageInput): string {
  const filesList =
    input.existingFiles.length > 0
      ? `\nExisting memory files: ${input.existingFiles.join(', ')}`
      : ''

  return `Classify this message from ${input.source}:

"${input.text}"
${filesList}`
}

function mapToolCallToResult(
  toolName: ActionToolName,
  args: Record<string, unknown>
): SmartClassificationResult {
  const category = ACTION_TO_CATEGORY[toolName] || 'thought'
  const confidence = (args.confidence as number) ?? 0.8

  // Handle ask_clarification specially
  if (toolName === 'ask_clarification') {
    return {
      actionType: 'needs_clarification',
      category,
      targetFile: '',
      payload: {},
      proposedContent: '',
      previewText: (args.question as string) || 'Could you clarify?',
      confidence,
      botReplyText: (args.question as string) || 'Could you clarify?',
      clarificationQuestion: args.question as string,
    }
  }

  // Map tool name to ProposalActionType
  const actionType = toolName as ProposalActionType

  // Build payload from tool args (exclude shared UI fields)
  const { previewText, botReplyText, confidence: _conf, ...payload } = args
  const targetFile = (payload.targetFile as string) || ACTION_TO_TARGET[toolName] || 'Inbox.md'

  // Build proposedContent based on action type
  let proposedContent = ''
  switch (toolName) {
    case 'create_note':
      proposedContent = `# ${payload.title}\n\n${payload.content}`
      break
    case 'add_task':
      proposedContent = (payload.taskLine as string) || `- [ ] ${previewText}`
      break
    case 'add_calendar_event':
      proposedContent = `- ${payload.eventTitle}${payload.dateTime ? ` (${payload.dateTime})` : ''}${payload.description ? ` — ${payload.description}` : ''}`
      break
    case 'add_vocabulary':
      proposedContent = `- **${payload.word}** — ${payload.definition}${payload.context ? ` _(${payload.context})_` : ''}`
      break
    case 'add_reading':
      proposedContent = `- [${payload.title}]${payload.url ? `(${payload.url})` : ''}${payload.description ? ` — ${payload.description}` : ''}`
      break
    case 'add_thought':
      proposedContent = `- ${payload.text}`
      break
  }

  return {
    actionType,
    category,
    targetFile,
    payload: payload as Record<string, unknown>,
    proposedContent,
    previewText: (previewText as string) || '',
    confidence,
    botReplyText: (botReplyText as string) || '✅ Done',
  }
}
