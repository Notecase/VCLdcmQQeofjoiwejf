<script setup lang="ts">
/**
 * StreamingCursor - Animated blinking cursor for streaming text
 * Shows a pulsing cursor effect to indicate ongoing text generation
 */
</script>

<template>
  <span
    class="streaming-cursor"
    aria-hidden="true"
  />
</template>

<style scoped>
.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 1.2em;
  background: var(--stream-cursor);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: cursor-pulse 1.2s ease-in-out infinite;
  border-radius: 1px;
  box-shadow:
    0 0 8px var(--stream-pulse, rgba(255, 255, 255, 0.3)),
    0 0 16px rgba(255, 255, 255, 0.1);
}

@keyframes cursor-pulse {
  0%,
  100% {
    opacity: 1;
    box-shadow:
      0 0 8px var(--stream-pulse, rgba(255, 255, 255, 0.3)),
      0 0 16px rgba(255, 255, 255, 0.1);
  }
  50% {
    opacity: 0.4;
    box-shadow:
      0 0 4px var(--stream-pulse, rgba(255, 255, 255, 0.15)),
      0 0 8px rgba(255, 255, 255, 0.05);
  }
}
</style>
