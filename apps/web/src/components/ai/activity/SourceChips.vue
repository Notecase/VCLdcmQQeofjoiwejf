<script setup lang="ts">
/**
 * SourceChips - Compact row of citation chips above AI responses.
 *
 * Shows note sources (file icon) and web sources (globe icon) as clickable chips.
 * Note chips navigate to the note; web chips open the URL in a new tab.
 * Max 3 visible, with "+N more" pill for overflow.
 */
import { computed } from 'vue'
import { FileText, Globe } from 'lucide-vue-next'
import type { MessageCitation } from '@/stores/ai'
import { useEditorStore } from '@/stores/editor'

const props = defineProps<{
  citations: MessageCitation[]
}>()

const editorStore = useEditorStore()

const noteCitations = computed(() => props.citations.filter((c) => c.source === 'note'))
const webCitations = computed(() => props.citations.filter((c) => c.source === 'web'))
const allCitations = computed(() => [...noteCitations.value, ...webCitations.value])
const visibleCitations = computed(() => allCitations.value.slice(0, 3))
const overflowCount = computed(() => Math.max(0, allCitations.value.length - 3))

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function handleChipClick(citation: MessageCitation) {
  if (citation.source === 'web' && citation.url) {
    window.open(citation.url, '_blank', 'noopener,noreferrer')
  } else if (citation.source === 'note' && citation.noteId) {
    editorStore.loadDocument(citation.noteId)
  }
}
</script>

<template>
  <div
    v-if="allCitations.length > 0"
    class="source-chips"
  >
    <div class="chips-label">
      <FileText
        v-if="noteCitations.length > 0"
        :size="11"
        class="label-icon"
      />
      <Globe
        v-else
        :size="11"
        class="label-icon"
      />
      <span>{{ allCitations.length }} source{{ allCitations.length > 1 ? 's' : '' }}</span>
    </div>
    <div class="chips-list">
      <button
        v-for="citation in visibleCitations"
        :key="citation.id"
        class="chip"
        :class="{ 'chip--web': citation.source === 'web' }"
        :title="citation.snippet"
        type="button"
        @click="handleChipClick(citation)"
      >
        <FileText
          v-if="citation.source === 'note'"
          :size="10"
          class="chip-icon"
        />
        <Globe
          v-else
          :size="10"
          class="chip-icon"
        />
        <span class="chip-label">
          {{ citation.source === 'web' && citation.url ? getDomain(citation.url) : citation.title }}
        </span>
      </button>
      <span
        v-if="overflowCount > 0"
        class="overflow-pill"
        >+{{ overflowCount }} more</span
      >
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
  gap: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  cursor: pointer;
  transition: all var(--transition-fast) ease;
  max-width: 180px;
}

.chip:hover {
  background: var(--surface-3);
  color: var(--text-primary);
  border-color: var(--stream-cursor);
}

.chip--web:hover {
  border-color: var(--accent-green, var(--stream-cursor));
}

.chip-icon {
  flex-shrink: 0;
  opacity: 0.6;
}

.chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overflow-pill {
  font-size: 10px;
  color: var(--text-muted);
  padding: 2px 6px;
  background: var(--surface-2);
  border-radius: 6px;
}
</style>
