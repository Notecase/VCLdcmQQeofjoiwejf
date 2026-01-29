<script setup lang="ts">
/**
 * WorkflowsTab - Sources & Quick Actions
 *
 * New design focused on:
 * 1. Source Management - Upload PDFs, links, files, text
 * 2. Quick Actions - One-click workflows using sources
 * 3. AI Agent Integration hint
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useEditorStore } from '@/stores'
import { useSourcesStore, type WorkflowActionType, type Source } from '@/stores/sources'
import { useLearningResourcesStore, type LearningResourceType } from '@/stores/learningResources'
import SourceCard from './SourceCard.vue'
import AddSourceModal from './modals/AddSourceModal.vue'
import BaseModal from './modals/BaseModal.vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {
  Loader2,
  Plus,
  BookOpen,
  FileText,
  List,
  GitCompare,
  HelpCircle,
  AlertTriangle,
  Quote,
  Clock,
  Lightbulb,
  Eye,
  Save,
  Check,
} from 'lucide-vue-next'

// Stores
const editorStore = useEditorStore()
const sourcesStore = useSourcesStore()
const learningStore = useLearningResourcesStore()

// Computed
const activeNote = computed(() => editorStore.currentDocument)
const noteId = computed(() => activeNote.value?.id)
const sources = computed(() => sourcesStore.currentSources)
const readySources = computed(() => sourcesStore.readySources)
const hasReadySources = computed(() => sourcesStore.hasReadySources)
const totalWordCount = computed(() => sourcesStore.totalWordCount)
const isExecutingAction = computed(() => sourcesStore.isExecutingAction)
const actionProgress = computed(() => sourcesStore.actionProgress)

// State
const showAddModal = ref(false)
const showViewModal = ref(false)
const showResultModal = ref(false)
const viewingSource = ref<Source | null>(null)
const viewingContent = ref<string>('')
const resultAction = ref<WorkflowActionType | null>(null)
const resultData = ref<unknown>(null)
const isSavingResult = ref(false)
const resultSaved = ref(false)

// Quick Actions
const quickActions = computed(() => [
  {
    id: 'generate_study_note' as WorkflowActionType,
    name: 'Generate Study Note',
    description: 'Comprehensive notes from all sources',
    icon: BookOpen,
    minSources: 1,
  },
  {
    id: 'create_summary' as WorkflowActionType,
    name: 'Create Summary',
    description: 'Condense into key points',
    icon: FileText,
    minSources: 1,
  },
  {
    id: 'extract_key_terms' as WorkflowActionType,
    name: 'Extract Key Terms',
    description: 'Build a glossary of definitions',
    icon: List,
    minSources: 1,
  },
  {
    id: 'compare_sources' as WorkflowActionType,
    name: 'Compare Sources',
    description: 'Find agreements & differences',
    icon: GitCompare,
    minSources: 2,
  },
  {
    id: 'generate_qa' as WorkflowActionType,
    name: 'Q&A Generator',
    description: 'Create study questions',
    icon: HelpCircle,
    minSources: 1,
  },
  {
    id: 'find_conflicts' as WorkflowActionType,
    name: 'Find Conflicts',
    description: 'Identify contradictions',
    icon: AlertTriangle,
    minSources: 2,
  },
])

// Methods
function canExecuteAction(minSources: number): boolean {
  return readySources.value.length >= minSources
}

async function executeAction(actionType: WorkflowActionType) {
  if (!noteId.value) return

  const result = await sourcesStore.executeAction(noteId.value, actionType)

  if (result) {
    resultAction.value = actionType
    resultData.value = result
    showResultModal.value = true
  }
}

async function handleViewSource(source: Source) {
  viewingSource.value = source
  viewingContent.value = 'Loading...'
  showViewModal.value = true

  const content = await sourcesStore.getSourceContent(source.id)
  if (content) {
    viewingContent.value = content.content
  } else {
    viewingContent.value = 'Failed to load content'
  }
}

async function handleDeleteSource(source: Source) {
  if (confirm(`Delete "${source.title}"?`)) {
    await sourcesStore.deleteSource(source.id)
  }
}

function openAddModal() {
  showAddModal.value = true
}

function closeAddModal() {
  showAddModal.value = false
}

function closeViewModal() {
  showViewModal.value = false
  viewingSource.value = null
  viewingContent.value = ''
}

function closeResultModal() {
  showResultModal.value = false
  resultAction.value = null
  resultData.value = null
  isSavingResult.value = false
  resultSaved.value = false
}

/**
 * Map workflow action to learning resource type
 */
function mapActionToResourceType(action: WorkflowActionType): LearningResourceType | null {
  const mapping: Record<WorkflowActionType, LearningResourceType | null> = {
    generate_study_note: 'study_note',
    create_summary: 'summary',
    extract_key_terms: 'key_terms',
    compare_sources: 'comparison',
    generate_qa: 'qa',
    find_conflicts: 'comparison', // Conflicts go into comparison type
    extract_citations: 'resources', // Citations as resources
    build_timeline: 'timeline',
  }
  return mapping[action]
}

/**
 * Convert workflow result to learning resource data format
 */
function convertResultToResourceData(
  action: WorkflowActionType,
  data: any
): { data: any; itemCount: number } | null {
  switch (action) {
    case 'generate_study_note':
      return {
        data: { content: data.content },
        itemCount: 1,
      }
    case 'create_summary':
      return {
        data: {
          content: data.content,
          keyPoints: data.keyPoints || [],
        },
        itemCount: data.keyPoints?.length || 0,
      }
    case 'extract_key_terms':
      return {
        data: {
          terms:
            data.terms?.map((t: any) => ({
              term: t.term,
              definition: t.definition,
              source: t.sources?.[0]?.title,
            })) || [],
        },
        itemCount: data.terms?.length || 0,
      }
    case 'compare_sources':
      return {
        data: {
          agreements: data.agreements?.map((a: any) => `${a.topic}: ${a.summary}`) || [],
          differences:
            data.differences?.map(
              (d: any) =>
                `${d.topic}: ${d.comparisons?.map((c: any) => `${c.title} - ${c.position}`).join('; ')}`
            ) || [],
        },
        itemCount: (data.agreements?.length || 0) + (data.differences?.length || 0),
      }
    case 'generate_qa':
      return {
        data: {
          questions:
            data.questions?.map((q: any) => ({
              question: q.question,
              answer: q.answer,
              source: q.sourceTitle,
            })) || [],
        },
        itemCount: data.questions?.length || 0,
      }
    case 'find_conflicts':
      if (!data.hasConflicts) return null
      return {
        data: {
          agreements: [],
          differences: data.conflicts?.map((c: any) => `${c.topic}: ${c.analysis}`) || [],
        },
        itemCount: data.conflicts?.length || 0,
      }
    case 'build_timeline':
      return {
        data: {
          events:
            data.events?.map((e: any) => ({
              date: e.date,
              event: e.event,
              source: e.sourceTitle,
            })) || [],
        },
        itemCount: data.events?.length || 0,
      }
    default:
      return null
  }
}

/**
 * Save workflow result as learning resource
 */
async function handleSaveResult() {
  if (!noteId.value || !resultAction.value || !resultData.value) return

  const resourceType = mapActionToResourceType(resultAction.value)
  if (!resourceType) {
    console.warn('[WorkflowsTab] Cannot save action', resultAction.value)
    return
  }

  const converted = convertResultToResourceData(resultAction.value, resultData.value)
  if (!converted) {
    console.warn('[WorkflowsTab] Failed to convert result data')
    return
  }

  isSavingResult.value = true

  try {
    await learningStore.saveResource(
      noteId.value,
      resourceType,
      converted.data,
      converted.itemCount
    )
    resultSaved.value = true

    // Close modal after short delay to show saved state
    setTimeout(() => {
      closeResultModal()
    }, 1500)
  } catch (error) {
    console.error('[WorkflowsTab] Failed to save result:', error)
  } finally {
    isSavingResult.value = false
  }
}

/**
 * Check if current result can be saved
 */
function canSaveResult(): boolean {
  if (!resultAction.value || !resultData.value) return false
  const resourceType = mapActionToResourceType(resultAction.value)
  return resourceType !== null
}

function getActionLabel(action: WorkflowActionType): string {
  const labels: Record<WorkflowActionType, string> = {
    generate_study_note: 'Study Note',
    create_summary: 'Summary',
    extract_key_terms: 'Key Terms',
    compare_sources: 'Comparison',
    generate_qa: 'Q&A',
    find_conflicts: 'Conflicts',
    extract_citations: 'Citations',
    build_timeline: 'Timeline',
  }
  return labels[action] || action
}

/**
 * Render markdown content to sanitized HTML
 */
function renderMarkdown(content: string): string {
  if (!content) return ''
  const html = marked.parse(content) as string
  return DOMPurify.sanitize(html)
}

// Load sources when note changes
watch(
  noteId,
  async (id) => {
    if (id) {
      sourcesStore.setCurrentNote(id)
      await sourcesStore.fetchSources(id)
    }
  },
  { immediate: true }
)

onMounted(async () => {
  await sourcesStore.fetchAvailableActions()
})
</script>

<template>
  <div class="workflows-tab">
    <!-- No Note Selected -->
    <div
      class="context-indicator"
      v-if="!activeNote"
    >
      <span class="radio-dot"></span>
      <span>Select a note to manage sources</span>
    </div>

    <!-- Main Content -->
    <template v-else>
      <!-- Sources Section -->
      <section class="section sources-section">
        <div class="section-header">
          <h3 class="section-title">Sources for this Note</h3>
          <button
            class="add-btn"
            @click="openAddModal"
          >
            <Plus :size="14" />
            <span>Add Source</span>
          </button>
        </div>

        <!-- Source Type Buttons -->
        <div
          class="source-types"
          v-if="sources.length === 0"
        >
          <button
            class="type-btn"
            @click="openAddModal"
          >
            <FileText :size="16" />
            <span>PDF</span>
          </button>
          <button
            class="type-btn"
            @click="openAddModal"
          >
            <GitCompare :size="16" />
            <span>Link</span>
          </button>
          <button
            class="type-btn"
            @click="openAddModal"
          >
            <FileText :size="16" />
            <span>File</span>
          </button>
          <button
            class="type-btn"
            @click="openAddModal"
          >
            <List :size="16" />
            <span>Text</span>
          </button>
        </div>

        <!-- Sources List -->
        <div
          class="sources-list"
          v-if="sources.length > 0"
        >
          <SourceCard
            v-for="source in sources"
            :key="source.id"
            :source="source"
            @view="handleViewSource"
            @delete="handleDeleteSource"
          />
        </div>

        <!-- Sources Summary -->
        <div
          class="sources-summary"
          v-if="hasReadySources"
        >
          <span>{{ readySources.length }} source{{ readySources.length !== 1 ? 's' : '' }}</span>
          <span class="dot">•</span>
          <span>{{ totalWordCount.toLocaleString() }} words</span>
        </div>
      </section>

      <!-- Divider -->
      <div
        class="divider"
        v-if="hasReadySources"
      ></div>

      <!-- Quick Actions Section -->
      <section
        class="section actions-section"
        v-if="hasReadySources"
      >
        <h3 class="section-title">Quick Actions</h3>
        <p class="section-desc">One-click workflows using your sources</p>

        <!-- Action Progress -->
        <div
          class="action-progress"
          v-if="actionProgress"
        >
          <div class="progress-info">
            <Loader2
              :size="14"
              class="spin"
            />
            <span>{{ actionProgress.message }}</span>
          </div>
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: `${actionProgress.progress}%` }"
            />
          </div>
        </div>

        <!-- Actions Grid -->
        <div class="actions-grid">
          <button
            v-for="action in quickActions"
            :key="action.id"
            class="action-card"
            :class="{ disabled: !canExecuteAction(action.minSources) }"
            :disabled="!canExecuteAction(action.minSources) || isExecutingAction"
            @click="executeAction(action.id)"
          >
            <component
              :is="action.icon"
              :size="18"
              class="action-icon"
            />
            <span class="action-name">{{ action.name }}</span>
            <span class="action-desc">{{ action.description }}</span>
            <span
              v-if="!canExecuteAction(action.minSources)"
              class="action-requirement"
            >
              Needs {{ action.minSources }}+ sources
            </span>
          </button>
        </div>
      </section>

      <!-- Divider -->
      <div
        class="divider"
        v-if="hasReadySources"
      ></div>

      <!-- AI Integration Hint -->
      <section
        class="section hint-section"
        v-if="hasReadySources"
      >
        <div class="hint-card">
          <Lightbulb
            :size="16"
            class="hint-icon"
          />
          <div class="hint-content">
            <p class="hint-title">AI Agent Integration</p>
            <p class="hint-text">
              Your sources are now available to the AI Agent! Try asking: "Summarize the PDF" or
              "What does the paper say about...?"
            </p>
          </div>
        </div>
      </section>
    </template>

    <!-- Add Source Modal -->
    <AddSourceModal
      v-if="showAddModal && noteId"
      :note-id="noteId"
      @close="closeAddModal"
      @added="closeAddModal"
    />

    <!-- View Source Modal -->
    <BaseModal
      v-if="showViewModal && viewingSource"
      :title="viewingSource.title"
      :subtitle="`${viewingSource.wordCount.toLocaleString()} words`"
      size="lg"
      @close="closeViewModal"
    >
      <template #icon>
        <Eye :size="20" />
      </template>

      <div class="source-content">
        <pre>{{ viewingContent }}</pre>
      </div>
    </BaseModal>

    <!-- Result Modal -->
    <BaseModal
      v-if="showResultModal && resultAction && resultData"
      :title="getActionLabel(resultAction)"
      subtitle="Generated from your sources"
      size="lg"
      @close="closeResultModal"
    >
      <template #icon>
        <FileText :size="20" />
      </template>

      <template #header-right>
        <button
          v-if="canSaveResult()"
          class="save-result-btn"
          :class="{ saved: resultSaved }"
          :disabled="isSavingResult || resultSaved"
          @click="handleSaveResult"
        >
          <Loader2
            v-if="isSavingResult"
            :size="14"
            class="spin"
          />
          <Check
            v-else-if="resultSaved"
            :size="14"
          />
          <Save
            v-else
            :size="14"
          />
          <span>{{ resultSaved ? 'Saved!' : 'Save to Resources' }}</span>
        </button>
      </template>

      <div class="result-content">
        <!-- Study Note Result -->
        <template v-if="(resultData as any).type === 'study_note'">
          <div
            class="result-markdown"
            v-html="renderMarkdown((resultData as any).content)"
          ></div>
          <div class="result-meta">
            {{ (resultData as any).wordCount.toLocaleString() }} words •
            {{ (resultData as any).sourcesUsed.length }} sources used
          </div>
        </template>

        <!-- Summary Result -->
        <template v-else-if="(resultData as any).type === 'summary'">
          <div class="result-text">{{ (resultData as any).content }}</div>
          <div
            class="result-section"
            v-if="(resultData as any).keyPoints?.length"
          >
            <h4>Key Points</h4>
            <ul>
              <li
                v-for="(point, i) in (resultData as any).keyPoints"
                :key="i"
              >
                {{ point }}
              </li>
            </ul>
          </div>
        </template>

        <!-- Key Terms Result -->
        <template v-else-if="(resultData as any).type === 'key_terms'">
          <div class="terms-list">
            <div
              v-for="term in (resultData as any).terms"
              :key="term.term"
              class="term-item"
            >
              <h4 class="term-name">{{ term.term }}</h4>
              <p class="term-definition">{{ term.definition }}</p>
              <p
                class="term-source"
                v-if="term.sources?.[0]?.title"
              >
                From: {{ term.sources[0].title }}
              </p>
            </div>
          </div>
        </template>

        <!-- Comparison Result -->
        <template v-else-if="(resultData as any).type === 'comparison'">
          <div
            class="comparison-section"
            v-if="(resultData as any).agreements?.length"
          >
            <h4>Agreements</h4>
            <div
              v-for="(item, i) in (resultData as any).agreements"
              :key="`agree-${i}`"
              class="comparison-item"
            >
              <strong>{{ item.topic }}</strong>
              <p>{{ item.summary }}</p>
            </div>
          </div>
          <div
            class="comparison-section"
            v-if="(resultData as any).differences?.length"
          >
            <h4>Differences</h4>
            <div
              v-for="(item, i) in (resultData as any).differences"
              :key="`diff-${i}`"
              class="comparison-item"
            >
              <strong>{{ item.topic }}</strong>
              <ul>
                <li
                  v-for="comp in item.comparisons"
                  :key="comp.sourceId"
                >
                  <em>{{ comp.title }}:</em> {{ comp.position }}
                </li>
              </ul>
            </div>
          </div>
        </template>

        <!-- Q&A Result -->
        <template v-else-if="(resultData as any).type === 'qa'">
          <div class="qa-list">
            <div
              v-for="(qa, i) in (resultData as any).questions"
              :key="i"
              class="qa-item"
            >
              <p class="qa-question">Q: {{ qa.question }}</p>
              <p class="qa-answer">A: {{ qa.answer }}</p>
              <p class="qa-source">{{ qa.sourceTitle }}</p>
            </div>
          </div>
        </template>

        <!-- Conflicts Result -->
        <template v-else-if="(resultData as any).type === 'conflicts'">
          <div
            v-if="!(resultData as any).hasConflicts"
            class="no-conflicts"
          >
            No conflicts found between your sources.
          </div>
          <div
            v-else
            class="conflicts-list"
          >
            <div
              v-for="(conflict, i) in (resultData as any).conflicts"
              :key="i"
              class="conflict-item"
            >
              <h4>{{ conflict.topic }}</h4>
              <ul>
                <li
                  v-for="src in conflict.conflictingSources"
                  :key="src.sourceId"
                >
                  <strong>{{ src.title }}:</strong> {{ src.claim }}
                </li>
              </ul>
              <p class="conflict-analysis">{{ conflict.analysis }}</p>
            </div>
          </div>
        </template>

        <!-- Default JSON -->
        <template v-else>
          <pre class="json-result">{{ JSON.stringify(resultData, null, 2) }}</pre>
        </template>
      </div>
    </BaseModal>
  </div>
</template>

<style scoped>
.workflows-tab {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Context Indicator */
.context-indicator {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-left: 3px solid #58a6ff;
}

.radio-dot {
  width: 14px;
  height: 14px;
  border: 2px solid #30363d;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 2px;
}

.context-indicator span:last-child {
  font-size: 13px;
  color: #8b949e;
}

/* Sections */
.section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #e6edf3;
  margin: 0;
}

.section-desc {
  font-size: 12px;
  color: #8b949e;
  margin: 0;
}

/* Add Button */
.add-btn {
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

.add-btn:hover {
  border-color: #58a6ff;
  color: #58a6ff;
}

/* Source Types */
.source-types {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.type-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 8px;
  border: 1px dashed #30363d;
  border-radius: 8px;
  background: transparent;
  color: #8b949e;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.type-btn:hover {
  border-color: #58a6ff;
  color: #58a6ff;
  background: rgba(88, 166, 255, 0.05);
}

/* Sources List */
.sources-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Sources Summary */
.sources-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #8b949e;
  padding-top: 4px;
}

.dot {
  opacity: 0.5;
}

/* Divider */
.divider {
  height: 1px;
  background: #21262d;
  margin: 8px 0;
}

/* Actions Grid */
.actions-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px;
  border: 1px solid #30363d;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-card:hover:not(.disabled) {
  border-color: #58a6ff;
  background: rgba(88, 166, 255, 0.05);
}

.action-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-icon {
  color: #58a6ff;
}

.action-name {
  font-size: 12px;
  font-weight: 500;
  color: #e6edf3;
}

.action-desc {
  font-size: 11px;
  color: #8b949e;
}

.action-requirement {
  font-size: 10px;
  color: #f0883e;
  margin-top: 4px;
}

/* Action Progress */
.action-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: rgba(88, 166, 255, 0.1);
  border-radius: 6px;
  margin-bottom: 8px;
}

.progress-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #58a6ff;
}

.progress-bar {
  height: 4px;
  background: #21262d;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #58a6ff, #a371f7);
  border-radius: 2px;
  transition: width 0.3s ease;
}

/* Hint Card */
.hint-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: rgba(163, 113, 247, 0.1);
  border: 1px solid rgba(163, 113, 247, 0.3);
  border-radius: 8px;
}

.hint-icon {
  color: #a371f7;
  flex-shrink: 0;
  margin-top: 2px;
}

.hint-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hint-title {
  font-size: 12px;
  font-weight: 500;
  color: #e6edf3;
  margin: 0;
}

.hint-text {
  font-size: 12px;
  color: #8b949e;
  margin: 0;
  line-height: 1.5;
}

/* Source Content */
.source-content {
  background: #0d1117;
  border-radius: 8px;
  padding: 16px;
  max-height: 400px;
  overflow-y: auto;
}

.source-content pre {
  margin: 0;
  font-size: 13px;
  color: #e6edf3;
  white-space: pre-wrap;
  word-wrap: break-word;
}

/* Result Content */
.result-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.result-text {
  font-size: 14px;
  color: #e6edf3;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* Markdown Rendered Content */
.result-markdown {
  font-size: 14px;
  color: #e6edf3;
  line-height: 1.6;
}

.result-markdown :deep(h1) {
  font-size: 1.5em;
  font-weight: 600;
  color: #e6edf3;
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #30363d;
}

.result-markdown :deep(h2) {
  font-size: 1.25em;
  font-weight: 600;
  color: #e6edf3;
  margin: 24px 0 12px 0;
}

.result-markdown :deep(h3) {
  font-size: 1.1em;
  font-weight: 600;
  color: #e6edf3;
  margin: 20px 0 8px 0;
}

.result-markdown :deep(h4) {
  font-size: 1em;
  font-weight: 600;
  color: #e6edf3;
  margin: 16px 0 8px 0;
}

.result-markdown :deep(p) {
  margin: 0 0 12px 0;
}

.result-markdown :deep(ul),
.result-markdown :deep(ol) {
  margin: 0 0 12px 0;
  padding-left: 24px;
}

.result-markdown :deep(li) {
  margin-bottom: 6px;
  color: #c9d1d9;
}

.result-markdown :deep(strong) {
  font-weight: 600;
  color: #58a6ff;
}

.result-markdown :deep(em) {
  font-style: italic;
  color: #a371f7;
}

.result-markdown :deep(code) {
  background: #161b22;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
}

.result-markdown :deep(pre) {
  background: #161b22;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0 0 12px 0;
}

.result-markdown :deep(pre code) {
  background: none;
  padding: 0;
}

.result-markdown :deep(blockquote) {
  border-left: 3px solid #58a6ff;
  padding-left: 12px;
  margin: 0 0 12px 0;
  color: #8b949e;
}

.result-markdown :deep(hr) {
  border: none;
  border-top: 1px solid #30363d;
  margin: 16px 0;
}

.result-meta {
  font-size: 12px;
  color: #8b949e;
}

.result-section h4 {
  font-size: 13px;
  font-weight: 600;
  color: #e6edf3;
  margin: 0 0 8px 0;
}

.result-section ul {
  margin: 0;
  padding-left: 20px;
}

.result-section li {
  font-size: 13px;
  color: #8b949e;
  margin-bottom: 4px;
}

/* Terms List */
.terms-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.term-item {
  padding-bottom: 16px;
  border-bottom: 1px solid #21262d;
}

.term-item:last-child {
  border-bottom: none;
}

.term-name {
  font-size: 14px;
  font-weight: 600;
  color: #58a6ff;
  margin: 0 0 4px 0;
}

.term-definition {
  font-size: 13px;
  color: #e6edf3;
  margin: 0 0 4px 0;
}

.term-source {
  font-size: 11px;
  color: #8b949e;
  margin: 0;
}

/* Comparison */
.comparison-section {
  margin-bottom: 16px;
}

.comparison-section h4 {
  font-size: 13px;
  font-weight: 600;
  color: #3fb950;
  margin: 0 0 8px 0;
}

.comparison-section:nth-child(2) h4 {
  color: #f0883e;
}

.comparison-item {
  margin-bottom: 12px;
}

.comparison-item strong {
  font-size: 13px;
  color: #e6edf3;
}

.comparison-item p {
  font-size: 12px;
  color: #8b949e;
  margin: 4px 0 0 0;
}

.comparison-item ul {
  margin: 4px 0 0 0;
  padding-left: 20px;
}

.comparison-item li {
  font-size: 12px;
  color: #8b949e;
}

/* Q&A */
.qa-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.qa-item {
  padding-bottom: 16px;
  border-bottom: 1px solid #21262d;
}

.qa-question {
  font-size: 13px;
  font-weight: 500;
  color: #e6edf3;
  margin: 0 0 8px 0;
}

.qa-answer {
  font-size: 13px;
  color: #8b949e;
  margin: 0 0 4px 0;
}

.qa-source {
  font-size: 11px;
  color: #58a6ff;
  margin: 0;
}

/* Conflicts */
.no-conflicts {
  padding: 20px;
  text-align: center;
  color: #3fb950;
  font-size: 13px;
}

.conflicts-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.conflict-item h4 {
  font-size: 13px;
  font-weight: 600;
  color: #f85149;
  margin: 0 0 8px 0;
}

.conflict-item ul {
  margin: 0 0 8px 0;
  padding-left: 20px;
}

.conflict-item li {
  font-size: 12px;
  color: #8b949e;
}

.conflict-analysis {
  font-size: 12px;
  color: #8b949e;
  font-style: italic;
  margin: 0;
}

/* JSON Result */
.json-result {
  font-size: 12px;
  color: #8b949e;
  background: #0d1117;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
}

/* Save Result Button */
.save-result-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(63, 185, 80, 0.15);
  border: 1px solid rgba(63, 185, 80, 0.3);
  border-radius: 6px;
  color: #3fb950;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.save-result-btn:hover:not(:disabled) {
  background: rgba(63, 185, 80, 0.25);
  border-color: #3fb950;
}

.save-result-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.save-result-btn.saved {
  background: rgba(63, 185, 80, 0.2);
  border-color: #3fb950;
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
