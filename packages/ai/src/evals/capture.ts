/**
 * Output Capture — Runs EditorDeep agent and collects all events
 *
 * Creates an isolated agent instance per test case, streams events,
 * and structures the output for evaluation.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { EditorDeepAgent } from '../agents/editor-deep/agent'
import type { EditorDeepAgentEvent } from '../agents/editor-deep/types'
import type {
  CapturedOutput,
  CaptureMetrics,
  ToolCallRecord,
  EditProposalRecord,
  ArtifactRecord,
  EvalTestCase,
} from './types'

export interface CaptureConfig {
  supabase: SupabaseClient
  userId: string
  model?: string
  timeoutMs?: number
}

export class OutputCapture {
  private config: CaptureConfig

  constructor(config: CaptureConfig) {
    this.config = config
  }

  async capture(testCase: EvalTestCase): Promise<CapturedOutput> {
    const startTime = Date.now()
    const events: EditorDeepAgentEvent[] = []
    const toolCalls: ToolCallRecord[] = []
    const editProposals: EditProposalRecord[] = []
    const artifacts: ArtifactRecord[] = []
    let finalText = ''
    let generatedContent = ''

    // Track tool call start times for duration measurement
    const toolCallStarts = new Map<string, number>()

    const agent = new EditorDeepAgent({
      supabase: this.config.supabase,
      userId: this.config.userId,
      model: this.config.model,
    })

    const threadId = `eval-${testCase.id}-${Date.now()}`

    try {
      const stream = agent.stream({
        message: testCase.prompt,
        threadId,
        context: {
          currentNoteId: testCase.context.currentNoteId,
          workspaceId: testCase.context.workspaceId,
          projectId: testCase.context.projectId,
          selectedText: testCase.context.selectedText,
          selectedBlockIds: testCase.context.selectedBlockIds,
        },
        historyWindowTurns: 0, // Isolated eval — no history
      })

      const timeoutMs = this.config.timeoutMs ?? 120_000

      for await (const event of this.withTimeout(stream, timeoutMs)) {
        events.push(event)

        switch (event.type) {
          case 'assistant-final':
            if (typeof event.data === 'string') {
              finalText = event.data
            }
            break

          case 'assistant-delta':
            if (typeof event.data === 'string') {
              finalText += event.data
            }
            break

          case 'tool-call': {
            const payload = event.data as {
              id?: string
              toolName?: string
              arguments?: Record<string, unknown>
            }
            if (payload?.id && payload?.toolName) {
              toolCallStarts.set(payload.id, Date.now())
              toolCalls.push({
                id: payload.id,
                toolName: payload.toolName,
                arguments: payload.arguments ?? {},
              })
            }
            break
          }

          case 'tool-result': {
            const payload = event.data as {
              id?: string
              toolName?: string
              result?: unknown
            }
            if (payload?.id) {
              const existing = toolCalls.find((tc) => tc.id === payload.id)
              if (existing) {
                existing.result = payload.result
                const startMs = toolCallStarts.get(payload.id)
                if (startMs) {
                  existing.durationMs = Date.now() - startMs
                }
              }
            }
            break
          }

          case 'edit-proposal': {
            const payload = event.data as {
              noteId?: string
              original?: string
              proposed?: string
              blockIndex?: number
            }
            if (payload?.proposed) {
              editProposals.push({
                noteId: payload.noteId,
                original: payload.original,
                proposed: payload.proposed,
                blockIndex: payload.blockIndex,
              })
              // Accumulate generated content from proposals
              generatedContent += (generatedContent ? '\n\n' : '') + payload.proposed
            }
            break
          }

          case 'artifact': {
            const payload = event.data as {
              id?: string
              title?: string
              html?: string
              css?: string
              javascript?: string
              type?: string
            }
            if (payload?.html) {
              artifacts.push({
                id: payload.id ?? crypto.randomUUID(),
                title: payload.title,
                html: payload.html,
                css: payload.css,
                javascript: payload.javascript,
                type: payload.type,
              })
            }
            break
          }

          case 'error': {
            // Capture error but don't crash the suite
            const errorMsg = typeof event.data === 'string' ? event.data : 'Unknown error'
            console.warn(`[OutputCapture] Error in test case ${testCase.id}: ${errorMsg}`)
            break
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[OutputCapture] Fatal error in test case ${testCase.id}: ${message}`)
      events.push({ type: 'error', data: message })
    }

    const latencyMs = Date.now() - startTime

    // If no explicit final text but we got content from proposals, use that
    if (!finalText && generatedContent) {
      finalText = generatedContent
    }

    const metrics: CaptureMetrics = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs,
      costCents: 0,
    }

    return {
      finalText,
      generatedContent: generatedContent || finalText,
      toolCalls,
      editProposals,
      artifacts,
      events,
      metrics,
    }
  }

  /**
   * Wraps an async generator with a timeout.
   * If the generator doesn't yield within timeoutMs, iteration stops.
   */
  private async *withTimeout<T>(
    generator: AsyncGenerator<T>,
    timeoutMs: number
  ): AsyncGenerator<T> {
    const deadline = Date.now() + timeoutMs

    while (true) {
      if (Date.now() > deadline) {
        console.warn(`[OutputCapture] Timeout after ${timeoutMs}ms`)
        return
      }

      const next = await Promise.race([
        generator.next(),
        new Promise<{ done: true; value: undefined }>((resolve) =>
          setTimeout(
            () => resolve({ done: true, value: undefined }),
            Math.max(0, deadline - Date.now())
          )
        ),
      ])

      if (next.done) return
      yield next.value
    }
  }
}
