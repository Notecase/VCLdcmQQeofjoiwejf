/**
 * Local Database Adapter
 * IndexedDB/LocalForage based database for offline/development mode
 */
import localforage from 'localforage'
import type {
  IDatabaseProvider,
  IQueryBuilder,
  DatabaseResult,
  InsertOptions,
  UpdateOptions,
  RealtimeSubscription,
  RealtimeEvent,
  RealtimeCallback
} from '../providers'

// Initialize localforage
const db = localforage.createInstance({
  name: 'inkdown',
  storeName: 'documents'
})

class LocalQueryBuilder<T> implements IQueryBuilder<T> {
  private tableName: string
  private _columns: string = '*'
  private _filters: Array<{ column: string; op: string; value: unknown }> = []
  private _orderBy: { column: string; ascending: boolean } | null = null
  private _limit: number | null = null
  private _offset: number | null = null
  private _single: boolean = false

  constructor(tableName: string) {
    this.tableName = tableName
  }

  select(columns?: string): IQueryBuilder<T> {
    this._columns = columns || '*'
    return this
  }

  eq(column: string, value: unknown): IQueryBuilder<T> {
    this._filters.push({ column, op: 'eq', value })
    return this
  }

  neq(column: string, value: unknown): IQueryBuilder<T> {
    this._filters.push({ column, op: 'neq', value })
    return this
  }

  gt(column: string, value: unknown): IQueryBuilder<T> {
    this._filters.push({ column, op: 'gt', value })
    return this
  }

  gte(column: string, value: unknown): IQueryBuilder<T> {
    this._filters.push({ column, op: 'gte', value })
    return this
  }

  lt(column: string, value: unknown): IQueryBuilder<T> {
    this._filters.push({ column, op: 'lt', value })
    return this
  }

  lte(column: string, value: unknown): IQueryBuilder<T> {
    this._filters.push({ column, op: 'lte', value })
    return this
  }

  like(column: string, pattern: string): IQueryBuilder<T> {
    this._filters.push({ column, op: 'like', value: pattern })
    return this
  }

  ilike(column: string, pattern: string): IQueryBuilder<T> {
    this._filters.push({ column, op: 'ilike', value: pattern })
    return this
  }

  in(column: string, values: unknown[]): IQueryBuilder<T> {
    this._filters.push({ column, op: 'in', value: values })
    return this
  }

  is(column: string, value: null | boolean): IQueryBuilder<T> {
    this._filters.push({ column, op: 'is', value })
    return this
  }

  contains(column: string, value: unknown): IQueryBuilder<T> {
    this._filters.push({ column, op: 'contains', value })
    return this
  }

  or(_filters: string): IQueryBuilder<T> {
    // Simplified - not fully implemented for local
    return this
  }

  not(column: string, operator: string, value: unknown): IQueryBuilder<T> {
    this._filters.push({ column, op: `not_${operator}`, value })
    return this
  }

  order(column: string, options?: { ascending?: boolean }): IQueryBuilder<T> {
    this._orderBy = { column, ascending: options?.ascending ?? true }
    return this
  }

  limit(count: number): IQueryBuilder<T> {
    this._limit = count
    return this
  }

  offset(count: number): IQueryBuilder<T> {
    this._offset = count
    return this
  }

  range(from: number, to: number): IQueryBuilder<T> {
    this._offset = from
    this._limit = to - from + 1
    return this
  }

  single(): IQueryBuilder<T> {
    this._single = true
    this._limit = 1
    return this
  }

  maybeSingle(): IQueryBuilder<T> {
    this._single = true
    this._limit = 1
    return this
  }

  private async getAllItems(): Promise<T[]> {
    const items: T[] = []
    await db.iterate((value: T) => {
      items.push(value)
    })
    return items
  }

  private filterItems(items: T[]): T[] {
    return items.filter(item => {
      return this._filters.every(filter => {
        const val = (item as Record<string, unknown>)[filter.column]
        switch (filter.op) {
          case 'eq': return val === filter.value
          case 'neq': return val !== filter.value
          case 'gt': return (val as number) > (filter.value as number)
          case 'gte': return (val as number) >= (filter.value as number)
          case 'lt': return (val as number) < (filter.value as number)
          case 'lte': return (val as number) <= (filter.value as number)
          case 'like':
          case 'ilike':
            const pattern = String(filter.value).replace(/%/g, '.*')
            return new RegExp(pattern, 'i').test(String(val))
          case 'in': return (filter.value as unknown[]).includes(val)
          case 'is': return val === filter.value
          default: return true
        }
      })
    })
  }

  async insert(data: Partial<T> | Partial<T>[], _options?: InsertOptions): Promise<DatabaseResult<T | T[]>> {
    try {
      const items = Array.isArray(data) ? data : [data]
      const results: T[] = []

      for (const item of items) {
        const id = ((item as Record<string, unknown>).id || crypto.randomUUID()) as string
        const record = { ...item, id } as T
        await db.setItem(id, record)
        results.push(record)
      }

      return { data: Array.isArray(data) ? results : results[0], error: null }
    } catch (e) {
      return { data: null, error: { code: 'insert_error', message: String(e) } }
    }
  }

  async update(data: Partial<T>, _options?: UpdateOptions): Promise<DatabaseResult<T | T[]>> {
    try {
      const all = await this.getAllItems()
      const filtered = this.filterItems(all)
      const results: T[] = []

      for (const item of filtered) {
        const id = (item as Record<string, unknown>).id as string
        const updated = { ...item, ...data, updated_at: new Date().toISOString() } as T
        await db.setItem(id, updated)
        results.push(updated)
      }

      return { data: results, error: null }
    } catch (e) {
      return { data: null, error: { code: 'update_error', message: String(e) } }
    }
  }

  async delete(_options?: UpdateOptions): Promise<DatabaseResult<T | T[]>> {
    try {
      const all = await this.getAllItems()
      const filtered = this.filterItems(all)

      for (const item of filtered) {
        const id = (item as Record<string, unknown>).id as string
        await db.removeItem(id)
      }

      return { data: filtered, error: null }
    } catch (e) {
      return { data: null, error: { code: 'delete_error', message: String(e) } }
    }
  }

  async upsert(data: Partial<T> | Partial<T>[], options?: InsertOptions): Promise<DatabaseResult<T | T[]>> {
    return this.insert(data, options)
  }

  async execute(): Promise<DatabaseResult<T[]>> {
    try {
      let items = await this.getAllItems()
      items = this.filterItems(items)

      // Sort
      if (this._orderBy) {
        const orderCol = this._orderBy.column
        const asc = this._orderBy.ascending
        items.sort((a, b) => {
          const aVal = String((a as Record<string, unknown>)[orderCol] ?? '')
          const bVal = String((b as Record<string, unknown>)[orderCol] ?? '')
          const cmp = aVal.localeCompare(bVal)
          return asc ? cmp : -cmp
        })
      }

      // Paginate
      if (this._offset) items = items.slice(this._offset)
      if (this._limit) items = items.slice(0, this._limit)

      return { data: items, error: null, count: items.length }
    } catch (e) {
      return { data: null, error: { code: 'query_error', message: String(e) } }
    }
  }
}

class LocalDatabaseProvider implements IDatabaseProvider {
  from<T = Record<string, unknown>>(table: string): IQueryBuilder<T> {
    return new LocalQueryBuilder<T>(table)
  }

  async rpc<T = unknown>(_functionName: string, _params?: Record<string, unknown>): Promise<DatabaseResult<T>> {
    return { data: null, error: { code: 'not_supported', message: 'RPC not available in local mode' } }
  }

  on<T = Record<string, unknown>>(
    _table: string,
    _event: RealtimeEvent,
    _callback: RealtimeCallback<T>,
    _filter?: { column: string; value: unknown }
  ): RealtimeSubscription {
    // No-op in local mode
    return { unsubscribe: () => { } }
  }
}

export function createLocalDatabase(): IDatabaseProvider {
  return new LocalDatabaseProvider()
}
