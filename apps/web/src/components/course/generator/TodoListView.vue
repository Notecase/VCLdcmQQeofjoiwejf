<script setup lang="ts">
import { CheckCircle2, Circle, Loader2 } from 'lucide-vue-next'
import type { CourseTodoItem } from '@inkdown/shared/types'

defineProps<{
  todos: CourseTodoItem[]
}>()
</script>

<template>
  <div class="todo-list-view">
    <div
      v-for="todo in todos"
      :key="todo.id"
      class="todo-item"
      :class="todo.status"
    >
      <div class="todo-check">
        <CheckCircle2
          v-if="todo.status === 'completed'"
          :size="16"
        />
        <Loader2
          v-else-if="todo.status === 'in_progress'"
          :size="16"
          class="spinning"
        />
        <Circle
          v-else
          :size="16"
        />
      </div>

      <span
        class="todo-text"
        :class="{ completed: todo.status === 'completed' }"
      >
        {{ todo.text }}
      </span>

      <span
        v-if="todo.agentName"
        class="todo-agent-badge"
      >
        {{ todo.agentName }}
      </span>
    </div>

    <div
      v-if="todos.length === 0"
      class="todo-empty"
    >
      No tasks yet
    </div>
  </div>
</template>

<style scoped>
.todo-list-view {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: var(--radius-card, 12px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm, 6px);
  transition: background var(--transition-fast, 150ms ease);
}

.todo-item:hover {
  background: rgba(255, 255, 255, 0.03);
}

.todo-check {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.todo-item.completed .todo-check {
  color: var(--status-completed, #22c55e);
}

.todo-item.in_progress .todo-check {
  color: var(--status-running, #f59e0b);
}

.todo-item.pending .todo-check {
  color: var(--status-pending, #6b7280);
}

.todo-text {
  flex: 1;
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
  line-height: 1.4;
}

.todo-text.completed {
  text-decoration: line-through;
  text-decoration-color: rgba(34, 197, 94, 0.4);
  color: var(--text-color-secondary, #94a3b8);
}

.todo-agent-badge {
  padding: 2px 8px;
  border-radius: var(--radius-full, 9999px);
  background: var(--glass-bg-light, rgba(40, 40, 40, 0.5));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  font-size: 10px;
  font-weight: 500;
  color: var(--text-color-secondary, #94a3b8);
  white-space: nowrap;
  flex-shrink: 0;
}

.todo-empty {
  padding: 20px;
  text-align: center;
  font-size: 13px;
  color: var(--text-color-secondary, #64748b);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spinning {
  animation: spin 1s linear infinite;
}
</style>
