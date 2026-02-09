<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, markRaw } from 'vue'
import { Muya } from '@inkdown/muya'

// CSS imports (Vite deduplicates if EditorArea already imported them)
import '@inkdown/muya/assets/styles/index.css'
import 'katex/dist/katex.min.css'
import 'prismjs/themes/prism.css'

const props = withDefaults(
  defineProps<{
    markdown: string
    selectable?: boolean
  }>(),
  {
    selectable: false,
  }
)

const containerRef = ref<HTMLElement>()
const muyaInstance = ref<InstanceType<typeof Muya> | null>(null)

function initializeMuya() {
  if (!containerRef.value) return

  muyaInstance.value = markRaw(
    new Muya(containerRef.value, {
      markdown: props.markdown || '',
      focusMode: false,
      hideQuickInsertHint: true,
      hideLinkPopup: true,
      spellcheckEnabled: false,
      superSubScript: true,
      footnote: true,
      isGitlabCompatibilityEnabled: true,
      disableHtml: false,
      mermaidTheme: 'dark',
      codeBlockLineNumbers: false,
    })
  )

  // Override hardcoded contenteditable="true" from getContainer()
  muyaInstance.value.domNode.setAttribute('contenteditable', 'false')
  muyaInstance.value.domNode.classList.remove('mu-show-quick-insert-hint')
}

watch(
  () => props.markdown,
  (newMd) => {
    if (muyaInstance.value && newMd !== undefined) {
      muyaInstance.value.setContent(newMd || '', false)
      // Re-apply readonly after content replacement
      muyaInstance.value.domNode.setAttribute('contenteditable', 'false')
    }
  }
)

onMounted(() => initializeMuya())

onUnmounted(() => {
  if (muyaInstance.value) {
    try {
      muyaInstance.value.destroy()
    } catch {
      /* ignore cleanup errors */
    }
    muyaInstance.value = null
  }
})
</script>

<template>
  <div class="muya-renderer">
    <div
      ref="containerRef"
      class="muya-renderer-container"
      :class="{ selectable }"
    />
  </div>
</template>

<style scoped>
.muya-renderer-container {
  outline: none;
  cursor: default;
}

/* Hide editing UI artifacts */
.muya-renderer-container :deep(.mu-front-button),
.muya-renderer-container :deep(.mu-front-button-wrapper) {
  display: none !important;
}

/* Hide caret and prevent selection styling */
.muya-renderer-container :deep(.mu-editor) {
  cursor: default !important;
  caret-color: transparent !important;
  padding: 0 !important;
}

/* Make language selector in code blocks non-interactive */
.muya-renderer-container :deep(.mu-language-input) {
  pointer-events: none;
  opacity: 0.5;
}

/* Selectable mode: allow text selection while keeping read-only */
.muya-renderer-container.selectable :deep(.mu-editor) {
  cursor: text !important;
  user-select: text;
}
</style>
