<script setup lang="ts">
/**
 * ArtifactToolbar - Glassmorphic floating toolbar for artifact blocks
 *
 * Appears on hover with Edit, Fullscreen, and Delete buttons.
 * Positioned above the artifact block, centered.
 */

defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  edit: []
  fullscreen: []
  delete: []
}>()
</script>

<template>
  <Transition name="toolbar">
    <div v-if="visible" class="artifact-toolbar">
      <button class="toolbar-btn" title="Edit Code" @click="emit('edit')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>

      <button class="toolbar-btn" title="Fullscreen" @click="emit('fullscreen')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </button>

      <button class="toolbar-btn delete" title="Delete Artifact" @click="emit('delete')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.artifact-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.08),
    0 1px 3px rgba(0, 0, 0, 0.06);
}

/* Dark theme */
:root[data-theme='dark'] .artifact-toolbar,
:root[data-theme='one-dark'] .artifact-toolbar,
:root[data-theme='material-dark'] .artifact-toolbar {
  background: rgba(50, 50, 50, 0.85);
  border-color: rgba(255, 255, 255, 0.1);
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: #555;
  cursor: pointer;
  transition: all 0.15s ease;
}

.toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  color: #333;
}

.toolbar-btn.delete:hover {
  background: rgba(220, 53, 69, 0.1);
  color: #dc3545;
}

/* Dark theme buttons */
:root[data-theme='dark'] .toolbar-btn,
:root[data-theme='one-dark'] .toolbar-btn,
:root[data-theme='material-dark'] .toolbar-btn {
  color: #aaa;
}

:root[data-theme='dark'] .toolbar-btn:hover,
:root[data-theme='one-dark'] .toolbar-btn:hover,
:root[data-theme='material-dark'] .toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

:root[data-theme='dark'] .toolbar-btn.delete:hover,
:root[data-theme='one-dark'] .toolbar-btn.delete:hover,
:root[data-theme='material-dark'] .toolbar-btn.delete:hover {
  background: rgba(220, 53, 69, 0.2);
  color: #ff6b6b;
}

/* Transition */
.toolbar-enter-active,
.toolbar-leave-active {
  transition: all 0.2s ease;
}

.toolbar-enter-from,
.toolbar-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
