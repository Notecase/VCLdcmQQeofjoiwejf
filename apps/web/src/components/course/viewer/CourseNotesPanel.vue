<script setup lang="ts">
import { ref } from 'vue'
import { X, Save, FileText } from 'lucide-vue-next'

defineProps<{
  lessonTitle: string
}>()

const emit = defineEmits<{
  close: []
}>()

const noteText = ref('')
const isSaved = ref(false)

function handleSave() {
  if (!noteText.value.trim()) return
  // In a full implementation, this would save to the notes system
  isSaved.value = true
  setTimeout(() => {
    isSaved.value = false
  }, 2000)
}
</script>

<template>
  <aside class="notes-panel">
    <div class="panel-header">
      <div class="panel-title">
        <FileText :size="14" />
        <span>Notes</span>
      </div>
      <button
        class="close-btn"
        @click="emit('close')"
      >
        <X :size="16" />
      </button>
    </div>

    <div class="panel-body">
      <p class="notes-context">Notes for: {{ lessonTitle }}</p>
      <textarea
        v-model="noteText"
        class="notes-textarea"
        placeholder="Take notes for this lesson..."
      />
    </div>

    <div class="panel-footer">
      <button
        class="save-btn"
        :disabled="!noteText.trim()"
        @click="handleSave"
      >
        <Save :size="14" />
        {{ isSaved ? 'Saved!' : 'Save Note' }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.notes-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur-heavy, 20px));
  -webkit-backdrop-filter: blur(var(--glass-blur-heavy, 20px));
  border-left: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--text-color-secondary, #64748b);
  cursor: pointer;
  transition: all 0.15s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color, #e2e8f0);
}

.panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 14px;
  gap: 10px;
  min-height: 0;
}

.notes-context {
  font-size: 11px;
  color: var(--text-color-secondary, #64748b);
  margin: 0;
}

.notes-textarea {
  flex: 1;
  padding: 12px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: rgba(0, 0, 0, 0.2);
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  font-family: inherit;
  line-height: 1.6;
  resize: none;
  outline: none;
  transition: border-color var(--transition-fast, 150ms ease);
}

.notes-textarea:focus {
  border-color: var(--sec-accent, #f59e0b);
}

.notes-textarea::placeholder {
  color: var(--text-color-secondary, #64748b);
}

.panel-footer {
  padding: 12px 14px;
  border-top: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
}

.save-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px;
  border-radius: 8px;
  border: none;
  background: var(--sec-accent, #f59e0b);
  color: #1a1a1a;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.save-btn:hover:not(:disabled) {
  background: var(--sec-accent-light, #fbbf24);
}

.save-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
