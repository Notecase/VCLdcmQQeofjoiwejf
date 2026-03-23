import type { ResearchSource } from '@inkdown/shared/types'
import { AppError, ErrorCode } from '@inkdown/shared'
import type { DeepResearchConfig, DeepResearchResult } from './types'

const INTERACTIONS_BASE = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const DEFAULT_POLL_INTERVAL_MS = 5_000
const DEFAULT_MAX_POLLS = 120
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_MAX_CONSECUTIVE_POLL_ERRORS = 3

const COMPLETED_STATUSES = new Set([
  'completed',
  'complete',
  'succeeded',
  'success',
  'done',
  'finished',
])

const FAILED_STATUSES = new Set([
  'failed',
  'failure',
  'error',
  'errored',
  'cancelled',
  'canceled',
  'timed_out',
  'timeout',
])

interface InteractionGrounding {
  url?: string
  uri?: string
  sourceUri?: string
  title?: string
  sourceTitle?: string
}

interface InteractionOutput {
  text?: string
  content?: string | Array<{ text?: string } | string>
  groundings?: InteractionGrounding[]
  groundingChunks?: InteractionGrounding[]
}

interface InteractionResponse {
  id?: string
  status?: string
  outputs?: InteractionOutput[]
  content?: string
  error?: { message?: string } | string
}

function buildResearchPrompt(topic: string, focusAreas: string[]): string {
  const focusSection =
    focusAreas.length > 0 ? `\n\nFocus Areas:\n${focusAreas.map((a) => `- ${a}`).join('\n')}` : ''

  return `Conduct comprehensive deep research on the following topic for educational course creation.

Topic: ${topic}
${focusSection}

Please cover the following aspects thoroughly:

1. **Definitions & Core Concepts**: What is this topic? Define key terminology and foundational concepts.
2. **Historical Context & Evolution**: How has this field developed? Key milestones and breakthroughs.
3. **Current State**: Where does the field stand today? Latest developments and trends.
4. **Key Figures & Contributors**: Important researchers, practitioners, and organizations.
5. **Practical Applications**: Real-world uses, case studies, and industry applications.
6. **Common Misconceptions**: Frequently misunderstood aspects and corrections.
7. **Learning Prerequisites**: What should someone already know before studying this topic?
8. **Recommended Resources**: Books, papers, courses, and tools for further learning.
9. **Subtopics & Specializations**: Major branches and areas of specialization within this topic.
10. **Challenges & Open Problems**: Current limitations, debates, and unsolved questions.

Provide detailed, well-sourced information suitable for creating a structured educational course.`
}

function normalizeStatus(status: string | undefined): string {
  return (status ?? '').toLowerCase().trim()
}

function formatElapsedTime(startTimeMs: number): string {
  const elapsed = Math.round((Date.now() - startTimeMs) / 1000)
  const elapsedMin = Math.floor(elapsed / 60)
  const elapsedSec = elapsed % 60
  return elapsedMin > 0 ? `${elapsedMin}m ${elapsedSec}s` : `${elapsedSec}s`
}

function toGroundingSource(grounding: InteractionGrounding): ResearchSource | null {
  const url = grounding.url ?? grounding.uri ?? grounding.sourceUri
  if (!url) return null
  return {
    url,
    title: grounding.title ?? grounding.sourceTitle ?? url,
    status: 'done',
  }
}

function extractSources(interaction: InteractionResponse): ResearchSource[] {
  const sources: ResearchSource[] = []
  const seen = new Set<string>()

  const outputs = interaction.outputs ?? []

  for (const output of outputs) {
    const allGroundings = [...(output.groundings ?? []), ...(output.groundingChunks ?? [])]
    for (const grounding of allGroundings) {
      const source = toGroundingSource(grounding)
      if (!source || seen.has(source.url)) continue
      seen.add(source.url)
      sources.push(source)
    }
  }

  return sources
}

function extractOutputText(output: InteractionOutput): string[] {
  const textParts: string[] = []
  if (typeof output.text === 'string' && output.text.trim()) {
    textParts.push(output.text)
  }
  if (typeof output.content === 'string' && output.content.trim()) {
    textParts.push(output.content)
  } else if (Array.isArray(output.content)) {
    for (const part of output.content) {
      if (typeof part === 'string') {
        if (part.trim()) textParts.push(part)
      } else if (part && typeof part.text === 'string' && part.text.trim()) {
        textParts.push(part.text)
      }
    }
  }
  return textParts
}

function extractReport(interaction: InteractionResponse): string | null {
  const textParts: string[] = []
  for (const output of interaction.outputs ?? []) {
    textParts.push(...extractOutputText(output))
  }

  if (typeof interaction.content === 'string' && interaction.content.trim()) {
    textParts.push(interaction.content)
  }

  return textParts.length > 0 ? textParts.join('\n\n') : null
}

function buildFallbackReportFromSources(sources: ResearchSource[]): string | null {
  if (sources.length === 0) return null
  const topSources = sources.slice(0, 20)
  return [
    'Deep research completed and sources were collected, but the provider returned no synthesized report text.',
    '',
    'Collected sources:',
    ...topSources.map((source) => `- ${source.title}: ${source.url}`),
  ].join('\n')
}

function getInteractionError(interaction: InteractionResponse): string | null {
  if (!interaction.error) return null
  if (typeof interaction.error === 'string') return interaction.error
  if (typeof interaction.error.message === 'string' && interaction.error.message.trim()) {
    return interaction.error.message
  }
  return null
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'AbortError'
  )
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  context: Record<string, unknown>
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (isAbortError(error)) {
      throw new AppError(
        `Request timed out after ${timeoutMs}ms`,
        ErrorCode.TIMEOUT,
        'Deep research request timed out. Retrying...',
        context
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function startInteraction(
  prompt: string,
  apiKey: string,
  requestTimeoutMs: number
): Promise<string> {
  const url = `${INTERACTIONS_BASE}?key=${apiKey}`
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: prompt,
        agent: 'deep-research-pro-preview-12-2025',
        background: true,
      }),
    },
    requestTimeoutMs,
    { phase: 'startInteraction' }
  )

  if (!response.ok) {
    const errorBody = await response.text()
    throw new AppError(
      `Failed to start deep research interaction: ${response.status} ${errorBody}`,
      ErrorCode.AI_PROVIDER_ERROR,
      'Failed to start research. Please check your Gemini API key.',
      { status: response.status, body: errorBody }
    )
  }

  const data = (await response.json()) as InteractionResponse
  if (!data.id) {
    throw new AppError(
      'Deep research interaction response missing id',
      ErrorCode.AI_PROVIDER_ERROR,
      'Received invalid response from research service.'
    )
  }

  return data.id
}

async function pollInteraction(
  interactionId: string,
  apiKey: string,
  requestTimeoutMs: number
): Promise<InteractionResponse> {
  const url = `${INTERACTIONS_BASE}/${interactionId}?key=${apiKey}`
  const response = await fetchWithTimeout(url, {}, requestTimeoutMs, {
    phase: 'pollInteraction',
    interactionId,
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new AppError(
      `Failed to poll deep research interaction: ${response.status} ${errorBody}`,
      ErrorCode.AI_PROVIDER_ERROR,
      'Failed to check research status.',
      { interactionId, status: response.status }
    )
  }

  return (await response.json()) as InteractionResponse
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runDeepResearch(
  topic: string,
  focusAreas: string[],
  config: DeepResearchConfig
): Promise<DeepResearchResult> {
  const {
    geminiApiKey: _geminiApiKey,
    onProgress,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxPolls = DEFAULT_MAX_POLLS,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    maxConsecutivePollErrors = DEFAULT_MAX_CONSECUTIVE_POLL_ERRORS,
  } = config

  const geminiApiKey =
    _geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || ''

  // Notify: starting
  onProgress?.({
    status: 'starting',
    progress: 0,
    thinking: `Initiating deep research on "${topic}"...`,
    sources: [],
    partialReport: null,
  })

  let interactionId: string
  try {
    const prompt = buildResearchPrompt(topic, focusAreas)
    interactionId = await startInteraction(prompt, geminiApiKey, requestTimeoutMs)
  } catch (error: unknown) {
    const message = error instanceof AppError ? error.message : String(error)
    onProgress?.({
      status: 'failed',
      progress: 0,
      thinking: `Research failed to start: ${message}`,
      sources: [],
      partialReport: null,
    })
    return { success: false, report: null, sources: [], error: message }
  }

  // Notify: researching
  onProgress?.({
    status: 'researching',
    progress: 5,
    thinking: 'Deep research agent is gathering and analyzing sources...',
    sources: [],
    partialReport: null,
  })

  // Poll for completion
  const startTime = Date.now()
  let latestSources: ResearchSource[] = []
  let latestReport: string | null = null
  let consecutivePollErrors = 0

  for (let poll = 0; poll < maxPolls; poll++) {
    await sleep(pollIntervalMs)
    const progressPercent = Math.min(5 + Math.floor((poll / maxPolls) * 90), 95)

    let interaction: InteractionResponse
    try {
      interaction = await pollInteraction(interactionId, geminiApiKey, requestTimeoutMs)
      consecutivePollErrors = 0
    } catch (error: unknown) {
      const message = error instanceof AppError ? error.message : String(error)
      consecutivePollErrors++
      const timeStr = formatElapsedTime(startTime)
      if (consecutivePollErrors >= maxConsecutivePollErrors) {
        const errorMsg = `Deep research polling failed repeatedly (${consecutivePollErrors}x): ${message}`
        onProgress?.({
          status: 'failed',
          progress: 0,
          thinking: errorMsg,
          sources: latestSources,
          partialReport: latestReport,
        })
        return { success: false, report: null, sources: latestSources, error: errorMsg }
      }

      onProgress?.({
        status: 'researching',
        progress: progressPercent,
        thinking: `Research status check timed out/interrupted. Retrying... (${timeStr} elapsed)`,
        sources: latestSources,
        partialReport: latestReport,
      })
      continue
    }

    const sources = extractSources(interaction)
    if (sources.length > 0) latestSources = sources
    const report = extractReport(interaction)
    if (report) latestReport = report
    const status = normalizeStatus(interaction.status)

    if (COMPLETED_STATUSES.has(status)) {
      const finalReport = latestReport ?? buildFallbackReportFromSources(latestSources)
      if (!finalReport) {
        const errorMsg = 'Deep research completed without returning report text or sources.'
        onProgress?.({
          status: 'failed',
          progress: 0,
          thinking: errorMsg,
          sources: latestSources,
          partialReport: null,
        })
        return { success: false, report: null, sources: latestSources, error: errorMsg }
      }

      onProgress?.({
        status: 'complete',
        progress: 100,
        thinking: 'Research complete.',
        sources: latestSources,
        partialReport: finalReport,
      })

      return { success: true, report: finalReport, sources: latestSources }
    }

    if (FAILED_STATUSES.has(status)) {
      const errorMsg = getInteractionError(interaction) ?? 'Deep research interaction failed'
      onProgress?.({
        status: 'failed',
        progress: 0,
        thinking: errorMsg,
        sources: latestSources,
        partialReport: latestReport,
      })
      return { success: false, report: null, sources: latestSources, error: errorMsg }
    }

    // Build elapsed-time string for user feedback
    const timeStr = formatElapsedTime(startTime)

    // Determine sub-status for progress
    const isWriting = latestSources.length > 3 && progressPercent > 50
    let thinking: string
    if (isWriting) {
      thinking = `Synthesizing findings from ${latestSources.length} sources... (${timeStr} elapsed)`
    } else if (latestSources.length > 0) {
      thinking = `Researching... ${latestSources.length} sources found (${timeStr} elapsed)`
    } else {
      thinking = `Deep research agent is analyzing sources... (${timeStr} elapsed, typically takes 5-10 minutes)`
    }

    onProgress?.({
      status: isWriting ? 'writing' : 'researching',
      progress: progressPercent,
      thinking,
      sources: latestSources,
      partialReport: latestReport,
    })
  }

  // Timed out
  const timeoutMsg = `Deep research timed out after ${(maxPolls * pollIntervalMs) / 1000}s`
  onProgress?.({
    status: 'failed',
    progress: 0,
    thinking: timeoutMsg,
    sources: latestSources,
    partialReport: latestReport,
  })

  return { success: false, report: null, sources: latestSources, error: timeoutMsg }
}
