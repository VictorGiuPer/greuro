import { useCallback, useEffect, useMemo, useState } from 'react'
import { getScheduled, getAccounts, getCategories, getSettings } from '../db'
import { recurrenceLabel } from '../db/scheduled'
import { formatAmount, formatDate } from '../lib/format'
import { daysUntil } from '../lib/dates'
import CategoryIcon from '../components/CategoryIcon'
import ReminderForm from '../components/ReminderForm'
import Fab from '../components/ui/Fab'

/**
 * Reminders tab — scheduled transactions that auto-post when due (posting
 * happens app-wide on launch, see App.jsx). This screen lists what's coming
 * up, with Due Soon badges, and manages the schedule.
 */
export default function Reminders() {
  const [items, setItems] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [thresholds, setThresholds] = useState({ amber: 3, teal: 7 })
  const [ready, setReady] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  const load = useCallback(async () => {
    const [scheduled, accs, cats, settings] = await Promise.all([
      getScheduled(),
      getAccounts(),
      getCategories(),
      getSettings(),
    ])
    setItems(scheduled)
    setAccounts(accs)
    setCategories(cats)
    setThresholds({ amber: settings.dueSoonAmberDays, teal: settings.dueSoonTealDays })
    setReady(true)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  function openAdd() {
    setEditingItem(null)
    setFormOpen(true)
  }

  function openEdit(item) {
    setEditingItem(item)
    setFormOpen(true)
  }

  async function handleSaved() {
    setFormOpen(false)
    setEditingItem(null)
    await load()
  }

  return (
    <div className="relative min-h-dvh pb-24">
      <header className="sticky top-0 z-30 flex min-h-[70px] items-center bg-bg/90 px-4 pb-2 pt-4 backdrop-blur">
        <h1 className="text-2xl font-semibold text-txt-primary">Upcoming Reminders</h1>
      </header>

      {ready && items.length === 0 && (
        <div className="px-6 py-20 text-center text-txt-secondary">
          <p className="mb-1 font-medium text-txt-primary">No reminders yet</p>
          <p className="text-sm">
            Add recurring payments like rent or subscriptions — they post themselves as
            transactions when due.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="mx-3 mt-3 overflow-hidden rounded-card border border-hairline bg-card">
          {items.map((item, i) => (
            <div key={item.id}>
              {i > 0 && <div className="mx-4 h-px bg-hairline" />}
              <ReminderRow
                item={item}
                categoriesById={categoriesById}
                accountsById={accountsById}
                thresholds={thresholds}
                onClick={() => openEdit(item)}
              />
            </div>
          ))}
        </div>
      )}

      <Fab onClick={openAdd} label="Add reminder" />

      <ReminderForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
        accounts={accounts}
        categories={categories}
        editingItem={editingItem}
        onMetaChanged={load}
      />
    </div>
  )
}

function ReminderRow({ item, categoriesById, accountsById, thresholds, onClick }) {
  const isTransfer = item.type === 'transfer'
  const category = isTransfer ? null : categoriesById.get(item.categoryId)
  const iconName = isTransfer ? 'ArrowLeftRight' : category?.icon
  const iconColor = isTransfer ? '#9BA1AC' : category?.color

  let subtitle
  if (isTransfer) {
    const from = accountsById.get(item.fromAccountId)?.name ?? '—'
    const to = accountsById.get(item.toAccountId)?.name ?? '—'
    subtitle = `${from} → ${to} · ${recurrenceLabel(item.recurrence)}`
  } else {
    subtitle = `${category?.name ?? 'Uncategorized'} · ${recurrenceLabel(item.recurrence)}`
  }

  const paused = item.active === 0
  const days = daysUntil(item.nextDueDate)
  let badge = null
  if (paused) {
    badge = { label: 'Paused', cls: 'bg-white/10 text-txt-secondary' }
  } else if (days <= thresholds.amber) {
    badge = {
      label: days <= 0 ? 'Due today' : 'Due soon',
      cls: 'bg-amber-500/15 text-amber-300',
    }
  } else if (days <= thresholds.teal) {
    badge = { label: 'Due soon', cls: 'bg-accent/15 text-accent' }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-white/[0.03] ${
        paused ? 'opacity-60' : ''
      }`}
    >
      <CategoryIcon name={iconName} color={iconColor} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-txt-primary">{item.description}</div>
        <div className="truncate text-sm text-txt-secondary">{subtitle}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="font-semibold tabular-nums text-txt-primary">
          {formatAmount(item.amount)}
        </div>
        <div className="text-xs text-txt-muted">Due {formatDate(item.nextDueDate)}</div>
        {badge && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
            {badge.label}
          </span>
        )}
      </div>
    </button>
  )
}
