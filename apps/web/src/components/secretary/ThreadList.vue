<script setup lang="ts">
import { computed } from 'vue'
import { useSecretaryStore } from '@/stores/secretary'
import { MessageSquare, Plus, Clock, Trash2 } from 'lucide-vue-next'
import type { SecretaryThread } from '@inkdown/shared/types'

const store = useSecretaryStore()

const threads = computed<SecretaryThread[]>(() =>
  [...store.threads].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
)

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

function handleDelete(e: Event, threadId: string) {
  e.stopPropagation()
  store.deleteThread(threadId)
}
</script>

<template>
  <div class="thread-list">
    <div class="thread-header">
      <span class="thread-title">Conversations</span>
      <button
        class="new-chat-btn"
        title="New conversation"
        @click="store.createNewThread()"
      >
        <Plus :size="14" />
        <span>New Chat</span>
      </button>
    </div>

    <div class="thread-items">
      <button
        v-for="thread in threads"
        :key="thread.threadId"
        class="thread-item"
        :class="{ active: store.activeThreadId === thread.threadId }"
        @click="store.loadThread(thread.threadId)"
      >
        <MessageSquare
          :size="14"
          class="thread-icon"
        />
        <div class="thread-info">
          <span class="thread-name">{{ thread.title || 'Untitled conversation' }}</span>
          <span class="thread-meta">
            <Clock :size="10" />
            {{ formatDate(thread.updatedAt) }}
          </span>
        </div>
        <button
          class="delete-btn"
          title="Delete conversation"
          @click="handleDelete($event, thread.threadId)"
        >
          <Trash2 :size="12" />
        </button>
      </button>

      <div
        v-if="store.threads.length === 0"
        class="empty-state"
      >
        No conversations yet
      </div>
    </div>
  </div>
</template>

<style scoped>
.thread-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.thread-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.thread-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.new-chat-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #333338);
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.new-chat-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color, #e2e8f0);
}

.thread-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 200px;
  overflow-y: auto;
}

.thread-items::-webkit-scrollbar {
  width: 4px;
}

.thread-items::-webkit-scrollbar-track {
  background: transparent;
}

.thread-items::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 2px;
}

.thread-item {
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

.thread-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.thread-item.active {
  background: rgba(124, 158, 248, 0.1);
}

.thread-icon {
  flex-shrink: 0;
  color: var(--text-color-secondary, #94a3b8);
}

.thread-item.active .thread-icon {
  color: var(--primary-color, #7c9ef8);
}

.thread-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.thread-name {
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.7;
}

.delete-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s;
}

.thread-item:hover .delete-btn {
  opacity: 0.6;
}

.delete-btn:hover {
  opacity: 1 !important;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.empty-state {
  text-align: center;
  padding: 16px 8px;
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.6;
}
</style>
