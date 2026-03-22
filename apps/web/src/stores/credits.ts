/**
 * Credits Store
 *
 * Pinia store for user credit balance, usage tracking, and transaction history.
 * Exposes plan-aware computed properties — weekly usage bars + billing cycle totals.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authFetch } from '@/utils/api'
import { getPlanDef } from '@/constants/plans'

const apiBase = import.meta.env.VITE_API_URL || ''

interface CreditInfo {
  balance_cents: number
  lifetime_granted: number
  lifetime_used: number
  plan_type: string
  plan_expires_at: string | null
  created_at: string | null
}

interface WeeklyUsage {
  total_cost_cents: number
  window_start: string
  window_end: string
}

interface MonthlyUsage {
  total_requests: number
  total_tokens: number
  total_cost_cents: number
  ledger_total_cost_cents: number
  requests_by_provider: Record<string, { requests: number; tokens: number; cost: number }>
  requests_by_action: Record<string, { requests: number; tokens: number; cost: number }>
}

interface DailyUsageEntry {
  usage_date: string
  request_count: number
  token_count: number
  cost_cents: number
}

interface CreditTransaction {
  id: string
  type: 'grant' | 'deduction' | 'refund' | 'expiry'
  amount_cents: number
  balance_after: number
  description: string | null
  created_at: string
}

export const useCreditsStore = defineStore('credits', () => {
  // State
  const credits = ref<CreditInfo | null>(null)
  const weeklyUsage = ref<WeeklyUsage | null>(null)
  const monthlyUsage = ref<MonthlyUsage | null>(null)
  const dailyUsage = ref<DailyUsageEntry[]>([])
  const transactions = ref<CreditTransaction[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastFetchedAt = ref<Date | null>(null)

  // ── Plan-aware computed ──────────────────────────────────────────

  const planDef = computed(() => getPlanDef(credits.value?.plan_type ?? 'none'))

  const planLabel = computed(() => planDef.value.label)

  const isActive = computed(() => {
    if (!credits.value || credits.value.plan_type === 'none') return false
    if (credits.value.plan_expires_at && new Date(credits.value.plan_expires_at) < new Date()) {
      return false
    }
    return true
  })

  // ── Weekly usage computed ─────────────────────────────────────────

  /** How much of this week's allowance has been used (0–100) */
  const weeklyUsedPercent = computed(() => {
    const pool = planDef.value.weeklyCreditsCents
    if (!weeklyUsage.value || pool === 0) return 0
    const cost = Number(weeklyUsage.value.total_cost_cents) || 0
    if (cost === 0) return 0
    const raw = (cost / pool) * 100
    return Math.min(100, Math.max(1, Math.round(raw)))
  })

  /** Formatted reset time for weekly window */
  const weeklyResetLabel = computed(() => {
    if (!weeklyUsage.value?.window_end) return ''
    const end = new Date(weeklyUsage.value.window_end)
    return end.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  })

  // ── Billing cycle computed ────────────────────────────────────────

  /** Total spent this billing cycle (from credit_transactions ledger) */
  const billingCycleTotalCents = computed(() => {
    if (!monthlyUsage.value) return 0
    return (
      Number(monthlyUsage.value.ledger_total_cost_cents) ||
      Number(monthlyUsage.value.total_cost_cents) ||
      0
    )
  })

  /** Formatted dollar amount spent this cycle */
  const billingCycleSpentLabel = computed(() => {
    const cents = billingCycleTotalCents.value
    return `$${(cents / 100).toFixed(2)}`
  })

  /** Billing cycle reset date (plan_expires_at or 30 days from created_at) */
  const billingCycleResetLabel = computed(() => {
    if (credits.value?.plan_expires_at) {
      return new Date(credits.value.plan_expires_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    }
    return ''
  })

  /** Monthly pool in dollars */
  const monthlyPoolLabel = computed(() => {
    const cents = planDef.value.monthlyCreditsCents
    return `$${(cents / 100).toFixed(0)}`
  })

  /** How much of the monthly pool has been used (0–100) */
  const billingCycleUsedPercent = computed(() => {
    const pool = planDef.value.monthlyCreditsCents
    if (pool === 0) return 0
    const cost = billingCycleTotalCents.value
    if (cost === 0) return 0
    return Math.min(100, Math.max(1, Math.round((cost / pool) * 100)))
  })

  // ── Lifetime computed (kept for backwards compat) ────────────────

  const isExhausted = computed(() => {
    if (!credits.value) return true
    return credits.value.balance_cents <= 0
  })

  const usagePercent = computed(() => {
    if (!credits.value || credits.value.lifetime_granted === 0) return 0
    return Math.min(100, (credits.value.lifetime_used / credits.value.lifetime_granted) * 100)
  })

  const remainingPercent = computed(() => {
    if (!credits.value || credits.value.lifetime_granted === 0) return 0
    return Math.max(0, (credits.value.balance_cents / credits.value.lifetime_granted) * 100)
  })

  // ── Actions ──────────────────────────────────────────────────────

  async function fetchCredits() {
    try {
      const res = await authFetch(`${apiBase}/api/settings/credits`)
      if (res.ok) {
        const data = await res.json()
        credits.value = data.credits
      }
    } catch {
      // silently fail
    }
  }

  async function fetchWeeklyUsage() {
    try {
      const res = await authFetch(`${apiBase}/api/settings/usage/weekly`)
      if (res.ok) {
        const data = await res.json()
        weeklyUsage.value = data.weekly
      }
    } catch {
      // silently fail
    }
  }

  async function fetchUsage() {
    try {
      const res = await authFetch(`${apiBase}/api/settings/usage`)
      if (res.ok) {
        const data = await res.json()
        monthlyUsage.value = data.usage
      }
    } catch {
      // silently fail
    }
  }

  async function fetchDailyUsage() {
    try {
      const res = await authFetch(`${apiBase}/api/settings/usage/daily`)
      if (res.ok) {
        const data = await res.json()
        dailyUsage.value = data.usage
      }
    } catch {
      // silently fail
    }
  }

  async function fetchTransactions(limit = 20) {
    try {
      const res = await authFetch(`${apiBase}/api/settings/transactions?limit=${limit}`)
      if (res.ok) {
        const data = await res.json()
        transactions.value = data.transactions
      }
    } catch {
      // silently fail
    }
  }

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      await Promise.all([
        fetchCredits(),
        fetchWeeklyUsage(),
        fetchUsage(),
        fetchDailyUsage(),
        fetchTransactions(),
      ])
      lastFetchedAt.value = new Date()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load usage data'
    } finally {
      loading.value = false
    }
  }

  function markExhausted() {
    if (credits.value) {
      credits.value.balance_cents = 0
    }
  }

  return {
    // State
    credits,
    weeklyUsage,
    monthlyUsage,
    dailyUsage,
    transactions,
    loading,
    error,
    lastFetchedAt,
    // Plan-aware computed
    planDef,
    planLabel,
    isActive,
    // Weekly
    weeklyUsedPercent,
    weeklyResetLabel,
    // Billing cycle
    billingCycleTotalCents,
    billingCycleSpentLabel,
    billingCycleResetLabel,
    billingCycleUsedPercent,
    monthlyPoolLabel,
    // Lifetime computed
    isExhausted,
    usagePercent,
    remainingPercent,
    // Actions
    fetchCredits,
    fetchWeeklyUsage,
    fetchUsage,
    fetchDailyUsage,
    fetchTransactions,
    fetchAll,
    markExhausted,
  }
})
