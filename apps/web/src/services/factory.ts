/**
 * Service Factory
 * Provider-agnostic service factory for switching between backends
 */
import type { IAuthProvider } from './providers/auth.interface'
import type { IDatabaseProvider } from './providers/database.interface'
import type { IStorageProvider } from './providers/storage.interface'

export type ProviderType = 'supabase' | 'firebase' | 'local'

interface ServiceProviders {
  auth: IAuthProvider
  database: IDatabaseProvider
  storage: IStorageProvider
}

let currentProvider: ProviderType = 'local'
let services: Partial<ServiceProviders> = {}

/**
 * Initialize services with a provider
 */
export async function initializeServices(provider: ProviderType): Promise<void> {
  currentProvider = provider

  switch (provider) {
    case 'supabase':
      const { createSupabaseAuth } = await import('./supabase/auth.adapter')
      const { createSupabaseDatabase } = await import('./supabase/database.adapter')
      const { createSupabaseStorage } = await import('./supabase/storage.adapter')

      services = {
        auth: createSupabaseAuth(),
        database: createSupabaseDatabase(),
        storage: createSupabaseStorage()
      }
      break

    case 'firebase':
      // TODO: Implement Firebase adapters
      throw new Error('Firebase provider not implemented yet')

    case 'local':
    default:
      // Local storage fallback (already implemented)
      const { createLocalAuth } = await import('./local/auth.adapter')
      const { createLocalDatabase } = await import('./local/database.adapter')
      const { createLocalStorage } = await import('./local/storage.adapter')

      services = {
        auth: createLocalAuth(),
        database: createLocalDatabase(),
        storage: createLocalStorage()
      }
      break
  }

  console.log(`[Services] Initialized with ${provider} provider`)
}

/**
 * Get the auth service
 */
export function getAuthService(): IAuthProvider {
  if (!services.auth) {
    throw new Error('Auth service not initialized. Call initializeServices first.')
  }
  return services.auth
}

/**
 * Get the database service
 */
export function getDatabaseService(): IDatabaseProvider {
  if (!services.database) {
    throw new Error('Database service not initialized. Call initializeServices first.')
  }
  return services.database
}

/**
 * Get the storage service
 */
export function getStorageService(): IStorageProvider {
  if (!services.storage) {
    throw new Error('Storage service not initialized. Call initializeServices first.')
  }
  return services.storage
}

/**
 * Get current provider type
 */
export function getCurrentProvider(): ProviderType {
  return currentProvider
}

/**
 * Check if services are initialized
 */
export function isServicesInitialized(): boolean {
  return !!(services.auth && services.database && services.storage)
}
