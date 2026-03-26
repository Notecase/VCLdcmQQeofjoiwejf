import type { Context } from 'hono'

type LogLevel = 'info' | 'warn' | 'error'

export function log(level: LogLevel, msg: string, ctx?: Context, extra?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    requestId: ctx?.get('requestId'),
    userId: (ctx?.get('auth') as { userId?: string } | undefined)?.userId,
    ...extra,
  }
  const line = JSON.stringify(entry)
  if (level === 'error') {
    process.stderr.write(line + '\n')
  } else {
    process.stdout.write(line + '\n')
  }
}
