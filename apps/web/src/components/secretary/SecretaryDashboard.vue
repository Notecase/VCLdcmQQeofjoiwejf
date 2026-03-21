<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import { useSecretaryStore } from '@/stores/secretary'
import SecretaryAnchor from './SecretaryAnchor.vue'
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
</script>

<template>
  <div class="secretary-dashboard">
    <!-- Banners -->
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

    <!-- Zone 1: Greeting + Date -->
    <SecretaryAnchor />

    <!-- Zone 2: Plan Board -->
    <section
      v-if="store.activePlans.length > 0"
      class="plans-section"
    >
      <ActivePlansOverview />
    </section>

    <!-- Zone 3: Today's Schedule -->
    <section class="schedule-section">
      <TodayPlan />
    </section>

    <!-- Zone 4: Tomorrow's Plan (separate) -->
    <section
      v-if="store.showTomorrowSection || store.tomorrowPlan"
      class="schedule-section"
    >
      <TomorrowPlan />
    </section>

    <ReflectionSection v-if="store.showReflectionSection" />
  </div>
</template>

<style scoped>
.secretary-dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0 24px;
}

.error-banner,
.warning-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--sec-radius-md);
  font-size: 13px;
}

.error-banner {
  color: #f85149;
  border: 1px solid rgba(248, 81, 73, 0.2);
  background: rgba(248, 81, 73, 0.08);
}

.warning-banner {
  color: #e3b341;
  border: 1px solid rgba(227, 179, 65, 0.22);
  background: rgba(227, 179, 65, 0.08);
}

.dismiss-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--sec-radius-pill);
  border: 1px solid var(--sec-glass-border);
  background: var(--sec-surface-card);
  color: inherit;
  cursor: pointer;
}
</style>
