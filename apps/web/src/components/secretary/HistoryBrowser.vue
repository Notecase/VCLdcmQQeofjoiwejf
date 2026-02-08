<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useSecretaryStore } from '@/stores/secretary'
import { FileText, Clock } from 'lucide-vue-next'

const store = useSecretaryStore()
const router = useRouter()

function openEntry(filename: string) {
  store.selectedFilename = filename
}

function backToDashboard() {
  store.selectedFilename = null
  router.push('/calendar')
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function extractDate(filename: string): string {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : filename
}
</script>

<template>
  <div class="history-browser">
    <div class="history-header">
      <h3>History</h3>
      <button class="back-btn" @click="backToDashboard">
        Back to Dashboard
      </button>
    </div>

    <p class="history-note">
      Archived daily plans used to compute dashboard completion and streak analytics.
    </p>

    <div v-if="store.historyEntries.length === 0" class="empty-state">
      No archived daily plans yet.
    </div>

    <div v-else class="history-list">
      <button
        v-for="entry in store.historyEntries"
        :key="entry.filename"
        class="history-entry"
        @click="openEntry(entry.filename)"
      >
        <FileText :size="14" class="entry-icon" />
        <div class="entry-info">
          <span class="entry-date">{{ extractDate(entry.filename) }}</span>
          <span class="entry-filename">{{ entry.filename }}</span>
        </div>
        <span v-if="entry.updatedAt" class="entry-meta">
          <Clock :size="10" />
          {{ formatDate(entry.updatedAt) }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.history-browser {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.history-note {
  margin: 0;
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
}

.back-btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #333338);
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.04);
}

.empty-state {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  text-align: center;
  padding: 24px 0;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
  width: 100%;
}

.history-entry:hover {
  background: rgba(255, 255, 255, 0.04);
}

.entry-icon {
  flex-shrink: 0;
  color: var(--text-color-secondary, #94a3b8);
}

.entry-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.entry-date {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color, #e2e8f0);
}

.entry-filename {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.7;
  flex-shrink: 0;
}
</style>
