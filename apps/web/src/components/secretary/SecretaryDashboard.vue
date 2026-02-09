<script setup lang="ts">
import { computed } from 'vue'
import { useSecretaryStore } from '@/stores/secretary'
import { Calendar, Sparkles, X } from 'lucide-vue-next'
import ActivePlansOverview from './ActivePlansOverview.vue'
import TodayPlan from './TodayPlan.vue'
import TomorrowPlan from './TomorrowPlan.vue'
import ReflectionSection from './ReflectionSection.vue'

const store = useSecretaryStore()
const parserWarningSummary = computed(() => {
  const warnings = store.parserWarnings || []
  if (warnings.length === 0) return null
  const first = warnings[0]
  const suffix = warnings.length > 1 ? ` (+${warnings.length - 1} more)` : ''
  return `${first.message}${suffix}`
})

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
})

const todayFormatted = computed(() => {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
})
</script>

<template>
  <div class="secretary-dashboard">
    <!-- Error Banner -->
    <div
      v-if="store.error"
      class="error-banner"
    >
      <span>{{ store.error }}</span>
      <button
        class="dismiss-btn"
        @click="store.error = null"
      >
        <X :size="14" />
      </button>
    </div>

    <div
      v-if="parserWarningSummary"
      class="warning-banner"
    >
      <span>{{ parserWarningSummary }}</span>
    </div>

    <!-- Header -->
    <div class="dashboard-header">
      <div class="greeting">
        <h2>{{ greeting }}</h2>
        <p class="date">
          <Calendar :size="14" />
          {{ todayFormatted }}
        </p>
      </div>
      <button
        class="prepare-btn"
        :disabled="store.isGeneratingTomorrow"
        @click="store.prepareTomorrow()"
      >
        <Sparkles :size="14" />
        {{ store.isGeneratingTomorrow ? 'Generating...' : 'Prepare Tomorrow' }}
      </button>
    </div>

    <!-- Active Plans -->
    <ActivePlansOverview v-if="store.activePlans.length > 0" />

    <!-- Daily Plans -->
    <div class="plans-section">
      <TodayPlan />
      <TomorrowPlan v-if="store.showTomorrowSection || store.tomorrowPlan" />
    </div>

    <!-- Reflection -->
    <ReflectionSection />
  </div>
</template>

<style scoped>
.secretary-dashboard {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 8px 0;
}

@keyframes fade-slide-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dashboard-header {
  animation: fade-slide-up 0.4s ease both;
  animation-delay: 0.05s;
}

.active-plans {
  animation: fade-slide-up 0.4s ease both;
  animation-delay: 0.1s;
}

.plans-section {
  animation: fade-slide-up 0.4s ease both;
  animation-delay: 0.2s;
}

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(248, 81, 73, 0.1);
  border: 1px solid rgba(248, 81, 73, 0.3);
  color: #f85149;
  font-size: 13px;
}

.warning-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(227, 179, 65, 0.12);
  border: 1px solid rgba(227, 179, 65, 0.4);
  color: #e3b341;
  font-size: 13px;
}

.dismiss-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: #f85149;
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
  transition: background 0.15s;
}

.dismiss-btn:hover {
  background: rgba(248, 81, 73, 0.15);
}

.dashboard-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.greeting h2 {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0 0 4px;
  letter-spacing: -0.5px;
}

.date {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0;
}

.prepare-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--sec-primary-border, rgba(16, 185, 129, 0.3));
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary, #10b981);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.prepare-btn:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.2);
}

.prepare-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.plans-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
