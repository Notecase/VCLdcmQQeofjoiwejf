/**
 * Sources Store
 *
 * Pinia store for managing source state (PDFs, links, files, text).
 * Integrates with the sources API for upload, fetch, and workflow actions.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authFetch, authFetchSSE } from '@/utils/api'

// ============================================================================
// Types
// ============================================================================

export type SourceType = 'pdf' | 'link' | 'file' | 'text' | 'youtube'

export type SourceStatus = 'processing' | 'ready' | 'error'

export interface Source {
  id: string
  noteId: string
  userId: string
  type: SourceType
  originalUrl?: string
  originalFilename?: string
  content: string
  title: string
  wordCount: number
  pageCount?: number
  status: SourceStatus
  error?: string
  extractedAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface SourceSearchResult {
  chunk: {
    id: string
    sourceId: string
    content: string
    position: number
    pageNumber?: number
  }
  source: Source
  score: number
  highlights?: string[]
}

export type WorkflowActionType =
  | 'generate_study_note'
  | 'create_summary'
  | 'extract_key_terms'
  | 'compare_sources'
  | 'generate_qa'
  | 'find_conflicts'
  | 'extract_citations'
  | 'build_timeline'

export interface WorkflowAction {
  id: WorkflowActionType
  name: string
  description: string
  icon: string
  requiresSources: boolean
  minSources?: number
}

export type ActionStatus = 'idle' | 'executing' | 'complete' | 'error'

export interface ActionProgress {
  actionType: WorkflowActionType
  status: 'starting' | 'processing' | 'complete' | 'error'
  progress: number
  message: string
  error?: string
}

// ============================================================================
// Store Definition
// ============================================================================

export const useSourcesStore = defineStore('sources', () => {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // Current note context
  const currentNoteId = ref<string | null>(null)

  // Sources by note ID
  const sourcesByNote = ref<Map<string, Source[]>>(new Map())

  // Upload state
  const uploadStatus = ref<'idle' | 'uploading' | 'complete' | 'error'>('idle')
  const uploadProgress = ref<{
    sourceId: string
    status: string
    progress: number
    message: string
  } | null>(null)
  const uploadError = ref<string | null>(null)

  // Action state
  const actionStatus = ref<Record<WorkflowActionType, ActionStatus>>({
    generate_study_note: 'idle',
    create_summary: 'idle',
    extract_key_terms: 'idle',
    compare_sources: 'idle',
    generate_qa: 'idle',
    find_conflicts: 'idle',
    extract_citations: 'idle',
    build_timeline: 'idle',
  })
  const actionProgress = ref<ActionProgress | null>(null)
  const actionResults = ref<Map<WorkflowActionType, unknown>>(new Map())
  const actionErrors = ref<Partial<Record<WorkflowActionType, string>>>({})

  // Search state
  const searchResults = ref<SourceSearchResult[]>([])
  const isSearching = ref(false)

  // Available actions
  const availableActions = ref<WorkflowAction[]>([])

  // Active modal
  const activeModal = ref<'add' | 'view' | 'action-result' | null>(null)
  const selectedSource = ref<Source | null>(null)
  const selectedActionResult = ref<{ type: WorkflowActionType; result: unknown } | null>(null)

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const currentSources = computed(() => {
    if (!currentNoteId.value) return []
    return sourcesByNote.value.get(currentNoteId.value) || []
  })

  const readySources = computed(() =>
    currentSources.value.filter(s => s.status === 'ready')
  )

  const sourceCount = computed(() => currentSources.value.length)
  const readySourceCount = computed(() => readySources.value.length)

  const totalWordCount = computed(() =>
    readySources.value.reduce((sum, s) => sum + s.wordCount, 0)
  )

  const hasSources = computed(() => sourceCount.value > 0)
  const hasReadySources = computed(() => readySourceCount.value > 0)

  const isUploading = computed(() => uploadStatus.value === 'uploading')
  const isExecutingAction = computed(() =>
    Object.values(actionStatus.value).some(s => s === 'executing')
  )

  const canCompare = computed(() => readySourceCount.value >= 2)
  const canFindConflicts = computed(() => readySourceCount.value >= 2)

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function setCurrentNote(noteId: string | null) {
    currentNoteId.value = noteId
    // Clear search results when switching notes
    searchResults.value = []
  }

  function setSources(noteId: string, sources: Source[]) {
    sourcesByNote.value.set(noteId, sources)
  }

  function addSource(noteId: string, source: Source) {
    const existing = sourcesByNote.value.get(noteId) || []
    sourcesByNote.value.set(noteId, [...existing, source])
  }

  function updateSource(sourceId: string, updates: Partial<Source>) {
    for (const [noteId, sources] of sourcesByNote.value) {
      const index = sources.findIndex(s => s.id === sourceId)
      if (index !== -1) {
        sources[index] = { ...sources[index], ...updates }
        sourcesByNote.value.set(noteId, [...sources])
        break
      }
    }
  }

  function removeSource(sourceId: string) {
    for (const [noteId, sources] of sourcesByNote.value) {
      const filtered = sources.filter(s => s.id !== sourceId)
      if (filtered.length !== sources.length) {
        sourcesByNote.value.set(noteId, filtered)
        break
      }
    }
  }

  function setActionStatus(action: WorkflowActionType, status: ActionStatus) {
    actionStatus.value[action] = status
    if (status === 'idle' || status === 'complete') {
      delete actionErrors.value[action]
    }
  }

  function setActionError(action: WorkflowActionType, error: string) {
    actionErrors.value[action] = error
    actionStatus.value[action] = 'error'
  }

  function setActionResult(action: WorkflowActionType, result: unknown) {
    actionResults.value.set(action, result)
  }

  function openAddModal() {
    activeModal.value = 'add'
  }

  function openViewModal(source: Source) {
    selectedSource.value = source
    activeModal.value = 'view'
  }

  function openActionResultModal(action: WorkflowActionType, result: unknown) {
    selectedActionResult.value = { type: action, result }
    activeModal.value = 'action-result'
  }

  function closeModal() {
    activeModal.value = null
    selectedSource.value = null
    selectedActionResult.value = null
  }

  // ---------------------------------------------------------------------------
  // API Actions
  // ---------------------------------------------------------------------------

  /**
   * Fetch sources for a note
   */
  async function fetchSources(noteId: string): Promise<Source[]> {
    try {
      const response = await authFetch(`/api/sources/${noteId}`)

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`HTTP ${response.status}: ${error}`)
      }

      const result = await response.json()

      if (result.success) {
        // Convert date strings to Date objects
        const sources = (result.sources || []).map((s: Source) => ({
          ...s,
          extractedAt: new Date(s.extractedAt),
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.updatedAt),
        }))
        setSources(noteId, sources)
        return sources
      }

      throw new Error(result.error || 'Failed to fetch sources')
    } catch (error) {
      console.error('[Sources] fetchSources error:', error)
      return []
    }
  }

  /**
   * Upload a file
   */
  async function uploadFile(
    noteId: string,
    file: File,
    useSSE = true
  ): Promise<Source | null> {
    uploadStatus.value = 'uploading'
    uploadError.value = null
    uploadProgress.value = {
      sourceId: '',
      status: 'uploading',
      progress: 0,
      message: 'Starting upload...',
    }

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('noteId', noteId)

      if (useSSE) {
        const response = await authFetchSSE('/api/sources/upload', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const error = await response.text()
          throw new Error(`HTTP ${response.status}: ${error}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let source: Source | null = null
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() || ''

          for (const event of events) {
            for (const line of event.split('\n')) {
              if (line.startsWith('data: ')) {
                const data = JSON.parse(line.slice(6))

                if (data.type === 'progress') {
                  uploadProgress.value = {
                    sourceId: data.sourceId || '',
                    status: data.status,
                    progress: data.progress,
                    message: data.message,
                  }
                } else if (data.type === 'complete') {
                  source = data.source
                } else if (data.type === 'error') {
                  throw new Error(data.error)
                }
              }
            }
          }
        }

        if (source) {
          addSource(noteId, source)
          uploadStatus.value = 'complete'
          uploadProgress.value = null
          return source
        }

        throw new Error('No source returned')
      } else {
        // Non-SSE upload
        const response = await authFetch('/api/sources/upload', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const error = await response.text()
          throw new Error(`HTTP ${response.status}: ${error}`)
        }

        const result = await response.json()

        if (result.success && result.source) {
          addSource(noteId, result.source)
          uploadStatus.value = 'complete'
          uploadProgress.value = null
          return result.source
        }

        throw new Error(result.error || 'Failed to upload file')
      }
    } catch (error) {
      console.error('[Sources] uploadFile error:', error)
      uploadStatus.value = 'error'
      uploadError.value = String(error)
      uploadProgress.value = null
      return null
    }
  }

  /**
   * Add a link
   */
  async function addLink(noteId: string, url: string, useSSE = true): Promise<Source | null> {
    uploadStatus.value = 'uploading'
    uploadError.value = null
    uploadProgress.value = {
      sourceId: '',
      status: 'uploading',
      progress: 0,
      message: 'Fetching link...',
    }

    try {
      if (useSSE) {
        const response = await authFetchSSE('/api/sources/link', {
          method: 'POST',
          body: JSON.stringify({ noteId, url }),
        })

        if (!response.ok) {
          const error = await response.text()
          throw new Error(`HTTP ${response.status}: ${error}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let source: Source | null = null
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() || ''

          for (const event of events) {
            for (const line of event.split('\n')) {
              if (line.startsWith('data: ')) {
                const data = JSON.parse(line.slice(6))

                if (data.type === 'progress') {
                  uploadProgress.value = {
                    sourceId: data.sourceId || '',
                    status: data.status,
                    progress: data.progress,
                    message: data.message,
                  }
                } else if (data.type === 'complete') {
                  source = data.source
                } else if (data.type === 'error') {
                  throw new Error(data.error)
                }
              }
            }
          }
        }

        if (source) {
          addSource(noteId, source)
          uploadStatus.value = 'complete'
          uploadProgress.value = null
          return source
        }

        throw new Error('No source returned')
      } else {
        const response = await authFetch('/api/sources/link', {
          method: 'POST',
          body: JSON.stringify({ noteId, url }),
        })

        if (!response.ok) {
          const error = await response.text()
          throw new Error(`HTTP ${response.status}: ${error}`)
        }

        const result = await response.json()

        if (result.success && result.source) {
          addSource(noteId, result.source)
          uploadStatus.value = 'complete'
          uploadProgress.value = null
          return result.source
        }

        throw new Error(result.error || 'Failed to add link')
      }
    } catch (error) {
      console.error('[Sources] addLink error:', error)
      uploadStatus.value = 'error'
      uploadError.value = String(error)
      uploadProgress.value = null
      return null
    }
  }

  /**
   * Add text
   */
  async function addText(noteId: string, text: string, title?: string): Promise<Source | null> {
    uploadStatus.value = 'uploading'
    uploadError.value = null

    try {
      const response = await authFetch('/api/sources/text', {
        method: 'POST',
        body: JSON.stringify({ noteId, text, title }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`HTTP ${response.status}: ${error}`)
      }

      const result = await response.json()

      if (result.success && result.source) {
        addSource(noteId, result.source)
        uploadStatus.value = 'complete'
        return result.source
      }

      throw new Error(result.error || 'Failed to add text')
    } catch (error) {
      console.error('[Sources] addText error:', error)
      uploadStatus.value = 'error'
      uploadError.value = String(error)
      return null
    }
  }

  /**
   * Delete a source
   */
  async function deleteSource(sourceId: string): Promise<boolean> {
    try {
      const response = await authFetch(`/api/sources/${sourceId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`HTTP ${response.status}: ${error}`)
      }

      const result = await response.json()

      if (result.success) {
        removeSource(sourceId)
        return true
      }

      throw new Error(result.error || 'Failed to delete source')
    } catch (error) {
      console.error('[Sources] deleteSource error:', error)
      return false
    }
  }

  /**
   * Search sources
   */
  async function searchSources(noteId: string, query: string, limit = 10): Promise<SourceSearchResult[]> {
    isSearching.value = true

    try {
      const response = await authFetch('/api/sources/search', {
        method: 'POST',
        body: JSON.stringify({ noteId, query, limit }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`HTTP ${response.status}: ${error}`)
      }

      const result = await response.json()

      if (result.success) {
        searchResults.value = result.results || []
        return searchResults.value
      }

      throw new Error(result.error || 'Search failed')
    } catch (error) {
      console.error('[Sources] searchSources error:', error)
      return []
    } finally {
      isSearching.value = false
    }
  }

  /**
   * Execute a workflow action
   */
  async function executeAction(
    noteId: string,
    actionType: WorkflowActionType,
    options: Record<string, unknown> = {}
  ): Promise<unknown | null> {
    setActionStatus(actionType, 'executing')
    actionProgress.value = {
      actionType,
      status: 'starting',
      progress: 0,
      message: 'Starting...',
    }

    try {
      const response = await authFetchSSE('/api/sources/action', {
        method: 'POST',
        body: JSON.stringify({ noteId, actionType, options }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`HTTP ${response.status}: ${error}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let result: unknown = null
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''

        for (const event of events) {
          for (const line of event.split('\n')) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6))

              if (data.type === 'progress') {
                actionProgress.value = {
                  actionType,
                  status: data.status,
                  progress: data.progress,
                  message: data.message,
                }
              } else if (data.type === 'complete') {
                result = data.result
              } else if (data.type === 'error') {
                throw new Error(data.error)
              }
            }
          }
        }
      }

      if (result) {
        setActionResult(actionType, result)
        setActionStatus(actionType, 'complete')
        actionProgress.value = null
        return result
      }

      throw new Error('No result returned')
    } catch (error) {
      console.error('[Sources] executeAction error:', error)
      setActionError(actionType, String(error))
      actionProgress.value = null
      return null
    }
  }

  /**
   * Fetch available actions
   */
  async function fetchAvailableActions(): Promise<WorkflowAction[]> {
    try {
      const response = await authFetch('/api/sources/actions')

      if (!response.ok) {
        throw new Error('Failed to fetch actions')
      }

      const result = await response.json()

      if (result.success) {
        availableActions.value = result.actions || []
        return availableActions.value
      }

      return []
    } catch (error) {
      console.error('[Sources] fetchAvailableActions error:', error)
      return []
    }
  }

  /**
   * Get source content
   */
  async function getSourceContent(sourceId: string): Promise<{ content: string; chunks: unknown[] } | null> {
    try {
      const response = await authFetch(`/api/sources/content/${sourceId}`)

      if (!response.ok) {
        throw new Error('Failed to fetch source content')
      }

      const result = await response.json()

      if (result.success) {
        return {
          content: result.content,
          chunks: result.chunks || [],
        }
      }

      return null
    } catch (error) {
      console.error('[Sources] getSourceContent error:', error)
      return null
    }
  }

  /**
   * Clear all data for a note
   */
  function clearSources(noteId: string) {
    sourcesByNote.value.delete(noteId)
  }

  /**
   * Reset store
   */
  function reset() {
    sourcesByNote.value.clear()
    currentNoteId.value = null
    uploadStatus.value = 'idle'
    uploadProgress.value = null
    uploadError.value = null
    searchResults.value = []
    isSearching.value = false
    actionProgress.value = null
    actionResults.value.clear()
    actionErrors.value = {}
    Object.keys(actionStatus.value).forEach(key => {
      actionStatus.value[key as WorkflowActionType] = 'idle'
    })
    activeModal.value = null
    selectedSource.value = null
    selectedActionResult.value = null
  }

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // State
    currentNoteId,
    sourcesByNote,
    uploadStatus,
    uploadProgress,
    uploadError,
    actionStatus,
    actionProgress,
    actionResults,
    actionErrors,
    searchResults,
    isSearching,
    availableActions,
    activeModal,
    selectedSource,
    selectedActionResult,

    // Computed
    currentSources,
    readySources,
    sourceCount,
    readySourceCount,
    totalWordCount,
    hasSources,
    hasReadySources,
    isUploading,
    isExecutingAction,
    canCompare,
    canFindConflicts,

    // Actions
    setCurrentNote,
    setSources,
    addSource,
    updateSource,
    removeSource,
    setActionStatus,
    setActionError,
    setActionResult,
    openAddModal,
    openViewModal,
    openActionResultModal,
    closeModal,

    // API Actions
    fetchSources,
    uploadFile,
    addLink,
    addText,
    deleteSource,
    searchSources,
    executeAction,
    fetchAvailableActions,
    getSourceContent,
    clearSources,
    reset,
  }
})
