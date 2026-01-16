/**
 * Supabase Storage Adapter
 * Implements IStorageProvider for Supabase Storage
 */
import { supabase, isSupabaseConfigured } from '../supabase';
/**
 * Convert Supabase error to our format
 */
function toStorageError(error) {
    if (error && typeof error === 'object' && 'message' in error) {
        const err = error;
        return {
            code: err.error || 'STORAGE_ERROR',
            message: err.message,
            statusCode: err.statusCode
        };
    }
    return {
        code: 'STORAGE_ERROR',
        message: String(error)
    };
}
/**
 * Convert Supabase file to our StorageFile format
 */
function toStorageFile(file, bucket) {
    return {
        id: file.id || file.name,
        name: file.name,
        bucket,
        path: file.name,
        size: file.metadata?.size || 0,
        mime_type: file.metadata?.mimetype || 'application/octet-stream',
        created_at: file.created_at || new Date().toISOString(),
        updated_at: file.updated_at || file.created_at || new Date().toISOString(),
        metadata: file.metadata
    };
}
/**
 * Supabase Storage Provider implementation
 */
class SupabaseStorageProvider {
    async createBucket(name, options) {
        try {
            const { data, error } = await supabase.storage.createBucket(name, {
                public: options?.public ?? false
            });
            if (error) {
                return { data: null, error: toStorageError(error) };
            }
            return { data: { name: data.name }, error: null };
        }
        catch (err) {
            return { data: null, error: toStorageError(err) };
        }
    }
    async getBucket(name) {
        try {
            const { data, error } = await supabase.storage.getBucket(name);
            if (error) {
                return { data: null, error: toStorageError(error) };
            }
            return { data: { name: data.name, public: data.public }, error: null };
        }
        catch (err) {
            return { data: null, error: toStorageError(err) };
        }
    }
    async deleteBucket(name) {
        try {
            const { error } = await supabase.storage.deleteBucket(name);
            if (error) {
                return { data: null, error: toStorageError(error) };
            }
            return { data: undefined, error: null };
        }
        catch (err) {
            return { data: null, error: toStorageError(err) };
        }
    }
    async listBuckets() {
        try {
            const { data, error } = await supabase.storage.listBuckets();
            if (error) {
                return { data: null, error: toStorageError(error) };
            }
            return {
                data: data.map(b => ({ name: b.name, public: b.public })),
                error: null
            };
        }
        catch (err) {
            return { data: null, error: toStorageError(err) };
        }
    }
    async upload(bucket, path, file, options) {
        try {
            const { data, error } = await supabase.storage
                .from(bucket)
                .upload(path, file, {
                cacheControl: options?.cacheControl || '3600',
                contentType: options?.contentType,
                upsert: options?.upsert ?? false
            });
            if (error) {
                return { data: null, error: toStorageError(error) };
            }
            // Get file metadata
            const { data: fileData } = await supabase.storage
                .from(bucket)
                .list(path.split('/').slice(0, -1).join('/'), {
                limit: 1,
                search: path.split('/').pop()
            });
            const fileInfo = fileData?.[0] || { name: path, metadata: {} };
            return {
                data: toStorageFile({ ...fileInfo, name: data.path }, bucket),
                error: null
            };
        }
        catch (err) {
            return { data: null, error: toStorageError(err) };
        }
    }
    async download(bucket, path, options) {
        try {
            let query = supabase.storage.from(bucket);
            if (options?.transform) {
                const { data, error } = await query.download(path, {
                    transform: options.transform
                });
                if (error) {
                    return { data: null, error: toStorageError(error) };
                }
                return { data, error: null };
            }
            const { data, error } = await query.download(path);
            if (error) {
                return { data: null, error: toStorageError(error) };
            }
            return { data, error: null };
        }
        catch (err) {
            return { data: null, error: toStorageError(err) };
        }
    }
    async delete(bucket, paths) {
        try {
            const { data, error } = await supabase.storage
                .from(bucket)
                .remove(paths);
            if (error) {
                return { data: null, error: toStorageError(error) };
            }
            return {
                data: data.map(f => toStorageFile(f, bucket)),
                error: null
            };
        }
        catch (err) {
            return { data: null, error: toStorageError(err) };
        }
    }
    async move(bucket, fromPath, toPath) {
        try {
            const { error } = await supabase.storage
                .from(bucket)
                .move(fromPath, toPath);
            if (error) {
                return { data: null, error: toStorageError(error) };
            }
            return { data: { path: toPath }, error: null };
        }
        catch (err) {
            return { data: null, error: toStorageError(err) };
        }
    }
    async copy(bucket, fromPath, toPath) {
        try {
            const { error } = await supabase.storage
                .from(bucket)
                .copy(fromPath, toPath);
            if (error) {
                return { data: null, error: toStorageError(error) };
            }
            return { data: { path: toPath }, error: null };
        }
        catch (err) {
            return { data: null, error: toStorageError(err) };
        }
    }
    async list(bucket, path = '', options) {
        try {
            const { data, error } = await supabase.storage
                .from(bucket)
                .list(path, {
                limit: options?.limit || 100,
                offset: options?.offset || 0,
                sortBy: options?.sortBy ? {
                    column: options.sortBy.column,
                    order: options.sortBy.order
                } : undefined,
                search: options?.search
            });
            if (error) {
                return { data: null, error: toStorageError(error) };
            }
            return {
                data: data.map(f => toStorageFile(f, bucket)),
                error: null
            };
        }
        catch (err) {
            return { data: null, error: toStorageError(err) };
        }
    }
    getPublicUrl(bucket, path, options) {
        const transformOptions = options ? {
            transform: options
        } : undefined;
        const result = supabase.storage
            .from(bucket)
            .getPublicUrl(path, transformOptions);
        return result.data.publicUrl;
    }
    async createSignedUrl(bucket, path, options) {
        try {
            const { data, error } = await supabase.storage
                .from(bucket)
                .createSignedUrl(path, options?.expiresIn || 3600, {
                download: options?.download,
                transform: options?.transform
            });
            if (error) {
                return { data: null, error: toStorageError(error) };
            }
            return { data: { signedUrl: data.signedUrl }, error: null };
        }
        catch (err) {
            return { data: null, error: toStorageError(err) };
        }
    }
    async createSignedUrls(bucket, paths, options) {
        try {
            const { data, error } = await supabase.storage
                .from(bucket)
                .createSignedUrls(paths, options?.expiresIn || 3600);
            if (error) {
                return { data: null, error: toStorageError(error) };
            }
            return {
                data: data.map(d => ({ path: d.path, signedUrl: d.signedUrl })),
                error: null
            };
        }
        catch (err) {
            return { data: null, error: toStorageError(err) };
        }
    }
    async uploadImage(file, userId, documentId) {
        const timestamp = Date.now();
        const ext = file.name.split('.').pop() || 'png';
        const path = documentId
            ? `${userId}/${documentId}/${timestamp}.${ext}`
            : `${userId}/${timestamp}.${ext}`;
        const result = await this.upload('attachments', path, file, {
            contentType: file.type,
            upsert: false
        });
        if (result.error) {
            return { data: null, error: result.error };
        }
        // Get signed URL for private bucket
        const urlResult = await this.createSignedUrl('attachments', path, {
            expiresIn: 86400 // 24 hours
        });
        if (urlResult.error) {
            return { data: null, error: urlResult.error };
        }
        return {
            data: { url: urlResult.data.signedUrl, path },
            error: null
        };
    }
}
// Singleton instance
let instance = null;
/**
 * Create or get Supabase storage provider instance
 */
export function createSupabaseStorage() {
    if (!isSupabaseConfigured) {
        throw new Error('Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
    }
    if (!instance) {
        instance = new SupabaseStorageProvider();
    }
    return instance;
}
