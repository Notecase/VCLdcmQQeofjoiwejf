# Fix New Note Focus Bug — Keyboard & Ghost Icons

## Context

After the previous round of fixes (empty note content, AI repetition, cursor alignment), new notes created by the AI deep agent still have focus issues. When a note is created via AI, the user can't use backspace, Enter jumps to end of note, and the ParagraphFrontButton (ghost icons) appear at the browser window corner. All symptoms disappear after clicking the note. The root cause is that `setMarkdown()` doesn't focus the editor when no saved cursor exists.

---

## Root Cause

### The flow when AI creates a note:

1. Backend `createNote` tool emits `note-navigate` event
2. Frontend `ai.service.ts:845` calls `editorStore.loadDocument(noteId)`
3. `loadDocument()` → `openDocument()` → sets `this.currentDocument`
4. Vue watcher in `EditorArea.vue:247` calls `muyaInstance.value.setMarkdown(newDoc.content, newDoc.editor_state?.cursor)`
5. `setMarkdown()` (muya.ts:181) calls `this.setContent(markdown)` with `autoFocus = false`
6. `setContent()` (editor/index.ts:299) rebuilds scrollPage but does NOT call `focus()` since `autoFocus` defaults to `false`
7. For new notes, `editor_state?.cursor` is undefined, so `setMarkdown` never calls `setCursor` either

**Result:** After `setContent()`, the editor has new DOM blocks but:

- `editor.activeContentBlock` is null
- No native DOM selection exists (no cursor in any contenteditable)
- No `selection-change` event fires → ParagraphFrontButton doesn't reposition

### Why keyboard breaks:

The event handler in `editor/index.ts:73` calls `this.selection.getSelection()`. With no DOM selection, it returns null → `!isSelectionInSameBlock || !anchorBlock` is true → ALL events (keydown, input) are silently dropped at line 87. The browser's native contenteditable still inserts characters, but Muya doesn't process them (backspace, Enter, etc. are ignored).

### Why ghost icons appear at corner:

ParagraphFrontButton subscribes to `selection-change`. No event fires after `setContent` → button still references a stale block from the previous note (detached DOM) → `getBoundingClientRect()` returns 0,0 → button renders at top-left corner.

---

## Fix

### Single change in `EditorArea.vue` — document watcher (lines 247-266)

Add `muya.focus()` call after `setMarkdown()` when no saved cursor exists:

```typescript
watch(
  () => editorStore.currentDocument,
  (newDoc, oldDoc) => {
    if (newDoc && muyaInstance.value && newDoc.id !== oldDoc?.id) {
      clearAllDiffs()
      muyaInstance.value.setMarkdown(newDoc.content, newDoc.editor_state?.cursor)

      // Focus editor when no saved cursor (e.g. newly created notes).
      // Without this, keyboard events are dropped and ghost icons appear.
      if (!newDoc.editor_state?.cursor) {
        nextTick(() => {
          muyaInstance.value?.focus()
        })
      }

      nextTick(() => {
        const state = muyaInstance.value?.getState() || []
        const toc = extractHeadingsFromState(state)
        editorStore.updateToc(toc)
      })
    }
  }
)
```

### Why this works

`muya.focus()` → `editor.focus()` (editor/index.ts:128):

1. Finds first content block via `scrollPage.firstContentInDescendant()`
2. Calls `firstLeafBlock.setCursor(0, 0, needUpdated)` which:
   - Sets `editor.activeContentBlock = this` → fixes event dispatch
   - Calls `selection.setSelection(cursor)` → places native DOM selection
   - Emits `selection-change` → ParagraphFrontButton repositions correctly

### Why `nextTick` is needed

`setContent` calls `scrollPage.updateState()` which rebuilds DOM. New nodes must be attached/rendered before we can place a selection. `nextTick` ensures Vue's DOM update cycle completes first.

### Why the condition `!newDoc.editor_state?.cursor`

When a saved cursor exists, `setMarkdown` already handles focus via `setTimeout(() => this.setCursor(cursor), 0)`. Calling `focus()` redundantly would override the saved cursor position to 0,0.

---

## File to Modify

| File                                            | Change                                             |
| ----------------------------------------------- | -------------------------------------------------- |
| `apps/web/src/components/editor/EditorArea.vue` | Add `focus()` call in document watcher (line ~256) |

## Verification

1. Create a new note via AI → keyboard should work immediately (backspace, Enter)
2. ParagraphFrontButton should appear next to first block, not at corner
3. Switch to existing note with saved cursor → cursor restores correctly (not 0,0)
4. Switch between notes → no regression
5. `pnpm typecheck && pnpm build`
