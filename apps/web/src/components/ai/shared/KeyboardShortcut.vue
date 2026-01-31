<script setup lang="ts">
/**
 * KeyboardShortcut - Platform-aware keyboard shortcut display
 * Automatically shows Cmd on Mac and Ctrl on Windows/Linux
 */
import { computed } from 'vue'

const props = defineProps<{
  keys: string
}>()

const isMac = computed(() => {
  if (typeof navigator !== 'undefined') {
    return navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac')
  }
  return false
})

const displayKeys = computed(() => {
  let keys = props.keys
  // Replace platform-specific modifiers
  if (isMac.value) {
    keys = keys.replace(/Cmd|Meta/gi, '\u2318') // ⌘
    keys = keys.replace(/Alt|Option/gi, '\u2325') // ⌥
    keys = keys.replace(/Shift/gi, '\u21E7') // ⇧
    keys = keys.replace(/Ctrl|Control/gi, '\u2303') // ⌃
  } else {
    keys = keys.replace(/Cmd|Meta|\u2318/gi, 'Ctrl')
    keys = keys.replace(/Alt|Option|\u2325/gi, 'Alt')
    keys = keys.replace(/\u21E7/gi, 'Shift')
    keys = keys.replace(/\u2303/gi, 'Ctrl')
  }
  // Handle special keys
  keys = keys.replace(/Enter|\u21B5/gi, '\u21B5') // ↵
  keys = keys.replace(/Backspace|Delete/gi, '\u232B') // ⌫
  keys = keys.replace(/Escape|Esc/gi, 'Esc')
  keys = keys.replace(/Tab/gi, '\u21E5') // ⇥

  return keys
})
</script>

<template>
  <kbd class="keyboard-shortcut">{{ displayKeys }}</kbd>
</template>

<style scoped>
.keyboard-shortcut {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  white-space: nowrap;
}
</style>
