let currentProvider = 'local';
let services = {};
/**
 * Initialize services with a provider
 */
export async function initializeServices(provider) {
    currentProvider = provider;
    switch (provider) {
        case 'supabase':
            const { createSupabaseAuth } = await import('./supabase/auth.adapter');
            const { createSupabaseDatabase } = await import('./supabase/database.adapter');
            const { createSupabaseStorage } = await import('./supabase/storage.adapter');
            services = {
                auth: createSupabaseAuth(),
                database: createSupabaseDatabase(),
                storage: createSupabaseStorage()
            };
            break;
        case 'firebase':
            // TODO: Implement Firebase adapters
            throw new Error('Firebase provider not implemented yet');
        case 'local':
        default:
            // Local storage fallback (already implemented)
            const { createLocalAuth } = await import('./local/auth.adapter');
            const { createLocalDatabase } = await import('./local/database.adapter');
            const { createLocalStorage } = await import('./local/storage.adapter');
            services = {
                auth: createLocalAuth(),
                database: createLocalDatabase(),
                storage: createLocalStorage()
            };
            break;
    }
    console.log(`[Services] Initialized with ${provider} provider`);
}
/**
 * Get the auth service
 */
export function getAuthService() {
    if (!services.auth) {
        throw new Error('Auth service not initialized. Call initializeServices first.');
    }
    return services.auth;
}
/**
 * Get the database service
 */
export function getDatabaseService() {
    if (!services.database) {
        throw new Error('Database service not initialized. Call initializeServices first.');
    }
    return services.database;
}
/**
 * Get the storage service
 */
export function getStorageService() {
    if (!services.storage) {
        throw new Error('Storage service not initialized. Call initializeServices first.');
    }
    return services.storage;
}
/**
 * Get current provider type
 */
export function getCurrentProvider() {
    return currentProvider;
}
/**
 * Check if services are initialized
 */
export function isServicesInitialized() {
    return !!(services.auth && services.database && services.storage);
}
