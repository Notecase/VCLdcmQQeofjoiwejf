<script setup lang="ts">
/**
 * InlineDiffHunk - Minimal inline diff suggestion
 *
 * Shows ONLY the proposed new content as a highlighted suggestion
 * that appears inline below the text it would replace.
 * Original text stays visible normally until user accepts.
 *
 * - Green highlighted block with proposed text
 * - Small +/- icons on the left to accept/reject
 * - Compact, minimal, fits naturally in document flow
 */
import { ref } from 'vue'

export interface DiffHunkData {
  id: string
  oldContent: string
  newContent: string
  status: 'pending' | 'accepted' | 'rejected'
}

const props = defineProps<{
  hunk: DiffHunkData
}>()

const emit = defineEmits<{
  accept: [hunkId: string]
  reject: [hunkId: string]
}>()

const isExiting = ref(false)

function handleAccept() {
  isExiting.value = true
  setTimeout(() => emit('accept', props.hunk.id), 150)
}

function handleReject() {
  isExiting.value = true
  setTimeout(() => emit('reject', props.hunk.id), 150)
}
</script>

<template>
  <div
    class="inline-suggestion"
    :class="{ 'is-exiting': isExiting }"
  >
    <!-- Action icons -->
    <div class="suggestion-actions">
      <button
        class="action-icon reject"
        title="Reject (keep original)"
        @click="handleReject"
      >
        −
      </button>
      <button
        class="action-icon accept"
        title="Accept change"
        @click="handleAccept"
      >
        +
      </button>
    </div>

    <!-- Proposed content -->
    <div class="suggestion-content">
      {{ hunk.newContent }}
    </div>
  </div>
</template>

<style scoped>
.inline-suggestion {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 4px 0;
  padding: 8px 12px;
  background: rgba(63, 185, 80, 0.12);
  border-left: 3px solid rgba(63, 185, 80, 0.5);
  border-radius: 0 6px 6px 0;
  transition: all 0.15s ease;
}

.inline-suggestion.is-exiting {
  opacity: 0;
  transform: translateX(-8px);
}

/* Action icons container */
.suggestion-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

/* Individual action buttons */
.action-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s ease;
}

.action-icon.accept {
  background: rgba(63, 185, 80, 0.2);
  color: #3fb950;
}

.action-icon.accept:hover {
  background: #3fb950;
  color: white;
  transform: scale(1.1);
}

.action-icon.reject {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.action-icon.reject:hover {
  background: #f85149;
  color: white;
  transform: scale(1.1);
}

/* Suggested content */
.suggestion-content {
  flex: 1;
  color: #7ee787;
  font-size: inherit;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Light theme */
:root[data-theme='light'] .inline-suggestion,
:root[data-theme='ulysses-light'] .inline-suggestion,
:root[data-theme='graphite-light'] .inline-suggestion {
  background: rgba(46, 160, 67, 0.1);
  border-left-color: rgba(26, 127, 55, 0.5);
}

:root[data-theme='light'] .suggestion-content,
:root[data-theme='ulysses-light'] .suggestion-content,
:root[data-theme='graphite-light'] .suggestion-content {
  color: #1a7f37;
}
</style>
