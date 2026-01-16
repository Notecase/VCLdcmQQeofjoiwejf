/**
 * Supabase Auth Adapter
 * Implements IAuthProvider for Supabase authentication
 */
import { supabase, isSupabaseConfigured } from '../supabase';
/**
 * Convert Supabase error to our AuthError format
 */
function toAuthError(error) {
    if (error && typeof error === 'object' && 'message' in error) {
        const err = error;
        return {
            code: err.code || 'UNKNOWN_ERROR',
            message: err.message,
            status: err.status
        };
    }
    return {
        code: 'UNKNOWN_ERROR',
        message: String(error)
    };
}
/**
 * Convert Supabase user to our AuthUser format
 */
function toAuthUser(user) {
    return {
        id: user.id,
        email: user.email || '',
        email_verified: user.email_confirmed_at != null,
        created_at: user.created_at,
        updated_at: user.updated_at || user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        app_metadata: user.app_metadata,
        user_metadata: user.user_metadata
    };
}
/**
 * Convert Supabase session to our AuthSession format
 */
function toAuthSession(session) {
    return {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at || 0,
        expires_in: session.expires_in || 0,
        token_type: session.token_type || 'bearer',
        user: toAuthUser(session.user)
    };
}
/**
 * Supabase Auth Provider implementation
 */
class SupabaseAuthProvider {
    async getSession() {
        try {
            const { data, error } = await supabase.auth.getSession();
            if (error) {
                return { data: null, error: toAuthError(error) };
            }
            if (!data.session) {
                return { data: null, error: { code: 'NO_SESSION', message: 'No active session' } };
            }
            return { data: toAuthSession(data.session), error: null };
        }
        catch (err) {
            return { data: null, error: toAuthError(err) };
        }
    }
    async signUp(credentials) {
        try {
            const { data, error } = await supabase.auth.signUp({
                email: credentials.email,
                password: credentials.password,
                options: {
                    data: credentials.metadata
                }
            });
            if (error) {
                return { data: null, error: toAuthError(error) };
            }
            if (!data.session) {
                // Email confirmation required
                return {
                    data: null,
                    error: {
                        code: 'EMAIL_CONFIRMATION_REQUIRED',
                        message: 'Please check your email to confirm your account'
                    }
                };
            }
            return { data: toAuthSession(data.session), error: null };
        }
        catch (err) {
            return { data: null, error: toAuthError(err) };
        }
    }
    async signIn(credentials) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: credentials.email,
                password: credentials.password
            });
            if (error) {
                return { data: null, error: toAuthError(error) };
            }
            if (!data.session) {
                return { data: null, error: { code: 'NO_SESSION', message: 'Sign in failed' } };
            }
            return { data: toAuthSession(data.session), error: null };
        }
        catch (err) {
            return { data: null, error: toAuthError(err) };
        }
    }
    async signInWithOAuth(options) {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: options.provider,
                options: {
                    redirectTo: options.redirectTo,
                    scopes: options.scopes?.join(' ')
                }
            });
            if (error) {
                return { data: null, error: toAuthError(error) };
            }
            return { data: undefined, error: null };
        }
        catch (err) {
            return { data: null, error: toAuthError(err) };
        }
    }
    async signOut() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                return { data: null, error: toAuthError(error) };
            }
            return { data: undefined, error: null };
        }
        catch (err) {
            return { data: null, error: toAuthError(err) };
        }
    }
    async resetPassword(options) {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(options.email, { redirectTo: options.redirectTo });
            if (error) {
                return { data: null, error: toAuthError(error) };
            }
            return { data: undefined, error: null };
        }
        catch (err) {
            return { data: null, error: toAuthError(err) };
        }
    }
    async updatePassword(options) {
        try {
            const { error } = await supabase.auth.updateUser({
                password: options.password
            });
            if (error) {
                return { data: null, error: toAuthError(error) };
            }
            return { data: undefined, error: null };
        }
        catch (err) {
            return { data: null, error: toAuthError(err) };
        }
    }
    async refreshSession() {
        try {
            const { data, error } = await supabase.auth.refreshSession();
            if (error) {
                return { data: null, error: toAuthError(error) };
            }
            if (!data.session) {
                return { data: null, error: { code: 'NO_SESSION', message: 'Session refresh failed' } };
            }
            return { data: toAuthSession(data.session), error: null };
        }
        catch (err) {
            return { data: null, error: toAuthError(err) };
        }
    }
    async getUser() {
        try {
            const { data, error } = await supabase.auth.getUser();
            if (error) {
                return { data: null, error: toAuthError(error) };
            }
            if (!data.user) {
                return { data: null, error: { code: 'NO_USER', message: 'No authenticated user' } };
            }
            return { data: toAuthUser(data.user), error: null };
        }
        catch (err) {
            return { data: null, error: toAuthError(err) };
        }
    }
    async updateUser(updates) {
        try {
            const { data, error } = await supabase.auth.updateUser({
                data: updates
            });
            if (error) {
                return { data: null, error: toAuthError(error) };
            }
            if (!data.user) {
                return { data: null, error: { code: 'UPDATE_FAILED', message: 'User update failed' } };
            }
            return { data: toAuthUser(data.user), error: null };
        }
        catch (err) {
            return { data: null, error: toAuthError(err) };
        }
    }
    onAuthStateChange(callback) {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            const mappedEvent = event; // Supabase events match our events
            callback(mappedEvent, session ? toAuthSession(session) : null);
        });
        return {
            unsubscribe: () => subscription.unsubscribe()
        };
    }
}
// Singleton instance
let instance = null;
/**
 * Create or get Supabase auth provider instance
 */
export function createSupabaseAuth() {
    if (!isSupabaseConfigured) {
        throw new Error('Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
    }
    if (!instance) {
        instance = new SupabaseAuthProvider();
    }
    return instance;
}
