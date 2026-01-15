<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useEditorStore, usePreferencesStore } from '@/stores'
import SideBar from '@/components/layout/SideBar.vue'
import TitleBar from '@/components/layout/TitleBar.vue'
import EditorArea from '@/components/editor/EditorArea.vue'
import FormatToolbar from '@/components/editor/FormatToolbar.vue'

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const isReady = ref(false)
const editorAreaRef = ref<InstanceType<typeof EditorArea>>()

// Get Muya instance from EditorArea
const muyaInstance = computed(() => {
  return editorAreaRef.value?.getMuya?.()
})

onMounted(async () => {
  await editorStore.loadDocuments()
  
  // If no documents, create a welcome doc
  if (editorStore.documents.length === 0) {
    await editorStore.createDocument('Welcome to MarkText')
  } else if (editorStore.documents[0]) {
    // Open the most recent document
    editorStore.openDocument(editorStore.documents[0])
  }
  
  isReady.value = true
})
</script>

<template>
  <div class="editor-view">
    <SideBar v-if="isReady" />
    <div class="editor-main">
      <TitleBar />
      <FormatToolbar 
        v-if="isReady && editorStore.currentDocument" 
        :muya-instance="muyaInstance" 
      />
      <EditorArea 
        v-if="isReady && editorStore.currentDocument" 
        ref="editorAreaRef"
      />
      <div v-else-if="!isReady" class="loading-state">
        <el-icon class="is-loading" :size="32">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="32" stroke-linecap="round" /></svg>
        </el-icon>
        <p>Loading...</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-view {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.editor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--editor-bg);
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-color-secondary);
}

.is-loading {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
