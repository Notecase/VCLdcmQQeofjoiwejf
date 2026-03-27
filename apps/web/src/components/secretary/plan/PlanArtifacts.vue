<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { FileText, BookOpen, Search, GraduationCap, Sparkles } from 'lucide-vue-next'
import type { TaskArtifactLink, TaskArtifactKind } from '@inkdown/shared/types'

const props = withDefaults(
  defineProps<{
    artifacts: TaskArtifactLink[]
    planId: string
    projectNotes?: Array<{ id: string; title: string; updatedAt: string; sourceTask?: string }>
  }>(),
  { projectNotes: () => [] }
)

const emit = defineEmits<{
  generate: [workflow: string]
  open: [artifact: TaskArtifactLink]
}>()

const router = useRouter()
const activeFilter = ref<TaskArtifactKind | 'all'>('all')

const filterOptions: { value: TaskArtifactKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'note', label: 'Notes' },
  { value: 'course', label: 'Courses' },
  { value: 'research', label: 'Research' },
]

// Merge artifacts with projectNotes, deduplicating by targetId/id
const mergedArtifacts = computed((): TaskArtifactLink[] => {
  const existingTargetIds = new Set(
    props.artifacts.filter((a) => a.targetId).map((a) => a.targetId)
  )

  const noteArtifacts: TaskArtifactLink[] = props.projectNotes
    .filter((n) => !existingTargetIds.has(n.id))
    .map((n) => ({
      id: `pn-${n.id}`,
      kind: 'note' as const,
      status: 'ready' as const,
      label: n.title,
      targetId: n.id,
      createdByAgent: 'project',
      createdAt: n.updatedAt,
      sourceTask: n.sourceTask,
    }))

  return [...props.artifacts, ...noteArtifacts]
})

const filteredArtifacts = computed(() => {
  if (activeFilter.value === 'all') return mergedArtifacts.value
  return mergedArtifacts.value.filter((a) => a.kind === activeFilter.value)
})

const generateOptions = [
  { id: 'make_note_from_task', label: 'Note', icon: FileText },
  { id: 'research_topic_from_task', label: 'Research Brief', icon: Search },
  { id: 'make_course_from_plan', label: 'Course Outline', icon: GraduationCap },
]

const showGenerateMenu = ref(false)

function kindIcon(kind: TaskArtifactKind) {
  switch (kind) {
    case 'note':
      return FileText
    case 'research':
      return Search
    case 'course':
      return GraduationCap
    default:
      return BookOpen
  }
}

function kindColor(kind: TaskArtifactKind): string {
  switch (kind) {
    case 'note':
      return 'var(--sec-primary, #10b981)'
    case 'research':
      return '#818cf8'
    case 'course':
      return 'var(--sec-accent, #f59e0b)'
    default:
      return 'var(--text-color-secondary)'
  }
}

function openArtifact(artifact: TaskArtifactLink) {
  if (artifact.kind === 'note' && artifact.targetId) {
    router.push(`/editor?noteId=${artifact.targetId}`)
  } else if (artifact.href) {
    router.push(artifact.href)
  } else {
    emit('open', artifact)
  }
}

function handleGenerate(workflowId: string) {
  showGenerateMenu.value = false
  emit('generate', workflowId)
}
</script>

<template>
  <section class="plan-artifacts">
    <div class="artifacts-header">
      <span class="section-label">Notes & Materials ({{ mergedArtifacts.length }})</span>
      <div class="artifacts-actions">
        <div class="generate-wrapper">
          <button
            class="generate-btn"
            @click="showGenerateMenu = !showGenerateMenu"
          >
            <Sparkles :size="14" />
            Generate
          </button>
          <div
            v-if="showGenerateMenu"
            class="generate-menu"
          >
            <button
              v-for="opt in generateOptions"
              :key="opt.id"
              class="generate-option"
              @click="handleGenerate(opt.id)"
            >
              <component
                :is="opt.icon"
                :size="14"
              />
              {{ opt.label }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="filter-chips">
      <button
        v-for="opt in filterOptions"
        :key="opt.value"
        class="filter-chip"
        :class="{ active: activeFilter === opt.value }"
        @click="activeFilter = opt.value"
      >
        {{ opt.label }}
      </button>
    </div>

    <div
      v-if="filteredArtifacts.length > 0"
      class="artifacts-grid"
    >
      <article
        v-for="artifact in filteredArtifacts"
        :key="artifact.id"
        class="artifact-card"
        @click="openArtifact(artifact)"
      >
        <div class="card-badge">
          <component
            :is="kindIcon(artifact.kind)"
            :size="14"
            :style="{ color: kindColor(artifact.kind) }"
          />
          <span
            class="badge-text"
            :style="{ color: kindColor(artifact.kind) }"
            >{{ artifact.kind }}</span
          >
        </div>
        <span class="card-title">{{ artifact.label }}</span>
        <span
          v-if="artifact.sourceTask"
          class="card-source-task"
        >
          From: {{ artifact.sourceTask }}
        </span>
        <div class="card-footer">
          <span class="card-date">{{
            new Date(artifact.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })
          }}</span>
          <span
            class="card-status"
            :class="artifact.status"
            >{{ artifact.status }}</span
          >
        </div>
      </article>
    </div>

    <div
      v-else
      class="empty-artifacts"
    >
      <p>No materials yet. Use "Generate" to create study content.</p>
    </div>
  </section>
</template>

<style scoped>
.plan-artifacts {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.artifacts-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-label {
  font-size: var(--pw-label-size, 12px);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-color-secondary, #94a3b8);
}

.artifacts-actions {
  display: flex;
  gap: 8px;
}

.generate-wrapper {
  position: relative;
}

.generate-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--sec-primary-border, rgba(16, 185, 129, 0.3));
  border-radius: var(--sec-radius-sm, 8px);
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary, #10b981);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--sec-transition-fast) ease;
}

.generate-btn:hover {
  background: rgba(16, 185, 129, 0.2);
}

.generate-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 180px;
  padding: 4px;
  background: var(--card-bg, #242428);
  border: 1px solid var(--sec-glass-border);
  border-radius: var(--sec-radius-sm, 8px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  z-index: 10;
}

.generate-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--sec-transition-fast) ease;
}

.generate-option:hover {
  background: rgba(255, 255, 255, 0.06);
}

.filter-chips {
  display: flex;
  gap: 6px;
}

.filter-chip {
  padding: 4px 12px;
  border: 1px solid var(--sec-glass-border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--sec-transition-fast) ease;
}

.filter-chip:hover {
  border-color: var(--sec-glass-border-hover);
  color: var(--text-color, #e2e8f0);
}

.filter-chip.active {
  background: var(--sec-primary-bg);
  border-color: var(--sec-primary-border);
  color: var(--sec-primary);
}

.artifacts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 700px) {
  .artifacts-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .artifacts-grid {
    grid-template-columns: 1fr;
  }
}

.artifact-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--sec-glass-border);
  border-radius: var(--sec-radius-md, 12px);
  background: var(--sec-surface-card);
  cursor: pointer;
  transition: all var(--sec-transition-fast) ease;
}

.artifact-card:hover {
  transform: translateY(-1px);
  border-color: var(--sec-glass-border-hover);
  background: var(--sec-surface-card-hover);
}

.card-badge {
  display: flex;
  align-items: center;
  gap: 6px;
}

.badge-text {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.card-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color, #e2e8f0);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-source-task {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.8;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}

.card-date {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
}

.card-status {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.card-status.ready {
  background: var(--sec-primary-bg);
  color: var(--sec-primary);
}

.card-status.pending {
  background: var(--sec-accent-bg);
  color: var(--sec-accent);
  animation: pulse-amber 2s ease-in-out infinite;
}

.card-status.blocked {
  background: rgba(248, 81, 73, 0.12);
  color: #f85149;
}

@keyframes pulse-amber {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.empty-artifacts p {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0;
}
</style>
