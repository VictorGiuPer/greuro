import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, SlidersHorizontal, Settings as SettingsIcon, X, Download } from 'lucide-react'
import { getAccounts, getCategories, getTransactionsPage } from '../db'
import { exportTransactionRows } from '../lib/exportXlsx'
import { formatDate } from '../lib/format'
import TransactionList from '../components/TransactionList'
import TransactionForm from '../components/TransactionForm'
import Fab from '../components/ui/Fab'
import FilterSheet, { EMPTY_FILTERS, countActiveFilters } from '../components/FilterSheet'
import Settings from '../components/settings/Settings'

export default function Transactions() {
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [ready, setReady] = useState(false)

  const [rawQuery, setRawQuery] = useState('')
  const [query, setQuery] = useState('') // debounced
  const [refreshToken, setRefreshToken] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [editingTx, setEditingTx] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  // Re-fetch accounts + categories from Dexie. Called after Settings edits and
  // in-form quick-creates so every dropdown / row reflects the latest data.
  const reloadMeta = useCallback(async () => {
    const [accs, cats] = await Promise.all([getAccounts(), getCategories()])
    setAccounts(accs)
    setCategories(cats)
  }, [])

  // Load reference data once.
  useEffect(() => {
    let active = true
    ;(async () => {
      const [accs, cats] = await Promise.all([getAccounts(), getCategories()])
      if (!active) return
      setAccounts(accs)
      setCategories(cats)
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
        label: t[0].toUpperCase() + t.slice(1),
        remove: () => setFilters((f) => ({ ...f, types: f.types.filter((x) => x !== t) })),
      })
    }
    for (const id of filters.categoryIds) {
      chips.push({
        key: `cat-${id}`,
        label: categoriesById.get(id)?.name ?? 'Category',
        remove: () =>
          setFilters((f) => ({ ...f, categoryIds: f.categoryIds.filter((x) => x !== id) })),
      })
    }
    for (const id of filters.accountIds) {
      chips.push({
        key: `acct-${id}`,
        label: accountsById.get(id)?.name ?? 'Account',
        remove: () =>
          setFilters((f) => ({ ...f, accountIds: f.accountIds.filter((x) => x !== id) })),
      })
    }
    if (filters.dateFrom != null || filters.dateTo != null) {
      const from = filters.dateFrom != null ? formatDate(filters.dateFrom) : '…'
      const to = filters.dateTo != null ? formatDate(filters.dateTo) : '…'
      chips.push({
        key: 'daterange',
        label: `${from} – ${to}`,
        remove: () => setFilters((f) => ({ ...f, dateFrom: null, dateTo: null })),
      })
    }
    return chips
  }, [filters, categoriesById, accountsById])

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
        {(filterChips.length > 0 || query.trim()) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
            {filterChips.length > 0 && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="min-h-[32px] rounded-full px-2.5 py-1 text-xs font-medium text-txt-secondary hover:text-txt-primary"
              >
                Clear all
              </button>
            )}
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
        editingTx={editingTx}
        onMetaChanged={reloadMeta}
      />

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        categories={categories}
        accounts={accounts}
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
