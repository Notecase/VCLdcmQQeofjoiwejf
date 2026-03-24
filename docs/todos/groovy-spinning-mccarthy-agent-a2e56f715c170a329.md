# OpenClaw Channel/Platform Architecture Research

Date: 2026-03-24

## 1. System Overview

OpenClaw is an open-source, self-hosted personal AI assistant gateway. It follows a **hub-and-spoke architecture** with a single Gateway process (`src/gateway/server.ts`) acting as the control plane between messaging platforms and AI agent runtimes.

- Runs on Node.js 22+/24, binds to `127.0.0.1:18789` by default via WebSocket (`ws` library)
- Single instance per host (required by platforms like WhatsApp's single-device protocol)
- Event-driven model: clients subscribe to events (`agent`, `presence`, `health`, `tick`)
- Typed protocol validated against JSON Schema generated from TypeBox definitions
- Idempotency keys for all side-effecting operations
- MIT licensed

## 2. Message Normalization

### Unified Message Format

All channels normalize inbound messages into a `ChannelMessageActionContext` containing:

- **Peer identification**: User ID, Group ID
- **Session keys** via `buildOutboundBaseSessionKey` - ensures replies route to the correct thread
- **Media handling**: Local paths or URLs for attachments
- **Thread context**: Reply chains, thread IDs
- **Reactions**: Emoji reactions from platforms that support them

### Inbound Transformation

Each channel implements a context builder function (e.g., `buildTelegramMessageContext`) that produces the normalized `ChannelMessageActionContext`. This is the translation layer that converts platform-specific payloads (text, images, buttons, cards) into OpenClaw's unified format.

### Outbound Transformation

The `ChannelOutboundAdapter` reverses the process:

- **Chunking**: Splits responses per platform limits (Telegram: 4096 chars, etc.)
- **Formatting**: Converts Markdown to platform-specific formats (HTML for Telegram, Block Kit for Slack)
- **Dispatcher**: `ReplyDispatcher` sends payloads to platform APIs
- **Typing indicators**: Platform-specific typing signals (`sendTypingTelegram()`, etc.)
- **ACK reactions**: Configurable acknowledgement emoji (e.g., eyes emoji) while processing

## 3. Channel Plugin Architecture

### ChannelPlugin Interface

Each channel implements the `ChannelPlugin` interface with these core components:

| Component                     | Type      | Purpose                                               |
| ----------------------------- | --------- | ----------------------------------------------------- |
| `ChannelMeta`                 | Metadata  | ID, label, display order                              |
| `ChannelSetupAdapter`         | Setup     | Onboarding wizard and configuration                   |
| `ChannelSecurityResolver`     | Security  | DM and Group policy enforcement                       |
| `ChannelMessagingAdapter`     | Messaging | Target normalization and session routing              |
| `ChannelOutboundAdapter`      | Outbound  | Delivery modes, text chunking, formatting             |
| `ChannelMessageActionAdapter` | Actions   | Platform-specific features (react, pin, thread-reply) |
| `ChannelConfigSchema`         | Config    | Zod-based validation for platform-specific settings   |

### Adapter File Structure

Each channel lives in its own directory:

```
extensions/<channelName>/src/
  channel.ts          # Exports adapter instances, registers via OpenClawPluginApi
  runtime-api.ts      # Platform-specific API wrappers
```

Built-in channels are in `src/<platform>/` (telegram, discord, slack, imessage).
Extension channels are in `extensions/<platform>/`.

### Plugin Registration

Channels register via `OpenClawPluginApi`, attaching channel-specific logic to the hub-and-spoke model. Discovery-based: plugin loader scans workspace packages for `openclaw.extensions` field in `package.json`, validates against schemas, hot-loads when configured.

### Supported Channels (20+)

**Bundled:** Telegram (grammy), Discord (discord.js/@buape/carbon), Slack (Web Client/Socket Mode), WhatsApp (Baileys), Signal (signal-cli), iMessage (imsg CLI)

**Extensions:** Matrix, Mattermost, Feishu, BlueBubbles, Google Chat, Microsoft Teams, LINE, Nostr, IRC, Twitch, Zalo, Synology Chat, Tlon, Nextcloud Talk, WebChat

### Platform-Specific Capabilities

| Action         | Platforms                             | Purpose                                                |
| -------------- | ------------------------------------- | ------------------------------------------------------ |
| `react`        | Slack, Telegram, WhatsApp, Mattermost | Emoji reactions                                        |
| `pin`          | Telegram, Feishu                      | Message pinning                                        |
| `thread-reply` | Slack, Discord, Feishu                | Threaded responses                                     |
| `poll`         | WhatsApp, Telegram                    | Interactive polls                                      |
| `kick`/`ban`   | Various                               | Moderation (requires `requiresTrustedRequesterSender`) |
| `send`         | All                                   | Standard message delivery                              |

Each adapter runs in its own lightweight thread -- adding channels does not degrade performance.

### Multi-Account Support

Platforms supporting multiple accounts define them under:

```json
channels.<provider>.accounts.<accountId>
```

Account-specific tokens and allowlists are resolved via dedicated functions (e.g., `resolveTelegramAccount()`).

## 4. Message Routing & Session Management

### Session Key Resolution

Session keys encode trust level and isolation:

| Key Format                             | Trust Level                      |
| -------------------------------------- | -------------------------------- |
| `agent:<agentId>:main`                 | Full capabilities (main session) |
| `agent:<agentId>:<channel>:dm:<id>`    | Sandboxed per-user               |
| `agent:<agentId>:<channel>:group:<id>` | Sandboxed per-group              |
| `agent:<agentId>:main:acp:researcher`  | Subagent sessions                |

### DM Scope Options

Controls how direct messages are grouped (`session.dmScope`):

| Mode                       | Behavior                                                                    |
| -------------------------- | --------------------------------------------------------------------------- |
| `main`                     | All DMs share one global session (default, not recommended for shared bots) |
| `per-peer`                 | Isolated by sender ID across channels                                       |
| `per-channel-peer`         | Isolated by channel + sender (**recommended**)                              |
| `per-account-channel-peer` | Most granular isolation                                                     |

### Session Lifecycle

1. **Initialization**: `initSessionState` creates `SessionEntry` with UUID, timestamp, token tracking
2. **Thread forking**: Child sessions can reference parent session files without mutation
3. **Reset**: Manual (`performGatewaySessionReset`) or automatic (`evaluateSessionFreshness` checks idle time/daily policy)
4. **Compaction**: Summarizes older messages and truncates JSONL when approaching context window limits
5. **Pruning**: Auto-removes after `pruneAfter` (default 30 days) or `maxEntries` limit

### Session Storage

- **Session store**: `sessions.json` maps `SessionKey` -> `SessionEntry` (UUID, updatedAt, totalTokens, model, deliveryContext)
- **Transcripts**: `.jsonl` files (JSON Lines) - each line is a message with role, content, timestamp, tool calls
- **Concurrency**: Promise-chain mutex in `updateSessionStore` prevents race conditions
- **Path safety**: `validateSessionId` prevents traversal attacks; symlink protection validates resolved paths

### Multi-Agent Routing

Configuration-based binding of channels/groups to specific agent instances:

```json5
{
  agents: {
    list: [
      { id: 'home', default: true, workspace: '~/.openclaw/workspace-home' },
      { id: 'work', workspace: '~/.openclaw/workspace-work' },
    ],
  },
  bindings: [
    { agentId: 'home', match: { channel: 'whatsapp', accountId: 'personal' } },
    { agentId: 'work', match: { channel: 'whatsapp', accountId: 'biz' } },
  ],
}
```

### Session Reset Configuration

```json5
{
  session: {
    dmScope: 'per-channel-peer',
    threadBindings: { enabled: true, idleHours: 24, maxAgeHours: 0 },
    reset: { mode: 'daily', atHour: 4, idleMinutes: 120 },
  },
}
```

## 5. Security Model

### DM Access Control (`dmPolicy`)

| Mode                | Behavior                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pairing` (default) | Unknown senders receive an expiring code (1-hour TTL, max 3 pending per channel). Must be approved via `openclaw pairing approve` CLI or Control UI |
| `allowlist`         | Only IDs in `allowFrom` list can interact                                                                                                           |
| `open`              | Requires explicit `allowFrom: ["*"]` opt-in                                                                                                         |
| `disabled`          | Ignores all inbound DMs                                                                                                                             |

### Group Policy

Evaluated in sequence:

1. `groupPolicy` / group allowlists checked first
2. Mention/reply activation checked second
3. Replying to bot messages does NOT bypass sender allowlists

Group mention gating: `requireMention: true` means the bot ignores messages that don't @mention it.

### Allowlist Storage

- Default account: `~/.openclaw/credentials/<channel>-allowFrom.json`
- Non-default accounts: `~/.openclaw/credentials/<channel>-<accountId>-allowFrom.json`
- Merged with config-level allowlists during pairing approval

### Gateway Authentication

- Modes: token-based bearer auth, password auth, or trusted-proxy identity
- Tailscale integration: `gateway.auth.allowTailscale` for identity headers
- Default: loopback-only binding; non-loopback requires shared auth secrets

### Tool Sandboxing

- Docker containers isolate `dm`/`group` sessions (sandboxed by default)
- `main` session gets host access
- Ephemeral containers with per-session isolation and configurable resource limits

### Security Audit

`openclaw security audit [--deep] [--fix] [--json]` checks:

- Filesystem permissions (world-writable state/config)
- Network exposure (bind without auth, Tailscale Funnel)
- Tool blast radius
- Browser control remote exposure
- Plugin allowlists
- Model choice warnings

### Hardened Baseline

```json5
{
  gateway: { mode: 'local', bind: 'loopback', auth: { mode: 'token', token: 'long-random-token' } },
  session: { dmScope: 'per-channel-peer' },
  tools: {
    profile: 'messaging',
    deny: ['group:automation', 'group:runtime', 'group:fs'],
    fs: { workspaceOnly: true },
    exec: { security: 'deny', ask: 'always' },
  },
  channels: {
    whatsapp: { dmPolicy: 'pairing', groups: { '*': { requireMention: true } } },
  },
}
```

## 6. Memory & Storage System

### Two-Layer Memory Architecture

**Layer 1 - Daily logs** (`memory/YYYY-MM-DD.md`):

- Append-only daily records
- Loaded at session start (today + yesterday)
- For transient context and day-to-day notes

**Layer 2 - Long-term memory** (`MEMORY.md`):

- Curated persistent knowledge (decisions, preferences, durable facts)
- Only loaded in main private sessions (not group contexts)
- Deduplicated by file path when both layers coexist

### Agent-Facing Tools

- `memory_search`: Semantic recall over indexed snippets (hybrid BM25 + vector similarity)
- `memory_get`: Targeted reads of specific Markdown files or line ranges (graceful degradation on missing files)

### Vector Search Backend

- Storage: `~/.openclaw/memory/<agentId>.sqlite`
- Hybrid search: BM25 keyword matching + vector similarity
- Post-processing: MMR diversity re-ranking + temporal decay
- Embedding provider auto-selection: local model -> OpenAI -> Gemini -> Voyage -> Mistral -> Ollama -> disabled
- Plugin-based: `plugins.slots.memory` config (default: `memory-core`, can be set to `"none"`)

### Automatic Memory Flush Before Compaction

When tokens approach context window limit:

1. System triggers a silent agentic turn (with `NO_REPLY` marker)
2. Model is prompted to write durable memories to disk
3. Runs once per compaction cycle (tracked in `sessions.json`)
4. Skips if workspace access is read-only or disabled

### System Prompt Composition

Prompts compose from multiple workspace files:

- `AGENTS.md` - Bundled baseline instructions
- `SOUL.md` - Optional personality/identity
- `TOOLS.md` - User-specific conventions and notes
- Dynamic context: session history + semantically relevant memory + relevant skills

### Data Locations

| Data          | Location                                                |
| ------------- | ------------------------------------------------------- |
| Configuration | `~/.openclaw/openclaw.json` (JSON5)                     |
| Sessions      | `~/.openclaw/agents/<agentId>/sessions/*.jsonl`         |
| Memory index  | `~/.openclaw/memory/<agentId>.sqlite`                   |
| Memory files  | `~/.openclaw/workspace/memory/*.md` + `MEMORY.md`       |
| Credentials   | `~/.openclaw/credentials/` (0600 permissions)           |
| Workspaces    | `~/.openclaw/workspace/` (per-agent isolation possible) |

## 7. End-to-End Message Flow

```
Phase 1 - Ingestion:
  Platform SDK receives event (e.g., Baileys WebSocket, grammY update)
  Channel adapter parses message + metadata into ChannelMessageActionContext

Phase 2 - Access Control & Routing:
  DM policy check (pairing/allowlist/open) [<10ms]
  Session key resolution via buildOutboundBaseSessionKey
  Auto-reply system resolves target session

Phase 3 - Context Assembly:
  Load session transcript from JSONL [<50ms]
  Build system prompt (AGENTS.md + SOUL.md + TOOLS.md + relevant memories) [<100ms]
  Inject relevant skills selectively

Phase 4 - Model Invocation:
  Stream context to configured provider (Claude, GPT, local models)
  First token: 200-500ms

Phase 5 - Tool Execution:
  Runtime intercepts tool calls
  Execute in Docker sandbox (dm/group) or host (main)
  Stream results back to model [100ms-3s per tool]

Phase 6 - Response Delivery:
  ChannelOutboundAdapter formats per platform specs
  Chunking, markdown conversion, media uploads
  Send via platform API
  Persist full state to session JSONL
```

## Sources

- [OpenClaw Official Docs](https://docs.openclaw.ai/)
- [OpenClaw Architecture, Explained (Substack)](https://ppaolo.substack.com/p/openclaw-system-architecture-overview)
- [Channel Architecture (DeepWiki)](https://deepwiki.com/openclaw/openclaw/4.1-channel-architecture)
- [Channels Overview (DeepWiki)](https://deepwiki.com/openclaw/openclaw/4-channels)
- [Session Management (DeepWiki)](https://deepwiki.com/openclaw/openclaw/2.4-session-management)
- [Memory Docs](https://docs.openclaw.ai/concepts/memory)
- [Gateway Configuration](https://docs.openclaw.ai/gateway/configuration)
- [Gateway Security](https://docs.openclaw.ai/gateway/security)
- [GitHub Repository](https://github.com/openclaw/openclaw)
- [OpenClaw Homepage](https://openclaw.ai/)
- [Understanding OpenClaw (Medium)](https://medium.com/@ozbillwang/understanding-openclaw-a-comprehensive-guide-to-the-multi-channel-ai-gateway-ad8857cd1121)
