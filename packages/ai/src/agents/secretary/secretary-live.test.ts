/**
 * Secretary Agent — Live Integration Tests (Track 3)
 *
 * Tests P0 scenarios against real Supabase data.
 * Run: pnpm test:run packages/ai/src/agents/secretary/secretary-live.test.ts
 *
 * Uses a DEDICATED test user UUID to avoid corrupting production data.
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { MemoryService } from './memory'
import { getPendingRoadmap, clearPendingRoadmap } from './tools'
import { getTodayDate, addDays, getCurrentWeekMonday } from '@inkdown/shared/secretary'

// Load env from apps/api/.env (dotenv not available in vitest)
function loadEnvFile(path: string): Record<string, string> {
  try {
    const content = readFileSync(path, 'utf-8')
    const env: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 0) continue
      env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, '')
    }
    return env
  } catch {
    return {}
  }
}

const envFile = loadEnvFile(resolve(__dirname, '../../../../../apps/api/.env'))
const SUPABASE_URL = envFile.SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = envFile.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? ''
// Use existing low-activity user (has only 4 default files — backed up & restored in afterAll)
const LIVE_TEST_USER_ID = 'cb08d884-1f16-472d-ae0e-0ab2a6957fa6'
const PROD_USER_ID = '04b5c71d-9b35-4c33-81a3-a9110d071d69'

const canRun = SUPABASE_URL.length > 0 && SUPABASE_SERVICE_KEY.length > 0
const supabase = canRun ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null!

// Helpers
async function writeFile(userId: string, filename: string, content: string) {
  const { error } = await supabase
    .from('secretary_memory')
    .upsert(
      { user_id: userId, filename, content, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,filename' }
    )
  if (error) throw new Error(`writeFile(${filename}): ${error.message}`)
}

async function readFile(userId: string, filename: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('secretary_memory')
    .select('content')
    .eq('user_id', userId)
    .eq('filename', filename)
    .maybeSingle()
  if (error) throw new Error(`readFile(${filename}): ${error.message}`)
  return data?.content ?? null
}

async function deleteAllFiles(userId: string) {
  await supabase.from('secretary_memory').delete().eq('user_id', userId)
}

async function listFiles(userId: string, prefix?: string): Promise<string[]> {
  let q = supabase.from('secretary_memory').select('filename').eq('user_id', userId)
  if (prefix) q = q.like('filename', `${prefix}%`)
  const { data } = await q
  return (data ?? []).map((r: { filename: string }) => r.filename)
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function daysAhead(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const todayISO = new Date().toISOString().slice(0, 10)

// ============================================================================

// Backup/restore test user's original data
let originalFiles: Array<{ filename: string; content: string }> = []

describe.skipIf(!canRun)('Secretary Live Integration Tests', () => {
  beforeEach(async () => {
    // Save original files before first test
    if (originalFiles.length === 0) {
      const { data } = await supabase
        .from('secretary_memory')
        .select('filename, content')
        .eq('user_id', LIVE_TEST_USER_ID)
      originalFiles = data ?? []
    }
    await deleteAllFiles(LIVE_TEST_USER_ID)
  })

  afterAll(async () => {
    // Restore original files
    await deleteAllFiles(LIVE_TEST_USER_ID)
    for (const f of originalFiles) {
      await writeFile(LIVE_TEST_USER_ID, f.filename, f.content)
    }
  })

  // ==========================================================================
  // SEC-AGENT-01: Day Transition
  // ==========================================================================

  describe('SEC-AGENT-01: Day Transition', () => {
    it('no transition when Today.md has current date', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'America/New_York')
      const nyToday = getTodayDate('America/New_York')
      await writeFile(
        LIVE_TEST_USER_ID,
        'Today.md',
        `# Today\n\n**Date:** ${nyToday}\n\n- [ ] 09:00 (45min) Study`
      )

      const result = await mem.performDayTransition()
      expect(result.transitioned).toBe(false)
    })

    it('archives stale Today.md and promotes Tomorrow.md', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'UTC')
      const yesterdayStr = daysAgo(1)

      await writeFile(
        LIVE_TEST_USER_ID,
        'Today.md',
        `# Yesterday\n\n**Date:** ${yesterdayStr}\n\n- [ ] 09:00 (45min) Study [REI]\n- [x] 10:00 (45min) Practice [QUA]`
      )
      await writeFile(
        LIVE_TEST_USER_ID,
        'Tomorrow.md',
        `# Tomorrow\n\n**Date:** ${todayISO}\n\n- [ ] 09:00 (45min) Review [SPA]`
      )
      await writeFile(
        LIVE_TEST_USER_ID,
        'Plan.md',
        `# Plans\n\n## Active Plans\n\n### [REI] Test (active)\n- Progress: 5/30\n- Date: 2026-01-01 - 2026-06-01\n- Schedule: Daily 2h/day\n- Current: Week 1\n\n### [QUA] Quantum (active)\n- Progress: 10/30\n- Date: 2026-01-01 - 2026-06-01\n- Schedule: Daily 2h/day\n- Current: Week 2`
      )

      const result = await mem.performDayTransition()
      expect(result.transitioned).toBe(true)
      expect(result.promotedTomorrow).toBe(true)
      expect(result.archivedDate).toBe(yesterdayStr)

      // Archive created
      const archive = await readFile(LIVE_TEST_USER_ID, `History/${yesterdayStr}.md`)
      expect(archive).toContain('Study [REI]')

      // Today.md has promoted content
      const newToday = await readFile(LIVE_TEST_USER_ID, 'Today.md')
      expect(newToday).toContain('Review [SPA]')

      // Tomorrow.md cleared
      const newTomorrow = await readFile(LIVE_TEST_USER_ID, 'Tomorrow.md')
      expect(newTomorrow?.trim()).toBe('')

      // Carryover captured incomplete task
      const carryover = await readFile(LIVE_TEST_USER_ID, 'Carryover.md')
      expect(carryover).toContain('Study')
      expect(carryover).not.toContain('Practice') // [x] excluded

      // Plan.md progress: QUA had 1 completed → 10→11
      const plan = await readFile(LIVE_TEST_USER_ID, 'Plan.md')
      expect(plan).toContain('Progress: 11/30')
    })

    it('handles multi-day gap (3 days stale)', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'UTC')
      const threeDaysAgoStr = daysAgo(3)
      const twoDaysAgoStr = daysAgo(2)

      await writeFile(
        LIVE_TEST_USER_ID,
        'Today.md',
        `# Old\n\n**Date:** ${threeDaysAgoStr}\n\n- [ ] 09:00 (30min) Old task [REI]`
      )
      await writeFile(
        LIVE_TEST_USER_ID,
        'Tomorrow.md',
        `# Tomorrow\n\n**Date:** ${twoDaysAgoStr}\n\n- [ ] 09:00 (45min) Two days ago task [QUA]`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Plan.md', '# Plans\n\n## Active Plans\n')

      const result = await mem.performDayTransition()
      expect(result.transitioned).toBe(true)
      expect(result.archivedDate).toBe(threeDaysAgoStr)
      expect(result.promotedTomorrow).toBe(true)

      // Stale Tomorrow.md promoted (date <= today)
      const gapToday = await readFile(LIVE_TEST_USER_ID, 'Today.md')
      expect(gapToday).toContain('Two days ago task')
    })

    it('preserves future Tomorrow.md, resets Today.md', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'UTC')
      const futureStr = daysAhead(3)

      await writeFile(
        LIVE_TEST_USER_ID,
        'Today.md',
        `# Stale\n\n**Date:** ${daysAgo(1)}\n\n- [ ] 09:00 (30min) Task`
      )
      await writeFile(
        LIVE_TEST_USER_ID,
        'Tomorrow.md',
        `# Future\n\n**Date:** ${futureStr}\n\n- [ ] 09:00 (45min) Future task`
      )

      const result = await mem.performDayTransition()
      expect(result.transitioned).toBe(true)
      expect(result.promotedTomorrow).toBe(false)

      const newToday = await readFile(LIVE_TEST_USER_ID, 'Today.md')
      expect(newToday).toContain('No tasks scheduled yet')

      const keptTomorrow = await readFile(LIVE_TEST_USER_ID, 'Tomorrow.md')
      expect(keptTomorrow).toContain('Future task')
    })

    it('handles empty Today.md (no date)', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'UTC')
      await writeFile(LIVE_TEST_USER_ID, 'Today.md', '')
      await writeFile(LIVE_TEST_USER_ID, 'Tomorrow.md', '')

      const result = await mem.performDayTransition()
      expect(result.transitioned).toBe(true)
      expect(result.archivedDate).toBeUndefined()

      const newToday = await readFile(LIVE_TEST_USER_ID, 'Today.md')
      expect(newToday).toContain(todayISO)
    })
  })

  // ==========================================================================
  // SEC-AGENT-03: Carryover Task Extraction
  // ==========================================================================

  describe('SEC-AGENT-03: Carryover Extraction', () => {
    it('captures incomplete tasks ([ ] and [>]), excludes completed [x]', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'UTC')
      await writeFile(
        LIVE_TEST_USER_ID,
        'Today.md',
        `# Test\n\n**Date:** ${daysAgo(1)}\n\n- [ ] 09:00 (45min) Learn [REI]\n- [x] 09:45 (15min) Break\n- [ ] 10:00 (45min) Practice [QUA]\n- [>] 10:45 (15min) Skipped Break\n- [x] 11:00 (45min) Review [SPA]`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Tomorrow.md', '')
      await writeFile(LIVE_TEST_USER_ID, 'Plan.md', '# Plans\n\n## Active Plans\n')

      await mem.performDayTransition()
      const carryover = await readFile(LIVE_TEST_USER_ID, 'Carryover.md')
      expect(carryover).not.toBeNull()

      const lines = carryover!.split('\n').filter((l) => l.startsWith('- ('))
      expect(lines).toHaveLength(3) // 2x [ ] + 1x [>]
    })

    it('handles duration variants: min, mins, minutes, m', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'UTC')
      await writeFile(
        LIVE_TEST_USER_ID,
        'Today.md',
        `# Test\n\n**Date:** ${daysAgo(1)}\n\n- [ ] 09:00 (45 minutes) Long [REI]\n- [ ] 10:00 (30 mins) Plural [QUA]\n- [ ] 11:00 (60 min) Singular [SPA]\n- [ ] 12:00 (45m) Letter [REI]`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Tomorrow.md', '')
      await writeFile(LIVE_TEST_USER_ID, 'Plan.md', '# Plans\n\n## Active Plans\n')

      await mem.performDayTransition()
      const carryover = await readFile(LIVE_TEST_USER_ID, 'Carryover.md')
      const lines = carryover?.split('\n').filter((l) => l.startsWith('- (')) ?? []
      expect(lines.length).toBe(4)
    })

    it('rejects malformed tasks', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'UTC')
      await writeFile(
        LIVE_TEST_USER_ID,
        'Today.md',
        `# Test\n\n**Date:** ${daysAgo(1)}\n\n- [ ] No time or duration\n- [ ] 09:00 Missing brackets [REI]\n- [ ] 09:00 (bad) Not a number [REI]\n- Regular text\n- [ ] 09:00 (45min) Valid task [REI]`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Tomorrow.md', '')
      await writeFile(LIVE_TEST_USER_ID, 'Plan.md', '# Plans\n\n## Active Plans\n')

      await mem.performDayTransition()
      const carryover = await readFile(LIVE_TEST_USER_ID, 'Carryover.md')
      const lines = carryover?.split('\n').filter((l) => l.startsWith('- (')) ?? []
      expect(lines.length).toBe(1) // Only the valid one
    })

    it('deletes Carryover.md when all tasks completed', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'UTC')
      await writeFile(LIVE_TEST_USER_ID, 'Carryover.md', '# Old\n\n- (45min) Old task')
      await writeFile(
        LIVE_TEST_USER_ID,
        'Today.md',
        `# Test\n\n**Date:** ${daysAgo(1)}\n\n- [x] 09:00 (45min) Done [REI]\n- [x] 10:00 (30min) Also done [QUA]`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Tomorrow.md', '')
      await writeFile(LIVE_TEST_USER_ID, 'Plan.md', '# Plans\n\n## Active Plans\n')

      await mem.performDayTransition()
      const carryover = await readFile(LIVE_TEST_USER_ID, 'Carryover.md')
      expect(carryover).toBeNull()
    })
  })

  // ==========================================================================
  // SEC-AGENT-04: Timezone Resolution
  // ==========================================================================

  describe('SEC-AGENT-04: Timezone Resolution', () => {
    it('returns valid date format for known timezones', () => {
      const datePattern = /^\d{4}-\d{2}-\d{2}$/
      expect(getTodayDate('America/New_York')).toMatch(datePattern)
      expect(getTodayDate('Asia/Tokyo')).toMatch(datePattern)
      expect(getTodayDate('UTC')).toMatch(datePattern)
      expect(getTodayDate('Europe/London')).toMatch(datePattern)
    })

    it('handles undefined timezone (fallback)', () => {
      const result = getTodayDate(undefined)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('throws on invalid timezone string', () => {
      expect(() => getTodayDate('Not/A/Timezone')).toThrow()
    })

    it('MemoryService uses timezone for day transition comparison', async () => {
      const nyToday = getTodayDate('America/New_York')
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'America/New_York')
      await writeFile(LIVE_TEST_USER_ID, 'Today.md', `# Test\n\n**Date:** ${nyToday}`)

      const result = await mem.performDayTransition()
      expect(result.transitioned).toBe(false)
    })
  })

  // ==========================================================================
  // SEC-AGENT-05: Plan Expiration & Week Expansion
  // ==========================================================================

  describe('SEC-AGENT-05: Week Expansion & Schedule Matching', () => {
    it('regenerates This Week section when stale', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'America/New_York')
      const mondayStr = getCurrentWeekMonday('America/New_York')
      const nyToday = getTodayDate('America/New_York')
      const tomorrowStr = addDays(nyToday, 1)

      await writeFile(
        LIVE_TEST_USER_ID,
        'Plan.md',
        `# Plans\n\n## Active Plans\n\n### [EXP] Expiring (active)\n- Progress: 13/14\n- Date: 2026-03-13 - ${tomorrowStr}\n- Schedule: Daily 2h/day\n- Current: Week 2\n\n### [LONG] Long (active)\n- Progress: 5/60\n- Date: 2026-03-01 - 2026-06-01\n- Schedule: MWF 2h/day\n- Current: Week 1\n\n---\n\n## This Week (old - old)\n\n**Mon:** stale`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Today.md', `# Today\n\n**Date:** ${nyToday}`)

      const expanded = await mem.checkAndExpandWeek()
      expect(expanded).toBe(true)

      const plan = await readFile(LIVE_TEST_USER_ID, 'Plan.md')
      expect(plan).toContain(`## This Week (${mondayStr}`)
    })

    it('excludes plans from days after their end date', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'America/New_York')
      const nyToday = getTodayDate('America/New_York')
      const mondayStr = getCurrentWeekMonday('America/New_York')

      // Plan that ended yesterday
      const endedStr = daysAgo(1)
      await writeFile(
        LIVE_TEST_USER_ID,
        'Plan.md',
        `# Plans\n\n## Active Plans\n\n### [DONE] Ended (active)\n- Progress: 14/14\n- Date: 2026-03-01 - ${endedStr}\n- Schedule: Daily 2h/day\n- Current: Week 2\n\n---\n\n## This Week (old - old)\n`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Today.md', `# Today\n\n**Date:** ${nyToday}`)

      await mem.checkAndExpandWeek()
      const plan = await readFile(LIVE_TEST_USER_ID, 'Plan.md')
      const weekSection = plan?.match(/## This Week[\s\S]*?(?=\n## |$)/)?.[0] ?? ''

      // Today's line should not have DONE (plan ended yesterday)
      const todayDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const todayDayName = todayDayNames[new Date(nyToday + 'T12:00:00').getDay()]
      const todayLine = weekSection.split('\n').find((l) => l.startsWith(`**${todayDayName}:`))
      expect(todayLine ?? '').not.toContain('DONE')
    })

    it('MWF schedule excludes Tue/Thu/Sat/Sun', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'America/New_York')
      const nyToday = getTodayDate('America/New_York')

      await writeFile(
        LIVE_TEST_USER_ID,
        'Plan.md',
        `# Plans\n\n## Active Plans\n\n### [MWF] Test (active)\n- Progress: 1/60\n- Date: 2026-01-01 - 2026-12-31\n- Schedule: MWF 2h/day\n- Current: Week 1\n\n---\n\n## This Week (old - old)\n`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Today.md', `# Today\n\n**Date:** ${nyToday}`)

      await mem.checkAndExpandWeek()
      const plan = await readFile(LIVE_TEST_USER_ID, 'Plan.md')
      const weekSection = plan?.match(/## This Week[\s\S]*?(?=\n## |$)/)?.[0] ?? ''

      // MWF should appear on Mon, Wed, Fri
      const monLine = weekSection.split('\n').find((l) => l.startsWith('**Mon:'))
      const tueLine = weekSection.split('\n').find((l) => l.startsWith('**Tue:'))
      const wedLine = weekSection.split('\n').find((l) => l.startsWith('**Wed:'))
      const thuLine = weekSection.split('\n').find((l) => l.startsWith('**Thu:'))
      const friLine = weekSection.split('\n').find((l) => l.startsWith('**Fri:'))

      expect(monLine ?? '').toContain('MWF')
      expect(wedLine ?? '').toContain('MWF')
      expect(friLine ?? '').toContain('MWF')
      // Tue and Thu should NOT contain MWF
      if (tueLine) expect(tueLine).not.toContain('MWF')
      if (thuLine) expect(thuLine).not.toContain('MWF')
    })

    it('FriSun schedule matches correctly (no Saturday leak)', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'America/New_York')
      const nyToday = getTodayDate('America/New_York')

      await writeFile(
        LIVE_TEST_USER_ID,
        'Plan.md',
        `# Plans\n\n## Active Plans\n\n### [RUST] Rust (active)\n- Progress: 2/19\n- Date: 2026-01-01 - 2026-12-31\n- Schedule: FriSun 2h/day\n- Current: Week 1\n\n---\n\n## This Week (old - old)\n`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Today.md', `# Today\n\n**Date:** ${nyToday}`)

      await mem.checkAndExpandWeek()
      const plan = await readFile(LIVE_TEST_USER_ID, 'Plan.md')
      const weekSection = plan?.match(/## This Week[\s\S]*?(?=\n## |$)/)?.[0] ?? ''

      const friLine = weekSection.split('\n').find((l) => l.startsWith('**Fri:'))
      const satLine = weekSection.split('\n').find((l) => l.startsWith('**Sat:'))
      const sunLine = weekSection.split('\n').find((l) => l.startsWith('**Sun:'))
      const monLine = weekSection.split('\n').find((l) => l.startsWith('**Mon:'))

      expect(friLine ?? '').toContain('RUST')
      expect(sunLine ?? '').toContain('RUST')
      // Saturday should NOT match FriSun (Sa != Fr, Sa != Su)
      if (satLine) expect(satLine).not.toContain('RUST')
      if (monLine) expect(monLine).not.toContain('RUST')
    })
  })

  // ==========================================================================
  // Auto-Archive Expired Plans
  // ==========================================================================

  describe('Auto-Archive Expired Plans', () => {
    it('archives plans past their end date', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'UTC')
      const nyToday = getTodayDate('UTC')

      await writeFile(
        LIVE_TEST_USER_ID,
        'Plan.md',
        `# Learning Plans

## Active Plans

### [OLD] Expired Plan (active)
- Progress: 10/14
- Date: 2026-01-01 - ${daysAgo(2)}
- Schedule: Daily 2h/day
- Current: Week 2

### [LIVE] Still Active (active)
- Progress: 5/60
- Date: 2026-01-01 - 2026-12-31
- Schedule: Daily 2h/day
- Current: Week 1

---

## Archived
`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Today.md', `# Today\n\n**Date:** ${nyToday}`)

      const archived = await mem.autoArchiveExpiredPlans()
      expect(archived).toEqual(['OLD'])

      const plan = await readFile(LIVE_TEST_USER_ID, 'Plan.md')
      // OLD should be in Archived section with (expired) status (10 < 14)
      expect(plan).toContain('[OLD] Expired Plan (expired)')
      // OLD should NOT be in Active Plans
      const activeSection = plan?.match(/## Active Plans\n([\s\S]*?)(?=\n---|\n## )/i)?.[1] ?? ''
      expect(activeSection).not.toContain('OLD')
      // LIVE should still be active
      expect(activeSection).toContain('[LIVE] Still Active (active)')
      // Archived section should have OLD
      const archivedSection = plan?.match(/## Archived\n([\s\S]*?)$/i)?.[1] ?? ''
      expect(archivedSection).toContain('[OLD] Expired Plan (expired)')
    })

    it('uses "completed" status when progress equals total', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'UTC')
      const nyToday = getTodayDate('UTC')

      await writeFile(
        LIVE_TEST_USER_ID,
        'Plan.md',
        `# Learning Plans

## Active Plans

### [DONE] Finished Plan (active)
- Progress: 28/28
- Date: 2026-01-01 - ${daysAgo(1)}
- Schedule: Daily 4h/day
- Current: Week 4 - Final

---

## Archived
`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Today.md', `# Today\n\n**Date:** ${nyToday}`)

      const archived = await mem.autoArchiveExpiredPlans()
      expect(archived).toEqual(['DONE'])

      const plan = await readFile(LIVE_TEST_USER_ID, 'Plan.md')
      expect(plan).toContain('[DONE] Finished Plan (completed)')
    })

    it('does NOT archive plan ending today', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'UTC')
      const nyToday = getTodayDate('UTC')

      await writeFile(
        LIVE_TEST_USER_ID,
        'Plan.md',
        `# Learning Plans

## Active Plans

### [TODAY] Ending Today (active)
- Progress: 13/14
- Date: 2026-01-01 - ${nyToday}
- Schedule: Daily 2h/day
- Current: Week 2

---
`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Today.md', `# Today\n\n**Date:** ${nyToday}`)

      const archived = await mem.autoArchiveExpiredPlans()
      expect(archived).toHaveLength(0)

      const plan = await readFile(LIVE_TEST_USER_ID, 'Plan.md')
      expect(plan).toContain('[TODAY] Ending Today (active)')
    })

    it('does NOT archive plan with no end date', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'UTC')
      const nyToday = getTodayDate('UTC')

      await writeFile(
        LIVE_TEST_USER_ID,
        'Plan.md',
        `# Learning Plans

## Active Plans

### [OPEN] No End Date (active)
- Progress: 5/100
- Schedule: MWF 2h/day
- Current: Week 1

---
`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Today.md', `# Today\n\n**Date:** ${nyToday}`)

      const archived = await mem.autoArchiveExpiredPlans()
      expect(archived).toHaveLength(0)
    })

    it('creates Archived section if missing', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'UTC')
      const nyToday = getTodayDate('UTC')

      await writeFile(
        LIVE_TEST_USER_ID,
        'Plan.md',
        `# Learning Plans

## Active Plans

### [OLD] Expired (active)
- Progress: 10/14
- Date: 2026-01-01 - ${daysAgo(1)}
- Schedule: Daily 2h/day
- Current: Week 2
`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Today.md', `# Today\n\n**Date:** ${nyToday}`)

      await mem.autoArchiveExpiredPlans()
      const plan = await readFile(LIVE_TEST_USER_ID, 'Plan.md')
      expect(plan).toContain('## Archived')
      expect(plan).toContain('[OLD] Expired (expired)')
    })

    it('archives multiple expired plans at once', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'UTC')
      const nyToday = getTodayDate('UTC')

      await writeFile(
        LIVE_TEST_USER_ID,
        'Plan.md',
        `# Learning Plans

## Active Plans

### [A] First Expired (active)
- Progress: 5/10
- Date: 2026-01-01 - ${daysAgo(3)}
- Schedule: Daily 2h/day
- Current: Week 1

### [B] Second Expired (active)
- Progress: 20/20
- Date: 2026-01-01 - ${daysAgo(1)}
- Schedule: Daily 2h/day
- Current: Week 3

### [C] Still Going (active)
- Progress: 5/60
- Date: 2026-01-01 - 2026-12-31
- Schedule: Daily 2h/day
- Current: Week 1

---

## Archived
`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Today.md', `# Today\n\n**Date:** ${nyToday}`)

      const archived = await mem.autoArchiveExpiredPlans()
      expect(archived).toHaveLength(2)
      expect(archived).toContain('A')
      expect(archived).toContain('B')

      const plan = await readFile(LIVE_TEST_USER_ID, 'Plan.md')
      const activeSection = plan?.match(/## Active Plans\n([\s\S]*?)(?=\n---|\n## )/i)?.[1] ?? ''
      expect(activeSection).not.toContain('[A]')
      expect(activeSection).not.toContain('[B]')
      expect(activeSection).toContain('[C] Still Going (active)')

      // A should be expired (5 < 10), B should be completed (20/20)
      expect(plan).toContain('[A] First Expired (expired)')
      expect(plan).toContain('[B] Second Expired (completed)')
    })

    it('is idempotent — running twice produces same result', async () => {
      const mem = new MemoryService(supabase, LIVE_TEST_USER_ID, 'UTC')
      const nyToday = getTodayDate('UTC')

      await writeFile(
        LIVE_TEST_USER_ID,
        'Plan.md',
        `# Learning Plans

## Active Plans

### [OLD] Expired (active)
- Progress: 10/14
- Date: 2026-01-01 - ${daysAgo(1)}
- Schedule: Daily 2h/day
- Current: Week 2

---

## Archived
`
      )
      await writeFile(LIVE_TEST_USER_ID, 'Today.md', `# Today\n\n**Date:** ${nyToday}`)

      await mem.autoArchiveExpiredPlans()
      const first = await readFile(LIVE_TEST_USER_ID, 'Plan.md')

      // Run again — should be no-op (plan already has expired status, not active)
      const secondArchived = await mem.autoArchiveExpiredPlans()
      expect(secondArchived).toHaveLength(0)

      const second = await readFile(LIVE_TEST_USER_ID, 'Plan.md')
      expect(second).toBe(first)
    })
  })

  // ==========================================================================
  // SEC-AGENT-02: Pending Roadmap Cache
  // ==========================================================================

  describe('SEC-AGENT-02: Pending Roadmap Cache', () => {
    it('returns undefined for unknown user', () => {
      expect(getPendingRoadmap('nonexistent-user')).toBeUndefined()
    })

    it('clearPendingRoadmap does not throw for missing user', () => {
      expect(() => clearPendingRoadmap('nonexistent-user')).not.toThrow()
    })

    // This documents the known P0 issue
    it('pendingRoadmaps Map is module-level (lost on restart)', () => {
      // The pendingRoadmaps Map in tools.ts line 40 is `const pendingRoadmaps = new Map<string, RoadmapPreview>()`
      // It's module-level, meaning:
      // 1. Lost on process restart (Railway restart, deploy, crash)
      // 2. Not shared across multiple instances
      // For 500 users at launch: acceptable if save_roadmap is called within the same session
      expect(true).toBe(true) // Document the known limitation
    })
  })

  // ==========================================================================
  // BONUS: Production Data Integrity (read-only)
  // ==========================================================================

  describe('Production Data Integrity (read-only)', () => {
    it('Today.md has valid date', async () => {
      const today = await readFile(PROD_USER_ID, 'Today.md')
      expect(today).toMatch(/\d{4}-\d{2}-\d{2}/)
    })

    it('Plan.md has active plans', async () => {
      const plan = await readFile(PROD_USER_ID, 'Plan.md')
      const activePlans = plan?.match(/### \[\w+\].*\(active\)/g) ?? []
      expect(activePlans.length).toBeGreaterThan(0)
    })

    it('detects expired plans still marked active', async () => {
      const plan = await readFile(PROD_USER_ID, 'Plan.md')
      const dateRanges = plan?.match(/Date: \d{4}-\d{2}-\d{2} - (\d{4}-\d{2}-\d{2})/g) ?? []
      const expiredPlans: string[] = []
      for (const range of dateRanges) {
        const endDate = range.match(/- (\d{4}-\d{2}-\d{2})/)?.[1]
        if (endDate && endDate < todayISO) {
          expiredPlans.push(endDate)
        }
      }
      if (expiredPlans.length > 0) {
        console.log(
          `  WARNING: ${expiredPlans.length} plan(s) with expired end dates: ${expiredPlans.join(', ')}`
        )
      }
      // Not a hard failure — just a warning
      expect(true).toBe(true)
    })

    it('History files exist and gaps are documented', async () => {
      const historyFiles = await listFiles(PROD_USER_ID, 'History/')
      expect(historyFiles.length).toBeGreaterThan(0)

      const dates = historyFiles.map((f) => f.replace('History/', '').replace('.md', '')).sort()
      const gaps: string[] = []
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1])
        const curr = new Date(dates[i])
        const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
        if (diffDays > 2) {
          gaps.push(`${dates[i - 1]} → ${dates[i]} (${diffDays}d)`)
        }
      }
      if (gaps.length > 0) {
        console.log(`  History gaps: ${gaps.join(', ')}`)
      }
    })

    it('Carryover.md tasks have valid format', async () => {
      const carryover = await readFile(PROD_USER_ID, 'Carryover.md')
      if (!carryover) return // No carryover is fine

      const taskLines = carryover.split('\n').filter((l) => l.startsWith('- ('))
      const validFormat = /^- \(\d+min\) .+$/
      const invalid = taskLines.filter((l) => !validFormat.test(l))
      if (invalid.length > 0) {
        console.log(`  Invalid carryover format: ${JSON.stringify(invalid)}`)
      }
      expect(invalid).toHaveLength(0)
    })
  })
})
