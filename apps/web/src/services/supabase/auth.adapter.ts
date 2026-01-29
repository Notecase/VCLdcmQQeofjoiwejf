/**
 * Supabase Auth Adapter
 * Implements IAuthProvider for Supabase authentication
 */
import { supabase, isSupabaseConfigured } from '../supabase'
import type {
  IAuthProvider,
  AuthResult,
  AuthSession,
  AuthUser,
  SignUpCredentials,
  SignInCredentials,
  OAuthOptions,
  ResetPasswordOptions,
  UpdatePasswordOptions,
  AuthStateChangeCallback,
  AuthError,
} from '../providers'

/**
 * Convert Supabase error to our AuthError format
 */
function toAuthError(error: unknown): AuthError {
  if (error && typeof error === 'object' && 'message' in error) {
    const err = error as { message: string; code?: string; status?: number }
    return {
      code: err.code || 'UNKNOWN_ERROR',
      message: err.message,
      status: err.status,
    }
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: String(error),
  }
}

/**
 * Convert Supabase user to our AuthUser format
 */
function toAuthUser(user: any): AuthUser {
  return {
    id: user.id,
    email: user.email || '',
    email_verified: user.email_confirmed_at != null,
    created_at: user.created_at,
    updated_at: user.updated_at || user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
  }
}

/**
 * Convert Supabase session to our AuthSession format
 */
function toAuthSession(session: any): AuthSession {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || 0,
    expires_in: session.expires_in || 0,
    token_type: session.token_type || 'bearer',
    user: toAuthUser(session.user),
  }
}

/**
 * Supabase Auth Provider implementation
 */
class SupabaseAuthProvider implements IAuthProvider {
  async getSession(): Promise<AuthResult<AuthSession>> {
    try {
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        return { data: null, error: toAuthError(error) }
      }

      if (!data.session) {
        return { data: null, error: { code: 'NO_SESSION', message: 'No active session' } }
      }

      return { data: toAuthSession(data.session), error: null }
    } catch (err) {
      return { data: null, error: toAuthError(err) }
    }
  }

  async signUp(credentials: SignUpCredentials): Promise<AuthResult<AuthSession>> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          data: credentials.metadata,
        },
      })

      if (error) {
        return { data: null, error: toAuthError(error) }
      }

      if (!data.session) {
        // Email confirmation required
        return {
          data: null,
          error: {
            code: 'EMAIL_CONFIRMATION_REQUIRED',
            message: 'Please check your email to confirm your account',
          },
        }
      }

      return { data: toAuthSession(data.session), error: null }
    } catch (err) {
      return { data: null, error: toAuthError(err) }
    }
  }

  async signIn(credentials: SignInCredentials): Promise<AuthResult<AuthSession>> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      })

      if (error) {
        return { data: null, error: toAuthError(error) }
      }

      if (!data.session) {
        return { data: null, error: { code: 'NO_SESSION', message: 'Sign in failed' } }
      }

      return { data: toAuthSession(data.session), error: null }
    } catch (err) {
      return { data: null, error: toAuthError(err) }
    }
  }

  async signInWithOAuth(options: OAuthOptions): Promise<AuthResult<void>> {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: options.provider as 'google' | 'github' | 'apple',
        options: {
          redirectTo: options.redirectTo,
          scopes: options.scopes?.join(' '),
        },
      })

      if (error) {
        return { data: null, error: toAuthError(error) }
      }

      return { data: undefined, error: null }
    } catch (err) {
      return { data: null, error: toAuthError(err) }
    }
  }

  async signOut(): Promise<AuthResult<void>> {
    try {
      const { error } = await supabase.auth.signOut()

      if (error) {
        return { data: null, error: toAuthError(error) }
      }

      return { data: undefined, error: null }
    } catch (err) {
      return { data: null, error: toAuthError(err) }
    }
  }

  async resetPassword(options: ResetPasswordOptions): Promise<AuthResult<void>> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(options.email, {
        redirectTo: options.redirectTo,
      })

      if (error) {
        return { data: null, error: toAuthError(error) }
      }

      return { data: undefined, error: null }
    } catch (err) {
      return { data: null, error: toAuthError(err) }
    }
  }

  async updatePassword(options: UpdatePasswordOptions): Promise<AuthResult<void>> {
    try {
      const { error } = await supabase.auth.updateUser({
        password: options.password,
      })

      if (error) {
        return { data: null, error: toAuthError(error) }
      }

      return { data: undefined, error: null }
    } catch (err) {
      return { data: null, error: toAuthError(err) }
    }
  }

  async refreshSession(): Promise<AuthResult<AuthSession>> {
    try {
      const { data, error } = await supabase.auth.refreshSession()

      if (error) {
        return { data: null, error: toAuthError(error) }
      }

      if (!data.session) {
        return { data: null, error: { code: 'NO_SESSION', message: 'Session refresh failed' } }
      }

      return { data: toAuthSession(data.session), error: null }
    } catch (err) {
      return { data: null, error: toAuthError(err) }
    }
  }

  async getUser(): Promise<AuthResult<AuthUser>> {
    try {
      const { data, error } = await supabase.auth.getUser()

      if (error) {
        return { data: null, error: toAuthError(error) }
      }

      if (!data.user) {
        return { data: null, error: { code: 'NO_USER', message: 'No authenticated user' } }
      }

      return { data: toAuthUser(data.user), error: null }
    } catch (err) {
      return { data: null, error: toAuthError(err) }
    }
  }

  async updateUser(updates: Partial<AuthUser['user_metadata']>): Promise<AuthResult<AuthUser>> {
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: updates,
      })

      if (error) {
        return { data: null, error: toAuthError(error) }
      }

      if (!data.user) {
        return { data: null, error: { code: 'UPDATE_FAILED', message: 'User update failed' } }
      }

      return { data: toAuthUser(data.user), error: null }
    } catch (err) {
      return { data: null, error: toAuthError(err) }
    }
  }

  onAuthStateChange(callback: AuthStateChangeCallback): { unsubscribe: () => void } {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const mappedEvent = event as any // Supabase events match our events
      callback(mappedEvent, session ? toAuthSession(session) : null)
    })

    return {
      unsubscribe: () => subscription.unsubscribe(),
    }
  }
}

// Singleton instance
let instance: SupabaseAuthProvider | null = null

/**
 * Create or get Supabase auth provider instance
 */
export function createSupabaseAuth(): IAuthProvider {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.'
    )
  }

  if (!instance) {
    instance = new SupabaseAuthProvider()
  }

  return instance
}
