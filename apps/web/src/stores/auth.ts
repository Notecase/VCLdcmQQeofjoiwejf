import { defineStore } from 'pinia'
import { getAuthService, isServicesInitialized } from '@/services'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  }),

  actions: {
    /**
     * Initialize auth state from session
     */
    async initialize() {
      this.isLoading = true

      try {
        // Check if services are initialized
        if (!isServicesInitialized()) {
          console.warn('Services not initialized, skipping auth check')
          this.isLoading = false
          return
        }

        const auth = getAuthService()
        const result = await auth.getSession()

        if (result.data) {
          this.user = {
            id: result.data.user.id,
            email: result.data.user.email || '',
            name: result.data.user.user_metadata?.name as string | undefined,
            avatar_url: result.data.user.user_metadata?.avatar_url as string | undefined,
            created_at: result.data.user.created_at,
          }
          this.isAuthenticated = true
        }
      } catch (e) {
        console.error('Auth initialization error:', e)
      } finally {
        this.isLoading = false
      }

      // Listen for auth changes
      this.setupAuthListener()
    },

    /**
     * Set up auth state change listener
     */
    setupAuthListener() {
      if (!isServicesInitialized()) return

      const auth = getAuthService()
      auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          this.user = {
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.name as string | undefined,
            avatar_url: session.user.user_metadata?.avatar_url as string | undefined,
            created_at: session.user.created_at,
          }
          this.isAuthenticated = true
        } else if (event === 'SIGNED_OUT') {
          this.user = null
          this.isAuthenticated = false
        }
      })
    },

    /**
     * Sign up with email and password
     */
    async signUp(email: string, password: string): Promise<{ confirmationRequired: boolean }> {
      this.isLoading = true
      this.error = null

      try {
        const auth = getAuthService()
        const result = await auth.signUp({ email, password })

        if (result.error) {
          if (result.error.code === 'EMAIL_CONFIRMATION_REQUIRED') {
            return { confirmationRequired: true }
          }
          throw new Error(result.error.message)
        }
        return { confirmationRequired: false }
      } catch (e: any) {
        this.error = e.message
        throw e
      } finally {
        this.isLoading = false
      }
    },

    /**
     * Sign in with email and password
     */
    async signIn(email: string, password: string) {
      this.isLoading = true
      this.error = null

      try {
        const auth = getAuthService()
        const result = await auth.signIn({ email, password })

        if (result.error) {
          throw new Error(result.error.message)
        }
      } catch (e: any) {
        this.error = e.message
        throw e
      } finally {
        this.isLoading = false
      }
    },

    /**
     * Sign in with OAuth provider
     */
    async signInWithOAuth(provider: 'github' | 'google') {
      this.isLoading = true
      this.error = null

      try {
        const auth = getAuthService()
        const result = await auth.signInWithOAuth({
          provider,
          redirectTo: window.location.origin,
        })

        if (result.error) {
          throw new Error(result.error.message)
        }
      } catch (e: any) {
        this.error = e.message
        throw e
      } finally {
        this.isLoading = false
      }
    },

    /**
     * Sign out
     */
    async signOut() {
      this.isLoading = true

      try {
        const auth = getAuthService()
        await auth.signOut()
        this.user = null
        this.isAuthenticated = false
      } finally {
        this.isLoading = false
      }
    },
  },
})
