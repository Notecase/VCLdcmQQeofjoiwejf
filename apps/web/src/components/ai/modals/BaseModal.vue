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
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(var(--modal-overlay-blur)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--modal-overlay-blur)) saturate(150%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: overlayFadeIn 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes overlayFadeIn {
  from {
    opacity: 0;
    backdrop-filter: blur(0);
    -webkit-backdrop-filter: blur(0);
  }
  to {
    opacity: 1;
    backdrop-filter: blur(var(--modal-overlay-blur));
    -webkit-backdrop-filter: blur(var(--modal-overlay-blur));
  }
}

.modal-container {
  background: var(--modal-bg);
  backdrop-filter: blur(var(--modal-backdrop-blur)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--modal-backdrop-blur)) saturate(180%);
  border: 1px solid var(--modal-border);
  border-radius: var(--modal-radius);
  box-shadow:
    var(--modal-shadow),
    inset 0 1px 0 var(--modal-inset-highlight);
  position: relative;
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  animation: modalEnter 0.4s cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes modalEnter {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Size variants - Bigger */
.size-sm {
  width: 480px;
}

.size-md {
  width: 720px;
}

.size-lg {
  width: 960px;
}

/* Close button - Refined */
.close-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--modal-btn-secondary-bg);
  border: none;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 50%;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1;
}

.close-btn:hover {
  background: var(--modal-btn-secondary-hover);
  color: var(--text-color);
}

/* Header - No Border */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 28px 16px;
  background: transparent;
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
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-color);
  margin: 0;
}

.modal-subtitle {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin: 0;
}

/* Content */
.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 28px 28px;
  scroll-behavior: smooth;
}

/* Custom scrollbar */
.modal-content::-webkit-scrollbar {
  width: 6px;
}

.modal-content::-webkit-scrollbar-track {
  background: transparent;
}

.modal-content::-webkit-scrollbar-thumb {
  background: var(--modal-border);
  border-radius: 3px;
}

.modal-content::-webkit-scrollbar-thumb:hover {
  background: var(--modal-btn-secondary-hover);
}

/* Footer - No Border, Subtle BG */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 28px 20px;
  background: var(--modal-card-bg);
  border-radius: 0 0 var(--modal-radius) var(--modal-radius);
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
