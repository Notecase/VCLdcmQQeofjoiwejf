/**
 * Research Agent Tools
 *
 * LangChain-compatible tools for the research agent.
 * Tools operate on a shared state (files, todos) and emit SSE events.
 */

import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { VirtualFile, TodoItem, InterruptData, InterruptResponse } from '@inkdown/shared/types'

// =============================================================================
// State interface for tool context
// =============================================================================

export interface ResearchToolContext {
  files: Map<string, VirtualFile>
  todos: TodoItem[]
  emitEvent: (event: { type: string; data: unknown }) => void
  requestApproval?: (interrupt: InterruptData) => Promise<InterruptResponse>
  tavilyApiKey?: string
  supabase?: any
  userId?: string
}

export interface ResearchToolOptions {
  includeFileTools?: boolean
}

// =============================================================================
// Tool Factory
// =============================================================================

export function createResearchTools(
  ctx: ResearchToolContext,
  options: ResearchToolOptions = {}
): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = []
  const includeFileTools = options.includeFileTools !== false

  // ---------- File Tools ----------

  if (includeFileTools) {
    tools.push(
      tool(
        async ({ filename, content }) => {
          const now = new Date().toISOString()
          const existing = ctx.files.get(filename)
          const file: VirtualFile = {
            name: filename,
            content,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
          }
          ctx.files.set(filename, file)
          ctx.emitEvent({ type: 'file-write', data: file })
          return `File "${filename}" written successfully (${content.length} chars)`
        },
        {
          name: 'write_file',
          description: 'Write or update a virtual file. Use markdown (.md) for reports and notes.',
          schema: z.object({
            filename: z
              .string()
              .describe('File name (e.g., "research_request.md", "final_report.md")'),
            content: z.string().describe('File content (markdown recommended)'),
          }),
        }
      )
    )

    tools.push(
      tool(
        async ({ filename }) => {
          const file = ctx.files.get(filename)
          if (!file) return `File "${filename}" not found`
          return file.content
        },
        {
          name: 'read_file',
          description: 'Read the content of a virtual file.',
          schema: z.object({
            filename: z.string().describe('File name to read'),
          }),
        }
      )
    )

    tools.push(
      tool(
        async ({ filename }) => {
          const existed = ctx.files.delete(filename)
          if (existed) {
            ctx.emitEvent({ type: 'file-delete', data: { name: filename } })
            return `File "${filename}" deleted`
          }
          return `File "${filename}" not found`
        },
        {
          name: 'delete_file',
          description: 'Delete a virtual file.',
          schema: z.object({
            filename: z.string().describe('File name to delete'),
          }),
        }
      )
    )

    tools.push(
      tool(
        async () => {
          const files = Array.from(ctx.files.values()).map((f) => ({
            name: f.name,
            size: f.content.length,
            updatedAt: f.updatedAt,
          }))
          if (files.length === 0) return 'No files yet.'
          return files
            .map((f) => `- ${f.name} (${f.size} chars, updated ${f.updatedAt})`)
            .join('\n')
        },
        {
          name: 'list_files',
          description: 'List all virtual files with their sizes.',
          schema: z.object({}),
        }
      )
    )
  }

  // ---------- Todo Tools ----------

  tools.push(
    tool(
      async ({ todos: todoItems }) => {
        const normalizedTodos = todoItems.slice(0, 7).map((item, i) => ({
          id: `todo-${Date.now()}-${i}`,
          content: item.content,
          status: item.status || 'pending',
        }))
        ctx.todos.splice(0, ctx.todos.length, ...normalizedTodos)
        ctx.emitEvent({ type: 'todo-update', data: ctx.todos })
        return `Created ${ctx.todos.length} todo items`
      },
      {
        name: 'write_todos',
        description: 'Create or replace the entire todo list. Use this to set up a research plan.',
        schema: z.object({
          todos: z
            .array(
              z.object({
                content: z.string().describe('Task description'),
                status: z
                  .enum(['pending', 'in_progress', 'completed'])
                  .optional()
                  .describe('Task status (default: pending)'),
              })
            )
            .max(7)
            .describe('List of todo items (max 7)'),
        }),
      }
    )
  )

  tools.push(
    tool(
      async ({ todoId, status }) => {
        const todo = ctx.todos.find((t) => t.id === todoId)
        if (!todo) {
          // Try matching by content substring
          const match = ctx.todos.find(
            (t) => t.content.toLowerCase().includes(todoId.toLowerCase()) || t.id === todoId
          )
          if (!match) return `Todo "${todoId}" not found`
          match.status = status
          ctx.emitEvent({ type: 'todo-update', data: ctx.todos })
          return `Todo "${match.content}" marked as ${status}`
        }
        todo.status = status
        ctx.emitEvent({ type: 'todo-update', data: ctx.todos })
        return `Todo "${todo.content}" marked as ${status}`
      },
      {
        name: 'update_todo',
        description: 'Update the status of a todo item by ID or content match.',
        schema: z.object({
          todoId: z.string().describe('Todo ID or partial content match'),
          status: z.enum(['pending', 'in_progress', 'completed']).describe('New status'),
        }),
      }
    )
  )

  // ---------- Web Search (Tavily) ----------

  tools.push(
    tool(
      async ({ query, maxResults }) => {
        const apiKey = ctx.tavilyApiKey || process.env.TAVILY_API_KEY
        if (!apiKey) {
          return 'Web search unavailable: TAVILY_API_KEY not configured. Proceeding with available knowledge.'
        }

        try {
          const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: apiKey,
              query,
              max_results: maxResults || 5,
              include_answer: true,
              include_raw_content: false,
            }),
          })

          if (!response.ok) {
            return `Search failed: ${response.status} ${response.statusText}`
          }

          const data = (await response.json()) as {
            answer?: string
            results?: Array<{ title: string; url: string; content: string }>
          }

          const results: string[] = []
          if (data.answer) {
            results.push(`**Summary:** ${data.answer}\n`)
          }
          if (data.results) {
            for (const r of data.results) {
              results.push(`### ${r.title}\n**URL:** ${r.url}\n${r.content}\n`)
            }
          }

          return results.join('\n---\n') || 'No results found.'
        } catch (err) {
          return `Search error: ${err instanceof Error ? err.message : String(err)}`
        }
      },
      {
        name: 'web_search',
        description:
          'Search the web using Tavily. Returns relevant results with URLs and summaries.',
        schema: z.object({
          query: z.string().describe('Search query'),
          maxResults: z.number().optional().describe('Max results (default: 5, max: 10)'),
        }),
      }
    )
  )

  // ---------- Think Tool ----------

  tools.push(
    tool(
      async ({ thought }) => {
        return `Thought recorded: ${thought}`
      },
      {
        name: 'think',
        description:
          'Record a strategic thought or plan your next steps. Use this to reason about complex decisions before acting.',
        schema: z.object({
          thought: z.string().describe('Your strategic thought or reasoning'),
        }),
      }
    )
  )

  // ---------- Request Approval Tool ----------

  tools.push(
    tool(
      async ({ description, options }) => {
        if (!ctx.requestApproval) {
          return 'Approval mechanism not available. Proceeding with default action.'
        }

        const interrupt: InterruptData = {
          id: `interrupt-${Date.now()}`,
          toolName: 'request_approval',
          toolArgs: {},
          description,
          options: options || [
            { label: 'Approve', value: 'approve' },
            { label: 'Reject', value: 'reject' },
          ],
          allowedDecisions: ['approve', 'reject', 'edit'],
        }

        ctx.emitEvent({ type: 'interrupt', data: interrupt })
        const response = await ctx.requestApproval(interrupt)

        return `User decision: ${response.decision}${response.message ? ` — "${response.message}"` : ''}`
      },
      {
        name: 'request_approval',
        description:
          'Pause execution and request user approval before proceeding. Use for critical decisions.',
        schema: z.object({
          description: z.string().describe('What you want the user to approve'),
          options: z
            .array(
              z.object({
                label: z.string(),
                value: z.string(),
                description: z.string().optional(),
              })
            )
            .optional()
            .describe('Custom approval options'),
        }),
      }
    )
  )

  // ---------- Note Tools ----------

  tools.push(
    tool(
      async ({ query }) => {
        if (!ctx.supabase || !ctx.userId) {
          return 'Note access unavailable: not authenticated.'
        }
        const { data, error } = await ctx.supabase
          .from('notes')
          .select('id, title, content')
          .eq('user_id', ctx.userId)
          .eq('is_deleted', false)
          .ilike('title', `%${query}%`)
          .limit(3)

        if (error) return `Error searching notes: ${error.message}`
        if (!data?.length) return 'No notes found matching that query.'
        return data
          .map((n: any) => `# ${n.title}\n\n${n.content?.slice(0, 2000)}`)
          .join('\n\n---\n\n')
      },
      {
        name: 'read_note',
        description:
          "Search and read the user's Inkdown notes by title. Returns matching notes with their content.",
        schema: z.object({ query: z.string().describe('Title search query') }),
      }
    )
  )

  tools.push(
    tool(
      async ({ query }) => {
        if (!ctx.supabase || !ctx.userId) {
          return 'Note search unavailable: not authenticated.'
        }
        const { data, error } = await ctx.supabase
          .from('notes')
          .select('id, title, content')
          .eq('user_id', ctx.userId)
          .eq('is_deleted', false)
          .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
          .order('updated_at', { ascending: false })
          .limit(5)

        if (error) return `Error searching notes: ${error.message}`
        if (!data?.length) return 'No notes found.'
        return data.map((n: any) => `**${n.title}**: ${n.content?.slice(0, 500)}...`).join('\n\n')
      },
      {
        name: 'search_notes',
        description: "Full-text search across the user's notes content and titles.",
        schema: z.object({ query: z.string().describe('Search query') }),
      }
    )
  )

  return tools
}
