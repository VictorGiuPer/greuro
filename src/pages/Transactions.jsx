import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, SlidersHorizontal, Settings as SettingsIcon, X, Download } from 'lucide-react'
import { getAccounts, getCategories, getActiveTrips, getTransactionsPage } from '../db'
import { exportTransactionRows } from '../lib/exportXlsx'
import { createTransactionFilters, transactionDateLabel } from '../lib/transactionFilters'
import TransactionList from '../components/TransactionList'
import TransactionForm from '../components/TransactionForm'
import Fab from '../components/ui/Fab'
import FilterSheet, { countActiveFilters } from '../components/FilterSheet'
import Settings from '../components/settings/Settings'

export default function Transactions({ filters, setFilters, rawQuery, setRawQuery }) {
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [trips, setTrips] = useState([])
  const [ready, setReady] = useState(false)

  const [query, setQuery] = useState(rawQuery) // debounced, Transactions only
  const [refreshToken, setRefreshToken] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [editingTx, setEditingTx] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)

  // Re-fetch accounts + categories from Dexie. Called after Settings edits and
  // in-form quick-creates so every dropdown / row reflects the latest data.
  const reloadMeta = useCallback(async () => {
    const [accs, cats, tps] = await Promise.all([getAccounts(), getCategories(), getActiveTrips()])
    setAccounts(accs)
    setCategories(cats)
    setTrips(tps)
    // Settings edits can also write transactions (e.g. a balance correction
    // books an adjustment), so reload the list rather than showing stale rows.
    setRefreshToken((n) => n + 1)
  }, [])

  // Load reference data once.
  useEffect(() => {
    let active = true
    ;(async () => {
      const [accs, cats, tps] = await Promise.all([getAccounts(), getCategories(), getActiveTrips()])
      if (!active) return
      setAccounts(accs)
      setCategories(cats)
      setTrips(tps)
      setReady(true)
    })()
    return () => {
      active = false
    }
  }, [])

  // Debounce the search field so the list reloads while typing without thrash.
  const debounceRef = useRef()
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(rawQuery), 200)
    return () => clearTimeout(debounceRef.current)
  }, [rawQuery])

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )
  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const tripsById = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips])

  function openAdd() {
    setEditingTx(null)
    setFormOpen(true)
  }

  function openEdit(tx) {
    setEditingTx(tx)
    setFormOpen(true)
  }

  function handleSaved() {
    setFormOpen(false)
    setEditingTx(null)
    setRefreshToken((n) => n + 1) // force the list to reload from page 1
  }

  const activeFilterCount = countActiveFilters(filters)

  function clearFilters() {
    clearTimeout(debounceRef.current)
    setFilters(createTransactionFilters())
    setRawQuery('')
    setQuery('')
  }

  // Export everything matching the current filters + search (all pages).
  async function exportCurrentView() {
    const rows = []
    let before = null
    for (;;) {
      const page = await getTransactionsPage({
        limit: 500,
        before,
        filters: { ...filters, query },
      })
      rows.push(...page)
      if (page.length < 500) break
      const last = page[page.length - 1]
      before = { date: last.date, id: last.id }
    }
    if (rows.length > 0) await exportTransactionRows(rows, categoriesById, accountsById, 'filtered')
  }

  // Chips describing each active filter, each individually removable.
  const filterChips = useMemo(() => {
    const chips = []
    for (const t of filters.types) {
      chips.push({
        key: `type-${t}`,
        label: `Type: ${t[0].toUpperCase() + t.slice(1)}`,
        remove: () => setFilters((f) => ({ ...f, types: f.types.filter((x) => x !== t) })),
      })
    }
    for (const id of filters.categoryIds) {
      chips.push({
        key: `cat-${id}`,
        label: `Category: ${categoriesById.get(id)?.name ?? id}`,
        remove: () =>
          setFilters((f) => ({ ...f, categoryIds: f.categoryIds.filter((x) => x !== id) })),
      })
    }
    for (const id of filters.accountIds) {
      chips.push({
        key: `acct-${id}`,
        label: `Account: ${accountsById.get(id)?.name ?? id}`,
        remove: () =>
          setFilters((f) => ({ ...f, accountIds: f.accountIds.filter((x) => x !== id) })),
      })
    }
    for (const id of filters.tripIds ?? []) {
      chips.push({
        key: `trip-${id}`,
        label: `Trip: ${tripsById.get(id)?.name ?? id}`,
        remove: () =>
          setFilters((f) => ({ ...f, tripIds: (f.tripIds ?? []).filter((x) => x !== id) })),
      })
    }
    if (filters.owedOnly) {
      chips.push({
        key: 'owed',
        label: 'Owed to me',
        remove: () => setFilters((f) => ({ ...f, owedOnly: false })),
      })
    }
    if (filters.dateFrom != null || filters.dateTo != null) {
      chips.push({
        key: 'daterange',
        label: transactionDateLabel(filters),
        remove: () => setFilters((f) => ({ ...f, dateFrom: null, dateTo: null })),
      })
    }
    return chips
  }, [filters, categoriesById, accountsById, tripsById])

  return (
    <div className="relative min-h-dvh pb-24">
      {/* Header: search + filter stub */}
      <header className="safe-pt sticky top-0 z-30 bg-bg/90 px-4 pb-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-hairline bg-card px-3.5 py-2.5">
            <Search size={18} className="text-txt-muted" />
            <input
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              placeholder="Search transactions"
              className="w-full bg-transparent text-txt-primary placeholder:text-txt-muted focus:outline-none"
            />
          </div>
          {/* Funnel filter */}
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            title="Filters"
            aria-label="Filters"
            className={`relative flex h-[46px] w-[46px] items-center justify-center rounded-2xl border ${
              activeFilterCount > 0
                ? 'border-accent/60 bg-accent/15 text-accent'
                : 'border-hairline bg-card text-accent'
            }`}
          >
            <SlidersHorizontal size={18} />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-black">
                {activeFilterCount}
              </span>
            )}
          </button>
          {/* Settings — manage accounts & categories. */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Settings"
            className="flex h-[46px] w-[46px] items-center justify-center rounded-2xl border border-hairline bg-card text-txt-secondary hover:text-txt-primary"
          >
            <SettingsIcon size={18} />
          </button>
        </div>

        {/* Active filter chips */}
        {(filterChips.length > 0 || rawQuery.trim()) && (
          <div aria-label="Active transaction filters" className="mt-2 flex flex-wrap items-center gap-1.5">
            {filterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.remove}
                aria-label={`Remove filter ${chip.label}`}
                className="flex min-h-[32px] items-center gap-1 rounded-full border border-accent/40 bg-accent/10 py-1 pl-3 pr-2 text-xs font-medium text-accent"
              >
                {chip.label}
                <X size={13} />
              </button>
            ))}
            {rawQuery.trim() && (
              <button
                type="button"
                onClick={() => { setRawQuery(''); setQuery('') }}
                aria-label="Remove search filter"
                className="flex min-h-[32px] items-center gap-1 rounded-full border border-accent/40 bg-accent/10 py-1 pl-3 pr-2 text-xs font-medium text-accent"
              >
                Search: {rawQuery.trim()}
                <X size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-[32px] rounded-full px-2.5 py-1 text-xs font-medium text-txt-secondary hover:text-txt-primary"
            >
              Clear filters
            </button>
            <button
              type="button"
              onClick={exportCurrentView}
              aria-label="Export this view as Excel"
              className="ml-auto flex min-h-[32px] items-center gap-1 rounded-full border border-hairline bg-card px-2.5 py-1 text-xs font-medium text-txt-secondary hover:text-txt-primary"
            >
              <Download size={13} />
              Export view
            </button>
          </div>
        )}
      </header>

      {ready && (
        <TransactionList
          query={query}
          filters={filters}
          refreshToken={refreshToken}
          categoriesById={categoriesById}
          accountsById={accountsById}
          onRowClick={openEdit}
        />
      )}

      <Fab onClick={openAdd} label="Add transaction" />

      <TransactionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
        accounts={accounts}
        categories={categories}
        trips={trips}
        editingTx={editingTx}
        onMetaChanged={reloadMeta}
      />

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        categories={categories}
        accounts={accounts}
        trips={trips}
        filters={filters}
        onApply={setFilters}
      />

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        accounts={accounts}
        categories={categories}
        onChanged={reloadMeta}
      />
    </div>
  )
}
