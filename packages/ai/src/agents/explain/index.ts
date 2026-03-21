/**
 * Explain Agent
 *
 * Lightweight AI tutor agent for course lessons.
 * Explain-only mode: no editing, no artifacts, no tools.
 * Streams chat completion with lesson context in system prompt.
 */

import type OpenAI from 'openai'
import type { ExplainInput, ExplainStreamEvent } from '@inkdown/shared/types'
import type { SharedContextService } from '../../services/shared-context.service'
import { selectModel } from '../../providers/model-registry'
import { createOpenAIClient } from '../../providers/client-factory'
import { trackOpenAIStream } from '../../providers/token-tracker'

export interface ExplainAgentConfig {
  openaiApiKey: string
  model?: string
  sharedContextService?: SharedContextService
}

function buildSystemPrompt(input: ExplainInput): string {
  const { lessonContext, highlightedText } = input
  const parts: string[] = []

  parts.push(`You are an AI tutor for the course "${lessonContext.courseTitle}".`)
  parts.push(
    `The student is studying lesson "${lessonContext.lessonTitle}" (module: "${lessonContext.moduleTitle}").`
  )
  parts.push('')

  parts.push(
    '## Lesson Content (THIS is what the student is studying — always refer to this when they ask questions)'
  )
  parts.push(lessonContext.markdown || '(No content available)')
  parts.push('')

  if (lessonContext.keyTerms && lessonContext.keyTerms.length > 0) {
    parts.push('## Key Terms')
    for (const kt of lessonContext.keyTerms) {
      parts.push(`- **${kt.term}**: ${kt.definition}`)
    }
    parts.push('')
  }

  if (lessonContext.keyPoints && lessonContext.keyPoints.length > 0) {
    parts.push('## Key Points')
    for (const kp of lessonContext.keyPoints) {
      parts.push(`- ${kp}`)
    }
    parts.push('')
  }

  if (lessonContext.transcript) {
    parts.push('## Transcript')
    parts.push(lessonContext.transcript)
    parts.push('')
  }

  parts.push('## Rules')
  parts.push('- EXPLAIN mode only. Help the student understand this lesson content.')
  parts.push(
    '- When the student says "this", "this note", "the note", "this lesson", "the content", or similar — they are referring to the lesson content above. Always answer based on that content.'
  )
  parts.push(
    "- You have FULL access to the lesson content. Never say you don't know what the student is referring to — the lesson content above IS the material they're studying."
  )
  parts.push('- Never produce code edits, artifacts, or action proposals.')
  parts.push('- Use clear examples and relate concepts to other parts of the course when possible.')
  parts.push('- Format responses with markdown for readability.')
  parts.push('- Keep explanations concise but thorough.')

  if (lessonContext.lessonType === 'quiz' || lessonContext.lessonType === 'practice') {
    parts.push(
      '- The student is working on a quiz/practice exercise. Guide them toward understanding without revealing answers directly. Use Socratic questioning to help them reason through problems.'
    )
  }

  if (highlightedText) {
    parts.push('')
    parts.push('## Highlighted Text')
    parts.push(`The student has highlighted the following passage:`)
    parts.push(`> ${highlightedText}`)

    if (input.highlightSurroundingContext) {
      parts.push('')
      parts.push('This passage appears in the following context:')
      parts.push(`> ${input.highlightSurroundingContext}`)
    }

    if (input.highlightSection) {
      parts.push('')
      parts.push(`Under section: "${input.highlightSection}"`)
    }
  }

  return parts.join('\n')
}

export class ExplainAgent {
  private openaiApiKey: string
  private model: string
  private client: OpenAI
  private sharedContextService?: SharedContextService

  constructor(config: ExplainAgentConfig) {
    this.openaiApiKey = config.openaiApiKey
    this.model = config.model ?? selectModel('explain').id
    this.client = createOpenAIClient(selectModel('explain'))
    this.sharedContextService = config.sharedContextService
  }

  async *stream(input: ExplainInput): AsyncGenerator<ExplainStreamEvent> {
    let systemPrompt = buildSystemPrompt(input)

    // Enrich system prompt with shared cross-agent context
    if (this.sharedContextService) {
      try {
        const sharedCtx = await this.sharedContextService.read({
          relevantTypes: ['active_plan', 'research_done', 'course_saved'],
        })
        if (sharedCtx) {
          systemPrompt += '\n\n' + sharedCtx
        }
      } catch {
        // Graceful degradation
      }
    }

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ]

    // Add conversation history
    if (input.conversationHistory) {
      for (const msg of input.conversationHistory) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    // Add current user message
    messages.push({ role: 'user', content: input.message })

    yield { event: 'thinking', data: 'Preparing explanation...' }

    try {
      const rawStream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.7,
        max_completion_tokens: 4000,
        stream: true,
        stream_options: { include_usage: true },
      })

      for await (const chunk of trackOpenAIStream(rawStream, { model: this.model, taskType: 'explain' })) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          yield { event: 'text', data: delta }
        }
      }

      yield { event: 'done' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      yield { event: 'error', data: message }
    }
  }
}

export function createExplainAgent(config: ExplainAgentConfig): ExplainAgent {
  return new ExplainAgent(config)
}
