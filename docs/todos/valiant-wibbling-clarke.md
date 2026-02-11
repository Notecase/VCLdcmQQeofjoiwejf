# Fix: EditorDeepAgent outputs raw LaTeX that Muya can't render

## Context

When a user asks EditorDeepAgent to create a note about math-heavy topics (e.g., VAE architectures), the LLM outputs raw LaTeX like `\mathcal L(\theta,\phi; x)=\mathbb E_{q_\phi(z\mid x)}[...]` without dollar-sign delimiters. Muya's KaTeX renderer requires `$...$` (inline) or `$$...$$` (display) syntax — without these delimiters, the math shows as unrendered plaintext.

**Root cause**: The `EDITOR_DEEP_SYSTEM_PROMPT` and its subagent prompts have **no math formatting instructions**. Other agents (NoteAgent, CourseAgent, NoteSubagent) already include explicit rules telling the LLM to use `$` / `$$` delimiters and avoid `\[...\]` brackets. EditorDeepAgent was simply never given these rules.

## Fix

Add formatting instructions to `EDITOR_DEEP_SYSTEM_PROMPT` and `EDIT_SUBAGENT_PROMPT` in `packages/ai/src/agents/editor-deep/prompts.ts`.

Reuse the same rules already proven in `NoteAgent` (`packages/ai/src/agents/note.agent.ts:88-97`).

### Changes to `packages/ai/src/agents/editor-deep/prompts.ts`

**1. Append formatting rules to `EDITOR_DEEP_SYSTEM_PROMPT`** (after "If edits are produced as proposals, explain what changed."):

```
Formatting rules:
- Do NOT use horizontal rules (--- or ***) to separate sections. Use headings instead.
- When writing mathematical content, use Markdown-compatible formats:
  - Inline math: $x + y = z$ (single dollar signs)
  - Display/block math:
$$
equation here
$$
  - Do NOT use \\[...\\] or [...] brackets for display math.
```

**2. Append the same math rules to `EDIT_SUBAGENT_PROMPT`** — this subagent generates note content, so it also needs the formatting guidance.

### No other files changed

- No logic changes, no type changes, no new dependencies
- NoteAgent/CourseAgent already have their own copies — no shared constant needed (each agent's prompts are self-contained)

## Verification

1. `pnpm --filter @inkdown/ai build` — clean
2. `npx eslint packages/ai/src/agents/editor-deep/prompts.ts` — clean
3. Manual test: ask EditorDeepAgent to "create a note about VAE architectures" → math should render with `$`/`$$` delimiters instead of raw LaTeX
