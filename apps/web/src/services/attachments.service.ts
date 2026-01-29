/**
 * Attachments Service
 * Higher-level API for file attachment operations
 */
import { getDatabaseService, getStorageService } from './factory'
import type { Attachment, CreateAttachmentDTO } from '@inkdown/shared'
import type { DatabaseResult } from './providers'

const ATTACHMENTS_BUCKET = 'attachments'

/**
 * Get attachments for a note
 */
export async function getNoteAttachments(noteId: string): Promise<DatabaseResult<Attachment[]>> {
  const db = getDatabaseService()

  return db
    .from<Attachment>('attachments')
    .select('*')
    .eq('note_id', noteId)
    .order('created_at', { ascending: false })
    .execute()
}

/**
 * Get attachment by ID
 */
export async function getAttachment(attachmentId: string): Promise<DatabaseResult<Attachment[]>> {
  const db = getDatabaseService()

  return db.from<Attachment>('attachments').select('*').eq('id', attachmentId).single().execute()
}

/**
 * Upload a file and create attachment record
 */
export async function uploadAttachment(
  file: File,
  userId: string,
  noteId?: string
): Promise<DatabaseResult<Attachment | Attachment[]>> {
  const storage = getStorageService()
  const db = getDatabaseService()

  // Generate storage path
  const timestamp = Date.now()
  const ext = file.name.split('.').pop() || 'bin'
  const path = noteId
    ? `${userId}/${noteId}/${timestamp}_${file.name}`
    : `${userId}/${timestamp}_${file.name}`

  // Upload file
  const uploadResult = await storage.upload(ATTACHMENTS_BUCKET, path, file, {
    contentType: file.type,
    upsert: false,
  })

  if (uploadResult.error) {
    return {
      data: null,
      error: { code: uploadResult.error.code, message: uploadResult.error.message },
    }
  }

  // Get image dimensions if applicable
  let width: number | undefined
  let height: number | undefined

  if (file.type.startsWith('image/')) {
    try {
      const dimensions = await getImageDimensions(file)
      width = dimensions.width
      height = dimensions.height
    } catch {
      // Ignore dimension errors
    }
  }

  // Create database record
  const attachmentData: CreateAttachmentDTO & { user_id: string; width?: number; height?: number } =
    {
      user_id: userId,
      note_id: noteId,
      filename: file.name,
      content_type: file.type,
      size_bytes: file.size,
      storage_path: path,
      width,
      height,
    }

  return db.from<Attachment>('attachments').insert(attachmentData as any)
}

/**
 * Delete an attachment
 */
export async function deleteAttachment(attachmentId: string): Promise<DatabaseResult<void>> {
  const storage = getStorageService()
  const db = getDatabaseService()

  // Get attachment to find storage path
  const attachmentResult = await getAttachment(attachmentId)

  if (attachmentResult.error || !attachmentResult.data?.[0]) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'Attachment not found' } }
  }

  const attachment = attachmentResult.data[0]

  // Delete from storage
  const storageResult = await storage.delete(ATTACHMENTS_BUCKET, [attachment.storage_path])

  if (storageResult.error) {
    console.warn('Failed to delete from storage:', storageResult.error)
  }

  // Delete database record
  const deleteResult = await db.from<Attachment>('attachments').eq('id', attachmentId).delete()

  if (deleteResult.error) {
    return { data: null, error: deleteResult.error }
  }

  return { data: undefined, error: null }
}

/**
 * Get signed URL for attachment
 */
export async function getAttachmentUrl(
  storagePath: string,
  expiresIn = 3600
): Promise<{ url: string | null; error: string | null }> {
  const storage = getStorageService()

  const result = await storage.createSignedUrl(ATTACHMENTS_BUCKET, storagePath, {
    expiresIn,
  })

  if (result.error) {
    return { url: null, error: result.error.message }
  }

  return { url: result.data.signedUrl, error: null }
}

/**
 * Move attachment to a different note
 */
export async function moveAttachment(
  attachmentId: string,
  newNoteId: string | null
): Promise<DatabaseResult<Attachment | Attachment[]>> {
  const db = getDatabaseService()

  return db
    .from<Attachment>('attachments')
    .eq('id', attachmentId)
    .update({ note_id: newNoteId } as any)
}

/**
 * Helper to get image dimensions
 */
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}
