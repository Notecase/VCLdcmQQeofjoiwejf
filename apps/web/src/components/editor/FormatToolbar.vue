<script setup lang="ts">
/**
 * Floating Glassmorphic Format Toolbar
 *
 * Apple-inspired design:
 * - Pill-shaped with full border-radius
 * - Glassmorphism: backdrop-blur, translucent background, subtle glow
 * - Floats over the canvas (position: fixed)
 * - Smart scroll behavior: hide on scroll down, reveal on scroll up/stop
 * - Smooth spring-like animations
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { usePreferencesStore, useLayoutStore } from '@/stores'
import {
  Bold, Italic, Underline, Strikethrough,
  Code, Link2, List, ListOrdered, Quote,
  Image, CheckSquare, Table2, Sparkles,
  Heading1, Heading2, Heading3
} from 'lucide-vue-next'

const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()

const props = defineProps<{
  muyaInstance?: any
  scrollContainer?: HTMLElement | null
}>()

// Visibility state
const isVisible = ref(true)
const isHovered = ref(false)

// Scroll tracking
let lastScrollY = 0
let scrollTimeout: ReturnType<typeof setTimeout> | null = null
let ticking = false

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
  props.muyaInstance.tablePicker?.show({ row: 3, column: 3 })
}

function insertImage() {
  if (!props.muyaInstance) return
  props.muyaInstance.imageSelector?.show()
}

function insertTaskList() {
  if (!props.muyaInstance) return
  props.muyaInstance.updateParagraph('task-list')
}

function insertCodeBlock() {
  if (!props.muyaInstance) return
  props.muyaInstance.updateParagraph('pre')
}

function handleAI() {
  layoutStore.toggleRightPanel()
}

// Smart scroll behavior
function handleScroll(e: Event) {
  if (isHovered.value) return // Don't hide while hovering

  const target = e.target as HTMLElement
  const currentScrollY = target.scrollTop

  if (!ticking) {
    window.requestAnimationFrame(() => {
      const delta = currentScrollY - lastScrollY

      // Clear existing timeout
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)
      }

      // Scrolling down - hide (only if scrolled past threshold)
      if (delta > 5 && currentScrollY > 100) {
        isVisible.value = false
      }
      // Scrolling up - show
      else if (delta < -5) {
        isVisible.value = true
      }

      // Show after stopping scroll
      scrollTimeout = setTimeout(() => {
        isVisible.value = true
      }, 800)

      lastScrollY = currentScrollY
      ticking = false
    })
    ticking = true
  }
}

// Attach scroll listener
function attachScrollListener() {
  // Find the Muya editor container
  const container = props.scrollContainer || document.querySelector('.muya-editor')
  if (container) {
    container.addEventListener('scroll', handleScroll, { passive: true })
    return container
  }
  return null
}

let scrollElement: Element | null = null

onMounted(() => {
  // Delay to ensure DOM is ready
  setTimeout(() => {
    scrollElement = attachScrollListener()
  }, 100)
})

onUnmounted(() => {
  if (scrollElement) {
    scrollElement.removeEventListener('scroll', handleScroll)
  }
  if (scrollTimeout) {
    clearTimeout(scrollTimeout)
  }
})

// Re-attach if container changes
watch(() => props.scrollContainer, () => {
  if (scrollElement) {
    scrollElement.removeEventListener('scroll', handleScroll)
  }
  scrollElement = attachScrollListener()
})

// Toolbar visibility from preferences
const showToolbar = computed(() => !preferencesStore.hideToolbar)
</script>

<template>
  <Transition name="toolbar-float">
    <div
      v-if="showToolbar"
      class="floating-toolbar-wrapper"
      :class="{ hidden: !isVisible }"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
    >
      <div class="floating-toolbar">
        <!-- Text Formatting -->
        <div class="toolbar-group">
          <button class="toolbar-btn" @click="format('strong')" title="Bold (⌘B)">
            <Bold :size="15" :stroke-width="2.5" />
          </button>
          <button class="toolbar-btn" @click="format('em')" title="Italic (⌘I)">
            <Italic :size="15" :stroke-width="2.5" />
          </button>
          <button class="toolbar-btn" @click="format('u')" title="Underline">
            <Underline :size="15" :stroke-width="2.5" />
          </button>
          <button class="toolbar-btn" @click="format('del')" title="Strikethrough">
            <Strikethrough :size="15" :stroke-width="2.5" />
          </button>
        </div>

        <div class="toolbar-divider" />

        <!-- Headings -->
        <div class="toolbar-group">
          <button class="toolbar-btn" @click="updateParagraph('heading 1')" title="Heading 1">
            <Heading1 :size="15" :stroke-width="2.5" />
          </button>
          <button class="toolbar-btn" @click="updateParagraph('heading 2')" title="Heading 2">
            <Heading2 :size="15" :stroke-width="2.5" />
          </button>
          <button class="toolbar-btn" @click="updateParagraph('heading 3')" title="Heading 3">
            <Heading3 :size="15" :stroke-width="2.5" />
          </button>
        </div>

        <div class="toolbar-divider" />

        <!-- Lists & Blocks -->
        <div class="toolbar-group">
          <button class="toolbar-btn" @click="updateParagraph('ul-bullet')" title="Bullet List">
            <List :size="15" :stroke-width="2.5" />
          </button>
          <button class="toolbar-btn" @click="updateParagraph('ol-order')" title="Numbered List">
            <ListOrdered :size="15" :stroke-width="2.5" />
          </button>
          <button class="toolbar-btn" @click="insertTaskList" title="Task List">
            <CheckSquare :size="15" :stroke-width="2.5" />
          </button>
          <button class="toolbar-btn" @click="updateParagraph('blockquote')" title="Quote">
            <Quote :size="15" :stroke-width="2.5" />
          </button>
          <button class="toolbar-btn" @click="insertCodeBlock" title="Code Block">
            <Code :size="15" :stroke-width="2.5" />
          </button>
        </div>

        <div class="toolbar-divider" />

        <!-- Media & Links -->
        <div class="toolbar-group">
          <button class="toolbar-btn" @click="insertImage" title="Insert Image">
            <Image :size="15" :stroke-width="2.5" />
          </button>
          <button class="toolbar-btn" @click="format('link')" title="Insert Link">
            <Link2 :size="15" :stroke-width="2.5" />
          </button>
          <button class="toolbar-btn" @click="insertTable" title="Insert Table">
            <Table2 :size="15" :stroke-width="2.5" />
          </button>
        </div>

        <div class="toolbar-divider" />

        <!-- AI Button - Special gradient pill -->
        <button class="toolbar-btn ai-btn" @click="handleAI" title="AI Assistant">
          <Sparkles :size="14" :stroke-width="2.5" />
          <span>AI</span>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ============================================
 * FLOATING TOOLBAR WRAPPER
 * Absolute position relative to note-container
 * Centered at top of the note canvas
 * ============================================ */
.floating-toolbar-wrapper {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;

  /* Smooth show/hide */
  opacity: 1;
  transition:
    opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.floating-toolbar-wrapper.hidden {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
  pointer-events: none;
}

/* ============================================
 * GLASSMORPHIC PILL TOOLBAR
 * Apple-inspired design with:
 * - Full pill border-radius
 * - Backdrop blur (frosted glass)
 * - Subtle translucent background
 * - Soft glow/shadow
 * ============================================ */
.floating-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;

  /* Pill shape */
  border-radius: 999px;

  /* Glassmorphism - uses CSS variables for theme support */
  background: var(--glass-bg);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);

  /* Subtle border for definition */
  border: 1px solid var(--glass-border);
  box-shadow:
    0 4px 30px var(--glass-shadow),
    0 1px 3px var(--glass-shadow),
    inset 0 1px 0 var(--glass-inset);

  /* Subtle hover lift */
  transition:
    box-shadow 0.3s ease,
    transform 0.3s ease;
}

.floating-toolbar:hover {
  box-shadow:
    0 8px 40px var(--glass-shadow-hover),
    0 2px 8px var(--glass-shadow),
    inset 0 1px 0 var(--glass-inset);
  transform: translateY(-2px);
}

/* ============================================
 * TOOLBAR GROUPS & BUTTONS
 * ============================================ */
.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--glass-btn-color);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.toolbar-btn:hover {
  background: var(--glass-btn-bg-hover);
  color: var(--glass-btn-color-hover);
  transform: scale(1.05);
}

.toolbar-btn:active {
  background: var(--glass-btn-bg-active);
  transform: scale(0.95);
}

/* Divider */
.toolbar-divider {
  width: 1px;
  height: 22px;
  background: var(--glass-divider);
  margin: 0 6px;
  border-radius: 1px;
}

/* ============================================
 * AI BUTTON - Special gradient styling
 * ============================================ */
.ai-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  width: auto;
  padding: 0 14px;
  height: 34px;

  /* Gradient background */
  background: linear-gradient(135deg, #A78BFA 0%, #818CF8 50%, #6366F1 100%);
  color: white;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;

  /* Subtle glow */
  box-shadow:
    0 2px 8px rgba(129, 140, 248, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.ai-btn:hover {
  background: linear-gradient(135deg, #9775FA 0%, #7072E8 50%, #5558E8 100%);
  color: white;
  transform: scale(1.05);
  box-shadow:
    0 4px 16px rgba(129, 140, 248, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.ai-btn:active {
  transform: scale(0.98);
}

/* ============================================
 * ENTRANCE/EXIT ANIMATION
 * ============================================ */
.toolbar-float-enter-active {
  animation: toolbar-pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toolbar-float-leave-active {
  animation: toolbar-pop-out 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes toolbar-pop-in {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px) scale(0.9);
  }
  100% {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}

@keyframes toolbar-pop-out {
  0% {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateX(-50%) translateY(-15px) scale(0.95);
  }
}

/* ============================================
 * RESPONSIVE - Smaller on mobile
 * ============================================ */
@media (max-width: 768px) {
  .floating-toolbar-wrapper {
    top: 12px;
  }

  .floating-toolbar {
    padding: 6px 10px;
    gap: 2px;
  }

  .toolbar-btn {
    width: 30px;
    height: 30px;
  }

  .toolbar-divider {
    height: 18px;
    margin: 0 4px;
  }

  .ai-btn {
    padding: 0 10px;
    height: 30px;
    font-size: 11px;
  }

  /* Hide some buttons on very small screens */
  @media (max-width: 500px) {
    .toolbar-group:nth-child(3) .toolbar-btn:nth-child(4),
    .toolbar-group:nth-child(3) .toolbar-btn:nth-child(5) {
      display: none;
    }
  }
}

/* ============================================
 * REDUCED MOTION
 * ============================================ */
@media (prefers-reduced-motion: reduce) {
  .floating-toolbar-wrapper,
  .floating-toolbar,
  .toolbar-btn {
    transition: none;
  }

  .toolbar-float-enter-active,
  .toolbar-float-leave-active {
    animation: none;
  }
}
</style>
