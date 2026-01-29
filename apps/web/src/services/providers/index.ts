/**
 * Provider Interfaces Index
 * Export all provider interfaces and types
 */

// Auth
export type {
  AuthUser,
  AuthSession,
  SignUpCredentials,
  SignInCredentials,
  OAuthOptions,
  ResetPasswordOptions,
  UpdatePasswordOptions,
  AuthError,
  AuthResult,
  AuthStateChangeCallback,
  AuthStateChangeEvent,
  IAuthProvider,
} from './auth.interface'

export type { AuthProvider } from './auth.interface'

// Database
export type {
  QueryOptions,
  QueryFilter,
  InsertOptions,
  UpdateOptions,
  DatabaseError,
  DatabaseResult,
  RealtimeSubscription,
  RealtimeEvent,
  RealtimePayload,
  RealtimeCallback,
  IDatabaseProvider,
  IQueryBuilder,
  IDocumentQueries,
} from './database.interface'

// Storage
export type {
  StorageFile,
  UploadOptions,
  DownloadOptions,
  ImageTransformOptions,
  ListOptions,
  SignedUrlOptions,
  StorageError,
  StorageResult,
  IStorageProvider,
  StorageBucket,
} from './storage.interface'

export { STORAGE_BUCKETS } from './storage.interface'
