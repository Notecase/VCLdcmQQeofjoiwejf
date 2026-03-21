/**
 * Demo mode fixture data for Courses.
 *
 * Two complete courses with modules and lessons:
 * 1. OpenClaw: Self-Hosted AI Gateway (beginner)
 * 2. Scaling Laws in AI (intermediate)
 */

import type { Course, CourseModule, CourseSettings } from '@inkdown/shared/types'

// =============================================================================
// Helpers
// =============================================================================

const NOW = '2026-02-09T00:00:00Z'

const defaultSettings: CourseSettings = {
  includeVideos: false,
  includeSlides: true,
  includePractice: true,
  includeQuizzes: true,
  estimatedWeeks: 4,
  hoursPerWeek: 3,
  focusAreas: [],
  maxSlidesPerLesson: 8,
}

// =============================================================================
// Course 1: OpenClaw
// =============================================================================

const openclawModules: CourseModule[] = [
  // Module 1 - Getting Started
  {
    id: 'oc-m1',
    courseId: 'demo-course-openclaw',
    title: 'Getting Started',
    description: 'Introduction to OpenClaw and initial setup',
    order: 0,
    status: 'available',
    progress: 0,
    lessons: [
      {
        id: 'oc-m1-l1',
        moduleId: 'oc-m1',
        title: 'What is OpenClaw?',
        type: 'lecture',
        duration: '20 min',
        order: 0,
        status: 'available',
        content: {
          markdown: `# What is OpenClaw?

OpenClaw is an **open-source, self-hosted AI agent runtime** that lets you connect multiple AI providers (OpenAI, Anthropic, local models) behind a single hub-and-spoke WebSocket architecture. Think of it as a multi-agent orchestration layer — your applications connect to OpenClaw sessions, and OpenClaw routes messages to the right agent and provider based on workspaces you define. All state is persisted locally in SQLite.

## Why OpenClaw?

Modern applications rarely rely on a single AI provider. You might use GPT-5.2 for creative writing, Claude Sonnet 4.5 for analysis, and a local Llama model for sensitive data. Without a runtime, each integration requires its own SDK, error handling, and configuration.

OpenClaw solves this by providing:

- **Unified API**: One WebSocket endpoint for all providers. Switch providers without changing application code.
- **Hub-and-Spoke Sessions**: Create isolated workspaces with dedicated agent sessions and SQLite storage.
- **Multi-Channel Support**: Connect AI to WhatsApp, Telegram, Discord, Slack, iMessage, Signal, and custom webhooks.
- **Tool System**: Extend functionality with tools, cron jobs, webhooks, and Canvas support.
- **Cost Management**: Track token usage and costs across all providers with built-in dashboards.

## Architecture Overview

\`\`\`
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Your App   │◄═══►│     OpenClaw Hub      │────>│  AI Providers   │
│  (WebSocket)│     ├──────────────────────┤     │  (OpenAI, etc.) │
└─────────────┘     │  ┌────────────────┐  │     └─────────────────┘
                    │  │  Workspace A   │  │
┌─────────────┐     │  │  ├─ Session 1  │  │     ┌─────────────────┐
│  Channels   │◄═══►│  │  ├─ Session 2  │  │     │  Local Models   │
│  (WA/TG/DC) │     │  │  └─ SQLite DB  │  │     │  (Ollama, etc.) │
└─────────────┘     │  ├────────────────┤  │     └─────────────────┘
                    │  │  Workspace B   │  │
                    │  │  └─ Session 3  │  │
                    │  └────────────────┘  │
                    └──────────────────────┘
\`\`\`

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Provider** | An AI service backend (OpenAI, Anthropic, Ollama) |
| **Workspace** | An isolated environment with its own agents, sessions, and SQLite storage |
| **Session** | A stateful conversation thread within a workspace |
| **Channel** | An external messaging platform (WhatsApp, Telegram) |
| **Tool** | An extension that adds capabilities (tools, cron, webhooks, Canvas) |
| **Agent** | A configured AI persona with specific instructions and model |

## Getting Started

To install OpenClaw, you need Node.js 22+ and curl. The quickest way:

\`\`\`bash
curl -fsSL https://openclaw.ai/install.sh | bash
openclaw onboard --install-daemon
\`\`\`

This installs the OpenClaw daemon and runs initial setup. The runtime will be available at \`http://localhost:18789\`.

In the next lessons, we'll explore the architecture in detail and get your first gateway running.`,
          keyTerms: [
            {
              term: 'Hub',
              definition: 'The central OpenClaw runtime that orchestrates agents and sessions',
            },
            { term: 'Provider', definition: 'An AI service backend like OpenAI or Anthropic' },
            {
              term: 'Workspace',
              definition:
                'An isolated environment with its own agents, sessions, and SQLite storage',
            },
          ],
        },
      },
      {
        id: 'oc-m1-l2',
        moduleId: 'oc-m1',
        title: 'Architecture Overview',
        type: 'lecture',
        duration: '25 min',
        order: 1,
        status: 'available',
        content: {
          markdown: `# Architecture Overview

OpenClaw follows a hub-and-spoke architecture with clear separation of concerns. Understanding these layers is crucial for effective configuration and tool development.

## Request Lifecycle

Every message flows through these stages:

1. **Ingestion** — The message arrives via WebSocket connection or a channel adapter (WhatsApp, Telegram).
2. **Authentication** — API keys or channel tokens are validated.
3. **Session Lookup** — The hub resolves the target workspace and session.
4. **Routing** — The router evaluates workspace rules and selects the target agent and provider.
5. **Transformation** — The message is converted from OpenClaw format to the provider's SDK format.
6. **Execution** — The request is sent to the AI provider.
7. **Tool Execution** — Any registered tools are invoked as needed.
8. **Response** — The unified response is returned to the caller via WebSocket.

## Configuration File

OpenClaw uses a JSON5 configuration file (\`~/.openclaw/openclaw.json\`) in the user's home directory:

\`\`\`json5
// ~/.openclaw/openclaw.json
{
  server: {
    port: 18789,
    cors: true,
  },
  providers: {
    openai: {
      apiKey: "\${OPENAI_API_KEY}",
      models: ["google/gemini-3.1-pro-preview"],
    },
    anthropic: {
      apiKey: "\${ANTHROPIC_API_KEY}",
      models: ["anthropic/claude-sonnet-4-5", "anthropic/claude-opus-4-5"],
    },
  },
  routes: [
    {
      name: "default",
      match: "*",
      model: "anthropic/claude-sonnet-4-5",
    },
    {
      name: "premium",
      match: { header: "x-tier=premium" },
      model: "anthropic/claude-opus-4-5",
    },
  ],
  tools: [
    { name: "rate-limiter", config: { maxRequests: 100, windowMs: 60000 } },
    { name: "cost-tracker" },
  ],
}
\`\`\`

## Key Directories

| Directory | Purpose |
|-----------|---------|
| \`~/.openclaw/\` | Main config, SQLite databases, and workspace state |
| \`~/.openclaw/tools/\` | Custom and built-in tools |
| \`~/.openclaw/channels/\` | Channel adapters (WhatsApp, Telegram, etc.) |
| \`~/.openclaw/workspaces/\` | Per-workspace data and sessions |
| \`~/.openclaw/logs/\` | Structured log output |

## Environment Variables

OpenClaw reads provider API keys from environment variables. Never hardcode secrets in configuration files. Use a \`.env\` file or export directly:

\`\`\`bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENCLAW_SECRET=your-admin-secret
\`\`\`

The architecture is designed for extensibility — every layer can be customized through the tool system, which we'll explore in Module 4.`,
          keyTerms: [
            {
              term: 'Request Lifecycle',
              definition: 'The stages a message passes through from ingestion to response',
            },
            {
              term: 'Workspace',
              definition:
                'An isolated environment that determines which agent and provider handle a request',
            },
            {
              term: 'Tool',
              definition:
                'An extension that adds capabilities to the runtime (tools, cron, webhooks)',
            },
          ],
        },
      },
      {
        id: 'oc-m1-l3',
        moduleId: 'oc-m1',
        title: 'Installation & First Run',
        type: 'practice',
        duration: '30 min',
        order: 2,
        status: 'available',
        content: {
          markdown: `# Installation & First Run

In this hands-on lesson, you'll install OpenClaw and make your first AI request through the runtime.

## Prerequisites

- Node.js 22 or later
- curl
- An API key from at least one AI provider (Anthropic recommended for this exercise)

## Steps

Follow the practice problems below to get OpenClaw running on your machine.`,
          practiceProblems: [
            {
              id: 'oc-p1',
              type: 'short-answer',
              question:
                'Run `curl -fsSL https://openclaw.ai/install.sh | bash` followed by `openclaw onboard --install-daemon` and paste the output showing the server URL.',
              explanation:
                'The installer downloads the OpenClaw daemon and onboard runs initial setup (default address: http://localhost:18789).',
              sampleAnswer: 'OpenClaw daemon running at http://localhost:18789',
            },
            {
              id: 'oc-p2',
              type: 'multiple-choice',
              question: 'Which file contains the main OpenClaw configuration?',
              options: ['package.json', '~/.openclaw/openclaw.json', '.env', 'tsconfig.json'],
              correctIndex: 1,
              explanation:
                '~/.openclaw/openclaw.json (JSON5 format) is the main configuration file that defines providers, routes, and tools.',
            },
            {
              id: 'oc-p3',
              type: 'short-answer',
              question:
                'Make a curl request to your running runtime: `curl http://localhost:18789/v1/chat/completions -H "Content-Type: application/json" -d \'{"model":"anthropic/claude-sonnet-4-5","messages":[{"role":"user","content":"Hello"}]}\'`. What response did you get?',
              explanation:
                'The runtime should proxy the request to Anthropic and return a chat completion response.',
              sampleAnswer:
                'A JSON response with choices[0].message.content containing the AI reply.',
            },
          ],
        },
      },
    ],
  },

  // Module 2 - Multi-Channel Setup
  {
    id: 'oc-m2',
    courseId: 'demo-course-openclaw',
    title: 'Multi-Channel Setup',
    description: 'Connect AI to messaging platforms',
    order: 1,
    status: 'available',
    progress: 0,
    lessons: [
      {
        id: 'oc-m2-l1',
        moduleId: 'oc-m2',
        title: 'Channel Concepts',
        type: 'lecture',
        duration: '20 min',
        order: 0,
        status: 'available',
        content: {
          markdown: `# Channel Concepts

Channels are the bridge between messaging platforms and your AI runtime. Each channel adapter translates platform-specific message formats into OpenClaw's unified format and back.

## How Channels Work

When a user sends a message on WhatsApp, the channel adapter:

1. Receives the webhook from the platform
2. Extracts the message text, sender ID, and metadata
3. Converts it to an OpenClaw \`ChatMessage\`
4. Sends it through the routing pipeline
5. Receives the AI response
6. Converts it back to the platform's format
7. Sends the reply to the user

## Supported Channels

| Channel | Status | Auth Method |
|---------|--------|-------------|
| WhatsApp (Baileys) | Stable | QR Code pairing |
| Telegram Bot (grammY) | Stable | Bot Token |
| Discord Bot | Stable | Bot Token |
| Slack | Beta | OAuth |
| iMessage | Beta | Apple ID |
| Signal | Beta | Signal account |
| Google Chat | Beta | Service Account |
| Mattermost | Stable | Bot Token |
| MS Teams | Beta | Azure AD |
| Custom Webhook | Stable | API Key |

## Channel Configuration

Each channel is configured in \`~/.openclaw/openclaw.json\`:

\`\`\`json5
{
  channels: {
    whatsapp: {
      enabled: true,
      // Baileys-based: just scan a QR code to pair
      agent: "customer-support",  // Which agent handles this channel
      dmPolicy: "allowlist",      // pairing | allowlist | open | disabled
    },
    telegram: {
      enabled: true,
      botToken: "\${TG_BOT_TOKEN}",
      agent: "general-assistant",
      dmPolicy: "open",
    },
  },
}
\`\`\`

## DM Policy

Each channel supports a \`dmPolicy\` that controls who can interact:

| Policy | Behavior |
|--------|----------|
| **pairing** | Users must be explicitly paired before messaging |
| **allowlist** | Only pre-approved users can interact |
| **open** | Anyone can message the agent |
| **disabled** | Channel receives but does not respond to DMs |

## Agent-Channel Binding

Each channel is bound to an **agent** — a configured AI persona. This means the WhatsApp channel could use a customer-support-focused agent while Telegram uses a general-purpose assistant. Different channels, different personalities, same runtime.

The agent configuration includes system prompts, model selection, and behavioral parameters. We'll explore this in Module 3.`,
          keyTerms: [
            {
              term: 'Channel',
              definition: 'An adapter connecting a messaging platform to OpenClaw',
            },
            {
              term: 'Agent',
              definition: 'A configured AI persona with specific instructions and model',
            },
            {
              term: 'dmPolicy',
              definition:
                'Controls who can interact with the agent on a channel (pairing, allowlist, open, disabled)',
            },
          ],
        },
      },
      {
        id: 'oc-m2-l2',
        moduleId: 'oc-m2',
        title: 'WhatsApp Integration',
        type: 'lecture',
        duration: '25 min',
        order: 1,
        status: 'available',
        content: {
          markdown: `# WhatsApp Integration

WhatsApp integration is one of OpenClaw's most popular features. OpenClaw uses **Baileys** (the WhatsApp Web protocol) rather than Meta's Cloud API, making setup much simpler — just scan a QR code.

## Prerequisites

- A WhatsApp account (personal or business)
- OpenClaw daemon running on port 18789

## Setup Steps

### 1. Enable WhatsApp Channel

Add the WhatsApp channel to your \`~/.openclaw/openclaw.json\`:

\`\`\`json5
{
  channels: {
    whatsapp: {
      enabled: true,
      agent: "customer-support",
      dmPolicy: "allowlist",
    },
  },
}
\`\`\`

### 2. Scan QR Code

Run the pairing command and scan the QR code with your WhatsApp app:

\`\`\`bash
openclaw channel pair whatsapp
\`\`\`

This opens a terminal QR code. Scan it from WhatsApp > Linked Devices > Link a Device.

### 3. Verify Connection

Once paired, verify the connection:

\`\`\`bash
curl http://localhost:18789/channels/whatsapp/status
\`\`\`

### 4. Test the Integration

Send a message to your WhatsApp number from another phone. You should see the message flow through the OpenClaw logs and receive an AI-generated reply.

## Message Types

OpenClaw handles various WhatsApp message types:

| Type | Support | Notes |
|------|---------|-------|
| Text | Full | Bidirectional |
| Image | Receive | Vision models can process images |
| Audio | Receive | Transcribed via Whisper |
| Document | Receive | Text extraction supported |
| Location | Receive | Geocoding available |
| Buttons | Send | Interactive reply buttons |
| Lists | Send | Interactive list menus |

## Error Handling

WhatsApp has strict rate limits and delivery requirements. OpenClaw handles:
- Automatic retry on rate-limited responses
- Message status tracking (sent, delivered, read)
- Fallback to simpler formats when rich messages fail`,
          keyTerms: [
            {
              term: 'Baileys',
              definition:
                'Open-source WhatsApp Web protocol library used by OpenClaw for WhatsApp integration',
            },
            {
              term: 'QR Pairing',
              definition:
                'Authentication method where you scan a QR code to link your WhatsApp account',
            },
          ],
        },
      },
      {
        id: 'oc-m2-l3',
        moduleId: 'oc-m2',
        title: 'Telegram & Discord',
        type: 'lecture',
        duration: '20 min',
        order: 2,
        status: 'available',
        content: {
          markdown: `# Telegram & Discord Integration

Both Telegram and Discord use bot tokens for authentication, making them simpler to set up than WhatsApp.

## Telegram Setup

OpenClaw uses the **grammY** framework for Telegram integration.

### 1. Create a Bot

Talk to @BotFather on Telegram:
- Send \`/newbot\`
- Choose a name and username
- Copy the bot token

### 2. Configure OpenClaw

\`\`\`json5
{
  channels: {
    telegram: {
      enabled: true,
      botToken: "\${TG_BOT_TOKEN}",
      agent: "study-assistant",
      webhook: true,  // Use webhook mode (recommended for production)
      dmPolicy: "open",
    },
  },
}
\`\`\`

### 3. Set Webhook

OpenClaw automatically registers the webhook when it starts. For manual setup:

\`\`\`bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-domain.com/channels/telegram/webhook"
\`\`\`

## Discord Setup

### 1. Create a Discord Application

Go to the Discord Developer Portal:
- Create a new Application
- Go to Bot settings and create a bot
- Copy the bot token
- Enable the Message Content Intent

### 2. Configure OpenClaw

\`\`\`json5
{
  channels: {
    discord: {
      enabled: true,
      botToken: "\${DC_BOT_TOKEN}",
      agent: "community-helper",
      guilds: ["123456789"],  // Optional: restrict to specific servers
      dmPolicy: "open",
    },
  },
}
\`\`\`

### 3. Invite the Bot

Generate an invite URL with the required permissions (Send Messages, Read Message History, Add Reactions).

## Comparison

| Feature | Telegram | Discord |
|---------|----------|---------|
| Setup complexity | Low | Low |
| Framework | grammY | discord.js |
| Message types | Text, images, files | Text, embeds, files |
| Group support | Yes | Yes (channels & threads) |
| Rate limits | 30 msg/sec | 50 req/sec per guild |
| Webhook mode | Yes | Yes (via interactions) |

Both platforms work great with OpenClaw. Choose based on where your users already are.`,
          keyTerms: [
            {
              term: 'Bot Token',
              definition: 'Authentication credential for a bot account on messaging platforms',
            },
            {
              term: 'grammY',
              definition: 'The Telegram bot framework used by OpenClaw for Telegram integration',
            },
          ],
        },
      },
      {
        id: 'oc-m2-l4',
        moduleId: 'oc-m2',
        title: 'Channel Config Quiz',
        type: 'quiz',
        duration: '10 min',
        order: 3,
        status: 'available',
        content: {
          markdown:
            '# Channel Configuration Quiz\n\nTest your understanding of OpenClaw channel setup and concepts.',
          practiceProblems: [
            {
              id: 'oc-q1-1',
              type: 'multiple-choice',
              question: 'What does a channel adapter do?',
              options: [
                'Routes requests to AI providers',
                'Translates platform messages to/from OpenClaw format',
                'Manages API keys for providers',
                'Stores conversation history',
              ],
              correctIndex: 1,
              explanation:
                "Channel adapters convert between platform-specific formats and OpenClaw's unified message format.",
            },
            {
              id: 'oc-q1-2',
              type: 'multiple-choice',
              question: 'How does OpenClaw authenticate with WhatsApp?',
              options: [
                'Bot Token',
                'OAuth 2.0',
                'QR code pairing via Baileys',
                'Username/Password',
              ],
              correctIndex: 2,
              explanation:
                'OpenClaw uses Baileys (WhatsApp Web protocol) and authenticates by scanning a QR code from the Linked Devices menu.',
            },
            {
              id: 'oc-q1-3',
              type: 'multiple-choice',
              question: 'What is an "agent" in OpenClaw?',
              options: [
                'A background worker process',
                'A configured AI persona with specific instructions and model',
                'A monitoring dashboard',
                'A load balancer instance',
              ],
              correctIndex: 1,
              explanation:
                'An agent is a configured AI persona bound to a channel, with its own system prompt and model selection.',
            },
            {
              id: 'oc-q1-4',
              type: 'multiple-choice',
              question: 'Which field in openclaw.json binds a channel to a specific AI persona?',
              options: ['model', 'provider', 'agent', 'route'],
              correctIndex: 2,
              explanation:
                'The "agent" field in channel configuration binds the channel to a specific AI persona.',
            },
          ],
        },
      },
    ],
  },

  // Module 3 - Agent Routing & AI
  {
    id: 'oc-m3',
    courseId: 'demo-course-openclaw',
    title: 'Agent Routing & AI',
    description: 'Configure intelligent request routing',
    order: 2,
    status: 'available',
    progress: 0,
    lessons: [
      {
        id: 'oc-m3-l1',
        moduleId: 'oc-m3',
        title: 'Connecting AI Providers',
        type: 'lecture',
        duration: '25 min',
        order: 0,
        status: 'available',
        content: {
          markdown: `# Connecting AI Providers

OpenClaw supports multiple AI providers out of the box. Each provider is configured with its API credentials and available models. Models use a unified \`"provider/model"\` string format.

## Supported Providers

| Provider | Models | Streaming | Function Calling |
|----------|--------|-----------|------------------|
| Google | Gemini 3.1 Pro (\`google/gemini-3.1-pro-preview\`) | Yes | Yes |
| Anthropic | Claude Opus 4.5 (\`anthropic/claude-opus-4-5\`), Sonnet 4.5 (\`anthropic/claude-sonnet-4-5\`), Haiku 4.5 (\`anthropic/claude-haiku-4-5\`) | Yes | Yes |
| Ollama | Any local model | Yes | Partial |
| Azure OpenAI | Gemini 3.1 Pro (via Azure) | Yes | Yes |

## Configuration

Add providers to your \`~/.openclaw/openclaw.json\`:

\`\`\`json5
{
  providers: {
    openai: {
      apiKey: "\${OPENAI_API_KEY}",
      organization: "\${OPENAI_ORG_ID}",  // Optional
      models: ["google/gemini-3.1-pro-preview"],
      defaults: {
        temperature: 0.7,
        maxTokens: 2048,
      },
    },
    anthropic: {
      apiKey: "\${ANTHROPIC_API_KEY}",
      models: [
        "anthropic/claude-opus-4-5",
        "anthropic/claude-sonnet-4-5",
        "anthropic/claude-haiku-4-5",
      ],
      defaults: {
        maxTokens: 4096,
      },
    },
    ollama: {
      baseUrl: "http://localhost:11434",
      models: ["ollama/llama3", "ollama/mistral"],
    },
  },
}
\`\`\`

## Provider Health Checks

OpenClaw periodically checks provider availability. If a provider goes down, requests are automatically rerouted to a fallback:

\`\`\`json5
{
  routes: [
    {
      name: "resilient",
      model: "google/gemini-3.1-pro-preview",
      fallback: "anthropic/claude-sonnet-4-5",
    },
  ],
}
\`\`\`

## Cost Tracking

Each provider reports token usage. OpenClaw aggregates this into cost dashboards:

- Per-provider cost breakdown
- Per-agent cost tracking
- Daily/weekly/monthly reports
- Budget alerts and limits`,
          keyTerms: [
            { term: 'Provider', definition: 'A configured connection to an AI service backend' },
            {
              term: 'Fallback',
              definition: 'An alternative provider/model used when the primary is unavailable',
            },
          ],
        },
      },
      {
        id: 'oc-m3-l2',
        moduleId: 'oc-m3',
        title: 'Routing Rules',
        type: 'lecture',
        duration: '25 min',
        order: 1,
        status: 'available',
        content: {
          markdown: `# Routing Rules

The router is the brain of OpenClaw. It evaluates incoming messages against workspace rules and determines which agent and model should handle each request. Workspaces provide isolation, and sessions within workspaces maintain conversation state.

## Rule Anatomy

Each route has these components:

\`\`\`json5
{
  routes: [
    {
      name: "premium-coding",     // Unique identifier
      priority: 10,               // Higher = evaluated first
      match: {                    // Conditions to check
        header: "x-tier=premium",
        category: "coding",
      },
      model: "anthropic/claude-opus-4-5",  // Unified provider/model
      transform: {                // Optional request modifications
        systemPrompt: "You are a senior software engineer.",
        temperature: 0.3,
      },
    },
  ],
}
\`\`\`

## Matching Strategies

| Strategy | Example | Use Case |
|----------|---------|----------|
| Header match | \`header: "x-tier=premium"\` | Tier-based routing |
| Path match | \`path: "/v1/code/*"\` | Endpoint-based routing |
| Content match | \`contains: "translate"\` | Intent-based routing |
| Model match | \`model: "google/gemini-3.1-pro-preview"\` | Model preference routing |
| Random | \`weight: 0.3\` | A/B testing, load distribution |
| Time-based | \`schedule: "9-17 EST"\` | Cost optimization |

## Priority and Fallthrough

Routes are evaluated in priority order (highest first). The first matching route wins. If no route matches, the default route is used.

## Dynamic Routing with Tools

For complex routing logic, register a router tool:

\`\`\`typescript
import { defineTool } from '@openclaw/sdk'

export default defineTool({
  name: 'smart-router',
  type: 'router',
  async execute(ctx) {
    // Analyze message content and set routing hints
    if (ctx.message.includes('code')) {
      ctx.routeHint = 'coding-specialist'
    }
  },
})
\`\`\`

This gives you full programmatic control over routing decisions.`,
          keyTerms: [
            {
              term: 'Route Priority',
              definition: 'Numeric value determining rule evaluation order (higher first)',
            },
            {
              term: 'Fallthrough',
              definition: 'When a route does not match, evaluation continues to the next rule',
            },
          ],
        },
      },
      {
        id: 'oc-m3-l3',
        moduleId: 'oc-m3',
        title: 'Multi-Agent Routing Lab',
        type: 'practice',
        duration: '35 min',
        order: 2,
        status: 'available',
        content: {
          markdown: `# Multi-Agent Routing Lab

Configure a gateway with multiple agents and routing rules to handle different types of requests.`,
          practiceProblems: [
            {
              id: 'oc-p3-1',
              type: 'short-answer',
              question:
                'Write a JSON5 route config that sends requests with the header `x-purpose: creative` to Claude Opus 4.5 and all other requests to Claude Haiku 4.5.',
              explanation: 'You need two routes: one with header matching and a default fallback.',
              sampleAnswer:
                'routes: [\n  { name: "creative", match: { header: "x-purpose=creative" }, model: "anthropic/claude-opus-4-5" },\n  { name: "default", match: "*", model: "anthropic/claude-haiku-4-5" },\n]',
            },
            {
              id: 'oc-p3-2',
              type: 'multiple-choice',
              question: 'If two routes both match a request, which one is selected?',
              options: [
                'The first defined in the config',
                'The one with higher priority',
                'A random choice',
                'Both are executed',
              ],
              correctIndex: 1,
              explanation:
                'Routes are evaluated by priority (highest first). The first matching route wins.',
            },
          ],
        },
      },
    ],
  },

  // Module 4 - Plugin Development
  {
    id: 'oc-m4',
    courseId: 'demo-course-openclaw',
    title: 'Plugin Development',
    description: 'Build custom plugins to extend OpenClaw',
    order: 3,
    status: 'available',
    progress: 0,
    lessons: [
      {
        id: 'oc-m4-l1',
        moduleId: 'oc-m4',
        title: 'Plugin Architecture',
        type: 'lecture',
        duration: '25 min',
        order: 0,
        status: 'available',
        content: {
          markdown: `# Plugin Architecture

OpenClaw uses a **tool-based extension model**. Extensions are registered as tools, cron jobs, webhooks, or Canvas apps — not lifecycle hooks. This design keeps extensions modular and composable.

## Extension Types

| Type | Description | Example |
|------|-------------|---------|
| **Tool** | A callable function agents can invoke | Web search, database query |
| **Cron** | A scheduled task that runs periodically | Daily report, cleanup job |
| **Webhook** | An HTTP endpoint that triggers actions | GitHub push handler, payment callback |
| **Canvas** | An interactive UI component | Dashboard, form, visualization |

## Tool Structure

A tool is a JavaScript/TypeScript module that exports a tool definition:

\`\`\`typescript
import { defineTool } from '@openclaw/sdk'

export default defineTool({
  name: 'my-tool',
  version: '1.0.0',
  description: 'Describes what this tool does for the agent',

  parameters: {
    query: { type: 'string', description: 'Search query', required: true },
  },

  async execute(params, ctx) {
    // Called when an agent invokes this tool
    console.log('Tool invoked with:', params.query)
    return { result: 'Tool output here' }
  },
})
\`\`\`

## Extension Registration

| Pattern | When It Runs | Use Cases |
|---------|-------------|-----------|
| \`tool\` | When an agent invokes it | Search, API calls, data retrieval |
| \`cron\` | On a schedule | Reports, cleanup, health checks |
| \`webhook\` | On incoming HTTP request | External integrations, callbacks |
| \`canvas\` | When a user opens the Canvas | Dashboards, interactive UIs |

## Tool Configuration

Tools receive their configuration from the main config file:

\`\`\`json5
{
  tools: [
    {
      name: "my-tool",
      config: {
        logLevel: "debug",
        maxRetries: 3,
      },
    },
  ],
}
\`\`\`

Access the config in your tool via \`ctx.config\`.

## Built-in Tools

OpenClaw ships with several built-in tools: \`rate-limiter\`, \`cost-tracker\`, \`cache\`, \`logger\`, \`retry\`, and \`web-search\`.`,
          keyTerms: [
            {
              term: 'Tool',
              definition: 'A callable extension that agents can invoke during conversations',
            },
            {
              term: 'Canvas',
              definition: 'An interactive UI component rendered within the OpenClaw interface',
            },
          ],
        },
      },
      {
        id: 'oc-m4-l2',
        moduleId: 'oc-m4',
        title: 'Plugin Lifecycle',
        type: 'slides',
        duration: '15 min',
        order: 1,
        status: 'available',
        content: {
          markdown:
            '# Tool Extension Model\n\nVisual walkthrough of how tools, cron jobs, webhooks, and Canvas extend OpenClaw.',
          slides: [
            {
              id: 1,
              title: 'Tool Extension Model',
              subtitle: 'How extensions integrate with the OpenClaw runtime',
              bullets: [
                'Extensions register as tools, cron, webhooks, or Canvas',
                'Agents invoke tools during conversations',
                'Each extension is isolated and composable',
              ],
            },
            {
              id: 2,
              title: 'Tools',
              subtitle: 'Agent-callable functions',
              bullets: [
                'Defined with defineTool() from @openclaw/sdk',
                'Agents decide when to call them based on descriptions',
                'Receive parameters and execution context',
                'Return structured results to the agent',
              ],
            },
            {
              id: 3,
              title: 'Cron Jobs',
              subtitle: 'Scheduled background tasks',
              bullets: [
                'Run on a configurable schedule (cron syntax)',
                'Useful for reports, cleanup, monitoring',
                'Execute independently of agent sessions',
              ],
            },
            {
              id: 4,
              title: 'Webhooks',
              subtitle: 'External HTTP triggers',
              bullets: [
                'Register custom HTTP endpoints',
                'Handle callbacks from external services',
                'Can trigger agent actions or update state',
              ],
            },
            {
              id: 5,
              title: 'Canvas',
              subtitle: 'Interactive UI components',
              bullets: [
                'Render custom dashboards and forms',
                'Agents can generate Canvas content',
                'Supports real-time updates via WebSocket',
              ],
            },
            {
              id: 6,
              title: 'Composing Extensions',
              subtitle: 'Building complex workflows',
              bullets: [
                'Tools can call other tools',
                'Cron jobs can trigger webhooks',
                'Canvas apps can invoke tools on user interaction',
                'All extensions share the same config system',
              ],
            },
          ],
        },
      },
      {
        id: 'oc-m4-l3',
        moduleId: 'oc-m4',
        title: 'Build a Custom Plugin',
        type: 'practice',
        duration: '40 min',
        order: 2,
        status: 'available',
        content: {
          markdown: `# Build a Custom Tool

Create a token budget tool that tracks cumulative token usage and can be queried by agents to check remaining budget.`,
          practiceProblems: [
            {
              id: 'oc-p4-1',
              type: 'short-answer',
              question:
                'Write a tool using `defineTool()` that returns the current daily token usage and remaining budget. It should accept a `dailyLimit` from config.',
              explanation:
                'The tool should read from a counter and return usage stats relative to the configured limit.',
              sampleAnswer:
                'export default defineTool({\n  name: "token-budget",\n  description: "Check daily token usage and remaining budget",\n  async execute(params, ctx) {\n    const used = await ctx.store.get("todayTokens") ?? 0;\n    const limit = ctx.config.dailyLimit;\n    return { used, limit, remaining: limit - used, pct: (used / limit * 100).toFixed(1) };\n  },\n})',
            },
            {
              id: 'oc-p4-2',
              type: 'multiple-choice',
              question:
                'Which extension type should you use to run a cleanup task every night at midnight?',
              options: ['tool', 'canvas', 'cron', 'webhook'],
              correctIndex: 2,
              explanation:
                'Cron jobs run on a schedule, making them ideal for periodic tasks like nightly cleanup.',
            },
          ],
        },
      },
    ],
  },

  // Module 5 - Production Deployment
  {
    id: 'oc-m5',
    courseId: 'demo-course-openclaw',
    title: 'Production Deployment',
    description: 'Deploy and monitor OpenClaw in production',
    order: 4,
    status: 'available',
    progress: 0,
    lessons: [
      {
        id: 'oc-m5-l1',
        moduleId: 'oc-m5',
        title: 'Deployment Options',
        type: 'lecture',
        duration: '25 min',
        order: 0,
        status: 'available',
        content: {
          markdown: `# Deployment Options

OpenClaw can be deployed anywhere Node.js runs. Here are the most common deployment strategies.

## Docker

The recommended approach for most production environments:

\`\`\`dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 18789
CMD ["node", "dist/server.js"]
\`\`\`

Build and run:
\`\`\`bash
docker build -t openclaw .
docker run -p 18789:18789 --env-file .env openclaw
\`\`\`

## Docker Compose

For multi-service setups (runtime + Redis cache + monitoring):

\`\`\`yaml
services:
  runtime:
    build: .
    ports: ["18789:18789"]
    env_file: .env
    depends_on: [redis]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
\`\`\`

## Cloud Platforms

| Platform | Method | Auto-scaling |
|----------|--------|-------------|
| AWS | ECS Fargate, Lambda | Yes |
| Google Cloud | Cloud Run | Yes |
| Azure | Container Apps | Yes |
| Railway | One-click deploy | Yes |
| Fly.io | Dockerfile | Yes |

## Production Checklist

- [ ] Set \`NODE_ENV=production\`
- [ ] Use HTTPS (TLS termination at load balancer)
- [ ] Configure rate limiting
- [ ] Set up health check endpoint (\`/health\`)
- [ ] Enable structured logging
- [ ] Set memory limits appropriate for your traffic
- [ ] Configure webhook URLs for channels
- [ ] Test failover to fallback providers`,
          keyTerms: [
            {
              term: 'Health Check',
              definition: 'An endpoint that reports service status for load balancers',
            },
          ],
        },
      },
      {
        id: 'oc-m5-l2',
        moduleId: 'oc-m5',
        title: 'Monitoring & Logging',
        type: 'lecture',
        duration: '20 min',
        order: 1,
        status: 'available',
        content: {
          markdown: `# Monitoring & Logging

Production gateways need observability. OpenClaw provides built-in metrics and integrates with common monitoring tools.

## Built-in Metrics

OpenClaw exposes a Prometheus-compatible metrics endpoint at \`/metrics\`:

- \`openclaw_requests_total\` — Total requests by provider, model, status
- \`openclaw_tokens_total\` — Token usage by provider and type (input/output)
- \`openclaw_latency_seconds\` — Request latency histogram
- \`openclaw_cost_dollars\` — Estimated cost by provider
- \`openclaw_errors_total\` — Error count by type

## Structured Logging

Enable JSON logging for production:

\`\`\`json5
{
  logging: {
    format: "json",
    level: "info",
    fields: [
      "requestId",
      "provider",
      "model",
      "tokens",
      "latencyMs",
      "status",
    ],
  },
}
\`\`\`

## Dashboard Integration

### Grafana

Import the OpenClaw Grafana dashboard (ID: 19847) for pre-built panels showing:
- Request rate and latency
- Token usage trends
- Cost breakdown by provider
- Error rates and types

### Alerts

Configure alerts for:
- Error rate exceeding 5%
- P99 latency above 10 seconds
- Daily cost exceeding budget
- Provider health check failures

## Cost Tracking

The cost-tracker plugin maintains running totals. Access the dashboard at \`/admin/costs\` or query the API:

\`\`\`bash
curl http://localhost:18789/admin/costs?period=today
\`\`\`

Response includes per-provider and per-agent breakdowns.`,
          keyTerms: [
            {
              term: 'Prometheus',
              definition: 'Open-source monitoring system with dimensional data model',
            },
            {
              term: 'Structured Logging',
              definition: 'JSON-formatted logs that can be parsed and queried programmatically',
            },
          ],
        },
      },
      {
        id: 'oc-m5-l3',
        moduleId: 'oc-m5',
        title: 'Final Assessment',
        type: 'quiz',
        duration: '15 min',
        order: 2,
        status: 'available',
        content: {
          markdown: '# Final Assessment\n\nComprehensive quiz covering all OpenClaw concepts.',
          practiceProblems: [
            {
              id: 'oc-final-1',
              type: 'multiple-choice',
              question: 'What is the primary purpose of OpenClaw?',
              options: [
                'A code editor for AI development',
                'A unified gateway for multiple AI providers',
                'A machine learning training framework',
                'A database for storing AI models',
              ],
              correctIndex: 1,
              explanation:
                'OpenClaw is a self-hosted AI gateway that provides a unified API for multiple AI providers.',
            },
            {
              id: 'oc-final-2',
              type: 'multiple-choice',
              question: 'Which extension type would you use to let agents search external APIs?',
              options: ['Tool', 'Cron', 'Webhook', 'Canvas'],
              correctIndex: 0,
              explanation:
                'Tools are callable functions that agents invoke during conversations to perform actions like API searches.',
            },
            {
              id: 'oc-final-3',
              type: 'multiple-choice',
              question: 'How does OpenClaw handle provider failures?',
              options: [
                'Returns an error immediately',
                "Falls back to the route's configured fallback provider",
                'Retries the same provider indefinitely',
                'Switches to a local model automatically',
              ],
              correctIndex: 1,
              explanation:
                'Routes can define a fallback provider/model that is used when the primary fails.',
            },
            {
              id: 'oc-final-4',
              type: 'multiple-choice',
              question: 'What format does OpenClaw use for its main configuration file?',
              options: ['YAML', 'TOML', 'JSON5', 'INI'],
              correctIndex: 2,
              explanation:
                'OpenClaw uses ~/.openclaw/openclaw.json (JSON5 format) for all configuration.',
            },
            {
              id: 'oc-final-5',
              type: 'multiple-choice',
              question: 'Which of these is NOT a built-in OpenClaw tool?',
              options: ['rate-limiter', 'cost-tracker', 'model-trainer', 'web-search'],
              correctIndex: 2,
              explanation:
                'model-trainer is not a built-in tool. OpenClaw routes to AI providers, it does not train models.',
            },
          ],
        },
      },
    ],
  },
]

// =============================================================================
// Course 2: Scaling Laws in AI
// =============================================================================

const scalingModules: CourseModule[] = [
  // Module 1 - Foundations
  {
    id: 'sc-m1',
    courseId: 'demo-course-scaling',
    title: 'Foundations of Scaling',
    description: 'Power laws and the origins of neural scaling research',
    order: 0,
    status: 'available',
    progress: 0,
    lessons: [
      {
        id: 'sc-m1-l1',
        moduleId: 'sc-m1',
        title: 'Power Laws in Nature',
        type: 'lecture',
        duration: '25 min',
        order: 0,
        status: 'available',
        content: {
          markdown: `# Power Laws in Nature

Before diving into neural scaling laws, we must understand the mathematical foundation: **power laws**. These relationships appear throughout nature, economics, and now, deep learning.

## What is a Power Law?

A power law is a relationship where one quantity varies as a power of another:

$$y = ax^b$$

Or equivalently in log-log space:

$$\\log y = b \\cdot \\log x + \\log a$$

This means a power law appears as a **straight line on a log-log plot**. The exponent $b$ determines the slope.

## Examples in Nature

| Phenomenon | Power Law | Exponent |
|-----------|-----------|----------|
| Earthquake magnitude vs frequency | Gutenberg-Richter | -1.0 |
| City population vs rank | Zipf's Law | -1.0 |
| Word frequency vs rank | Zipf's Law | -1.07 |
| Metabolic rate vs body mass | Kleiber's Law | 0.75 |
| Species-area relationship | Arrhenius | 0.1-0.5 |

## Why Power Laws Matter for AI

The discovery that neural network performance follows power laws with respect to model size, data, and compute was transformative. It means:

1. **Predictability**: We can forecast performance of larger models before training them.
2. **Planning**: We can estimate the compute budget needed for a target performance.
3. **Optimization**: We can find the optimal allocation of resources (parameters vs data vs compute).

## The Log-Log Plot

When researchers at OpenAI first plotted test loss against model parameters on a log-log scale, they observed remarkably clean straight lines. This wasn't noise — it was a fundamental property of neural network scaling.

The key insight: **performance improvements are predictable across many orders of magnitude**.

This predictability is what makes scaling laws practically useful. If you know the scaling exponent, you can extrapolate from small experiments to predict the performance of models 100x or 1000x larger.`,
          keyTerms: [
            {
              term: 'Power Law',
              definition: 'A mathematical relationship y = ax^b, appearing linear on log-log plots',
            },
            {
              term: 'Scaling Exponent',
              definition: 'The power b in the power law, determining the rate of scaling',
            },
            {
              term: 'Log-Log Plot',
              definition: 'A graph with logarithmic axes where power laws appear as straight lines',
            },
          ],
        },
      },
      {
        id: 'sc-m1-l2',
        moduleId: 'sc-m1',
        title: 'Neural Scaling Hypotheses',
        type: 'lecture',
        duration: '30 min',
        order: 1,
        status: 'available',
        content: {
          markdown: `# Neural Scaling Hypotheses

Several hypotheses attempt to explain *why* neural networks follow power law scaling. Understanding these helps predict when scaling laws might break.

## The Manifold Hypothesis

Data lies on low-dimensional manifolds in high-dimensional space. Larger models can approximate these manifolds more precisely, with error decreasing as a power law of capacity.

## The Feature Learning Hypothesis

Neural networks learn features in order of decreasing importance. Each doubling of parameters captures the next "layer" of features, each contributing diminishing returns — exactly the pattern predicted by a power law.

## Hutter's Compression Hypothesis

Intelligence is compression. A language model's loss measures how well it compresses text. Better compression requires modeling increasingly subtle patterns, and the difficulty of discovering the next pattern grows exponentially — leading to power law improvement.

## The Broken Power Law

Not all scaling is a single straight line. Several researchers have observed **broken power laws** — regimes where the exponent changes:

$$L(N) = \\begin{cases} a_1 N^{-\\alpha_1} & \\text{if } N < N^* \\\\ a_2 N^{-\\alpha_2} & \\text{if } N \\geq N^* \\end{cases}$$

The breakpoint $N^*$ often corresponds to a qualitative change in what the model has learned.

## Irreducible Loss

Every scaling law has a floor — the **irreducible loss** $L_\\infty$:

$$L(N) = L_\\infty + aN^{-\\alpha}$$

This represents the entropy of the data itself. No model, no matter how large, can predict below this floor. For natural language, estimates of irreducible loss vary, but it represents fundamental uncertainty in text.

## Testable Predictions

Each hypothesis makes different predictions:
- Manifold hypothesis: scaling should depend on intrinsic data dimensionality
- Feature learning: scaling should slow down for already-"simple" datasets
- Compression: scaling exponents should relate to data entropy

Current evidence supports elements of all three, suggesting the truth involves multiple mechanisms.`,
          keyTerms: [
            {
              term: 'Irreducible Loss',
              definition: 'The minimum achievable loss, representing inherent data uncertainty',
            },
            {
              term: 'Broken Power Law',
              definition: 'A power law with different exponents in different regimes',
            },
          ],
        },
      },
      {
        id: 'sc-m1-l3',
        moduleId: 'sc-m1',
        title: 'Measuring Compute',
        type: 'practice',
        duration: '25 min',
        order: 2,
        status: 'available',
        content: {
          markdown: `# Measuring Compute

Learn to estimate FLOPs for transformer training runs and convert between different compute metrics.`,
          practiceProblems: [
            {
              id: 'sc-p1-1',
              type: 'multiple-choice',
              question:
                'For a transformer with N parameters trained on D tokens, approximately how many FLOPs are needed?',
              options: ['N × D', '6 × N × D', 'N² × D', 'N × D²'],
              correctIndex: 1,
              explanation:
                'The standard approximation is C ≈ 6ND FLOPs, accounting for forward and backward passes through the model.',
            },
            {
              id: 'sc-p1-2',
              type: 'short-answer',
              question:
                'A 7B parameter model is trained on 2T tokens. Estimate the total compute in FLOPs and PetaFLOP-days (assuming 1 PetaFLOP-day = 8.64 × 10¹⁹ FLOPs).',
              explanation:
                'C = 6 × 7×10⁹ × 2×10¹² = 8.4×10²² FLOPs = 8.4×10²² / 8.64×10¹⁹ ≈ 972 PetaFLOP-days.',
              sampleAnswer: 'C = 6 × 7B × 2T = 8.4 × 10²² FLOPs ≈ 972 PetaFLOP-days',
            },
          ],
        },
      },
    ],
  },

  // Module 2 - Kaplan Scaling Laws
  {
    id: 'sc-m2',
    courseId: 'demo-course-scaling',
    title: 'The Kaplan Scaling Laws',
    description: 'The original OpenAI scaling laws paper',
    order: 1,
    status: 'available',
    progress: 0,
    lessons: [
      {
        id: 'sc-m2-l1',
        moduleId: 'sc-m2',
        title: 'Original Findings',
        type: 'lecture',
        duration: '30 min',
        order: 0,
        status: 'available',
        content: {
          markdown: `# The Kaplan Scaling Laws: Original Findings

In January 2020, Jared Kaplan et al. at OpenAI published "Scaling Laws for Neural Language Models" — a landmark paper that established empirical power laws for transformer performance.

## Key Findings

The paper demonstrated that cross-entropy loss $L$ follows power laws with respect to three variables:

### 1. Parameters (N)

$$L(N) = (N_c / N)^{\\alpha_N}, \\quad \\alpha_N \\approx 0.076$$

where $N_c \\approx 8.8 \\times 10^{13}$ parameters.

### 2. Dataset Size (D)

$$L(D) = (D_c / D)^{\\alpha_D}, \\quad \\alpha_D \\approx 0.095$$

where $D_c \\approx 5.4 \\times 10^{13}$ tokens.

### 3. Compute (C)

$$L(C) = (C_c / C)^{\\alpha_C}, \\quad \\alpha_C \\approx 0.050$$

where $C_c \\approx 3.1 \\times 10^8$ PetaFLOP-days.

## The Surprising Implication

The paper's most impactful claim: **performance depends strongly on scale (N, D, C) but only weakly on model shape** (depth vs width, attention heads, etc.).

This meant that if you wanted better performance, the primary lever was simply making the model bigger, not redesigning the architecture.

## Compute-Optimal Allocation

Kaplan et al. proposed that when scaling compute, you should scale parameters **faster** than data:

$$N \\propto C^{0.73}, \\quad D \\propto C^{0.27}$$

This suggested investing most additional compute into larger models rather than more data. However, this conclusion was later challenged by the Chinchilla paper (Module 3).

## Experimental Setup

The study trained over 1,000 transformer models ranging from 768 to 1.5 billion parameters on WebText2. They systematically varied:
- Model size (depth, width)
- Dataset size (subsampled)
- Training duration (compute budget)

The consistency of the power law fits across all these variations was striking.`,
          keyTerms: [
            {
              term: 'Kaplan Scaling Laws',
              definition: 'Empirical power laws relating loss to parameters, data, and compute',
            },
            {
              term: 'Compute-Optimal',
              definition: 'The allocation of compute that minimizes loss for a given budget',
            },
          ],
        },
      },
      {
        id: 'sc-m2-l2',
        moduleId: 'sc-m2',
        title: 'Loss vs Parameters',
        type: 'slides',
        duration: '15 min',
        order: 1,
        status: 'available',
        content: {
          markdown: '# Loss vs Parameters\n\nVisual exploration of scaling curves.',
          slides: [
            {
              id: 1,
              title: 'Loss vs Parameters',
              subtitle: 'The fundamental scaling relationship',
              bullets: [
                'Cross-entropy loss decreases as a power law with model parameters',
                'The relationship holds across 6+ orders of magnitude',
                'Architecture details (depth vs width) have minimal effect',
              ],
            },
            {
              id: 2,
              title: 'The Log-Log Plot',
              subtitle: 'Straight lines reveal power laws',
              bullets: [
                'Plot log(loss) vs log(parameters)',
                'Slope gives the scaling exponent α ≈ 0.076',
                'Intercept relates to irreducible loss',
              ],
            },
            {
              id: 3,
              title: 'Three Independent Axes',
              subtitle: 'N, D, and C each follow power laws',
              bullets: [
                'Parameters (N): α_N ≈ 0.076',
                'Data (D): α_D ≈ 0.095',
                'Compute (C): α_C ≈ 0.050',
                'Each variable has a different scaling exponent',
              ],
            },
            {
              id: 4,
              title: 'Compute-Optimal Frontier',
              subtitle: "Kaplan's allocation recommendation",
              bullets: [
                'Given a compute budget C',
                'Scale N as C^0.73 (most compute to model size)',
                'Scale D as C^0.27 (less to data)',
                'This was later challenged by Chinchilla',
              ],
            },
            {
              id: 5,
              title: 'Limitations',
              subtitle: 'Where the original analysis fell short',
              bullets: [
                'Assumed fixed training tokens per model size',
                'Did not optimize learning rate per model',
                'Led to "undertrained" large models',
                'Chinchilla would correct this',
              ],
            },
          ],
        },
      },
      {
        id: 'sc-m2-l3',
        moduleId: 'sc-m2',
        title: 'Scaling Experiments Lab',
        type: 'practice',
        duration: '30 min',
        order: 2,
        status: 'available',
        content: {
          markdown:
            '# Scaling Experiments Lab\n\nApply the Kaplan scaling laws to real predictions.',
          practiceProblems: [
            {
              id: 'sc-p2-1',
              type: 'multiple-choice',
              question:
                'According to Kaplan et al., doubling the number of parameters approximately reduces loss by what factor?',
              options: ['2^(-0.076) ≈ 5%', '2^(-0.5) ≈ 29%', '50%', 'No change'],
              correctIndex: 0,
              explanation:
                'With α_N ≈ 0.076, doubling N gives L(2N)/L(N) = 2^(-0.076) ≈ 0.949, so about 5% reduction.',
            },
            {
              id: 'sc-p2-2',
              type: 'short-answer',
              question:
                'If a 1B parameter model achieves loss L=3.0, predict the loss for a 10B parameter model using α_N = 0.076.',
              explanation:
                'L(10B) = L(1B) × (1B/10B)^0.076 = 3.0 × 10^(-0.076) = 3.0 × 0.839 ≈ 2.52.',
              sampleAnswer: 'L(10B) = 3.0 × (1/10)^0.076 = 3.0 × 0.839 ≈ 2.52',
            },
          ],
        },
      },
    ],
  },

  // Module 3 - Chinchilla
  {
    id: 'sc-m3',
    courseId: 'demo-course-scaling',
    title: 'Chinchilla & Compute-Optimal Training',
    description: 'Revising scaling laws for data-compute balance',
    order: 2,
    status: 'available',
    progress: 0,
    lessons: [
      {
        id: 'sc-m3-l1',
        moduleId: 'sc-m3',
        title: 'Chinchilla Paper Deep Dive',
        type: 'lecture',
        duration: '30 min',
        order: 0,
        status: 'available',
        content: {
          markdown: `# Chinchilla Paper Deep Dive

In March 2022, Hoffmann et al. at DeepMind published "Training Compute-Optimal Large Language Models" — commonly known as the **Chinchilla paper**. It fundamentally changed how the field thinks about scaling.

## The Core Claim

Kaplan et al. recommended scaling model size much faster than data. Chinchilla showed this was wrong: **parameters and training tokens should be scaled roughly equally**.

For a compute budget $C$:

$$N_{opt} \\propto C^{0.50}, \\quad D_{opt} \\propto C^{0.50}$$

Compare with Kaplan: $N \\propto C^{0.73}, D \\propto C^{0.27}$.

## Methodology

Hoffmann et al. used three independent approaches that converged on the same answer:

1. **Fixed compute, vary N and D**: For each compute budget, train many models of different sizes and find the optimum.
2. **IsoFLOP curves**: Fix compute, plot loss vs model size, find the minimum.
3. **Parametric loss fit**: Fit a functional form and solve for the optimum analytically.

All three approaches agreed: models should be trained on roughly 20 tokens per parameter.

## The Implication

Many existing large models were **significantly undertrained**:

| Model | Parameters | Training Tokens | Tokens/Param | Chinchilla Optimal |
|-------|-----------|----------------|--------------|-------------------|
| GPT-3 | 175B | 300B | 1.7 | 3,500B |
| Gopher | 280B | 300B | 1.1 | 5,600B |
| Chinchilla | 70B | 1.4T | 20.0 | 1,400B |

Chinchilla (70B) outperformed Gopher (280B) despite being 4x smaller, because it was trained on 4.7x more data.

## Impact

The Chinchilla paper shifted the industry:
- LLaMA (Meta): 7B-65B models trained on 1-1.4T tokens (following Chinchilla ratios)
- Shifted focus from "biggest model wins" to "best-trained model wins"
- Made smaller, well-trained models competitive with larger ones`,
          keyTerms: [
            {
              term: 'Chinchilla Optimal',
              definition: 'Training with ~20 tokens per parameter for compute efficiency',
            },
            { term: 'IsoFLOP Curve', definition: 'Loss vs model size at a fixed compute budget' },
            {
              term: 'Undertrained',
              definition: 'A model that could achieve lower loss if trained on more data',
            },
          ],
        },
      },
      {
        id: 'sc-m3-l2',
        moduleId: 'sc-m3',
        title: 'Compute-Optimal Training',
        type: 'lecture',
        duration: '25 min',
        order: 1,
        status: 'available',
        content: {
          markdown: `# Compute-Optimal Training

Given a fixed compute budget, how should you allocate between model size and training data? This is the central question of compute-optimal training.

## The Compute Budget Equation

Total compute scales as:

$$C \\approx 6 \\cdot N \\cdot D$$

where $N$ is parameters and $D$ is training tokens.

## Finding the Optimum

The parametric loss model from Chinchilla:

$$L(N, D) = \\frac{A}{N^\\alpha} + \\frac{B}{D^\\beta} + L_\\infty$$

With $\\alpha \\approx 0.34$ and $\\beta \\approx 0.28$ (Chinchilla estimates).

Minimizing $L$ subject to $C = 6ND$ gives:

$$N_{opt} = G \\cdot C^a, \\quad D_{opt} = G' \\cdot C^b$$

where $a \\approx b \\approx 0.50$ (equal scaling).

## Practical Guidelines

| Compute (FLOPs) | Optimal N | Optimal D | Tokens/Param |
|----------------|-----------|-----------|--------------|
| 10²⁰ | 400M | 8.0B | 20 |
| 10²¹ | 1.2B | 25B | 21 |
| 10²² | 3.7B | 79B | 21 |
| 10²³ | 12B | 250B | 21 |
| 10²⁴ | 37B | 790B | 21 |

The ~20:1 data-to-parameter ratio is remarkably stable across scales.

## Beyond Chinchilla

Recent work suggests the optimal ratio may be even higher than 20:1 for inference-optimized models. If you expect to serve many queries, a smaller model trained on more data can be more cost-effective because:

1. **Training cost** is paid once
2. **Inference cost** is paid per query
3. Smaller models are cheaper to serve

This has led to the concept of **inference-optimal scaling**, which extends Chinchilla to account for total lifetime cost.`,
          keyTerms: [
            {
              term: 'Compute Budget',
              definition: 'The total FLOPs available for training a model',
            },
            {
              term: 'Inference-Optimal',
              definition: 'Scaling that accounts for both training and serving costs',
            },
          ],
        },
      },
      {
        id: 'sc-m3-l3',
        moduleId: 'sc-m3',
        title: 'Data vs Parameters Quiz',
        type: 'quiz',
        duration: '10 min',
        order: 2,
        status: 'available',
        content: {
          markdown:
            '# Data vs Parameters Quiz\n\nTest your understanding of compute-optimal training.',
          practiceProblems: [
            {
              id: 'sc-q3-1',
              type: 'multiple-choice',
              question:
                'According to Chinchilla, approximately how many tokens per parameter is compute-optimal?',
              options: ['1-2', '5-10', '20', '100'],
              correctIndex: 2,
              explanation: 'Chinchilla found that ~20 tokens per parameter is compute-optimal.',
            },
            {
              id: 'sc-q3-2',
              type: 'multiple-choice',
              question: 'Why did Chinchilla (70B) outperform Gopher (280B)?',
              options: [
                'Better architecture',
                'More training data (1.4T vs 300B tokens)',
                'Better hardware',
                'More training epochs on the same data',
              ],
              correctIndex: 1,
              explanation:
                "Chinchilla was trained on 1.4T tokens (20 tokens/param) vs Gopher's 300B (1.1 tokens/param).",
            },
            {
              id: 'sc-q3-3',
              type: 'multiple-choice',
              question: "What was wrong with Kaplan's compute allocation recommendation?",
              options: [
                'The exponents were mathematically incorrect',
                'It over-invested in model size and under-invested in data',
                'It only worked for GPT architectures',
                'It required too much compute',
              ],
              correctIndex: 1,
              explanation:
                'Kaplan recommended N ∝ C^0.73, over-allocating to parameters. Chinchilla showed equal scaling is optimal.',
            },
            {
              id: 'sc-q3-4',
              type: 'multiple-choice',
              question:
                'The equation C ≈ 6ND approximates total training FLOPs. What does the factor 6 account for?',
              options: [
                'Six transformer layers',
                'Forward pass (2x) + backward pass (4x) per token',
                'Six attention heads',
                'Data augmentation factor',
              ],
              correctIndex: 1,
              explanation:
                'The factor 6 approximates ~2 FLOPs per parameter for forward pass and ~4 for backward pass, per token.',
            },
          ],
        },
      },
    ],
  },

  // Module 4 - Emergent Capabilities
  {
    id: 'sc-m4',
    courseId: 'demo-course-scaling',
    title: 'Emergent Capabilities',
    description: 'Phase transitions and unexpected abilities at scale',
    order: 3,
    status: 'available',
    progress: 0,
    lessons: [
      {
        id: 'sc-m4-l1',
        moduleId: 'sc-m4',
        title: 'Phase Transitions',
        type: 'lecture',
        duration: '25 min',
        order: 0,
        status: 'available',
        content: {
          markdown: `# Phase Transitions in Large Language Models

While loss scales smoothly with compute, specific **capabilities** can appear suddenly at particular scales. These are known as **emergent abilities** — capabilities that are absent in smaller models but present in larger ones.

## Emergence vs Smooth Scaling

The distinction is crucial:
- **Loss**: Smooth, predictable power law decrease
- **Benchmarks**: Often show sudden jumps ("phase transitions")

Wei et al. (2022) identified many tasks where model performance was near-random until a critical scale, then rapidly improved.

## Notable Emergent Abilities

| Ability | Emerges At | Metric |
|---------|-----------|--------|
| Multi-step arithmetic | ~100B params | Exact match |
| Chain-of-thought reasoning | ~60B params | Task accuracy |
| Word unscrambling | ~10B params | Exact match |
| International phonetic alphabet | ~60B params | Exact match |

## The Debate

The concept of emergence in LLMs is actively debated:

**Pro-emergence view**: Certain capabilities require a minimum model capacity. Below this threshold, the model lacks the representational power for the task.

**Skeptical view (Schaeffer et al., 2023)**: "Emergence" may be a metric artifact. When you switch from non-linear metrics (exact match) to linear metrics (token-level accuracy), the sharp transitions often become smooth scaling.

## Grokking

A related phenomenon is **grokking** — where a model suddenly generalizes after extended training long past the point of memorizing the training data. This suggests:

1. Memorization and generalization are distinct phases
2. More compute (training time) can trigger phase transitions
3. Scale isn't just about parameters — it includes training duration

## Implications for Practice

- You cannot reliably predict emergent capabilities from smaller models
- "Scale and see" is sometimes the only way to discover new abilities
- Safety implications: harmful capabilities might also emerge unpredictably`,
          keyTerms: [
            {
              term: 'Emergent Ability',
              definition: 'A capability present in large models but absent in smaller ones',
            },
            {
              term: 'Phase Transition',
              definition: 'A sudden change in behavior at a critical scale threshold',
            },
            {
              term: 'Grokking',
              definition: 'Delayed generalization after memorization during extended training',
            },
          ],
        },
      },
      {
        id: 'sc-m4-l2',
        moduleId: 'sc-m4',
        title: 'In-Context Learning',
        type: 'lecture',
        duration: '25 min',
        order: 1,
        status: 'available',
        content: {
          markdown: `# In-Context Learning

In-context learning (ICL) is one of the most remarkable emergent abilities of large language models. It allows models to learn new tasks from just a few examples in the prompt, without any parameter updates.

## What is In-Context Learning?

Given a prompt like:

\`\`\`
Translate English to French:
cat -> chat
dog -> chien
house -> ?
\`\`\`

The model outputs "maison" — correctly performing translation without being explicitly trained on this format.

## Scaling Behavior of ICL

Brown et al. (2020) showed that ICL ability scales with model size:
- **Small models** (<1B): Poor ICL, often ignore examples
- **Medium models** (1-10B): Partial ICL, inconsistent
- **Large models** (>10B): Strong ICL, approaching fine-tuned performance

The gap between zero-shot and few-shot performance increases with scale, suggesting ICL is genuinely more powerful (not just prompt sensitivity) in larger models.

## Theoretical Explanations

Several theories explain how ICL works:

1. **Implicit Bayesian Inference**: Models learn to perform Bayesian inference over latent concepts during pre-training.
2. **Mesa-Optimization**: Models learn internal optimization algorithms that adapt to in-context examples.
3. **Task Vector Theory**: In-context examples shift the model's internal representations toward the task-relevant subspace.

## ICL Scaling Laws

Specific scaling laws for ICL have been proposed:

$$\\text{ICL Performance} \\propto N^{\\gamma} \\cdot k^{\\delta}$$

where $N$ is parameters and $k$ is number of in-context examples. The exponent $\\gamma$ is task-dependent but generally positive — larger models benefit more from examples.

## Practical Implications

- Few-shot prompting is most effective with large models
- The number of examples has diminishing returns (power law)
- Example quality matters more than quantity
- ICL can sometimes match fine-tuning for well-defined tasks`,
          keyTerms: [
            {
              term: 'In-Context Learning',
              definition: 'Learning from examples in the prompt without parameter updates',
            },
            {
              term: 'Few-Shot',
              definition: 'Providing a small number of examples to guide model behavior',
            },
            {
              term: 'Mesa-Optimization',
              definition: 'An internal learned optimization algorithm within the model',
            },
          ],
        },
      },
      {
        id: 'sc-m4-l3',
        moduleId: 'sc-m4',
        title: 'Emergence Research Lab',
        type: 'practice',
        duration: '25 min',
        order: 2,
        status: 'available',
        content: {
          markdown: '# Emergence Research Lab\n\nAnalyze emergence claims and evaluate evidence.',
          practiceProblems: [
            {
              id: 'sc-p4-1',
              type: 'multiple-choice',
              question:
                'According to Schaeffer et al. (2023), why might emergent abilities be a "mirage"?',
              options: [
                'The models were not large enough',
                'Non-linear metrics (like exact match) create artificial sharp transitions',
                'The benchmarks were too easy',
                'The models were overtrained',
              ],
              correctIndex: 1,
              explanation:
                'Schaeffer et al. showed that switching to continuous/linear metrics often reveals smooth scaling instead of sharp transitions.',
            },
            {
              id: 'sc-p4-2',
              type: 'short-answer',
              question:
                'Design an experiment to test whether 3-digit addition is truly emergent. What metrics would you use, and how would you control for metric artifacts?',
              explanation:
                'Use both exact-match accuracy (which may show emergence) and per-digit accuracy (which may show smooth scaling). Train models at many intermediate scales.',
              sampleAnswer:
                'Train models from 10M to 100B parameters. Measure both exact-match accuracy (binary: all digits correct) and digit-level accuracy (fraction of correct digits). If exact-match shows a sharp jump but digit-level shows smooth improvement, emergence is a metric artifact.',
            },
          ],
        },
      },
    ],
  },

  // Module 5 - Practical Applications
  {
    id: 'sc-m5',
    courseId: 'demo-course-scaling',
    title: 'Practical Applications',
    description: 'Using scaling laws for real-world predictions and decisions',
    order: 4,
    status: 'available',
    progress: 0,
    lessons: [
      {
        id: 'sc-m5-l1',
        moduleId: 'sc-m5',
        title: 'Scaling Predictions',
        type: 'lecture',
        duration: '25 min',
        order: 0,
        status: 'available',
        content: {
          markdown: `# Scaling Predictions

The practical value of scaling laws lies in their predictive power. With data from small experiments, you can forecast the performance of much larger models.

## The Prediction Pipeline

1. **Small-scale experiments**: Train 3-5 models at different scales (e.g., 10M to 1B parameters)
2. **Fit the power law**: Find the best-fit exponent and constant
3. **Extrapolate**: Predict loss at the target scale
4. **Validate**: Compare prediction to actual performance (when available)

## Worked Example

Suppose you train models and observe:

| Parameters | Loss |
|-----------|------|
| 10M | 4.20 |
| 100M | 3.50 |
| 1B | 3.00 |

Fitting $L = aN^{-\\alpha} + L_\\infty$:

$\\alpha \\approx 0.076$ (consistent with Kaplan), $L_\\infty \\approx 2.0$

Prediction for 10B: $L \\approx 2.0 + a \\cdot (10^{10})^{-0.076} \\approx 2.62$

## Reliability of Predictions

Predictions are most reliable when:
- Extrapolating by 1-2 orders of magnitude (not 10x+)
- The training setup is consistent (same data, hyperparameters scaled properly)
- You have 3+ data points spanning at least 1 order of magnitude

## When Scaling Laws Break

Scaling laws can fail when:
- **Data quality changes**: Pre-training on higher quality data shifts the curve
- **Architecture changes**: New techniques (MoE, state-space models) may have different exponents
- **Task saturation**: Performance hits a ceiling (irreducible loss for that task)
- **Distribution shift**: Test data is fundamentally different from training data

## Practical Applications in Industry

Major AI labs use scaling laws to:
- **Budget planning**: Estimate compute costs for target performance levels
- **Architecture search**: Compare architectures at small scale, predict at large scale
- **Data curation**: Quantify the value of higher-quality data
- **Risk assessment**: Predict when models might develop concerning capabilities`,
          keyTerms: [
            {
              term: 'Extrapolation',
              definition: 'Predicting beyond the observed range using fitted scaling laws',
            },
            {
              term: 'Task Saturation',
              definition: 'When model performance approaches the theoretical maximum for a task',
            },
          ],
        },
      },
      {
        id: 'sc-m5-l2',
        moduleId: 'sc-m5',
        title: 'Cost-Performance Analysis',
        type: 'slides',
        duration: '15 min',
        order: 1,
        status: 'available',
        content: {
          markdown:
            '# Cost-Performance Analysis\n\nTranslating scaling laws into business decisions.',
          slides: [
            {
              id: 1,
              title: 'Cost-Performance Analysis',
              subtitle: 'From scaling laws to budget decisions',
              bullets: [
                'Scaling laws let you estimate cost for target performance',
                "Key question: What's the cheapest way to reach loss L?",
                'Answer depends on training + inference costs',
              ],
            },
            {
              id: 2,
              title: 'Training Cost Model',
              subtitle: 'GPU-hours = f(FLOPs, hardware)',
              bullets: [
                'C = 6ND FLOPs for N parameters, D tokens',
                'GPU-hours = C / (GPU TFLOPS × utilization)',
                'Cost = GPU-hours × $/GPU-hour',
                'A100: ~312 TFLOPS (BF16), ~$2/GPU-hour',
              ],
            },
            {
              id: 3,
              title: 'Inference Cost Model',
              subtitle: 'Cost per query matters at scale',
              bullets: [
                'Latency ∝ N / (GPU memory bandwidth)',
                'Throughput ∝ 1/N for auto-regressive decoding',
                'Smaller Chinchilla-optimal models are cheaper to serve',
                'Total cost = training + (queries × cost_per_query)',
              ],
            },
            {
              id: 4,
              title: 'The Trade-off Space',
              subtitle: 'Bigger is not always better',
              bullets: [
                '10B model: $100K to train, $0.001/query',
                '100B model: $10M to train, $0.01/query',
                'Break-even depends on expected query volume',
                'Often: smaller, better-trained model wins',
              ],
            },
            {
              id: 5,
              title: 'Decision Framework',
              subtitle: 'Choosing the right scale',
              bullets: [
                '1. Define target performance (loss or benchmark)',
                '2. Estimate N, D from scaling laws',
                '3. Compute training cost',
                '4. Estimate inference volume and cost',
                '5. Compare total cost across scale options',
              ],
            },
          ],
        },
      },
      {
        id: 'sc-m5-l3',
        moduleId: 'sc-m5',
        title: 'Comprehensive Assessment',
        type: 'quiz',
        duration: '15 min',
        order: 2,
        status: 'available',
        content: {
          markdown: '# Comprehensive Assessment\n\nFinal quiz covering all scaling laws concepts.',
          practiceProblems: [
            {
              id: 'sc-final-1',
              type: 'multiple-choice',
              question: 'What does a power law relationship look like on a log-log plot?',
              options: ['An exponential curve', 'A straight line', 'A parabola', 'A step function'],
              correctIndex: 1,
              explanation:
                'log(y) = b·log(x) + log(a) is a linear equation, so power laws appear as straight lines on log-log plots.',
            },
            {
              id: 'sc-final-2',
              type: 'multiple-choice',
              question:
                'What was the key difference between Kaplan and Chinchilla scaling recommendations?',
              options: [
                'Kaplan recommended more data, Chinchilla more parameters',
                'Kaplan recommended more parameters, Chinchilla equal scaling',
                'They agreed on the same ratio',
                'Chinchilla focused on model architecture',
              ],
              correctIndex: 1,
              explanation:
                'Kaplan: N ∝ C^0.73 (more parameters). Chinchilla: N ∝ C^0.50 (equal scaling of parameters and data).',
            },
            {
              id: 'sc-final-3',
              type: 'multiple-choice',
              question: 'What is the approximate FLOPs formula for training a transformer?',
              options: ['C = ND', 'C = 6ND', 'C = N²D', 'C = 6N²'],
              correctIndex: 1,
              explanation: 'C ≈ 6ND is the standard approximation for total training FLOPs.',
            },
            {
              id: 'sc-final-4',
              type: 'multiple-choice',
              question: 'What is "irreducible loss" in the context of scaling laws?',
              options: [
                'The loss at initialization before any training',
                'The minimum achievable loss, representing data entropy',
                'The loss from hardware precision errors',
                'The training loss minus validation loss',
              ],
              correctIndex: 1,
              explanation:
                'Irreducible loss is the floor that no model can go below, representing inherent uncertainty in the data.',
            },
            {
              id: 'sc-final-5',
              type: 'multiple-choice',
              question: 'Why might emergent abilities be considered a "mirage" (Schaeffer et al.)?',
              options: [
                'The models were actually the same size',
                'Sharp transitions appear with non-linear metrics but smooth scaling with linear metrics',
                'The experiments were not reproducible',
                'Only GPT models show emergence',
              ],
              correctIndex: 1,
              explanation:
                'Switching from metrics like exact-match (binary) to continuous metrics often reveals smooth underlying improvement.',
            },
          ],
        },
      },
    ],
  },
]

// =============================================================================
// Exports
// =============================================================================

export const DEMO_COURSES: Course[] = [
  {
    id: 'demo-course-openclaw',
    userId: 'demo-user',
    title: 'OpenClaw: Self-Hosted AI Gateway',
    topic: 'OpenClaw AI Gateway',
    description:
      'Learn to deploy and configure OpenClaw, an open-source AI gateway that unifies multiple AI providers behind a single API. Covers installation, multi-channel setup, routing, plugins, and production deployment.',
    difficulty: 'beginner',
    estimatedHours: 8,
    prerequisites: ['Basic Node.js', 'CLI familiarity'],
    learningObjectives: [
      'Install and configure OpenClaw',
      'Connect WhatsApp, Telegram, and Discord channels',
      'Configure intelligent routing rules',
      'Build custom plugins',
      'Deploy to production with monitoring',
    ],
    status: 'ready',
    progress: 0,
    settings: { ...defaultSettings, focusAreas: ['setup', 'channels', 'routing'] },
    researchReport: null,
    thinkingTrace: null,
    generatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'demo-course-scaling',
    userId: 'demo-user',
    title: 'Scaling Laws in AI: From Theory to Practice',
    topic: 'AI Scaling Laws',
    description:
      'Explore the empirical power laws governing neural network performance. From the original Kaplan scaling laws to Chinchilla compute-optimal training, emergent capabilities, and practical cost-performance analysis.',
    difficulty: 'intermediate',
    estimatedHours: 10,
    prerequisites: ['ML basics', 'Statistics fundamentals'],
    learningObjectives: [
      'Understand power laws and their role in deep learning',
      'Apply Kaplan and Chinchilla scaling laws',
      'Analyze emergent capabilities at scale',
      'Make compute-optimal training decisions',
      'Predict model performance from small-scale experiments',
    ],
    status: 'ready',
    progress: 0,
    settings: { ...defaultSettings, focusAreas: ['scaling', 'compute', 'emergence'] },
    researchReport: null,
    thinkingTrace: null,
    generatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  },
]

export const DEMO_COURSE_MODULES: Record<string, CourseModule[]> = {
  'demo-course-openclaw': openclawModules,
  'demo-course-scaling': scalingModules,
}
