/**
 * Input Guard — Prompt Injection Detection & Sanitization
 *
 * Detects common prompt injection patterns in user input and RAG-retrieved content.
 * Defense-in-depth: detect at input boundary, sanitize external content before LLM context.
 */

export interface InjectionDetectionResult {
  detected: boolean
  /** All matched pattern labels */
  patterns: string[]
  /** True if any HIGH confidence pattern matched — caller should block the request */
  shouldBlock: boolean
  /** Only the high-confidence pattern labels that triggered blocking */
  blockingPatterns: string[]
}

type Confidence = 'high' | 'low'

/**
 * Common prompt injection patterns (case-insensitive).
 * Each entry: [regex, label, confidence].
 *
 * HIGH confidence: clearly adversarial, unlikely to appear in legitimate input.
 * LOW confidence: could appear in code discussion or creative writing — log only.
 */
const INJECTION_PATTERNS: Array<[RegExp, string, Confidence]> = [
  // HIGH — classic instruction override attacks
  [/ignore\s+(all\s+)?previous\s+instructions/i, 'ignore-previous', 'high'],
  [/ignore\s+(all\s+)?above\s+instructions/i, 'ignore-above', 'high'],
  [/disregard\s+(all\s+)?previous/i, 'disregard-previous', 'high'],
  [/forget\s+(all\s+)?previous/i, 'forget-previous', 'high'],
  [/new\s+system\s+prompt/i, 'new-system-prompt', 'high'],
  // HIGH — model token manipulation
  [/<\|endoftext\|>/i, 'endoftext-token', 'high'],
  [/<\|im_start\|>/i, 'im-start-token', 'high'],
  [/<\|im_end\|>/i, 'im-end-token', 'high'],
  // HIGH — instruction injection via code fence
  [/```\s*(?:system|instructions|prompt)\b/i, 'code-fence-instructions', 'high'],
  // LOW — could be legitimate code or creative writing
  [/\bSYSTEM\s*:/i, 'system-colon', 'low'],
  [/\{\{.*\}\}/s, 'template-braces', 'low'],
  [/\$\{[^}]+\}/s, 'template-literal', 'low'],
  [/you\s+are\s+now\s+(?:a|an|in)\s+/i, 'role-override', 'low'],
  [/act\s+as\s+(?:a|an|if)\s+/i, 'act-as-override', 'low'],
  [/pretend\s+(?:you\s+are|to\s+be)\s+/i, 'pretend-override', 'low'],
]

/**
 * Detect potential prompt injection patterns in text.
 * Returns matched patterns and whether the request should be blocked.
 */
export function detectInjection(text: string): InjectionDetectionResult {
  if (!text || typeof text !== 'string') {
    return { detected: false, patterns: [], shouldBlock: false, blockingPatterns: [] }
  }

  const matched: string[] = []
  const blockingPatterns: string[] = []

  for (const [regex, label, confidence] of INJECTION_PATTERNS) {
    if (regex.test(text)) {
      matched.push(label)
      if (confidence === 'high') {
        blockingPatterns.push(label)
      }
    }
  }

  return {
    detected: matched.length > 0,
    patterns: matched,
    shouldBlock: blockingPatterns.length > 0,
    blockingPatterns,
  }
}

/**
 * Wrap external content (RAG chunks, web results) in safe delimiters.
 * Prevents LLM from interpreting external content as instructions.
 */
export function sanitizeForLLM(text: string, source: string = 'external'): string {
  if (!text) return ''

  // Strip known dangerous tokens
  const cleaned = text
    .replace(/<\|endoftext\|>/gi, '')
    .replace(/<\|im_start\|>/gi, '')
    .replace(/<\|im_end\|>/gi, '')

  // Wrap in safe delimiters
  return `<${source}_content>\n${cleaned}\n</${source}_content>`
}

export interface WebSearchResult {
  title: string
  url: string
  content: string
  publishedDate?: string
}

/**
 * Sanitize web search results before passing to LLM context.
 * Strips HTML, injection patterns, and wraps in safe delimiters.
 */
export function sanitizeWebContent(results: WebSearchResult[]): WebSearchResult[] {
  return results.map((result) => ({
    ...result,
    title: stripHtml(result.title),
    content: stripHtml(result.content)
      .replace(/<\|endoftext\|>/gi, '')
      .replace(/<\|im_start\|>/gi, '')
      .replace(/<\|im_end\|>/gi, ''),
  }))
}

/** Strip HTML tags from a string */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '')
}
