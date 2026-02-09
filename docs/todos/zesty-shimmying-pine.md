# Muya-Powered AI Response Cards with Note Preview

## Context

Currently, AI responses on the home page render via `MarkdownContent.vue` (using `marked` + `DOMPurify`) — a different rendering engine from the note editor (Muya). For "create a note" requests, a separate `NotePreviewPanel` slides in on the right side, and the note is auto-saved immediately without user confirmation.

**Goal**: Replace `MarkdownContent` with Muya-based rendering for ALL assistant messages, and for new note creation, show an inline preview card with diff styling and a Save button (preview-before-commit flow).

**Two scenarios after this change:**

- **Regular responses** (roadmaps, explanations, etc.): Rendered in a rounded Muya card. Read-only. Not saved.
- **New note creation** ("create a note about X"): Same Muya card but editable, with green diff blocks showing additions, and a "Save" button. Note is NOT saved until user clicks Save.
- **Editing existing notes** ("add a paragraph to my X note"): Chat shows summary message ("I added 2 paragraphs"). Diffs appear in the right-side NotePreviewPanel (existing behavior, unchanged).

---

## Architecture

```
User prompt
    ↓
DeepAgent routing (chat/note/markdown/research)
    ↓
┌─────────────────────────────────────┐
│ mode = 'note' (create)              │
│  → streamNoteCreate() with preview  │
│  → Streams text deltas              │
│  → Emits 'note-preview-ready'       │
│  → Frontend shows MuyaResponseCard  │
│    (note-preview mode, editable)    │
│  → User clicks Save → createNote()  │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ mode = 'chat' / 'markdown' / etc.  │
│  → Streams text deltas              │
│  → Frontend shows MuyaResponseCard  │
│    (readonly mode)                  │
└─────────────────────────────────────┘
```

---

## Step 1: Add `note-preview-ready` event type

**File:** `packages/shared/src/types/research.ts:113-128`

Add `'note-preview-ready'` to the `ResearchStreamEventType` union:

```typescript
export type ResearchStreamEventType =
  | 'text'
  | 'thinking'
  | ...
  | 'note-navigate'
  | 'note-preview-ready'   // NEW — signals note content is ready for preview
  | 'thread-status'
  | ...
```

**Data shape:** `{ title: string, content: string }`

---

## Step 2: Backend — Preview-first note creation

**File:** `packages/ai/src/agents/note.agent.ts:418-434`

The NoteAgent already has `skipAutoSave` for update actions (line 416-417). Extend it to `create` actions:

```typescript
if (action === 'create') {
  if (skipAutoSave) {
    // Preview mode: return content without saving
    yield { type: 'finish', data: { success: true, title, content: fullContent } }
    return
  }
  // Existing save logic...
}
```

**File:** `packages/ai/src/agents/research/agent.ts` — `streamNoteCreate()` method (lines 144-178)

Change to use `skipAutoSave: true` and emit `note-preview-ready` instead of `note-navigate`:

```typescript
private async *streamNoteCreate(message: string): AsyncGenerator<ResearchStreamEvent> {
  const { NoteAgent } = await import('../note.agent')
  const noteAgent = new NoteAgent({
    supabase: this.config.supabase,
    userId: this.config.userId,
    openaiApiKey: this.config.openaiApiKey,
    model: this.config.model,
  })

  let noteTitle = ''
  let noteContent = ''

  for await (const chunk of noteAgent.stream({
    action: 'create',
    input: message,
    options: { skipAutoSave: true },  // KEY CHANGE: don't auto-save
  })) {
    if (chunk.type === 'thinking') {
      yield { event: 'thinking', data: chunk.data as string }
    } else if (chunk.type === 'text-delta') {
      noteContent += chunk.data as string
      yield { event: 'text', data: chunk.data as string, isDelta: true }
    } else if (chunk.type === 'title') {
      noteTitle = chunk.data as string
    } else if (chunk.type === 'finish') {
      const finish = chunk.data as { success: boolean; title?: string; content?: string }
      noteTitle = finish.title || noteTitle
      noteContent = finish.content || noteContent
    }
  }

  // Emit preview-ready instead of note-navigate
  yield {
    event: 'note-preview-ready',
    data: JSON.stringify({ title: noteTitle, content: noteContent }),
  }
}
```

---

## Step 3: Create `MuyaResponseCard.vue` component

**File:** `apps/web/src/components/deepagent/MuyaResponseCard.vue` (NEW)

### Props

| Prop          | Type                           | Default      | Description                        |
| ------------- | ------------------------------ | ------------ | ---------------------------------- |
| `content`     | `string`                       | `''`         | Markdown content to render         |
| `mode`        | `'readonly' \| 'note-preview'` | `'readonly'` | Determines editability and UI      |
| `isStreaming` | `boolean`                      | `false`      | Whether content is still streaming |
| `noteTitle`   | `string`                       | `''`         | Title shown in note-preview header |
| `isSaved`     | `boolean`                      | `false`      | Shows "Saved" badge vs Save button |

### Emits

| Event            | Payload                              | Description                              |
| ---------------- | ------------------------------------ | ---------------------------------------- |
| `save`           | `{ title: string, content: string }` | User clicked Save                        |
| `content-change` | `string`                             | User edited content in note-preview mode |

### Template structure

```
<div class="muya-response-card" :class="{ 'note-preview': isNotePreview }">
  <!-- Note preview header (only in note-preview mode) -->
  <div v-if="mode === 'note-preview'" class="card-header">
    <span class="card-title">{{ noteTitle || 'New Note' }}</span>
    <div class="card-actions">
      <span v-if="isSaved" class="saved-badge">Saved</span>
      <button v-else class="save-btn" @click="handleSave">Save to Notes</button>
    </div>
  </div>

  <!-- Muya container -->
  <div ref="muyaContainer" class="muya-body" />
</div>
```

### Muya lifecycle

1. **onMounted**: Create Muya instance with `markRaw()`, import Muya CSS
2. **Plugin registration**: Minimal set — NO ParagraphFrontButton, NO ParagraphFrontMenu for readonly. Full set for note-preview mode.
3. **Content watch**: Debounced `setMarkdown()` — 150ms debounce during streaming, immediate when streaming ends
4. **Read-only enforcement**: For `mode='readonly'`, set `pointer-events: none; user-select: text` on `.mu-container`
5. **Note-preview diff styling**: After streaming completes, apply green addition styling to all blocks:
   ```typescript
   function applyNewNoteDiffStyling(muya: Muya) {
     const scrollPage = muya.editor.scrollPage
     for (const child of scrollPage.children) {
       child.domNode.classList.add('mu-diff-block', 'mu-diff-addition')
     }
   }
   ```
6. **onUnmounted**: Call `muya.destroy()`, cleanup

### CSS

- Rounded card: `border-radius: 16px`, subtle border, same background as Muya editor
- Green diff blocks: Reuse existing `.mu-diff-addition` CSS (green left border + subtle green tint)
- Card header: flex row with title + save button
- Save button: Primary accent color, rounded
- Saved badge: Green checkmark + "Saved" text

---

## Step 4: Frontend store changes

**File:** `apps/web/src/stores/deepAgent.ts`

### New state

```typescript
const pendingNotePreview = ref<{ title: string; content: string } | null>(null)
```

### Handle `note-preview-ready` event (in `handleStreamEvent`)

```typescript
case 'note-preview-ready': {
  let previewData: { title: string; content: string }
  try {
    previewData = (typeof event.data === 'string'
      ? JSON.parse(event.data)
      : event.data) as { title: string; content: string }
  } catch { break }
  pendingNotePreview.value = previewData
  break
}
```

### New action: `saveNoteFromPreview()`

```typescript
async function saveNoteFromPreview(content?: string) {
  const preview = pendingNotePreview.value
  if (!preview) return

  const { createNote } = await import('@/services/notes.service')
  const { useAuthStore } = await import('@/stores/auth')
  const { useEditorStore } = await import('@/stores/editor')
  const auth = useAuthStore()

  if (!auth.user?.id) {
    notifications.error('Not authenticated')
    return
  }

  try {
    const result = await createNote(auth.user.id, {
      title: preview.title || 'Untitled Note',
      content: content || preview.content,
    })

    if (result.error) {
      notifications.error('Failed to save note')
      return
    }

    pendingNotePreview.value = { ...preview, _saved: true } // signal saved state
    notifications.success(`Note "${preview.title}" saved`)

    const editorStore = useEditorStore()
    await editorStore.loadDocuments() // refresh sidebar
  } catch (err) {
    notifications.error(err instanceof Error ? err.message : 'Failed to save note')
  }
}
```

### Also clear `pendingNotePreview` on new message / new thread

In `sendChatMessage()` at the top: `pendingNotePreview.value = null`
In `createNewThread()`: `pendingNotePreview.value = null`

### Export new refs and actions

Add `pendingNotePreview` and `saveNoteFromPreview` to the store return.

---

## Step 5: Integrate into HomePage.vue

**File:** `apps/web/src/views/HomePage.vue`

### Replace MarkdownContent with MuyaResponseCard

**Import change:**

```typescript
// Remove: import MarkdownContent from '@/components/deepagent/MarkdownContent.vue'
// Add:
import MuyaResponseCard from '@/components/deepagent/MuyaResponseCard.vue'
```

### Historical messages (chatMessages loop)

Replace `<MarkdownContent :content="msg.content" />` with:

```vue
<MuyaResponseCard :content="msg.content" mode="readonly" />
```

### Streaming message

Replace `<MarkdownContent :content="deepAgent.streamingContent" />` with:

```vue
<MuyaResponseCard
  :content="deepAgent.streamingContent"
  :is-streaming="true"
  :mode="deepAgent.pendingNotePreview ? 'note-preview' : 'readonly'"
  :note-title="deepAgent.pendingNotePreview?.title || ''"
  :is-saved="!!deepAgent.pendingNotePreview?._saved"
  @save="handleNoteSave"
/>
```

### Add save handler

```typescript
async function handleNoteSave(payload: { title: string; content: string }) {
  await deepAgent.saveNoteFromPreview(payload.content)
}
```

### Stop triggering NotePreviewPanel for new notes

The `note-navigate` event handler in deepAgent store currently opens the preview panel. Since we no longer emit `note-navigate` for new note creation (we emit `note-preview-ready` instead), the preview panel will naturally stop appearing for this flow. No change needed — the `note-navigate` handler still works for edit flows triggered by the Secretary agent.

---

## Step 6: CSS for diff blocks in response card

**Approach:** Reuse existing `.mu-diff-block` and `.mu-diff-addition` CSS classes that are already defined for the editor diff system. The MuyaResponseCard imports Muya CSS, which includes these classes. If additional styling is needed for the card context, add scoped styles.

Key styles needed in MuyaResponseCard:

```css
.muya-response-card {
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: var(--editor-bg, #1e1e1e);
  overflow: hidden;
}

.muya-response-card.readonly .mu-container {
  pointer-events: none;
  user-select: text;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.save-btn {
  /* primary button styles */
}
.saved-badge {
  color: #4ade80; /* green */
}

/* Diff styling for note preview (all additions) */
.muya-response-card .mu-diff-addition {
  border-left: 3px solid #4ade80;
  background: rgba(74, 222, 128, 0.05);
  padding-left: 12px;
}
```

---

## Files to Modify / Create

| File                                                     | Action                                              | Priority |
| -------------------------------------------------------- | --------------------------------------------------- | -------- |
| `packages/shared/src/types/research.ts`                  | Add `note-preview-ready` event type                 | HIGH     |
| `packages/ai/src/agents/note.agent.ts`                   | Support `skipAutoSave` for create action            | HIGH     |
| `packages/ai/src/agents/research/agent.ts`               | Preview-first note creation in `streamNoteCreate()` | HIGH     |
| `apps/web/src/components/deepagent/MuyaResponseCard.vue` | **NEW** — Muya-based response card                  | HIGH     |
| `apps/web/src/stores/deepAgent.ts`                       | Handle `note-preview-ready`, add save action        | HIGH     |
| `apps/web/src/views/HomePage.vue`                        | Replace MarkdownContent with MuyaResponseCard       | HIGH     |

---

## Implementation Order

1. **Types first** — Add `note-preview-ready` to shared types (tiny change, unblocks everything)
2. **Backend** — NoteAgent `skipAutoSave` for create + ResearchAgent `streamNoteCreate()` change
3. **MuyaResponseCard** — Build the component (can develop in isolation)
4. **Store** — Handle new event + save action
5. **HomePage** — Wire it all together

---

## Verification Plan

1. **Regular chat response**: Send "create a roadmap for learning RL"
   - Expected: Response renders in rounded Muya card, read-only, no Save button

2. **New note creation**: Send "create a note about black holes and add a table of top 4 biggest black holes"
   - Expected: Content streams into Muya card → `note-preview-ready` triggers note-preview mode → green diff blocks appear → Save button shows → clicking Save persists note → "Saved" badge appears

3. **Edit existing note**: Send "add another paragraph to my X note"
   - Expected: Chat shows summary, diffs appear in NotePreviewPanel (existing behavior, unchanged)

4. **Streaming performance**: Verify Muya debounce during streaming looks smooth, no jank

5. **Build validation**: `pnpm build && pnpm typecheck && pnpm lint`

6. **Cleanup verification**: Ensure `note-navigate` is no longer emitted for new note creation but still works for edit flows
