<script setup lang="ts">
/**
 * PlanCreationForm — Step 1 of the plan creation wizard.
 * Collects plan name, date range, hours per day, and active days.
 */
import { ref, computed } from 'vue'

export interface PlanFormData {
  name: string
  startDate: string
  endDate: string
  hoursPerDay: number
  activeDays: string[]
}

const emit = defineEmits<{
  submit: [data: PlanFormData]
}>()

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const name = ref('')
const startDate = ref(todayISO())
const endDate = ref(weekFromNowISO())
const hoursPerDay = ref(2)
const activeDays = ref<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function weekFromNowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().split('T')[0]
}

function toggleDay(day: string) {
  const idx = activeDays.value.indexOf(day)
  if (idx >= 0) {
    activeDays.value.splice(idx, 1)
  } else {
    activeDays.value.push(day)
  }
}

const isValid = computed(() => {
  return (
    name.value.trim().length > 0 &&
    startDate.value &&
    endDate.value &&
    startDate.value <= endDate.value &&
    hoursPerDay.value >= 0.5 &&
    hoursPerDay.value <= 8 &&
    activeDays.value.length > 0
  )
})

function handleSubmit() {
  if (!isValid.value) return
  emit('submit', {
    name: name.value.trim(),
    startDate: startDate.value,
    endDate: endDate.value,
    hoursPerDay: hoursPerDay.value,
    activeDays: [...activeDays.value],
  })
}
</script>

<template>
  <form
    class="plan-form"
    @submit.prevent="handleSubmit"
  >
    <!-- Plan name -->
    <div class="field">
      <label class="field-label">Plan name</label>
      <input
        v-model="name"
        type="text"
        class="field-input"
        placeholder="e.g. Learn React, Master Python..."
        autofocus
      />
    </div>

    <!-- Date range -->
    <div class="field-row">
      <div class="field field-half">
        <label class="field-label">Start date</label>
        <input
          v-model="startDate"
          type="date"
          class="field-input"
        />
      </div>
      <div class="field field-half">
        <label class="field-label">End date</label>
        <input
          v-model="endDate"
          type="date"
          class="field-input"
        />
      </div>
    </div>

    <!-- Hours per day -->
    <div class="field">
      <label class="field-label">Hours per day</label>
      <div class="hours-control">
        <button
          type="button"
          class="hours-btn"
          :disabled="hoursPerDay <= 0.5"
          @click="hoursPerDay = Math.max(0.5, hoursPerDay - 0.5)"
        >
          &minus;
        </button>
        <span class="hours-value">{{ hoursPerDay }}h</span>
        <button
          type="button"
          class="hours-btn"
          :disabled="hoursPerDay >= 8"
          @click="hoursPerDay = Math.min(8, hoursPerDay + 0.5)"
        >
          +
        </button>
      </div>
    </div>

    <!-- Active days -->
    <div class="field">
      <label class="field-label">Active days</label>
      <div class="days-row">
        <button
          v-for="day in DAYS"
          :key="day"
          type="button"
          class="day-toggle"
          :class="{ active: activeDays.includes(day) }"
          @click="toggleDay(day)"
        >
          {{ day }}
        </button>
      </div>
    </div>

    <!-- Submit -->
    <button
      type="submit"
      class="next-btn"
      :disabled="!isValid"
    >
      Next
    </button>
  </form>
</template>

<style scoped>
.plan-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color-secondary, #94a3b8);
  letter-spacing: 0.01em;
}

.field-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--sec-radius-sm, 8px);
  background: var(--sec-surface-card, rgba(255, 255, 255, 0.03));
  color: var(--text-color, #e2e8f0);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition:
    border-color var(--sec-transition-fast, 180ms) ease,
    background var(--sec-transition-fast, 180ms) ease;
}

.field-input:focus {
  border-color: var(--sec-primary-border, rgba(16, 185, 129, 0.3));
  background: rgba(255, 255, 255, 0.05);
}

.field-input::placeholder {
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.5;
}

/* Date inputs - fix native styling in dark mode */
.field-input[type='date'] {
  color-scheme: dark;
}

.field-row {
  display: flex;
  gap: 16px;
}

.field-half {
  flex: 1;
}

/* Hours control */
.hours-control {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 12px;
  border: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--sec-radius-sm, 8px);
  background: var(--sec-surface-card, rgba(255, 255, 255, 0.03));
  width: fit-content;
}

.hours-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--sec-radius-sm, 8px);
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 16px;
  cursor: pointer;
  transition: all var(--sec-transition-fast, 180ms) ease;
}

.hours-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--sec-glass-border-hover, rgba(255, 255, 255, 0.14));
}

.hours-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.hours-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  min-width: 36px;
  text-align: center;
}

/* Day toggles */
.days-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.day-toggle {
  padding: 8px 14px;
  border: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--sec-radius-pill, 999px);
  background: var(--sec-surface-card, rgba(255, 255, 255, 0.03));
  color: var(--text-color-secondary, #94a3b8);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--sec-transition-fast, 180ms) ease;
  user-select: none;
}

.day-toggle:hover {
  border-color: var(--sec-glass-border-hover, rgba(255, 255, 255, 0.14));
  background: rgba(255, 255, 255, 0.05);
}

.day-toggle.active {
  border-color: var(--sec-primary-border, rgba(16, 185, 129, 0.3));
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary-light, #34d399);
}

/* Next button */
.next-btn {
  align-self: flex-end;
  padding: 10px 28px;
  border: none;
  border-radius: var(--sec-radius-sm, 8px);
  background: var(--sec-primary, #10b981);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--sec-transition-fast, 180ms) ease;
}

.next-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.next-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
