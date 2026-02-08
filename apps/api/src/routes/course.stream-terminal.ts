const NON_TERMINAL_STREAM_END_STATUSES = new Set([
  'running',
  'generating_content',
])

export function shouldMarkThreadAsErrorAfterStreamEnd(
  status: string | null | undefined,
  observedTerminalEvent: boolean,
): boolean {
  if (observedTerminalEvent) return false
  return !!status && NON_TERMINAL_STREAM_END_STATUSES.has(status)
}

export function buildMissingTerminalEventErrorMessage(lastKnownStage: string): string {
  const stage = lastKnownStage?.trim() ? lastKnownStage : 'unknown'
  return `Course generation stream ended without a terminal event at stage "${stage}".`
}
