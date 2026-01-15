import { defineStore } from 'pinia'
import { auth, supabase } from '@/services'
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
    error: null
  }),

  actions: {
    /**
     * Initialize auth state from session
     */
    async initialize() {
      this.isLoading = true
      try {
        const { data } = await auth.getSession()
        if (data.session) {
          this.user = {
            id: data.session.user.id,
            email: data.session.user.email || '',
            name: data.session.user.user_metadata?.name,
            avatar_url: data.session.user.user_metadata?.avatar_url,
            created_at: data.session.user.created_at
          }
          this.isAuthenticated = true
        }
      } catch (e) {
        console.error('Auth initialization error:', e)
      } finally {
        this.isLoading = false
      }

      // Listen for auth changes
      auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          this.user = {
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.name,
            avatar_url: session.user.user_metadata?.avatar_url,
            created_at: session.user.created_at
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
    async signUp(email: string, password: string) {
      this.isLoading = true
      this.error = null
      try {
        const { error } = await auth.signUp(email, password)
        if (error) throw error
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
        const { error } = await auth.signIn(email, password)
        if (error) throw error
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
        const { error } = await auth.signInWithOAuth(provider)
        if (error) throw error
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
        await auth.signOut()
        this.user = null
        this.isAuthenticated = false
      } finally {
        this.isLoading = false
      }
    }
  }
})
