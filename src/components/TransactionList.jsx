import { useCallback, useEffect, useRef, useState } from 'react'
import { getTransactionsPage } from '../db'
import { groupByDay } from '../lib/format'
import TransactionRow from './TransactionRow'

const PAGE_SIZE = 30

/**
 * Infinite-scroll transaction list. Loads pages of PAGE_SIZE newest-first from
 * Dexie and appends as an IntersectionObserver sentinel nears the viewport.
 *
 * @param query           description filter (empty = full list)
 * @param filters         funnel filters (see FilterSheet / getTransactionsPage);
 *                        composed with `query` — parent must pass a stable
 *                        (memoized) object
 * @param refreshToken    change this number to force a reload from page 1
 *                        (e.g. after add / edit / delete)
 * @param categoriesById  Map<id, category>
 * @param accountsById    Map<id, account>
 * @param onRowClick      (tx) => void  — open the edit sheet
 */
export default function TransactionList({
  query,
  filters,
  refreshToken,
  categoriesById,
  accountsById,
  onRowClick,
}) {
  const [items, setItems] = useState([])
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Refs mirror state for use inside the observer / async callbacks.
  const itemsRef = useRef([])
  const cursorRef = useRef(null)
  const hasMoreRef = useRef(true)
  const loadingRef = useRef(false)
  const sentinelRef = useRef(null)

  const fetchPage = useCallback(
    (before) =>
      getTransactionsPage({
        limit: PAGE_SIZE,
        before,
        filters: { ...(filters ?? {}), query },
      }),
    [query, filters],
  )

  const loadPage = useCallback(
    async (reset) => {
      if (loadingRef.current) return
      if (!reset && !hasMoreRef.current) return
      loadingRef.current = true
      setLoading(true)

      const before = reset ? null : cursorRef.current
      const page = await fetchPage(before)

      const next = reset ? page : [...itemsRef.current, ...page]
      itemsRef.current = next
      setItems(next)

      const last = page[page.length - 1]
      if (last) cursorRef.current = { date: last.date, id: last.id }
      const more = page.length === PAGE_SIZE
      hasMoreRef.current = more
      setHasMore(more)

      loadingRef.current = false
      setLoading(false)
      setInitialized(true)
    },
    [fetchPage],
  )

  // Reload from the top whenever the query, filters or refreshToken change.
  useEffect(() => {
    cursorRef.current = null
    hasMoreRef.current = true
    loadingRef.current = false
    loadPage(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters, refreshToken])

  // Load more when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadPage(false)
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadPage])

  const groups = groupByDay(items)

  const filtered =
    query.trim() ||
    (filters &&
      (filters.types?.length ||
        filters.categoryIds?.length ||
        filters.accountIds?.length ||
        filters.dateFrom != null ||
        filters.dateTo != null))

  if (initialized && items.length === 0) {
    return (
      <div className="px-6 py-20 text-center text-txt-secondary">
        {filtered ? 'No transactions match your filters.' : 'No transactions yet.'}
      </div>
    )
  }

  return (
    <div>
      {groups.map((group) => (
        <section key={group.key} className="mb-2">
          <h3 className="px-4 pb-1 pt-4 text-sm font-medium text-txt-secondary">{group.label}</h3>
          <div className="mx-3 overflow-hidden rounded-card border border-hairline bg-card">
            {group.items.map((tx, i) => (
              <div key={tx.id}>
                {i > 0 && <div className="mx-4 h-px bg-hairline" />}
                <TransactionRow
                  tx={tx}
                  categoriesById={categoriesById}
                  accountsById={accountsById}
                  onClick={() => onRowClick(tx)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Sentinel + loading indicator for infinite scroll. */}
      <div ref={sentinelRef} className="h-10" />
      {loading && <div className="pb-4 text-center text-sm text-txt-muted">Loading…</div>}
      {!hasMore && items.length > 0 && (
        <div className="pb-6 pt-2 text-center text-xs text-txt-muted">End of transactions</div>
      )}
    </div>
  )
}
