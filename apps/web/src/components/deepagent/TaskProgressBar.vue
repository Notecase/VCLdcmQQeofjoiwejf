<script setup lang="ts">
/**
 * TaskProgressBar - Horizontal progress bar showing task completion.
 *
 * Compact one-liner when collapsed, full todo list when expanded.
 */
import { ref, computed, watch } from 'vue'
import type { TodoItem } from '@inkdown/shared/types'
import { CheckCircle, Clock, Circle, ChevronDown } from 'lucide-vue-next'

const props = defineProps<{
  todos: TodoItem[]
}>()

const expanded = ref(false)

const completed = computed(() => props.todos.filter((t) => t.status === 'completed').length)
const total = computed(() => props.todos.length)
const progress = computed(() => (total.value === 0 ? 0 : (completed.value / total.value) * 100))

const activeTask = computed(() => props.todos.find((t) => t.status === 'in_progress'))
const activeIndex = computed(() => {
  const idx = props.todos.findIndex((t) => t.status === 'in_progress')
  return idx >= 0 ? idx + 1 : null
})

const label = computed(() => {
  if (activeTask.value && activeIndex.value) {
    return `Task ${activeIndex.value}/${total.value}: ${activeTask.value.content}`
  }
  if (completed.value === total.value && total.value > 0) {
    return `All ${total.value} tasks completed`
  }
  return `${completed.value} of ${total.value} tasks completed`
})

// Auto-collapse when no active tasks
watch(activeTask, (val) => {
  if (!val) {
    expanded.value = false
  }
})

function statusIcon(status: TodoItem['status']) {
  if (status === 'completed') return CheckCircle
  if (status === 'in_progress') return Clock
  return Circle
}

function statusClass(status: TodoItem['status']) {
  if (status === 'completed') return 'status-completed'
  if (status === 'in_progress') return 'status-active'
  return 'status-pending'
}
</script>

<template>
  <div
    v-if="todos.length > 0"
    class="task-progress"
  >
    <button
      class="progress-header"
      type="button"
      @click="expanded = !expanded"
    >
      <div class="progress-info">
        <div class="progress-track">
          <div
            class="progress-fill"
            :style="{ width: `${progress}%` }"
          />
        </div>
        <span class="progress-label">{{ label }}</span>
      </div>
      <ChevronDown
        :size="14"
        class="chevron"
        :class="{ collapsed: !expanded }"
      />
    </button>

    <Transition name="collapse">
      <div
        v-if="expanded"
        class="todo-list"
      >
        <div
          v-for="todo in todos"
          :key="todo.id"
          class="todo-item"
          :class="statusClass(todo.status)"
        >
          <component
            :is="statusIcon(todo.status)"
            :size="14"
            class="todo-icon"
            :class="{ spin: todo.status === 'in_progress' }"
          />
          <span class="todo-text">{{ todo.content }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.task-progress {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-color, #30363d);
  border-radius: 10px;
  overflow: hidden;
  margin: 0 16px;
}

.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
}

.progress-header:hover {
  background: rgba(255, 255, 255, 0.04);
}

.progress-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.progress-track {
  width: 100%;
  height: 4px;
  background: var(--border-color, #30363d);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary-color, #7c9ef8);
  border-radius: 2px;
  transition: width 0.4s ease;
}

.progress-label {
  font-size: 12px;
  color: var(--text-color-secondary, #8b949e);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}

.chevron {
  color: rgba(139, 148, 158, 0.6);
  flex-shrink: 0;
  margin-left: 8px;
  transition: transform 0.2s ease;
}

.chevron.collapsed {
  transform: rotate(-90deg);
}

/* Todo list */
.todo-list {
  padding: 0 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-top: 1px solid var(--border-color, #30363d);
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

.todo-icon {
  flex-shrink: 0;
}

.todo-text {
  font-size: 12px;
  color: var(--text-color, #e6edf3);
}

/* Status colors */
.status-completed .todo-icon {
  color: #3fb950;
}

.status-completed .todo-text {
  color: rgba(139, 148, 158, 0.6);
  text-decoration: line-through;
}

.status-active .todo-icon {
  color: #d29922;
}

.status-active .todo-text {
  color: var(--text-color, #e6edf3);
}

.status-pending .todo-icon {
  color: rgba(139, 148, 158, 0.6);
  opacity: 0.5;
}

.status-pending .todo-text {
  color: var(--text-color-secondary, #8b949e);
}

.spin {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Collapse transition */
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 500px;
}
</style>
