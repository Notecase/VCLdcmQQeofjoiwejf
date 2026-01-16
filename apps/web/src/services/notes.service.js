/**
 * Notes Service
 * Higher-level API for note operations using the database provider
 */
import { getDatabaseService } from './factory';
/**
 * Get all notes for a user
 */
export async function getNotes(userId, options) {
    const db = getDatabaseService();
    let query = db.from('notes')
        .select('*')
        .eq('user_id', userId)
        .eq('is_deleted', false);
    if (options?.projectId !== undefined) {
        if (options.projectId === null) {
            query = query.is('project_id', null);
        }
        else {
            query = query.eq('project_id', options.projectId);
        }
    }
    if (options?.parentNoteId !== undefined) {
        if (options.parentNoteId === null) {
            query = query.is('parent_note_id', null);
        }
        else {
            query = query.eq('parent_note_id', options.parentNoteId);
        }
    }
    if (!options?.includeArchived) {
        query = query.eq('is_archived', false);
    }
    query = query.order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });
    if (options?.limit) {
        query = query.limit(options.limit);
    }
    if (options?.offset) {
        query = query.offset(options.offset);
    }
    return query.execute();
}
/**
 * Get general notes (not in any project)
 */
export async function getGeneralNotes(userId, options) {
    return getNotes(userId, {
        projectId: null,
        parentNoteId: null,
        ...options
    });
}
/**
 * Get notes in a project
 */
export async function getProjectNotes(userId, projectId, options) {
    return getNotes(userId, {
        projectId,
        parentNoteId: null,
        ...options
    });
}
/**
 * Get child notes (sub-notes)
 */
export async function getChildNotes(userId, parentNoteId) {
    const db = getDatabaseService();
    return db.from('notes')
        .select('*')
        .eq('user_id', userId)
        .eq('parent_note_id', parentNoteId)
        .eq('is_deleted', false)
        .order('sort_order', { ascending: true })
        .execute();
}
/**
 * Get a single note by ID
 */
export async function getNote(noteId) {
    const db = getDatabaseService();
    return db.from('notes')
        .select('*')
        .eq('id', noteId)
        .eq('is_deleted', false)
        .single()
        .execute();
}
/**
 * Create a new note
 */
export async function createNote(userId, data) {
    const db = getDatabaseService();
    return db.from('notes')
        .insert({
        user_id: userId,
        title: data.title || 'Untitled',
        content: data.content || '',
        project_id: data.project_id || null,
        parent_note_id: data.parent_note_id || null
    });
}
/**
 * Update a note
 */
export async function updateNote(noteId, data) {
    const db = getDatabaseService();
    const updateData = {};
    if (data.title !== undefined)
        updateData.title = data.title;
    if (data.content !== undefined)
        updateData.content = data.content;
    if (data.word_count !== undefined)
        updateData.word_count = data.word_count;
    if (data.character_count !== undefined)
        updateData.character_count = data.character_count;
    if (data.editor_state !== undefined)
        updateData.editor_state = data.editor_state;
    if (data.is_pinned !== undefined)
        updateData.is_pinned = data.is_pinned;
    if (data.is_archived !== undefined)
        updateData.is_archived = data.is_archived;
    if (data.sort_order !== undefined)
        updateData.sort_order = data.sort_order;
    console.log('[notes.service] updateNote called:', { noteId, updateData });
    const result = await db.from('notes')
        .eq('id', noteId)
        .update(updateData);
    console.log('[notes.service] updateNote result:', result);
    return result;
}
/**
 * Move a note to a new location
 */
export async function moveNote(noteId, destination) {
    const db = getDatabaseService();
    return db.rpc('move_note', {
        p_note_id: noteId,
        p_new_project_id: destination.project_id ?? null,
        p_new_parent_note_id: destination.parent_note_id ?? null
    });
}
/**
 * Soft delete a note
 */
export async function deleteNote(noteId) {
    const db = getDatabaseService();
    return db.from('notes')
        .eq('id', noteId)
        .update({
        is_deleted: true,
        deleted_at: new Date().toISOString()
    });
}
/**
 * Restore a deleted note
 */
export async function restoreNote(noteId) {
    const db = getDatabaseService();
    return db.from('notes')
        .eq('id', noteId)
        .update({
        is_deleted: false,
        deleted_at: null
    });
}
/**
 * Search notes by content (simple ilike search)
 * For more advanced search, use searchNotesFullText or searchNotesSemantic
 */
export async function searchNotes(userId, query, options) {
    const db = getDatabaseService();
    // Simple ilike search on title and content
    let dbQuery = db.from('notes')
        .select('*')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`);
    if (options?.projectId) {
        dbQuery = dbQuery.eq('project_id', options.projectId);
    }
    dbQuery = dbQuery.order('updated_at', { ascending: false });
    if (options?.limit) {
        dbQuery = dbQuery.limit(options.limit);
    }
    return dbQuery.execute();
}
/**
 * Full-text search using PostgreSQL hybrid search (keyword + semantic)
 * Requires embeddings to be generated for notes
 */
export async function searchNotesHybrid(userId, query, queryEmbedding, options) {
    const db = getDatabaseService();
    return db.rpc('search_notes_hybrid', {
        p_user_id: userId,
        p_query: query,
        p_query_embedding: queryEmbedding,
        p_limit: options?.limit || 10
    });
}
/**
 * Semantic search using vector embeddings
 */
export async function searchNotesSemantic(userId, queryEmbedding, options) {
    const db = getDatabaseService();
    return db.rpc('search_notes_semantic', {
        p_user_id: userId,
        p_query_embedding: queryEmbedding,
        p_match_threshold: options?.threshold || 0.7,
        p_match_count: options?.limit || 10
    });
}
/**
 * Get notes by tags
 */
export async function getNotesByTags(userId, tags, options) {
    const db = getDatabaseService();
    let query = db.from('notes')
        .select('*')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .contains('tags', tags)
        .order('updated_at', { ascending: false });
    if (options?.limit) {
        query = query.limit(options.limit);
    }
    return query.execute();
}
/**
 * Get favorite notes
 */
export async function getFavoriteNotes(userId, options) {
    const db = getDatabaseService();
    let query = db.from('notes')
        .select('*')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .eq('is_favorite', true)
        .order('updated_at', { ascending: false });
    if (options?.limit) {
        query = query.limit(options.limit);
    }
    return query.execute();
}
/**
 * Get recently viewed notes
 */
export async function getRecentNotes(userId, options) {
    const db = getDatabaseService();
    let query = db.from('notes')
        .select('*')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .not('last_viewed_at', 'is', null)
        .order('last_viewed_at', { ascending: false });
    if (options?.limit) {
        query = query.limit(options.limit);
    }
    return query.execute();
}
/**
 * Update last viewed timestamp for a note
 */
export async function markNoteViewed(noteId) {
    const db = getDatabaseService();
    return db.from('notes')
        .eq('id', noteId)
        .update({
        last_viewed_at: new Date().toISOString()
    });
}
/**
 * Toggle favorite status for a note
 */
export async function toggleNoteFavorite(noteId, isFavorite) {
    const db = getDatabaseService();
    return db.from('notes')
        .eq('id', noteId)
        .update({
        is_favorite: isFavorite
    });
}
/**
 * Update note tags
 */
export async function updateNoteTags(noteId, tags) {
    const db = getDatabaseService();
    return db.from('notes')
        .eq('id', noteId)
        .update({
        tags
    });
}
