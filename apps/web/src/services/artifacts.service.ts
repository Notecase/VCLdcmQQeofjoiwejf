/**
 * Artifacts Service
 * CRUD operations for AI-generated artifacts using the database provider
 */
import { getDatabaseService } from './factory'
import type { DatabaseResult } from './providers'

// ============================================================================
// Types
// ============================================================================

export interface Artifact {
  id: string
  user_id: string
  note_id: string | null
  session_id: string | null
  message_id: string | null
  title: string
  html: string
  css: string
  javascript: string
  status: 'created' | 'pending' | 'inserted' | 'archived'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  inserted_at: string | null
}

export interface CreateArtifactDTO {
  note_id?: string | null
  session_id?: string | null
  message_id?: string | null
  title: string
  html: string
  css: string
  javascript: string
  status?: Artifact['status']
  metadata?: Record<string, unknown>
}

export interface UpdateArtifactDTO {
  title?: string
  html?: string
  css?: string
  javascript?: string
  status?: Artifact['status']
  metadata?: Record<string, unknown>
  inserted_at?: string | null
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Get artifacts for a user with optional filters
 */
export async function getArtifacts(
  userId: string,
  options?: {
    noteId?: string | null
    sessionId?: string | null
    status?: Artifact['status']
    includeArchived?: boolean
    limit?: number
    offset?: number
  }
): Promise<DatabaseResult<Artifact[]>> {
  const db = getDatabaseService()

  let query = db.from<Artifact>('artifacts').select('*').eq('user_id', userId)

  // Filter by note
  if (options?.noteId !== undefined) {
    if (options.noteId === null) {
      query = query.is('note_id', null)
    } else {
      query = query.eq('note_id', options.noteId)
    }
  }

  // Filter by session
  if (options?.sessionId !== undefined) {
    if (options.sessionId === null) {
      query = query.is('session_id', null)
    } else {
      query = query.eq('session_id', options.sessionId)
    }
  }

  // Filter by status
  if (options?.status) {
    query = query.eq('status', options.status)
  }

  // Exclude archived by default
  if (!options?.includeArchived) {
    query = query.neq('status', 'archived')
  }

  // Order by most recent
  query = query.order('updated_at', { ascending: false })

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  if (options?.offset) {
    query = query.offset(options.offset)
  }

  return query.execute()
}

/**
 * Get pending artifacts for a user (for loading on app init)
 */
export async function getPendingArtifacts(
  userId: string,
  noteId?: string
): Promise<DatabaseResult<Artifact[]>> {
  return getArtifacts(userId, {
    noteId,
    status: 'pending',
  })
}

/**
 * Get a single artifact by ID
 */
export async function getArtifact(artifactId: string): Promise<DatabaseResult<Artifact[]>> {
  const db = getDatabaseService()

  return db.from<Artifact>('artifacts').select('*').eq('id', artifactId).single().execute()
}

/**
 * Create a new artifact
 */
export async function createArtifact(
  userId: string,
  data: CreateArtifactDTO
): Promise<DatabaseResult<Artifact | Artifact[]>> {
  const db = getDatabaseService()

  return db.from<Artifact>('artifacts').insert({
    user_id: userId,
    note_id: data.note_id || null,
    session_id: data.session_id || null,
    message_id: data.message_id || null,
    title: data.title || 'Untitled Artifact',
    html: data.html || '',
    css: data.css || '',
    javascript: data.javascript || '',
    status: data.status || 'pending',
    metadata: data.metadata || {},
  })
}

/**
 * Update an artifact
 */
export async function updateArtifact(
  artifactId: string,
  data: UpdateArtifactDTO
): Promise<DatabaseResult<Artifact | Artifact[]>> {
  const db = getDatabaseService()

  const updateData: Record<string, unknown> = {}

  if (data.title !== undefined) updateData.title = data.title
  if (data.html !== undefined) updateData.html = data.html
  if (data.css !== undefined) updateData.css = data.css
  if (data.javascript !== undefined) updateData.javascript = data.javascript
  if (data.status !== undefined) updateData.status = data.status
  if (data.metadata !== undefined) updateData.metadata = data.metadata
  if (data.inserted_at !== undefined) updateData.inserted_at = data.inserted_at

  return db
    .from<Artifact>('artifacts')
    .eq('id', artifactId)
    .update(updateData as Partial<Artifact>)
}

/**
 * Mark an artifact as inserted into a note
 */
export async function markArtifactInserted(
  artifactId: string
): Promise<DatabaseResult<Artifact | Artifact[]>> {
  return updateArtifact(artifactId, {
    status: 'inserted',
    inserted_at: new Date().toISOString(),
  })
}

/**
 * Archive an artifact (soft delete)
 */
export async function archiveArtifact(
  artifactId: string
): Promise<DatabaseResult<Artifact | Artifact[]>> {
  return updateArtifact(artifactId, {
    status: 'archived',
  })
}

/**
 * Hard delete an artifact
 */
export async function deleteArtifact(
  artifactId: string
): Promise<DatabaseResult<Artifact | Artifact[]>> {
  const db = getDatabaseService()

  return db.from<Artifact>('artifacts').eq('id', artifactId).delete()
}

/**
 * Get artifacts for a specific note
 */
export async function getArtifactsForNote(
  userId: string,
  noteId: string
): Promise<DatabaseResult<Artifact[]>> {
  return getArtifacts(userId, {
    noteId,
    includeArchived: false,
  })
}

/**
 * Get artifacts for a specific chat session
 */
export async function getArtifactsForSession(
  userId: string,
  sessionId: string
): Promise<DatabaseResult<Artifact[]>> {
  return getArtifacts(userId, {
    sessionId,
    includeArchived: false,
  })
}
