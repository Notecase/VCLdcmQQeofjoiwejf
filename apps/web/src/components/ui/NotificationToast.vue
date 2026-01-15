<script setup lang="ts">
/**
 * NotificationToast - Toast notification display system
 * TypeScript component with animations
 */
import { computed } from 'vue'
import { Info, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-vue-next'
import { useNotificationsStore, type NotificationType } from '@/stores/notifications'

const notificationsStore = useNotificationsStore()

function getIcon(type: NotificationType) {
  switch (type) {
    case 'success': return CheckCircle
    case 'warning': return AlertTriangle
    case 'error': return XCircle
    default: return Info
  }
}

function getTypeClass(type: NotificationType) {
  return `toast-${type}`
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="notification in notificationsStore.notifications"
          :key="notification.id"
          class="toast"
          :class="getTypeClass(notification.type)"
        >
          <component :is="getIcon(notification.type)" :size="18" class="toast-icon" />
          <div class="toast-content">
            <div v-if="notification.title" class="toast-title">
              {{ notification.title }}
            </div>
            <div class="toast-message">
              {{ notification.message }}
            </div>
          </div>
          <button 
            v-if="notification.dismissible"
            class="toast-dismiss"
            @click="notificationsStore.dismiss(notification.id)"
          >
            <X :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 400px;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: var(--float-bg-color, #2d2d30);
  border: 1px solid var(--border-color, #3c3c3c);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  color: var(--text-color, #fff);
}

.toast-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.toast-info .toast-icon {
  color: var(--primary-color, #65b9f4);
}

.toast-success .toast-icon {
  color: #4ade80;
}

.toast-warning .toast-icon {
  color: #fbbf24;
}

.toast-error .toast-icon {
  color: #f87171;
}

.toast-content {
  flex: 1;
  min-width: 0;
}

.toast-title {
  font-weight: 600;
  margin-bottom: 4px;
  font-size: 14px;
}

.toast-message {
  font-size: 13px;
  color: var(--text-color-secondary, #aaa);
  line-height: 1.4;
}

.toast-dismiss {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-color-secondary, #888);
  cursor: pointer;
  flex-shrink: 0;
}

.toast-dismiss:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-color, #fff);
}

/* Transitions */
.toast-enter-active {
  transition: all 0.3s ease;
}

.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100px);
}

.toast-move {
  transition: transform 0.3s ease;
}
</style>
