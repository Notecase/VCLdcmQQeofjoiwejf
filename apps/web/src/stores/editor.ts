import { defineStore } from 'pinia'
import { documentService } from '@/services'
import type { Document, Tab, WordCount, CursorPosition } from '@/types'

interface EditorState {
  // Current active document
  currentDocument: Document | null

  // All open tabs
  tabs: Tab[]

  // Active tab ID
  activeTabId: string | null

  // Document list (sidebar)
  documents: Document[]

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
}

export const useEditorStore = defineStore('editor', {
  state: (): EditorState => ({
    currentDocument: null,
    tabs: [],
    activeTabId: null,
    documents: [],
    isSaving: false,
    lastSaved: null,
    wordCount: { words: 0, characters: 0, paragraphs: 0 },
    toc: [],
    isLoading: false,
    isLoadingDocuments: false
  }),

  getters: {
    activeTab: (state): Tab | undefined => {
      return state.tabs.find(t => t.id === state.activeTabId)
    },

    hasUnsavedChanges: (state): boolean => {
      return state.tabs.some(t => !t.isSaved)
    },

    openDocumentIds: (state): string[] => {
      return state.tabs.map(t => t.document.id)
    },

    tableOfContents: (state): any[] => {
      return state.toc
    }
  },

  actions: {
    /**
     * Load all documents for the sidebar
     */
    async loadDocuments() {
      this.isLoadingDocuments = true
      try {
        this.documents = await documentService.list()
      } finally {
        this.isLoadingDocuments = false
      }
    },

    /**
     * Create a new document and open it
     */
    async createDocument(title: string = 'Untitled') {
      const doc = await documentService.create({ title, content: '' })
      this.documents.unshift(doc)
      this.openDocument(doc)
      return doc
    },

    /**
     * Open a document in a new tab or switch to existing tab
     */
    openDocument(doc: Document) {
      // Check if already open
      const existingTab = this.tabs.find(t => t.document.id === doc.id)
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
        isActive: true
      }

      // Deactivate other tabs
      this.tabs.forEach(t => t.isActive = false)

      this.tabs.push(tab)
      this.activeTabId = tab.id
      this.currentDocument = tab.document
    },

    /**
     * Load and open a document by ID
     */
    async loadDocument(id: string) {
      this.isLoading = true
      try {
        const doc = await documentService.get(id)
        if (doc) {
          this.openDocument(doc)
        }
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
        }
      }

      if (this.currentDocument) {
        this.currentDocument.content = markdown
      }
    },

    /**
     * Update cursor position
     */
    updateCursor(cursor: CursorPosition) {
      const tab = this.activeTab
      if (tab) {
        tab.document.cursor = cursor
      }
      if (this.currentDocument) {
        this.currentDocument.cursor = cursor
      }
    },

    /**
     * Save the active document
     */
    async saveDocument() {
      const tab = this.activeTab
      if (!tab || tab.isSaved) return

      this.isSaving = true
      try {
        await documentService.update(tab.document.id, {
          content: tab.document.content,
          title: tab.document.title,
          word_count: tab.document.word_count,
          cursor: tab.document.cursor
        })

        tab.isSaved = true
        this.lastSaved = new Date()

        // Update in documents list
        const docIndex = this.documents.findIndex(d => d.id === tab.document.id)
        if (docIndex !== -1) {
          this.documents[docIndex] = { ...tab.document }
        }
      } finally {
        this.isSaving = false
      }
    },

    /**
     * Close a tab
     */
    closeTab(tabId: string) {
      const index = this.tabs.findIndex(t => t.id === tabId)
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
      const tab = this.tabs.find(t => t.id === tabId)
      if (tab) {
        this.tabs.forEach(t => t.isActive = false)
        tab.isActive = true
        this.activeTabId = tabId
        this.currentDocument = tab.document
      }
    },

    /**
     * Delete a document
     */
    async deleteDocument(id: string) {
      await documentService.delete(id)

      // Remove from documents list
      this.documents = this.documents.filter(d => d.id !== id)

      // Close tab if open
      this.closeTab(id)
    },

    /**
     * Rename a document
     */
    async renameDocument(id: string, newTitle: string) {
      await documentService.update(id, { title: newTitle })

      // Update in documents list
      const doc = this.documents.find(d => d.id === id)
      if (doc) doc.title = newTitle

      // Update in tab if open
      const tab = this.tabs.find(t => t.document.id === id)
      if (tab) tab.document.title = newTitle

      if (this.currentDocument?.id === id) {
        this.currentDocument.title = newTitle
      }
    },

    /**
     * Update table of contents
     */
    updateToc(toc: any[]) {
      this.toc = toc
    }
  }
})
