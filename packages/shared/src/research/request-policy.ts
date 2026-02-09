export type RequestOutputPreference = 'chat' | 'md_file' | 'note'
export type RequestPolicyMode = 'chat' | 'note' | 'research' | 'markdown'

const CHAT_OVERRIDE_PATTERNS: RegExp[] = [
  /\b(in chat|chat only|reply here)\b/i,
  /\b(do not|don't|no)\b[\s\S]{0,30}\b(file|markdown|\.md|note)\b/i,
]

const NOTE_INTENT_PATTERNS: RegExp[] = [
  /\b(create|make|write|draft|generate|save)\b[\s\S]{0,40}\b(note|notebook)\b/i,
  /\bnote\b[\s\S]{0,20}\babout\b/i,
]

const RESEARCH_INTENT_PATTERNS: RegExp[] = [
  /\bdeep research\b/i,
  /\bresearch\b/i,
  /\binvestigate\b/i,
  /\bcite\b/i,
  /\bcitations?\b/i,
  /\bsources?\b/i,
  /\bliterature review\b/i,
  /\bweb search\b/i,
]

const MARKDOWN_FILE_PATTERNS: RegExp[] = [
  /\bmarkdown\b/i,
  /\bmd file\b/i,
  /\b\.md\b/i,
  /\bfinal_report\.md\b/i,
  /\bexport\b/i,
  /\bsave\b[\s\S]{0,40}\b(file|markdown|report|document)\b/i,
  /\bwrite\b[\s\S]{0,25}\b(file|markdown|report|document)\b/i,
]

const DETAILED_LONG_FORM_PATTERNS: RegExp[] = [
  /\b(detailed|comprehensive|in-depth|full)\b[\s\S]{0,30}\b(roadmap|plan|guide|report)\b/i,
  /\b(roadmap|plan|guide|report)\b[\s\S]{0,30}\b(detailed|comprehensive|in-depth|full)\b/i,
]

function hasPattern(input: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(input))
}

export function classifyRequestPolicyMode(
  message: string,
  outputPreference?: RequestOutputPreference
): RequestPolicyMode {
  if (outputPreference === 'chat') return 'chat'
  if (outputPreference === 'note') return 'note'
  if (outputPreference === 'md_file') return 'markdown'

  const input = message.trim()
  if (!input) return 'chat'

  if (hasPattern(input, CHAT_OVERRIDE_PATTERNS)) return 'chat'
  if (hasPattern(input, NOTE_INTENT_PATTERNS)) return 'note'
  if (hasPattern(input, RESEARCH_INTENT_PATTERNS)) return 'research'
  if (hasPattern(input, MARKDOWN_FILE_PATTERNS) || hasPattern(input, DETAILED_LONG_FORM_PATTERNS)) {
    return 'markdown'
  }

  return 'chat'
}

export function inferAutoOutputPreference(
  message: string,
  outputPreference?: RequestOutputPreference
): RequestOutputPreference | undefined {
  if (outputPreference) return outputPreference
  return classifyRequestPolicyMode(message) === 'markdown' ? 'md_file' : undefined
}

export function shouldUseResearchFileTools(
  message: string,
  outputPreference?: RequestOutputPreference
): boolean {
  if (outputPreference === 'md_file') return true
  if (outputPreference === 'chat' || outputPreference === 'note') return false

  const input = message.trim()
  if (!input) return false
  if (hasPattern(input, CHAT_OVERRIDE_PATTERNS)) return false
  if (hasPattern(input, NOTE_INTENT_PATTERNS)) return false
  if (classifyRequestPolicyMode(input) !== 'research') return false

  return hasPattern(input, MARKDOWN_FILE_PATTERNS)
}
