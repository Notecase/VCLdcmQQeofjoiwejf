<script setup lang="ts">
/**
 * ClarificationDialog - Target Selection for Ambiguous Edits
 *
 * Displayed when the AI cannot confidently identify which section
 * of a note the user wants to edit. Shows possible targets and
 * lets user select the correct one.
 */
import { computed, ref } from 'vue'
import { Check, HelpCircle, FileText, List, Code, Table2 } from 'lucide-vue-next'

export interface ClarificationOption {
  id: string
  label: string
  preview: string
  line: number
}

defineProps<{
  options: ClarificationOption[]
  reason: string
  isVisible: boolean
}>()

const emit = defineEmits<{
  select: [blockIds: string[]]
  cancel: []
}>()

// Track selected options (allow multiple)
const selectedIds = ref<Set<string>>(new Set())

// Toggle selection
function toggleOption(id: string) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
  // Force reactivity
  selectedIds.value = new Set(selectedIds.value)
}

// Handle confirm
function handleConfirm() {
  if (selectedIds.value.size > 0) {
    emit('select', Array.from(selectedIds.value))
    selectedIds.value = new Set()
  }
}

// Handle cancel
function handleCancel() {
  selectedIds.value = new Set()
  emit('cancel')
}

// Icon based on label type
function getIcon(label: string) {
  if (label.startsWith('Section:')) return FileText
  if (label.startsWith('List')) return List
  if (label.startsWith('Code')) return Code
  if (label.startsWith('Table')) return Table2
  return FileText
}

// Has selection
const hasSelection = computed(() => selectedIds.value.size > 0)
</script>

<template>
  <Transition name="dialog">
    <div v-if="isVisible" class="clarification-overlay" @click.self="handleCancel">
      <div class="clarification-dialog">
        <!-- Header -->
        <div class="dialog-header">
          <div class="header-icon">
            <HelpCircle :size="20" />
          </div>
          <div class="header-content">
            <h3 class="dialog-title">Which section should I edit?</h3>
            <p class="dialog-reason">{{ reason }}</p>
          </div>
        </div>

        <!-- Options List -->
        <div class="options-list">
          <button
            v-for="option in options"
            :key="option.id"
            class="option-item"
            :class="{ selected: selectedIds.has(option.id) }"
            type="button"
            @click="toggleOption(option.id)"
          >
            <div class="option-checkbox">
              <div class="checkbox-inner">
                <Check v-if="selectedIds.has(option.id)" :size="14" />
              </div>
            </div>

            <div class="option-content">
              <div class="option-header">
                <component :is="getIcon(option.label)" :size="14" class="option-icon" />
                <span class="option-label">{{ option.label }}</span>
                <span class="option-line">Line {{ option.line }}</span>
              </div>
              <p class="option-preview">{{ option.preview }}</p>
            </div>
          </button>
        </div>

        <!-- Footer -->
        <div class="dialog-footer">
          <button class="footer-btn cancel" type="button" @click="handleCancel">
            Cancel
          </button>
          <button
            class="footer-btn confirm"
            :class="{ disabled: !hasSelection }"
            type="button"
            :disabled="!hasSelection"
            @click="handleConfirm"
          >
            Edit Selected
            <span v-if="hasSelection" class="selection-count">({{ selectedIds.size }})</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.clarification-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.clarification-dialog {
  background: var(--surface-1);
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.3);
  width: 100%;
  max-width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ============================================
 * HEADER
 * ============================================ */

.dialog-header {
  display: flex;
  gap: 14px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-2);
}

.header-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--stream-cursor-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--stream-cursor);
  flex-shrink: 0;
}

.header-content {
  flex: 1;
  min-width: 0;
}

.dialog-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.dialog-reason {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* ============================================
 * OPTIONS LIST
 * ============================================ */

.options-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.option-item {
  width: 100%;
  display: flex;
  gap: 12px;
  padding: 14px;
  margin-bottom: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--transition-fast) ease;
  text-align: left;
}

.option-item:last-child {
  margin-bottom: 0;
}

.option-item:hover {
  border-color: var(--border-hover);
  background: var(--surface-3);
}

.option-item.selected {
  border-color: var(--stream-cursor);
  background: var(--stream-cursor-bg);
}

.option-checkbox {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.checkbox-inner {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 2px solid var(--border-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast) ease;
}

.option-item.selected .checkbox-inner {
  background: var(--stream-cursor);
  border-color: var(--stream-cursor);
  color: white;
}

.option-content {
  flex: 1;
  min-width: 0;
}

.option-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.option-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.option-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-line {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.option-preview {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* ============================================
 * FOOTER
 * ============================================ */

.dialog-footer {
  display: flex;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-2);
}

.footer-btn {
  flex: 1;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast) ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.footer-btn.cancel {
  background: var(--surface-3);
  color: var(--text-secondary);
}

.footer-btn.cancel:hover {
  background: var(--surface-4);
  color: var(--text-primary);
}

.footer-btn.confirm {
  background: var(--stream-cursor);
  color: white;
}

.footer-btn.confirm:hover:not(.disabled) {
  background: var(--role-assistant-color);
}

.footer-btn.confirm.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.selection-count {
  font-size: 12px;
  opacity: 0.8;
}

/* ============================================
 * TRANSITIONS
 * ============================================ */

.dialog-enter-active,
.dialog-leave-active {
  transition: all 0.2s ease;
}

.dialog-enter-active .clarification-dialog,
.dialog-leave-active .clarification-dialog {
  transition: all 0.2s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .clarification-dialog,
.dialog-leave-to .clarification-dialog {
  transform: scale(0.95) translateY(10px);
}

/* ============================================
 * SCROLLBAR
 * ============================================ */

.options-list::-webkit-scrollbar {
  width: 6px;
}

.options-list::-webkit-scrollbar-track {
  background: transparent;
}

.options-list::-webkit-scrollbar-thumb {
  background: var(--border-subtle);
  border-radius: 3px;
}

.options-list::-webkit-scrollbar-thumb:hover {
  background: var(--border-hover);
}
</style>
