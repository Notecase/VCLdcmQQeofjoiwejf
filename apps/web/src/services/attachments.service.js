/**
 * Attachments Service
 * Higher-level API for file attachment operations
 */
import { getDatabaseService, getStorageService } from './factory';
const ATTACHMENTS_BUCKET = 'attachments';
/**
 * Get attachments for a note
 */
export async function getNoteAttachments(noteId) {
    const db = getDatabaseService();
    return db.from('attachments')
        .select('*')
        .eq('note_id', noteId)
        .order('created_at', { ascending: false })
        .execute();
}
/**
 * Get attachment by ID
 */
export async function getAttachment(attachmentId) {
    const db = getDatabaseService();
    return db.from('attachments')
        .select('*')
        .eq('id', attachmentId)
        .single()
        .execute();
}
/**
 * Upload a file and create attachment record
 */
export async function uploadAttachment(file, userId, noteId) {
    const storage = getStorageService();
    const db = getDatabaseService();
    // Generate storage path
    const timestamp = Date.now();
    const ext = file.name.split('.').pop() || 'bin';
    const path = noteId
        ? `${userId}/${noteId}/${timestamp}_${file.name}`
        : `${userId}/${timestamp}_${file.name}`;
    // Upload file
    const uploadResult = await storage.upload(ATTACHMENTS_BUCKET, path, file, {
        contentType: file.type,
        upsert: false
    });
    if (uploadResult.error) {
        return { data: null, error: { code: uploadResult.error.code, message: uploadResult.error.message } };
    }
    // Get image dimensions if applicable
    let width;
    let height;
    if (file.type.startsWith('image/')) {
        try {
            const dimensions = await getImageDimensions(file);
            width = dimensions.width;
            height = dimensions.height;
        }
        catch {
            // Ignore dimension errors
        }
    }
    // Create database record
    const attachmentData = {
        user_id: userId,
        note_id: noteId,
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
        storage_path: path,
        width,
        height
    };
    return db.from('attachments').insert(attachmentData);
}
/**
 * Delete an attachment
 */
export async function deleteAttachment(attachmentId) {
    const storage = getStorageService();
    const db = getDatabaseService();
    // Get attachment to find storage path
    const attachmentResult = await getAttachment(attachmentId);
    if (attachmentResult.error || !attachmentResult.data?.[0]) {
        return { data: null, error: { code: 'NOT_FOUND', message: 'Attachment not found' } };
    }
    const attachment = attachmentResult.data[0];
    // Delete from storage
    const storageResult = await storage.delete(ATTACHMENTS_BUCKET, [attachment.storage_path]);
    if (storageResult.error) {
        console.warn('Failed to delete from storage:', storageResult.error);
    }
    // Delete database record
    const deleteResult = await db.from('attachments')
        .eq('id', attachmentId)
        .delete();
    if (deleteResult.error) {
        return { data: null, error: deleteResult.error };
    }
    return { data: undefined, error: null };
}
/**
 * Get signed URL for attachment
 */
export async function getAttachmentUrl(storagePath, expiresIn = 3600) {
    const storage = getStorageService();
    const result = await storage.createSignedUrl(ATTACHMENTS_BUCKET, storagePath, {
        expiresIn
    });
    if (result.error) {
        return { url: null, error: result.error.message };
    }
    return { url: result.data.signedUrl, error: null };
}
/**
 * Move attachment to a different note
 */
export async function moveAttachment(attachmentId, newNoteId) {
    const db = getDatabaseService();
    return db.from('attachments')
        .eq('id', attachmentId)
        .update({ note_id: newNoteId });
}
/**
 * Helper to get image dimensions
 */
function getImageDimensions(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };
        img.src = url;
    });
}
