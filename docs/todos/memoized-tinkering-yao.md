# 2026-02-08 Move Modules Panel to Left Sidebar

## Context

The CourseView currently has the modules panel on the **right** sidebar. The user wants it moved to the **left** sidebar, matching the exact layout pattern of the normal note editor (`EditorView.vue`). This means:

- Left sidebar shows CourseNav (modules list) below the dock nav
- The dock nav's PanelLeft toggle controls the modules sidebar open/closed
- When sidebar is open: dock renders inline (no border)
- When sidebar is closed: dock renders in pill mode (frosted glass border box)
- No right sidebar at all anymore

## Reference: EditorView Layout Pattern

```
.editor-view (flex row)
  .left-area (flex column, flex:1)
    header.editor-header (:style="sidebarWidthStyle")
      .dock-area (width: var(--sidebar-width, 260px))
        NavigationDock :pill-mode="!layoutStore.sidebarVisible"
      .tabs-bar (flex:1)
    .editor-body (flex row)
      SideBar v-if="layoutStore.sidebarVisible"
      main.main-content (padding: 0 16px 16px 16px)
        .note-container (border-radius: 16px)
```

Key details from EditorView:
- Uses `layoutStore.sidebarVisible` (not a local ref)
- `dock-area` width matches sidebar via CSS variable `--sidebar-width`
- `NavigationDock` gets `:pill-mode="!layoutStore.sidebarVisible"`
- `SideBar` conditionally rendered with `v-if`
- CSS variable injected via `:style="sidebarWidthStyle"` computed

## Changes

### 1. Restructure CourseView template & script

**File:** `apps/web/src/views/CourseView.vue`

**Script changes:**
- Import `useLayoutStore` from `@/stores`
- Add `const layoutStore = useLayoutStore()`
- Add `sidebarWidthStyle` computed (same as EditorView): `{ '--sidebar-width': layoutStore.sidebarWidth + 'px' }`
- Remove `store.sidebarOpen` usage (use `layoutStore.sidebarVisible` instead)

**Template restructure** — match EditorView's hierarchy:

```html
<div class="course-view">
  <!-- Header: Dock + Course Info (full width) -->
  <header class="course-top-bar" :style="sidebarWidthStyle">
    <div class="dock-area">
      <NavigationDock :pill-mode="!layoutStore.sidebarVisible" />
    </div>
    <!-- back-btn + top-bar-info stay the same, fill remaining space -->
  </header>

  <!-- Loading state (same as before) -->

  <!-- Body: Sidebar + Content side by side -->
  <div v-else class="course-body">
    <!-- Left Sidebar: Modules -->
    <aside v-if="layoutStore.sidebarVisible" class="course-sidebar">
      <CourseNav ... />
    </aside>

    <!-- Main Content: Rounded card -->
    <div class="course-main">
      <div class="content-scroll">
        <div class="content-inner">
          <!-- lesson-info-bar + LessonContent (unchanged) -->
        </div>
      </div>
    </div>
  </div>
</div>
```

**CSS changes:**
- `.course-top-bar` — keep as-is but remove fixed dock-area width
- `.dock-area` — `width: var(--sidebar-width, 260px)`, `transition: width 0.25s ease` (matches EditorView)
- `.course-body` — replaces `.course-layout`, same as `.editor-body` (flex row)
- `.course-sidebar` — new class, matches SideBar sizing: `width: var(--sidebar-width, 260px)`, `background: var(--sidebar-bg, #010409)`, `overflow-y: auto`, `flex-shrink: 0`
- `.course-main` — keep existing padding + rounded card styles
- Remove `.course-sidebar-right` entirely

### 2. CourseNav remove fixed width assumption

**File:** `apps/web/src/components/course/viewer/CourseNav.vue`

- `.course-nav` already has `height: 100%` and `background: var(--app-bg)` — change to `var(--sidebar-bg, #010409)` to match the editor sidebar
- No structural changes needed; it fills its parent container

### 3. Store cleanup

**File:** `apps/web/src/stores/course.ts`

- Remove `sidebarOpen` ref (line 40) and its export (line 483) — no longer used; sidebar state is now controlled by `layoutStore.sidebarVisible`

## Files Modified

| File | Summary |
|------|---------|
| `apps/web/src/views/CourseView.vue` | Restructure: modules to left sidebar, use layoutStore, pill-mode dock, remove right sidebar |
| `apps/web/src/components/course/viewer/CourseNav.vue` | Use `--sidebar-bg` for background consistency |
| `apps/web/src/stores/course.ts` | Remove dead `sidebarOpen` ref |

## Verification

1. Open a course — modules panel should appear on the **left** below the dock
2. Click PanelLeft toggle — modules sidebar hides, dock switches to pill mode (frosted glass border box)
3. Click PanelLeft again — sidebar reappears, dock goes back to inline (no border)
4. Content area stays as a rounded card in the center
5. No right sidebar visible
6. `pnpm typecheck` and `pnpm lint` pass
