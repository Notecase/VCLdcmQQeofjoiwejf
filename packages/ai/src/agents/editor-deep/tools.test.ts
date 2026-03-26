import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { executeToolMock } = vi.hoisted(() => ({
  executeToolMock: vi.fn(),
}))

vi.mock('../../tools', () => {
  return {
    executeTool: executeToolMock,
  }
})

import {
  createEditorDeepTools,
  spliceAtBlockIndex,
  buildMarkdownTable,
  resolveAfterHeadingIndex,
} from './tools'

function createSupabaseStub(): SupabaseClient {
  return {
    from: vi.fn(),
  } as unknown as SupabaseClient
}

function createSupabaseInsertStub(noteId: string): SupabaseClient {
  const chain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: noteId }, error: null }),
  }
  return {
    from: vi.fn(() => chain),
  } as unknown as SupabaseClient
}

const TOOL_EXEC_CTX = {
  toolCallId: 'test-call',
  abortSignal: new AbortController().signal,
  messages: [],
} as any

describe('createEditorDeepTools', () => {
  beforeEach(() => {
    executeToolMock.mockReset()
  })

  it('defaults noteId to current editor context for answer_question_about_note', async () => {
    executeToolMock.mockResolvedValue({
      success: true,
      data: {
        title: 'Networks',
        content: 'This note explains OSI layers.',
      },
    })

    const events: Array<{ type: string; data: unknown }> = []
    const tools = createEditorDeepTools(
      {
        userId: 'u1',
        supabase: createSupabaseStub(),
        editorContext: {
          currentNoteId: '11111111-1111-4111-8111-111111111111',
        },
        emitEvent: (event) => events.push(event),
      },
      {
        read: vi.fn(),
        write: vi.fn(),
      } as any
    )

    const qaTool = tools.answer_question_about_note
    expect(qaTool).toBeTruthy()

    // AI SDK tools have an execute property
    const output = await qaTool.execute!({ question: "what's this note about?" }, {
      toolCallId: 'test-call',
      abortSignal: new AbortController().signal,
      messages: [],
    } as any)

    expect(executeToolMock).toHaveBeenCalledWith(
      'read_note',
      {
        noteId: '11111111-1111-4111-8111-111111111111',
        includeMetadata: true,
      },
      expect.any(Object)
    )
    expect(String(output)).toContain('Question:')
  })

  it('emits clarification-requested when add_paragraph is called without an active note', async () => {
    const events: Array<{ type: string; data: unknown }> = []

    const tools = createEditorDeepTools(
      {
        userId: 'u1',
        supabase: createSupabaseStub(),
        editorContext: {},
        emitEvent: (event) => events.push(event),
      },
      {
        read: vi.fn(),
        write: vi.fn(),
      } as any
    )

    const addTool = tools.add_paragraph
    expect(addTool).toBeTruthy()

    const output = await addTool.execute!({ paragraph: 'A new paragraph.' }, {
      toolCallId: 'test-call',
      abortSignal: new AbortController().signal,
      messages: [],
    } as any)

    expect(executeToolMock).not.toHaveBeenCalled()
    expect(events.some((event) => event.type === 'clarification-requested')).toBe(true)
    expect(String(output)).toContain('No note selected')
  })

  describe('create_note', () => {
    it('inserts with empty content and emits note-navigate before edit-proposal', async () => {
      const events: Array<{ type: string; data: unknown }> = []
      const noteId = '99999999-9999-4999-8999-999999999999'

      const tools = createEditorDeepTools(
        {
          userId: 'u1',
          supabase: createSupabaseInsertStub(noteId),
          editorContext: { projectId: 'proj-1' },
          emitEvent: (event) => events.push(event),
        },
        { read: vi.fn(), write: vi.fn() } as any
      )

      await tools.create_note.execute!(
        { title: 'My Note', content: '# Hello\n\nWorld' },
        TOOL_EXEC_CTX
      )

      // note-navigate should come before edit-proposal
      const navIdx = events.findIndex((e) => e.type === 'note-navigate')
      const editIdx = events.findIndex((e) => e.type === 'edit-proposal')
      expect(navIdx).toBeGreaterThanOrEqual(0)
      expect(editIdx).toBeGreaterThan(navIdx)

      // edit-proposal should have empty original
      const editData = events[editIdx].data as {
        noteId: string
        original: string
        proposed: string
        structure: unknown[]
      }
      expect(editData.original).toBe('')
      expect(editData.proposed).toBe('# Hello\n\nWorld')
      expect(editData.structure).toEqual([])
    })
  })

  describe('add_paragraph emits edit-proposal', () => {
    it('proposes content appended when no afterBlockIndex', async () => {
      executeToolMock.mockResolvedValue({
        success: true,
        data: { content: 'Existing paragraph.' },
      })

      const events: Array<{ type: string; data: unknown }> = []
      const tools = createEditorDeepTools(
        {
          userId: 'u1',
          supabase: createSupabaseStub(),
          editorContext: { currentNoteId: '11111111-1111-4111-8111-111111111111' },
          emitEvent: (event) => events.push(event),
        },
        { read: vi.fn(), write: vi.fn() } as any
      )

      await tools.add_paragraph.execute!({ paragraph: 'New paragraph.' }, TOOL_EXEC_CTX)

      const editEvent = events.find((e) => e.type === 'edit-proposal')
      expect(editEvent).toBeTruthy()
      const data = editEvent!.data as { original: string; proposed: string }
      expect(data.original).toBe('Existing paragraph.')
      expect(data.proposed).toContain('New paragraph.')
    })
  })

  describe('edit_paragraph emits edit-proposal with replaced content', () => {
    it('replaces block at given index', async () => {
      executeToolMock.mockResolvedValue({
        success: true,
        data: { content: 'First block.\n\nSecond block.' },
      })

      const events: Array<{ type: string; data: unknown }> = []
      const tools = createEditorDeepTools(
        {
          userId: 'u1',
          supabase: createSupabaseStub(),
          editorContext: { currentNoteId: '11111111-1111-4111-8111-111111111111' },
          emitEvent: (event) => events.push(event),
        },
        { read: vi.fn(), write: vi.fn() } as any
      )

      await tools.edit_paragraph.execute!(
        { blockIndex: 0, newContent: 'Replaced first.' },
        TOOL_EXEC_CTX
      )

      const editEvent = events.find((e) => e.type === 'edit-proposal')
      expect(editEvent).toBeTruthy()
      const data = editEvent!.data as { proposed: string }
      expect(data.proposed).toContain('Replaced first.')
      expect(data.proposed).toContain('Second block.')
    })
  })

  describe('remove_paragraph emits edit-proposal with removed content', () => {
    it('removes block at given index', async () => {
      executeToolMock.mockResolvedValue({
        success: true,
        data: { content: 'First block.\n\nSecond block.\n\nThird block.' },
      })

      const events: Array<{ type: string; data: unknown }> = []
      const tools = createEditorDeepTools(
        {
          userId: 'u1',
          supabase: createSupabaseStub(),
          editorContext: { currentNoteId: '11111111-1111-4111-8111-111111111111' },
          emitEvent: (event) => events.push(event),
        },
        { read: vi.fn(), write: vi.fn() } as any
      )

      await tools.remove_paragraph.execute!({ blockIndex: 1 }, TOOL_EXEC_CTX)

      const editEvent = events.find((e) => e.type === 'edit-proposal')
      expect(editEvent).toBeTruthy()
      const data = editEvent!.data as { proposed: string }
      expect(data.proposed).not.toContain('Second block.')
      expect(data.proposed).toContain('First block.')
      expect(data.proposed).toContain('Third block.')
    })
  })
})

// ============================================================================
// spliceAtBlockIndex (ED-05)
// ============================================================================

describe('spliceAtBlockIndex', () => {
  // --- insert-after ---

  it('insert-after with valid blockIndex inserts at correct position', () => {
    const original = 'First block.\n\nSecond block.'
    const result = spliceAtBlockIndex(original, 0, 'insert-after', 'Inserted.')
    expect(result).toContain('First block.')
    expect(result).toContain('Inserted.')
    expect(result).toContain('Second block.')
    // Inserted content should be between first and second
    const insertedPos = result.indexOf('Inserted.')
    const firstPos = result.indexOf('First block.')
    const secondPos = result.indexOf('Second block.')
    expect(insertedPos).toBeGreaterThan(firstPos)
    expect(insertedPos).toBeLessThan(secondPos)
  })

  it('insert-after with blockIndex >= blocks.length appends to end', () => {
    const original = 'Only block.'
    const result = spliceAtBlockIndex(original, 99, 'insert-after', 'Appended.')
    expect(result).toContain('Only block.')
    expect(result).toContain('Appended.')
    expect(result.indexOf('Appended.')).toBeGreaterThan(result.indexOf('Only block.'))
  })

  it('insert-after with blockIndex < 0 appends to end', () => {
    const original = 'Content here.'
    const result = spliceAtBlockIndex(original, -1, 'insert-after', 'Appended.')
    expect(result).toContain('Appended.')
    expect(result.indexOf('Appended.')).toBeGreaterThan(result.indexOf('Content here.'))
  })

  it('insert-after with blockIndex undefined appends to end', () => {
    const original = 'Existing.'
    const result = spliceAtBlockIndex(original, undefined, 'insert-after', 'New stuff.')
    expect(result).toContain('Existing.')
    expect(result).toContain('New stuff.')
    expect(result.indexOf('New stuff.')).toBeGreaterThan(result.indexOf('Existing.'))
  })

  // --- replace ---

  it('replace with valid blockIndex replaces block content', () => {
    const original = 'Block A.\n\nBlock B.\n\nBlock C.'
    const result = spliceAtBlockIndex(original, 1, 'replace', 'Replaced B.')
    expect(result).toContain('Block A.')
    expect(result).toContain('Replaced B.')
    expect(result).toContain('Block C.')
    expect(result).not.toContain('Block B.')
  })

  it('replace with OOB blockIndex returns original unchanged', () => {
    const original = 'Only block.'
    expect(spliceAtBlockIndex(original, 5, 'replace', 'New')).toBe(original)
    expect(spliceAtBlockIndex(original, -1, 'replace', 'New')).toBe(original)
    expect(spliceAtBlockIndex(original, undefined, 'replace', 'New')).toBe(original)
  })

  // --- remove ---

  it('remove with valid blockIndex removes block and trailing newlines', () => {
    const original = 'Block A.\n\nBlock B.\n\nBlock C.'
    const result = spliceAtBlockIndex(original, 1, 'remove')
    expect(result).toContain('Block A.')
    expect(result).toContain('Block C.')
    expect(result).not.toContain('Block B.')
  })

  it('remove with OOB blockIndex returns original unchanged', () => {
    const original = 'Only block.'
    expect(spliceAtBlockIndex(original, 5, 'remove')).toBe(original)
    expect(spliceAtBlockIndex(original, -1, 'remove')).toBe(original)
    expect(spliceAtBlockIndex(original, undefined, 'remove')).toBe(original)
  })

  // --- edge cases ---

  it('returns newContent for empty/whitespace-only input', () => {
    expect(spliceAtBlockIndex('', 0, 'insert-after', 'New content')).toBe('New content')
    expect(spliceAtBlockIndex('   ', 0, 'replace', 'New')).toBe('New')
    expect(spliceAtBlockIndex('\n\n', 0, 'remove')).toBe('')
  })

  it('handles single-block document for all operations', () => {
    const single = 'Just one paragraph here.'
    // insert-after at block 0
    const inserted = spliceAtBlockIndex(single, 0, 'insert-after', 'After.')
    expect(inserted).toContain('Just one paragraph here.')
    expect(inserted).toContain('After.')

    // replace at block 0
    const replaced = spliceAtBlockIndex(single, 0, 'replace', 'Replaced.')
    expect(replaced).toBe('Replaced.')

    // remove at block 0
    const removed = spliceAtBlockIndex(single, 0, 'remove')
    expect(removed.trim()).toBe('')
  })

  it('preserves structure with headings, lists, and code blocks', () => {
    const complex = '# Title\n\nParagraph text.\n\n- Item 1\n- Item 2\n\n```js\ncode()\n```'
    // Insert after the heading (block 0)
    const result = spliceAtBlockIndex(complex, 0, 'insert-after', 'New section intro.')
    expect(result).toContain('# Title')
    expect(result).toContain('New section intro.')
    expect(result).toContain('Paragraph text.')
    expect(result).toContain('- Item 1')
    expect(result).toContain('```js')
  })
})

// ============================================================================
// buildMarkdownTable (Phase 6)
// ============================================================================

describe('buildMarkdownTable', () => {
  it('produces valid markdown table with headers and rows', () => {
    const result = buildMarkdownTable(
      ['Name', 'Age'],
      [
        ['Alice', '25'],
        ['Bob', '30'],
      ]
    )
    expect(result).toContain('| Name | Age |')
    expect(result).toContain('| --- | --- |')
    expect(result).toContain('| Alice | 25 |')
    expect(result).toContain('| Bob | 30 |')
  })

  it('includes title as ### heading when provided', () => {
    const result = buildMarkdownTable(['Col'], [['Val']], 'My Table')
    expect(result).toContain('### My Table')
    // Title line should come before the table
    expect(result.indexOf('### My Table')).toBeLessThan(result.indexOf('| Col |'))
  })

  it('produces headers-only table when rows are empty', () => {
    const result = buildMarkdownTable(['A', 'B', 'C'], [])
    expect(result).toContain('| A | B | C |')
    expect(result).toContain('| --- | --- | --- |')
    // No data rows
    const lines = result.split('\n').filter((l) => l.startsWith('|'))
    expect(lines).toHaveLength(2) // header + separator
  })

  it('pads mismatched row lengths with empty strings', () => {
    const result = buildMarkdownTable(['X', 'Y', 'Z'], [['only-one']])
    expect(result).toContain('| only-one |  |  |')
  })
})

// ============================================================================
// resolveAfterHeadingIndex (Phase 6)
// ============================================================================

describe('resolveAfterHeadingIndex', () => {
  it('finds heading and returns correct block index', () => {
    const content = '# Intro\n\nSome text.\n\n## Methods\n\nMethod details.'
    const idx = resolveAfterHeadingIndex(content, 'Methods')
    expect(idx).toBeDefined()
    expect(typeof idx).toBe('number')
    // Methods heading should be at index 2 (Intro=0, paragraph=1, Methods=2)
    expect(idx).toBe(2)
  })

  it('returns undefined when heading not found', () => {
    const content = '# Intro\n\nSome text.'
    expect(resolveAfterHeadingIndex(content, 'Nonexistent')).toBeUndefined()
  })

  it('matches partial heading text (fuzzy)', () => {
    const content = '# Introduction to Machine Learning\n\nContent here.'
    const idx = resolveAfterHeadingIndex(content, 'machine learning')
    expect(idx).toBeDefined()
    expect(idx).toBe(0)
  })
})

// ============================================================================
// insert_table JSON parse safety (Phase 6 — insert_table fix)
// ============================================================================

describe('insert_table', () => {
  it('returns error string on invalid JSON rows', async () => {
    executeToolMock.mockResolvedValue({
      success: true,
      data: { content: 'Existing content.' },
    })

    const events: Array<{ type: string; data: unknown }> = []
    const tools = createEditorDeepTools(
      {
        userId: 'u1',
        supabase: createSupabaseStub(),
        editorContext: { currentNoteId: '11111111-1111-4111-8111-111111111111' },
        emitEvent: (event) => events.push(event),
      },
      { read: vi.fn(), write: vi.fn() } as any
    )

    const output = await tools.insert_table.execute!(
      { headers: ['Name', 'Age'], rows: 'not valid json {{{', position: 'end' },
      TOOL_EXEC_CTX
    )

    expect(String(output)).toContain('Failed to parse table rows')
    // Should NOT emit edit-proposal for invalid input
    expect(events.some((e) => e.type === 'edit-proposal')).toBe(false)
  })

  it('inserts valid table when JSON rows are correct', async () => {
    executeToolMock.mockResolvedValue({
      success: true,
      data: { content: 'Existing content.' },
    })

    const events: Array<{ type: string; data: unknown }> = []
    const tools = createEditorDeepTools(
      {
        userId: 'u1',
        supabase: createSupabaseStub(),
        editorContext: { currentNoteId: '11111111-1111-4111-8111-111111111111' },
        emitEvent: (event) => events.push(event),
      },
      { read: vi.fn(), write: vi.fn() } as any
    )

    await tools.insert_table.execute!(
      {
        headers: ['Name', 'Age'],
        rows: JSON.stringify([['Alice', '25']]),
        position: 'end',
      },
      TOOL_EXEC_CTX
    )

    const editEvent = events.find((e) => e.type === 'edit-proposal')
    expect(editEvent).toBeTruthy()
    const data = editEvent!.data as { proposed: string }
    expect(data.proposed).toContain('| Name | Age |')
    expect(data.proposed).toContain('| Alice | 25 |')
  })
})
