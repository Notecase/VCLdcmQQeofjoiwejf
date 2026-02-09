<script setup lang="ts">
/**
 * DeepAgentRightPanel - Container with tabs: Files / Todos / Preview.
 * Shows FileGrid, TodoPanel, or a preview placeholder.
 * NOTE: This panel is no longer used in HomePage (replaced by InlineTasksFiles).
 */
import { ref } from 'vue'
import type { VirtualFile, TodoItem } from '@inkdown/shared/types'
import { Files, ListTodo, Eye } from 'lucide-vue-next'
import FileGrid from './FileGrid.vue'
import TodoPanel from './TodoPanel.vue'

defineProps<{
  files: VirtualFile[]
  todos: TodoItem[]
}>()

const emit = defineEmits<{
  selectFile: [file: VirtualFile]
  saveFileAsNote: [file: VirtualFile]
}>()

type TabId = 'files' | 'todos' | 'preview'

const activeTab = ref<TabId>('files')

const tabs: { id: TabId; label: string; icon: typeof Files }[] = [
  { id: 'files', label: 'Files', icon: Files },
  { id: 'todos', label: 'Todos', icon: ListTodo },
  { id: 'preview', label: 'Preview', icon: Eye },
]
</script>

<template>
  <div class="right-panel">
    <!-- Tab navigation -->
    <div class="tab-nav">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        type="button"
        @click="activeTab = tab.id"
      >
        <component
          :is="tab.icon"
          :size="14"
        />
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <!-- Tab content -->
    <div class="tab-content">
      <div
        v-if="activeTab === 'files'"
        class="tab-pane"
      >
        <FileGrid
          :files="files"
          @select="(f) => emit('selectFile', f)"
        />
      </div>

      <div
        v-else-if="activeTab === 'todos'"
        class="tab-pane"
      >
        <TodoPanel :todos="todos" />
      </div>

      <div
        v-else-if="activeTab === 'preview'"
        class="tab-pane preview-pane"
      >
        <div class="preview-placeholder">
          <Eye
            :size="32"
            class="placeholder-icon"
          />
          <span class="placeholder-text">Select a file to preview</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.right-panel {
  width: 340px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  background: var(--app-bg, #0d1117);
  border-left: 1px solid var(--border-color, #30363d);
  height: 100%;
  overflow: hidden;
}

/* Tab navigation */
.tab-nav {
  display: flex;
  border-bottom: 1px solid var(--border-color, #30363d);
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 8px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-color-secondary, #8b949e);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.tab-btn:hover {
  color: var(--text-color, #e6edf3);
  background: rgba(255, 255, 255, 0.04);
}

.tab-btn.active {
  color: var(--primary-color, #7c9ef8);
  border-bottom-color: var(--primary-color, #7c9ef8);
}

/* Tab content */
.tab-content {
  flex: 1;
  overflow: hidden;
}

.tab-pane {
  padding: 14px;
  height: 100%;
  overflow-y: auto;
}

/* Preview placeholder */
.preview-pane {
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.placeholder-icon {
  color: rgba(139, 148, 158, 0.6);
  opacity: 0.3;
}

.placeholder-text {
  font-size: 12px;
  color: rgba(139, 148, 158, 0.6);
}

/* Scrollbar */
.tab-pane::-webkit-scrollbar {
  width: 4px;
}

.tab-pane::-webkit-scrollbar-track {
  background: transparent;
}

.tab-pane::-webkit-scrollbar-thumb {
  background: var(--border-color, #30363d);
  border-radius: 2px;
}
</style>
