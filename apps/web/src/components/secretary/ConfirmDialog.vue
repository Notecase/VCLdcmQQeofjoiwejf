<script setup lang="ts">
import BaseModal from '@/components/ai/modals/BaseModal.vue'
import { AlertTriangle } from 'lucide-vue-next'

const props = defineProps<{
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <BaseModal :title="title" size="sm" @close="emit('cancel')">
    <template #icon>
      <AlertTriangle v-if="variant === 'danger'" :size="20" class="danger-icon" />
    </template>
    <p class="confirm-message">{{ message }}</p>
    <template #footer>
      <button class="btn btn-cancel" @click="emit('cancel')">
        {{ cancelLabel || 'Cancel' }}
      </button>
      <button
        class="btn btn-confirm"
        :class="{ danger: variant === 'danger' }"
        @click="emit('confirm')"
      >
        {{ confirmLabel || 'Confirm' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.danger-icon {
  color: #f85149;
}

.confirm-message {
  font-size: 14px;
  color: var(--text-color-secondary, #94a3b8);
  line-height: 1.5;
  margin: 0;
}

.btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #333338);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-cancel {
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.04);
}

.btn-confirm {
  background: rgba(124, 158, 248, 0.15);
  color: var(--primary-color, #7c9ef8);
  border-color: rgba(124, 158, 248, 0.3);
}

.btn-confirm:hover {
  background: rgba(124, 158, 248, 0.25);
}

.btn-confirm.danger {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
  border-color: rgba(248, 81, 73, 0.3);
}

.btn-confirm.danger:hover {
  background: rgba(248, 81, 73, 0.25);
}
</style>
