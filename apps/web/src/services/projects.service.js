/**
 * Projects Service
 * Higher-level API for project operations using the database provider
 */
import { getDatabaseService } from './factory';
/**
 * Get all projects for a user
 */
export async function getProjects(userId, options) {
    const db = getDatabaseService();
    let query = db.from('projects')
        .select('*')
        .eq('user_id', userId)
        .eq('is_deleted', false);
    if (options?.parentId !== undefined) {
        if (options.parentId === null) {
            query = query.is('parent_id', null);
        }
        else {
            query = query.eq('parent_id', options.parentId);
        }
    }
    if (!options?.includeArchived) {
        query = query.eq('is_archived', false);
    }
    query = query.order('sort_order', { ascending: true })
        .order('updated_at', { ascending: false });
    return query.execute();
}
/**
 * Get root projects (no parent)
 */
export async function getRootProjects(userId) {
    return getProjects(userId, { parentId: null });
}
/**
 * Get subprojects of a project
 */
export async function getSubprojects(userId, parentId) {
    return getProjects(userId, { parentId });
}
/**
 * Get a single project by ID
 */
export async function getProject(projectId) {
    const db = getDatabaseService();
    return db.from('projects')
        .select('*')
        .eq('id', projectId)
        .eq('is_deleted', false)
        .single()
        .execute();
}
/**
 * Get project with all descendants (subprojects)
 */
export async function getProjectWithDescendants(userId, projectId) {
    const db = getDatabaseService();
    // Get the project first to get its path
    const projectResult = await getProject(projectId);
    if (projectResult.error || !projectResult.data?.[0]) {
        return projectResult;
    }
    const project = projectResult.data[0];
    // Get all projects with path starting with this project's path
    return db.from('projects')
        .select('*')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .like('path', `${project.path}%`)
        .order('depth', { ascending: true })
        .execute();
}
/**
 * Create a new project
 */
export async function createProject(userId, data) {
    const db = getDatabaseService();
    return db.from('projects')
        .insert({
        user_id: userId,
        name: data.name,
        parent_id: data.parent_id || null,
        description: data.description || null,
        icon: data.icon || '📁',
        color: data.color || '#6366f1'
    });
}
/**
 * Update a project
 */
export async function updateProject(projectId, data) {
    const db = getDatabaseService();
    const updateData = {};
    if (data.name !== undefined)
        updateData.name = data.name;
    if (data.description !== undefined)
        updateData.description = data.description;
    if (data.icon !== undefined)
        updateData.icon = data.icon;
    if (data.color !== undefined)
        updateData.color = data.color;
    if (data.sort_order !== undefined)
        updateData.sort_order = data.sort_order;
    if (data.is_archived !== undefined)
        updateData.is_archived = data.is_archived;
    return db.from('projects')
        .eq('id', projectId)
        .update(updateData);
}
/**
 * Move a project to a new parent using database RPC
 * Uses the move_project function with circular reference validation
 */
export async function moveProject(projectId, newParentId) {
    const db = getDatabaseService();
    return db.rpc('move_project', {
        p_project_id: projectId,
        p_new_parent_id: newParentId
    });
}
/**
 * Soft delete a project
 */
export async function deleteProject(projectId) {
    const db = getDatabaseService();
    return db.from('projects')
        .eq('id', projectId)
        .update({ is_deleted: true });
}
/**
 * Get project tree (hierarchical structure)
 */
export async function getProjectTree(userId) {
    const result = await getProjects(userId);
    if (result.error || !result.data) {
        return [];
    }
    return buildTree(result.data);
}
function buildTree(projects) {
    const map = new Map();
    const roots = [];
    // Create nodes
    for (const project of projects) {
        map.set(project.id, { ...project, children: [] });
    }
    // Build tree
    for (const project of projects) {
        const node = map.get(project.id);
        if (!project.parent_id) {
            roots.push(node);
        }
        else {
            const parent = map.get(project.parent_id);
            if (parent) {
                parent.children.push(node);
            }
            else {
                roots.push(node);
            }
        }
    }
    return roots;
}
