import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import Sheet from './ui/Sheet'
import CategoryIcon from './CategoryIcon'
import { toDateInputValue, fromDateInputValue } from '../lib/format'
import { startOfDayMs, endOfDayMs } from '../lib/dates'

export const EMPTY_FILTERS = {
  types: [],
  categoryIds: [],
  accountIds: [],
  dateFrom: null,
  dateTo: null,
}

/** Number of active filter dimensions (for the funnel badge). */
export function countActiveFilters(f) {
  let n = 0
  if (f.types.length) n += 1
  if (f.categoryIds.length) n += 1
  if (f.accountIds.length) n += 1
  if (f.dateFrom != null || f.dateTo != null) n += 1
  return n
}

const TYPE_OPTIONS = [
  { id: 'expense', label: 'Expense' },
  { id: 'income', label: 'Income' },
  { id: 'transfer', label: 'Transfer' },
]

function toggle(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/**
 * Funnel filter sheet — type / category / account multi-select + date range,
 * all combinable. Edits a draft and only commits on Apply.
 */
export default function FilterSheet({ open, onClose, categories, accounts, filters, onApply }) {
  const [draft, setDraft] = useState(filters)

  useEffect(() => {
    if (open) setDraft(filters)
  }, [open, filters])

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  function apply() {
    onApply(draft)
    onClose()
  }

  function clearAll() {
    setDraft(EMPTY_FILTERS)
  }

  return (
    <Sheet open={open} onClose={onClose} label="Filter transactions">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-txt-primary">Filters</h2>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      {/* Type */}
      <FieldLabel>Type</FieldLabel>
      <div className="mb-5 flex gap-2">
        {TYPE_OPTIONS.map((t) => (
          <TogglePill
            key={t.id}
            active={draft.types.includes(t.id)}
            onClick={() => set({ types: toggle(draft.types, t.id) })}
          >
            {t.label}
          </TogglePill>
        ))}
      </div>

      {/* Category — grouped by kind */}
      <FieldLabel>Category</FieldLabel>
      {categories.length === 0 && (
        <div className="mb-5">
          <Muted>No categories yet.</Muted>
        </div>
      )}
      {['expense', 'income'].map((kind) => {
        const group = categories.filter((c) => c.kind === kind)
        if (group.length === 0) return null
        return (
          <div key={kind} className="mb-4">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-txt-muted">
              {kind === 'expense' ? 'Expense' : 'Income'}
            </div>
            <div className="flex flex-wrap gap-2">
              {group.map((c) => (
                <TogglePill
                  key={c.id}
                  active={draft.categoryIds.includes(c.id)}
                  onClick={() => set({ categoryIds: toggle(draft.categoryIds, c.id) })}
                >
                  <span className="flex items-center gap-1.5">
                    <CategoryIcon name={c.icon} color={c.color} size={20} />
                    {c.name}
                  </span>
                </TogglePill>
              ))}
            </div>
          </div>
        )
      })}
      <div className="mb-1" />

      {/* Account */}
      <FieldLabel>Account</FieldLabel>
      <div className="mb-5 flex flex-wrap gap-2">
        {accounts.length === 0 && <Muted>No accounts yet.</Muted>}
        {accounts.map((a) => (
          <TogglePill
            key={a.id}
            active={draft.accountIds.includes(a.id)}
            onClick={() => set({ accountIds: toggle(draft.accountIds, a.id) })}
          >
            {a.name}
          </TogglePill>
        ))}
      </div>
      <p className="-mt-3 mb-5 text-xs text-txt-muted">Transfers match either side.</p>

      {/* Date range */}
      <FieldLabel>Date range</FieldLabel>
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="filter-from" className="mb-1 block text-xs text-txt-muted">
            From
          </label>
          <input
            id="filter-from"
            type="date"
            value={draft.dateFrom != null ? toDateInputValue(draft.dateFrom) : ''}
            onChange={(e) =>
              set({
                dateFrom: e.target.value ? startOfDayMs(fromDateInputValue(e.target.value)) : null,
              })
            }
            className="w-full rounded-2xl border border-hairline bg-elevated px-4 py-3 text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>
        <div>
          <label htmlFor="filter-to" className="mb-1 block text-xs text-txt-muted">
            To
          </label>
          <input
            id="filter-to"
            type="date"
            value={draft.dateTo != null ? toDateInputValue(draft.dateTo) : ''}
            onChange={(e) =>
              set({
                dateTo: e.target.value ? endOfDayMs(fromDateInputValue(e.target.value)) : null,
              })
            }
            className="w-full rounded-2xl border border-hairline bg-elevated px-4 py-3 text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={clearAll}
          className="flex-1 rounded-2xl border border-hairline py-3 font-semibold text-txt-secondary hover:text-txt-primary"
        >
          Clear all
        </button>
        <button
          onClick={apply}
          className="flex-1 rounded-2xl bg-accent py-3 font-semibold text-black active:opacity-80"
        >
          Apply
        </button>
      </div>
    </Sheet>
  )
}

function FieldLabel({ children }) {
  return <div className="mb-2 text-sm text-txt-secondary">{children}</div>
}

function Muted({ children }) {
  return <span className="text-sm text-txt-muted">{children}</span>
}

function TogglePill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[40px] rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'border-accent/60 bg-accent/15 text-accent'
          : 'border-hairline bg-elevated text-txt-secondary'
      }`}
    >
      {children}
    </button>
  )
}
