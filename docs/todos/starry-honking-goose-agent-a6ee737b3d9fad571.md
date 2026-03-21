# OpenClaw: Complete Technical Architecture Deep Dive

**Date:** 2026-03-12
**Purpose:** Comprehensive technical analysis of OpenClaw's architecture, model system, cost model, and ecosystem.

---

## 1. Background & History

- **Creator:** Peter Steinberger (Austrian developer)
- **Original name:** Clawdbot (November 2025), renamed Moltbot (Jan 27, 2026) after Anthropic trademark complaint, then **OpenClaw** (Jan 30, 2026)
- **Viral moment:** Late January 2026, fueled by the open-source Moltbook project
- **GitHub:** 247,000 stars, 47,700 forks (as of March 2, 2026) -- [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)
- **Steinberger joined OpenAI** on Feb 14, 2026. Project moved to an open-source foundation with OpenAI's continued support.
- **License:** MIT (100% free software)

---

## 2. Five-Component Architecture

OpenClaw has a clean five-component design:

### 2.1 Gateway (The Front Door / Control Plane)
- **What it is:** A Node.js WebSocket server that connects to messaging platforms (WhatsApp, Telegram, Slack, Signal, Discord, iMessage) and control interfaces.
- **How it runs:** Installs as a background daemon -- systemd on Linux, LaunchAgent on macOS. The `--install-daemon` flag registers it as a background service that auto-starts on boot and restarts on crash.
- **Concurrency model:** Uses a **Lane Queue** (lane-aware FIFO queue). Tasks within a single session are serialized (one at a time) to prevent race conditions and state corruption. Different sessions CAN run concurrently.
- **Role:** Routes every inbound message to the Agent Runtime, dispatches responses back to channels.

### 2.2 Brain (The Agent Loop / ReAct Engine)
- **Pattern:** ReAct (Reasoning + Acting) loop:
  1. **Reason** over context and state
  2. **Select** an action/tool call
  3. **Execute** via Gateway
  4. **Observe** output
  5. Repeat until task complete
- **Model-agnostic:** Not locked to any vendor (see Section 3 below).
- **Per-session lifecycle:** Each loop is a single serialized run per session that emits lifecycle and stream events as the model thinks, calls tools, and streams output.

### 2.3 Memory (Persistent Context)
- **Storage:** Plain Markdown files on disk -- the model only "remembers" what's written to disk.
- **Two layers:**
  - **MEMORY.md** (long-term): Injected into system prompt at every session start. For facts that matter next month.
  - **Daily logs** (`memory/YYYY-MM-DD.md`): NOT auto-injected. Retrieved on-demand via built-in `memory_search` and `memory_get` tools.
- **Indexing:** Files chunked into ~400 tokens with 80-token overlap. Hybrid search combining keyword (BM25) + vector similarity. Temporal decay gives recent memories higher scores.
- **Backend:** Default SQLite indexer. Can swap for QMD (local-first sidecar with BM25 + vectors + reranking). Markdown stays the source of truth regardless.
- **Git-friendly:** All memory is plain text, works with version control. Full transparency -- you can read exactly what the AI remembers.
- **Third-party extensions:** Cognee (knowledge graphs), mem0 (advanced memory), Milvus memsearch (extracted and open-sourced the memory search system).

### 2.4 Skills (Plugin System)
- **Format:** Each skill = a directory with a `SKILL.md` file containing:
  - **YAML frontmatter:** name, description, version, metadata gates (required env vars, CLI binaries), `user-invocable: true|false`
  - **Markdown body:** Step-by-step instructions the agent follows (a "runbook")
- **Folder can also contain:** scripts, templates, reference files.
- **Capabilities:** Skills can call external REST APIs, execute shell commands, query databases, run browser automation, access webhooks, connect to SaaS platforms.
- **Authentication:** Credentials stored in `~/.openclaw/openclaw.json` using `apiKey` shortcut or `env` block. Values scoped to agent run and cleared when it ends.
- **Storage locations:** `~/clawd/skills/<skill-name>/SKILL.md`
- **Cross-tool compatibility:** Same SKILL.md format works across Claude Code (`~/.claude/skills/`), Codex CLI (`~/.codex/skills/`), and OpenCode (`~/.opencode/skills/`). Tools like `skillshare` can sync skills across all three via symlinks.

### 2.5 Heartbeat (Scheduled Autonomous Actions)
- **Frequency:** Every 30 minutes by default (every hour with Anthropic OAuth).
- **How it works:** On each heartbeat cycle, the agent:
  1. Reads a checklist from `HEARTBEAT.md` in the workspace
  2. Loads current context
  3. Checks conditions defined in heartbeat instructions
  4. Either messages the user OR responds `HEARTBEAT_OK` (silent)
- **Not spam:** Only speaks up when something needs attention.
- **Use cases:** Inbox monitoring, calendar checks, flight check-ins, deadline reminders, proactive task execution.

---

## 3. AI Model Architecture (BYOK / Multi-Provider)

### 3.1 Provider Support
OpenClaw ships with built-in support for **14 providers:**
- **Tier 1:** OpenAI (GPT-4o, o1, etc.), Anthropic (Claude Opus/Sonnet/Haiku), Google (Gemini)
- **Others:** DeepSeek, OpenRouter, Ollama (local models: Qwen, Llama, Mistral, etc.)
- **Custom providers:** Any OpenAI-compatible API (`api: "openai-completions"`) or Anthropic-compatible API (`api: "anthropic-messages"`)

### 3.2 Model Configuration
- Defined in `models.providers` config section
- Fully-qualified model names added to `agents.defaults.models`
- **Fallback chains:** If primary model unavailable, tries fallback models in order
- **OpenRouter Auto:** `openrouter/openrouter/auto` automatically selects most cost-effective model

### 3.3 BYOK (Bring Your Own Key)
- Users provide their own API keys -- OpenClaw does NOT provide AI credits by default
- Keys configured in `~/.openclaw/openclaw.json` or environment variables
- No vendor lock-in: switch models by changing config, no code changes needed

### 3.4 Smart Model Routing (Third-Party)
OpenClaw itself does NOT have built-in smart routing, but the ecosystem provides:
- **ClawRouter** (BlockRunAI): 41+ models, <1ms local routing, zero external API calls, USDC payments on Base & Solana
- **iblai-openclaw-router:** Local routing, routes requests to cheapest capable model, claims 70%+ savings
- **LLMRouter** (UIUC): Academic router with OpenClaw integration
- **OpenRouter integration:** Provider-level failover + cost-based auto-routing

---

## 4. Always-On Architecture Deep Dive

### 4.1 Daemon Mode
- Registers as a system service (systemd/LaunchAgent)
- Survives SSH disconnects, auto-restarts on crash or reboot
- Designed to run 24/7 on personal hardware or cloud VMs

### 4.2 What Triggers Autonomous Action
- **Heartbeat timer** (30-min default): Proactive checks against HEARTBEAT.md
- **Inbound messages:** From any connected channel (WhatsApp, Telegram, etc.)
- **Hooks:** Event-driven triggers (separate queue lane from main sessions to prevent starvation)
- **Webhooks:** External services can trigger the agent via API

### 4.3 Cloud Deployment
- Most users deploy on $5-15/month VPS
- Oracle Cloud Always Free Tier: 2 AMD VMs with 1 GB RAM each -- enough for 24/7 at $0
- Managed hosting: MyClaw ($19-79/mo), ClickClaw (bundles $16/mo AI credits), various others
- Akamai, Hostinger, Hetzner, and others offer OpenClaw-specific deployment guides

---

## 5. Relationship to Claude Code / Codex

### 5.1 Not a Replacement -- Complementary
- **Claude Code:** Developer-focused CLI for coding tasks in the terminal
- **OpenClaw:** Personal AI assistant that lives in chat apps, runs 24/7, handles life/work automation
- **Codex CLI:** OpenAI's coding agent
- They serve different use cases but share the **skill format** (SKILL.md)

### 5.2 Integration Patterns
- **Claude Code managing OpenClaw:** You can use Claude Code to develop, configure, and debug your OpenClaw agent
- **acpx (Agent Client Protocol):** OpenClaw's headless CLI client provides one command surface for Pi, OpenClaw ACP, Codex, Claude, and other ACP-compatible agents. Built for agent-to-agent communication.
- **Skill delegation:** A skill can delegate long-running coding tasks to background Codex, Claude Code, or Pi agents for parallel work

### 5.3 Separate API Keys
- OpenClaw uses its OWN API key configuration, separate from Claude Code's subscription
- Both can use the same Anthropic API key if the user configures it in both tools
- Claude Code's Max subscription does NOT provide OpenClaw API access

---

## 6. Business Model & Ecosystem

### 6.1 OpenClaw Itself
- **Free** (MIT license). Zero revenue from the software.
- All costs come from infrastructure + AI API usage.

### 6.2 Ecosystem Revenue (129 Startups, $283K/month)
- 129 startups generated $283,000 total in 30 days (avg ~$2,200/startup/month)
- Top single company: $50,000/month
- **80% are infrastructure/tools:** Managed hosting, setup services, wrappers that lower the barrier to use
- **Skills & customization:** Enterprise OpenClaw customization, skill development, ClawHub premium skills
- **Only 3-5 companies** doing actual application-layer development

### 6.3 ClawHub Marketplace
- 17,034 skills across 11 categories (as of March 6, 2026)
- Built into the CLI, ships with OpenClaw
- **Publishing requirement:** Only needed a 1-week-old GitHub account (no code review, no signing)
- Payment infrastructure: AIsa Skills offers payment rails for premium skills

### 6.4 Cost for Users
- **Light users:** $6-13/month (mostly AI API costs)
- **Small teams:** $25-50/month
- **Power users:** $100-200+/month ($80-150 AI, $15-25 infra)
- **Heavy users:** Can exceed $600-3,600/month without optimization

---

## 7. Cost Optimization Mechanisms

### 7.1 Why It's Expensive
Six core cost drivers:
1. **Context accumulation:** Entire conversation history sent with every request
2. **Tool output storage:** Tool results stored in context, inflating token counts
3. **System prompt resending:** 5,000-10,000 token system prompts resent every call
4. **Multi-turn reasoning:** ReAct loops multiply API calls per user request
5. **Poor model selection:** Using Opus ($15/$75 per M tokens) for simple tasks
6. **Frequent heartbeats:** Each heartbeat = full LLM call with context

### 7.2 Built-in Optimization
- **Prompt caching:** Up to 90% savings on repeated context (Anthropic cache reads much cheaper than input). Cache expires after 5 minutes by default.
- **Model fallbacks:** Automatic failover reduces retries on expensive models

### 7.3 User-Side Optimization
- **Model tiering:** Haiku for routine tasks, Sonnet for medium, Opus only when needed (10x cheaper for 80% of work)
- **Context management:** Prune conversation history, minimize tool output
- **Heartbeat frequency:** Reduce from 30min to 1hr or longer
- **Reported savings:**
  - Light users: $200/mo to $70/mo (65% savings)
  - Power users: $943/mo to $347/mo
  - Heavy users: $2,750/mo to $1,000/mo

---

## 8. Security Concerns (CRITICAL)

### 8.1 ClawHub Malware
- **341 malicious skills** found (ClawHavoc campaign), primarily delivering Atomic macOS Stealer
- Updated scans: **800+ malicious skills** (~20% of registry)
- **283 skills (7.1%)** leaking API keys and credentials (Snyk research)

### 8.2 Infrastructure Vulnerabilities
- **135,000+ internet-exposed instances** found
- **12,800+ directly exploitable** via RCE
- **CVE-2026-25253:** Critical RCE (CVSS 8.8), exploitable even against localhost-bound instances. Patched in v2026.1.29.
- Exposed instances leaked API keys, chat histories, and account credentials

### 8.3 Root Causes
- No automated static analysis on ClawHub submissions
- No code review or signing requirement
- Skills can execute arbitrary shell commands by design
- Many users deployed with unsafe defaults

---

## Key Takeaway Summary

OpenClaw is a **local-first, model-agnostic, always-on AI agent framework** with a clean 5-component architecture (Gateway, Brain, Memory, Skills, Heartbeat). It is NOT an AI model -- it's the orchestration layer. Users bring their own LLM API keys (BYOK). The skill system uses simple Markdown files (SKILL.md) that are cross-compatible with Claude Code and Codex. The ecosystem has grown explosively (247K GitHub stars, 17K skills, 129 revenue-generating startups) but faces serious security challenges from its permissionless skill marketplace. Peter Steinberger joined OpenAI in Feb 2026, and the project now lives under an independent open-source foundation.

---

## Sources

- [OpenClaw Official Site](https://openclaw.ai/)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [OpenClaw Docs - Agent Loop](https://docs.openclaw.ai/concepts/agent-loop)
- [OpenClaw Docs - Memory](https://docs.openclaw.ai/concepts/memory)
- [OpenClaw Docs - Models CLI](https://docs.openclaw.ai/concepts/models)
- [OpenClaw Docs - Skills](https://docs.openclaw.ai/tools/skills)
- [OpenClaw Docs - Token Use and Costs](https://docs.openclaw.ai/reference/token-use)
- [OpenClaw Docs - Authentication](https://docs.openclaw.ai/gateway/authentication)
- [OpenClaw Docs - FAQ](https://docs.openclaw.ai/help/faq)
- [OpenClaw Wikipedia](https://en.wikipedia.org/wiki/OpenClaw)
- [TechCrunch - Steinberger joins OpenAI](https://techcrunch.com/2026/02/15/openclaw-creator-peter-steinberger-joins-openai/)
- [DigitalOcean - What is OpenClaw](https://www.digitalocean.com/resources/articles/what-is-openclaw)
- [DigitalOcean - What are OpenClaw Skills](https://www.digitalocean.com/resources/articles/what-are-openclaw-skills)
- [Milvus - OpenClaw Complete Guide](https://milvus.io/blog/openclaw-formerly-clawdbot-moltbot-explained-a-complete-guide-to-the-autonomous-ai-agent.md)
- [OpenClaw Architecture Part 1 - The Agent Stack](https://theagentstack.substack.com/p/openclaw-architecture-part-1-control)
- [Deep Dive into OpenClaw - Medium](https://medium.com/@dingzhanjun/deep-dive-into-openclaw-architecture-code-ecosystem-e6180f34bd07)
- [OpenClaw Explained - Medium](https://medium.com/@cenrunzhe/openclaw-explained-how-the-hottest-agent-framework-works-and-why-data-teams-should-pay-attention-69b41a033ca6)
- [OpenRouter - OpenClaw Integration](https://openrouter.ai/docs/guides/guides/openclaw-integration)
- [ClawRouter GitHub](https://github.com/BlockRunAI/ClawRouter)
- [iblai-openclaw-router GitHub](https://github.com/iblai/iblai-openclaw-router)
- [Snyk - 280+ Leaky Skills](https://snyk.io/blog/openclaw-skills-credential-leaks-research/)
- [The Register - OpenClaw Security](https://www.theregister.com/2026/02/05/openclaw_skills_marketplace_leaky_security/)
- [Oasis Security - ClawJacked Vulnerability](https://www.oasis.security/blog/openclaw-vulnerability)
- [Kaspersky - OpenClaw Risks](https://www.kaspersky.com/blog/moltbot-enterprise-risk-management/55317/)
- [DEV Community - Sync Skills Across Claude Code, OpenClaw, Codex](https://dev.to/runkids/how-to-sync-ai-skills-across-claude-code-openclaw-and-codex-in-2-minutes-226e)
- [acpx GitHub](https://github.com/openclaw/acpx)
- [Bitget - 129 Startups $283K](https://www.bitget.com/amp/news/detail/12560605228858)
- [TrustMRR - OpenClaw Startups](https://trustmrr.com/special-category/openclaw)
- [ClawHub Skill Format](https://github.com/openclaw/clawhub/blob/main/docs/skill-format.md)
- [VelvetShark - Memory Masterclass](https://velvetshark.com/openclaw-memory-masterclass)
- [VelvetShark - Multi-model Routing](https://velvetshark.com/openclaw-multi-model-routing)
- [Hostinger - OpenClaw Costs](https://www.hostinger.com/tutorials/openclaw-costs)
- [MyClaw Pricing](https://myclaw.ai/pricing)
- [Akamai - OpenClaw Cloud Deployment](https://www.akamai.com/blog/developers/openclaw-agent-doesnt-sleep-laptop-does-move-cloud)
- [DataCamp - Building Custom Skills](https://www.datacamp.com/tutorial/building-open-claw-skills)
- [DataCamp - Top 100+ Agent Skills](https://www.datacamp.com/blog/top-agent-skills)
- [LumaDock - Concurrency and Retry Control](https://lumadock.com/tutorials/openclaw-concurrency-retry-control)
- [LumaDock - Custom API Integration](https://lumadock.com/tutorials/openclaw-custom-api-integration-guide)
