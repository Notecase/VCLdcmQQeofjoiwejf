/**
 * Secretary Agent
 *
 * Main agent for the AI Secretary feature.
 * Uses the deepagents framework (LangGraph-based) with custom Supabase-backed memory tools.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type { SecretaryStreamEvent, RoadmapCandidate } from '@inkdown/shared/types'
import { getTodayDate, getTomorrowDate, getDayOfWeek } from '@inkdown/shared/secretary'
import { MemoryService, type MemoryContext } from './memory'
import { createSecretaryTools, getPendingRoadmap } from './tools'
import {
  getSecretarySystemPrompt,
  PLANNER_SUBAGENT_PROMPT,
  RESEARCHER_SUBAGENT_PROMPT,
} from './prompts'
import { SecretaryStreamNormalizer } from './stream-normalizer'

// ============================================================================
// Types
// ============================================================================

export interface SecretaryAgentConfig {
  supabase: SupabaseClient
  userId: string
  openaiApiKey: string
  model?: string
  timezone?: string
}

// ============================================================================
// Secretary Agent
// ============================================================================

export class SecretaryAgent {
  private memoryService: MemoryService
  private config: SecretaryAgentConfig

  constructor(config: SecretaryAgentConfig) {
    this.config = config
    this.memoryService = new MemoryService(config.supabase, config.userId)
  }

  /**
   * Stream a chat interaction with the secretary using the deepagents framework
   */
  async *stream(input: {
    message: string
    threadId?: string
  }): AsyncGenerator<SecretaryStreamEvent> {
    yield { event: 'thinking', data: 'Loading context...' }

    // Lazy import deepagents + LangChain to avoid top-level module issues
    const { createDeepAgent } = await import('deepagents')
    const { ChatOpenAI } = await import('@langchain/openai')

    const llm = new ChatOpenAI({
      openAIApiKey: this.config.openaiApiKey,
      modelName: this.config.model ?? 'gpt-4o-mini',
      temperature: 0.5,
    })

    // Resolve timezone: config (from API header) → preferences → default
    const context = await this.memoryService.getFullContext()
    const tz = this.config.timezone || context.preferences?.timezone || undefined

    const tools = createSecretaryTools(this.memoryService, {
      openaiApiKey: this.config.openaiApiKey,
      userId: this.config.userId,
      model: this.config.model,
      timezone: tz,
    })

    // Build system prompt with current date context
    const systemPrompt = getSecretarySystemPrompt({
      todayDate: getTodayDate(tz),
      tomorrowDate: getTomorrowDate(tz),
      dayOfWeek: getDayOfWeek(tz),
      timezone: tz,
    })

    // Build context summary (context already loaded above for timezone)
    const contextSummary = await this.buildContextSummary(context)

    // Include pending roadmap info if any
    const pending = getPendingRoadmap(this.config.userId)
    const pendingInfo = pending
      ? `\n\n### Pending Roadmap\nThere is a pending roadmap: [${pending.id}] ${pending.name} (${pending.durationDays} days). If the user confirms, call save_roadmap.`
      : ''

    const fullSystemPrompt = systemPrompt + '\n\n' + contextSummary + pendingInfo

    // Create the deepagents agent (returns a compiled ReactAgent)
    const agent = createDeepAgent({
      model: llm,
      systemPrompt: fullSystemPrompt,
      tools,
      subagents: [
        {
          name: 'planner',
          description: 'Creates detailed learning roadmaps with day-by-day topic breakdowns',
          systemPrompt: PLANNER_SUBAGENT_PROMPT,
        },
        {
          name: 'researcher',
          description:
            'Researches a subject to create a curriculum outline with prerequisites and progression',
          systemPrompt: RESEARCHER_SUBAGENT_PROMPT,
        },
      ],
    })

    const threadId = input.threadId || crypto.randomUUID()

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deepagents generic types are too deep for TS
      const streamResult = (await (agent as any).stream(
        { messages: [{ role: 'user', content: input.message }] },
        { configurable: { thread_id: threadId } }
      )) as AsyncIterable<Record<string, { messages?: unknown[] }>>

      const normalizer = new SecretaryStreamNormalizer()

      for await (const chunk of streamResult) {
        // deepagents uses standard LangGraph streaming format
        // chunk keys: 'agent', 'tools', or subagent names
        for (const [nodeKey, nodeValue] of Object.entries(chunk)) {
          const nodeData = nodeValue as { messages?: unknown[] }
          if (!nodeData?.messages) continue

          const messages = Array.isArray(nodeData.messages) ? nodeData.messages : []

          for (const msg of messages) {
            if (!msg || typeof msg !== 'object') continue

            const msgObj = msg as {
              id?: string
              content?: string | unknown[]
              tool_calls?: Array<{ name: string; args: Record<string, unknown> }>
              name?: string
              type?: string
            }

            if (nodeKey === 'tools' || msgObj.type === 'tool') {
              const toolEvents = normalizer.normalizeToolResult(nodeKey, msgObj)
              for (const event of toolEvents) {
                yield event
              }
            } else {
              const textEvents = normalizer.normalizeText(nodeKey, msgObj)
              for (const event of textEvents) {
                yield event
              }

              const toolCallEvents = normalizer.normalizeToolCalls(nodeKey, msgObj)
              for (const event of toolCallEvents) {
                yield event
              }
            }
          }
        }
      }

      yield normalizer.done()
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      yield { event: 'error', data: errorMsg }
    }
  }

  /**
   * Non-streaming chat
   */
  async chat(input: { message: string; threadId?: string }): Promise<string> {
    let fullResponse = ''
    for await (const event of this.stream(input)) {
      if (event.event === 'text') {
        fullResponse += event.data
      }
    }
    return fullResponse
  }

  /**
   * Get the memory service for direct operations
   */
  getMemoryService(): MemoryService {
    return this.memoryService
  }

  /**
   * Build a context summary from loaded memory
   */
  private async buildContextSummary(context: MemoryContext): Promise<string> {
    const parts: string[] = ['## Current Memory Context']

    if (context.activePlans.length > 0) {
      parts.push('\n### Active Plans')
      for (const plan of context.activePlans) {
        parts.push(
          `- [${plan.id}] ${plan.name} — Progress: ${plan.progress.currentDay}/${plan.progress.totalDays} days (${plan.progress.percentComplete}%)`
        )
        if (plan.currentTopic) {
          parts.push(`  Current: ${plan.currentTopic}`)
        }
      }
    } else {
      parts.push('\n### Active Plans\nNo active plans.')
    }

    if (context.preferences) {
      parts.push('\n### User Preferences')
      parts.push(
        `- Focus time: ${context.preferences.focusTime.bestStart} - ${context.preferences.focusTime.bestEnd}`
      )
      parts.push(
        `- Break: ${context.preferences.breakFrequency}min study / ${context.preferences.breakDuration}min break`
      )
      parts.push(
        `- Weekday hours: ${context.preferences.weekdayHours}h | Weekend: ${context.preferences.weekendHours}h`
      )
    }

    if (context.thisWeekSection) {
      parts.push(`\n### This Week\n${context.thisWeekSection}`)
    }

    if (context.todayContent.trim()) {
      parts.push(`\n### Today's Plan\n${context.todayContent.slice(0, 500)}`)
    }

    if (context.parserWarnings.length > 0) {
      parts.push('\n### Parse Warnings')
      for (const warning of context.parserWarnings.slice(0, 5)) {
        parts.push(`- [${warning.severity}] ${warning.message}`)
      }
    }

    if (context.activationSuggestion.action !== 'none') {
      parts.push('\n### Activation Suggestion')
      parts.push(`- ${context.activationSuggestion.reason}`)
      if (context.activationSuggestion.candidates.length > 0) {
        parts.push(
          `- Candidates: ${context.activationSuggestion.candidates.map((c: RoadmapCandidate) => `[${c.id}] ${c.name}`).join(', ')}`
        )
      }
    }

    // Recent performance analytics
    const analytics = await this.memoryService.getHistoryAnalytics()
    if (analytics.recentDays > 0) {
      parts.push('\n### Recent Performance (last 7 days)')
      parts.push(`- Completion rate: ${analytics.avgCompletionRate}%`)
      parts.push(`- Current streak: ${analytics.currentStreak} days`)
      if (analytics.moodTrend.length > 0) {
        parts.push(`- Mood trend: ${analytics.moodTrend.join(' → ')}`)
      }
      if (analytics.struggledTopics.length > 0) {
        parts.push(`- Struggled with: ${analytics.struggledTopics.join(', ')}`)
      }
      if (analytics.strongTopics.length > 0) {
        parts.push(`- Strong in: ${analytics.strongTopics.join(', ')}`)
      }
    }

    return parts.join('\n')
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createSecretaryAgent(config: SecretaryAgentConfig): SecretaryAgent {
  return new SecretaryAgent(config)
}
