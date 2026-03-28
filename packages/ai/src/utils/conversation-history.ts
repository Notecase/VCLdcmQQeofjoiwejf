/**
 * Shared conversation history windowing utilities.
 *
 * Extracted from EditorConversationHistoryService so Secretary, Research,
 * and EditorDeep agents can all share the same character-budgeted windowing
 * algorithm and deduplication logic.
 */

// ============================================================================
// Types
// ============================================================================

export interface ThreadMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface WindowOptions {
  maxTurns?: number
  maxChars?: number
}

// ============================================================================
// Windowing
// ============================================================================

/**
 * Window already-fetched message rows into a character-budgeted subset.
 *
 * Algorithm (newest-first):
 * 1. Filter: keep only user/assistant roles with non-empty trimmed content
 * 2. Sort: chronological (createdAt ascending)
 * 3. Slice: keep last (maxTurns * 2) messages
 * 4. Walk from end to start:
 *    - If adding this message exceeds maxChars AND we already have at least 1: stop
 *    - If first message exceeds maxChars: truncate content from start, keep it, stop
 *    - Otherwise: keep it, add its length to usedChars
 * 5. Reverse kept array -> chronological order
 */
export function windowMessages(
  messages: ThreadMessage[],
  options?: WindowOptions
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const maxTurns = Math.min(Math.max(options?.maxTurns ?? 20, 1), 50)
  const maxChars = Math.max(options?.maxChars ?? 16000, 1)
  const limit = maxTurns * 2

  const validMessages = messages
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => ({
      role: row.role,
      content: (row.content || '').trim(),
      createdAt: row.createdAt,
    }))
    .filter((row) => row.content.length > 0)

  if (validMessages.length === 0) return []

  const chronological = validMessages
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-limit)
    .map(({ role, content }) => ({ role, content }))

  // Deterministic newest-first windowing: keep newest messages that fit budget.
  const newestFirstKept: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let usedChars = 0

  for (let index = chronological.length - 1; index >= 0; index -= 1) {
    const message = chronological[index]
    const messageChars = message.content.length

    if (newestFirstKept.length > 0 && usedChars + messageChars > maxChars) {
      break
    }

    if (newestFirstKept.length === 0 && messageChars > maxChars) {
      newestFirstKept.push({
        role: message.role,
        content: message.content.slice(messageChars - maxChars),
      })
      usedChars = maxChars
      break
    }

    newestFirstKept.push(message)
    usedChars += messageChars
  }

  return newestFirstKept.reverse()
}

// ============================================================================
// Invocation message builder
// ============================================================================

/**
 * Build the final messages array for an AI SDK invocation.
 *
 * Appends `currentMessage` to windowed history, deduplicating if the current
 * message was already persisted as the last history entry (race where message
 * was saved before history query returned).
 */
export function buildInvocationMessages(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentMessage: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const cleanedHistory = history
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0)

  const currentNormalized = currentMessage.trim()
  if (!currentNormalized) return cleanedHistory

  const lastMessage = cleanedHistory[cleanedHistory.length - 1]
  const hasCurrentAlready =
    Boolean(lastMessage) && lastMessage.role === 'user' && lastMessage.content === currentNormalized

  if (hasCurrentAlready) {
    return cleanedHistory
  }

  return [...cleanedHistory, { role: 'user' as const, content: currentNormalized }]
}
