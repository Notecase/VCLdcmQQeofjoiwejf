interface RoadmapFileLike {
  filename: string
  content: string
}

export interface ParsedRoadmapCandidate {
  id: string
  name: string
  filename: string
  content: string
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function deriveIdFromTokens(tokens: string[]): string {
  const clean = tokens
    .map(t => t.replace(/[^a-z0-9]/gi, ''))
    .filter(Boolean)

  if (clean.length === 0) return 'PLAN'

  if (clean.length === 1) {
    const token = clean[0].toUpperCase()
    if (token.length >= 2 && token.length <= 8) return token
    return token.slice(0, 8)
  }

  const acronym = clean.map(t => t[0]).join('').toUpperCase()
  if (acronym.length >= 2) return acronym.slice(0, 8)
  return clean[0].toUpperCase().slice(0, 8)
}

function deriveFromFilename(filename: string): { id: string; name: string } {
  const basename = filename.split('/').pop() || filename
  const stem = basename
    .replace(/\.md$/i, '')
    .replace(/[-_ ]?roadmap$/i, '')
    .trim()

  const tokens = stem.split(/[^a-z0-9]+/i).filter(Boolean)
  const id = deriveIdFromTokens(tokens)
  const name = titleCase(tokens.join(' ')) || 'Learning Roadmap'

  return { id, name }
}

function deriveFromHeading(heading: string): { id: string; name: string } {
  const normalized = heading.trim()
  const explicit = normalized.match(/^\[([^\]]{2,12})\]\s*(.+)$/)
  if (explicit) {
    return {
      id: explicit[1].replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8) || 'PLAN',
      name: explicit[2].trim(),
    }
  }

  const name = normalized
    .replace(/\broadmap\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || normalized
  const tokens = name.split(/[^a-z0-9]+/i).filter(Boolean)
  const id = deriveIdFromTokens(tokens)
  return { id, name }
}

function findPrimaryHeading(content: string): string | null {
  const h1 = content.match(/^#\s+(.+)$/m)
  if (h1?.[1]) return h1[1].trim()

  const h2 = content.match(/^##\s+(.+)$/m)
  if (h2?.[1]) return h2[1].trim()

  return null
}

export function parseRoadmapCandidatesFromFiles(files: RoadmapFileLike[]): ParsedRoadmapCandidate[] {
  const rawCandidates = files
    .filter(file => file.filename.startsWith('Plans/') && file.filename.toLowerCase().endsWith('.md'))
    .map((file) => {
      const heading = findPrimaryHeading(file.content)
      const byHeading = heading ? deriveFromHeading(heading) : null
      const byFilename = deriveFromFilename(file.filename)

      return {
        id: (byHeading?.id || byFilename.id || 'PLAN').toUpperCase(),
        name: byHeading?.name || byFilename.name || 'Learning Roadmap',
        filename: file.filename,
        content: file.content,
      } satisfies ParsedRoadmapCandidate
    })

  // Ensure IDs stay unique/stable even when multiple files collapse to the same derived ID.
  const idCounts = new Map<string, number>()
  return rawCandidates.map((candidate) => {
    const count = (idCounts.get(candidate.id) || 0) + 1
    idCounts.set(candidate.id, count)
    if (count === 1) return candidate
    return {
      ...candidate,
      id: `${candidate.id}${count}`,
    }
  })
}
