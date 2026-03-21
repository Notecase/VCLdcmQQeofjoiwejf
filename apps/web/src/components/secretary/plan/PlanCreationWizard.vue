<script setup lang="ts">
/**
 * PlanCreationWizard — 2-step wizard for creating a learning plan.
 * Step 1: Form (name, dates, hours, active days)
 * Step 2: AI chat to collaboratively build a roadmap
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import PlanCreationForm from './PlanCreationForm.vue'
import PlanCreationChat from './PlanCreationChat.vue'
import type { PlanFormData } from './PlanCreationForm.vue'
import { ArrowLeft } from 'lucide-vue-next'

const router = useRouter()

const currentStep = ref(1)
const formData = ref<PlanFormData | null>(null)

function handleFormSubmit(data: PlanFormData) {
  formData.value = data
  currentStep.value = 2
}

function goBack() {
  if (currentStep.value === 2) {
    currentStep.value = 1
  } else {
    router.push('/calendar')
  }
}
</script>

<template>
  <div class="wizard">
    <!-- Header -->
    <div class="wizard-header">
      <button
        class="back-btn"
        @click="goBack"
      >
        <ArrowLeft :size="16" />
        <span>{{ currentStep === 2 ? 'Back' : 'Calendar' }}</span>
      </button>

      <div class="step-indicator">
        <span
          class="step-dot"
          :class="{ active: currentStep === 1, completed: currentStep > 1 }"
        />
        <span class="step-line" />
        <span
          class="step-dot"
          :class="{ active: currentStep === 2 }"
        />
      </div>

      <span class="step-label">Step {{ currentStep }} of 2</span>
    </div>

    <!-- Title -->
    <div class="wizard-title-area">
      <h1 class="wizard-title">
        {{ currentStep === 1 ? 'Create a new plan' : 'Build your roadmap' }}
      </h1>
      <p class="wizard-subtitle">
        {{
          currentStep === 1
            ? 'Set up the basics for your learning plan.'
            : 'Chat with AI to design your personalized roadmap.'
        }}
      </p>
    </div>

    <!-- Step content -->
    <div class="wizard-body">
      <PlanCreationForm
        v-if="currentStep === 1"
        @submit="handleFormSubmit"
      />

      <PlanCreationChat
        v-else-if="currentStep === 2 && formData"
        :form-data="formData"
      />
    </div>
  </div>
</template>

<style scoped>
.wizard {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* Header */
.wizard-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 20px;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--sec-radius-sm, 8px);
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--sec-transition-fast, 180ms) ease;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--sec-glass-border-hover, rgba(255, 255, 255, 0.14));
}

.step-indicator {
  display: flex;
  align-items: center;
  gap: 0;
  margin-left: auto;
}

.step-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--sec-glass-border, rgba(255, 255, 255, 0.08));
  background: transparent;
  transition: all var(--sec-transition-fast, 180ms) ease;
}

.step-dot.active {
  border-color: var(--sec-primary, #10b981);
  background: var(--sec-primary, #10b981);
}

.step-dot.completed {
  border-color: var(--sec-primary, #10b981);
  background: var(--sec-primary, #10b981);
}

.step-line {
  width: 32px;
  height: 2px;
  background: var(--sec-glass-border, rgba(255, 255, 255, 0.08));
}

.step-label {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  white-space: nowrap;
}

/* Title area */
.wizard-title-area {
  padding-bottom: 28px;
  border-bottom: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.08));
  margin-bottom: 28px;
}

.wizard-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0 0 6px;
}

.wizard-subtitle {
  font-size: 14px;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0;
}

/* Body */
.wizard-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
</style>
