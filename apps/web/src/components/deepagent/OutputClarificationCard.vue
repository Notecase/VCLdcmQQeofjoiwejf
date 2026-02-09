<script setup lang="ts">
import type { OutputClarificationRequest, OutputDestination } from '@/stores/deepAgent'
import { HelpCircle, FileText, MessageSquare, BookOpen, X } from 'lucide-vue-next'

defineProps<{
  request: OutputClarificationRequest
}>()

const emit = defineEmits<{
  select: [destination: OutputDestination]
  cancel: []
}>()

function iconFor(destination: OutputDestination) {
  if (destination === 'md_file') return FileText
  if (destination === 'note') return BookOpen
  return MessageSquare
}
</script>

<template>
  <div class="output-clarify-card">
    <div class="card-header">
      <div class="header-left">
        <HelpCircle
          :size="16"
          class="header-icon"
        />
        <div class="header-copy">
          <p class="header-title">Clarify Output Destination</p>
          <p class="header-reason">{{ request.reason }}</p>
        </div>
      </div>
      <button
        class="close-btn"
        type="button"
        aria-label="Dismiss clarification"
        @click="emit('cancel')"
      >
        <X :size="14" />
      </button>
    </div>

    <div class="option-grid">
      <button
        v-for="option in request.options"
        :key="option.id"
        class="option-btn"
        type="button"
        @click="emit('select', option.id)"
      >
        <component
          :is="iconFor(option.id)"
          :size="14"
          class="option-icon"
        />
        <span class="option-label">{{ option.label }}</span>
        <span class="option-desc">{{ option.description }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.output-clarify-card {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color, #30363d);
  background: linear-gradient(180deg, rgba(124, 158, 248, 0.08), rgba(124, 158, 248, 0.02));
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.header-icon {
  color: var(--primary-color, #7c9ef8);
  margin-top: 2px;
  flex-shrink: 0;
}

.header-copy {
  min-width: 0;
}

.header-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color, #e6edf3);
}

.header-reason {
  margin: 2px 0 0;
  font-size: 12px;
  color: rgba(139, 148, 158, 0.85);
  line-height: 1.45;
}

.close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(139, 148, 158, 0.8);
  cursor: pointer;
  transition: all 0.15s;
}

.close-btn:hover {
  border-color: var(--border-color, #30363d);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-color, #e6edf3);
}

.option-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.option-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  text-align: left;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--border-color, #30363d);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-color, #e6edf3);
  cursor: pointer;
  transition: all 0.15s;
}

.option-btn:hover {
  border-color: var(--primary-color, #7c9ef8);
  background: rgba(124, 158, 248, 0.08);
}

.option-icon {
  color: rgba(139, 148, 158, 0.85);
}

.option-label {
  font-size: 12px;
  font-weight: 600;
}

.option-desc {
  font-size: 11px;
  line-height: 1.45;
  color: rgba(139, 148, 158, 0.85);
}

@media (max-width: 900px) {
  .option-grid {
    grid-template-columns: 1fr;
  }
}
</style>
