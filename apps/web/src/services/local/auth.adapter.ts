/**
 * Local Auth Adapter
 * Simple local storage based auth for offline/development mode
 */
import type {
  IAuthProvider,
  AuthUser,
  AuthSession,
  SignUpCredentials,
  SignInCredentials,
  OAuthOptions,
  ResetPasswordOptions,
  UpdatePasswordOptions,
  AuthResult,
  AuthStateChangeCallback,
  AuthStateChangeEvent,
} from '../providers'

const LOCAL_USER_KEY = 'inkdown_local_user'
const LOCAL_SESSION_KEY = 'inkdown_local_session'

class LocalAuthProvider implements IAuthProvider {
  private listeners: Set<AuthStateChangeCallback> = new Set()

  private getLocalUser(): AuthUser | null {
    const stored = localStorage.getItem(LOCAL_USER_KEY)
    return stored ? JSON.parse(stored) : null
  }

  private setLocalUser(user: AuthUser | null): void {
    if (user) {
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(LOCAL_USER_KEY)
    }
  }

  private getLocalSession(): AuthSession | null {
    const stored = localStorage.getItem(LOCAL_SESSION_KEY)
    return stored ? JSON.parse(stored) : null
  }

  private setLocalSession(session: AuthSession | null): void {
    if (session) {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(LOCAL_SESSION_KEY)
    }
  }

  private notify(event: AuthStateChangeEvent, session: AuthSession | null): void {
    this.listeners.forEach((cb) => cb(event, session))
  }

  private createSession(user: AuthUser): AuthSession {
    return {
      access_token: `local_token_${Date.now()}`,
      refresh_token: `local_refresh_${Date.now()}`,
      expires_at: Date.now() + 3600000, // 1 hour
      expires_in: 3600,
      token_type: 'bearer',
      user,
    }
  }

  async getSession(): Promise<AuthResult<AuthSession>> {
    const session = this.getLocalSession()
    if (session) {
      return { data: session, error: null }
    }
    return { data: null, error: { code: 'no_session', message: 'No active session' } }
  }

  async signUp(credentials: SignUpCredentials): Promise<AuthResult<AuthSession>> {
    const user: AuthUser = {
      id: `local_${Date.now()}`,
      email: credentials.email,
      email_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_metadata: credentials.metadata,
    }

    const session = this.createSession(user)
    this.setLocalUser(user)
    this.setLocalSession(session)
    this.notify('SIGNED_IN', session)

    return { data: session, error: null }
  }

  async signIn(credentials: SignInCredentials): Promise<AuthResult<AuthSession>> {
    // In local mode, any email/password works
    const user: AuthUser = {
      id: `local_${Date.now()}`,
      email: credentials.email,
      email_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const session = this.createSession(user)
    this.setLocalUser(user)
    this.setLocalSession(session)
    this.notify('SIGNED_IN', session)

    return { data: session, error: null }
  }

  async signInWithOAuth(_options: OAuthOptions): Promise<AuthResult<void>> {
    return {
      data: null,
      error: { code: 'not_supported', message: 'OAuth not available in local mode' },
    }
  }

  async signOut(): Promise<AuthResult<void>> {
    this.setLocalUser(null)
    this.setLocalSession(null)
    this.notify('SIGNED_OUT', null)
    return { data: undefined, error: null }
  }

  async resetPassword(_options: ResetPasswordOptions): Promise<AuthResult<void>> {
    return { data: undefined, error: null } // No-op in local mode
  }

  async updatePassword(_options: UpdatePasswordOptions): Promise<AuthResult<void>> {
    return { data: undefined, error: null } // No-op in local mode
  }

  async refreshSession(): Promise<AuthResult<AuthSession>> {
    const user = this.getLocalUser()
    if (user) {
      const session = this.createSession(user)
      this.setLocalSession(session)
      this.notify('TOKEN_REFRESHED', session)
      return { data: session, error: null }
    }
    return { data: null, error: { code: 'no_user', message: 'No user to refresh' } }
  }

  async getUser(): Promise<AuthResult<AuthUser>> {
    const user = this.getLocalUser()
    if (user) {
      return { data: user, error: null }
    }
    return { data: null, error: { code: 'no_user', message: 'No user found' } }
  }

  async updateUser(updates: Partial<AuthUser['user_metadata']>): Promise<AuthResult<AuthUser>> {
    const user = this.getLocalUser()
    if (user) {
      user.user_metadata = { ...user.user_metadata, ...updates }
      user.updated_at = new Date().toISOString()
      this.setLocalUser(user)
      this.notify('USER_UPDATED', this.getLocalSession())
      return { data: user, error: null }
    }
    return { data: null, error: { code: 'no_user', message: 'No user to update' } }
  }

  onAuthStateChange(callback: AuthStateChangeCallback): { unsubscribe: () => void } {
    this.listeners.add(callback)
    return {
      unsubscribe: () => this.listeners.delete(callback),
    }
  }
}

export function createLocalAuth(): IAuthProvider {
  return new LocalAuthProvider()
}
