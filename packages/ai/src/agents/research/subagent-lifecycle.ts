import type { SubagentInfo } from '@inkdown/shared/types'

interface SubagentRecord {
  info: SubagentInfo
  completed: boolean
}

export class SubagentLifecycle {
  private visibleNodes: Set<string>
  private records = new Map<string, SubagentRecord>()

  constructor(visibleNodeKeys: string[]) {
    this.visibleNodes = new Set(visibleNodeKeys)
  }

  isVisibleNode(nodeKey: string): boolean {
    return this.visibleNodes.has(nodeKey)
  }

  start(nodeKey: string): SubagentInfo | null {
    if (!this.isVisibleNode(nodeKey)) return null
    if (this.records.has(nodeKey)) return null

    const now = new Date().toISOString()
    const info: SubagentInfo = {
      id: `subagent-${nodeKey}-${Date.now()}`,
      name: nodeKey,
      description: this.getDescription(nodeKey),
      status: 'running',
      startedAt: now,
    }

    this.records.set(nodeKey, { info, completed: false })
    return info
  }

  complete(nodeKey: string, output?: string): SubagentInfo | null {
    const record = this.records.get(nodeKey)
    if (!record || record.completed) return null

    record.completed = true
    record.info = {
      ...record.info,
      status: 'completed',
      output: output || '',
      completedAt: new Date().toISOString(),
    }

    return record.info
  }

  completeAll(outputsByNode: Map<string, string>): SubagentInfo[] {
    const completed: SubagentInfo[] = []
    for (const nodeKey of this.records.keys()) {
      const output = outputsByNode.get(nodeKey) || ''
      const info = this.complete(nodeKey, output)
      if (info) completed.push(info)
    }
    return completed
  }

  private getDescription(nodeKey: string): string {
    if (nodeKey === 'researcher') return 'Searches and gathers source material'
    if (nodeKey === 'writer') return 'Synthesizes findings into a final response'
    return `Runs ${nodeKey} sub-agent task`
  }
}
