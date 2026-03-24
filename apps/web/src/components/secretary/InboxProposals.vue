<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { authFetch } from '@/utils/api'
import {
  Inbox,
  Sparkles,
  Filter,
  MessageSquare,
  Smartphone,
  Globe,
  FileText,
  CheckSquare,
  Calendar,
  BookOpen,
  Link,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  HelpCircle,
  Clock,
} from 'lucide-vue-next'
import type {
  InboxProposal,
  ProposalCategory,
  ProposalActionType,
  ExecutionResultData,
} from '@inkdown/shared/types'

const apiBase = import.meta.env.VITE_API_URL || ''

const proposals = ref<InboxProposal[]>([])
const isLoading = ref(false)
const isCategorizing = ref(false)
const activeFilter = ref<ProposalCategory | 'all'>('all')
const statusFilter = ref<'all' | 'applied' | 'failed'>('all')

const filteredProposals = computed(() => {
  let items = proposals.value
  if (statusFilter.value !== 'all') {
    items = items.filter((p) => p.status === statusFilter.value)
  }
  if (activeFilter.value !== 'all') {
    items = items.filter((p) => p.category === activeFilter.value)
  }
  return items
})

const totalCount = computed(() => proposals.value.length)

const uncategorizedCount = computed(
  () => proposals.value.filter((p) => p.status === 'pending' && !p.category).length
)

const categories: { value: ProposalCategory | 'all'; label: string; color: string }[] = [
  { value: 'all', label: 'All', color: '' },
  { value: 'task', label: 'Tasks', color: '#f59e0b' },
  { value: 'vocabulary', label: 'Vocabulary', color: '#a78bfa' },
  { value: 'calendar', label: 'Calendar', color: '#4285f4' },
  { value: 'note', label: 'Notes', color: '#10b981' },
  { value: 'reading', label: 'Reading', color: '#f97316' },
  { value: 'thought', label: 'Thoughts', color: '#94a3b8' },
]

function sourceIcon(source: string) {
  switch (source) {
    case 'telegram':
      return MessageSquare
    case 'shortcut':
      return Smartphone
    default:
      return Globe
  }
}

function categoryColor(category: string | null): string {
  const cat = categories.find((c) => c.value === category)
  return cat?.color || '#64748b'
}

function actionTypeIcon(type: ProposalActionType | null) {
  switch (type) {
    case 'create_note':
      return FileText
    case 'add_task':
      return CheckSquare
    case 'add_calendar_event':
      return Calendar
    case 'add_vocabulary':
      return BookOpen
    case 'add_reading':
      return Link
    case 'add_thought':
      return MessageCircle
    case 'needs_clarification':
      return HelpCircle
    default:
      return null
  }
}

function actionTypeLabel(type: ProposalActionType | null): string {
  switch (type) {
    case 'create_note':
      return 'Create Note'
    case 'add_task':
      return 'Add Task'
    case 'add_calendar_event':
      return 'Calendar Event'
    case 'add_vocabulary':
      return 'Vocabulary'
    case 'add_reading':
      return 'Reading'
    case 'add_thought':
      return 'Thought'
    case 'needs_clarification':
      return 'Clarification'
    default:
      return ''
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'applied':
      return CheckCircle2
    case 'failed':
      return XCircle
    case 'executing':
      return Loader2
    case 'awaiting_clarification':
      return HelpCircle
    case 'pending':
      return Clock
    default:
      return null
  }
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function isExpiredClarification(proposal: InboxProposal): boolean {
  if (proposal.status !== 'awaiting_clarification') return false
  // Clarification sessions expire after 2 minutes
  const twoMinAgo = Date.now() - 2 * 60_000
  return new Date(proposal.updatedAt).getTime() < twoMinAgo
}

function truncate(text: string | undefined | null, maxLength: number): string {
  if (!text) return ''
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text
}

function getPayload(proposal: InboxProposal): Record<string, unknown> {
  return (proposal.payload ?? {}) as Record<string, unknown>
}

function getExecutionResult(proposal: InboxProposal): ExecutionResultData | null {
  return proposal.executionResult ?? null
}

async function loadProposals() {
  isLoading.value = true
  try {
    const res = await authFetch(`${apiBase}/api/inbox/proposals`)
    if (res.ok) {
      const data = await res.json()
      proposals.value = data.proposals
    }
  } catch {
    // silently fail
  } finally {
    isLoading.value = false
  }
}

async function categorize() {
  isCategorizing.value = true
  try {
    const res = await authFetch(`${apiBase}/api/inbox/proposals/categorize`, {
      method: 'POST',
    })
    if (res.ok) {
      await loadProposals()
    }
  } catch {
    // silently fail
  } finally {
    isCategorizing.value = false
  }
}

let refreshInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  loadProposals()
  refreshInterval = setInterval(loadProposals, 15_000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
})

defineExpose({ totalCount, loadProposals })
</script>

<template>
  <div class="inbox-proposals">
    <!-- Header -->
    <div class="inbox-header">
      <div class="inbox-title">
        <Inbox :size="18" />
        <h2>Activity Feed</h2>
        <span
          v-if="totalCount > 0"
          class="badge"
        >
          {{ totalCount }}
        </span>
      </div>

      <div class="inbox-actions">
        <button
          v-if="uncategorizedCount > 0"
          class="btn btn-ghost"
          :disabled="isCategorizing"
          @click="categorize"
        >
          <Sparkles
            :size="14"
            :class="{ spinning: isCategorizing }"
          />
          {{ isCategorizing ? 'Categorizing...' : `Categorize (${uncategorizedCount})` }}
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filter-row">
      <button
        v-for="cat in categories"
        :key="cat.value"
        class="filter-pill"
        :class="{ active: activeFilter === cat.value }"
        :style="
          activeFilter === cat.value && cat.color
            ? { borderColor: cat.color, color: cat.color }
            : {}
        "
        @click="activeFilter = cat.value"
      >
        {{ cat.label }}
      </button>

      <div class="status-filters">
        <button
          class="filter-pill"
          :class="{ active: statusFilter === 'all' }"
          @click="statusFilter = 'all'"
        >
          <Filter :size="12" />
          All
        </button>
        <button
          class="filter-pill"
          :class="{ active: statusFilter === 'applied' }"
          @click="statusFilter = statusFilter === 'applied' ? 'all' : 'applied'"
        >
          <CheckCircle2 :size="12" />
          Done
        </button>
        <button
          class="filter-pill"
          :class="{ active: statusFilter === 'failed' }"
          @click="statusFilter = statusFilter === 'failed' ? 'all' : 'failed'"
        >
          <XCircle :size="12" />
          Failed
        </button>
      </div>
    </div>

    <!-- Proposals List -->
    <div
      v-if="isLoading"
      class="loading-text"
    >
      Loading activity...
    </div>

    <div
      v-else-if="filteredProposals.length === 0"
      class="empty-state"
    >
      <Inbox
        :size="32"
        class="empty-icon"
      />
      <p>No activity yet</p>
      <span>Send messages to your Telegram bot — they'll be processed automatically.</span>
    </div>

    <div
      v-else
      class="proposals-list"
    >
      <div
        v-for="proposal in filteredProposals"
        :key="proposal.id"
        class="proposal-card"
        :class="proposal.status"
      >
        <div class="proposal-header">
          <component
            :is="sourceIcon(proposal.source)"
            :size="14"
            class="source-icon"
          />
          <span class="source-label">{{ proposal.source }}</span>
          <span
            v-if="proposal.actionType"
            class="action-type-pill"
            :style="{
              borderColor: categoryColor(proposal.category),
              color: categoryColor(proposal.category),
            }"
          >
            <component
              :is="actionTypeIcon(proposal.actionType)"
              :size="10"
            />
            {{ actionTypeLabel(proposal.actionType) }}
          </span>
          <span
            v-else-if="proposal.category"
            class="category-pill"
            :style="{
              borderColor: categoryColor(proposal.category),
              color: categoryColor(proposal.category),
            }"
          >
            {{ proposal.category }}
          </span>
          <span
            v-if="proposal.targetFile"
            class="target-file"
          >
            {{ proposal.targetFile }}
          </span>
          <span class="timestamp">{{
            relativeTime(proposal.createdAt || proposal.updatedAt)
          }}</span>
        </div>

        <div class="proposal-body">
          <!-- Rich preview: create_note -->
          <div
            v-if="proposal.actionType === 'create_note'"
            class="preview-rich"
          >
            <p class="raw-text-muted">{{ proposal.rawText }}</p>
            <div class="preview-note">
              <strong>{{ getPayload(proposal).title }}</strong>
              <p class="preview-detail">
                {{ truncate(getPayload(proposal).content as string, 120) }}
              </p>
            </div>
          </div>

          <!-- Rich preview: add_task -->
          <div
            v-else-if="proposal.actionType === 'add_task'"
            class="preview-rich"
          >
            <p class="raw-text-muted">{{ proposal.rawText }}</p>
            <div class="preview-task">
              <code>{{ getPayload(proposal).taskLine || proposal.proposedContent }}</code>
              <span
                v-if="getPayload(proposal).targetFile"
                class="target-badge"
              >
                {{ getPayload(proposal).targetFile }}
              </span>
            </div>
          </div>

          <!-- Rich preview: add_calendar_event -->
          <div
            v-else-if="proposal.actionType === 'add_calendar_event'"
            class="preview-rich"
          >
            <p class="raw-text-muted">{{ proposal.rawText }}</p>
            <div class="preview-event">
              <strong>{{ getPayload(proposal).eventTitle }}</strong>
              <span
                v-if="getPayload(proposal).dateTime"
                class="event-time"
              >
                {{ getPayload(proposal).dateTime }}
              </span>
              <p
                v-if="getPayload(proposal).description"
                class="preview-detail"
              >
                {{ getPayload(proposal).description }}
              </p>
            </div>
          </div>

          <!-- Rich preview: add_vocabulary -->
          <div
            v-else-if="proposal.actionType === 'add_vocabulary'"
            class="preview-rich"
          >
            <p class="raw-text-muted">{{ proposal.rawText }}</p>
            <div class="preview-vocab">
              <strong>{{ getPayload(proposal).word }}</strong>
              <em>{{ getPayload(proposal).definition }}</em>
            </div>
          </div>

          <!-- Rich preview: add_reading -->
          <div
            v-else-if="proposal.actionType === 'add_reading'"
            class="preview-rich"
          >
            <p class="raw-text-muted">{{ proposal.rawText }}</p>
            <div class="preview-reading">
              <strong>{{ getPayload(proposal).title }}</strong>
              <span
                v-if="getPayload(proposal).url"
                class="reading-url"
              >
                {{ getPayload(proposal).url }}
              </span>
              <p
                v-if="getPayload(proposal).description"
                class="preview-detail"
              >
                {{ getPayload(proposal).description }}
              </p>
            </div>
          </div>

          <!-- Rich preview: needs_clarification -->
          <div
            v-else-if="proposal.actionType === 'needs_clarification'"
            class="preview-rich"
          >
            <p class="raw-text-muted">{{ proposal.rawText }}</p>
            <div class="preview-clarification">
              <HelpCircle
                :size="14"
                class="clarification-icon"
              />
              <span>{{ proposal.previewText }}</span>
            </div>
          </div>

          <!-- Rich preview: add_thought -->
          <div
            v-else-if="proposal.actionType === 'add_thought'"
            class="preview-rich"
          >
            <p class="raw-text">{{ proposal.rawText }}</p>
            <p
              v-if="proposal.previewText && proposal.previewText !== proposal.rawText"
              class="preview-detail"
            >
              {{ proposal.previewText }}
            </p>
          </div>

          <!-- Fallback: legacy unclassified -->
          <div v-else>
            <p class="raw-text">{{ proposal.rawText }}</p>
            <p
              v-if="proposal.proposedContent"
              class="proposed-content"
            >
              {{ proposal.proposedContent }}
            </p>
          </div>

          <!-- Execution result details -->
          <div
            v-if="getExecutionResult(proposal)"
            class="execution-result"
          >
            <span
              v-if="getExecutionResult(proposal)?.updatedFile"
              class="result-detail"
            >
              → {{ getExecutionResult(proposal)?.updatedFile }}
            </span>
            <span
              v-if="getExecutionResult(proposal)?.error"
              class="result-error"
            >
              Error: {{ getExecutionResult(proposal)?.error }}
            </span>
            <span
              v-if="getExecutionResult(proposal)?.durationMs"
              class="result-duration"
            >
              {{ Math.round((getExecutionResult(proposal)?.durationMs || 0) / 1000) }}s
            </span>
          </div>
        </div>

        <!-- Bot reply -->
        <div
          v-if="proposal.previewText && proposal.status === 'applied'"
          class="bot-reply"
        >
          {{ proposal.previewText }}
        </div>

        <!-- Status badge -->
        <div
          class="proposal-status-badge"
          :class="proposal.status"
        >
          <component
            :is="statusIcon(proposal.status)"
            :size="12"
            :class="{ spinning: proposal.status === 'executing' }"
          />
          <span v-if="proposal.status === 'awaiting_clarification'">
            {{ isExpiredClarification(proposal) ? 'Timed out' : 'Awaiting reply' }}
          </span>
          <span v-else>{{ proposal.status }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inbox-proposals {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.inbox-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.inbox-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.inbox-title h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
}

.badge {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.2);
  color: #6ee7b7;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.inbox-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* ── Filters ──────────────────────────────────────────────────────── */

.filter-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.status-filters {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.filter-pill {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.08));
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  gap: 4px;
}

.filter-pill:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.filter-pill.active {
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.08);
  color: #aaf2d2;
}

/* ── Proposals ────────────────────────────────────────────────────── */

.proposals-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.proposal-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.06));
  background: var(--sec-surface-card, rgba(255, 255, 255, 0.02));
  transition: border-color 150ms ease;
}

.proposal-card:hover {
  border-color: rgba(255, 255, 255, 0.12);
}

.proposal-card.applied {
  border-color: rgba(34, 197, 94, 0.15);
}

.proposal-card.failed {
  border-color: rgba(239, 68, 68, 0.15);
}

.proposal-card.executing {
  border-color: rgba(245, 158, 11, 0.2);
}

.proposal-card.awaiting_clarification {
  border-color: rgba(234, 179, 8, 0.2);
}

.proposal-card.rejected {
  opacity: 0.4;
}

.proposal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.source-icon {
  color: var(--text-color-secondary, #94a3b8);
}

.source-label {
  color: var(--text-color-secondary, #94a3b8);
  text-transform: capitalize;
}

.category-pill {
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid;
  font-size: 10px;
  font-weight: 600;
  text-transform: capitalize;
}

.target-file {
  color: var(--text-color-secondary, #94a3b8);
  font-family: monospace;
  font-size: 10px;
}

.timestamp {
  margin-left: auto;
  color: var(--text-color-secondary, #64748b);
  font-size: 10px;
  white-space: nowrap;
}

.proposal-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.raw-text {
  margin: 0;
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
  line-height: 1.5;
}

.proposed-content {
  margin: 0;
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  font-family: monospace;
  padding: 6px 10px;
  border-radius: var(--radius-sm, 6px);
  background: rgba(0, 0, 0, 0.2);
  white-space: pre-wrap;
}

/* ── Action type pill ───────────────────────────────────────────── */

.action-type-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid;
  font-size: 10px;
  font-weight: 600;
}

/* ── Rich previews ──────────────────────────────────────────────── */

.preview-rich {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.raw-text-muted {
  margin: 0;
  font-size: 12px;
  color: var(--text-color-secondary, #64748b);
  line-height: 1.4;
}

.preview-note,
.preview-task,
.preview-event,
.preview-vocab,
.preview-reading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  border-radius: var(--radius-sm, 6px);
  background: rgba(0, 0, 0, 0.15);
  font-size: 12px;
}

.preview-clarification {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  border-radius: var(--radius-sm, 6px);
  background: rgba(234, 179, 8, 0.06);
  border: 1px solid rgba(234, 179, 8, 0.15);
  font-size: 12px;
  color: var(--text-color, #e2e8f0);
  line-height: 1.4;
}

.clarification-icon {
  color: #eab308;
  flex-shrink: 0;
  margin-top: 1px;
}

.preview-note strong,
.preview-event strong,
.preview-reading strong {
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
}

.preview-vocab strong {
  color: var(--text-color, #e2e8f0);
  font-size: 14px;
}

.preview-vocab em {
  color: var(--text-color-secondary, #94a3b8);
  font-style: italic;
}

.preview-detail {
  margin: 0;
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  line-height: 1.4;
}

.preview-task code {
  font-family: monospace;
  font-size: 12px;
  color: var(--text-color, #e2e8f0);
}

.target-badge {
  display: inline-block;
  margin-top: 2px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color-secondary, #94a3b8);
  font-size: 10px;
  font-family: monospace;
  width: fit-content;
}

.event-time {
  color: #4285f4;
  font-size: 11px;
  font-weight: 600;
}

.reading-url {
  color: var(--text-color-secondary, #94a3b8);
  font-size: 11px;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Execution result ─────────────────────────────────────────── */

.execution-result {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  margin-top: 2px;
}

.result-detail {
  color: var(--text-color-secondary, #94a3b8);
  font-family: monospace;
}

.result-error {
  color: #ef4444;
  font-size: 11px;
}

.result-duration {
  color: var(--text-color-secondary, #64748b);
  margin-left: auto;
}

/* ── Bot reply ────────────────────────────────────────────────── */

.bot-reply {
  font-size: 12px;
  color: #6ee7b7;
  padding: 4px 8px;
  border-radius: var(--radius-sm, 6px);
  background: rgba(16, 185, 129, 0.06);
  border-left: 2px solid rgba(16, 185, 129, 0.3);
}

/* ── Status badge ──────────────────────────────────────────────── */

.proposal-status-badge {
  align-self: flex-end;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  text-transform: capitalize;
}

.proposal-status-badge.applied {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
}

.proposal-status-badge.failed {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.proposal-status-badge.executing {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

.proposal-status-badge.awaiting_clarification {
  color: #eab308;
  background: rgba(234, 179, 8, 0.1);
}

.proposal-status-badge.pending {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.1);
}

.proposal-status-badge.rejected {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

/* ── Empty state ──────────────────────────────────────────────────── */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 16px;
  text-align: center;
}

.empty-icon {
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.4;
}

.empty-state p {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
}

.empty-state span {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
}

.loading-text {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
}

/* ── Shared buttons ───────────────────────────────────────────────── */

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-sm, 6px);
  border: none;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: all 150ms ease;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.08));
  color: var(--text-color, #e2e8f0);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--hover-bg, rgba(255, 255, 255, 0.06));
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
