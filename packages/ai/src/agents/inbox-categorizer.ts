/**
 * Inbox Categorizer Agent
 *
 * Lightweight single-call agent that categorizes raw inbox captures
 * into structured proposals. Uses generateText with Output.object().
 */

import { z } from 'zod'
import { generateText, Output } from 'ai'
import { resolveModelsForTask, isTransientError } from '../providers/ai-sdk-factory'
import { recordAISDKUsage } from '../providers/ai-sdk-usage'
import { selectModel } from '../providers/model-registry'
import type { CategorizationResult, ProposalCategory } from '@inkdown/shared/types'

// ============================================================================
// Input/Output Types
// ============================================================================

export interface CategorizationInput {
  items: Array<{ id: string; text: string; source: string }>
  existingFiles: string[]
  userId: string
}

// ============================================================================
// Output Schema
// ============================================================================

const CategorySchema = z.enum(['task', 'vocabulary', 'calendar', 'note', 'reading', 'thought'])

const CategorizationOutputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      category: CategorySchema,
      targetFile: z.string(),
      proposedContent: z.string(),
      confidence: z.number().min(0).max(1),
      metadata: z.record(z.unknown()).default({}),
    })
  ),
})

// ============================================================================
// Category → File Mapping
// ============================================================================

const CATEGORY_FILE_MAP: Record<ProposalCategory, string> = {
  task: 'Today.md',
  vocabulary: 'Vocabulary.md',
  calendar: 'Calendar.md',
  note: 'Inbox.md',
  reading: 'Reading.md',
  thought: 'Inbox.md',
}

// ============================================================================
// System Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are an inbox categorizer for a personal knowledge management system.

Given a batch of raw text captures from messaging channels, categorize each one and format it for the appropriate file.

Categories:
- **task**: Action items, to-dos, reminders (→ Today.md). Format as "- [ ] <task>"
- **vocabulary**: Words/definitions/language learning (→ Vocabulary.md). Format as "- **word** — definition"
- **calendar**: Events with dates/times (→ Calendar.md). Format as "- [DATE TIME] Event description"
- **note**: General notes, ideas, thoughts worth keeping (→ Inbox.md). Format as "- <note>"
- **reading**: URLs, articles, papers, books to read (→ Reading.md). Format as "- [ ] [Title](url) — brief description" or "- [ ] <title>"
- **thought**: Fleeting thoughts, journal entries (→ Inbox.md). Format as "- <thought>"

Rules:
1. Always pick the MOST specific category that fits
2. If text contains a URL, lean toward "reading" unless it's clearly something else
3. If text mentions a time/date, lean toward "calendar" or "task"
4. Include timestamps in calendar items, convert relative dates to descriptions
5. Strip conversational filler ("hey", "remind me to", etc.) from proposed content
6. Set confidence 0.9+ for clear items, 0.5-0.8 for ambiguous ones
7. Use existing files when available, only suggest new files for novel categories`

// ============================================================================
// Main Function
// ============================================================================

/**
 * Categorize a batch of inbox items using AI
 */
export async function categorizeInboxItems(
  input: CategorizationInput
): Promise<CategorizationResult[]> {
  if (input.items.length === 0) return []

  const userContent = buildUserContent(input)
  const modelId = selectModel('planner').id
  const { primary, fallback } = resolveModelsForTask('planner', modelId)

  for (const modelOption of [primary, fallback]) {
    if (!modelOption) continue
    try {
      const startTime = Date.now()
      const result = await generateText({
        model: modelOption.model,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user' as const, content: userContent }],
        temperature: 0.3,
        maxOutputTokens: 4000,
        output: Output.object({ schema: CategorizationOutputSchema }),
      })
      recordAISDKUsage(
        result.usage,
        { model: modelOption.entry.id, taskType: 'planner' },
        startTime
      )

      if (result.output?.items) {
        return result.output.items.map((item) => ({
          id: item.id,
          category: item.category,
          targetFile: item.targetFile || CATEGORY_FILE_MAP[item.category] || 'Inbox.md',
          proposedContent: item.proposedContent,
          confidence: item.confidence,
          metadata: item.metadata,
        }))
      }
    } catch (err) {
      if (isTransientError(err) && fallback) continue
      throw err
    }
  }

  // Fallback: return items with default categorization
  return input.items.map((item) => ({
    id: item.id,
    category: 'thought' as const,
    targetFile: 'Inbox.md',
    proposedContent: `- ${item.text}`,
    confidence: 0.1,
    metadata: { fallback: true },
  }))
}

// ============================================================================
// Helpers
// ============================================================================

function buildUserContent(input: CategorizationInput): string {
  const itemsList = input.items
    .map((item, i) => `${i + 1}. [id: ${item.id}] [source: ${item.source}] ${item.text}`)
    .join('\n')

  const filesList =
    input.existingFiles.length > 0
      ? `\nExisting memory files: ${input.existingFiles.join(', ')}`
      : ''

  return `Categorize these ${input.items.length} captures:

${itemsList}
${filesList}

Return a JSON object with an "items" array containing categorization for each item.`
}
