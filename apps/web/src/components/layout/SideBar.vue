<script setup lang="ts">
/**
 * SideBar - Enhanced sidebar with Projects and Documents tree
 * Features: Create/rename/delete projects, hierarchical tree view, drag-drop, subnotes
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import {
  FileText,
  List,
  Plus,
  ChevronRight,
  Trash2,
  Folder,
  FolderOpen,
  ChevronRight as ChevronRightIcon,
  MoreHorizontal,
  Edit2,
  FolderPlus,
  FilePlus,
  Search,
  Settings,
  LogOut,
  Moon,
  Sun,
  Monitor,
  User,
  MessageCircle,
  ChevronUp,
  CornerDownRight,
} from 'lucide-vue-next'
import {
  useEditorStore,
  useLayoutStore,
  useProjectStore,
  useAuthStore,
  usePreferencesStore,
} from '@/stores'
import { useAIStore } from '@/stores/ai'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useRouter, useRoute } from 'vue-router'
import TableOfContents from './TableOfContents.vue'
import { buildNoteTree, wouldCreateCircularNote, type NoteTreeNode } from '@inkdown/shared'
import * as notesService from '@/services/notes.service'
import type { MoveNoteDTO } from '@inkdown/shared'

type SidebarTab = 'documents' | 'toc'

const router = useRouter()
const route = useRoute()
const editorStore = useEditorStore()
const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const authStore = useAuthStore()
const preferencesStore = usePreferencesStore()
const aiStore = useAIStore()

// Check if a note is highlighted — route-aware to avoid dual highlights
function isNoteActive(noteId: string) {
  if (route.path === '/') {
    return aiStore.previewNoteId === noteId
  }
  return editorStore.currentDocument?.id === noteId
}

// User menu state
const showUserMenu = ref(false)
const userMenuRef = ref<HTMLElement | null>(null)

// Get user display info
const userDisplayName = computed(() => {
  if (!authStore.user) return 'Guest'
  return authStore.user.name || authStore.user.email?.split('@')[0] || 'User'
})

const userInitial = computed(() => {
  return userDisplayName.value.charAt(0).toUpperCase()
})

// Theme handling
const currentTheme = computed(() => {
  const theme = preferencesStore.theme
  if (theme.includes('dark')) return 'dark'
  if (theme.includes('light')) return 'light'
  return 'system'
})

function setTheme(mode: 'light' | 'dark' | 'system') {
  if (mode === 'light') {
    preferencesStore.setTheme('light')
  } else if (mode === 'dark') {
    preferencesStore.setTheme('one-dark')
  } else {
    // System - default to dark for now
    preferencesStore.setTheme('one-dark')
  }
}

function toggleUserMenu() {
  showUserMenu.value = !showUserMenu.value
}

function closeUserMenu() {
  showUserMenu.value = false
}

// Click outside to close user menu
function handleClickOutside(e: MouseEvent) {
  if (showUserMenu.value && userMenuRef.value && !userMenuRef.value.contains(e.target as Node)) {
    showUserMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

function goToSettings() {
  closeUserMenu()
  // TODO: Open settings modal
}

function goToAuth() {
  closeUserMenu()
  router.push('/auth')
}

async function signOut() {
  closeUserMenu()
  await authStore.signOut()
  router.push('/auth')
}

const searchQuery = ref('')
const activeTab = computed({
  get: () => layoutStore.activeSidebarPanel as SidebarTab,
  set: (val: SidebarTab) => layoutStore.setSidebarPanel(val),
})

const sidebarVisible = computed(() => layoutStore.sidebarVisible)
const sidebarWidth = computed(() => layoutStore.sidebarWidth)

// Handle collapsed tab click - set tab and toggle sidebar
function handleCollapsedTabClick(tabId: SidebarTab) {
  activeTab.value = tabId
  layoutStore.toggleSidebar()
}

// Project editing state
const editingProjectId = ref<string | null>(null)
const editingProjectName = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)

// Context menu state
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  type: '' as 'project' | 'note' | '',
  targetId: '',
})

// New project input state
const showNewProjectInput = ref(false)
const newProjectName = ref('')
const newProjectParentId = ref<string | null>(null)
const newProjectInputRef = ref<HTMLInputElement | null>(null)

// Note editing state
const editingNoteId = ref<string | null>(null)
const editingNoteTitle = ref('')
const noteEditInputRef = ref<HTMLInputElement | null>(null)

// Expanded note IDs (for subnotes)
const expandedNoteIds = ref<Set<string>>(new Set())

// Drag-and-drop state
const dragState = ref<{
  isDragging: boolean
  itemId: string | null
  itemType: 'note' | 'project' | null
  dropTargetId: string | null
  dropTargetType: 'project' | 'note' | 'general' | null
}>({
  isDragging: false,
  itemId: null,
  itemType: null,
  dropTargetId: null,
  dropTargetType: null,
})

// Filter documents - only root-level general notes (no parent)
const generalDocuments = computed(() => {
  const docs = editorStore.documents.filter((doc) => !doc.project_id && !doc.parent_note_id)
  if (!searchQuery.value) return docs
  const query = searchQuery.value.toLowerCase()
  return docs.filter((doc) => doc.title.toLowerCase().includes(query))
})

// Build note tree for general notes
// eslint-disable-next-line no-unused-vars
const generalNoteTree = computed((): NoteTreeNode[] => {
  const generalNotes = editorStore.documents.filter((d) => !d.project_id)
  return buildNoteTree(generalNotes)
})

// Get root-level documents for a project (no parent note)
const getProjectDocuments = (projectId: string) => {
  const docs = editorStore.documents.filter(
    (doc) => doc.project_id === projectId && !doc.parent_note_id
  )
  if (!searchQuery.value) return docs
  const query = searchQuery.value.toLowerCase()
  return docs.filter((doc) => doc.title.toLowerCase().includes(query))
}

// Build note tree for a project
// eslint-disable-next-line no-unused-vars
const getProjectNoteTree = (projectId: string): NoteTreeNode[] => {
  const projectNotes = editorStore.documents.filter((d) => d.project_id === projectId)
  return buildNoteTree(projectNotes)
}

// Get children of a note
const getNoteChildren = (noteId: string) => {
  return editorStore.documents.filter((doc) => doc.parent_note_id === noteId)
}

// Check if a note has children
const hasNoteChildren = (noteId: string) => {
  return editorStore.documents.some((doc) => doc.parent_note_id === noteId)
}

// Check if a note is expanded
const isNoteExpanded = (noteId: string) => {
  return expandedNoteIds.value.has(noteId)
}

// Toggle note expanded state
const toggleNoteExpanded = (noteId: string) => {
  if (expandedNoteIds.value.has(noteId)) {
    expandedNoteIds.value.delete(noteId)
  } else {
    expandedNoteIds.value.add(noteId)
  }
}

// Load projects on mount
onMounted(async () => {
  await projectStore.loadFolders()
})

// Actions
async function createNewDocument(projectId?: string) {
  await editorStore.createDocument(projectId || undefined)
}

async function openDocument(doc: any) {
  // On home route (/), open note in the preview panel instead of the main editor
  if (route.path === '/') {
    aiStore.openNotePreview(doc.id)
  } else {
    editorStore.openDocument(doc)
  }
}

async function deleteDocument(doc: any, e: Event) {
  e.stopPropagation()
  try {
    await ElMessageBox.confirm(`Delete "${doc.title}"? This cannot be undone.`, 'Delete Document', {
      type: 'warning',
    })
    await editorStore.deleteDocument(doc.id)
  } catch {
    // Cancelled
  }
}

// Project actions
async function createProject(parentId: string | null = null) {
  newProjectParentId.value = parentId
  newProjectName.value = ''
  showNewProjectInput.value = true

  // If creating under a parent, expand it
  if (parentId) {
    projectStore.expandFolder(parentId)
  }

  await nextTick()
  newProjectInputRef.value?.focus()
}

async function submitNewProject() {
  const name = newProjectName.value.trim()
  if (!name) {
    showNewProjectInput.value = false
    return
  }

  const result = await projectStore.createFolder(name, newProjectParentId.value)
  if (result) {
    ElMessage.success(`Created project "${name}"`)
  }

  showNewProjectInput.value = false
  newProjectName.value = ''
  newProjectParentId.value = null
}

function cancelNewProject() {
  showNewProjectInput.value = false
  newProjectName.value = ''
  newProjectParentId.value = null
}

function startRenameProject(projectId: string, currentName: string) {
  editingProjectId.value = projectId
  editingProjectName.value = currentName
  nextTick(() => {
    editInputRef.value?.focus()
    editInputRef.value?.select()
  })
}

async function submitRenameProject() {
  if (!editingProjectId.value) return

  const name = editingProjectName.value.trim()
  if (name) {
    await projectStore.renameFolder(editingProjectId.value, name)
  }

  editingProjectId.value = null
  editingProjectName.value = ''
}

function cancelRenameProject() {
  editingProjectId.value = null
  editingProjectName.value = ''
}

async function deleteProject(projectId: string, projectName: string) {
  try {
    await ElMessageBox.confirm(
      `Delete project "${projectName}" and all its contents? This cannot be undone.`,
      'Delete Project',
      { type: 'warning', confirmButtonText: 'Delete', confirmButtonClass: 'el-button--danger' }
    )
    await projectStore.deleteFolder(projectId)
    ElMessage.success(`Deleted project "${projectName}"`)
  } catch {
    // Cancelled
  }
}

// Note rename functions
function startRenameNote(noteId: string, currentTitle: string) {
  editingNoteId.value = noteId
  editingNoteTitle.value = currentTitle
  nextTick(() => {
    noteEditInputRef.value?.focus()
    noteEditInputRef.value?.select()
  })
}

async function submitRenameNote() {
  if (!editingNoteId.value) return

  const title = editingNoteTitle.value.trim()
  if (title) {
    await editorStore.renameDocument(editingNoteId.value, title)
    ElMessage.success('Note renamed')
  }

  editingNoteId.value = null
  editingNoteTitle.value = ''
}

function cancelRenameNote() {
  editingNoteId.value = null
  editingNoteTitle.value = ''
}

// Subnote creation
async function createSubnote(parentNoteId: string) {
  // Expand the parent note to show the new subnote
  expandedNoteIds.value.add(parentNoteId)
  await editorStore.createDocument(undefined, 'Untitled', parentNoteId)
  ElMessage.success('Subnote created')
}

// Move note to general (remove from project/parent)
async function moveNoteToGeneral(noteId: string) {
  const result = await notesService.moveNote(noteId, {
    project_id: null,
    parent_note_id: null,
  })
  if (result.error) {
    ElMessage.error('Failed to move note')
  } else {
    await editorStore.loadDocuments()
    ElMessage.success('Moved to general notes')
  }
}

// Drag-and-drop handlers
function handleDragStart(e: DragEvent, itemId: string, itemType: 'note' | 'project') {
  dragState.value = {
    isDragging: true,
    itemId,
    itemType,
    dropTargetId: null,
    dropTargetType: null,
  }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify({ itemId, itemType }))
  }
  // Add a small delay for visual feedback
  const target = e.target as HTMLElement
  setTimeout(() => target.classList.add('dragging'), 0)
}

function handleDragEnd(e: DragEvent) {
  const target = e.target as HTMLElement
  target.classList.remove('dragging')
  resetDragState()
}

function handleDragOver(
  e: DragEvent,
  targetId: string,
  targetType: 'project' | 'note' | 'general'
) {
  e.preventDefault()

  // Only allow note drags for now
  if (dragState.value.itemType !== 'note') return
  if (!dragState.value.itemId) return

  // Can't drop on itself
  if (dragState.value.itemId === targetId) return

  // Validate drop target for notes
  if (targetType === 'note') {
    const noteTree = buildNoteTree(editorStore.documents)
    if (wouldCreateCircularNote(noteTree, dragState.value.itemId, targetId)) {
      return // Would create circular reference
    }
  }

  dragState.value.dropTargetId = targetId
  dragState.value.dropTargetType = targetType

  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
}

function handleDragLeave(e: DragEvent) {
  // Only reset if leaving the actual element (not entering a child)
  const relatedTarget = e.relatedTarget as HTMLElement
  const currentTarget = e.currentTarget as HTMLElement
  if (!currentTarget.contains(relatedTarget)) {
    if (dragState.value.dropTargetId === (currentTarget.dataset.itemId || '')) {
      dragState.value.dropTargetId = null
      dragState.value.dropTargetType = null
    }
  }
}

async function handleDrop(
  e: DragEvent,
  targetId: string,
  targetType: 'project' | 'note' | 'general'
) {
  e.preventDefault()
  e.stopPropagation()

  if (!dragState.value.itemId || dragState.value.itemType !== 'note') {
    resetDragState()
    return
  }

  const noteId = dragState.value.itemId

  // Determine destination based on target type
  let destination: MoveNoteDTO

  if (targetType === 'project') {
    // Moving to a project (as root note in that project)
    destination = { project_id: targetId, parent_note_id: null }
  } else if (targetType === 'note') {
    // Moving under another note (becomes subnote)
    destination = { project_id: null, parent_note_id: targetId }
    // Auto-expand the target note
    expandedNoteIds.value.add(targetId)
  } else {
    // Moving to general (no project, no parent)
    destination = { project_id: null, parent_note_id: null }
  }

  const result = await notesService.moveNote(noteId, destination)

  if (result.error) {
    ElMessage.error('Failed to move note')
  } else {
    await editorStore.loadDocuments()
    ElMessage.success('Note moved')
  }

  resetDragState()
}

function resetDragState() {
  dragState.value = {
    isDragging: false,
    itemId: null,
    itemType: null,
    dropTargetId: null,
    dropTargetType: null,
  }
}

// Context menu
function showContextMenu(e: MouseEvent, type: 'project' | 'note', id: string) {
  e.preventDefault()
  e.stopPropagation()
  contextMenu.value = {
    show: true,
    x: e.clientX,
    y: e.clientY,
    type,
    targetId: id,
  }
}

function hideContextMenu() {
  contextMenu.value.show = false
}

function handleContextMenuAction(action: string) {
  const { type, targetId } = contextMenu.value

  if (type === 'project') {
    const project = projectStore.folders.find((f) => f.id === targetId)
    if (!project) return

    switch (action) {
      case 'rename':
        startRenameProject(targetId, project.name)
        break
      case 'newNote':
        createNewDocument(targetId)
        break
      case 'newSubproject':
        createProject(targetId)
        break
      case 'delete':
        deleteProject(targetId, project.name)
        break
    }
  } else if (type === 'note') {
    const doc = editorStore.documents.find((d) => d.id === targetId)
    if (!doc) return

    switch (action) {
      case 'rename':
        startRenameNote(targetId, doc.title)
        break
      case 'newSubnote':
        createSubnote(targetId)
        break
      case 'moveToGeneral':
        moveNoteToGeneral(targetId)
        break
      case 'delete':
        deleteDocument(doc, new MouseEvent('click'))
        break
    }
  }

  hideContextMenu()
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`

  return date.toLocaleDateString()
}

function toggleSidebar() {
  layoutStore.toggleSidebar()
}

function isProjectExpanded(id: string) {
  return projectStore.expandedFolderIds.has(id)
}

function toggleProjectExpanded(id: string) {
  projectStore.toggleFolderExpanded(id)
}

// Close context menu on click outside
function onDocumentClick() {
  hideContextMenu()
}

// Tab definitions
const tabs = [
  { id: 'documents' as SidebarTab, icon: FileText, label: 'Documents' },
  { id: 'toc' as SidebarTab, icon: List, label: 'Table of Contents' },
]
</script>

<template>
  <aside
    class="sidebar"
    :class="{ collapsed: !sidebarVisible }"
    :style="{ width: sidebarVisible ? `${sidebarWidth}px` : '48px' }"
    @click="onDocumentClick"
  >
    <!-- Collapsed state - icon buttons -->
    <div
      v-if="!sidebarVisible"
      class="sidebar-collapsed"
    >
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="collapsed-tab-btn"
        :class="{ active: activeTab === tab.id }"
        :title="tab.label"
        @click="handleCollapsedTabClick(tab.id)"
      >
        <component
          :is="tab.icon"
          :size="18"
        />
      </button>
      <div class="spacer"></div>
      <button
        class="collapsed-tab-btn"
        title="Expand Sidebar"
        @click="toggleSidebar"
      >
        <ChevronRight :size="18" />
      </button>
    </div>

    <!-- Expanded state -->
    <div
      v-else
      class="sidebar-expanded"
    >
      <!-- Action buttons with inline search -->
      <div class="quick-actions">
        <button
          class="quick-action-btn primary"
          title="New Document"
          @click="createNewDocument()"
        >
          <FilePlus :size="14" />
        </button>
        <button
          class="quick-action-btn"
          title="New Project"
          @click="createProject(null)"
        >
          <FolderPlus :size="14" />
        </button>
        <div class="inline-search">
          <Search
            :size="12"
            class="search-icon"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search..."
          />
        </div>
      </div>

      <!-- Documents Panel -->
      <div class="panel documents-panel">
        <!-- Tree view -->
        <div class="tree-view">
          <!-- Projects -->
          <template
            v-for="project in projectStore.rootFolders"
            :key="project.id"
          >
            <div class="tree-section">
              <!-- Project header (drop target for notes) -->
              <div
                class="tree-item project-item"
                :class="{
                  expanded: isProjectExpanded(project.id),
                  'drag-over':
                    dragState.dropTargetId === project.id && dragState.dropTargetType === 'project',
                }"
                :data-item-id="project.id"
                @click="toggleProjectExpanded(project.id)"
                @contextmenu="showContextMenu($event, 'project', project.id)"
                @dragover="handleDragOver($event, project.id, 'project')"
                @dragleave="handleDragLeave"
                @drop="handleDrop($event, project.id, 'project')"
              >
                <button
                  class="expand-btn"
                  @click.stop="toggleProjectExpanded(project.id)"
                >
                  <ChevronRightIcon
                    :size="14"
                    :class="{ rotated: isProjectExpanded(project.id) }"
                  />
                </button>
                <component
                  :is="isProjectExpanded(project.id) ? FolderOpen : Folder"
                  :size="16"
                  class="item-icon folder-icon"
                />

                <!-- Editing state -->
                <template v-if="editingProjectId === project.id">
                  <input
                    ref="editInputRef"
                    v-model="editingProjectName"
                    class="inline-edit"
                    @keyup.enter="submitRenameProject"
                    @keyup.escape="cancelRenameProject"
                    @blur="submitRenameProject"
                    @click.stop
                  />
                </template>
                <template v-else>
                  <span class="item-name">{{ project.name }}</span>
                  <span class="item-count">{{ getProjectDocuments(project.id).length }}</span>
                </template>

                <button
                  class="more-btn"
                  title="More actions"
                  @click.stop="showContextMenu($event, 'project', project.id)"
                >
                  <MoreHorizontal :size="14" />
                </button>
              </div>

              <!-- Project contents (when expanded) -->
              <div
                v-show="isProjectExpanded(project.id)"
                class="tree-children"
              >
                <!-- New project input (for subproject) -->
                <div
                  v-if="showNewProjectInput && newProjectParentId === project.id"
                  class="new-item-input"
                >
                  <Folder
                    :size="14"
                    class="item-icon folder-icon"
                  />
                  <input
                    ref="newProjectInputRef"
                    v-model="newProjectName"
                    placeholder="Project name..."
                    @keyup.enter="submitNewProject"
                    @keyup.escape="cancelNewProject"
                    @blur="submitNewProject"
                  />
                </div>

                <!-- Subprojects (recursive - simplified for now) -->
                <template
                  v-for="subproject in projectStore.folders.filter(
                    (f) => f.parent_id === project.id
                  )"
                  :key="subproject.id"
                >
                  <div
                    class="tree-item project-item sub-project"
                    :class="{
                      'drag-over':
                        dragState.dropTargetId === subproject.id &&
                        dragState.dropTargetType === 'project',
                    }"
                    :data-item-id="subproject.id"
                    @click="toggleProjectExpanded(subproject.id)"
                    @contextmenu="showContextMenu($event, 'project', subproject.id)"
                    @dragover="handleDragOver($event, subproject.id, 'project')"
                    @dragleave="handleDragLeave"
                    @drop="handleDrop($event, subproject.id, 'project')"
                  >
                    <button
                      class="expand-btn"
                      @click.stop="toggleProjectExpanded(subproject.id)"
                    >
                      <ChevronRightIcon
                        :size="14"
                        :class="{ rotated: isProjectExpanded(subproject.id) }"
                      />
                    </button>
                    <component
                      :is="isProjectExpanded(subproject.id) ? FolderOpen : Folder"
                      :size="14"
                      class="item-icon folder-icon"
                    />

                    <template v-if="editingProjectId === subproject.id">
                      <input
                        ref="editInputRef"
                        v-model="editingProjectName"
                        class="inline-edit"
                        @keyup.enter="submitRenameProject"
                        @keyup.escape="cancelRenameProject"
                        @blur="submitRenameProject"
                        @click.stop
                      />
                    </template>
                    <template v-else>
                      <span class="item-name">{{ subproject.name }}</span>
                      <span class="item-count">{{
                        getProjectDocuments(subproject.id).length
                      }}</span>
                    </template>

                    <button
                      class="more-btn"
                      @click.stop="showContextMenu($event, 'project', subproject.id)"
                    >
                      <MoreHorizontal :size="14" />
                    </button>
                  </div>

                  <!-- Subproject documents -->
                  <div
                    v-show="isProjectExpanded(subproject.id)"
                    class="tree-children"
                  >
                    <div
                      v-for="doc in getProjectDocuments(subproject.id)"
                      :key="doc.id"
                      class="tree-item doc-item"
                      :class="{ active: isNoteActive(doc.id) }"
                      @click.stop="openDocument(doc)"
                      @contextmenu="showContextMenu($event, 'note', doc.id)"
                    >
                      <FileText
                        :size="14"
                        class="item-icon doc-icon"
                      />
                      <span class="item-name">{{ doc.title }}</span>
                      <button
                        class="delete-btn"
                        title="Delete"
                        @click.stop="deleteDocument(doc, $event)"
                      >
                        <Trash2 :size="12" />
                      </button>
                    </div>
                  </div>
                </template>

                <!-- Project documents (hierarchical) -->
                <template
                  v-for="doc in getProjectDocuments(project.id)"
                  :key="doc.id"
                >
                  <!-- Document item -->
                  <div
                    class="tree-item doc-item"
                    :class="{
                      active: isNoteActive(doc.id),
                      'drag-over': dragState.dropTargetId === doc.id,
                    }"
                    :data-item-id="doc.id"
                    draggable="true"
                    @click.stop="
                      hasNoteChildren(doc.id) ? toggleNoteExpanded(doc.id) : openDocument(doc)
                    "
                    @dblclick.stop="openDocument(doc)"
                    @contextmenu="showContextMenu($event, 'note', doc.id)"
                    @dragstart="handleDragStart($event, doc.id, 'note')"
                    @dragend="handleDragEnd"
                    @dragover="handleDragOver($event, doc.id, 'note')"
                    @dragleave="handleDragLeave"
                    @drop="handleDrop($event, doc.id, 'note')"
                  >
                    <!-- Expand button for notes with children -->
                    <button
                      v-if="hasNoteChildren(doc.id)"
                      class="expand-btn"
                      @click.stop="toggleNoteExpanded(doc.id)"
                    >
                      <ChevronRightIcon
                        :size="14"
                        :class="{ rotated: isNoteExpanded(doc.id) }"
                      />
                    </button>
                    <span
                      v-else
                      class="expand-placeholder"
                    ></span>

                    <FileText
                      :size="14"
                      class="item-icon doc-icon"
                    />

                    <!-- Editing state -->
                    <template v-if="editingNoteId === doc.id">
                      <input
                        ref="noteEditInputRef"
                        v-model="editingNoteTitle"
                        class="inline-edit"
                        @keyup.enter="submitRenameNote"
                        @keyup.escape="cancelRenameNote"
                        @blur="submitRenameNote"
                        @click.stop
                      />
                    </template>
                    <template v-else>
                      <span class="item-name">{{ doc.title }}</span>
                    </template>

                    <button
                      class="delete-btn"
                      title="Delete"
                      @click.stop="deleteDocument(doc, $event)"
                    >
                      <Trash2 :size="12" />
                    </button>
                  </div>

                  <!-- Subnotes (children) -->
                  <div
                    v-if="hasNoteChildren(doc.id) && isNoteExpanded(doc.id)"
                    class="tree-children subnotes"
                  >
                    <template
                      v-for="subnote in getNoteChildren(doc.id)"
                      :key="subnote.id"
                    >
                      <div
                        class="tree-item doc-item subnote"
                        :class="{
                          active: isNoteActive(subnote.id),
                          'drag-over': dragState.dropTargetId === subnote.id,
                        }"
                        :data-item-id="subnote.id"
                        draggable="true"
                        @click.stop="openDocument(subnote)"
                        @contextmenu="showContextMenu($event, 'note', subnote.id)"
                        @dragstart="handleDragStart($event, subnote.id, 'note')"
                        @dragend="handleDragEnd"
                        @dragover="handleDragOver($event, subnote.id, 'note')"
                        @dragleave="handleDragLeave"
                        @drop="handleDrop($event, subnote.id, 'note')"
                      >
                        <CornerDownRight
                          :size="12"
                          class="subnote-indicator"
                        />
                        <FileText
                          :size="14"
                          class="item-icon doc-icon"
                        />

                        <template v-if="editingNoteId === subnote.id">
                          <input
                            ref="noteEditInputRef"
                            v-model="editingNoteTitle"
                            class="inline-edit"
                            @keyup.enter="submitRenameNote"
                            @keyup.escape="cancelRenameNote"
                            @blur="submitRenameNote"
                            @click.stop
                          />
                        </template>
                        <template v-else>
                          <span class="item-name">{{ subnote.title }}</span>
                        </template>

                        <button
                          class="delete-btn"
                          title="Delete"
                          @click.stop="deleteDocument(subnote, $event)"
                        >
                          <Trash2 :size="12" />
                        </button>
                      </div>
                    </template>
                  </div>
                </template>

                <!-- Empty project state -->
                <div
                  v-if="
                    getProjectDocuments(project.id).length === 0 &&
                    projectStore.folders.filter((f) => f.parent_id === project.id).length === 0
                  "
                  class="empty-project"
                >
                  <span>Empty project</span>
                  <button
                    class="add-doc-btn"
                    @click.stop="createNewDocument(project.id)"
                  >
                    <Plus :size="12" />
                    Add note
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- New root project input -->
          <div
            v-if="showNewProjectInput && newProjectParentId === null"
            class="new-item-input root-level"
          >
            <Folder
              :size="16"
              class="item-icon folder-icon"
            />
            <input
              ref="newProjectInputRef"
              v-model="newProjectName"
              placeholder="Project name..."
              @keyup.enter="submitNewProject"
              @keyup.escape="cancelNewProject"
              @blur="submitNewProject"
            />
          </div>

          <!-- General Documents Section (drop zone) -->
          <div
            class="tree-section general-section"
            :class="{ 'drag-over': dragState.dropTargetType === 'general' }"
            @dragover="handleDragOver($event, '', 'general')"
            @dragleave="handleDragLeave"
            @drop="handleDrop($event, '', 'general')"
          >
            <div class="section-header">
              <FileText
                :size="14"
                class="section-icon"
              />
              <span>General Notes</span>
              <span class="item-count">{{ generalDocuments.length }}</span>
            </div>

            <div class="tree-children">
              <template
                v-for="doc in generalDocuments"
                :key="doc.id"
              >
                <div
                  class="tree-item doc-item"
                  :class="{
                    active: isNoteActive(doc.id),
                    'drag-over': dragState.dropTargetId === doc.id,
                  }"
                  :data-item-id="doc.id"
                  draggable="true"
                  @click.stop="
                    hasNoteChildren(doc.id) ? toggleNoteExpanded(doc.id) : openDocument(doc)
                  "
                  @dblclick.stop="openDocument(doc)"
                  @contextmenu="showContextMenu($event, 'note', doc.id)"
                  @dragstart="handleDragStart($event, doc.id, 'note')"
                  @dragend="handleDragEnd"
                  @dragover.stop="handleDragOver($event, doc.id, 'note')"
                  @dragleave="handleDragLeave"
                  @drop.stop="handleDrop($event, doc.id, 'note')"
                >
                  <!-- Expand button for notes with children -->
                  <button
                    v-if="hasNoteChildren(doc.id)"
                    class="expand-btn"
                    @click.stop="toggleNoteExpanded(doc.id)"
                  >
                    <ChevronRightIcon
                      :size="14"
                      :class="{ rotated: isNoteExpanded(doc.id) }"
                    />
                  </button>
                  <span
                    v-else
                    class="expand-placeholder"
                  ></span>

                  <FileText
                    :size="14"
                    class="item-icon doc-icon"
                  />

                  <!-- Editing state -->
                  <template v-if="editingNoteId === doc.id">
                    <input
                      ref="noteEditInputRef"
                      v-model="editingNoteTitle"
                      class="inline-edit"
                      @keyup.enter="submitRenameNote"
                      @keyup.escape="cancelRenameNote"
                      @blur="submitRenameNote"
                      @click.stop
                    />
                  </template>
                  <template v-else>
                    <span class="item-name">{{ doc.title }}</span>
                    <span class="item-meta">{{ formatDate(doc.updated_at) }}</span>
                  </template>

                  <button
                    class="delete-btn"
                    title="Delete"
                    @click.stop="deleteDocument(doc, $event)"
                  >
                    <Trash2 :size="12" />
                  </button>
                </div>

                <!-- Subnotes (children) for general notes -->
                <div
                  v-if="hasNoteChildren(doc.id) && isNoteExpanded(doc.id)"
                  class="tree-children subnotes"
                >
                  <template
                    v-for="subnote in getNoteChildren(doc.id)"
                    :key="subnote.id"
                  >
                    <div
                      class="tree-item doc-item subnote"
                      :class="{
                        active: isNoteActive(subnote.id),
                        'drag-over': dragState.dropTargetId === subnote.id,
                      }"
                      :data-item-id="subnote.id"
                      draggable="true"
                      @click.stop="openDocument(subnote)"
                      @contextmenu="showContextMenu($event, 'note', subnote.id)"
                      @dragstart="handleDragStart($event, subnote.id, 'note')"
                      @dragend="handleDragEnd"
                      @dragover.stop="handleDragOver($event, subnote.id, 'note')"
                      @dragleave="handleDragLeave"
                      @drop.stop="handleDrop($event, subnote.id, 'note')"
                    >
                      <CornerDownRight
                        :size="12"
                        class="subnote-indicator"
                      />
                      <FileText
                        :size="14"
                        class="item-icon doc-icon"
                      />

                      <template v-if="editingNoteId === subnote.id">
                        <input
                          ref="noteEditInputRef"
                          v-model="editingNoteTitle"
                          class="inline-edit"
                          @keyup.enter="submitRenameNote"
                          @keyup.escape="cancelRenameNote"
                          @blur="submitRenameNote"
                          @click.stop
                        />
                      </template>
                      <template v-else>
                        <span class="item-name">{{ subnote.title }}</span>
                      </template>

                      <button
                        class="delete-btn"
                        title="Delete"
                        @click.stop="deleteDocument(subnote, $event)"
                      >
                        <Trash2 :size="12" />
                      </button>
                    </div>
                  </template>
                </div>
              </template>

              <div
                v-if="generalDocuments.length === 0"
                class="empty-state"
              >
                <p v-if="searchQuery">No documents match your search</p>
                <p v-else>No general notes yet</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TOC Panel -->
      <div
        v-show="activeTab === 'toc'"
        class="panel toc-panel"
      >
        <TableOfContents />
      </div>

      <!-- User Profile Section -->
      <div
        ref="userMenuRef"
        class="user-section"
      >
        <button
          class="user-profile-btn"
          @click="toggleUserMenu"
        >
          <div class="user-avatar">
            <span>{{ userInitial }}</span>
          </div>
          <div class="user-info">
            <span class="user-name">{{ userDisplayName }}</span>
            <span
              v-if="!authStore.isAuthenticated"
              class="user-badge guest"
              >Guest</span
            >
            <span
              v-else
              class="user-badge"
              >Free</span
            >
          </div>
          <ChevronUp
            :size="16"
            class="expand-icon"
            :class="{ rotated: !showUserMenu }"
          />
        </button>

        <!-- User Menu Dropdown -->
        <Transition name="slide-up">
          <div
            v-if="showUserMenu"
            class="user-menu"
            @click.stop
          >
            <!-- Theme Toggle -->
            <div class="theme-toggle">
              <button
                :class="{ active: currentTheme === 'light' }"
                @click="setTheme('light')"
              >
                <Sun :size="14" />
                Light
              </button>
              <button
                :class="{ active: currentTheme === 'dark' }"
                @click="setTheme('dark')"
              >
                <Moon :size="14" />
                Dark
              </button>
              <button
                :class="{ active: currentTheme === 'system' }"
                @click="setTheme('system')"
              >
                <Monitor :size="14" />
                System
              </button>
            </div>

            <div class="menu-divider"></div>

            <button
              class="menu-item"
              @click="goToSettings"
            >
              <Settings :size="16" />
              <span>Settings</span>
              <span class="shortcut">⌘ .</span>
            </button>

            <button
              class="menu-item"
              @click="closeUserMenu"
            >
              <MessageCircle :size="16" />
              <span>Join Discord</span>
            </button>

            <button
              class="menu-item"
              @click="closeUserMenu"
            >
              <Trash2 :size="16" />
              <span>Trash</span>
            </button>

            <div class="menu-divider"></div>

            <template v-if="authStore.isAuthenticated">
              <button
                class="menu-item danger"
                @click="signOut"
              >
                <LogOut :size="16" />
                <span>Log out</span>
              </button>
            </template>
            <template v-else>
              <button
                class="menu-item primary"
                @click="goToAuth"
              >
                <User :size="16" />
                <span>Sign In</span>
              </button>
            </template>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.show"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <template v-if="contextMenu.type === 'project'">
          <button @click="handleContextMenuAction('newNote')">
            <FilePlus :size="14" />
            <span>New Note</span>
          </button>
          <button @click="handleContextMenuAction('newSubproject')">
            <FolderPlus :size="14" />
            <span>New Subproject</span>
          </button>
          <div class="menu-divider"></div>
          <button @click="handleContextMenuAction('rename')">
            <Edit2 :size="14" />
            <span>Rename</span>
          </button>
          <button
            class="danger"
            @click="handleContextMenuAction('delete')"
          >
            <Trash2 :size="14" />
            <span>Delete</span>
          </button>
        </template>
        <template v-else-if="contextMenu.type === 'note'">
          <button @click="handleContextMenuAction('newSubnote')">
            <CornerDownRight :size="14" />
            <span>New Subnote</span>
          </button>
          <div class="menu-divider"></div>
          <button @click="handleContextMenuAction('rename')">
            <Edit2 :size="14" />
            <span>Rename</span>
          </button>
          <button @click="handleContextMenuAction('moveToGeneral')">
            <FileText :size="14" />
            <span>Move to General</span>
          </button>
          <div class="menu-divider"></div>
          <button
            class="danger"
            @click="handleContextMenuAction('delete')"
          >
            <Trash2 :size="14" />
            <span>Delete</span>
          </button>
        </template>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.sidebar {
  height: 100%;
  background: var(--sidebar-bg, #010409);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
  flex-shrink: 0;
}

/* Collapsed state */
.sidebar-collapsed {
  display: flex;
  flex-direction: column;
  padding: 8px;
  height: 100%;
}

.collapsed-tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-bottom: 4px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #8b949e;
  cursor: pointer;
}

.collapsed-tab-btn:hover,
.collapsed-tab-btn.active {
  background: rgba(255, 255, 255, 0.06);
  color: #e6edf3;
}

.spacer {
  flex: 1;
}

/* Expanded state */
.sidebar-expanded {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding-top: 12px;
  animation: sidebar-fade-in 0.3s ease;
}

@keyframes sidebar-fade-in {
  from {
    opacity: 0.8;
  }
  to {
    opacity: 1;
  }
}

/* Quick Actions with inline search - no border for unified look */
.quick-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: none;
}

.quick-action-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid #30363d;
  background: transparent;
  color: var(--text-color-secondary, #8b949e);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.quick-action-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e6edf3;
  border-color: #8b949e;
}

.quick-action-btn.primary {
  background: var(--primary-color, #7c9ef8);
  color: #ffffff;
  border-color: transparent;
}

.quick-action-btn.primary:hover {
  opacity: 0.9;
  background: var(--primary-color, #7c9ef8);
  color: #ffffff;
}

/* Inline search in quick actions */
.inline-search {
  position: relative;
  flex: 1;
  min-width: 0;
}

.inline-search .search-icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-color-secondary, #666);
  pointer-events: none;
}

.inline-search input {
  width: 100%;
  padding: 5px 8px 5px 26px;
  background: rgba(22, 27, 34, 0.6);
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #e6edf3;
  font-size: 12px;
  height: 28px;
  box-sizing: border-box;
}

.inline-search input:focus {
  outline: none;
  border-color: #58a6ff;
}

.inline-search input::placeholder {
  color: #6e7681;
}

/* Panels */
.panel {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Documents Panel */
.documents-panel {
  padding: 0;
}

.panel-actions {
  display: flex;
  gap: 8px;
  padding: 12px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1;
  padding: 8px 12px;
  background: transparent;
  color: #e6edf3;
  border: 1px solid #30363d;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: #8b949e;
}

.action-btn.primary {
  background: #238636;
  border-color: #238636;
  color: white;
}

.action-btn.primary:hover {
  background: #2ea043;
}

/* Tree View */
.tree-view {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
}

.tree-section {
  margin-bottom: 4px;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.tree-item:hover {
  background: transparent;
}

.tree-item:hover .item-name {
  color: var(--text-color);
}

.tree-item:hover .more-btn,
.tree-item:hover .delete-btn {
  opacity: 1;
}

.tree-item.active {
  background: transparent;
}

.tree-item.active .item-name {
  color: #58a6ff;
  font-weight: 500;
}

.tree-item.active .item-icon {
  color: #58a6ff;
}

.tree-children {
  padding-left: 16px;
}

.expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--text-color-secondary, #888);
  cursor: pointer;
  flex-shrink: 0;
}

.expand-btn svg {
  transition: transform 0.15s;
}

.expand-btn svg.rotated {
  transform: rotate(90deg);
}

.item-icon {
  flex-shrink: 0;
  color: var(--text-color-secondary, #888);
}

.folder-icon {
  color: #f0c36d;
}

.doc-icon {
  color: var(--text-color-secondary, #888);
}

.tree-item.active .doc-icon {
  color: #58a6ff;
}

.item-name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-count {
  font-size: 11px;
  color: #8b949e;
  background: rgba(255, 255, 255, 0.04);
  padding: 1px 6px;
  border-radius: 10px;
  flex-shrink: 0;
}

.item-meta {
  font-size: 10px;
  color: var(--text-color-secondary, #666);
  flex-shrink: 0;
}

.more-btn,
.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--text-color-secondary, #888);
  border-radius: 4px;
  opacity: 0;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}

.more-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e6edf3;
}

.delete-btn:hover {
  background: rgba(255, 0, 0, 0.15);
  color: #ff6b6b;
}

.sub-project {
  padding-left: 4px;
}

.sub-project .item-icon {
  width: 14px;
  height: 14px;
}

/* Expand placeholder (for alignment) */
.expand-placeholder {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* Subnote styles */
.subnote {
  padding-left: 8px;
}

.subnote-indicator {
  color: var(--text-color-secondary, #666);
  flex-shrink: 0;
  margin-right: 2px;
}

/* Drag and drop styles */
.tree-item.dragging {
  opacity: 0.5;
  background: rgba(88, 166, 255, 0.15);
}

.tree-item.drag-over,
.tree-section.drag-over {
  outline: 2px solid #58a6ff;
  outline-offset: -2px;
  background: rgba(88, 166, 255, 0.15);
}

.general-section.drag-over {
  background: rgba(88, 166, 255, 0.1);
  border-radius: 6px;
}

/* Inline edit */
.inline-edit {
  flex: 1;
  background: #0d1117;
  border: 1px solid #58a6ff;
  border-radius: 4px;
  padding: 2px 6px;
  color: #e6edf3;
  font-size: 13px;
  outline: none;
}

/* New item input */
.new-item-input {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
}

.new-item-input.root-level {
  padding-left: 28px;
}

.new-item-input input {
  flex: 1;
  background: #0d1117;
  border: 1px solid #58a6ff;
  border-radius: 4px;
  padding: 4px 8px;
  color: #e6edf3;
  font-size: 13px;
  outline: none;
}

/* Empty states */
.empty-project {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-color-secondary, #666);
}

.add-doc-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: transparent;
  border: 1px dashed #30363d;
  border-radius: 4px;
  color: #8b949e;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.add-doc-btn:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: #58a6ff;
  color: #58a6ff;
}

.empty-state {
  padding: 16px;
  text-align: center;
  color: var(--text-color-secondary, #888);
  font-size: 12px;
}

/* General section */
.general-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: none;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary, #888);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-icon {
  color: var(--text-color-secondary, #888);
}

/* TOC Panel */
.toc-panel {
  overflow: hidden;
}

.toc-panel :deep(.toc-panel) {
  height: 100%;
}

/* Context Menu */
.context-menu {
  position: fixed;
  z-index: 10000;
  min-width: 160px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  padding: 4px;
  animation: fadeIn 0.1s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.context-menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-color, #fff);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.context-menu button:hover {
  background: rgba(255, 255, 255, 0.06);
}

.context-menu button.danger {
  color: #ff6b6b;
}

.context-menu button.danger:hover {
  background: rgba(255, 107, 107, 0.15);
}

.menu-divider {
  height: 1px;
  background: #21262d;
  margin: 4px 8px;
}

/* User Profile Section */
.user-section {
  position: relative;
  padding: 8px 12px;
  border-top: none;
  margin-top: auto;
}

.user-profile-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.user-profile-btn:hover {
  background: rgba(255, 255, 255, 0.04);
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.user-avatar span {
  font-size: 14px;
  font-weight: 600;
  color: white;
}

.user-info {
  flex: 1;
  text-align: left;
  min-width: 0;
}

.user-name {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-badge {
  display: inline-block;
  padding: 2px 6px;
  margin-top: 2px;
  font-size: 10px;
  font-weight: 500;
  color: #8b949e;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
}

.user-badge.guest {
  color: #888;
}

.expand-icon {
  color: var(--text-color-secondary);
  transition: transform 0.2s;
}

.expand-icon.rotated {
  transform: rotate(180deg);
}

/* User Menu Dropdown */
.user-menu {
  position: absolute;
  bottom: 100%;
  left: 12px;
  right: 12px;
  margin-bottom: 8px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  padding: 8px;
  z-index: 100;
}

/* Theme Toggle */
.theme-toggle {
  display: flex;
  background: rgba(22, 27, 34, 0.8);
  border-radius: 8px;
  padding: 4px;
  gap: 2px;
}

.theme-toggle button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 4px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.theme-toggle button:hover {
  color: #e6edf3;
}

.theme-toggle button.active {
  background: rgba(255, 255, 255, 0.08);
  color: #e6edf3;
  box-shadow: none;
}

/* Menu Items */
.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--text-color);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.menu-item .shortcut {
  margin-left: auto;
  font-size: 11px;
  color: #8b949e;
  background: rgba(255, 255, 255, 0.04);
  padding: 2px 6px;
  border-radius: 4px;
}

.menu-item.danger {
  color: #ff6b6b;
}

.menu-item.danger:hover {
  background: rgba(255, 107, 107, 0.15);
}

.menu-item.primary {
  color: #58a6ff;
}

.menu-item.primary:hover {
  background: rgba(88, 166, 255, 0.15);
}

/* Slide up animation */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
