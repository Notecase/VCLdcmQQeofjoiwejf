<script setup lang="ts">
/**
 * StreamingCodePreview - Terminal Pulse Design
 *
 * Features:
 * - Shows real-time code generation during artifact streaming
 * - Phase indicators (HTML, CSS, JavaScript)
 * - Progress dots showing current phase
 * - Code preview area with blinking cursor
 * - Scanline animation for "active generation" feel
 */
import { computed } from 'vue'
import { Zap } from 'lucide-vue-next'

const props = defineProps<{
  phase: 'html' | 'css' | 'javascript'
  preview: string
  totalChars: number
}>()

// Phase label mapping
const phaseLabel = computed(() => {
  switch (props.phase) {
    case 'html':
      return 'GENERATING HTML'
    case 'css':
      return 'ADDING STYLES'
    case 'javascript':
      return 'ADDING INTERACTIVITY'
    default:
      return 'GENERATING'
  }
})

// Truncate preview to fit in the display area
const displayPreview = computed(() => {
  const lines = props.preview.split('\n').slice(-3)
  return lines.join('\n').slice(-100)
})
</script>

<template>
  <div
    class="code-preview"
    :class="phase"
  >
    <!-- Scanline effect -->
    <div class="scanline" />

    <!-- Header: 24px -->
    <div class="preview-header">
      <div class="phase-indicator">
        <Zap
          :size="10"
          class="phase-icon"
        />
        <span class="phase-label">{{ phaseLabel }}</span>
        <span class="char-count">{{ totalChars }} chars</span>
      </div>
      <div class="progress-dots">
        <span
          class="dot"
          :class="{ active: phase === 'html', complete: phase !== 'html' }"
        />
        <span
          class="dot"
          :class="{ active: phase === 'css', complete: phase === 'javascript' }"
        />
        <span
          class="dot"
          :class="{ active: phase === 'javascript' }"
        />
      </div>
    </div>

    <!-- Code area: 48px -->
    <div class="preview-code">
      <pre>{{ displayPreview }}<span class="cursor">▌</span></pre>
    </div>
  </div>
</template>

<style scoped>
.code-preview {
  position: relative;
  height: 72px;
  background: var(--tool-card-bg);
  border: 1px solid var(--tool-running-border);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 0 0 1px var(--tool-running-glow);
}

/* Phase-specific accent colors */
.code-preview.html {
  --phase-color: #22d3ee; /* Cyan - 'analyze' type */
}

.code-preview.css {
  --phase-color: #f472b6; /* Pink - 'create' type */
}

.code-preview.javascript {
  --phase-color: #fbbf24; /* Amber - 'write' type */
}

/* Header */
.preview-header {
  height: 24px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
}

.phase-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.phase-icon {
  color: var(--phase-color);
  animation: pulse-icon 1.5s ease-in-out infinite;
}

@keyframes pulse-icon {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.phase-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--phase-color);
}

.char-count {
  font-size: 9px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: var(--text-muted, #8b949e);
  margin-left: 4px;
}

/* Progress dots */
.progress-dots {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted, #8b949e);
  opacity: 0.3;
  transition: all 0.3s ease;
}

.dot.active {
  background: var(--phase-color);
  opacity: 1;
  box-shadow: 0 0 6px var(--phase-color);
}

.dot.complete {
  background: var(--role-assistant-color, #3fb950);
  opacity: 0.8;
}

/* Code preview area */
.preview-code {
  height: 48px;
  padding: 8px 12px;
  overflow: hidden;
}

.preview-code pre {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  line-height: 1.4;
  color: var(--text-secondary, #94a3b8);
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

/* Blinking cursor */
.cursor {
  color: var(--phase-color);
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

/* Scanline effect for "active generation" feel */
.scanline {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--phase-color), transparent);
  animation: scanline 2s linear infinite;
  pointer-events: none;
  z-index: 1;
}

@keyframes scanline {
  0% {
    transform: translateY(0);
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
  100% {
    transform: translateY(70px);
    opacity: 0.5;
  }
}
</style>
