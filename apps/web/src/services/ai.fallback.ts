export function buildEmptyAssistantFallback(input: { hasCurrentNote: boolean }): string {
  if (input.hasCurrentNote) {
    return 'I could not produce a response from the current note yet. Try asking for a short summary or key points.'
  }
  return 'I need an open note to answer that. Please open a note or ask a general question.'
}
