import { describe, expect, it } from 'vitest'
import { canSubmitOutlineApproval } from './course.approval-guard'

describe('canSubmitOutlineApproval', () => {
  it('returns false when threadId is missing', () => {
    expect(canSubmitOutlineApproval(null, false)).toBe(false)
  })

  it('returns false while an approval request is already in flight', () => {
    expect(canSubmitOutlineApproval('thread-1', true)).toBe(false)
  })

  it('returns true only when thread exists and no in-flight request', () => {
    expect(canSubmitOutlineApproval('thread-1', false)).toBe(true)
  })
})
