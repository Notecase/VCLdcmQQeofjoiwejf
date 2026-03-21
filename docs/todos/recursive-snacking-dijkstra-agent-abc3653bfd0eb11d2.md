# AI Models & Frameworks Research - March 2026

**Purpose:** CTO-level decision document for Inkdown/Noteshell agent system model selection.
**Date:** 2026-03-18
**Status:** Research complete

---

## 1. Google Gemini Models (March 2026)

### Current Model Lineup

| Model | Input $/1M tokens | Output $/1M tokens | Context | Status |
|---|---|---|---|---|
| **Gemini 3.1 Pro Preview** | $2.00 | $12.00 | 1M | Latest flagship (Feb 19, 2026). >200K: $4/$18 |
| **Gemini 2.5 Pro** | $1.25 | $10.00 | 1M | GA (Jun 17, 2025). >200K: $2.50/$15 |
| **Gemini 2.5 Flash** | $0.30 | $2.50 | 1M | GA. Best price/performance ratio |
| **Gemini 2.5 Flash Lite** | $0.10 | $0.40 | 1M | Cheapest Gemini option for high-throughput |
| **Gemini 3 Flash Preview** | $0.50 | $3.00 | 1M | Preview (retiring Mar 9, upgrade to 3.1) |
| **Gemini 3.1 Flash Lite** | TBD | TBD | 1M | Released Mar 3, 2026 |

**Key notes:**
- Gemini 3.1 Pro scored 77.1% on ARC-AGI-2 -- massive reasoning leap
- Gemini 2.0 Flash deprecated, shuts down June 1, 2026
- Context caching available at $0.20/1M tokens (under 200K context)
- Gemini Enterprise subscription: $30/user/month for businesses

### Image Generation (Imagen)

| Model | Price/Image |
|---|---|
| Imagen 4 Fast | $0.02 |
| Imagen 4 Standard | $0.04 |
| Imagen 4 Ultra | $0.06 |

---

## 2. OpenAI Models (March 2026)

### Current Model Lineup

| Model | Input $/1M tokens | Output $/1M tokens | Context | Status |
|---|---|---|---|---|
| **GPT-5.4 Pro** | $30.00 | $180.00 | 1.05M | Latest top-tier (Mar 2026) |
| **GPT-5.2 Pro** | $21.00 | $168.00 | -- | High-end reasoning |
| **GPT-5.2** | $1.75 | $14.00 | -- | Current mainstream flagship |
| **GPT-5.1** | $0.63 | $5.00 | -- | Budget-friendly GPT-5 |
| **GPT-5** (base) | $1.25 | $10.00 | -- | Released Aug 7, 2025 |
| **GPT-4o** | $2.50 | $10.00 | 128K | Previous gen, still available |
| **GPT-4o mini** | $0.15 | $0.60 | 128K | Cheapest practical model |
| **GPT-4.1** | $2.00 | $8.00 | -- | Intermediate option |
| **GPT-OSS-20b** | $0.03 | -- | -- | Open-source, cheapest |

**Key notes:**
- GPT-5.4/5.4 Pro: >272K input tokens = 2x input, 1.5x output pricing
- Batch API: 50% savings on async 24-hour jobs
- Assistants API will be deprecated mid-2026, replaced by Responses API

### Image Generation

| Model | Price/Image |
|---|---|
| DALL-E 3 | $0.04 - $0.12 |
| GPT Image 1 | $0.011 - $0.25 |
| GPT Image 1 Mini | $0.005 - $0.052 |
| GPT Image 1.5 | $0.009 - $0.20 (quality leader, ~$0.04 standard) |

---

## 3. Anthropic Claude Models (March 2026)

### Current Model Lineup

| Model | Input $/1M tokens | Output $/1M tokens | Context | Status |
|---|---|---|---|---|
| **Claude Opus 4.6** | $5.00 | $25.00 | 200K | Released Feb 5, 2026. Best coding/reasoning |
| **Claude Sonnet 4.6** | $3.00 | $15.00 | 200K | Released Feb 17, 2026. >200K: $6/$22.50 |
| **Claude Haiku 4.5** | $1.00 | $5.00 | 200K | Released Oct 15, 2025. Fast/budget |

**Key notes:**
- Opus 4.6 is 67% cheaper than its predecessor (Opus 4.5)
- All models support text + image input, multilingual, vision
- Notion recommends: Opus 4.6 as default, then Sonnet 4.5, then Gemini 3

---

## 4. DeepSeek Models (March 2026)

### Current Model Lineup

| Model | Input $/1M tokens | Output $/1M tokens | Context | Status |
|---|---|---|---|---|
| **DeepSeek-V3.2** | $0.014 | $0.028 | 128K | Dec 2025. Integrated thinking + tool-use |
| **DeepSeek-V3.2 Speciale** | Higher (TBD) | Higher (TBD) | 128K | Surpasses GPT-5 on reasoning |
| **DeepSeek-R1** | $0.55 | $2.19 | -- | Reasoning model (Jan 2025) |

**Key notes:**
- V3.2 pricing is ~100x cheaper than GPT-5.2 on input tokens
- Off-peak discounts: 75% off R1, 50% off V3 (16:30-00:30 GMT)
- New accounts get 5M free tokens (~$8.40 value, 30 days)
- V3.2-Speciale matches GPT-5 and Gemini 3.0 Pro on reasoning benchmarks
- V3.2 is first model to integrate thinking into tool-use
- IMO and IOI gold-medal performance
- MIT License -- can self-host

---

## 5. Image Generation Models Comparison

| Model | Provider | Price/Image | Quality Tier |
|---|---|---|---|
| Flux 2 Schnell | Black Forest Labs | $0.015 | Good (best value) |
| Imagen 4 Fast | Google | $0.02 | Good |
| Tencent Hunyuan 3.0 | Tencent | $0.030 | Good |
| ByteDance Seedream 4.5 | ByteDance | $0.035 | Good |
| Imagen 4 Standard | Google | $0.04 | Great |
| GPT Image 1.5 (standard) | OpenAI | $0.04 | Top (quality leader) |
| Flux 2 Pro v1.1 | Black Forest Labs | $0.055 | Top (tied #1 on LM Arena) |
| Imagen 4 Ultra | Google | $0.06 | Great |

**Recommendation for Inkdown:** Imagen 4 Fast ($0.02) or Flux 2 Schnell ($0.015) for bulk generation. GPT Image 1.5 for quality-critical use cases.

---

## 6. Deep Research APIs

### Google Gemini Deep Research

- **Status:** Preview (available via Interactions API)
- **Model ID:** `deep-research-pro-preview-12-2025`
- **How it works:** Background execution mode. Set `background=True`, get interaction ID, poll for completion
- **Underlying model:** Gemini 3.1 Pro ($2/$12 per 1M tokens)
- **Estimated cost per query:**
  - Standard research: ~80 searches, ~250K input (~50-70% cached), ~60K output = **~$1-3/query**
  - Complex research: ~160 searches, ~900K input, ~80K output = **~$5-15/query**
- **Features:** File uploads, granular citations, structured JSON output, file_search tool for internal docs + web research combined

### OpenAI Deep Research

- **Status:** GA (launched Jun 27, 2025)
- **Models:**
  - `o3-deep-research`: $10/$40 per 1M tokens. **Avg ~$10/query, up to ~$30/query**
  - `o4-mini-deep-research`: $2/$8 per 1M tokens. **~$0.92/query average** (10 queries = $9.18)
- **How it works:** Standard Chat Completions endpoint. Autonomously plans sub-questions, web search, code execution
- **Feb 2026 update:** MCP support, restrict searches to trusted sites, real-time progress tracking, interrupt/refine mid-research

### Verdict for Inkdown

| Feature | Gemini Deep Research | OpenAI Deep Research |
|---|---|---|
| Cost (standard query) | $1-3 | $0.92 (o4-mini) / $10 (o3) |
| API maturity | Preview | GA |
| Custom source support | Yes (file_search) | Yes (MCP, Feb 2026) |
| Output quality | Very good | o3 = best, o4-mini = good |
| Real-time progress | Polling | Streaming + interrupt |

**Recommendation:** o4-mini-deep-research for cost efficiency (~$1/query). Gemini Deep Research for when you need file_search grounding with internal docs. Avoid o3-deep-research for user-facing features (too expensive).

---

## 7. Agent Frameworks Comparison (2026)

### Framework Landscape

| Framework | Language | Multi-Agent | Production Ready | Best For |
|---|---|---|---|---|
| **Vercel AI SDK 6** | TypeScript | Yes (Orchestrator-Worker) | Yes | Next.js/Vercel apps, streaming UI |
| **Mastra** | TypeScript | Yes (Supervisor pattern) | Yes (v1 beta) | TS-native agents, from Gatsby team |
| **LangGraph** | Python | Yes (stateful graphs) | Yes (v1.0) | Complex stateful workflows |
| **CrewAI** | Python | Yes (role-based teams) | Mostly | Business workflow automation |
| **AutoGen** | Python | Yes (conversational) | Yes | Research, conversational agents |
| **OpenAgents** | Multi | Yes (A2A protocol) | Emerging | Agent interoperability |

### Detailed Analysis

**Vercel AI SDK 6 (Current choice for Inkdown)**
- New `Agent` abstraction for reusable agents with model, instructions, tools
- `ToolLoopAgent` class handles complete tool execution loop
- Orchestrator-Worker pattern: one orchestrator dispatches specialists in parallel
- Human-in-the-loop: `needsApproval: true` on tools for gated actions
- AI SDK 5 (Jul 2025) added agentic loop control, typed chat messages, dynamic tooling
- Tight integration with React/Next.js streaming

**Mastra (Strong contender)**
- From the Gatsby founding team (Kyle Mathews, Abhi Aiyer, Shane Allen)
- $13M seed (YC, Paul Graham, Gradient Ventures)
- 150K weekly npm downloads -- 3rd fastest growing JS framework ever
- Enterprise users: Replit, SoftBank, PayPal, Adobe, Docker
- Built-in: agents, tools, RAG, workflows, memory, orchestration, evals, observability
- Server Adapters: auto-expose agents as HTTP endpoints
- Supervisor pattern for multi-agent orchestration
- MCP server support

**LangGraph (Python ecosystem leader)**
- v1.0 in late 2025, default runtime for all LangChain agents
- State persistence with reducer logic for concurrent updates
- Best for: precise execution order, branching, error recovery
- Mature monitoring and observability

**CrewAI**
- Easiest mental model (roles, tasks, skills)
- 5-agent crew costs 5x a single agent per task
- Less mature monitoring than LangGraph
- Good for: business workflow automation prototypes

### Recommendation for Inkdown/Noteshell

**Stay with Vercel AI SDK** for the web app layer (streaming, React integration, deployment). Consider **Mastra** for the backend agent orchestration layer -- it has the TypeScript-native ergonomics, production adoption at scale (Replit, Adobe, Docker), built-in evals/observability, and MCP support that would complement your existing architecture.

The key question is whether Mastra's supervisor pattern would replace your current custom agent system in `packages/ai/` or complement it.

---

## 8. Guardrails Frameworks

### Framework Comparison

| Framework | Approach | Best For | Language |
|---|---|---|---|
| **NeMo Guardrails** (NVIDIA) | State-machine dialogue control (Colang) | Dialogue flow, topic blocking, safety rails | Python |
| **Guardrails AI** | Output validation + correction | Structured output, type safety, quality checks | Python |
| **AWS Bedrock Guardrails** | Managed service | AWS-deployed AI apps | API |
| **Codacy Guardrails** | Code security in IDE | Cursor/VS Code/Windsurf code review | IDE plugin |
| **Custom (most companies)** | Prompt engineering + app-level checks | When you need full control | Any |

### What Major Companies Actually Do

**Notion:** Custom guardrails. Admin access controls, logging, reversibility. Uses Claude Opus 4.6 + Gemini 3 Pro + GPT-5. Recommends Opus 4.6 as default. Every agent run is logged, changes are visible and reversible. No specific named framework.

**Industry trend (2026):** The consensus is shifting toward "designed oversight" -- decision boundaries, runtime guardrails, human-in-the-loop workflows, and auditability built into the application architecture itself, rather than bolt-on frameworks. Successful agentic deployments prioritize governance over model power.

### Recommendation for Inkdown/Noteshell

For a note-taking/learning platform, the primary risks are:
1. AI editing user content incorrectly (already handled by your diff/accept system)
2. AI generating harmful/inappropriate content in notes
3. Cost runaway from agent loops

**Practical approach:**
- **Level 1 (now):** Custom app-level guardrails -- max token budgets per request, content policy in system prompts, human-in-the-loop for destructive operations (already have accept/reject for edits)
- **Level 2 (scale):** Add Guardrails AI for output validation if you need structured guarantees
- **Level 3 (enterprise):** NeMo Guardrails for dialogue flow control if building complex conversational agents

Most companies at Inkdown's stage use custom guardrails, not frameworks.

---

## 9. Cost Comparison Matrix for Inkdown Use Cases

### Agent Tasks & Recommended Models

| Use Case | Recommended Model | Cost/1M tokens (in/out) | Est. Cost/Request |
|---|---|---|---|
| **Chat (simple Q&A)** | Gemini 2.5 Flash Lite | $0.10/$0.40 | ~$0.001 |
| **Note editing** | Claude Sonnet 4.6 | $3.00/$15.00 | ~$0.02-0.05 |
| **Deep editing/compound** | Claude Opus 4.6 | $5.00/$25.00 | ~$0.10-0.30 |
| **Secretary/planning** | Gemini 2.5 Flash | $0.30/$2.50 | ~$0.005-0.01 |
| **Course generation** | GPT-5.2 or Gemini 2.5 Pro | $1.25-1.75/$10-14 | ~$0.05-0.15 |
| **Deep research** | o4-mini-deep-research | $2.00/$8.00 | ~$0.50-1.00 |
| **Image generation** | Imagen 4 Fast | $0.02/image | $0.02 |
| **Bulk/batch tasks** | DeepSeek V3.2 | $0.014/$0.028 | ~$0.0005 |

### Monthly Cost Estimates (1000 DAU)

Assuming each user triggers ~10 AI requests/day across different tiers:

| Tier | Requests/day | Model | Daily Cost | Monthly Cost |
|---|---|---|---|---|
| Light (chat, secretary) | 7,000 | Gemini 2.5 Flash | $7 | $210 |
| Medium (editing) | 2,000 | Claude Sonnet 4.6 | $60 | $1,800 |
| Heavy (deep edit, research) | 500 | Opus 4.6 / Deep Research | $100 | $3,000 |
| Images | 500 | Imagen 4 Fast | $10 | $300 |
| **Total estimate** | | | **$177/day** | **$5,310/mo** |

---

## 10. Strategic Recommendations

### Model Selection Strategy

1. **Default agent model:** Gemini 2.5 Flash ($0.30/$2.50) -- best price/performance for most tasks
2. **Quality-critical editing:** Claude Sonnet 4.6 ($3/$15) -- best at following complex editing instructions
3. **Flagship/compound tasks:** Claude Opus 4.6 ($5/$25) or Gemini 3.1 Pro ($2/$12)
4. **Research feature:** o4-mini-deep-research (~$1/query) -- cost-effective deep research
5. **Batch/background:** DeepSeek V3.2 ($0.014/$0.028) -- 100x cheaper, MIT licensed, self-hostable
6. **Image generation:** Imagen 4 Fast ($0.02) for standard, GPT Image 1.5 for quality

### Key Decisions to Make

1. **BYOK vs managed:** DeepSeek V3.2 can be self-hosted (MIT license) -- dramatically reduces cost at scale
2. **Multi-provider routing:** Route by task complexity to optimize cost (already your architecture direction)
3. **Caching strategy:** Gemini's context caching ($0.20/1M) can reduce costs for repeated contexts
4. **Agent framework:** Evaluate Mastra as potential replacement/complement to custom agent system
5. **Deep research:** Ship with o4-mini-deep-research first, add Gemini Deep Research when it exits preview

---

## Sources

### Google Gemini
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini Models](https://ai.google.dev/gemini-api/docs/models)
- [Vertex AI Pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)
- [Gemini 2.5 Pro Pricing](https://pricepertoken.com/pricing-page/model/google-gemini-2.5-pro)
- [Gemini 3.1 Pro Pricing Guide](https://www.glbgpt.com/hub/gemini-3-1-pro-cost-complete-2026-pricing-guide/)
- [Gemini 3.1 Pro Analysis](https://artificialanalysis.ai/models/gemini-3-1-pro-preview)

### OpenAI
- [OpenAI API Pricing](https://developers.openai.com/api/docs/pricing)
- [OpenAI Pricing Page](https://openai.com/api/pricing/)
- [GPT-5 Pricing](https://pricepertoken.com/pricing-page/model/openai-gpt-5)
- [OpenAI Pricing 2026](https://www.finout.io/blog/openai-pricing-in-2026)
- [o3 Deep Research Pricing](https://pricepertoken.com/pricing-page/model/openai-o3-deep-research)

### Anthropic Claude
- [Claude Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Claude Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude Haiku 4.5 Announcement](https://www.anthropic.com/news/claude-haiku-4-5)
- [Claude API Pricing 2026](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)

### DeepSeek
- [DeepSeek API Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [DeepSeek V3.2 Release](https://api-docs.deepseek.com/news/news251201)
- [DeepSeek Technical Tour](https://magazine.sebastianraschka.com/p/technical-deepseek)
- [DeepSeek Guide 2026](https://deepseek.ai/blog/deepseek-guide-2026)

### Image Generation
- [AI Image API Comparison 2026](https://blog.laozhang.ai/en/posts/ai-image-generation-api-comparison-2026)
- [OpenAI Images Pricing](https://costgoat.com/pricing/openai-images)
- [AI Image Generation Cost 2026](https://www.imagine.art/blogs/ai-image-generation-cost)

### Deep Research APIs
- [Gemini Deep Research API](https://ai.google.dev/gemini-api/docs/deep-research)
- [Gemini Deep Research Production Guide](https://medium.com/google-cloud/how-to-use-the-gemini-deep-research-api-in-production-978055873a39)
- [OpenAI Deep Research API Cookbook](https://cookbook.openai.com/examples/deep_research_api/introduction_to_deep_research_api)
- [OpenAI Deep Research Launch](https://www.cometapi.com/openai-launches-deep-research-api-add-web-search/)
- [o3-deep-research Model](https://platform.openai.com/docs/models/o3-deep-research)
- [Deep Research API Cost Analysis](https://x.com/ArtificialAnlys/status/1940896348364210647)

### Agent Frameworks
- [Vercel AI SDK 6](https://vercel.com/blog/ai-sdk-6)
- [AI SDK Agents](https://sdk.vercel.ai/docs/foundations/agents)
- [Mastra Framework](https://github.com/mastra-ai/mastra)
- [Mastra $13M Seed](https://technews180.com/funding-news/mastra-raises-13m-seed-for-typescript-ai-framework/)
- [Agent Frameworks Compared 2026](https://openagents.org/blog/posts/2026-02-23-open-source-ai-agent-frameworks-compared)
- [Top AI Agent Frameworks](https://www.turing.com/resources/ai-agent-frameworks)
- [LangGraph vs CrewAI vs AutoGen](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen)

### Guardrails
- [NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails)
- [Guardrails AI](https://guardrailsai.com/)
- [AI Agent Guardrails Production Guide 2026](https://authoritypartners.com/insights/ai-agent-guardrails-production-guide-for-2026/)
- [NeMo Guardrails - ThoughtWorks Radar](https://www.thoughtworks.com/radar/tools/nemo-guardrails)
- [Notion AI Releases](https://www.notion.com/releases/2026-01-20)
