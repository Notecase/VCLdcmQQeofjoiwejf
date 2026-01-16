<script setup lang="ts">
import { onMounted, ref, computed, nextTick, watch } from 'vue'
import { useEditorStore } from '@/stores'
import { FileText, Plus, X, Clock } from 'lucide-vue-next'
import SideBar from '@/components/layout/SideBar.vue'
import EditorArea from '@/components/editor/EditorArea.vue'
import NoteOutline from '@/components/layout/NoteOutline.vue'

const editorStore = useEditorStore()

const isReady = ref(false)
const tabsContainerRef = ref(null)

const isSaved = computed(() => editorStore.activeTab?.isSaved ?? true)

const wordCount = computed(() => {
  const wc = editorStore.wordCount
  return `${wc.words} words`
})

const lastUpdated = computed(() => {
  const doc = editorStore.currentDocument
  if (!doc?.updated_at) return ''
  const date = new Date(doc.updated_at)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return date.toLocaleDateString()
})

function createNewDocument() {
  editorStore.createDocument('Untitled')
  nextTick(() => {
    if (tabsContainerRef.value) {
      (tabsContainerRef.value as HTMLElement).scrollLeft = (tabsContainerRef.value as HTMLElement).scrollWidth
    }
  })
}

watch(() => editorStore.activeTabId, () => {
  nextTick(() => {
    const activeEl = (tabsContainerRef.value as HTMLElement | null)?.querySelector('.tab.active')
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  })
})

onMounted(async () => {
  await editorStore.loadDocuments()
  if (editorStore.documents.length === 0) {
    await editorStore.createDocument('Welcome to Inkdown')
  } else if (editorStore.documents[0]) {
    editorStore.openDocument(editorStore.documents[0])
  }
  isReady.value = true
})
</script>

<template>
  <div class="editor-view">
    <!-- Left Sidebar -->
    <SideBar v-if="isReady" />

    <!-- Main Content Area -->
    <main class="main-content">
      <!-- Tabs Bar -->
      <div class="tabs-bar">
        <div class="tabs-container" ref="tabsContainerRef">
          <button
            v-for="tab in editorStore.tabs"
            :key="tab.id"
            class="tab"
            :class="{ active: tab.id === editorStore.activeTabId }"
            @click="editorStore.switchTab(tab.id)"
          >
            <FileText :size="14" class="tab-icon" />
            <span class="tab-title">{{ tab.document.title }}</span>
            <span v-if="!tab.isSaved" class="tab-unsaved">•</span>
            <button class="tab-close" @click.stop="editorStore.closeTab(tab.id)">
              <X :size="12" />
            </button>
          </button>
        </div>
        <button class="new-tab-btn" @click="createNewDocument" title="New Document">
          <Plus :size="16" />
        </button>
        
        <!-- Metadata in tabs bar -->
        <div class="tabs-meta" v-if="isReady && editorStore.currentDocument">
          <span class="meta-item">
            <Clock :size="12" />
            Updated {{ lastUpdated }}
          </span>
          <span class="status-badge" :class="{ saved: isSaved }">
            {{ isSaved ? 'Saved' : 'Draft' }}
          </span>
          <span class="word-count">{{ wordCount }}</span>
        </div>
      </div>

      <!-- Note Container - Elevated Card -->
      <div class="note-container">
        <!-- Outline Button (on left side of note) -->
        <NoteOutline v-if="isReady && editorStore.currentDocument" />

        <!-- Note Content -->
        <div class="note-content">
          <!-- Editor -->
          <EditorArea v-if="isReady && editorStore.currentDocument" />
          
          <div v-else-if="!isReady" class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.editor-view {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: var(--app-bg, #F8FAFC);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
}

/* Main Content Area */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px;
  gap: 12px;
}

/* Tabs Bar */
.tabs-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 16px;
}

.tabs-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  color: var(--text-color-secondary, #94A3B8);
  font-size: 12px;
  white-space: nowrap;
}

.tabs-container {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs-container::-webkit-scrollbar {
  display: none;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #64748B);
  font-size: 13px;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.tab:hover {
  background: rgba(255, 255, 255, 0.5);
}

.tab.active {
  background: var(--card-bg, #FFFFFF);
  color: var(--primary-color, #7C9EF8);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.tab-icon {
  flex-shrink: 0;
}

.tab-title {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-unsaved {
  color: var(--primary-color, #7C9EF8);
  font-size: 16px;
  line-height: 1;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #94A3B8);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.5;
  transition: all 0.15s;
}

.tab-close:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.1);
}

.new-tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #94A3B8);
  cursor: pointer;
  transition: all 0.15s;
}

.new-tab-btn:hover {
  background: rgba(255, 255, 255, 0.5);
  color: var(--text-color, #334155);
}

/* Note Container - Elevated Card */
.note-container {
  flex: 1;
  background: var(--editorBgColor, var(--card-bg, #FFFFFF));
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

/* Note Content */
.note-content {
  flex: 1;
  overflow-y: auto;
  padding: 40px 80px;
  background: var(--editorBgColor, var(--card-bg, #FFFFFF));
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(52, 211, 153, 0.15);
  color: #10B981;
  font-weight: 500;
}

.status-badge:not(.saved) {
  background: rgba(124, 158, 248, 0.1);
  color: var(--primary-color, #7C9EF8);
}

.word-count {
  color: var(--text-color-secondary, #94A3B8);
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: var(--text-color-secondary, #94A3B8);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color, #E2E8F0);
  border-top-color: var(--primary-color, #7C9EF8);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .note-content {
    padding: 24px;
  }
}
</style>
