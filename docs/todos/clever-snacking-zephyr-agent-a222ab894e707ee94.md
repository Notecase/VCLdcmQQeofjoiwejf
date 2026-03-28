# Agent Skills Specification Research

## Sources Consulted

1. **agentskills.io** (main page, specification, what-are-skills, client-implementation guide)
2. **code.claude.com** (skills docs, plugins docs, plugins-reference, hooks docs)
3. GitHub repos: `anthropics/agent-skills-spec` does NOT exist (404). The actual repos are:
   - `https://github.com/agentskills/agentskills` (spec + reference library)
   - `https://github.com/anthropics/skills` (example skills)

---

## 1. SKILL.md Frontmatter Specification

### Open Standard (agentskills.io)

| Field           | Required | Constraints                                                                                                                        |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | Yes      | Max 64 chars. Lowercase letters, numbers, hyphens only. No leading/trailing/consecutive hyphens. Must match parent directory name. |
| `description`   | Yes      | Max 1024 chars. Non-empty. Describes what the skill does AND when to use it.                                                       |
| `license`       | No       | License name or reference to bundled license file.                                                                                 |
| `compatibility` | No       | Max 500 chars. Environment requirements (product, system packages, network access).                                                |
| `metadata`      | No       | Arbitrary string key-value mapping for additional properties.                                                                      |
| `allowed-tools` | No       | Space-delimited list of pre-approved tools. Experimental.                                                                          |

### Claude Code Extensions (code.claude.com)

Claude Code supports the open standard fields PLUS these additional fields:

| Field                      | Required    | Description                                                                                                |
| -------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `name`                     | No          | Display name. If omitted, uses directory name. Lowercase letters, numbers, hyphens (max 64 chars).         |
| `description`              | Recommended | What the skill does and when to use it. If omitted, uses first paragraph of markdown.                      |
| `argument-hint`            | No          | Hint shown during autocomplete. E.g. `[issue-number]` or `[filename] [format]`.                            |
| `disable-model-invocation` | No          | `true` = Claude cannot auto-load this skill. User must invoke with `/name`. Default: `false`.              |
| `user-invocable`           | No          | `false` = hidden from `/` menu. For background knowledge only. Default: `true`.                            |
| `allowed-tools`            | No          | Tools Claude can use without asking permission when skill is active.                                       |
| `model`                    | No          | Model to use when this skill is active.                                                                    |
| `effort`                   | No          | Effort level: `low`, `medium`, `high`, `max`.                                                              |
| `context`                  | No          | Set to `fork` to run in a forked subagent context.                                                         |
| `agent`                    | No          | Which subagent type when `context: fork`. E.g. `Explore`, `Plan`, `general-purpose`, or custom agent name. |
| `hooks`                    | No          | Hooks scoped to this skill's lifecycle. Same format as hooks.json.                                         |
| `paths`                    | No          | Glob patterns limiting when skill activates. Comma-separated or YAML list.                                 |
| `shell`                    | No          | Shell for `!`command``blocks:`bash`(default) or`powershell`.                                               |

### String Substitutions in Skill Content

| Variable               | Description                                                                      |
| ---------------------- | -------------------------------------------------------------------------------- |
| `$ARGUMENTS`           | All arguments passed when invoking. If absent, appended as `ARGUMENTS: <value>`. |
| `$ARGUMENTS[N]`        | Specific argument by 0-based index.                                              |
| `$N`                   | Shorthand for `$ARGUMENTS[N]`.                                                   |
| `${CLAUDE_SESSION_ID}` | Current session ID.                                                              |
| `${CLAUDE_SKILL_DIR}`  | Directory containing the skill's SKILL.md file.                                  |

### Dynamic Context Injection

The `` !`<command>` `` syntax runs shell commands BEFORE skill content is sent to Claude. Output replaces the placeholder (preprocessing, not Claude execution).

---

## 2. Directory Structure Conventions

### Open Standard (Minimal)

```
skill-name/
  SKILL.md          # Required: metadata + instructions
  scripts/          # Optional: executable code
  references/       # Optional: documentation
  assets/           # Optional: templates, resources
```

### Claude Code Standalone Skills

Skills stored in `.claude/skills/<skill-name>/SKILL.md`:

| Location   | Path                                     | Scope                   |
| ---------- | ---------------------------------------- | ----------------------- |
| Enterprise | Managed settings                         | All users in org        |
| Personal   | `~/.claude/skills/<skill-name>/SKILL.md` | All your projects       |
| Project    | `.claude/skills/<skill-name>/SKILL.md`   | This project only       |
| Plugin     | `<plugin>/skills/<skill-name>/SKILL.md`  | Where plugin is enabled |

Legacy `.claude/commands/` still works (simple markdown files, same frontmatter). Skills take precedence over commands with same name.

### Claude Code Plugin Structure

```
my-plugin/
  .claude-plugin/
    plugin.json           # Manifest (only file in this dir)
  commands/               # Legacy skill markdown files
  agents/                 # Subagent markdown files
  skills/                 # Agent Skills with SKILL.md
    code-reviewer/
      SKILL.md
    pdf-processor/
      SKILL.md
      scripts/
      reference.md
  hooks/
    hooks.json            # Hook configurations
  output-styles/          # Output style definitions
  scripts/                # Hook and utility scripts
  settings.json           # Default settings (currently only `agent` key)
  .mcp.json               # MCP server definitions
  .lsp.json               # LSP server configurations
  LICENSE
  CHANGELOG.md
```

**CRITICAL**: commands/, agents/, skills/, hooks/ must be at plugin root, NOT inside `.claude-plugin/`.

### Cross-Client Discovery Convention (agentskills.io)

| Scope   | Path                               | Purpose              |
| ------- | ---------------------------------- | -------------------- |
| Project | `<project>/.<your-client>/skills/` | Client-specific      |
| Project | `<project>/.agents/skills/`        | Cross-client interop |
| User    | `~/.<your-client>/skills/`         | Client-specific      |
| User    | `~/.agents/skills/`                | Cross-client interop |

---

## 3. How Skills Are Discovered and Loaded

### Progressive Disclosure (3 Tiers)

1. **Catalog (~100 tokens/skill)**: `name` + `description` loaded at startup for ALL skills
2. **Instructions (<5000 tokens recommended)**: Full `SKILL.md` body loaded when skill is activated
3. **Resources (as needed)**: Files in scripts/, references/, assets/ loaded only when required

### Discovery Process

1. Scan known directories for subdirectories containing `SKILL.md`
2. Parse YAML frontmatter to extract name + description
3. Build in-memory catalog of available skills
4. Present catalog to model in system prompt or tool description
5. Model decides when to activate based on task matching description

### Activation Mechanisms

- **Model-driven**: Model reads skill descriptions, decides to load when relevant
- **User-explicit**: `/skill-name` slash command or `$skill-name` mention
- **File-read activation**: Model uses standard file-read tool on SKILL.md path
- **Dedicated tool activation**: `activate_skill` tool takes skill name, returns content

### Claude Code Specifics

- Skill descriptions loaded into context at startup (budget: 2% of context window, fallback 16,000 chars)
- Full skill content only loads when invoked
- Override budget with `SLASH_COMMAND_TOOL_CHAR_BUDGET` env var
- `/context` command shows warning about excluded skills
- Monorepo support: auto-discovers skills from nested `.claude/skills/` in subdirectories
- `--add-dir` directories: skills discovered and live-reload supported
- `/reload-plugins` to pick up changes without restart

---

## 4. plugin.json Manifest Schema

### Required Fields

Only `name` is required (if manifest is included at all; manifest itself is optional).

| Field  | Type   | Description                                                               |
| ------ | ------ | ------------------------------------------------------------------------- |
| `name` | string | Unique identifier, kebab-case, no spaces. Used as skill namespace prefix. |

### Metadata Fields

| Field         | Type   | Description                          |
| ------------- | ------ | ------------------------------------ |
| `version`     | string | Semantic version (MAJOR.MINOR.PATCH) |
| `description` | string | Brief explanation of plugin purpose  |
| `author`      | object | `{name, email, url}`                 |
| `homepage`    | string | Documentation URL                    |
| `repository`  | string | Source code URL                      |
| `license`     | string | License identifier                   |
| `keywords`    | array  | Discovery tags                       |

### Component Path Fields

| Field          | Type                     | Description                                                     |
| -------------- | ------------------------ | --------------------------------------------------------------- |
| `commands`     | string or array          | Custom command files/directories (replaces default `commands/`) |
| `agents`       | string or array          | Custom agent files (replaces default `agents/`)                 |
| `skills`       | string or array          | Custom skill directories (replaces default `skills/`)           |
| `hooks`        | string, array, or object | Hook config paths or inline config                              |
| `mcpServers`   | string, array, or object | MCP config paths or inline config                               |
| `outputStyles` | string or array          | Custom output style files/directories                           |
| `lspServers`   | string, array, or object | LSP server configurations                                       |
| `userConfig`   | object                   | User-configurable values prompted at enable time                |
| `channels`     | array                    | Channel declarations for message injection                      |

### Full Example

```json
{
  "name": "plugin-name",
  "version": "1.2.0",
  "description": "Brief plugin description",
  "author": {
    "name": "Author Name",
    "email": "author@example.com",
    "url": "https://github.com/author"
  },
  "homepage": "https://docs.example.com/plugin",
  "repository": "https://github.com/author/plugin",
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"],
  "commands": ["./custom/commands/special.md"],
  "agents": "./custom/agents/",
  "skills": "./custom/skills/",
  "hooks": "./config/hooks.json",
  "mcpServers": "./mcp-config.json",
  "outputStyles": "./styles/",
  "lspServers": "./.lsp.json"
}
```

### Path Behavior Rules

- Custom paths REPLACE default directory (not additive)
- To keep defaults AND add more: `"commands": ["./commands/", "./extras/deploy.md"]`
- All paths must be relative, starting with `./`
- Hooks, MCP servers, and LSP servers have different merge semantics

### Environment Variables

| Variable                | Description                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `${CLAUDE_PLUGIN_ROOT}` | Absolute path to plugin installation directory. Changes on update.                          |
| `${CLAUDE_PLUGIN_DATA}` | Persistent directory for plugin state. Survives updates. At `~/.claude/plugins/data/{id}/`. |

### User Configuration

```json
{
  "userConfig": {
    "api_endpoint": {
      "description": "Your team's API endpoint",
      "sensitive": false
    },
    "api_token": {
      "description": "API authentication token",
      "sensitive": true
    }
  }
}
```

- Available as `${user_config.KEY}` in MCP/LSP configs, hook commands, skill/agent content (non-sensitive only)
- Exported as `CLAUDE_PLUGIN_OPTION_<KEY>` env vars
- Non-sensitive stored in `settings.json` under `pluginConfigs[<plugin-id>].options`
- Sensitive stored in system keychain (~2KB total limit)

---

## 5. hooks.json Structure

### Location

- Standalone: `.claude/settings.json` or `.claude/settings.local.json` or `~/.claude/settings.json`
- Plugin: `hooks/hooks.json` in plugin root, or inline in plugin.json
- Skill/Agent: `hooks` field in YAML frontmatter

### Format

```json
{
  "hooks": {
    "EVENT_NAME": [
      {
        "matcher": "REGEX_PATTERN",
        "hooks": [
          {
            "type": "command|http|prompt|agent",
            "command": "script path or command",
            "timeout": 600,
            "statusMessage": "Custom message",
            "once": false,
            "async": false,
            "shell": "bash"
          }
        ]
      }
    ]
  }
}
```

### All Hook Events (24 total)

| Event              | When                             | Can Block?              |
| ------------------ | -------------------------------- | ----------------------- |
| SessionStart       | Session begins/resumes           | No                      |
| SessionEnd         | Session terminates               | No                      |
| UserPromptSubmit   | User submits prompt              | Yes                     |
| PreToolUse         | Before tool execution            | Yes                     |
| PermissionRequest  | Permission dialog about to show  | Yes                     |
| PostToolUse        | After successful tool execution  | No                      |
| PostToolUseFailure | After tool execution fails       | No                      |
| Stop               | Main Claude finishes responding  | Yes                     |
| StopFailure        | API error prevented response     | No                      |
| SubagentStart      | Subagent spawned                 | No (can inject context) |
| SubagentStop       | Subagent finished                | Yes                     |
| TeammateIdle       | Team teammate going idle         | Yes                     |
| TaskCreated        | Task being created               | Yes                     |
| TaskCompleted      | Task being marked complete       | Yes                     |
| Notification       | Claude sends notification        | No                      |
| InstructionsLoaded | CLAUDE.md or rules loaded        | No                      |
| ConfigChange       | Configuration file changed       | Yes (except policy)     |
| FileChanged        | Watched file changed on disk     | No                      |
| CwdChanged         | Working directory changed        | No                      |
| PreCompact         | Before context compaction        | No                      |
| PostCompact        | After context compaction         | No                      |
| WorktreeCreate     | Worktree being created           | Yes                     |
| WorktreeRemove     | Worktree being removed           | No                      |
| Elicitation        | MCP server requests user input   | Yes                     |
| ElicitationResult  | User responds to MCP elicitation | Yes                     |

### Hook Handler Types

1. **command**: Execute shell commands. Input via stdin JSON. Exit code 0=success, 2=blocking error.
2. **http**: POST JSON to URL. 2xx = success with JSON body.
3. **prompt**: Single-turn LLM evaluation. `$ARGUMENTS` placeholder. Returns yes/no decision.
4. **agent**: Spawns subagent with tools (Read, Grep, Glob, etc.) for complex verification.

### Matcher Patterns

- Regex strings: `"Bash"`, `"Edit|Write"`, `"mcp__memory__.*"`
- `"*"`, `""`, or omit = match all
- MCP tool format: `mcp__<server>__<tool>`

---

## 6. Command Definitions

Commands are the legacy format, now merged into skills:

- **Location**: `.claude/commands/` or plugin `commands/` directory
- **Format**: Simple markdown files (not directories) with optional YAML frontmatter
- **Naming**: Filename becomes command name (e.g. `deploy.md` -> `/deploy`)
- **Frontmatter**: Same fields as SKILL.md frontmatter
- **Precedence**: If a skill and command share the same name, the skill wins

Skills are now recommended over commands as they support directories with supporting files.

---

## 7. Installation Mechanisms

### Claude Code Plugin Installation

```bash
# CLI installation
claude plugin install <plugin-name>@<marketplace-name>
claude plugin install <plugin-name>@<marketplace-name> --scope project
claude plugin install <plugin-name>@<marketplace-name> --scope local

# CLI management
claude plugin uninstall <plugin>
claude plugin enable <plugin>
claude plugin disable <plugin>
claude plugin update <plugin>

# Local testing
claude --plugin-dir ./my-plugin

# In-session
/plugin install <plugin>
/reload-plugins
```

### Installation Scopes

| Scope   | Settings file                 | Use case                     |
| ------- | ----------------------------- | ---------------------------- |
| user    | `~/.claude/settings.json`     | Personal plugins (default)   |
| project | `.claude/settings.json`       | Team plugins via VCS         |
| local   | `.claude/settings.local.json` | Project-specific, gitignored |
| managed | Managed settings              | Org-wide, read-only          |

### Plugin Caching

- Marketplace plugins copied to `~/.claude/plugins/cache` (not used in-place)
- Path traversal outside plugin root does NOT work after install
- Symlinks ARE honored during copy
- Persistent data at `~/.claude/plugins/data/{id}/`

### No Standard Cross-Client Installation

The agentskills.io spec does NOT define installation mechanisms. It only defines the file format. Each client implements its own installation (Claude Code uses plugins/marketplaces, VS Code has its own system, etc.).

---

## 8. Validation Requirements

### agentskills.io Reference Library

```bash
# Validate with skills-ref library
skills-ref validate ./my-skill
```

Available at: `https://github.com/agentskills/agentskills/tree/main/skills-ref`

### Claude Code Validation

```bash
claude plugin validate    # CLI
/plugin validate          # In-session
```

Checks: plugin.json syntax/schema, skill/agent/command frontmatter, hooks.json.

### Name Validation Rules

- 1-64 characters
- Unicode lowercase alphanumeric (`a-z`) and hyphens (`-`) only
- No leading/trailing hyphens
- No consecutive hyphens (`--`)
- Must match parent directory name (open standard; Claude Code is lenient)

### Description Validation

- 1-1024 characters
- Should describe what AND when
- Should include specific keywords for task matching
- Missing/empty description = skip the skill (essential for discovery)

---

## 9. Key Differences: Open Standard vs Claude Code

| Aspect                 | Open Standard (agentskills.io) | Claude Code                                  |
| ---------------------- | ------------------------------ | -------------------------------------------- |
| `name` required        | Yes                            | No (inferred from directory)                 |
| `description` required | Yes                            | Recommended (inferred from content)          |
| Extra fields           | 5 fields total                 | 17+ fields                                   |
| Invocation control     | Not specified                  | `disable-model-invocation`, `user-invocable` |
| Subagent support       | Not specified                  | `context: fork`, `agent` field               |
| Hooks                  | Not specified                  | Full lifecycle hooks system                  |
| Dynamic injection      | Not specified                  | `` !`command` `` preprocessing               |
| Plugin system          | Not specified                  | Full plugin.json + marketplace system        |
| Installation           | Not specified                  | `claude plugin install`, `--plugin-dir`      |

---

## 10. Adopting Agents/Tools

The Agent Skills format is supported by 30+ tools including:

- Claude Code, Claude.ai, Cursor, VS Code (Copilot), GitHub Copilot
- Gemini CLI, OpenAI Codex, Roo Code
- JetBrains Junie, Amp, Goose, OpenHands
- Databricks, Snowflake, Kiro, Laravel Boost
- And many more (see agentskills.io for full list)
