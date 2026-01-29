// User and profile types

export interface User {
  id: string // UUID from auth provider
  email: string
  email_verified?: boolean
  created_at: string
  updated_at?: string
}

export interface UserProfile {
  user_id: string

  display_name?: string
  avatar_url?: string
  bio?: string

  // Subscription/plan info
  plan: UserPlan
  plan_expires_at?: string | null

  // Usage tracking
  documents_count: number
  storage_used_bytes: number

  created_at: string
  updated_at: string
}

export type UserPlan = 'free' | 'pro' | 'team' | 'enterprise'

// Auth types
export interface Session {
  access_token: string
  refresh_token?: string
  expires_at?: number
  expires_in?: number
  user: User
}

export interface AuthResult {
  session: Session | null
  user: User | null
  error?: AuthError
}

export interface AuthError {
  message: string
  code?: string
}

export type AuthEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY'

export type AuthCallback = (event: AuthEvent, session: Session | null) => void
export type Unsubscribe = () => void
