/**
 * Structured AI Logger
 *
 * Lightweight structured JSON logger for AI system events.
 * Outputs JSON lines to stdout for easy parsing by log aggregators.
 */

export function aiLog(event: string, data: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...data,
    })
  )
}

/**
 * Log an AI safety event (injection detected, citation stripped, output sanitized, etc.)
 */
export function aiSafetyLog(subEvent: string, data: Record<string, unknown>): void {
  aiLog(`ai.safety.${subEvent}`, data)
}
