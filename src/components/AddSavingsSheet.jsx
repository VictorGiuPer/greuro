import { useEffect, useState } from 'react'
import { X, Plus, Minus } from 'lucide-react'
import { addToGoalSaved } from '../db'
import { parseAmountInput } from '../lib/format'
import Sheet from './ui/Sheet'

/**
 * Quick "add money to my savings" sheet. Adds (or removes) a one-off amount
 * to the goal's manual savings total — e.g. a gift you want to bank toward the
 * goal on top of the automatic monthly accumulation.
 */
export default function AddSavingsSheet({ open, onClose, onSaved, goal }) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setAmount('')
    setError('')
  }, [open])

  async function commit(sign) {
    const value = parseAmountInput(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than 0.')
      return
    }
    setBusy(true)
    try {
      await addToGoalSaved(goal.id, sign * value)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Add to savings">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-txt-primary">Adjust Savings</h2>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      {goal && (
        <p className="mb-4 text-sm text-txt-secondary">
          Change how much you’ve set aside for <span className="text-txt-primary">{goal.name}</span>.
        </p>
      )}

      <div className="mb-5">
        <label htmlFor="add-savings" className="mb-1.5 block text-sm text-txt-secondary">
          Amount
        </label>
        <div className="flex items-center rounded-2xl border border-hairline bg-elevated px-4">
          <input
            id="add-savings"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            className="w-full bg-transparent py-3 text-2xl font-semibold text-txt-primary placeholder:text-txt-muted focus:outline-none"
          />
          <span className="text-xl font-semibold text-txt-muted">€</span>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-expense">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => commit(-1)}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-hairline py-3.5 font-semibold text-txt-secondary transition-colors active:bg-white/5 disabled:opacity-50"
        >
          <Minus size={18} />
          Remove
        </button>
        <button
          onClick={() => commit(1)}
          disabled={busy}
          className="flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 font-semibold text-black transition-opacity active:opacity-80 disabled:opacity-50"
        >
          <Plus size={18} />
          Add to savings
        </button>
      </div>
    </Sheet>
  )
}
