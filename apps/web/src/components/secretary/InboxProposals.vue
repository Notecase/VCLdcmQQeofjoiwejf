<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { authFetch } from '@/utils/api'
import {
  Inbox,
  Check,
  X,
  Sparkles,
  CheckCheck,
  Play,
  Filter,
  MessageSquare,
  Smartphone,
  Globe,
} from 'lucide-vue-next'
import type { InboxProposal, ProposalCategory } from '@inkdown/shared/types'

const apiBase = import.meta.env.VITE_API_URL || ''

const proposals = ref<InboxProposal[]>([])
const isLoading = ref(false)
const isCategorizing = ref(false)
const isApplying = ref(false)
const activeFilter = ref<ProposalCategory | 'all'>('all')
const statusFilter = ref<'pending' | 'all'>('pending')

const filteredProposals = computed(() => {
  let items = proposals.value
  if (statusFilter.value === 'pending') {
    items = items.filter((p) => p.status === 'pending' || p.status === 'approved')
  }
  if (activeFilter.value !== 'all') {
    items = items.filter((p) => p.category === activeFilter.value)
  }
  return items
})

const pendingCount = computed(
  () => proposals.value.filter((p) => p.status === 'pending' || p.status === 'approved').length
)

const uncategorizedCount = computed(
  () => proposals.value.filter((p) => p.status === 'pending' && !p.category).length
)

const approvedCount = computed(() => proposals.value.filter((p) => p.status === 'approved').length)

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

async function updateProposal(id: string, updates: Record<string, unknown>) {
  try {
    await authFetch(`${apiBase}/api/inbox/proposals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
    const idx = proposals.value.findIndex((p) => p.id === id)
    if (idx >= 0) {
      proposals.value[idx] = { ...proposals.value[idx], ...updates } as InboxProposal
    }
  } catch {
    // silently fail
  }
}

async function approveAll() {
  try {
    const res = await authFetch(`${apiBase}/api/inbox/proposals/approve-all`, {
      method: 'POST',
    })
    if (res.ok) {
      await loadProposals()
    }
  } catch {
    // silently fail
  }
}

async function applyApproved() {
  isApplying.value = true
  try {
    const res = await authFetch(`${apiBase}/api/inbox/proposals/apply`, {
      method: 'POST',
    })
    if (res.ok) {
      await loadProposals()
    }
  } catch {
    // silently fail
  } finally {
    isApplying.value = false
  }
}

onMounted(loadProposals)

defineExpose({ pendingCount, loadProposals })
</script>

<template>
  <div class="inbox-proposals">
    <!-- Header -->
    <div class="inbox-header">
      <div class="inbox-title">
        <Inbox :size="18" />
        <h2>Inbox</h2>
        <span
          v-if="pendingCount > 0"
          class="badge"
        >
          {{ pendingCount }}
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
        <button
          v-if="filteredProposals.some((p) => p.status === 'pending' && p.category)"
          class="btn btn-ghost"
          @click="approveAll"
        >
          <CheckCheck :size="14" />
          Approve All
        </button>
        <button
          v-if="approvedCount > 0"
          class="btn btn-primary"
          :disabled="isApplying"
          @click="applyApproved"
        >
          <Play :size="14" />
          {{ isApplying ? 'Applying...' : `Apply (${approvedCount})` }}
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

      <button
        class="filter-pill status-toggle"
        :class="{ active: statusFilter === 'all' }"
        @click="statusFilter = statusFilter === 'pending' ? 'all' : 'pending'"
      >
        <Filter :size="12" />
        {{ statusFilter === 'pending' ? 'Pending' : 'All' }}
      </button>
    </div>

    <!-- Proposals List -->
    <div
      v-if="isLoading"
      class="loading-text"
    >
      Loading inbox...
    </div>

    <div
      v-else-if="filteredProposals.length === 0"
      class="empty-state"
    >
      <Inbox
        :size="32"
        class="empty-icon"
      />
      <p>No pending items</p>
      <span>Send messages to your Telegram bot to capture notes, tasks, and ideas.</span>
    </div>

    <div
      v-else
      class="proposals-list"
    >
      <div
        v-for="proposal in filteredProposals"
        :key="proposal.id"
        class="proposal-card"
        :class="{
          approved: proposal.status === 'approved',
          rejected: proposal.status === 'rejected',
        }"
      >
        <div class="proposal-header">
          <component
            :is="sourceIcon(proposal.source)"
            :size="14"
            class="source-icon"
          />
          <span class="source-label">{{ proposal.source }}</span>
          <span
            v-if="proposal.category"
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
        </div>

        <div class="proposal-body">
          <p class="raw-text">{{ proposal.rawText }}</p>
          <p
            v-if="proposal.proposedContent"
            class="proposed-content"
          >
            {{ proposal.proposedContent }}
          </p>
        </div>

        <div
          v-if="proposal.status === 'pending' || proposal.status === 'approved'"
          class="proposal-actions"
        >
          <button
            class="action-btn approve"
            :class="{ active: proposal.status === 'approved' }"
            title="Approve"
            @click="
              updateProposal(proposal.id, {
                status: proposal.status === 'approved' ? 'pending' : 'approved',
              })
            "
          >
            <Check :size="14" />
          </button>
          <button
            class="action-btn reject"
            title="Reject"
            @click="updateProposal(proposal.id, { status: 'rejected' })"
          >
            <X :size="14" />
          </button>
        </div>
        <div
          v-else
          class="proposal-status-badge"
          :class="proposal.status"
        >
          {{ proposal.status }}
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

.status-toggle {
  margin-left: auto;
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

.proposal-card.approved {
  border-color: rgba(16, 185, 129, 0.25);
  background: rgba(16, 185, 129, 0.04);
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
  margin-left: auto;
  color: var(--text-color-secondary, #94a3b8);
  font-family: monospace;
  font-size: 10px;
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

.proposal-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.08));
  background: transparent;
  cursor: pointer;
  transition: all 150ms ease;
}

.action-btn.approve {
  color: var(--text-color-secondary, #94a3b8);
}

.action-btn.approve:hover,
.action-btn.approve.active {
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.1);
}

.action-btn.reject {
  color: var(--text-color-secondary, #94a3b8);
}

.action-btn.reject:hover {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.1);
}

.proposal-status-badge {
  align-self: flex-end;
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

.btn-primary {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #6ee7b7;
}

.btn-primary:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.25);
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
