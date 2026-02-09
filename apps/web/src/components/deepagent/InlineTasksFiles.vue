<script setup lang="ts">
/**
 * InlineTasksFiles - Inline collapsible section showing tasks and files.
 *
 * Collapsed: single-line status above composer.
 * Expanded: tabbed view (Tasks / Files) with max-h-72.
 */
import { ref, computed } from 'vue'
import type { VirtualFile, TodoItem } from '@inkdown/shared/types'
import { CheckCircle, Circle, Loader2, FileText, ChevronDown, ChevronUp } from 'lucide-vue-next'
import FileCard from './FileCard.vue'

const props = defineProps<{
  todos: TodoItem[]
  files: VirtualFile[]
}>()

const emit = defineEmits<{
  selectFile: [file: VirtualFile]
}>()

const expanded = ref(false)
const activeTab = ref<'tasks' | 'files'>('tasks')

const completedCount = computed(() => props.todos.filter((t) => t.status === 'completed').length)
const totalCount = computed(() => props.todos.length)
const activeTask = computed(() => props.todos.find((t) => t.status === 'in_progress'))
const activeIndex = computed(() => {
  const idx = props.todos.findIndex((t) => t.status === 'in_progress')
  return idx >= 0 ? idx + 1 : null
})

const statusLabel = computed(() => {
  if (activeTask.value && activeIndex.value) {
    return `Task ${activeIndex.value} of ${totalCount.value}`
  }
  if (completedCount.value === totalCount.value && totalCount.value > 0) {
    return `All ${totalCount.value} tasks done`
  }
  return `${completedCount.value} of ${totalCount.value} tasks`
})

const activeTaskContent = computed(() => {
  if (activeTask.value) {
    const text = activeTask.value.content
    return text.length > 50 ? `${text.slice(0, 47)}...` : text
  }
  return ''
})

const statusIcon = computed(() => {
  if (completedCount.value === totalCount.value && totalCount.value > 0) return CheckCircle
  if (activeTask.value) return Loader2
  return Circle
})

const statusIconClass = computed(() => {
  if (completedCount.value === totalCount.value && totalCount.value > 0) return 'icon-complete'
  if (activeTask.value) return 'icon-active'
  return 'icon-pending'
})

// Group todos by status
const pendingTodos = computed(() => props.todos.filter((t) => t.status === 'pending'))
const inProgressTodos = computed(() => props.todos.filter((t) => t.status === 'in_progress'))
const completedTodos = computed(() => props.todos.filter((t) => t.status === 'completed'))

function todoStatusIcon(status: TodoItem['status']) {
  if (status === 'completed') return CheckCircle
  if (status === 'in_progress') return Loader2
  return Circle
}

function todoStatusClass(status: TodoItem['status']) {
  if (status === 'completed') return 'icon-complete'
  if (status === 'in_progress') return 'icon-active'
  return 'icon-pending'
}
</script>

<template>
  <div class="inline-tasks-files">
    <!-- Collapsed bar -->
    <button
      class="collapsed-bar"
      type="button"
      @click="expanded = !expanded"
    >
      <div class="bar-left">
        <component
          :is="statusIcon"
          :size="14"
          class="bar-status-icon"
          :class="[statusIconClass, { spin: activeTask }]"
        />
        <span class="bar-label">{{ statusLabel }}</span>
        <span
          v-if="activeTaskContent"
          class="bar-task-text"
          >"{{ activeTaskContent }}"</span
        >
      </div>
      <div class="bar-right">
        <span
          v-if="files.length > 0"
          class="bar-files"
        >
          <FileText :size="12" />
          Files ({{ files.length }})
        </span>
        <component
          :is="expanded ? ChevronUp : ChevronDown"
          :size="14"
          class="bar-chevron"
        />
      </div>
    </button>

    <!-- Expanded panel -->
    <Transition name="expand">
      <div
        v-if="expanded"
        class="expanded-panel"
      >
        <!-- Tabs -->
        <div class="panel-tabs">
          <button
            class="panel-tab"
            :class="{ active: activeTab === 'tasks' }"
            type="button"
            @click="activeTab = 'tasks'"
          >
            Tasks ({{ totalCount }})
          </button>
          <button
            class="panel-tab"
            :class="{ active: activeTab === 'files' }"
            type="button"
            @click="activeTab = 'files'"
          >
            Files ({{ files.length }})
          </button>
        </div>

        <!-- Tasks tab -->
        <div
          v-if="activeTab === 'tasks'"
          class="panel-content"
        >
          <div
            v-if="todos.length === 0"
            class="empty-tab"
          >
            No tasks yet
          </div>

          <!-- In Progress -->
          <div
            v-if="inProgressTodos.length > 0"
            class="task-group"
          >
            <span class="group-label active">In Progress</span>
            <div
              v-for="todo in inProgressTodos"
              :key="todo.id"
              class="task-item"
            >
              <component
                :is="todoStatusIcon(todo.status)"
                :size="13"
                class="task-icon spin"
                :class="todoStatusClass(todo.status)"
              />
              <span class="task-text">{{ todo.content }}</span>
            </div>
          </div>

          <!-- Pending -->
          <div
            v-if="pendingTodos.length > 0"
            class="task-group"
          >
            <span class="group-label">Pending</span>
            <div
              v-for="todo in pendingTodos"
              :key="todo.id"
              class="task-item"
            >
              <component
                :is="todoStatusIcon(todo.status)"
                :size="13"
                class="task-icon"
                :class="todoStatusClass(todo.status)"
              />
              <span class="task-text pending">{{ todo.content }}</span>
            </div>
          </div>

          <!-- Completed -->
          <div
            v-if="completedTodos.length > 0"
            class="task-group"
          >
            <span class="group-label completed">Completed</span>
            <div
              v-for="todo in completedTodos"
              :key="todo.id"
              class="task-item"
            >
              <component
                :is="todoStatusIcon(todo.status)"
                :size="13"
                class="task-icon"
                :class="todoStatusClass(todo.status)"
              />
              <span class="task-text completed">{{ todo.content }}</span>
            </div>
          </div>
        </div>

        <!-- Files tab -->
        <div
          v-if="activeTab === 'files'"
          class="panel-content"
        >
          <div
            v-if="files.length === 0"
            class="empty-tab"
          >
            No files generated yet
          </div>
          <div
            v-else
            class="files-grid"
          >
            <FileCard
              v-for="file in files"
              :key="file.name"
              :file="file"
              @click="emit('selectFile', file)"
            />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.inline-tasks-files {
  border-top: none;
  background: rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
}

/* Collapsed bar */
.collapsed-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 24px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}

.collapsed-bar:hover {
  background: rgba(255, 255, 255, 0.04);
}

.bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.bar-status-icon {
  flex-shrink: 0;
}

.bar-status-icon.icon-complete {
  color: #3fb950;
}

.bar-status-icon.icon-active {
  color: #d29922;
}

.bar-status-icon.icon-pending {
  color: rgba(139, 148, 158, 0.6);
}

.bar-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-secondary, #8b949e);
  white-space: nowrap;
}

.bar-task-text {
  font-size: 12px;
  color: rgba(139, 148, 158, 0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: italic;
}

.bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.bar-files {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-color-secondary, #8b949e);
}

.bar-chevron {
  color: rgba(139, 148, 158, 0.6);
}

/* Expanded panel */
.expanded-panel {
  border-top: 1px solid var(--border-color, #30363d);
}

.panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color, #30363d);
}

.panel-tab {
  flex: 1;
  padding: 8px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-secondary, #8b949e);
  cursor: pointer;
  transition: all 0.15s;
}

.panel-tab:hover {
  color: var(--text-color, #e6edf3);
}

.panel-tab.active {
  color: var(--primary-color, #7c9ef8);
  border-bottom-color: var(--primary-color, #7c9ef8);
}

.panel-content {
  max-height: 288px; /* max-h-72 */
  overflow-y: auto;
  padding: 12px 24px;
}

.empty-tab {
  text-align: center;
  padding: 24px 16px;
  font-size: 12px;
  color: rgba(139, 148, 158, 0.6);
}

/* Task groups */
.task-group {
  margin-bottom: 12px;
}

.task-group:last-child {
  margin-bottom: 0;
}

.group-label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(139, 148, 158, 0.6);
  margin-bottom: 6px;
}

.group-label.active {
  color: #d29922;
}

.group-label.completed {
  color: #3fb950;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
}

.task-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.task-icon.icon-complete {
  color: #3fb950;
}

.task-icon.icon-active {
  color: #d29922;
}

.task-icon.icon-pending {
  color: rgba(139, 148, 158, 0.6);
  opacity: 0.5;
}

.task-text {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-color, #e6edf3);
}

.task-text.pending {
  color: var(--text-color-secondary, #8b949e);
}

.task-text.completed {
  color: rgba(139, 148, 158, 0.6);
  text-decoration: line-through;
}

/* Files grid */
.files-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

/* Animations */
.spin {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  max-height: 500px;
}

/* Scrollbar */
.panel-content::-webkit-scrollbar {
  width: 4px;
}

.panel-content::-webkit-scrollbar-track {
  background: transparent;
}

.panel-content::-webkit-scrollbar-thumb {
  background: var(--border-color, #30363d);
  border-radius: 2px;
}
</style>
