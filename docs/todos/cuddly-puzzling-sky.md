# Fix AI Tutor Sidebar — Design, White Line Bug, Context Wiring

## Context

The AI Tutor sidebar was implemented but has 3 issues:
1. **Design mismatch**: Current sidebar uses a custom design (icon-based messages, GraduationCap header). User wants it to match the note editor's AI sidebar (`AISidebar.vue`) — specifically the Agent tab's look and feel.
2. **White line bug**: A horizontal line cuts through user messages between the highlight-context blockquote and the message text.
3. **AI can't answer about the lesson**: When asking "what's this note about", the AI says it doesn't know which note — the lesson markdown IS being sent via the system prompt, but the system prompt doesn't explicitly tell the AI "this is the note the student is referring to". The prompt says "lesson content" but the user says "note" — need to add aliasing + a stronger instruction.

---

## Fix 1: Restyle Sidebar to Match AISidebar Agent Tab

### Goal
Replace the current `CourseExplainSidebar.vue` + `ExplainChatMessage.vue` design with the exact visual language of `AISidebar.vue` + `ChatMessage.vue`.

### What to copy from AISidebar

**Sidebar container** (`AISidebar.vue:475-500`):
- Use `var(--ai-sidebar-bg)` background instead of `var(--sidebar-bg)`
- Shadow elevation: `box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12)` instead of `border-left`
- Gradient overlay via `::before` pseudo-element
- Width: `320px` (not `380px`)
- Font family: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

**Header** (`AISidebar.vue:522-576`):
- Height `44px`, glassmorphism background `var(--ai-header-bg)` with `backdrop-filter: blur(12px)`
- Border-bottom: `var(--ai-divider)` instead of `var(--border-color)`
- Title centered with close button on right (keep current layout but restyle)
- Close button: use `.expand-btn` style (no background, `#6e7681` color, hover → `#58a6ff`)

**Input area** — Replace `ChatComposer` with the `AISidebar` input box style:
- Glass morphism: `rgba(22, 27, 34, 0.65)` + `blur(12px) saturate(180%)`
- Border radius `12px`, padding `12px`
- Context pill moves inside the input box (like `.input-context` in AISidebar)
- Footer with Attach/Search/Mention placeholder buttons + circular send button
- Send button: circular `28px`, uses `var(--primary-gradient)` when active

**Message rendering** — Replace `ExplainChatMessage.vue` with `ChatMessage.vue`-style layout:
- **No icons** (Bot/User) — use text role labels instead: "YOU" / "AI" (`11px uppercase, #8b949e`)
- Transparent background, `padding: 16px 0`
- Border-bottom separator: `var(--chat-separator)` (not `rgba(255, 255, 255, 0.04)`)
- Last message: no border-bottom
- Hover: `var(--chat-message-hover)` background
- Streaming: `var(--chat-message-streaming)` background
- Body: `14px`, `line-height: 1.65`, `.prose` deep styles matching ChatMessage
- Use `renderMathContent()` utility from `@/utils/mathRenderer` instead of raw `marked`
- Use `StreamingCursor` component from `@/components/ai/shared/StreamingCursor.vue`

### Files to modify

| File | Change |
|------|--------|
| `apps/web/src/components/course/viewer/CourseExplainSidebar.vue` | Full restyle: sidebar container, header, input area, replace ChatComposer with inline input matching AISidebar |
| `apps/web/src/components/course/viewer/ExplainChatMessage.vue` | Full restyle: replace icon layout with role-label layout, use `renderMathContent`, use theme vars, use `StreamingCursor` |

### Key reusable utilities

| Utility | Path | Usage |
|---------|------|-------|
| `renderMathContent()` | `apps/web/src/utils/mathRenderer.ts` | Render markdown + KaTeX math in assistant messages |
| `StreamingCursor` | `apps/web/src/components/ai/shared/StreamingCursor.vue` | Animated cursor for streaming |
| Theme variables | `apps/web/src/assets/themes/variables.css` | `--ai-sidebar-bg`, `--ai-header-bg`, `--ai-divider`, `--chat-separator`, etc. |

---

## Fix 2: White Line Bug

### Root cause

In `ExplainChatMessage.vue:50-52`:
```css
.explain-message + .explain-message {
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}
```

This rule is correct in isolation (only applies between adjacent messages). **But** the highlight-context `<blockquote>` inside a user message has `margin: 0 0 8px` with no explicit border — the visible "white line" is actually the `border-top` of the NEXT `.explain-message` (the AI response) bleeding visually close to the user message's blockquote, making it look like the line cuts through the user message.

### Fix

This is resolved by Fix 1 (restyle) — the new design uses `border-bottom: 1px solid var(--chat-separator)` on the message card itself with `.message-card:last-child { border-bottom: none }`, which is the AISidebar pattern. The highlight-context blockquote will sit inside the user message card with proper padding/margin, visually separated from the next message's border.

Specifically in the restyled ExplainChatMessage:
- Each message gets `padding: 16px 0; border-bottom: 1px solid var(--chat-separator);`
- The highlight-context blockquote gets `margin: 0 0 10px` (above the message text, inside the card)
- No adjacent-sibling `border-top` rule

---

## Fix 3: AI Can't Answer "What's This Note About"

### Root cause analysis

The AI receives the full lesson markdown via the system prompt. But when the user says "what's this note about", the AI responds as if it doesn't know which note — this happens because:

1. The system prompt says "Lesson Content" but the user says "note" — the AI doesn't connect these
2. The system prompt doesn't explicitly instruct the AI: "When the student refers to 'this', 'the note', 'this lesson', etc., they mean the lesson content provided above"
3. The system prompt injects lesson markdown as a big block but doesn't frame it as "THIS is the content you should answer about"

### Fix — Update system prompt in ExplainAgent

**File**: `packages/ai/src/agents/explain/index.ts` — `buildSystemPrompt()`

Add explicit aliasing instructions:

```
## Rules
- EXPLAIN mode only. Help the student understand this lesson content.
- When the student says "this", "this note", "the note", "this lesson", "the content", or similar — they are referring to the lesson content above. Always answer based on that content.
- You have FULL access to the lesson content. Never say you don't know what the student is referring to — the lesson content above IS the material they're studying.
- Never produce code edits, artifacts, or action proposals.
- Use clear examples and relate concepts to other parts of the course when possible.
- Format responses with markdown for readability.
- Keep explanations concise but thorough.
```

Also strengthen the lesson content framing:
```
## Lesson Content (THIS is what the student is studying — always refer to this when they ask questions)
{markdown}
```

### Files to modify

| File | Change |
|------|--------|
| `packages/ai/src/agents/explain/index.ts` | Update `buildSystemPrompt()` — add aliasing rules, reframe lesson content header |

---

## File Summary

### Modified files (3)

| # | File | Change |
|---|------|--------|
| 1 | `apps/web/src/components/course/viewer/CourseExplainSidebar.vue` | Full restyle to match AISidebar agent tab |
| 2 | `apps/web/src/components/course/viewer/ExplainChatMessage.vue` | Full restyle to match ChatMessage.vue pattern |
| 3 | `packages/ai/src/agents/explain/index.ts` | Fix system prompt aliasing so AI answers "what's this note about" |

### No new files needed

### Components reused from AISidebar

| Component / Utility | Path |
|---------------------|------|
| `renderMathContent()` | `apps/web/src/utils/mathRenderer.ts` |
| `StreamingCursor` | `apps/web/src/components/ai/shared/StreamingCursor.vue` |
| Theme CSS variables | `apps/web/src/assets/themes/variables.css` |

---

## Verification

1. **Build**: `pnpm build` — verify all packages compile
2. **Typecheck**: `pnpm typecheck` — no new type errors
3. **Visual check**:
   - Open course → AI Tutor sidebar → compare with note editor AI sidebar (Agent tab)
   - Sidebar should use same colors, same message layout (role labels not icons), same input box style
   - No white line between highlight-context quote and user message text
4. **Context test**:
   - Open a lecture lesson, open AI Tutor, ask "what's this note about" → AI should answer about the lesson content
   - Ask "explain the first section" → AI should reference the actual content
5. **Lint**: `pnpm lint`
