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
  const colors = ['#58a6ff', '#3fb950', '#a371f7', '#f78166', '#d29922']
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
      <button
        class="footer-btn secondary"
        :class="{ copied }"
        @click="copyToClipboard"
      >
        <Check
          v-if="copied"
          :size="14"
        />
        <Copy
          v-else
          :size="14"
        />
        {{ copied ? 'Copied!' : 'Copy as Markdown' }}
      </button>
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
  background: rgba(22, 27, 34, 0.6);
  backdrop-filter: blur(8px);
  border: 2px solid var(--branch-color);
  color: #e6edf3;
  font-size: 14px;
  font-weight: 500;
  padding: 12px 16px;
  border-radius: 8px;
  text-align: center;
  position: relative;
  transition: all 0.2s ease;
  cursor: pointer;
}

.branch-node:hover {
  background: rgba(var(--branch-color-rgb, 88, 166, 255), 0.15);
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
  border-left: 2px solid var(--branch-color, #30363d);
  opacity: 0.9;
}

.child-node {
  font-size: 13px;
  color: #c9d1d9;
  padding: 8px 12px;
  position: relative;
  background: rgba(22, 27, 34, 0.4);
  border-radius: 6px;
  transition: all 0.2s ease;
}

.child-node:hover {
  background: rgba(22, 27, 34, 0.7);
  color: #e6edf3;
}

.connector {
  position: absolute;
  left: -20px;
  top: 50%;
  width: 18px;
  height: 2px;
  background: var(--branch-color, #30363d);
}

/* Grandchildren */
.grandchildren {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  padding-left: 16px;
  border-left: 1px solid #21262d;
}

.grandchild-node {
  font-size: 12px;
  color: #8b949e;
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
  color: #8b949e;
}

/* Footer buttons */
.footer-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.footer-btn.primary {
  background: #238636;
  border: 1px solid #238636;
  color: #ffffff;
}

.footer-btn.primary:hover {
  background: #2ea043;
}

.footer-btn.secondary {
  background: transparent;
  border: 1px solid #30363d;
  color: #8b949e;
}

.footer-btn.secondary:hover {
  background: #21262d;
  color: #e6edf3;
}

.footer-btn.secondary.copied {
  border-color: #3fb950;
  color: #3fb950;
}
</style>
