export function canSubmitOutlineApproval(threadId: string | null, isApproving: boolean): boolean {
  return Boolean(threadId) && !isApproving
}
