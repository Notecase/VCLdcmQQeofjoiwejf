# Fix: Usage Bars Show 0% Despite Actual Usage (Take 2)

**Date**: 2026-03-19
**Status**: Previous fix applied but **didn't work** — root cause was deeper than expected

---

## Context

Settings dashboard "This month" bar shows **0%** and "Credits remaining" shows **100%** despite 14 visible deductions in the Activity log. A previous fix (ledger query + rounding) was applied but the bar still shows 0%.

## Root Cause (Confirmed via Data Flow Trace)

**The `get_monthly_ai_usage` RPC returns no rows** because `ai_usage` table inserts fail silently (`usage-persister.ts` catches errors and only logs them). The `credit_transactions` table (the authoritative ledger that the Activity log reads from) **does** have data.

**Failure chain in the previous fix:**

1. `get_monthly_ai_usage` RPC → returns empty array (no `ai_usage` rows)
2. `data?.[0]` → `undefined` → `usage = null`
3. **Line 338**: `usage ? { ...usage, ledger_total_cost_cents } : null` → **null** (ledger data discarded!)
4. Store receives `{ usage: null }` → `monthlyUsage.value` is null
5. **Line 80**: `if (!monthlyUsage.value || pool === 0) return 0` → **short-circuits to 0** before ever checking ledger

The ledger query was correct, but it was only attached to the response when the RPC already had data — the exact scenario where it **wasn't needed**.

## Fix (Single Change)

### File: `apps/api/src/routes/settings.ts` (line 336-339)

**Before** (broken):
```typescript
const usage = data?.[0] ?? null
return c.json({
  usage: usage ? { ...usage, ledger_total_cost_cents: ledgerTotalCostCents } : null,
})
```

**After** (fixed — always return a valid object with ledger data):
```typescript
const rpcUsage = data?.[0] ?? null
return c.json({
  usage: {
    total_requests: 0,
    total_tokens: 0,
    total_cost_cents: 0,
    requests_by_provider: {},
    requests_by_action: {},
    ...rpcUsage,
    ledger_total_cost_cents: ledgerTotalCostCents,
  },
})
```

**Why this works:** The API always returns a non-null usage object with `ledger_total_cost_cents`. When the RPC has data, it spreads on top of the defaults. When it doesn't, the defaults + ledger total still give the store something to work with.

No changes needed in `credits.ts` — the store code from the previous fix is already correct (it prefers `ledger_total_cost_cents` and uses `Math.max(1, ...)`).

## Files Changed

| File | Change |
|------|--------|
| `apps/api/src/routes/settings.ts` | Always return valid usage object (don't discard ledger when RPC is empty) |

## Verification

1. Open `/settings` → Usage section
2. "This month" bar should show **at least 1%** (14 deductions exist)
3. "Credits remaining" bar should show **< 100%** (complementary)
4. Activity log deductions (14 entries) match what the bar reflects
5. Refresh button updates both bars correctly
