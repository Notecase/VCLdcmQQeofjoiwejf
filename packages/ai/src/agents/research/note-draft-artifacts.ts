const STUDY_TIMER_PATTERNS: RegExp[] = [
  /\bstudy timer\b/i,
  /\bpomodoro\b/i,
  /\btimer\b/i,
]

const STUDY_TIMER_VERBOSE_SECTION_PATTERNS: RegExp[] = [
  /^#{1,6}\s*study timer artifact\b/i,
  /^#{1,6}\s*example timer setup\b/i,
  /^#{1,6}\s*tips for effective studying\b/i,
]

const STUDY_TIMER_VERBOSE_LINE_PATTERNS: RegExp[] = [
  /^[-*]\s+\*\*focus duration\*\*/i,
  /^[-*]\s+\*\*break duration\*\*/i,
  /^[-*]\s+\*\*cycle\*\*/i,
  /^[-*]\s+\*\*long break\*\*/i,
  /^\d+\.\s+\*\*(start timer|work on study material|end timer|repeat|long break)\*\*/i,
]

export interface DraftArtifactPayload {
  title: string
  html: string
  css: string
  javascript: string
}

function slugToTitle(input: string): string {
  const trimmed = input.trim().replace(/[^\w\s-]/g, '')
  if (!trimmed) return 'Untitled Draft'
  const words = trimmed.split(/\s+/).slice(0, 8)
  return words.map(word => word[0].toUpperCase() + word.slice(1)).join(' ')
}

export function extractDraftTitle(markdown: string, fallbackMessage: string): string {
  const firstLine = markdown.split('\n')[0]?.trim() || ''
  if (firstLine.startsWith('# ')) {
    return firstLine.replace(/^#\s+/, '').trim() || 'Untitled Draft'
  }

  return slugToTitle(fallbackMessage)
}

export function ensureHeading(markdown: string, title: string): string {
  const trimmed = markdown.trim()
  if (!trimmed) return `# ${title}\n\n`
  if (trimmed.startsWith('# ')) return trimmed
  return `# ${title}\n\n${trimmed}`
}

export function hasStudyTimerIntent(message: string): boolean {
  return STUDY_TIMER_PATTERNS.some(pattern => pattern.test(message))
}

export function hasArtifactBlock(markdown: string): boolean {
  return /```artifact[\s\S]*?```/i.test(markdown)
}

export function condenseStudyTimerNarrative(markdown: string): string {
  const lines = markdown.split('\n')
  const output: string[] = []
  let skippingVerboseSection = false

  for (const line of lines) {
    const trimmed = line.trim()
    const isHeading = /^#{1,6}\s+/.test(trimmed)

    if (isHeading) {
      skippingVerboseSection = STUDY_TIMER_VERBOSE_SECTION_PATTERNS.some(pattern => pattern.test(trimmed))
      if (skippingVerboseSection) continue
      output.push(line)
      continue
    }

    if (skippingVerboseSection) continue
    if (STUDY_TIMER_VERBOSE_LINE_PATTERNS.some(pattern => pattern.test(trimmed))) continue
    output.push(line)
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function buildStudyTimerIntroLines(): string[] {
  return [
    'Interactive study timer artifact is included below.',
    'Use Start, Pause, and Reset for focused Pomodoro cycles.',
  ]
}

export function normalizeArtifactPayload(
  payload: Partial<DraftArtifactPayload>,
  fallbackTitle = 'Study Timer',
): DraftArtifactPayload | null {
  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title.trim()
    : fallbackTitle
  const html = typeof payload.html === 'string' ? payload.html : ''
  const css = typeof payload.css === 'string' ? payload.css : ''
  const javascript = typeof payload.javascript === 'string' ? payload.javascript : ''

  if (!html && !css && !javascript) return null

  return {
    title,
    html,
    css,
    javascript,
  }
}

export function parseArtifactPayload(
  rawContent: string,
  fallbackTitle = 'Study Timer',
): DraftArtifactPayload | null {
  const cleaned = rawContent
    .replace(/^\s*```(?:json)?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/i, '')
    .trim()

  try {
    const parsed = JSON.parse(cleaned) as Partial<DraftArtifactPayload>
    return normalizeArtifactPayload(parsed, fallbackTitle)
  } catch {
    const partial: Partial<DraftArtifactPayload> = {}

    const titleMatch = rawContent.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
    if (titleMatch) {
      partial.title = titleMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
    }

    const htmlMatch = rawContent.match(/"html"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s)
    if (htmlMatch) {
      partial.html = htmlMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t')
    }

    const cssMatch = rawContent.match(/"css"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s)
    if (cssMatch) {
      partial.css = cssMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t')
    }

    const jsMatch = rawContent.match(/"javascript"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s)
    if (jsMatch) {
      partial.javascript = jsMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t')
    }

    return normalizeArtifactPayload(partial, fallbackTitle)
  }
}

export function buildArtifactBlock(payload: DraftArtifactPayload): string {
  return `## ${payload.title}\n\n\`\`\`artifact\n${JSON.stringify(payload, null, 2)}\n\`\`\``
}

export function appendArtifactToDraft(
  markdown: string,
  payload: DraftArtifactPayload,
  introLines: string[] = [],
): string {
  const base = markdown.trim()
  const intro = introLines
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('\n')
  const artifactBlock = buildArtifactBlock(payload)

  if (hasArtifactBlock(base)) return base
  if (!intro) return `${base}\n\n${artifactBlock}`.trim()
  return `${base}\n\n${intro}\n\n${artifactBlock}`.trim()
}
