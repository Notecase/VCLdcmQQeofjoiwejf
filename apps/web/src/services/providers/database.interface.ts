/**
 * Database Provider Interface
 * Provider-agnostic database abstraction for scale-ready architecture
 */

export interface QueryOptions {
  columns?: string
  limit?: number
  offset?: number
  orderBy?: { column: string; ascending?: boolean }[]
  filters?: QueryFilter[]
}

export interface QueryFilter {
  column: string
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is' | 'contains'
  value: unknown
}

export interface InsertOptions {
  returning?: boolean
  onConflict?: {
    columns: string[]
    action: 'update' | 'ignore'
  }
}

export interface UpdateOptions {
  returning?: boolean
}

export interface DatabaseError {
  code: string
  message: string
  details?: string
  hint?: string
}

export type DatabaseResult<T> =
  | { data: T; error: null; count?: number }
  | { data: null; error: DatabaseError; count?: number }

export interface RealtimeSubscription {
  unsubscribe: () => void
}

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

export interface RealtimePayload<T = Record<string, unknown>> {
  eventType: RealtimeEvent
  new: T | null
  old: T | null
  schema: string
  table: string
  commit_timestamp: string
}

export type RealtimeCallback<T = Record<string, unknown>> = (payload: RealtimePayload<T>) => void

/**
 * Database Provider Interface
 * Implement this interface for different database backends (Supabase, Firebase, Prisma, etc.)
 */
export interface IDatabaseProvider {
  // Query operations
  from<T = Record<string, unknown>>(table: string): IQueryBuilder<T>

  // RPC/Function calls
  rpc<T = unknown>(
    functionName: string,
    params?: Record<string, unknown>
  ): Promise<DatabaseResult<T>>

  // Real-time subscriptions
  on<T = Record<string, unknown>>(
    table: string,
    event: RealtimeEvent,
    callback: RealtimeCallback<T>,
    filter?: { column: string; value: unknown }
  ): RealtimeSubscription
}

/**
 * Query Builder Interface
 * Fluent interface for building database queries
 */
export interface IQueryBuilder<T> {
  // Selection
  select(columns?: string): IQueryBuilder<T>

  // Filtering
  eq(column: string, value: unknown): IQueryBuilder<T>
  neq(column: string, value: unknown): IQueryBuilder<T>
  gt(column: string, value: unknown): IQueryBuilder<T>
  gte(column: string, value: unknown): IQueryBuilder<T>
  lt(column: string, value: unknown): IQueryBuilder<T>
  lte(column: string, value: unknown): IQueryBuilder<T>
  like(column: string, pattern: string): IQueryBuilder<T>
  ilike(column: string, pattern: string): IQueryBuilder<T>
  in(column: string, values: unknown[]): IQueryBuilder<T>
  is(column: string, value: null | boolean): IQueryBuilder<T>
  contains(column: string, value: unknown): IQueryBuilder<T>
  or(filters: string): IQueryBuilder<T>
  not(column: string, operator: string, value: unknown): IQueryBuilder<T>

  // Ordering
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): IQueryBuilder<T>

  // Pagination
  limit(count: number): IQueryBuilder<T>
  offset(count: number): IQueryBuilder<T>
  range(from: number, to: number): IQueryBuilder<T>

  // Single result
  single(): IQueryBuilder<T>
  maybeSingle(): IQueryBuilder<T>

  // Mutations
  insert(data: Partial<T> | Partial<T>[], options?: InsertOptions): Promise<DatabaseResult<T | T[]>>
  update(data: Partial<T>, options?: UpdateOptions): Promise<DatabaseResult<T | T[]>>
  delete(options?: UpdateOptions): Promise<DatabaseResult<T | T[]>>
  upsert(data: Partial<T> | Partial<T>[], options?: InsertOptions): Promise<DatabaseResult<T | T[]>>

  // Execute
  execute(): Promise<DatabaseResult<T[]>>
}

/**
 * Document-specific query helpers
 */
export interface IDocumentQueries {
  getById(id: string): Promise<DatabaseResult<unknown>>
  getByUserId(userId: string, options?: QueryOptions): Promise<DatabaseResult<unknown[]>>
  search(query: string, userId: string): Promise<DatabaseResult<unknown[]>>
  create(data: unknown): Promise<DatabaseResult<unknown>>
  update(id: string, data: unknown): Promise<DatabaseResult<unknown>>
  delete(id: string): Promise<DatabaseResult<unknown>>
  softDelete(id: string): Promise<DatabaseResult<unknown>>
  restore(id: string): Promise<DatabaseResult<unknown>>
}
