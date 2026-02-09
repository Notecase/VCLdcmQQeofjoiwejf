# 2026-02-08 — Starting Page Redesign (Monochrome + Minimal)

## Context

The starting page (HomePage) currently has:

- A "Start a guided session" hero banner that feels AI-generic — **remove**
- 4 recommendation cards in a 2x2 grid with icons/descriptions — too busy
- A chat composer footer that takes too much vertical space
- The dreamy blue accent (`#7c9ef8`) everywhere — user explicitly wants **no blue**
- The MD file viewer modal (FileViewerModal) is functional but not premium

**Goal**: Clean, modern, natural. Think Linear/Raycast, not chatbot. Pure monochrome palette. Minimal visual noise.

---

## Step 1 — Color System: Monochrome Overhaul

**File**: `apps/web/src/assets/themes/variables.css`

Replace all blue accent colors with pure monochrome. The primary becomes white (dark theme) / near-black (light theme).

### Dark theme changes (lines 7-261):

| Variable                          | Old                                                 | New                                                                      |
| --------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `--primary-color` (L16)           | `#7c9ef8`                                           | `#ffffff`                                                                |
| `--primary-gradient` (L17)        | `linear-gradient(135deg, #7c9ef8 0%, #a78bfa 100%)` | `linear-gradient(135deg, #ffffff 0%, #d1d5db 100%)`                      |
| `--theme-color` (L27)             | `#7c9ef8`                                           | `#ffffff`                                                                |
| `--highlight-color` (L28)         | `rgba(102, 177, 255, 0.6)`                          | `rgba(255, 255, 255, 0.25)`                                              |
| `--selection-color` (L29)         | `rgba(102, 177, 255, 0.3)`                          | `rgba(255, 255, 255, 0.15)`                                              |
| `--themeColor` (L53)              | `#7c9ef8`                                           | `#ffffff`                                                                |
| `--themeColor90`-`10` (L54-62)    | `rgba(124, 158, 248, N)`                            | `rgba(255, 255, 255, N)`                                                 |
| `--highlightColor` (L65)          | `rgba(102, 177, 255, 0.6)`                          | `rgba(255, 255, 255, 0.25)`                                              |
| `--selectionColor` (L66)          | `rgba(102, 177, 255, 0.3)`                          | `rgba(255, 255, 255, 0.15)`                                              |
| `--ai-tab-underline` (L113)       | `#58a6ff`                                           | `#ffffff`                                                                |
| `--ai-focus-ring` (L131)          | `rgba(88, 166, 255, 0.08)`                          | `rgba(255, 255, 255, 0.08)`                                              |
| `--ai-gradient-overlay` (L134)    | blue gradient                                       | `linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, transparent 50%)` |
| `--chat-message-streaming` (L142) | `rgba(88, 166, 255, 0.03)`                          | `rgba(255, 255, 255, 0.03)`                                              |
| `--chat-card-border-hover` (L146) | `rgba(88, 166, 255, 0.2)`                           | `rgba(255, 255, 255, 0.15)`                                              |
| `--stream-cursor` (L151)          | `#58a6ff`                                           | `#ffffff`                                                                |
| `--stream-pulse` (L152)           | `rgba(88, 166, 255, 0.3)`                           | `rgba(255, 255, 255, 0.3)`                                               |
| `--stream-glow` (L153)            | blue glow                                           | `0 0 0 1px rgba(255, 255, 255, 0.3)`                                     |
| `--role-user-bg` (L156)           | `rgba(88, 166, 255, 0.15)`                          | `rgba(255, 255, 255, 0.08)`                                              |
| `--role-user-color` (L157)        | `#58a6ff`                                           | `#e2e8f0`                                                                |
| `--timeline-active-glow` (L189)   | `rgba(88, 166, 255, 0.4)`                           | `rgba(255, 255, 255, 0.3)`                                               |
| `--tool-running-border` (L195)    | `rgba(88, 166, 255, 0.4)`                           | `rgba(255, 255, 255, 0.3)`                                               |
| `--tool-running-glow` (L196)      | `rgba(88, 166, 255, 0.15)`                          | `rgba(255, 255, 255, 0.1)`                                               |

### Light theme changes (lines 263-517):

| Variable                          | Old                         | New                                                                |
| --------------------------------- | --------------------------- | ------------------------------------------------------------------ |
| `--primary-color` (L273)          | `#7c9ef8`                   | `#1a1a1a`                                                          |
| `--primary-gradient` (L274)       | blue-purple gradient        | `linear-gradient(135deg, #1a1a1a 0%, #404040 100%)`                |
| `--theme-color` (L284)            | `#7c9ef8`                   | `#1a1a1a`                                                          |
| `--highlight-color` (L285)        | `rgba(33, 150, 243, 0.3)`   | `rgba(0, 0, 0, 0.15)`                                              |
| `--selection-color` (L286)        | `rgba(33, 150, 243, 0.15)`  | `rgba(0, 0, 0, 0.1)`                                               |
| `--themeColor` (L310)             | `#7c9ef8`                   | `#1a1a1a`                                                          |
| `--themeColor90`-`10` (L311-319)  | `rgba(124, 158, 248, N)`    | `rgba(26, 26, 26, N)`                                              |
| `--highlightColor` (L322)         | `rgba(33, 150, 243, 0.3)`   | `rgba(0, 0, 0, 0.15)`                                              |
| `--selectionColor` (L323)         | `rgba(33, 150, 243, 0.15)`  | `rgba(0, 0, 0, 0.1)`                                               |
| `--ai-input-focus` (L375)         | `rgba(124, 158, 248, 0.2)`  | `rgba(0, 0, 0, 0.1)`                                               |
| `--ai-cmd-header` (L376)          | `#7c9ef8`                   | `#1a1a1a`                                                          |
| `--ai-focus-ring` (L387)          | `rgba(124, 158, 248, 0.1)`  | `rgba(0, 0, 0, 0.06)`                                              |
| `--ai-gradient-overlay` (L390)    | blue gradient               | `linear-gradient(180deg, rgba(0, 0, 0, 0.02) 0%, transparent 50%)` |
| `--chat-message-streaming` (L398) | `rgba(124, 158, 248, 0.04)` | `rgba(0, 0, 0, 0.03)`                                              |
| `--chat-card-border-hover` (L402) | `rgba(124, 158, 248, 0.3)`  | `rgba(0, 0, 0, 0.15)`                                              |
| `--stream-cursor` (L407)          | `#7c9ef8`                   | `#1a1a1a`                                                          |
| `--stream-pulse` (L408)           | `rgba(124, 158, 248, 0.3)`  | `rgba(0, 0, 0, 0.2)`                                               |
| `--stream-glow` (L409)            | blue glow                   | `0 0 0 1px rgba(0, 0, 0, 0.2)`                                     |
| `--role-user-bg` (L412)           | `rgba(124, 158, 248, 0.15)` | `rgba(0, 0, 0, 0.06)`                                              |
| `--role-user-color` (L413)        | `#5b7fd6`                   | `#334155`                                                          |
| `--timeline-active-glow` (L445)   | `rgba(124, 158, 248, 0.4)`  | `rgba(0, 0, 0, 0.2)`                                               |
| `--tool-running-border` (L451)    | `rgba(124, 158, 248, 0.4)`  | `rgba(0, 0, 0, 0.2)`                                               |
| `--tool-running-glow` (L452)      | `rgba(124, 158, 248, 0.15)` | `rgba(0, 0, 0, 0.08)`                                              |

**Note**: `--ai-cmd-header` in dark theme (L120) is `#d8b4fe` (purple) — keep as-is, it's separate from the blue issue.

---

## Step 2 — ChatHero: Minimal Suggestion List

**File**: `apps/web/src/components/ai/ChatHero.vue`

Complete rewrite. Remove hero banner. Replace 2x2 grid with a minimal single-column list.

### Script changes:

- Remove icon imports (`Sparkles`, `Brain`, `Code`, `Lightbulb`)
- Remove `icon: Component` from `Recommendation` interface
- Remove `icon` property from each recommendation object

### Template — replace entirely:

```html
<div class="chat-hero">
  <p class="hero-label">What would you like to explore?</p>
  <div class="suggestion-list">
    <button
      v-for="rec in recommendations"
      :key="rec.id"
      class="suggestion-item"
      @click="emit('select', rec)"
    >
      <span class="item-dot" />
      <span class="item-label">{{ rec.title }}</span>
      <span class="item-action">{{ rec.action }} &rarr;</span>
    </button>
  </div>
</div>
```

### Style — replace entirely:

```css
.chat-hero {
  padding: 48px 0 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: fadeIn 0.4s ease-out;
}

.hero-label {
  font-size: 15px;
  font-weight: 450;
  color: var(--text-color-secondary, #94a3b8);
  letter-spacing: -0.01em;
}

.suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;
}

.suggestion-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.item-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-color-secondary, #94a3b8);
  opacity: 0.4;
  flex-shrink: 0;
  transition: opacity 0.12s ease;
}

.suggestion-item:hover .item-dot {
  opacity: 0.8;
}

.item-label {
  font-size: 13.5px;
  font-weight: 450;
  color: var(--text-color, #e2e8f0);
  flex: 1;
}

.item-action {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0;
  transition: opacity 0.12s ease;
}

.suggestion-item:hover .item-action {
  opacity: 0.7;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Design rationale**: No icons, no descriptions, no borders. Just text with a tiny neutral dot. Action text reveals on hover. Monochrome — uses `--text-color-secondary` for the dot instead of any accent color. Feels like a command palette list.

---

## Step 3 — ChatComposer: Slimmer Footer

**File**: `apps/web/src/components/ai/ChatComposer.vue`

Merge the textarea and send button into a single flex row. Remove text labels from buttons.

### Template changes:

Replace `.composer-input` + `.composer-actions` with a single `.composer-body`:

```html
<footer class="chat-composer">
  <div class="composer-card">
    <div v-if="$slots.top" class="composer-top">
      <slot name="top" />
    </div>
    <div class="composer-body">
      <textarea
        ref="inputRef"
        v-model="inputValue"
        :placeholder="dynamicPlaceholder"
        :disabled="isProcessing"
        rows="1"
        @keydown="handleKeydown"
      />
      <button
        v-if="isProcessing"
        class="action-btn stop-btn"
        type="button"
        title="Stop"
        @click="handleStop"
      >
        <Square :size="14" />
      </button>
      <button
        v-else
        class="action-btn send-btn"
        :class="{ active: inputValue.trim() }"
        :disabled="!inputValue.trim()"
        title="Send (Enter)"
        type="button"
        @click="handleSubmit"
      >
        <ArrowUp :size="14" />
      </button>
    </div>
  </div>
</footer>
```

### Style changes:

```css
.chat-composer {
  padding: 0 24px 12px; /* was 0 24px 20px */
  flex-shrink: 0;
}

.composer-card {
  background: rgba(255, 255, 255, 0.04); /* was 0.06 — more subtle */
  border: 1px solid var(--border-color, #333338);
  border-radius: 14px; /* was 16 */
  overflow: hidden;
  transition: border-color 0.15s;
}

.composer-card:focus-within {
  border-color: rgba(255, 255, 255, 0.2); /* monochrome focus — no primary-color */
}

.composer-body {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px;
}

.composer-body textarea {
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-size: 14px;
  font-family: inherit;
  color: var(--text-color, #e2e8f0);
  min-height: 24px; /* was 28 */
  max-height: 120px; /* was 140 */
  overflow-y: auto;
  padding: 2px 0;
}

.composer-body textarea::placeholder {
  color: rgba(139, 148, 158, 0.5);
}

.action-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.15s;
}

.send-btn {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(139, 148, 158, 0.4);
  cursor: not-allowed;
}

.send-btn.active {
  background: #ffffff; /* pure white button */
  color: #0d1117; /* dark text on white */
  cursor: pointer;
}

.send-btn.active:hover {
  opacity: 0.9;
}

.stop-btn {
  background: rgba(248, 81, 73, 0.1);
  color: #f85149;
}

.stop-btn:hover {
  background: rgba(248, 81, 73, 0.18);
}
```

**Vertical savings**: ~114px before -> ~56px after (51% reduction). The text "Send" / "Stop" labels are removed — just icon-only 30x30 buttons. The textarea and button sit side-by-side in one flex row.

Also update `autoResize()` max from 140 to 120: `Math.min(textarea.scrollHeight, 120)`.

---

## Step 4 — FileViewerModal: Premium Dark Header

**File**: `apps/web/src/components/deepagent/FileViewerModal.vue`

Restructure the header into a multi-row layout with file type badge, large title, and labeled action buttons.

### Template — replace `modal-header`:

```html
<div class="modal-header">
  <div class="header-row-top">
    <div class="file-badge">
      <FileText :size="13" />
      <span>.{{ fileExtension || 'txt' }}</span>
    </div>
    <button class="close-pill" type="button" title="Close" @click="emit('close')">
      <X :size="14" />
    </button>
  </div>

  <div class="header-title">
    <h2 v-if="!editMode">{{ file.name }}</h2>
    <input v-else v-model="editFilename" class="filename-input" type="text" />
  </div>

  <div class="header-actions">
    <button v-if="!editMode" class="hdr-btn" type="button" @click="enterEdit">
      <Edit :size="13" /> Edit
    </button>
    <button class="hdr-btn" :class="{ success: copied }" type="button" @click="handleCopy">
      <Check v-if="copied" :size="13" /> <Copy v-else :size="13" />
      {{ copied ? 'Copied' : 'Copy' }}
    </button>
    <button class="hdr-btn" type="button" @click="handleDownload">
      <Download :size="13" /> Download
    </button>
    <button class="hdr-btn accent" type="button" @click="handleSaveAsNote">
      <BookOpen :size="13" /> Save as Note
    </button>
  </div>
</div>
```

### Style changes — header section:

```css
.modal-container {
  min-width: 60vw;
  height: 80vh;
  max-height: 80vh;
  max-width: 1000px;
  background: var(--surface-1, #0d1117);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px; /* was 12 */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.03);
}

.modal-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 24px 16px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.025) 0%, transparent 100%);
  border-bottom: 1px solid var(--border-color, #333338);
  flex-shrink: 0;
}

.header-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.file-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color-secondary, #94a3b8);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.close-pill {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: none;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color-secondary, #94a3b8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.close-pill:hover {
  background: rgba(248, 81, 73, 0.1);
  color: #f85149;
}

.header-title h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  letter-spacing: -0.01em;
  line-height: 1.3;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.hdr-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #333338);
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
  font-weight: 450;
  cursor: pointer;
  transition: all 0.15s;
}

.hdr-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-color, #e2e8f0);
  border-color: rgba(255, 255, 255, 0.12);
}

.hdr-btn.accent {
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--text-color, #e2e8f0);
}

.hdr-btn.success {
  color: #3fb950;
  border-color: rgba(63, 185, 80, 0.3);
}
```

**Header now ~130px tall** (vs ~50px before) — creates the "tall header" premium feel with: file type badge, large 18px title, labeled action buttons.

Also increase markdown body padding: `.markdown-viewer { padding: 28px 32px; }` (was 24px).

---

## Step 5 — Hardcoded Blue Cleanup (Primary Files Only)

These files used in this task have hardcoded blue values to replace:

| File                  | Line          | Old                                  | New                                       |
| --------------------- | ------------- | ------------------------------------ | ----------------------------------------- |
| `HomePage.vue`        | 458           | `rgba(88, 166, 255, 0.08)`           | `rgba(255, 255, 255, 0.05)`               |
| `ChatHero.vue`        | 105, 106, 125 | `rgba(124, 158, 248, ...)`           | Removed (entire file rewritten)           |
| `ChatComposer.vue`    | 136, 198, 200 | `--primary-color, #7c9ef8` fallbacks | `rgba(255, 255, 255, 0.2)` and `#ffffff`  |
| `FileViewerModal.vue` | 305, 334, 338 | `--primary-color, #7c9ef8`           | `--primary-color, #ffffff` (auto via var) |

**Out of scope for this task**: 40+ other files with hardcoded blue. These use `var(--primary-color)` references that will automatically pick up the new value from variables.css. Files with hardcoded `rgba(124, 158, 248, ...)` or `#58a6ff` values in other components can be cleaned up in a follow-up pass.

---

## Verification

1. Run `pnpm build` — ensure no build errors
2. Run `pnpm typecheck` — ensure TS is clean
3. Visual check in browser (dark theme):
   - Homepage: no blue anywhere, clean suggestion list, narrow composer
   - Type in composer: focus border is white/subtle, send button turns white
   - Click a suggestion: verify it emits and starts the chat
   - Open a .md file: verify tall premium header with badge + large title
4. Visual check in browser (light theme):
   - Primary color should be near-black `#1a1a1a`
   - Composer focus, buttons, suggestions should use dark monochrome
5. Check Muya editor: selection highlight, cursor, link colors should be neutral white/gray
