# noteshell-skill

> Agent skill for Noteshell — teaches your AI coding agent how to manage notes, study plans, daily tasks, and learning analytics using the Noteshell MCP tools.

## What is Noteshell?

Noteshell is an agent-first learning OS for students, researchers, and lifelong learners. Your notes, study plans, daily tasks, and knowledge base — all accessible to your AI assistant. This skill teaches the agent **how** to use the [43 MCP tools](https://www.npmjs.com/package/@noteshell/mcp) effectively through structured workflows.

## Prerequisites

You need the Noteshell MCP server connected first:

```bash
# 1. Authenticate (opens browser)
npx @noteshell/mcp login

# 2. Add to your MCP config (~/.claude.json, .mcp.json, or equivalent)
{
  "mcpServers": {
    "noteshell": {
      "command": "npx",
      "args": ["-y", "@noteshell/mcp"]
    }
  }
}
```

## Install the Skill

```bash
npx skills add Notecase/noteshell-mcp
```

Reload your AI coding tool — done.

## Available Commands

| Command               | What it does                                                       |
| --------------------- | ------------------------------------------------------------------ |
| `/plan-my-day`        | Quick day planning — review yesterday, pick focus, generate plan   |
| `/morning-routine`    | Full morning routine with dashboard and morning brief note         |
| `/evening-reflection` | End-of-day review — mood, carry over tasks, prepare tomorrow       |
| `/weekly-review`      | 7-day analysis — trends, plan progress, mood patterns, suggestions |

Or just talk naturally:

- _"Plan my day"_
- _"What am I working on?"_
- _"Create a study plan for algorithms"_
- _"How am I doing this week?"_

## Methodology Workflows

The skill includes 7 structured workflows:

| Workflow           | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| Morning Routine    | Review yesterday, archive, pick focus, generate Today.md  |
| Evening Reflection | Capture mood, carry over tasks, prepare tomorrow          |
| Weekly Review      | 7-day analytics, plan progress, suggestions, soul updates |
| Study Planning     | Create roadmaps, daily plans, track progress              |
| Note Organization  | Structure projects, rich notes, task-to-note conversion   |
| Research to Notes  | Capture web research as structured knowledge notes        |
| Daily Workflow     | Quick task updates, activity logging, mid-day operations  |

## How It Works

```
Your AI Agent (Claude Code / Codex / Cursor / Gemini CLI)
        |
        v
noteshell-skill (this repo — methodology, no code)
        |
        v
@noteshell/mcp (npm package — 43 MCP tools, auth, DB)
        |
        v
Your Noteshell data (cloud, secured by your account)
```

The skill teaches your agent **how** to combine the tools. The MCP server provides the tools. No AI runs inside either — your agent does the thinking.

## Links

- [Noteshell App](https://noteshell.app)
- [@noteshell/mcp on npm](https://www.npmjs.com/package/@noteshell/mcp)

## License

MIT
