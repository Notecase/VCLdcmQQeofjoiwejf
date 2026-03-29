<script setup lang="ts">
/**
 * MindmapModal - Interactive mindmap viewer
 *
 * Displays a tree-structured mindmap with:
 * - Central topic node
 * - Branch nodes
 * - Connector lines
 */
import { computed, ref } from 'vue'
import { useRecommendationsStore, type Mindmap, type MindmapNode } from '@/stores/recommendations'
import { Brain, Copy, Plus, Check } from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import { renderMathContent } from '@/utils/mathRenderer'

// Store
const store = useRecommendationsStore()

// Copy state
const copied = ref(false)

// Emits
const emit = defineEmits<{
  close: []
  addToNote: [content: string]
}>()

// Computed
const mindmap = computed<Mindmap | null>(() => store.currentRecommendations?.mindmap || null)

// Convert mindmap to markdown
function toMarkdown(): string {
  if (!mindmap.value) return ''

  const lines: string[] = []
  lines.push(`# ${mindmap.value.center}`)
  lines.push('')

  function renderNode(node: MindmapNode, depth: number) {
    const indent = '  '.repeat(depth)
    const bullet = depth === 0 ? '##' : '-'
    lines.push(`${indent}${bullet} ${node.label}`)

    if (node.children?.length) {
      for (const child of node.children) {
        renderNode(child, depth + 1)
      }
    }
  }

  for (const node of mindmap.value.nodes) {
    renderNode(node, 0)
  }

  return lines.join('\n')
}

async function copyToClipboard() {
  const md = toMarkdown()
  try {
    await navigator.clipboard.writeText(md)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    console.error('Failed to copy:', error)
  }
}

function addToNote() {
  emit('addToNote', toMarkdown())
  emit('close')
}

// Render node tree recursively
function getBranchColor(index: number): string {
  const colors = [
    '#58a6ff',
    'var(--sec-primary-light, #3fb950)',
    '#a371f7',
    '#f78166',
    'var(--sec-accent-dark, #d29922)',
  ]
  return colors[index % colors.length]
}

// Render content with math support
function renderContent(text: string | undefined): string {
  return renderMathContent(text || '')
}
</script>

<template>
  <BaseModal
    title="Mind Map"
    :subtitle="mindmap?.center"
    size="lg"
    @close="emit('close')"
  >
    <template #icon>
      <Brain :size="20" />
    </template>

    <template #header-right>
      <button
        :title="copied ? 'Copied!' : 'Copy as Markdown'"
        class="copy-btn"
        :class="{ copied }"
        @click="copyToClipboard"
      >
        <Check
          v-if="copied"
          :size="16"
        />
        <Copy
          v-else
          :size="16"
        />
      </button>
    </template>

    <div
      v-if="mindmap"
      class="mindmap-container"
    >
      <!-- Central Node -->
      <div
        class="central-node math-content"
        v-html="renderContent(mindmap.center)"
      ></div>

      <!-- Branches -->
      <div class="branches-container">
        <div
          v-for="(node, index) in mindmap.nodes"
          :key="node.id"
          class="branch"
          :style="{ '--branch-color': getBranchColor(index) }"
        >
          <div
            class="branch-node math-content"
            v-html="renderContent(node.label)"
          ></div>

          <!-- Children -->
          <div
            v-if="node.children?.length"
            class="children"
          >
            <div
              v-for="child in node.children"
              :key="child.id"
              class="child-node"
            >
              <span class="connector"></span>
              <span
                class="math-content"
                v-html="renderContent(child.label)"
              ></span>

              <!-- Grandchildren -->
              <div
                v-if="child.children?.length"
                class="grandchildren"
              >
                <div
                  v-for="grandchild in child.children"
                  :key="grandchild.id"
                  class="grandchild-node math-content"
                  v-html="renderContent(grandchild.label)"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-else
      class="empty-state"
    >
      <p>No mindmap data available.</p>
    </div>

    <template #footer>
      <div></div>
      <button
        class="footer-btn primary"
        @click="addToNote"
      >
        <Plus :size="14" />
        Add to Note
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.mindmap-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
  padding: 20px;
}

/* Central Node */
.central-node {
  background: linear-gradient(135deg, #58a6ff, #3b82f6);
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
  padding: 16px 32px;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 4px 24px rgba(88, 166, 255, 0.4);
  position: relative;
  animation: central-pulse 3s ease-in-out infinite;
}

@keyframes central-pulse {
  0%,
  100% {
    box-shadow: 0 4px 24px rgba(88, 166, 255, 0.4);
  }
  50% {
    box-shadow: 0 4px 32px rgba(88, 166, 255, 0.6);
  }
}

/* Branches */
.branches-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 24px;
  width: 100%;
}

.branch {
  flex: 1;
  min-width: 200px;
  max-width: 300px;
}

.branch-node {
  background: var(--modal-card-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 2px solid var(--branch-color);
  color: var(--text-color);
  font-size: 14px;
  font-weight: 500;
  padding: 12px 16px;
  border-radius: var(--modal-radius-sm);
  text-align: center;
  position: relative;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}

.branch-node:hover {
  background: var(--modal-card-bg-hover);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.branch-node::before {
  content: '';
  position: absolute;
  top: -20px;
  left: 50%;
  width: 2px;
  height: 20px;
  background: linear-gradient(to bottom, transparent, var(--branch-color));
}

/* Children */
.children {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  padding-left: 20px;
  border-left: 2px solid var(--branch-color, var(--modal-border));
  opacity: 0.9;
}

.child-node {
  font-size: 13px;
  color: var(--text-color);
  padding: 8px 12px;
  position: relative;
  background: var(--modal-card-bg);
  border-radius: var(--modal-radius-sm);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.child-node:hover {
  background: var(--modal-card-bg-hover);
  color: var(--text-color);
}

.connector {
  position: absolute;
  left: -20px;
  top: 50%;
  width: 18px;
  height: 2px;
  background: var(--branch-color, var(--modal-border));
}

/* Grandchildren */
.grandchildren {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  padding-left: 16px;
  border-left: 1px solid var(--modal-border-subtle);
}

.grandchild-node {
  font-size: 12px;
  color: var(--text-color-secondary);
  padding: 4px 8px;
}

/* Math content styles */
.math-content :deep(.math-display) {
  margin: 0.25rem 0;
}

.math-content :deep(.math-inline) {
  display: inline;
}

.math-content :deep(.katex) {
  font-size: 1em;
}

.math-content :deep(.katex-display) {
  margin: 0.25rem 0;
  overflow-x: auto;
  overflow-y: hidden;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-color-secondary);
}

/* Copy button - icon only, matches close button */
.copy-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--modal-btn-secondary-bg);
  border: none;
  border-radius: 50%;
  color: var(--text-color-secondary);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  margin-right: 36px;
}

.copy-btn:hover {
  background: var(--modal-btn-secondary-hover);
  color: var(--text-color);
}

.copy-btn.copied {
  color: var(--sec-primary-light, #3fb950);
}

/* Footer buttons */
.footer-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: var(--modal-radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.footer-btn.primary {
  background: var(--sec-fab-bg, linear-gradient(135deg, #238636 0%, #2ea043 100%));
  border: none;
  color: #ffffff;
  box-shadow: var(--shadow-glow-green, 0 2px 8px rgba(35, 134, 54, 0.3));
}

.footer-btn.primary:hover {
  background: var(--sec-fab-bg, linear-gradient(135deg, #2ea043 0%, #3fb950 100%));
  box-shadow: var(--shadow-glow-green, 0 4px 12px rgba(35, 134, 54, 0.4));
}
</style>
