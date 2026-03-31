# Edit Note Skill

When asked to edit a note:

1. **Read**: Call `notes_get` with `include_structure: true` to see the full content and block index
2. **Locate**: Identify the exact text that needs changing using the block structure
3. **Edit**: Use `edit_note` with enough surrounding context in `old_text` to make the match unique (15+ words if the text is common)
4. **Verify**: If the edit fails with "multiple occurrences", add more surrounding context and retry
5. **Describe**: Tell the user what was changed in one sentence

For insertions, use `append_to_note` with `after_heading` or `after_block_index`.
For deletions, use `remove_from_note` with the exact text.

Never rewrite an entire note when a surgical edit will do.
