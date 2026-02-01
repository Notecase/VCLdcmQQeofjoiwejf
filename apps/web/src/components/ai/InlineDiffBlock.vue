<script setup lang="ts">
/**
 * InlineDiffBlock - Clean hunk-based diff visualization
 *
 * Displays a single diff hunk as a block with:
 * - Deletion row (red, with clickable "-" icon)
 * - Addition row (green, with clickable "+" icon)
 *
 * Click "-" = reject change (keep original)
 * Click "+" = accept change (use new version)
 */
import { computed } from 'vue'
import type { DiffHunk } from '@/stores/ai'

const props = defineProps<{
  hunk: DiffHunk
  editId: string
}>()

const emit = defineEmits<{
  accept: [hunkId: string]
  reject: [hunkId: string]
}>()

const showDeletion = computed(() =>
  props.hunk.oldContent && props.hunk.type !== 'add'
)

const showAddition = computed(() =>
  props.hunk.newContent && props.hunk.type !== 'remove'
)

function handleReject() {
  emit('reject', props.hunk.id)
}

function handleAccept() {
  emit('accept', props.hunk.id)
}
</script>

<template>
  <div class="inline-diff-block" :class="{ 'type-modify': hunk.type === 'modify' }">
    <!-- Deletion row -->
    <div
      v-if="showDeletion"
      class="diff-row deletion"
      role="button"
      tabindex="0"
      @click="handleReject"
      @keydown.enter="handleReject"
      @keydown.space.prevent="handleReject"
    >
      <span class="diff-icon">−</span>
      <span class="diff-content">{{ hunk.oldContent }}</span>
    </div>

    <!-- Addition row -->
    <div
      v-if="showAddition"
      class="diff-row addition"
      role="button"
      tabindex="0"
      @click="handleAccept"
      @keydown.enter="handleAccept"
      @keydown.space.prevent="handleAccept"
    >
      <span class="diff-icon">+</span>
      <span class="diff-content">{{ hunk.newContent }}</span>
    </div>
  </div>
</template>

<style scoped>
.inline-diff-block {
  margin: 8px 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-color, #30363d);
  font-family: inherit;
  font-size: inherit;
  line-height: 1.6;
}

.diff-row {
  display: flex;
  align-items: flex-start;
  padding: 8px 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  gap: 12px;
}

.diff-row:hover {
  filter: brightness(1.1);
}

.diff-row:active {
  transform: scale(0.995);
}

.diff-row:focus {
  outline: 2px solid var(--primary-color, #58a6ff);
  outline-offset: -2px;
}

.diff-row.deletion {
  background: rgba(248, 81, 73, 0.15);
  border-bottom: 1px solid rgba(248, 81, 73, 0.3);
}

.diff-row.deletion .diff-icon {
  color: #f85149;
  font-weight: 600;
}

.diff-row.deletion .diff-content {
  color: #ffa198;
}

.diff-row.addition {
  background: rgba(46, 160, 67, 0.15);
}

.diff-row.addition .diff-icon {
  color: #3fb950;
  font-weight: 600;
}

.diff-row.addition .diff-content {
  color: #7ee787;
}

.diff-icon {
  flex-shrink: 0;
  width: 20px;
  font-size: 16px;
  font-weight: bold;
  text-align: center;
  user-select: none;
}

.diff-content {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-word;
}

.inline-diff-block:not(.type-modify) .diff-row {
  border-bottom: none;
}
</style>
