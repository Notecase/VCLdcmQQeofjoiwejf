/**
 * Intent Detection Utilities
 *
 * Shared helper functions for detecting user intent patterns
 * across different agents (Secretary, DeepAgent, etc.)
 */

/**
 * Detect if the message is asking to CREATE a new note
 * vs editing an existing one.
 *
 * Returns true when:
 * 1. Explicit "new note" language ("create a new note about X") - always creates
 * 2. Generic create language ("create a note") - only when no note is open
 */
export function isCreateOperation(message: string, hasNoteId: boolean): boolean {
  const lower = message.toLowerCase()

  // Pattern 1: Explicit "NEW note" language - ALWAYS create new note
  // "create a NEW note about X", "make a new note"
  // This takes priority regardless of whether a note is currently open
  const explicitNewNotePatterns = [
    /\b(create|make|write|start)\s+(a\s+)?new\s+note\b/i,
    /\bnew\s+note\s+(about|on|for|regarding)\b/i,
  ]

  if (explicitNewNotePatterns.some((p) => p.test(lower))) {
    return true // Create new note even if one is already open
  }

  // Pattern 2: Generic create language - only if no note is open
  if (!hasNoteId) {
    const createPatterns = [
      /\b(create|make|write|start|begin)\s+(a\s+)?note\b/i,
      /\btake\s+notes?\s+(on|about)\b/i,
      /\bjot\s+down\b/i,
    ]

    if (createPatterns.some((p) => p.test(lower))) {
      return true
    }

    // "write about X" or "make notes on X" without existing note
    if (/\b(write|document|record)\s+(about|on|regarding)\s+\w+/i.test(lower)) {
      return true
    }
  }

  return false
}
