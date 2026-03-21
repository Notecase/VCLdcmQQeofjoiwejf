# Inkdown/Noteshell — Phase 2 Product Plan

**Period:** March 17 – April 30, 2026
**Owner:** QQ
**Created:** 2026-03-17

---

## Pillar 1: Launch the Product

### 1A. Distribution via Skills/MCP

- Connect Inkdown through skills/MCP to Claude Code / Codex
- This is a lightweight distribution path — leverage existing ecosystems

### 1B. Billing & Monetization

- Design billing system for users who want AI directly in the web platform
- Pricing model: decide on usage-based vs. subscription vs. hybrid
- Free credits for newcomers / very first users (growth lever)
- Payment infrastructure (Stripe integration with Supabase?)

### 1C. AI System Quality (HIGH PRIORITY)

- Make sure the platform's AI system is solid before launch
- Deep focus on AI agents — they must be reliable, fast, and useful
- Dive deep into agent architecture: editor agent, deep agent, note agent, chat agent, secretary
- Stress-test compound requests, streaming, error handling
- Quality bar: agents should feel "magic" not "buggy"

---

## Pillar 2: Marketing & Launch Campaign

### 2A. PR Campaign

- Channels: Facebook, Instagram (run it like a high school project — scrappy, authentic)
- Invite a designer for post materials: images, banners, demo video
- Create demo video showcasing core workflows

### 2B. User Acquisition & Feedback

- Approach as many interviews as possible: users, recruiters, professors
- Set up a feedback system inside the platform (in-app feedback widget)
- Set up company Gmail + forms for structured feedback collection

### 2C. Growth Mechanics

- Free tokens for new/first users (onboarding incentive)
- Word-of-mouth loop: make sharing easy
- Community building (Discord? Slack?)

---

## Pillar 3: Autonomous AI & Connected Features

### 3A. AI Secretary — iPhone Brain Dump Integration

- User writes instantly in iPhone Notes app (like a brain dump)
- Platform connects to iPhone Notes and syncs
- AI reads the dump and auto-categorizes:
  - `#note: <words>` → AI recognizes user wants to add to a specific note
  - `meeting with Sales team` → AI recognizes this is a calendar/task entry
  - Free-form text → AI infers intent from context
- **Proposed Board**: AI shows a verification/proposal board before committing changes
  - User reviews what AI interpreted → approves or edits → then commits

### 3B. Autonomous AI Agents

- Redesign AI architecture for more autonomy
- Agents should proactively organize, suggest, and connect information
- Cross-feature connectivity: notes ↔ calendar ↔ tasks ↔ research

### 3C. Architecture Redesign

- Rethink agent system for autonomy + reliability
- Event-driven architecture for real-time sync
- Design the "proposed board" UX pattern (reusable across features)

---

## Open Questions

1. Pricing: What's the right model? Per-token? Monthly sub? Freemium tier?
2. iPhone integration: Native app vs. Shortcuts vs. third-party sync?
3. Designer: Who? Budget? Timeline for materials?
4. Launch date target: Soft launch vs. big bang?
5. Which agent improvements are highest-ROI before launch?
