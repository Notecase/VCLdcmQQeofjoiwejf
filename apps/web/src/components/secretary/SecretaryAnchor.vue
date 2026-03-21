<script setup lang="ts">
import { computed } from 'vue'
import { Calendar, Sparkles } from 'lucide-vue-next'
import { useSecretaryStore } from '@/stores/secretary'

const store = useSecretaryStore()

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
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
  <section class="secretary-anchor">
    <div class="anchor-left">
      <h2 class="anchor-greeting">{{ greeting }}</h2>
      <p class="anchor-date">
        <Calendar :size="14" />
        {{ todayFormatted }}
      </p>
    </div>

    <button
      v-if="!store.tomorrowPlan"
      class="prepare-btn"
      :disabled="store.isGeneratingTomorrow"
      @click="store.prepareTomorrow()"
    >
      <Sparkles :size="16" />
      {{ store.isGeneratingTomorrow ? 'Generating...' : 'Prepare Tomorrow' }}
    </button>
  </section>
</template>

<style scoped>
.secretary-anchor {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 0;
}

.anchor-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.anchor-greeting {
  margin: 0;
  color: var(--text-color, #e2e8f0);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.anchor-date {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 14px;
}

.prepare-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--sec-radius-md);
  border: none;
  background: var(--sec-fab-bg);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition:
    transform var(--sec-transition-fast) var(--ease-out-expo, ease),
    box-shadow var(--sec-transition-fast) ease;
}

.prepare-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--sec-fab-shadow);
}

.prepare-btn:active {
  transform: translateY(0);
}

.prepare-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

@media (max-width: 900px) {
  .anchor-greeting {
    font-size: 22px;
  }

  .secretary-anchor {
    flex-direction: column;
    gap: 12px;
  }
}
</style>
