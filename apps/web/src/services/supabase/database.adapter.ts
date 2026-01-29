/**
 * Supabase Database Adapter
 * Implements IDatabaseProvider with fluent query builder
 */
import { supabase, isSupabaseConfigured } from '../supabase'
import type {
  IDatabaseProvider,
  IQueryBuilder,
  DatabaseResult,
  InsertOptions,
  UpdateOptions,
  RealtimeSubscription,
  RealtimeEvent,
  RealtimeCallback,
} from '../providers'

/**
 * Convert Supabase error to our format
 */
function toDbError(error: unknown): { code: string; message: string; details?: string } {
  if (error && typeof error === 'object' && 'message' in error) {
    const err = error as { message: string; code?: string; details?: string; hint?: string }
    return {
      code: err.code || 'UNKNOWN_ERROR',
      message: err.message,
      details: err.details || err.hint,
    }
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: String(error),
  }
}

/**
 * Filter operation for deferred application
 * Supabase requires calling update/select/delete BEFORE filter methods
 */
type FilterOp =
  | { type: 'eq'; column: string; value: unknown }
  | { type: 'neq'; column: string; value: unknown }
  | { type: 'gt'; column: string; value: unknown }
  | { type: 'gte'; column: string; value: unknown }
  | { type: 'lt'; column: string; value: unknown }
  | { type: 'lte'; column: string; value: unknown }
  | { type: 'like'; column: string; pattern: string }
  | { type: 'ilike'; column: string; pattern: string }
  | { type: 'in'; column: string; values: unknown[] }
  | { type: 'is'; column: string; value: null | boolean }
  | { type: 'contains'; column: string; value: unknown }
  | { type: 'or'; filters: string }
  | { type: 'not'; column: string; operator: string; value: unknown }
  | { type: 'order'; column: string; options?: { ascending?: boolean; nullsFirst?: boolean } }
  | { type: 'limit'; count: number }
  | { type: 'range'; from: number; to: number }

/**
 * Supabase Query Builder implementation
 * Uses deferred filter application to work with Supabase's API
 */
class SupabaseQueryBuilder<T> implements IQueryBuilder<T> {
  private tableName: string
  private selectColumns: string | null = null
  private filters: FilterOp[] = []
  private isSingle = false
  private isMaybeSingle = false
  private limitCount: number | null = null

  constructor(tableName: string) {
    this.tableName = tableName
  }

  /**
   * Apply all stored filters to a query
   */
  private applyFilters(query: any): any {
    for (const filter of this.filters) {
      switch (filter.type) {
        case 'eq':
          query = query.eq(filter.column, filter.value)
          break
        case 'neq':
          query = query.neq(filter.column, filter.value)
          break
        case 'gt':
          query = query.gt(filter.column, filter.value)
          break
        case 'gte':
          query = query.gte(filter.column, filter.value)
          break
        case 'lt':
          query = query.lt(filter.column, filter.value)
          break
        case 'lte':
          query = query.lte(filter.column, filter.value)
          break
        case 'like':
          query = query.like(filter.column, filter.pattern)
          break
        case 'ilike':
          query = query.ilike(filter.column, filter.pattern)
          break
        case 'in':
          query = query.in(filter.column, filter.values)
          break
        case 'is':
          query = query.is(filter.column, filter.value)
          break
        case 'contains':
          query = query.contains(filter.column, filter.value)
          break
        case 'or':
          query = query.or(filter.filters)
          break
        case 'not':
          query = query.not(filter.column, filter.operator, filter.value)
          break
        case 'order':
          query = query.order(filter.column, {
            ascending: filter.options?.ascending ?? true,
            nullsFirst: filter.options?.nullsFirst ?? false,
          })
          break
        case 'limit':
          query = query.limit(filter.count)
          break
        case 'range':
          query = query.range(filter.from, filter.to)
          break
      }
    }
    return query
  }

  select(columns = '*'): IQueryBuilder<T> {
    this.selectColumns = columns
    return this
  }

  eq(column: string, value: unknown): IQueryBuilder<T> {
    this.filters.push({ type: 'eq', column, value })
    return this
  }

  neq(column: string, value: unknown): IQueryBuilder<T> {
    this.filters.push({ type: 'neq', column, value })
    return this
  }

  gt(column: string, value: unknown): IQueryBuilder<T> {
    this.filters.push({ type: 'gt', column, value })
    return this
  }

  gte(column: string, value: unknown): IQueryBuilder<T> {
    this.filters.push({ type: 'gte', column, value })
    return this
  }

  lt(column: string, value: unknown): IQueryBuilder<T> {
    this.filters.push({ type: 'lt', column, value })
    return this
  }

  lte(column: string, value: unknown): IQueryBuilder<T> {
    this.filters.push({ type: 'lte', column, value })
    return this
  }

  like(column: string, pattern: string): IQueryBuilder<T> {
    this.filters.push({ type: 'like', column, pattern })
    return this
  }

  ilike(column: string, pattern: string): IQueryBuilder<T> {
    this.filters.push({ type: 'ilike', column, pattern })
    return this
  }

  in(column: string, values: unknown[]): IQueryBuilder<T> {
    this.filters.push({ type: 'in', column, values })
    return this
  }

  is(column: string, value: null | boolean): IQueryBuilder<T> {
    this.filters.push({ type: 'is', column, value })
    return this
  }

  contains(column: string, value: unknown): IQueryBuilder<T> {
    this.filters.push({ type: 'contains', column, value })
    return this
  }

  or(filters: string): IQueryBuilder<T> {
    this.filters.push({ type: 'or', filters })
    return this
  }

  not(column: string, operator: string, value: unknown): IQueryBuilder<T> {
    this.filters.push({ type: 'not', column, operator, value })
    return this
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): IQueryBuilder<T> {
    this.filters.push({ type: 'order', column, options })
    return this
  }

  limit(count: number): IQueryBuilder<T> {
    this.limitCount = count
    this.filters.push({ type: 'limit', count })
    return this
  }

  offset(count: number): IQueryBuilder<T> {
    // Calculate upper bound based on limit
    // If limit is set, use it; otherwise default to 1000
    const upperBound = this.limitCount ? count + this.limitCount - 1 : count + 999
    this.filters.push({ type: 'range', from: count, to: upperBound })
    return this
  }

  range(from: number, to: number): IQueryBuilder<T> {
    this.filters.push({ type: 'range', from, to })
    return this
  }

  single(): IQueryBuilder<T> {
    this.isSingle = true
    return this
  }

  maybeSingle(): IQueryBuilder<T> {
    this.isMaybeSingle = true
    return this
  }

  async insert(
    data: Partial<T> | Partial<T>[],
    options?: InsertOptions
  ): Promise<DatabaseResult<T | T[]>> {
    try {
      let query: any = supabase.from(this.tableName).insert(data)

      if (options?.returning !== false) {
        query = query.select()
      }

      if (options?.onConflict) {
        query = query.onConflict(options.onConflict.columns.join(','))
      }

      const { data: result, error } = await query

      if (error) {
        return { data: null, error: toDbError(error) }
      }

      return { data: result as T | T[], error: null }
    } catch (err) {
      return { data: null, error: toDbError(err) }
    }
  }

  async update(data: Partial<T>, options?: UpdateOptions): Promise<DatabaseResult<T | T[]>> {
    try {
      // Start with update, THEN apply filters (Supabase requirement)
      // Use 'any' to bypass strict Postgrest typing after select()
      let query: any = supabase.from(this.tableName).update(data)
      query = this.applyFilters(query)

      if (options?.returning !== false) {
        query = query.select()
      }

      const { data: result, error } = await query

      if (error) {
        return { data: null, error: toDbError(error) }
      }

      return { data: result as T | T[], error: null }
    } catch (err) {
      return { data: null, error: toDbError(err) }
    }
  }

  async delete(options?: UpdateOptions): Promise<DatabaseResult<T | T[]>> {
    try {
      // Start with delete, THEN apply filters (Supabase requirement)
      // Use 'any' to bypass strict Postgrest typing after select()
      let query: any = supabase.from(this.tableName).delete()
      query = this.applyFilters(query)

      if (options?.returning !== false) {
        query = query.select()
      }

      const { data: result, error } = await query

      if (error) {
        return { data: null, error: toDbError(error) }
      }

      return { data: result as T | T[], error: null }
    } catch (err) {
      return { data: null, error: toDbError(err) }
    }
  }

  async upsert(
    data: Partial<T> | Partial<T>[],
    options?: InsertOptions
  ): Promise<DatabaseResult<T | T[]>> {
    try {
      let query: any = supabase.from(this.tableName).upsert(data, {
        onConflict: options?.onConflict?.columns.join(','),
      })

      if (options?.returning !== false) {
        query = query.select()
      }

      const { data: result, error } = await query

      if (error) {
        return { data: null, error: toDbError(error) }
      }

      return { data: result as T | T[], error: null }
    } catch (err) {
      return { data: null, error: toDbError(err) }
    }
  }

  async execute(): Promise<DatabaseResult<T[]>> {
    try {
      // Start with select, THEN apply filters (Supabase requirement)
      let query = supabase.from(this.tableName).select(this.selectColumns || '*')
      query = this.applyFilters(query)

      if (this.isSingle) {
        const { data, error } = await query.single()
        if (error) {
          return { data: null, error: toDbError(error) }
        }
        return { data: [data] as T[], error: null }
      }

      if (this.isMaybeSingle) {
        const { data, error } = await query.maybeSingle()
        if (error) {
          return { data: null, error: toDbError(error) }
        }
        return { data: data ? ([data] as T[]) : [], error: null }
      }

      const { data, error, count } = await query

      if (error) {
        return { data: null, error: toDbError(error) }
      }

      return { data: (data || []) as T[], error: null, count: count ?? undefined }
    } catch (err) {
      return { data: null, error: toDbError(err) }
    }
  }
}

/**
 * Supabase Database Provider implementation
 */
class SupabaseDatabaseProvider implements IDatabaseProvider {
  from<T = Record<string, unknown>>(table: string): IQueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(table)
  }

  async rpc<T = unknown>(
    functionName: string,
    params?: Record<string, unknown>
  ): Promise<DatabaseResult<T>> {
    try {
      const { data, error } = await supabase.rpc(functionName, params)

      if (error) {
        return { data: null, error: toDbError(error) }
      }

      return { data: data as T, error: null }
    } catch (err) {
      return { data: null, error: toDbError(err) }
    }
  }

  on<T = Record<string, unknown>>(
    table: string,
    event: RealtimeEvent,
    callback: RealtimeCallback<T>,
    filter?: { column: string; value: unknown }
  ): RealtimeSubscription {
    let channel = supabase
      .channel(`${table}_changes`)
      .on(
        'postgres_changes' as any,
        {
          event: event === '*' ? '*' : event,
          schema: 'public',
          table,
          filter: filter ? `${filter.column}=eq.${filter.value}` : undefined,
        },
        (payload: any) => {
          callback({
            eventType: payload.eventType,
            new: payload.new as T | null,
            old: payload.old as T | null,
            schema: payload.schema,
            table: payload.table,
            commit_timestamp: payload.commit_timestamp,
          })
        }
      )
      .subscribe()

    return {
      unsubscribe: () => {
        supabase.removeChannel(channel)
      },
    }
  }
}

// Singleton instance
let instance: SupabaseDatabaseProvider | null = null

/**
 * Create or get Supabase database provider instance
 */
export function createSupabaseDatabase(): IDatabaseProvider {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.'
    )
  }

  if (!instance) {
    instance = new SupabaseDatabaseProvider()
  }

  return instance
}
