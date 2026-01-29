/**
 * Tree Utilities
 * Functions for building hierarchical trees from flat arrays
 */

import type { Project, Note, ProjectTreeNode, NoteTreeNode, Attachment } from '../types'

/**
 * Build hierarchical tree from flat project array
 */
export function buildProjectTree(projects: Project[]): ProjectTreeNode[] {
  const map = new Map<string, ProjectTreeNode>()
  const roots: ProjectTreeNode[] = []

  // First pass: create nodes
  projects.forEach((project) => {
    map.set(project.id, {
      ...project,
      children: [],
      notes: [],
    })
  })

  // Second pass: build hierarchy
  projects.forEach((project) => {
    const node = map.get(project.id)!

    if (project.parent_id === null) {
      roots.push(node)
    } else {
      const parent = map.get(project.parent_id)
      if (parent) {
        parent.children.push(node)
      } else {
        // Parent not found, treat as root
        roots.push(node)
      }
    }
  })

  // Sort by sort_order at each level
  const sortChildren = (nodes: ProjectTreeNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order)
    nodes.forEach((node) => {
      if (node.children.length > 0) {
        sortChildren(node.children)
      }
    })
  }

  sortChildren(roots)
  return roots
}

/**
 * Build hierarchical note tree
 */
export function buildNoteTree(notes: Note[], attachments: Attachment[] = []): NoteTreeNode[] {
  const map = new Map<string, NoteTreeNode>()
  const roots: NoteTreeNode[] = []

  // Group attachments by note_id
  const attachmentsByNote = new Map<string, Attachment[]>()
  attachments.forEach((att) => {
    if (att.note_id) {
      if (!attachmentsByNote.has(att.note_id)) {
        attachmentsByNote.set(att.note_id, [])
      }
      attachmentsByNote.get(att.note_id)!.push(att)
    }
  })

  // First pass: create nodes
  notes.forEach((note) => {
    map.set(note.id, {
      ...note,
      children: [],
      attachments: attachmentsByNote.get(note.id) || [],
    })
  })

  // Second pass: build hierarchy
  notes.forEach((note) => {
    const node = map.get(note.id)!

    if (note.parent_note_id === null) {
      roots.push(node)
    } else {
      const parent = map.get(note.parent_note_id)
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }
  })

  // Sort: pinned first, then by updated_at
  const sortChildren = (nodes: NoteTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) {
        return a.is_pinned ? -1 : 1
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
    nodes.forEach((node) => {
      if (node.children.length > 0) {
        sortChildren(node.children)
      }
    })
  }

  sortChildren(roots)
  return roots
}

/**
 * Flatten tree to array (for search/filtering)
 */
export function flattenProjectTree(tree: ProjectTreeNode[]): Project[] {
  const result: Project[] = []

  const traverse = (nodes: ProjectTreeNode[]) => {
    nodes.forEach((node) => {
      result.push(node)
      if (node.children.length > 0) {
        traverse(node.children)
      }
    })
  }

  traverse(tree)
  return result
}

/**
 * Flatten note tree to array
 */
export function flattenNoteTree(tree: NoteTreeNode[]): Note[] {
  const result: Note[] = []

  const traverse = (nodes: NoteTreeNode[]) => {
    nodes.forEach((node) => {
      result.push(node)
      if (node.children.length > 0) {
        traverse(node.children)
      }
    })
  }

  traverse(tree)
  return result
}

/**
 * Find node by ID in project tree
 */
export function findProjectNode(
  tree: ProjectTreeNode[],
  projectId: string
): ProjectTreeNode | null {
  for (const node of tree) {
    if (node.id === projectId) return node
    if (node.children.length > 0) {
      const found = findProjectNode(node.children, projectId)
      if (found) return found
    }
  }
  return null
}

/**
 * Find node by ID in note tree
 */
export function findNoteNode(tree: NoteTreeNode[], noteId: string): NoteTreeNode | null {
  for (const node of tree) {
    if (node.id === noteId) return node
    if (node.children.length > 0) {
      const found = findNoteNode(node.children, noteId)
      if (found) return found
    }
  }
  return null
}

/**
 * Get path from root to project node
 */
export function getProjectPath(tree: ProjectTreeNode[], projectId: string): Project[] {
  const path: Project[] = []

  const traverse = (nodes: ProjectTreeNode[], target: string): boolean => {
    for (const node of nodes) {
      path.push(node)
      if (node.id === target) return true

      if (node.children.length > 0 && traverse(node.children, target)) {
        return true
      }

      path.pop()
    }
    return false
  }

  traverse(tree, projectId)
  return path
}

/**
 * Get path from root to note node
 */
export function getNotePath(tree: NoteTreeNode[], noteId: string): Note[] {
  const path: Note[] = []

  const traverse = (nodes: NoteTreeNode[], target: string): boolean => {
    for (const node of nodes) {
      path.push(node)
      if (node.id === target) return true

      if (node.children.length > 0 && traverse(node.children, target)) {
        return true
      }

      path.pop()
    }
    return false
  }

  traverse(tree, noteId)
  return path
}

/**
 * Get all descendants of a project
 */
export function getProjectDescendants(node: ProjectTreeNode): ProjectTreeNode[] {
  const descendants: ProjectTreeNode[] = []

  const traverse = (nodes: ProjectTreeNode[]) => {
    nodes.forEach((child) => {
      descendants.push(child)
      if (child.children.length > 0) {
        traverse(child.children)
      }
    })
  }

  traverse(node.children)
  return descendants
}

/**
 * Get all descendants of a note
 */
export function getNoteDescendants(node: NoteTreeNode): NoteTreeNode[] {
  const descendants: NoteTreeNode[] = []

  const traverse = (nodes: NoteTreeNode[]) => {
    nodes.forEach((child) => {
      descendants.push(child)
      if (child.children.length > 0) {
        traverse(child.children)
      }
    })
  }

  traverse(node.children)
  return descendants
}

/**
 * Check if moving a project to a target would create a circular reference
 */
export function wouldCreateCircular(
  tree: ProjectTreeNode[],
  nodeId: string,
  targetId: string
): boolean {
  // Can't move to itself
  if (nodeId === targetId) return true

  // Find the node to move
  const node = findProjectNode(tree, nodeId)
  if (!node) return false

  // Check if target is a descendant of node
  const descendants = getProjectDescendants(node)
  return descendants.some((d) => d.id === targetId)
}

/**
 * Check if moving a note to a target note would create a circular reference
 */
export function wouldCreateCircularNote(
  tree: NoteTreeNode[],
  nodeId: string,
  targetId: string
): boolean {
  // Can't move to itself
  if (nodeId === targetId) return true

  // Find the node to move
  const node = findNoteNode(tree, nodeId)
  if (!node) return false

  // Check if target is a descendant of node
  const descendants = getNoteDescendants(node)
  return descendants.some((d) => d.id === targetId)
}
