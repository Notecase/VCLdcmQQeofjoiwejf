/**
 * Learning Resources Store
 *
 * Pinia store for managing note-attached learning resources.
 * Resources are AI-generated content (flashcards, mindmaps, Q&A, etc.)
 * that are attached to notes without modifying the note content.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getResourcesForNote,
  saveResource as apiSaveResource,
  deleteResource as apiDeleteResource,
  deleteResourceByType as apiDeleteResourceByType,
  resourceToMarkdown,
  getResourceTypeInfo,
  type LearningResource,
  type LearningResourceType,
  type LearningResourceData,
} from '@/services/learningResources.service'

// ============================================================================
// Types
// ============================================================================

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface ResourceWithMeta extends LearningResource {
  isSaving?: boolean
  saveError?: string
}

// Re-export types from service
export type {
  LearningResource,
  LearningResourceType,
  LearningResourceData,
  FlashcardsData,
  MindmapData,
  KeyTermsData,
  QAData,
  SummaryData,
  ExercisesData,
  ResourcesData,
  StudyNoteData,
  TimelineData,
  ComparisonData,
} from '@/services/learningResources.service'

// ============================================================================
// Store Definition
// ============================================================================

export const useLearningResourcesStore = defineStore('learningResources', () => {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // Current note context
  const currentNoteId = ref<string | null>(null)

  // Resources by note ID
  const resourcesByNote = ref<Map<string, LearningResource[]>>(new Map())

  // Loading state
  const isLoading = ref(false)
  const loadError = ref<string | null>(null)

  // Save status for individual resources
  const saveStatus = ref<Map<string, SaveStatus>>(new Map())

  // Active modal for viewing resources
  const activeModal = ref<LearningResourceType | null>(null)

  // Success message for save feedback
  const successMessage = ref<string | null>(null)

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  /**
   * Get resources for the current note
   */
  const currentResources = computed(() => {
    if (!currentNoteId.value) return []
    return resourcesByNote.value.get(currentNoteId.value) || []
  })

  /**
   * Get resource count for current note
   */
  const resourceCount = computed(() => currentResources.value.length)

  /**
   * Check if any resources exist for current note
   */
  const hasResources = computed(() => resourceCount.value > 0)

  /**
   * Get resource types that exist for current note
   */
  const existingResourceTypes = computed(() => {
    return currentResources.value.map((r) => r.type)
  })

  /**
   * Check if a specific resource type exists
   */
  const hasResourceType = computed(() => {
    return (type: LearningResourceType) => existingResourceTypes.value.includes(type)
  })

  /**
   * Get a specific resource by type for current note
   */
  const getResourceByType = computed(() => {
    return (type: LearningResourceType) => currentResources.value.find((r) => r.type === type)
  })

  /**
   * Check if currently saving any resource
   */
  const isSaving = computed(() => {
    return Array.from(saveStatus.value.values()).some((s) => s === 'saving')
  })

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Set the current note context
   */
  function setCurrentNote(noteId: string | null) {
    currentNoteId.value = noteId
    loadError.value = null
    successMessage.value = null
  }

  /**
   * Fetch resources for a note
   */
  async function fetchResources(noteId: string): Promise<LearningResource[]> {
    isLoading.value = true
    loadError.value = null

    try {
      const resources = await getResourcesForNote(noteId)
      resourcesByNote.value.set(noteId, resources)
      return resources
    } catch (error) {
      console.error('[LearningResources] Failed to fetch resources:', error)
      loadError.value = error instanceof Error ? error.message : 'Failed to fetch resources'
      return []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Save a learning resource (creates or updates)
   */
  async function saveResource(
    noteId: string,
    type: LearningResourceType,
    data: LearningResourceData,
    itemCount?: number
  ): Promise<LearningResource | null> {
    const statusKey = `${noteId}-${type}`
    saveStatus.value.set(statusKey, 'saving')
    successMessage.value = null

    try {
      const resource = await apiSaveResource(noteId, type, data, itemCount)

      // Update local cache
      const existing = resourcesByNote.value.get(noteId) || []
      const existingIndex = existing.findIndex((r) => r.type === type)

      if (existingIndex >= 0) {
        existing[existingIndex] = resource
      } else {
        existing.push(resource)
      }

      resourcesByNote.value.set(noteId, existing)
      saveStatus.value.set(statusKey, 'saved')

      // Set success message
      const typeInfo = getResourceTypeInfo(type)
      successMessage.value = `${typeInfo.label} saved! Access in Learning Resources tab.`

      // Clear success message after 3 seconds
      setTimeout(() => {
        successMessage.value = null
      }, 3000)

      return resource
    } catch (error) {
      console.error('[LearningResources] Failed to save resource:', error)
      saveStatus.value.set(statusKey, 'error')
      return null
    }
  }

  /**
   * Delete a resource by ID
   */
  async function deleteResource(resourceId: string): Promise<boolean> {
    try {
      const deleted = await apiDeleteResource(resourceId)

      if (deleted) {
        // Update local cache
        for (const [noteId, resources] of resourcesByNote.value.entries()) {
          const filtered = resources.filter((r) => r.id !== resourceId)
          if (filtered.length !== resources.length) {
            resourcesByNote.value.set(noteId, filtered)
            break
          }
        }
      }

      return deleted
    } catch (error) {
      console.error('[LearningResources] Failed to delete resource:', error)
      return false
    }
  }

  /**
   * Delete a resource by note ID and type
   */
  async function deleteResourceByType(
    noteId: string,
    type: LearningResourceType
  ): Promise<boolean> {
    try {
      const deleted = await apiDeleteResourceByType(noteId, type)

      if (deleted) {
        // Update local cache
        const resources = resourcesByNote.value.get(noteId) || []
        resourcesByNote.value.set(
          noteId,
          resources.filter((r) => r.type !== type)
        )
      }

      return deleted
    } catch (error) {
      console.error('[LearningResources] Failed to delete resource:', error)
      return false
    }
  }

  /**
   * Copy resource as markdown to clipboard
   */
  async function copyAsMarkdown(resource: LearningResource): Promise<boolean> {
    try {
      const markdown = resourceToMarkdown(resource)
      await navigator.clipboard.writeText(markdown)
      return true
    } catch (error) {
      console.error('[LearningResources] Failed to copy to clipboard:', error)
      return false
    }
  }

  /**
   * Get display info for a resource type
   */
  function getTypeInfo(type: LearningResourceType) {
    return getResourceTypeInfo(type)
  }

  /**
   * Open modal to view a resource
   */
  function openModal(type: LearningResourceType) {
    activeModal.value = type
  }

  /**
   * Close the active modal
   */
  function closeModal() {
    activeModal.value = null
  }

  /**
   * Clear success message
   */
  function clearSuccessMessage() {
    successMessage.value = null
  }

  /**
   * Clear all resources for a note
   */
  function clearResources(noteId: string) {
    resourcesByNote.value.delete(noteId)
  }

  /**
   * Clear all state
   */
  function clearAll() {
    resourcesByNote.value.clear()
    currentNoteId.value = null
    isLoading.value = false
    loadError.value = null
    saveStatus.value.clear()
    activeModal.value = null
    successMessage.value = null
  }

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // State
    currentNoteId,
    resourcesByNote,
    isLoading,
    loadError,
    saveStatus,
    activeModal,
    successMessage,

    // Computed
    currentResources,
    resourceCount,
    hasResources,
    existingResourceTypes,
    hasResourceType,
    getResourceByType,
    isSaving,

    // Actions
    setCurrentNote,
    fetchResources,
    saveResource,
    deleteResource,
    deleteResourceByType,
    copyAsMarkdown,
    getTypeInfo,
    openModal,
    closeModal,
    clearSuccessMessage,
    clearResources,
    clearAll,
  }
})
