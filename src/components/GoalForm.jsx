import { useEffect, useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { addGoal, updateGoal, deleteGoal } from '../db'
import { parseAmountInput, toAmountInputValue } from '../lib/format'
import Sheet from './ui/Sheet'

function monthInputValue(year, mIdx) {
  return `${year}-${String(mIdx + 1).padStart(2, '0')}`
}

function currentMonthValue() {
  const d = new Date()
  return monthInputValue(d.getFullYear(), d.getMonth())
}

/**
 * Add / edit a savings goal. Name, target amount and a start month (from which
 * the main account's monthly surplus is accumulated). Edit adds an archive
 * toggle and two-tap delete.
 */
export default function GoalForm({ open, onClose, onSaved, editingGoal }) {
  const isEdit = Boolean(editingGoal)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [startMonth, setStartMonth] = useState(currentMonthValue())
  const [manual, setManual] = useState('')
  const [archived, setArchived] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    setConfirmDelete(false)
    if (editingGoal) {
      setName(editingGoal.name || '')
      setTarget(toAmountInputValue(editingGoal.targetAmount))
      setStartMonth(monthInputValue(editingGoal.startYear, editingGoal.startMonth))
      setManual(editingGoal.manualAdjustment ? toAmountInputValue(editingGoal.manualAdjustment) : '')
      setArchived(Boolean(editingGoal.archived))
    } else {
      setName('')
      setTarget('')
      setStartMonth(currentMonthValue())
      setManual('')
      setArchived(false)
    }
  }, [open, editingGoal])

  async function handleSave() {
    if (!name.trim()) return setError('Give the goal a name.')
    const amount = parseAmountInput(target)
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter a target greater than 0.')
    const [y, m] = startMonth.split('-').map(Number)
    if (!y || !m) return setError('Pick a start month.')

    // Manual amount is optional; blank = 0. Negative is allowed (to correct).
    const manualParsed = manual.trim() ? parseAmountInput(manual) : 0
    if (!Number.isFinite(manualParsed)) return setError('Enter a valid amount already saved.')

    setBusy(true)
    const payload = {
      name,
      targetAmount: amount,
      startYear: y,
      startMonth: m - 1,
      manualAdjustment: manualParsed,
      archived: archived ? 1 : 0,
    }
    try {
      if (isEdit) await updateGoal(editingGoal.id, payload)
      else await addGoal(payload)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    try {
      await deleteGoal(editingGoal.id)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label={isEdit ? 'Edit goal' : 'New goal'}>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-txt-primary">
          {isEdit ? 'Edit Goal' : 'New Savings Goal'}
        </h2>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      <div className="mb-4">
        <label htmlFor="goal-name" className="mb-1.5 block text-sm text-txt-secondary">
          Name
        </label>
        <input
          id="goal-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Japan trip, new camera"
          className="w-full rounded-2xl border border-hairline bg-elevated px-4 py-3 text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="goal-target" className="mb-1.5 block text-sm text-txt-secondary">
          Target amount
        </label>
        <div className="flex items-center rounded-2xl border border-hairline bg-elevated px-4">
          <input
            id="goal-target"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0,00"
            className="w-full bg-transparent py-3 text-txt-primary placeholder:text-txt-muted focus:outline-none"
          />
          <span className="text-lg text-txt-muted">€</span>
        </div>
      </div>

      <div className="mb-4">
        <label htmlFor="goal-start" className="mb-1.5 block text-sm text-txt-secondary">
          Saving since
        </label>
        <input
          id="goal-start"
          type="month"
          value={startMonth}
          onChange={(e) => setStartMonth(e.target.value)}
          className="w-full rounded-2xl border border-hairline bg-elevated px-4 py-3 text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        <p className="mt-1.5 text-xs text-txt-muted">
          Each completed month, whatever you didn’t spend or invest from your main account is
          added to this goal.
        </p>
      </div>

      <div className="mb-4">
        <label htmlFor="goal-manual" className="mb-1.5 block text-sm text-txt-secondary">
          Amount already saved
        </label>
        <div className="flex items-center rounded-2xl border border-hairline bg-elevated px-4">
          <input
            id="goal-manual"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="0,00"
            className="w-full bg-transparent py-3 text-txt-primary placeholder:text-txt-muted focus:outline-none"
          />
          <span className="text-lg text-txt-muted">€</span>
        </div>
        <p className="mt-1.5 text-xs text-txt-muted">
          A starting amount you’ve already put aside. Added on top of the automatic monthly
          accumulation — you can also top it up anytime from the card.
        </p>
      </div>

      {isEdit && (
        <button
          type="button"
          role="switch"
          aria-checked={archived}
          onClick={() => setArchived((v) => !v)}
          className="mb-4 flex w-full items-center justify-between rounded-2xl border border-hairline bg-elevated px-4 py-3"
        >
          <span className="text-txt-primary">Archived</span>
          <span
            className={`ml-3 flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${
              archived ? 'bg-accent' : 'bg-white/10'
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full bg-white transition-transform ${
                archived ? 'translate-x-5' : ''
              }`}
            />
          </span>
        </button>
      )}

      {error && <p className="mb-3 text-sm text-expense">{error}</p>}

      <button
        onClick={handleSave}
        disabled={busy}
        className="mt-2 w-full rounded-2xl bg-accent py-3.5 text-base font-semibold text-black transition-opacity active:opacity-80 disabled:opacity-50"
      >
        {isEdit ? 'Save Changes' : 'Create Goal'}
      </button>

      {isEdit && (
        <button
          onClick={handleDelete}
          disabled={busy}
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
    </Sheet>
  )
}
