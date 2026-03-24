# Login Screen Redesign — Noteshell Landing Page Aesthetic

## Context

The current login screen (`AuthView.vue`) uses a split-screen layout with a purple/amber gradient brand panel featuring a fake app screenshot mockup. The user wants to redesign it to match the Noteshell landing page's "universal" aesthetic: dark, spacious, premium — with large serif typography, constellation dot patterns, subtle orbital arcs, and the actual Noteshell capsule logo. Also fix branding from "NoteShell" to "Noteshell" (lowercase 's').

**Reference**: Screenshot of Noteshell landing page — dark background, "Follow Curiosity." serif headline, constellation pattern, blue arcs, amber CTAs, monospace subtitles.

---

## Design Direction

**Aesthetic**: Dark, cosmic, premium — editorial feel with serif display type. Warm neutrals (NO deep blue backgrounds per user preference). Amber/gold accents.

**Color palette**:
| Role | Value |
|------|-------|
| Brand panel bg | `#0d0d0f` (near-black, warm) |
| Auth panel bg | `#111112` |
| Primary CTA (button) | `#d97706` (amber/gold) |
| CTA hover | `#b45309` |
| Active tab tint | `rgba(217, 119, 6, 0.15)` |
| Input focus border | `rgba(217, 119, 6, 0.4)` |
| Orbital arcs | `rgba(140, 135, 120, 0.10)` (warm muted, NOT blue) |
| Constellation dots | `rgba(255, 255, 255, 0.06–0.18)` |
| Constellation lines | `rgba(255, 255, 255, 0.04)` |
| Text primary | `#e8e8e8` |
| Text secondary | `#777` |
| Brand dot | `#d97706` |

**Typography**:

- **Playfair Display** (serif, 700) — hero tagline, ~48px
- **JetBrains Mono** (already imported) — monospace subtitle/labels
- **System/Inter** — form text (existing)

---

## Implementation Plan

### Step 1: Add Playfair Display font import

**File**: `apps/web/src/assets/fonts.css`

Add import line:

```css
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap');
```

### Step 2: Redesign AuthView.vue template — left panel

**File**: `apps/web/src/views/AuthView.vue`

**Remove** from left panel:

- `.brand-orb` elements (gradient blurred circles)
- `.brand-screenshot` and all children (fake app mockup)
- `.brand-bottom` section

**Replace with**:

```
brand-panel
  ├── <svg class="constellation-bg"> — ~25 dots + ~12 connecting lines, right-biased
  ├── <svg class="orbital-arcs"> — 2-3 large bezier curves, warm muted stroke
  └── brand-content (z-1, vertically centered)
        ├── brand-logo-row
        │     ├── <img src="/logo.svg"> (actual capsule logo, height ~28px)
        │     ├── brand-dot (8px amber circle)
        │     └── "noteshell" text (lowercase)
        ├── brand-badge — "agent-first learning platform" (monospace, pill-shaped)
        ├── brand-tagline — "Follow\nCuriosity." (Playfair Display, ~48px, bold)
        ├── brand-subtitle — "Let Noteshell build your learning path." (monospace, muted)
        └── brand-desc — "More than notes..." secondary text (muted, smaller)
```

### Step 3: Redesign AuthView.vue template — right panel text

**File**: `apps/web/src/views/AuthView.vue`

- Line 91: `"NoteShell"` → `"Noteshell"`
- Line 177: `"Sign in to continue to NoteShell"` → `"Sign in to continue to Noteshell"`
- Line 177: `"Get started with NoteShell"` → `"Get started with Noteshell"`

All auth logic stays identical — no JS changes needed.

### Step 4: Rewrite scoped CSS

**File**: `apps/web/src/views/AuthView.vue`

**Delete** (~100 lines):

- `.brand-orb*` styles
- All `.screenshot-*`, `.skel--*`, `.ai-block*`, `.dot--red/yellow/green` styles
- `.brand-bottom`, `.brand-tagline` (old), `.brand-desc` (old)

**Add new styles**:

- `.constellation-bg` — absolute fill, pointer-events none
- `.orbital-arcs` — absolute fill, pointer-events none
- `.brand-content` — relative z-1, flex column, justify center, padding
- `.brand-logo-row` — flex row, align center, gap 10px
- `.brand-logo-img` — height 28px, width auto
- `.brand-dot` — 8px circle, `#d97706`
- `.brand-name-text` — 22px, weight 600, white, letter-spacing -0.3px
- `.brand-badge` — monospace pill (border 1px rgba(255,255,255,0.15), border-radius 20px, padding 6px 14px, font-size 12px, JetBrains Mono)
- `.brand-tagline-serif` — Playfair Display, 48px, weight 700, line-height 1.15, color #e8e8e8, margin-top 32px
- `.brand-subtitle-mono` — JetBrains Mono, 14px, rgba(255,255,255,0.45), margin-top 16px
- `.brand-desc-text` — 13px, rgba(255,255,255,0.3), margin-top 8px

**Update existing styles**:

- `.brand-panel` bg → `#0d0d0f` solid
- `.auth-panel` bg → `#111112`
- `.auth-tabs button.active` → amber tint
- `.form-group input:focus` → amber border
- `.btn-primary` → solid `#d97706`, no gradient
- `.btn-primary:hover` → `#b45309`, amber glow

**Responsive** (`@media max-width: 768px`):

- Hide constellation SVG, orbital arcs, tagline, subtitle, desc
- Show only logo row + badge
- Auth panel full width

### Step 5: Fix "NoteShell" branding in other files

- `apps/web/src/views/DemoGateView.vue` line 47: `"NoteShell"` → `"Noteshell"`
- `apps/web/src/utils/demo.ts` line 4: `"NoteShell"` → `"Noteshell"` (comment)

### Step 6: Visual QA

- Run `pnpm dev`
- Check desktop login screen at `/auth`
- Check mobile breakpoint (< 768px)
- Verify Google OAuth button still works
- Verify sign in / sign up tab switching
- Verify form submission + error display
- Verify "Continue without account" link
- Verify sign up success state

---

## Files to Modify

| File                                  | What Changes                                 |
| ------------------------------------- | -------------------------------------------- |
| `apps/web/src/assets/fonts.css`       | Add Playfair Display import                  |
| `apps/web/src/views/AuthView.vue`     | Full template + CSS redesign (no JS changes) |
| `apps/web/src/views/DemoGateView.vue` | Fix "NoteShell" → "Noteshell"                |
| `apps/web/src/utils/demo.ts`          | Fix "NoteShell" → "Noteshell" in comment     |

## Key Reusable Assets

- Logo SVG: `apps/web/public/logo.svg` — capsule with constellation dots, white fill
- JetBrains Mono: already imported in `apps/web/src/assets/fonts.css`
- Auth store: `apps/web/src/stores/auth.ts` — no changes needed

## Verification

1. `pnpm dev` → navigate to `/auth`
2. Desktop: verify split-screen with constellation bg, serif tagline, amber CTA, logo
3. Mobile (< 768px): verify compact brand header + full auth form
4. Test sign in, sign up, Google OAuth, skip auth, error states
5. `pnpm typecheck && pnpm lint` — ensure no regressions
