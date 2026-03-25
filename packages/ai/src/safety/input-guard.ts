/**
 * Input Guard — Prompt Injection Detection & Sanitization
 *
 * Detects common prompt injection patterns in user input and RAG-retrieved content.
 * Defense-in-depth: detect at input boundary, sanitize external content before LLM context.
 */

export interface InjectionDetectionResult {
  detected: boolean
  patterns: string[]
}

/**
 * Common prompt injection patterns (case-insensitive).
 * Each entry: [regex, label for logging].
 */
const INJECTION_PATTERNS: Array<[RegExp, string]> = [
  [/ignore\s+(all\s+)?previous\s+instructions/i, 'ignore-previous'],
  [/ignore\s+(all\s+)?above\s+instructions/i, 'ignore-above'],
  [/disregard\s+(all\s+)?previous/i, 'disregard-previous'],
  [/forget\s+(all\s+)?previous/i, 'forget-previous'],
  [/new\s+system\s+prompt/i, 'new-system-prompt'],
  [/\bSYSTEM\s*:/i, 'system-colon'],
  [/<\|endoftext\|>/i, 'endoftext-token'],
  [/<\|im_start\|>/i, 'im-start-token'],
  [/<\|im_end\|>/i, 'im-end-token'],
  [/```\s*(?:system|instructions|prompt)\b/i, 'code-fence-instructions'],
  [/\{\{.*\}\}/s, 'template-braces'],
  [/\$\{[^}]+\}/s, 'template-literal'],
  [/you\s+are\s+now\s+(?:a|an|in)\s+/i, 'role-override'],
  [/act\s+as\s+(?:a|an|if)\s+/i, 'act-as-override'],
  [/pretend\s+(?:you\s+are|to\s+be)\s+/i, 'pretend-override'],
]

/**
 * Detect potential prompt injection patterns in text.
 * Returns matched pattern labels for logging — does NOT hard-block.
 */
export function detectInjection(text: string): InjectionDetectionResult {
  if (!text || typeof text !== 'string') {
    return { detected: false, patterns: [] }
  }

  const matched: string[] = []
  for (const [regex, label] of INJECTION_PATTERNS) {
    if (regex.test(text)) {
      matched.push(label)
    }
  }

  return {
    detected: matched.length > 0,
    patterns: matched,
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
