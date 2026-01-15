/**
 * Storage Provider Interface
 * Provider-agnostic storage abstraction for scale-ready architecture
 */

export interface StorageFile {
  id: string
  name: string
  bucket: string
  path: string
  size: number
  mime_type: string
  created_at: string
  updated_at: string
  metadata?: Record<string, unknown>
}

export interface UploadOptions {
  cacheControl?: string
  contentType?: string
  upsert?: boolean
  metadata?: Record<string, unknown>
}

export interface DownloadOptions {
  transform?: ImageTransformOptions
}

export interface ImageTransformOptions {
  width?: number
  height?: number
  quality?: number
  format?: 'origin' | 'webp' | 'avif' | 'jpeg' | 'png'
  resize?: 'cover' | 'contain' | 'fill'
}

export interface ListOptions {
  limit?: number
  offset?: number
  sortBy?: { column: 'name' | 'created_at' | 'updated_at'; order: 'asc' | 'desc' }
  search?: string
}

export interface SignedUrlOptions {
  expiresIn?: number // seconds
  download?: boolean | string
  transform?: ImageTransformOptions
}

export interface StorageError {
  code: string
  message: string
  statusCode?: number
}

export type StorageResult<T> =
  | { data: T; error: null }
  | { data: null; error: StorageError }

/**
 * Storage Provider Interface
 * Implement this interface for different storage backends (Supabase Storage, S3, GCS, etc.)
 */
export interface IStorageProvider {
  // Bucket operations
  createBucket(name: string, options?: { public?: boolean }): Promise<StorageResult<{ name: string }>>
  getBucket(name: string): Promise<StorageResult<{ name: string; public: boolean }>>
  deleteBucket(name: string): Promise<StorageResult<void>>
  listBuckets(): Promise<StorageResult<{ name: string; public: boolean }[]>>

  // File operations
  upload(
    bucket: string,
    path: string,
    file: File | Blob | ArrayBuffer,
    options?: UploadOptions
  ): Promise<StorageResult<StorageFile>>

  download(
    bucket: string,
    path: string,
    options?: DownloadOptions
  ): Promise<StorageResult<Blob>>

  delete(bucket: string, paths: string[]): Promise<StorageResult<StorageFile[]>>

  move(
    bucket: string,
    fromPath: string,
    toPath: string
  ): Promise<StorageResult<{ path: string }>>

  copy(
    bucket: string,
    fromPath: string,
    toPath: string
  ): Promise<StorageResult<{ path: string }>>

  // Listing
  list(
    bucket: string,
    path?: string,
    options?: ListOptions
  ): Promise<StorageResult<StorageFile[]>>

  // URLs
  getPublicUrl(bucket: string, path: string, options?: ImageTransformOptions): string

  createSignedUrl(
    bucket: string,
    path: string,
    options?: SignedUrlOptions
  ): Promise<StorageResult<{ signedUrl: string }>>

  createSignedUrls(
    bucket: string,
    paths: string[],
    options?: SignedUrlOptions
  ): Promise<StorageResult<{ path: string; signedUrl: string }[]>>

  // Convenience method for documents
  uploadImage(
    file: File,
    userId: string,
    documentId?: string
  ): Promise<StorageResult<{ url: string; path: string }>>
}

/**
 * Storage bucket names
 */
export const STORAGE_BUCKETS = {
  AVATARS: 'avatars',
  DOCUMENTS: 'documents',
  IMAGES: 'images',
  EXPORTS: 'exports'
} as const

export type StorageBucket = typeof STORAGE_BUCKETS[keyof typeof STORAGE_BUCKETS]
