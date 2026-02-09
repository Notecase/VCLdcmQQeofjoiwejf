# 2026-02-08: Fix Sidebar Active Note Highlight

## Context

After the color restoration changes, two bugs remain in SideBar.vue:

1. **Doc icon stays gray when active** — The text turns blue (`#58a6ff`) but the FileText icon stays gray because `.doc-icon { color: var(--text-color-secondary) }` is not overridden for the active state. The existing rule `.tree-item.active .item-icon { color: #58a6ff }` targets `.item-icon` but `.doc-icon` (also on the element) re-applies gray after it.
2. **Two notes highlighted simultaneously** — When you preview a note on the home page (sets `aiStore.previewNoteId`), then navigate to `/editor` (sets `editorStore.currentDocument`), the `isNoteActive()` function OR's both checks, so two different notes show as active. `previewNoteId` is never cleared on route change.

## Changes

### 1. Fix doc icon color on active state

**File:** `apps/web/src/components/layout/SideBar.vue` (CSS ~line 1661)

Add a more specific rule so `.doc-icon` turns blue when its parent `.tree-item` is active:

```css
.tree-item.active .doc-icon {
  color: #58a6ff;
}
```

This overrides `.doc-icon`'s default gray when the note row is active.

### 2. Make `isNoteActive()` route-aware (single highlight)

**File:** `apps/web/src/components/layout/SideBar.vue` (script ~line 58)

Change `isNoteActive()` to be context-dependent:

- On the **home page** (`/`): only match `aiStore.previewNoteId`
- On the **editor page** (`/editor`): only match `editorStore.currentDocument?.id`
- Anywhere else: only match `editorStore.currentDocument?.id`

```ts
function isNoteActive(noteId: string) {
  if (route.path === '/') {
    return aiStore.previewNoteId === noteId
  }
  return editorStore.currentDocument?.id === noteId
}
```

This is self-contained in SideBar — no need to add route guards or modify the AI store. Each page context checks only the relevant source of truth, so at most one note highlights at a time.

## Files to modify

1. `apps/web/src/components/layout/SideBar.vue` — both CSS and script changes

## Verification

- On home page: click a note in sidebar -> preview opens, that note highlighted (text + icon both blue)
- Click a different note -> previous unhighlights, new one highlights
- Navigate to `/editor` -> the editor's current document is highlighted, preview note is NOT
- On editor page with multiple tabs: switching tabs updates highlight correctly
- No route where two notes show as active simultaneously
