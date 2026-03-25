# Fix Visual Diff Block Positioning Bug

## Context

When the AI proposes edits to a note, the green diff blocks appear at the **wrong visual position** in the Muya editor. For example, a paragraph meant for the "NemoClaw" section visually appears under the "NVIDIA NIM" section heading. However, clicking "Accept All" places the content correctly because it calls `muya.setMarkdown(proposedContent)` which rebuilds the entire DOM from scratch.

**Root cause:** `mapLineToBlockIndex()` in `apps/web/src/utils/markdownBlockMap.ts` uses `parseMarkdownStructure()` from `@inkdown/ai/utils/structureParser` to convert jsdiff line numbers into block indices. But those indices are then passed to Muya's `scrollPage.find(blockIndex)`, which uses Muya's own internal block count. The two parsers disagree on block boundaries because:

1. **structureParser** doesn't recognize math blocks (`$$...$$`), diagram blocks, frontmatter, or artifact blocks as distinct types — it treats them as paragraphs, producing different block counts.
2. **structureParser** has its own list continuation heuristics that may differ from Muya's `marked.js`-based lexer.
3. **Blank lines** are skipped by structureParser but jsdiff counts them as regular lines.

**Fix:** Replace `parseMarkdownStructure()` with Muya's own `MarkdownToState` parser in the `mapLineToBlockIndex` function. This guarantees the block count matches Muya's actual DOM because Muya uses the exact same parser to create its blocks.

---

## Implementation

### Step 1: Rewrite `mapLineToBlockIndex` to use Muya's parser

**File:** `apps/web/src/utils/markdownBlockMap.ts`

Replace the `parseMarkdownStructure` import with Muya's `MarkdownToState` + `ExportMarkdown`. The existing utility `parseMarkdownToStates()` in `apps/web/src/utils/muyaMarkdownParser.ts` already wraps `MarkdownToState` — reuse it.

**Algorithm:**

1. Parse `originalContent` with `MarkdownToState.generate()` → `TState[]` (same parser Muya uses to create DOM blocks)
2. Serialize each top-level state individually with `ExportMarkdown` to count how many lines it occupies
3. Build cumulative line ranges: block 0 = lines 1..L0, block 1 = lines (L0+2)..(L0+L1+1), etc. (+1 for blank separator between blocks)
4. Given `lineNumber`, find which block's range contains it
5. Handle re-serialization drift: if total re-serialized line count differs from original, use proportional scaling

```typescript
import { MarkdownToState } from '@inkdown/muya/state/markdownToState'
import ExportMarkdown from '@inkdown/muya/state/stateToMarkdown'

export function mapLineToBlockIndex(markdown: string, lineNumber: number): number {
  const safeLine = Math.max(1, lineNumber)

  // Parse using Muya's own parser — same one that creates DOM blocks
  const parser = new MarkdownToState({
    math: true,
    isGitlabCompatibilityEnabled: true,
    frontMatter: true,
    footnote: false,
    trimUnnecessaryCodeBlockEmptyLines: false,
  })
  const states = parser.generate(markdown)

  if (states.length <= 1) return 0

  // Build line ranges by serializing each block individually
  const blockRanges: Array<{ start: number; end: number }> = []
  let cursor = 1

  for (let i = 0; i < states.length; i++) {
    const blockMd = new ExportMarkdown().generate([states[i]])
    const lines = blockMd.split('\n')
    const lineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length

    blockRanges.push({ start: cursor, end: cursor + lineCount - 1 })
    cursor += lineCount + 1 // +1 for blank separator line
  }

  // Scale if re-serialized total differs from original
  const origTotal = markdown.split('\n').length
  const reserTotal = blockRanges[blockRanges.length - 1].end
  let target = safeLine
  if (origTotal !== reserTotal && reserTotal > 0) {
    target = Math.max(1, Math.round((safeLine / origTotal) * reserTotal))
  }

  // Find containing block
  for (let i = 0; i < blockRanges.length; i++) {
    if (target <= blockRanges[i].end) return i
  }
  return blockRanges.length - 1
}
```

**Key reuse:** `MarkdownToState` is already imported in `apps/web/src/utils/muyaMarkdownParser.ts` — proves the import path works. `ExportMarkdown` is available via `@inkdown/muya/state/stateToMarkdown` (wildcard export in muya's package.json).

### Step 2: Update tests

**File:** `apps/web/src/utils/markdownBlockMap.spec.ts`

Existing tests should pass unchanged (same expected indices). Add new tests for:

- Math blocks (`$$...\n$$`) — should be 1 block, not 3
- Code blocks with content — should be 1 block
- Frontmatter (`---\ntitle: X\n---`) — should be block 0
- Lists with blank lines between items — should be 1 block
- Blank line targeting — should map to preceding block

### Step 3: Verify no changes needed in `useDiffBlocks.ts`

**File:** `apps/web/src/composables/useDiffBlocks.ts`

The function signature of `mapLineToBlockIndex(markdown, lineNumber)` stays the same. The two call sites (lines 324 and 362) pass the same arguments. No changes needed — the fix is entirely in the mapping function.

### Step 4: Remove dead `parseMarkdownStructure` import

**File:** `apps/web/src/utils/markdownBlockMap.ts`

Delete the old import: `import { parseMarkdownStructure } from '@inkdown/ai/utils/structureParser'`

---

## Why This Fixes the Bug

The current bug: structureParser sees `$$\nE=mc^2\n$$` as 3 blocks (paragraph, paragraph, paragraph), but Muya creates 1 `math-block`. So if there are 5 blocks before the math block in structureParser's view but only 3 in Muya's view, every block after the math block is off by 2.

With the fix: `MarkdownToState` (Muya's own parser) creates the exact same states that `ScrollPage` uses to create DOM blocks. So `states.length === scrollPage.children.length`, and `mapLineToBlockIndex` returns the correct index for `scrollPage.find()`.

---

## Files Summary

| File                                          | Change                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web/src/utils/markdownBlockMap.ts`      | **Rewrite** — replace `parseMarkdownStructure` with `MarkdownToState` + `ExportMarkdown` |
| `apps/web/src/utils/markdownBlockMap.spec.ts` | **Extend** — add math block, code block, frontmatter, list tests                         |

**No changes to:**

- `apps/web/src/composables/useDiffBlocks.ts` (consumer — same API)
- `apps/web/src/services/ai.service.ts` (produces hunks — unchanged)
- `packages/muya/` (read-only dependency)

---

## Verification

```bash
# Unit tests
pnpm test:run apps/web/src/utils/markdownBlockMap.spec.ts

# Full validation
pnpm typecheck && pnpm lint && pnpm test:run
```

### Manual Tests

1. Create a note with: heading → paragraph → heading → paragraph (simple case)
2. Ask AI to add content under the second heading
3. Verify green diff block appears under the correct heading (not the first one)
4. Click "Accept All" → content in correct position (should work same as before)
5. Test with math blocks, code blocks, and lists in the document
6. Test per-hunk accept/reject buttons (not just Accept All)
