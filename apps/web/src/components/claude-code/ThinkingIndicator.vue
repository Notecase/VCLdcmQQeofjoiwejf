<script setup lang="ts">
/**
 * ThinkingIndicator — animated pulse shown while Claude is reasoning.
 */
defineProps<{
  text?: string
}>()
</script>

<template>
  <div class="thinking-indicator">
    <div class="thinking-dots">
      <span class="dot" />
      <span class="dot" />
      <span class="dot" />
    </div>
    <span
      v-if="text"
      class="thinking-text"
      >{{ text }}</span
    >
    <span
      v-else
      class="thinking-text"
      >Thinking...</span
    >
  </div>
</template>

<style scoped>
.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  color: var(--text-secondary, #8b8b8b);
  font-size: 12px;
}

.thinking-dots {
  display: flex;
  gap: 3px;
}

.dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text-secondary, #8b8b8b);
  animation: think-pulse 1.4s ease-in-out infinite;
}

.dot:nth-child(2) {
  animation-delay: 0.2s;
}

.dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes think-pulse {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(1);
  }
  40% {
    opacity: 1;
    transform: scale(1.3);
  }
}

.thinking-text {
  font-style: italic;
}
</style>
