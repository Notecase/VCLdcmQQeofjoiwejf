/**
 * Project Store - Folder and file tree management
 * TypeScript Pinia store for project/workspace management
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as projectsService from '@/services/projects.service'
import * as notesService from '@/services/notes.service'
import { useAuthStore } from './auth'
import { buildProjectTree, type Project, type ProjectTreeNode, type Note } from '@inkdown/shared'

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

  // Computed: Build hierarchical tree structure using buildProjectTree
  const projectTree = computed<ProjectTreeNode[]>(() => {
    // Convert ProjectFolder[] to Project[] format for tree building
    const projects: Project[] = folders.value.map((folder) => ({
      id: folder.id,
      user_id: '', // Not needed for tree building
      parent_id: folder.parent_id,
      path: '',
      depth: 0,
      name: folder.name,
      description: null,
      icon: '📁',
      color: '#6366f1',
      note_count: 0,
      subproject_count: 0,
      sort_order: 0,
      is_favorite: false,
      is_archived: false,
      is_deleted: false,
      created_at: folder.created_at,
      updated_at: folder.updated_at,
    }))

    return buildProjectTree(projects)
  })

  const rootFolders = computed(() => {
    return projectTree.value.filter((item) => item.parent_id === null)
  })

  // Actions
  async function loadFolders() {
    isLoading.value = true
    try {
      const authStore = useAuthStore()

      if (!authStore.user?.id) {
        folders.value = []
        return
      }

      // Fetch from database using projects.service
      const result = await projectsService.getProjects(authStore.user.id)

      if (result.error) {
        console.error('Failed to load projects:', result.error)
        folders.value = []
        return
      }

      // Map Project type to ProjectFolder type
      folders.value = (result.data || []).map((project) => ({
        id: project.id,
        name: project.name,
        parent_id: project.parent_id,
        is_expanded: expandedFolderIds.value.has(project.id),
        created_at: project.created_at,
        updated_at: project.updated_at,
      }))
    } catch (error) {
      console.error('Error loading folders:', error)
      folders.value = []
    } finally {
      isLoading.value = false
    }
  }

  async function createFolder(name: string, parentId: string | null = null) {
    const authStore = useAuthStore()

    if (!authStore.user?.id) {
      console.warn('Cannot create folder: user not authenticated')
      return null
    }

    try {
      // Use database service
      const result = await projectsService.createProject(authStore.user.id, {
        name,
        parent_id: parentId ?? undefined,
      })

      if (result.error) {
        console.error('Failed to create project:', result.error)
        return null
      }

      const project = Array.isArray(result.data) ? result.data[0] : result.data

      if (project) {
        const newFolder: ProjectFolder = {
          id: project.id,
          name: project.name,
          parent_id: project.parent_id,
          is_expanded: false,
          created_at: project.created_at,
          updated_at: project.updated_at,
        }
        folders.value.push(newFolder)
        return newFolder
      }
    } catch (error) {
      console.error('Error creating folder:', error)
    }

    return null
  }

  async function renameFolder(id: string, newName: string) {
    try {
      const result = await projectsService.updateProject(id, { name: newName })

      if (result.error) {
        console.error('Failed to rename project:', result.error)
        return
      }

      // Update local state
      const folder = folders.value.find((f) => f.id === id)
      if (folder) {
        folder.name = newName
        folder.updated_at = new Date().toISOString()
      }
    } catch (error) {
      console.error('Error renaming folder:', error)
    }
  }

  async function deleteFolder(id: string) {
    try {
      const result = await projectsService.deleteProject(id)

      if (result.error) {
        console.error('Failed to delete project:', result.error)
        return
      }

      // Update local state
      folders.value = folders.value.filter((f) => f.id !== id)
      expandedFolderIds.value.delete(id)
    } catch (error) {
      console.error('Error deleting folder:', error)
    }
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
    folders.value.forEach((f) => expandedFolderIds.value.add(f.id))
  }

  /**
   * Load notes for a specific project
   */
  async function loadProjectNotes(projectId: string): Promise<Note[]> {
    const authStore = useAuthStore()
    if (!authStore.user?.id) return []

    try {
      const result = await notesService.getProjectNotes(authStore.user.id, projectId)
      if (result.error) {
        console.error('Failed to load project notes:', result.error)
        return []
      }
      return result.data || []
    } catch (error) {
      console.error('Error loading project notes:', error)
      return []
    }
  }

  /**
   * Move a project to a new parent
   */
  async function moveProject(
    projectId: string,
    newParentId: string | null
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await projectsService.moveProject(projectId, newParentId)
      if (result.error) {
        console.error('Failed to move project:', result.error)
        return { success: false, error: result.error.message }
      }

      // Check RPC response for validation errors
      if (result.data && !result.data.success) {
        console.error('Move project failed:', result.data.error)
        return { success: false, error: result.data.error }
      }

      // Reload folders to get updated hierarchy
      await loadFolders()
      return { success: true }
    } catch (error) {
      console.error('Error moving project:', error)
      return { success: false, error: 'Failed to move project' }
    }
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
    expandAll,
    loadProjectNotes,
    moveProject,
  }
})
