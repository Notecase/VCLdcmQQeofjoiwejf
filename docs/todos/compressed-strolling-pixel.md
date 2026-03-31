# Fix Plan: Claude Code Integration — Process Hang & UI Lock

## Context

The Claude Code integration (Milestones P-M5) is implemented but the child process hangs silently after spawn, producing zero stdout. Root cause: `--bare` flag disables OAuth/keychain auth, and `ANTHROPIC_API_KEY` is empty in `.env`. The process can't authenticate and hangs. Additionally, the `waitingForResponse` frontend flag has no timeout, permanently locking the UI.

## Root Causes

1. **`--bare` kills auth** — User authenticates Claude Code via OAuth (keychain). `--bare` disables keychain reads, requiring `ANTHROPIC_API_KEY` which is empty → process hangs silently waiting for credentials.
2. **No startup timeout** — If the process produces no stdout within N seconds, nothing detects it. The idle timer is 5 minutes — too long.
3. **`waitingForResponse` has no fallback** — Set to `true` on send, only reset by incoming events. If no events arrive, UI is permanently locked.

## Fixes

### Fix 1: Remove `--bare`, use targeted flags instead

**File**: `apps/api/src/services/claude-process.ts` (lines 63-85)

Remove `--bare` flag. This lets Claude Code use its normal OAuth/keychain auth. To compensate for slower startup (hooks will run), keep `--no-session-persistence` and add targeted optimizations:

```typescript
const args = [
  '-p',
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
  '--no-session-persistence',
  '--append-system-prompt-file',
  contextPath,
]
```

Drop: `--bare`
Keep: `--no-session-persistence`, `--append-system-prompt-file`

### Fix 2: Add startup timeout (30s)

**File**: `apps/api/src/services/claude-process.ts`

After spawning and writing the initial prompt, set a 30-second startup timeout. If no stdout line arrives within 30s, emit an error event and kill the process.

```typescript
// After writing initial prompt:
const startupTimeout = setTimeout(() => {
  if (lineCount === 0) {
    session.onEvent({
      type: 'error',
      message: 'Claude Code failed to start within 30 seconds. Check API key configuration.',
      code: 'startup_timeout',
    })
    this.destroySession(sessionId)
  }
}, 30000)

// Clear timeout when first stdout line arrives (in rl.on('line')):
if (lineCount === 1) clearTimeout(startupTimeout)
```

Store `startupTimeout` on the session object and clear it in `destroySession`.

### Fix 3: Add `waitingForResponse` timeout (60s)

**File**: `apps/web/src/services/claude-code.service.ts`

Add a 60-second safety timeout on `waitingForResponse`. If no response event arrives in 60s, reset the flag and show an error.

```typescript
// In sendMessage(), after setting waitingForResponse = true:
this.responseTimeout = setTimeout(() => {
  this.waitingForResponse = false
  const store = useClaudeCodeStore()
  store.handleEvent({
    type: 'error',
    message: 'No response received — Claude Code may have failed to start.',
    code: 'response_timeout',
  })
}, 60000)

// In handleRawMessage(), when resetting waitingForResponse:
if (this.responseTimeout) {
  clearTimeout(this.responseTimeout)
  this.responseTimeout = null
}
```

### Fix 4: Remove debug logging

**File**: `apps/api/src/routes/claude-code.ts`

Remove the verbose debug logging (`onMessage raw`, `→ event.type`, `session created`) added during debugging. Keep only stderr forwarding in `claude-process.ts`.

## Files to Modify

| File                                           | Change                                                    |
| ---------------------------------------------- | --------------------------------------------------------- |
| `apps/api/src/services/claude-process.ts`      | Remove `--bare`, add startup timeout, keep targeted flags |
| `apps/web/src/services/claude-code.service.ts` | Add response timeout on `waitingForResponse`              |
| `apps/api/src/routes/claude-code.ts`           | Remove debug logging                                      |

## Verification

1. `pnpm build && pnpm typecheck` — must pass
2. `pnpm dev` → open app → toggle Claude mode → send message
3. Expect: Claude Code starts up (hooks run ~5-10s), then streams response with tool calls
4. If ANTHROPIC_API_KEY is truly empty and OAuth doesn't work: expect clean "failed to start" error after 30s instead of silent hang
5. Test sending second message after first completes — should work (waitingForResponse reset)
6. Test recovery: if process hangs, UI should unlock after 60s with error message
