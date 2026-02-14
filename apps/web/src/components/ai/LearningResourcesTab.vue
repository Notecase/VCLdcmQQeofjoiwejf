<script setup lang="ts">
/**
 * LearningResourcesTab - Saved Learning Resources
 *
 * Displays AI-generated learning resources attached to notes.
 * Resources are saved separately from note content.
 *
 * Features:
 * - List all saved resources for current note
 * - View, practice (flashcards/QA), copy, delete resources
 * - Quick access to regenerate resources
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useEditorStore } from '@/stores'
import {
  useLearningResourcesStore,
  type LearningResource,
  type LearningResourceType,
} from '@/stores/learningResources'
import { useRecommendationsStore } from '@/stores/recommendations'
import BaseModal from './modals/BaseModal.vue'
import FlashcardsModal from './modals/FlashcardsModal.vue'
import MindmapModal from './modals/MindmapModal.vue'
import {
  Loader2,
  Plus,
  Eye,
  Copy,
  Trash2,
  PlayCircle,
  Check,
  BookOpen,
  Brain,
  FileText,
  HelpCircle,
  ListChecks,
  Link,
  FileQuestion,
  Clock,
  GitCompare,
} from 'lucide-vue-next'

// Stores
const editorStore = useEditorStore()
const learningStore = useLearningResourcesStore()
const recommendStore = useRecommendationsStore()

// Computed
const activeNote = computed(() => editorStore.currentDocument)
const noteId = computed(() => activeNote.value?.id)
const resources = computed(() => learningStore.currentResources)
const hasResources = computed(() => learningStore.hasResources)
const isLoading = computed(() => learningStore.isLoading)
const successMessage = computed(() => learningStore.successMessage)

// State
const showViewModal = ref(false)
const viewingResource = ref<LearningResource | null>(null)
const copiedId = ref<string | null>(null)

// Resource type icons
function getTypeIcon(type: LearningResourceType) {
  switch (type) {
    case 'flashcards':
      return BookOpen
    case 'mindmap':
      return Brain
    case 'key_terms':
      return ListChecks
    case 'qa':
      return HelpCircle
    case 'summary':
      return FileText
    case 'exercises':
      return FileQuestion
    case 'resources':
      return Link
    case 'study_note':
      return FileText
    case 'timeline':
      return Clock
    case 'comparison':
      return GitCompare
    default:
      return FileText
  }
}

// Get display info for resource type
function getTypeInfo(type: LearningResourceType) {
  return learningStore.getTypeInfo(type)
}

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// Check if type can be practiced (interactive study)
function canPractice(type: LearningResourceType): boolean {
  return type === 'flashcards' || type === 'qa'
}

// View resource content
function handleView(resource: LearningResource) {
  viewingResource.value = resource
  showViewModal.value = true
}

// Practice mode (for flashcards/QA)
function handlePractice(resource: LearningResource) {
  // Set the recommendation data and open the appropriate modal
  if (resource.type === 'flashcards' && noteId.value) {
    recommendStore.setRecommendation(noteId.value, {
      flashcards: (resource.data as any).cards,
    })
    recommendStore.openModal('flashcards')
  } else if (resource.type === 'qa' && noteId.value) {
    // For Q&A, we'll show in a view modal for now
    viewingResource.value = resource
    showViewModal.value = true
  }
}

// Copy as markdown
async function handleCopy(resource: LearningResource) {
  const success = await learningStore.copyAsMarkdown(resource)
  if (success) {
    copiedId.value = resource.id
    setTimeout(() => {
      copiedId.value = null
    }, 2000)
  }
}

// Delete resource
async function handleDelete(resource: LearningResource) {
  const typeInfo = getTypeInfo(resource.type)
  if (confirm(`Delete ${typeInfo.label}? This action cannot be undone.`)) {
    await learningStore.deleteResource(resource.id)
  }
}

// Open recommend tab to generate more
function handleGenerateMore() {
  // This would switch to the Recommend tab - emit event to parent
  // For now, we'll just show a hint
}

// Close view modal
function closeViewModal() {
  showViewModal.value = false
  viewingResource.value = null
}

// Close recommendation modal
function closeRecommendModal() {
  recommendStore.closeModal()
}

// Render resource content for view modal
function renderResourceContent(resource: LearningResource): string {
  const { type, data } = resource

  switch (type) {
    case 'flashcards': {
      const cards = (data as any).cards || []
      return cards
        .map(
          (card: any, i: number) =>
            `<div class="card-item">
            <div class="card-number">Card ${i + 1}</div>
            <div class="card-question"><strong>Q:</strong> ${escapeHtml(card.question)}</div>
            <div class="card-answer"><strong>A:</strong> ${escapeHtml(card.answer)}</div>
          </div>`
        )
        .join('')
    }

    case 'key_terms': {
      const terms = (data as any).terms || []
      return terms
        .map(
          (t: any) =>
            `<div class="term-item">
            <div class="term-name">${escapeHtml(t.term)}</div>
            <div class="term-definition">${escapeHtml(t.definition)}</div>
            ${t.source ? `<div class="term-source">Source: ${escapeHtml(t.source)}</div>` : ''}
          </div>`
        )
        .join('')
    }

    case 'qa': {
      const questions = (data as any).questions || []
      return questions
        .map(
          (q: any, i: number) =>
            `<div class="qa-item">
            <div class="qa-number">Question ${i + 1}</div>
            <div class="qa-question"><strong>Q:</strong> ${escapeHtml(q.question)}</div>
            <div class="qa-answer"><strong>A:</strong> ${escapeHtml(q.answer)}</div>
            ${q.source ? `<div class="qa-source">Source: ${escapeHtml(q.source)}</div>` : ''}
          </div>`
        )
        .join('')
    }

    case 'summary': {
      const summary = data as any
      let html = `<div class="summary-content">${escapeHtml(summary.content)}</div>`
      if (summary.keyPoints?.length) {
        html += '<div class="key-points"><strong>Key Points:</strong><ul>'
        html += summary.keyPoints.map((p: string) => `<li>${escapeHtml(p)}</li>`).join('')
        html += '</ul></div>'
      }
      return html
    }

    case 'exercises': {
      const exercises = (data as any).exercises || []
      return exercises
        .map(
          (ex: any, i: number) =>
            `<div class="exercise-item">
            <div class="exercise-header">
              <span class="exercise-number">Exercise ${i + 1}:</span>
              <span class="exercise-title">${escapeHtml(ex.title)}</span>
              <span class="exercise-difficulty ${ex.difficulty}">${ex.difficulty}</span>
            </div>
            <div class="exercise-description">${escapeHtml(ex.description)}</div>
          </div>`
        )
        .join('')
    }

    case 'study_note':
      return `<div class="study-note-content">${escapeHtml((data as any).content)}</div>`

    case 'timeline': {
      const events = (data as any).events || []
      return events
        .map(
          (e: any) =>
            `<div class="timeline-item">
            <div class="timeline-date">${escapeHtml(e.date)}</div>
            <div class="timeline-event">${escapeHtml(e.event)}</div>
          </div>`
        )
        .join('')
    }

    case 'comparison': {
      const comp = data as any
      let html = ''
      if (comp.agreements?.length) {
        html += '<div class="comparison-section"><h4>Agreements</h4><ul>'
        html += comp.agreements.map((a: string) => `<li>${escapeHtml(a)}</li>`).join('')
        html += '</ul></div>'
      }
      if (comp.differences?.length) {
        html += '<div class="comparison-section"><h4>Differences</h4><ul>'
        html += comp.differences.map((d: string) => `<li>${escapeHtml(d)}</li>`).join('')
        html += '</ul></div>'
      }
      return html
    }

    default:
      return `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Load resources when note changes
watch(
  noteId,
  async (id) => {
    if (id) {
      learningStore.setCurrentNote(id)
      await learningStore.fetchResources(id)
    }
  },
  { immediate: true }
)

onMounted(async () => {
  if (noteId.value) {
    learningStore.setCurrentNote(noteId.value)
    await learningStore.fetchResources(noteId.value)
  }
})
</script>

<template>
  <div class="learning-resources-tab">
    <!-- No Note Selected -->
    <div
      v-if="!activeNote"
      class="context-indicator"
    >
      <span class="radio-dot"></span>
      <span>Select a note to view learning resources</span>
    </div>

    <!-- Main Content -->
    <template v-else>
      <!-- Header -->
      <div class="tab-header">
        <h3 class="tab-title">Learning Resources</h3>
        <span
          v-if="activeNote"
          class="note-context"
        >
          {{ activeNote.title }}
        </span>
      </div>

      <!-- Success Message -->
      <div
        v-if="successMessage"
        class="success-toast"
      >
        <Check :size="14" />
        <span>{{ successMessage }}</span>
      </div>

      <!-- Loading State -->
      <div
        v-if="isLoading"
        class="loading-state"
      >
        <Loader2
          :size="20"
          class="spin"
        />
        <span>Loading resources...</span>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!hasResources"
        class="empty-state"
      >
        <div class="empty-icon">
          <BookOpen :size="32" />
        </div>
        <p class="empty-title">No saved resources yet</p>
        <p class="empty-desc">
          Generate flashcards, mindmaps, Q&A, and more from the Recommend tab, then save them here
          for easy access.
        </p>
        <div class="empty-hint">
          <span>Tip: Resources are saved per note</span>
        </div>
      </div>

      <!-- Resources List -->
      <div
        v-else
        class="resources-list"
      >
        <div
          v-for="resource in resources"
          :key="resource.id"
          class="resource-card"
        >
          <div class="resource-header">
            <component
              :is="getTypeIcon(resource.type)"
              :size="18"
              class="resource-icon"
            />
            <div class="resource-info">
              <span class="resource-type">{{ getTypeInfo(resource.type).label }}</span>
              <span
                v-if="resource.item_count > 0"
                class="resource-count"
              >
                ({{ resource.item_count }} {{ resource.item_count === 1 ? 'item' : 'items' }})
              </span>
            </div>
            <span class="resource-time">{{ formatRelativeTime(resource.updated_at) }}</span>
          </div>

          <div class="resource-actions">
            <!-- Practice Button (for flashcards/QA) -->
            <button
              v-if="canPractice(resource.type)"
              class="action-btn primary"
              title="Practice"
              @click="handlePractice(resource)"
            >
              <PlayCircle :size="14" />
              <span>Practice</span>
            </button>

            <!-- View Button -->
            <button
              class="action-btn"
              title="View"
              @click="handleView(resource)"
            >
              <Eye :size="14" />
              <span>View</span>
            </button>

            <!-- Copy Button -->
            <button
              class="action-btn"
              :title="copiedId === resource.id ? 'Copied!' : 'Copy as Markdown'"
              @click="handleCopy(resource)"
            >
              <Check
                v-if="copiedId === resource.id"
                :size="14"
                class="copied"
              />
              <Copy
                v-else
                :size="14"
              />
            </button>

            <!-- Delete Button -->
            <button
              class="action-btn danger"
              title="Delete"
              @click="handleDelete(resource)"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </div>

      <!-- Generate More Button -->
      <div
        v-if="hasResources"
        class="generate-more"
      >
        <button
          class="generate-btn"
          @click="handleGenerateMore"
        >
          <Plus :size="14" />
          <span>Generate more from Recommend tab</span>
        </button>
      </div>
    </template>

    <!-- View Modal -->
    <BaseModal
      v-if="showViewModal && viewingResource"
      :title="getTypeInfo(viewingResource.type).label"
      :subtitle="`${viewingResource.item_count} items`"
      size="lg"
      @close="closeViewModal"
    >
      <template #icon>
        <component
          :is="getTypeIcon(viewingResource.type)"
          :size="20"
        />
      </template>

      <template #header-right>
        <button
          class="modal-action-btn"
          :title="copiedId === viewingResource.id ? 'Copied!' : 'Copy as Markdown'"
          @click="handleCopy(viewingResource)"
        >
          <Check
            v-if="copiedId === viewingResource.id"
            :size="14"
            class="copied"
          />
          <Copy
            v-else
            :size="14"
          />
          <span>{{ copiedId === viewingResource.id ? 'Copied!' : 'Copy' }}</span>
        </button>
      </template>

      <div
        class="resource-content"
        v-html="renderResourceContent(viewingResource)"
      ></div>
    </BaseModal>

    <!-- Flashcards Practice Modal -->
    <FlashcardsModal
      v-if="recommendStore.activeModal === 'flashcards'"
      @close="closeRecommendModal"
    />

    <!-- Mindmap Modal -->
    <MindmapModal
      v-if="recommendStore.activeModal === 'mindmap'"
      @close="closeRecommendModal"
    />
  </div>
</template>

<style scoped>
.learning-resources-tab {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

/* Context Indicator */
.context-indicator {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-left: 3px solid var(--primary-color, #7c9ef8);
}

.radio-dot {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-color, #333338);
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 2px;
}

.context-indicator span:last-child {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
}

/* Tab Header */
.tab-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tab-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.note-context {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
}

/* Success Toast */
.success-toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 8px;
  font-size: 13px;
  color: var(--primary-color, #7c9ef8);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 20px;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 13px;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px 20px;
  gap: 12px;
}

.empty-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(88, 166, 255, 0.1);
  border-radius: 16px;
  color: var(--primary-color, #7c9ef8);
}

.empty-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.empty-desc {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0;
  max-width: 260px;
  line-height: 1.5;
}

.empty-hint {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  padding: 6px 12px;
  background: var(--editor-color-04, rgba(255, 255, 255, 0.04));
  border-radius: 6px;
}

/* Resources List */
.resources-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  overflow-y: auto;
}

/* Resource Card - thin line border */
.resource-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: transparent;
  border: 1px solid var(--ai-divider);
  border-radius: 10px;
  transition: all 0.15s ease;
}

.resource-card:hover {
  border-color: var(--primary-color, #7c9ef8);
}

.resource-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.resource-icon {
  color: var(--primary-color, #7c9ef8);
  flex-shrink: 0;
}

.resource-info {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.resource-type {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color, #e2e8f0);
}

.resource-count {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
}

.resource-time {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
}

/* Resource Actions - show on hover */
.resource-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.15s;
}

.resource-card:hover .resource-actions {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: 1px solid var(--border-color, #333338);
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  border-color: var(--primary-color, #7c9ef8);
  color: var(--primary-color, #7c9ef8);
}

.action-btn.primary {
  background: rgba(88, 166, 255, 0.15);
  border-color: rgba(88, 166, 255, 0.3);
  color: var(--primary-color, #7c9ef8);
}

.action-btn.primary:hover {
  background: rgba(88, 166, 255, 0.25);
}

.action-btn.danger:hover {
  border-color: #f85149;
  color: #f85149;
}

.action-btn .copied {
  color: #3fb950;
}

/* Generate More Button */
.generate-more {
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid var(--ai-divider, rgba(255, 255, 255, 0.04));
}

.generate-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  border: 1px dashed var(--border-color, #333338);
  border-radius: 8px;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.generate-btn:hover {
  border-color: var(--primary-color, #7c9ef8);
  color: var(--primary-color, #7c9ef8);
  background: rgba(88, 166, 255, 0.05);
}

/* Modal Action Button */
.modal-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border-color, #333338);
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.modal-action-btn:hover {
  border-color: var(--primary-color, #7c9ef8);
  color: var(--primary-color, #7c9ef8);
}

.modal-action-btn .copied {
  color: #3fb950;
}

/* Resource Content Styles */
.resource-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 400px;
  overflow-y: auto;
}

.resource-content :deep(.card-item),
.resource-content :deep(.term-item),
.resource-content :deep(.qa-item),
.resource-content :deep(.exercise-item),
.resource-content :deep(.timeline-item) {
  padding: 12px;
  background: var(--editor-color-04, rgba(255, 255, 255, 0.04));
  border-radius: 8px;
  margin-bottom: 12px;
}

.resource-content :deep(.card-number),
.resource-content :deep(.qa-number),
.resource-content :deep(.exercise-number) {
  font-size: 11px;
  font-weight: 600;
  color: var(--primary-color, #7c9ef8);
  margin-bottom: 8px;
}

.resource-content :deep(.card-question),
.resource-content :deep(.qa-question) {
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
  margin-bottom: 6px;
}

.resource-content :deep(.card-answer),
.resource-content :deep(.qa-answer) {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
}

.resource-content :deep(.term-name) {
  font-size: 14px;
  font-weight: 600;
  color: var(--primary-color, #7c9ef8);
  margin-bottom: 4px;
}

.resource-content :deep(.term-definition) {
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
}

.resource-content :deep(.term-source),
.resource-content :deep(.qa-source) {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  margin-top: 6px;
}

.resource-content :deep(.exercise-header) {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.resource-content :deep(.exercise-title) {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color, #e2e8f0);
}

.resource-content :deep(.exercise-difficulty) {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}

.resource-content :deep(.exercise-difficulty.easy) {
  background: rgba(63, 185, 80, 0.2);
  color: #3fb950;
}

.resource-content :deep(.exercise-difficulty.medium) {
  background: rgba(240, 136, 62, 0.2);
  color: #f0883e;
}

.resource-content :deep(.exercise-difficulty.hard) {
  background: rgba(248, 81, 73, 0.2);
  color: #f85149;
}

.resource-content :deep(.exercise-description) {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
}

.resource-content :deep(.timeline-date) {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary-color, #7c9ef8);
  margin-bottom: 4px;
}

.resource-content :deep(.timeline-event) {
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
}

.resource-content :deep(.summary-content),
.resource-content :deep(.study-note-content) {
  font-size: 14px;
  color: var(--text-color, #e2e8f0);
  line-height: 1.6;
  white-space: pre-wrap;
}

.resource-content :deep(.key-points) {
  margin-top: 16px;
}

.resource-content :deep(.key-points ul) {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.resource-content :deep(.key-points li) {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  margin-bottom: 4px;
}

.resource-content :deep(.comparison-section h4) {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0 0 8px 0;
}

.resource-content :deep(.comparison-section ul) {
  margin: 0;
  padding-left: 20px;
}

.resource-content :deep(.comparison-section li) {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  margin-bottom: 4px;
}

.resource-content :deep(pre) {
  background: var(--card-bg, #242428);
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  overflow-x: auto;
}

/* Spinner */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
