/**
 * Local Storage Adapter
 * IndexedDB based storage for offline/development mode
 */
import localforage from 'localforage';
// Initialize localforage for storage
const storage = localforage.createInstance({
    name: 'inkdown',
    storeName: 'storage'
});
class LocalStorageProvider {
    buckets = new Map();
    async createBucket(name, options) {
        this.buckets.set(name, { name, public: options?.public ?? false });
        return { data: { name }, error: null };
    }
    async getBucket(name) {
        const bucket = this.buckets.get(name);
        if (bucket) {
            return { data: bucket, error: null };
        }
        return { data: null, error: { code: 'not_found', message: 'Bucket not found' } };
    }
    async deleteBucket(name) {
        this.buckets.delete(name);
        return { data: undefined, error: null };
    }
    async listBuckets() {
        return { data: Array.from(this.buckets.values()), error: null };
    }
    async upload(bucket, path, file, options) {
        try {
            const key = `${bucket}/${path}`;
            const blob = file instanceof ArrayBuffer ? new Blob([file]) : file;
            // Store the file data
            await storage.setItem(key, blob);
            const storageFile = {
                id: crypto.randomUUID(),
                name: path.split('/').pop() || path,
                bucket,
                path,
                size: blob.size,
                mime_type: options?.contentType || (file instanceof File ? file.type : 'application/octet-stream'),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                metadata: options?.metadata
            };
            // Store metadata
            await storage.setItem(`${key}__meta`, storageFile);
            return { data: storageFile, error: null };
        }
        catch (e) {
            return { data: null, error: { code: 'upload_error', message: String(e) } };
        }
    }
    async download(bucket, path, _options) {
        try {
            const key = `${bucket}/${path}`;
            const blob = await storage.getItem(key);
            if (blob) {
                return { data: blob, error: null };
            }
            return { data: null, error: { code: 'not_found', message: 'File not found' } };
        }
        catch (e) {
            return { data: null, error: { code: 'download_error', message: String(e) } };
        }
    }
    async delete(bucket, paths) {
        try {
            const deleted = [];
            for (const path of paths) {
                const key = `${bucket}/${path}`;
                const meta = await storage.getItem(`${key}__meta`);
                if (meta) {
                    await storage.removeItem(key);
                    await storage.removeItem(`${key}__meta`);
                    deleted.push(meta);
                }
            }
            return { data: deleted, error: null };
        }
        catch (e) {
            return { data: null, error: { code: 'delete_error', message: String(e) } };
        }
    }
    async move(bucket, fromPath, toPath) {
        try {
            const fromKey = `${bucket}/${fromPath}`;
            const toKey = `${bucket}/${toPath}`;
            const blob = await storage.getItem(fromKey);
            const meta = await storage.getItem(`${fromKey}__meta`);
            if (blob && meta) {
                await storage.setItem(toKey, blob);
                meta.path = toPath;
                meta.updated_at = new Date().toISOString();
                await storage.setItem(`${toKey}__meta`, meta);
                await storage.removeItem(fromKey);
                await storage.removeItem(`${fromKey}__meta`);
                return { data: { path: toPath }, error: null };
            }
            return { data: null, error: { code: 'not_found', message: 'Source file not found' } };
        }
        catch (e) {
            return { data: null, error: { code: 'move_error', message: String(e) } };
        }
    }
    async copy(bucket, fromPath, toPath) {
        try {
            const fromKey = `${bucket}/${fromPath}`;
            const toKey = `${bucket}/${toPath}`;
            const blob = await storage.getItem(fromKey);
            const meta = await storage.getItem(`${fromKey}__meta`);
            if (blob && meta) {
                await storage.setItem(toKey, blob);
                const newMeta = { ...meta, id: crypto.randomUUID(), path: toPath, created_at: new Date().toISOString() };
                await storage.setItem(`${toKey}__meta`, newMeta);
                return { data: { path: toPath }, error: null };
            }
            return { data: null, error: { code: 'not_found', message: 'Source file not found' } };
        }
        catch (e) {
            return { data: null, error: { code: 'copy_error', message: String(e) } };
        }
    }
    async list(bucket, path, options) {
        try {
            const prefix = path ? `${bucket}/${path}` : bucket;
            const files = [];
            await storage.iterate((value, key) => {
                if (key.startsWith(prefix) && key.endsWith('__meta')) {
                    files.push(value);
                }
            });
            // Sort
            if (options?.sortBy) {
                files.sort((a, b) => {
                    const aVal = a[options.sortBy.column];
                    const bVal = b[options.sortBy.column];
                    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                    return options.sortBy.order === 'asc' ? cmp : -cmp;
                });
            }
            // Paginate
            let result = files;
            if (options?.offset)
                result = result.slice(options.offset);
            if (options?.limit)
                result = result.slice(0, options.limit);
            return { data: result, error: null };
        }
        catch (e) {
            return { data: null, error: { code: 'list_error', message: String(e) } };
        }
    }
    getPublicUrl(bucket, path, _options) {
        // Return a blob URL - in local mode, files are accessed via memory
        return `local://${bucket}/${path}`;
    }
    async createSignedUrl(bucket, path, _options) {
        try {
            const key = `${bucket}/${path}`;
            const blob = await storage.getItem(key);
            if (blob) {
                const url = URL.createObjectURL(blob);
                return { data: { signedUrl: url }, error: null };
            }
            return { data: null, error: { code: 'not_found', message: 'File not found' } };
        }
        catch (e) {
            return { data: null, error: { code: 'sign_error', message: String(e) } };
        }
    }
    async createSignedUrls(bucket, paths, options) {
        const results = [];
        for (const path of paths) {
            const result = await this.createSignedUrl(bucket, path, options);
            if (result.data) {
                results.push({ path, signedUrl: result.data.signedUrl });
            }
        }
        return { data: results, error: null };
    }
    async uploadImage(file, userId, documentId) {
        const path = documentId
            ? `${userId}/${documentId}/${Date.now()}_${file.name}`
            : `${userId}/${Date.now()}_${file.name}`;
        const result = await this.upload('images', path, file, { contentType: file.type });
        if (result.data) {
            const signedResult = await this.createSignedUrl('images', path);
            if (signedResult.data) {
                return { data: { url: signedResult.data.signedUrl, path }, error: null };
            }
        }
        return { data: null, error: result.error || { code: 'upload_error', message: 'Failed to upload image' } };
    }
}
export function createLocalStorage() {
    return new LocalStorageProvider();
}
