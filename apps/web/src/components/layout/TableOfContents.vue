<script setup lang="ts">
/**
 * TableOfContents - Heading navigation panel
 * TypeScript component with tree structure
 */
import { computed } from 'vue'
import { List, ChevronRight } from 'lucide-vue-next'
import { useEditorStore } from '@/stores'

interface TocItem {
  id: string
  slug: string
  label: string
  level: number
  children: TocItem[]
}

const editorStore = useEditorStore()

// Get TOC from editor store
const toc = computed<TocItem[]>(() => editorStore.tableOfContents || [])

const isEmpty = computed(() => toc.value.length === 0)

function scrollToHeading(item: TocItem) {
  // Emit event for editor to scroll
  const event = new CustomEvent('scroll-to-heading', {
    detail: { slug: item.slug },
  })
  window.dispatchEvent(event)
}

function getIndentStyle(level: number) {
  return {
    paddingLeft: `${(level - 1) * 16 + 12}px`,
  }
}

function getHeadingClass(level: number) {
  return `toc-h${Math.min(level, 6)}`
}
</script>

<template>
  <div class="toc-panel">
    <div class="toc-header">
      <List :size="16" />
      <span>Table of Contents</span>
    </div>

    <div
      class="toc-content"
      v-if="!isEmpty"
    >
      <div
        v-for="item in toc"
        :key="item.id"
        class="toc-tree"
      >
        <!-- Recursive TOC rendering -->
        <TocNode
          :item="item"
          :scrollToHeading="scrollToHeading"
        />
      </div>
    </div>

    <div
      class="toc-empty"
      v-else
    >
      <div class="empty-icon">
        <List :size="48" />
      </div>
      <p>No headings found</p>
      <p class="empty-hint">Add headings (# H1, ## H2, etc.) to see table of contents</p>
    </div>
  </div>
</template>

<script lang="ts">
// Recursive component for TOC tree
const TocNode = {
  name: 'TocNode',
  props: ['item', 'scrollToHeading'],
  template: `
    <div class="toc-item-wrapper">
      <button 
        class="toc-item"
        :class="'toc-h' + Math.min(item.level, 6)"
        :style="{ paddingLeft: ((item.level - 1) * 16 + 12) + 'px' }"
        @click="scrollToHeading(item)"
      >
        <span class="toc-label">{{ item.label }}</span>
      </button>
      <template v-if="item.children && item.children.length">
        <TocNode 
          v-for="child in item.children" 
          :key="child.id" 
          :item="child"
          :scrollToHeading="scrollToHeading"
        />
      </template>
    </div>
  `,
}

export default {
  components: { TocNode },
}
</script>

<style scoped>
.toc-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.toc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color);
  border-bottom: 1px solid var(--border-color);
}

.toc-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.toc-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  color: var(--text-color);
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  transition: background 0.15s;
}

.toc-item:hover {
  background: var(--float-hover-color, rgba(255, 255, 255, 0.05));
}

/* Heading level styles */
.toc-h1 {
  font-weight: 600;
  font-size: 14px;
}

.toc-h2 {
  font-weight: 500;
  font-size: 13px;
}

.toc-h3,
.toc-h4,
.toc-h5,
.toc-h6 {
  font-weight: 400;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.toc-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toc-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--text-color-secondary);
  text-align: center;
}

.empty-icon {
  opacity: 0.3;
  margin-bottom: 16px;
}

.toc-empty p {
  margin: 4px 0;
  font-size: 13px;
}

.empty-hint {
  font-size: 11px;
  opacity: 0.7;
}
</style>
