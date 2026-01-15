<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEditorStore } from '@/stores'
import { ElMessageBox } from 'element-plus'

const editorStore = useEditorStore()

const isSidebarCollapsed = ref(false)
const searchQuery = ref('')

const filteredDocuments = computed(() => {
  if (!searchQuery.value) return editorStore.documents
  const query = searchQuery.value.toLowerCase()
  return editorStore.documents.filter(doc =>
    doc.title.toLowerCase().includes(query)
  )
})

async function createNewDocument() {
  const doc = await editorStore.createDocument()
  // Could prompt for title here
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
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: isSidebarCollapsed }">
    <div class="sidebar-header">
      <div class="sidebar-title" v-if="!isSidebarCollapsed">
        Documents
      </div>
      <button class="toggle-btn" @click="isSidebarCollapsed = !isSidebarCollapsed">
        <span>{{ isSidebarCollapsed ? '→' : '←' }}</span>
      </button>
    </div>

    <div class="sidebar-actions" v-if="!isSidebarCollapsed">
      <button class="new-btn" @click="createNewDocument">
        + New Document
      </button>
    </div>

    <div class="sidebar-search" v-if="!isSidebarCollapsed">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search documents..."
      />
    </div>

    <div class="document-list" v-if="!isSidebarCollapsed">
      <div
        v-for="doc in filteredDocuments"
        :key="doc.id"
        class="document-item"
        :class="{ active: editorStore.currentDocument?.id === doc.id }"
        @click="openDocument(doc)"
      >
        <div class="doc-info">
          <div class="doc-title">{{ doc.title }}</div>
          <div class="doc-meta">{{ formatDate(doc.updated_at) }}</div>
        </div>
        <button class="delete-btn" @click="deleteDocument(doc, $event)">×</button>
      </div>

      <div v-if="filteredDocuments.length === 0" class="empty-state">
        <p v-if="searchQuery">No documents match your search</p>
        <p v-else>No documents yet</p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px;
  height: 100%;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition: width 0.2s;
}

.sidebar.collapsed {
  width: 48px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-title {
  font-weight: 600;
  font-size: 14px;
}

.toggle-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  border-radius: 4px;
  
  &:hover {
    background: var(--border-color);
  }
}

.sidebar-actions {
  padding: 12px;
}

.new-btn {
  width: 100%;
  padding: 10px 16px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  
  &:hover {
    background: var(--primary-hover);
  }
}

.sidebar-search {
  padding: 0 12px 12px;
  
  input {
    width: 100%;
    padding: 8px 12px;
    background: var(--bg-color);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-color);
    font-size: 13px;
    
    &:focus {
      outline: none;
      border-color: var(--primary-color);
    }
    
    &::placeholder {
      color: var(--text-color-secondary);
    }
  }
}

.document-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
}

.document-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  
  &:hover {
    background: var(--bg-color);
    
    .delete-btn {
      opacity: 1;
    }
  }
  
  &.active {
    background: var(--selection-bg);
  }
}

.doc-info {
  flex: 1;
  min-width: 0;
}

.doc-title {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-meta {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 2px;
}

.delete-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.15s;
  
  &:hover {
    background: rgba(255, 0, 0, 0.1);
    color: #ff4444;
  }
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 13px;
}
</style>
