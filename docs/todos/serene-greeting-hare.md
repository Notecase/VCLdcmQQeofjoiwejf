# Investigation: AI Note Creation UI Not Updating

## Context

**User Report**: When asking AI to "create a note about VAE architectures", the editor remains empty (no green diff blocks appear). After page refresh, the note exists in the database but diff blocks are still missing.

**Expected Behavior**: Green diff blocks should appear immediately, showing the proposed content with accept/reject buttons.

**Actual Behavior**: Editor stays empty until refresh, then shows final content without diff blocks.

---

## Phase 1: Root Cause Investigation - COMPLETE

### System Architecture (Event Flow)

```
User Request
    ↓
Backend: InkdownDeepAgent.stream()
    ↓
Backend: NoteAgent.stream({ action: 'create' })
    ↓
Backend: Database INSERT (note created)
    ↓
Backend: EVENT 1 - note-navigate { noteId: "uuid" }
    ↓
Backend: EVENT 2 - edit-proposal { original: "", proposed: "# Content..." }
    ↓
Frontend: SSE receives events
    ↓
Frontend: Process note-navigate → loadDocument(noteId)
    ↓
Frontend: Process edit-proposal → computeDiffHunks() → addPendingEdit()
    ↓
Frontend: useDiffBlocks watcher triggers
    ↓
Frontend: applyDiffToEditor() with content guards
    ↓
Frontend: Inject green diff blocks into Muya DOM
```

### Critical Findings

#### 🔴 **BUG #1: Duplicate Event Handlers (HIGH PRIORITY)**

**Evidence:**
- **Handler 1**: `apps/web/src/services/ai.service.ts` (lines 839-849)
- **Handler 2**: `apps/web/src/stores/deepAgent.ts` (lines 970-996)

**Impact**: When `note-navigate` event fires, **BOTH handlers execute simultaneously**:
```typescript
// BOTH call this concurrently:
await editorStore.loadDocument(noteId)  // Race condition!
```

**Result**: Two concurrent database queries and two `setMarkdown()` calls may conflict, causing timing issues.

---

#### 🔴 **BUG #2: Race Condition (HIGH PRIORITY)**

**Timeline:**
```
T=0ms:    Backend emits note-navigate
T=5ms:    Backend emits edit-proposal
T=10ms:   Frontend receives note-navigate → starts loadDocument() (async DB query)
T=15ms:   Frontend receives edit-proposal → addPendingEdit() → watcher fires
T=20ms:   applyDiffToEditor() checks content guard
T=25ms:   muya.getMarkdown() returns "" (content not loaded yet!)
T=30ms:   Content guard DEFERS injection (returns false)
T=150ms:  loadDocument() completes, setMarkdown() renders content
T=310ms:  300ms retry watcher fires → checkAndApplyPendingEdits()
T=315ms:  Content may still be rendering... guard may defer again
```

**Root Cause**: Edit proposal arrives **before** the editor finishes loading the newly created note.

**Evidence from code:**
- `useDiffBlocks.ts` lines 187-195: Content guard checks `muya.getMarkdown().trim()`
- If empty → defers injection with `return false`
- `useDiffBlocks.ts` lines 970-987: 300ms retry watcher after note switch
- **300ms may be insufficient** for slow DB queries or DOM rendering

---

#### 🟡 **BUG #3: Content Guard Logic Issues (MEDIUM PRIORITY)**

**Line 199-206**: Already-applied guard
```typescript
// If editor already has proposed content, skip injection
if (editorMarkdown === edit.proposedContent.trim()) {
  appliedEditIds.value.add(edit.id)
  return false  // Marks edit as "applied" but doesn't inject blocks!
}
```

**Problem**: For new notes, backend saves content to database. When `loadDocument()` completes, editor already contains the proposed content. This guard **skips diff injection entirely**, leaving no green blocks to review.

**This explains why user sees content after refresh but no diff blocks!**

---

#### 🟡 **BUG #4: Fixed Time Delay (MEDIUM PRIORITY)**

**Line 980**: `setTimeout(() => { ... }, 300)`

**Issues**:
1. **Too short** for slow connections (DB query + DOM render may exceed 300ms)
2. **Too long** for fast connections (user waits unnecessarily)
3. **No retry logic** - if guard fails at 300ms, edit is lost until manual note switch
4. **No user feedback** - user doesn't know injection is deferred

---

### Evidence Summary

| Component | File | Lines | Finding |
|-----------|------|-------|---------|
| Backend Events | `packages/ai/src/agents/deep-agent.ts` | 319 | Emits `note-navigate` before `edit-proposal` |
| Duplicate Handler 1 | `apps/web/src/services/ai.service.ts` | 839-849 | Processes `note-navigate` |
| Duplicate Handler 2 | `apps/web/src/stores/deepAgent.ts` | 970-996 | Duplicate logic (race condition) |
| Race Timing | `apps/web/src/composables/useDiffBlocks.ts` | 187-195 | Content guard defers if editor empty |
| Retry Logic | `apps/web/src/composables/useDiffBlocks.ts` | 970-987 | Fixed 300ms delay |
| Already-Applied Guard | `apps/web/src/composables/useDiffBlocks.ts` | 199-206 | Skips injection if content matches |

---

## Phase 2: Root Cause Analysis

### Why Diff Blocks Don't Appear (Failure Modes)

**Scenario A: Race Condition (Most Likely)**
1. `edit-proposal` arrives before `loadDocument()` completes
2. Content guard finds empty editor → defers
3. 300ms retry fires but editor still not ready
4. Edit is lost (no further retries)

**Scenario B: Content Already Loaded**
1. `loadDocument()` completes before `edit-proposal` arrives
2. Editor already contains proposed content from database
3. Already-applied guard skips diff injection (line 199-206)
4. User sees content but no diff blocks

**Scenario C: Duplicate Handler Conflict**
1. Both handlers call `loadDocument()` simultaneously
2. Second call may reset editor state during first call's `setMarkdown()`
3. Timing corruption causes content guard to fail intermittently

**Scenario D: 300ms Insufficient**
1. Slow DB query (>200ms) + slow DOM render (>100ms)
2. 300ms retry fires before content is ready
3. No subsequent retry attempts

---

## Phase 3: Proposed Solutions

### Solution 1: Remove Duplicate Handler (Quick Fix)

**Action**: Delete one of the duplicate `note-navigate` handlers

**Recommendation**: Remove handler from `deepAgent.ts` (lines 970-996), keep `ai.service.ts` as single source of truth.

**Files to modify:**
- `apps/web/src/stores/deepAgent.ts` (remove lines 970-996)

**Impact**: Eliminates race condition from concurrent `loadDocument()` calls.

**Risk**: Low - handlers are identical, removing duplicate is safe.

---

### Solution 2: Event-Driven Coordination (Robust Fix)

**Problem**: System relies on fixed time delays instead of readiness signals.

**Action**: Add event-driven coordination between loadDocument() and diff injection:

```typescript
// In editor.ts loadDocument()
async loadDocument(id: string) {
  const note = await api.getNote(id)
  this.openDocument(note)
  await nextTick()

  // NEW: Emit event after content is rendered
  window.dispatchEvent(new CustomEvent('note-content-ready', {
    detail: { noteId: id }
  }))
}

// In useDiffBlocks.ts - replace 300ms timer with event listener
window.addEventListener('note-content-ready', (e) => {
  if (e.detail.noteId === noteIdRef.value) {
    checkAndApplyPendingEdits()
  }
})
```

**Files to modify:**
- `apps/web/src/stores/editor.ts` (emit event after content loaded)
- `apps/web/src/composables/useDiffBlocks.ts` (listen for event instead of timer)

**Benefits**:
- ✅ No fixed time delays
- ✅ Works on slow and fast connections
- ✅ Immediate response when ready

**Risk**: Medium - requires testing event timing.

---

### Solution 3: Fix Already-Applied Guard (Essential)

**Problem**: Guard skips diff injection when content matches (line 199-206).

**Action**: Modify guard to only skip for non-empty **original** content:

```typescript
// BEFORE (line 199-206):
if (edit.proposedContent.trim() && appliedEditIds.value.size === 0) {
  if (editorMarkdown === edit.proposedContent.trim()) {
    appliedEditIds.value.add(edit.id)
    return false  // BUG: Skips injection!
  }
}

// AFTER (proposed fix):
if (edit.proposedContent.trim() &&
    edit.originalContent.trim() !== '' &&  // NEW: Only skip for non-empty edits
    appliedEditIds.value.size === 0) {
  if (editorMarkdown === edit.proposedContent.trim()) {
    appliedEditIds.value.add(edit.id)
    return false
  }
}
```

**Files to modify:**
- `apps/web/src/composables/useDiffBlocks.ts` (line 199)

**Rationale**: For new notes (empty original), we **always** want to show diff blocks for review, even if database already has the content.

**Risk**: Low - logic change is minimal.

---

### Solution 4: Exponential Backoff Retry (Enhancement)

**Problem**: Single 300ms retry may be insufficient.

**Action**: Implement retry with exponential backoff:

```typescript
// Replace fixed 300ms timer with retry logic
const retryIntervals = [100, 300, 600, 1200]  // ms
let retryIndex = 0

watch(noteIdRef, (newNoteId) => {
  if (newNoteId) {
    retryIndex = 0
    const attemptRetry = () => {
      nextTick(() => {
        setTimeout(() => {
          if (noteIdRef.value === newNoteId) {
            const success = checkAndApplyPendingEdits()
            if (!success && retryIndex < retryIntervals.length - 1) {
              retryIndex++
              attemptRetry()  // Retry with next interval
            }
          }
        }, retryIntervals[retryIndex])
      })
    }
    attemptRetry()
  }
})
```

**Files to modify:**
- `apps/web/src/composables/useDiffBlocks.ts` (lines 970-987)

**Benefits**:
- ✅ Fast response for quick loads (100ms)
- ✅ Resilient to slow loads (up to 2200ms total)
- ✅ User sees diff blocks eventually

**Risk**: Low - fallback behavior if event-driven approach fails.

---

### Solution 5: User Feedback (UX Enhancement)

**Problem**: User doesn't know edit is deferred.

**Action**: Show toast notification when content guard defers:

```typescript
// In applyDiffToEditor() after deferral
if (!editorMarkdown) {
  console.warn('[useDiffBlocks] Content mismatch - deferring')

  // NEW: User feedback
  toast.info('AI edit will appear once note finishes loading...', {
    duration: 2000
  })

  return false
}
```

**Files to modify:**
- `apps/web/src/composables/useDiffBlocks.ts` (line 193)

**Benefits**: User knows system is working, reduces confusion.

**Risk**: Very low - non-blocking UI notification.

---

## Recommended Implementation Plan

### Phase A: Quick Fixes (Same Day)

1. ✅ **Remove duplicate handler** (Solution 1)
   - Delete `deepAgent.ts` lines 970-996
   - Verify single handler remains in `ai.service.ts`

2. ✅ **Fix already-applied guard** (Solution 3)
   - Modify condition to check `originalContent !== ''`
   - Add comment explaining new note behavior

3. ✅ **Add user feedback** (Solution 5)
   - Toast notification when deferring
   - Helps diagnose timing issues

### Phase B: Robust Improvements (Next Sprint)

4. ⚠️ **Event-driven coordination** (Solution 2)
   - Emit `note-content-ready` after `setMarkdown()` completes
   - Replace timer with event listener
   - Requires testing with various note sizes

5. ⚠️ **Exponential backoff** (Solution 4)
   - Implement retry logic as fallback
   - Graceful degradation if event-driven fails

---

## Verification Steps

### Before Fix:
1. Open Inkdown dev environment
2. Ask AI: "create a note about machine learning"
3. Observe: Editor stays empty, no green diff blocks
4. Refresh page: Note exists but no diff blocks

### After Fix (Phase A):
1. Apply fixes 1, 3, 5
2. Ask AI: "create a note about deep learning"
3. Expected: Toast appears ("edit will appear..."), then green diff blocks inject within 1-2 seconds
4. Verify: Diff blocks show correct content with accept/reject buttons

### After Fix (Phase B):
1. Apply fix 2 (event-driven)
2. Test with slow connection (Chrome DevTools throttling)
3. Expected: Diff blocks appear immediately after content loads, regardless of connection speed
4. Verify: No fixed delays, instant response

---

## Critical Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `apps/web/src/services/ai.service.ts` | 839-849 | note-navigate handler (keep) |
| `apps/web/src/stores/deepAgent.ts` | 970-996 | note-navigate handler (DELETE) |
| `apps/web/src/composables/useDiffBlocks.ts` | 187-195 | Content guard (add logging) |
| `apps/web/src/composables/useDiffBlocks.ts` | 199-206 | Already-applied guard (FIX) |
| `apps/web/src/composables/useDiffBlocks.ts` | 970-987 | 300ms retry (REPLACE with event) |
| `apps/web/src/stores/editor.ts` | 212-232 | loadDocument (ADD event emit) |

---

## User Requirements (Confirmed)

✅ **Priority**: Robust architectural fix (Phase A + Phase B)
✅ **Scope**: Both note creation AND note updates
✅ **Approach**: Event-driven coordination to eliminate timing issues

## Final Implementation Plan

### Phase A: Quick Fixes (1-2 hours)

**Task A1: Remove Duplicate Handler**
- **File**: `apps/web/src/stores/deepAgent.ts`
- **Action**: Delete lines 970-996 (duplicate note-navigate handler)
- **Verification**: Grep codebase for `note-navigate` to confirm single handler remains

**Task A2: Fix Already-Applied Guard**
- **File**: `apps/web/src/composables/useDiffBlocks.ts`
- **Action**: Modify line 199 to check `originalContent !== ''`
- **Code change**:
  ```typescript
  // Add condition to only skip for non-empty edits (not new notes)
  if (edit.proposedContent.trim() &&
      edit.originalContent.trim() !== '' &&  // NEW
      appliedEditIds.value.size === 0) {
  ```
- **Verification**: Create new note, verify diff blocks appear even when DB has content

**Task A3: Add Diagnostic Logging**
- **File**: `apps/web/src/composables/useDiffBlocks.ts`
- **Action**: Add detailed logs at key decision points:
  - Line 193: When content guard defers
  - Line 206: When already-applied guard triggers
  - Line 985: When 300ms retry fires
- **Purpose**: Debug timing issues during development

**Task A4: Add User Feedback Toast**
- **File**: `apps/web/src/composables/useDiffBlocks.ts`
- **Action**: Show toast notification when deferring injection (line 193)
- **Message**: "AI edit will appear once note finishes loading..."
- **Verification**: User sees feedback during slow loads

### Phase B: Event-Driven Coordination (3-4 hours)

**Task B1: Add Note-Ready Event Emission**
- **File**: `apps/web/src/stores/editor.ts`
- **Location**: After `openDocument()` in `loadDocument()` method (line 232)
- **Action**: Emit custom event after content is rendered
- **Code change**:
  ```typescript
  async loadDocument(id: string) {
    const note = await getDocumentById(id)
    this.openDocument(note)

    // Wait for Muya to finish rendering
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 50))  // Muya DOM settle

    // Emit readiness event
    window.dispatchEvent(new CustomEvent('note-content-ready', {
      detail: {
        noteId: id,
        timestamp: Date.now()
      }
    }))
  }
  ```

**Task B2: Replace Timer with Event Listener**
- **File**: `apps/web/src/composables/useDiffBlocks.ts`
- **Location**: Replace lines 970-987 (noteIdRef watcher)
- **Action**: Listen for `note-content-ready` event instead of fixed timeout
- **Code change**:
  ```typescript
  // Keep watcher for note switches
  watch(noteIdRef, (newNoteId, oldNoteId) => {
    if (oldNoteId && newNoteId !== oldNoteId) {
      clearAllDiffs(oldNoteId)
    }
    // Removed setTimeout - now handled by event listener
  })

  // NEW: Event-driven retry
  onMounted(() => {
    window.addEventListener('note-content-ready', (e: CustomEvent) => {
      if (e.detail.noteId === noteIdRef.value) {
        console.log('[useDiffBlocks] Note ready event received, applying edits')
        nextTick(() => {
          checkAndApplyPendingEdits()
        })
      }
    })
  })
  ```

**Task B3: Add Fallback Timer (Safety Net)**
- **File**: `apps/web/src/composables/useDiffBlocks.ts`
- **Action**: Keep 300ms fallback if event doesn't fire
- **Code change**:
  ```typescript
  watch(noteIdRef, (newNoteId, oldNoteId) => {
    if (oldNoteId && newNoteId !== oldNoteId) {
      clearAllDiffs(oldNoteId)
    }

    // Fallback: if event doesn't fire within 500ms, try anyway
    if (newNoteId) {
      setTimeout(() => {
        if (noteIdRef.value === newNoteId) {
          console.log('[useDiffBlocks] Fallback retry (event did not fire)')
          checkAndApplyPendingEdits()
        }
      }, 500)
    }
  })
  ```

**Task B4: Handle Note Updates (Same Fix)**
- **Verification**: Note updates use same code path (`useDiffBlocks.ts`)
- **Test case**: Ask AI to "update this note with X" and verify diff blocks appear
- **Expected**: Event-driven approach works for both creation and updates

### Phase C: Testing & Verification (1-2 hours)

**Test Suite:**

1. **New Note Creation (Empty Editor)**
   - Action: Ask AI "create a note about quantum computing"
   - Expected: Green diff blocks appear within 100-200ms
   - Verify: Accept/reject buttons work, content matches proposal

2. **New Note Creation (Slow Connection)**
   - Setup: Chrome DevTools → Network → Slow 3G
   - Action: Create note via AI
   - Expected: Toast appears, diff blocks appear when ready (no timeout)
   - Verify: Event-driven retry works regardless of connection speed

3. **Note Update (Existing Content)**
   - Action: Open existing note, ask AI "add a section about X"
   - Expected: Diff blocks show changes (additions in green, deletions in coral)
   - Verify: Content guard correctly identifies matching sections

4. **Note Update (Empty to Content)**
   - Action: Open empty note, ask AI "write about Y"
   - Expected: Same as creation - green diff blocks for all content
   - Verify: Empty note special case works correctly

5. **Rapid Note Switches**
   - Action: Create note A, immediately switch to note B, create note B content
   - Expected: Diff blocks appear in correct note, no cross-contamination
   - Verify: Note ID filtering works correctly

6. **Multiple Edits (Compound Requests)**
   - Action: Ask AI "create note + add table + add code artifact"
   - Expected: Note appears, diff blocks for content, artifacts insert separately
   - Verify: All components render correctly

7. **Database Already Has Content**
   - Setup: Create note via API, then ask AI to "update" it
   - Expected: Diff blocks appear even though content exists in DB
   - Verify: Already-applied guard fix works (only skips for non-empty edits)

---

## Implementation Order

```
Day 1 (Morning):
  - Task A1: Remove duplicate handler (15 min)
  - Task A2: Fix already-applied guard (30 min)
  - Task A3: Add diagnostic logging (30 min)
  - Task A4: Add user feedback toast (15 min)
  → Test basic functionality

Day 1 (Afternoon):
  - Task B1: Add note-ready event emission (1 hour)
  - Task B2: Replace timer with event listener (1 hour)
  - Task B3: Add fallback timer (30 min)
  - Task B4: Verify note updates (30 min)
  → Test event-driven flow

Day 2 (Morning):
  - Phase C: Run full test suite (2 hours)
  - Fix any edge cases discovered
  - Update documentation

Day 2 (Afternoon):
  - Code review
  - Deploy to staging
  - User acceptance testing
```

---

## Success Criteria

✅ **No more empty editor** - Diff blocks appear reliably after AI creates note
✅ **No refresh required** - Content and diff blocks appear in single flow
✅ **Works on slow connections** - Event-driven approach adapts to timing
✅ **Works for updates** - Same fix applies to note modifications
✅ **No race conditions** - Single event handler, proper coordination
✅ **User feedback** - Toast notifications during processing

---

## Risk Assessment

| Risk | Mitigation | Severity |
|------|-----------|----------|
| Event doesn't fire | Fallback 500ms timer (Task B3) | Low |
| Muya rendering delay | 50ms settle time after nextTick() (Task B1) | Low |
| Event fires too early | Content guard still checks before injection | Low |
| Breaking note updates | Task B4 verifies updates use same code path | Medium |
| Browser compatibility | CustomEvent is widely supported (IE11+) | Very Low |

---

## Post-Implementation

**Documentation Updates:**
- Update `memory/ai-system-bugs.md` with resolution
- Add event flow diagram to `docs/ARCHITECTURE.md`
- Document event-driven pattern for future features

**Monitoring:**
- Add telemetry for diff injection timing
- Track content guard deferral rates
- Monitor event-driven success rate vs fallback usage
