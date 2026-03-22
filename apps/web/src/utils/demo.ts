/**
 * Demo Mode Utilities
 *
 * Controls the NoteShell demo experience.
 * When demo mode is active, stores load static fixtures instead of API calls.
 */

const DEMO_STORAGE_KEY = 'demoMode'

/** Password for demo access (can be overridden via env) */
export const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || 'noteshell2026'

/** Check if the current session is in demo mode */
export function isDemoMode(): boolean {
  return sessionStorage.getItem(DEMO_STORAGE_KEY) === 'true'
}

/** Activate demo mode for this session */
export function enterDemoMode(): void {
  sessionStorage.setItem(DEMO_STORAGE_KEY, 'true')
}

/** Deactivate demo mode */
export function exitDemoMode(): void {
  sessionStorage.removeItem(DEMO_STORAGE_KEY)
}
