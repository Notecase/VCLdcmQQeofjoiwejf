<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCreditsStore } from '@/stores/credits'
import {
  RefreshCw,
  TrendingDown,
  Check,
  Gift,
  Loader2,
  AlertCircle,
  Sparkles,
} from 'lucide-vue-next'

const store = useCreditsStore()
const inviteCode = ref('')
const showRedeemInput = ref(false)

function cancelRedeem() {
  showRedeemInput.value = false
  inviteCode.value = ''
}

async function handleRedeem() {
  if (!inviteCode.value.trim()) return
  const success = await store.redeemCode(inviteCode.value)
  if (success) {
    inviteCode.value = ''
    showRedeemInput.value = false
  }
}

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
    <div
      v-if="store.loading && !store.credits"
      class="loading-text"
    >
      Loading usage data...
    </div>

    <template v-else>
      <!-- Plan Card -->
      <div
        v-if="store.credits"
        class="plan-card"
      >
        <div class="plan-card-header">
          <div class="plan-card-title">
            <span class="plan-name">{{ store.planLabel }} Plan</span>
            <span
              v-if="store.isActive"
              class="plan-active-badge"
            >
              <Check :size="12" />
              Active
            </span>
            <span
              v-else
              class="plan-inactive-badge"
              >Inactive</span
            >
          </div>
          <p class="plan-card-desc">
            {{ store.planDef.features.join(', ') || 'No active plan' }}
          </p>
        </div>
      </div>

      <!-- Weekly Usage -->
      <div
        v-if="store.planDef.weeklyCreditsCents > 0"
        class="usage-group"
      >
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
                  'bar-fill--warning':
                    store.weeklyUsedPercent > 70 && store.weeklyUsedPercent <= 90,
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
          <button
            class="refresh-btn"
            title="Refresh"
            @click="refresh"
          >
            <RefreshCw
              :size="12"
              :class="{ spinning: store.loading }"
            />
          </button>
        </div>
      </div>

      <!-- Extra Usage (billing cycle) -->
      <div
        v-if="store.planDef.monthlyCreditsCents > 0"
        class="usage-group"
      >
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
                  'bar-fill--warning':
                    store.billingCycleUsedPercent > 70 && store.billingCycleUsedPercent <= 90,
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

      <!-- No plan — prominent invite code CTA -->
      <div
        v-if="store.planDef.weeklyCreditsCents === 0 && store.planDef.monthlyCreditsCents === 0"
        class="invite-card invite-card--prominent"
      >
        <div class="invite-card-icon">
          <Gift :size="20" />
        </div>
        <div class="invite-card-content">
          <h3 class="invite-card-title">Got an invite code?</h3>
          <p class="invite-card-desc">
            Enter your code to activate your free plan and start using AI features.
          </p>
        </div>

        <div class="invite-input-row">
          <input
            v-model="inviteCode"
            type="text"
            class="invite-input"
            placeholder="e.g. EARLY-001"
            :disabled="store.redeemLoading"
            @keydown.enter="handleRedeem"
          />
          <button
            class="invite-btn"
            :disabled="!inviteCode.trim() || store.redeemLoading"
            @click="handleRedeem"
          >
            <Loader2
              v-if="store.redeemLoading"
              :size="14"
              class="spinning"
            />
            <Sparkles
              v-else
              :size="14"
            />
            {{ store.redeemLoading ? 'Activating...' : 'Activate' }}
          </button>
        </div>

        <!-- Success -->
        <div
          v-if="store.redeemSuccess"
          class="invite-feedback invite-feedback--success"
        >
          <Check :size="14" />
          Plan activated! Welcome aboard.
        </div>

        <!-- Error -->
        <div
          v-if="store.redeemError"
          class="invite-feedback invite-feedback--error"
        >
          <AlertCircle :size="14" />
          {{ store.redeemError }}
        </div>
      </div>

      <!-- Active plan — subtle redeem link -->
      <div
        v-if="store.isActive && !showRedeemInput"
        class="invite-link-row"
      >
        <button
          class="invite-link-btn"
          @click="showRedeemInput = true"
        >
          <Gift :size="12" />
          Have an invite code?
        </button>
      </div>

      <!-- Active plan — inline redeem input -->
      <div
        v-if="store.isActive && showRedeemInput"
        class="invite-card invite-card--compact"
      >
        <div class="invite-input-row">
          <input
            v-model="inviteCode"
            type="text"
            class="invite-input"
            placeholder="Enter code"
            :disabled="store.redeemLoading"
            @keydown.enter="handleRedeem"
            @keydown.escape="showRedeemInput = false"
          />
          <button
            class="invite-btn invite-btn--sm"
            :disabled="!inviteCode.trim() || store.redeemLoading"
            @click="handleRedeem"
          >
            <Loader2
              v-if="store.redeemLoading"
              :size="14"
              class="spinning"
            />
            Redeem
          </button>
          <button
            class="invite-cancel-btn"
            @click="cancelRedeem"
          >
            Cancel
          </button>
        </div>

        <div
          v-if="store.redeemSuccess"
          class="invite-feedback invite-feedback--success"
        >
          <Check :size="14" />
          Credits added!
        </div>

        <div
          v-if="store.redeemError"
          class="invite-feedback invite-feedback--error"
        >
          <AlertCircle :size="14" />
          {{ store.redeemError }}
        </div>
      </div>

      <!-- Activity Log -->
      <details
        v-if="store.transactions.length > 0"
        class="activity-section"
      >
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
            <span
              class="activity-type"
              :class="tx.type"
              >{{ tx.type }}</span
            >
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
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
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

/* ── Invite Code ──────────────────────────── */

.invite-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
  background: rgba(255, 255, 255, 0.02);
}

.invite-card--prominent {
  border-color: rgba(139, 92, 246, 0.25);
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.04) 0%, rgba(255, 255, 255, 0.02) 100%);
}

.invite-card--compact {
  padding: 14px 16px;
  gap: 10px;
}

.invite-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: rgba(139, 92, 246, 0.12);
  color: #a78bfa;
  flex-shrink: 0;
}

.invite-card-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.invite-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
}

.invite-card-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  line-height: 1.5;
}

.invite-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.invite-input {
  flex: 1;
  height: 36px;
  padding: 0 12px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  letter-spacing: 0.5px;
  color: var(--text-color, #e2e8f0);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
  border-radius: var(--radius-sm, 6px);
  outline: none;
  transition: border-color 150ms ease;
  text-transform: uppercase;
}

.invite-input::placeholder {
  text-transform: none;
  letter-spacing: normal;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.5;
}

.invite-input:focus {
  border-color: rgba(139, 92, 246, 0.5);
}

.invite-input:disabled {
  opacity: 0.5;
}

.invite-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  color: #fff;
  background: rgba(139, 92, 246, 0.85);
  border: none;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
}

.invite-btn:hover:not(:disabled) {
  background: rgba(139, 92, 246, 1);
}

.invite-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.invite-btn--sm {
  padding: 0 12px;
  font-size: 12px;
}

.invite-cancel-btn {
  height: 36px;
  padding: 0 10px;
  font-size: 12px;
  font-family: inherit;
  color: var(--text-color-secondary, #94a3b8);
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: var(--radius-sm, 6px);
  transition: all 150ms ease;
}

.invite-cancel-btn:hover {
  color: var(--text-color, #e2e8f0);
  background: var(--hover-bg, rgba(255, 255, 255, 0.06));
}

.invite-feedback {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
}

.invite-feedback--success {
  color: #4ade80;
}

.invite-feedback--error {
  color: #f87171;
}

.invite-link-row {
  padding-top: 4px;
}

.invite-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  font-size: 12px;
  font-family: inherit;
  color: var(--text-color-secondary, #94a3b8);
  background: none;
  border: none;
  cursor: pointer;
  transition: color 150ms ease;
}

.invite-link-btn:hover {
  color: #a78bfa;
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
