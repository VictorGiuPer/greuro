import { useEffect, useMemo, useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { addScheduled, updateScheduled, deleteScheduled, addAccount, addCategory } from '../db'
import { toDateInputValue, fromDateInputValue, toAmountInputValue } from '../lib/format'
import { evaluate } from '../lib/calc'
import SegmentedPill from './SegmentedPill'
import Sheet from './ui/Sheet'
import Select from './ui/Select'
import AmountCalcInput from './AmountCalcInput'
import AccountForm from './settings/AccountForm'
import CategoryForm from './settings/CategoryForm'

const TYPES = [
  { id: 'expense', label: 'Expense' },
  { id: 'income', label: 'Income' },
  { id: 'transfer', label: 'Transfer' },
]

const RECURRENCES = [
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'year', label: 'Yearly' },
  { id: 'custom', label: 'Custom' },
]

const CUSTOM_UNITS = [
  { value: 'day', label: 'days' },
  { value: 'week', label: 'weeks' },
  { value: 'month', label: 'months' },
]

function emptyForm() {
  return {
    type: 'expense',
    amount: '',
    description: '',
    categoryId: '',
    accountId: '',
    fromAccountId: '',
    toAccountId: '',
    nextDue: toDateInputValue(Date.now()),
    recurrenceChoice: 'month', // 'week' | 'month' | 'year' | 'custom'
    customUnit: 'day',
    customInterval: '30',
    active: true,
  }
}

function formFromItem(item) {
  const { unit, interval } = item.recurrence
  const isSimple = interval === 1 && ['week', 'month', 'year'].includes(unit)
  return {
    type: item.type,
    amount: toAmountInputValue(item.amount),
    description: item.description || '',
    categoryId: item.categoryId ?? '',
    accountId: item.accountId ?? '',
    fromAccountId: item.fromAccountId ?? '',
    toAccountId: item.toAccountId ?? '',
    nextDue: toDateInputValue(item.nextDueDate),
    recurrenceChoice: isSimple ? unit : 'custom',
    customUnit: isSimple ? 'day' : unit,
    customInterval: isSimple ? '30' : String(interval),
    active: item.active !== 0,
  }
}

/**
 * Add / edit sheet for a scheduled transaction (reminder). Mirrors the
 * transaction form: segmented type, calculator amount, quick-create accounts
 * and categories, two-tap delete — plus recurrence + next-due-date controls.
 */
export default function ReminderForm({
  open,
  onClose,
  onSaved,
  accounts,
  categories,
  editingItem,
  onMetaChanged,
}) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mini, setMini] = useState(null) // null | 'account' | 'from' | 'to' | 'category'

  const isEdit = Boolean(editingItem)

  useEffect(() => {
    if (!open) return
    setForm(editingItem ? formFromItem(editingItem) : emptyForm())
    setError('')
    setConfirmDelete(false)
    setMini(null)
  }, [open, editingItem])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const visibleCategories = useMemo(() => {
    if (form.type === 'transfer') return []
    return categories.filter((c) => c.kind === form.type)
  }, [categories, form.type])

  function changeType(type) {
    setError('')
    setForm((f) => {
      const next = { ...f, type }
      if (type === 'transfer') {
        next.categoryId = ''
      } else if (f.categoryId) {
        const still = categories.find((c) => c.id === Number(f.categoryId) && c.kind === type)
        if (!still) next.categoryId = ''
      }
      return next
    })
  }

  function validate() {
    const res = evaluate(form.amount)
    if (res.incomplete) return 'Enter an amount greater than 0.'
    if (res.error) return 'The amount calculation is invalid.'
    if (res.value <= 0) return 'Enter an amount greater than 0.'
    if (!form.description.trim()) return 'Give the reminder a name.'
    if (!form.nextDue) return 'Pick the next due date.'
    if (form.type === 'transfer') {
      if (!form.fromAccountId) return 'Choose a "From" account.'
      if (!form.toAccountId) return 'Choose a "To" account.'
      if (Number(form.fromAccountId) === Number(form.toAccountId))
        return '"From" and "To" must be different accounts.'
    } else {
      if (!form.accountId) return 'Choose an account.'
      if (!form.categoryId) return 'Choose a category.'
    }
    if (form.recurrenceChoice === 'custom') {
      const n = Number(form.customInterval)
      if (!Number.isInteger(n) || n < 1) return 'The custom interval must be a whole number ≥ 1.'
    }
    return ''
  }

  async function handleSave() {
    const msg = validate()
    if (msg) {
      setError(msg)
      return
    }
    setSaving(true)
    const recurrence =
      form.recurrenceChoice === 'custom'
        ? { unit: form.customUnit, interval: Number(form.customInterval) }
        : { unit: form.recurrenceChoice, interval: 1 }
    const payload = {
      type: form.type,
      amount: evaluate(form.amount).value,
      description: form.description,
      categoryId: form.type === 'transfer' ? null : Number(form.categoryId),
      accountId: form.type === 'transfer' ? null : Number(form.accountId),
      fromAccountId: form.type === 'transfer' ? Number(form.fromAccountId) : null,
      toAccountId: form.type === 'transfer' ? Number(form.toAccountId) : null,
      recurrence,
      nextDueDate: fromDateInputValue(form.nextDue),
      active: form.active ? 1 : 0,
    }
    try {
      if (isEdit) await updateScheduled(editingItem.id, payload)
      else await addScheduled(payload)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setSaving(true)
    try {
      await deleteScheduled(editingItem.id)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  async function createAccount(data) {
    const id = await addAccount(data)
    if (onMetaChanged) await onMetaChanged()
    if (mini === 'from') set({ fromAccountId: String(id) })
    else if (mini === 'to') set({ toAccountId: String(id) })
    else set({ accountId: String(id) })
    setMini(null)
  }

  async function createCategory(data) {
    const id = await addCategory(data)
    if (onMetaChanged) await onMetaChanged()
    set({ categoryId: String(id) })
    setMini(null)
  }

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const miniTitle = mini === 'category' ? 'Add Category' : mini ? 'Add Account' : null

  return (
    <Sheet open={open} onClose={onClose} label={isEdit ? 'Edit reminder' : 'New reminder'}>
      {mini ? (
        <>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-txt-primary">{miniTitle}</h2>
            <button
              onClick={() => setMini(null)}
              className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
          {mini === 'category' ? (
            <CategoryForm
              defaultKind={form.type === 'transfer' ? 'expense' : form.type}
              onSubmit={createCategory}
              onCancel={() => setMini(null)}
            />
          ) : (
            <AccountForm onSubmit={createAccount} onCancel={() => setMini(null)} />
          )}
        </>
      ) : (
        <>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-txt-primary">
              {isEdit ? 'Edit Reminder' : 'New Reminder'}
            </h2>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mb-5">
            <SegmentedPill value={form.type} onChange={changeType} options={TYPES} />
          </div>

          <div className="mb-4">
            <label htmlFor="rem-name" className="mb-1.5 block text-sm text-txt-secondary">
              Name
            </label>
            <input
              id="rem-name"
              type="text"
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="e.g. Rent, Spotify"
              className="w-full rounded-2xl border border-hairline bg-elevated px-4 py-3 text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="rem-amount" className="mb-1.5 block text-sm text-txt-secondary">
              Amount
            </label>
            <AmountCalcInput
              id="rem-amount"
              value={form.amount}
              onChange={(v) => set({ amount: v })}
            />
          </div>

          {/* Recurrence */}
          <div className="mb-4">
            <label className="mb-1.5 block text-sm text-txt-secondary">Repeats</label>
            <SegmentedPill
              value={form.recurrenceChoice}
              onChange={(v) => set({ recurrenceChoice: v })}
              options={RECURRENCES}
            />
            {form.recurrenceChoice === 'custom' && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-txt-secondary">Every</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.customInterval}
                  onChange={(e) => set({ customInterval: e.target.value })}
                  aria-label="Interval"
                  className="w-20 rounded-2xl border border-hairline bg-elevated px-3 py-2.5 text-center text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
                />
                <div className="flex-1">
                  <Select
                    value={form.customUnit}
                    onChange={(v) => set({ customUnit: v })}
                    placeholder="Unit"
                    options={CUSTOM_UNITS}
                    ariaLabel="Interval unit"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Next due */}
          <div className="mb-4">
            <label htmlFor="rem-due" className="mb-1.5 block text-sm text-txt-secondary">
              Next due
            </label>
            <input
              id="rem-due"
              type="date"
              value={form.nextDue}
              onChange={(e) => set({ nextDue: e.target.value })}
              className="w-full rounded-2xl border border-hairline bg-elevated px-4 py-3 text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <p className="mt-1.5 text-xs text-txt-muted">
              Posts automatically as a transaction on this day, then repeats.
            </p>
          </div>

          {/* Account(s) */}
          {form.type === 'transfer' ? (
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm text-txt-secondary">From</label>
                <Select
                  value={form.fromAccountId}
                  onChange={(v) => set({ fromAccountId: v })}
                  placeholder="Account"
                  options={accountOptions}
                  onAddNew={() => setMini('from')}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-txt-secondary">To</label>
                <Select
                  value={form.toAccountId}
                  onChange={(v) => set({ toAccountId: v })}
                  placeholder="Account"
                  options={accountOptions}
                  onAddNew={() => setMini('to')}
                />
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <label className="mb-1.5 block text-sm text-txt-secondary">Account</label>
              <Select
                value={form.accountId}
                onChange={(v) => set({ accountId: v })}
                placeholder="Choose account"
                options={accountOptions}
                onAddNew={() => setMini('account')}
              />
            </div>
          )}

          {form.type !== 'transfer' && (
            <div className="mb-4">
              <label className="mb-1.5 block text-sm text-txt-secondary">Category</label>
              <Select
                value={form.categoryId}
                onChange={(v) => set({ categoryId: v })}
                placeholder="Choose category"
                options={visibleCategories.map((c) => ({ value: c.id, label: c.name }))}
                onAddNew={() => setMini('category')}
              />
            </div>
          )}

          {/* Active toggle (edit only — new reminders start active) */}
          {isEdit && (
            <button
              type="button"
              role="switch"
              aria-checked={form.active}
              onClick={() => set({ active: !form.active })}
              className="mb-4 flex w-full items-center justify-between rounded-2xl border border-hairline bg-elevated px-4 py-3"
            >
              <span className="text-txt-primary">Active</span>
              <span
                className={`flex h-7 w-12 items-center rounded-full p-1 transition-colors ${
                  form.active ? 'bg-accent' : 'bg-white/10'
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full bg-white transition-transform ${
                    form.active ? 'translate-x-5' : ''
                  }`}
                />
              </span>
            </button>
          )}

          {error && <p className="mb-3 text-sm text-expense">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-2 w-full rounded-2xl bg-accent py-3.5 text-base font-semibold text-black transition-opacity active:opacity-80 disabled:opacity-50"
          >
            {isEdit ? 'Save Changes' : 'Add Reminder'}
          </button>

          {isEdit && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border py-3 text-base font-semibold transition-colors ${
                confirmDelete
                  ? 'border-expense bg-expense/10 text-expense'
                  : 'border-hairline text-txt-secondary hover:text-expense'
              }`}
            >
              <Trash2 size={18} />
              {confirmDelete ? 'Tap again to confirm delete' : 'Delete'}
            </button>
          )}
        </>
      )}
    </Sheet>
  )
}
