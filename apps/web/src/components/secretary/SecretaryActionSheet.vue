<script setup lang="ts">
import { computed } from 'vue'
import type { TaskArtifactLink } from '@inkdown/shared/types'
import { X } from 'lucide-vue-next'

interface SheetAction {
  id: string
  label: string
  description: string
  tone?: 'primary' | 'neutral' | 'danger'
}

const props = defineProps<{
  open: boolean
  title: string
  subtitle?: string
  label?: string
  artifacts?: TaskArtifactLink[]
  primaryActions: SheetAction[]
  secondaryActions?: SheetAction[]
}>()

const emit = defineEmits<{
  close: []
  action: [actionId: string]
}>()

const hasSecondaryActions = computed(() => (props.secondaryActions || []).length > 0)

function actionClass(tone?: SheetAction['tone']) {
  if (tone === 'primary') return 'action-card primary'
  if (tone === 'danger') return 'action-card danger'
  return 'action-card'
}
</script>

<template>
  <Teleport to="body">
    <transition name="sheet-fade">
      <div
        v-if="open"
        class="sheet-overlay"
        @click.self="emit('close')"
      >
        <aside class="sheet-panel">
          <div class="sheet-header">
            <div>
              <span
                v-if="label"
                class="sheet-label"
                >{{ label }}</span
              >
              <h3>{{ title }}</h3>
              <p v-if="subtitle">
                {{ subtitle }}
              </p>
            </div>
            <button
              class="close-btn"
              @click="emit('close')"
            >
              <X :size="16" />
            </button>
          </div>

          <div
            v-if="artifacts && artifacts.length > 0"
            class="artifact-strip"
          >
            <a
              v-for="artifact in artifacts"
              :key="artifact.id"
              class="artifact-pill"
              :class="artifact.status"
              :href="artifact.href || undefined"
              @click.stop
            >
              {{ artifact.label }}
            </a>
          </div>

          <section class="sheet-section">
            <span class="section-kicker">Quick actions</span>
            <div class="action-grid">
              <button
                v-for="action in primaryActions"
                :key="action.id"
                :class="actionClass(action.tone)"
                @click="emit('action', action.id)"
              >
                <strong>{{ action.label }}</strong>
                <span>{{ action.description }}</span>
              </button>
            </div>
          </section>

          <section
            v-if="hasSecondaryActions"
            class="sheet-section"
          >
            <span class="section-kicker">More</span>
            <div class="action-grid secondary">
              <button
                v-for="action in secondaryActions"
                :key="action.id"
                :class="actionClass(action.tone)"
                @click="emit('action', action.id)"
              >
                <strong>{{ action.label }}</strong>
                <span>{{ action.description }}</span>
              </button>
            </div>
          </section>
        </aside>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  background:
    radial-gradient(circle at top, rgba(16, 185, 129, 0.08), transparent 34%), rgba(1, 4, 9, 0.68);
  backdrop-filter: blur(10px);
  display: flex;
  justify-content: flex-end;
  padding: 20px;
}

.sheet-panel {
  width: min(420px, 100%);
  height: 100%;
  border-radius: var(--sec-radius-lg);
  border: 1px solid var(--sec-glass-border);
  background: var(--sec-surface-2);
  backdrop-filter: blur(var(--sec-glass-blur-heavy));
  -webkit-backdrop-filter: blur(var(--sec-glass-blur-heavy));
  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 var(--sec-glass-inset);
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.sheet-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.sheet-label,
.section-kicker {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: var(--sec-radius-pill);
  border: 1px solid var(--sec-glass-border);
  background: var(--sec-surface-card);
  color: var(--text-color-secondary, #94a3b8);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sheet-header h3 {
  margin: 10px 0 6px;
  color: var(--text-color, #e2e8f0);
  font-size: 24px;
  line-height: 1.1;
}

.sheet-header p {
  margin: 0;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 13px;
  line-height: 1.5;
}

.close-btn {
  width: 36px;
  height: 36px;
  border-radius: var(--sec-radius-pill);
  border: 1px solid var(--sec-glass-border);
  background: var(--sec-surface-card);
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
}

.artifact-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.artifact-pill {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: var(--sec-radius-pill);
  text-decoration: none;
  border: 1px solid var(--sec-glass-border);
  background: var(--sec-surface-card);
  color: var(--text-color, #e2e8f0);
  font-size: 12px;
  font-weight: 600;
  transition:
    background var(--sec-transition-normal) ease,
    border-color var(--sec-transition-normal) ease,
    color var(--sec-transition-normal) ease;
}

.artifact-pill.pending {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.12);
  color: #f7c161;
}

.artifact-pill.ready {
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.16);
  color: #aaf2d2;
}

.artifact-pill.blocked {
  border-color: rgba(248, 81, 73, 0.35);
  background: rgba(248, 81, 73, 0.12);
  color: #ffb1ab;
}

.sheet-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.action-grid.secondary {
  grid-template-columns: 1fr;
}

.action-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
  padding: 16px;
  border-radius: var(--sec-radius-lg);
  border: 1px solid var(--sec-glass-border);
  background: var(--sec-surface-card);
  color: var(--text-color, #e2e8f0);
  cursor: pointer;
  transition:
    transform var(--sec-transition-fast) var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)),
    border-color var(--sec-transition-fast) ease,
    background var(--sec-transition-fast) ease;
}

.action-card strong {
  font-size: 14px;
  font-weight: 600;
}

.action-card span {
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
  line-height: 1.45;
}

.action-card:hover {
  transform: translateY(-2px);
  border-color: var(--sec-glass-border-hover);
  background: var(--sec-surface-card-hover);
}

.action-card.primary {
  border-color: rgba(16, 185, 129, 0.22);
  background:
    linear-gradient(180deg, rgba(16, 185, 129, 0.12), rgba(16, 185, 129, 0.05)),
    rgba(255, 255, 255, 0.02);
}

.action-card.danger {
  border-color: rgba(248, 81, 73, 0.2);
}

.sheet-fade-enter-active {
  transition:
    opacity var(--sec-transition-slow) ease,
    transform var(--sec-transition-slow) var(--sec-ease-decel);
}

.sheet-fade-leave-active {
  transition:
    opacity var(--sec-transition-normal) ease,
    transform var(--sec-transition-normal) ease;
}

.sheet-fade-enter-from {
  opacity: 0;
  transform: translateX(40px);
}

.sheet-fade-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

@media (max-width: 900px) {
  .sheet-overlay {
    align-items: flex-end;
    justify-content: stretch;
    padding: 12px;
  }

  .sheet-panel {
    width: 100%;
    height: auto;
    max-height: calc(100vh - 24px);
    border-radius: var(--sec-radius-lg) var(--sec-radius-lg) var(--sec-radius-md)
      var(--sec-radius-md);
    overflow: auto;
  }

  .action-grid {
    grid-template-columns: 1fr;
  }
}
</style>
