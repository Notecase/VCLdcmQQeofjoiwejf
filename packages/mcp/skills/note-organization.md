---
name: note-organization
description: Structuring projects, creating rich notes, and the Task→Note pattern
---

# Note Organization with Noteshell

## Project Hierarchy

### View Structure
```
projects_list → see all projects with note counts
notes_list { project_id: "..." } → notes in a specific project
notes_organize { note_id: "..." } → heading structure of a note
```

### Create Project-Based Notes
```
1. projects_list → identify target project
2. notes_create { title: "Chapter 3: Lenses", content: "...", project_id: "..." }
3. context_write { type: "note_created", summary: "Created Lenses chapter in Physics" }
```

## Rich Note Creation

### Structure Guidelines
- Use `#` for the main title
- Use `##` for major sections
- Use `###` for subsections
- Include code blocks with language tags
- Use tables for comparison data
- Link to other notes by mentioning their titles

### Example: Study Note
```markdown
# Optics Chapter 3: Lenses

## Key Concepts
### Thin Lens Equation
1/f = 1/do + 1/di

### Magnification
M = -di/do = hi/ho

## Practice Problems
- [ ] Converging lens with f=20cm, object at 30cm
- [ ] Diverging lens with f=-15cm, object at 25cm

## Summary
Key takeaway: ...
```

## Task → Note Pattern

When a study task is completed, convert it to a note:

```
1. secretary_today → find completed task
2. notes_create {
     title: "Arrays & Hashing — Study Notes",
     content: "# Arrays & Hashing\n\n## Key Patterns\n...",
     project_id: "algo-project-uuid"
   }
3. context_write { type: "note_created", summary: "Converted ALGO Day 1 task to study notes" }
```

## Bulk Organization
```
1. notes_list → see all notes
2. notes_summarize { note_id } → check structure of each
3. notes_move { note_id, project_id } → organize into projects
```
