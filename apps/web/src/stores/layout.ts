/**
 * Layout Store - Manages UI state (sidebar, panels, modes)
 * TypeScript Pinia store for production scalability
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type SidebarPanel = 'documents' | 'toc' | 'search'
export type EditorMode = 'wysiwyg' | 'source'

export const useLayoutStore = defineStore('layout', () => {
  // Sidebar state
  const sidebarVisible = ref(true)
  const sidebarWidth = ref(260)
  const activeSidebarPanel = ref<SidebarPanel>('documents')

  // Editor mode
  const editorMode = ref<EditorMode>('wysiwyg')

  // Search panel
  const searchPanelVisible = ref(false)

  // Command palette
  const commandPaletteVisible = ref(false)

  // Right panel (for AI, etc.)
  const rightPanelVisible = ref(false)
  const rightPanelWidth = ref(350)

  // Fullscreen mode
  const isFullscreen = ref(false)

  // Focus mode
  const isFocusMode = ref(false)

  // Zen mode (hide everything except editor)
  const isZenMode = ref(false)

  // Computed
  const isSourceMode = computed(() => editorMode.value === 'source')
  const isWYSIWYG = computed(() => editorMode.value === 'wysiwyg')

  // Actions
  function toggleSidebar() {
    sidebarVisible.value = !sidebarVisible.value
  }

  function setSidebarPanel(panel: SidebarPanel) {
    activeSidebarPanel.value = panel
    if (!sidebarVisible.value) {
      sidebarVisible.value = true
    }
  }

  function toggleEditorMode() {
    editorMode.value = editorMode.value === 'wysiwyg' ? 'source' : 'wysiwyg'
  }

  function setEditorMode(mode: EditorMode) {
    editorMode.value = mode
  }

  function toggleSearchPanel() {
    searchPanelVisible.value = !searchPanelVisible.value
  }

  function openSearchPanel() {
    searchPanelVisible.value = true
  }

  function closeSearchPanel() {
    searchPanelVisible.value = false
  }

  function toggleCommandPalette() {
    commandPaletteVisible.value = !commandPaletteVisible.value
  }

  function openCommandPalette() {
    commandPaletteVisible.value = true
  }

  function closeCommandPalette() {
    commandPaletteVisible.value = false
  }

  function toggleRightPanel() {
    rightPanelVisible.value = !rightPanelVisible.value
  }

  function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value
  }

  function toggleFocusMode() {
    isFocusMode.value = !isFocusMode.value
  }

  function toggleZenMode() {
    isZenMode.value = !isZenMode.value
    if (isZenMode.value) {
      sidebarVisible.value = false
      rightPanelVisible.value = false
    }
  }

  function setSidebarWidth(width: number) {
    sidebarWidth.value = Math.max(200, Math.min(500, width))
  }

  function setRightPanelWidth(width: number) {
    rightPanelWidth.value = Math.max(280, Math.min(600, width))
  }

  return {
    // State
    sidebarVisible,
    sidebarWidth,
    activeSidebarPanel,
    editorMode,
    searchPanelVisible,
    commandPaletteVisible,
    rightPanelVisible,
    rightPanelWidth,
    isFullscreen,
    isFocusMode,
    isZenMode,

    // Computed
    isSourceMode,
    isWYSIWYG,

    // Actions
    toggleSidebar,
    setSidebarPanel,
    toggleEditorMode,
    setEditorMode,
    toggleSearchPanel,
    openSearchPanel,
    closeSearchPanel,
    toggleCommandPalette,
    openCommandPalette,
    closeCommandPalette,
    toggleRightPanel,
    toggleFullscreen,
    toggleFocusMode,
    toggleZenMode,
    setSidebarWidth,
    setRightPanelWidth,
  }
})
