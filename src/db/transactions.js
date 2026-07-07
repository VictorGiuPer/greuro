import { db } from './db'

/**
 * Transaction CRUD + paged queries.
 *
 * All writes maintain `updatedAt`. `amount` is expected to already be a
 * positive number (the form enforces amount > 0); sign is derived from `type`.
 */

/**
 * Normalize a transaction payload so only the fields relevant to its `type`
 * are populated; the others are forced to null. Keeps the store consistent.
 */
function normalize(data) {
  const type = data.type
  const base = {
    type,
    amount: Number(data.amount),
    date: Number(data.date),
    description: (data.description ?? '').trim(),
    categoryId: null,
    accountId: null,
    fromAccountId: null,
    toAccountId: null,
  }
  if (type === 'transfer') {
    base.fromAccountId = data.fromAccountId ?? null
    base.toAccountId = data.toAccountId ?? null
  } else {
    // expense | income
    base.categoryId = data.categoryId ?? null
    base.accountId = data.accountId ?? null
  }
  return base
}

export async function addTransaction(data) {
  const now = Date.now()
  const row = { ...normalize(data), createdAt: now, updatedAt: now }
  return db.transactions.add(row)
}

export async function updateTransaction(id, patch) {
  const existing = await db.transactions.get(id)
  if (!existing) return
  // Re-normalize the merged record so a type change clears stale fields.
  const merged = normalize({ ...existing, ...patch })
  return db.transactions.update(id, { ...merged, updatedAt: Date.now() })
}

export async function deleteTransaction(id) {
  return db.transactions.delete(id)
}

/**
 * Build the descending-by-(date, id) collection bounded by an optional
 * date range and cursor. The compound `[date+id]` index makes this tie-safe
 * even when many rows share the same day timestamp, and lets the date-range
 * filter and the paging cursor share ONE indexed bound (no dupes/skips).
 *
 * @param {{date:number,id:number}|null} before cursor = the last row of the
 *        previous page. Pass null for the first page.
 * @param {number|null} dateFrom inclusive lower bound (ms)
 * @param {number|null} dateTo   inclusive upper bound (ms)
 */
function pagedCollection(before, dateFrom = null, dateTo = null) {
  // Upper bound: the cursor (exclusive) if paging, else the dateTo day
  // (inclusive via +[Infinity] on the id component).
  const upper = before ? [before.date, before.id] : [dateTo ?? Infinity, Infinity]
  const lower = [dateFrom ?? -Infinity, -Infinity]
  // Cursor bound is exclusive (strictly older); a plain dateTo bound is inclusive.
  return db.transactions.where('[date+id]').between(lower, upper, true, !before).reverse()
}

/** True when a transaction passes the given (already-normalized) filters. */
function matchesFilters(t, { types, categoryIds, accountIds, query }) {
  if (types && !types.has(t.type)) return false
  if (categoryIds && !categoryIds.has(t.categoryId)) return false
  if (accountIds) {
    // Transfers match on either side.
    const hit =
      accountIds.has(t.accountId) || accountIds.has(t.fromAccountId) || accountIds.has(t.toAccountId)
    if (!hit) return false
  }
  if (query && !(t.description || '').toLowerCase().includes(query)) return false
  return true
}

/**
 * Paged query for infinite scroll, with combinable filters. Returns up to
 * `limit` transactions newest first. Pass the previous page's last row as
 * `before` for the next (older) page — the same cursor works with any filter
 * combination because ordering always follows the `[date+id]` index.
 *
 * @param {object} [filters]
 * @param {string[]} [filters.types]        e.g. ['expense','income']
 * @param {number[]} [filters.categoryIds]
 * @param {number[]} [filters.accountIds]   transfers match either side
 * @param {number|null} [filters.dateFrom]  inclusive ms bound
 * @param {number|null} [filters.dateTo]    inclusive ms bound
 * @param {string} [filters.query]          description substring (case-insensitive)
 */
export async function getTransactionsPage({ limit = 30, before = null, filters = null } = {}) {
  const f = filters ?? {}
  const collection = pagedCollection(before, f.dateFrom ?? null, f.dateTo ?? null)

  const norm = {
    types: f.types?.length ? new Set(f.types) : null,
    categoryIds: f.categoryIds?.length ? new Set(f.categoryIds.map(Number)) : null,
    accountIds: f.accountIds?.length ? new Set(f.accountIds.map(Number)) : null,
    query: f.query?.trim() ? f.query.trim().toLowerCase() : null,
  }
  const needsPredicate = norm.types || norm.categoryIds || norm.accountIds || norm.query

  const bounded = needsPredicate
    ? collection.filter((t) => matchesFilters(t, norm))
    : collection
  return bounded.limit(limit).toArray()
}

/**
 * Text-search variant kept for compatibility — delegates to the filtered
 * paged query.
 */
export async function searchTransactionsPage({ query = '', limit = 30, before = null } = {}) {
  return getTransactionsPage({ limit, before, filters: { query } })
}
