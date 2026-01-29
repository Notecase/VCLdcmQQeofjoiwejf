<script setup lang="ts">
/**
 * ResourcesModal - Learning resources viewer
 *
 * Displays curated learning resources with type icons and links.
 */
import { computed, ref } from 'vue'
import { useRecommendationsStore, type Resource } from '@/stores/recommendations'
import {
  Link2,
  FileText,
  BookOpen,
  Video,
  GraduationCap,
  Newspaper,
  Wrench,
  ExternalLink,
  Copy,
  Check
} from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import { renderMathContent } from '@/utils/mathRenderer'

// Store
const store = useRecommendationsStore()

// Copy state
const copied = ref(false)

// Emits
const emit = defineEmits<{
  close: []
}>()

// Computed
const resources = computed<Resource[]>(() =>
  store.currentRecommendations?.resources || []
)

// Type icon mapping
function getTypeIcon(type: string) {
  switch (type) {
    case 'paper':
      return FileText
    case 'book':
      return BookOpen
    case 'video':
      return Video
    case 'course':
      return GraduationCap
    case 'article':
      return Newspaper
    case 'tool':
      return Wrench
    default:
      return Link2
  }
}

// Type label
function getTypeLabel(type: string): string {
  switch (type) {
    case 'paper':
      return 'Research Paper'
    case 'book':
      return 'Book'
    case 'video':
      return 'Video'
    case 'course':
      return 'Course'
    case 'article':
      return 'Article'
    case 'tool':
      return 'Tool'
    default:
      return 'Resource'
  }
}

function openResource(link?: string) {
  if (link) {
    window.open(link, '_blank', 'noopener,noreferrer')
  }
}

// Render content with math support
function renderContent(text: string | undefined): string {
  return renderMathContent(text || '')
}

// Copy all resources as markdown
async function copyAsMarkdown() {
  const markdown = resources.value
    .map((r) =>
      `- **${r.title}** (${getTypeLabel(r.type)})${r.link ? `\n  ${r.link}` : ''}${r.description ? `\n  ${r.description}` : ''}`
    )
    .join('\n')

  try {
    await navigator.clipboard.writeText(markdown)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    console.error('Failed to copy:', error)
  }
}
</script>

<template>
  <BaseModal
    title="Learning Resources"
    :subtitle="`${resources.length} resources`"
    size="md"
    @close="emit('close')"
  >
    <template #icon>
      <Link2 :size="20" />
    </template>

    <template #header-right>
      <button
        class="copy-btn"
        :class="{ copied }"
        @click.stop="copyAsMarkdown"
        :title="copied ? 'Copied!' : 'Copy all as Markdown'"
      >
        <Check v-if="copied" :size="14" />
        <Copy v-else :size="14" />
        <span>{{ copied ? 'Copied!' : 'Copy' }}</span>
      </button>
    </template>

    <div class="resources-list" v-if="resources.length > 0">
      <div
        v-for="(resource, index) in resources"
        :key="index"
        class="resource-item"
        :class="{ clickable: !!resource.link }"
        @click="openResource(resource.link)"
      >
        <div class="resource-icon">
          <component :is="getTypeIcon(resource.type)" :size="20" />
        </div>

        <div class="resource-content">
          <div class="resource-header">
            <span class="resource-title math-content" v-html="renderContent(resource.title)"></span>
            <span class="resource-type">{{ getTypeLabel(resource.type) }}</span>
          </div>

          <p class="resource-description math-content" v-html="renderContent(resource.description)"></p>
        </div>

        <ExternalLink v-if="resource.link" :size="16" class="external-icon" />
      </div>
    </div>

    <div class="empty-state" v-else>
      <p>No resources available.</p>
    </div>
  </BaseModal>
</template>

<style scoped>
.resources-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.resource-item {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
  background: rgba(22, 27, 34, 0.5);
  border: 1px solid #21262d;
  border-radius: 8px;
  transition: all 0.15s;
}

.resource-item.clickable {
  cursor: pointer;
}

.resource-item.clickable:hover {
  background: rgba(33, 38, 45, 0.5);
  border-color: #30363d;
}

.resource-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(88, 166, 255, 0.1);
  border-radius: 8px;
  color: #58a6ff;
  flex-shrink: 0;
}

.resource-content {
  flex: 1;
  min-width: 0;
}

.resource-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.resource-title {
  font-size: 14px;
  font-weight: 500;
  color: #e6edf3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.resource-type {
  font-size: 10px;
  font-weight: 500;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.resource-description {
  font-size: 13px;
  color: #8b949e;
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Math content styles */
.math-content :deep(.math-display) {
  margin: 0.25rem 0;
}

.math-content :deep(.math-inline) {
  display: inline;
}

.math-content :deep(.math-code-block) {
  margin: 0.25rem 0;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  font-size: 12px;
  overflow-x: auto;
}

.math-content :deep(.math-inline-code) {
  padding: 0.125rem 0.375rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.9em;
}

.math-content :deep(.katex) {
  font-size: 1em;
}

.math-content :deep(.katex-display) {
  margin: 0.25rem 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.external-icon {
  color: #6e7681;
  flex-shrink: 0;
  margin-top: 4px;
}

.resource-item:hover .external-icon {
  color: #58a6ff;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #8b949e;
}

/* Copy button */
.copy-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #30363d;
  border-radius: 6px;
  background: transparent;
  color: #8b949e;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.copy-btn:hover {
  border-color: #58a6ff;
  color: #58a6ff;
}

.copy-btn.copied {
  border-color: #3fb950;
  color: #3fb950;
}
</style>
