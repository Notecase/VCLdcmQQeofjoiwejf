<script setup lang="ts">
/**
 * SearchPanel - In-document find & replace with regex support
 * Floating panel with keyboard navigation
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Search, Replace, ChevronUp, ChevronDown, X, CaseSensitive, Regex, WholeWord } from 'lucide-vue-next'

interface SearchMatch {
  index: number
  start: number
  end: number
  line: number
  column: number
  text: string
}

const props = defineProps<{
  visible: boolean
  content: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'navigate', match: SearchMatch): void
  (e: 'replace', replacement: { from: number; to: number; text: string }): void
  (e: 'replace-all', replacements: { from: number; to: number; text: string }[]): void
}>()

// Search state
const searchQuery = ref('')
const replaceQuery = ref('')
const caseSensitive = ref(false)
const wholeWord = ref(false)
const useRegex = ref(false)
const showReplace = ref(false)

// Results
const matches = ref<SearchMatch[]>([])
const currentMatchIndex = ref(-1)

// Refs for focus management
const searchInputRef = ref<HTMLInputElement>()

// Computed
const currentMatch = computed(() => {
  if (currentMatchIndex.value >= 0 && currentMatchIndex.value < matches.value.length) {
    return matches.value[currentMatchIndex.value]
  }
  return null
})

const matchCountText = computed(() => {
  if (!searchQuery.value) return ''
  if (matches.value.length === 0) return 'No results'
  return `${currentMatchIndex.value + 1} of ${matches.value.length}`
})

// Search logic
function performSearch() {
  matches.value = []
  currentMatchIndex.value = -1
  
  if (!searchQuery.value || !props.content) return
  
  try {
    let pattern: RegExp
    
    if (useRegex.value) {
      pattern = new RegExp(searchQuery.value, caseSensitive.value ? 'g' : 'gi')
    } else {
      // Escape special regex characters for literal search
      let escaped = searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      
      if (wholeWord.value) {
        escaped = `\\b${escaped}\\b`
      }
      
      pattern = new RegExp(escaped, caseSensitive.value ? 'g' : 'gi')
    }
    
    let match: RegExpExecArray | null
    const lines = props.content.split('\n')
    
    while ((match = pattern.exec(props.content)) !== null) {
      // Calculate line and column
      let pos = 0
      let line = 0
      let column = 0
      
      for (let i = 0; i < lines.length; i++) {
        if (pos + lines[i].length >= match.index) {
          line = i + 1
          column = match.index - pos
          break
        }
        pos += lines[i].length + 1 // +1 for newline
      }
      
      matches.value.push({
        index: match.index,
        start: match.index,
        end: match.index + match[0].length,
        line,
        column,
        text: match[0]
      })
      
      // Prevent infinite loop on zero-width matches
      if (match[0].length === 0) {
        pattern.lastIndex++
      }
    }
    
    if (matches.value.length > 0) {
      currentMatchIndex.value = 0
      emit('navigate', matches.value[0])
    }
  } catch (e) {
    // Invalid regex - silently fail
    console.warn('Invalid search pattern:', e)
  }
}

function navigateNext() {
  if (matches.value.length === 0) return
  
  currentMatchIndex.value = (currentMatchIndex.value + 1) % matches.value.length
  emit('navigate', matches.value[currentMatchIndex.value])
}

function navigatePrev() {
  if (matches.value.length === 0) return
  
  currentMatchIndex.value = currentMatchIndex.value <= 0 
    ? matches.value.length - 1 
    : currentMatchIndex.value - 1
  emit('navigate', matches.value[currentMatchIndex.value])
}

function replaceCurrentMatch() {
  const match = currentMatch.value
  if (!match) return
  
  emit('replace', {
    from: match.start,
    to: match.end,
    text: replaceQuery.value
  })
  
  // Re-search after replacement
  setTimeout(performSearch, 50)
}

function replaceAllMatches() {
  if (matches.value.length === 0) return
  
  // Build replacements in reverse order to maintain positions
  const replacements = [...matches.value]
    .sort((a, b) => b.start - a.start)
    .map(match => ({
      from: match.start,
      to: match.end,
      text: replaceQuery.value
    }))
  
  emit('replace-all', replacements)
  
  // Re-search after replacement
  setTimeout(performSearch, 50)
}

function closePanel() {
  emit('close')
}

// Keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closePanel()
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    navigateNext()
  } else if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault()
    navigatePrev()
  } else if (e.key === 'F3') {
    e.preventDefault()
    if (e.shiftKey) {
      navigatePrev()
    } else {
      navigateNext()
    }
  }
}

// Watch for query changes with debounce
let searchTimeout: ReturnType<typeof setTimeout>
watch([searchQuery, caseSensitive, wholeWord, useRegex], () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(performSearch, 150)
})

// Watch visibility
watch(() => props.visible, (visible) => {
  if (visible) {
    setTimeout(() => searchInputRef.value?.focus(), 100)
  }
})

// Watch content changes
watch(() => props.content, () => {
  if (searchQuery.value) {
    performSearch()
  }
})

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  if (props.visible) {
    searchInputRef.value?.focus()
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  clearTimeout(searchTimeout)
})
</script>

<template>
  <Transition name="slide-down">
    <div v-if="visible" class="search-panel">
      <div class="search-row">
        <div class="search-input-wrapper">
          <Search :size="16" class="input-icon" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            placeholder="Find"
            class="search-input"
            @keydown.enter.prevent="navigateNext"
          />
        </div>
        
        <div class="search-options">
          <button 
            class="option-btn"
            :class="{ active: caseSensitive }"
            @click="caseSensitive = !caseSensitive"
            title="Case Sensitive (Alt+C)"
          >
            <CaseSensitive :size="16" />
          </button>
          <button 
            class="option-btn"
            :class="{ active: wholeWord }"
            @click="wholeWord = !wholeWord"
            title="Whole Word (Alt+W)"
          >
            <WholeWord :size="16" />
          </button>
          <button 
            class="option-btn"
            :class="{ active: useRegex }"
            @click="useRegex = !useRegex"
            title="Regular Expression (Alt+R)"
          >
            <Regex :size="16" />
          </button>
        </div>
        
        <div class="search-nav">
          <span class="match-count">{{ matchCountText }}</span>
          <button 
            class="nav-btn" 
            @click="navigatePrev"
            :disabled="matches.length === 0"
            title="Previous (Shift+Enter)"
          >
            <ChevronUp :size="16" />
          </button>
          <button 
            class="nav-btn" 
            @click="navigateNext"
            :disabled="matches.length === 0"
            title="Next (Enter)"
          >
            <ChevronDown :size="16" />
          </button>
        </div>
        
        <button 
          class="toggle-replace-btn"
          @click="showReplace = !showReplace"
          title="Toggle Replace"
        >
          <Replace :size="16" />
        </button>
        
        <button class="close-btn" @click="closePanel" title="Close (Esc)">
          <X :size="16" />
        </button>
      </div>
      
      <Transition name="expand">
        <div v-if="showReplace" class="replace-row">
          <div class="search-input-wrapper">
            <Replace :size="16" class="input-icon" />
            <input
              v-model="replaceQuery"
              type="text"
              placeholder="Replace"
              class="search-input"
            />
          </div>
          
          <button 
            class="replace-btn"
            @click="replaceCurrentMatch"
            :disabled="!currentMatch"
            title="Replace"
          >
            Replace
          </button>
          <button 
            class="replace-btn"
            @click="replaceAllMatches"
            :disabled="matches.length === 0"
            title="Replace All"
          >
            Replace All
          </button>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.search-panel {
  position: absolute;
  top: 0;
  right: 20px;
  z-index: 100;
  background: var(--float-bg-color, #2d2d30);
  border: 1px solid var(--border-color, #3c3c3c);
  border-radius: 0 0 8px 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  padding: 8px 12px;
  min-width: 400px;
}

.search-row,
.replace-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.replace-row {
  margin-top: 8px;
}

.search-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  background: var(--input-bg, rgba(0, 0, 0, 0.2));
  border: 1px solid var(--border-color, #3c3c3c);
  border-radius: 4px;
  padding: 0 8px;
}

.input-icon {
  color: var(--text-color-secondary, #888);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-color, #fff);
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
}

.search-input::placeholder {
  color: var(--text-color-secondary, #666);
}

.search-options {
  display: flex;
  gap: 4px;
}

.option-btn,
.nav-btn,
.close-btn,
.toggle-replace-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--text-color-secondary, #888);
  cursor: pointer;
  transition: all 0.15s ease;
}

.option-btn:hover,
.nav-btn:hover:not(:disabled),
.close-btn:hover,
.toggle-replace-btn:hover {
  background: var(--float-hover-color, rgba(255, 255, 255, 0.1));
  color: var(--text-color, #fff);
}

.option-btn.active {
  background: var(--primary-color, #65b9f4);
  color: #fff;
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.match-count {
  font-size: 12px;
  color: var(--text-color-secondary, #888);
  min-width: 70px;
  text-align: center;
}

.search-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.replace-btn {
  padding: 6px 12px;
  background: var(--float-hover-color, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--border-color, #3c3c3c);
  border-radius: 4px;
  color: var(--text-color, #fff);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.replace-btn:hover:not(:disabled) {
  background: var(--primary-color, #65b9f4);
}

.replace-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Transitions */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
}

.expand-enter-to,
.expand-leave-from {
  max-height: 50px;
}
</style>
