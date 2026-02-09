# Fix Demo Editor — Pure In-Memory Hardcoded Notes

## Context

The IndexedDB-based demo seeding is broken — the local database adapter doesn't properly handle field defaults like `is_deleted`, causing queries to return empty results. The user wants the simplest possible approach: hardcoded demo documents loaded directly into memory. No database, no IndexedDB. Editable during the session, resets to fresh content on page refresh.

## Problem

`editor.ts` currently tries to seed IndexedDB with demo fixtures via `getDatabaseService().from('notes').insert(...)`, but the local adapter's query filtering fails silently. Result: empty sidebar, "Untitled" fallback note.

---

## Plan: Revert to Pure In-Memory Demo

**File:** `apps/web/src/stores/editor.ts`

### 1. `loadDocuments()` — restore demo early return

Replace the current IndexedDB seeding logic with a simple early return that deep-clones the fixtures:

```typescript
async loadDocuments() {
  if (isDemoMode()) {
    this.documents = DEMO_DOCUMENTS.map(d => ({ ...d }))
    this.isLoadingDocuments = false
    return
  }
  // ... rest of normal flow unchanged
```

### 2. `loadDocument()` — restore demo early return

```typescript
async loadDocument(id: string) {
  if (isDemoMode()) {
    const doc = DEMO_DOCUMENTS.find(d => d.id === id)
    if (doc) this.openDocument({ ...doc })
    return
  }
  // ... rest unchanged
```

### 3. `saveDocument()` — add demo guard back

```typescript
async saveDocument() {
  if (isDemoMode()) return
  // ... rest unchanged
```

Edits still work in-memory (via `updateContent()` which modifies the active tab's document object directly). They just won't persist to any storage. Refresh = fresh fixtures.

### 4. `createDocument()` — add demo guard back

```typescript
async createDocument(...) {
  if (isDemoMode()) return null
  // ... rest unchanged
```

### 5. `deleteDocument()` — add demo guard back

```typescript
async deleteDocument(id: string) {
  if (isDemoMode()) return
  // ... rest unchanged
```

### 6. Revert `createDocument` userId logic

Restore the original auth check (remove `demo-user` fallback since we're not using the database in demo mode):

```typescript
const authStore = useAuthStore()
if (!authStore.user?.id) {
  console.warn('Cannot create document: user not authenticated')
  return null
}
```

---

## Files Changed

| File | What |
|------|------|
| `apps/web/src/stores/editor.ts` | Restore all demo guards, remove IndexedDB seeding |

## Verification

1. `vercel --prod` to deploy
2. Visit `inkdown.vercel.app/demo` → enter password
3. Editor loads with demo RL note + other fixtures in sidebar
4. Edit the note → changes visible in editor
5. Refresh page → back to fresh hardcoded content
