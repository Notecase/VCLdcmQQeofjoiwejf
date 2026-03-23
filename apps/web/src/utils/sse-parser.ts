/**
 * Shared SSE (Server-Sent Events) stream parser.
 *
 * Extracts the duplicated pattern from ai.service, course.service,
 * and missions.service into a single utility.
 *
 * Handles: event:/id:/data: lines, multi-line data, heartbeats, [DONE].
 */

export interface SSEEvent {
  /** Event type from "event:" line or parsed envelope */
  event?: string
  /** Event ID from "id:" line */
  id?: string
  /** JSON-parsed payload from "data:" lines */
  data: unknown
  /** Raw data string before JSON parsing */
  raw: string
}

export interface ParseSSEOptions {
  /** Called for each parsed SSE event */
  onEvent: (event: SSEEvent) => void
  /** Called on JSON parse or stream errors */
  onError?: (error: Error) => void
  /** Called when the stream ends */
  onDone?: () => void
  /** AbortSignal for cancellation */
  signal?: AbortSignal
}

/**
 * Parse an SSE stream from a fetch Response.
 *
 * Reads the response body, splits into SSE frames, parses JSON data,
 * and dispatches to the onEvent callback.
 *
 * Handles:
 * - `event:` lines (optional event type)
 * - `id:` lines (optional event ID)
 * - `data:` lines (single or multi-line, JSON-parsed)
 * - Blank lines (flush pending event per SSE spec)
 * - `:` comments (ignored)
 * - `[DONE]` sentinel (skipped)
 * - Heartbeat events (skipped)
 */
export async function parseSSEStream(response: Response, options: ParseSSEOptions): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent: string | undefined
  let currentId: string | undefined
  let dataLines: string[] = []

  function flushPendingEvent() {
    if (dataLines.length === 0) {
      currentEvent = undefined
      currentId = undefined
      return
    }

    const raw = dataLines.join('\n').trim()
    dataLines = []

    if (!raw || raw === '[DONE]') {
      currentEvent = undefined
      currentId = undefined
      return
    }

    // Skip heartbeat events
    if (currentEvent === 'heartbeat') {
      currentEvent = undefined
      currentId = undefined
      return
    }

    try {
      const data = JSON.parse(raw)
      options.onEvent({
        event: currentEvent,
        id: currentId,
        data,
        raw,
      })
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error('Failed to parse SSE data'))
    }

    currentEvent = undefined
    currentId = undefined
  }

  try {
    while (true) {
      if (options.signal?.aborted) break

      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        // Blank line = end of event (SSE spec)
        if (!line.trim()) {
          flushPendingEvent()
          continue
        }

        // Comment line
        if (line.startsWith(':')) continue

        // Event type
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim() || undefined
          continue
        }

        // Event ID
        if (line.startsWith('id:')) {
          currentId = line.slice(3).trim() || undefined
          continue
        }

        // Data line — both "data: X" and "data:X" are valid SSE
        if (line.startsWith('data:')) {
          const content = line.startsWith('data: ') ? line.slice(6) : line.slice(5)
          if (content === '[DONE]') continue
          dataLines.push(content)
          continue
        }
      }
    }

    // Flush any remaining data (but don't push raw buffer — it may be a partial line)
    if (dataLines.length > 0) {
      flushPendingEvent()
    }
  } finally {
    reader.releaseLock()
    options.onDone?.()
  }
}
