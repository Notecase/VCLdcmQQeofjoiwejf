<script setup lang="ts">
/**
 * ThreadListPanel - Thread list with status dots and time grouping.
 *
 * Groups: Requiring Attention, Today, Yesterday, This Week, Older.
 * Status dots: green=idle, blue=busy, orange=interrupted, red=error.
 * SquarePen icon button for new thread.
 */
import { computed } from 'vue'
import type { ResearchThread } from '@inkdown/shared/types'
import {
  SquarePen,
  Trash2,
} from 'lucide-vue-next'

const props = defineProps<{
  threads: ResearchThread[]
  activeThreadId: string | null
}>()

const emit = defineEmits<{
  select: [threadId: string]
  delete: [threadId: string]
  create: []
}>()

// Time grouping helpers
function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}

function isYesterday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return d.toDateString() === yesterday.toDateString()
}

function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)
  return d >= startOfWeek && !isToday(dateStr) && !isYesterday(dateStr)
}

function formatTime(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isToday(dateStr)) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  if (isYesterday(dateStr)) {
    return 'Yesterday'
  }
  if (isThisWeek(dateStr)) {
    return d.toLocaleDateString([], { weekday: 'long' })
  }
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

// Grouped threads
interface ThreadGroup {
  label: string
  threads: ResearchThread[]
}

const groupedThreads = computed<ThreadGroup[]>(() => {
  const sorted = [...props.threads].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )

  const interrupted: ResearchThread[] = []
  const today: ResearchThread[] = []
  const yesterday: ResearchThread[] = []
  const thisWeek: ResearchThread[] = []
  const older: ResearchThread[] = []

  for (const thread of sorted) {
    if (thread.status === 'interrupted') {
      interrupted.push(thread)
    }
    else if (isToday(thread.updatedAt)) {
      today.push(thread)
    }
    else if (isYesterday(thread.updatedAt)) {
      yesterday.push(thread)
    }
    else if (isThisWeek(thread.updatedAt)) {
      thisWeek.push(thread)
    }
    else {
      older.push(thread)
    }
  }

  const groups: ThreadGroup[] = []
  if (interrupted.length > 0) groups.push({ label: 'Requiring Attention', threads: interrupted })
  if (today.length > 0) groups.push({ label: 'Today', threads: today })
  if (yesterday.length > 0) groups.push({ label: 'Yesterday', threads: yesterday })
  if (thisWeek.length > 0) groups.push({ label: 'This Week', threads: thisWeek })
  if (older.length > 0) groups.push({ label: 'Older', threads: older })

  return groups
})

function statusDotClass(status: ResearchThread['status']): string {
  switch (status) {
    case 'idle': return 'dot-idle'
    case 'busy': return 'dot-busy'
    case 'interrupted': return 'dot-interrupted'
    case 'error': return 'dot-error'
    case 'completed': return 'dot-idle'
    default: return ''
  }
}

function handleDelete(e: Event, threadId: string) {
  e.stopPropagation()
  emit('delete', threadId)
}
</script>

<template>
  <div class="thread-list-panel">
    <!-- Header -->
    <div class="panel-header">
      <span class="panel-title">Threads</span>
      <button class="new-thread-btn" type="button" title="New Thread" @click="emit('create')">
        <SquarePen :size="16" />
      </button>
    </div>

    <!-- Thread groups -->
    <div class="thread-scroll">
      <div v-if="threads.length === 0" class="empty-state">
        No threads yet. Start one to begin.
      </div>

      <div v-for="group in groupedThreads" :key="group.label" class="thread-group">
        <span class="group-label" :class="{ attention: group.label === 'Requiring Attention' }">
          {{ group.label }}
        </span>

        <button
          v-for="thread in group.threads"
          :key="thread.id"
          class="thread-item"
          :class="{ active: activeThreadId === thread.id }"
          type="button"
          @click="emit('select', thread.id)"
        >
          <div class="thread-info">
            <span class="thread-name">{{ thread.title || 'Untitled thread' }}</span>
            <div class="thread-meta">
              <span class="thread-time">{{ formatTime(thread.updatedAt) }}</span>
              <span class="status-dot" :class="statusDotClass(thread.status)" />
            </div>
          </div>
          <button class="delete-btn" type="button" title="Delete thread" @click="handleDelete($event, thread.id)">
            <Trash2 :size="12" />
          </button>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thread-list-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 240px;
  min-width: 200px;
  border-right: 1px solid var(--border-color, #30363d);
  background: var(--app-bg, #0d1117);
}

/* Header */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px;
  border-bottom: 1px solid var(--border-color, #30363d);
  flex-shrink: 0;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #e6edf3);
}

.new-thread-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #8b949e);
  cursor: pointer;
  transition: all 0.15s;
}

.new-thread-btn:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--primary-color, #7c9ef8);
}

/* Scrollable area */
.thread-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.thread-scroll::-webkit-scrollbar {
  width: 4px;
}

.thread-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.thread-scroll::-webkit-scrollbar-thumb {
  background: var(--border-color, #30363d);
  border-radius: 2px;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 32px 16px;
  font-size: 12px;
  color: rgba(139, 148, 158, 0.6);
}

/* Thread groups */
.thread-group {
  margin-bottom: 12px;
}

.group-label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(139, 148, 158, 0.6);
  padding: 4px 8px;
  margin-bottom: 4px;
}

.group-label.attention {
  color: #d29922;
}

/* Thread items */
.thread-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.thread-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.thread-item.active {
  background: rgba(124, 158, 248, 0.08);
  border-left: 3px solid var(--primary-color, #7c9ef8);
  padding-left: 7px;
}

.thread-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.thread-name {
  font-size: 13px;
  color: var(--text-color, #e6edf3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: rgba(139, 148, 158, 0.6);
}

.thread-time {
  font-size: 11px;
}

/* Status dot */
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-idle {
  background: #3fb950;
}

.dot-busy {
  background: #58a6ff;
}

.dot-interrupted {
  background: #d29922;
}

.dot-error {
  background: #f85149;
}

/* Delete button */
.delete-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: rgba(139, 148, 158, 0.6);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s;
}

.thread-item:hover .delete-btn {
  opacity: 0.6;
}

.delete-btn:hover {
  opacity: 1 !important;
  color: #f85149;
  background: rgba(248, 81, 73, 0.08);
}
</style>
