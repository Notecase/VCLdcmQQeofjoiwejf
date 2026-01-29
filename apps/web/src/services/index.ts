/**
 * Services Index
 * Re-export all services and factory functions
 */

// Supabase client
export { supabase, auth, isSupabaseConfigured } from './supabase'

// Service factory
export {
  initializeServices,
  getAuthService,
  getDatabaseService,
  getStorageService,
  getCurrentProvider,
  isServicesInitialized,
  type ProviderType,
} from './factory'

// Provider interfaces
export * from './providers'

// Higher-level services
export * as notesService from './notes.service'
export * as projectsService from './projects.service'
export * as attachmentsService from './attachments.service'
export * as subscriptionsService from './subscriptions.service'
export { subscriptionManager, SubscriptionManager } from './subscriptions.service'

// Legacy document service (for backward compatibility)
export { documentService } from './documents'
