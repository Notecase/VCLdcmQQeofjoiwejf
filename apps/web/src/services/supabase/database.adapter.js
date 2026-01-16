/**
 * Supabase Database Adapter
 * Implements IDatabaseProvider with fluent query builder
 */
import { supabase, isSupabaseConfigured } from '../supabase';
/**
 * Convert Supabase error to our format
 */
function toDbError(error) {
    if (error && typeof error === 'object' && 'message' in error) {
        const err = error;
        return {
            code: err.code || 'UNKNOWN_ERROR',
            message: err.message,
            details: err.details || err.hint
        };
    }
    return {
        code: 'UNKNOWN_ERROR',
        message: String(error)
    };
}
/**
 * Supabase Query Builder implementation
 * Uses deferred filter application to work with Supabase's API
 */
class SupabaseQueryBuilder {
    tableName;
    selectColumns = null;
    filters = [];
    isSingle = false;
    isMaybeSingle = false;
    limitCount = null;
    constructor(tableName) {
        this.tableName = tableName;
    }
    /**
     * Apply all stored filters to a query
     */
    applyFilters(query) {
        for (const filter of this.filters) {
            switch (filter.type) {
                case 'eq':
                    query = query.eq(filter.column, filter.value);
                    break;
                case 'neq':
                    query = query.neq(filter.column, filter.value);
                    break;
                case 'gt':
                    query = query.gt(filter.column, filter.value);
                    break;
                case 'gte':
                    query = query.gte(filter.column, filter.value);
                    break;
                case 'lt':
                    query = query.lt(filter.column, filter.value);
                    break;
                case 'lte':
                    query = query.lte(filter.column, filter.value);
                    break;
                case 'like':
                    query = query.like(filter.column, filter.pattern);
                    break;
                case 'ilike':
                    query = query.ilike(filter.column, filter.pattern);
                    break;
                case 'in':
                    query = query.in(filter.column, filter.values);
                    break;
                case 'is':
                    query = query.is(filter.column, filter.value);
                    break;
                case 'contains':
                    query = query.contains(filter.column, filter.value);
                    break;
                case 'or':
                    query = query.or(filter.filters);
                    break;
                case 'not':
                    query = query.not(filter.column, filter.operator, filter.value);
                    break;
                case 'order':
                    query = query.order(filter.column, {
                        ascending: filter.options?.ascending ?? true,
                        nullsFirst: filter.options?.nullsFirst ?? false
                    });
                    break;
                case 'limit':
                    query = query.limit(filter.count);
                    break;
                case 'range':
                    query = query.range(filter.from, filter.to);
                    break;
            }
        }
        return query;
    }
    select(columns = '*') {
        this.selectColumns = columns;
        return this;
    }
    eq(column, value) {
        this.filters.push({ type: 'eq', column, value });
        return this;
    }
    neq(column, value) {
        this.filters.push({ type: 'neq', column, value });
        return this;
    }
    gt(column, value) {
        this.filters.push({ type: 'gt', column, value });
        return this;
    }
    gte(column, value) {
        this.filters.push({ type: 'gte', column, value });
        return this;
    }
    lt(column, value) {
        this.filters.push({ type: 'lt', column, value });
        return this;
    }
    lte(column, value) {
        this.filters.push({ type: 'lte', column, value });
        return this;
    }
    like(column, pattern) {
        this.filters.push({ type: 'like', column, pattern });
        return this;
    }
    ilike(column, pattern) {
        this.filters.push({ type: 'ilike', column, pattern });
        return this;
    }
    in(column, values) {
        this.filters.push({ type: 'in', column, values });
        return this;
    }
    is(column, value) {
        this.filters.push({ type: 'is', column, value });
        return this;
    }
    contains(column, value) {
        this.filters.push({ type: 'contains', column, value });
        return this;
    }
    or(filters) {
        this.filters.push({ type: 'or', filters });
        return this;
    }
    not(column, operator, value) {
        this.filters.push({ type: 'not', column, operator, value });
        return this;
    }
    order(column, options) {
        this.filters.push({ type: 'order', column, options });
        return this;
    }
    limit(count) {
        this.limitCount = count;
        this.filters.push({ type: 'limit', count });
        return this;
    }
    offset(count) {
        // Calculate upper bound based on limit
        // If limit is set, use it; otherwise default to 1000
        const upperBound = this.limitCount
            ? count + this.limitCount - 1
            : count + 999;
        this.filters.push({ type: 'range', from: count, to: upperBound });
        return this;
    }
    range(from, to) {
        this.filters.push({ type: 'range', from, to });
        return this;
    }
    single() {
        this.isSingle = true;
        return this;
    }
    maybeSingle() {
        this.isMaybeSingle = true;
        return this;
    }
    async insert(data, options) {
        try {
            let query = supabase.from(this.tableName).insert(data);
            if (options?.returning !== false) {
                query = query.select();
            }
            if (options?.onConflict) {
                query = query.onConflict(options.onConflict.columns.join(','));
            }
            const { data: result, error } = await query;
            if (error) {
                return { data: null, error: toDbError(error) };
            }
            return { data: result, error: null };
        }
        catch (err) {
            return { data: null, error: toDbError(err) };
        }
    }
    async update(data, options) {
        try {
            // Start with update, THEN apply filters (Supabase requirement)
            // Use 'any' to bypass strict Postgrest typing after select()
            let query = supabase.from(this.tableName).update(data);
            query = this.applyFilters(query);
            if (options?.returning !== false) {
                query = query.select();
            }
            const { data: result, error } = await query;
            if (error) {
                return { data: null, error: toDbError(error) };
            }
            return { data: result, error: null };
        }
        catch (err) {
            return { data: null, error: toDbError(err) };
        }
    }
    async delete(options) {
        try {
            // Start with delete, THEN apply filters (Supabase requirement)
            // Use 'any' to bypass strict Postgrest typing after select()
            let query = supabase.from(this.tableName).delete();
            query = this.applyFilters(query);
            if (options?.returning !== false) {
                query = query.select();
            }
            const { data: result, error } = await query;
            if (error) {
                return { data: null, error: toDbError(error) };
            }
            return { data: result, error: null };
        }
        catch (err) {
            return { data: null, error: toDbError(err) };
        }
    }
    async upsert(data, options) {
        try {
            let query = supabase.from(this.tableName).upsert(data, {
                onConflict: options?.onConflict?.columns.join(',')
            });
            if (options?.returning !== false) {
                query = query.select();
            }
            const { data: result, error } = await query;
            if (error) {
                return { data: null, error: toDbError(error) };
            }
            return { data: result, error: null };
        }
        catch (err) {
            return { data: null, error: toDbError(err) };
        }
    }
    async execute() {
        try {
            // Start with select, THEN apply filters (Supabase requirement)
            let query = supabase.from(this.tableName).select(this.selectColumns || '*');
            query = this.applyFilters(query);
            if (this.isSingle) {
                const { data, error } = await query.single();
                if (error) {
                    return { data: null, error: toDbError(error) };
                }
                return { data: [data], error: null };
            }
            if (this.isMaybeSingle) {
                const { data, error } = await query.maybeSingle();
                if (error) {
                    return { data: null, error: toDbError(error) };
                }
                return { data: data ? [data] : [], error: null };
            }
            const { data, error, count } = await query;
            if (error) {
                return { data: null, error: toDbError(error) };
            }
            return { data: (data || []), error: null, count: count ?? undefined };
        }
        catch (err) {
            return { data: null, error: toDbError(err) };
        }
    }
}
/**
 * Supabase Database Provider implementation
 */
class SupabaseDatabaseProvider {
    from(table) {
        return new SupabaseQueryBuilder(table);
    }
    async rpc(functionName, params) {
        try {
            const { data, error } = await supabase.rpc(functionName, params);
            if (error) {
                return { data: null, error: toDbError(error) };
            }
            return { data: data, error: null };
        }
        catch (err) {
            return { data: null, error: toDbError(err) };
        }
    }
    on(table, event, callback, filter) {
        let channel = supabase
            .channel(`${table}_changes`)
            .on('postgres_changes', {
            event: event === '*' ? '*' : event,
            schema: 'public',
            table,
            filter: filter ? `${filter.column}=eq.${filter.value}` : undefined
        }, (payload) => {
            callback({
                eventType: payload.eventType,
                new: payload.new,
                old: payload.old,
                schema: payload.schema,
                table: payload.table,
                commit_timestamp: payload.commit_timestamp
            });
        })
            .subscribe();
        return {
            unsubscribe: () => {
                supabase.removeChannel(channel);
            }
        };
    }
}
// Singleton instance
let instance = null;
/**
 * Create or get Supabase database provider instance
 */
export function createSupabaseDatabase() {
    if (!isSupabaseConfigured) {
        throw new Error('Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
    }
    if (!instance) {
        instance = new SupabaseDatabaseProvider();
    }
    return instance;
}
