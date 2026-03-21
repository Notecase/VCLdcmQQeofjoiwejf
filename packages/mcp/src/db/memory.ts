/**
 * Secretary Memory DB Queries
 *
 * CRUD for the secretary_memory table.
 * Adapted from packages/ai/src/agents/secretary/memory.ts (query patterns only).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface MemoryRow {
  id: string
  user_id: string
  filename: string
  content: string
  created_at: string
  updated_at: string
}

export class MemoryDb {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  async read(filename: string): Promise<MemoryRow | null> {
    const { data, error } = await this.supabase
      .from('secretary_memory')
      .select('*')
      .eq('user_id', this.userId)
      .eq('filename', filename)
      .single()

    if (error || !data) return null
    return data as MemoryRow
  }

  async write(filename: string, content: string): Promise<MemoryRow> {
    const { data, error } = await this.supabase
      .from('secretary_memory')
      .upsert(
        {
          user_id: this.userId,
          filename,
          content,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,filename' }
      )
      .select()
      .single()

    if (error) throw new Error(`memory.write failed: ${error.message}`)
    return data as MemoryRow
  }

  async list(prefix?: string): Promise<MemoryRow[]> {
    let query = this.supabase
      .from('secretary_memory')
      .select('*')
      .eq('user_id', this.userId)
      .order('filename')

    if (prefix) {
      query = query.like('filename', `${prefix}%`)
    }

    const { data, error } = await query
    if (error) throw new Error(`memory.list failed: ${error.message}`)
    return (data ?? []) as MemoryRow[]
  }

  async delete(filename: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('secretary_memory')
      .delete()
      .eq('user_id', this.userId)
      .eq('filename', filename)

    if (error) throw new Error(`memory.delete failed: ${error.message}`)
    return true
  }

  /**
   * Read multiple History files with content in a single query (avoids N+1).
   */
  async getHistoryBulk(limit = 7): Promise<MemoryRow[]> {
    const { data, error } = await this.supabase
      .from('secretary_memory')
      .select('*')
      .eq('user_id', this.userId)
      .like('filename', 'History/%')
      .order('filename', { ascending: false })
      .limit(limit)

    if (error) throw new Error(`memory.getHistoryBulk failed: ${error.message}`)
    return (data ?? []) as MemoryRow[]
  }

  /**
   * Read or increment a plan's day counter in Plan.md.
   */
  async getPlanProgress(planId: string): Promise<{
    plan_id: string
    current_day: number
    total_days: number
    topic: string
  } | null> {
    const planFile = await this.read('Plan.md')
    if (!planFile) return null

    const escapedId = planId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const entryPattern = new RegExp(
      `###\\s*\\[${escapedId}\\]\\s*([^\\n]+)[\\s\\S]*?Progress:\\s*(\\d+)/(\\d+)[\\s\\S]*?Current:\\s*Day\\s*\\d+\\s*[—–-]\\s*(.+?)(?:\\n|$)`,
      'i'
    )
    const match = planFile.content.match(entryPattern)
    if (!match) return null

    return {
      plan_id: planId,
      current_day: parseInt(match[2], 10),
      total_days: parseInt(match[3], 10),
      topic: match[4].trim(),
    }
  }

  /**
   * Increment a plan's day counter in Plan.md.
   */
  async incrementPlanProgress(planId: string): Promise<{
    plan_id: string
    current_day: number
    total_days: number
    topic: string
  } | null> {
    const planFile = await this.read('Plan.md')
    if (!planFile) return null

    const escapedId = planId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const progressPattern = new RegExp(
      `(###\\s*\\[${escapedId}\\][\\s\\S]*?Progress:\\s*)(\\d+)(/(\\d+))`,
      'i'
    )
    const match = planFile.content.match(progressPattern)
    if (!match) return null

    const currentDay = parseInt(match[2], 10)
    const totalDays = parseInt(match[4], 10)
    const newDay = Math.min(currentDay + 1, totalDays)

    const updated = planFile.content.replace(progressPattern, `$1${newDay}$3`)
    await this.write('Plan.md', updated)

    // Re-read to get the topic for the new day
    const progress = await this.getPlanProgress(planId)
    return progress ?? { plan_id: planId, current_day: newDay, total_days: totalDays, topic: '' }
  }

  /**
   * Analyze recent History/*.md files for patterns.
   */
  async getHistoryAnalytics(days = 7): Promise<{
    recentDays: number
    avgCompletionRate: number
    struggledTopics: string[]
    strongTopics: string[]
    currentStreak: number
    moodTrend: string[]
  }> {
    const historyFiles = await this.list('History/')
    const recent = historyFiles
      .sort((a, b) => b.filename.localeCompare(a.filename))
      .slice(0, days)

    if (recent.length === 0) {
      return {
        recentDays: 0,
        avgCompletionRate: 0,
        struggledTopics: [],
        strongTopics: [],
        currentStreak: 0,
        moodTrend: [],
      }
    }

    const taskPattern = /^-\s*\[([x \->])\]/gm
    let totalCompletionRate = 0
    const struggledTopics: string[] = []
    const strongTopics: string[] = []
    const moodTrend: string[] = []
    let currentStreak = 0
    let streakBroken = false

    for (const file of recent) {
      const content = file.content
      let total = 0
      let completed = 0
      for (const m of content.matchAll(taskPattern)) {
        total++
        if (m[1] === 'x') completed++
      }
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0
      totalCompletionRate += rate

      if (!streakBroken && rate > 50) {
        currentStreak++
      } else {
        streakBroken = true
      }

      const struggledMatch = content.match(/Struggled with:\s*(.+)/i)
      if (struggledMatch?.[1]?.trim()) struggledTopics.push(struggledMatch[1].trim())

      const strongMatch = content.match(/What went well:\s*(.+)/i)
      if (strongMatch?.[1]?.trim()) strongTopics.push(strongMatch[1].trim())

      const moodMatch = content.match(/Mood:\s*(.+)/i)
      if (moodMatch?.[1]?.trim()) moodTrend.push(moodMatch[1].trim())
    }

    return {
      recentDays: recent.length,
      avgCompletionRate: Math.round(totalCompletionRate / recent.length),
      struggledTopics,
      strongTopics,
      currentStreak,
      moodTrend,
    }
  }
}
