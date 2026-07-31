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

  async function handleSave() {
    if (!name.trim()) return setError('Give the trip a name.')
    const n = Number(days)
    if (!Number.isInteger(n) || n < 1) return setError('Enter the number of days (1 or more).')
    setBusy(true)
    const payload = { name, days: n, archived: archived ? 1 : 0 }
    try {
      if (isEdit) await updateTrip(editingTrip.id, payload)
      else await addTrip(payload)
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
      await deleteTrip(editingTrip.id)
      onSaved()
    } finally {
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
        {isEdit ? 'Save Changes' : 'Create Trip'}
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
