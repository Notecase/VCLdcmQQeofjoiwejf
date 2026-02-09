# 2026-02-08: Fix 3 AI Page Bugs (Streaming Jump, Z-Index, +/- Buttons)

## Context

The AI starting page has 3 user-reported bugs:

1. **Streaming response jump** — Secretary chat response jumps/flashes when finalized (DOM swap between streaming card and finalized card)
2. **Muya front button over header** — Paragraph hover icon (z-index 1000 on document.body) appears above NotePreviewPanel header (z-index 100)
3. **Per-block +/- buttons broken for new notes** — In NoteDraftResponseCard, individual accept/decline buttons do nothing; only Accept All/Save work

---

## Bug 1: Streaming Response Jump

### Root Cause

In `secretary.ts:484-494`, finalization pushes a NEW message to `chatMessages` (with a new UUID key), then clears `streamingContent` (making the streaming card vanish). Vue unmounts the streaming card (`key='streaming'`) and mounts a new finalized card (`key=<uuid>`) — different DOM elements, causing a visual jump.

### Fix: In-Place Message Update

Add the assistant message to `chatMessages` at the **start** of streaming and update it in place. No DOM swap.

### Files to Change

**`apps/web/src/stores/secretary.ts`**

1. Add `_streaming?: boolean` to `SecretaryChatMessage` interface (~line 55)
2. In `sendChatMessage()` (~line 407):
   - After pushing user message (line 414), also push an empty assistant message:
     ```typescript
     const assistantMsgId = crypto.randomUUID()
     chatMessages.value.push({
       id: assistantMsgId,
       role: 'assistant',
       content: '',
       createdAt: new Date(),
       _streaming: true,
     })
     ```
   - Store a reference: `const liveMsg = chatMessages.value[chatMessages.value.length - 1]`
3. In `handleStreamEvent()` for `'text'` events (~line 558): after updating `streamingContent`, also sync to the live message:
   ```typescript
   liveMsg.content = streamingContent.value
   ```
   Do the same for tool calls and thinking steps.
4. At finalization (~line 484-494): **Remove** the `chatMessages.value.push(...)` block. Instead, finalize the live message in place:
   ```typescript
   if (liveMsg) {
     liveMsg.content = streamingContent.value
     liveMsg.toolCalls =
       streamingToolCalls.value.length > 0 ? [...streamingToolCalls.value] : undefined
     liveMsg.thinkingSteps =
       streamingThinkingSteps.value.length > 0 ? [...streamingThinkingSteps.value] : undefined
     delete liveMsg._streaming
   }
   ```
5. Retry handling (~line 428-437): also reset `liveMsg.content = ''` etc.
6. Error handling: if no content generated, remove `liveMsg` from chatMessages.

**Note:** Need to scope `liveMsg` properly — currently `handleStreamEvent` is a separate function. Either:

- Make `liveMsg` a module-level ref that's set in `sendChatMessage` and read in `handleStreamEvent`
- Or inline the streaming content sync inside `handleStreamEvent` by finding the last assistant message in chatMessages

**`apps/web/src/components/secretary/ChatDrawer.vue`**

1. Remove the `streamingMessage` computed (~line 43-53)
2. Simplify `hasMessages`: `const hasMessages = computed(() => store.chatMessages.length > 0)`
3. In the template (~line 184-196): Remove the separate streaming `<SecretaryMessageCard>` block. Change the v-for to:
   ```html
   <SecretaryMessageCard
     v-for="msg in store.chatMessages"
     :key="msg.id"
     :message="msg"
     :is-streaming="store.isChatStreaming && msg.id === store.chatMessages[store.chatMessages.length - 1]?.id && msg.role === 'assistant'"
   />
   ```
4. Keep the `streamingContent` auto-scroll watcher — it still works since `streamingContent` ref is maintained.

**`apps/web/src/components/secretary/SecretaryChat.vue`**
Same changes as ChatDrawer:

1. Remove `streamingMessage` computed (~line 18-28)
2. Update empty-state check (~line 76): `store.chatMessages.length === 0`
3. Remove separate streaming card block (~line 90-94), merge into v-for with `:is-streaming` logic

---

## Bug 2: Muya Front Button Over Header

### Root Cause

- `ParagraphFrontButton` appends `_floatBox` to `document.body` with `z-index: 1000` (`packages/muya/src/ui/paragraphFrontButton/index.css:61`)
- `NotePreviewPanel.vue` header has `z-index: 100` (line 426) — lower than the button
- Both participate in the same stacking context (body-level)
- `NoteDraftResponseCard` works because its header is `z-index: 11010`

### Fix: Single CSS Change

**`apps/web/src/components/ai/NotePreviewPanel.vue`**

- Line 426: Change `z-index: 100` to `z-index: 1001`

---

## Bug 3: Individual +/- Buttons Don't Work for New Notes

### Root Cause

When individual accept/reject resolves ALL blocks, `syncEditorContent()` emits `update` with the new content. The parent (`HomePage.vue` → `deepAgent.updateNoteDraftContent()`) updates both `proposedContent` AND `currentContent` on the draft (deepAgent.ts:552-553).

This triggers the content watcher in NoteDraftResponseCard (line 201-248), which:

1. Sees `contentChangedExternally = true` (subtle markdown whitespace differences from injected blocks vs clean content)
2. Calls `clearAllDiffs()` → destroys the resolved state
3. Calls `setMarkdown(nextContent)` → reloads content
4. Schedules `applyPendingDiff()` → re-creates diff blocks from `originalContent=''` vs new `proposedContent`

Result: after clicking the last +/- button, diff blocks immediately reappear. Looks like "nothing happened."

**Why Accept All works:** `acceptAllDiffs()` calls `muya.setMarkdown(finalContent)` which makes `getMarkdown() === proposedContent` exactly, so the content watcher sees no external change.

### Fix: Guard Against Self-Initiated Updates

**`apps/web/src/composables/useDiffBlocks.ts`**

1. Add `isDiffInjecting` ref:
   ```typescript
   const isDiffInjecting = ref(false)
   ```
2. Wrap `applyDiffToEditor()` body (line 120) in try/finally:
   ```typescript
   function applyDiffToEditor(edit: PendingEdit): boolean {
     isDiffInjecting.value = true
     try {
       /* existing logic */
     } finally {
       isDiffInjecting.value = false
     }
   }
   ```
3. Return `isDiffInjecting` from the composable (add to return object at line 963)

**`apps/web/src/components/deepagent/NoteDraftResponseCard.vue`**

1. Destructure `isDiffInjecting` from `useDiffBlocks()` (line 71)
2. Add `isSyncingContent` ref:
   ```typescript
   const isSyncingContent = ref(false)
   ```
3. Modify the `onSync` callback (line 75-84) to set the guard:
   ```typescript
   onSync: (markdown: string) => {
     if (markdown === props.noteDraft.currentContent && localTitle.value === props.noteDraft.title) return
     isSyncingContent.value = true
     localContent.value = markdown
     emit('update', { title: localTitle.value, content: markdown })
     // Clear after the watcher cycle completes (double nextTick ensures Vue reactivity settles)
     nextTick(() => nextTick(() => { isSyncingContent.value = false }))
   },
   ```
4. In the content watcher (line 208), add early return:
   ```typescript
   ;(draft) => {
     if (isSyncingContent.value) return
     // ... rest of existing logic
   }
   ```
5. In the `json-change` handler (line 181), add `isDiffInjecting` guard:
   ```typescript
   if (isApplyingExternalUpdate.value || isHydratingFromProps.value || isDiffInjecting.value) return
   ```

**`apps/web/src/components/ai/NotePreviewPanel.vue`** (defensive)

1. Destructure `isDiffInjecting` from `useDiffBlocks()` (line 100)
2. In `json-change` handler in `initializeMuya()` (line 180), add guard:
   ```typescript
   if (isDiffInjecting.value) return // first line of handler
   ```

---

## Implementation Order

1. **Bug 2** — single CSS line change (instant, no risk)
2. **Bug 3** — `useDiffBlocks.ts` change first (add `isDiffInjecting`), then `NoteDraftResponseCard.vue`, then `NotePreviewPanel.vue`
3. **Bug 1** — `secretary.ts` first, then `ChatDrawer.vue` and `SecretaryChat.vue`

## Verification

1. **Bug 1**: Open Secretary chat → send a message → verify response streams in smoothly with no flash/jump when it finishes. Verify thread switching still works.
2. **Bug 2**: Open NotePreviewPanel → hover over blocks near the header → front button icon should disappear behind the header.
3. **Bug 3**: Ask the deep agent to "create a note about X" → verify individual +/- buttons on green diff blocks work (clicking + clears green styling, clicking - removes the block). Verify Accept All and Save still work.

Build validation:

```bash
pnpm build && pnpm typecheck && pnpm lint
```
