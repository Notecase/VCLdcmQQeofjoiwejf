/**
 * Automation Agent Tools
 *
 * Three tools: web_search (reused), save_note, advance_progress.
 */

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createWebSearchTool } from '../../tools/web-search'

export interface AutomationToolContext {
  supabase: SupabaseClient
  userId: string
  planId: string
  projectId?: string
}

export interface AutomationToolResult {
  noteId?: string
  noteTitle?: string
  advancedProgress: boolean
}

/**
 * Create the automation toolset.
 *
 * The result object is mutated by tool executions to track outputs.
 */
export function createAutomationTools(
  ctx: AutomationToolContext,
  result: AutomationToolResult
): ToolSet {
  const web_search = createWebSearchTool({ maxResults: 8 })

  const save_note = tool({
    description:
      'Save the generated note to the plan project. Call this EXACTLY ONCE with the complete note content.',
    inputSchema: z.object({
      title: z.string().min(1).describe('Note title, e.g. "Mar 28 — Lesson 25: Gradient Descent"'),
      content: z
        .string()
        .min(10)
        .describe('Full markdown content starting with # Title on the first line'),
    }),
    execute: async ({ title, content }) => {
      const { data: newNote, error } = await ctx.supabase
        .from('notes')
        .insert({
          user_id: ctx.userId,
          title,
          content,
          project_id: ctx.projectId || null,
        })
        .select('id')
        .single()

      if (error || !newNote) {
        return `Failed to save note: ${error?.message || 'unknown error'}`
      }

      result.noteId = (newNote as { id: string }).id
      result.noteTitle = title
      return `Note saved successfully: "${title}" (id: ${result.noteId})`
    },
  })

  const advance_progress = tool({
    description:
      'Increment the plan progress counter after generating a lesson. Call ONCE after save_note.',
    inputSchema: z.object({
      lessonNumber: z.number().int().positive().describe('The lesson number just completed'),
    }),
    execute: async ({ lessonNumber }) => {
      // Read Plan.md
      const { data: planFile } = await ctx.supabase
        .from('secretary_memory')
        .select('content')
        .eq('user_id', ctx.userId)
        .eq('filename', 'Plan.md')
        .single()

      if (!planFile?.content) {
        return 'Could not read Plan.md — progress not updated.'
      }

      // Increment progress counter for this plan
      const escapedId = ctx.planId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const progressPattern = new RegExp(
        `(###\\s*\\[${escapedId}\\][\\s\\S]*?Progress:\\s*)(\\d+)(/\\d+)`,
        'i'
      )
      const match = planFile.content.match(progressPattern)
      if (!match) {
        return `Plan [${ctx.planId}] not found in Plan.md — progress not updated.`
      }

      const currentDay = parseInt(match[2], 10)
      const newDay = Math.max(currentDay, lessonNumber)
      const updated = planFile.content.replace(progressPattern, `$1${newDay}$3`)

      const { error } = await ctx.supabase.from('secretary_memory').upsert(
        {
          user_id: ctx.userId,
          filename: 'Plan.md',
          content: updated,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,filename' }
      )

      if (error) {
        return `Failed to update progress: ${error.message}`
      }

      result.advancedProgress = true
      return `Progress updated: Lesson ${newDay} completed for plan [${ctx.planId}].`
    },
  })

  return { web_search, save_note, advance_progress }
}
