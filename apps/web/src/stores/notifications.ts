/**
 * Notifications Store - Toast message system
 * TypeScript Pinia store for production scalability
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface Notification {
  id: string
  type: NotificationType
  title?: string
  message: string
  duration?: number
  dismissible?: boolean
  createdAt: number
}

let notificationId = 0

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref<Notification[]>([])
  const maxNotifications = ref(5)

  // Auto-remove timers
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function generateId(): string {
    return `notification-${++notificationId}-${Date.now()}`
  }

  function add(notification: Omit<Notification, 'id' | 'createdAt'>): string {
    const id = generateId()
    const newNotification: Notification = {
      ...notification,
      id,
      createdAt: Date.now(),
      dismissible: notification.dismissible ?? true,
      duration: notification.duration ?? 5000,
    }

    // Add to list
    notifications.value.push(newNotification)

    // Limit max notifications
    while (notifications.value.length > maxNotifications.value) {
      const oldest = notifications.value.shift()
      if (oldest) {
        const timer = timers.get(oldest.id)
        if (timer) {
          clearTimeout(timer)
          timers.delete(oldest.id)
        }
      }
    }

    // Auto dismiss
    if (newNotification.duration && newNotification.duration > 0) {
      const timer = setTimeout(() => {
        dismiss(id)
      }, newNotification.duration)
      timers.set(id, timer)
    }

    return id
  }

  function dismiss(id: string) {
    const timer = timers.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.delete(id)
    }

    notifications.value = notifications.value.filter((n) => n.id !== id)
  }

  function dismissAll() {
    timers.forEach((timer) => clearTimeout(timer))
    timers.clear()
    notifications.value = []
  }

  // Convenience methods
  function info(message: string, title?: string) {
    return add({ type: 'info', message, title })
  }

  function success(message: string, title?: string) {
    return add({ type: 'success', message, title })
  }

  function warning(message: string, title?: string) {
    return add({ type: 'warning', message, title })
  }

  function error(message: string, title?: string) {
    return add({ type: 'error', message, title, duration: 10000 })
  }

  return {
    notifications,
    maxNotifications,
    add,
    dismiss,
    dismissAll,
    info,
    success,
    warning,
    error,
  }
})
