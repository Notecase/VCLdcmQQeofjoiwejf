export { useEditorStore } from './editor'
export { usePreferencesStore } from './preferences'
export { useAuthStore } from './auth'
export { useLayoutStore } from './layout'
export { useNotificationsStore } from './notifications'
export { useProjectStore } from './project'
export { useAIStore } from './ai'

// Re-export AI types for convenience
export type { ChatSession, ChatMessage, ThinkingStep, Citation, PendingEdit, AIStatus } from './ai'
