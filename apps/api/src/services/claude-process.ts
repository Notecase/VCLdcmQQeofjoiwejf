/**
 * Claude Code Process Manager
 *
 * Manages Claude Code CLI child processes — one per user session.
 * Spawns `claude` with stream-json I/O, pipes stdout through EventNormalizer,
 * and forwards NoteshellEvents to registered callbacks.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface, type Interface as ReadlineInterface } from 'node:readline'
import { EventNormalizer } from './event-normalizer'
import { config } from '../config'
import type { NoteshellEvent, SessionStateEvent } from '@inkdown/shared/types'

export interface ClaudeSession {
  id: string
  userId: string
  process: ChildProcess
  normalizer: EventNormalizer
  readline: ReadlineInterface
  onEvent: (event: NoteshellEvent) => void
  idleTimer?: ReturnType<typeof setTimeout>
  startupTimer?: ReturnType<typeof setTimeout>
  createdAt: number
  lastActivityAt: number
  isProcessing: boolean
}

export interface CreateSessionOptions {
  onEvent: (event: NoteshellEvent) => void
  accessToken: string
  initialPrompt: string
  context?: { noteId?: string; selectedText?: string; noteTitle?: string }
  supabaseUrl?: string
}

export class ClaudeProcessManager {
  private sessions = new Map<string, ClaudeSession>()

  /**
   * Create a new Claude Code session for a user.
   */
  createSession(userId: string, options: CreateSessionOptions): string {
    const sessionId = crypto.randomUUID()

    // Resolve MCP server path
    const mcpPath = config.claudeCode.mcpServerPath

    // Build MCP config JSON for --mcp-config flag
    const mcpConfig = JSON.stringify({
      mcpServers: {
        noteshell: {
          command: 'node',
          args: [mcpPath],
          env: {
            SUPABASE_URL: config.supabase.url,
            SUPABASE_ANON_KEY: config.supabase.anonKey,
            NOTESHELL_ACCESS_TOKEN: options.accessToken,
          },
        },
      },
    })

    // Resolve noteshell context file for system prompt
    const contextPath = new URL('../../../../.claude/noteshell-context.md', import.meta.url)
      .pathname

    // Build Claude CLI args
    const args = [
      '-p', // print mode (non-interactive)
      '--output-format',
      'stream-json',
      '--input-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode',
      config.claudeCode.permissionMode,
      '--mcp-config',
      mcpConfig,
      '--no-session-persistence', // Don't persist sessions to disk
      '--append-system-prompt-file',
      contextPath,
    ]

    console.log(
      `[claude-code] spawning: ${config.claudeCode.path} ${args.join(' ').slice(0, 200)}...`
    )

    const child = spawn(config.claudeCode.path, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    console.log(`[claude-code] pid: ${child.pid}`)

    const normalizer = new EventNormalizer()

    // Create readline for line-by-line stdout parsing
    const rl = createInterface({ input: child.stdout! })

    const session: ClaudeSession = {
      id: sessionId,
      userId,
      process: child,
      normalizer,
      readline: rl,
      onEvent: options.onEvent,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      isProcessing: true,
    }

    // Emit session state
    const stateEvent: SessionStateEvent = { type: 'session.state', state: 'starting' }
    options.onEvent(stateEvent)

    // Startup timeout: if no stdout within 30s, the process likely can't authenticate
    session.startupTimer = setTimeout(() => {
      if (lineCount === 0) {
        session.onEvent({
          type: 'error',
          message: 'Claude Code failed to start within 30 seconds. Check API key configuration.',
          code: 'startup_timeout',
        })
        this.destroySession(sessionId)
      }
    }, 30000)

    // Process stdout line by line
    let lineCount = 0
    rl.on('line', (line) => {
      lineCount++
      if (lineCount === 1 && session.startupTimer) {
        clearTimeout(session.startupTimer)
        session.startupTimer = undefined
      }
      if (lineCount <= 3) {
        console.log(
          `[claude-code:${sessionId.slice(0, 8)}] stdout[${lineCount}]: ${line.slice(0, 120)}`
        )
      }
      session.lastActivityAt = Date.now()
      this.resetIdleTimer(sessionId)

      const events = normalizer.normalize(line)
      for (const event of events) {
        // Reset processing flag when turn completes
        if (event.type === 'turn.completed' || event.type === 'error') {
          session.isProcessing = false
        }
        session.onEvent(event)
      }
    })

    // Handle stderr — log all for debugging, forward errors to client
    if (child.stderr) {
      const stderrRl = createInterface({ input: child.stderr })
      stderrRl.on('line', (line) => {
        console.error(`[claude-code:${sessionId.slice(0, 8)}] ${line}`)
        if (line.includes('error') || line.includes('Error') || line.includes('fatal')) {
          session.onEvent({
            type: 'error',
            message: line,
            code: 'stderr',
          })
        }
      })
    }

    // Handle process exit
    child.on('exit', (code, signal) => {
      session.onEvent({
        type: 'session.state',
        state: 'stopped',
      })
      if (code !== 0 && code !== null) {
        session.onEvent({
          type: 'error',
          message: `Claude Code exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`,
          code: 'process_exit',
        })
      }
      this.sessions.delete(sessionId)
    })

    child.on('error', (err) => {
      session.onEvent({
        type: 'error',
        message: `Failed to start Claude Code: ${err.message}`,
        code: 'spawn_error',
      })
      this.sessions.delete(sessionId)
    })

    this.sessions.set(sessionId, session)
    this.startIdleTimer(sessionId)

    // Write the initial prompt to stdin immediately so Claude has input ready
    // stream-json format requires: { type: "user", message: { role: "user", content: "..." } }
    const initialPrompt = this.buildPrompt(options.initialPrompt, options.context)
    const initialMessage = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: initialPrompt },
    })
    child.stdin!.write(initialMessage + '\n')

    return sessionId
  }

  /**
   * Send a message to an existing session.
   */
  sendMessage(
    sessionId: string,
    content: string,
    context?: { noteId?: string; selectedText?: string; noteTitle?: string }
  ): boolean {
    const session = this.sessions.get(sessionId)
    if (!session || !session.process.stdin?.writable) return false
    if (session.isProcessing) {
      console.warn(`[claude-code:${sessionId.slice(0, 8)}] dropping message — still processing`)
      return false
    }

    session.isProcessing = true
    session.lastActivityAt = Date.now()
    this.resetIdleTimer(sessionId)

    // Emit running state
    session.onEvent({ type: 'session.state', state: 'running' })

    // stream-json format requires: { type: "user", message: { role: "user", content: "..." } }
    const prompt = this.buildPrompt(content, context)
    const message = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: prompt },
    })
    session.process.stdin.write(message + '\n')

    return true
  }

  /**
   * Build prompt string with optional editor context prefix.
   */
  private buildPrompt(
    content: string,
    context?: { noteId?: string; selectedText?: string; noteTitle?: string }
  ): string {
    if (!context?.noteId && !context?.selectedText) return content

    const contextParts: string[] = []
    if (context.noteId) {
      contextParts.push(`[Active Note: ${context.noteTitle ?? context.noteId}]`)
    }
    if (context.selectedText) {
      contextParts.push(`[Selected Text: "${context.selectedText.slice(0, 500)}"]`)
    }
    return `${contextParts.join(' ')}\n\n${content}`
  }

  /**
   * Interrupt the current operation.
   */
  interrupt(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    // Send SIGINT to the Claude process
    session.process.kill('SIGINT')
    return true
  }

  /**
   * Get session info.
   */
  getSession(sessionId: string): ClaudeSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Find session by user ID.
   */
  findSessionByUser(userId: string): ClaudeSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) return session
    }
    return undefined
  }

  /**
   * Destroy a session and kill the process.
   */
  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    if (session.idleTimer) clearTimeout(session.idleTimer)
    if (session.startupTimer) clearTimeout(session.startupTimer)
    session.readline.close()

    if (!session.process.killed) {
      session.process.kill('SIGTERM')
    }

    this.sessions.delete(sessionId)
  }

  /**
   * Destroy all sessions — called on server shutdown.
   */
  destroyAllSessions(): void {
    for (const sessionId of this.sessions.keys()) {
      this.destroySession(sessionId)
    }
  }

  /**
   * Get count of active sessions.
   */
  get sessionCount(): number {
    return this.sessions.size
  }

  /**
   * Check if max sessions reached.
   */
  get isAtCapacity(): boolean {
    return this.sessions.size >= config.claudeCode.maxSessions
  }

  private startIdleTimer(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    session.idleTimer = setTimeout(() => {
      session.onEvent({
        type: 'session.state',
        state: 'stopped',
      })
      session.onEvent({
        type: 'error',
        message: 'Session terminated due to inactivity',
        code: 'idle_timeout',
      })
      this.destroySession(sessionId)
    }, config.claudeCode.idleTimeout)
  }

  private resetIdleTimer(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    if (session.idleTimer) clearTimeout(session.idleTimer)
    this.startIdleTimer(sessionId)
  }
}

// Singleton instance
export const processManager = new ClaudeProcessManager()
