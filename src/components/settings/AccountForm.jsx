import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import SegmentedPill from '../SegmentedPill'
import { parseAmountInput, toAmountInputValue } from '../../lib/format'

/**
 * Add / edit form for an account. Self-contained fields + validation; the
 * parent supplies onSubmit (add or update) and, in edit mode, onDelete which
 * returns { ok } or { ok:false, count } from the integrity guard.
 *
 * @param account   existing account (edit) or null (add)
 * @param onSubmit  async (data) => void  (data includes usage + isMain)
 * @param onCancel  () => void
 * @param onDelete  async () => ({ ok } | { ok:false, count })  (edit only)
 * @param isMain    when defined, shows the "Main account" switch (Settings only)
 */
export default function AccountForm({ account, onSubmit, onCancel, onDelete, isMain }) {
  const isEdit = Boolean(account)
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState(account?.type ?? 'asset')
  const [usage, setUsage] = useState(account?.usage === 'investment' ? 'investment' : 'active')
  const [main, setMain] = useState(Boolean(isMain))
  const [startingBalance, setStartingBalance] = useState(
    account ? toAmountInputValue(account.startingBalance) : '',
  )
  const [expectedAnnualReturn, setExpectedAnnualReturn] = useState(
    account ? toAmountInputValue(account.expectedAnnualReturn) : '0',
  )
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [blockedCount, setBlockedCount] = useState(null)
  const [busy, setBusy] = useState(false)

  // Only Settings passes isMain; the main switch is meaningful for
  // everyday (active) accounts, which the cash-flow card defaults to.
  const showMain = isMain !== undefined && usage === 'active'

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Enter an account name.')
      return
    }
    setBusy(true)
    try {
      await onSubmit({
        name,
        type,
        usage,
        isMain: showMain ? main : undefined,
        startingBalance: parseAmountInput(startingBalance) || 0,
        expectedAnnualReturn: parseAmountInput(expectedAnnualReturn) || 0,
      })
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
      const res = await onDelete()
      if (res && res.ok === false) {
        setBlockedCount(res.count)
        setConfirmDelete(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm text-txt-secondary">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Checking"
          className="w-full rounded-2xl border border-hairline bg-elevated px-4 py-3 text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
          autoFocus
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm text-txt-secondary">Type</label>
        <SegmentedPill
          value={type}
          onChange={setType}
          options={[
            { id: 'asset', label: 'Asset' },
            { id: 'liability', label: 'Liability' },
          ]}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm text-txt-secondary">Usage</label>
        <SegmentedPill
          value={usage}
          onChange={setUsage}
          options={[
            { id: 'active', label: 'Active use' },
            { id: 'investment', label: 'Investment' },
          ]}
        />
        <p className="mt-1.5 text-xs text-txt-muted">
          {usage === 'investment'
            ? 'Grows in the forecast; offered only for transfers, not everyday expenses.'
            : 'Everyday money; offered for expenses, income and transfers.'}
        </p>
      </div>

      {showMain && (
        <button
          type="button"
          role="switch"
          aria-checked={main}
          onClick={() => setMain((m) => !m)}
          className="flex w-full items-center justify-between rounded-2xl border border-hairline bg-elevated px-4 py-3"
        >
          <span className="text-left">
            <span className="block text-txt-primary">Main account</span>
            <span className="block text-xs text-txt-muted">
              Default for the cash-flow card and the savings tracker.
            </span>
          </span>
          <span
            className={`ml-3 flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${
              main ? 'bg-accent' : 'bg-white/10'
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full bg-white transition-transform ${
                main ? 'translate-x-5' : ''
              }`}
            />
          </span>
        </button>
      )}

      <div>
        <label className="mb-1.5 block text-sm text-txt-secondary">Starting balance</label>
        <div className="flex items-center rounded-2xl border border-hairline bg-elevated px-4">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={startingBalance}
            onChange={(e) => setStartingBalance(e.target.value)}
            placeholder="0,00"
            className="w-full bg-transparent py-3 text-txt-primary placeholder:text-txt-muted focus:outline-none"
          />
          <span className="text-lg text-txt-muted">€</span>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm text-txt-secondary">Expected annual return</label>
        <div className="flex items-center rounded-2xl border border-hairline bg-elevated px-4">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={expectedAnnualReturn}
            onChange={(e) => setExpectedAnnualReturn(e.target.value)}
            placeholder="0"
            className="w-full bg-transparent py-3 text-txt-primary placeholder:text-txt-muted focus:outline-none"
          />
          <span className="text-lg text-txt-muted">%</span>
        </div>
        <p className="mt-1.5 text-xs text-txt-muted">
          Compounded in the net-worth forecast (0 = flat cash).
        </p>
      </div>

      {error && <p className="text-sm text-expense">{error}</p>}
      {blockedCount != null && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Can’t delete: used by {blockedCount} transaction{blockedCount === 1 ? '' : 's'}.
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex-1 rounded-2xl border border-hairline py-3 font-semibold text-txt-secondary hover:text-txt-primary"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={busy}
          className="flex-1 rounded-2xl bg-accent py-3 font-semibold text-black active:opacity-80 disabled:opacity-50"
        >
          {isEdit ? 'Save' : 'Add Account'}
        </button>
      </div>

      {isEdit && onDelete && (
        <button
          onClick={handleDelete}
          disabled={busy}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl border py-3 font-semibold transition-colors ${
            confirmDelete
              ? 'border-expense bg-expense/10 text-expense'
              : 'border-hairline text-txt-secondary hover:text-expense'
          }`}
        >
          <Trash2 size={18} />
          {confirmDelete ? 'Tap again to confirm delete' : 'Delete'}
        </button>
      )}
    </div>
  )
}
