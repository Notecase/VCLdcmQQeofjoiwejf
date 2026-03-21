<script setup lang="ts">
import { useSoul } from '@/composables/useSoul'

const { soulContent, soulLoading, soulSaving, debouncedSave } = useSoul()

function onInput(event: Event) {
  soulContent.value = (event.target as HTMLTextAreaElement).value
  debouncedSave()
}
</script>

<template>
  <div class="soul-editor">
    <div class="soul-header">
      <h3>About Me</h3>
      <span
        v-if="soulSaving"
        class="save-indicator"
      >Saving...</span>
      <span
        v-else
        class="save-indicator saved"
      >Saved</span>
    </div>
    <p class="soul-hint">
      Write your goals, learning style, and preferences. All AI agents will use this to personalize their responses.
    </p>
    <textarea
      v-if="!soulLoading"
      :value="soulContent"
      class="soul-textarea"
      placeholder="Example:&#10;I'm learning Rust and distributed systems.&#10;I prefer concise explanations with code examples.&#10;I have 2 hours per day for studying, mostly evenings."
      @input="onInput"
    />
    <div
      v-else
      class="soul-loading"
    >
      Loading...
    </div>
  </div>
</template>

<style scoped>
.soul-editor {
  padding: 12px 0;
}

.soul-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.soul-header h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.save-indicator {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
}

.save-indicator.saved {
  color: var(--success-color, #4ade80);
}

.soul-hint {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0 0 8px;
  line-height: 1.4;
}

.soul-textarea {
  width: 100%;
  min-height: 120px;
  padding: 10px;
  border: 1px solid var(--border-color, #333338);
  border-radius: 6px;
  background: var(--input-bg, #0d1117);
  color: var(--text-color, #e2e8f0);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
}

.soul-textarea:focus {
  border-color: var(--primary-color, #6366f1);
}

.soul-textarea::placeholder {
  color: var(--text-color-tertiary, #64748b);
}

.soul-loading {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  padding: 20px 0;
}
</style>
