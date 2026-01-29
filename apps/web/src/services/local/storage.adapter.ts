/**
 * Local Storage Adapter
 * IndexedDB based storage for offline/development mode
 */
import localforage from 'localforage'
import type {
  IStorageProvider,
  StorageFile,
  UploadOptions,
  DownloadOptions,
  ListOptions,
  SignedUrlOptions,
  StorageResult,
  ImageTransformOptions,
} from '../providers'

// Initialize localforage for storage
const storage = localforage.createInstance({
  name: 'inkdown',
  storeName: 'storage',
})

class LocalStorageProvider implements IStorageProvider {
  private buckets: Map<string, { name: string; public: boolean }> = new Map()

  async createBucket(
    name: string,
    options?: { public?: boolean }
  ): Promise<StorageResult<{ name: string }>> {
    this.buckets.set(name, { name, public: options?.public ?? false })
    return { data: { name }, error: null }
  }

  async getBucket(name: string): Promise<StorageResult<{ name: string; public: boolean }>> {
    const bucket = this.buckets.get(name)
    if (bucket) {
      return { data: bucket, error: null }
    }
    return { data: null, error: { code: 'not_found', message: 'Bucket not found' } }
  }

  async deleteBucket(name: string): Promise<StorageResult<void>> {
    this.buckets.delete(name)
    return { data: undefined, error: null }
  }

  async listBuckets(): Promise<StorageResult<{ name: string; public: boolean }[]>> {
    return { data: Array.from(this.buckets.values()), error: null }
  }

  async upload(
    bucket: string,
    path: string,
    file: File | Blob | ArrayBuffer,
    options?: UploadOptions
  ): Promise<StorageResult<StorageFile>> {
    try {
      const key = `${bucket}/${path}`
      const blob = file instanceof ArrayBuffer ? new Blob([file]) : file

      // Store the file data
      await storage.setItem(key, blob)

      const storageFile: StorageFile = {
        id: crypto.randomUUID(),
        name: path.split('/').pop() || path,
        bucket,
        path,
        size: blob.size,
        mime_type:
          options?.contentType || (file instanceof File ? file.type : 'application/octet-stream'),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: options?.metadata,
      }

      // Store metadata
      await storage.setItem(`${key}__meta`, storageFile)

      return { data: storageFile, error: null }
    } catch (e) {
      return { data: null, error: { code: 'upload_error', message: String(e) } }
    }
  }

  async download(
    bucket: string,
    path: string,
    _options?: DownloadOptions
  ): Promise<StorageResult<Blob>> {
    try {
      const key = `${bucket}/${path}`
      const blob = await storage.getItem<Blob>(key)

      if (blob) {
        return { data: blob, error: null }
      }
      return { data: null, error: { code: 'not_found', message: 'File not found' } }
    } catch (e) {
      return { data: null, error: { code: 'download_error', message: String(e) } }
    }
  }

  async delete(bucket: string, paths: string[]): Promise<StorageResult<StorageFile[]>> {
    try {
      const deleted: StorageFile[] = []

      for (const path of paths) {
        const key = `${bucket}/${path}`
        const meta = await storage.getItem<StorageFile>(`${key}__meta`)
        if (meta) {
          await storage.removeItem(key)
          await storage.removeItem(`${key}__meta`)
          deleted.push(meta)
        }
      }

      return { data: deleted, error: null }
    } catch (e) {
      return { data: null, error: { code: 'delete_error', message: String(e) } }
    }
  }

  async move(
    bucket: string,
    fromPath: string,
    toPath: string
  ): Promise<StorageResult<{ path: string }>> {
    try {
      const fromKey = `${bucket}/${fromPath}`
      const toKey = `${bucket}/${toPath}`

      const blob = await storage.getItem<Blob>(fromKey)
      const meta = await storage.getItem<StorageFile>(`${fromKey}__meta`)

      if (blob && meta) {
        await storage.setItem(toKey, blob)
        meta.path = toPath
        meta.updated_at = new Date().toISOString()
        await storage.setItem(`${toKey}__meta`, meta)

        await storage.removeItem(fromKey)
        await storage.removeItem(`${fromKey}__meta`)

        return { data: { path: toPath }, error: null }
      }

      return { data: null, error: { code: 'not_found', message: 'Source file not found' } }
    } catch (e) {
      return { data: null, error: { code: 'move_error', message: String(e) } }
    }
  }

  async copy(
    bucket: string,
    fromPath: string,
    toPath: string
  ): Promise<StorageResult<{ path: string }>> {
    try {
      const fromKey = `${bucket}/${fromPath}`
      const toKey = `${bucket}/${toPath}`

      const blob = await storage.getItem<Blob>(fromKey)
      const meta = await storage.getItem<StorageFile>(`${fromKey}__meta`)

      if (blob && meta) {
        await storage.setItem(toKey, blob)
        const newMeta = {
          ...meta,
          id: crypto.randomUUID(),
          path: toPath,
          created_at: new Date().toISOString(),
        }
        await storage.setItem(`${toKey}__meta`, newMeta)

        return { data: { path: toPath }, error: null }
      }

      return { data: null, error: { code: 'not_found', message: 'Source file not found' } }
    } catch (e) {
      return { data: null, error: { code: 'copy_error', message: String(e) } }
    }
  }

  async list(
    bucket: string,
    path?: string,
    options?: ListOptions
  ): Promise<StorageResult<StorageFile[]>> {
    try {
      const prefix = path ? `${bucket}/${path}` : bucket
      const files: StorageFile[] = []

      await storage.iterate((value, key) => {
        if (key.startsWith(prefix) && key.endsWith('__meta')) {
          files.push(value as StorageFile)
        }
      })

      // Sort
      if (options?.sortBy) {
        files.sort((a, b) => {
          const aVal = a[options.sortBy!.column]
          const bVal = b[options.sortBy!.column]
          const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
          return options.sortBy!.order === 'asc' ? cmp : -cmp
        })
      }

      // Paginate
      let result = files
      if (options?.offset) result = result.slice(options.offset)
      if (options?.limit) result = result.slice(0, options.limit)

      return { data: result, error: null }
    } catch (e) {
      return { data: null, error: { code: 'list_error', message: String(e) } }
    }
  }

  getPublicUrl(bucket: string, path: string, _options?: ImageTransformOptions): string {
    // Return a blob URL - in local mode, files are accessed via memory
    return `local://${bucket}/${path}`
  }

  async createSignedUrl(
    bucket: string,
    path: string,
    _options?: SignedUrlOptions
  ): Promise<StorageResult<{ signedUrl: string }>> {
    try {
      const key = `${bucket}/${path}`
      const blob = await storage.getItem<Blob>(key)

      if (blob) {
        const url = URL.createObjectURL(blob)
        return { data: { signedUrl: url }, error: null }
      }

      return { data: null, error: { code: 'not_found', message: 'File not found' } }
    } catch (e) {
      return { data: null, error: { code: 'sign_error', message: String(e) } }
    }
  }

  async createSignedUrls(
    bucket: string,
    paths: string[],
    options?: SignedUrlOptions
  ): Promise<StorageResult<{ path: string; signedUrl: string }[]>> {
    const results: { path: string; signedUrl: string }[] = []

    for (const path of paths) {
      const result = await this.createSignedUrl(bucket, path, options)
      if (result.data) {
        results.push({ path, signedUrl: result.data.signedUrl })
      }
    }

    return { data: results, error: null }
  }

  async uploadImage(
    file: File,
    userId: string,
    documentId?: string
  ): Promise<StorageResult<{ url: string; path: string }>> {
    const path = documentId
      ? `${userId}/${documentId}/${Date.now()}_${file.name}`
      : `${userId}/${Date.now()}_${file.name}`

    const result = await this.upload('images', path, file, { contentType: file.type })

    if (result.data) {
      const signedResult = await this.createSignedUrl('images', path)
      if (signedResult.data) {
        return { data: { url: signedResult.data.signedUrl, path }, error: null }
      }
    }

    return {
      data: null,
      error: result.error || { code: 'upload_error', message: 'Failed to upload image' },
    }
  }
}

export function createLocalStorage(): IStorageProvider {
  return new LocalStorageProvider()
}
