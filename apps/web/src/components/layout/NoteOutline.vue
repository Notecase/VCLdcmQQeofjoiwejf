<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEditorStore } from '@/stores'

const editorStore = useEditorStore()
const isHovered = ref(false)

const tocItems = computed(() => {
  return editorStore.toc || []
})

function scrollToHeading(heading: any) {
  // Use Muya's scrollToHeading if available, otherwise scroll to element
  const headingEl = document.querySelector(`[data-head="${heading.slug}"]`)
  if (headingEl) {
    headingEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
    <button class="outline-toggle" :class="{ active: isHovered }">
      <div class="outline-icon">
        <div class="line line-1"></div>
        <div class="line line-2"></div>
        <div class="line line-3"></div>
      </div>
    </button>

    <!-- Outline Dropdown -->
    <Transition name="slide-fade">
      <div v-if="isHovered" class="outline-dropdown">
        <div class="outline-header">Outline</div>
        <div class="outline-list" v-if="tocItems.length > 0">
          <button
            v-for="(item, index) in tocItems"
            :key="index"
            class="outline-item"
            :class="{ 
              active: item.active,
              [`level-${item.lvl || item.level || 1}`]: true 
            }"
            @click="scrollToHeading(item)"
          >
            {{ item.content || item.title }}
          </button>
        </div>
        <div v-else class="outline-empty">
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
  border: 1px solid var(--border-color, #F1F5F9);
  background: var(--card-bg, #FFFFFF);
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
  background: var(--primary-color, #7C9EF8);
}

.line-2 {
  width: 12px;
  background: #A78BFA;
}

.line-3 {
  width: 8px;
  background: #C4B5FD;
}

.outline-dropdown {
  position: absolute;
  top: 0;
  left: 48px;
  width: 260px;
  background: var(--card-bg, #FFFFFF);
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
  color: var(--text-color-secondary, #94A3B8);
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
  color: var(--text-color-secondary, #64748B);
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
  background: var(--hover-bg, #F8FAFC);
  color: var(--text-color, #334155);
}

.outline-item.active {
  background: rgba(124, 158, 248, 0.1);
  color: var(--primary-color, #7C9EF8);
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
  color: var(--text-color-secondary, #94A3B8);
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
