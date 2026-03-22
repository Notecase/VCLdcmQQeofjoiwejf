/**
 * Plan Registry
 *
 * Maps plan_type strings (from user_credits.plan_type) to display metadata.
 * No dollar amounts are exposed — only percentages and feature lists.
 */

export interface PlanDefinition {
  key: string
  label: string
  monthlyCreditsCents: number
  weeklyCreditsCents: number
  features: string[]
  color: string
}

export const PLAN_REGISTRY: Record<string, PlanDefinition> = {
  none: {
    key: 'none',
    label: 'Free',
    monthlyCreditsCents: 0,
    weeklyCreditsCents: 0,
    features: [],
    color: 'var(--text-color-secondary)',
  },
  trial: {
    key: 'trial',
    label: 'Trial',
    monthlyCreditsCents: 100,
    weeklyCreditsCents: 100,
    features: ['Limited AI access'],
    color: 'var(--text-color-secondary)',
  },
  studious: {
    key: 'studious',
    label: 'Studious',
    monthlyCreditsCents: 1200,
    weeklyCreditsCents: 300,
    features: [
      'AI note editing & chat',
      'Secretary daily planning',
      'Deep research agent',
      'Course generation',
    ],
    color: '#10b981',
  },
}

export function getPlanDef(planType: string): PlanDefinition {
  return PLAN_REGISTRY[planType] ?? PLAN_REGISTRY.none
}
