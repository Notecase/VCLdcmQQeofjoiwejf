<script setup lang="ts">
import { Flame, Trophy, Target } from 'lucide-vue-next'

defineProps<{
  currentStreak: number
  longestStreak: number
  weeklyCompleted: number
  weeklyTotal: number
}>()
</script>

<template>
  <div class="streak-badge">
    <div class="streak-item primary">
      <Flame
        :size="18"
        class="streak-icon fire"
      />
      <div class="streak-info">
        <span class="streak-value">{{ currentStreak }}</span>
        <span class="streak-label">day streak</span>
      </div>
    </div>

    <div class="streak-divider" />

    <div class="streak-item">
      <Trophy
        :size="14"
        class="streak-icon trophy"
      />
      <div class="streak-info">
        <span class="streak-value sm">{{ longestStreak }}</span>
        <span class="streak-label">best</span>
      </div>
    </div>

    <div class="streak-divider" />

    <div class="streak-item">
      <Target
        :size="14"
        class="streak-icon target"
      />
      <div class="streak-info">
        <span class="streak-value sm">{{ weeklyCompleted }}/{{ weeklyTotal }}</span>
        <span class="streak-label">this week</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.streak-badge {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  border-radius: 12px;
  background: var(--card-bg, #242428);
  border: 1px solid var(--border-color, #333338);
}

.streak-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.streak-item.primary {
  gap: 10px;
}

.streak-icon.fire {
  color: #f59e0b;
}

.streak-icon.trophy {
  color: #e3b341;
}

.streak-icon.target {
  color: var(--sec-primary, #10b981);
}

.streak-info {
  display: flex;
  flex-direction: column;
}

.streak-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  line-height: 1;
}

.streak-value.sm {
  font-size: 14px;
  font-weight: 600;
}

.streak-label {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  margin-top: 2px;
}

.streak-divider {
  width: 1px;
  height: 28px;
  background: var(--border-color, #333338);
}
</style>
