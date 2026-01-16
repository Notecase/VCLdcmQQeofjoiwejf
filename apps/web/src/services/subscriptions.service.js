/**
 * Subscriptions Service
 * Real-time database change subscriptions
 */
import { getDatabaseService } from './factory';
/**
 * Subscribe to note changes for a user
 */
export function subscribeToNotes(userId, callback) {
    const db = getDatabaseService();
    const subscription = db.on('notes', '*', (payload) => {
        callback({
            type: payload.eventType,
            new: payload.new,
            old: payload.old
        });
    }, { column: 'user_id', value: userId });
    return () => subscription.unsubscribe();
}
/**
 * Subscribe to project changes for a user
 */
export function subscribeToProjects(userId, callback) {
    const db = getDatabaseService();
    const subscription = db.on('projects', '*', (payload) => {
        callback({
            type: payload.eventType,
            new: payload.new,
            old: payload.old
        });
    }, { column: 'user_id', value: userId });
    return () => subscription.unsubscribe();
}
/**
 * Subscribe to a single note's changes
 */
export function subscribeToNote(noteId, callback) {
    const db = getDatabaseService();
    const subscription = db.on('notes', '*', (payload) => {
        callback({
            type: payload.eventType,
            new: payload.new,
            old: payload.old
        });
    }, { column: 'id', value: noteId });
    return () => subscription.unsubscribe();
}
/**
 * Subscribe to notes in a specific project
 */
export function subscribeToProjectNotes(projectId, callback) {
    const db = getDatabaseService();
    const subscription = db.on('notes', '*', (payload) => {
        callback({
            type: payload.eventType,
            new: payload.new,
            old: payload.old
        });
    }, { column: 'project_id', value: projectId });
    return () => subscription.unsubscribe();
}
/**
 * Subscription manager to handle multiple subscriptions
 */
export class SubscriptionManager {
    subscriptions = new Map();
    /**
     * Add a subscription with a unique key
     */
    add(key, unsubscribe) {
        // Clean up existing subscription with same key
        this.remove(key);
        this.subscriptions.set(key, unsubscribe);
    }
    /**
     * Remove a subscription by key
     */
    remove(key) {
        const unsubscribe = this.subscriptions.get(key);
        if (unsubscribe) {
            unsubscribe();
            this.subscriptions.delete(key);
        }
    }
    /**
     * Remove all subscriptions
     */
    clear() {
        for (const unsubscribe of this.subscriptions.values()) {
            unsubscribe();
        }
        this.subscriptions.clear();
    }
    /**
     * Check if a subscription exists
     */
    has(key) {
        return this.subscriptions.has(key);
    }
    /**
     * Get the number of active subscriptions
     */
    get size() {
        return this.subscriptions.size;
    }
}
// Global subscription manager instance
export const subscriptionManager = new SubscriptionManager();
