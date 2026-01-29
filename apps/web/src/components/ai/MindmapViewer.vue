<script setup lang="ts">
/**
 * Mindmap Viewer Component
 *
 * Displays an interactive SVG mindmap with:
 * - Hierarchical node layout
 * - Pan and zoom controls
 * - Click to collapse/expand
 *
 * Phase 3.4 Implementation
 */

/* global SVGSVGElement, MouseEvent, WheelEvent */
import { ref, computed, type PropType } from 'vue'
import type { Mindmap, MindmapNode } from '@/services/recommendation.service'

const props = defineProps({
  mindmap: {
    type: Object as PropType<Mindmap>,
    required: true,
  },
  readonly: {
    type: Boolean,
    default: false,
  },
})

// Layout settings
const nodeWidth = 140
const nodeHeight = 40
const levelSpacing = 160
const siblingSpacing = 60

// State
const svgRef = ref<SVGSVGElement | null>(null)
const viewBox = ref({ x: -300, y: -50, width: 900, height: 500 })
const collapsedNodes = ref<Set<string>>(new Set())

// Computed node positions
const positionedNodes = computed(() => {
  const nodes = props.mindmap.nodes
  const positions = new Map<string, { x: number; y: number }>()

  // Find root
  const root = nodes.find((n) => n.type === 'root')
  if (!root) return []

  positions.set(root.id, { x: 0, y: 200 })

  // Position by level
  const levels: MindmapNode[][] = [[], [], []]
  nodes.forEach((n) => {
    if (n.type === 'branch') levels[1].push(n)
    else if (n.type === 'leaf') levels[2].push(n)
  })

  // Position branches
  const branchCount = levels[1].length
  levels[1].forEach((node, i) => {
    const yOffset = (i - (branchCount - 1) / 2) * siblingSpacing
    positions.set(node.id, { x: levelSpacing, y: 200 + yOffset })
  })

  // Position leaves
  levels[1].forEach((branch) => {
    const leaves = levels[2].filter((l) => l.parentId === branch.id)
    const branchPos = positions.get(branch.id)!
    leaves.forEach((leaf, i) => {
      const yOffset = (i - (leaves.length - 1) / 2) * (siblingSpacing * 0.7)
      positions.set(leaf.id, { x: branchPos.x + levelSpacing, y: branchPos.y + yOffset })
    })
  })

  return nodes.map((n) => {
    const pos = positions.get(n.id)
    return {
      ...n,
      x: pos?.x ?? 0,
      y: pos?.y ?? 0,
      visible: !isCollapsed(n),
    }
  })
})

const visibleEdges = computed(() => {
  return props.mindmap.edges.filter((e) => {
    const source = positionedNodes.value.find((n) => n.id === e.source)
    const target = positionedNodes.value.find((n) => n.id === e.target)
    return source?.visible && target?.visible
  })
})

function isCollapsed(node: MindmapNode): boolean {
  if (node.type === 'root') return false
  if (node.type === 'branch') return collapsedNodes.value.has('root')
  if (node.type === 'leaf' && node.parentId) {
    return collapsedNodes.value.has(node.parentId) || collapsedNodes.value.has('root')
  }
  return false
}

function toggleCollapse(nodeId: string) {
  if (props.readonly) return
  if (collapsedNodes.value.has(nodeId)) {
    collapsedNodes.value.delete(nodeId)
  } else {
    collapsedNodes.value.add(nodeId)
  }
}

function getNodePosition(nodeId: string) {
  return positionedNodes.value.find((n) => n.id === nodeId)
}

function getEdgePath(edge: { source: string; target: string }) {
  const source = getNodePosition(edge.source)
  const target = getNodePosition(edge.target)
  if (!source || !target) return ''

  const x1 = (source.x || 0) + nodeWidth / 2
  const y1 = source.y || 0
  const x2 = target.x || 0
  const y2 = target.y || 0

  // Bezier curve
  const midX = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
}

// Pan handlers
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })

function onMouseDown(e: MouseEvent) {
  isPanning.value = true
  panStart.value = { x: e.clientX, y: e.clientY }
}

function onMouseMove(e: MouseEvent) {
  if (!isPanning.value) return
  const dx = e.clientX - panStart.value.x
  const dy = e.clientY - panStart.value.y
  viewBox.value.x -= dx
  viewBox.value.y -= dy
  panStart.value = { x: e.clientX, y: e.clientY }
}

function onMouseUp() {
  isPanning.value = false
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const scale = e.deltaY > 0 ? 1.1 : 0.9
  viewBox.value.width *= scale
  viewBox.value.height *= scale
}

function resetView() {
  viewBox.value = { x: -300, y: -50, width: 900, height: 500 }
}
</script>

<template>
  <div class="mindmap-viewer">
    <div class="mindmap-controls">
      <button
        title="Reset View"
        @click="resetView"
      >
        🔄
      </button>
      <span class="title">{{ mindmap.title }}</span>
    </div>

    <svg
      ref="svgRef"
      :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @wheel="onWheel"
    >
      <!-- Edges -->
      <path
        v-for="edge in visibleEdges"
        :key="edge.id"
        :d="getEdgePath(edge)"
        fill="none"
        stroke="#8b5cf6"
        stroke-width="2"
        opacity="0.6"
      />

      <!-- Nodes -->
      <g
        v-for="node in positionedNodes.filter((n) => n.visible)"
        :key="node.id"
        :transform="`translate(${node.x}, ${node.y - nodeHeight / 2})`"
        class="mindmap-node"
        :class="node.type"
        @click="toggleCollapse(node.id)"
      >
        <rect
          :width="nodeWidth"
          :height="nodeHeight"
          :rx="node.type === 'root' ? 20 : 8"
          :fill="node.color || '#6366f1'"
        />
        <text
          :x="nodeWidth / 2"
          :y="nodeHeight / 2 + 4"
          text-anchor="middle"
          fill="white"
          font-size="12"
          font-weight="500"
        >
          {{ node.label.slice(0, 16) }}{{ node.label.length > 16 ? '...' : '' }}
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.mindmap-viewer {
  width: 100%;
  height: 400px;
  background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.mindmap-controls {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 10;
}

.mindmap-controls button {
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.mindmap-controls button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.mindmap-controls .title {
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  opacity: 0.9;
}

svg {
  width: 100%;
  height: 100%;
  cursor: grab;
}

svg:active {
  cursor: grabbing;
}

.mindmap-node {
  cursor: pointer;
  transition: transform 0.2s;
}

.mindmap-node:hover {
  transform: scale(1.05);
}

.mindmap-node rect {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.mindmap-node.root rect {
  stroke: rgba(255, 255, 255, 0.3);
  stroke-width: 2;
}
</style>
