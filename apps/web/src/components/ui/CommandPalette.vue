<script setup lang="ts">
/**
 * CommandPalette - Quick command access with Cmd/Ctrl+P
 * TypeScript component with fuzzy search
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Command, X, ChevronRight } from 'lucide-vue-next'
import { useLayoutStore } from '@/stores/layout'
import { useEditorStore } from '@/stores/editor'
import { usePreferencesStore } from '@/stores/preferences'

interface CommandItem {
  id: string
  label: string
  shortcut?: string
  category: string
  icon?: string
  action: () => void
}

const layoutStore = useLayoutStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const searchQuery = ref('')
const selectedIndex = ref(0)
const searchInputRef = ref<HTMLInputElement>()

// Define available commands
const commands = computed<CommandItem[]>(() => [
  // File commands
  {
    id: 'new-document',
    label: 'New Document',
    shortcut: 'Ctrl+N',
    category: 'File',
    action: () => editorStore.createDocument(),
  },
  {
    id: 'save-document',
    label: 'Save Document',
    shortcut: 'Ctrl+S',
    category: 'File',
    action: () => editorStore.saveDocument(),
  },

  // Edit commands
  {
    id: 'find',
    label: 'Find in Document',
    shortcut: 'Ctrl+F',
    category: 'Edit',
    action: () => layoutStore.openSearchPanel(),
  },

  // View commands
  {
    id: 'toggle-sidebar',
    label: 'Toggle Sidebar',
    shortcut: 'Ctrl+\\',
    category: 'View',
    action: () => layoutStore.toggleSidebar(),
  },
  {
    id: 'toggle-source-mode',
    label: layoutStore.isSourceMode ? 'Switch to WYSIWYG Mode' : 'Switch to Source Mode',
    shortcut: 'Ctrl+/',
    category: 'View',
    action: () => layoutStore.toggleEditorMode(),
  },
  {
    id: 'toggle-focus-mode',
    label: 'Toggle Focus Mode',
    category: 'View',
    action: () => layoutStore.toggleFocusMode(),
  },
  {
    id: 'toggle-zen-mode',
    label: 'Toggle Zen Mode',
    category: 'View',
    action: () => layoutStore.toggleZenMode(),
  },
  {
    id: 'show-toc',
    label: 'Show Table of Contents',
    category: 'View',
    action: () => layoutStore.setSidebarPanel('toc'),
  },
  {
    id: 'show-documents',
    label: 'Show Documents',
    category: 'View',
    action: () => layoutStore.setSidebarPanel('documents'),
  },

  // Theme commands
  {
    id: 'theme-one-dark',
    label: 'Theme: One Dark',
    category: 'Theme',
    action: () => preferencesStore.setTheme('one-dark'),
  },
  {
    id: 'theme-dark',
    label: 'Theme: Dark',
    category: 'Theme',
    action: () => preferencesStore.setTheme('dark'),
  },
  {
    id: 'theme-material-dark',
    label: 'Theme: Material Dark',
    category: 'Theme',
    action: () => preferencesStore.setTheme('material-dark'),
  },
  {
    id: 'theme-ulysses',
    label: 'Theme: Ulysses Light',
    category: 'Theme',
    action: () => preferencesStore.setTheme('ulysses-light'),
  },
  {
    id: 'theme-graphite',
    label: 'Theme: Graphite Light',
    category: 'Theme',
    action: () => preferencesStore.setTheme('graphite-light'),
  },
])

// Fuzzy search filter
function fuzzyMatch(text: string, query: string): boolean {
  const searchLower = query.toLowerCase()
  const textLower = text.toLowerCase()

  let searchIndex = 0
  for (let i = 0; i < textLower.length && searchIndex < searchLower.length; i++) {
    if (textLower[i] === searchLower[searchIndex]) {
      searchIndex++
    }
  }
  return searchIndex === searchLower.length
}

const filteredCommands = computed(() => {
  if (!searchQuery.value) return commands.value

  return commands.value.filter(
    (cmd) => fuzzyMatch(cmd.label, searchQuery.value) || fuzzyMatch(cmd.category, searchQuery.value)
  )
})

// Group by category
const groupedCommands = computed(() => {
  const groups: Record<string, CommandItem[]> = {}

  for (const cmd of filteredCommands.value) {
    if (!groups[cmd.category]) {
      groups[cmd.category] = []
    }
    groups[cmd.category]!.push(cmd)
  }

  return groups
})

// Flat list for navigation (kept for future keyboard navigation)
// eslint-disable-next-line no-unused-vars
const flatList = computed(() => {
  const items: (CommandItem | { type: 'header'; label: string })[] = []

  for (const [category, cmds] of Object.entries(groupedCommands.value)) {
    items.push({ type: 'header', label: category })
    items.push(...cmds)
  }

  return items
})

function executeCommand(cmd: CommandItem) {
  layoutStore.closeCommandPalette()
  cmd.action()
}

function handleKeydown(e: KeyboardEvent) {
  if (!layoutStore.commandPaletteVisible) return

  if (e.key === 'Escape') {
    layoutStore.closeCommandPalette()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    navigateDown()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    navigateUp()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    executeSelected()
  }
}

function navigateDown() {
  const commandItems = filteredCommands.value
  if (commandItems.length === 0) return
  selectedIndex.value = (selectedIndex.value + 1) % commandItems.length
}

function navigateUp() {
  const commandItems = filteredCommands.value
  if (commandItems.length === 0) return
  selectedIndex.value = selectedIndex.value <= 0 ? commandItems.length - 1 : selectedIndex.value - 1
}

function executeSelected() {
  const cmd = filteredCommands.value[selectedIndex.value]
  if (cmd) {
    executeCommand(cmd)
  }
}

// Reset on open
watch(
  () => layoutStore.commandPaletteVisible,
  (visible) => {
    if (visible) {
      searchQuery.value = ''
      selectedIndex.value = 0
      nextTick(() => searchInputRef.value?.focus())
    }
  }
)

// Reset selection on search change
watch(searchQuery, () => {
  selectedIndex.value = 0
})

// Global keyboard shortcut
function handleGlobalKeydown(e: KeyboardEvent) {
  // Cmd/Ctrl + P
  if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
    e.preventDefault()
    layoutStore.toggleCommandPalette()
  }
  // Cmd/Ctrl + K (alternative)
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    layoutStore.toggleCommandPalette()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleGlobalKeydown)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="layoutStore.commandPaletteVisible"
        class="command-palette-overlay"
        @click="layoutStore.closeCommandPalette()"
      >
        <div
          class="command-palette"
          @click.stop
        >
          <div class="palette-header">
            <Command
              :size="18"
              class="palette-icon"
            />
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              placeholder="Type a command or search..."
              class="palette-input"
            />
            <button
              class="close-btn"
              @click="layoutStore.closeCommandPalette()"
            >
              <X :size="16" />
            </button>
          </div>

          <div class="palette-results">
            <template v-if="filteredCommands.length > 0">
              <div
                v-for="(category, categoryName) in groupedCommands"
                :key="categoryName"
                class="command-group"
              >
                <div class="group-header">{{ categoryName }}</div>
                <button
                  v-for="(cmd, idx) in category"
                  :key="cmd.id"
                  class="command-item"
                  :class="{
                    selected: filteredCommands.indexOf(cmd) === selectedIndex,
                  }"
                  @click="executeCommand(cmd)"
                  @mouseenter="selectedIndex = filteredCommands.indexOf(cmd)"
                >
                  <span class="command-label">{{ cmd.label }}</span>
                  <span
                    v-if="cmd.shortcut"
                    class="command-shortcut"
                  >
                    {{ cmd.shortcut }}
                  </span>
                  <ChevronRight
                    :size="14"
                    class="command-arrow"
                  />
                </button>
              </div>
            </template>
            <div
              v-else
              class="no-results"
            >
              No commands found
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.command-palette-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  justify-content: center;
  padding-top: 100px;
}

.command-palette {
  width: 100%;
  max-width: 600px;
  background: var(--floatBgColor, var(--card-bg, #ffffff));
  border: 1px solid var(--floatBorderColor, var(--border-color, #e0e0e0));
  border-radius: 12px;
  box-shadow: 0 16px 48px var(--floatShadow, rgba(0, 0, 0, 0.2));
  overflow: hidden;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
}

.palette-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--floatBorderColor, var(--border-color, #e0e0e0));
  gap: 12px;
}

.palette-icon {
  color: var(--text-color-secondary, #888);
  flex-shrink: 0;
}

.palette-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--floatFontColor, var(--text-color, #333));
  font-size: 16px;
  font-family: inherit;
}

.palette-input::placeholder {
  color: var(--editorColor50, var(--text-color-secondary, #666));
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-color-secondary, #888);
  cursor: pointer;
}

.close-btn:hover {
  background: var(--floatHoverColor, rgba(0, 0, 0, 0.06));
  color: var(--floatFontColor, var(--text-color, #333));
}

.palette-results {
  overflow-y: auto;
  max-height: 400px;
  padding: 8px 0;
}

.command-group {
  padding: 0 8px;
}

.group-header {
  padding: 8px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-color-secondary, #888);
}

.command-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--floatFontColor, var(--text-color, #333));
  cursor: pointer;
  text-align: left;
  gap: 12px;
}

.command-item:hover,
.command-item.selected {
  background: var(--floatHoverColor, rgba(0, 0, 0, 0.06));
}

.command-item.selected {
  background: var(--themeColor, var(--primary-color, #7c9ef8));
  color: #fff;
}

.command-label {
  flex: 1;
  font-size: 14px;
}

.command-shortcut {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--editorColor10, rgba(0, 0, 0, 0.08));
  border-radius: 4px;
  color: var(--editorColor50, var(--text-color-secondary, #666));
}

.command-item.selected .command-shortcut {
  background: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.9);
}

.command-arrow {
  opacity: 0;
  color: var(--text-color-secondary);
}

.command-item.selected .command-arrow {
  opacity: 1;
  color: #fff;
}

.no-results {
  padding: 24px;
  text-align: center;
  color: var(--text-color-secondary, #888);
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
