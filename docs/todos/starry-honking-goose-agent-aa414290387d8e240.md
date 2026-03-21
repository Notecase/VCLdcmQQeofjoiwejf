# Superdesign: Complete Deep-Dive Analysis

**Date**: 2026-03-12
**Purpose**: Comprehensive explanation of how Superdesign works, suitable for explaining to a non-technical CEO.

---

## 1. What is Superdesign?

Superdesign is an **AI-powered design agent that lives inside your code editor**. Instead of opening Figma or Photoshop, a developer types something like "Design a modern login screen" and Superdesign generates multiple polished UI designs as actual HTML files, right inside the project folder.

**Tagline**: "The 1st Design Agent lives inside your IDE"

**Created by**: Jason Zhou ("AI Jason"), a YouTuber with ~200k subscribers who covers AI/LLM applications. Co-founded with @jackjack_eth.

**Open source**: Yes, fully open source on GitHub (6.1k stars, 689 forks as of March 2026).

---

## 2. The Superdesign Product Ecosystem (Three Separate Products)

Superdesign is NOT a single product. It is actually **three separate things** that work together:

### Product A: The VS Code / IDE Extension (Main Product)

- **What it is**: A VS Code extension installable from the marketplace
- **Repo**: `github.com/superdesigndev/superdesign`
- **Tech**: TypeScript (86%), built as a standard VS Code extension with a React-based webview sidebar
- **How it works**: Provides a chat sidebar + a "Canvas" webview where generated designs are previewed
- **AI providers**: Supports Anthropic API (direct), Claude Code binary, OpenAI, OpenRouter, and local LLM servers (LM Studio, etc.)
- **Works in**: VS Code, Cursor, Windsurf

### Product B: The MCP Server for Claude Code (Community-Built)

- **What it is**: A separate MCP (Model Context Protocol) server that makes Superdesign's design methodology available as tools inside Claude Code
- **Repo**: `github.com/jonthebeef/superdesign-mcp-claude-code` (by "jonthebeef", NOT by the main Superdesign team)
- **Key difference**: No API keys needed -- it piggybacks on Claude Code's built-in LLM connection
- **Tech**: A single `index.ts` file using `@modelcontextprotocol/sdk`

### Product C: The Web Platform + Prompt Library

- **What it is**: A web app at `app.superdesign.dev` with a community-driven design prompt library
- **What it does**: Users share and discover design prompts (styles, animations, UI components) that work with any coding agent
- **Think of it as**: A "prompt marketplace" for design

### Product D: Chrome Extension ("Component Grab")

- **What it is**: A Chrome extension that captures any live website's UI and converts it to clean Tailwind CSS code
- **Pricing**: "Free forever" per Jason Zhou's tweet
- **Use case**: Clone existing websites/components, paste into Superdesign or your IDE

---

## 3. Architecture of the VS Code Extension (Product A) -- Deep Dive

### File Structure

```
superdesign/
  src/
    extension.ts          -- VS Code extension entry point
    providers/
      llmProviderFactory.ts   -- Factory pattern to pick AI provider
      llmProvider.ts          -- Abstract base class
      claudeApiProvider.ts    -- Talks to Anthropic API directly
      claudeCodeProvider.ts   -- Spawns the `claude` CLI binary as a subprocess
      chatSidebarProvider.ts  -- VS Code webview sidebar provider
    services/
      customAgentService.ts   -- Main agent: orchestrates tools + AI model
      claudeCodeService.ts    -- Wrapper around the LLM provider factory
      chatMessageService.ts   -- Chat history management
      logger.ts               -- Logging
    tools/
      read-tool.ts            -- File reading
      write-tool.ts           -- File writing
      edit-tool.ts            -- File editing
      bash-tool.ts            -- Shell command execution
      glob-tool.ts            -- File pattern matching
      grep-tool.ts            -- Content search
      ls-tool.ts              -- Directory listing
      multiedit-tool.ts       -- Batch edits
      theme-tool.ts           -- Theme extraction
      tool-utils.ts           -- Shared utilities
    webview/
      App.tsx                 -- React app (webview UI)
      components/
        CanvasView.tsx        -- Design preview canvas
        Chat/                 -- Chat interface components
        DesignFrame.tsx       -- Individual design frame
        DesignPanel.tsx       -- Design panel container
        MarkdownRenderer.tsx  -- Renders markdown in chat
        Welcome/              -- Onboarding flow
      hooks/                  -- React hooks
    types/
      agent.ts                -- AgentService interface
      context.ts              -- Context types
    templates/
      webviewTemplate.ts      -- HTML template for webview
    assets/                   -- Images, icons
  system-prompt.txt           -- The core design system prompt
  package.json                -- Extension manifest + VS Code contributions
```

### Two LLM Provider Modes

The extension supports two fundamentally different ways to call AI:

**Mode 1: Claude API (Default)**

- Uses `@ai-sdk/anthropic` (Vercel AI SDK)
- Requires user's own Anthropic API key
- The extension itself is the "brain" -- it calls the AI model, provides tools, orchestrates the conversation
- Custom agent service provides tools (Read, Write, Edit, Bash, Glob, Grep, etc.) to the AI model
- Supports OpenAI, OpenRouter, and custom URLs as alternatives

**Mode 2: Claude Code Binary**

- Spawns the `claude` CLI binary as a child process
- Passes the system prompt via stdin, user prompt via `-p` flag
- Uses `--dangerously-skip-permissions` to auto-approve file operations
- No API key needed (uses whatever auth the Claude CLI has)
- Model configurable: Sonnet 4, Sonnet 3.5, Haiku, Opus
- Thinking budget configurable (default 50,000 tokens)

### The System Prompt (The Secret Sauce)

The `system-prompt.txt` is the heart of Superdesign. It instructs the AI:

1. **Role**: "You are a senior front-end designer. Pay attention to every pixel, spacing, font, color."
2. **Parallelism**: "ALWAYS spin up 3 parallel sub agents concurrently to implement one design with variations"
3. **Output format**: Each design = one standalone HTML file saved to `.superdesign/design_iterations/`
4. **File naming**: `{design_name}_{n}.html` for new designs, `{current_file_name}_{n}.html` for iterations
5. **Tech specs**:
   - Use Tailwind CSS via CDN
   - No images (webview can't render them) -- use CSS placeholders
   - 4pt or 8pt spacing system
   - Responsive design mandatory
   - Text only black or white
6. **Design style**: Elegant minimalism, white space, shadows, card layouts, rounded corners

### The Canvas (Design Preview)

When designs are generated:

1. Files are saved as `.html` in `.superdesign/design_iterations/`
2. The "Canvas View" (`CanvasView.tsx`) opens as a VS Code webview panel
3. Each HTML file is rendered in an iframe within the canvas
4. Users can zoom, pan, compare variations side by side
5. The canvas includes "fork" functionality to iterate on any design

### Initialization Flow

When a user runs "Initialize Superdesign":

1. Creates `.superdesign/` directory in the workspace root
2. Creates `design_iterations/` subdirectory for generated designs
3. Creates `moodboard/` subdirectory for uploaded reference images
4. Extracts design context from the existing project:
   - `init/theme.md` -- extracted theme/CSS variables
   - `init/components.md` -- discovered UI components
   - `init/layouts.md` -- existing layout patterns
   - `init/pages.md` -- page structure
   - `init/routes.md` -- routing information
   - `init/extractable-components.md` -- reusable component candidates
5. Generates `design-system.md` -- a high-level design system document

This context extraction is what makes Superdesign "project-aware" -- it reads your existing code to understand your design language before generating new designs.

---

## 4. Architecture of the MCP Server (Product B) -- Deep Dive

The MCP server is a **completely separate product** from the VS Code extension. It was built by a community member (jonthebeef) to solve a specific problem: the VS Code extension required its own API key, but Claude Code users already have AI access.

### How MCP Works (For the CEO)

Think of MCP as a "plugin protocol" for AI assistants. Just like how a phone has a standard way to connect to Bluetooth speakers, MCP is a standard way for AI tools (like Claude Code) to connect to external capabilities.

The MCP server is a small Node.js program that runs on the developer's machine. It communicates with Claude Code using stdin/stdout (simple text messages back and forth). It does NOT make any network calls. It does NOT have its own AI.

### What the MCP Server Actually Does

The MCP server is an **orchestrator, NOT a generator**. This is the crucial insight:

1. User says to Claude Code: "Design a modern dashboard"
2. Claude Code calls the MCP tool `superdesign_generate`
3. The MCP server returns **structured instructions** (NOT the actual design) -- essentially the system prompt, file naming conventions, design guidelines
4. Claude Code itself then generates the HTML designs following those instructions
5. Claude Code saves the files to the `superdesign/design_iterations/` folder

The MCP server provides the "design methodology" but Claude Code's own AI does all the actual creative work.

### MCP Tools Exposed

| Tool                         | Purpose                                                    | Parameters                                                                                                   |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `superdesign_generate`       | Returns design specs for Claude to execute                 | `prompt`, `design_type` (ui/wireframe/component/logo/icon), `variations` (1-5), `framework` (html/react/vue) |
| `superdesign_iterate`        | Returns iteration instructions                             | `design_file` (path), `feedback` (text), `variations` (1-5)                                                  |
| `superdesign_extract_system` | Returns design system extraction instructions              | `image_path` (screenshot path)                                                                               |
| `superdesign_list`           | Lists all generated designs                                | `workspace_path` (optional)                                                                                  |
| `superdesign_gallery`        | Generates interactive HTML gallery                         | `workspace_path` (optional)                                                                                  |
| `superdesign_delete`         | Deletes a design file                                      | `filename`, `workspace_path`                                                                                 |
| `superdesign_cleanup`        | Removes old designs                                        | `max_age_days`, `max_count`, `dry_run`                                                                       |
| `superdesign_live_gallery`   | Starts a live-reloading local web server to browse designs | `workspace_path`, `port`                                                                                     |
| `superdesign_check_files`    | Compares file manifest for smart refresh                   | `workspace_path`, `manifest`                                                                                 |

### MCP Installation

```bash
# Clone, build
git clone https://github.com/jonthebeef/superdesign-mcp-claude-code
npm install && npm run build

# Register with Claude Code
claude mcp add --scope user superdesign node /path/to/dist/index.js

# Or add to ~/.claude-code/mcp-settings.json:
{
  "mcpServers": {
    "superdesign": {
      "command": "node",
      "args": ["/path/to/superdesign/dist/index.js"]
    }
  }
}
```

---

## 5. SKILL.md Files and Claude Code Plugin Architecture

### What are Skills? (General Claude Code concept, not Superdesign-specific)

Claude Code has a plugin/skill system:

- **Plugins** live in a `.claude-plugin/` directory with a `plugin.json` manifest
- **Skills** are folders containing a `SKILL.md` file with YAML frontmatter + markdown instructions
- Skills work via "progressive disclosure":
  1. At startup, Claude loads only each skill's name + description (~100 tokens each)
  2. When Claude detects a relevant user request, it loads the full SKILL.md instructions
  3. Supporting files load only when needed

**Skills inject instructions into Claude's context** rather than performing actions directly. They prepare Claude to solve a problem, rather than solving it.

### Does Superdesign Use SKILL.md Files?

**No.** The main Superdesign product is a VS Code extension, not a Claude Code plugin. It does not use SKILL.md files or plugin.json.

The MCP server (Product B) also does not use SKILL.md -- it uses the MCP protocol (tools via `@modelcontextprotocol/sdk`).

However, Superdesign effectively achieves the same thing as a skill: when the MCP server's `superdesign_generate` tool is called, it returns a large block of design instructions (essentially the system prompt) that Claude then follows. This is functionally equivalent to a skill injecting instructions.

---

## 6. Complete User Flows

### Flow A: VS Code Extension User

1. **Install**: Search "Superdesign" in VS Code/Cursor marketplace, click Install
2. **Configure**: Set API key (Anthropic, OpenAI, or OpenRouter) via command palette, OR set provider to "claude-code" to use existing Claude CLI
3. **Initialize**: Run "Superdesign: Initialize" from command palette -- creates `.superdesign/` folder, analyzes existing project design patterns
4. **Design**: Open Superdesign sidebar, type "Design a modern pricing page"
5. **Generate**: AI generates 3 HTML variations saved to `.superdesign/design_iterations/pricing_1.html`, `pricing_2.html`, `pricing_3.html`
6. **Preview**: Open Canvas View (`Cmd+Shift+P` -> "Open Canvas View") to see all designs rendered in iframes side by side
7. **Iterate**: Click a design to fork it, type "Make the CTA button larger and add a testimonial section"
8. **Use**: Copy the HTML/code into your actual project

### Flow B: Claude Code + MCP Server User

1. **Install MCP Server**: Clone repo, `npm install`, `npm run build`
2. **Register**: `claude mcp add --scope user superdesign node /path/to/dist/index.js`
3. **Restart Claude Code**
4. **Use**: In Claude Code terminal, just type naturally: "Generate a modern dashboard UI design"
5. Claude Code automatically calls `superdesign_generate` tool
6. MCP server returns structured design specifications
7. Claude Code generates the actual HTML files following those specs
8. Files appear in `superdesign/design_iterations/`
9. **View**: Ask Claude "Show me the gallery" -- it calls `superdesign_gallery` or `superdesign_live_gallery` to open designs in browser
10. **Iterate**: "Iterate on dashboard_1.html with better spacing and darker colors"

### Flow C: Chrome Extension User

1. **Install**: Chrome Web Store extension "Component Grab"
2. **Visit any website**: Navigate to a site whose UI you want to capture
3. **Grab**: Click the extension, select a component
4. **Convert**: Extension converts the messy DOM into clean Tailwind CSS code
5. **Use**: Paste into Superdesign canvas or directly into your IDE

---

## 7. Is Superdesign a Platform or Just a Plugin?

**Answer: It is a small ecosystem of four independent products.**

| Product                            | Type               | Has Backend?                            | Has Its Own AI?            | Revenue?         |
| ---------------------------------- | ------------------ | --------------------------------------- | -------------------------- | ---------------- |
| VS Code Extension                  | IDE Extension      | No (calls APIs directly from extension) | No (uses user's API keys)  | Free/Open Source |
| MCP Server                         | Claude Code Plugin | No (runs locally)                       | No (uses Claude Code's AI) | Free/Open Source |
| Web Platform (app.superdesign.dev) | Web App            | Yes (has a backend)                     | Unclear                    | Likely freemium  |
| Chrome Extension                   | Browser Extension  | No                                      | No                         | Free forever     |

Key insight: **The VS Code extension and MCP server have NO backend of their own.** They run entirely on the user's machine. The AI calls go directly from the extension to the AI provider (Anthropic, OpenAI, etc.) using the user's own API keys. There is no Superdesign server involved.

The web platform (app.superdesign.dev) does appear to have its own backend for the prompt library / community features, but this is separate from the design generation tools.

---

## 8. Business Model

Based on all evidence gathered:

- **Core products are free and open source** (VS Code extension, MCP server, Chrome extension)
- **No paid tier visible** for the IDE extension
- The web platform (prompt library) could be a future monetization vector -- community-driven content, possibly paid team/enterprise features
- **Analytics/telemetry**: The extension uses Helicone (an LLM observability platform) as a proxy for Anthropic API calls by default. The base URL is `anthropic.helicone.ai/v1` with a hardcoded Helicone auth key. This suggests Superdesign may collect usage analytics through Helicone, which could inform product decisions or be part of a future B2B model.
- **Creator's background**: Jason Zhou has a YouTube channel (AI Jason, ~200k subscribers) and likely uses Superdesign as a thought-leadership / community-building tool to drive his broader AI consulting/content business.

---

## 9. VS Code Extension vs. Claude Code MCP: Key Differences

| Aspect                | VS Code Extension                                         | MCP Server                                         |
| --------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| **Who built it**      | Superdesign team (Jason Zhou)                             | Community member (jonthebeef)                      |
| **Integration type**  | VS Code extension with sidebar + canvas                   | MCP tool protocol                                  |
| **AI execution**      | Extension orchestrates AI + tools                         | Claude Code orchestrates everything                |
| **Preview**           | Built-in Canvas View (webview)                            | Opens in browser (gallery HTML)                    |
| **API key needed**    | Yes (Anthropic/OpenAI/OpenRouter) OR Claude Code binary   | No (uses Claude Code's existing connection)        |
| **Project awareness** | Yes (initialization extracts design context)              | Limited (no auto-extraction)                       |
| **User experience**   | Visual GUI with chat + canvas                             | Terminal-based (type commands in Claude Code)      |
| **Tools available**   | Read, Write, Edit, Bash, Glob, Grep, LS, MultiEdit, Theme | Generate, Iterate, Extract, List, Gallery, Cleanup |

---

## 10. How Superdesign Compares to Traditional Design Tools

For the CEO audience:

- **Figma/Sketch**: Manual design tools where designers create pixel-perfect mockups. Superdesign replaces the early exploration phase -- "give me 10 variations of a login page in 30 seconds."
- **v0.dev (Vercel)**: Web-based AI design tool. Superdesign is similar in concept but runs locally, is open source, and integrates directly into the IDE.
- **Bolt/Lovable**: Full AI app builders. Superdesign is narrower -- it focuses on generating UI designs/mockups, not full applications.

Superdesign's unique positioning: **"Design exploration that happens where developers already work (their IDE), not in a separate tool."**

---

## Sources

- [Superdesign GitHub (Main Repo)](https://github.com/superdesigndev/superdesign)
- [Superdesign MCP Server for Claude Code](https://github.com/jonthebeef/superdesign-mcp-claude-code)
- [Superdesign on MCP Market](https://mcpmarket.com/server/superdesign)
- [Superdesign MCP Server on Glama](https://glama.ai/mcp/servers/@jonthebeef/superdesign-mcp-claude-code)
- [Superdesign on Product Hunt](https://www.producthunt.com/products/superdesign)
- [Superdesign Web Platform](https://app.superdesign.dev/)
- [Jason Zhou's Twitter/X](https://x.com/jasonzhou1993)
- [Superdesign MCP on Skywork AI](https://skywork.ai/skypage/en/superdesign-mcp-server-ai-engineer-ui-design/1980818598744887296)
- [Claude Code Skills Deep Dive](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/)
- [Claude Code Plugins Documentation](https://code.claude.com/docs/en/plugins)
- [Superdesign on Geeky Gadgets](https://www.geeky-gadgets.com/superdesign-open-source-ai-design-agent/)
- [Superdesign Prompt Library on FunBlocks](https://www.funblocks.net/aitools/reviews/superdesign-prompt-library)
