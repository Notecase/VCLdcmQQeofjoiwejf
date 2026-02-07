# Muya Editor Guardrails

This document defines conventions, constraints, and guardrails for Claude Code when working with the Muya editor engine. **Read the Golden Rules first** - they cover 90% of what you need to know.

---

## Section 1: Golden Rules (Quick Reference)

These 7 rules MUST be followed when working with Muya. Violating them leads to subtle bugs and wasted time.

### Rule 1: DOM Ownership
Every DOM element inside `.mu-container` has a `__MUYA_BLOCK__` property pointing to its block instance.

```typescript
// Get block from any Muya DOM element
const block = domElement['__MUYA_BLOCK__']
```

**Why it matters**: Muya manages DOM-Block relationships. Direct DOM manipulation without understanding this breaks selection, state sync, and undo/redo.

### Rule 2: Block Children Rule
**Custom UI must be CHILDREN of blocks, NOT siblings or overlays.**

```typescript
// CORRECT: Insert as child, style to appear outside
const btn = document.createElement('button')
domNode.insertBefore(btn, domNode.firstChild)

// WRONG: Overlay positioned absolutely outside Muya DOM
<div class="overlay" style="position: absolute; top: ...">
```

**Why it matters**: Overlay positioning drifts on scroll/resize and creates z-index conflicts with Muya's floating panels.

### Rule 3: No Coordinate Math
**Never calculate absolute positions for editor-aligned elements.**

```typescript
// WRONG: Calculating positions from getBoundingClientRect()
const rect = block.getBoundingClientRect()
overlay.style.top = `${rect.bottom + scrollTop}px`

// CORRECT: Use DOM hierarchy (child elements) or Muya APIs
scrollPage.insertAfter(newBlock, refBlock, 'api')
```

**Why it matters**: Coordinate calculations become stale on content reflow, window resize, and scroll events.

### Rule 4: State Flow
**Changes flow through JSONState OT operations, not direct DOM mutation.**

```typescript
// CORRECT: Use 'user' source to trigger OT operations
scrollPage.append(newBlock, 'user')        // Tracked in undo/redo
scrollPage.insertAfter(block, ref, 'user') // Triggers json-change event

// CORRECT: Use 'api' source for programmatic changes (no undo tracking)
block.remove('api')                        // Silent removal

// WRONG: Direct DOM mutation (bypasses state sync)
domNode.textContent = 'new content'
```

### Rule 5: Selection Rule
**Use Muya's Selection API, not native DOM selection.**

```typescript
// CORRECT
const cursor = contentBlock.getCursor()
contentBlock.setCursor(start, end, needUpdate)
muya.editor.selection.setSelection(cursor)

// WRONG
const sel = window.getSelection()  // Don't use directly
document.execCommand(...)          // Never use
```

### Rule 6: Block Creation
**Always use `ScrollPage.loadBlock(name).create(muya, state)`.**

```typescript
// CORRECT: Use the block registry
const state = { name: 'paragraph', text: 'Hello' }
const BlockClass = ScrollPage.loadBlock('paragraph')
const block = BlockClass.create(muya, state)
scrollPage.insertAfter(block, refBlock, 'api')

// WRONG: Instantiating blocks directly
const block = new ParagraphBlock(muya, state) // May bypass registration
```

### Rule 7: Event Rule
**Use `eventCenter.attachDOMEvent()` for proper cleanup.**

```typescript
// CORRECT: Muya's event system handles cleanup on destroy
const { eventCenter } = muya
eventCenter.attachDOMEvent(domNode, 'click', handler)

// WRONG: Manual listeners leak memory
domNode.addEventListener('click', handler) // Requires manual cleanup
```

---

## Section 2: Anti-Pattern Warning - The Overlay/Mask Pattern

> **WARNING: The overlay positioning pattern has been deprecated after multiple failed attempts.**
>
> See: `apps/web/src/components/ai/_deprecated/InlineDiffOverlay.vue`

### Why Overlays Fail

1. **Scroll Coordinate Drift**: Positions calculated with `getBoundingClientRect()` become stale as the user scrolls. Debouncing recalculation leads to visible lag.

2. **Z-Index Conflicts**: Muya uses floating panels (format toolbar, emoji picker, table tools) with their own z-index management. External overlays interfere unpredictably.

3. **ResizeObserver Feedback Loops**: Observing container resize to recalculate positions can create infinite loops when the overlay itself affects layout.

4. **Position Staleness on Content Reflow**: Any content change (typing, paste, undo) reflows the document, invalidating cached positions.

### The Pattern That Works

Instead of positioning elements outside Muya's DOM, inject them AS CHILDREN of blocks and use CSS to make them appear outside:

```typescript
// Create a button as a child of the block
const btn = document.createElement('button')
btn.className = 'mu-diff-action'
btn.style.cssText = `
  position: absolute;
  right: -28px;  /* Appears outside the block via negative offset */
  top: 16px;
`
domNode.insertBefore(btn, domNode.firstChild)
```

```css
/* The parent block needs relative positioning */
.mu-diff-block {
  position: relative;
  overflow: visible; /* Allow children to render outside */
}
```

---

## Section 3: Block System Architecture

### Block Hierarchy

```
TreeNode (base class)
├── Parent (container blocks)
│   ├── ScrollPage (root container, holds all top-level blocks)
│   ├── Paragraph
│   ├── AtxHeading
│   ├── CodeBlock
│   │   └── Code (child of CodeBlock)
│   ├── BlockQuote
│   │   └── children (Paragraph, List, etc.)
│   ├── BulletList / OrderList / TaskList
│   │   └── ListItem / TaskListItem
│   │       └── children (Paragraph, nested lists, etc.)
│   ├── Table
│   │   └── TableRow
│   │       └── TableCell
│   └── ... (Diagram, MathBlock, HtmlBlock, etc.)
└── Content (leaf blocks with editable text)
    ├── ParagraphContent
    ├── AtxHeadingContent
    ├── CodeBlockContent
    ├── TableCellContent
    └── ... (all *Content blocks)
```

### DOM-Block Relationship

Every DOM node inside Muya has a `__MUYA_BLOCK__` property:

```typescript
// packages/muya/src/config/index.ts
export const BLOCK_DOM_PROPERTY = '__MUYA_BLOCK__'

// packages/muya/src/block/base/treeNode.ts (line 98)
domNode[BLOCK_DOM_PROPERTY] = this
```

To get a block from a DOM element:

```typescript
const BLOCK_DOM_PROPERTY = '__MUYA_BLOCK__'
const block = domElement[BLOCK_DOM_PROPERTY]
if (block) {
  console.log(block.blockName) // 'paragraph', 'atx-heading', etc.
}
```

### Block Names Reference

| Block Name | Type | Description |
|------------|------|-------------|
| `scrollpage` | Parent | Root container, holds all top-level blocks |
| `paragraph` | Parent | Basic text paragraph |
| `atx-heading` | Parent | ATX-style heading (# Heading) |
| `setext-heading` | Parent | Setext-style heading (underlined) |
| `code-block` | Parent | Fenced or indented code block |
| `code` | Parent | Inner code container |
| `block-quote` | Parent | Blockquote container |
| `bullet-list` | Parent | Unordered list |
| `order-list` | Parent | Ordered list |
| `list-item` | Parent | List item |
| `task-list` | Parent | Task/checkbox list |
| `task-list-item` | Parent | Task list item |
| `table` | Parent | Table container |
| `table.inner` | Parent | Table inner structure |
| `table.row` | Parent | Table row |
| `table.cell` | Parent | Table cell |
| `thematic-break` | Parent | Horizontal rule (---) |
| `html-block` | Parent | Raw HTML block |
| `math-block` | Parent | Display math ($$...$$) |
| `diagram` | Parent | Mermaid/PlantUML/Vega-Lite |
| `frontmatter` | Parent | YAML frontmatter |
| `paragraph.content` | Content | Paragraph text content |
| `atxheading.content` | Content | Heading text content |
| `codeblock.content` | Content | Code text content |
| `table.cell.content` | Content | Table cell text content |
| `language-input` | Content | Code block language input |

### Block Registration

Blocks are registered with ScrollPage and loaded by name:

```typescript
// Registration (done in Muya initialization)
ScrollPage.register(Paragraph)
ScrollPage.register(AtxHeading)
// ... etc

// Loading a block class
const BlockClass = ScrollPage.loadBlock('paragraph')
const block = BlockClass.create(muya, state)
```

### Key Files

| File | Purpose |
|------|---------|
| `packages/muya/src/block/base/treeNode.ts` | Base class, DOM ownership |
| `packages/muya/src/block/base/parent.ts` | Container operations (insertBefore, insertAfter, append) |
| `packages/muya/src/block/base/content.ts` | Leaf blocks, text handling, cursor management |
| `packages/muya/src/block/scrollPage/index.ts` | Root container, block registry |
| `packages/muya/src/config/index.ts` | BLOCK_DOM_PROPERTY constant |

---

## Section 4: State Management

### JSONState and OT Operations

Muya uses JSON OT (Operational Transform) for state management. All content changes should flow through this system to maintain undo/redo and collaboration support.

```typescript
// State changes are tracked via the 'source' parameter
block.append(newBlock, 'user')  // Tracked: creates OT operation
block.append(newBlock, 'api')   // Silent: no OT operation

// The jsonState object handles operations
this.jsonState.insertOperation(path, state)  // Insert
this.jsonState.removeOperation(path)          // Remove
this.jsonState.editOperation(path, textOp)    // Edit text
```

### State Structure

Block state is a JSON representation of the document:

```typescript
// Simple paragraph
{ name: 'paragraph', text: 'Hello world' }

// Heading with metadata
{ name: 'atx-heading', meta: { level: 2 }, text: '## Section Title' }

// Code block
{ name: 'code-block', meta: { type: 'fenced', lang: 'typescript' }, text: 'const x = 1' }

// Table (nested children)
{
  name: 'table',
  children: [
    {
      name: 'table.row',
      children: [
        { name: 'table.cell', meta: { align: 'left' }, text: 'Header' },
        { name: 'table.cell', meta: { align: 'right' }, text: 'Value' }
      ]
    }
  ]
}

// List (nested children)
{
  name: 'bullet-list',
  meta: { loose: false, marker: '-' },
  children: [
    { name: 'list-item', children: [{ name: 'paragraph', text: 'Item 1' }] },
    { name: 'list-item', children: [{ name: 'paragraph', text: 'Item 2' }] }
  ]
}
```

### Markdown Parsing

Use `MarkdownToState` to parse markdown into proper block states:

```typescript
import { MarkdownToState } from '@inkdown/muya/state/markdownToState'

const parser = new MarkdownToState({
  math: true,
  isGitlabCompatibilityEnabled: true,
  frontMatter: true,
  footnote: false,
  trimUnnecessaryCodeBlockEmptyLines: false,
})

const states = parser.generate('## Heading\n\nParagraph text')
// Returns: [
//   { name: 'atx-heading', meta: { level: 2 }, text: '## Heading' },
//   { name: 'paragraph', text: 'Paragraph text' }
// ]
```

See: `apps/web/src/utils/muyaMarkdownParser.ts` for a wrapper function.

---

## Section 5: Integration Patterns (Working Examples)

These patterns are proven to work. Reference: `apps/web/src/composables/useDiffBlocks.ts`

### Pattern 1: DOM Injection as Block Children

Add UI elements (buttons, indicators) as children of block DOM nodes, styled to appear outside:

```typescript
function addActionButton(block: MuyaBlock, type: 'accept' | 'reject', pairId: string) {
  const domNode = block.domNode
  if (!domNode) return

  // Create button element
  const btn = document.createElement('button')
  btn.className = `mu-diff-action mu-diff-action-${type}`
  btn.setAttribute('data-diff-pair-id', pairId)
  btn.textContent = type === 'accept' ? '+' : '\u2212'

  // Event handler
  const handler = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    // Handle action...
  }
  btn.addEventListener('click', handler)

  // Insert as FIRST CHILD (CSS positions it outside)
  domNode.insertBefore(btn, domNode.firstChild)
}
```

CSS to make children appear outside:

```css
.mu-diff-block {
  position: relative;
  overflow: visible; /* Allow button to render outside */
  margin-right: 32px; /* Space for button */
}

.mu-diff-action {
  position: absolute;
  right: -28px; /* OUTSIDE the block to the right */
  top: 16px;
}
```

### Pattern 2: Block Injection

Create and insert real Muya blocks programmatically:

```typescript
function insertBlockAfter(muya: MuyaInstance, state: TState, refBlock: MuyaBlock) {
  const scrollPage = muya.editor.scrollPage
  const ScrollPageClass = (scrollPage as any).constructor

  // Load the block class by name
  const BlockClass = ScrollPageClass.loadBlock(state.name)
  if (!BlockClass) {
    console.warn(`Block type '${state.name}' not registered`)
    return null
  }

  // Create the block instance
  const block = BlockClass.create(muya, state)

  // Insert into the document
  scrollPage.insertAfter(block, refBlock, 'api')

  return block
}

// Usage
const state = { name: 'paragraph', text: 'New paragraph' }
const newBlock = insertBlockAfter(muya, state, existingBlock)
```

### Pattern 3: Block Styling

Add/remove classes on block DOM nodes for visual changes:

```typescript
function styleBlockAsAddition(block: MuyaBlock, pairId: string) {
  const domNode = block.domNode
  if (!domNode) return

  // Add CSS classes
  domNode.classList.add('mu-diff-block', 'mu-diff-addition')

  // Add data attribute for tracking
  domNode.setAttribute('data-diff-pair-id', pairId)
}

function clearBlockStyling(block: MuyaBlock) {
  const domNode = block.domNode
  if (!domNode) return

  domNode.classList.remove('mu-diff-block', 'mu-diff-addition', 'mu-diff-deletion')
  domNode.removeAttribute('data-diff-pair-id')
}
```

### Pattern 4: Finding Blocks

Navigate the block tree to find specific blocks:

```typescript
// Find block by index (0-based)
const scrollPage = muya.editor.scrollPage
const block = scrollPage.find(3)  // Fourth block

// Query block by path
const block = scrollPage.queryBlock([2, 'children', 0])

// Traverse all blocks
scrollPage.breadthFirstTraverse((node) => {
  if (node.blockName === 'paragraph') {
    console.log('Found paragraph:', node.text)
  }
})

// Get block from DOM element
const domElement = document.querySelector('.my-target')
const block = domElement['__MUYA_BLOCK__']
```

---

## Section 6: Anti-Patterns (What NOT to Do)

### Anti-Pattern 1: Overlay Positioning

**Problem**: Absolute positioned elements outside Muya's DOM structure.

```typescript
// WRONG: Calculating positions and creating overlays
function calculatePositions() {
  const scrollRect = scrollContainer.getBoundingClientRect()
  const blockRect = targetBlock.rect

  positioned.push({
    top: blockRect.bottom - scrollRect.top + scrollTop,
    left: blockRect.left - scrollRect.left + scrollLeft,
    width: blockRect.width,
  })
}
```

```vue
<!-- WRONG: Overlay component with absolute positioning -->
<template>
  <div class="inline-diff-overlay" style="position: absolute; z-index: 100;">
    <div v-for="hunk in positionedHunks" :style="{ top: hunk.top + 'px' }">
      <!-- Content -->
    </div>
  </div>
</template>
```

**Why it fails**: Scroll coordinate drift, z-index conflicts, ResizeObserver loops.

**Solution**: Use DOM injection as children (Pattern 1 in Section 5).

### Anti-Pattern 2: Direct DOM Manipulation

**Problem**: Modifying DOM directly without going through Muya's state.

```typescript
// WRONG: Setting content directly
block.domNode.textContent = 'New content'

// WRONG: Removing elements via DOM
element.remove()  // Doesn't update Muya's state

// WRONG: Adding elements as siblings
parentElement.appendChild(newElement)  // Not tracked by Muya
```

**Why it fails**: Breaks state sync, undo/redo, and document serialization.

**Solution**: Use `setMarkdown()` for content changes, or Muya's block APIs for structural changes.

### Anti-Pattern 3: Native Selection API

**Problem**: Using browser's native selection API directly.

```typescript
// WRONG: Using window.getSelection()
const sel = window.getSelection()
const range = document.createRange()
range.setStart(node, offset)
sel.removeAllRanges()
sel.addRange(range)
```

**Why it fails**: Interferes with Muya's selection tracking and cursor management.

**Solution**: Use Muya's Selection API:

```typescript
// CORRECT
contentBlock.setCursor(startOffset, endOffset, true)
muya.editor.selection.setSelection(cursor)
```

### Anti-Pattern 4: Event Listeners Without Cleanup

**Problem**: Adding event listeners without proper cleanup.

```typescript
// WRONG: No cleanup on component unmount
mounted() {
  document.addEventListener('scroll', this.handleScroll)
  new ResizeObserver(this.handleResize).observe(element)
}
// Memory leak: listeners persist after component destruction
```

**Solution**: Use Muya's event system or track cleanup:

```typescript
// CORRECT: Using Muya's event center
const { eventCenter } = muya
eventCenter.attachDOMEvent(domNode, 'click', handler)
// Cleanup handled automatically on muya.destroy()

// CORRECT: Manual cleanup tracking
const cleanupFunctions = new Map()
cleanupFunctions.set(id, () => {
  btn.removeEventListener('click', handler)
})

// On cleanup
cleanupFunctions.forEach((cleanup) => cleanup())
cleanupFunctions.clear()
```

### Reference: Deprecated Files

See these files for examples of what NOT to do:

- `apps/web/src/components/ai/_deprecated/InlineDiffOverlay.vue` - Overlay positioning pattern
- `apps/web/src/components/ai/_deprecated/InlineDiffHunk.vue` - Associated hunk component

---

## Section 7: Event System

### EventCenter Usage

Muya's EventCenter handles both DOM events and custom events:

```typescript
const { eventCenter } = muya

// DOM events (auto-cleanup on destroy)
eventCenter.attachDOMEvent(domNode, 'click', handler)
eventCenter.attachDOMEvent(domNode, 'keydown', handler)
eventCenter.detachDOMEvent(domNode, 'click')

// Custom events
eventCenter.on('json-change', handler)
eventCenter.on('selection-change', handler)
eventCenter.off('json-change', handler)
eventCenter.emit('custom-event', data)
eventCenter.once('one-time-event', handler)  // Auto-removes after first call
```

### Key Events

| Event | Description | Payload |
|-------|-------------|---------|
| `json-change` | Document content changed | State changes |
| `selection-change` | Cursor/selection moved | Selection info |
| `muya-float` | Floating panel shown/hidden | Panel info |
| `content-change` | Block content updated | Block, changes |
| `stateChange` | Editor state changed | New state |

### Floating Panel System

Muya uses floating panels for toolbars and pickers:

```typescript
// Check if any float is shown
if (muya.ui.shownFloat.size > 0) {
  // A toolbar/picker is visible
}

// Float names
'mu-format-picker'      // Format toolbar
'mu-table-picker'       // Table size picker
'mu-quick-insert'       // Quick insert menu (/)
'mu-emoji-picker'       // Emoji selector
'mu-front-menu'         // Turn Into menu
'mu-list-picker'        // List type picker
'mu-image-selector'     // Image selector
'mu-table-column-tools' // Table column toolbar
'mu-table-bar-tools'    // Table row toolbar
```

---

## Section 8: Rendering Pipeline

### Block Rendering Flow

1. **State to Block**: `ScrollPage.loadBlock(name).create(muya, state)` creates block from state
2. **DOM Creation**: `block.createDomNode()` creates the DOM element
3. **DOM Attachment**: `domNode[BLOCK_DOM_PROPERTY] = block` links DOM to block
4. **Content Rendering**: For Content blocks, `update()` renders inline content

### Content Block Update

Content blocks (paragraph, heading, code, etc.) render via `update()`. The base Content class uses simple text rendering, while FormatContent subclasses use the inline renderer for rich formatting (bold, italic, links, etc.).

### Inline Token Types

The inline renderer processes these token types:

| Token Type | Description |
|------------|-------------|
| `em` | Emphasis (*text*) |
| `strong` | Strong (**text**) |
| `del` | Strikethrough (~~text~~) |
| `inline_code` | Inline code (\`code\`) |
| `inline_math` | Inline math ($x^2$) |
| `link` | Links [text](url) |
| `image` | Images ![alt](src) |
| `html_tag` | HTML tags <tag> |
| `emoji` | Emoji :emoji: |
| `footnote_identifier` | Footnote [^id] |

---

## Section 9: Web App Integration

### EditorArea.vue Pattern

The main integration point is `apps/web/src/components/editor/EditorArea.vue`:

```typescript
import { ref, markRaw, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Muya } from '@inkdown/muya'

// CRITICAL: Use markRaw to prevent Vue from proxying Muya
const muyaInstance = ref<Muya | null>(null)

function initializeMuya() {
  // markRaw prevents Vue reactivity from breaking Muya's internals
  muyaInstance.value = markRaw(new Muya(editorRef.value, options))

  // Listen to Muya events
  muyaInstance.value.on('json-change', () => {
    const markdown = muyaInstance.value?.getMarkdown() || ''
    // Update store...
  })
}

onMounted(() => {
  initializeMuya()
})

onUnmounted(() => {
  if (muyaInstance.value) {
    try {
      muyaInstance.value.destroy()
    } catch {
      // Ignore cleanup errors
    }
    muyaInstance.value = null
  }
})
```

### Vue Reactivity Warning

**CRITICAL**: Always use `markRaw()` when storing Muya instances in Vue refs.

```typescript
// CORRECT
muyaInstance.value = markRaw(new Muya(element, options))

// WRONG - Will break Muya internals
muyaInstance.value = new Muya(element, options)
```

**Why**: Vue's Proxy wrapper breaks `structuredClone()` in `getState()` and interferes with DOM element references.

### useDiffBlocks Composable Pattern

The composable pattern for Muya integrations:

```typescript
export function useDiffBlocks(
  muyaRef: Ref<MuyaInstance | null>,
  noteIdRef: Ref<string | undefined>
) {
  // Track applied edits to avoid re-injection
  const appliedEditIds = ref<Set<string>>(new Set())

  // Cleanup functions for proper disposal
  const cleanupFunctions = ref<Map<string, () => void>>(new Map())

  function applyDiffToEditor(edit: PendingEdit): boolean {
    const muya = muyaRef.value
    if (!muya || !muya.editor?.scrollPage) return false
    // Implementation...
  }

  // Watch for note changes to clear state
  watch(noteIdRef, (newId, oldId) => {
    if (oldId && newId !== oldId) {
      appliedEditIds.value.clear()
      cleanupFunctions.value.forEach((cleanup) => cleanup())
      cleanupFunctions.value.clear()
    }
  })

  return {
    applyDiffToEditor,
    // ... other methods
  }
}
```

---

## Section 10: Debugging Tips

### Browser Console Inspection

```javascript
// Get Muya instance from DOM
const container = document.querySelector('.mu-container')
const scrollPage = container['__MUYA_BLOCK__']

// Inspect block tree
scrollPage.breadthFirstTraverse((node) => {
  console.log(node.blockName, node.text?.substring(0, 50))
})

// Get block from any element
const el = document.querySelector('.mu-paragraph')
const block = el['__MUYA_BLOCK__']
console.log(block.getState())

// Check current selection
const selection = document.querySelector('.muya-editor').__MUYA_BLOCK__?.muya.editor.selection
console.log(selection.getSelection())
```

### Common Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| `structuredClone() error` | Vue Proxy wrapping Muya | Use `markRaw()` when storing Muya in ref |
| Content not updating | Direct DOM manipulation | Use `setMarkdown()` or block APIs |
| Selection jumps/lost | Native selection API | Use Muya's Selection API |
| Memory leaks | Event listeners not cleaned | Use `eventCenter.attachDOMEvent()` |
| Z-index conflicts | Overlay outside Muya | Inject as children, not overlays |
| Positions drift on scroll | Coordinate math for positioning | Use DOM hierarchy positioning |
| Undo/redo broken | Using 'api' source | Use 'user' source for user actions |
| Block type not rendering | Block name not registered | Check `ScrollPage.loadBlock()` returns value |

### Getting Block from DOM Element

```typescript
const BLOCK_DOM_PROPERTY = '__MUYA_BLOCK__'

function getBlockFromElement(element: HTMLElement): MuyaBlock | null {
  // Walk up the DOM tree to find the block
  let current: HTMLElement | null = element
  while (current) {
    const block = current[BLOCK_DOM_PROPERTY]
    if (block) return block
    current = current.parentElement
  }
  return null
}
```

### Logging Block Operations

```typescript
// Enable Muya debug logging
import logger from '@inkdown/muya/utils/logger'
// Muya uses namespaced loggers: 'scrollpage:', 'parent:', etc.
```

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────┐
│ MUYA QUICK REFERENCE                                            │
├─────────────────────────────────────────────────────────────────┤
│ Get block from DOM:    element['__MUYA_BLOCK__']                │
│ Create block:          ScrollPage.loadBlock('name').create()    │
│ Insert block:          scrollPage.insertAfter(block, ref, src)  │
│ Remove block:          block.remove('api')                      │
│ Set cursor:            contentBlock.setCursor(start, end, true) │
│ Get markdown:          muya.getMarkdown()                       │
│ Set markdown:          muya.setMarkdown(content)                │
│ Get state:             muya.getState()                          │
│ Listen to changes:     muya.on('json-change', handler)          │
│ Parse markdown:        new MarkdownToState(opts).generate(md)   │
├─────────────────────────────────────────────────────────────────┤
│ Sources: 'user' = tracked in undo, 'api' = silent               │
│ Vue: ALWAYS use markRaw() for Muya instances                    │
│ UI: Inject as CHILDREN, not overlays                            │
└─────────────────────────────────────────────────────────────────┘
```
