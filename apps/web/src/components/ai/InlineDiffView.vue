<script setup lang="ts">
/**
 * InlineDiffView - Container for hunk-based inline diff visualization
 *
 * Architecture:
 * 1. When activeEdit exists, render diff blocks over the editor
 * 2. Each hunk is an InlineDiffBlock
 * 3. When user clicks +/-, resolve the hunk and collapse
 * 4. When all hunks resolved, apply changes and restore editor
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAIStore } from '@/stores/ai'
import InlineDiffBlock from './InlineDiffBlock.vue'
import DiffActionBar from './DiffActionBar.vue'

const props = defineProps<{
  getMuya: () => any
}>()

const emit = defineEmits<{
  apply: [content: string]
  discard: []
}>()

const aiStore = useAIStore()

// Local state
const isActive = ref(false)
const originalMarkdown = ref('')
const resolvedHunks = ref<Map<string, 'accepted' | 'rejected'>>(new Map())

// Computed
const activeEdit = computed(() => aiStore.activeEdit)
const hunks = computed(() => activeEdit.value?.diffHunks || [])
const pendingHunks = computed(() =>
  hunks.value.filter(h => !resolvedHunks.value.has(h.id))
)
const pendingCount = computed(() => pendingHunks.value.length)
const totalCount = computed(() => hunks.value.length)

// Watch for active edit changes
watch(
  activeEdit,
  (edit) => {
    if (edit && !isActive.value) {
      activateDiffMode(edit)
    } else if (!edit && isActive.value) {
      deactivateDiffMode()
    }
  },
  { immediate: true }
)

// Watch for all hunks resolved
watch(
  pendingCount,
  async (count) => {
    if (count === 0 && isActive.value && totalCount.value > 0) {
      await nextTick()
      applyChanges()
    }
  }
)

function activateDiffMode(edit: NonNullable<typeof activeEdit.value>) {
  const muya = props.getMuya()
  if (!muya) return

  originalMarkdown.value = edit.originalContent
  resolvedHunks.value = new Map()
  isActive.value = true
}

function deactivateDiffMode() {
  isActive.value = false
  resolvedHunks.value = new Map()
  originalMarkdown.value = ''
}

function handleAcceptHunk(hunkId: string) {
  resolvedHunks.value.set(hunkId, 'accepted')
  if (activeEdit.value) {
    aiStore.acceptHunk(activeEdit.value.id, hunkId)
  }
}

function handleRejectHunk(hunkId: string) {
  resolvedHunks.value.set(hunkId, 'rejected')
  if (activeEdit.value) {
    aiStore.rejectHunk(activeEdit.value.id, hunkId)
  }
}

function handleAcceptAll() {
  pendingHunks.value.forEach(hunk => {
    handleAcceptHunk(hunk.id)
  })
}

function handleRejectAll() {
  pendingHunks.value.forEach(hunk => {
    handleRejectHunk(hunk.id)
  })
}

function applyChanges() {
  if (!activeEdit.value) return

  const finalContent = aiStore.applyAcceptedHunks(activeEdit.value.id)

  if (finalContent !== null) {
    emit('apply', finalContent)
  }

  aiStore.setActiveEdit(null)
}

function isHunkPending(hunkId: string): boolean {
  return !resolvedHunks.value.has(hunkId)
}

onMounted(() => {
  if (activeEdit.value && !isActive.value) {
    activateDiffMode(activeEdit.value)
  }
})

onUnmounted(() => {
  if (isActive.value) {
    deactivateDiffMode()
  }
})
</script>

<template>
  <div v-if="isActive && activeEdit" class="inline-diff-view">
    <div class="diff-blocks-container">
      <div class="diff-header">
        <span class="diff-title">AI Suggested Changes</span>
        <span class="diff-stats">
          <span class="stat additions">+{{ hunks.filter(h => h.type !== 'remove').length }}</span>
          <span class="stat deletions">-{{ hunks.filter(h => h.type !== 'add').length }}</span>
        </span>
      </div>

      <template v-for="hunk in hunks" :key="hunk.id">
        <InlineDiffBlock
          v-if="isHunkPending(hunk.id)"
          :hunk="hunk"
          :edit-id="activeEdit.id"
          @accept="handleAcceptHunk"
          @reject="handleRejectHunk"
        />
      </template>

      <div v-if="pendingCount === 0 && totalCount > 0" class="all-resolved">
        Applying changes...
      </div>
    </div>

    <DiffActionBar
      :pending-count="pendingCount"
      :total-count="totalCount"
      @accept-all="handleAcceptAll"
      @reject-all="handleRejectAll"
    />
  </div>
</template>

<style scoped>
.inline-diff-view {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--editor-bg, #0d1117);
  z-index: 50;
  overflow-y: auto;
  padding: 20px;
}

.diff-blocks-container {
  max-width: 800px;
  margin: 0 auto;
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #30363d);
}

.diff-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e6edf3);
}

.diff-stats {
  display: flex;
  gap: 8px;
}

.stat {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
}

.stat.additions {
  color: #3fb950;
  background: rgba(46, 160, 67, 0.15);
}

.stat.deletions {
  color: #f85149;
  background: rgba(248, 81, 73, 0.15);
}

.all-resolved {
  text-align: center;
  padding: 40px;
  color: var(--text-color-secondary, #8b949e);
  font-size: 14px;
}
</style>
