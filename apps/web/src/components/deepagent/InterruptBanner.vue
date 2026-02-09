<script setup lang="ts">
/**
 * InterruptBanner - Full-width banner for human-in-the-loop approval.
 *
 * Shows description, approve/reject/edit buttons.
 */
import { ref, computed } from 'vue'
import type { InterruptData, InterruptResponse } from '@inkdown/shared/types'
import { ShieldAlert, Check, X, Pencil, Send } from 'lucide-vue-next'

const props = defineProps<{
  interrupt: InterruptData
  compact?: boolean
}>()

const emit = defineEmits<{
  respond: [response: InterruptResponse]
  dismiss: []
}>()

const editMode = ref(false)
const editMessage = ref('')
const editArgsText = ref('')
const argsParseError = ref('')

const canApprove = computed(() => props.interrupt.allowedDecisions.includes('approve'))
const canReject = computed(() => props.interrupt.allowedDecisions.includes('reject'))
const canEdit = computed(() => props.interrupt.allowedDecisions.includes('edit'))

function handleApprove() {
  emit('respond', { decision: 'approve' })
}

function handleReject() {
  emit('respond', { decision: 'reject' })
}

function enterEditMode() {
  editMode.value = true
  editMessage.value = ''
  editArgsText.value = JSON.stringify(props.interrupt.toolArgs, null, 2)
  argsParseError.value = ''
}

function submitEdit() {
  argsParseError.value = ''
  let editedArgs: Record<string, unknown> | undefined
  if (editArgsText.value.trim()) {
    try {
      editedArgs = JSON.parse(editArgsText.value)
    } catch {
      argsParseError.value = 'Invalid JSON. Please fix and try again.'
      return
    }
  }
  emit('respond', {
    decision: 'edit',
    message: editMessage.value || undefined,
    editedArgs,
  })
  editMode.value = false
}

function cancelEdit() {
  editMode.value = false
  argsParseError.value = ''
}
</script>

<template>
  <Transition name="slide-down">
    <div
      class="interrupt-banner"
      :class="{ compact: props.compact }"
    >
      <div class="banner-header">
        <ShieldAlert
          :size="18"
          class="banner-icon"
        />
        <div class="banner-text">
          <span class="banner-title">Action requires approval</span>
          <span class="banner-tool">{{ interrupt.toolName }}</span>
        </div>
      </div>

      <p class="banner-description">{{ interrupt.description }}</p>

      <div
        v-if="interrupt.options.length > 0"
        class="banner-options"
      >
        <div
          v-for="opt in interrupt.options"
          :key="opt.value"
          class="option-item"
        >
          <span class="option-label">{{ opt.label }}</span>
          <span
            v-if="opt.description"
            class="option-desc"
            >{{ opt.description }}</span
          >
        </div>
      </div>

      <!-- Edit mode -->
      <Transition name="collapse">
        <div
          v-if="editMode"
          class="edit-section"
        >
          <div class="edit-field">
            <label class="edit-label">Message (optional)</label>
            <textarea
              v-model="editMessage"
              class="edit-textarea"
              placeholder="Add instructions or context..."
              rows="2"
            />
          </div>
          <div class="edit-field">
            <label class="edit-label">Arguments (JSON)</label>
            <textarea
              v-model="editArgsText"
              class="edit-textarea mono"
              rows="6"
            />
            <span
              v-if="argsParseError"
              class="parse-error"
              >{{ argsParseError }}</span
            >
          </div>
          <div class="edit-actions">
            <button
              class="btn btn-ghost"
              type="button"
              @click="cancelEdit"
            >
              Cancel
            </button>
            <button
              class="btn btn-primary"
              type="button"
              @click="submitEdit"
            >
              <Send :size="12" />
              Submit
            </button>
          </div>
        </div>
      </Transition>

      <!-- Action buttons -->
      <div
        v-if="!editMode"
        class="banner-actions"
      >
        <button
          v-if="canApprove"
          class="btn btn-green"
          type="button"
          @click="handleApprove"
        >
          <Check :size="14" />
          Approve
        </button>
        <button
          v-if="canReject"
          class="btn btn-red"
          type="button"
          @click="handleReject"
        >
          <X :size="14" />
          Reject
        </button>
        <button
          v-if="canEdit"
          class="btn btn-accent"
          type="button"
          @click="enterEditMode"
        >
          <Pencil :size="14" />
          Edit
        </button>
        <button
          class="btn btn-ghost"
          type="button"
          @click="emit('dismiss')"
        >
          Dismiss
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.interrupt-banner {
  background: rgba(210, 153, 34, 0.08);
  border: 1px solid rgba(210, 153, 34, 0.3);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0 16px;
}

.interrupt-banner.compact {
  margin: 0;
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-top: none;
  padding: 12px 14px;
}

.banner-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.banner-icon {
  color: #d29922;
  flex-shrink: 0;
}

.banner-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.banner-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #e6edf3);
}

.banner-tool {
  font-size: 11px;
  color: var(--text-color-secondary, #8b949e);
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
}

.banner-description {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-color, #e6edf3);
  margin: 0;
}

/* Options */
.banner-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.option-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
}

.option-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color, #e6edf3);
}

.option-desc {
  font-size: 11px;
  color: var(--text-color-secondary, #8b949e);
}

/* Edit section */
.edit-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}

.edit-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.edit-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(139, 148, 158, 0.6);
}

.edit-textarea {
  width: 100%;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color, #30363d);
  border-radius: 6px;
  color: var(--text-color, #e6edf3);
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
}

.edit-textarea:focus {
  border-color: var(--primary-color, #7c9ef8);
}

.edit-textarea.mono {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
  font-size: 11px;
}

.parse-error {
  font-size: 11px;
  color: #f85149;
}

.edit-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* Action buttons */
.banner-actions {
  display: flex;
  gap: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-green {
  background: rgba(63, 185, 80, 0.1);
  border-color: rgba(63, 185, 80, 0.3);
  color: #3fb950;
}

.btn-green:hover {
  background: rgba(63, 185, 80, 0.2);
}

.btn-red {
  background: rgba(248, 81, 73, 0.1);
  border-color: rgba(248, 81, 73, 0.3);
  color: #f85149;
}

.btn-red:hover {
  background: rgba(248, 81, 73, 0.2);
}

.btn-accent {
  background: rgba(124, 158, 248, 0.1);
  border-color: rgba(124, 158, 248, 0.3);
  color: var(--primary-color, #7c9ef8);
}

.btn-accent:hover {
  background: rgba(124, 158, 248, 0.2);
}

.btn-primary {
  background: var(--primary-color, #7c9ef8);
  color: #ffffff;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-ghost {
  background: transparent;
  border-color: var(--border-color, #30363d);
  color: var(--text-color-secondary, #8b949e);
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color, #e6edf3);
}

/* Slide down transition */
.slide-down-enter-active {
  transition: all 0.3s ease-out;
}

.slide-down-leave-active {
  transition: all 0.2s ease-in;
}

.slide-down-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}

.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-8px);
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
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 500px;
}
</style>
