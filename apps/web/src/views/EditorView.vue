<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, nextTick, watch } from 'vue'
import { useEditorStore, useLayoutStore } from '@/stores'
import { useAIStore } from '@/stores/ai'
import { FileText, Plus, X, Clock } from 'lucide-vue-next'
import SideBar from '@/components/layout/SideBar.vue'
import EditorArea from '@/components/editor/EditorArea.vue'
import NoteOutline from '@/components/layout/NoteOutline.vue'
import AISidebar from '@/components/ai/AISidebar.vue'
import DiffActionBar from '@/components/ai/DiffActionBar.vue'
import NavigationDock from '@/components/ui/NavigationDock.vue'

const editorStore = useEditorStore()
const layoutStore = useLayoutStore()
const aiStore = useAIStore()

const isReady = ref(false)
const tabsContainerRef = ref(null)
const editorAreaRef = ref<InstanceType<typeof EditorArea> | null>(null)

const isSaved = computed(() => editorStore.activeTab?.isSaved ?? true)

// CSS variable for sidebar width (used in dock-area)
const sidebarWidthStyle = computed(() => ({
  '--sidebar-width': `${layoutStore.sidebarWidth}px`,
}))

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
      ;(tabsContainerRef.value as HTMLElement).scrollLeft = (
        tabsContainerRef.value as HTMLElement
      ).scrollWidth
    }
  })
}

watch(
  () => editorStore.activeTabId,
  () => {
    nextTick(() => {
      const activeEl = (tabsContainerRef.value as HTMLElement | null)?.querySelector('.tab.active')
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      }
    })
  }
)

// Accept/Reject all diffs via the editorAreaRef's exposed methods
function handleAcceptAllDiffs() {
  const editorArea = editorAreaRef.value
  if (editorArea && typeof (editorArea as any).acceptAllDiffs === 'function') {
    ;(editorArea as any).acceptAllDiffs()
  }
}

function handleRejectAllDiffs() {
  const editorArea = editorAreaRef.value
  if (editorArea && typeof (editorArea as any).rejectAllDiffs === 'function') {
    ;(editorArea as any).rejectAllDiffs()
  }
}

// Keyboard shortcuts for diff actions
function handleGlobalKeydown(event: KeyboardEvent) {
  // Accept All: Cmd/Ctrl + Shift + Enter
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'Enter') {
    const pendingCount = aiStore.diffBlocks.filter((b) => b.status === 'pending').length
    if (pendingCount > 0) {
      event.preventDefault()
      handleAcceptAllDiffs()
    }
  }

  // Reject All: Cmd/Ctrl + Shift + Escape
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'Escape') {
    const pendingCount = aiStore.diffBlocks.filter((b) => b.status === 'pending').length
    if (pendingCount > 0) {
      event.preventDefault()
      handleRejectAllDiffs()
    }
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleGlobalKeydown)

  await editorStore.loadDocuments()
  if (editorStore.documents.length === 0) {
    await editorStore.createDocument('Welcome to Inkdown')
  } else if (editorStore.documents[0]) {
    editorStore.openDocument(editorStore.documents[0])
  }
  isReady.value = true
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <div class="editor-view">
    <!-- Left Area: Header + Editor Body -->
    <div class="left-area">
      <!-- Full-Width Header: Dock Area + Tabs Bar -->
      <header
        class="editor-header"
        :class="{ 'sidebar-closed': !layoutStore.sidebarVisible }"
        :style="sidebarWidthStyle"
      >
        <!-- Dock Area - Width transitions based on sidebar state -->
        <div class="dock-area">
          <NavigationDock :pill-mode="!layoutStore.sidebarVisible" />
        </div>

        <!-- Tabs Bar - Fills remaining space, slides left when sidebar closes -->
        <div class="tabs-bar">
          <div
            ref="tabsContainerRef"
            class="tabs-container"
          >
            <button
              v-for="tab in editorStore.tabs"
              :key="tab.id"
              class="tab"
              :class="{ active: tab.id === editorStore.activeTabId }"
              @click="editorStore.switchTab(tab.id)"
            >
              <FileText
                :size="14"
                class="tab-icon"
              />
              <span class="tab-title">{{ tab.document.title }}</span>
              <span
                v-if="!tab.isSaved"
                class="tab-unsaved"
                >•</span
              >
              <button
                class="tab-close"
                @click.stop="editorStore.closeTab(tab.id)"
              >
                <X :size="12" />
              </button>
            </button>
          </div>
          <button
            class="new-tab-btn"
            title="New Document"
            @click="createNewDocument"
          >
            <Plus :size="16" />
          </button>
        </div>
      </header>

      <!-- Editor Body: Sidebar + Main Content side by side -->
      <div class="editor-body">
        <!-- Left Sidebar -->
        <SideBar v-if="isReady && layoutStore.sidebarVisible" />

        <!-- Main Content Area -->
        <main class="main-content">
          <!-- Note Container - Elevated Card -->
          <div class="note-container">
            <!-- Outline Button (on left side of note) -->
            <NoteOutline v-if="isReady && editorStore.currentDocument" />

            <!-- Status bar above note content -->
            <div
              v-if="isReady && editorStore.currentDocument"
              class="note-status"
            >
              <span class="meta-item">
                <Clock :size="12" />
                Updated {{ lastUpdated }}
              </span>
              <span
                class="status-badge"
                :class="{ saved: isSaved }"
              >
                {{ isSaved ? 'Saved' : 'Draft' }}
              </span>
              <span class="word-count">{{ wordCount }}</span>
            </div>

            <!-- Note Content -->
            <div class="note-content">
              <!-- Editor -->
              <EditorArea
                v-if="isReady && editorStore.currentDocument"
                ref="editorAreaRef"
              />

              <div
                v-else-if="!isReady"
                class="loading-state"
              >
                <div class="loading-spinner"></div>
                <p>Loading...</p>
              </div>
            </div>

            <!-- Diff Action Bar (floating Accept All / Deny All) - positioned within note canvas -->
            <DiffActionBar
              @accept-all="handleAcceptAllDiffs"
              @reject-all="handleRejectAllDiffs"
            />
          </div>
        </main>
      </div>
    </div>

    <!-- AI Sidebar (right panel) - Full height, outside left-area -->
    <Transition name="slide-right">
      <AISidebar
        v-if="layoutStore.rightPanelVisible && editorStore.currentDocument"
        :noteContext="{
          id: editorStore.currentDocument.id,
          title: editorStore.currentDocument.title,
        }"
      />
    </Transition>
  </div>
</template>

<style scoped>
.editor-view {
  display: flex;
  flex-direction: row; /* Changed from column to row for full-height AI sidebar */
  height: 100vh;
  width: 100vw;
  background: var(--app-bg, #f8fafc);
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  overflow: hidden;
}

/* Left Area: Contains header + editor body, flexes to fill available space */
.left-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100vh;
}

/* ============================================
 * FULL-WIDTH HEADER - Dock Area + Tabs Bar
 * Spans entire top of screen
 * ============================================ */

.editor-header {
  display: flex;
  align-items: center;
  height: 56px;
  flex-shrink: 0;
  padding: 8px 16px 8px 0;
  background: var(--app-bg, #f8fafc);
}

/* Dock Area - matches sidebar width when open, shrinks to auto when closed */
.dock-area {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--sidebar-width, 260px); /* Matches sidebar width dynamically */
  flex-shrink: 0;
  transition: width 0.25s ease;
}

/* Tabs Bar - fills remaining space, slides left as dock-area shrinks */
.tabs-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  padding-left: 16px; /* Align with note canvas */
}

/* ============================================
 * EDITOR BODY - Sidebar + Main Content row
 * ============================================ */

.editor-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Main Content Area - no longer contains header */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 0 16px 16px 16px;
  gap: 12px;
}

/* Note Status bar - positioned inside note container */
.note-status {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 8px 24px;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
  white-space: nowrap;
  flex-shrink: 0;
}

.tabs-container {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
  flex: 1;
  min-width: 0;
}

.tabs-container::-webkit-scrollbar {
  display: none;
}

/* Browser-style tabs - equal width distribution */
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #64748b);
  font-size: 13px;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.2s ease;
  flex: 1 1 0;
  min-width: 80px;
  max-width: 220px;
  overflow: hidden;
}

.tab:hover {
  background: rgba(255, 255, 255, 0.06);
}

.tab.active {
  background: rgba(255, 255, 255, 0.06);
  color: #58a6ff;
  font-weight: 500;
  box-shadow: none;
}

.tab-icon {
  flex-shrink: 0;
}

.tab-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-unsaved {
  color: #58a6ff;
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
  color: var(--text-color-secondary, #94a3b8);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.5;
  transition: all 0.15s;
}

.tab-close:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
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
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
  transition: all 0.15s;
}

.new-tab-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color, #e2e8f0);
}

/* Note Container - Elevated Card */
.note-container {
  flex: 1;
  background: var(--editorBgColor, var(--card-bg, #ffffff));
  border-radius: 16px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.04);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  min-height: 0;
}

/* Note Content - flex container for EditorArea */
.note-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  /* Allow overflow for diff hunks to be visible */
  overflow: visible;
  padding: 0;
  background: var(--editorBgColor, var(--card-bg, #ffffff));
  min-height: 0;
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
  color: #10b981;
  font-weight: 500;
}

.status-badge:not(.saved) {
  background: rgba(124, 158, 248, 0.1);
  color: var(--primary-color, #7c9ef8);
}

.word-count {
  color: var(--text-color-secondary, #94a3b8);
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: var(--text-color-secondary, #94a3b8);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color, #e2e8f0);
  border-top-color: var(--primary-color, #7c9ef8);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* AI Toggle Button */
.ai-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid var(--border-color, #e2e8f0);
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
  transition: all 0.2s ease;
  margin-left: 8px;
}

.ai-toggle-btn:hover {
  background: rgba(124, 158, 248, 0.1);
  border-color: var(--primary-color, #7c9ef8);
  color: var(--primary-color, #7c9ef8);
}

.ai-toggle-btn.active {
  background: linear-gradient(135deg, rgba(124, 158, 248, 0.15), rgba(167, 139, 250, 0.15));
  border-color: var(--primary-color, #7c9ef8);
  color: var(--primary-color, #7c9ef8);
}

/* Slide right transition for AI Sidebar */
.slide-right-enter-active,
.slide-right-leave-active {
  transition:
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.3s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .note-content {
    padding: 24px;
  }
}
</style>
