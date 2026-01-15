<script setup lang="ts">
/**
 * SideBar - Enhanced sidebar with tabbed panels
 * TypeScript component with Documents, TOC, and Search panels
 */
import { ref, computed, watch } from 'vue'
import { FileText, List, Search, Plus, ChevronLeft, ChevronRight, Trash2 } from 'lucide-vue-next'
import { useEditorStore, useLayoutStore } from '@/stores'
import { ElMessageBox } from 'element-plus'
import TableOfContents from './TableOfContents.vue'

type SidebarTab = 'documents' | 'toc' | 'search'

const editorStore = useEditorStore()
const layoutStore = useLayoutStore()

const searchQuery = ref('')
const activeTab = computed({
  get: () => layoutStore.activeSidebarPanel as SidebarTab,
  set: (val: SidebarTab) => layoutStore.setSidebarPanel(val)
})

const sidebarVisible = computed(() => layoutStore.sidebarVisible)
const sidebarWidth = computed(() => layoutStore.sidebarWidth)

const filteredDocuments = computed(() => {
  if (!searchQuery.value) return editorStore.documents
  const query = searchQuery.value.toLowerCase()
  return editorStore.documents.filter(doc =>
    doc.title.toLowerCase().includes(query)
  )
})

async function createNewDocument() {
  await editorStore.createDocument()
}

async function openDocument(doc: any) {
  editorStore.openDocument(doc)
}

async function deleteDocument(doc: any, e: Event) {
  e.stopPropagation()
  try {
    await ElMessageBox.confirm(
      `Delete "${doc.title}"? This cannot be undone.`,
      'Delete Document',
      { type: 'warning' }
    )
    await editorStore.deleteDocument(doc.id)
  } catch {
    // Cancelled
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  
  return date.toLocaleDateString()
}

function toggleSidebar() {
  layoutStore.toggleSidebar()
}

// Tab definitions
const tabs = [
  { id: 'documents' as SidebarTab, icon: FileText, label: 'Documents' },
  { id: 'toc' as SidebarTab, icon: List, label: 'Table of Contents' }
]
</script>

<template>
  <aside 
    class="sidebar" 
    :class="{ collapsed: !sidebarVisible }"
    :style="{ width: sidebarVisible ? `${sidebarWidth}px` : '48px' }"
  >
    <!-- Collapsed state - icon buttons -->
    <div class="sidebar-collapsed" v-if="!sidebarVisible">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="collapsed-tab-btn"
        :class="{ active: activeTab === tab.id }"
        :title="tab.label"
        @click="activeTab = tab.id; layoutStore.toggleSidebar()"
      >
        <component :is="tab.icon" :size="18" />
      </button>
      <div class="spacer"></div>
      <button class="collapsed-tab-btn" @click="toggleSidebar" title="Expand Sidebar">
        <ChevronRight :size="18" />
      </button>
    </div>
    
    <!-- Expanded state -->
    <div class="sidebar-expanded" v-else>
      <!-- Tab navigation -->
      <div class="sidebar-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-btn"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          <component :is="tab.icon" :size="16" />
          <span>{{ tab.label }}</span>
        </button>
        <div class="tab-spacer"></div>
        <button class="collapse-btn" @click="toggleSidebar" title="Collapse Sidebar">
          <ChevronLeft :size="16" />
        </button>
      </div>
      
      <!-- Documents Panel -->
      <div v-show="activeTab === 'documents'" class="panel documents-panel">
        <div class="panel-actions">
          <button class="new-btn" @click="createNewDocument">
            <Plus :size="16" />
            <span>New Document</span>
          </button>
        </div>
        
        <div class="panel-search">
          <Search :size="14" class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search documents..."
          />
        </div>
        
        <div class="document-list">
          <div
            v-for="doc in filteredDocuments"
            :key="doc.id"
            class="document-item"
            :class="{ active: editorStore.currentDocument?.id === doc.id }"
            @click="openDocument(doc)"
          >
            <FileText :size="16" class="doc-icon" />
            <div class="doc-info">
              <div class="doc-title">{{ doc.title }}</div>
              <div class="doc-meta">{{ formatDate(doc.updated_at) }}</div>
            </div>
            <button class="delete-btn" @click="deleteDocument(doc, $event)" title="Delete">
              <Trash2 :size="14" />
            </button>
          </div>
          
          <div v-if="filteredDocuments.length === 0" class="empty-state">
            <p v-if="searchQuery">No documents match your search</p>
            <p v-else>No documents yet</p>
          </div>
        </div>
      </div>
      
      <!-- TOC Panel -->
      <div v-show="activeTab === 'toc'" class="panel toc-panel">
        <TableOfContents />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  height: 100%;
  background: var(--sidebar-bg, #1e1e1e);
  border-right: 1px solid var(--border-color, #333);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
  flex-shrink: 0;
}

/* Collapsed state */
.sidebar-collapsed {
  display: flex;
  flex-direction: column;
  padding: 8px;
  height: 100%;
}

.collapsed-tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-bottom: 4px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-color-secondary, #888);
  cursor: pointer;
}

.collapsed-tab-btn:hover,
.collapsed-tab-btn.active {
  background: var(--float-hover-color, rgba(255, 255, 255, 0.1));
  color: var(--text-color, #fff);
}

.spacer {
  flex: 1;
}

/* Expanded state */
.sidebar-expanded {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-tabs {
  display: flex;
  padding: 8px;
  gap: 4px;
  border-bottom: 1px solid var(--border-color, #333);
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-color-secondary, #888);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.tab-btn:hover {
  background: var(--float-hover-color, rgba(255, 255, 255, 0.05));
  color: var(--text-color, #fff);
}

.tab-btn.active {
  background: var(--primary-color, #65b9f4);
  color: #fff;
}

.tab-spacer {
  flex: 1;
}

.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-color-secondary, #888);
  cursor: pointer;
}

.collapse-btn:hover {
  background: var(--float-hover-color);
  color: var(--text-color);
}

/* Panels */
.panel {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Documents Panel */
.documents-panel {
  padding: 0;
}

.panel-actions {
  padding: 12px;
}

.new-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  background: var(--primary-color, #65b9f4);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.new-btn:hover {
  background: var(--primary-hover, #4da3e0);
}

.panel-search {
  position: relative;
  padding: 0 12px 12px;
}

.search-icon {
  position: absolute;
  left: 22px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-color-secondary, #666);
  pointer-events: none;
}

.panel-search input {
  width: 100%;
  padding: 8px 12px 8px 32px;
  background: var(--bg-color, #252525);
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  color: var(--text-color, #fff);
  font-size: 13px;
}

.panel-search input:focus {
  outline: none;
  border-color: var(--primary-color, #65b9f4);
}

.panel-search input::placeholder {
  color: var(--text-color-secondary, #666);
}

.document-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
}

.document-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.document-item:hover {
  background: var(--float-hover-color, rgba(255, 255, 255, 0.05));
}

.document-item:hover .delete-btn {
  opacity: 1;
}

.document-item.active {
  background: var(--selection-bg, rgba(101, 185, 244, 0.15));
}

.doc-icon {
  color: var(--text-color-secondary, #888);
  flex-shrink: 0;
}

.doc-info {
  flex: 1;
  min-width: 0;
}

.doc-title {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-meta {
  font-size: 11px;
  color: var(--text-color-secondary, #888);
  margin-top: 2px;
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #888);
  border-radius: 4px;
  opacity: 0;
  cursor: pointer;
  transition: all 0.15s;
}

.delete-btn:hover {
  background: rgba(255, 0, 0, 0.15);
  color: #ff6b6b;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-color-secondary, #888);
  font-size: 13px;
}

/* TOC Panel */
.toc-panel {
  overflow: hidden;
}

.toc-panel :deep(.toc-panel) {
  height: 100%;
}
</style>
