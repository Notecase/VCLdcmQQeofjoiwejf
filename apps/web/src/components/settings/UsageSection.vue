<script setup lang="ts">
import { onMounted } from 'vue'
import { useCreditsStore } from '@/stores/credits'
import { RefreshCw, TrendingDown, Check } from 'lucide-vue-next'

const store = useCreditsStore()

onMounted(() => {
  store.fetchAll()
})

function formatActivityDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function lastUpdatedLabel(): string {
  if (!store.lastFetchedAt) return ''
  const diff = Date.now() - store.lastFetchedAt.getTime()
  if (diff < 60_000) return 'just now'
  const mins = Math.floor(diff / 60_000)
  return `${mins} minute${mins > 1 ? 's' : ''} ago`
}

async function refresh() {
  await store.fetchAll()
}
</script>

<template>
  <div class="usage-section">
    <!-- Loading -->
    <div v-if="store.loading && !store.credits" class="loading-text">Loading usage data...</div>

    <template v-else>
      <!-- Plan Card -->
      <div v-if="store.credits" class="plan-card">
        <div class="plan-card-header">
          <div class="plan-card-title">
            <span class="plan-name">{{ store.planLabel }} Plan</span>
            <span v-if="store.isActive" class="plan-active-badge">
              <Check :size="12" />
              Active
            </span>
            <span v-else class="plan-inactive-badge">Inactive</span>
          </div>
          <p class="plan-card-desc">
            {{ store.planDef.features.join(', ') || 'No active plan' }}
          </p>
        </div>
      </div>

      <!-- Weekly Usage -->
      <div v-if="store.planDef.weeklyCreditsCents > 0" class="usage-group">
        <h3 class="group-heading">Weekly limits</h3>

        <div class="bar-row">
          <div class="bar-info">
            <span class="bar-label">All models</span>
            <span class="bar-sublabel">Resets {{ store.weeklyResetLabel }}</span>
          </div>
          <div class="bar-track-wrapper">
            <div class="bar-track">
              <div
                class="bar-fill"
                :class="{
                  'bar-fill--warning': store.weeklyUsedPercent > 70 && store.weeklyUsedPercent <= 90,
                  'bar-fill--danger': store.weeklyUsedPercent > 90,
                }"
                :style="{ width: store.weeklyUsedPercent + '%' }"
              />
            </div>
          </div>
          <span class="bar-percent">{{ store.weeklyUsedPercent }}% used</span>
        </div>

        <div class="updated-row">
          <span class="updated-label">Last updated: {{ lastUpdatedLabel() }}</span>
          <button class="refresh-btn" title="Refresh" @click="refresh">
            <RefreshCw :size="12" :class="{ spinning: store.loading }" />
          </button>
        </div>
      </div>

      <!-- Extra Usage (billing cycle) -->
      <div v-if="store.planDef.monthlyCreditsCents > 0" class="usage-group">
        <h3 class="group-heading">Extra usage</h3>

        <div class="extra-row">
          <div class="extra-info">
            <span class="extra-amount">{{ store.billingCycleSpentLabel }} spent</span>
            <span class="extra-sublabel">Resets {{ store.billingCycleResetLabel }}</span>
          </div>
          <div class="bar-track-wrapper">
            <div class="bar-track">
              <div
                class="bar-fill"
                :class="{
                  'bar-fill--warning': store.billingCycleUsedPercent > 70 && store.billingCycleUsedPercent <= 90,
                  'bar-fill--danger': store.billingCycleUsedPercent > 90,
                }"
                :style="{ width: Math.min(100, store.billingCycleUsedPercent) + '%' }"
              />
            </div>
          </div>
          <span class="bar-percent">{{ store.billingCycleUsedPercent }}% used</span>
        </div>

        <div class="extra-details">
          <div class="extra-detail-row">
            <span class="extra-detail-value">{{ store.monthlyPoolLabel }}</span>
            <span class="extra-detail-label">Monthly spend limit</span>
          </div>
        </div>
      </div>

      <!-- No plan fallback -->
      <div v-if="store.planDef.weeklyCreditsCents === 0 && store.planDef.monthlyCreditsCents === 0" class="no-plan-notice">
        <p>No active plan. Usage tracking is unavailable.</p>
      </div>

      <!-- Activity Log -->
      <details v-if="store.transactions.length > 0" class="activity-section">
        <summary class="activity-toggle">
          <TrendingDown :size="14" />
          Activity log ({{ store.transactions.length }})
        </summary>
        <div class="activity-list">
          <div
            v-for="tx in store.transactions"
            :key="tx.id"
            class="activity-row"
          >
            <span class="activity-date">{{ formatActivityDate(tx.created_at) }}</span>
            <span class="activity-type" :class="tx.type">{{ tx.type }}</span>
            <span class="activity-desc">{{ tx.description || '—' }}</span>
          </div>
        </div>
      </details>
    </template>
  </div>
</template>

<style scoped>
.usage-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.loading-text {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
}

/* ── Plan Card ────────────────────────────── */

.plan-card {
  padding: 16px 20px;
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
  background: rgba(255, 255, 255, 0.02);
}

.plan-card-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.plan-card-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.plan-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
}

.plan-active-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.12);
  color: #4ade80;
}

.plan-inactive-badge {
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color-secondary, #94a3b8);
}

.plan-card-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  line-height: 1.5;
}

/* ── Usage Groups ──────────────────────────── */

.usage-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
}

.group-heading {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
}

/* ── Bar Row (weekly) ──────────────────────── */

.bar-row,
.extra-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.bar-info,
.extra-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 120px;
  flex-shrink: 0;
}

.bar-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color, #e2e8f0);
}

.bar-sublabel,
.extra-sublabel {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.7;
}

.bar-track-wrapper {
  flex: 1;
  min-width: 0;
}

.bar-track {
  height: 10px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 5px;
  background: #3b82f6;
  transition: width 0.4s ease;
  min-width: 2px;
}

.bar-fill--warning {
  background: #f59e0b;
}

.bar-fill--danger {
  background: #ef4444;
}

.bar-percent {
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--text-color, #e2e8f0);
  white-space: nowrap;
  min-width: 64px;
  text-align: right;
}

/* ── Updated Row ───────────────────────────── */

.updated-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.updated-label {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.7;
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
  border-radius: 4px;
  transition: all 150ms ease;
}

.refresh-btn:hover {
  color: var(--text-color, #e2e8f0);
  background: var(--hover-bg, rgba(255, 255, 255, 0.06));
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── Extra Usage ───────────────────────────── */

.extra-amount {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
}

.extra-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.extra-detail-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.extra-detail-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
}

.extra-detail-label {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
}

/* ── No Plan ─────────────────────────────── */

.no-plan-notice {
  padding: 16px;
  border-radius: var(--radius-md, 10px);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-color-secondary, #94a3b8);
  font-size: 13px;
}

.no-plan-notice p {
  margin: 0;
}

/* ── Activity ────────────────────────────── */

.activity-section {
  border-top: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
}

.activity-toggle {
  padding: 12px 0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-color-secondary, #94a3b8);
  user-select: none;
  display: flex;
  align-items: center;
  gap: 6px;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.activity-row {
  display: grid;
  grid-template-columns: 130px 70px 1fr;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 12px;
  border-bottom: 1px solid rgba(48, 54, 61, 0.25);
}

.activity-row:last-child {
  border-bottom: none;
}

.activity-date {
  color: var(--text-color-secondary, #94a3b8);
  font-variant-numeric: tabular-nums;
}

.activity-type {
  text-transform: capitalize;
  font-weight: 500;
  color: var(--text-color-secondary, #94a3b8);
}

.activity-type.grant,
.activity-type.refund {
  color: #4ade80;
}

.activity-desc {
  color: var(--text-color-secondary, #94a3b8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
