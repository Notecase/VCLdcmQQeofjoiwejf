import { defineStore } from 'pinia'
import * as notesService from '@/services/notes.service'
import * as subscriptionsService from '@/services/subscriptions.service'
import { isServicesInitialized } from '@/services'
import { useAuthStore } from './auth'
import type { Note, EditorState, NoteChangeEvent } from '@inkdown/shared'
import { isDemoMode } from '@/utils/demo'
import { DEMO_DOCUMENTS } from '@/data/demo-note-rl'

// Re-export Note as Document for backward compatibility
export type Document = Note

interface WordCount {
  words: number
  characters: number
  paragraphs: number
}

interface Tab {
  id: string
  document: Note
  isSaved: boolean
  isActive: boolean
}

interface EditorStoreState {
  // Current active document
  currentDocument: Note | null

  // All open tabs
  tabs: Tab[]

  // Active tab ID
  activeTabId: string | null

  // Document list (sidebar)
  documents: Note[]

  // Save status
  isSaving: boolean
  lastSaved: Date | null

  // Word count for current document
  wordCount: WordCount

  // Table of contents
  toc: any[]

  // Loading states
  isLoading: boolean
  isLoadingDocuments: boolean

  // Real-time sync
  isRealtimeSyncEnabled: boolean
}

// Store unsubscribe function outside state (not reactive)
let notesUnsubscribe: (() => void) | null = null

export const useEditorStore = defineStore('editor', {
  state: (): EditorStoreState => ({
    currentDocument: null,
    tabs: [],
    activeTabId: null,
    documents: [],
    isSaving: false,
    lastSaved: null,
    wordCount: { words: 0, characters: 0, paragraphs: 0 },
    toc: [],
    isLoading: false,
    isLoadingDocuments: false,
    isRealtimeSyncEnabled: false,
  }),

  getters: {
    activeTab: (state): Tab | undefined => {
      return state.tabs.find((t) => t.id === state.activeTabId)
    },

    hasUnsavedChanges: (state): boolean => {
      return state.tabs.some((t) => !t.isSaved)
    },

    openDocumentIds: (state): string[] => {
      return state.tabs.map((t) => t.document.id)
    },

    tableOfContents: (state): any[] => {
      return state.toc
    },
  },

  actions: {
    /**
     * Load all notes for the sidebar (includes both general and project notes)
     */
    async loadDocuments() {
      this.isLoadingDocuments = true

      try {
        if (isDemoMode()) {
          this.documents = DEMO_DOCUMENTS.map((d) => ({ ...d }))
          return
        }

        if (!isServicesInitialized()) {
          console.warn('Services not initialized, using empty list')
          this.documents = []
          return
        }

        const authStore = useAuthStore()
        const userId = authStore.user?.id

        if (!userId) {
          this.documents = []
          return
        }

        // Load notes from IndexedDB (or Supabase)
        const result = await notesService.getNotes(userId)

        if (result.error) {
          console.error('Failed to load notes:', result.error)
          this.documents = []
        } else {
          this.documents = result.data || []
          this.startRealtimeSync()
        }
      } catch (error) {
        console.error('Error loading documents:', error)
        this.documents = []
      } finally {
        this.isLoadingDocuments = false
      }
    },

    /**
     * Create a new document and open it
     * @param projectId - Optional project ID to create the note in (mutually exclusive with parentNoteId)
     * @param title - Optional title for the note (defaults to 'Untitled')
     * @param parentNoteId - Optional parent note ID to create as subnote (mutually exclusive with projectId)
     */
    async createDocument(projectId?: string, title: string = 'Untitled', parentNoteId?: string) {
      if (isDemoMode()) {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        const doc: Note = {
          id,
          user_id: 'demo-user',
          project_id: parentNoteId ? null : projectId || null,
          parent_note_id: parentNoteId || null,
          path: `/${id}`,
          depth: 0,
          title,
          content: '',
          content_hash: null,
          word_count: 0,
          character_count: 0,
          reading_time_minutes: 0,
          link_count: 0,
          attachment_count: 0,
          editor_state: {},
          sort_order: 0,
          tags: [],
          last_viewed_at: now,
          is_pinned: false,
          is_favorite: false,
          is_archived: false,
          is_deleted: false,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          version: 1,
        }
        this.documents.unshift(doc)
        this.openDocument(doc)
        return doc
      }

      const authStore = useAuthStore()
      if (!authStore.user?.id) {
        console.warn('Cannot create document: user not authenticated')
        return null
      }
      const userId = authStore.user.id

      try {
        // Note: project_id and parent_note_id are mutually exclusive
        const result = await notesService.createNote(userId, {
          title,
          content: '',
          project_id: parentNoteId ? undefined : projectId || undefined,
          parent_note_id: parentNoteId || undefined,
        })

        if (result.error) {
          console.error('Failed to create note:', result.error)
          return null
        }

        const doc = Array.isArray(result.data) ? result.data[0] : result.data
        if (doc) {
          this.documents.unshift(doc as Note)
          this.openDocument(doc as Note)
        }

        return doc
      } catch (error) {
        console.error('Error creating document:', error)
        return null
      }
    },

    /**
     * Open a document in a new tab or switch to existing tab
     */
    openDocument(doc: Note) {
      // Check if already open
      const existingTab = this.tabs.find((t) => t.document.id === doc.id)
      if (existingTab) {
        this.activeTabId = existingTab.id
        this.currentDocument = doc
        return
      }

      // Create new tab
      const tab: Tab = {
        id: doc.id,
        document: { ...doc },
        isSaved: true,
        isActive: true,
      }

      // Deactivate other tabs
      this.tabs.forEach((t) => (t.isActive = false))

      this.tabs.push(tab)
      this.activeTabId = tab.id
      this.currentDocument = tab.document
    },

    /**
     * Load and open a document by ID
     */
    async loadDocument(id: string) {
      if (isDemoMode()) {
        const doc =
          DEMO_DOCUMENTS.find((d) => d.id === id) || this.documents.find((d) => d.id === id)
        if (doc) this.openDocument({ ...doc })
        return
      }

      this.isLoading = true

      try {
        const result = await notesService.getNote(id)

        if (result.data && result.data[0]) {
          this.openDocument(result.data[0])
        }
      } catch (error) {
        console.error('Error loading document:', error)
      } finally {
        this.isLoading = false
      }
    },

    /**
     * Update content for the active document
     */
    updateContent(markdown: string, wordCount?: WordCount) {
      const tab = this.activeTab
      if (tab) {
        tab.document.content = markdown
        tab.isSaved = false

        if (wordCount) {
          this.wordCount = wordCount
          tab.document.word_count = wordCount.words
          tab.document.character_count = wordCount.characters
        }
      }

      if (this.currentDocument) {
        this.currentDocument.content = markdown
      }
    },

    /**
     * Update cursor position
     */
    updateCursor(cursor: any) {
      const tab = this.activeTab
      if (tab && tab.document.editor_state) {
        tab.document.editor_state.cursor = cursor
      }
      if (this.currentDocument && this.currentDocument.editor_state) {
        this.currentDocument.editor_state.cursor = cursor
      }
    },

    /**
     * Save the active document
     */
    async saveDocument() {
      if (isDemoMode()) {
        const tab = this.activeTab
        if (tab) {
          tab.isSaved = true
          this.lastSaved = new Date()
          const docIndex = this.documents.findIndex((d) => d.id === tab.document.id)
          if (docIndex !== -1) {
            this.documents[docIndex] = { ...tab.document }
          }
        }
        return
      }
      const tab = this.activeTab
      if (!tab || tab.isSaved) return

      this.isSaving = true

      try {
        const result = await notesService.updateNote(tab.document.id, {
          content: tab.document.content,
          title: tab.document.title,
          word_count: tab.document.word_count,
          character_count: tab.document.character_count,
          editor_state: tab.document.editor_state as EditorState,
        })

        if (result.error) {
          console.error('Failed to save note:', result.error)
          return
        }

        tab.isSaved = true
        this.lastSaved = new Date()

        // Update in documents list
        const docIndex = this.documents.findIndex((d) => d.id === tab.document.id)
        if (docIndex !== -1) {
          this.documents[docIndex] = { ...tab.document }
        }
      } catch (error) {
        console.error('Error saving document:', error)
      } finally {
        this.isSaving = false
      }
    },

    /**
     * Close a tab
     */
    closeTab(tabId: string) {
      const index = this.tabs.findIndex((t) => t.id === tabId)
      if (index === -1) return

      this.tabs.splice(index, 1)

      // Switch to another tab if closing active
      if (this.activeTabId === tabId) {
        if (this.tabs.length > 0) {
          const newIndex = Math.min(index, this.tabs.length - 1)
          const newTab = this.tabs[newIndex]
          if (newTab) {
            this.activeTabId = newTab.id
            this.currentDocument = newTab.document
          }
        } else {
          this.activeTabId = null
          this.currentDocument = null
        }
      }
    },

    /**
     * Switch to a tab
     */
    switchTab(tabId: string) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (tab) {
        this.tabs.forEach((t) => (t.isActive = false))
        tab.isActive = true
        this.activeTabId = tabId
        this.currentDocument = tab.document
      }
    },

    /**
     * Delete a document
     */
    async deleteDocument(id: string) {
      if (isDemoMode()) {
        this.documents = this.documents.filter((d) => d.id !== id)
        this.closeTab(id)
        return
      }
      try {
        const result = await notesService.deleteNote(id)

        if (result.error) {
          console.error('Failed to delete note:', result.error)
          return
        }

        // Remove from documents list
        this.documents = this.documents.filter((d) => d.id !== id)

        // Close tab if open
        this.closeTab(id)
      } catch (error) {
        console.error('Error deleting document:', error)
      }
    },

    /**
     * Rename a document
     */
    async renameDocument(id: string, newTitle: string) {
      if (isDemoMode()) {
        const doc = this.documents.find((d) => d.id === id)
        if (doc) doc.title = newTitle
        const tab = this.tabs.find((t) => t.document.id === id)
        if (tab) tab.document.title = newTitle
        if (this.currentDocument?.id === id) {
          this.currentDocument.title = newTitle
        }
        return
      }
      try {
        const result = await notesService.updateNote(id, { title: newTitle })

        if (result.error) {
          console.error('Failed to rename note:', result.error)
          return
        }

        // Update in documents list
        const doc = this.documents.find((d) => d.id === id)
        if (doc) doc.title = newTitle

        // Update in tab if open
        const tab = this.tabs.find((t) => t.document.id === id)
        if (tab) tab.document.title = newTitle

        if (this.currentDocument?.id === id) {
          this.currentDocument.title = newTitle
        }
      } catch (error) {
        console.error('Error renaming document:', error)
      }
    },

    /**
     * Update table of contents
     */
    updateToc(toc: any[]) {
      this.toc = toc
    },

    /**
     * Get the current note content - combines live editor content with stored content
     * This is the primary method for getting note content for AI features
     */
    getCurrentNoteContent(): string {
      // Priority 1: Get content from the active tab (most up-to-date)
      const tab = this.activeTab
      if (tab?.document?.content) {
        return tab.document.content
      }

      // Priority 2: Get from currentDocument
      if (this.currentDocument?.content) {
        return this.currentDocument.content
      }

      return ''
    },

    /**
     * Start real-time sync for notes
     */
    startRealtimeSync() {
      const authStore = useAuthStore()
      if (!authStore.user?.id || this.isRealtimeSyncEnabled) return

      // Set flag BEFORE starting subscription to prevent race condition
      this.isRealtimeSyncEnabled = true

      notesUnsubscribe = subscriptionsService.subscribeToNotes(
        authStore.user.id,
        (event: NoteChangeEvent) => {
          this.handleNoteChange(event)
        }
      )

      console.log('Real-time sync started')
    },

    /**
     * Stop real-time sync
     */
    stopRealtimeSync() {
      if (notesUnsubscribe) {
        notesUnsubscribe()
        notesUnsubscribe = null
      }
      this.isRealtimeSyncEnabled = false
      console.log('Real-time sync stopped')
    },

    /**
     * Handle real-time note change events
     */
    handleNoteChange(event: NoteChangeEvent) {
      switch (event.type) {
        case 'INSERT':
          if (event.new) {
            // Add to documents list if not already there
            const exists = this.documents.find((d) => d.id === event.new!.id)
            if (!exists) {
              this.documents.unshift(event.new)
            }
          }
          break

        case 'UPDATE':
          if (event.new) {
            // Update in documents list
            const docIndex = this.documents.findIndex((d) => d.id === event.new!.id)
            if (docIndex !== -1) {
              this.documents[docIndex] = event.new
            }

            // Update in tabs if open (but not if currently saving to avoid conflicts)
            if (!this.isSaving) {
              const tab = this.tabs.find((t) => t.document.id === event.new!.id)
              if (tab) {
                // Only update if tab is saved (no local changes)
                if (tab.isSaved) {
                  tab.document = { ...event.new }
                }
              }

              // Update current document if it's the one being changed
              if (this.currentDocument?.id === event.new.id && this.activeTab?.isSaved) {
                this.currentDocument = { ...event.new }
              }
            }
          }
          break

        case 'DELETE':
          if (event.old) {
            // Remove from documents list
            this.documents = this.documents.filter((d) => d.id !== event.old!.id)

            // Close tab if open
            const tab = this.tabs.find((t) => t.document.id === event.old!.id)
            if (tab) {
              this.closeTab(tab.id)
            }
          }
          break
      }
    },
  },
})
