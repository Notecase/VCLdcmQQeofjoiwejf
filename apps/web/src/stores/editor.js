import { defineStore } from 'pinia';
import * as notesService from '@/services/notes.service';
import * as subscriptionsService from '@/services/subscriptions.service';
import { isServicesInitialized } from '@/services';
import { useAuthStore } from './auth';
// Store unsubscribe function outside state (not reactive)
let notesUnsubscribe = null;
export const useEditorStore = defineStore('editor', {
    state: () => ({
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
        isRealtimeSyncEnabled: false
    }),
    getters: {
        activeTab: (state) => {
            return state.tabs.find(t => t.id === state.activeTabId);
        },
        hasUnsavedChanges: (state) => {
            return state.tabs.some(t => !t.isSaved);
        },
        openDocumentIds: (state) => {
            return state.tabs.map(t => t.document.id);
        },
        tableOfContents: (state) => {
            return state.toc;
        }
    },
    actions: {
        /**
         * Load all notes for the sidebar (includes both general and project notes)
         */
        async loadDocuments() {
            this.isLoadingDocuments = true;
            try {
                if (!isServicesInitialized()) {
                    console.warn('Services not initialized, using empty list');
                    this.documents = [];
                    return;
                }
                const authStore = useAuthStore();
                if (!authStore.user?.id) {
                    // Not authenticated, load from local storage or empty
                    this.documents = [];
                    return;
                }
                // Load ALL notes (general + project notes) for sidebar display
                const result = await notesService.getNotes(authStore.user.id);
                if (result.error) {
                    console.error('Failed to load notes:', result.error);
                    this.documents = [];
                }
                else {
                    this.documents = result.data || [];
                    // Start real-time sync after initial load
                    this.startRealtimeSync();
                }
            }
            catch (error) {
                console.error('Error loading documents:', error);
                this.documents = [];
            }
            finally {
                this.isLoadingDocuments = false;
            }
        },
        /**
         * Create a new document and open it
         * @param projectId - Optional project ID to create the note in (mutually exclusive with parentNoteId)
         * @param title - Optional title for the note (defaults to 'Untitled')
         * @param parentNoteId - Optional parent note ID to create as subnote (mutually exclusive with projectId)
         */
        async createDocument(projectId, title = 'Untitled', parentNoteId) {
            const authStore = useAuthStore();
            if (!authStore.user?.id) {
                console.warn('Cannot create document: user not authenticated');
                return null;
            }
            try {
                // Note: project_id and parent_note_id are mutually exclusive
                const result = await notesService.createNote(authStore.user.id, {
                    title,
                    content: '',
                    project_id: parentNoteId ? undefined : (projectId || undefined),
                    parent_note_id: parentNoteId || undefined
                });
                if (result.error) {
                    console.error('Failed to create note:', result.error);
                    return null;
                }
                const doc = Array.isArray(result.data) ? result.data[0] : result.data;
                if (doc) {
                    this.documents.unshift(doc);
                    this.openDocument(doc);
                }
                return doc;
            }
            catch (error) {
                console.error('Error creating document:', error);
                return null;
            }
        },
        /**
         * Open a document in a new tab or switch to existing tab
         */
        openDocument(doc) {
            // Check if already open
            const existingTab = this.tabs.find(t => t.document.id === doc.id);
            if (existingTab) {
                this.activeTabId = existingTab.id;
                this.currentDocument = doc;
                return;
            }
            // Create new tab
            const tab = {
                id: doc.id,
                document: { ...doc },
                isSaved: true,
                isActive: true
            };
            // Deactivate other tabs
            this.tabs.forEach(t => t.isActive = false);
            this.tabs.push(tab);
            this.activeTabId = tab.id;
            this.currentDocument = tab.document;
        },
        /**
         * Load and open a document by ID
         */
        async loadDocument(id) {
            this.isLoading = true;
            try {
                const result = await notesService.getNote(id);
                if (result.data && result.data[0]) {
                    this.openDocument(result.data[0]);
                }
            }
            catch (error) {
                console.error('Error loading document:', error);
            }
            finally {
                this.isLoading = false;
            }
        },
        /**
         * Update content for the active document
         */
        updateContent(markdown, wordCount) {
            const tab = this.activeTab;
            if (tab) {
                tab.document.content = markdown;
                tab.isSaved = false;
                if (wordCount) {
                    this.wordCount = wordCount;
                    tab.document.word_count = wordCount.words;
                    tab.document.character_count = wordCount.characters;
                }
            }
            if (this.currentDocument) {
                this.currentDocument.content = markdown;
            }
        },
        /**
         * Update cursor position
         */
        updateCursor(cursor) {
            const tab = this.activeTab;
            if (tab && tab.document.editor_state) {
                tab.document.editor_state.cursor = cursor;
            }
            if (this.currentDocument && this.currentDocument.editor_state) {
                this.currentDocument.editor_state.cursor = cursor;
            }
        },
        /**
         * Save the active document
         */
        async saveDocument() {
            const tab = this.activeTab;
            if (!tab || tab.isSaved)
                return;
            this.isSaving = true;
            try {
                const result = await notesService.updateNote(tab.document.id, {
                    content: tab.document.content,
                    title: tab.document.title,
                    word_count: tab.document.word_count,
                    character_count: tab.document.character_count,
                    editor_state: tab.document.editor_state
                });
                if (result.error) {
                    console.error('Failed to save note:', result.error);
                    return;
                }
                tab.isSaved = true;
                this.lastSaved = new Date();
                // Update in documents list
                const docIndex = this.documents.findIndex(d => d.id === tab.document.id);
                if (docIndex !== -1) {
                    this.documents[docIndex] = { ...tab.document };
                }
            }
            catch (error) {
                console.error('Error saving document:', error);
            }
            finally {
                this.isSaving = false;
            }
        },
        /**
         * Close a tab
         */
        closeTab(tabId) {
            const index = this.tabs.findIndex(t => t.id === tabId);
            if (index === -1)
                return;
            this.tabs.splice(index, 1);
            // Switch to another tab if closing active
            if (this.activeTabId === tabId) {
                if (this.tabs.length > 0) {
                    const newIndex = Math.min(index, this.tabs.length - 1);
                    const newTab = this.tabs[newIndex];
                    if (newTab) {
                        this.activeTabId = newTab.id;
                        this.currentDocument = newTab.document;
                    }
                }
                else {
                    this.activeTabId = null;
                    this.currentDocument = null;
                }
            }
        },
        /**
         * Switch to a tab
         */
        switchTab(tabId) {
            const tab = this.tabs.find(t => t.id === tabId);
            if (tab) {
                this.tabs.forEach(t => t.isActive = false);
                tab.isActive = true;
                this.activeTabId = tabId;
                this.currentDocument = tab.document;
            }
        },
        /**
         * Delete a document
         */
        async deleteDocument(id) {
            try {
                const result = await notesService.deleteNote(id);
                if (result.error) {
                    console.error('Failed to delete note:', result.error);
                    return;
                }
                // Remove from documents list
                this.documents = this.documents.filter(d => d.id !== id);
                // Close tab if open
                this.closeTab(id);
            }
            catch (error) {
                console.error('Error deleting document:', error);
            }
        },
        /**
         * Rename a document
         */
        async renameDocument(id, newTitle) {
            try {
                const result = await notesService.updateNote(id, { title: newTitle });
                if (result.error) {
                    console.error('Failed to rename note:', result.error);
                    return;
                }
                // Update in documents list
                const doc = this.documents.find(d => d.id === id);
                if (doc)
                    doc.title = newTitle;
                // Update in tab if open
                const tab = this.tabs.find(t => t.document.id === id);
                if (tab)
                    tab.document.title = newTitle;
                if (this.currentDocument?.id === id) {
                    this.currentDocument.title = newTitle;
                }
            }
            catch (error) {
                console.error('Error renaming document:', error);
            }
        },
        /**
         * Update table of contents
         */
        updateToc(toc) {
            this.toc = toc;
        },
        /**
         * Start real-time sync for notes
         */
        startRealtimeSync() {
            const authStore = useAuthStore();
            if (!authStore.user?.id || this.isRealtimeSyncEnabled)
                return;
            notesUnsubscribe = subscriptionsService.subscribeToNotes(authStore.user.id, (event) => {
                this.handleNoteChange(event);
            });
            this.isRealtimeSyncEnabled = true;
            console.log('Real-time sync started');
        },
        /**
         * Stop real-time sync
         */
        stopRealtimeSync() {
            if (notesUnsubscribe) {
                notesUnsubscribe();
                notesUnsubscribe = null;
            }
            this.isRealtimeSyncEnabled = false;
            console.log('Real-time sync stopped');
        },
        /**
         * Handle real-time note change events
         */
        handleNoteChange(event) {
            switch (event.type) {
                case 'INSERT':
                    if (event.new) {
                        // Add to documents list if not already there
                        const exists = this.documents.find(d => d.id === event.new.id);
                        if (!exists) {
                            this.documents.unshift(event.new);
                        }
                    }
                    break;
                case 'UPDATE':
                    if (event.new) {
                        // Update in documents list
                        const docIndex = this.documents.findIndex(d => d.id === event.new.id);
                        if (docIndex !== -1) {
                            this.documents[docIndex] = event.new;
                        }
                        // Update in tabs if open (but not if currently saving to avoid conflicts)
                        if (!this.isSaving) {
                            const tab = this.tabs.find(t => t.document.id === event.new.id);
                            if (tab) {
                                // Only update if tab is saved (no local changes)
                                if (tab.isSaved) {
                                    tab.document = { ...event.new };
                                }
                            }
                            // Update current document if it's the one being changed
                            if (this.currentDocument?.id === event.new.id && this.activeTab?.isSaved) {
                                this.currentDocument = { ...event.new };
                            }
                        }
                    }
                    break;
                case 'DELETE':
                    if (event.old) {
                        // Remove from documents list
                        this.documents = this.documents.filter(d => d.id !== event.old.id);
                        // Close tab if open
                        const tab = this.tabs.find(t => t.document.id === event.old.id);
                        if (tab) {
                            this.closeTab(tab.id);
                        }
                    }
                    break;
            }
        }
    }
});
