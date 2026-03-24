# Multi-Platform Messaging Bot: Technology Research

**Date**: 2026-03-24

---

## 1. Grammy.js (Telegram Bot Framework)

**Package**: `grammy` | **Docs**: https://grammy.dev | **License**: MIT

### Setup

```bash
npm install grammy
```

```typescript
import { Bot } from 'grammy'
const bot = new Bot('YOUR_BOT_TOKEN')

bot.command('start', (ctx) => ctx.reply('Welcome!'))
bot.on('message:text', (ctx) => ctx.reply(`You said: ${ctx.msg.text}`))
bot.start() // long polling
```

### Long Polling vs Webhooks

| Aspect       | Long Polling (`bot.start()`)                  | Webhooks (`webhookCallback()`)                           |
| ------------ | --------------------------------------------- | -------------------------------------------------------- |
| Setup        | Zero config, just call `bot.start()`          | Requires public HTTPS URL + `setWebhook` API call        |
| How it works | Bot pulls updates from Telegram (30s timeout) | Telegram pushes updates to your server                   |
| Best for     | Local dev, standard servers                   | Serverless, production, cost-sensitive                   |
| Scaling      | Single process, sequential                    | Scales to zero, no idle connections                      |
| Caveat       | Persistent connection                         | 10s timeout -- must queue long tasks or Telegram resends |

### Webhook Setup with Hono (Production)

Grammy has **native Hono adapter support**. Supported adapters: `express`, `hono`, `koa`, `fastify`, `bun`, `cloudflare`, `aws-lambda`, `next-js`, `azure`, `elysia`, `nhttp`, and more (~18 total).

```typescript
import { Bot, webhookCallback } from 'grammy'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!)
bot.on('message:text', (ctx) => ctx.reply(`Echo: ${ctx.msg.text}`))

const app = new Hono()
app.get('/health', (c) => c.text('OK'))
app.post('/webhook/telegram', webhookCallback(bot, 'hono'))

// Set webhook once on startup
await bot.api.setWebhook('https://your-domain.com/webhook/telegram')
serve({ fetch: app.fetch, port: 3001 })
```

### Message Type Handling

Grammy has 1150+ filter queries with full TypeScript narrowing:

```typescript
// Text
bot.on('message:text', (ctx) => {
  /* ctx.msg.text is string, guaranteed */
})

// Media types
bot.on(':photo', (ctx) => {
  /* photo messages */
})
bot.on(':voice', (ctx) => {
  /* voice messages */
})
bot.on(':video', (ctx) => {
  /* video messages */
})
bot.on(':document', (ctx) => {
  /* documents/files */
})
bot.on(':audio', (ctx) => {
  /* audio files */
})
bot.on(':sticker', (ctx) => {
  /* stickers */
})
bot.on(':animation', (ctx) => {
  /* GIFs */
})

// Shortcuts
bot.on(':media', (ctx) => {
  /* photos + videos */
})
bot.on(':file', (ctx) => {
  /* all file types */
})

// Entity filters
bot.on('message:entities:url', (ctx) => {
  /* messages with URLs */
})
```

### Key Plugins

- **Sessions** -- persist user data in database
- **Conversations** -- multi-turn dialog flows
- **Runner** -- concurrent long polling at scale
- **Router** -- route messages to different handlers
- **Files** -- file download/upload helpers
- **Rate Limiter** -- anti-spam
- **Auto-retry** -- handle rate limiting from Telegram API

### Verdict

Grammy is mature, well-documented, TypeScript-first, and has native Hono support. It is Telegram-only but does that one thing exceptionally well.

---

## 2. Vercel Chat SDK (`chat` npm package)

**Package**: `chat` | **Docs**: https://chat-sdk.dev | **Repo**: https://github.com/vercel/chat | **License**: MIT

### Architecture

```
Chat (orchestrator)
  |-- Adapters (per-platform: Slack, Discord, Telegram, Teams, etc.)
  |-- State (Redis, PostgreSQL, ioredis, in-memory)
  |-- Event Handlers (onNewMention, onSubscribedMessage, etc.)
```

### Setup

```bash
npm install chat @chat-adapter/telegram @chat-adapter/discord @chat-adapter/state-redis
```

```typescript
import { Chat } from 'chat'
import { createTelegramAdapter } from '@chat-adapter/telegram'
import { createDiscordAdapter } from '@chat-adapter/discord'
import { createRedisState } from '@chat-adapter/state-redis'

const bot = new Chat({
  userName: 'mybot',
  adapters: {
    telegram: createTelegramAdapter(),
    discord: createDiscordAdapter(),
  },
  state: createRedisState(),
})

bot.onNewMention(async (thread) => {
  await thread.subscribe()
  await thread.post("Hello! I'm listening.")
})

bot.onSubscribedMessage(async (thread, message) => {
  await thread.post(`You said: ${message.text}`)
})
```

### Supported Platforms & Features

| Platform    | Package                  | Mentions | Reactions | Cards           | Streaming | DMs | Slash Commands |
| ----------- | ------------------------ | -------- | --------- | --------------- | --------- | --- | -------------- |
| Slack       | `@chat-adapter/slack`    | Yes      | Yes       | Yes (Block Kit) | Native    | Yes | Yes            |
| Discord     | `@chat-adapter/discord`  | Yes      | Yes       | Yes (Embeds)    | Post+Edit | Yes | Yes            |
| Telegram    | `@chat-adapter/telegram` | Yes      | Yes       | Partial         | Post+Edit | Yes | No             |
| MS Teams    | `@chat-adapter/teams`    | Yes      | Read-only | Yes (Adaptive)  | Post+Edit | Yes | --             |
| Google Chat | `@chat-adapter/gchat`    | Yes      | Yes       | Yes             | Post+Edit | Yes | --             |
| GitHub      | `@chat-adapter/github`   | Yes      | Yes       | --              | --        | --  | --             |
| Linear      | `@chat-adapter/linear`   | Yes      | Yes       | --              | --        | --  | --             |
| WhatsApp    | `@chat-adapter/whatsapp` | --       | Yes       | Partial         | --        | Yes | --             |

### Webhook Integration with Hono

Each adapter exposes `bot.webhooks.{platform}`:

```typescript
import { Hono } from 'hono'

const app = new Hono()

app.post('/api/webhooks/telegram', async (c) => {
  const handler = bot.webhooks.telegram
  return handler(c.req.raw, { waitUntil })
})

app.post('/api/webhooks/discord', async (c) => {
  const handler = bot.webhooks.discord
  return handler(c.req.raw, { waitUntil })
})
```

### Telegram Adapter Specifics

- **Auto mode**: Automatically selects webhook (production) vs polling (local dev)
- **Env vars**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET_TOKEN`, `TELEGRAM_BOT_USERNAME`
- **Limitations**: No slash commands, no ephemeral messages, callback data limited to 64 bytes per button, message history is adapter-cached only (Telegram API limitation)

### Discord Adapter Specifics

- **Dual mode**: HTTP Interactions (slash commands, buttons -- serverless-friendly) + Gateway WebSocket (messages, reactions -- requires persistent process)
- **Env vars**: `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`
- **Serverless caveat**: Gateway connection needs a cron job every 9 minutes to stay alive
- **Limitations**: No select menus, no modals, no ephemeral messages

### State Adapters

| Adapter    | Package                       | Use Case                     |
| ---------- | ----------------------------- | ---------------------------- |
| Redis      | `@chat-adapter/state-redis`   | Production                   |
| ioredis    | `@chat-adapter/state-ioredis` | Production (cluster support) |
| PostgreSQL | `@chat-adapter/state-pg`      | Production                   |
| In-memory  | `@chat-adapter/state-memory`  | Development only             |

### Platform Independence

**Chat SDK is NOT tied to Vercel.** It runs on any Node.js runtime -- Railway, Fly.io, AWS, self-hosted. State backends (Redis, PostgreSQL) are also platform-agnostic.

### AI SDK Integration

- First-class streaming LLM support
- Slack gets native streaming; all other platforms use post-then-edit pattern
- Works with Vercel AI SDK's `generateText`/`streamText`
- JSX cards render natively on each platform

### Verdict

Write-once, deploy-everywhere for chat bots. Good abstraction, but it is in **public beta** (released recently). Adds a layer of indirection that may limit access to platform-specific features. Requires Redis/PG for production state. The event model is mention-centric (`onNewMention`, `onSubscribedMessage`) which works well for assistant-style bots but may not suit all patterns.

---

## 3. Discord.js

**Package**: `discord.js` (currently v14.x) | **Docs**: https://discord.js.org | **Guide**: https://discordjs.guide

### Setup

```bash
npm install discord.js
```

```typescript
const { Client, GatewayIntentBits, Events } = require('discord.js')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Privileged intent -- must enable in Developer Portal
  ],
})

client.on(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}!`)
})

client.on('messageCreate', (message) => {
  if (message.author.bot) return
  if (message.content === 'hello') {
    message.reply('world')
  }
})

client.login(process.env.DISCORD_TOKEN)
```

### Gateway (WebSocket) vs HTTP Interactions

| Aspect             | Gateway (WebSocket)                                      | HTTP Interactions                                   |
| ------------------ | -------------------------------------------------------- | --------------------------------------------------- |
| Connection         | Persistent WebSocket to Discord                          | Stateless HTTP POST to your endpoint                |
| Receives           | All events: messages, reactions, presence, typing, joins | Only: slash commands, buttons, select menus, modals |
| Reading messages   | Yes (with MessageContent intent)                         | No -- cannot read message content                   |
| Serverless         | Difficult (needs persistent process)                     | Native fit                                          |
| Discord.js support | Full support (primary mode)                              | **NOT supported by discord.js**                     |

**Critical**: Discord.js only supports the Gateway (WebSocket) approach. It does NOT support HTTP-only interactions. For HTTP interactions without Gateway, you need `discord-interactions` or frameworks like Carbon.

### Gateway Intents (v14)

Must declare intents explicitly:

- `GatewayIntentBits.Guilds` -- guild/channel data
- `GatewayIntentBits.GuildMessages` -- message events in guilds
- `GatewayIntentBits.MessageContent` -- access message text (privileged, must enable in portal)
- `GatewayIntentBits.GuildMessageReactions` -- reaction events
- `GatewayIntentBits.DirectMessages` -- DM events

### Key Events

```typescript
client.on('messageCreate', (msg) => {}) // new message
client.on('interactionCreate', (i) => {}) // slash command / button / modal
client.on('messageReactionAdd', (r, u) => {}) // reaction added
client.on('guildMemberAdd', (member) => {}) // user joined
```

### Webhook Integration with Hono

Discord.js is a **WebSocket-based library** -- it does not integrate with HTTP frameworks for receiving events. It maintains its own persistent connection to Discord's Gateway. You would run it as a standalone process alongside your Hono server.

```typescript
// Discord.js runs as a separate long-lived process
const client = new Client({ intents: [...] });
client.login(token);

// Your Hono API runs separately
const app = new Hono();
app.post("/api/webhook/other", ...);
serve({ fetch: app.fetch, port: 3001 });
```

### Verdict

Discord.js is the de facto standard for Discord bots. Full-featured, mature, huge ecosystem. However, it requires a persistent WebSocket connection (no serverless), and is Discord-only. Does not integrate with HTTP webhook patterns.

---

## Trade-Off Analysis

### Option A: Grammy.js Only (Telegram-only, simple)

**Pros:**

- Simplest approach -- one library, one platform
- Native Hono adapter (`webhookCallback(bot, "hono")`) -- fits directly into existing API server
- Full TypeScript, 1150+ filter queries, excellent DX
- Lightweight, minimal dependencies
- Can share the same Hono process as the existing `apps/api` server
- Mature, well-documented

**Cons:**

- Telegram only -- adding Discord/Slack later means starting from scratch
- No code reuse if you expand to other platforms

**Best for:** MVP or Telegram-first strategy. Can always add other platforms later.

### Option B: Vercel Chat SDK (Multi-platform abstraction)

**Pros:**

- Single codebase for Telegram + Discord + Slack + 5 more platforms
- Unified event model (`onNewMention`, `onSubscribedMessage`)
- AI SDK integration with streaming out of the box
- Platform-independent (runs on Railway/Fly/anywhere with Node.js)
- Webhook handlers for each platform (`bot.webhooks.telegram`, etc.)

**Cons:**

- **Public beta** -- API surface may change, edge cases in adapters
- Abstraction limits access to platform-specific features
- Requires external state (Redis or PostgreSQL) for production
- Discord adapter needs Gateway WebSocket for message reading (not purely webhook-based)
- Mention-centric event model may not suit all bot patterns
- Telegram adapter has no slash command support, limited card rendering
- Additional layer of indirection to debug when things go wrong
- Smaller community, less battle-tested than Grammy or Discord.js

**Best for:** Multi-platform from day one, assistant-style bots that respond to mentions.

### Option C: Individual Libraries (Grammy.js + Discord.js + ...)

**Pros:**

- Full access to every platform's features
- Each library is mature, well-documented, large community
- No abstraction overhead -- you control everything
- Can add platforms incrementally

**Cons:**

- Separate codebases per platform (message handling, state, formatting)
- Discord.js requires persistent WebSocket process (can't share Hono server)
- More total code to maintain
- Must build your own unified message/state layer if you want cross-platform logic

**Best for:** When you need deep platform-specific features and are willing to maintain separate integrations.

### Recommendation Matrix

| Criteria             | Grammy Only            | Chat SDK             | Individual Libraries                       |
| -------------------- | ---------------------- | -------------------- | ------------------------------------------ |
| Time to MVP          | Fastest                | Medium               | Slowest                                    |
| Multi-platform       | No                     | Yes (day 1)          | Yes (incremental)                          |
| Platform depth       | Deep (Telegram)        | Shallow (abstracted) | Deep (all)                                 |
| Hono integration     | Native adapter         | Webhook handlers     | Grammy native, Discord.js separate process |
| Production readiness | High                   | Beta                 | High                                       |
| Maintenance burden   | Low                    | Medium               | High                                       |
| AI streaming         | DIY                    | Built-in             | DIY                                        |
| State management     | DIY or Grammy sessions | Redis/PG built-in    | DIY                                        |

### Architecture Implications for Inkdown

Given the existing Hono API server at `apps/api`:

1. **Grammy.js** can plug directly into the existing Hono app as middleware on a `/webhook/telegram` route. Zero new processes needed.

2. **Chat SDK** can also plug into Hono via `bot.webhooks.{platform}` handlers, but the Discord adapter needs a Gateway WebSocket which means a separate persistent process or cron-based connection maintenance.

3. **Discord.js** always needs a separate persistent process. It cannot share the Hono server for receiving Discord events.

---

## Key Links

- Grammy.js: https://grammy.dev
- Grammy GitHub: https://github.com/grammyjs/grammY
- Chat SDK: https://chat-sdk.dev
- Chat SDK GitHub: https://github.com/vercel/chat
- Discord.js: https://discord.js.org
- Discord.js Guide: https://discordjs.guide
