<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue'
import { useEditorStore } from '@/stores'
import { FileText, Plus, X, Save } from 'lucide-vue-next'

const editorStore = useEditorStore()
const tabsContainerRef = ref<HTMLElement | null>(null)

const isSaved = computed(() => editorStore.activeTab?.isSaved ?? true)

const wordCount = computed(() => {
  const wc = editorStore.wordCount
  return `${wc.words} words`
})

async function saveDocument() {
  await editorStore.saveDocument()
}

function createNewDocument() {
  editorStore.createDocument('Untitled')
  // Scroll to show new tab
  nextTick(() => {
    if (tabsContainerRef.value) {
      tabsContainerRef.value.scrollLeft = tabsContainerRef.value.scrollWidth
    }
  })
}

// Auto-scroll to active tab when it changes
watch(() => editorStore.activeTabId, () => {
  nextTick(() => {
    const activeEl = tabsContainerRef.value?.querySelector('.tab.active')
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  })
})
</script>

<template>
  <header class="tab-banner">
    <!-- Left Zone: Save + Word Count -->
    <div class="left-zone">
      <button
        class="save-btn"
        :class="{ saved: isSaved }"
        :disabled="isSaved || editorStore.isSaving"
        @click="saveDocument"
        :title="isSaved ? 'Saved' : 'Save (Cmd+S)'"
      >
        <Save :size="16" />
      </button>
      <span class="word-count">{{ wordCount }}</span>
    </div>

    <!-- Tabs Zone -->
    <div class="tabs-zone" ref="tabsContainerRef">
      <!-- Tabs -->
      <div
        v-for="(tab, index) in editorStore.tabs"
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
      </div>
      
      <!-- New Tab Button -->
      <button class="new-tab-btn" @click="createNewDocument" title="New Document">
        <Plus :size="16" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.tab-banner {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 12px;
  background: transparent; /* Same as card bg */
  border-bottom: 1px solid var(--border-color);
  user-select: none;
  flex-shrink: 0;
}

/* Left Zone */
.left-zone {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 12px;
  margin-right: 8px;
  border-right: 1px solid var(--border-color);
  min-width: fit-content;
}

.save-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-color-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.save-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.save-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.save-btn.saved {
  color: var(--success-color, #52c41a);
}

.word-count {
  font-size: 12px;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

/* Tabs Zone */
.tabs-zone {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0;
  overflow-x: auto;
  scroll-behavior: smooth;
}

/* Hide scrollbar but allow scrolling */
.tabs-zone::-webkit-scrollbar {
  height: 0;
}

/* Individual Tab */
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 14px;
  min-width: 100px;
  max-width: 180px;
  cursor: pointer;
  border-right: 1px solid var(--border-color);
  transition: background 0.1s ease;
  position: relative;
}

.tab:hover {
  background: rgba(255, 255, 255, 0.03);
}

.tab.active {
  background: rgba(255, 255, 255, 0.06);
}

/* Active indicator line */
.tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 12px;
  right: 12px;
  height: 2px;
  background: var(--primary-color);
  border-radius: 2px 2px 0 0;
}

/* Tab Elements */
.tab-icon {
  flex-shrink: 0;
  color: var(--text-color-secondary);
}

.tab.active .tab-icon {
  color: var(--primary-color);
}

.tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.tab.active .tab-title {
  color: var(--text-color);
}

.tab-unsaved {
  color: var(--primary-color);
  font-size: 18px;
  line-height: 1;
  margin-left: -2px;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  border-radius: 4px;
  opacity: 0;
  transition: all 0.1s ease;
  flex-shrink: 0;
}

.tab:hover .tab-close,
.tab.active .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-color);
}

/* New Tab Button */
.new-tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-left: 4px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-color-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.new-tab-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color);
}
</style>
