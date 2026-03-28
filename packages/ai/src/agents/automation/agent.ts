/**
 * Automation Agent
 *
 * ToolLoopAgent that generates plan content with web search, note creation,
 * and progress tracking. Supports both non-streaming (cron) and streaming (Run Now) modes.
 */

import { ToolLoopAgent, stepCountIs } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LearningRoadmap } from '@inkdown/shared/types'

import { resolveModelsForTask, isTransientError } from '../../providers/ai-sdk-factory'
import { recordAISDKUsage, trackAISDKUsage } from '../../providers/ai-sdk-usage'
import { getGoogleProviderOptions } from '../../providers/safety'
import { buildSystemPrompt } from '../../safety/content-policy'
import { buildAutomationContext, type AutomationContextInput } from './context'
import { createAutomationTools, type AutomationToolResult } from './tools'

export interface AutomationInput {
  plan: LearningRoadmap
  instructions: string
  roadmapContent: string
  previousNotes: Array<{ title: string; updatedAt: string }>
  scheduleTitle: string
  scheduleInstructions?: string
  projectId?: string
  supabase: SupabaseClient
  userId: string
}

export interface AutomationResult {
  noteId?: string
  noteTitle?: string
  advancedProgress: boolean
  error?: string
}

export type AutomationEvent =
  | { type: 'status'; data: { step: string } }
  | { type: 'tool-call'; data: { name: string; query?: string } }
  | { type: 'tool-result'; data: { name: string; summary: string } }
  | { type: 'done'; data: AutomationResult }
  | { type: 'error'; data: { message: string } }

function buildAgent(input: AutomationInput) {
  const contextInput: AutomationContextInput = {
    plan: input.plan,
    instructions: input.instructions,
    roadmapContent: input.roadmapContent,
    previousNotes: input.previousNotes,
    scheduleTitle: input.scheduleTitle,
    scheduleInstructions: input.scheduleInstructions,
  }

  const { systemPrompt, taskPrompt } = buildAutomationContext(contextInput)

  const toolResult: AutomationToolResult = { advancedProgress: false }

  const tools = createAutomationTools(
    {
      supabase: input.supabase,
      userId: input.userId,
      planId: input.plan.id,
      projectId: input.projectId,
    },
    toolResult
  )

  const { primary, fallback } = resolveModelsForTask('note-agent')

  return { systemPrompt, taskPrompt, toolResult, tools, primary, fallback }
}

/**
 * Run the automation agent (non-streaming, for cron/background execution).
 */
export async function runAutomation(input: AutomationInput): Promise<AutomationResult> {
  const { systemPrompt, taskPrompt, toolResult, tools, primary, fallback } = buildAgent(input)

  const models = [primary, fallback].filter(Boolean) as Array<{
    model: import('ai').LanguageModel
    entry: { id: string }
  }>

  for (const modelOption of models) {
    try {
      const startTime = Date.now()

      const agent = new ToolLoopAgent({
        model: modelOption.model,
        instructions: buildSystemPrompt(systemPrompt),
        tools,
        temperature: 0.5,
        stopWhen: stepCountIs(12),
        providerOptions: getGoogleProviderOptions(),
      })

      const result = await agent.generate({
        messages: [{ role: 'user', content: taskPrompt }],
      })

      recordAISDKUsage(
        result.usage,
        { model: modelOption.entry.id, taskType: 'note-agent' },
        startTime
      )

      return {
        noteId: toolResult.noteId,
        noteTitle: toolResult.noteTitle,
        advancedProgress: toolResult.advancedProgress,
      }
    } catch (err) {
      if (isTransientError(err) && modelOption === primary && fallback) {
        console.warn(
          `[automation] ${modelOption.entry.id} unavailable, falling back to ${fallback.entry.id}`
        )
        continue
      }
      return {
        advancedProgress: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  return {
    advancedProgress: false,
    error: 'All models unavailable for automation',
  }
}

function truncateToolOutput(output: unknown, maxLen = 80): string {
  const str = typeof output === 'string' ? output : JSON.stringify(output)
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str
}

/**
 * Stream the automation agent (for "Run Now" with live progress).
 * Yields events as the agent works: status, tool-call, tool-result, done/error.
 */
export async function* streamAutomation(input: AutomationInput): AsyncGenerator<AutomationEvent> {
  yield { type: 'status', data: { step: 'Assembling context...' } }

  const { systemPrompt, taskPrompt, toolResult, tools, primary, fallback } = buildAgent(input)

  const models = [primary, fallback].filter(Boolean) as Array<{
    model: import('ai').LanguageModel
    entry: { id: string }
  }>

  yield { type: 'status', data: { step: 'Starting automation agent...' } }

  for (const modelOption of models) {
    try {
      const agent = new ToolLoopAgent({
        model: modelOption.model,
        instructions: buildSystemPrompt(systemPrompt),
        tools,
        temperature: 0.5,
        stopWhen: stepCountIs(12),
        providerOptions: getGoogleProviderOptions(),
        onFinish: trackAISDKUsage({ model: modelOption.entry.id, taskType: 'note-agent' }),
      })

      const result = await agent.stream({
        messages: [{ role: 'user', content: taskPrompt }],
      })

      for await (const part of result.fullStream) {
        if (part.type === 'tool-call') {
          const query = (part.input as Record<string, unknown>)?.query as string | undefined
          yield {
            type: 'tool-call',
            data: { name: part.toolName, query },
          }
        } else if (part.type === 'tool-result') {
          yield {
            type: 'tool-result',
            data: { name: part.toolName, summary: truncateToolOutput(part.output) },
          }
        }
      }

      yield {
        type: 'done',
        data: {
          noteId: toolResult.noteId,
          noteTitle: toolResult.noteTitle,
          advancedProgress: toolResult.advancedProgress,
        },
      }
      return
    } catch (err) {
      if (isTransientError(err) && modelOption === primary && fallback) {
        console.warn(
          `[automation] ${modelOption.entry.id} unavailable, falling back to ${fallback.entry.id}`
        )
        yield { type: 'status', data: { step: 'Switching to fallback model...' } }
        continue
      }
      yield {
        type: 'error',
        data: { message: err instanceof Error ? err.message : String(err) },
      }
      return
    }
  }

  yield { type: 'error', data: { message: 'All models unavailable for automation' } }
}
