<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { Check, Loader2 } from 'lucide-vue-next'
import { useSecretaryStore } from '@/stores/secretary'
import type { ScheduledTask } from '@inkdown/shared/types'

const emit = defineEmits<{
  'select-task': [task: ScheduledTask]
}>()

const store = useSecretaryStore()

// Reactive clock for time-based badges
const now = ref(new Date())
let clockInterval: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  clockInterval = setInterval(() => { now.value = new Date() }, 30_000)
})
onUnmounted(() => {
  if (clockInterval) clearInterval(clockInterval)
})

const currentTaskId = computed(() => {
  if (!store.todayPlan) return null
  const n = now.value
  const nowMinutes = n.getHours() * 60 + n.getMinutes()
  for (const task of store.todayPlan.tasks) {
    if (task.status === 'completed' || task.status === 'skipped') continue
    const [h, m] = task.scheduledTime.split(':').map(Number)
    const start = h * 60 + m
    const end = start + task.durationMinutes
    if (nowMinutes >= start && nowMinutes < end) return task.id
  }
  return null
})

const pendingTasks = computed(() => {
  if (!store.todayPlan) return []
  return store.todayPlan.tasks.filter((t) => t.status !== 'completed' && t.status !== 'skipped')
})

const scrollDuration = computed(() => {
  const count = pendingTasks.value.length
  return `${Math.max(15, count * 5.5)}s`
})

type TickerState = 'scrolling' | 'empty' | 'done' | 'single' | 'loading'

const tickerState = computed<TickerState>(() => {
  if (!store.todayPlan && store.isGeneratingPlan) return 'loading'
  if (!store.todayPlan) return 'empty'
  if (pendingTasks.value.length === 0) return 'done'
  if (pendingTasks.value.length === 1) return 'single'
  return 'scrolling'
})

const firstTomorrowTask = computed(() => {
  if (!store.tomorrowPlan || store.tomorrowPlan.tasks.length === 0) return null
  return store.tomorrowPlan.tasks[0]
})

// eslint-disable-next-line no-unused-vars
function badgeType(task: ScheduledTask, _index: number): 'live' | 'next' | null {
  if (task.id === currentTaskId.value) return 'live'
  // Find the next pending task after the current one
  if (currentTaskId.value) {
    const currentIdx = pendingTasks.value.findIndex((t) => t.id === currentTaskId.value)
    if (currentIdx !== -1 && currentIdx + 1 < pendingTasks.value.length) {
      if (task.id === pendingTasks.value[currentIdx + 1].id) return 'next'
    }
  } else {
    // No current task — first pending is "next"
    if (pendingTasks.value.length > 0 && task.id === pendingTasks.value[0].id) return 'next'
  }
  return null
}
</script>

<template>
  <div
    class="ticker-bar"
    :class="tickerState"
  >
    <!-- Scrolling state -->
    <template v-if="tickerState === 'scrolling'">
      <div
        class="ticker-track"
        :style="{ animationDuration: scrollDuration }"
      >
        <template
          v-for="(_pass, passIdx) in 2"
          :key="passIdx"
        >
          <template
            v-for="(task, idx) in pendingTasks"
            :key="`${passIdx}-${task.id}`"
          >
            <button
              class="ticker-item"
              :class="{ live: badgeType(task, idx) === 'live' }"
              @click="emit('select-task', task)"
            >
              <span
                v-if="badgeType(task, idx)"
                class="ticker-badge"
                :class="badgeType(task, idx)"
              >
                {{ badgeType(task, idx) === 'live' ? 'LIVE' : 'NEXT' }}
              </span>
              <span class="ticker-time">{{ task.scheduledTime }}</span>
              <span class="ticker-name">{{ task.title }}</span>
            </button>
            <span class="ticker-divider" />
          </template>
        </template>
      </div>
    </template>

    <!-- Single task -->
    <template v-else-if="tickerState === 'single'">
      <button
        class="ticker-single"
        @click="emit('select-task', pendingTasks[0])"
      >
        <span class="pulse-dot" />
        <span class="ticker-name live-name">{{ pendingTasks[0].title }}</span>
        <span class="ticker-time">{{ pendingTasks[0].scheduledTime }}</span>
      </button>
    </template>

    <!-- All done -->
    <template v-else-if="tickerState === 'done'">
      <span class="ticker-static done">
        <Check :size="14" />
        <span>All clear</span>
        <template v-if="firstTomorrowTask">
          <span class="ticker-divider-inline" />
          <span class="tomorrow-preview">
            Next: {{ firstTomorrowTask.title }} tomorrow at {{ firstTomorrowTask.scheduledTime }}
          </span>
        </template>
      </span>
    </template>

    <!-- Loading -->
    <template v-else-if="tickerState === 'loading'">
      <span class="ticker-static loading">
        <Loader2
          :size="12"
          class="spinner"
        />
        <span>Loading schedule...</span>
      </span>
    </template>

    <!-- Empty -->
    <template v-else>
      <span class="ticker-static empty">
        <span class="empty-dot" />
        <span>No tasks scheduled</span>
      </span>
    </template>
  </div>
</template>

<style scoped>
.ticker-bar {
  height: var(--sec-ticker-height, 34px);
  background: var(--sec-ticker-bg);
  backdrop-filter: blur(var(--sec-ticker-blur, 12px));
  -webkit-backdrop-filter: blur(var(--sec-ticker-blur, 12px));
  border-bottom: 1px solid var(--sec-ticker-border);
  overflow: hidden;
  display: flex;
  align-items: center;
  position: relative;
  flex-shrink: 0;
}

/* Fade edges */
.ticker-bar.scrolling::before,
.ticker-bar.scrolling::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 28px;
  z-index: 3;
  pointer-events: none;
}

.ticker-bar.scrolling::before {
  left: 0;
  background: linear-gradient(90deg, var(--sec-ticker-fade, rgba(13, 17, 23, 0.9)), transparent);
}

.ticker-bar.scrolling::after {
  right: 0;
  background: linear-gradient(270deg, var(--sec-ticker-fade, rgba(13, 17, 23, 0.9)), transparent);
}

/* Track animation */
.ticker-track {
  display: flex;
  align-items: center;
  white-space: nowrap;
  animation: ticker-scroll var(--sec-ticker-speed, 28s) linear infinite;
}

.ticker-bar:hover .ticker-track {
  animation-play-state: paused;
}

@keyframes ticker-scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

/* Items */
.ticker-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  margin: 0 3px;
  border-radius: 6px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-family: inherit;
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
  transition: all 0.15s ease;
}

.ticker-item:hover {
  background: var(--sec-ticker-item-hover);
  color: var(--text-color, #e2e8f0);
}

.ticker-item.live .ticker-name {
  color: var(--sec-ticker-live-color, #34d399);
  font-weight: 500;
}

/* Badges */
.ticker-badge {
  font-size: 8px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.ticker-badge.live {
  background: var(--sec-ticker-live-bg);
  color: var(--sec-ticker-live-color);
}

.ticker-badge.next {
  background: var(--sec-ticker-next-bg);
  color: var(--sec-ticker-next-color);
}

.ticker-time {
  color: var(--text-muted, #4b5563);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  flex-shrink: 0;
}

.ticker-name {
  color: var(--text-color, #cbd5e1);
}

.ticker-divider {
  width: 1px;
  height: 14px;
  background: var(--sec-ticker-divider);
  margin: 0 4px;
  flex-shrink: 0;
}

/* Single task - centered, no scroll */
.ticker-single {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  color: var(--text-color-secondary);
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sec-primary, #10b981);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
  50% { box-shadow: 0 0 0 5px rgba(16, 185, 129, 0); }
}

.live-name {
  color: var(--sec-ticker-live-color, #34d399);
  font-weight: 500;
}

/* Static states */
.ticker-static {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  font-size: 11px;
}

.ticker-static.done {
  color: var(--sec-ticker-live-color, #34d399);
}

.ticker-static.loading {
  color: var(--text-muted, #4b5563);
}

.ticker-static.empty {
  color: var(--text-muted, #374151);
}

.empty-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--text-muted, #374151);
  opacity: 0.5;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.ticker-divider-inline {
  width: 1px;
  height: 12px;
  background: var(--sec-ticker-divider);
  margin: 0 4px;
}

.tomorrow-preview {
  color: var(--text-color-secondary, #94a3b8);
  font-size: 11px;
}

/* Responsive */
@media (max-width: 900px) {
  .ticker-item {
    padding: 4px 8px;
  }
}

@media (max-width: 600px) {
  .ticker-bar.scrolling {
    justify-content: center;
  }

  .ticker-bar.scrolling .ticker-track {
    animation: none;
  }

  .ticker-bar.scrolling .ticker-item:not(:first-child),
  .ticker-bar.scrolling .ticker-divider:not(:first-of-type) {
    display: none;
  }
}
</style>
