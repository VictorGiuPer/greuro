import { budgetAction, readBudget } from '../db/budgetActions'
import { db } from '../db/db'
import { effectiveAmount } from '../lib/txAmount'
import { formatAmount, formatDate } from '../lib/format'
import { useEffect, useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { addTrip, updateTrip, deleteTrip, countTripUsage } from '../db'
import Sheet from './ui/Sheet'

/**
 * Add / edit a trip: name + length in days. Edit adds an archive toggle and a
 * two-tap delete (which untags its transactions rather than blocking).
 */
export default function TripForm({ open, onClose, onSaved, editingTrip }) {
  const isEdit = Boolean(editingTrip)
  const [budget, setBudget] = useState(null)
  const [goalId, setGoalId] = useState('')
  const [preview, setPreview] = useState(false)
  const [selectedExpenses, setSelectedExpenses] = useState([])
  const [name, setName] = useState('')
  const [days, setDays] = useState('')
  const [archived, setArchived] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [usage, setUsage] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    setConfirmDelete(false)
    setGoalId(editingTrip?.goalId ?? '')
    setPreview(false)
    setSelectedExpenses([])
    readBudget().then(setBudget).catch((e) => setError(e.message))
    if (editingTrip) {
      setName(editingTrip.name || '')
      setDays(String(editingTrip.days ?? ''))
      setArchived(Boolean(editingTrip.archived))
      countTripUsage(editingTrip.id).then(setUsage)
    } else {
      setName('')
      setDays('')
      setArchived(false)
      setUsage(0)
    }
  }, [open, editingTrip])

  const candidates = budget?.transactions.filter((t) => t.tripId === editingTrip?.id && t.type === 'expense' && !t.isAdjustment && !budget.categories.some((c) => c.id === t.categoryId && c.excludeFromStats)) || []
  const linkedGoal = budget?.goals.find((g) => g.id === Number(goalId))
  const changingConnection = String(editingTrip?.goalId || '') !== String(goalId || '')
  const changingArchive = isEdit && Boolean(editingTrip.archived) !== archived
  async function handleSave() {
    if (!name.trim()) return setError('Give the trip a name.')
    const n = Number(days)
    if (!Number.isInteger(n) || n < 1) return setError('Enter the number of days (1 or more).')
    if (!preview && ((changingConnection && goalId && candidates.length) || (changingArchive && (goalId || editingTrip?.goalId)))) { setPreview(true); return }
    setBusy(true); setError('')
    try {
      await db.transaction('rw', db.tables, async () => {
        const fields = { name: name.trim(), days: n, goalId: goalId ? Number(goalId) : null, archived: archived ? 1 : 0 }
        const saved = await budgetAction(isEdit ? 'trip.update' : 'trip.add', { id: editingTrip?.id, fields, confirm: preview })
        if (changingConnection && goalId && selectedExpenses.length) await budgetAction('trip.assign', { id: saved.id, goalId: Number(goalId), transactionIds: selectedExpenses, confirm: true, confirmReassign: true })
      })
      onSaved()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    try {
      await budgetAction('trip.delete', { id: editingTrip.id })
      onSaved()
    } catch (e) { setError(e.message) } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label={isEdit ? 'Edit trip' : 'New trip'}>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-txt-primary">{isEdit ? 'Edit Trip' : 'New Trip'}</h2>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      <div className="mb-4">
        <label htmlFor="trip-name" className="mb-1.5 block text-sm text-txt-secondary">
          Name
        </label>
        <input
          id="trip-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Japan 2026"
          className="w-full rounded-2xl border border-hairline bg-elevated px-4 py-3 text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="trip-days" className="mb-1.5 block text-sm text-txt-secondary">
          Length (days)
        </label>
        <input
          id="trip-days"
          type="text"
          inputMode="numeric"
          value={days}
          onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="e.g. 7"
          className="w-full rounded-2xl border border-hairline bg-elevated px-4 py-3 text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        <p className="mt-1.5 text-xs text-txt-muted">Used for the spent-per-day figure.</p>
      </div>

      <div className="mb-4">
        <label htmlFor="trip-goal" className="mb-1.5 block text-sm text-txt-secondary">Savings goal (optional)</label>
        <select id="trip-goal" value={goalId} onChange={(e) => { setGoalId(e.target.value); setPreview(false); setSelectedExpenses([]) }} className="w-full rounded-2xl border border-hairline bg-elevated p-3">
          <option value="">None</option>{budget?.goals.filter((g) => g.modelVersion === 2 && (!g.archived || g.id === Number(goalId))).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      {preview && <div className="mb-4 rounded-2xl border border-hairline bg-elevated p-3 text-sm">
        {changingConnection && goalId && <><p className="mb-2">Count selected purchases as already spent toward {linkedGoal?.name}. Current reserved money stays unchanged.</p>{candidates.map((t) => <label key={t.id} className="mb-2 flex items-start gap-2"><input type="checkbox" checked={selectedExpenses.includes(t.id)} onChange={(e) => setSelectedExpenses((ids) => e.target.checked ? [...ids, t.id] : ids.filter((id) => id !== t.id))} /><span>{formatDate(t.date)} · {t.description || 'Purchase'} · {formatAmount(effectiveAmount(t))}{t.goalId && t.goalId !== Number(goalId) ? ` · Reassign from ${budget.goals.find((g) => g.id === t.goalId)?.name}` : ''}</span></label>)}<p className="mt-2 font-medium">Selected: {formatAmount(candidates.filter((t) => selectedExpenses.includes(t.id)).reduce((sum, t) => sum + effectiveAmount(t), 0))}</p></>}
        {changingArchive && linkedGoal && <p className="mt-2">{archived ? `Finish ${linkedGoal.name}, release ${formatAmount(linkedGoal.earmarked)}, and archive` : 'Reopen'} linked trips: {budget.trips.filter((t) => t.goalId === linkedGoal.id).map((t) => t.name).join(', ')}.</p>}
      </div>}
      {isEdit && (
        <button
          type="button"
          role="switch"
          aria-checked={archived}
          onClick={() => { setArchived((v) => !v); setPreview(false) }}
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
        {preview ? 'Confirm & save' : isEdit ? 'Save Changes' : 'Create Trip'}
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
          {confirmDelete
            ? usage > 0
              ? `Tap again — untags ${usage} transaction${usage === 1 ? '' : 's'}`
              : 'Tap again to confirm delete'
            : 'Delete'}
        </button>
      )}
    </Sheet>
  )
}
