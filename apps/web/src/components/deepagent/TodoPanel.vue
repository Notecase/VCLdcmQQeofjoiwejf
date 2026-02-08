<script setup lang="ts">
/**
 * TodoPanel - List of todos with status icons and progress.
 * Groups: In Progress -> Pending -> Completed.
 */
import { computed } from 'vue'
import type { TodoItem } from '@inkdown/shared/types'
import { CheckCircle2, Loader2, Circle } from 'lucide-vue-next'

defineProps<{
  todos: TodoItem[]
}>()

const todoGroups = computed(() => {
  return (items: TodoItem[]) => {
    const inProgress = items.filter(t => t.status === 'in_progress')
    const pending = items.filter(t => t.status === 'pending')
    const completed = items.filter(t => t.status === 'completed')
    return { inProgress, pending, completed }
  }
})

function completedCount(todos: TodoItem[]): number {
  return todos.filter(t => t.status === 'completed').length
}

function progressPercent(todos: TodoItem[]): number {
  if (todos.length === 0) return 0
  return (completedCount(todos) / todos.length) * 100
}
</script>

<template>
  <div class="todo-panel">
    <!-- Progress summary -->
    <div class="progress-summary">
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: `${progressPercent(todos)}%` }" />
      </div>
      <span class="progress-text">{{ completedCount(todos) }} of {{ todos.length }} completed</span>
    </div>

    <!-- Empty state -->
    <div v-if="todos.length === 0" class="empty-state">
      No tasks yet
    </div>

    <!-- Todo groups -->
    <div v-else class="todo-groups">
      <!-- In Progress -->
      <div v-if="todoGroups(todos).inProgress.length > 0" class="todo-group">
        <span class="group-label active">In Progress</span>
        <div
          v-for="todo in todoGroups(todos).inProgress"
          :key="todo.id"
          class="todo-item active"
        >
          <Loader2 :size="14" class="todo-icon spin" />
          <span class="todo-text">{{ todo.content }}</span>
        </div>
      </div>

      <!-- Pending -->
      <div v-if="todoGroups(todos).pending.length > 0" class="todo-group">
        <span class="group-label">Pending</span>
        <div
          v-for="todo in todoGroups(todos).pending"
          :key="todo.id"
          class="todo-item pending"
        >
          <Circle :size="14" class="todo-icon" />
          <span class="todo-text">{{ todo.content }}</span>
        </div>
      </div>

      <!-- Completed -->
      <div v-if="todoGroups(todos).completed.length > 0" class="todo-group">
        <span class="group-label completed">Completed</span>
        <div
          v-for="todo in todoGroups(todos).completed"
          :key="todo.id"
          class="todo-item completed"
        >
          <CheckCircle2 :size="14" class="todo-icon" />
          <span class="todo-text">{{ todo.content }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.todo-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

/* Progress summary */
.progress-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #30363d);
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

.progress-text {
  font-size: 11px;
  color: var(--text-color-secondary, #8b949e);
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 32px 16px;
  font-size: 12px;
  color: rgba(139, 148, 158, 0.6);
}

/* Groups */
.todo-groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  flex: 1;
}

.todo-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(139, 148, 158, 0.6);
  margin-bottom: 4px;
}

.group-label.active {
  color: #d29922;
}

.group-label.completed {
  color: #3fb950;
}

/* Todo items */
.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  transition: background 0.15s;
}

.todo-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.todo-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.todo-text {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-color, #e6edf3);
}

/* Status styles */
.todo-item.active .todo-icon {
  color: #d29922;
}

.todo-item.pending .todo-icon {
  color: rgba(139, 148, 158, 0.6);
  opacity: 0.5;
}

.todo-item.pending .todo-text {
  color: var(--text-color-secondary, #8b949e);
}

.todo-item.completed .todo-icon {
  color: #3fb950;
}

.todo-item.completed .todo-text {
  color: rgba(139, 148, 158, 0.6);
  text-decoration: line-through;
}

.spin {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Scrollbar */
.todo-groups::-webkit-scrollbar {
  width: 4px;
}

.todo-groups::-webkit-scrollbar-track {
  background: transparent;
}

.todo-groups::-webkit-scrollbar-thumb {
  background: var(--border-color, #30363d);
  border-radius: 2px;
}
</style>
