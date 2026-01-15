/**
 * Project Store - Folder and file tree management
 * TypeScript Pinia store for project/workspace management
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface ProjectFolder {
  id: string
  name: string
  parent_id: string | null
  is_expanded: boolean
  created_at: string
  updated_at: string
}

export interface ProjectItem {
  id: string
  type: 'folder' | 'document'
  name: string
  parent_id: string | null
  children?: ProjectItem[]
  is_expanded?: boolean
  document_id?: string
}

export const useProjectStore = defineStore('project', () => {
  // State
  const folders = ref<ProjectFolder[]>([])
  const isLoading = ref(false)
  const currentFolderId = ref<string | null>(null)
  const expandedFolderIds = ref<Set<string>>(new Set())

  // Computed: Build tree structure
  const projectTree = computed<ProjectItem[]>(() => {
    // For now, return a flat list since we don't have folder hierarchy yet
    // This will be populated from the database in Phase 3
    return folders.value.map(folder => ({
      id: folder.id,
      type: 'folder' as const,
      name: folder.name,
      parent_id: folder.parent_id,
      is_expanded: expandedFolderIds.value.has(folder.id),
      children: []
    }))
  })

  const rootFolders = computed(() => {
    return projectTree.value.filter(item => item.parent_id === null)
  })

  // Actions
  async function loadFolders() {
    isLoading.value = true
    try {
      // TODO: Fetch from database in Phase 3
      // For now, folders are empty until database is set up
      folders.value = []
    } finally {
      isLoading.value = false
    }
  }

  async function createFolder(name: string, parentId: string | null = null) {
    const newFolder: ProjectFolder = {
      id: crypto.randomUUID(),
      name,
      parent_id: parentId,
      is_expanded: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    folders.value.push(newFolder)
    return newFolder
  }

  async function renameFolder(id: string, newName: string) {
    const folder = folders.value.find(f => f.id === id)
    if (folder) {
      folder.name = newName
      folder.updated_at = new Date().toISOString()
    }
  }

  async function deleteFolder(id: string) {
    folders.value = folders.value.filter(f => f.id !== id)
    expandedFolderIds.value.delete(id)
  }

  function toggleFolderExpanded(id: string) {
    if (expandedFolderIds.value.has(id)) {
      expandedFolderIds.value.delete(id)
    } else {
      expandedFolderIds.value.add(id)
    }
  }

  function setCurrentFolder(id: string | null) {
    currentFolderId.value = id
  }

  function expandFolder(id: string) {
    expandedFolderIds.value.add(id)
  }

  function collapseFolder(id: string) {
    expandedFolderIds.value.delete(id)
  }

  function collapseAll() {
    expandedFolderIds.value.clear()
  }

  function expandAll() {
    folders.value.forEach(f => expandedFolderIds.value.add(f.id))
  }

  return {
    // State
    folders,
    isLoading,
    currentFolderId,
    expandedFolderIds,

    // Computed
    projectTree,
    rootFolders,

    // Actions
    loadFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    toggleFolderExpanded,
    setCurrentFolder,
    expandFolder,
    collapseFolder,
    collapseAll,
    expandAll
  }
})
