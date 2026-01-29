/**
 * Learning Resources Service
 * CRUD operations for note-attached learning resources
 * (flashcards, mindmaps, Q&A, etc.)
 */

import { authFetch } from '@/utils/api'

/**
 * Learning resource types
 */
export type LearningResourceType =
  | 'flashcards'
  | 'mindmap'
  | 'key_terms'
  | 'qa'
  | 'summary'
  | 'exercises'
  | 'resources'
  | 'study_note'
  | 'timeline'
  | 'comparison'

/**
 * Learning resource data structures
 */
export interface FlashcardsData {
  cards: Array<{ question: string; answer: string }>
}

export interface MindmapData {
  center: string
  nodes: Array<{
    id: string
    label: string
    children?: Array<{ id: string; label: string }>
  }>
}

export interface KeyTermsData {
  terms: Array<{ term: string; definition: string; source?: string }>
}

export interface QAData {
  questions: Array<{ question: string; answer: string; source?: string }>
}

export interface SummaryData {
  content: string
  keyPoints: string[]
}

export interface ExercisesData {
  exercises: Array<{
    title: string
    description: string
    difficulty: 'easy' | 'medium' | 'hard'
  }>
}

export interface ResourcesData {
  resources: Array<{ type: string; title: string; url?: string; description?: string }>
}

export interface StudyNoteData {
  content: string
}

export interface TimelineData {
  events: Array<{ date: string; event: string; source?: string }>
}

export interface ComparisonData {
  agreements: string[]
  differences: string[]
}

export type LearningResourceData =
  | FlashcardsData
  | MindmapData
  | KeyTermsData
  | QAData
  | SummaryData
  | ExercisesData
  | ResourcesData
  | StudyNoteData
  | TimelineData
  | ComparisonData

/**
 * Learning resource record
 */
export interface LearningResource {
  id: string
  note_id: string
  user_id: string
  type: LearningResourceType
  data: LearningResourceData
  item_count: number
  created_at: string
  updated_at: string
}

/**
 * API response wrapper
 */
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

const API_BASE = '/api/learning-resources'

/**
 * Get all learning resources for a note
 */
export async function getResourcesForNote(noteId: string): Promise<LearningResource[]> {
  const response = await authFetch(`${API_BASE}/note/${noteId}`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch resources')
  }

  const result: ApiResponse<LearningResource[]> = await response.json()

  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch resources')
  }

  return result.data || []
}

/**
 * Get a specific resource by note ID and type
 */
export async function getResource(
  noteId: string,
  type: LearningResourceType
): Promise<LearningResource | null> {
  const response = await authFetch(`${API_BASE}/note/${noteId}/type/${type}`)

  if (!response.ok) {
    if (response.status === 404) {
      return null
    }
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch resource')
  }

  const result: ApiResponse<LearningResource> = await response.json()

  if (!result.success) {
    if (result.error?.includes('not found')) {
      return null
    }
    throw new Error(result.error || 'Failed to fetch resource')
  }

  return result.data || null
}

/**
 * Save a learning resource (creates or updates)
 */
export async function saveResource(
  noteId: string,
  type: LearningResourceType,
  data: LearningResourceData,
  itemCount?: number
): Promise<LearningResource> {
  const response = await authFetch(`${API_BASE}/save`, {
    method: 'POST',
    body: JSON.stringify({
      noteId,
      type,
      data,
      itemCount: itemCount ?? calculateItemCount(type, data),
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to save resource')
  }

  const result: ApiResponse<LearningResource> = await response.json()

  if (!result.success) {
    throw new Error(result.error || 'Failed to save resource')
  }

  return result.data!
}

/**
 * Delete a learning resource by ID
 */
export async function deleteResource(resourceId: string): Promise<boolean> {
  const response = await authFetch(`${API_BASE}/${resourceId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete resource')
  }

  const result: ApiResponse<{ deleted: boolean }> = await response.json()

  return result.data?.deleted ?? false
}

/**
 * Delete a resource by note ID and type
 */
export async function deleteResourceByType(
  noteId: string,
  type: LearningResourceType
): Promise<boolean> {
  const response = await authFetch(`${API_BASE}/note/${noteId}/type/${type}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete resource')
  }

  const result: ApiResponse<{ deleted: boolean }> = await response.json()

  return result.data?.deleted ?? false
}

/**
 * Get resource count for a note
 */
export async function getResourceCount(noteId: string): Promise<number> {
  const response = await authFetch(`${API_BASE}/note/${noteId}/count`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to get resource count')
  }

  const result: ApiResponse<{ count: number }> = await response.json()

  return result.data?.count ?? 0
}

/**
 * Calculate item count based on resource type and data
 */
function calculateItemCount(type: LearningResourceType, data: LearningResourceData): number {
  switch (type) {
    case 'flashcards':
      return (data as FlashcardsData).cards?.length ?? 0
    case 'mindmap':
      return (data as MindmapData).nodes?.length ?? 0
    case 'key_terms':
      return (data as KeyTermsData).terms?.length ?? 0
    case 'qa':
      return (data as QAData).questions?.length ?? 0
    case 'summary':
      return (data as SummaryData).keyPoints?.length ?? 0
    case 'exercises':
      return (data as ExercisesData).exercises?.length ?? 0
    case 'resources':
      return (data as ResourcesData).resources?.length ?? 0
    case 'timeline':
      return (data as TimelineData).events?.length ?? 0
    case 'comparison':
      return (
        ((data as ComparisonData).agreements?.length ?? 0) +
        ((data as ComparisonData).differences?.length ?? 0)
      )
    case 'study_note':
      return 1
    default:
      return 0
  }
}

/**
 * Convert resource to markdown for copying
 */
export function resourceToMarkdown(resource: LearningResource): string {
  const { type, data } = resource

  switch (type) {
    case 'flashcards': {
      const cards = (data as FlashcardsData).cards || []
      return cards
        .map(
          (card, i) =>
            `### Card ${i + 1}\n**Q:** ${card.question}\n**A:** ${card.answer}`
        )
        .join('\n\n')
    }

    case 'mindmap': {
      const mindmap = data as MindmapData
      let md = `# ${mindmap.center}\n\n`
      for (const node of mindmap.nodes || []) {
        md += `## ${node.label}\n`
        if (node.children) {
          for (const child of node.children) {
            md += `- ${child.label}\n`
          }
        }
        md += '\n'
      }
      return md
    }

    case 'key_terms': {
      const terms = (data as KeyTermsData).terms || []
      return terms
        .map((t) => `**${t.term}**: ${t.definition}${t.source ? ` *(${t.source})*` : ''}`)
        .join('\n\n')
    }

    case 'qa': {
      const questions = (data as QAData).questions || []
      return questions
        .map(
          (q, i) =>
            `### Question ${i + 1}\n**Q:** ${q.question}\n**A:** ${q.answer}${q.source ? `\n*Source: ${q.source}*` : ''}`
        )
        .join('\n\n')
    }

    case 'summary': {
      const summary = data as SummaryData
      let md = summary.content + '\n\n'
      if (summary.keyPoints?.length) {
        md += '**Key Points:**\n'
        md += summary.keyPoints.map((p) => `- ${p}`).join('\n')
      }
      return md
    }

    case 'exercises': {
      const exercises = (data as ExercisesData).exercises || []
      return exercises
        .map(
          (ex, i) =>
            `### Exercise ${i + 1}: ${ex.title}\n*Difficulty: ${ex.difficulty}*\n\n${ex.description}`
        )
        .join('\n\n')
    }

    case 'resources': {
      const resources = (data as ResourcesData).resources || []
      return resources
        .map(
          (r) =>
            `- **${r.title}** (${r.type})${r.url ? `\n  ${r.url}` : ''}${r.description ? `\n  ${r.description}` : ''}`
        )
        .join('\n')
    }

    case 'study_note':
      return (data as StudyNoteData).content || ''

    case 'timeline': {
      const events = (data as TimelineData).events || []
      return events.map((e) => `- **${e.date}**: ${e.event}`).join('\n')
    }

    case 'comparison': {
      const comp = data as ComparisonData
      let md = ''
      if (comp.agreements?.length) {
        md += '## Agreements\n'
        md += comp.agreements.map((a) => `- ${a}`).join('\n')
        md += '\n\n'
      }
      if (comp.differences?.length) {
        md += '## Differences\n'
        md += comp.differences.map((d) => `- ${d}`).join('\n')
      }
      return md
    }

    default:
      return JSON.stringify(data, null, 2)
  }
}

/**
 * Get display info for a resource type
 */
export function getResourceTypeInfo(type: LearningResourceType): {
  icon: string
  label: string
  description: string
} {
  switch (type) {
    case 'flashcards':
      return { icon: '🎴', label: 'Flashcards', description: 'Question and answer cards for review' }
    case 'mindmap':
      return { icon: '🧠', label: 'Mind Map', description: 'Visual concept map of the content' }
    case 'key_terms':
      return { icon: '📝', label: 'Key Terms', description: 'Important terms and definitions' }
    case 'qa':
      return { icon: '❓', label: 'Q&A', description: 'Study questions with answers' }
    case 'summary':
      return { icon: '📄', label: 'Summary', description: 'Condensed overview of the content' }
    case 'exercises':
      return { icon: '✏️', label: 'Exercises', description: 'Practice problems and exercises' }
    case 'resources':
      return { icon: '🔗', label: 'Resources', description: 'Related resources and links' }
    case 'study_note':
      return { icon: '📚', label: 'Study Note', description: 'Generated study notes' }
    case 'timeline':
      return { icon: '📅', label: 'Timeline', description: 'Chronological events' }
    case 'comparison':
      return { icon: '⚖️', label: 'Comparison', description: 'Agreements and differences' }
    default:
      return { icon: '📦', label: type, description: 'Learning resource' }
  }
}
