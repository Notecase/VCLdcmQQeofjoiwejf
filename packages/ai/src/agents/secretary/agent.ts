/**
 * Secretary Agent
 *
 * Main agent for the AI Secretary feature.
 * Uses AI SDK v6 ToolLoopAgent with 15 tools backed by Supabase memory.
 */

import { ToolLoopAgent, stepCountIs } from 'ai'
import { SupabaseClient } from '@supabase/supabase-js'
import type { SecretaryStreamEvent, RoadmapCandidate } from '@inkdown/shared/types'
import { getTodayDate, getTomorrowDate, getDayOfWeek } from '@inkdown/shared/secretary'
import { MemoryService, type MemoryContext } from './memory'
import { createSecretaryTools, getPendingRoadmap } from './tools'
import { getSecretarySystemPrompt } from './prompts'
import { adaptSecretaryStream } from './ai-sdk-stream-adapter'
import { getModelsForTask } from '../../providers/ai-sdk-factory'
import { trackAISDKUsage } from '../../providers/ai-sdk-usage'
import { getGoogleProviderOptions } from '../../providers/safety'
import { buildSystemPrompt } from '../../safety/content-policy'
import type { SharedContextService } from '../../services/shared-context.service'

// ============================================================================
// Types
// ============================================================================

export interface SecretaryAgentConfig {
  supabase: SupabaseClient
  userId: string
  model?: string
  timezone?: string
  sharedContextService?: SharedContextService
  emitEvent?: (event: { type: string; data: unknown }) => void
}

// ============================================================================
// Secretary Agent
// ============================================================================

export class SecretaryAgent {
  private memoryService: MemoryService
  private config: SecretaryAgentConfig

  constructor(config: SecretaryAgentConfig) {
    this.config = config
    this.memoryService = new MemoryService(config.supabase, config.userId, config.timezone)
  }

  /**
   * Stream a chat interaction with the secretary using AI SDK v6 ToolLoopAgent
   */
  async *stream(input: {
    message: string
    threadId?: string
  }): AsyncGenerator<SecretaryStreamEvent> {
    yield { event: 'thinking', data: 'Loading your plans, preferences, and schedule...' }

    // Resolve timezone: config (from API header) → preferences → default
    const context = await this.memoryService.getFullContext()
    const tz = this.config.timezone || context.preferences?.timezone || undefined

    // pendingEvents buffer — delegation tools push progress events here,
    // adaptSecretaryStream drains them into the SSE output.
    const pendingEvents: SecretaryStreamEvent[] = []

    const tools = createSecretaryTools(this.memoryService, {
      userId: this.config.userId,
      supabase: this.config.supabase,
      model: this.config.model,
      timezone: tz,
      emitEvent: (evt) => {
        pendingEvents.push({
          event: evt.type as SecretaryStreamEvent['event'],
          data: typeof evt.data === 'string' ? evt.data : JSON.stringify(evt.data),
        })
      },
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

    // Read cross-agent context (research, courses, notes)
    const sharedCtx = this.config.sharedContextService
      ? await this.config.sharedContextService.read({
          relevantTypes: ['research_done', 'course_saved', 'note_created', 'goal_set'],
        })
      : ''
    const sharedCtxSection = sharedCtx ? '\n\n' + sharedCtx : ''

    const contextParts: string[] = []
    if (context.activePlans?.length)
      contextParts.push(
        `${context.activePlans.length} active plan${context.activePlans.length > 1 ? 's' : ''}`
      )
    if (context.calendarContent?.trim()) contextParts.push('calendar events')
    yield {
      event: 'thinking',
      data: contextParts.length ? `Found ${contextParts.join(', ')}` : 'Ready',
    }

    const fullSystemPrompt = buildSystemPrompt(
      systemPrompt + '\n\n' + contextSummary + pendingInfo + sharedCtxSection
    )

    const threadId = input.threadId || crypto.randomUUID()

    // Get primary + fallback models
    const { primary, fallback } = getModelsForTask('secretary')

    try {
      yield { event: 'thread-id', data: threadId }

      // Detect plan/roadmap tool calls for shared context writes
      const detectedContextWrites: Array<{
        type: 'active_plan'
        summary: string
        payload: Record<string, unknown>
      }> = []

      // Try primary model, fall back on transient errors (rate limit, high demand)
      let streamed = false
      for (const modelOption of [primary, fallback]) {
        if (!modelOption) continue
        if (streamed) break

        const agent = new ToolLoopAgent({
          model: modelOption.model,
          instructions: fullSystemPrompt,
          tools,
          stopWhen: stepCountIs(20),
          providerOptions: getGoogleProviderOptions(),
          onFinish: trackAISDKUsage({ model: modelOption.entry.id, taskType: 'secretary' }),
        })

        try {
          const result = await agent.stream({
            messages: [{ role: 'user', content: input.message }],
          })

          for await (const event of adaptSecretaryStream(result.fullStream, pendingEvents)) {
            // Track tool calls for shared context
            if (
              event.event === 'tool_call' &&
              this.config.sharedContextService &&
              typeof event.data === 'string'
            ) {
              try {
                const tc = JSON.parse(event.data) as {
                  toolName: string
                  arguments: Record<string, unknown>
                }
                if (
                  tc.toolName === 'save_roadmap' ||
                  tc.toolName === 'generate_daily_plan' ||
                  tc.toolName === 'mark_day_complete'
                ) {
                  detectedContextWrites.push({
                    type: 'active_plan',
                    summary: `Secretary: ${tc.toolName}`,
                    payload: { threadId, tool: tc.toolName, args: tc.arguments },
                  })
                }
              } catch {
                // Ignore JSON parse errors
              }
            }

            yield event
          }

          streamed = true
        } catch (modelError) {
          const msg = modelError instanceof Error ? modelError.message : String(modelError)
          const isTransient =
            msg.includes('high demand') ||
            msg.includes('rate limit') ||
            msg.includes('overloaded') ||
            msg.includes('503') ||
            msg.includes('429')

          if (isTransient && modelOption === primary && fallback) {
            console.warn(
              `secretary.agent.fallback`,
              `${modelOption.entry.id} unavailable, trying ${fallback.entry.id}:`,
              msg
            )
            yield { event: 'thinking', data: `Switching to ${fallback.entry.displayName}...` }
            continue
          }

          // Non-transient error or no fallback — propagate
          throw modelError
        }
      }

      // Write detected context entries to shared bus
      if (this.config.sharedContextService && detectedContextWrites.length > 0) {
        for (const entry of detectedContextWrites) {
          await this.config.sharedContextService.write({
            agent: 'secretary',
            ...entry,
          })
        }
      }
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

    if (context.inboxContent?.trim()) {
      const lineCount = context.inboxContent.split('\n').filter((l) => l.startsWith('- ')).length
      parts.push(
        `\n### Inbox (${lineCount} unprocessed captures)\n${context.inboxContent.slice(0, 500)}`
      )
    }

    if (context.calendarContent?.trim()) {
      parts.push(
        `\n### Calendar (synced from Google Calendar)\n${context.calendarContent.slice(0, 800)}`
      )
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
