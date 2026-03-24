/**
 * Inbox Smart Classifier
 *
 * Single generateText + Output.object() call per message.
 * Classifies into 6 action types with rich payloads and bot reply text.
 * Cheapest possible AI call — Flash primary, Pro fallback.
 */

import { z } from 'zod'
import { generateText, Output } from 'ai'
import { resolveModelsForTask, isTransientError } from '../providers/ai-sdk-factory'
import { recordAISDKUsage } from '../providers/ai-sdk-usage'
import { selectModel } from '../providers/model-registry'
import type { SmartClassificationResult } from '@inkdown/shared/types'

// ============================================================================
// Input Types
// ============================================================================

export interface ClassifyMessageInput {
  text: string
  source: string
  existingFiles: string[]
}

// ============================================================================
// Output Schema
// ============================================================================

const ClassificationOutputSchema = z.object({
  actionType: z.enum([
    'create_note',
    'add_task',
    'add_calendar_event',
    'add_vocabulary',
    'add_reading',
    'add_thought',
    'needs_clarification',
  ]),
  category: z.enum(['task', 'vocabulary', 'calendar', 'note', 'reading', 'thought']),
  targetFile: z.string(),
  payload: z.record(z.unknown()),
  proposedContent: z.string(),
  previewText: z.string(),
  confidence: z.number().min(0).max(1),
  botReplyText: z.string(),
  clarificationQuestion: z.string().optional(),
})

// ============================================================================
// System Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are a smart inbox classifier for a personal knowledge management system called Inkdown.

Given a single message captured from a messaging channel, classify it into exactly ONE action type and produce a structured proposal.

## Action Types

1. **create_note** — User wants to create a full note about a topic.
   Triggers: "create a note about X", "write about X", "note on X", or a substantial topic description.
   Payload: { "title": "...", "content": "..." } (content = outline or first draft)
   Target file: n/a (handled by NoteAgent)
   Example: "create a note about quantum mechanics" → title: "Quantum Mechanics", content: outline

2. **add_task** — Action items, to-dos, reminders.
   Triggers: "buy groceries", "remind me to X", "todo: X", imperative sentences.
   Payload: { "taskLine": "- [ ] ...", "targetFile": "Today.md" }
   Target file: Today.md (default) or Tomorrow.md if explicitly future
   Example: "buy groceries" → taskLine: "- [ ] Buy groceries"

3. **add_calendar_event** — Events with dates/times.
   Triggers: "meeting with X at Y", "dinner on Friday", mentions of specific dates/times.
   Payload: { "eventTitle": "...", "dateTime": "...", "description": "..." }
   Target file: Calendar.md
   Example: "meeting with John tomorrow 3pm" → eventTitle: "Meeting with John", dateTime: "tomorrow 3pm"

4. **add_vocabulary** — Words and definitions, language learning.
   Triggers: "word - definition", vocabulary format, language learning content.
   Payload: { "word": "...", "definition": "...", "context": "..." }
   Target file: Vocabulary.md
   Example: "ephemeral - lasting briefly" → word: "ephemeral", definition: "lasting for a very short time"

5. **add_reading** — URLs, articles, papers, books to read.
   Triggers: URLs, "read about X", article/paper references.
   Payload: { "title": "...", "url": "...", "description": "..." }
   Target file: Reading.md
   Example: "https://arxiv.org/abs/2301.01234" → title from URL, description: brief summary

6. **add_thought** — Anything else: ideas, reflections, random thoughts.
   Triggers: Default fallback for anything that doesn't fit above categories.
   Payload: { "text": "..." }
   Target file: Inbox.md
   Example: "I wonder if black holes emit information" → text: captured thought

7. **needs_clarification** — The message is ambiguous or missing critical information.
   Triggers: Multiple valid interpretations, missing key details, confidence < 0.5.
   Payload: {} (empty)
   Target file: "" (empty)
   clarificationQuestion: A short, conversational question offering 2-3 options.
   Example: "meeting" → clarificationQuestion: "Is this a calendar event or a task? And when is it?"

## Rules

1. Pick the MOST specific action type. Only use add_thought as a last resort.
2. URLs → add_reading (unless clearly a task or note reference).
3. Date/time mentions → add_calendar_event or add_task (with due date).
4. Strip conversational filler ("hey", "remind me to", "can you") from content.
5. Set confidence 0.9+ for clear matches, 0.5-0.8 for ambiguous ones.
6. proposedContent = the formatted text that will be appended to the target file.
7. previewText = short human-readable summary for the Inbox UI card.
8. Use needs_clarification ONLY when truly ambiguous (multiple valid interpretations) or critical info is missing. Keep clarification questions short and offer 2-3 options.
9. When confidence < 0.5, prefer needs_clarification over guessing.

## Bot Reply

Generate a friendly, concise botReplyText. Actions execute immediately — use past tense:
- "✅ Created note 'Quantum Mechanics'"
- "✅ Added 'Buy groceries' to Today.md"
- "✅ Added 'serendipity' to your vocabulary"
- "✅ Scheduled 'Meeting with John' for tomorrow 3pm"
- "✅ Saved link to your reading list"
- "📝 Captured to your Inbox"
- For needs_clarification: use the clarificationQuestion as botReplyText`

// ============================================================================
// Main Function
// ============================================================================

/**
 * Classify a single incoming message using AI.
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
        maxOutputTokens: 1000,
        output: Output.object({ schema: ClassificationOutputSchema }),
      })
      recordAISDKUsage(
        result.usage,
        { model: modelOption.entry.id, taskType: 'inbox-classifier' },
        startTime
      )

      // output getter throws NoOutputGeneratedError if model didn't produce valid JSON
      try {
        if (result.output) {
          return result.output
        }
      } catch {
        // No valid output — try fallback model
        continue
      }
    } catch (err) {
      // Retry with fallback on transient errors OR when model fails to produce valid output
      const isNoOutput = err instanceof Error && err.name === 'AI_NoOutputGeneratedError'
      if ((isTransientError(err) || isNoOutput) && fallback) continue
      // Don't throw — return null so caller falls back gracefully
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
${filesList}

Return a JSON object with: actionType, category, targetFile, payload, proposedContent, previewText, confidence, botReplyText.`
}
