# Secretary Layout Redesign + Bug Fixes

**Date:** 2026-02-08

## Context

The AI Secretary dashboard has three issues:

1. **Layout problem** - Today/Tomorrow daily plans are pushed too far down, buried below streak stats and the completion rate chart. The plans are the most important content but require scrolling to reach.
2. **Date bug** - The Completion Rate chart x-axis labels show dates off by 1 day (e.g., "Feb 6" when the data is actually Feb 7) due to UTC timezone parsing.
3. **Missing feedback box** - The `ReflectionSection` (mood + reflection textarea) is gated to evening-only hours (8 PM–4 AM), making it invisible during the day.

## Current Layout (main content, top to bottom)

```
┌─────────────────────────────────────────────────────────────────┐
│  LEFT SIDEBAR (220px)  │  MAIN CONTENT (flex)  │  RIGHT (300px) │
│  Memory File List      │  1. Header/Greeting   │  Today's Focus │
│                        │  2. Active Plans      │  Week Calendar │
│                        │  3. StreakBadge ←────────── BLOCKS     │
│                        │  4. ProgressChart ←──── PLANS FROM     │
│                        │  5. TodayPlan          │  Quick Actions │
│                        │  6. TomorrowPlan       │                │
│                        │  7. Reflection(evening)│                │
└─────────────────────────────────────────────────────────────────┘
```

## Proposed Layout

**Move analytics (StreakBadge + ProgressChart) from main content → right sidebar.** This is the cleanest change — it pushes daily plans to their natural position right after the header, and the analytics serve as reference info that fits well in a sidebar.

```
┌─────────────────────────────────────────────────────────────────┐
│  LEFT SIDEBAR (220px)  │  MAIN CONTENT (flex)  │  RIGHT (300px) │
│  Memory File List      │  1. Header/Greeting   │  Today's Focus │
│                        │  2. Active Plans      │  StreakBadge   │
│                        │  3. TodayPlan  ← UP!  │  ProgressChart │
│                        │  4. TomorrowPlan       │  Week Calendar │
│                        │  5. Reflection(always) │  Quick Actions │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits:**

- Plans are immediately visible after header (no scrolling needed)
- Analytics as sidebar = "glanceable" reference data
- Feedback/reflection always available, not time-gated
- Right sidebar is more useful — it already has Today's Focus and calendar, adding streak/chart makes it a complete "stats panel"

---

## Task Breakdown

### Task 1: Move StreakBadge + ProgressChart to Right Sidebar

**Files to modify:**

- `apps/web/src/components/secretary/SecretaryDashboard.vue` — Remove the `analytics-section` block (StreakBadge + ProgressChart) from the main dashboard template. Remove related imports and computed properties.
- `apps/web/src/components/secretary/SecretaryPanel.vue` — Add StreakBadge + ProgressChart to the right panel. Import the components and the analytics computed values (dailyStats, streak, weeklySummary, hasAnalytics). Insert them between "Today's Focus" and "Week Calendar" sections.

**Changes in SecretaryDashboard.vue:**

- Remove imports: `ProgressChart`, `StreakBadge`, `computeDailyCompletionRates`, `computeStreak`, `computeWeeklySummary`
- Remove computed: `dailyStats`, `streak`, `weeklySummary`, `hasAnalytics`
- Remove template: entire `<div v-if="hasAnalytics" class="analytics-section">` block
- Remove CSS: `.analytics-section` style rules

**Changes in SecretaryPanel.vue:**

- Add imports: `StreakBadge`, `ProgressChart` components
- Add imports: `computeDailyCompletionRates`, `computeStreak`, `computeWeeklySummary` from `@/utils/secretaryAnalytics`
- Add computed: `dailyStats`, `streak`, `weeklySummary`, `hasAnalytics`
- Add template: new `<div v-if="hasAnalytics" class="panel-section analytics-sidebar">` with StreakBadge and ProgressChart
- Position: after Today's Focus, before WeekCalendar
- StreakBadge may need minor style adjustment for 300px width (currently horizontal flex — should still fit but verify)

### Task 2: Fix Completion Rate Chart Date Bug

**File to modify:** `apps/web/src/components/secretary/ProgressChart.vue`

**Root cause:** Line 21-24, `shortDate()` function uses `new Date(dateStr)` which parses "YYYY-MM-DD" as UTC midnight, causing off-by-one in negative UTC offset timezones.

**Fix:** Import and use `parseDateString` from `@inkdown/shared/secretary` (already used elsewhere in the codebase — e.g., `WeekCalendar.vue` line 4, `secretaryAnalytics.ts` line 2).

```typescript
// Before (BROKEN):
function shortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// After (FIXED):
import { parseDateString } from '@inkdown/shared/secretary'

function shortDate(dateStr: string): string {
  const d = parseDateString(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
```

### Task 3: Make Reflection/Feedback Box Always Visible

**Files to modify:**

- `apps/web/src/components/secretary/SecretaryDashboard.vue` — Remove (or change) the `v-if="store.showReflectionSection"` conditional on the `<ReflectionSection>` component so it's always rendered.
- Optionally rename "End-of-Day Reflection" to just "Reflection" or "Daily Feedback" so it makes sense at any time of day.

**Change in SecretaryDashboard.vue line 102:**

```html
<!-- Before -->
<ReflectionSection v-if="store.showReflectionSection" />

<!-- After -->
<ReflectionSection />
```

---

## Design Decisions (Confirmed)

- Feedback box: **Always visible** — remove the evening-only gate entirely
- StreakBadge: **Keep horizontal** layout in the right sidebar at 300px, with tighter spacing

## Verification

1. **Visual check:** Open Secretary view → Daily plans (Today/Tomorrow) should appear immediately after the header and Active Plans, with no analytics blocking them
2. **Right sidebar:** Should show Today's Focus → StreakBadge → ProgressChart → Week Calendar → Quick Actions
3. **Chart dates:** Hover over bars in the Completion Rate chart — the x-axis label and tooltip date should match
4. **Feedback box:** The Reflection section should be visible at any time of day, below the daily plans
5. **Responsive:** StreakBadge and ProgressChart should render correctly at 300px width in the right panel
6. **Build:** Run `pnpm typecheck` and `pnpm build` to verify no type errors
