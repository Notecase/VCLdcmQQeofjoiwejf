import type { ResearchNoteDraft } from '@inkdown/shared/types'

export interface NoteDraftViewState extends ResearchNoteDraft {
  hidden?: boolean
  isSaving?: boolean
  isSaved?: boolean
  messageId?: string
}

export interface NoteDraftDeltaPayload {
  draftId: string
  title: string
  originalContent: string
  currentContent?: string
  delta?: string
  noteId?: string
}

export function getNoteDraftDiffScopeId(draftId: string, _threadId?: string): string {
  const normalizedDraftId = draftId.trim() || 'unknown'
  return `draft:${normalizedDraftId}`
}

export function applyNoteDraftDelta(
  current: NoteDraftViewState | null,
  payload: NoteDraftDeltaPayload
): NoteDraftViewState {
  const hasSnapshot = typeof payload.currentContent === 'string'
  const safeDelta = typeof payload.delta === 'string' ? payload.delta : ''
  const baseContent = current?.currentContent || ''
  const resolvedContent = hasSnapshot ? payload.currentContent! : `${baseContent}${safeDelta}`

  return {
    draftId: payload.draftId,
    title: payload.title || current?.title || 'Untitled Draft',
    originalContent: payload.originalContent || current?.originalContent || '',
    proposedContent: resolvedContent,
    currentContent: resolvedContent,
    noteId: payload.noteId || current?.noteId,
    savedAt: current?.savedAt,
    updatedAt: new Date().toISOString(),
    hidden: false,
    isSaved: false,
  }
}

export function applyNoteDraftSnapshot(
  current: NoteDraftViewState | null,
  payload: ResearchNoteDraft
): NoteDraftViewState {
  return {
    ...payload,
    hidden: current?.hidden ?? false,
    isSaving: false,
    isSaved: Boolean(payload.savedAt),
    messageId: current?.messageId,
  }
}

export function setNoteDraftHidden(
  draft: NoteDraftViewState | null,
  hidden: boolean
): NoteDraftViewState | null {
  if (!draft) return null
  return {
    ...draft,
    hidden,
  }
}
