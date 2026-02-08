import type { MemoryFile } from '@inkdown/shared/types'

export interface MemoryFileGroups {
  rootMemoryFiles: MemoryFile[]
  historyEntries: MemoryFile[]
  planArchiveEntries: MemoryFile[]
}

export function partitionMemoryFiles(files: MemoryFile[]): MemoryFileGroups {
  const rootMemoryFiles = files
    .filter(file => !file.filename.includes('/'))
    .sort((a, b) => a.filename.localeCompare(b.filename))

  const historyEntries = files
    .filter(file => file.filename.startsWith('History/'))
    .sort((a, b) => b.filename.localeCompare(a.filename))

  const planArchiveEntries = files
    .filter(file => file.filename.startsWith('Plans/'))
    .sort((a, b) => b.filename.localeCompare(a.filename))

  return {
    rootMemoryFiles,
    historyEntries,
    planArchiveEntries,
  }
}
