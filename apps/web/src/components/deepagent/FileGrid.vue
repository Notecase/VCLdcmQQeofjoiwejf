<script setup lang="ts">
/**
 * FileGrid - Card grid of virtual files.
 * Responsive grid layout using auto-fill.
 */
import type { VirtualFile } from '@inkdown/shared/types'
import { FolderOpen } from 'lucide-vue-next'
import FileCard from './FileCard.vue'

defineProps<{
  files: VirtualFile[]
}>()

const emit = defineEmits<{
  select: [file: VirtualFile]
}>()
</script>

<template>
  <div class="file-grid-container">
    <div v-if="files.length > 0" class="file-grid">
      <FileCard
        v-for="file in files"
        :key="file.name"
        :file="file"
        @click="emit('select', file)"
      />
    </div>
    <div v-else class="empty-state">
      <FolderOpen :size="32" class="empty-icon" />
      <span class="empty-text">No files generated yet</span>
    </div>
  </div>
</template>

<style scoped>
.file-grid-container {
  width: 100%;
}

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 20px;
}

.empty-icon {
  color: rgba(139, 148, 158, 0.6);
  opacity: 0.4;
}

.empty-text {
  font-size: 13px;
  color: rgba(139, 148, 158, 0.6);
}
</style>
