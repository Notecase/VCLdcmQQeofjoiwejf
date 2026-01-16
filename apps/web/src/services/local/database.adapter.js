/**
 * Local Database Adapter
 * IndexedDB/LocalForage based database for offline/development mode
 */
import localforage from 'localforage';
// Initialize localforage
const db = localforage.createInstance({
    name: 'inkdown',
    storeName: 'documents'
});
class LocalQueryBuilder {
    tableName;
    _columns = '*';
    _filters = [];
    _orderBy = null;
    _limit = null;
    _offset = null;
    _single = false;
    constructor(tableName) {
        this.tableName = tableName;
    }
    select(columns) {
        this._columns = columns || '*';
        return this;
    }
    eq(column, value) {
        this._filters.push({ column, op: 'eq', value });
        return this;
    }
    neq(column, value) {
        this._filters.push({ column, op: 'neq', value });
        return this;
    }
    gt(column, value) {
        this._filters.push({ column, op: 'gt', value });
        return this;
    }
    gte(column, value) {
        this._filters.push({ column, op: 'gte', value });
        return this;
    }
    lt(column, value) {
        this._filters.push({ column, op: 'lt', value });
        return this;
    }
    lte(column, value) {
        this._filters.push({ column, op: 'lte', value });
        return this;
    }
    like(column, pattern) {
        this._filters.push({ column, op: 'like', value: pattern });
        return this;
    }
    ilike(column, pattern) {
        this._filters.push({ column, op: 'ilike', value: pattern });
        return this;
    }
    in(column, values) {
        this._filters.push({ column, op: 'in', value: values });
        return this;
    }
    is(column, value) {
        this._filters.push({ column, op: 'is', value });
        return this;
    }
    contains(column, value) {
        this._filters.push({ column, op: 'contains', value });
        return this;
    }
    or(_filters) {
        // Simplified - not fully implemented for local
        return this;
    }
    not(column, operator, value) {
        this._filters.push({ column, op: `not_${operator}`, value });
        return this;
    }
    order(column, options) {
        this._orderBy = { column, ascending: options?.ascending ?? true };
        return this;
    }
    limit(count) {
        this._limit = count;
        return this;
    }
    offset(count) {
        this._offset = count;
        return this;
    }
    range(from, to) {
        this._offset = from;
        this._limit = to - from + 1;
        return this;
    }
    single() {
        this._single = true;
        this._limit = 1;
        return this;
    }
    maybeSingle() {
        this._single = true;
        this._limit = 1;
        return this;
    }
    async getAllItems() {
        const items = [];
        await db.iterate((value) => {
            items.push(value);
        });
        return items;
    }
    filterItems(items) {
        return items.filter(item => {
            return this._filters.every(filter => {
                const val = item[filter.column];
                switch (filter.op) {
                    case 'eq': return val === filter.value;
                    case 'neq': return val !== filter.value;
                    case 'gt': return val > filter.value;
                    case 'gte': return val >= filter.value;
                    case 'lt': return val < filter.value;
                    case 'lte': return val <= filter.value;
                    case 'like':
                    case 'ilike':
                        const pattern = String(filter.value).replace(/%/g, '.*');
                        return new RegExp(pattern, 'i').test(String(val));
                    case 'in': return filter.value.includes(val);
                    case 'is': return val === filter.value;
                    default: return true;
                }
            });
        });
    }
    async insert(data, _options) {
        try {
            const items = Array.isArray(data) ? data : [data];
            const results = [];
            for (const item of items) {
                const id = (item.id || crypto.randomUUID());
                const record = { ...item, id };
                await db.setItem(id, record);
                results.push(record);
            }
            const resultData = Array.isArray(data) ? results : results[0];
            return { data: resultData, error: null };
        }
        catch (e) {
            return { data: null, error: { code: 'insert_error', message: String(e) } };
        }
    }
    async update(data, _options) {
        try {
            const all = await this.getAllItems();
            const filtered = this.filterItems(all);
            const results = [];
            for (const item of filtered) {
                const id = item.id;
                const updated = { ...item, ...data, updated_at: new Date().toISOString() };
                await db.setItem(id, updated);
                results.push(updated);
            }
            return { data: results, error: null };
        }
        catch (e) {
            return { data: null, error: { code: 'update_error', message: String(e) } };
        }
    }
    async delete(_options) {
        try {
            const all = await this.getAllItems();
            const filtered = this.filterItems(all);
            for (const item of filtered) {
                const id = item.id;
                await db.removeItem(id);
            }
            return { data: filtered, error: null };
        }
        catch (e) {
            return { data: null, error: { code: 'delete_error', message: String(e) } };
        }
    }
    async upsert(data, options) {
        return this.insert(data, options);
    }
    async execute() {
        try {
            let items = await this.getAllItems();
            items = this.filterItems(items);
            // Sort
            if (this._orderBy) {
                const orderCol = this._orderBy.column;
                const asc = this._orderBy.ascending;
                items.sort((a, b) => {
                    const aVal = String(a[orderCol] ?? '');
                    const bVal = String(b[orderCol] ?? '');
                    const cmp = aVal.localeCompare(bVal);
                    return asc ? cmp : -cmp;
                });
            }
            // Paginate
            if (this._offset)
                items = items.slice(this._offset);
            if (this._limit)
                items = items.slice(0, this._limit);
            return { data: items, error: null, count: items.length };
        }
        catch (e) {
            return { data: null, error: { code: 'query_error', message: String(e) } };
        }
    }
}
class LocalDatabaseProvider {
    from(table) {
        return new LocalQueryBuilder(table);
    }
    async rpc(_functionName, _params) {
        return { data: null, error: { code: 'not_supported', message: 'RPC not available in local mode' } };
    }
    on(_table, _event, _callback, _filter) {
        // No-op in local mode
        return { unsubscribe: () => { } };
    }
}
export function createLocalDatabase() {
    return new LocalDatabaseProvider();
}
