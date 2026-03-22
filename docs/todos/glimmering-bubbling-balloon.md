# Phase 3: Migrate Remaining AI Surfaces + UI Improvements

## Context

**Branch:** `feature/generative-ui`
**Date:** 2026-03-22
**Continues from:** Phase 2 (descriptive reasoning, SourceChips, ActionSummaryCard, edit-proposal for create_note)

### Current State

Phase 2 migrated the **Editor Sidebar** (`ChatMessage.vue`) to use ActivityStream with descriptive reasoning, SourceChips, ActionSummaryCard, and EditProposalCard. Backend agents now emit contextual thinking text instead of mechanical tool names.

Two AI chat surfaces remain non-migrated:

1. **Secretary Chat** (`SecretaryMessageCard.vue`) — Shows thinking as a collapsed count ("3 thinking steps") with no descriptions. Tool calls show raw names like `generateDailyPlan`.
2. **HomePage DeepAgent** (`ToolCallBox.vue`) — Shows mechanical tool names like `web_search`, `write_file` directly.

The backend already emits descriptive text ("Loading your plans, preferences, and schedule...") but the Secretary frontend ignores it. The DeepAgent tools have no mapping at all.

---

## Phase D: Migrate SecretaryMessageCard to ActivityStream

**Goal:** Replace the Secretary's custom thinking/tool rendering with the shared ActivityStream component.

### D1. Add `thinkingStepsOverride` prop to ActivityStream

**File:** `apps/web/src/components/ai/activity/ActivityStream.vue`

ActivityStream currently reads thinking steps from `store.getThinkingStepsForMessage()` (hardcoded to `ai.ts`). Secretary stores thinking steps ON the message object. Add an optional prop to decouple:

```typescript
// Line 19-23: Add optional prop
const props = defineProps<{
  messageId: string
  toolCalls: ToolCall[]
  isStreaming: boolean
  thinkingStepsOverride?: ThinkingStep[]
}>()

// Line 29: Use override when provided
const thinkingSteps = computed(() =>
  props.thinkingStepsOverride ?? store.getThinkingStepsForMessage(props.messageId)
)
```

Import `ThinkingStep` type from `@/stores/ai`.

### D2. Rewrite SecretaryMessageCard to use ActivityStream

**File:** `apps/web/src/components/secretary/SecretaryMessageCard.vue`

**Add imports:**
```typescript
import { ActivityStream } from '@/components/ai/activity'
import type { ThinkingStep, ToolCall } from '@/stores/ai'
import StreamingCursor from '@/components/ai/shared/StreamingCursor.vue'
```

**Remove imports:** `ToolCallCard`, `Loader2`, `Brain`

**Add computed adapters** (secretary `string[]` → `ThinkingStep[]`):
```typescript
const thinkingStepsAsActivity = computed<ThinkingStep[]>(() =>
  (props.message.thinkingSteps || []).map((desc, i, arr) => ({
    id: `sec-${props.message.id}-${i}`,
    type: 'thought' as const,
    description: desc,
    status: (props.isStreaming && i === arr.length - 1) ? 'running' as const : 'complete' as const,
    startedAt: props.message.createdAt,
  }))
)
```

**Add secretary tool description map** (secretary tool names → human-readable):
```typescript
const secretaryToolDescriptions: Record<string, string> = {
  readMemoryFile: 'Reading your memory...',
  writeMemoryFile: 'Saving to memory...',
  listMemoryFiles: 'Checking your memories...',
  deleteMemoryFile: 'Removing memory file...',
  renameMemoryFile: 'Renaming memory file...',
  createRoadmap: 'Creating a new roadmap...',
  saveRoadmap: 'Saving your roadmap...',
  activateRoadmap: 'Activating roadmap...',
  generateDailyPlan: 'Generating your daily plan...',
  saveReflection: 'Saving your reflection...',
  modifyPlan: 'Updating your plan...',
  bulkModifyPlan: 'Applying bulk changes to plan...',
  carryOverTasks: 'Carrying tasks to next day...',
  manageRecurringBlocks: 'Managing recurring blocks...',
  logActivity: 'Logging activity...',
}

const toolCallsForActivity = computed<ToolCall[]>(() =>
  (props.message.toolCalls || []).map(tc => ({
    ...tc,
    toolName: secretaryToolDescriptions[tc.toolName] || tc.toolName.replace(/_/g, ' ') + '...',
  }))
)

const hasActivityContent = computed(() =>
  thinkingStepsAsActivity.value.length > 0 || toolCallsForActivity.value.length > 0
)
```

**Replace template** — remove the thinking section + ToolCallCard loop, add ActivityStream:
```html
<!-- Replace lines 70-89 with: -->
<ActivityStream
  v-if="isAssistant && hasActivityContent"
  :message-id="message.id"
  :tool-calls="toolCallsForActivity"
  :is-streaming="isStreaming"
  :thinking-steps-override="thinkingStepsAsActivity"
/>
```

Replace inline `<span class="streaming-cursor" />` with `<StreamingCursor v-if="isStreaming" />`.

**Remove:** the `toToolCallProp` function, unused CSS (`.thinking-section`, `.thinking-header`, `.embedded-tool`, `.streaming-cursor`, `@keyframes blink`).

### D3. No parent changes needed

`SecretaryChat.vue`, `ChatDrawer.vue`, and `PlanCreationChat.vue` all pass `<SecretaryMessageCard :message="msg" :is-streaming="...">` — the props interface is unchanged.

---

## Phase E: Human-Readable Tool Names in HomePage's ToolCallBox

**Goal:** Replace mechanical tool names in the DeepAgent chat with descriptive text.

### E1. Add tool description map to ToolCallBox

**File:** `apps/web/src/components/deepagent/ToolCallBox.vue`

**Add tool mapping + computed:**
```typescript
const toolDescriptions: Record<string, string> = {
  write_file: 'Writing file...',
  read_file: 'Reading file...',
  delete_file: 'Deleting file...',
  list_files: 'Listing files...',
  write_todos: 'Creating task list...',
  update_todo: 'Updating task...',
  web_search: 'Searching the web...',
  think: 'Reasoning...',
  request_approval: 'Requesting your approval...',
  read_note: 'Reading your note...',
  search_notes: 'Searching knowledge base...',
}

const displayName = computed(() => {
  const name = props.toolCall.toolName
  const args = (props.toolCall.arguments || {}) as Record<string, unknown>

  // Contextual descriptions using arguments when available
  if (name === 'write_file' && args.filename) return `Writing "${args.filename}"...`
  if (name === 'read_file' && args.filename) return `Reading "${args.filename}"...`
  if (name === 'delete_file' && args.filename) return `Deleting "${args.filename}"...`
  if (name === 'web_search' && args.query) return `Searching: ${String(args.query).slice(0, 60)}`
  if (name === 'search_notes' && args.query) return `Searching for "${args.query}"...`

  return toolDescriptions[name]
    || name.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) + '...'
})
```

**Change line 90:** `{{ toolCall.toolName }}` → `{{ displayName }}`

**Update CSS:** Remove `font-family: ui-monospace` from `.tool-name` since it's now natural language.

---

## Execution Order

```
Phase D and Phase E are independent — can parallelize.

Phase D (Secretary → ActivityStream):
  D1. Add thinkingStepsOverride prop to ActivityStream.vue
  D2. Rewrite SecretaryMessageCard.vue

Phase E (ToolCallBox descriptions):
  E1. Add tool map + displayName to ToolCallBox.vue
```

## Commit Sequence

```
1. refactor(web): add thinkingStepsOverride prop to ActivityStream
2. refactor(web): migrate SecretaryMessageCard to ActivityStream
3. feat(web): add human-readable tool descriptions to ToolCallBox
```

## Verification

1. **Secretary — thinking steps:** Send "plan my day" → ActivityStream shows "Loading your plans, preferences, and schedule..." → "Found 2 active plans, calendar events" → "Generating your daily plan..." with timeline dots/icons, not just "3 thinking steps"
2. **Secretary — tool calls:** Tool calls show "Generating your daily plan..." not "generateDailyPlan"
3. **Secretary — streaming:** Last step has pulsing running indicator, completed steps show checkmarks
4. **Secretary — collapse:** Clicking ActivityStream header collapses/expands the timeline
5. **Secretary — parents:** Verify ChatDrawer and PlanCreationChat still work (same props interface)
6. **HomePage — tool names:** Send a research query → ToolCallBox shows "Searching the web..." not "web_search", file ops show `Writing "research_report.md"...`
7. **No regressions:** `pnpm typecheck && pnpm build && pnpm lint`
8. **Editor Sidebar unchanged:** Verify ChatMessage.vue still works (doesn't pass `thinkingStepsOverride`, uses default path)

## Key Files

### Modified (3 files)
- `apps/web/src/components/ai/activity/ActivityStream.vue` — Add `thinkingStepsOverride` prop
- `apps/web/src/components/secretary/SecretaryMessageCard.vue` — Rewrite to use ActivityStream
- `apps/web/src/components/deepagent/ToolCallBox.vue` — Add tool description map + displayName

### Reference (unchanged)
- `apps/web/src/components/ai/activity/ActivityItem.vue` — ThinkingStep type contract
- `apps/web/src/stores/secretary.ts` — SecretaryChatMessage/SecretaryToolCall types
- `apps/web/src/stores/ai.ts` — ThinkingStep, ToolCall types
- `apps/web/src/components/ai/ChatMessage.vue` — Pattern reference (existing ActivityStream usage)
