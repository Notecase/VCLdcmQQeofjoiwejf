/**
 * Auth Provider Interface
 * Provider-agnostic authentication abstraction for scale-ready architecture
 */

export type AuthProvider = 'email' | 'google' | 'github' | 'apple'

export interface AuthUser {
  id: string
  email: string
  email_verified: boolean
  created_at: string
  updated_at: string
  last_sign_in_at?: string
  app_metadata?: Record<string, unknown>
  user_metadata?: Record<string, unknown>
}

export interface AuthSession {
  access_token: string
  refresh_token: string
  expires_at: number
  expires_in: number
  token_type: string
  user: AuthUser
}

export interface SignUpCredentials {
  email: string
  password: string
  metadata?: Record<string, unknown>
}

export interface SignInCredentials {
  email: string
  password: string
}

export interface OAuthOptions {
  provider: AuthProvider
  redirectTo?: string
  scopes?: string[]
}

export interface ResetPasswordOptions {
  email: string
  redirectTo?: string
}

export interface UpdatePasswordOptions {
  password: string
}

export interface AuthError {
  code: string
  message: string
  status?: number
}

export type AuthResult<T> =
  | { data: T; error: null }
  | { data: null; error: AuthError }

export type AuthStateChangeCallback = (
  event: AuthStateChangeEvent,
  session: AuthSession | null
) => void

export type AuthStateChangeEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY'

/**
 * Auth Provider Interface
 * Implement this interface for different auth backends (Supabase, Firebase, Auth0, etc.)
 */
export interface IAuthProvider {
  // Current session
  getSession(): Promise<AuthResult<AuthSession>>

  // Authentication
  signUp(credentials: SignUpCredentials): Promise<AuthResult<AuthSession>>
  signIn(credentials: SignInCredentials): Promise<AuthResult<AuthSession>>
  signInWithOAuth(options: OAuthOptions): Promise<AuthResult<void>>
  signOut(): Promise<AuthResult<void>>

  // Password management
  resetPassword(options: ResetPasswordOptions): Promise<AuthResult<void>>
  updatePassword(options: UpdatePasswordOptions): Promise<AuthResult<void>>

  // Session management
  refreshSession(): Promise<AuthResult<AuthSession>>

  // User management
  getUser(): Promise<AuthResult<AuthUser>>
  updateUser(updates: Partial<AuthUser['user_metadata']>): Promise<AuthResult<AuthUser>>

  // State change listener
  onAuthStateChange(callback: AuthStateChangeCallback): { unsubscribe: () => void }
}
