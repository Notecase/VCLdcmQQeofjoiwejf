/**
 * Subscriptions Service
 * Real-time database change subscriptions
 */
import { getDatabaseService } from './factory'
import type { Note, Project, NoteChangeEvent, ProjectChangeEvent } from '@inkdown/shared'
import type { RealtimeSubscription } from './providers'

export type Unsubscribe = () => void

/**
 * Subscribe to note changes for a user
 */
export function subscribeToNotes(
  userId: string,
  callback: (event: NoteChangeEvent) => void
): Unsubscribe {
  const db = getDatabaseService()

  const subscription = db.on<Note>(
    'notes',
    '*',
    (payload) => {
      callback({
        type: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
        new: payload.new,
        old: payload.old,
      })
    },
    { column: 'user_id', value: userId }
  )

  return () => subscription.unsubscribe()
}

/**
 * Subscribe to project changes for a user
 */
export function subscribeToProjects(
  userId: string,
  callback: (event: ProjectChangeEvent) => void
): Unsubscribe {
  const db = getDatabaseService()

  const subscription = db.on<Project>(
    'projects',
    '*',
    (payload) => {
      callback({
        type: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
        new: payload.new,
        old: payload.old,
      })
    },
    { column: 'user_id', value: userId }
  )

  return () => subscription.unsubscribe()
}

/**
 * Subscribe to a single note's changes
 */
export function subscribeToNote(
  noteId: string,
  callback: (event: NoteChangeEvent) => void
): Unsubscribe {
  const db = getDatabaseService()

  const subscription = db.on<Note>(
    'notes',
    '*',
    (payload) => {
      callback({
        type: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
        new: payload.new,
        old: payload.old,
      })
    },
    { column: 'id', value: noteId }
  )

  return () => subscription.unsubscribe()
}

/**
 * Subscribe to notes in a specific project
 */
export function subscribeToProjectNotes(
  projectId: string,
  callback: (event: NoteChangeEvent) => void
): Unsubscribe {
  const db = getDatabaseService()

  const subscription = db.on<Note>(
    'notes',
    '*',
    (payload) => {
      callback({
        type: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
        new: payload.new,
        old: payload.old,
      })
    },
    { column: 'project_id', value: projectId }
  )

  return () => subscription.unsubscribe()
}

/**
 * Subscription manager to handle multiple subscriptions
 */
export class SubscriptionManager {
  private subscriptions: Map<string, Unsubscribe> = new Map()

  /**
   * Add a subscription with a unique key
   */
  add(key: string, unsubscribe: Unsubscribe): void {
    // Clean up existing subscription with same key
    this.remove(key)
    this.subscriptions.set(key, unsubscribe)
  }

  /**
   * Remove a subscription by key
   */
  remove(key: string): void {
    const unsubscribe = this.subscriptions.get(key)
    if (unsubscribe) {
      unsubscribe()
      this.subscriptions.delete(key)
    }
  }

  /**
   * Remove all subscriptions
   */
  clear(): void {
    for (const unsubscribe of this.subscriptions.values()) {
      unsubscribe()
    }
    this.subscriptions.clear()
  }

  /**
   * Check if a subscription exists
   */
  has(key: string): boolean {
    return this.subscriptions.has(key)
  }

  /**
   * Get the number of active subscriptions
   */
  get size(): number {
    return this.subscriptions.size
  }
}

// Global subscription manager instance
export const subscriptionManager = new SubscriptionManager()
