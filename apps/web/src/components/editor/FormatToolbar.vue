<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEditorStore, usePreferencesStore } from '@/stores'
import { 
  Bold, Italic, Strikethrough, Code, Link, List, 
  ListOrdered, Quote, Heading1, Heading2, Heading3,
  Table, Image, Minus, CheckSquare
} from 'lucide-vue-next'

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const props = defineProps<{
  muyaInstance: any
}>()

// Format functions
function format(type: string) {
  if (!props.muyaInstance) return
  props.muyaInstance.format(type)
}

function updateParagraph(type: string) {
  if (!props.muyaInstance) return
  props.muyaInstance.updateParagraph(type)
}

function insertTable() {
  if (!props.muyaInstance) return
  // Open table picker via Muya
  props.muyaInstance.tablePicker?.show({ row: 3, column: 3 })
}

function insertImage() {
  if (!props.muyaInstance) return
  props.muyaInstance.imageSelector?.show()
}

function insertHorizontalRule() {
  if (!props.muyaInstance) return
  props.muyaInstance.updateParagraph('hr')
}

function insertTaskList() {
  if (!props.muyaInstance) return
  props.muyaInstance.updateParagraph('task-list')
}

function insertCodeBlock() {
  if (!props.muyaInstance) return
  props.muyaInstance.updateParagraph('pre')
}

function insertMath() {
  if (!props.muyaInstance) return
  props.muyaInstance.updateParagraph('multiplemath')
}

// Toolbar visibility
const isVisible = computed(() => !preferencesStore.hideToolbar)
</script>

<template>
  <div v-if="isVisible" class="format-toolbar">
    <div class="toolbar-group">
      <button 
        class="toolbar-btn" 
        title="Bold (Ctrl+B)"
        @click="format('strong')"
      >
        <Bold :size="16" />
      </button>
      <button 
        class="toolbar-btn" 
        title="Italic (Ctrl+I)"
        @click="format('em')"
      >
        <Italic :size="16" />
      </button>
      <button 
        class="toolbar-btn" 
        title="Strikethrough"
        @click="format('del')"
      >
        <Strikethrough :size="16" />
      </button>
      <button 
        class="toolbar-btn" 
        title="Inline Code"
        @click="format('inline_code')"
      >
        <Code :size="16" />
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button 
        class="toolbar-btn" 
        title="Heading 1"
        @click="updateParagraph('heading 1')"
      >
        <Heading1 :size="16" />
      </button>
      <button 
        class="toolbar-btn" 
        title="Heading 2"
        @click="updateParagraph('heading 2')"
      >
        <Heading2 :size="16" />
      </button>
      <button 
        class="toolbar-btn" 
        title="Heading 3"
        @click="updateParagraph('heading 3')"
      >
        <Heading3 :size="16" />
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button 
        class="toolbar-btn" 
        title="Bullet List"
        @click="updateParagraph('ul-bullet')"
      >
        <List :size="16" />
      </button>
      <button 
        class="toolbar-btn" 
        title="Numbered List"
        @click="updateParagraph('ol-order')"
      >
        <ListOrdered :size="16" />
      </button>
      <button 
        class="toolbar-btn" 
        title="Task List"
        @click="insertTaskList"
      >
        <CheckSquare :size="16" />
      </button>
      <button 
        class="toolbar-btn" 
        title="Quote"
        @click="updateParagraph('blockquote')"
      >
        <Quote :size="16" />
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button 
        class="toolbar-btn" 
        title="Insert Link"
        @click="format('link')"
      >
        <Link :size="16" />
      </button>
      <button 
        class="toolbar-btn" 
        title="Insert Image"
        @click="insertImage"
      >
        <Image :size="16" />
      </button>
      <button 
        class="toolbar-btn" 
        title="Insert Table"
        @click="insertTable"
      >
        <Table :size="16" />
      </button>
      <button 
        class="toolbar-btn" 
        title="Horizontal Rule"
        @click="insertHorizontalRule"
      >
        <Minus :size="16" />
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button 
        class="toolbar-btn" 
        title="Code Block"
        @click="insertCodeBlock"
      >
        <span class="code-block-icon">{}</span>
      </button>
      <button 
        class="toolbar-btn" 
        title="Math Block"
        @click="insertMath"
      >
        <span class="math-icon">∑</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.format-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.15s ease;
}

.toolbar-btn:hover {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.toolbar-btn:active {
  transform: scale(0.95);
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: var(--border-color);
  margin: 0 8px;
}

.code-block-icon,
.math-icon {
  font-size: 14px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
}

.math-icon {
  font-size: 16px;
}
</style>
