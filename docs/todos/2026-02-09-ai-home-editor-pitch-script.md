# Inkdown AI Home & Note Editor Demo Pitch (~2.5 min)

## Context
Demo pitch covering the **AI Home Page** (Deep Agent research assistant) and the **AI Note Editor** (full AI-augmented editing experience). Designed as a live walkthrough that naturally showcases the end-to-end workflow.

---

## Script

### Opening (10s)

> "Let me show you what it actually feels like to learn with Inkdown. We'll start from the home page — where you talk to the AI — and then go into the note editor, where the AI becomes your writing partner."

---

### Part 1: AI Home Page (~50s)

> "This is the home screen. It's a research assistant — think ChatGPT, but everything it creates lives in your notes. Right away you see suggestions based on your study history: compare concepts, quiz yourself, generate a cheatsheet."

**[Show: ChatHero with 4 recommendation cards — "Explain VAE vs DAG", "Quiz on Neural Pathways", "Quantum Gates Cheatsheet", "React Hooks Deep Dive"]**

> "But the real power is the Deep Agent. I'll type something ambitious: *'Create a detailed note about Reinforcement Learning fundamentals, add a table of key algorithms with their pros and cons, and build me an interactive study timer.'*"

**[Show: Type in ChatComposer, hit Enter]**

> "Notice — that's three different tasks in one sentence. The system detects this as a compound request and decomposes it automatically."

**[Show: TaskProgressBar appears — 3 subtasks: Note, Table, Artifact]**

> "Three specialized sub-agents spin up: a **Note Writer** drafts the content, a **Table Agent** structures the algorithm comparison, and an **Artifact Agent** builds a live HTML timer widget. You can watch each one progress in real-time."

**[Show: SubagentCards with progress indicators + streaming markdown appearing in chat]**

> "And here's the key part — the note draft appears right here with a live preview. I can see the content as it's being written, review it, and when I'm happy, hit Save. It goes straight into my note library."

**[Show: NoteDraftResponseCard with embedded Muya editor + diff blocks (green additions) + Save button → note appears in sidebar tree]**

> "The timer artifact? That's a fully interactive HTML/CSS/JavaScript widget, embedded right in the note. I can edit the code later if I want."

**[Show: Study timer artifact running in the note]**

---

### Part 2: AI Note Editor (~70s)

> "Now let's open that note and see the full editor experience. On the left — the Muya markdown editor, rich text, LaTeX, code blocks. On the right — the AI sidebar. This is where it gets powerful."

**[Show: EditorArea with note content + AISidebar open on Agent tab]**

#### The Agent Tab (30s)

> "The Agent tab is a context-aware chat. The AI always knows which note I'm in. I can type: *'Expand the section on Q-Learning with a practical example.'*"

**[Show: Type message in sidebar, hit send]**

> "Watch the editor. The AI doesn't just respond in chat — it proposes edits directly in the document. Original content shows in pink, proposed additions in green. Each block has accept and reject buttons. I can review every change individually, or accept all at once."

**[Show: Diff blocks appearing inline in Muya editor — pink (deletion) and green (addition) blocks with +/- buttons → click Accept on one block]**

> "If the AI isn't sure where to put the edit — say I wrote 'make it better' — it asks for clarification. A dialog pops up showing the note's sections, and I pick the target. No guessing."

**[Show: ClarificationDialog with section multi-select]**

> "I can also create artifacts inline: *'Build an interactive flashcard widget for these key terms.'* The AI generates a full HTML component — live, editable, embedded right in the note."

**[Show: `/artifact` command → artifact block appears in editor → click to open ArtifactCodeModal showing HTML/CSS/JS tabs]**

#### The Recommend Tab (20s)

> "Now, the Recommend tab. Based on the note's content, the AI generates six types of study materials: **mindmaps** for visual concept mapping, **flashcards** for spaced repetition, **key concepts** extracted from the text, **exercises** with difficulty levels, **learning resources** — books, papers, videos — and **presentation slides**."

**[Show: RecommendTab with 6 card types — click Mindmap to preview → click Add to insert into note]**

> "Each one is generated on-demand, cached for 5 minutes, and you can insert any of them directly into your note with one click."

#### Workflows & Resources (10s)

> "The Workflows tab gives you template-based generation — step-by-step content creation with progress tracking. And the Resources tab curates learning materials for whatever topic you're studying."

**[Show: Quick flip through WorkflowsTab and LearningResourcesTab]**

#### Compound Editing (10s)

> "And remember — you can always go compound. *'Summarize this note, reorganize the headings, and add a quiz at the end.'* Three operations, one message. The Deep Agent handles the orchestration, and you get a single merged edit proposal to review."

**[Show: Type compound request → decomposition appears → single merged diff in editor]**

---

### Closing (10s)

> "So the home page is where you research and create. The editor is where you refine with AI as a collaborator — not a black box, but a transparent partner that proposes changes you control. Every edit is reviewable, every artifact is editable, everything is markdown underneath. That's Inkdown's AI editor."

---

## Demo Flow Cheat Sheet

| Timestamp | Action | What's on Screen |
|-----------|--------|------------------|
| 0:00 | Open home page | ChatHero with recommendations |
| 0:10 | Type compound request | ChatComposer input |
| 0:15 | Subtasks appear | TaskProgressBar (3 tasks) |
| 0:25 | Sub-agents working | SubagentCards + streaming content |
| 0:35 | Note draft ready | NoteDraftResponseCard with diff preview |
| 0:40 | Save note | Note appears in sidebar tree |
| 0:45 | Show artifact | Study timer running in note |
| 0:50 | Open note in editor | EditorArea + AISidebar (Agent tab) |
| 0:55 | Type edit request | Sidebar chat input |
| 1:05 | Diff blocks appear | Pink/green inline diffs with +/- buttons |
| 1:15 | Accept edits | Click accept, blocks resolve |
| 1:20 | Show clarification | ClarificationDialog with sections |
| 1:25 | Create artifact | Flashcard widget in editor |
| 1:35 | Switch to Recommend | 6 study material types |
| 1:45 | Preview + insert | Mindmap added to note |
| 1:55 | Show Workflows/Resources | Quick tab flip |
| 2:05 | Compound edit request | Decomposition + merged diff |
| 2:15 | Closing statement | Full editor view |

---

## Key Technical Points to Mention If Asked

| Feature | Tech Detail |
|---------|-------------|
| Compound detection | `isCompoundRequest()` checks for multiple verbs + conjunctions before routing |
| Sub-agents | NoteSubagent, ArtifactSubagent, TableSubagent — each specialized |
| Diff system | `useDiffBlocks.ts` — DOM injection into Muya's ScrollPage, per-block accept/reject |
| Artifact sandbox | HTML/CSS/JS in sandboxed iframe, editable via ArtifactCodeModal |
| Intent routing | EditorAgent classifies 8 intents: chat, edit_note, create_artifact, database_action, etc. |
| RAG chat | Knowledge base search with similarity scoring + citations |
| Recommendations | 6 types (mindmap, flashcards, concepts, exercises, resources, slides), 5-min cache |
| Content guard | Diff injection deferred if editor content doesn't match edit's original |
| Streaming | Async generators → Hono SSE → frontend processes 15+ event types in real-time |
| Memory | Editor-Deep Agent has long-term memory + conversation history (sliding window) |
| Clarification | Multi-select section picker when AI can't determine edit target |
| Merged edits | DeepAgent emits SINGLE merged edit-proposal after ALL subtasks complete |
