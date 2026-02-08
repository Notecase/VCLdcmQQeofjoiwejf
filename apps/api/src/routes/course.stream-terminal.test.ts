import { describe, expect, it } from 'vitest'
import {
  buildMissingTerminalEventErrorMessage,
  shouldMarkThreadAsErrorAfterStreamEnd,
} from './course.stream-terminal'

describe('shouldMarkThreadAsErrorAfterStreamEnd', () => {
  it('returns true for running/generating_content when no terminal event was observed', () => {
    expect(shouldMarkThreadAsErrorAfterStreamEnd('running', false)).toBe(true)
    expect(shouldMarkThreadAsErrorAfterStreamEnd('generating_content', false)).toBe(true)
  })

  it('returns false for terminal statuses and awaiting_approval', () => {
    expect(shouldMarkThreadAsErrorAfterStreamEnd('complete', false)).toBe(false)
    expect(shouldMarkThreadAsErrorAfterStreamEnd('error', false)).toBe(false)
    expect(shouldMarkThreadAsErrorAfterStreamEnd('cancelled', false)).toBe(false)
    expect(shouldMarkThreadAsErrorAfterStreamEnd('awaiting_approval', false)).toBe(false)
  })

  it('returns false when a terminal event was already observed', () => {
    expect(shouldMarkThreadAsErrorAfterStreamEnd('running', true)).toBe(false)
    expect(shouldMarkThreadAsErrorAfterStreamEnd('generating_content', true)).toBe(false)
  })
})

describe('buildMissingTerminalEventErrorMessage', () => {
  it('includes the last known stage in the diagnostic message', () => {
    expect(buildMissingTerminalEventErrorMessage('saving')).toContain('saving')
  })
})
