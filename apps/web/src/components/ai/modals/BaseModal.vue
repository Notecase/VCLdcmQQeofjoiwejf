<script setup lang="ts">
/**
 * BaseModal - Shared modal wrapper component
 *
 * Provides consistent styling for all recommendation modals:
 * - Glassmorphism background
 * - Close button
 * - Header with icon and title
 * - Content area
 * - Footer with actions
 */
import { onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'

// Props
defineProps<{
  title: string
  subtitle?: string
  size?: 'sm' | 'md' | 'lg'
}>()

// Emits
const emit = defineEmits<{
  close: []
}>()

// Handle escape key
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})

function handleOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="modal-overlay"
      @click="handleOverlayClick"
    >
      <div
        class="modal-container"
        :class="[`size-${size || 'md'}`]"
        role="dialog"
        aria-modal="true"
      >
        <!-- Close button -->
        <button
          aria-label="Close"
          class="close-btn"
          @click="emit('close')"
        >
          <X :size="18" />
        </button>

        <!-- Header -->
        <header class="modal-header">
          <div class="header-content">
            <slot name="icon" />
            <div class="header-text">
              <h2 class="modal-title">{{ title }}</h2>
              <p
                v-if="subtitle"
                class="modal-subtitle"
              >
                {{ subtitle }}
              </p>
            </div>
          </div>
          <slot name="header-right" />
        </header>

        <!-- Content -->
        <div class="modal-content">
          <slot />
        </div>

        <!-- Footer -->
        <footer
          v-if="$slots.footer"
          class="modal-footer"
        >
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.modal-container {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  position: relative;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  animation: scaleIn 0.2s ease-out;
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Size variants */
.size-sm {
  width: 400px;
}

.size-md {
  width: 600px;
}

.size-lg {
  width: 800px;
}

/* Close button */
.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #8b949e;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s;
  z-index: 1;
}

.close-btn:hover {
  background: #21262d;
  color: #e6edf3;
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #21262d;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-content :deep(svg) {
  color: #58a6ff;
  flex-shrink: 0;
}

.header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: #e6edf3;
  margin: 0;
}

.modal-subtitle {
  font-size: 12px;
  color: #8b949e;
  margin: 0;
}

/* Content */
.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* Custom scrollbar */
.modal-content::-webkit-scrollbar {
  width: 6px;
}

.modal-content::-webkit-scrollbar-track {
  background: transparent;
}

.modal-content::-webkit-scrollbar-thumb {
  background: #30363d;
  border-radius: 3px;
}

/* Footer */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid #21262d;
  background: rgba(22, 27, 34, 0.5);
}

/* Responsive */
@media (max-width: 768px) {
  .modal-container {
    width: 95vw !important;
    max-height: 90vh;
    margin: 20px;
  }
}
</style>
