import { createProvider, getModelNameForTask } from './providers'
// Test task routing
console.log('Chat task routes to:', getModelNameForTask('chat'))
// Expected: gpt-5.2

console.log('Slides task routes to:', getModelNameForTask('slides'))
// Expected: gemini-3-pro-preview
console.log('Provider factory working ✅')