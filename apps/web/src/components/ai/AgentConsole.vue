<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAIStore, type ThinkingStep, type PendingEdit } from '@/stores/ai'
import { useEditorStore } from '@/stores'
import {
  Brain,
  Search,
  BookOpen,
  PenLine,
  Database,
  Wrench,
  Microscope,
  Compass,
  Sparkles,
  ArrowUpRight,
  Check,
  X,
} from 'lucide-vue-next'

const store = useAIStore()
const editorStore = useEditorStore()
const router = useRouter()

const steps = computed(() => store.thinkingSteps)
const isProcessing = computed(() => store.isProcessing)

const actionTypes = new Set<ThinkingStep['type']>(['tool', 'read', 'write', 'create', 'search'])

const thoughtSteps = computed(() => steps.value.filter((step) => !actionTypes.has(step.type)))
const actionSteps = computed(() => steps.value.filter((step) => actionTypes.has(step.type)))

const pendingEdits = computed(() => store.pendingEdits.filter((edit) => edit.status === 'pending'))

function getStepIcon(type: ThinkingStep['type']) {
  switch (type) {
    case 'thought':
      return Brain
    case 'search':
      return Search
    case 'read':
      return BookOpen
    case 'write':
      return PenLine
    case 'create':
      return Database
    case 'tool':
      return Wrench
    case 'analyze':
      return Microscope
    case 'explore':
      return Compass
    case 'reasoning':
      return Sparkles
    default:
      return Brain
  }
}

function formatDuration(ms?: number): string {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function getEditStats(edit: PendingEdit) {
  let additions = 0
  let deletions = 0

  for (const hunk of edit.diffHunks) {
    additions += hunk.newLines
    deletions += hunk.oldLines
  }

  return {
    additions,
    deletions,
    total: edit.diffHunks.length,
  }
}

function splitLines(content: string) {
  return content.split('\n')
}

function formatNoteId(noteId: string) {
  if (noteId.length <= 12) return noteId
  return `${noteId.slice(0, 8)}...${noteId.slice(-4)}`
}

async function openInEditor(edit: PendingEdit) {
  try {
    store.setActiveEdit(edit.id)
    await editorStore.loadDocument(edit.noteId)
    await router.push('/')
  } catch (error) {
    console.error('Failed to open edit in editor:', error)
  }
}

function acceptAll(edit: PendingEdit) {
  store.acceptAllHunks(edit.id)
}

function rejectAll(edit: PendingEdit) {
  store.rejectAllHunks(edit.id)
}

function acceptHunk(editId: string, hunkId: string) {
  store.acceptHunk(editId, hunkId)
}

function rejectHunk(editId: string, hunkId: string) {
  store.rejectHunk(editId, hunkId)
}
</script>

<template>
  <aside class="agent-console">
    <section class="console-card trace-card">
      <header class="card-header">
        <div>
          <span class="card-label">Live Trace</span>
          <p class="card-subtitle">Streaming thoughts and agent actions</p>
        </div>
        <span class="status-pill" :class="{ live: isProcessing }">
          {{ isProcessing ? 'Live' : 'Idle' }}
        </span>
      </header>

      <div class="trace-section">
        <div class="section-title">Thoughts</div>
        <div class="trace-list">
          <div v-if="thoughtSteps.length === 0" class="trace-empty">Waiting for a prompt.</div>
          <div
            v-for="step in thoughtSteps"
            :key="step.id"
            class="trace-item"
            :class="step.status"
          >
            <div class="trace-icon">
              <component :is="getStepIcon(step.type)" :size="14" />
            </div>
            <div class="trace-content">
              <div class="trace-title">{{ step.description }}</div>
              <div class="trace-meta">
                <span v-if="step.durationMs">{{ formatDuration(step.durationMs) }}</span>
                <span v-else>{{ step.status === 'running' ? 'Running' : 'Queued' }}</span>
              </div>
            </div>
            <span class="trace-status" :class="step.status"></span>
          </div>
        </div>
      </div>

      <div class="trace-section">
        <div class="section-title">Actions</div>
        <div class="trace-list">
          <div v-if="actionSteps.length === 0" class="trace-empty">No actions yet.</div>
          <div
            v-for="step in actionSteps"
            :key="step.id"
            class="trace-item"
            :class="step.status"
          >
            <div class="trace-icon action">
              <component :is="getStepIcon(step.type)" :size="14" />
            </div>
            <div class="trace-content">
              <div class="trace-title">{{ step.description }}</div>
              <div class="trace-meta">
                <span v-if="step.durationMs">{{ formatDuration(step.durationMs) }}</span>
                <span v-else>{{ step.status === 'running' ? 'Running' : 'Queued' }}</span>
              </div>
            </div>
            <span class="trace-status" :class="step.status"></span>
          </div>
        </div>
      </div>
    </section>

    <section class="console-card diff-card">
      <header class="card-header">
        <div>
          <span class="card-label">Change Drafts</span>
          <p class="card-subtitle">Inline diffs from proposed edits</p>
        </div>
        <span class="count-pill">{{ pendingEdits.length }}</span>
      </header>

      <div v-if="pendingEdits.length === 0" class="diff-empty">
        No pending edits yet. Ask the agent to update a note to see inline diffs here.
      </div>

      <div v-for="edit in pendingEdits" :key="edit.id" class="diff-group">
        <div class="diff-header">
          <div>
            <div class="diff-title">Proposed note update</div>
            <div class="diff-note" :title="edit.noteId">Note ID: {{ formatNoteId(edit.noteId) }}</div>
          </div>
          <div class="diff-stats">
            <span class="stat add">+{{ getEditStats(edit).additions }}</span>
            <span class="stat remove">-{{ getEditStats(edit).deletions }}</span>
          </div>
        </div>

        <div class="diff-actions">
          <button class="ghost-btn" @click="openInEditor(edit)">
            Open in editor
            <ArrowUpRight :size="14" />
          </button>
          <button class="chip-btn accept" @click="acceptAll(edit)">Accept all</button>
          <button class="chip-btn reject" @click="rejectAll(edit)">Reject all</button>
        </div>

        <div class="diff-hunks">
          <div
            v-for="hunk in edit.diffHunks"
            :key="hunk.id"
            class="diff-hunk"
            :class="hunk.status"
          >
            <div class="hunk-header">
              <span class="hunk-type">{{ hunk.type }}</span>
              <div v-if="hunk.status === 'pending'" class="hunk-actions">
                <button class="chip-btn accept" @click="acceptHunk(edit.id, hunk.id)">
                  <Check :size="12" />
                  Accept
                </button>
                <button class="chip-btn reject" @click="rejectHunk(edit.id, hunk.id)">
                  <X :size="12" />
                  Reject
                </button>
              </div>
              <span v-else class="hunk-state">{{ hunk.status }}</span>
            </div>

            <div class="hunk-body">
              <div v-if="hunk.oldContent" class="hunk-block remove">
                <div
                  v-for="(line, index) in splitLines(hunk.oldContent)"
                  :key="`${hunk.id}-old-${index}`"
                  class="diff-line remove"
                >
                  <span class="line-prefix">-</span>
                  <span class="line-text">{{ line || ' ' }}</span>
                </div>
              </div>
              <div v-if="hunk.newContent" class="hunk-block add">
                <div
                  v-for="(line, index) in splitLines(hunk.newContent)"
                  :key="`${hunk.id}-new-${index}`"
                  class="diff-line add"
                >
                  <span class="line-prefix">+</span>
                  <span class="line-text">{{ line || ' ' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.agent-console {
  display: flex;
  flex-direction: column;
  gap: 18px;
  position: sticky;
  top: 24px;
  align-self: start;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
  padding-right: 4px;
}

.console-card {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-xl);
  padding: 18px;
  box-shadow: var(--panel-shadow);
  backdrop-filter: blur(16px);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.card-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.card-subtitle {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-soft);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(15, 23, 42, 0.08);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.status-pill.live {
  background: rgba(34, 197, 94, 0.15);
  color: #15803d;
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.3);
}

.count-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.trace-section {
  margin-top: 16px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 10px;
}

.trace-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.trace-empty {
  padding: 12px;
  border-radius: 12px;
  border: 1px dashed var(--panel-border);
  color: var(--text-soft);
  font-size: 12px;
}

.trace-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.75);
  transition: border 0.2s ease;
}

.trace-item.running {
  border-color: rgba(37, 99, 235, 0.4);
  box-shadow: 0 12px 26px rgba(37, 99, 235, 0.12);
}

.trace-icon {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
  flex-shrink: 0;
}

.trace-icon.action {
  background: rgba(16, 185, 129, 0.16);
  color: #047857;
}

.trace-content {
  flex: 1;
  min-width: 0;
}

.trace-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.trace-meta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-soft);
  font-family: var(--font-mono);
}

.trace-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.2);
}

.trace-status.running {
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.15);
}

.trace-status.complete {
  background: #2563eb;
}

.trace-status.error {
  background: #ef4444;
}

.diff-empty {
  padding: 14px;
  border-radius: 12px;
  border: 1px dashed var(--panel-border);
  color: var(--text-soft);
  font-size: 12px;
}

.diff-group {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--panel-border);
}

.diff-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.diff-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.diff-note {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-soft);
}

.diff-stats {
  display: flex;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
}

.stat.add {
  color: #15803d;
}

.stat.remove {
  color: #b91c1c;
}

.diff-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}

.ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  background: transparent;
  color: var(--ink);
  font-size: 11px;
  font-weight: 600;
}

.chip-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 11px;
  font-weight: 600;
}

.chip-btn.accept {
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
  border-color: rgba(34, 197, 94, 0.3);
}

.chip-btn.reject {
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
  border-color: rgba(239, 68, 68, 0.3);
}

.diff-hunks {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.diff-hunk {
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  overflow: hidden;
  background: #ffffff;
}

.diff-hunk.accepted {
  border-color: rgba(34, 197, 94, 0.35);
}

.diff-hunk.rejected {
  border-color: rgba(239, 68, 68, 0.3);
  opacity: 0.7;
}

.hunk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(15, 23, 42, 0.03);
}

.hunk-type {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-soft);
}

.hunk-actions {
  display: flex;
  gap: 6px;
}

.hunk-state {
  font-size: 11px;
  color: var(--text-soft);
  text-transform: capitalize;
}

.hunk-body {
  padding: 10px 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  background: #f8fafc;
}

.hunk-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hunk-block + .hunk-block {
  margin-top: 8px;
}

.diff-line {
  display: flex;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
}

.diff-line.add {
  background: rgba(16, 185, 129, 0.12);
  color: #065f46;
}

.diff-line.remove {
  background: rgba(248, 113, 113, 0.14);
  color: #991b1b;
  text-decoration: line-through;
}

.line-prefix {
  font-weight: 700;
}

@media (max-width: 1100px) {
  .agent-console {
    position: static;
    max-height: none;
    overflow: visible;
    padding-right: 0;
  }
}
</style>
