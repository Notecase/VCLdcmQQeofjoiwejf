<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSecretaryStore } from '@/stores/secretary'
import { FileText, Folder, Clock, History } from 'lucide-vue-next'

const store = useSecretaryStore()
const router = useRouter()
const route = useRoute()

const inHistoryRoute = computed(() => route.path === '/calendar/history')
const inPlansRoute = computed(() => route.path === '/calendar/plans')

function selectRootFile(filename: string) {
  if (store.selectedFilename === filename && route.path === '/calendar') {
    store.selectedFilename = null
    return
  }
  store.selectedFilename = filename
  if (route.path !== '/calendar') {
    router.push('/calendar')
  }
}

function openHistoryFolder() {
  store.selectedFilename = null
  if (route.path !== '/calendar/history') {
    router.push('/calendar/history')
  }
}

function openPlansFolder() {
  store.selectedFilename = null
  if (route.path !== '/calendar/plans') {
    router.push('/calendar/plans')
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString()
}
</script>

<template>
  <div class="memory-file-list">
    <h3 class="list-title">Memory Files</h3>
    <div class="file-list">
      <button
        v-for="file in store.rootMemoryFiles"
        :key="file.filename"
        class="file-item"
        :class="{ active: store.selectedFilename === file.filename }"
        @click="selectRootFile(file.filename)"
      >
        <FileText
          :size="14"
          class="file-icon"
        />
        <div class="file-info">
          <span class="file-name">{{ file.filename }}</span>
          <span class="file-meta">
            <Clock :size="10" />
            {{ formatDate(file.updatedAt) }}
          </span>
        </div>
      </button>
    </div>

    <div class="history-divider" />
    <button
      class="file-item history-item"
      :class="{ active: inHistoryRoute }"
      @click="openHistoryFolder"
    >
      <History
        :size="14"
        class="file-icon"
      />
      <div class="file-info">
        <span class="file-name">History</span>
        <span class="file-meta">Archived daily plans</span>
      </div>
    </button>

    <button
      class="file-item history-item"
      :class="{ active: inPlansRoute }"
      @click="openPlansFolder"
    >
      <Folder
        :size="14"
        class="file-icon"
      />
      <div class="file-info">
        <span class="file-name">Plans</span>
        <span class="file-meta">Roadmap archives</span>
      </div>
    </button>
  </div>
</template>

<style scoped>
.memory-file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

.list-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
  padding: 0 8px;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
  width: 100%;
}

.file-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.file-item.active {
  background: rgba(124, 158, 248, 0.1);
}

.file-icon {
  flex-shrink: 0;
  color: var(--text-color-secondary, #94a3b8);
}

.file-item.active .file-icon {
  color: var(--primary-color, #7c9ef8);
}

.file-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.file-name {
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.7;
}

.history-divider {
  height: 1px;
  background: var(--border-color, #333338);
  margin: 6px 8px;
}

.history-item {
  margin-top: 2px;
}
</style>
