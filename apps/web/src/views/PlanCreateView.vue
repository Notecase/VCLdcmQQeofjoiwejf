<script setup lang="ts">
/**
 * PlanCreateView — Thin wrapper view for the Plan Creation Wizard.
 * Same layout style as PlanWorkspaceView.
 */
import PlanCreationWizard from '@/components/secretary/plan/PlanCreationWizard.vue'
</script>

<template>
  <div class="plan-create-view">
    <div class="create-content">
      <PlanCreationWizard />
    </div>
  </div>
</template>

<style scoped>
.plan-create-view {
  height: 100vh;
  padding: 40px 24px 80px;
  background: var(--app-bg, #010409);
  display: flex;
  justify-content: center;
  overflow-y: auto;
}

.create-content {
  width: 100%;
  max-width: var(--pw-max-width, 800px);
  display: flex;
  flex-direction: column;
}

@media (max-width: 600px) {
  .plan-create-view {
    padding: 20px 16px 60px;
  }
}
</style>
