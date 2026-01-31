<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEditorStore } from '@/stores'

const editorStore = useEditorStore()
const isHovered = ref(false)

const tocItems = computed(() => {
  return editorStore.toc || []
})

function scrollToHeading(heading: any, index: number) {
  // Find all heading elements in the Muya editor
  // TS Muya uses class 'mu-atx-heading' for ATX headings and 'mu-setext-heading' for setext
  const headingEls = document.querySelectorAll('.mu-atx-heading, .mu-setext-heading')

  // Get the heading at the specified index (based on TOC position)
  // We need to count headings to match the index
  let headingCount = 0
  for (const el of headingEls) {
    // Check if this heading matches our target
    if (headingCount === index) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    headingCount++
  }

  // Fallback: try to find by text content
  for (const el of headingEls) {
    const textContent = el.textContent?.replace(/^#+\s*/, '').trim()
    if (textContent === heading.content) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
  }
}
</script>

<template>
  <div
    class="note-outline"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Outline Toggle Button -->
    <button
      class="outline-toggle"
      :class="{ active: isHovered }"
    >
      <div class="outline-icon">
        <div class="line line-1"></div>
        <div class="line line-2"></div>
        <div class="line line-3"></div>
      </div>
    </button>

    <!-- Outline Dropdown -->
    <Transition name="slide-fade">
      <div
        v-if="isHovered"
        class="outline-dropdown"
      >
        <div class="outline-header">Outline</div>
        <div
          v-if="tocItems.length > 0"
          class="outline-list"
        >
          <button
            v-for="(item, index) in tocItems"
            :key="index"
            class="outline-item"
            :class="{
              active: item.active,
              [`level-${item.lvl || item.level || 1}`]: true,
            }"
            @click="scrollToHeading(item, index)"
          >
            {{ item.content || item.title }}
          </button>
        </div>
        <div
          v-else
          class="outline-empty"
        >
          <p>No headings yet</p>
          <span>Add headings to see outline</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.note-outline {
  position: absolute;
  left: 16px;
  top: 80px;
  z-index: 30;
}

.outline-toggle {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--border-color, #f1f5f9);
  background: var(--card-bg, #ffffff);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.2s ease;
}

.outline-toggle:hover,
.outline-toggle.active {
  background: rgba(124, 158, 248, 0.08);
  border-color: rgba(124, 158, 248, 0.3);
}

.outline-icon {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: flex-start;
}

.line {
  height: 2px;
  border-radius: 1px;
  transition: all 0.2s ease;
}

.line-1 {
  width: 16px;
  background: var(--primary-color, #7c9ef8);
}

.line-2 {
  width: 12px;
  background: #a78bfa;
}

.line-3 {
  width: 8px;
  background: #c4b5fd;
}

.outline-dropdown {
  position: absolute;
  top: 0;
  left: 48px;
  width: 260px;
  background: var(--card-bg, #ffffff);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  padding: 8px;
  z-index: 100;
  max-height: 400px;
  overflow-y: auto;
}

.outline-header {
  padding: 8px 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-color-secondary, #94a3b8);
}

.outline-list {
  display: flex;
  flex-direction: column;
}

.outline-item {
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #64748b);
  font-size: 13px;
  font-weight: 400;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-item:hover {
  background: var(--hover-bg, #f8fafc);
  color: var(--text-color, #334155);
}

.outline-item.active {
  background: rgba(124, 158, 248, 0.1);
  color: var(--primary-color, #7c9ef8);
  font-weight: 600;
}

/* Indentation for heading levels */
.outline-item.level-1 {
  padding-left: 14px;
}

.outline-item.level-2 {
  padding-left: 28px;
}

.outline-item.level-3 {
  padding-left: 42px;
}

.outline-item.level-4 {
  padding-left: 56px;
}

.outline-item.level-5 {
  padding-left: 70px;
}

.outline-item.level-6 {
  padding-left: 84px;
}

.outline-empty {
  padding: 24px 14px;
  text-align: center;
  color: var(--text-color-secondary, #94a3b8);
}

.outline-empty p {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 500;
}

.outline-empty span {
  font-size: 11px;
  opacity: 0.7;
}

/* Slide fade animation */
.slide-fade-enter-active {
  transition: all 0.2s ease;
}

.slide-fade-leave-active {
  transition: all 0.15s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}
</style>
