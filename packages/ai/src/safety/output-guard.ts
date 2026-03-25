/**
 * Output Guard — LLM Output Sanitization
 *
 * Sanitizes LLM responses before they reach the frontend.
 * Strips XSS vectors, potential prompt leakage, and accidental secret exposure.
 */

/**
 * Patterns that indicate system prompt leakage.
 * These are agent-internal terms that should never appear in user-facing output.
 */
const PROMPT_LEAKAGE_PATTERNS = [
  /\bYOU ARE THE DEEP EDITOR AGENT\b/i,
  /\bYOUR TOOLS\s*\(\d+ tools in \d+ groups\)/i,
  /\bCRITICAL RULES\b[\s\S]{0,50}\bRead before editing/i,
  /\bCONTENT_POLICY_DIRECTIVE\b/,
  /\bHONESTY_POLICY\b/,
  /\bsanitizeWebContent\b/,
  /\bdetectInjection\b/,
]

/**
 * Patterns matching potential API keys / secrets.
 * Redacts them to prevent accidental exposure in chat.
 */
const SECRET_PATTERNS = [
  /\bsk-[a-zA-Z0-9]{20,}/g, // OpenAI-style keys
  /\bghp_[a-zA-Z0-9]{36,}/g, // GitHub PATs
  /\bAIza[a-zA-Z0-9_-]{35}/g, // Google API keys
  /\bxoxb-[a-zA-Z0-9-]+/g, // Slack bot tokens
  /\btvly-[a-zA-Z0-9]{20,}/g, // Tavily keys
]

/**
 * Sanitize LLM output text.
 * - Strips dangerous HTML tags (XSS vectors)
 * - Strips javascript: URLs
 * - Detects and redacts potential API keys
 * - Detects system prompt leakage markers
 *
 * Returns the sanitized text and metadata about what was stripped.
 */
export function sanitizeOutput(text: string): { text: string; stripped: string[] } {
  if (!text || typeof text !== 'string') {
    return { text: text ?? '', stripped: [] }
  }

  const stripped: string[] = []
  let result = text

  // Helper: test-and-replace without lastIndex bug (regex /g + .test() advances lastIndex)
  function stripPattern(pattern: RegExp, label: string) {
    const replaced = result.replace(pattern, '')
    if (replaced !== result) {
      stripped.push(label)
      result = replaced
    }
  }

  // Strip dangerous HTML tags
  stripPattern(
    /<\s*(script|iframe|object|embed|form|meta|link)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
    'dangerous-html-tags'
  )

  // Strip self-closing dangerous tags
  stripPattern(
    /<\s*(script|iframe|object|embed|meta|link)\b[^>]*\/?>/gi,
    'self-closing-dangerous-tags'
  )

  // Strip javascript: URLs
  stripPattern(/javascript\s*:/gi, 'javascript-urls')

  // Strip on* event handlers in any remaining HTML-like content
  stripPattern(/\bon\w+\s*=\s*["'][^"']*["']/gi, 'event-handlers')

  // Redact potential API keys / secrets
  for (const pattern of SECRET_PATTERNS) {
    const replaced = result.replace(new RegExp(pattern.source, pattern.flags), '[REDACTED]')
    if (replaced !== result) {
      stripped.push('potential-secret')
      result = replaced
    }
  }

  // Check for prompt leakage (log but don't strip — these are informational)
  for (const pattern of PROMPT_LEAKAGE_PATTERNS) {
    if (pattern.test(result)) {
      stripped.push('prompt-leakage-detected')
      break // One flag is enough
    }
  }

  return { text: result, stripped }
}
