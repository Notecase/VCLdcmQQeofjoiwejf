<script setup lang="ts">
/**
 * StreamingCursor - Animated blinking cursor for streaming text
 * Shows a pulsing cursor effect to indicate ongoing text generation
 */
</script>

<template>
  <span class="streaming-cursor" aria-hidden="true" />
</template>

<style scoped>
.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 1.2em;
  background: var(--stream-cursor);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: cursor-blink 1s ease-in-out infinite;
  border-radius: 1px;
}

@keyframes cursor-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
</style>
