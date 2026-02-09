/**
 * Demo mode fixture data for the Secretary feature.
 *
 * Exports static MemoryFile[], DailyPlan (today/tomorrow), and
 * LearningRoadmap[] objects that populate the dashboard when the app
 * runs without a backend.
 */

import type {
  DailyPlan,
  LearningRoadmap,
  MemoryFile,
  ScheduledTask,
} from '@inkdown/shared/types'

// =============================================================================
// Helpers
// =============================================================================

const NOW = '2026-02-09T08:00:00.000Z'

function memoryFile(
  id: string,
  filename: string,
  content: string,
): MemoryFile {
  return {
    id,
    userId: 'demo-user',
    filename,
    content,
    updatedAt: NOW,
    createdAt: NOW,
  }
}

function task(
  id: string,
  overrides: Partial<ScheduledTask> & Pick<ScheduledTask, 'title' | 'type' | 'scheduledTime' | 'durationMinutes'>,
): ScheduledTask {
  return {
    id,
    status: 'pending',
    aiGenerated: true,
    ...overrides,
  }
}

// =============================================================================
// Memory file contents (raw markdown)
// =============================================================================

const PLAN_MD = `# Learning Roadmaps

## Reinforcement Learning Fundamentals
| Field | Value |
|-------|-------|
| ID | RL |
| Status | **active** |
| Duration | 4 weeks (Mon / Wed / Fri) |
| Dates | 2026-01-26 → 2026-02-20 |
| Hours / day | 3 |

### Progress
- **Week 2 / 4** — Day 5 of 12
- \`███████░░░░░░░░░░░░░\` 35%

### This Week
- Mon 10 Feb — Policy Gradient Methods (theory + derivation)
- Wed 12 Feb — Implement REINFORCE on CartPole
- Fri 14 Feb — Actor-Critic introduction

### Current Topic
Day 5: Policy Gradient Methods

---

## OpenClaw Gateway Mastery
| Field | Value |
|-------|-------|
| ID | OC |
| Status | **active** |
| Duration | 2 weeks (Tue / Thu) |
| Dates | 2026-02-03 → 2026-02-14 |
| Hours / day | 2 |

### Progress
- **Week 1 / 2** — Day 1 of 4
- \`██░░░░░░░░░░░░░░░░░░\` 10%

### This Week
- Tue 11 Feb — REST API design & rate limiting
- Thu 13 Feb — Auth middleware deep-dive

### Current Topic
Day 1: REST API design & rate limiting
`

const AI_MD = `# Study Preferences

## Focus Hours
- Best concentration window: **09:00 – 12:00**
- Secondary window: **14:00 – 17:00**
- Avoid scheduling deep work after 18:00

## Session Format
- Study interval: **45 minutes**
- Break after every session: **15 minutes**
- Max consecutive sessions before long break: 3

## Learning Style
- Visual learner — prefers diagrams and coding examples over text walls
- Likes to implement concepts immediately after reading theory
- Retains best when writing notes in own words

## Weekly Budget
- Weekdays: up to 5 h study
- Weekends: up to 3 h study (lighter schedule)
`

const TODAY_MD = `# Today's Plan — Sun 09 Feb 2026

## Schedule
| Time | Task | Status |
|------|------|--------|
| 09:00 – 10:30 | RL: Policy Gradient Methods | in_progress |
| 10:30 – 10:45 | Break | pending |
| 10:45 – 12:00 | RL Coding Lab: Implement REINFORCE | pending |
| 12:00 – 13:00 | Lunch | pending |
| 14:00 – 15:30 | OpenClaw: REST API design & rate limiting | pending |
| 15:45 – 17:00 | Read PPO Paper + Notes | pending |

## Notes
- Start RL session by reviewing yesterday's MDP recap
- For OpenClaw, set up local dev environment first
- PPO paper: focus on clipped objective section
`

const TOMORROW_MD = `# Tomorrow's Plan — Mon 10 Feb 2026

## Schedule
| Time | Task | Status |
|------|------|--------|
| 09:00 – 10:30 | RL: Variance Reduction Techniques | pending |
| 10:30 – 10:45 | Break | pending |
| 10:45 – 12:00 | RL Practice: Baseline Comparison Experiments | pending |
| 12:00 – 13:00 | Lunch | pending |
| 14:00 – 15:00 | Review RL Week 2 Progress | pending |
| 15:15 – 16:30 | OpenClaw: Auth Middleware Deep-Dive | pending |

## Notes
- Variance reduction: cover control variates and advantage functions
- Baseline experiments: compare REINFORCE with / without baseline on CartPole
- OpenClaw auth: JWT validation, role scoping, token refresh flow
`

const CARRYOVER_MD = `# Carryover — Sat 08 Feb 2026

## Incomplete Tasks
- [ ] Finish MDP value iteration coding exercise (RL Day 4)
- [ ] Review OpenClaw installation notes

## Reason
Saturday was a lighter schedule day. MDP coding exercise took longer than expected — the convergence threshold needed tuning. Deferred to Sunday session.

## Action
- MDP exercise rolled into today's first study block
- OpenClaw notes review merged into tomorrow's session
`

// =============================================================================
// Exports — Memory Files
// =============================================================================

export const DEMO_MEMORY_FILES: MemoryFile[] = [
  memoryFile('mem-plan', 'Plan.md', PLAN_MD),
  memoryFile('mem-ai', 'AI.md', AI_MD),
  memoryFile('mem-carryover', 'Carryover.md', CARRYOVER_MD),
  memoryFile('mem-today', 'Today.md', TODAY_MD),
  memoryFile('mem-tomorrow', 'Tomorrow.md', TOMORROW_MD),
]

// =============================================================================
// Exports — Active Roadmaps
// =============================================================================

export const DEMO_ACTIVE_PLANS: LearningRoadmap[] = [
  {
    id: 'RL',
    name: 'Reinforcement Learning Fundamentals',
    status: 'active',
    dateRange: { start: '2026-01-26', end: '2026-02-20' },
    schedule: {
      hoursPerDay: 3,
      studyDays: ['Mon', 'Wed', 'Fri'],
    },
    progress: {
      currentWeek: 2,
      totalWeeks: 4,
      currentDay: 5,
      totalDays: 12,
      percentComplete: 35,
    },
    currentTopic: 'Day 5: Policy Gradient Methods',
    archiveFilename: 'Plans/rl-fundamentals.md',
  },
  {
    id: 'OC',
    name: 'OpenClaw Gateway Mastery',
    status: 'active',
    dateRange: { start: '2026-02-03', end: '2026-02-14' },
    schedule: {
      hoursPerDay: 2,
      studyDays: ['Tue', 'Thu'],
    },
    progress: {
      currentWeek: 1,
      totalWeeks: 2,
      currentDay: 1,
      totalDays: 4,
      percentComplete: 10,
    },
    currentTopic: 'Day 1: REST API design & rate limiting',
    archiveFilename: 'Plans/openclaw-gateway.md',
  },
]

// =============================================================================
// Exports — Today's Plan
// =============================================================================

export const DEMO_TODAY_PLAN: DailyPlan = {
  id: 'dp-today',
  date: '2026-02-09',
  tasks: [
    task('t1', {
      title: 'RL: Policy Gradient Methods',
      type: 'learn',
      status: 'in_progress',
      scheduledTime: '09:00',
      durationMinutes: 90,
      planId: 'RL',
      aiReason: 'Week 2 schedule — policy gradient theory block',
    }),
    task('t2', {
      title: 'Break',
      type: 'break',
      scheduledTime: '10:30',
      durationMinutes: 15,
    }),
    task('t3', {
      title: 'RL Coding Lab: Implement REINFORCE',
      type: 'practice',
      scheduledTime: '10:45',
      durationMinutes: 75,
      planId: 'RL',
      aiReason: 'Hands-on implementation follows theory session',
    }),
    task('t4', {
      title: 'Lunch',
      type: 'break',
      scheduledTime: '12:00',
      durationMinutes: 60,
    }),
    task('t5', {
      title: 'OpenClaw: REST API design & rate limiting',
      type: 'learn',
      scheduledTime: '14:00',
      durationMinutes: 90,
      planId: 'OC',
      aiReason: 'OpenClaw Week 1 — introductory API design session',
    }),
    task('t6', {
      title: 'Read PPO Paper + Notes',
      type: 'review',
      scheduledTime: '15:45',
      durationMinutes: 75,
      planId: 'RL',
      aiReason: 'Prereading for upcoming actor-critic topic',
    }),
  ],
  createdAt: NOW,
  updatedAt: NOW,
  isApproved: true,
  aiGeneratedAt: NOW,
  userModified: false,
  totalMinutes: 405,
  completedMinutes: 0,
}

// =============================================================================
// Exports — Tomorrow's Plan
// =============================================================================

export const DEMO_TOMORROW_PLAN: DailyPlan = {
  id: 'dp-tomorrow',
  date: '2026-02-10',
  tasks: [
    task('tm1', {
      title: 'RL: Variance Reduction Techniques',
      type: 'learn',
      scheduledTime: '09:00',
      durationMinutes: 90,
      planId: 'RL',
      aiReason: 'Continues policy gradient series — variance reduction',
    }),
    task('tm2', {
      title: 'Break',
      type: 'break',
      scheduledTime: '10:30',
      durationMinutes: 15,
    }),
    task('tm3', {
      title: 'RL Practice: Baseline Comparison Experiments',
      type: 'practice',
      scheduledTime: '10:45',
      durationMinutes: 75,
      planId: 'RL',
      aiReason: 'Compare REINFORCE with/without baseline on CartPole',
    }),
    task('tm4', {
      title: 'Lunch',
      type: 'break',
      scheduledTime: '12:00',
      durationMinutes: 60,
    }),
    task('tm5', {
      title: 'Review RL Week 2 Progress',
      type: 'review',
      scheduledTime: '14:00',
      durationMinutes: 60,
      planId: 'RL',
      aiReason: 'Mid-week checkpoint before Friday session',
    }),
    task('tm6', {
      title: 'OpenClaw: Auth Middleware Deep-Dive',
      type: 'learn',
      scheduledTime: '15:15',
      durationMinutes: 75,
      planId: 'OC',
      aiReason: 'OpenClaw Week 1 — auth layer follows API design',
    }),
  ],
  createdAt: NOW,
  updatedAt: NOW,
  isApproved: false,
  aiGeneratedAt: NOW,
  userModified: false,
  totalMinutes: 375,
  completedMinutes: 0,
}
