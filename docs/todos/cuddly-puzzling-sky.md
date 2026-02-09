# Fix AI Tutor — Rendering, Context Intelligence, System Flow

## Context

The AI Tutor sidebar has been restyled to match the AISidebar design (completed). Now there are deeper issues:

1. **Broken rendering**: AI responses contain full markdown (headings, lists, blockquotes, tables, horizontal rules) and LaTeX with `\(...\)` / `\[...\]` delimiters. The current `renderMathContent()` only handles `$...$`/`$$...$$` math and basic bold/italic/code — everything else renders as raw text.
2. **No surrounding context for highlights**: When users highlight text, only the exact selection is sent. The AI has no idea WHERE in the lesson it appears or what paragraphs surround it.
3. **Conversation history loses highlight context**: Previous highlight references are stripped when building conversation history, so multi-turn follow-ups lose context.

---

## Fix 1: Hybrid Math+Markdown Renderer

### Problem

`renderMathContent()` in `mathRenderer.ts` only supports:

- Math: `$...$` and `$$...$$`
- Markdown: bold, italic, inline code, code blocks, line breaks

Missing: `\(...\)`, `\[...\]` math delimiters, headings, lists, blockquotes, tables, horizontal rules, links.

### Solution

Add a new `renderMathMarkdown()` function that combines `marked` (full markdown) + KaTeX (all math delimiters). All dependencies already installed: `marked@^17.0.1`, `dompurify@^3.3.1`, `katex@^0.16.27`.

### Algorithm

1. Protect code blocks with placeholders (prevent math parsing inside code)
2. Protect all 4 math delimiter types with placeholders, render each via KaTeX:
   - `\[...\]` → display math
   - `\(...\)` → inline math
   - `$$...$$` → display math
   - `$...$` → inline math
3. Run `marked.parse()` for full markdown rendering
4. Sanitize with `DOMPurify.sanitize()` (allow KaTeX attributes)
5. Restore math placeholders with rendered KaTeX HTML

### File

| File                                 | Change                            |
| ------------------------------------ | --------------------------------- |
| `apps/web/src/utils/mathRenderer.ts` | Add `renderMathMarkdown()` export |

### Reference

`MarkdownContent.vue` (`apps/web/src/components/deepagent/MarkdownContent.vue`) already uses `marked` + `DOMPurify` — follow its pattern but add math support.

---

## Fix 2: Use New Renderer in ExplainChatMessage

### File

| File                                                           | Change                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| `apps/web/src/components/course/viewer/ExplainChatMessage.vue` | Import `renderMathMarkdown` instead of `renderMathContent` |

One-line change in the computed property. The `.prose :deep()` styles already support full markdown elements (headings, lists, blockquotes, etc.) from the restyle done earlier.

---

## Fix 3: Extract Surrounding Context from Text Selection

### Problem

`useTextSelection.ts` captures only `selection.toString().trim()` — no positional info.

### Solution

Enhance the composable to also extract:

- **Surrounding context**: the full text of the parent block element(s) containing the selection
- **Section heading**: the nearest `<h1>`–`<h6>` above the selection

### Algorithm

After getting selected text:

1. Get `range.commonAncestorContainer`
2. Walk up to find nearest block element (`p`, `div`, `li`, `blockquote`, `section`)
3. Get its `textContent` as `surroundingContext` (cap at 500 chars)
4. Continue walking up/backward to find nearest heading element
5. Get its `textContent` as `sectionHeading`

### Return type change

```typescript
// Before: { selectedText: Ref<string | null>, clearSelection }
// After:  { selection: Ref<TextSelection | null>, clearSelection }
interface TextSelection {
  text: string
  surroundingContext?: string
  sectionHeading?: string
}
```

### File

| File                                           | Change                                     |
| ---------------------------------------------- | ------------------------------------------ |
| `apps/web/src/composables/useTextSelection.ts` | Return `TextSelection` object with context |

---

## Fix 4: Wire Context Through Store → API → Agent

### 4a. Update shared types

| File                                   | Change                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/shared/src/types/explain.ts` | Add `highlightSurroundingContext?: string` and `highlightSection?: string` to `ExplainInput` |

### 4b. Update store

| File                                   | Change                                                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/stores/courseExplain.ts` | 1) Add `highlightSurroundingContext` + `highlightSection` to state. 2) Update `setHighlightedText()` to accept context params. 3) Include new fields in `sendMessage()` API body. |

### 4c. Update CourseView watcher

| File                                | Change                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/web/src/views/CourseView.vue` | Update the `watch(selectedText, ...)` to pass surrounding context and section heading to store |

### 4d. Update API schema

| File                             | Change                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/routes/explain.ts` | Add `highlightSurroundingContext: z.string().optional()` and `highlightSection: z.string().optional()` to Zod schema |

### 4e. Update system prompt

| File                                      | Change                                                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/ai/src/agents/explain/index.ts` | In `buildSystemPrompt()`, add surrounding context and section heading to the `## Highlighted Text` section |

New prompt structure:

```
## Highlighted Text
The student has highlighted the following passage:
> {highlightedText}

This passage appears in the following context:
> {surroundingContext}

Under section: "{sectionHeading}"
```

---

## Fix 5: Preserve Highlight Context in Conversation History

### Problem

In `courseExplain.ts` line 70-71:

```typescript
.map(m => ({ role: m.role, content: m.content }))  // highlightContext LOST
```

### Fix

For user messages with highlight context, prepend it to content when building history:

```typescript
.map(m => ({
  role: m.role,
  content: m.highlightContext
    ? `[Regarding: "${m.highlightContext}"]\n${m.content}`
    : m.content,
}))
```

### File

| File                                   | Change                                                        |
| -------------------------------------- | ------------------------------------------------------------- |
| `apps/web/src/stores/courseExplain.ts` | Fix conversation history mapping to include highlight context |

---

## File Summary

| #   | File                                                           | Change                                             |
| --- | -------------------------------------------------------------- | -------------------------------------------------- |
| 1   | `apps/web/src/utils/mathRenderer.ts`                           | Add `renderMathMarkdown()` — marked + KaTeX hybrid |
| 2   | `apps/web/src/components/course/viewer/ExplainChatMessage.vue` | Use `renderMathMarkdown()`                         |
| 3   | `apps/web/src/composables/useTextSelection.ts`                 | Extract surrounding context + section heading      |
| 4   | `packages/shared/src/types/explain.ts`                         | Add context fields to `ExplainInput`               |
| 5   | `apps/web/src/stores/courseExplain.ts`                         | Wire context fields + fix history                  |
| 6   | `apps/web/src/views/CourseView.vue`                            | Update selection watcher                           |
| 7   | `apps/api/src/routes/explain.ts`                               | Update Zod schema                                  |
| 8   | `packages/ai/src/agents/explain/index.ts`                      | Enrich system prompt with context                  |

---

## Verification

1. **Build**: `pnpm build && pnpm typecheck`
2. **Math rendering**: Send a message that uses `\(x^2\)` and `\[E=mc^2\]` — should render as KaTeX
3. **Markdown rendering**: AI response with `##` headings, `---` rules, `- lists`, `> blockquotes` — all should render properly
4. **Context test**: Highlight text in a lesson → ask "explain this" → AI should reference surrounding context and section
5. **Multi-turn test**: Ask about highlighted text → follow up without highlight → AI should still reference the original context
6. **Lint**: `pnpm lint`
