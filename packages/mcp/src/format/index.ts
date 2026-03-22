/**
 * Shared Formatting Utilities
 */

/**
 * MCP tool result shape — compatible with SDK's CallToolResult
 */
export interface ToolResult {
  [x: string]: unknown
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/**
 * Wrap text in a successful MCP tool result.
 */
export function ok(text: string): ToolResult {
  return { content: [{ type: 'text', text }] }
}

/**
 * Wrap an error message in an MCP tool result.
 */
export function err(message: string): ToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
}

/**
 * Relative time string (e.g. "2h ago", "3d ago").
 */
export function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  const diffMon = Math.floor(diffDay / 30)
  return `${diffMon}mo ago`
}

/**
 * Truncate text to a max length, appending "..." if truncated.
 */
export function truncate(text: string, maxLen = 200): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}

/**
 * Format a number with commas (e.g. 1,247).
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}
