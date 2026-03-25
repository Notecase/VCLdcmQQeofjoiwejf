<script setup lang="ts">
/**
 * SourceChips - Expandable source attribution panel above AI responses.
 *
 * Shows favicons + "N sources" in collapsed state.
 * Expands to show all sources with domain names on click.
 * Note chips navigate to the note; web chips open the URL in a new tab.
 */
import { ref, computed } from 'vue'
import { FileText, ChevronDown, ChevronUp } from 'lucide-vue-next'
import type { MessageCitation } from '@/stores/ai'
import { useEditorStore } from '@/stores/editor'

const props = defineProps<{
  citations: MessageCitation[]
}>()

const editorStore = useEditorStore()
const expanded = ref(false)

const noteCitations = computed(() => props.citations.filter((c) => c.source === 'note'))
const webCitations = computed(() => props.citations.filter((c) => c.source === 'web'))
const allCitations = computed(() => [...noteCitations.value, ...webCitations.value])

// Unique favicons for collapsed preview (max 5)
const previewFavicons = computed(() => {
  const seen = new Set<string>()
  const favicons: Array<{ domain: string; url: string }> = []
  for (const c of webCitations.value) {
    if (!c.url) continue
    const domain = getDomain(c.url)
    if (seen.has(domain)) continue
    seen.add(domain)
    favicons.push({ domain, url: getFaviconUrl(c.url) })
    if (favicons.length >= 5) break
  }
  return favicons
})

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch {
    return ''
  }
}

function handleChipClick(citation: MessageCitation) {
  if (citation.source === 'web' && citation.url) {
    window.open(citation.url, '_blank', 'noopener,noreferrer')
  } else if (citation.source === 'note' && citation.noteId) {
    editorStore.loadDocument(citation.noteId)
  }
}

function toggleExpand() {
  expanded.value = !expanded.value
}
</script>

<template>
  <div
    v-if="allCitations.length > 0"
    class="source-chips"
    :class="{ expanded }"
  >
    <!-- Collapsed header: favicons + "N sources" -->
    <button
      class="chips-header"
      type="button"
      @click="toggleExpand"
    >
      <div class="favicon-row">
        <img
          v-for="fav in previewFavicons"
          :key="fav.domain"
          :src="fav.url"
          :alt="fav.domain"
          class="favicon-preview"
          loading="lazy"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
        />
        <FileText
          v-for="nc in noteCitations.slice(0, 2)"
          :key="nc.id"
          :size="14"
          class="note-icon-preview"
        />
      </div>
      <span class="sources-count"
        >{{ allCitations.length }} source{{ allCitations.length > 1 ? 's' : '' }}</span
      >
      <component
        :is="expanded ? ChevronUp : ChevronDown"
        :size="14"
        class="expand-icon"
      />
    </button>

    <!-- Expanded: full list of sources -->
    <div
      v-if="expanded"
      class="chips-grid"
    >
      <button
        v-for="citation in allCitations"
        :key="citation.id"
        class="chip"
        :class="{ 'chip--web': citation.source === 'web' }"
        :title="citation.snippet"
        type="button"
        @click="handleChipClick(citation)"
      >
        <img
          v-if="citation.source === 'web' && citation.url"
          :src="getFaviconUrl(citation.url)"
          :alt="getDomain(citation.url)"
          class="chip-favicon"
          loading="lazy"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
        />
        <FileText
          v-else
          :size="12"
          class="chip-icon"
        />
        <span class="chip-label">
          {{ citation.source === 'web' && citation.url ? getDomain(citation.url) : citation.title }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.source-chips {
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--surface-1);
  margin-bottom: 8px;
  overflow: hidden;
}

.source-chips.expanded {
  background: var(--surface-2);
}

.chips-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  transition: background var(--transition-fast) ease;
}

.chips-header:hover {
  background: var(--surface-2);
}

.favicon-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.favicon-preview {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  flex-shrink: 0;
}

.note-icon-preview {
  color: var(--text-muted);
  flex-shrink: 0;
}

.sources-count {
  font-weight: 500;
  color: var(--text-secondary);
}

.expand-icon {
  margin-left: auto;
  color: var(--text-muted);
  flex-shrink: 0;
}

.chips-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 12px 10px;
  border-top: 1px solid var(--border-subtle);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all var(--transition-fast) ease;
  max-width: 200px;
}

.chip:hover {
  background: var(--surface-3);
  color: var(--text-primary);
}

.chip-favicon {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  flex-shrink: 0;
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
</style>
