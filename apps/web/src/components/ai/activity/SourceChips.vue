<script setup lang="ts">
/**
 * SourceChips - Compact row of RAG citation chips above AI responses.
 *
 * Shows which notes were consulted during RAG as clickable chips.
 * Max 3 visible, with "+N more" pill for overflow.
 */
import { computed } from 'vue'
import { FileText } from 'lucide-vue-next'
import type { MessageCitation } from '@/stores/ai'
import { useEditorStore } from '@/stores/editor'

const props = defineProps<{
  citations: MessageCitation[]
}>()

const editorStore = useEditorStore()

const visibleCitations = computed(() => props.citations.slice(0, 3))
const overflowCount = computed(() => Math.max(0, props.citations.length - 3))

function handleChipClick(noteId: string) {
  editorStore.loadDocument(noteId)
}
</script>

<template>
  <div class="source-chips">
    <div class="chips-label">
      <FileText :size="11" class="label-icon" />
      <span>{{ citations.length }} source{{ citations.length > 1 ? 's' : '' }}</span>
    </div>
    <div class="chips-list">
      <button
        v-for="citation in visibleCitations"
        :key="citation.id"
        class="chip"
        :title="citation.snippet"
        type="button"
        @click="handleChipClick(citation.noteId)"
      >
        {{ citation.title }}
      </button>
      <span
        v-if="overflowCount > 0"
        class="overflow-pill"
      >+{{ overflowCount }} more</span>
    </div>
  </div>
</template>

<style scoped>
.source-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  margin-bottom: 4px;
}

.chips-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.label-icon {
  color: var(--text-muted);
  opacity: 0.7;
}

.chips-list {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  cursor: pointer;
  transition: all var(--transition-fast) ease;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip:hover {
  background: var(--surface-3);
  color: var(--text-primary);
  border-color: var(--stream-cursor);
}

.overflow-pill {
  font-size: 10px;
  color: var(--text-muted);
  padding: 2px 6px;
  background: var(--surface-2);
  border-radius: 6px;
}
</style>
