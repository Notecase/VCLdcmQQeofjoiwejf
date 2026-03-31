# Create Component / Artifact Skill

When asked to create an interactive widget or component:

1. **Confirm scope**: Ask what the component should do if the request is vague
2. **Build**: Use `artifacts_create` with:
   - `title`: PascalCase descriptive name
   - `html`: Semantic markup, no framework tags
   - `css`: Tailwind-like utility classes or inline styles. Dark theme with warm grays
   - `javascript`: Vanilla JS. No imports, no frameworks
3. **Attach**: Always provide `note_id` to embed the artifact in the active note
4. **Test mentally**: Ensure the component works standalone in an iframe sandbox

## Style Rules

- Background: `#1a1a1a` or `#2a2a2a` (warm dark)
- Text: `#d4d4d4` primary, `#8b8b8b` secondary
- Accent: sage green `#4a9` or warm amber `#e5a`
- No deep blues, no neon colors
- Border radius: 6-8px
- Font: system-ui, -apple-system
