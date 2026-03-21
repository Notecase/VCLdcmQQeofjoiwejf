---
name: research-to-notes
description: Capturing web research, articles, and findings as structured Inkdown notes
---

# Research to Notes with Noteshell

## Workflow

### 1. Research Phase
Gather information from web sources, papers, documentation, etc.

### 2. Create Structured Note
```
notes_create {
  title: "Research: WebSocket Performance Optimization",
  content: "# WebSocket Performance Optimization\n\n## Sources\n- [Article 1](url)\n- [Article 2](url)\n\n## Key Findings\n### Connection Pooling\n...\n\n## Actionable Takeaways\n1. Use binary frames for large payloads\n2. ...",
  project_id: "research-project-uuid"
}
```

### 3. Log to Context Bus
```
context_write {
  agent: "mcp",
  type: "research_done",
  summary: "Researched WebSocket optimization: connection pooling, binary frames, compression",
  payload: { "note_id": "...", "topics": ["websocket", "performance"] }
}
```

## Note Template

```markdown
# Research: [Topic]

## Sources
- [Source 1](url) — brief description
- [Source 2](url) — brief description

## Key Findings
### [Finding 1]
Details...

### [Finding 2]
Details...

## Code Examples
```language
// relevant code
```

## Comparison
| Approach | Pros | Cons |
|----------|------|------|
| A | ... | ... |
| B | ... | ... |

## Actionable Takeaways
1. First action item
2. Second action item

## Open Questions
- Question that needs further investigation
```

## Linking Research to Plans
```
1. notes_create → create research note
2. secretary_memory_read { filename: "Plans/project.md" } → read plan
3. secretary_memory_write → update plan with research findings
```
