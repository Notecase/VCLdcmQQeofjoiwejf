# Market & Ecosystem Research — March 2026

Comprehensive research across six topics relevant to Noteshell product strategy.

---

## 1. OpenClaw

### What It Is

OpenClaw (formerly Clawdbot, Moltbot, and Molty) is a **free, open-source, autonomous AI agent** designed to be a personal AI assistant. Created by **Peter Steinberger** (the Austrian software engineer known for founding PSPDFKit). It runs locally on your own machine, connects to LLMs, and can interact with your files, calendar, email, browser, smart home devices, and messaging platforms.

- **Website**: [openclaw.ai](https://openclaw.ai/)
- **GitHub**: [openclaw/openclaw](https://github.com/openclaw/openclaw) — **250,000+ GitHub stars** by early March 2026, 11,400+ commits, 3,400+ pull requests
- **Launched**: November 2025 as "Clawdbot". Renamed to Moltbot (January 2026 trademark dispute with Anthropic), then OpenClaw days later
- **Creator exit**: On February 14, 2026, Steinberger announced he would join OpenAI and the project would move to an open-source foundation

### How It Works

- Runs entirely locally — your data stays on your machine
- Bridges **20+ messaging platforms**: WhatsApp, Telegram, Slack, Discord, iMessage, Signal, Teams, Matrix, LINE, etc.
- Has **persistent memory** across conversations (unlike Claude Code which resets per session)
- Operates autonomously 24/7 — not session-based like coding assistants
- Uses an **AgentSkills** plugin system (SKILL.md files with YAML frontmatter)
- **100+ preconfigured AgentSkills**: shell commands, file systems, web automation, 50+ third-party services

### Plugin Ecosystem: ClawHub

- **[ClawHub](https://github.com/openclaw/clawhub)** is the official community skill registry
- **5,700+ published skills**, **15,000+ daily installations** (fastest-growing AI agent plugin ecosystem)
- Skills cover: email (Himalaya), calendar/docs (Google Workspace), home automation (Hue, Sonos), messaging (WhatsApp, iMessage), note-taking (Apple Notes, Bear, Obsidian), developer tools (GitHub)
- After the "ClawHavoc" security incident, ClawHub now requires **identity verification** for publishers and enforces credential handling best practices
- Skills use the **AgentSkills standard** which is cross-platform — same SKILL.md works in Claude Code, Codex CLI, Gemini CLI

### Business Model

- **OpenClaw itself generates $0 revenue** — Steinberger has been explicit: "It's a free, open source hobby project"
- Funded via sponsorships ($5/month "Krill" tier to $500/month "Poseidon" tier)
- **Ecosystem monetization**: 129 startups building on top of OpenClaw generated $283,000 total revenue in 30 days (avg $2,200/company)
- QuickClaw (mobile wrapper): $3.99/week or $49.99/year, ~$8,782/month
- The pattern: don't monetize OpenClaw itself; build constrained vertical products that use it under the hood

### Relevance to Noteshell

- OpenClaw validates the **"always-on agent" paradigm** — users want AI that remembers, acts autonomously, and lives where they already are
- The AgentSkills/SKILL.md standard is becoming cross-platform; Noteshell could publish skills to ClawHub to reach OpenClaw's 250K+ user base
- OpenClaw's ecosystem revenue data ($283K from 129 startups) shows early-stage monetization is modest — vertical products work better than platforms
- Security concerns around broad permissions are real; Noteshell should learn from the ClawHavoc incident

---

## 2. Claude Code Plugin Ecosystem

### Current State (March 2026)

The Claude Code plugin ecosystem is in **rapid early growth** — past the "empty marketplace" phase but not yet mature. It has official backing from Anthropic and a structured architecture.

### Architecture: Four Component Types

1. **Skills** — Procedural knowledge stored as SKILL.md files (30-50 tokens each, loaded on-demand). The folder name becomes the skill name. Skills tell Claude *how* to do something.
2. **Subagents** — Specialized AI agents for specific tasks (e.g., security-auditor, frontend-developer)
3. **Commands** — Custom slash commands (e.g., `/push`, `/code-review`)
4. **Hooks** — Automated triggers at lifecycle events (enforcing code quality, security warnings)

**Plugins** are shareable bundles that combine all four into a single installable unit.

### Distribution Formats

- **Plugins for Claude Code**: Installed via CLI or from marketplaces
- **DXT (Desktop Extensions)**: Zip-based packages for Claude Desktop — bundle MCP servers + manifest.json. Zero-config, cross-platform, one-click install. Built with `@anthropic-ai/dxt` toolkit (`dxt init` -> `dxt pack`)
- **MCP servers**: External tool connections (can use 50k+ tokens of context). Lazy-loaded via Tool Search to reduce context usage by up to 95%

### Marketplace & Ecosystem Size

- **[Official Anthropic Plugin Directory](https://github.com/anthropics/claude-plugins-official)**: Curated, high-quality plugins
- **[Claude Plugin Marketplace](https://claude.com/plugins)**: Browse and install
- **488+ extensions** available across Claude.ai, Claude Code, and Claude API
- **Enterprise Plugin Marketplace** (announced Feb 2026): Organizations can host/manage custom plugins, deploy per-department, distribute internally
- Multiple **community marketplaces**: claudemarketplaces.com, buildwithclaude.com, claudecodemarketplace.com, claude-plugins.dev

### Categories of Plugins Being Built

| Category | Examples |
|----------|----------|
| **Code Review** | PR Review Toolkit (comments, tests, error handling, type design, code quality, simplification) |
| **Knowledge Management** | Notion workspace integration, second-brain generators, Obsidian vault access |
| **DevOps** | Deployment automation, CI/CD workflows |
| **Security** | Vulnerability scanning, credential auditing |
| **Memory** | Claude-Mem (long-term memory), persistent context |
| **Planning** | Superpowers (structured lifecycle planning), Plannotator |
| **AI/ML** | Model training workflows, dataset management |
| **Database** | PostgreSQL read-only access, natural language queries |
| **Web Search** | Brave Search MCP, real-time research |
| **Design** | Figma integration (talk-to-figma-mcp) |

### Ecosystem Maturity Assessment

- **Early-to-mid growth phase**: Official structure exists, hundreds of plugins available, enterprise features launching
- **Convergence happening**: The AgentSkills (SKILL.md) format is becoming a cross-platform standard — same skills work in Claude Code, Codex CLI, Gemini CLI, Cursor
- **Key differentiator**: Claude Code's MCP Tool Search (lazy loading) lets users run many MCP servers without blowing context limits

### Relevance to Noteshell

- Noteshell could distribute as a **Claude Code Plugin** bundling: an MCP server (note access, course data), Skills (study workflows, flashcard creation), and Commands (/study, /review, /explain)
- The enterprise marketplace creates a B2B channel — Noteshell plugin could be deployed org-wide
- DXT format for Claude Desktop gives another zero-friction distribution path
- The Skills cross-platform standard means one investment reaches Claude Code + Codex + Gemini CLI users

---

## 3. Codex CLI Plugin Ecosystem

### Current State (March 2026)

OpenAI's Codex CLI has evolved from a pure coding agent into a more extensible platform, though its plugin ecosystem is **smaller and less mature than Claude Code's**.

### Architecture: Three Component Types

1. **Skills** — Same SKILL.md format as the cross-platform AgentSkills standard. Each skill directory contains instructions + optional scripts. Metadata in `agents/openai.yaml`. Progressive disclosure: Codex starts with name/description, loads full instructions only when needed.
2. **MCP Servers** — Model Context Protocol entries, same standard as Claude Code
3. **Apps (Connectors)** — Listed with pagination plus accessibility/enabled metadata. Connect to external services.

**Plugins** bundle all three into a single installable unit (like Claude Code).

### Key Features (March 2026)

- **@plugin mentions**: Reference plugins directly in chat to auto-include their context
- **Plugin marketplace**: Richer discovery with metadata, categories, ratings. Install-time auth checks verify API keys/OAuth before installation.
- **IDE integration**: VS Code extension and JetBrains plugin (Rider, IntelliJ, PyCharm, WebStorm)
- **Codex Cloud**: Delegate tasks to cloud-based sandboxed sessions

### Comparison with Claude Code

| Dimension | Claude Code | Codex CLI |
|-----------|------------|-----------|
| **Plugin types** | Skills, Subagents, Commands, Hooks | Skills, MCP, Apps/Connectors |
| **Unique features** | DXT packaging, Hook lifecycle, lazy MCP loading | @plugin mentions, cloud delegation |
| **Ecosystem size** | 488+ extensions | Smaller, growing |
| **Cross-platform skills** | Yes (AgentSkills standard) | Yes (same standard) |
| **Enterprise marketplace** | Yes (Feb 2026) | Growing |
| **IDE integration** | Terminal-first, IDE plugins | VS Code, JetBrains native |

### How Developers Use Both

A common workflow: **Claude Code for initial feature generation and architecture** (interactive reasoning, context depth), then **Codex for code review and debugging** (logical precision, token efficiency). The convergence on AgentSkills means skills are portable across both.

### Relevance to Noteshell

- Cross-platform Skills standard means Noteshell builds one SKILL.md and it works everywhere
- Codex's @plugin mention system is interesting — users could reference Noteshell in conversation naturally
- Smaller ecosystem = less competition for Noteshell to stand out
- The IDE integration story is stronger for Codex (native VS Code/JetBrains) — relevant if Noteshell wants to reach developers where they code

---

## 4. Agent-First Platforms Trend

### The Macro Shift (2026)

2026 is the year the industry moves from **app-first** to **agent-first** product architecture. Key data points:

- **Gartner**: 40% of enterprise apps will include task-specific AI agents by 2026 (up from <5% in 2025)
- **IDC**: AI copilots embedded in ~80% of enterprise workplace apps by 2026
- **Multi-agent systems**: 1,445% surge in Gartner inquiries about multi-agent systems (Q1 2024 to Q2 2025)
- **AI agent market**: $5.25B (2024) -> $7.84B (2025) -> projected $52.62B (2030)

### Agent-First vs. App-First

| Dimension | App-First | Agent-First |
|-----------|-----------|-------------|
| **Core value** | Features and UI | Autonomous outcomes |
| **User interaction** | Manual, click-through | Conversational, delegated |
| **Architecture** | UI -> API -> DB | Agent -> Tools -> Data |
| **Scaling** | More features | Better agent capabilities |
| **Competitive moat** | Feature completeness | Data loops + agent quality |
| **Human-in-the-loop** | Always required | Minimized by design |

### Key Thesis: "Services as Software"

The big push of 2025 was getting agents to actually do work — not just generate outputs, but execute workflows end to end. 2026 is when startups catch up to the ambition and enterprises move from pilots to production.

Vertical (industry-specific) AI agents almost always have **better economics and faster paths to product-market fit** than horizontal agents, with premium pricing and less competition.

### Companies in the AI Note-Taking / Knowledge Space

| Company | Approach | Key Differentiator |
|---------|----------|-------------------|
| **Notion AI** | AI layer on existing workspace | Meeting transcription, summarization, rewriting. Massive existing user base. |
| **Mem** | Self-organizing AI-native workspace | NLP understands note content, surfaces related notes. $8.33/month. |
| **Reflect** | Personal knowledge graph | Backlinks, daily notes, AI links related ideas from past entries. |
| **Granola** | Privacy-first meeting notes | Local/offline transcription, no bots join calls. |
| **Lindy** | AI workflow automation | Meeting notes + workflow automation across Slack, Notion, Google Docs. |

### Investor Thinking (2026)

- Investors **pivoting to agentic AI** and on-device hardware
- Enterprises increasing AI spending but **concentrating on fewer proven solutions**
- VCs requiring: **technical differentiation, market validation, financial discipline, regulatory preparedness**
- Focus areas: AI safeguards, data foundations, model optimization, tool consolidation, **vertical solutions**
- The production gap is the central challenge: ~66% experimenting with agents, <25% scaled to production

### Relevance to Noteshell

- Noteshell should position as **agent-first, not app-first** — the AI agents (Secretary, Research, Course) ARE the product, not features bolted onto a note editor
- **Vertical focus** (education/learning) has better economics than horizontal notes
- The knowledge graph pattern (Reflect, Mem) validates Noteshell's direction of connecting notes + AI
- Granola's privacy-first approach resonates — Noteshell's local-first option is a differentiator
- Investors want to see: production-ready agents, not demos. Noteshell needs to close the experimentation-to-production gap

---

## 5. MCP Server as Product Strategy

### The Strategic Thesis

MCP (Model Context Protocol) is rapidly becoming **the primary distribution channel for AI-age products** — analogous to how websites were the distribution channel for the internet age and apps were for the mobile age.

**"Every generation of software has a dominant distribution channel, and every time the channel shifts, the companies that build for the new interface first win the decade."** — [The PM's Guide to Agent Distribution](https://www.news.aakashg.com/p/master-ai-agent-distribution-channel)

### MCP as Distribution Channel vs. Integration Layer

It's **both**, but the distribution angle is increasingly dominant:

| Pattern | Description | Examples |
|---------|-------------|----------|
| **Distribution channel** | MCP server IS the primary product interface. Users discover + use the product through AI agents. | New startups building MCP-first |
| **Integration layer** | MCP sits on top of existing products, adding AI agent access | Stripe, Cloudflare, Atlassian |
| **Acquisition funnel** | MCP server drives organic discovery, converts to paid product | SecureLend ($0 CAC via MCP) |

### Who's Doing It

**Major companies with official MCP servers**: Stripe, Cloudflare, Supabase, Sentry, Expo, Hugging Face, Atlassian, Zapier. These work across Claude Code, GitHub Copilot, Cursor, Gemini CLI.

**Startups going MCP-first**: Within 30 days of launching an MCP server, companies report **150+ installations** across Claude, ChatGPT, and Cursor without spending a dollar on ads. Each installation = potential customer discovered via AI agent recommendation.

### Business Models

| Model | How It Works | Margins |
|-------|-------------|---------|
| **Pay-per-request** | Same as API monetization, new channel | High |
| **Subscription** | MCP access bundled with SaaS subscription | 80-90% |
| **Freemium funnel** | Free MCP server -> paid product upsell | Variable |
| **Lead generation** | MCP as discovery -> B2B sales | $0 CAC reported |

### Market Data

- **76% of software providers** are exploring or implementing MCP as their connectivity standard
- Anthropic's Claude Connectors made installing MCP servers **1-click**, driving installs up **3.5x** (per Stripe PMs)
- MCP server development costs: $25-50K (SMB MVP) to $60-120K (production multi-tenant SaaS)
- **AGENTS.md** is the emerging standard for telling agents how to work with your product (collaborative effort across OpenAI, Google, Cursor, GitHub, Amp)

### Key Distribution Strategies

1. **Build an official MCP server** — publish to registries, get discovered by AI agents
2. **Write AGENTS.md** — tell coding agents how to integrate with your product
3. **Publish AgentSkills** — portable skills that work across Claude Code, Codex, Gemini CLI
4. **Build DXT packages** — zero-config Claude Desktop extensions

### Relevance to Noteshell

This is potentially the **most strategically important finding** for Noteshell:

- Noteshell could build an MCP server that lets AI agents (Claude Code, Codex, Cursor) read/write notes, create flashcards, generate courses, and trigger spaced repetition reviews
- **$0 CAC distribution**: Users discover Noteshell because their AI coding assistant recommends it when they're studying or taking notes
- The MCP server becomes both a product (standalone value) and an acquisition funnel (leads to the full Noteshell app)
- Noteshell's AGENTS.md could instruct coding agents on how to create study materials from codebases
- Combined with ClawHub publishing, Noteshell could reach Claude Code + Codex + Gemini CLI + OpenClaw users simultaneously

---

## 6. Education/Learning Platforms Integrating with AI Assistants

### Current State

Education is one of the **most active categories** for MCP server development, driven by the natural fit between AI assistants and learning workflows.

### Existing MCP Servers for Education

| Server | What It Does |
|--------|-------------|
| **Anki MCP Server** | AI assistants interact with Anki spaced repetition. Create/update/search flashcards. v0.8.0 beta. Multiple implementations (npm, PyPI). |
| **Rember MCP** | Integrates with Rember spaced repetition platform. Create flashcards directly from Claude conversations. |
| **Mandarin MCP** | Mandarin Chinese vocabulary from HSK levels 1-6. Progress tracking, spaced repetition, quiz generation, Anki export. |
| **Google Classroom MCP** | K-12 classroom orchestration. Interact with streams, coursework, student rosters. |
| **Canvas LMS MCP** | Teacher-facing server wrapping Canvas REST API. Create/manage course content. |
| **EduChain MCP** | Generative educational content. QTI format for LMS import. |
| **Obsidian MCP** | Full vault access — read, write, search notes. Knowledge graph. Claude can organize, summarize, build dashboards. |

### Education Startups with AI Agent Integration

| Startup | Funding | Approach |
|---------|---------|----------|
| **Oboe** | $16M | AI-driven personalized course generation. Generate comprehensive courses on any topic in seconds. |
| **Sparkli** | $5M pre-seed | Kids-first multimodal AI learning (ages 5-12, ~600M learners). Former Google engineers. |
| **Frizzle** | White House AI Education Partner | Shifts education from "waterfall" to "agile learning". Real-time student thinking insights. |
| **Risely** | Active | AI agents as "operating system for universities". Improves retention, staff productivity. |

### Key Patterns in Education + AI

1. **Spaced repetition + AI**: The Anki MCP server pattern — AI creates flashcards from conversations/code, feeds them into spaced repetition systems. Multiple independent implementations exist, showing strong demand.
2. **Course generation**: Oboe's model — AI generates full curricula instantly. Noteshell's course system is already doing this.
3. **Knowledge graph + AI**: Obsidian MCP + Reflect pattern — AI understands connections between notes, surfaces related content.
4. **Compliance matters**: FERPA and COPPA compliance is critical. MCP servers running locally help because student data doesn't need to be trained into public models.
5. **Claude Learning Mode**: Claude already has a built-in Learning Mode (Socratic approach, flashcards, practice problems) — Noteshell could build on top of this.

### No Direct Claude Code/Codex Education Tool Integration (Yet)

No education-specific tools have been found that deeply integrate with Claude Code or Codex CLI for learning purposes. This represents a **greenfield opportunity**:
- A Claude Code plugin that generates flashcards from code you're studying
- A Codex skill that creates course materials from a codebase
- An MCP server that feeds learning progress back into the coding agent's context

### Relevance to Noteshell

- **Noteshell sits at the exact intersection** of the two biggest trends: agent-first products + education AI
- The Anki MCP server validates demand for "AI-connected spaced repetition" but it's just a bridge to an existing tool — Noteshell could be the **native** platform
- Oboe ($16M for course generation) validates Noteshell's course generation feature as investor-attractive
- No one has built the "Claude Code plugin for learning" yet — Noteshell could be first
- A Noteshell MCP server could differentiate from Anki MCP by offering: native course generation, AI-powered note editing, research agent, secretary scheduling for study sessions — not just flashcards

---

## Strategic Synthesis for Noteshell

### The Opportunity Matrix

| Distribution Channel | Effort | Reach | Competitive Density |
|---------------------|--------|-------|-------------------|
| Claude Code Plugin | Medium | 488+ plugin marketplace users | Low for education |
| Codex CLI Skill | Low (same SKILL.md) | Growing Codex user base | Very low |
| ClawHub Skill | Low (same SKILL.md) | 250K+ OpenClaw users | Very low for education |
| DXT Package | Medium | Claude Desktop users | Low |
| MCP Server | High (but high-value) | All AI agent users | Medium overall, low for education |
| AGENTS.md | Very low | All coding agent users | Extremely low |

### Recommended Priority

1. **Build a Noteshell MCP server** (highest strategic value, $0 CAC distribution channel)
2. **Publish AgentSkills** (cross-platform, one SKILL.md reaches Claude Code + Codex + Gemini CLI + OpenClaw)
3. **Package as Claude Code Plugin** (bundle MCP + Skills + Commands)
4. **Write AGENTS.md** (near-zero effort, tells all coding agents about Noteshell)
5. **Build DXT for Claude Desktop** (additional distribution surface)

### Key Competitive Insight

Nobody has built the **"AI-native learning platform that distributes through coding agents"** yet. Anki MCP is just a bridge to an existing flashcard app. Oboe raised $16M for course generation but doesn't integrate with coding workflows. Noteshell could own the intersection of **coding assistant + learning platform + agent distribution** before anyone else.

---

## Sources

### OpenClaw
- [OpenClaw Official Site](https://openclaw.ai/)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [OpenClaw Wikipedia](https://en.wikipedia.org/wiki/OpenClaw)
- [What is OpenClaw? | DigitalOcean](https://www.digitalocean.com/resources/articles/what-is-openclaw)
- [ClawHub GitHub](https://github.com/openclaw/clawhub)
- [OpenClaw vs Claude Code | DataCamp](https://www.datacamp.com/blog/openclaw-vs-claude-code)
- [Can Anyone Actually Monetize OpenClaw?](https://getlago.substack.com/p/can-anyone-actually-monetize-openclaw)
- [OpenClaw Ecosystem Revenue | Bitget](https://www.bitget.com/news/detail/12560605228858)

### Claude Code Plugins
- [Claude Code Plugin Docs](https://code.claude.com/docs/en/plugins)
- [Official Plugin Directory | GitHub](https://github.com/anthropics/claude-plugins-official)
- [Claude Plugins Marketplace](https://claude.com/plugins)
- [PR Review Toolkit Plugin](https://claude.com/plugins/pr-review-toolkit)
- [Anthropic Enterprise Plugins | gHacks](https://www.ghacks.net/2026/02/25/anthropic-expands-claude-with-enterprise-plugins-and-marketplace/)
- [50+ Best MCP Servers for Claude Code](https://claudefa.st/blog/tools/mcp-extensions/best-addons)
- [Top 10 Claude Code Plugins | Composio](https://composio.dev/content/top-claude-code-plugins)
- [Claude Code Skills vs MCP vs Plugins | MorphLLM](https://www.morphllm.com/claude-code-skills-mcp-plugins)
- [DXT Desktop Extensions](https://www.desktopextensions.com/)

### Codex CLI
- [Codex CLI Official](https://developers.openai.com/codex/cli/)
- [Codex Agent Skills](https://developers.openai.com/codex/skills/)
- [Codex Changelog](https://developers.openai.com/codex/changelog/)
- [Codex GitHub](https://github.com/openai/codex)
- [Codex vs Claude Code | Builder.io](https://www.builder.io/blog/codex-vs-claude-code)
- [Codex vs Claude Code | MorphLLM](https://www.morphllm.com/comparisons/codex-vs-claude-code)

### Agent-First Platforms
- [5 Key Trends Shaping Agentic Development | The New Stack](https://thenewstack.io/5-key-trends-shaping-agentic-development-in-2026/)
- [7 Agentic AI Trends | MachineLearningMastery](https://machinelearningmastery.com/7-agentic-ai-trends-to-watch-in-2026/)
- [Gartner: 40% Enterprise Apps with AI Agents by 2026](https://www.gartner.com/en/newsroom/press-releases/2025-08-26-gartner-predicts-40-percent-of-enterprise-apps-will-feature-task-specific-ai-agents-by-2026-up-from-less-than-5-percent-in-2025)
- [Where AI is Headed in 2026 | Foundation Capital](https://foundationcapital.com/ideas/where-ai-is-headed-in-2026)
- [AI Product Strategy 2026 | Presta](https://wearepresta.com/ai-product-strategy-2026-the-founders-guide-to-ai-native-growth/)
- [Best AI Note-Taking Apps 2026 | Lindy](https://www.lindy.ai/blog/ai-note-taking-app)

### MCP Server Strategy
- [PM's Guide to Agent Distribution](https://www.news.aakashg.com/p/master-ai-agent-distribution-channel)
- [Building Distribution Channel with MCP | DEV.to](https://dev.to/securelend/i-am-building-a-multi-million-dollar-distribution-channel-with-mcp-instead-of-google-ads-mmp)
- [MCP Demo Day | Cloudflare](https://blog.cloudflare.com/mcp-demo-day/)
- [Why Every Startup Will Have an MCP Server | Medium](https://medium.com/@kushalburad07/why-every-startup-will-have-an-mcp-server-by-2026-491d53a761a8)
- [2026: Enterprise-Ready MCP Adoption | CData](https://www.cdata.com/blog/2026-year-enterprise-ready-mcp-adoption)
- [How to Develop MCP Product Strategy | Substack](https://departmentofproduct.substack.com/p/how-to-develop-an-mcp-product-strategy)

### Education + AI
- [Best MCP Servers for Education | Fast.io](https://fast.io/resources/best-mcp-servers-education/)
- [Anki MCP Server | GitHub](https://github.com/ankimcp/anki-mcp-server)
- [Rember MCP | MCP Market](https://mcpmarket.com/server/rember)
- [Mandarin MCP Server | GitHub](https://github.com/w41ch0ng/MandarinMCP)
- [Obsidian MCP Server | GitHub](https://github.com/cyanheads/obsidian-mcp-server)
- [Oboe $16M Funding](https://aifundingtracker.com/top-50-ai-startups/)
- [Sparkli $5M Pre-Seed | AI CERTs](https://www.aicerts.ai/news/edtech-startup-sparkli-raises-5m-for-kids-ai-learning-platform/)
- [YC Education Startups 2026](https://www.ycombinator.com/companies/industry/education)
